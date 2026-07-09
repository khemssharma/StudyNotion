/**
 * config.js — Shared configuration for all load test scenarios
 *
 * Edit BASE_URL before running to point at your environment:
 *   LOCAL:      http://localhost:4000/api/v1
 *   STAGING:    https://studynotion-staging.onrender.com/api/v1
 *   PRODUCTION: https://studynotion-oylf.onrender.com/api/v1
 */

export const BASE_URL = __ENV.BASE_URL || "http://localhost:4000/api/v1";

// ── Thresholds — what "passing" looks like for stakeholders ───────────────
// These are the SLA targets that appear as PASS/FAIL in the HTML report.
export const THRESHOLDS = {
  // 95th-percentile response time under 800 ms for all requests
  http_req_duration: ["p(95)<800", "p(99)<2000"],

  // Error rate must stay below 1%
  http_req_failed: ["rate<0.01"],

  // Throughput: at least 12 req/s sustained (= ~1M req/day headroom)
  http_reqs: ["rate>12"],

  // Custom business metric — recommendation endpoint specifically
  "http_req_duration{endpoint:recommendations}": ["p(95)<1000"],

  // Auth endpoints
  "http_req_duration{endpoint:login}": ["p(95)<500"],
};

// ── Test user pool (seeded by seed-data.js before tests run) ─────────────
// k6 shares this across VUs via SharedArray
export const TEST_STUDENT_EMAIL    = "loadtest.student@studynotion.test";
export const TEST_STUDENT_PASSWORD = "LoadTest@123";
export const TEST_COURSE_ID        = __ENV.TEST_COURSE_ID || "000000000000000000000001";

// ── Realistic think-time ranges (ms) — makes load pattern human-like ─────
export const THINK_TIME = { min: 500, max: 2000 };
