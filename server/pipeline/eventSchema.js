/**
 * eventSchema.js — MongoDB Schema for the Data Engineering Pipeline
 *
 * Tracks every meaningful platform event (page views, enrollments, video
 * watches, searches, recommendations clicked, etc.) in a append-only
 * event-store collection.  Downstream jobs (nightly ML retrain, analytics
 * dashboards, recommendation scoring) read from this store.
 */

const mongoose = require("mongoose");

const platformEventSchema = new mongoose.Schema(
  {
    // ---------- Who ----------
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    sessionId: { type: String, index: true }, // anonymous pre-login session

    // ---------- What ----------
    eventType: {
      type: String,
      required: true,
      enum: [
        // Navigation
        "page_view", "search",
        // Course lifecycle
        "course_view", "course_enroll", "course_complete",
        // Video engagement
        "video_start", "video_pause", "video_seek", "video_complete",
        "video_progress",          // heartbeat every 30 s
        // Recommendation funnel
        "recommendation_shown", "recommendation_clicked",
        // Content actions
        "rating_submitted", "review_submitted", "cart_add", "cart_remove",
        // AI interactions
        "ai_chat_sent", "ai_describe_used",
        // Auth
        "signup", "login", "logout",
      ],
      index: true,
    },

    // ---------- Context ----------
    payload: {
      courseId:    mongoose.Schema.Types.ObjectId,
      sectionId:   mongoose.Schema.Types.ObjectId,
      subSectionId:mongoose.Schema.Types.ObjectId,
      searchQuery: String,
      videoProgress: Number,   // 0-100 %
      durationWatched: Number, // seconds
      rating: Number,
      source: String,          // "recommendation", "search", "catalog", "direct"
      referrer: String,
      // recommendation context
      recommendationModel: String,   // "ncf" | "popularity-fallback"
      recommendationRank: Number,
      // generic extra data (avoid querying on this)
      extra: mongoose.Schema.Types.Mixed,
    },

    // ---------- Client ----------
    ip:        String,
    userAgent: String,
    country:   String,

    // ---------- Time ----------
    // createdAt added by timestamps:true
  },
  {
    timestamps: true,
    // TTL: auto-delete raw events after 90 days to keep collection lean
    // (aggregated daily summaries are kept in DailySummary collection)
    expireAfterSeconds: 7_776_000,
  }
);

// Compound index used by most analytics queries
platformEventSchema.index({ eventType: 1, createdAt: -1 });
platformEventSchema.index({ userId: 1, eventType: 1, createdAt: -1 });
platformEventSchema.index({ "payload.courseId": 1, eventType: 1, createdAt: -1 });

const PlatformEvent = mongoose.model("PlatformEvent", platformEventSchema);

// ── Daily summary model (pre-aggregated by the nightly ETL job) ───────────
const dailySummarySchema = new mongoose.Schema({
  date:        { type: String, unique: true }, // "YYYY-MM-DD"
  pageViews:   Number,
  uniqueUsers: Number,
  enrollments: Number,
  videoWatches:Number,
  totalWatchSeconds: Number,
  searches:    Number,
  aiChats:     Number,
  topCourses:  [{ courseId: mongoose.Schema.Types.ObjectId, views: Number }],
  topSearches: [{ query: String, count: Number }],
  generatedAt: { type: Date, default: Date.now },
});

const DailySummary = mongoose.model("DailySummary", dailySummarySchema);

module.exports = { PlatformEvent, DailySummary };
