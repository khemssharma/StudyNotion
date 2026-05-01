const Course = require("../models/Course");
const User = require("../models/User");
const CourseProgress = require("../models/CourseProgress");
const RatingAndReview = require("../models/RatingAndReview");

// Helper: compute average rating for a course from its ratingAndReviews array
const computeAvgRating = (reviews) => {
  if (!reviews || reviews.length === 0) return 0;
  const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
  return sum / reviews.length;
};

// Helper: score a course for ranking
// Score = (enrollmentCount * 0.5) + (avgRating * 10 * 0.3) + (recencyBoost * 0.2)
const scoreCourse = (course) => {
  const enrollments = (course.studentsEnrolled || []).length;
  const avgRating = computeAvgRating(course.ratingAndReviews);
  const ageInDays = (Date.now() - new Date(course.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  // Recency boost: newer courses get higher score, decays over 365 days
  const recencyBoost = Math.max(0, 100 - ageInDays / 3.65);
  return enrollments * 0.5 + avgRating * 10 * 0.3 + recencyBoost * 0.2;
};

/**
 * GET /api/v1/course/recommendations
 * Optional auth (works for guests too).
 *
 * Query params:
 *   limit  - how many courses to return (default 20)
 *   page   - page number for pagination (default 1)
 *
 * Logic:
 *   Logged-in student  => Personalised: courses sharing tags/category with enrolled courses
 *                         that the student has NOT yet enrolled in.
 *                         Falls back to trending if not enough personalised results.
 *   Guest / Instructor => Trending: top courses by score (enrollments + rating + recency)
 *
 * Response shape:
 * {
 *   success: true,
 *   data: {
 *     recommended: [...],   // personalised or trending courses
 *     trending:    [...],   // global top courses by enrollment
 *     topRated:    [...],   // global top courses by avg rating
 *     categories:  [...],   // all available categories for filter chips
 *   }
 * }
 */
exports.getRecommendations = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const page  = parseInt(req.query.page)  || 1;
    const skip  = (page - 1) * limit;

    // ---- Fetch ALL published courses (with populated refs needed for scoring) ----
    const allCourses = await Course.find({ status: "Published" })
      .populate("instructor", "firstName lastName")
      .populate("category", "name")
      .populate("ratingAndReviews", "rating")
      .lean();

    if (!allCourses || allCourses.length === 0) {
      return res.status(200).json({
        success: true,
        data: { recommended: [], trending: [], topRated: [], categories: [] },
      });
    }

    // ---- Score every course ----
    const scored = allCourses.map((c) => ({ ...c, _score: scoreCourse(c) }));

    // ---- Global Trending (by enrollment count) ----
    const trending = [...scored]
      .sort((a, b) => (b.studentsEnrolled?.length || 0) - (a.studentsEnrolled?.length || 0))
      .slice(0, 10);

    // ---- Top Rated (by avg rating, min 1 review) ----
    const topRated = [...scored]
      .filter((c) => c.ratingAndReviews?.length > 0)
      .sort((a, b) => computeAvgRating(b.ratingAndReviews) - computeAvgRating(a.ratingAndReviews))
      .slice(0, 10);

    // ---- Categories list ----
    const categoryMap = {};
    allCourses.forEach((c) => {
      if (c.category && c.category._id) {
        categoryMap[c.category._id.toString()] = c.category.name;
      }
    });
    const categories = Object.entries(categoryMap).map(([id, name]) => ({ _id: id, name }));

    // ---- Personalised recommendations (if authenticated student) ----
    let recommended = [];

    if (req.user) {
      const userId = req.user.id;

      // Get courses the user is enrolled in
      const userDoc = await User.findById(userId)
        .populate({
          path: "courses",
          select: "tag category",
        })
        .lean();

      const enrolledIds = new Set(
        (userDoc?.courses || []).map((c) => c._id.toString())
      );

      if (enrolledIds.size > 0) {
        // Collect tags and category IDs from enrolled courses
        const preferredTags = new Set();
        const preferredCategoryIds = new Set();

        (userDoc?.courses || []).forEach((c) => {
          (c.tag || []).forEach((t) => preferredTags.add(t.toLowerCase()));
          if (c.category) preferredCategoryIds.add(c.category.toString());
        });

        // Score unenrolled courses by tag/category overlap
        const personalised = scored
          .filter((c) => !enrolledIds.has(c._id.toString()))
          .map((c) => {
            let relevanceBoost = 0;

            // Tag overlap
            const courseTags = (c.tag || []).map((t) => t.toLowerCase());
            courseTags.forEach((t) => {
              if (preferredTags.has(t)) relevanceBoost += 20;
            });

            // Category match
            if (c.category && preferredCategoryIds.has(c.category._id?.toString())) {
              relevanceBoost += 15;
            }

            return { ...c, _score: c._score + relevanceBoost };
          })
          .sort((a, b) => b._score - a._score)
          .slice(skip, skip + limit);

        recommended = personalised;
      }
    }

    // Fallback for guests or new users with no enrolments
    if (recommended.length === 0) {
      recommended = [...scored]
        .sort((a, b) => b._score - a._score)
        .slice(skip, skip + limit);
    }

    // Strip internal _score before sending
    const clean = (arr) =>
      arr.map(({ _score, ...rest }) => ({
        ...rest,
        avgRating: parseFloat(computeAvgRating(rest.ratingAndReviews).toFixed(1)),
        enrollmentCount: (rest.studentsEnrolled || []).length,
        // Don't send the full array to keep payload small
        studentsEnrolled: undefined,
        ratingAndReviews: undefined,
      }));

    return res.status(200).json({
      success: true,
      data: {
        recommended: clean(recommended),
        trending: clean(trending),
        topRated: clean(topRated),
        categories,
      },
    });
  } catch (error) {
    console.error("Error in getRecommendations:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch recommendations",
      error: error.message,
    });
  }
};
