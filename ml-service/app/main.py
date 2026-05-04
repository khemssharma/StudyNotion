"""
StudyNotion ML Recommendation Microservice
==========================================
Lightweight Flask service that exposes a recommendation API backed by:
  1. Content-Based Filtering  – TF-IDF on course text + cosine similarity
  2. Collaborative Filtering  – User-item matrix + cosine similarity (user-user)
  3. Hybrid scoring           – weighted blend of both signals

Designed to:
  - Train locally (python scripts/train.py)
  - Persist model artefacts to disk (models/)
  - Run on Render (free tier friendly – single worker, < 512 MB RAM)
  - Fall back gracefully when fewer than N users/courses exist
"""

import os
import json
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS

from .recommender import HybridRecommender

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

MODEL_PATH = os.environ.get("MODEL_PATH", "models")
recommender = HybridRecommender(model_path=MODEL_PATH)

# ── Lazy-load model on first request ─────────────────────────────────────────
_model_loaded = False

def ensure_model():
    global _model_loaded
    if not _model_loaded:
        if recommender.load():
            logger.info("Model loaded from disk.")
        else:
            logger.warning("No saved model found – recommendations will use cold-start fallback.")
        _model_loaded = True


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "StudyNotion ML Recommender"})


@app.route("/recommend", methods=["POST"])
def recommend():
    """
    POST /recommend
    Body (JSON):
    {
      "userId":      "mongo_object_id | null",
      "enrolledIds": ["courseId1", "courseId2"],   // courses user already has
      "courses":     [ <course objects from MongoDB> ],
      "limit":       10
    }

    Returns:
    {
      "recommended": [ { "courseId": ..., "score": ... }, ... ],
      "method": "hybrid | content | collaborative | fallback"
    }
    """
    ensure_model()
    body = request.get_json(force=True, silent=True) or {}

    user_id     = body.get("userId")
    enrolled    = set(body.get("enrolledIds", []))
    courses     = body.get("courses", [])
    limit       = int(body.get("limit", 10))

    if not courses:
        return jsonify({"recommended": [], "method": "no_data"}), 200

    try:
        results, method = recommender.recommend(
            user_id=user_id,
            enrolled_ids=enrolled,
            courses=courses,
            limit=limit,
        )
        return jsonify({"recommended": results, "method": method})
    except Exception as exc:
        logger.exception("Recommendation error")
        return jsonify({"error": str(exc)}), 500


@app.route("/train", methods=["POST"])
def train():
    """
    POST /train
    Body (JSON):
    {
      "courses": [ <course objects> ],
      "users":   [ <user objects with courses array> ]
    }

    Triggers an in-process retraining and saves artefacts to disk.
    Call this from the Node.js server after bulk data is available,
    or from a nightly cron job.
    """
    body    = request.get_json(force=True, silent=True) or {}
    courses = body.get("courses", [])
    users   = body.get("users", [])

    if not courses:
        return jsonify({"success": False, "message": "No course data provided"}), 400

    try:
        recommender.train(courses=courses, users=users)
        recommender.save()
        global _model_loaded
        _model_loaded = True
        return jsonify({
            "success": True,
            "message": f"Trained on {len(courses)} courses, {len(users)} users.",
        })
    except Exception as exc:
        logger.exception("Training error")
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/similar/<course_id>", methods=["GET"])
def similar(course_id):
    """
    GET /similar/<courseId>?limit=5
    Returns courses similar to the given course (content-based).
    """
    ensure_model()
    limit = int(request.args.get("limit", 5))
    try:
        results = recommender.similar_courses(course_id=course_id, limit=limit)
        return jsonify({"similar": results})
    except Exception as exc:
        logger.exception("Similar-courses error")
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
