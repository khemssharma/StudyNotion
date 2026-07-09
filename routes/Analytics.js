const express = require("express");
const router = express.Router();
const { auth, isAdmin, isInstructor } = require("../middlewares/auth");
const Analytics = require("../controllers/Analytics");

router.get("/overview", auth, isAdmin, Analytics.getPlatformOverview);
router.get("/completion-rate/:courseId", auth, Analytics.getCourseCompletionRate);
router.get("/instructor-revenue/:instructorId", auth, isInstructor, Analytics.getInstructorRevenue);
router.get("/rating-distribution/:courseId", Analytics.getRatingDistribution);
router.get("/enrollment-trend", auth, isAdmin, Analytics.getEnrollmentTrend);
router.get("/recent-users", auth, isAdmin, Analytics.getRecentUsers);

module.exports = router;