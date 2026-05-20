/**
 * 04-spike.js — Spike Test
 * ════════════════════════
 * Purpose : Simulate a sudden viral spike (e.g. a course goes viral on
 *           social media, or a flash sale begins). Tests auto-recovery.
 *
 * Pattern : 2 VUs → instant jump to 100 VUs → back to 5 VUs
 *           Measures how fast the system recovers after the spike.
 *
 * Run:
 *   k6 run load-tests/scenarios/04-spike.js
 */

import http  from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { BASE_URL } from "../config.js";

const recoveryTime = new Trend("post_spike_latency_ms", true);

export const options = {
  scenarios: {
    spike: {
      executor: "ramping-vus",
      stages: [
        { duration: "30s", target: 2   }, // baseline
        { duration: "10s", target: 100 }, // SPIKE — instant surge
        { duration: "1m",  target: 100 }, // sustain spike for 1 min
        { duration: "10s", target: 2   }, // drop back
        { duration: "1m",  target: 2   }, // recovery observation
      ],
    },
  },

  thresholds: {
    "http_req_failed":   ["rate<0.10"],        // allow 10 % errors during spike
    "http_req_duration": ["p(95)<3000"],       // p95 < 3 s during spike
    "post_spike_latency_ms": ["p(95)<800"],    // must recover to normal after spike
  },
};

let spikePhaseOver = false;

export default function () {
  const res = http.get(
    `${BASE_URL}/course/getAllCourses`,
    { tags: { endpoint: "spike_catalog" } }
  );

  check(res, {
    "spike: responded": (r) => r.status > 0,
    "spike: not 500":   (r) => r.status < 500,
  });

  // Track recovery latency after the spike (rough heuristic: after 90s total)
  if (__ITER > 50 && __VU <= 5) {
    recoveryTime.add(res.timings.duration);
  }

  sleep(0.2 + Math.random() * 0.3);
}
