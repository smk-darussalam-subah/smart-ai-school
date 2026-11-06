'use strict';
// Loopback-only adapter inside the selected standalone image. The separate HTTP
// suite exercises actual JWT/JWKS, guards, services and disposable PostgreSQL.
const http = require('node:http'),
  cp = require('node:child_process');
const config = globalThis.__teacherWorkspaceFixture;
if (!config || !/^https:\/\/localhost:\d+$/.test(config.origin))
  throw Error('Explicit loopback fixture required');
const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const date = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const profiles = {
  TEACHER: { role: 'GURU', name: 'QA Guru' },
  HUMAS: { role: 'GURU', name: 'QA Humas' },
  ADMIN: { role: 'SUPER_ADMIN', name: 'QA Operator' },
  TU: { role: 'TATA_USAHA', name: 'QA TU' },
};
const permissions = [
  'academic.schedule.read',
  'academic.teaching.read',
  'academic.grade.read',
  'academic.class-session.read',
  'academic.class-session.manage',
  'academic.attendance.read',
  'academic.attendance.create',
  'staff.attendance.checkin',
  'teacher.attendance.read',
  'activity.read',
  'activity.manage',
  'rpp.read',
  'rpp.own.manage',
  'lms.read',
  'lms.own.manage',
];
const state = {
  jpReads: 0,
  starts: 0,
  resets: 0,
  resetIds: [],
  calendarWrites: 0,
  calendarDeletes: 0,
  loginEvents: [],
  calls: [],
  revoked: [],
  jpError: false,
  parentError: false,
  homeError: false,
  holdStatus: false,
  held: false,
};
let sessionsStatus = 'SCHEDULED',
  heldResponse;
const knownUsers = [
  { id: id(91), role: 'SISWA', fullName: 'QA Siswa 001' },
  { id: id(92), role: 'ORANG_TUA', fullName: 'QA Orang Tua' },
  { id: id(93), role: 'GURU', fullName: 'QA Guru Lain' },
].map((u) => ({
  ...u,
  email: u.id + '@example.invalid',
  phone: null,
  isActive: true,
  deletedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));
const events = [
  {
    id: id(80),
    name: 'Rapat pembelajaran QA',
    startDate: date() + 'T00:00:00.000Z',
    endDate: date() + 'T00:00:00.000Z',
    startAt: date() + 'T01:00:00.000Z',
    endAt: date() + 'T02:00:00.000Z',
    location: 'Aula QA',
    type: 'event',
    description: null,
  },
];
const row = (profile = 'TEACHER') => ({
  id: id(1),
  scheduleId: id(2),
  classId: id(3),
  teachingAssignmentId: id(4),
  assignedTeacherId: id(profile === 'HUMAS' ? 6 : 5),
  assignedTeacherName: profiles[profile]?.name ?? 'QA Guru',
  classNameSnapshot: 'X QA',
  subjectSnapshot: 'Literasi Data QA',
  roomSnapshot: 'Ruang QA',
  serviceDate: date() + 'T00:00:00.000Z',
  scheduledStartAt: new Date(Date.now() - 600000).toISOString(),
  scheduledEndAt: new Date(Date.now() + 2400000).toISOString(),
  status: sessionsStatus,
  startedAt: sessionsStatus === 'STARTED' ? new Date(Date.now() - 10000).toISOString() : null,
  completedAt: null,
  missedAt: null,
  cancelledAt: null,
  reassignedAt: null,
  cancellationReason: null,
  reassignmentReason: null,
  canOperate: true,
  operationBlockedReason: null,
  academicYear: { code: '2026/2027' },
  semester: { number: 1 },
  schedule: { jpStart: 1, jpEnd: 2 },
});
const overview = (own = true) => {
  const totals = {
    expected: 4,
    recorded: 2,
    unknown: 2,
    hadir: 2,
    izin: 0,
    sakit: 0,
    alpha: 0,
    complete: false,
    pct: null,
    tone: 'unknown',
  };
  return {
    academicYear: '2026/2027',
    semester: 1,
    from: date(),
    to: date(),
    observedThrough: date(),
    generatedAt: new Date().toISOString(),
    unit: 'student_session_jp',
    rosterBasis: 'current_roster_and_recorded_history',
    scope: own ? 'own' : 'authorized',
    filters: { classId: null, teacherId: null, subject: null, majorCode: null },
    totals,
    days: [{ date: date(), ...totals }],
    ...(own
      ? {
          sessionCompletion: [
            {
              sessionId: id(1),
              scheduleId: id(2),
              classId: id(3),
              date: date(),
              subject: 'Literasi Data QA',
              jpStart: 1,
              jpEnd: 2,
              expected: 4,
              recorded: 2,
              unknown: 2,
              complete: false,
            },
          ],
        }
      : {}),
  };
};
function send(r, status, data) {
  r.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  r.end(status === 204 ? '' : JSON.stringify(data));
}
const api = http.createServer(async (q, r) => {
  let raw = '';
  for await (const c of q) raw += c;
  const url = new URL(q.url, 'http://fixture.invalid'),
    p = url.pathname.replace(/^\/api\/v1/, '');
  if (p === '/__fixture/state') {
    return send(r, 200, { ...state, events, sessionsStatus });
  }
  if (p === '/__fixture/control') {
    const input = JSON.parse(raw || '{}');
    if (input.releaseStatus && heldResponse) {
      heldResponse();
      heldResponse = null;
    }
    for (const key of ['jpError', 'parentError', 'homeError', 'holdStatus'])
      if (typeof input[key] === 'boolean') state[key] = input[key];
    if (input.sessionStatus) sessionsStatus = input.sessionStatus;
    return send(r, 200, { ok: true });
  }
  const access = String(q.headers.authorization ?? '').replace(/^Bearer /, ''),
    match = /^qa-(TEACHER|HUMAS|ADMIN|TU)-access-(\d+)$/.exec(access);
  const profile = match?.[1] ?? 'TEACHER',
    identity = profiles[profile],
    binding = match ? profile + '-' + match[2] : null;
  const authorized = !!binding && !state.revoked.includes(binding);
  const call = { path: p, method: q.method, profile: match ? profile : null, status: 200 };
  state.calls.push(call);
  if (state.calls.length > 1500) state.calls.shift();
  if (p === '/realms/synthetic/protocol/openid-connect/logout') return send(r, 204);
  if (p === '/realms/synthetic/protocol/openid-connect/token') {
    const value = new URLSearchParams(raw).get('refresh_token') ?? '',
      m = /^qa-(\w+)-refresh-(\d+)$/.exec(value);
    if (!m) return send(r, 400, { error: 'invalid_grant' });
    return send(r, 200, {
      access_token: `qa-${m[1]}-access-${m[2]}`,
      refresh_token: value,
      expires_in: 3600,
    });
  }
  if (p === '/auth/session/logout' && binding) {
    if (!state.revoked.includes(binding)) state.revoked.push(binding);
    return send(r, 204);
  }
  if (
    !authorized &&
    !['/school/academic-years/active', '/school/semesters/active', '/school/profile'].includes(p)
  ) {
    call.status = 401;
    return send(r, 401, { message: 'Synthetic identity required' });
  }
  if (p === '/auth/session-status') {
    if (state.holdStatus && !state.held) {
      state.held = true;
      heldResponse = () => send(r, 200, { active: true, binding: 'oidc' });
      return;
    }
    return send(r, 200, { active: true, binding: 'oidc' });
  }
  if (p === '/auth/me')
    return send(r, 200, {
      id: id(10),
      role: identity.role,
      fullName: identity.name,
      permissions:
        profile === 'ADMIN'
          ? ['*']
          : profile === 'HUMAS'
            ? [...permissions, 'school.calendar.manage']
            : profile === 'TU'
              ? [
                  'operational.monitoring.read',
                  'academic.attendance.read',
                  'academic.class-session.read',
                  'academic.teaching.read',
                  'academic.schedule.read',
                ]
              : permissions,
      consentVersion: 'v1.0',
    });
  if (p === '/positions/my-positions')
    return send(r, 200, {
      academicYear: { id: id(20) },
      positions:
        profile === 'HUMAS'
          ? [{ status: 'ACTIVE', position: { code: 'WAKA_HUMAS', name: 'Waka Humas' } }]
          : [],
    });
  if (p === '/school/academic-years/active')
    return send(r, 200, { id: id(20), code: '2026/2027', name: '2026/2027' });
  const year = {
    id: id(20),
    code: '2026/2027',
    isActive: true,
    startDate: '2026-07-01T00:00:00.000Z',
    endDate: '2027-06-30T00:00:00.000Z',
  };
  const semester = {
    id: id(21),
    academicYearId: year.id,
    academicYear: year,
    number: 1,
    isActive: true,
    startDate: '2026-07-01T00:00:00.000Z',
    endDate: '2026-12-31T00:00:00.000Z',
  };
  if (p === '/school/semesters/active') return send(r, 200, semester);
  if (p === '/school/semesters') return send(r, 200, [semester]);
  if (p === '/school/profile')
    return send(r, 200, { name: 'DIIS QA lokal', address: '', headmasterName: 'QA Kepala' });
  if (p === '/bell-schedules/catalog') return send(r, 200, { profiles: [], periods: [] });
  if (p === '/bell-schedules/resolve') return send(r, 200, null);
  if (p === '/school/calendar' && q.method === 'GET') return send(r, 200, events);
  if (p === '/school/calendar' && q.method === 'POST') {
    const data = JSON.parse(raw);
    state.calendarWrites++;
    const value = {
      id: id(81 + state.calendarWrites),
      ...data,
      startDate: data.startDate + 'T00:00:00.000Z',
      endDate: data.endDate + 'T00:00:00.000Z',
    };
    events.push(value);
    return send(r, 201, value);
  }
  if (p.startsWith('/school/calendar/') && q.method === 'DELETE') {
    state.calendarDeletes++;
    const index = events.findIndex((e) => e.id === p.split('/').pop());
    if (index >= 0) events.splice(index, 1);
    return send(r, 200, { success: true });
  }
  if (p.startsWith('/school/calendar/') && q.method === 'PATCH') {
    const value = events.find((e) => e.id === p.split('/').pop());
    Object.assign(value, JSON.parse(raw));
    return send(r, 200, value);
  }
  if (p === '/staff-attendance/context')
    return send(r, 200, {
      employee: {
        id: id(10),
        fullName: identity.name,
        teacher: { id: id(5) },
        role: identity.role,
        isPrincipal: false,
      },
      serverNow: new Date().toISOString(),
      date: date(),
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
    });
  if (p === '/staff-attendance/location')
    return send(r, 200, {
      status: 'UNVERIFIED',
      reason: 'PERMISSION_DENIED',
      distanceM: null,
      accuracyM: null,
      serverNow: new Date().toISOString(),
      policy: { attendanceMode: 'REVIEW', geofenceConfigured: false, geofenceRadiusM: 100 },
    });
  if (p === '/teaching-assignments/me/context')
    return send(r, 200, { teacherId: id(profile === 'HUMAS' ? 6 : 5) });
  const page = (data) => ({ data, total: data.length, page: 1, limit: 100 });
  if (p === '/class-sessions')
    return send(
      r,
      state.homeError ? 503 : 200,
      state.homeError ? { message: 'Fixture outage' } : page([row(profile)]),
    );
  if (p.includes('/class-sessions/') && p.endsWith('/start')) {
    state.starts++;
    sessionsStatus = 'STARTED';
    return send(r, 200, row(profile));
  }
  if (p === '/class-activities') return send(r, 200, page([]));
  if (p.startsWith('/attendance/student-sessions/sessions/')) {
    const start = Date.now() - 600000;
    return send(r, 200, {
      sessionId: id(1),
      classId: id(3),
      date: date(),
      subject: 'Literasi Data QA',
      slots: [1, 2].map((jp, i) => ({
        jp,
        startAt: new Date(start + i * 2400000).toISOString(),
        endAt: new Date(start + (i + 1) * 2400000).toISOString(),
      })),
      students: [
        { id: id(91), name: 'QA Siswa 001', nis: '001234' },
        { id: id(94), name: 'QA Siswa 002', nis: '001235' },
      ],
      records: [1, 2].map((jp) => ({
        studentId: id(91),
        jp,
        status: 'hadir',
        notes: null,
        revision: 1,
      })),
    });
  }
  if (p === '/assessment/sessions')
    return send(
      r,
      200,
      page([
        {
          id: id(40),
          teacherId: id(profile === 'HUMAS' ? 6 : 5),
          classId: id(3),
          teachingAssignmentId: id(4),
          title: 'Asesmen QA',
          status: 'draft',
          academicYear: '2026/2027',
          semester: 1,
          questions: [],
          type: 'formatif',
          purpose: 'regular',
          durationMinutes: null,
          randomizeOrder: false,
          startedAt: null,
          completedAt: null,
        },
      ]),
    );
  if (p === '/attendance/student-sessions/overview') {
    state.jpReads++;
    return send(
      r,
      state.jpError ? 503 : 200,
      state.jpError
        ? { message: 'Fixture JP unavailable' }
        : overview(url.searchParams.get('scope') === 'own'),
    );
  }
  if (p === '/users' && q.method === 'GET') return send(r, 200, { ...page(knownUsers), limit: 20 });
  if (p.endsWith('/learner-credential') && q.method === 'PATCH') {
    const uid = p.split('/')[2],
      user = knownUsers.find((u) => u.id === uid);
    state.resets++;
    state.resetIds.push(uid);
    if (user.role === 'ORANG_TUA' && state.parentError) {
      call.status = 429;
      r.setHeader('retry-after', '30');
      return send(r, 429, { message: 'Fixture rate limit' });
    }
    return send(r, 200, {
      userId: user.id,
      role: user.role,
      fullName: user.fullName,
      username: user.role === 'SISWA' ? '001234' : '+628123000000',
      temporaryPassword: 'Synthetic#123!',
      requiresPasswordChange: true,
    });
  }
  if (p === '/auth/login-events') {
    const input = JSON.parse(raw || '{}');
    state.loginEvents.push({
      eventType: input.eventType,
      userAgentSupplied: typeof input.userAgent === 'string' && input.userAgent.length > 0,
    });
    return send(r, 201, { id: id(70) });
  }
  if (p === '/auth/heartbeat') return send(r, 204);
  if (p === '/operational-monitoring/snapshot')
    return send(r, 503, { message: 'Unrelated snapshot omitted by fixture' });
  if (p.includes('options'))
    return send(r, 200, {
      teachers: [],
      classes: [],
      subjects: [],
      academicYears: [],
      scope: { type: 'global', labels: [] },
    });
  if (['/school/majors', '/subjects', '/kktp-config'].includes(p)) return send(r, 200, []);
  if (p === '/schedules') return send(r, 200, page([]));
  return send(r, 200, page([]));
});
api.listen(3901, '127.0.0.1', () => {
  const app = cp.spawn(process.execPath, ['apps/web/server.js'], {
    cwd: '/app',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '0.0.0.0',
      PORT: '3900',
      NEXTAUTH_URL: config.origin,
      NEXTAUTH_SECRET: config.secret,
      API_URL: 'http://127.0.0.1:3901',
      KEYCLOAK_ISSUER: 'http://127.0.0.1:3901/realms/synthetic',
      KEYCLOAK_CLIENT_ID: 'synthetic-local',
      KEYCLOAK_CLIENT_SECRET: 'synthetic-only',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  app.on('exit', (code) => process.exit(code ?? 1));
  process.on('SIGTERM', () => {
    app.kill('SIGTERM');
    api.close();
  });
});
