/**
 * 03-stress.js — Stress Test
 * ══════════════════════════
 * Purpose : Find the breaking point by pushing well beyond the 10k/day target.
 *           Shows stakeholders that the system degrades gracefully (returns
 *           429 rate-limit responses) rather than crashing.
 *
 * Load    : Ramps from 30 → 150 VUs (5× the peak load target)
 * Pass if : Error rate stays below 5 % even at 5× load (most errors should
 *           be clean 429 rate-limit responses, not 500s)
 *
 * Run:
 *   k6 run load-tests/scenarios/03-stress.js
 */

import http  from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Counter } from "k6/metrics";
import { BASE_URL } from "../config.js";

const serverErrorRate    = new Rate("server_error_rate");   // 5xx — bad
const rateLimitedRate    = new Rate("rate_limited_rate");   // 429 — expected at stress
const gracefulDegradeOk  = new Rate("graceful_degrade_ok"); // 429 treated as "ok"

export const options = {
  scenarios: {
    stress: {
      executor: "ramping-vus",
      stages: [
        { duration: "1m",  target: 30  }, // baseline (normal peak)
        { duration: "1m",  target: 60  }, // 2× peak
        { duration: "1m",  target: 100 }, // 3.3× peak
        { duration: "1m",  target: 150 }, // 5× peak — stress zone
        { duration: "2m",  target: 150 }, // sustain stress
        { duration: "1m",  target: 30  }, // recovery ramp-down
        { duration: "30s", target: 0   }, // cool-down
      ],
    },
  },

  thresholds: {
    // Server errors (5xx) must stay below 5 % even under max stress
    "server_error_rate": ["rate<0.05"],

    // Overall p99 under 5 s even at 5× load (graceful degradation)
    "http_req_duration": ["p(99)<5000"],

    // Graceful degrade: 429s + 2xx together should be > 95 % of all responses
    "graceful_degrade_ok": ["rate>0.95"],
  },
};

export default function () {
  const endpoints = [
    { method: "GET",  url: `${BASE_URL}/course/getAllCourses` },
    { method: "GET",  url: `${BASE_URL}/course/showAllCategories` },
    { method: "GET",  url: `${BASE_URL}/course/recommendations` },
  ];

  const ep = endpoints[Math.floor(Math.random() * endpoints.length)];
  const res = http.get(ep.url, {
    headers: { "Content-Type": "application/json" },
    tags: { endpoint: "stress" },
  });

  const is5xx     = res.status >= 500;
  const is429     = res.status === 429;
  const is2xx     = res.status >= 200 && res.status < 300;

  serverErrorRate.add(is5xx);
  rateLimitedRate.add(is429);
  // Graceful = either served successfully OR correctly rate-limited (not crashed)
  gracefulDegradeOk.add(is2xx || is429);

  check(res, {
    "stress: not a 5xx": (r) => r.status < 500,
    "stress: responded":  (r) => r.status > 0,
  });

  sleep(0.1 + Math.random() * 0.4); // minimal think time — stress mode
}
