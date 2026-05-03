import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const port = __ENV.PORT || '8000';
const runtime = (__ENV.RUNTIME || 'host').toLowerCase();
const defaultBaseUrl =
  runtime === 'docker'
    ? `http://host.docker.internal:${port}`
    : `http://localhost:${port}`;
const baseUrl = __ENV.BASE_URL || defaultBaseUrl;

export const options = {
  scenarios: {
    frames_list: {
      executor: 'ramping-vus',
      startVUs: 50,
      stages: [
        { duration: '30s', target: 200 },
        { duration: '30s', target: 350 },
        { duration: '30s', target: 500 },
        { duration: '60s', target: 500 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '20s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<100'],
    http_req_failed: ['rate<0.01'],
  },
};

export function setup() {
  const health = http.get(`${baseUrl}/api/v1/health`, { timeout: '10s' });
  if (health.status !== 200) {
    fail(
      `API is not reachable at ${baseUrl}. Ensure the app is running and healthy before starting k6.`,
    );
  }
}

export default function () {
  const response = http.get(`${baseUrl}/api/v1/frames?page=1&limit=20`, {
    timeout: '30s',
    headers: {
      'x-request-id': `k6-${__VU}-${__ITER}`,
    },
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response success true': (r) => {
      try {
        return r.json('success') === true;
      } catch (_) {
        return false;
      }
    },
  });

  sleep(0.2);
}
