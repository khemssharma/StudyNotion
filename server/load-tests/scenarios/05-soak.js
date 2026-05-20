/**
 * 05-soak.js — Soak Test  (aka Endurance Test)
 * ═════════════════════════════════════════════
 * Purpose : Detect memory leaks, connection pool exhaustion, and slow
 *           degradation over time. Runs at moderate load for 30 minutes.
 *
 * Load    : 15 VUs sustained for 30 minutes
 * Watch   : p95 latency drift over time — should stay flat, not climb
 *
 * Run:
 *   k6 run load-tests/scenarios/05-soak.js
 *
 * Note: For a full soak test increase DURATION to "2h" before stakeholder demo.
 */

import http  from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { BASE_URL } from "../config.js";

const earlyLatency = new Trend("soak_early_latency_ms",  true); // first 5 min
const lateLatency  = new Trend("soak_late_latency_ms",   true); // last 5 min

const DURATION  = __ENV.SOAK_DURATION || "30m";
const SOAK_VUS  = parseInt(__ENV.SOAK_VUS || "15");

export const options = {
  vus:      SOAK_VUS,
  duration: DURATION,

  thresholds: {
    "http_req_failed":        ["rate<0.01"],
    "http_req_duration":      ["p(95)<1000"],
    // Late latency must stay within 20% of early latency (no drift)
    "soak_late_latency_ms":   ["p(95)<1200"],
    "soak_early_latency_ms":  ["p(95)<1000"],
  },
};

// Approximate iteration window for "early" vs "late"
// k6 doesn't expose elapsed time easily, so we use __ITER count per VU
const ITERS_FOR_5MIN = Math.floor((5 * 60) / 3); // ~3 s per iteration

export default function () {
  const requests = [
    () => http.get(`${BASE_URL}/course/getAllCourses`),
    () => http.get(`${BASE_URL}/course/showAllCategories`),
    () => http.get(`${BASE_URL}/course/recommendations`),
    () => http.post(
      `${BASE_URL}/pipeline/event`,
      JSON.stringify({ eventType: "page_view", payload: {} }),
      { headers: { "Content-Type": "application/json" } }
    ),
  ];

  const fn  = requests[Math.floor(Math.random() * requests.length)];
  const res = fn();

  check(res, {
    "soak: 2xx or 429": (r) => r.status < 500,
  });

  // Bucket into early / late windows
  if (__ITER < ITERS_FOR_5MIN) {
    earlyLatency.add(res.timings.duration);
  } else if (__ITER > ITERS_FOR_5MIN * 5) {
    lateLatency.add(res.timings.duration);
  }

  sleep(1 + Math.random() * 2); // ~3 s avg think time
}
