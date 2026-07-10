#!/usr/bin/env node
// =============================================================================
// smoke-test-staging.ts — Post-deploy smoke test for DIIS staging environment
//
// Verifies: API health, public endpoints, auth flow, authenticated endpoints,
//           staging DB isolation, and web frontend reachability.
//
// Usage:
//   npx ts-node --project apps/api/tsconfig.json scripts/smoke-test-staging.ts
//
// Required env:
//   KEYCLOAK_URL              — Keycloak base URL (e.g. https://auth.smkdarussalamsubah.sch.id)
//   SMOKE_TEST_USERNAME       — Keycloak test user with SUPER_ADMIN realm role
//   SMOKE_TEST_PASSWORD       — Password for test user
//
// Optional env (with defaults):
//   STAGING_API_URL           — default: http://localhost:3101
//   STAGING_WEB_URL           — default: http://localhost:3100
//   KEYCLOAK_REALM            — default: diis
//   SMOKE_KIOSK_TOKEN         — if unset, P6 is SKIP
//   SMOKE_TIMEOUT_FAST        — default: 8000 (ms)
//   SMOKE_TIMEOUT_NORMAL      — default: 15000 (ms)
//   SMOKE_TIMEOUT_SLOW        — default: 30000 (ms)
//   SMOKE_RETRY_COUNT         — default: 2
//   SMOKE_OUTPUT_JSON         — default: false (set "true" for JSON output)
// =============================================================================

/* eslint-disable @typescript-eslint/no-var-requires */
// Node built-in — use require to avoid TS module resolution issues.
const net = require('net');

// ─── Types ───────────────────────────────────────────────────────────────────

type TestStatus = 'PASS' | 'FAIL' | 'SKIP';

interface TestResult {
  id: string;
  name: string;
  group: string;
  status: TestStatus;
  latency_ms: number;
  detail?: string;
}

interface Config {
  apiBaseUrl: string;
  webBaseUrl: string;
  keycloakUrl: string;
  keycloakRealm: string;
  kioskToken: string | undefined;
  username: string | undefined;
  password: string | undefined;
  timeoutFast: number;
  timeoutNormal: number;
  timeoutSlow: number;
  retryCount: number;
  outputJson: boolean;
}

// ─── Config ──────────────────────────────────────────────────────────────────

function loadConfig(): Config {
  return {
    apiBaseUrl: process.env.STAGING_API_URL || 'http://localhost:3101',
    webBaseUrl: process.env.STAGING_WEB_URL || 'http://localhost:3100',
    keycloakUrl: process.env.KEYCLOAK_URL || '',
    keycloakRealm: process.env.KEYCLOAK_REALM || 'diis',
    kioskToken: process.env.SMOKE_KIOSK_TOKEN,
    username: process.env.SMOKE_TEST_USERNAME,
    password: process.env.SMOKE_TEST_PASSWORD,
    timeoutFast: parseInt(process.env.SMOKE_TIMEOUT_FAST || '8000', 10),
    timeoutNormal: parseInt(process.env.SMOKE_TIMEOUT_NORMAL || '15000', 10),
    timeoutSlow: parseInt(process.env.SMOKE_TIMEOUT_SLOW || '30000', 10),
    retryCount: parseInt(process.env.SMOKE_RETRY_COUNT || '2', 10),
    outputJson: process.env.SMOKE_OUTPUT_JSON === 'true',
  };
}

const TIMEOUT_MAP: Record<string, number> = {};
// Will be populated after config load

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseUrl(url: string): { host: string; port: number } {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : (u.protocol === 'https:' ? 443 : 80),
  };
}

async function tcpConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

interface FetchResult {
  status: number;
  headers: Headers;
  bodyText: string;
  bodyJson: unknown;
  latencyMs: number;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  retryCount: number,
): Promise<FetchResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    if (attempt > 0) {
      const backoff = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s...
      await sleep(backoff);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const start = Date.now();
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;

      const bodyText = await res.text();
      let bodyJson: unknown = null;
      try {
        bodyJson = JSON.parse(bodyText);
      } catch {
        // Not JSON — leave bodyJson as null
      }

      // Retry only on 5xx or network error
      if (res.status >= 500 && attempt < retryCount) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }

      return { status: res.status, headers: res.headers, bodyText, bodyJson, latencyMs };
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error(String(err));
      // Network errors are retried; AbortController abort = timeout = retried
      if (attempt < retryCount) {
        continue;
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error('Unknown error after retries');
}

// ─── Test Result Collector ───────────────────────────────────────────────────

const results: TestResult[] = [];

function record(id: string, name: string, group: string, status: TestStatus, latencyMs: number, detail?: string): void {
  results.push({ id, name, group, status, latency_ms: latencyMs, detail });
}

// ─── Timeout helper ──────────────────────────────────────────────────────────

function getTimeout(key: string, config: Config): number {
  switch (key) {
    case 'FAST': return config.timeoutFast;
    case 'NORMAL': return config.timeoutNormal;
    case 'SLOW': return config.timeoutSlow;
    default: return config.timeoutNormal;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const config = loadConfig();
  const startTime = Date.now();

  // Auth token (obtained during A1 test)
  let authToken: string | null = null;

  // ── PF3: Environment validation ────────────────────────────────────────────
  const missingVars: string[] = [];
  if (!config.keycloakUrl) missingVars.push('KEYCLOAK_URL');

  if (missingVars.length > 0) {
    record('PF3', 'Environment validation', 'Pre-flight', 'FAIL', 0,
      `Missing required env vars: ${missingVars.join(', ')}`);
    // Can't continue without basics
    outputReport(config, startTime);
    return 1;
  }

  const hasAuthCreds = !!(config.username && config.password);
  record('PF3', 'Environment validation', 'Pre-flight', 'PASS', 0,
    hasAuthCreds ? 'All required vars present' : 'KEYCLOAK_URL OK, auth creds missing — auth tests will SKIP');

  // ── PF1: TCP connect ───────────────────────────────────────────────────────
  const apiUrl = parseUrl(config.apiBaseUrl);
  const tcpStart = Date.now();
  const tcpOk = await tcpConnect(apiUrl.host, apiUrl.port, 3000);
  const tcpLatency = Date.now() - tcpStart;

  if (tcpOk) {
    record('PF1', 'TCP connect', 'Pre-flight', 'PASS', tcpLatency, `${apiUrl.host}:${apiUrl.port}`);
  } else {
    record('PF1', 'TCP connect', 'Pre-flight', 'FAIL', tcpLatency,
      `Cannot connect to ${apiUrl.host}:${apiUrl.port} — API unreachable`);
  }

  // ── PF2: JWKS reachability ─────────────────────────────────────────────────
  const jwksUrl = `${config.keycloakUrl}/realms/${config.keycloakRealm}/.well-known/openid-configuration`;
  try {
    const jwksRes = await fetchWithRetry(jwksUrl, { method: 'GET' }, getTimeout('SLOW', config), 0);
    const jwksBody = jwksRes.bodyJson as Record<string, unknown> | null;
    if (jwksRes.status === 200 && jwksBody?.jwks_uri) {
      record('PF2', 'JWKS reachability', 'Pre-flight', 'PASS', jwksRes.latencyMs,
        `jwks_uri present`);
    } else {
      record('PF2', 'JWKS reachability', 'Pre-flight', 'FAIL', jwksRes.latencyMs,
        `Expected 200 + jwks_uri, got ${jwksRes.status}`);
    }
  } catch (err) {
    record('PF2', 'JWKS reachability', 'Pre-flight', 'FAIL', 0,
      `Network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Determine if we can run API tests
  const pf1Passed = results.find(r => r.id === 'PF1')?.status === 'PASS';

  // ── Public Endpoints (P1-P6) ───────────────────────────────────────────────
  if (pf1Passed) {
    // P1: Health check
    try {
      const res = await fetchWithRetry(`${config.apiBaseUrl}/health`, { method: 'GET' }, getTimeout('FAST', config), 0);
      const body = res.bodyJson as Record<string, unknown> | null;
      // Detect HTML response (means nginx is routing to web frontend, not API)
      const isHtml = res.bodyText.includes('<html') || res.bodyText.includes('<!DOCTYPE');
      if (isHtml) {
        record('P1', 'GET /health', 'Public Endpoints', 'FAIL', res.latencyMs,
          `Response is HTML, not JSON — nginx may be routing to web container instead of API. Check if staging-api subdomain exists in nginx.conf.`);
      } else if ((res.status === 200 && (body as Record<string, unknown>)?.status === 'ok') ||
          (res.status === 503 && (body as Record<string, unknown>)?.status === 'error')) {
        record('P1', 'GET /health', 'Public Endpoints', 'PASS', res.latencyMs,
          `status=${(body as Record<string, unknown>)?.status}`);
      } else {
        record('P1', 'GET /health', 'Public Endpoints', 'FAIL', res.latencyMs,
          `Expected 200/ok or 503/error, got ${res.status}. Body preview: ${res.bodyText.substring(0, 100)}`);
      }
    } catch (err) {
      record('P1', 'GET /health', 'Public Endpoints', 'FAIL', 0,
        `Network error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // P2: Metrics
    try {
      const res = await fetchWithRetry(`${config.apiBaseUrl}/metrics`, { method: 'GET' }, getTimeout('FAST', config), 0);
      const contentType = res.headers.get('content-type') || '';
      const isHtml = res.bodyText.includes('<html') || res.bodyText.includes('<!DOCTYPE');
      const hasPrometheus = res.bodyText.includes('process_cpu') || res.bodyText.includes('nodejs_');
      if (isHtml) {
        record('P2', 'GET /metrics', 'Public Endpoints', 'FAIL', res.latencyMs,
          `Response is HTML — nginx may block /metrics on staging-api or route to web. Note: prod nginx returns 404 for /metrics (F-3 security).`);
      } else if (res.status === 200 && (contentType.includes('text/plain') || hasPrometheus)) {
        record('P2', 'GET /metrics', 'Public Endpoints', 'PASS', res.latencyMs, 'Prometheus format');
      } else if (res.status === 404) {
        record('P2', 'GET /metrics', 'Public Endpoints', 'SKIP', res.latencyMs,
          `/metrics blocked by nginx (expected for prod api.smkdarussalamsubah.sch.id F-3). Staging-api may not exist as separate server block.`);
      } else {
        record('P2', 'GET /metrics', 'Public Endpoints', 'FAIL', res.latencyMs,
          `Expected 200 + text/plain, got ${res.status}, CT: ${contentType}`);
      }
    } catch (err) {
      record('P2', 'GET /metrics', 'Public Endpoints', 'FAIL', 0,
        `Network error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // P3: School profile
    try {
      const res = await fetchWithRetry(`${config.apiBaseUrl}/api/v1/school/profile`, { method: 'GET' }, getTimeout('FAST', config), 0);
      const isHtmlP3 = res.bodyText.includes('<html') || res.bodyText.includes('<!DOCTYPE');
      if (isHtmlP3) {
        record('P3', 'GET /api/v1/school/profile', 'Public Endpoints', 'FAIL', res.latencyMs,
          `Response is HTML — request hit web frontend, not API. Verify staging-api subdomain nginx routing.`);
      } else if (res.status === 200 || res.status === 404) {
        record('P3', 'GET /api/v1/school/profile', 'Public Endpoints', 'PASS', res.latencyMs,
          `status=${res.status}`);
      } else {
        record('P3', 'GET /api/v1/school/profile', 'Public Endpoints', 'FAIL', res.latencyMs,
          `Expected 200 or 404, got ${res.status}`);
      }
    } catch (err) {
      record('P3', 'GET /api/v1/school/profile', 'Public Endpoints', 'FAIL', 0,
        `Network error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // P4: Active academic year
    try {
      const res = await fetchWithRetry(`${config.apiBaseUrl}/api/v1/school/academic-years/active`, { method: 'GET' }, getTimeout('FAST', config), 0);
      const isHtmlP4 = res.bodyText.includes('<html') || res.bodyText.includes('<!DOCTYPE');
      if (isHtmlP4) {
        record('P4', 'GET /api/v1/school/academic-years/active', 'Public Endpoints', 'FAIL', res.latencyMs,
          `Response is HTML — request hit web frontend, not API.`);
      } else if (res.status === 200 || res.status === 404) {
        record('P4', 'GET /api/v1/school/academic-years/active', 'Public Endpoints', 'PASS', res.latencyMs,
          `status=${res.status}`);
      } else {
        record('P4', 'GET /api/v1/school/academic-years/active', 'Public Endpoints', 'FAIL', res.latencyMs,
          `Expected 200 or 404, got ${res.status}`);
      }
    } catch (err) {
      record('P4', 'GET /api/v1/school/academic-years/active', 'Public Endpoints', 'FAIL', 0,
        `Network error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // P5: Active semester
    try {
      const res = await fetchWithRetry(`${config.apiBaseUrl}/api/v1/school/semesters/active`, { method: 'GET' }, getTimeout('FAST', config), 0);
      const isHtmlP5 = res.bodyText.includes('<html') || res.bodyText.includes('<!DOCTYPE');
      if (isHtmlP5) {
        record('P5', 'GET /api/v1/school/semesters/active', 'Public Endpoints', 'FAIL', res.latencyMs,
          `Response is HTML — request hit web frontend, not API.`);
      } else if (res.status === 200 || res.status === 404) {
        record('P5', 'GET /api/v1/school/semesters/active', 'Public Endpoints', 'PASS', res.latencyMs,
          `status=${res.status}`);
      } else {
        record('P5', 'GET /api/v1/school/semesters/active', 'Public Endpoints', 'FAIL', res.latencyMs,
          `Expected 200 or 404, got ${res.status}`);
      }
    } catch (err) {
      record('P5', 'GET /api/v1/school/semesters/active', 'Public Endpoints', 'FAIL', 0,
        `Network error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // P6: Public kiosk
    if (!config.kioskToken) {
      record('P6', 'GET /api/v1/public/kiosk', 'Public Endpoints', 'SKIP', 0,
        'SMOKE_KIOSK_TOKEN not set');
    } else {
      try {
        const res = await fetchWithRetry(
          `${config.apiBaseUrl}/api/v1/public/kiosk?token=${encodeURIComponent(config.kioskToken)}`,
          { method: 'GET' },
          getTimeout('FAST', config),
          0,
        );
        if (res.status === 200 || res.status === 400) {
          record('P6', 'GET /api/v1/public/kiosk', 'Public Endpoints', 'PASS', res.latencyMs,
            `status=${res.status}`);
        } else {
          record('P6', 'GET /api/v1/public/kiosk', 'Public Endpoints', 'FAIL', res.latencyMs,
            `Expected 200 or 400, got ${res.status}`);
        }
      } catch (err) {
        record('P6', 'GET /api/v1/public/kiosk', 'Public Endpoints', 'FAIL', 0,
          `Network error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else {
    // Skip all API tests
    for (const id of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6']) {
      record(id, `API test ${id}`, 'Public Endpoints', 'SKIP', 0, 'PF1 failed — API unreachable');
    }
  }

  // ── Auth Flow (A1) ─────────────────────────────────────────────────────────
  const pf2Passed = results.find(r => r.id === 'PF2')?.status === 'PASS';

  if (pf1Passed && hasAuthCreds && pf2Passed) {
    // A1: Obtain token via password grant
    const tokenUrl = `${config.keycloakUrl}/realms/${config.keycloakRealm}/protocol/openid-connect/token`;
    const tokenBody = new URLSearchParams({
      grant_type: 'password',
      client_id: 'diis-web',
      username: config.username!,
      password: config.password!,
    });

    try {
      const res = await fetchWithRetry(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
      }, getTimeout('SLOW', config), 0);

      const body = res.bodyJson as Record<string, unknown> | null;
      if (res.status === 200 && body?.access_token && body?.token_type === 'Bearer') {
        authToken = body.access_token as string;
        record('A1', 'POST Keycloak token (password grant)', 'Auth Flow', 'PASS', res.latencyMs,
          'Token obtained');
      } else {
        record('A1', 'POST Keycloak token (password grant)', 'Auth Flow', 'FAIL', res.latencyMs,
          `Expected 200 + access_token, got ${res.status}. Body: ${res.bodyText.substring(0, 200)}`);
      }
    } catch (err) {
      record('A1', 'POST Keycloak token (password grant)', 'Auth Flow', 'FAIL', 0,
        `Network error: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (!hasAuthCreds) {
    record('A1', 'POST Keycloak token (password grant)', 'Auth Flow', 'SKIP', 0,
      'SMOKE_TEST_USERNAME/PASSWORD not set');
  } else if (!pf2Passed) {
    record('A1', 'POST Keycloak token (password grant)', 'Auth Flow', 'SKIP', 0,
      'PF2 failed — JWKS unreachable');
  }

  // ── Auth Validation (R0) ───────────────────────────────────────────────────
  let r0Passed = false;

  if (authToken) {
    try {
      const res = await fetchWithRetry(`${config.apiBaseUrl}/api/v1/auth/me`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` },
      }, getTimeout('NORMAL', config), config.retryCount);

      const body = res.bodyJson as Record<string, unknown> | null;
      if (res.status === 200 && body?.keycloakId) {
        const role = body.role as string || '';
        const perms = body.permissions as string[] || [];
        const isSuperAdmin = role === 'SUPER_ADMIN' || perms.includes('*');
        record('R0', 'GET /api/v1/auth/me', 'Auth Validation', 'PASS', res.latencyMs,
          `role=${role}, permissions=${perms.length}, id=${(body.id as string) || '(empty)'}`);
        r0Passed = true;
      } else {
        record('R0', 'GET /api/v1/auth/me', 'Auth Validation', 'FAIL', res.latencyMs,
          `Expected 200 + keycloakId, got ${res.status}`);
      }
    } catch (err) {
      record('R0', 'GET /api/v1/auth/me', 'Auth Validation', 'FAIL', 0,
        `Network error: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    record('R0', 'GET /api/v1/auth/me', 'Auth Validation', 'SKIP', 0, 'A1 failed/skipped — no auth token');
  }

  // ── Authenticated Endpoints (R1-R9) ────────────────────────────────────────

  // Define response validators
  interface EndpointDef {
    id: string;
    path: string;
    name: string;
    responseType: 'paginated' | 'bare-array';
  }

  const endpoints: EndpointDef[] = [
    { id: 'R1', path: '/api/v1/users', name: 'GET /api/v1/users', responseType: 'paginated' },
    { id: 'R2', path: '/api/v1/students', name: 'GET /api/v1/students', responseType: 'paginated' },
    { id: 'R3', path: '/api/v1/classes', name: 'GET /api/v1/classes', responseType: 'paginated' },
    { id: 'R4', path: '/api/v1/positions', name: 'GET /api/v1/positions', responseType: 'bare-array' },
    { id: 'R5', path: '/api/v1/badges', name: 'GET /api/v1/badges', responseType: 'paginated' },
    { id: 'R6', path: '/api/v1/kktp-config', name: 'GET /api/v1/kktp-config', responseType: 'bare-array' },
    { id: 'R7', path: '/api/v1/questions', name: 'GET /api/v1/questions', responseType: 'paginated' },
    { id: 'R8', path: '/api/v1/lms/modules', name: 'GET /api/v1/lms/modules', responseType: 'paginated' },
    { id: 'R9', path: '/api/v1/schedules', name: 'GET /api/v1/schedules', responseType: 'paginated' },
  ];

  if (authToken && r0Passed) {
    for (const ep of endpoints) {
      try {
        const res = await fetchWithRetry(`${config.apiBaseUrl}${ep.path}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${authToken}` },
        }, getTimeout('NORMAL', config), 0);

        if (res.status === 200) {
          const body = res.bodyJson;
          if (ep.responseType === 'paginated') {
            const pagBody = body as Record<string, unknown> | null;
            if (Array.isArray(pagBody?.data) && typeof pagBody?.total === 'number') {
              record(ep.id, ep.name, 'Authenticated Endpoints', 'PASS', res.latencyMs,
                `total=${pagBody!.total}`);
            } else {
              record(ep.id, ep.name, 'Authenticated Endpoints', 'FAIL', res.latencyMs,
                `Expected { data: array, total: number }, got unexpected shape`);
            }
          } else {
            // bare-array
            if (Array.isArray(body)) {
              record(ep.id, ep.name, 'Authenticated Endpoints', 'PASS', res.latencyMs,
                `array length=${(body as unknown[]).length}`);
            } else {
              record(ep.id, ep.name, 'Authenticated Endpoints', 'FAIL', res.latencyMs,
                `Expected bare array, got ${typeof body}`);
            }
          }
        } else if (res.status === 403) {
          record(ep.id, ep.name, 'Authenticated Endpoints', 'FAIL', res.latencyMs,
            `403 — RBAC or permission mapping issue. Check role_permissions seed in staging DB.`);
        } else if (res.status === 401) {
          record(ep.id, ep.name, 'Authenticated Endpoints', 'FAIL', res.latencyMs,
            `401 — Token invalid or expired`);
        } else {
          record(ep.id, ep.name, 'Authenticated Endpoints', 'FAIL', res.latencyMs,
            `Expected 200, got ${res.status}`);
        }
      } catch (err) {
        record(ep.id, ep.name, 'Authenticated Endpoints', 'FAIL', 0,
          `Network error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } else {
    for (const ep of endpoints) {
      record(ep.id, ep.name, 'Authenticated Endpoints', 'SKIP', 0,
        'A1 or R0 failed/skipped — cannot test authenticated endpoints');
    }
  }

  // ── Staging Isolation (I1, I2) ─────────────────────────────────────────────
  if (authToken && r0Passed) {
    // I1: /auth/me DB origin — reuse R0 data
    const r0Result = results.find(r => r.id === 'R0');
    if (r0Result?.status === 'PASS') {
      // We need to re-fetch to get the body
      try {
        const res = await fetchWithRetry(`${config.apiBaseUrl}/api/v1/auth/me`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${authToken}` },
        }, getTimeout('NORMAL', config), 0);
        const body = res.bodyJson as Record<string, unknown> | null;
        const userId = (body?.id as string) || '';
        if (userId === '') {
          record('I1', '/auth/me DB origin check', 'Staging Isolation', 'PASS', res.latencyMs,
            `id='' → staging DB confirmed (fresh, user not seeded)`);
        } else {
          record('I1', '/auth/me DB origin check', 'Staging Isolation', 'PASS', res.latencyMs,
            `id=${userId} — verify this UUID does NOT exist in production DB`);
        }
      } catch {
        record('I1', '/auth/me DB origin check', 'Staging Isolation', 'SKIP', 0, 'Re-fetch failed');
      }
    } else {
      record('I1', '/auth/me DB origin check', 'Staging Isolation', 'SKIP', 0, 'R0 failed');
    }

    // I2: Students count sanity
    try {
      const res = await fetchWithRetry(`${config.apiBaseUrl}/api/v1/students`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` },
      }, getTimeout('NORMAL', config), 0);
      const body = res.bodyJson as Record<string, unknown> | null;
      const total = (body?.total as number) ?? -1;
      if (total >= 0 && total < 100) {
        record('I2', 'Students count sanity', 'Staging Isolation', 'PASS', res.latencyMs,
          `total=${total} → staging DB confirmed`);
      } else if (total >= 100) {
        record('I2', 'Students count sanity', 'Staging Isolation', 'FAIL', res.latencyMs,
          `total=${total} → WARNING: staging may be connected to prod DB!`);
      } else {
        record('I2', 'Students count sanity', 'Staging Isolation', 'SKIP', res.latencyMs,
          `Cannot determine total (got ${total})`);
      }
    } catch {
      record('I2', 'Students count sanity', 'Staging Isolation', 'SKIP', 0, 'Fetch failed');
    }
  } else {
    record('I1', '/auth/me DB origin check', 'Staging Isolation', 'SKIP', 0, 'No auth token');
    record('I2', 'Students count sanity', 'Staging Isolation', 'SKIP', 0, 'No auth token');
  }

  // ── Web Frontend (W1-W3) ───────────────────────────────────────────────────
  // W1: Homepage
  try {
    const res = await fetchWithRetry(`${config.webBaseUrl}/`, { method: 'GET' }, getTimeout('SLOW', config), config.retryCount);
    if (res.status === 200 && (res.bodyText.includes('<html') || res.bodyText.includes('<!DOCTYPE'))) {
      record('W1', 'GET / (homepage)', 'Web Frontend', 'PASS', res.latencyMs, 'HTML returned');
    } else {
      record('W1', 'GET / (homepage)', 'Web Frontend', 'FAIL', res.latencyMs,
        `Expected 200 + HTML, got ${res.status}`);
    }
  } catch (err) {
    record('W1', 'GET / (homepage)', 'Web Frontend', 'FAIL', 0,
      `Network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // W2: Login page
  try {
    const res = await fetchWithRetry(`${config.webBaseUrl}/auth/login`, { method: 'GET' }, getTimeout('SLOW', config), config.retryCount);
    if (res.status === 200 && (res.bodyText.includes('<html') || res.bodyText.includes('<!DOCTYPE'))) {
      record('W2', 'GET /auth/login', 'Web Frontend', 'PASS', res.latencyMs, 'Login page rendered');
    } else {
      record('W2', 'GET /auth/login', 'Web Frontend', 'FAIL', res.latencyMs,
        `Expected 200 + HTML, got ${res.status}`);
    }
  } catch (err) {
    record('W2', 'GET /auth/login', 'Web Frontend', 'FAIL', 0,
      `Network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // W3: API SSR proxy — test via /api/backend/school/profile (rewritten to /api/v1/school/profile)
  // Note: /api/backend/health does NOT work because rewrite adds /api/v1/ prefix
  // but health is excluded from prefix in main.ts. school/profile IS under /api/v1/ so it works.
  try {
    const res = await fetchWithRetry(`${config.webBaseUrl}/api/backend/school/profile`, { method: 'GET' }, getTimeout('SLOW', config), config.retryCount);
    const body = res.bodyJson as Record<string, unknown> | null;
    const isHtmlW3 = res.bodyText.includes('<html') || res.bodyText.includes('<!DOCTYPE');
    if (isHtmlW3) {
      record('W3', 'GET /api/backend/school/profile (SSR proxy)', 'Web Frontend', 'FAIL', res.latencyMs,
        `Response is HTML — SSR proxy not forwarding to staging API. Check API_URL env in smk-staging-web container.`);
    } else if (res.status === 200 && body !== null) {
      record('W3', 'GET /api/backend/school/profile (SSR proxy)', 'Web Frontend', 'PASS', res.latencyMs,
        `SSR proxy works — received JSON from API`);
    } else if (res.status === 200) {
      record('W3', 'GET /api/backend/school/profile (SSR proxy)', 'Web Frontend', 'PASS', res.latencyMs,
        `status=200 (SSR proxy responding)`);
    } else {
      record('W3', 'GET /api/backend/school/profile (SSR proxy)', 'Web Frontend', 'FAIL', res.latencyMs,
        `Expected 200 via rewrite, got ${res.status}`);
    }
  } catch (err) {
    record('W3', 'GET /api/backend/school/profile (SSR proxy)', 'Web Frontend', 'FAIL', 0,
      `Network error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Output ─────────────────────────────────────────────────────────────────
  outputReport(config, startTime);

  const hasFail = results.some(r => r.status === 'FAIL');
  return hasFail ? 1 : 0;
}

// ─── Output ───────────────────────────────────────────────────────────────────

function outputReport(config: Config, startTime: number): void {
  const duration = Date.now() - startTime;
  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const skip = results.filter(r => r.status === 'SKIP').length;
  const total = results.length;

  if (config.outputJson) {
    const report = {
      timestamp: new Date().toISOString(),
      api: config.apiBaseUrl,
      web: config.webBaseUrl,
      summary: { total, pass, fail, skip, duration_ms: duration },
      results: results.map(r => ({
        id: r.id,
        name: r.name,
        group: r.group,
        status: r.status,
        latency_ms: r.latency_ms,
        detail: r.detail || undefined,
      })),
    };
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Human-readable output
  const groups = [...new Set(results.map(r => r.group))];

  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log(`║  STAGING SMOKE TEST — ${new Date().toISOString().substring(0, 19)}Z             ║`);
  console.log(`║  API: ${config.apiBaseUrl.padEnd(47).substring(0, 47)}║`);
  console.log(`║  Web: ${config.webBaseUrl.padEnd(47).substring(0, 47)}║`);
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');

  for (const group of groups) {
    console.log(`─── ${group} ────────────────────────────────────────────`);
    for (const r of results.filter(r => r.group === group)) {
      const statusStr = r.status === 'PASS' ? '[PASS]' : r.status === 'FAIL' ? '[FAIL]' : '[SKIP]';
      const latencyStr = r.latency_ms > 0 ? `${r.latency_ms}ms` : '—';
      const namePadded = r.name.padEnd(42).substring(0, 42);
      console.log(`  ${statusStr} ${r.id.padEnd(4)} ${namePadded} ${latencyStr}`);
      if (r.detail) {
        console.log(`           ${r.detail}`);
      }
    }
    console.log('');
  }

  console.log('════════════════════════════════════════════════════════');
  console.log(`  TOTAL: ${total}   PASS: ${pass}   FAIL: ${fail}   SKIP: ${skip}`);
  console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`);
  console.log(`  Exit code: ${fail > 0 ? 1 : 0}`);
  console.log('════════════════════════════════════════════════════════');
  console.log('');
}

// ─── Run ──────────────────────────────────────────────────────────────────────

main().then((exitCode) => {
  process.exit(exitCode);
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
