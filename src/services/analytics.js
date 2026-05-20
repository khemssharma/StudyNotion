/**
 * analytics.js — Client-side Data Engineering Pipeline SDK
 *
 * Collects user behaviour events in the browser and sends them to the
 * StudyNotion pipeline endpoint in batches.  Designed to be:
 *   • Non-blocking  — never slows the UI
 *   • Resilient     — uses sendBeacon on page unload so events aren't lost
 *   • Privacy-safe  — no PII in the payload; userId comes from Redux auth state
 *
 * Usage
 * ──────
 *   import { trackEvent } from "../services/analytics";
 *
 *   // Fire-and-forget — returns immediately
 *   trackEvent("course_view",  { courseId: course._id, source: "catalog" });
 *   trackEvent("video_start",  { courseId, subSectionId });
 *   trackEvent("search",       { searchQuery: query });
 *   trackEvent("ai_chat_sent", {});
 */

import { PIPELINE_EVENT_API } from "./apis";

// ── Session ID (anonymous identifier for pre-login tracking) ──────────────
function getSessionId() {
  try {
    let sid = sessionStorage.getItem("sn_session_id");
    if (!sid) {
      sid = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      sessionStorage.setItem("sn_session_id", sid);
    }
    return sid;
  } catch {
    return "unknown";
  }
}

// ── Internal event buffer ──────────────────────────────────────────────────
const SESSION_ID    = getSessionId();
const FLUSH_MS      = 8_000;   // flush every 8 seconds
const MAX_BATCH     = 20;      // or every 20 events
const PIPELINE_URL  = PIPELINE_EVENT_API || `${process.env.REACT_APP_BASE_URL}/api/v1/pipeline/events`;

let _queue  = [];
let _timer  = null;
let _userId = null;   // set by setUserId() when auth state changes

/** Call from auth slice or Root component when user logs in/out */
export function setAnalyticsUserId(id) {
  _userId = id || null;
}

/** Queue a single event */
export function trackEvent(eventType, payload = {}) {
  _queue.push({ eventType, payload, sessionId: SESSION_ID });

  if (!_timer) {
    _timer = setTimeout(_flush, FLUSH_MS);
  }
  if (_queue.length >= MAX_BATCH) {
    _flush();
  }
}

/** Flush queue → POST to /api/v1/pipeline/events */
function _flush() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  if (_queue.length === 0) return;

  const batch  = _queue.splice(0, MAX_BATCH);
  const body   = JSON.stringify({ events: batch });
  const headers = {
    "Content-Type": "application/json",
    "x-session-id": SESSION_ID,
    ...(localStorage.getItem("token")
      ? { Authorization: `Bearer ${localStorage.getItem("token")}` }
      : {}),
  };

  // Use sendBeacon for page-unload events (guaranteed delivery)
  if (typeof navigator !== "undefined" && navigator.sendBeacon && document.hidden) {
    navigator.sendBeacon(PIPELINE_URL, body);
    return;
  }

  // Normal async fetch — fire and forget, never awaited in the UI
  fetch(PIPELINE_URL, { method: "POST", headers, body })
    .catch(() => {/* silently drop on network error */});
}

// ── Flush on page unload ──────────────────────────────────────────────────
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") _flush();
  });
  window.addEventListener("pagehide", _flush);
}

// ── Convenience wrappers ──────────────────────────────────────────────────

export const trackPageView = (path) =>
  trackEvent("page_view", { extra: { path } });

export const trackCourseView = (courseId, source = "direct") =>
  trackEvent("course_view", { courseId, source });

export const trackEnrollment = (courseId) =>
  trackEvent("course_enroll", { courseId });

export const trackVideoStart = (courseId, subSectionId) =>
  trackEvent("video_start", { courseId, subSectionId });

export const trackVideoProgress = (courseId, subSectionId, progress, durationWatched) =>
  trackEvent("video_progress", { courseId, subSectionId, videoProgress: progress, durationWatched });

export const trackSearch = (searchQuery) =>
  trackEvent("search", { searchQuery });

export const trackRecommendationClick = (courseId, rank, model) =>
  trackEvent("recommendation_clicked", { courseId, recommendationRank: rank, recommendationModel: model });

export const trackAIChat = () =>
  trackEvent("ai_chat_sent", {});
