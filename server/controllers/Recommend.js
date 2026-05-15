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

    // Global Trending
    const trending = [...scored]
      .sort((a, b) => (b.studentsEnrolled?.length || 0) - (a.studentsEnrolled?.length || 0))
      .slice(0, 10)
      .map((c) => cleanCourse(c));

    // Top Rated
    const topRated = [...scored]
      .filter((c) => c.ratingAndReviews?.length > 0)
      .sort((a, b) => computeAvgRating(b.ratingAndReviews) - computeAvgRating(a.ratingAndReviews))
      .slice(0, 10)
      .map((c) => cleanCourse(c));

    // Category list
    const categoryMap = {};
    allCourses.forEach((c) => {
      if (c.category?._id) categoryMap[c.category._id.toString()] = c.category.name;
    });
    const categories = Object.entries(categoryMap).map(([id, name]) => ({ _id: id, name }));

    // ── Personalised recommendations ──────────────────────────────────────────
    let recommended = [];
    let method      = "heuristic";
    let mlAvailable = false;

    // Determine enrolled courses if user is logged in
    let userId     = null;
    let enrolledIds = new Set();

    if (req.user) {
      userId = req.user.id;
      const userDoc = await User.findById(userId)
        .populate({ path: "courses", select: "tag category" })
        .lean();

      enrolledIds = new Set((userDoc?.courses || []).map((c) => c._id.toString()));
    }

    // ── Try ML service first ──────────────────────────────────────────────────
    const mlResult = await callMLService({
      userId,
      enrolledIds,
      courses: allCourses,
      limit: limit + enrolledIds.size,   // request extra to cover enrolled filter
    });

    if (mlResult?.recommended?.length) {
      mlAvailable = true;
      method      = mlResult.method || "ml";

      // Build a lookup for fast course hydration
      const courseById = Object.fromEntries(
        allCourses.map((c) => [c._id.toString(), c])
      );

      recommended = mlResult.recommended
        .filter((r) => !enrolledIds.has(r.courseId))
        .slice(skip, skip + limit)
        .map((r) => {
          const course = courseById[r.courseId];
          return course ? cleanCourse(course, r.score) : null;
        })
        .filter(Boolean);
    }

    // ── Heuristic fallback ────────────────────────────────────────────────────
    if (!recommended.length) {
      method = "heuristic";

      if (enrolledIds.size > 0 && req.user) {
        // Tag / category boosting (original logic)
        const userDoc = await User.findById(userId)
          .populate({ path: "courses", select: "tag category" })
          .lean();

        const preferredTags = new Set();
        const preferredCats = new Set();
        (userDoc?.courses || []).forEach((c) => {
          (c.tag || []).forEach((t) => preferredTags.add(t.toLowerCase()));
          if (c.category) preferredCats.add(c.category.toString());
        });

        recommended = scored
          .filter((c) => !enrolledIds.has(c._id.toString()))
          .map((c) => {
            let boost = 0;
            (c.tag || []).forEach((t) => { if (preferredTags.has(t.toLowerCase())) boost += 20; });
            if (c.category && preferredCats.has(c.category._id?.toString())) boost += 15;
            return { ...c, _hScore: c._hScore + boost };
          })
          .sort((a, b) => b._hScore - a._hScore)
          .slice(skip, skip + limit)
          .map((c) => cleanCourse(c));

        method = "heuristic_personalised";
      }

      if (!recommended.length) {
        recommended = scored
          .sort((a, b) => b._hScore - a._hScore)
          .slice(skip, skip + limit)
          .map((c) => cleanCourse(c));
        method = "heuristic_trending";
      }
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
    const ids     = (data.similar || []).map((r) => r.courseId);
    const courses = await Course.find({ _id: { $in: ids }, status: "Published" })
      .populate("instructor", "firstName lastName")
      .populate("category",   "name")
      .populate("ratingAndReviews", "rating")
      .lean();

    const scoreMap = Object.fromEntries((data.similar || []).map((r) => [r.courseId, r.score]));
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