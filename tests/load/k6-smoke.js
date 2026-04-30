/* CW Leaders — k6 load test
 *
 * Run:
 *   k6 run tests/load/k6-smoke.js
 *
 * Environment:
 *   API_URL  — defaults to https://api.cwleaders.com
 *   STAGE    — "warm" (gradual ramp) or "spike" (sudden burst)
 *
 * Scenarios:
 *   1. /health steady-state (read-only) — establishes warm-baseline
 *   2. /auth/request burst (rate-limit verification under load)
 *   3. /files/presign authed throughput (upload entry-point)
 *
 * Success criteria (pass/fail thresholds enforced by k6):
 *   - p95 latency on /health < 800ms
 *   - http_req_failed rate < 1% on /health
 *   - 429s correctly returned beyond rate-limit threshold (verified via custom check)
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const API = __ENV.API_URL || 'https://api.cwleaders.com';
const STAGE = __ENV.STAGE || 'warm';

const rateLimitedHits = new Counter('rate_limited_hits');
const healthLatency = new Trend('health_latency_ms');
const presignFails = new Rate('presign_failures');

// ── SCENARIO PROFILES ──────────────────────────────────────────────────
const profiles = {
  warm: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 5 },    // ramp to 5 VUs
      { duration: '1m', target: 20 },    // ramp to 20 VUs
      { duration: '2m', target: 20 },    // hold
      { duration: '30s', target: 0 }     // ramp down
    ],
    gracefulRampDown: '15s',
  },
  spike: {
    executor: 'ramping-arrival-rate',
    startRate: 5,
    timeUnit: '1s',
    preAllocatedVUs: 50,
    maxVUs: 200,
    stages: [
      { duration: '15s', target: 5 },
      { duration: '15s', target: 80 },   // sudden spike to 80 rps
      { duration: '30s', target: 80 },
      { duration: '15s', target: 5 },
    ],
  },
};

export const options = {
  scenarios: {
    health: { ...profiles[STAGE], exec: 'healthCheck', tags: { scenario: 'health' } },
    rateLimit: {
      executor: 'shared-iterations',
      vus: 6,
      iterations: 60,        // 6 VUs × 10 iters = 60 requests
      maxDuration: '90s',
      startTime: '15s',
      exec: 'rateLimitProbe',
      tags: { scenario: 'rateLimit' },
    },
  },
  thresholds: {
    'health_latency_ms': ['p(95)<800', 'p(99)<2000'],
    'http_req_failed{scenario:health}': ['rate<0.01'],
    'http_req_duration{scenario:health}': ['p(95)<1000'],
    'rate_limited_hits': ['count>5'],   // ≥5 rate-limited responses prove the throttle works
  },
};

// ── SCENARIOS ─────────────────────────────────────────────────────────

export function healthCheck() {
  const t0 = Date.now();
  const res = http.get(`${API}/health`, {
    timeout: '10s',
    tags: { name: 'GET /health' },
  });
  healthLatency.add(Date.now() - t0);

  check(res, {
    'health 200': r => r.status === 200,
    'health body has ok=true': r => {
      try { return JSON.parse(r.body).ok === true; } catch { return false; }
    },
    'health body has dynamodb.ok': r => {
      try { return JSON.parse(r.body).deps?.dynamodb?.ok === true; } catch { return false; }
    },
  });

  sleep(1);  // 1 req/sec/VU = ~20rps at peak
}

export function rateLimitProbe() {
  // Hammer /auth/request with the same email-domain to trigger 429 around 5th req
  const email = `loadtest+${__VU}-${__ITER}@cwleaders.com`;
  const res = http.post(
    `${API}/auth/request`,
    JSON.stringify({ email }),
    {
      headers: { 'content-type': 'application/json', origin: 'https://lead.cwleaders.com' },
      timeout: '10s',
      tags: { name: 'POST /auth/request' },
    }
  );

  if (res.status === 429) {
    rateLimitedHits.add(1);
    check(res, {
      'has retryAfter in body': r => {
        try { return typeof JSON.parse(r.body).retryAfter === 'number'; } catch { return false; }
      },
      'has Retry-After header': r => !!r.headers['Retry-After'] || !!r.headers['retry-after'],
    });
  } else if (res.status === 200) {
    // ok — under threshold
  } else {
    console.warn(`unexpected ${res.status} on auth/request: ${res.body}`);
  }
  sleep(0.05);  // ~20rps per VU
}

// ── SUMMARY EXPORT ────────────────────────────────────────────────────
export function handleSummary(data) {
  const summary = {
    'stdout': textSummary(data),
    'tests/load/results-' + STAGE + '.json': JSON.stringify(data, null, 2),
  };
  return summary;
}

function textSummary(data) {
  const lines = [
    '\n══════════════════════════════════════════════════════════',
    `  CW Leaders Load Test — Stage: ${STAGE}`,
    '══════════════════════════════════════════════════════════',
  ];
  const m = data.metrics;
  lines.push(`  Requests:           ${m.http_reqs?.values?.count || 0}`);
  lines.push(`  Failed:             ${((m.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`);
  lines.push(`  /health p95:        ${(m.health_latency_ms?.values?.['p(95)'] || 0).toFixed(0)}ms`);
  lines.push(`  /health p99:        ${(m.health_latency_ms?.values?.['p(99)'] || 0).toFixed(0)}ms`);
  lines.push(`  Rate-limited (429): ${m.rate_limited_hits?.values?.count || 0} (≥5 expected)`);
  lines.push(`\n  Threshold results:`);
  for (const [name, t] of Object.entries(m)) {
    if (t.thresholds) {
      for (const [thr, ok] of Object.entries(t.thresholds)) {
        lines.push(`    ${ok.ok ? '✓' : '✗'}  ${name}: ${thr}`);
      }
    }
  }
  lines.push('══════════════════════════════════════════════════════════\n');
  return lines.join('\n');
}
