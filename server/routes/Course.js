const express = require("express");
const router  = express.Router();

const {
  createCourse,
  getAllCourses,
  getCourseDetails,
  getFullCourseDetails,
  editCourse,
  deleteCourse,
  getInstructorCourses,
  searchCourse,
  getSearchSuggestions,
  instructorDetails,
} = require("../controllers/Course");

const {
  getRecommendations,
  triggerMLTraining,
  getSimilarCourses,
} = require("../controllers/Recommend");

const {
  createCategory,
  showAllCategories,
  categoryPageDetails,
} = require("../controllers/Category");

const {
  createSection,
  updateSection,
  deleteSection,
} = require("../controllers/Section");

const {
  createSubSection,
  updateSubSection,
  deleteSubSection,
} = require("../controllers/Subsection");

const {
  createRating,
  getAverageRating,
  getAllRating,
} = require("../controllers/RatingAndReview");

const { updateCourseProgress } = require("../controllers/courseProgress");

const {
  auth,
  isStudent,
  isInstructor,
  isAdmin,
  optionalAuth,
} = require("../middlewares/auth");

// ── Recommendations ───────────────────────────────────────────────────────────
// Works for guests (no token) and logged-in students (personalised)
router.get("/recommendations", optionalAuth, getRecommendations);

// ── Search ────────────────────────────────────────────────────────────────────
router.get("/searchSuggestions", getSearchSuggestions);
router.get("/searchCourse", searchCourse);
router.get("/instructorDetails/:instructorId", instructorDetails);

// Content-similar courses – shown on the course detail page
router.get("/:courseId/similar", getSimilarCourses);

// Admin-only: push fresh MongoDB data to the ML service and retrain
router.post("/recommendations/train", auth, isAdmin, triggerMLTraining);

// ── Courses ───────────────────────────────────────────────────────────────────
router.post("/addCourse",            auth, isInstructor, createCourse);
router.get("/getAllCourses",          getAllCourses);
router.post("/getCourseDetails",     getCourseDetails);
router.post("/getFullCourseDetails", auth, isStudent, getFullCourseDetails);
router.post("/editCourse",           auth, isInstructor, editCourse);
router.get("/getInstructorCourses",  auth, isInstructor, getInstructorCourses);
router.delete("/deleteCourse",       auth, isInstructor, deleteCourse);
router.post("/updateCourseProgress", auth, isStudent, updateCourseProgress);

// ── Categories ────────────────────────────────────────────────────────────────
router.post("/createCategory",        auth, isAdmin, createCategory);
router.get("/showAllCategories",      showAllCategories);
router.get("/getCategoryPageDetail", categoryPageDetails);

// ── Sections ──────────────────────────────────────────────────────────────────
router.post("/addSection",    auth, isInstructor, createSection);
router.post("/updateSection", auth, isInstructor, updateSection);
router.post("/deleteSection", auth, isInstructor, deleteSection);

// ── Sub-sections ──────────────────────────────────────────────────────────────
router.post("/addSubSection",    auth, isInstructor, createSubSection);
router.post("/updateSubSection", auth, isInstructor, updateSubSection);
router.post("/deleteSubSection", auth, isInstructor, deleteSubSection);

// ── Ratings & Reviews ─────────────────────────────────────────────────────────
router.post("/createRating",  auth, isStudent, createRating);
router.get("/getAverageRating", getAverageRating);
router.get("/getReviews",       getAllRating);

module.exports = router;
