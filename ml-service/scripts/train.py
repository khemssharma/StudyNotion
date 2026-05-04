#!/usr/bin/env python3
"""
scripts/train.py
================
Pull data from MongoDB and train the recommendation model locally.

Usage:
    MONGODB_URL="mongodb+srv://..." python scripts/train.py

Env vars (all optional – will prompt if not set):
    MONGODB_URL   – your MongoDB connection string
    DB_NAME       – database name (default: studynotion)
    MODEL_PATH    – where to save artefacts (default: models)
"""

import os
import sys
import json
import logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger("train")

# ── Resolve paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR   = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, ROOT_DIR)

from app.recommender import HybridRecommender

# ── Config ────────────────────────────────────────────────────────────────────
MONGO_URL  = os.environ.get("MONGODB_URL") or os.environ.get("MONGODB_URI", "")
DB_NAME    = os.environ.get("DB_NAME", "studynotion")
MODEL_PATH = os.environ.get("MODEL_PATH", os.path.join(ROOT_DIR, "models"))


def fetch_data():
    try:
        from pymongo import MongoClient
    except ImportError:
        logger.error("pymongo not installed. Run: pip install pymongo")
        sys.exit(1)

    if not MONGO_URL:
        logger.error("MONGODB_URL env var not set.")
        sys.exit(1)

    logger.info("Connecting to MongoDB …")
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=10_000)
    db     = client[DB_NAME]

    # ---- Courses ----
    logger.info("Fetching published courses …")
    raw_courses = list(db.courses.find({"status": "Published"}))

    # Populate category names
    cat_ids = [c.get("category") for c in raw_courses if c.get("category")]
    cats    = {str(c["_id"]): c.get("name", "") for c in db.categories.find({"_id": {"$in": cat_ids}})}

    # Populate rating values
    rev_ids_all = []
    for c in raw_courses:
        rev_ids_all.extend(c.get("ratingAndReviews", []))
    reviews_map = {str(r["_id"]): r for r in db.ratingandreviews.find({"_id": {"$in": rev_ids_all}})}

    courses = []
    for c in raw_courses:
        cat_id = str(c.get("category", ""))
        populated_cat = {"_id": cat_id, "name": cats.get(cat_id, "")}
        populated_rev = [reviews_map[str(rid)] for rid in c.get("ratingAndReviews", []) if str(rid) in reviews_map]
        for r in populated_rev:
            r["_id"] = str(r["_id"])
        courses.append({
            "_id":                str(c["_id"]),
            "courseName":         c.get("courseName", ""),
            "courseDescription":  c.get("courseDescription", ""),
            "whatYouWillLearn":   c.get("whatYouWillLearn", ""),
            "tag":                c.get("tag", []),
            "category":           populated_cat,
            "studentsEnrolled":   [str(s) for s in c.get("studentsEnrolled", [])],
            "ratingAndReviews":   populated_rev,
            "createdAt":          c.get("createdAt", datetime.utcnow()).isoformat(),
            "price":              c.get("price", 0),
            "status":             c.get("status", "Published"),
        })

    logger.info("  → %d courses fetched.", len(courses))

    # ---- Users (students only) ----
    logger.info("Fetching student users …")
    raw_users = list(db.users.find({"accountType": "Student"}))
    users = []
    for u in raw_users:
        users.append({
            "_id":     str(u["_id"]),
            "courses": [str(cid) for cid in u.get("courses", [])],
        })
    logger.info("  → %d users fetched.", len(users))

    # Optionally dump a snapshot for offline debugging
    snapshot_path = os.path.join(ROOT_DIR, "models", "training_snapshot.json")
    os.makedirs(os.path.dirname(snapshot_path), exist_ok=True)
    with open(snapshot_path, "w") as f:
        json.dump({"courses": courses, "users": users, "trained_at": datetime.utcnow().isoformat()}, f, indent=2)
    logger.info("Snapshot saved to %s", snapshot_path)

    return courses, users


def main():
    courses, users = fetch_data()

    if not courses:
        logger.error("No published courses found – nothing to train on.")
        sys.exit(1)

    rec = HybridRecommender(model_path=MODEL_PATH)
    rec.train(courses=courses, users=users)
    rec.save()

    logger.info("✅  Model saved to %s/", MODEL_PATH)
    logger.info("    Courses indexed : %d", len(rec.course_index))
    logger.info("    Users indexed   : %d", len(rec.user_index))


if __name__ == "__main__":
    main()
