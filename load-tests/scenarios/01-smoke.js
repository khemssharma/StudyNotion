// 01-smoke.js — StudyNotion Smoke Test
// Quick sanity check: verifies the server is up and key endpoints respond.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.1'],
    http_req_duration: ['p(95)<3000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api/v1';

export default function () {
  // Health check
  const healthRes = http.get(`${BASE_URL.replace('/api/v1', '')}/`);
  check(healthRes, {
    'server is up': (r) => r.status < 500,
  });

  // Courses listing
  const coursesRes = http.get(`${BASE_URL}/course/getAllCourses`);
  check(coursesRes, {
    'courses endpoint responds': (r) => r.status < 500,
  });

  sleep(1);
}
