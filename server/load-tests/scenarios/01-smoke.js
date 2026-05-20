/**
 * 01-smoke.js — Smoke Test
 * ════════════════════════
 * Purpose : Verify the server is alive and all critical endpoints respond
 *           before running heavier tests. Run this first.
 *
 * Load    : 1 virtual user, 30 seconds
 * Pass if : No errors, all responses 2xx
 *
 * Run:
 *   k6 run load-tests/scenarios/01-smoke.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_URL, THRESHOLDS } from "../config.js";

export const options = {
  vus:      1,
  duration: "30s",
  thresholds: {
    http_req_failed:   ["rate<0.01"],
    http_req_duration: ["p(95)<2000"],
  },
};

export default function () {
  const params = { headers: { "Content-Type": "application/json" } };

  // 1. Health check
  let res = http.get(`${BASE_URL.replace("/api/v1", "")}/`, params);
  check(res, { "health: status 200": (r) => r.status === 200 });

  sleep(0.5);

  // 2. Get all courses (public, no auth)
  res = http.get(`${BASE_URL}/course/getAllCourses`, params);
  check(res, {
    "getAllCourses: status 200":     (r) => r.status === 200,
    "getAllCourses: has data":        (r) => {
      try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; }
    },
  });

  sleep(0.5);

  // 3. Show all categories (public)
  res = http.get(`${BASE_URL}/course/showAllCategories`, params);
  check(res, { "categories: status 200": (r) => r.status === 200 });

  sleep(0.5);

  // 4. Recommendations endpoint (public/optional-auth)
  res = http.get(`${BASE_URL}/course/recommendations`, params);
  check(res, { "recommendations: status 200 or 404": (r) => [200, 404].includes(r.status) });

  sleep(1);
}
