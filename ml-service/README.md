# StudyNotion – ML Recommendation Microservice

A **lightweight Python Flask microservice** that upgrades StudyNotion's existing  
heuristic recommender with a real ML model, while remaining **trainable locally**  
and **deployable for free on Render**.

---

## Architecture

```
Browser / Mobile
      │
      ▼
Node.js Express (existing StudyNotion server)
      │  GET /api/v1/course/recommendations
      │  POST /api/v1/course/recommendations/train  (admin)
      │  GET  /api/v1/course/:id/similar
      │
      │  axios  (4 s timeout, graceful fallback)
      ▼
Python Flask ML Microservice  (this repo)
      │  POST /recommend
      │  POST /train
      │  GET  /similar/<courseId>
      │
      ▼
Hybrid Model  (persisted to disk)
  ├── Content-Based    TF-IDF (5 k features, bigrams) + cosine similarity
  ├── Collaborative    User-item matrix + user-user cosine similarity
  └── Popularity       enrollment × rating × recency decay
```

### Scoring formula
```
score = 0.45 × content_score
      + 0.35 × collab_score
      + 0.20 × popularity_score
```
Weights are tunable via env vars `REC_ALPHA`, `REC_BETA`, `REC_GAMMA`.

---

## Quick Start

### 1. Set up the Python service

```bash
cd ml-recommender
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Train the model locally

```bash
# Point at your MongoDB Atlas cluster
export MONGODB_URL="mongodb+srv://user:pass@cluster.mongodb.net"
export DB_NAME="studynotion"          # default

python scripts/train.py
# → saves artefacts to models/
```

### 3. Start the Flask service

```bash
python wsgi.py
# Listening on http://localhost:5001
```

### 4. Wire the Node.js server

1. **Replace** `server/controllers/Recommend.js` with `node-integration/Recommend.js`
2. **Update** `server/routes/Course.js` using the diff in `node-integration/routes-diff.js`
3. Add to `server/.env`:
   ```
   ML_SERVICE_URL=http://localhost:5001
   ML_TIMEOUT_MS=4000
   ```
4. Restart the Node server – it will auto-delegate to the ML service and fall  
   back to the heuristic if the service is down.

---

## Deploying to Render

### Python microservice

1. Push `ml-recommender/` to a GitHub repo
2. In Render → **New Web Service** → connect repo
3. Set:
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `gunicorn wsgi:app --workers 1 --threads 2 --timeout 120`
   - **Env vars:**
     - `MONGODB_URL` = your Atlas connection string
     - `DB_NAME`     = `studynotion`
     - `MODEL_PATH`  = `/opt/render/project/src/models`

> **Free tier note:** Render free services sleep after inactivity. The Node.js  
> server already has a `wakeServer.yml` cron — add the ML URL there too.  
> On a free plan the model is retrained fresh on each cold start using  
> `/train` — takes ~10 s for 50 courses.

4. After deploy, grab your service URL: `https://studynotion-ml-recommender.onrender.com`

### Node.js server (existing Render service)

Add to env vars:
```
ML_SERVICE_URL=https://studynotion-ml-recommender.onrender.com
```

---

## API Reference

### `POST /recommend`
```json
{
  "userId": "mongo_object_id | null",
  "enrolledIds": ["courseId1"],
  "courses": [ ...course objects... ],
  "limit": 10
}
```
Response:
```json
{
  "recommended": [
    { "courseId": "...", "score": 0.87 },
    ...
  ],
  "method": "content+collaborative"
}
```

### `POST /train`
```json
{ "courses": [...], "users": [...] }
```
Response:
```json
{ "success": true, "message": "Trained on 42 courses, 15 users." }
```

### `GET /similar/<courseId>?limit=5`
Response:
```json
{
  "similar": [
    { "courseId": "...", "score": 0.72 },
    ...
  ]
}
```

---

## Automatic Retraining

Add a nightly cron job (e.g. Render Cron Service) that calls:
```
POST /api/v1/course/recommendations/train
Authorization: Bearer <admin_token>
```
This fetches fresh data from MongoDB and retrains the model in ~10 s.

---

## Cold-Start Behaviour

| Situation | Behaviour |
|-----------|-----------|
| ML service down / unreachable | Node falls back to heuristic (tag+category boost for logged-in users, trending otherwise) |
| New user with 0 enrolments | ML returns popularity-ranked results |
| < 2 users in DB | Collaborative filtering skipped; content-only used |
| No saved model on disk | Fallback to popularity sort on the ML side too |

---

## File Structure

```
ml-recommender/
├── app/
│   ├── __init__.py
│   ├── main.py          ← Flask routes
│   └── recommender.py   ← HybridRecommender class
├── scripts/
│   └── train.py         ← CLI training script (pulls from MongoDB)
├── models/              ← Auto-created; holds .pkl / .npy / .npz artefacts
├── node-integration/
│   ├── Recommend.js     ← Drop-in replacement for server/controllers/Recommend.js
│   └── routes-diff.js   ← Route additions for server/routes/Course.js
├── wsgi.py              ← Gunicorn entry point
├── requirements.txt
├── render.yaml
└── README.md
```
