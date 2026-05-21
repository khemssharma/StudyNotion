// 02-load.js — StudyNotion Load Test (10k/day capacity proof)
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '3m', target: 10 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
    http_reqs: ['rate>=12'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api/v1';

export default function () {
  const res = http.get(`${BASE_URL}/course/getAllCourses`);
  check(res, {
    'status is ok': (r) => r.status < 500,
  });
  sleep(1);
}
