"""
NeuralCollaborativeFiltering (NCF) Inference Module
====================================================
Loads a trained NCF model (PyTorch .pt artifact + id-maps saved during
Kaggle/Colab training) and exposes the same interface as a simple
recommender so main.py needs zero structural changes.

IMPORTANT: PyTorch is an OPTIONAL dependency.
  - If torch is not installed, the service runs in popularity-fallback mode.
  - This allows the Render deployment to boot without model artifacts.
  - Once model artifacts are added and torch is installed via build command,
    full NCF inference activates automatically.

Model architecture (must match training notebook):
  UserEmbedding(n_users, emb_dim)
  ItemEmbedding(n_items, emb_dim)
  MLP: [emb_dim*2 -> 256 -> 128 -> 64 -> 1]  (with BatchNorm + Dropout)
  Sigmoid output -> interaction probability

Artifacts expected in ml-service/models/
  ncf_model.pt        - trained state_dict
  user_id_map.json    - {mongo_user_id: int_index}
  course_id_map.json  - {mongo_course_id: int_index}
  course_meta.json    - [{_id, title, category, ...}, ...]
"""

import os
import json
import logging
import time
from typing import List, Dict, Optional

import numpy as np

# PyTorch is OPTIONAL - service runs in fallback mode without it
try:
    import torch
    import torch.nn as nn
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    torch = None
    nn = None

logger = logging.getLogger(__name__)

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


# ---------------------------------------------------------------------------
# Neural network definition  (mirrors training notebook exactly)
# ---------------------------------------------------------------------------

def _build_ncf_model(n_users: int, n_items: int, emb_dim: int):
    """Build NCFModel only when torch is available."""
    if not TORCH_AVAILABLE:
        return None

    class NCFModel(nn.Module):
        """Neural Collaborative Filtering with MLP tower."""
        def __init__(self):
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
        def forward(self, user_idx, item_idx):
            u = self.user_emb(user_idx)
            v = self.item_emb(item_idx)
            return self.mlp(torch.cat([u, v], dim=-1)).squeeze(-1)

    return NCFModel()


# ---------------------------------------------------------------------------
# Recommender wrapper
# ---------------------------------------------------------------------------

class NeuralRecommender:
    """
    NCF-based recommender with graceful fallback.
    - If torch not installed: runs popularity ranking.
    - If no model artifacts: runs popularity ranking.
    - If artifacts present + torch available: full NCF inference.
    """

    def __init__(self):
        self.model = None
        self.user_id_map: Dict[str, int] = {}
        self.course_id_map: Dict[str, int] = {}
        self.course_meta: List[Dict] = []
        self.device = None
        self._ready = False

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    def load(self) -> bool:
        """Load model artifacts from disk. Returns True on success."""
        if not TORCH_AVAILABLE:
            logger.warning(
                "PyTorch not installed. Service running in popularity-fallback mode. "
                "Add torch to build command to enable NCF inference."
            )
            return False

        self.device = torch.device("cpu")

        model_path      = os.path.join(MODELS_DIR, "ncf_model.pt")
        user_map_path   = os.path.join(MODELS_DIR, "user_id_map.json")
        course_map_path = os.path.join(MODELS_DIR, "course_id_map.json")
        meta_path       = os.path.join(MODELS_DIR, "course_meta.json")

        missing = [p for p in [model_path, user_map_path, course_map_path, meta_path]
                   if not os.path.exists(p)]
        if missing:
            logger.warning(
                "NCF artifacts not found: %s. Running in popularity-fallback mode.",
                [os.path.basename(p) for p in missing]
            )
            return False

        try:
            with open(user_map_path)   as f: self.user_id_map   = json.load(f)
            with open(course_map_path) as f: self.course_id_map = json.load(f)
            with open(meta_path)       as f: self.course_meta   = json.load(f)

            n_users = max(self.user_id_map.values()) + 1
            n_items = max(self.course_id_map.values()) + 1

            checkpoint = torch.load(model_path, map_location=self.device)
            emb_dim    = checkpoint["user_emb.weight"].shape[1]

            self.model = _build_ncf_model(n_users, n_items, emb_dim)
            self.model.load_state_dict(checkpoint)
            self.model.to(self.device)
            self.model.eval()

            self._ready = True
            logger.info(
                "NCF model loaded: %d users, %d items, emb_dim=%d",
                n_users, n_items, emb_dim
            )
            return True

        except Exception as exc:
            logger.error("Failed to load NCF model: %s", exc, exc_info=True)
            self._ready = False
            return False

    # ------------------------------------------------------------------
    # Fallback: popularity ranking
    # ------------------------------------------------------------------

    def _popularity_rank(self, candidate_ids: List[str], limit: int) -> List[str]:
        """Sort by enrollment * rating * recency when model is unavailable."""
        now = time.time()
        scored = []
        for c in self.course_meta:
            cid = str(c.get("_id", ""))
            if cid not in candidate_ids:
                continue
            enroll  = float(c.get("studentsEnrolled", 0) or 0)
            rating  = float(c.get("ratingAndReviews", 1) or 1)
            created = float(c.get("createdAt_ts", now) or now)
            decay   = np.exp(-0.1 * (now - created) / 86400 / 30)
            scored.append((cid, enroll * rating * decay))
        scored.sort(key=lambda x: x[1], reverse=True)
        return [cid for cid, _ in scored[:limit]]

    def _fallback_recommend(
        self, candidate_courses: List[Dict], candidate_ids: List[str], limit: int
    ) -> List[Dict]:
        """Use popularity ranking as fallback."""
        if self.course_meta:
            top_ids = self._popularity_rank(candidate_ids, limit)
        else:
            # No metadata - just return first N by order
            top_ids = candidate_ids[:limit]
        id_to_course = {str(c["_id"]): c for c in candidate_courses}
        return [id_to_course[cid] for cid in top_ids if cid in id_to_course]

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    def recommend(
        self,
        user_id: str,
        enrolled_ids: List[str],
        all_courses: List[Dict],
        limit: int = 10,
    ) -> List[Dict]:
        """Return `limit` recommended courses for `user_id`."""
        enrolled_set = set(str(e) for e in enrolled_ids)
        candidate_courses = [
            c for c in all_courses if str(c.get("_id", "")) not in enrolled_set
        ]
        if not candidate_courses:
            return []

        candidate_ids = [str(c["_id"]) for c in candidate_courses]

        # No model or cold-start -> fallback
        if not self._ready:
            return self._fallback_recommend(candidate_courses, candidate_ids, limit)

        uid = str(user_id)
        if uid not in self.user_id_map:
            return self._fallback_recommend(candidate_courses, candidate_ids, limit)

        user_idx = self.user_id_map[uid]

        known_cids   = [cid for cid in candidate_ids if cid in self.course_id_map]
        unknown_cids = [cid for cid in candidate_ids if cid not in self.course_id_map]

        scores: Dict[str, float] = {}

        if known_cids:
            u_t = torch.tensor([user_idx] * len(known_cids), dtype=torch.long, device=self.device)
            i_t = torch.tensor(
                [self.course_id_map[cid] for cid in known_cids],
                dtype=torch.long, device=self.device
            )
            with torch.no_grad():
                preds = self.model(u_t, i_t).cpu().numpy()
            for cid, score in zip(known_cids, preds):
                scores[cid] = float(score)

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
        """Return courses similar to `course_id` using item-embedding cosine similarity."""
        if not self._ready or course_id not in self.course_id_map:
            target = next((c for c in all_courses if str(c.get("_id")) == course_id), None)
            if not target:
                return []
            cat = target.get("category", "")
            return [
                c for c in all_courses
                if str(c.get("_id")) != course_id and c.get("category") == cat
            ][:limit]

        idx = self.course_id_map[course_id]
        item_emb = self.model.item_emb.weight.detach().cpu().numpy()
        target_vec      = item_emb[idx]
        candidate_ids   = [cid for cid in self.course_id_map if cid != course_id]
        candidate_idxs  = [self.course_id_map[cid] for cid in candidate_ids]
        candidate_vecs  = item_emb[candidate_idxs]

        norms = np.linalg.norm(candidate_vecs, axis=1, keepdims=True) + 1e-9
        sims  = (candidate_vecs / norms) @ (target_vec / (np.linalg.norm(target_vec) + 1e-9))
        top_k = np.argsort(sims)[::-1][:limit]

        top_cids     = [candidate_ids[i] for i in top_k]
        id_to_course = {str(c["_id"]): c for c in all_courses}
        return [id_to_course[cid] for cid in top_cids if cid in id_to_course]

    @property
    def is_ready(self) -> bool:
        return self._ready

    @property
    def torch_available(self) -> bool:
        return TORCH_AVAILABLE
