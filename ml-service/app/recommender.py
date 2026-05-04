"""
HybridRecommender
=================
Combines Content-Based and Collaborative Filtering into a single,
lightweight model that can be trained from MongoDB data and
serialised to / loaded from disk in under 50 MB.

Content-Based:
  - Build a TF-IDF matrix over course text
    (courseName + courseDescription + tags + category + whatYouWillLearn)
  - Compute pairwise cosine similarity → save as a sparse disk matrix

Collaborative Filtering (User-User):
  - Build a binary user × course matrix
  - Compute user-user cosine similarity
  - Score unseen courses by summing similarities of users who enrolled

Hybrid:
  - score = α * content_score + β * collab_score + γ * popularity_score
  - α=0.45, β=0.35, γ=0.20  (tunable via env vars)
"""

import os
import pickle
import logging
import numpy as np
from scipy.sparse import csr_matrix, save_npz, load_npz
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from datetime import datetime

logger = logging.getLogger(__name__)

# ── Weight hyper-params (override via env) ────────────────────────────────────
ALPHA = float(os.environ.get("REC_ALPHA", 0.45))   # content weight
BETA  = float(os.environ.get("REC_BETA",  0.35))   # collaborative weight
GAMMA = float(os.environ.get("REC_GAMMA", 0.20))   # popularity weight


class HybridRecommender:
    """
    All artefacts are stored in <model_path>/:
        tfidf_vectorizer.pkl   – fitted TfidfVectorizer
        course_index.pkl       – {courseId -> row index}
        user_index.pkl         – {userId  -> row index}
        course_sim.npz         – pairwise cosine similarity (sparse, float32)
        user_item.npz          – binary user-item matrix (sparse)
        course_meta.pkl        – list of dicts with id/name/score metadata
    """

    def __init__(self, model_path: str = "models"):
        self.model_path = model_path
        os.makedirs(model_path, exist_ok=True)

        # Runtime artefacts (populated by train() or load())
        self.vectorizer: TfidfVectorizer | None = None
        self.course_index: dict = {}          # courseId -> int
        self.user_index:   dict = {}          # userId   -> int
        self.course_sim:   np.ndarray | None = None   # (n_courses, n_courses)
        self.user_item:    csr_matrix | None = None   # (n_users, n_courses)
        self.course_meta:  list       = []    # [{_id, courseName, _pop_score}]

    # ── Training ──────────────────────────────────────────────────────────────

    def train(self, courses: list, users: list):
        logger.info("Training on %d courses, %d users …", len(courses), len(users))

        # ---- 1. Build course text corpus ----
        corpus    = []
        course_ids = []
        meta       = []

        for c in courses:
            cid  = str(c.get("_id", ""))
            text = self._course_text(c)
            corpus.append(text)
            course_ids.append(cid)
            meta.append({
                "_id":        cid,
                "courseName": c.get("courseName", ""),
                "_pop_score": self._popularity_score(c),
            })

        self.course_index = {cid: i for i, cid in enumerate(course_ids)}
        self.course_meta  = meta

        # ---- 2. TF-IDF + cosine similarity ----
        self.vectorizer = TfidfVectorizer(
            max_features=5000,
            ngram_range=(1, 2),
            stop_words="english",
            sublinear_tf=True,
        )
        tfidf_matrix = self.vectorizer.fit_transform(corpus)   # sparse (n, vocab)

        # Compute dense sim only if small enough, else use chunked approach
        n = len(courses)
        if n <= 500:
            self.course_sim = cosine_similarity(tfidf_matrix, dense_output=True).astype(np.float32)
        else:
            # Store the tfidf matrix itself and compute on-the-fly during inference
            self.course_sim = tfidf_matrix  # sparse; similarity computed lazily

        # ---- 3. User-item matrix ----
        if users:
            user_ids = []
            rows, cols = [], []
            for u in users:
                uid = str(u.get("_id", ""))
                user_ids.append(uid)
                ui  = len(user_ids) - 1
                for enrolled_course in u.get("courses", []):
                    eid = str(enrolled_course) if not isinstance(enrolled_course, dict) \
                          else str(enrolled_course.get("_id", ""))
                    if eid in self.course_index:
                        cols.append(self.course_index[eid])
                        rows.append(ui)

            self.user_index = {uid: i for i, uid in enumerate(user_ids)}
            n_users  = len(user_ids)
            n_courses = len(courses)
            if rows:
                self.user_item = csr_matrix(
                    (np.ones(len(rows), dtype=np.float32), (rows, cols)),
                    shape=(n_users, n_courses),
                )
            else:
                self.user_item = csr_matrix((n_users, n_courses), dtype=np.float32)
        else:
            self.user_item = None

        logger.info("Training complete.")

    # ── Inference ─────────────────────────────────────────────────────────────

    def recommend(self, user_id, enrolled_ids: set, courses: list, limit: int):
        """
        Returns (results_list, method_string)
        results_list: [{"courseId": str, "score": float}, ...]
        """
        if not self.course_index:
            return self._fallback(courses, enrolled_ids, limit), "fallback"

        n = len(self.course_index)
        final_scores = np.zeros(n, dtype=np.float64)
        method_parts = []

        enrolled_indices = [
            self.course_index[cid]
            for cid in enrolled_ids
            if cid in self.course_index
        ]

        # ---- Content-Based ----
        if enrolled_indices and self.course_sim is not None:
            cb_scores = self._content_scores(enrolled_indices)
            final_scores += ALPHA * cb_scores
            method_parts.append("content")

        # ---- Collaborative ----
        if user_id and self.user_item is not None:
            collab = self._collab_scores(str(user_id))
            if collab is not None:
                final_scores += BETA * collab
                method_parts.append("collaborative")

        # ---- Popularity ----
        pop = self._pop_score_vector()
        final_scores += GAMMA * pop

        if not method_parts:
            method_parts.append("popularity")

        # ---- Filter already-enrolled / build output ----
        # Build reverse index
        idx_to_cid = {v: k for k, v in self.course_index.items()}
        results = []
        for idx in np.argsort(-final_scores):
            cid = idx_to_cid.get(idx)
            if cid is None or cid in enrolled_ids:
                continue
            results.append({"courseId": cid, "score": float(final_scores[idx])})
            if len(results) >= limit:
                break

        method = "+".join(method_parts) if method_parts else "popularity"
        return results, method

    def similar_courses(self, course_id: str, limit: int = 5):
        """Content-based similar courses for a given course."""
        if course_id not in self.course_index:
            return []

        idx = self.course_index[course_id]
        sims = self._sim_row(idx)

        idx_to_cid = {v: k for k, v in self.course_index.items()}
        results = []
        for i in np.argsort(-sims):
            if i == idx:
                continue
            cid = idx_to_cid.get(i)
            if cid:
                results.append({"courseId": cid, "score": float(sims[i])})
            if len(results) >= limit:
                break
        return results

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _course_text(self, course: dict) -> str:
        parts = [
            course.get("courseName", ""),
            course.get("courseDescription", ""),
            course.get("whatYouWillLearn", ""),
            " ".join(course.get("tag", [])),
            # category might be a populated dict or just an id string
            course.get("category", {}).get("name", "") if isinstance(course.get("category"), dict) else "",
        ]
        return " ".join(p for p in parts if p).lower()

    def _popularity_score(self, course: dict) -> float:
        enrolled = len(course.get("studentsEnrolled", []))
        reviews  = course.get("ratingAndReviews", [])
        avg_rat  = 0.0
        if reviews:
            ratings = [r.get("rating", 0) if isinstance(r, dict) else 0 for r in reviews]
            avg_rat = sum(ratings) / len(ratings) if ratings else 0
        created = course.get("createdAt")
        age_days = 0.0
        if created:
            try:
                if isinstance(created, str):
                    created = datetime.fromisoformat(created.replace("Z", "+00:00"))
                age_days = max(0, (datetime.utcnow() - created.replace(tzinfo=None)).days)
            except Exception:
                pass
        recency = max(0.0, 100.0 - age_days / 3.65)
        return enrolled * 0.5 + avg_rat * 10 * 0.3 + recency * 0.2

    def _pop_score_vector(self) -> np.ndarray:
        scores = np.array([m["_pop_score"] for m in self.course_meta], dtype=np.float64)
        mx = scores.max()
        return scores / mx if mx > 0 else scores

    def _sim_row(self, idx: int) -> np.ndarray:
        """Return similarity vector for course at idx."""
        if isinstance(self.course_sim, np.ndarray):
            return self.course_sim[idx]
        else:
            # sparse tfidf matrix stored; compute on-the-fly
            row = self.course_sim[idx]
            return cosine_similarity(row, self.course_sim).flatten()

    def _content_scores(self, enrolled_indices: list) -> np.ndarray:
        """Aggregate content similarity for enrolled courses."""
        n = len(self.course_index)
        agg = np.zeros(n, dtype=np.float64)
        for idx in enrolled_indices:
            agg += self._sim_row(idx)
        agg /= max(1, len(enrolled_indices))
        mx = agg.max()
        return agg / mx if mx > 0 else agg

    def _collab_scores(self, user_id: str):
        """User-user collaborative filtering score vector."""
        if user_id not in self.user_index or self.user_item is None:
            return None

        u_idx    = self.user_index[user_id]
        u_vec    = self.user_item[u_idx]            # (1, n_courses) sparse
        # Cosine similarity between this user and all others
        user_sims = cosine_similarity(u_vec, self.user_item).flatten()  # (n_users,)
        user_sims[u_idx] = 0.0                      # exclude self

        # Weighted sum: σ(sim_ij * item_j) for all other users j
        collab_vec = user_sims @ self.user_item.toarray()   # (n_courses,)
        mx = collab_vec.max()
        return collab_vec / mx if mx > 0 else collab_vec

    def _fallback(self, courses: list, enrolled_ids: set, limit: int):
        """When model not trained yet – sort by popularity."""
        scored = sorted(
            courses,
            key=lambda c: self._popularity_score(c),
            reverse=True,
        )
        return [
            {"courseId": str(c.get("_id", "")), "score": 0.0}
            for c in scored
            if str(c.get("_id", "")) not in enrolled_ids
        ][:limit]

    # ── Persistence ───────────────────────────────────────────────────────────

    def save(self):
        p = self.model_path
        with open(f"{p}/tfidf_vectorizer.pkl", "wb") as f:
            pickle.dump(self.vectorizer, f)
        with open(f"{p}/course_index.pkl", "wb") as f:
            pickle.dump(self.course_index, f)
        with open(f"{p}/user_index.pkl", "wb") as f:
            pickle.dump(self.user_index, f)
        with open(f"{p}/course_meta.pkl", "wb") as f:
            pickle.dump(self.course_meta, f)
        # course_sim can be ndarray or sparse
        if isinstance(self.course_sim, np.ndarray):
            np.save(f"{p}/course_sim.npy", self.course_sim)
        elif self.course_sim is not None:
            save_npz(f"{p}/course_sim.npz", self.course_sim)
        if self.user_item is not None:
            save_npz(f"{p}/user_item.npz", self.user_item)
        logger.info("Model artefacts saved to %s/", p)

    def load(self) -> bool:
        p = self.model_path
        try:
            with open(f"{p}/tfidf_vectorizer.pkl", "rb") as f:
                self.vectorizer = pickle.load(f)
            with open(f"{p}/course_index.pkl", "rb") as f:
                self.course_index = pickle.load(f)
            with open(f"{p}/user_index.pkl", "rb") as f:
                self.user_index = pickle.load(f)
            with open(f"{p}/course_meta.pkl", "rb") as f:
                self.course_meta = pickle.load(f)
            # Try dense first
            if os.path.exists(f"{p}/course_sim.npy"):
                self.course_sim = np.load(f"{p}/course_sim.npy")
            elif os.path.exists(f"{p}/course_sim.npz"):
                self.course_sim = load_npz(f"{p}/course_sim.npz")
            if os.path.exists(f"{p}/user_item.npz"):
                self.user_item = load_npz(f"{p}/user_item.npz")
            return True
        except FileNotFoundError:
            return False
