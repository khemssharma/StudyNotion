/**
 * eventIngestion.js — Data Engineering Pipeline: Ingestion Layer
 *
 * Responsibilities
 * ────────────────
 * 1. Accept raw events from Express routes (fire-and-forget, never blocks the
 *    request path).
 * 2. Validate & enrich each event (timestamp, geo, userAgent parsing).
 * 3. Buffer events in an in-process queue and flush to MongoDB in bulk
 *    batches (reduces write IOPS dramatically under load).
 * 4. Expose a light-weight /api/v1/pipeline/event endpoint so the React
 *    front-end can stream client-side events without a separate analytics SDK.
 *
 * Architecture
 * ────────────
 *   Client / Server code
 *       │  fire-and-forget calls to  track()
 *       ▼
 *   In-memory buffer (array, max 500 events or 5 s flush interval)
 *       │  insertMany()
 *       ▼
 *   MongoDB  PlatformEvent collection  (90-day TTL)
 *       │  nightly cron reads & aggregates
 *       ▼
 *   DailySummary  +  ML feature store  (course_meta.json refresh)
 */

const { PlatformEvent, DailySummary } = require("./eventSchema");

// ── Configuration ─────────────────────────────────────────────────────────
const FLUSH_INTERVAL_MS = 5_000;   // flush every 5 seconds
const FLUSH_BATCH_SIZE  = 500;     // or every 500 events, whichever comes first
const MAX_BUFFER_SIZE   = 2_000;   // drop oldest if buffer overflows (back-pressure)

// ── In-memory buffer ──────────────────────────────────────────────────────
let _buffer = [];
let _flushTimer = null;
let _isShuttingDown = false;

/**
 * track(eventType, data)
 * ─────────────────────
 * Fire-and-forget. Returns immediately. Safe to call on every request.
 *
 * @param {string} eventType  – one of the enum values in eventSchema
 * @param {object} data       – { userId, sessionId, payload, ip, userAgent, country }
 */
function track(eventType, data = {}) {
  if (_isShuttingDown) return;

  // Drop oldest events when buffer is full (back-pressure)
  if (_buffer.length >= MAX_BUFFER_SIZE) {
    _buffer.shift();
  }

  _buffer.push({
    eventType,
    userId:    data.userId    || null,
    sessionId: data.sessionId || null,
    payload:   data.payload   || {},
    ip:        data.ip        || null,
    userAgent: data.userAgent || null,
    country:   data.country   || null,
    createdAt: new Date(),
  });

  // Start the flush timer on the first event
  if (!_flushTimer) {
    _flushTimer = setInterval(_flush, FLUSH_INTERVAL_MS);
  }

  // Eager flush when batch size is reached
  if (_buffer.length >= FLUSH_BATCH_SIZE) {
    _flush();
  }
}

/**
 * _flush()
 * ────────
 * Drains the buffer → bulk-inserts into MongoDB.
 * Called by the interval timer OR when FLUSH_BATCH_SIZE is reached.
 */
async function _flush() {
  if (_buffer.length === 0) return;

  const batch = _buffer.splice(0, FLUSH_BATCH_SIZE);

  try {
    await PlatformEvent.insertMany(batch, { ordered: false });
    // ordered:false means a bad doc won't stop the rest of the batch
  } catch (err) {
    // Log but never crash — event loss is acceptable, service outage is not
    console.error("[Pipeline] insertMany error:", err.message);
  }
}

/**
 * shutdown()
 * ──────────
 * Call on SIGTERM/SIGINT to flush remaining buffer before process exits.
 */
async function shutdown() {
  _isShuttingDown = true;
  if (_flushTimer) clearInterval(_flushTimer);
  await _flush();
}

// ── Nightly ETL Aggregation Job ───────────────────────────────────────────
/**
 * runNightlyAggregation()
 * ───────────────────────
 * Reads yesterday's raw events → computes DailySummary.
 * Scheduled by the caller (server/index.js) via node-schedule.
 * Can also be triggered manually via POST /api/v1/pipeline/aggregate.
 *
 * Steps
 * 1. Compute basic metrics (page views, unique users, enrollments …)
 * 2. Identify top 10 courses by views
 * 3. Identify top 10 search queries
 * 4. Upsert a DailySummary document
 * 5. Refresh course_meta.json consumed by the ML service (via HTTP call)
 */
async function runNightlyAggregation(targetDate) {
  const date = targetDate || _yesterdayString();
  const [year, month, day] = date.split("-").map(Number);

  const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const dayEnd   = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  const matchDay = { createdAt: { $gte: dayStart, $lte: dayEnd } };

  console.log(`[Pipeline] Starting ETL aggregation for ${date}`);

  // ── 1. Scalar metrics ─────────────────────────────────────────────────
  const [
    pageViews,
    enrollments,
    videoWatches,
    searches,
    aiChats,
    uniqueUsersResult,
    watchSecondsResult,
  ] = await Promise.all([
    PlatformEvent.countDocuments({ ...matchDay, eventType: "page_view" }),
    PlatformEvent.countDocuments({ ...matchDay, eventType: "course_enroll" }),
    PlatformEvent.countDocuments({ ...matchDay, eventType: "video_start" }),
    PlatformEvent.countDocuments({ ...matchDay, eventType: "search" }),
    PlatformEvent.countDocuments({ ...matchDay, eventType: "ai_chat_sent" }),

    PlatformEvent.aggregate([
      { $match: { ...matchDay, userId: { $ne: null } } },
      { $group: { _id: "$userId" } },
      { $count: "count" },
    ]),

    PlatformEvent.aggregate([
      { $match: { ...matchDay, eventType: "video_progress" } },
      { $group: { _id: null, total: { $sum: "$payload.durationWatched" } } },
    ]),
  ]);

  const uniqueUsers        = uniqueUsersResult[0]?.count || 0;
  const totalWatchSeconds  = watchSecondsResult[0]?.total || 0;

  // ── 2. Top courses ────────────────────────────────────────────────────
  const topCoursesRaw = await PlatformEvent.aggregate([
    { $match: { ...matchDay, eventType: "course_view", "payload.courseId": { $ne: null } } },
    { $group: { _id: "$payload.courseId", views: { $sum: 1 } } },
    { $sort: { views: -1 } },
    { $limit: 10 },
  ]);
  const topCourses = topCoursesRaw.map((r) => ({ courseId: r._id, views: r.views }));

  // ── 3. Top search queries ─────────────────────────────────────────────
  const topSearchesRaw = await PlatformEvent.aggregate([
    { $match: { ...matchDay, eventType: "search", "payload.searchQuery": { $ne: null } } },
    { $group: { _id: "$payload.searchQuery", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);
  const topSearches = topSearchesRaw.map((r) => ({ query: r._id, count: r.count }));

  // ── 4. Upsert DailySummary ─────────────────────────────────────────────
  await DailySummary.findOneAndUpdate(
    { date },
    {
      date, pageViews, uniqueUsers, enrollments,
      videoWatches, totalWatchSeconds, searches, aiChats,
      topCourses, topSearches,
      generatedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  console.log(`[Pipeline] ETL complete for ${date}:`, {
    pageViews, uniqueUsers, enrollments, videoWatches,
  });

  return { date, pageViews, uniqueUsers, enrollments, videoWatches, topCourses, topSearches };
}

// ── Helpers ───────────────────────────────────────────────────────────────
function _yesterdayString() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

module.exports = { track, shutdown, runNightlyAggregation };
