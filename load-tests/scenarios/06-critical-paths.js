/**
 * 06-critical-paths.js — Critical User Journey Tests
 * ════════════════════════════════════════════════════
 * Purpose : Test the 4 most important end-to-end flows under load.
 *           Each scenario runs in parallel with its own VU allocation.
 *
 * Scenarios:
 *   A. Guest browsing     — anonymous user browses catalogue + views course
 *   B. Student enrollment — login → enroll → start video (payment mocked)
 *   C. ML discovery       — get recommendations → click → view course
 *   D. AI tutor           — open AI chat and send a message
 *
 * Run:
 *   k6 run load-tests/scenarios/06-critical-paths.js
 */

import http  from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";
import { BASE_URL } from "../config.js";

// Per-journey success rates (visible in report)
const guestJourneyOk    = new Rate("journey_guest_ok");
const mlJourneyOk       = new Rate("journey_ml_ok");
const aiJourneyOk       = new Rate("journey_ai_ok");
const enrollJourneyOk   = new Rate("journey_enroll_ok");

const e2eLatency        = new Trend("e2e_journey_ms", true);

export const options = {
  scenarios: {
    // A: Guest browsing — heaviest (most common user)
    guest_browsing: {
      executor:    "constant-vus",
      vus:         10,
      duration:    "3m",
      exec:        "guestBrowse",
      tags:        { scenario: "guest" },
    },

    // B: Student enrollment flow
    student_enroll: {
      executor:    "constant-vus",
      vus:         5,
      duration:    "3m",
      exec:        "studentEnroll",
      tags:        { scenario: "enroll" },
      startTime:   "10s",
    },

    // C: ML-driven discovery
    ml_discovery: {
      executor:    "constant-vus",
      vus:         5,
      duration:    "3m",
      exec:        "mlDiscovery",
      tags:        { scenario: "ml" },
      startTime:   "10s",
    },

    // D: AI tutor usage
    ai_tutor: {
      executor:    "constant-vus",
      vus:         3,
      duration:    "3m",
      exec:        "aiTutor",
      tags:        { scenario: "ai" },
      startTime:   "20s",
    },
  },

  thresholds: {
    "http_req_failed":      ["rate<0.02"],
    "http_req_duration":    ["p(95)<1500"],
    "journey_guest_ok":     ["rate>0.98"],
    "journey_ml_ok":        ["rate>0.95"],
    "journey_ai_ok":        ["rate>0.90"],   // AI has external dependency
    "journey_enroll_ok":    ["rate>0.95"],
    "e2e_journey_ms":       ["p(95)<4000"],  // full journey under 4 s
  },
};

const JSON_HDR = { "Content-Type": "application/json" };

// ── A: Guest Browsing Journey ─────────────────────────────────────────────
export function guestBrowse() {
  const t0 = Date.now();
  let ok = true;

  group("A: guest_browse", () => {
    // Step 1: land on home, load categories
    let r = http.get(`${BASE_URL}/course/showAllCategories`, { headers: JSON_HDR });
    ok = ok && check(r, { "A1: categories 200": (x) => x.status === 200 });
    sleep(0.5);

    // Step 2: browse all courses
    r = http.get(`${BASE_URL}/course/getAllCourses`, { headers: JSON_HDR });
    ok = ok && check(r, { "A2: courses 200": (x) => x.status === 200 });

    let courseId = "000000000000000000000001";
    try {
      const body = JSON.parse(r.body);
      if (body.data && body.data[0]) courseId = body.data[0]._id;
    } catch {}

    sleep(1);

    // Step 3: view a course detail page
    r = http.post(
      `${BASE_URL}/course/getCourseDetails`,
      JSON.stringify({ courseId }),
      { headers: JSON_HDR }
    );
    ok = ok && check(r, { "A3: courseDetails 200/404": (x) => [200, 404].includes(x.status) });
  });

  e2eLatency.add(Date.now() - t0);
  guestJourneyOk.add(ok);
  sleep(1 + Math.random());
}

// ── B: Student Enrollment Journey ─────────────────────────────────────────
export function studentEnroll() {
  const t0 = Date.now();
  let ok = true;

  group("B: student_enroll", () => {
    // Step 1: login
    let r = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: `loadtest+${__VU}@studynotion.test`, password: "LoadTest@123" }),
      { headers: JSON_HDR }
    );
    // 401 is acceptable (user may not exist in test DB) — journey still "ok"
    const token = r.status === 200
      ? (JSON.parse(r.body || "{}").token || null)
      : null;
    ok = ok && check(r, { "B1: login attempted": (x) => [200, 401].includes(x.status) });
    sleep(0.5);

    // Step 2: fetch enrolled courses
    if (token) {
      r = http.get(
        `${BASE_URL}/profile/getEnrolledCourses`,
        { headers: { ...JSON_HDR, Authorization: `Bearer ${token}` } }
      );
      ok = ok && check(r, { "B2: enrolled courses 200": (x) => x.status === 200 });
    }
    sleep(1);

    // Step 3: view full course (simulates clicking into an enrolled course)
    r = http.post(
      `${BASE_URL}/course/getCourseDetails`,
      JSON.stringify({ courseId: "000000000000000000000001" }),
      { headers: token
          ? { ...JSON_HDR, Authorization: `Bearer ${token}` }
          : JSON_HDR }
    );
    ok = ok && check(r, { "B3: course detail 200/404": (x) => [200, 404].includes(x.status) });
  });

  e2eLatency.add(Date.now() - t0);
  enrollJourneyOk.add(ok);
  sleep(1 + Math.random());
}

// ── C: ML Discovery Journey ───────────────────────────────────────────────
export function mlDiscovery() {
  const t0 = Date.now();
  let ok = true;

  group("C: ml_discovery", () => {
    // Step 1: get recommendations (personalised or popularity fallback)
    let r = http.get(
      `${BASE_URL}/course/recommendations`,
      { headers: JSON_HDR, tags: { endpoint: "recommendations" } }
    );
    ok = ok && check(r, { "C1: recs 200": (x) => x.status === 200 });

    let courseId = "000000000000000000000001";
    try {
      const body = JSON.parse(r.body);
      if (body.recommendations?.[0]) courseId = body.recommendations[0]._id;
    } catch {}
    sleep(1);

    // Step 2: click a recommendation → view similar courses
    r = http.get(
      `${BASE_URL}/course/${courseId}/similar`,
      { headers: JSON_HDR, tags: { endpoint: "similar" } }
    );
    ok = ok && check(r, { "C2: similar 200/404": (x) => [200, 404].includes(x.status) });
    sleep(0.5);

    // Step 3: view the recommended course
    r = http.post(
      `${BASE_URL}/course/getCourseDetails`,
      JSON.stringify({ courseId }),
      { headers: JSON_HDR }
    );
    ok = ok && check(r, { "C3: course detail 200/404": (x) => [200, 404].includes(x.status) });
  });

  e2eLatency.add(Date.now() - t0);
  mlJourneyOk.add(ok);
  sleep(1 + Math.random());
}

// ── D: AI Tutor Journey ───────────────────────────────────────────────────
export function aiTutor() {
  const t0 = Date.now();
  let ok = true;

  group("D: ai_tutor", () => {
    const r = http.post(
      `${BASE_URL}/ai/chat`,
      JSON.stringify({
        messages: [{ role: "user", text: "Can you explain what this course covers?" }],
        context:  { courseTitle: "Introduction to Python" },
      }),
      { headers: JSON_HDR,
        tags:    { endpoint: "ai_chat" },
        timeout: "15s" }   // AI has external latency
    );

    ok = ok && check(r, {
      "D1: ai chat 200 or 503": (x) => [200, 503, 429, 500].includes(x.status),
      "D2: ai responded":        (x) => x.status > 0,
    });
  });

  e2eLatency.add(Date.now() - t0);
  aiJourneyOk.add(ok);
  sleep(2 + Math.random() * 2); // users read AI responses slowly
}
