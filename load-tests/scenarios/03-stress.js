// 03-stress.js — StudyNotion Stress Test (breaking point)
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.2'],
    http_req_duration: ['p(95)<5000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api/v1';

export default function () {
  const res = http.get(`${BASE_URL}/course/getAllCourses`);
  check(res, {
    'status is not 5xx': (r) => r.status < 500,
  });
  sleep(0.5);
}
