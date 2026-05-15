"""
StudyNotion ML Recommendation Microservice  (NCF Edition)
=========================================================
Flask service backed by a Neural Collaborative Filtering model
trained on Kaggle / Google Colab and deployed on Render.

Endpoints
---------
GET  /                         health-check
POST /recommend                NCF-based personalised recommendations
GET  /similar/<course_id>      item-embedding cosine similarity
POST /train                    re-export id-maps + course_meta from live DB
                               (full NN re-training happens on Kaggle/Colab)
"""

import os
import json
import logging
import time
from flask import Flask, request, jsonify
from flask_cors import CORS

from nn_recommender import NeuralRecommender

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Singleton recommender — loaded once at startup
recommender = NeuralRecommender()


@app.before_request
def _startup_load():
    """Lazy-load model artifacts on first request if not already loaded."""
    global recommender
    if not recommender.is_ready:
        recommender.load()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "StudyNotion NCF Recommendation Service",
        "model": "Neural Collaborative Filtering (NCF)",
        "model_ready": recommender.is_ready,
    })


@app.route("/recommend", methods=["POST"])
def recommend():
    """
    Body (JSON):
      userId      str          – MongoDB ObjectId string
      enrolledIds [str]        – already-enrolled course ids
      courses     [{...}]      – full course catalogue from the caller
      limit       int          – max results (default 10)
    """
    data = request.get_json(force=True) or {}
    user_id     = str(data.get("userId", ""))
    enrolled    = [str(e) for e in data.get("enrolledIds", [])]
    courses     = data.get("courses", [])
    limit       = int(data.get("limit", 10))

    if not user_id:
        return jsonify({"error": "userId is required"}), 400
    if not courses:
        return jsonify({"recommendations": [], "model": "ncf", "fallback": False})

    t0 = time.time()
    recs = recommender.recommend(user_id, enrolled, courses, limit)
    elapsed = round((time.time() - t0) * 1000, 1)

    logger.info("recommend user=%s recs=%d elapsed=%sms", user_id, len(recs), elapsed)
    return jsonify({
        "recommendations": recs,
        "count": len(recs),
        "model": "ncf",
        "model_ready": recommender.is_ready,
        "latency_ms": elapsed,
    })


@app.route("/similar/<course_id>", methods=["GET"])
def similar(course_id: str):
    """
    Query params:
      courses  – JSON-encoded array of course dicts (passed by caller)
      limit    – int (default 5)
    """
    limit   = int(request.args.get("limit", 5))
    courses_raw = request.args.get("courses", "[]")
    try:
        courses = json.loads(courses_raw)
    except Exception:
        courses = []

    sims = recommender.similar_courses(course_id, courses, limit)
    return jsonify({
        "courseId": course_id,
        "similar": sims,
        "count": len(sims),
        "model": "ncf-item-embeddings",
    })


@app.route("/train", methods=["POST"])
def train():
    """
    This endpoint does NOT retrain the neural network in-process
    (that runs on Kaggle / Google Colab with GPU).

    What it DOES do:
      1. Accepts fresh courses + users from the caller.
      2. Writes updated course_meta.json to ml-service/models/ so the
         inference service stays current without a full retrain.
      3. Returns instructions for triggering a Kaggle notebook run
         when a full retrain is needed.
    """
    data    = request.get_json(force=True) or {}
    courses = data.get("courses", [])
    users   = data.get("users", [])

    models_dir = os.path.join(os.path.dirname(__file__), "..", "models")
    os.makedirs(models_dir, exist_ok=True)

    # Persist course metadata so popularity fallback stays fresh
    if courses:
        now = time.time()
        for c in courses:
            if "createdAt" in c and isinstance(c["createdAt"], str):
                try:
                    from datetime import datetime
                    c["createdAt_ts"] = datetime.fromisoformat(
                        c["createdAt"].replace("Z", "+00:00")
                    ).timestamp()
                except Exception:
                    c["createdAt_ts"] = now

        meta_path = os.path.join(models_dir, "course_meta.json")
        with open(meta_path, "w") as f:
            json.dump(courses, f)
        logger.info("Updated course_meta.json with %d courses", len(courses))

    return jsonify({
        "status": "metadata_updated",
        "courses_updated": len(courses),
        "nn_retrain": {
            "note": "Full NCF retraining runs on Kaggle/Colab with GPU.",
            "trigger": "Push new data to the connected Kaggle dataset and re-run notebook studynotion-ncf-training",
            "artifact_upload": "After training, upload ncf_model.pt + user_id_map.json + course_id_map.json to Render env or Git LFS",
        },
        "model_ready": recommender.is_ready,
    })


# ---------------------------------------------------------------------------
# Entry-point (local dev only — Render uses gunicorn via wsgi.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Load model at startup for local dev
    recommender.load()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
