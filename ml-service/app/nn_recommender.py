"""
NeuralCollaborativeFiltering (NCF) Inference Module
====================================================
Loads a trained NCF model (PyTorch .pt artifact + id-maps saved during
Kaggle/Colab training) and exposes the same interface as the old
HybridRecommender so main.py needs zero structural changes.

Model architecture (must match training notebook):
  UserEmbedding(n_users, emb_dim)
  ItemEmbedding(n_items, emb_dim)
  MLP: [emb_dim*2 -> 256 -> 128 -> 64 -> 1]  (with BatchNorm + Dropout)
  Sigmoid output → interaction probability

Artifacts expected in ml-service/models/
  ncf_model.pt        – trained state_dict
  user_id_map.json    – {mongo_user_id: int_index}
  course_id_map.json  – {mongo_course_id: int_index}
  course_meta.json    – [{_id, title, category, tags, ...}, ...]
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional

import numpy as np
import torch
import torch.nn as nn

logger = logging.getLogger(__name__)

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


# ---------------------------------------------------------------------------
# Neural network definition  (mirrors training notebook exactly)
# ---------------------------------------------------------------------------

class NCFModel(nn.Module):
    """Neural Collaborative Filtering with MLP tower."""

    def __init__(self, n_users: int, n_items: int, emb_dim: int = 64):
        super().__init__()
        self.user_emb = nn.Embedding(n_users, emb_dim, padding_idx=0)
        self.item_emb = nn.Embedding(n_items, emb_dim, padding_idx=0)

        self.mlp = nn.Sequential(
            nn.Linear(emb_dim * 2, 256),
            nn.BatchNorm1d(256),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(256, 128),
            nn.BatchNorm1d(128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )

    def forward(self, user_idx: torch.Tensor, item_idx: torch.Tensor) -> torch.Tensor:
        u = self.user_emb(user_idx)
        v = self.item_emb(item_idx)
        return self.mlp(torch.cat([u, v], dim=-1)).squeeze(-1)


# ---------------------------------------------------------------------------
# Recommender wrapper
# ---------------------------------------------------------------------------

class NeuralRecommender:
    """
    Drop-in replacement for HybridRecommender.
    Loads trained NCF artifacts and scores user-course pairs.
    Falls back to popularity ranking when user is unseen.
    """

    def __init__(self):
        self.model: Optional[NCFModel] = None
        self.user_id_map: Dict[str, int] = {}
        self.course_id_map: Dict[str, int] = {}
        self.course_meta: List[Dict] = []
        self.device = torch.device("cpu")  # Render free tier: CPU only
        self._ready = False

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    def load(self) -> bool:
        """Load model artifacts from disk. Returns True on success."""
        model_path   = os.path.join(MODELS_DIR, "ncf_model.pt")
        user_map_path   = os.path.join(MODELS_DIR, "user_id_map.json")
        course_map_path = os.path.join(MODELS_DIR, "course_id_map.json")
        meta_path    = os.path.join(MODELS_DIR, "course_meta.json")

        missing = [p for p in [model_path, user_map_path, course_map_path, meta_path]
                   if not os.path.exists(p)]
        if missing:
            logger.warning("NCF artifacts not found: %s. Service will use popularity fallback.", missing)
            return False

        try:
            with open(user_map_path)   as f: self.user_id_map   = json.load(f)
            with open(course_map_path) as f: self.course_id_map = json.load(f)
            with open(meta_path)       as f: self.course_meta   = json.load(f)

            n_users = max(self.user_id_map.values()) + 1
            n_items = max(self.course_id_map.values()) + 1

            checkpoint = torch.load(model_path, map_location=self.device)
            emb_dim = checkpoint["user_emb.weight"].shape[1]

            self.model = NCFModel(n_users, n_items, emb_dim)
            self.model.load_state_dict(checkpoint)
            self.model.to(self.device)
            self.model.eval()

            self._ready = True
            logger.info("NCF model loaded: %d users, %d items, emb_dim=%d", n_users, n_items, emb_dim)
            return True

        except Exception as exc:
            logger.error("Failed to load NCF model: %s", exc, exc_info=True)
            self._ready = False
            return False

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    def _popularity_rank(self, candidate_ids: List[str], limit: int) -> List[str]:
        """Sort by enrollment*rating*recency when model is unavailable."""
        import time
        now = time.time()
        scored = []
        for c in self.course_meta:
            cid = str(c.get("_id", ""))
            if cid not in candidate_ids:
                continue
            enroll  = float(c.get("studentsEnrolled", 0) or 0)
            rating  = float(c.get("ratingAndReviews", 1) or 1)
            created = float(c.get("createdAt_ts", now) or now)
            decay   = np.exp(-0.1 * (now - created) / 86400 / 30)  # monthly half-life
            scored.append((cid, enroll * rating * decay))
        scored.sort(key=lambda x: x[1], reverse=True)
        return [cid for cid, _ in scored[:limit]]

    def recommend(
        self,
        user_id: str,
        enrolled_ids: List[str],
        all_courses: List[Dict],
        limit: int = 10,
    ) -> List[Dict]:
        """
        Return `limit` recommended courses for `user_id`.
        Excludes already-enrolled courses.
        """
        # Build candidate pool
        enrolled_set = set(str(e) for e in enrolled_ids)
        candidate_courses = [c for c in all_courses if str(c.get("_id", "")) not in enrolled_set]

        if not candidate_courses:
            return []

        candidate_ids = [str(c["_id"]) for c in candidate_courses]

        if not self._ready:
            top_ids = self._popularity_rank(candidate_ids, limit)
            id_to_course = {str(c["_id"]): c for c in candidate_courses}
            return [id_to_course[cid] for cid in top_ids if cid in id_to_course]

        uid = str(user_id)
        if uid not in self.user_id_map:
            # Cold-start: popularity fallback
            top_ids = self._popularity_rank(candidate_ids, limit)
            id_to_course = {str(c["_id"]): c for c in candidate_courses}
            return [id_to_course[cid] for cid in top_ids if cid in id_to_course]

        user_idx = self.user_id_map[uid]

        # Score every candidate
        known_cids   = [cid for cid in candidate_ids if cid in self.course_id_map]
        unknown_cids = [cid for cid in candidate_ids if cid not in self.course_id_map]

        scores: Dict[str, float] = {}

        if known_cids:
            u_tensor = torch.tensor([user_idx] * len(known_cids), dtype=torch.long, device=self.device)
            i_tensor = torch.tensor(
                [self.course_id_map[cid] for cid in known_cids],
                dtype=torch.long, device=self.device
            )
            with torch.no_grad():
                preds = self.model(u_tensor, i_tensor).cpu().numpy()
            for cid, score in zip(known_cids, preds):
                scores[cid] = float(score)

        # Unknown items get popularity score normalised to [0, 0.3]
        if unknown_cids:
            pop_ids = self._popularity_rank(unknown_cids, len(unknown_cids))
            for rank, cid in enumerate(pop_ids):
                scores[cid] = 0.3 * (1 - rank / max(len(pop_ids), 1))

        sorted_ids = sorted(scores, key=scores.__getitem__, reverse=True)[:limit]
        id_to_course = {str(c["_id"]): c for c in candidate_courses}
        return [id_to_course[cid] for cid in sorted_ids if cid in id_to_course]

    def similar_courses(
        self,
        course_id: str,
        all_courses: List[Dict],
        limit: int = 5,
    ) -> List[Dict]:
        """
        Return courses similar to `course_id` based on item-embedding cosine similarity.
        Falls back to same-category courses if model not loaded.
        """
        if not self._ready or course_id not in self.course_id_map:
            # Fallback: same category
            target = next((c for c in all_courses if str(c.get("_id")) == course_id), None)
            if not target:
                return []
            cat = target.get("category", "")
            others = [c for c in all_courses if str(c.get("_id")) != course_id and c.get("category") == cat]
            return others[:limit]

        idx = self.course_id_map[course_id]
        item_emb_matrix = self.model.item_emb.weight.detach().cpu().numpy()  # (n_items, emb_dim)
        target_vec = item_emb_matrix[idx]  # (emb_dim,)

        candidate_ids   = [cid for cid in self.course_id_map if cid != course_id]
        candidate_idxs  = [self.course_id_map[cid] for cid in candidate_ids]
        candidate_vecs  = item_emb_matrix[candidate_idxs]  # (n_cands, emb_dim)

        # Cosine similarity
        norms = np.linalg.norm(candidate_vecs, axis=1, keepdims=True) + 1e-9
        sims  = (candidate_vecs / norms) @ (target_vec / (np.linalg.norm(target_vec) + 1e-9))
        top_k = np.argsort(sims)[::-1][:limit]

        top_cids     = [candidate_ids[i] for i in top_k]
        id_to_course = {str(c["_id"]): c for c in all_courses}
        return [id_to_course[cid] for cid in top_cids if cid in id_to_course]

    @property
    def is_ready(self) -> bool:
        return self._ready
