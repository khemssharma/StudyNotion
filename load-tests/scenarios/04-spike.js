// 04-spike.js — StudyNotion Spike Test (viral surge)
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 200 },
    { duration: '30s', target: 5 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.3'],
    http_req_duration: ['p(95)<5000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api/v1';

export default function () {
  const res = http.get(`${BASE_URL}/course/getAllCourses`);
  check(res, {
    'status is not 5xx': (r) => r.status < 500,
  });
  sleep(0.3);
}
