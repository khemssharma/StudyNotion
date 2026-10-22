/**
 * server/controllers/Recommend.js
 * ================================
 * Recommendation controller that delegates scoring to the Python ML
 * microservice and falls back gracefully to the original heuristic if
 * the ML service is unavailable.
 *
 * Environment variables required:
 *   ML_SERVICE_URL – base URL of the Python Flask service
 *                    e.g. https://studynotion-ml-recommender.onrender.com
 *                    Leave unset during local dev to use heuristic fallback.
 *   ML_TIMEOUT_MS  – request timeout in ms (default 4000)
 */

const axios  = require("axios");
const Course = require("../models/Course");
const User   = require("../models/User");

const ML_URL     = process.env.ML_SERVICE_URL || "";
const ML_TIMEOUT = parseInt(process.env.ML_TIMEOUT_MS || "4000", 10);

// ── Heuristic helpers (kept as fallback) ─────────────────────────────────────

const computeAvgRating = (reviews) => {
  if (!reviews || reviews.length === 0) return 0;
  return reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / reviews.length;
};

const heuristicScore = (course) => {
  const enrollments  = (course.studentsEnrolled || []).length;
  const avgRating    = computeAvgRating(course.ratingAndReviews);
  const ageInDays    = (Date.now() - new Date(course.createdAt).getTime()) / 86_400_000;
  const recencyBoost = Math.max(0, 100 - ageInDays / 3.65);
  return enrollments * 0.5 + avgRating * 10 * 0.3 + recencyBoost * 0.2;
};

// ── Content-based personalisation helpers ────────────────────────────────────

const STOPWORDS = new Set([
  "the", "and", "for", "from", "with", "to", "of", "a", "an", "in", "on", "zero",
  "hero", "course", "courses", "development", "complete", "advanced", "beginner",
  "pro", "practical", "project", "based", "job", "ready", "hands", "ultimate",
  "masterclass", "bootcamp", "sprint", "playbook", "blueprint", "full", "stack",
  "learn", "101",
]);

const norm = (s) => String(s || "").trim().toLowerCase();

/** Split free text into lowercase terms; keeps hyphenated words (react-native) too. */
const textTerms = (text) => {
  const out = new Set();
  String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/)
    .forEach((w) => {
      w = w.replace(/^[.-]+|[.-]+$/g, "");
      if (!w || /^\d+$/.test(w) || STOPWORDS.has(w)) return;
      out.add(w);
      if (w.includes("-")) w.split("-").forEach((p) => p && !STOPWORDS.has(p) && out.add(p));
    });
  return out;
};

/** Category name (not id) — duplicate category docs with the same name are treated as one. */
const catName = (course) => norm(course.category?.name || course.categoryName || "");

const courseTerms = (course) => {
  const terms = new Set();
  (course.tag || []).forEach((t) => textTerms(t).forEach((x) => terms.add(x)));
  textTerms(course.courseName).forEach((t) => terms.add(t));
  textTerms(catName(course)).forEach((t) => terms.add(t));
  return terms;
};

/**
 * Similarity of a candidate to ONE enrolled course:
 *   0.4 if same category (by name) + 0.6 * share of the enrolled course's terms
 *   that the candidate also has.
 */
const similarity = (enrolledCourse, enrolledTerms, candidate, candidateTerms) => {
  let sim = 0;
  if (catName(enrolledCourse) && catName(enrolledCourse) === catName(candidate)) sim += 0.4;
  if (enrolledTerms.size) {
    let hit = 0;
    enrolledTerms.forEach((t) => { if (candidateTerms.has(t)) hit += 1; });
    sim += 0.6 * (hit / enrolledTerms.size);
  }
  return sim;
};

/**
 * "Because you took X" style recommendations.
 * Builds a ranked list of similar courses for every enrolled course, then
 * round-robins across them so every interest (not just the biggest one) is
 * represented. A single category is capped at ~40% of the list.
 */
const contentBasedRecommendations = (enrolledCourses, candidates, limit) => {
  if (!enrolledCourses.length || !candidates.length) return [];

  const maxPop = Math.max(1, ...candidates.map((c) => c._hScore || 0));
  const candTerms = new Map(candidates.map((c) => [c._id.toString(), courseTerms(c)]));

  // Most recently enrolled first
  const lists = [...enrolledCourses].reverse().map((e) => {
    const eTerms = courseTerms(e);
    return candidates
      .map((c) => {
        const sim = similarity(e, eTerms, c, candTerms.get(c._id.toString()));
        // popularity / rating only as a tie-breaker
        return { c, score: sim + 0.15 * ((c._hScore || 0) / maxPop), sim };
      })
      .filter((x) => x.sim >= 0.1)
      .sort((a, b) => b.score - a.score);
  });

  const catCap = Math.max(2, Math.ceil(limit * 0.4));
  const picked = [];
  const seen = new Set();
  const perCat = {};
  // per-list category counts: lets one enrolled course surface several
  // related categories (e.g. Microservices -> Web Dev, System Design, DevOps)
  const listCat = lists.map(() => ({}));
  const DIVERSITY_PENALTY = 0.5;

  let progress = true;
  while (picked.length < limit && progress) {
    progress = false;
    for (let i = 0; i < lists.length && picked.length < limit; i++) {
      let best = null;
      let bestVal = -Infinity;
      for (const item of lists[i]) {
        const id = item.c._id.toString();
        const cat = catName(item.c);
        if (seen.has(id) || (perCat[cat] || 0) >= catCap) continue;
        const val = item.score - DIVERSITY_PENALTY * (listCat[i][cat] || 0);
        if (val > bestVal) { bestVal = val; best = item; }
      }
      if (!best) continue;
      const cat = catName(best.c);
      seen.add(best.c._id.toString());
      perCat[cat] = (perCat[cat] || 0) + 1;
      listCat[i][cat] = (listCat[i][cat] || 0) + 1;
      picked.push({ ...best.c, _recScore: best.score });
      progress = true;
    }
  }
  return picked;
};

/**
 * Normalises the ML service response. The Flask service has returned both
 *   { recommendations: [courseDoc, ...] }            (older)
 *   { recommended: [{ courseId, score }, ...] }       (current)
 */
const normaliseMLResult = (data) => {
  if (!data) return { items: [], personalised: false };
  let items = [];
  if (Array.isArray(data.recommended)) {
    items = data.recommended.map((r) => ({ courseId: String(r.courseId || r._id), score: r.score }));
  } else if (Array.isArray(data.recommendations)) {
    const n = data.recommendations.length;
    items = data.recommendations.map((r, i) => ({
      courseId: String(r.courseId || r._id),
      score: r.score != null ? r.score : 1 - i / Math.max(n, 1),
    }));
  }
  // Only trust ML when it actually personalised for this user (not a popularity fallback)
  const personalised = data.personalised === true;
  return { items, personalised, method: data.model || data.method };
};

// ── Shared data fetcher ───────────────────────────────────────────────────────

async function fetchPublishedCourses() {
  return Course.find({ status: "Published" })
    .populate("instructor", "firstName lastName")
    .populate("category",   "name")
    .populate("ratingAndReviews", "rating")
    .lean();
}

// ── ML service call ───────────────────────────────────────────────────────────

/**
 * Calls the Python ML microservice.
 * Returns null if the service is unreachable or times out.
 */
async function callMLService({ userId, enrolledIds, courses, limit }) {
  if (!ML_URL) return null;

  // Send a lightweight version of courses (no need for full content)
  const lightCourses = courses.map((c) => ({
    _id:               c._id,
    courseName:        c.courseName,
    courseDescription: c.courseDescription,
    whatYouWillLearn:  c.whatYouWillLearn,
    tag:               c.tag,
    category:          c.category,
    price:             c.price,
    createdAt:         c.createdAt,
    studentsEnrolled:  (c.studentsEnrolled || []).map(String),
    ratingAndReviews:  (c.ratingAndReviews || []).map((r) => ({
      _id:    r._id,
      rating: r.rating,
    })),
  }));

  try {
    const { data } = await axios.post(
      `${ML_URL}/recommend`,
      { userId, enrolledIds: [...enrolledIds], courses: lightCourses, limit },
      { timeout: ML_TIMEOUT },
    );
    return data; // { recommended: [{courseId, score}], method }
  } catch (err) {
    console.warn("[Recommend] ML service unavailable, falling back to heuristic:", err.message);
    return null;
  }
}

// ── Clean course for response ─────────────────────────────────────────────────

const cleanCourse = (course, mlScore) => ({
  ...course,
  avgRating:       parseFloat(computeAvgRating(course.ratingAndReviews).toFixed(1)),
  enrollmentCount: (course.studentsEnrolled || []).length,
  mlScore:         mlScore != null ? parseFloat(mlScore.toFixed(4)) : undefined,
  // Strip large arrays from response payload
  studentsEnrolled: undefined,
  ratingAndReviews: undefined,
});

// ── Main handler ──────────────────────────────────────────────────────────────

/**
 * GET /api/v1/course/recommendations
 * Optional auth (works for guests too).
 *
 * Query params:
 *   limit  – how many courses to return (default 20)
 *   page   – page number (default 1)
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     recommended: [...],
 *     trending:    [...],
 *     topRated:    [...],
 *     categories:  [...],
 *     meta: { method, mlAvailable }
 *   }
 * }
 */
exports.getRecommendations = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const page  = parseInt(req.query.page)  || 1;
    const skip  = (page - 1) * limit;

    const allCourses = await fetchPublishedCourses();
    if (!allCourses?.length) {
      return res.status(200).json({
        success: true,
        data: { recommended: [], trending: [], topRated: [], categories: [], meta: {} },
      });
    }

    // Pre-score every course heuristically (used for trending / topRated always)
    const scored = allCourses.map((c) => ({ ...c, _hScore: heuristicScore(c) }));

    // Determine enrolled courses if user is logged in
    let userId          = null;
    let enrolledIds     = new Set();
    let enrolledCourses = [];

    if (req.user) {
      userId = req.user.id;
      const userDoc = await User.findById(userId)
        .populate({
          path: "courses",
          select: "courseName tag category",
          populate: { path: "category", select: "name" },
        })
        .lean();
      enrolledCourses = (userDoc?.courses || []).filter(Boolean);
      enrolledIds = new Set(enrolledCourses.map((c) => c._id.toString()));
    }

    const notEnrolled = (c) => !enrolledIds.has(c._id.toString());

    // Global Trending (excluding what the user already owns)
    const trending = [...scored]
      .filter(notEnrolled)
      .sort((a, b) => (b.studentsEnrolled?.length || 0) - (a.studentsEnrolled?.length || 0))
      .slice(0, 10)
      .map((c) => cleanCourse(c));

    // Top Rated (excluding what the user already owns)
    const topRated = [...scored]
      .filter(notEnrolled)
      .filter((c) => c.ratingAndReviews?.length > 0)
      .sort((a, b) => computeAvgRating(b.ratingAndReviews) - computeAvgRating(a.ratingAndReviews))
      .slice(0, 10)
      .map((c) => cleanCourse(c));

    // Category list — de-duplicated by name (DB has duplicate category docs)
    const categoryMap = {};
    allCourses.forEach((c) => {
      const name = c.category?.name;
      if (c.category?._id && name && !categoryMap[norm(name)]) {
        categoryMap[norm(name)] = { _id: c.category._id.toString(), name };
      }
    });
    const categories = Object.values(categoryMap);

    // ── Personalised recommendations ──────────────────────────────────────────
    let recommended = [];
    let method      = "heuristic";
    let mlAvailable = false;

    const candidates = scored.filter(notEnrolled);
    const pageEnd    = skip + limit;

    // ── 1. ML service (only used when it really personalised for this user) ──
    if (userId) {
      const mlResult = normaliseMLResult(
        await callMLService({
          userId,
          enrolledIds,
          courses: allCourses,
          limit: pageEnd + enrolledIds.size, // request extra to cover enrolled filter
        }),
      );
      mlAvailable = mlResult.items.length > 0;

      if (mlResult.personalised && mlResult.items.length) {
        const courseById = Object.fromEntries(allCourses.map((c) => [c._id.toString(), c]));
        recommended = mlResult.items
          .filter((r) => !enrolledIds.has(r.courseId) && courseById[r.courseId])
          .slice(skip, pageEnd)
          .map((r) => cleanCourse(courseById[r.courseId], r.score));
        method = mlResult.method || "ncf";
      }
    }

    // ── 2. Content-based ("because you took X"), diversified across interests ─
    if (!recommended.length && enrolledCourses.length) {
      const content = contentBasedRecommendations(enrolledCourses, candidates, pageEnd);
      // top up with popular courses if the user's interests are narrow
      const ids = new Set(content.map((c) => c._id.toString()));
      const filler = [...candidates]
        .filter((c) => !ids.has(c._id.toString()))
        .sort((a, b) => b._hScore - a._hScore);
      recommended = [...content, ...filler]
        .slice(skip, pageEnd)
        .map((c) => cleanCourse(c, c._recScore));
      method = "content_personalised";
    }

    // ── 3. Guests / no enrollments: popularity ────────────────────────────────
    if (!recommended.length) {
      recommended = [...candidates]
        .sort((a, b) => b._hScore - a._hScore)
        .slice(skip, pageEnd)
        .map((c) => cleanCourse(c));
      method = "heuristic_trending";
    }

    return res.status(200).json({
      success: true,
      data: {
        recommended,
        trending,
        topRated,
        categories,
        meta: { method, mlAvailable, page, limit },
      },
    });
  } catch (error) {
    console.error("Error in getRecommendations:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch recommendations",
      error:   error.message,
    });
  }
};

// ── Trigger ML Training ───────────────────────────────────────────────────────

/**
 * POST /api/v1/course/recommendations/train   (Admin only)
 * Fetches all data from DB and pushes it to the ML service for retraining.
 */
exports.triggerMLTraining = async (req, res) => {
  if (!ML_URL) {
    return res.status(503).json({ success: false, message: "ML service not configured" });
  }

  try {
    const courses = await fetchPublishedCourses();
    const users   = await User.find({ accountType: "Student" })
      .select("_id courses")
      .lean();

    // Slim the payload — strip large fields (courseContent, thumbnail, etc.)
    // that are not needed by the ML service and cause maxBodyLength errors.
    const lightCourses = courses.map((c) => ({
      _id:               c._id,
      courseName:        c.courseName,
      courseDescription: c.courseDescription,
      whatYouWillLearn:  c.whatYouWillLearn,
      tag:               c.tag,
      category:          c.category,
      price:             c.price,
      createdAt:         c.createdAt,
      studentsEnrolled:  (c.studentsEnrolled || []).map(String),
      ratingAndReviews:  (c.ratingAndReviews || []).map((r) => ({
        _id:    r._id,
        rating: r.rating,
      })),
    }));

    const { data } = await axios.post(
      `${ML_URL}/train`,
      { courses: lightCourses, users },
      {
        timeout:          60_000,   // training can take a moment
        maxContentLength: Infinity, // remove axios incoming-response size cap
        maxBodyLength:    Infinity, // remove axios outgoing-request size cap
      },
    );

    return res.status(200).json({ success: true, mlResponse: data });
  } catch (error) {
    console.error("ML training trigger error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/v1/course/:courseId/similar   (Public)
 * Returns content-similar courses from the ML service.
 */
exports.getSimilarCourses = async (req, res) => {
  const { courseId } = req.params;
  const limit = parseInt(req.query.limit) || 5;

  if (!ML_URL) {
    return res.status(503).json({ success: false, message: "ML service not configured" });
  }

  try {
    const { data } = await axios.get(
      `${ML_URL}/similar/${courseId}?limit=${limit}`,
      { timeout: ML_TIMEOUT },
    );

    // Hydrate with full course data
    const ids     = (data.similar || []).map((r) => String(r.courseId || r._id));
    const courses = await Course.find({ _id: { $in: ids }, status: "Published" })
      .populate("instructor", "firstName lastName")
      .populate("category",   "name")
      .populate("ratingAndReviews", "rating")
      .lean();

    const scoreMap = Object.fromEntries((data.similar || []).map((r) => [String(r.courseId || r._id), r.score]));
    const hydrated = ids
      .map((id) => {
        const c = courses.find((x) => x._id.toString() === id);
        return c ? cleanCourse(c, scoreMap[id]) : null;
      })
      .filter(Boolean);

    return res.status(200).json({ success: true, data: hydrated });
  } catch (error) {
    console.error("getSimilarCourses error:", error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};