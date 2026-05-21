// 05-soak.js — StudyNotion Soak Test (30 min endurance)
import http from 'k6/http';
import { check, sleep } from 'k6';

const DURATION = __ENV.SOAK_DURATION || '30m';

export const options = {
  stages: [
    { duration: '2m', target: 10 },
    { duration: DURATION, target: 10 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api/v1';

export default function () {
  const res = http.get(`${BASE_URL}/course/getAllCourses`);
  check(res, {
    'status is ok': (r) => r.status < 500,
  });
  sleep(2);
}
