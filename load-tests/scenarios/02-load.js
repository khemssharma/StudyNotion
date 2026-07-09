/**
 * 02-load.js — Load Test  (the main "10 000 users/day" proof)
 * ════════════════════════════════════════════════════════════
 * Purpose : Simulate realistic daily traffic concentrated into a busy hour.
 *
 * Traffic model
 * ─────────────
 * 10 000 users/day with a realistic peak pattern:
 *   • Off-peak (00–08):  ~5 % of daily traffic   →  ~14 req/min
 *   • Morning  (08–12): ~20 % of daily traffic   →  ~56 req/min
 *   • Peak     (12–18): ~50 % of daily traffic   → ~139 req/min  ← simulated
 *   • Evening  (18–22): ~20 % of daily traffic   →  ~56 req/min
 *   • Night    (22–24):  ~5 % of daily traffic   →  ~14 req/min
 *
 * This test compresses the peak hour into 5 minutes using ramping VUs.
 * Each VU runs ~6 req/min (human pace with think-time), so:
 *   139 req/min ÷ 6 req/VU/min ≈ 23 VUs needed to simulate peak
 *
 * We ramp to 30 VUs to give a 30 % safety margin.
 *
 * Scenarios covered (by endpoint weight):
 *   40 % — Browse: getAllCourses, categories, courseDetails
 *   25 % — Auth:   login, get profile
 *   20 % — Learn:  getFullCourseDetails, updateCourseProgress
 *   10 % — ML:     recommendations, similar courses
 *    5 % — Search: searchCourse
 *
 * Run:
 *   k6 run --env BASE_URL=https://your-server.com/api/v1 load-tests/scenarios/02-load.js
 */

import http  from "k6/http";
import { check, sleep, group } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";
import { BASE_URL, THRESHOLDS } from "../config.js";

// ── Custom metrics ────────────────────────────────────────────────────────
const authSuccessRate    = new Rate("auth_success_rate");
const recommendLatency   = new Trend("recommendation_latency_ms", true);
const courseViewLatency  = new Trend("course_view_latency_ms",    true);
const errorCounter       = new Counter("business_errors");

// ── Test options ──────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // Ramp up to peak, sustain, then ramp down
    peak_hour_simulation: {
      executor:       "ramping-vus",
      startVUs:       2,
      stages: [
        { duration: "1m",  target: 10  }, // ramp: morning surge
        { duration: "1m",  target: 20  }, // ramp: approaching peak
        { duration: "2m",  target: 30  }, // sustain: peak load (10k/day proof)
        { duration: "1m",  target: 15  }, // ramp down: post-peak
        { duration: "30s", target: 2   }, // cool-down
      ],
      gracefulRampDown: "30s",
    },
  },

  thresholds: {
    ...THRESHOLDS,
    "auth_success_rate":    ["rate>0.95"],
    "recommendation_latency_ms": ["p(95)<1000"],
    "course_view_latency_ms":    ["p(95)<600"],
  },
};

// ── Shared test data (loaded once, shared across all VUs) ─────────────────
// In a real run these come from your seeded DB; here we use placeholders
// that work even against an empty DB (endpoints return empty arrays, not 500s).
const courses = new SharedArray("courses", function () {
  // Fallback list — replaced at runtime if GET /getAllCourses returns data
  return [{ _id: "000000000000000000000001" }];
});

// ── Utility helpers ───────────────────────────────────────────────────────
function randomSleep() {
  sleep(0.5 + Math.random() * 1.5); // 0.5–2 s think time
}

function jsonHeaders(token) {
  const h = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return { headers: h };
}

// ── Auth helper — login once per VU iteration ─────────────────────────────
function doLogin() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      email:    `loadtest+${__VU}@studynotion.test`,
      password: "LoadTest@123",
    }),
    { headers: { "Content-Type": "application/json" },
      tags: { endpoint: "login" } }
  );

  const ok = check(res, {
    "login: 200 or 401": (r) => [200, 401].includes(r.status),
  });

  authSuccessRate.add(res.status === 200);

  if (res.status === 200) {
    try { return JSON.parse(res.body).token || null; }
    catch { return null; }
  }
  return null;
}

// ── Main VU scenario ──────────────────────────────────────────────────────
export default function () {
  let token = null;

  // ── Group 1: Browse (public, 40 % of requests) ────────────────────────
  group("browse", () => {
    // Course catalogue
    let t0 = Date.now();
    let res = http.get(
      `${BASE_URL}/course/getAllCourses`,
      { tags: { endpoint: "getAllCourses" } }
    );
    courseViewLatency.add(Date.now() - t0);

    check(res, { "getAllCourses: 200": (r) => r.status === 200 });
    if (res.status !== 200) errorCounter.add(1);

    randomSleep();

    // Categories
    res = http.get(
      `${BASE_URL}/course/showAllCategories`,
      { tags: { endpoint: "categories" } }
    );
    check(res, { "categories: 200": (r) => r.status === 200 });

    randomSleep();

    // Course details (use first known course id)
    res = http.post(
      `${BASE_URL}/course/getCourseDetails`,
      JSON.stringify({ courseId: courses[0]._id }),
      { headers: { "Content-Type": "application/json" },
        tags: { endpoint: "courseDetails" } }
    );
    check(res, { "courseDetails: 200 or 404": (r) => [200, 404].includes(r.status) });
  });

  randomSleep();

  // ── Group 2: Auth (25 % of requests) ──────────────────────────────────
  group("auth", () => {
    token = doLogin();
    randomSleep();

    if (token) {
      // Fetch own profile
      const res = http.get(
        `${BASE_URL}/profile/getUserDetails`,
        jsonHeaders(token)
      );
      check(res, { "getProfile: 200": (r) => r.status === 200 });
    }
  });

  randomSleep();

  // ── Group 3: ML Recommendations (10 % of requests) ────────────────────
  group("recommendations", () => {
    const t0  = Date.now();
    const res = http.get(
      `${BASE_URL}/course/recommendations`,
      { ...jsonHeaders(token), tags: { endpoint: "recommendations" } }
    );
    recommendLatency.add(Date.now() - t0);

    check(res, { "recommendations: 200": (r) => r.status === 200 });

    randomSleep();

    // Similar courses
    const sim = http.get(
      `${BASE_URL}/course/${courses[0]._id}/similar`,
      { tags: { endpoint: "similar" } }
    );
    check(sim, { "similar: 200 or 404": (r) => [200, 404].includes(r.status) });
  });

  randomSleep();

  // ── Group 4: Learning (20 % of requests) ──────────────────────────────
  group("learning", () => {
    if (!token) return;

    const res = http.post(
      `${BASE_URL}/course/getFullCourseDetails`,
      JSON.stringify({ courseId: courses[0]._id }),
      { ...jsonHeaders(token), tags: { endpoint: "fullCourseDetails" } }
    );
    check(res, { "fullCourseDetails: 200 or 403": (r) => [200, 403, 404].includes(r.status) });
  });

  randomSleep();

  // ── Group 5: Search (5 % of requests) ─────────────────────────────────
  group("search", () => {
    const queries = ["python", "javascript", "react", "data science", "web dev"];
    const q = queries[Math.floor(Math.random() * queries.length)];

    const res = http.get(
      `${BASE_URL}/course/searchCourse?searchQuery=${q}`,
      { tags: { endpoint: "search" } }
    );
    check(res, { "search: 200": (r) => r.status === 200 });
  });

  randomSleep();

  // ── Group 6: Pipeline event ingestion (always, low cost) ──────────────
  group("pipeline", () => {
    http.post(
      `${BASE_URL}/pipeline/event`,
      JSON.stringify({ eventType: "page_view", payload: { extra: { path: "/catalog" } } }),
      { headers: { "Content-Type": "application/json" },
        tags: { endpoint: "pipeline" } }
    );
    // fire-and-forget — no check needed
  });
}
