// 06-critical-paths.js — StudyNotion Critical User Journey Tests
import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
  vus: 5,
  duration: '2m',
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000/api/v1';

export default function () {
  group('Browse courses', () => {
    const res = http.get(`${BASE_URL}/course/getAllCourses`);
    check(res, {
      'courses listed': (r) => r.status < 500,
    });
  });

  group('Fetch categories', () => {
    const res = http.get(`${BASE_URL}/course/showAllCategories`);
    check(res, {
      'categories listed': (r) => r.status < 500,
    });
  });

  sleep(1);
}
