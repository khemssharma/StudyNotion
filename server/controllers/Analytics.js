const Course = require("../models/Course");
const User = require("../models/User");
const CourseProgress = require("../models/CourseProgress");
const RatingAndReview = require("../models/RatingAndReview");
const mongoose = require("mongoose");

// GET api/v1/analytics/overview
exports.getPlatformOverview = async (req, res) => {
  try {
    const totalCourses = await Course.countDocuments({ status: "Published" });
    const totalUsers = await User.countDocuments({ accountType: "Student" });
    const totalInstructors = await User.countDocuments({ accountType: "Instructor" });
    const totalEnrollments = await User.aggregate([
      { $project: { count: { $size: "$courses" } } },
      { $group: { _id: null, total: { $sum: "$count" } } }
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalCourses,
        totalUsers,
        totalInstructors,
        totalEnrollments: totalEnrollments[0]?.total || 0,
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/analytics/completion-rate/:courseId
exports.getCourseCompletionRate = async (req, res) => {
  try {
    const { courseId } = req.params;

    const progressData = await CourseProgress.find({ courseID: courseId });
    if (!progressData.length)
      return res.status(404).json({ success: false, message: "No progress data found" });

    const course = await Course.findById(courseId).populate({
      path: "courseContent",
      populate: { path: "subSection" }
    });

    const totalSubSections = course.courseContent.reduce(
      (acc, section) => acc + section.subSection.length, 0
    );

    const completionRates = progressData.map((p) => ({
      userId: p.userId,
      completedPercent: totalSubSections
        ? Math.round((p.completedVideos.length / totalSubSections) * 100)
        : 0,
    }));

    const avgCompletion =
      completionRates.reduce((sum, r) => sum + r.completedPercent, 0) /
      completionRates.length;

    return res.status(200).json({
      success: true,
      data: { courseId, avgCompletionRate: avgCompletion.toFixed(2), completionRates }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/analytics/instructor-revenue/:instructorId
exports.getInstructorRevenue = async (req, res) => {
  try {
    const { instructorId } = req.params;

    const courses = await Course.find({ instructor: instructorId }).select(
      "courseName price studentsEnrolled"
    );

    const revenueData = courses.map((course) => ({
      courseName: course.courseName,
      price: course.price,
      enrollments: course.studentsEnrolled.length,
      revenue: course.price * course.studentsEnrolled.length,
    }));

    const totalRevenue = revenueData.reduce((sum, c) => sum + c.revenue, 0);

    return res.status(200).json({
      success: true,
      data: { instructorId, totalRevenue, courses: revenueData }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/analytics/rating-distribution/:courseId
exports.getRatingDistribution = async (req, res) => {
  try {
    const { courseId } = req.params;

    const distribution = await RatingAndReview.aggregate([
      { $match: { course: mongoose.Types.ObjectId(courseId) } },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Fill missing ratings (1–5) with 0
    const result = [1, 2, 3, 4, 5].map((star) => ({
      star,
      count: distribution.find((d) => d._id === star)?.count || 0,
    }));

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/analytics/enrollment-trend
exports.getMonthlyEnrollmentTrend = async (req, res) => {
  try {
    const trend = await Course.aggregate([
      { $unwind: "$studentsEnrolled" },
      {
        $lookup: {
          from: "users",
          localField: "studentsEnrolled",
          foreignField: "_id",
          as: "studentInfo"
        }
      },
      { $unwind: "$studentInfo" },
      {
        $group: {
          _id: {
            year: { $year: "$studentInfo.createdAt" },
            month: { $month: "$studentInfo.createdAt" }
          },
          enrollments: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    return res.status(200).json({ success: true, data: trend });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};