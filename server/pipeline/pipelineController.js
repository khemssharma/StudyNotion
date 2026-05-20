/**
 * pipelineController.js — HTTP handlers for the Data Engineering Pipeline
 *
 * Routes (registered in server/index.js under /api/v1/pipeline):
 *   POST /event          – ingest a single client-side event
 *   POST /events         – ingest a batch of client-side events (up to 100)
 *   POST /aggregate      – manually trigger ETL aggregation for a given date
 *   GET  /summary        – retrieve DailySummary docs (last N days)
 *   GET  /funnel         – course enrollment funnel (view → enroll → complete)
 *   GET  /retention      – D1/D7/D30 user retention cohort
 */

const { track, runNightlyAggregation } = require("./eventIngestion");
const { PlatformEvent, DailySummary }  = require("./eventSchema");

// ── POST /api/v1/pipeline/event ───────────────────────────────────────────
exports.ingestEvent = (req, res) => {
  const { eventType, payload, sessionId } = req.body || {};

  if (!eventType) {
    return res.status(400).json({ success: false, message: "eventType is required" });
  }

  track(eventType, {
    userId:    req.user?.id   || null,
    sessionId: sessionId      || req.headers["x-session-id"] || null,
    payload:   payload        || {},
    ip:        req.ip,
    userAgent: req.headers["user-agent"],
  });

  return res.status(202).json({ success: true, message: "accepted" });
};

// ── POST /api/v1/pipeline/events  (batch) ────────────────────────────────
exports.ingestEvents = (req, res) => {
  const events = req.body?.events;
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ success: false, message: "events[] array is required" });
  }
  if (events.length > 100) {
    return res.status(400).json({ success: false, message: "Max 100 events per batch" });
  }

  const sessionId = req.headers["x-session-id"] || null;
  for (const e of events) {
    if (!e.eventType) continue;
    track(e.eventType, {
      userId:    req.user?.id   || null,
      sessionId: e.sessionId    || sessionId,
      payload:   e.payload      || {},
      ip:        req.ip,
      userAgent: req.headers["user-agent"],
    });
  }

  return res.status(202).json({ success: true, accepted: events.length });
};

// ── POST /api/v1/pipeline/aggregate  (admin only) ────────────────────────
exports.triggerAggregation = async (req, res) => {
  try {
    const { date } = req.body || {};  // optional "YYYY-MM-DD"
    const result = await runNightlyAggregation(date || undefined);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("[Pipeline] aggregation error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/v1/pipeline/summary?days=7 ──────────────────────────────────
exports.getSummaries = async (req, res) => {
  try {
    const days  = Math.min(parseInt(req.query.days || "7"), 90);
    const limit = days;

    const summaries = await DailySummary.find()
      .sort({ date: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({ success: true, data: summaries.reverse() });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/v1/pipeline/funnel?courseId=<id>&days=30 ───────────────────
exports.getCourseFunnel = async (req, res) => {
  try {
    const { courseId } = req.query;
    const days = Math.min(parseInt(req.query.days || "30"), 90);
    const since = new Date(Date.now() - days * 86_400_000);

    const baseMatch = {
      createdAt: { $gte: since },
      ...(courseId ? { "payload.courseId": require("mongoose").Types.ObjectId(courseId) } : {}),
    };

    const [views, enrolls, completes] = await Promise.all([
      PlatformEvent.countDocuments({ ...baseMatch, eventType: "course_view" }),
      PlatformEvent.countDocuments({ ...baseMatch, eventType: "course_enroll" }),
      PlatformEvent.countDocuments({ ...baseMatch, eventType: "course_complete" }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        period_days: days,
        funnel: [
          { stage: "Course Views",    count: views },
          { stage: "Enrollments",     count: enrolls,   rate: views   ? +(enrolls  / views   * 100).toFixed(1) : 0 },
          { stage: "Completions",     count: completes, rate: enrolls ? +(completes/ enrolls * 100).toFixed(1) : 0 },
        ],
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/v1/pipeline/retention ───────────────────────────────────────
exports.getRetention = async (req, res) => {
  try {
    // Simplified D1/D7/D30: users who signed up in the last 30 days and came
    // back at D+1, D+7, D+30
    const cohortStart = new Date(Date.now() - 30 * 86_400_000);

    const signups = await PlatformEvent.find({
      eventType: "signup",
      createdAt: { $gte: cohortStart },
      userId: { $ne: null },
    }).lean();

    const cohortUserIds = signups.map((s) => s.userId?.toString()).filter(Boolean);
    if (!cohortUserIds.length) {
      return res.status(200).json({ success: true, data: { cohortSize: 0, D1: 0, D7: 0, D30: 0 } });
    }

    // For each user, find their signup date then check activity at +1d, +7d, +30d
    const signupMap = {};
    for (const s of signups) {
      if (s.userId) signupMap[s.userId.toString()] = s.createdAt;
    }

    const activityDocs = await PlatformEvent.find({
      userId: { $in: signups.map((s) => s.userId) },
      eventType: { $in: ["page_view", "course_view", "video_start"] },
      createdAt: { $gte: cohortStart },
    }).select("userId createdAt").lean();

    let d1 = 0, d7 = 0, d30 = 0;
    const counted = { d1: new Set(), d7: new Set(), d30: new Set() };

    for (const ev of activityDocs) {
      const uid = ev.userId?.toString();
      if (!uid || !signupMap[uid]) continue;
      const diffDays = (ev.createdAt - signupMap[uid]) / 86_400_000;
      if (diffDays >= 0.5  && diffDays <  2  && !counted.d1.has(uid))  { d1++;  counted.d1.add(uid);  }
      if (diffDays >= 5.5  && diffDays <  9  && !counted.d7.has(uid))  { d7++;  counted.d7.add(uid);  }
      if (diffDays >= 27   && diffDays <  33 && !counted.d30.has(uid)) { d30++; counted.d30.add(uid); }
    }

    const n = cohortUserIds.length;
    return res.status(200).json({
      success: true,
      data: {
        cohortSize: n,
        D1:  +(d1  / n * 100).toFixed(1),
        D7:  +(d7  / n * 100).toFixed(1),
        D30: +(d30 / n * 100).toFixed(1),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
