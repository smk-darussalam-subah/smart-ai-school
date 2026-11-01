'use strict';

// Runs only inside the selected local standalone Web image. No real IdP/DB.
const http = require('node:http');
const cp = require('node:child_process');
const { createRequire } = require('node:module');
const appRequire = createRequire('/app/apps/web/server.js');
const { origin, secret, token, authorityDelayMs, splitAuthority, attendanceProvider } =
  globalThis.__routerFixture;
const calls = [];
const reads = new Map();
let app;
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const permissions = [
  'academic.schedule.read',
  'academic.subject.read',
  'teacher.attendance.read',
  ...(attendanceProvider ? ['staff.attendance.checkin'] : []),
];
const backend = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://fixture.invalid');
  let rawBody = '';
  for await (const chunk of request) rawBody += chunk;
  const authorized = request.headers.authorization === 'Bearer ' + token;
  const publicCatalog = [
    '/school/academic-years/active',
    '/school/semesters/active',
    '/school/calendar',
  ];
  let status = 200;
  let body;
  const endpoint = url.pathname.replace(/^\/api\/v1/, '');
  reads.set(endpoint, (reads.get(endpoint) ?? 0) + 1);
  const delayMs =
    splitAuthority && endpoint === '/auth/me'
      ? reads.get(endpoint) % 2 === 0
        ? 1500
        : 0
      : ['/auth/me', '/positions/my-positions'].includes(endpoint)
        ? authorityDelayMs
        : 0;
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  if (!authorized && !publicCatalog.includes(endpoint)) {
    status = 401;
    body = { message: 'Synthetic identity required' };
  } else if (endpoint === '/auth/me') {
    body = {
      id: 'synthetic-router-guru',
      role: 'GURU',
      fullName: 'QA Guru',
      permissions,
      consentVersion: 'v1.0',
    };
  } else if (endpoint === '/positions/my-positions') {
    body = { academicYear: { id: 'synthetic-year' }, positions: [] };
  } else if (endpoint === '/bell-schedules/catalog') {
    body = { profiles: [], periods: [] };
  } else if (endpoint === '/staff-attendance/context') {
    body = {
      employee: {
        id: 'synthetic-router-guru',
        fullName: 'QA Guru',
        teacher: { id: 'synthetic-teacher' },
        role: 'GURU',
        isPrincipal: false,
      },
      serverNow: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      receipt: null,
      schedules: [],
      scheduleError: null,
      workingDay: true,
      holiday: null,
      eligible: true,
      arrival: { basis: 'WORKDAY', dueAt: null, recommendedAt: null, firstTeachingAt: null },
      policy: {
        attendanceMode: 'REVIEW',
        attendanceAccuracyM: 100,
        attendanceStartMinute: 420,
        attendanceTeacherLeadMin: 10,
        attendanceTeacherLeadTarget: 15,
        attendanceEndMinute: 960,
        attendanceWorkingDays: [1, 2, 3, 4, 5, 6],
        attendancePromptCooldown: 30,
        geofenceRadiusM: 100,
        geofenceConfigured: false,
      },
    };
  } else if (endpoint === '/school/academic-years/active') {
    body = { id: 'synthetic-year', code: '2026/2027', name: '2026/2027' };
  } else if (endpoint === '/school/semesters/active') {
    body = {
      id: 'synthetic-semester',
      number: 1,
      academicYear: { code: '2026/2027' },
      startDate: '2026-07-01',
      endDate: '2026-12-31',
    };
  } else if (endpoint === '/school/calendar') {
    body = [];
  } else if (
    ['/classes', '/schedules', '/class-sessions', '/teacher-attendance'].includes(endpoint)
  ) {
    body = { data: [], total: 0, page: 1, limit: 100 };
  } else if (['/auth/heartbeat', '/auth/login-events'].includes(endpoint)) {
    body = { ok: true };
  } else {
    status = 503;
    body = { message: 'Endpoint outside the bounded synthetic fixture' };
  }
  let activityPayload;
  if (request.method === 'POST' && endpoint === '/auth/login-events') {
    let input;
    try {
      input = JSON.parse(rawBody);
    } catch {
      input = null;
    }
    activityPayload = {
      valid:
        input !== null &&
        typeof input === 'object' &&
        input.eventType === 'login' &&
        Object.keys(input).every((key) => ['eventType', 'ipAddress', 'userAgent'].includes(key)) &&
        (input.ipAddress === null ||
          (typeof input.ipAddress === 'string' && input.ipAddress.length <= 45)) &&
        (input.userAgent === null ||
          (typeof input.userAgent === 'string' && input.userAgent.length <= 500)),
      userAgentSupplied: typeof input?.userAgent === 'string' && input.userAgent.length > 0,
    };
    if (!activityPayload.valid) {
      status = 400;
      body = { message: 'Synthetic login DTO rejected' };
    }
  }
  const call = {
    method: request.method,
    path: url.pathname,
    status,
    authorized,
    delayMs,
    ...(activityPayload ? { activityPayload } : {}),
  };
  calls.push(call);
  emit({ type: 'backend-call', call });
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
});
async function start() {
  await new Promise((resolve) => backend.listen(3901, '127.0.0.1', resolve));
  app = cp.spawn(process.execPath, ['apps/web/server.js'], {
    cwd: '/app',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '0.0.0.0',
      PORT: '3900',
      NEXTAUTH_URL: origin,
      NEXTAUTH_SECRET: secret,
      API_URL: 'http://127.0.0.1:3901',
      KEYCLOAK_ISSUER: 'http://127.0.0.1:3901/realms/synthetic',
      KEYCLOAK_CLIENT_ID: 'synthetic-local',
      KEYCLOAK_CLIENT_SECRET: 'synthetic-local',
      NEXT_TELEMETRY_DISABLED: '1',
      SENTRY_DSN: '',
      NEXT_PUBLIC_SENTRY_DSN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const redact = (data) =>
    String(data).split(secret).join('[redacted]').split(token).join('[redacted]');
  app.stdout.on('data', (data) => emit({ type: 'server-log', text: redact(data) }));
  app.stderr.on('data', (data) => emit({ type: 'server-log', text: redact(data) }));
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch('http://127.0.0.1:3900/login', {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) break;
    } catch {
      /* Bound startup polling only. */
    }
    if (app.exitCode !== null) throw Error('Standalone exited during startup');
    if (i === 79) throw Error('Standalone startup deadline');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  emit({
    type: 'ready',
    next: appRequire('next/package.json').version,
    react: appRequire('react/package.json').version,
  });
}
process.on('SIGTERM', () => {
  emit({ type: 'backend-calls', calls });
  if (app) app.kill('SIGTERM');
  backend.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
});
start().catch((error) => {
  emit({ type: 'fixture-error', error: error.message });
  process.exit(2);
});
