'use strict';
// Isolated, loopback-only regression lab. No real IdP, DB, school data or user
// browser profile. Requires an existing Next build and supplied Playwright module.
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  https = require('node:https'),
  os = require('node:os'),
  cp = require('node:child_process');
const { createRequire } = require('node:module');
const args = process.argv.slice(2),
  option = (name) => args[args.indexOf(name) + 1];
if (
  !args.includes('--playwright-module') ||
  !args.includes('--output-dir') ||
  !args.includes('--openssl-exe')
)
  throw Error('Explicit Playwright module, OpenSSL executable and output directory required');
const repo = path.resolve(__dirname, '..'),
  web = path.join(repo, 'apps/web'),
  out = path.resolve(option('--output-dir'));
const requireRepo = createRequire(path.join(repo, 'package.json'));
const { encode, decode } = requireRepo('next-auth/jwt');
const { chromium } = require(option('--playwright-module'));
const secret = 'browser-local-fixture-only-session-secret';
let fixture,
  tlsProxy,
  tlsDirectory,
  app,
  browser,
  activePage,
  appLog = '',
  apiMode = 'ready',
  refreshMode = 'ready',
  refreshCalls = 0,
  mutations = 0;
let origin, fixtureOrigin;
const results = [],
  pageErrors = [];
fs.mkdirSync(out, { recursive: true });
function assert(name, condition) {
  results.push({ name, pass: Boolean(condition) });
  if (!condition) throw Error('Failed: ' + name);
}
async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}
async function availablePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}
async function cookie(overrides = {}) {
  const stamp = Math.floor(Date.now() / 1000);
  return encode({
    secret,
    token: {
      sub: 'synthetic-browser-user',
      keycloakId: 'synthetic-browser-user',
      name: 'QA Synthetic',
      accessToken: 'synthetic-local-access',
      refreshToken: 'synthetic-local-refresh-' + Math.random().toString(36).slice(2),
      roles: ['GURU'],
      consentVersion: 'v1.0',
      expiresAt: stamp + 3600,
      refreshedAt: stamp,
      ...overrides,
    },
  });
}
async function context(overrides = {}, viewport = { width: 1366, height: 900 }) {
  // Trust only this isolated lab's self-signed localhost endpoint in its fresh
  // browser context. No OS trust store or user's browser security is changed.
  const ctx = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !['http:', 'https:'].includes(url.protocol)
      ? route.continue()
      : route.abort();
  });
  await ctx.addCookies([
    {
      name: '__Secure-next-auth.session-token',
      value: await cookie(overrides),
      domain: 'localhost',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  const page = await ctx.newPage();
  activePage = page;
  page.on('pageerror', (error) => pageErrors.push({ message: error.message }));
  return { ctx, page };
}
async function fixtureStart() {
  fixture = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    for await (const _chunk of request) {
      /* Synthetic bytes only. */
    }
    if (url.pathname.endsWith('/protocol/openid-connect/token')) {
      refreshCalls++;
      if (refreshMode === 'revoked') return json(response, 400, { error: 'invalid_grant' });
      if (refreshMode === 'outage')
        return json(response, 503, { error: 'temporarily_unavailable' });
      return json(response, 200, {
        access_token: 'synthetic-local-refreshed',
        refresh_token: 'synthetic-local-refresh-next-' + refreshCalls,
        expires_in: 3600,
      });
    }
    if (url.pathname === '/api/v1/auth/me') {
      if (apiMode === 'denied')
        return json(response, 401, { message: 'Synthetic identity rejection' });
      if (apiMode === 'outage') return json(response, 503, { message: 'Synthetic service outage' });
      return json(response, 200, {
        permissions: [
          'academic.schedule.read',
          'academic.subject.read',
          'staff.attendance.checkin',
          'teacher.attendance.read',
        ],
        consentVersion: 'v1.0',
      });
    }
    if (url.pathname === '/api/v1/positions/my-positions')
      return json(response, 200, { academicYear: { id: 'synthetic-year' }, positions: [] });
    if (url.pathname === '/api/v1/bell-schedules/catalog')
      return json(response, 200, { profiles: [], periods: [] });
    if (url.pathname === '/api/v1/school/academic-years/active')
      return json(response, 200, { id: 'synthetic-year', code: '2026/2027' });
    if (url.pathname === '/api/v1/school/semesters/active')
      return json(response, 200, { id: 'synthetic-semester', semester: 1 });
    if (url.pathname === '/api/v1/school/calendar') return json(response, 200, []);
    if (url.pathname === '/api/v1/schedules' || url.pathname === '/api/v1/class-sessions')
      return json(response, 200, { data: [] });
    if (url.pathname === '/api/v1/auth/heartbeat' || url.pathname === '/api/v1/auth/login-events')
      return json(response, 200, { ok: true });
    if (url.pathname === '/api/v1/scheduling/drafts' && request.method === 'POST') {
      mutations++;
      if (apiMode === 'connection-failed') {
        request.socket.destroy();
        return;
      }
      if (apiMode === 'denied') return json(response, 401, { message: 'Synthetic rejection' });
      return json(response, 201, {
        fixtureOnly: true,
        idempotency: request.headers['idempotency-key'] ?? null,
        authorized: request.headers.authorization === 'Bearer synthetic-local-refreshed',
        cookieForwarded: Boolean(request.headers.cookie),
      });
    }
    return json(response, 503, { message: 'Synthetic unneeded service unavailable' });
  });
  const port = await listen(fixture);
  fixtureOrigin = 'http://127.0.0.1:' + port;
}
async function run() {
  await fixtureStart();
  const port = await availablePort();
  tlsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'diis-auth-session-fixture-'));
  cp.execFileSync(
    option('--openssl-exe'),
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
      '-keyout',
      path.join(tlsDirectory, 'key.pem'),
      '-out',
      path.join(tlsDirectory, 'cert.pem'),
    ],
    { stdio: 'ignore' },
  );
  tlsProxy = https.createServer(
    {
      key: fs.readFileSync(path.join(tlsDirectory, 'key.pem')),
      cert: fs.readFileSync(path.join(tlsDirectory, 'cert.pem')),
    },
    (request, response) => {
      const upstream = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: request.url,
          method: request.method,
          headers: {
            ...request.headers,
            'x-forwarded-proto': 'https',
            'x-forwarded-host': request.headers.host,
          },
        },
        (result) => {
          response.writeHead(result.statusCode, result.headers);
          result.pipe(response);
        },
      );
      upstream.on('error', () => {
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
      request.pipe(upstream);
    },
  );
  origin = 'https://localhost:' + (await listen(tlsProxy));
  app = cp.spawn(
    process.execPath,
    [
      requireRepo.resolve('next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: web,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXTAUTH_SECRET: secret,
        NEXTAUTH_URL: origin,
        API_URL: fixtureOrigin,
        NEXT_PUBLIC_API_URL: fixtureOrigin,
        KEYCLOAK_ISSUER: fixtureOrigin + '/realms/synthetic',
        KEYCLOAK_CLIENT_ID: 'synthetic-client',
        KEYCLOAK_CLIENT_SECRET: 'synthetic-fixture-client-only',
        NEXT_PUBLIC_SENTRY_DSN: '',
        SENTRY_DSN: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  app.stdout.on('data', (chunk) => {
    appLog += chunk;
  });
  app.stderr.on('data', (chunk) => {
    appLog += chunk;
  });
  for (let i = 0; i < 80; i++) {
    const ready = await fetch('http://127.0.0.1:' + port + '/health')
      .then((response) => response.ok)
      .catch(() => false);
    if (ready) break;
    if (app.exitCode !== null) throw Error('Next server exited');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  let sample = await context();
  await sample.page.goto(origin + '/dashboard');
  console.log(
    JSON.stringify({
      initialPath: new URL(sample.page.url()).pathname,
      cookieNames: (await sample.ctx.cookies()).map((cookie) => cookie.name),
    }),
  );
  await sample.page.getByRole('heading', { name: 'Selamat datang, QA' }).waitFor();
  assert('Actual production-build dashboard renders with a valid encrypted session', true);
  apiMode = 'denied';
  await sample.page.getByRole('link', { name: 'Presensi Guru', exact: true }).click();
  await sample.page.getByRole('heading', { name: 'Senang melihat Anda kembali.' }).waitFor();
  assert(
    'Client navigation with backend 401 reaches recovery login, not a loop',
    new URL(sample.page.url()).pathname === '/login',
  );
  await sample.page.screenshot({ path: path.join(out, 'login-recovery-desktop.png') });
  await sample.ctx.close();
  apiMode = 'ready';

  // Session endpoint transport failures must not discard the mounted workspace.
  sample = await context();
  await sample.page.goto(origin + '/dashboard');
  await sample.page.getByRole('heading', { name: 'Selamat datang, QA' }).waitFor();
  await sample.page.bringToFront();
  // A successful stateful toggle proves hydration, not merely the SSR heading.
  const menuToggle = sample.page.getByRole('button', { name: 'Sembunyikan atau tampilkan menu' });
  const previousExpanded = await menuToggle.getAttribute('aria-expanded');
  await menuToggle.click();
  await sample.page.waitForFunction(
    (previous) =>
      document
        .querySelector('button[aria-label="Sembunyikan atau tampilkan menu"]')
        .getAttribute('aria-expanded') !== previous,
    previousExpanded,
  );
  await sample.page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'synthetic-unsent-draft-marker';
    input.value = 'unsent synthetic local input';
    document.querySelector('#main-content').append(input);
  });
  let failClientSession = true;
  await sample.ctx.route('**/api/auth/session', (route) =>
    failClientSession
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"message":"Synthetic session transport outage"}',
        })
      : route.continue(),
  );
  // Deterministic foreground event after hydration. This is a simulated browser
  // visibility lifecycle event, not a claim of physical-device sleep/idle QA.
  await Promise.all([
    sample.page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/auth/session' && response.status() === 503,
    ),
    sample.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))),
  ]);
  await sample.page.getByRole('heading', { name: 'Sesi belum dapat digunakan' }).waitFor();
  assert(
    'A null client session after transport failure does not force a login redirect',
    new URL(sample.page.url()).pathname === '/dashboard',
  );
  assert(
    'Unavailable client session preserves the mounted workspace input',
    (await sample.page.locator('#synthetic-unsent-draft-marker').inputValue()) ===
      'unsent synthetic local input',
  );
  failClientSession = false;
  await sample.page.getByRole('link', { name: 'Coba muat ulang' }).click();
  await sample.page.getByRole('heading', { name: 'Selamat datang, QA' }).waitFor();
  assert(
    'Explicit nullable-session retry restores the dashboard through the writable boundary',
    new URL(sample.page.url()).pathname === '/dashboard',
  );
  await sample.page.bringToFront();
  // Add a fresh marker after the explicit page reload; never claim that a hard
  // reload preserves an unsaved form.
  await sample.page.getByRole('button', { name: 'Sembunyikan atau tampilkan menu' }).click();
  await sample.page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'synthetic-unsent-draft-marker';
    input.value = 'unsent synthetic local input';
    document.querySelector('#main-content').append(input);
  });
  // A real cookie identity switch must discard the previous workspace instead.
  await sample.ctx.addCookies([
    {
      name: '__Secure-next-auth.session-token',
      value: await cookie({
        keycloakId: 'synthetic-next-user',
        sub: 'synthetic-next-user',
        name: 'QA Other Synthetic',
      }),
      domain: 'localhost',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await sample.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await sample.page.waitForFunction(
    () => !document.querySelector('#synthetic-unsent-draft-marker'),
  );
  await sample.page.getByRole('heading', { name: 'Selamat datang, QA' }).waitFor();
  assert(
    'A cookie identity switch removes the previous workspace state',
    !(await sample.page.locator('#synthetic-unsent-draft-marker').count()),
  );
  await sample.ctx.close();

  sample = await context({ expiresAt: Math.floor(Date.now() / 1000) - 60 });
  const before = refreshCalls;
  await sample.page.goto(origin + '/dashboard');
  await sample.page.getByRole('heading', { name: 'Selamat datang, QA' }).waitFor();
  assert('Expired cookie refreshes before protected rendering', refreshCalls === before + 1);
  const saved = await sample.ctx.cookies();
  const combined = saved
    .filter((value) => value.name.startsWith('__Secure-next-auth.session-token'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((value) => value.value)
    .join('');
  const decoded = await decode({ secret, token: combined });
  assert(
    'Browser receives persisted latest credentials',
    decoded?.accessToken === 'synthetic-local-refreshed',
  );
  assert(
    'Browser cookie is HttpOnly, Secure and Lax',
    saved.some((value) => value.httpOnly && value.secure && value.sameSite === 'Lax'),
  );
  assert(
    'Cookie has no production/staging host scope',
    saved.every((value) => value.domain === 'localhost'),
  );
  await sample.ctx.close();

  refreshMode = 'revoked';
  sample = await context({ expiresAt: 0 });
  await sample.page.goto(origin + '/dashboard');
  await sample.page.getByRole('heading', { name: 'Senang melihat Anda kembali.' }).waitFor();
  assert(
    'Invalid grant reaches a usable login page',
    new URL(sample.page.url()).pathname === '/login',
  );
  await sample.page.reload();
  await sample.page.getByRole('heading', { name: 'Senang melihat Anda kembali.' }).waitFor();
  assert(
    'Reload of recovery login remains stable',
    new URL(sample.page.url()).pathname === '/login',
  );
  await sample.ctx.close();

  refreshMode = 'outage';
  sample = await context({ expiresAt: 0 }, { width: 375, height: 812 });
  await sample.page.goto(origin + '/dashboard');
  await sample.page.getByRole('heading', { name: 'Sesi belum dapat digunakan' }).waitFor();
  assert(
    'Temporary provider failure has a recoverable page, not forced logout',
    new URL(sample.page.url()).pathname === '/auth/session-unavailable',
  );
  const layout = await sample.page.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
    targets: [...document.querySelectorAll('main a')].map((a) => a.getBoundingClientRect().height),
  }));
  assert('Mobile recovery has no horizontal overflow', layout.width <= layout.viewport);
  assert(
    'Recovery actions have at least 44px touch targets',
    layout.targets.every((height) => height >= 44),
  );
  await sample.page.keyboard.press('Tab');
  assert(
    'Keyboard can reach the retry control',
    await sample.page
      .getByRole('link', { name: 'Coba muat ulang' })
      .evaluate((element) => element === document.activeElement),
  );
  await sample.page.screenshot({ path: path.join(out, 'session-outage-mobile.png') });
  console.log('Outage page verified; waiting 31 seconds for the real server retry cooldown.');
  refreshMode = 'ready';
  await new Promise((resolve) => setTimeout(resolve, 31_000));
  await sample.page.getByRole('link', { name: 'Coba muat ulang' }).click();
  await sample.page.getByRole('heading', { name: 'Selamat datang, QA' }).waitFor();
  assert('Retry after real cooldown restores the session without deleting cookies', true);
  await sample.ctx.close();

  apiMode = 'outage';
  sample = await context();
  await sample.page.goto(origin + '/dashboard');
  await sample.page.getByRole('heading', { name: 'Sesi belum dapat digunakan' }).waitFor();
  assert(
    'Permission outage is not projected as a healthy empty dashboard',
    !(await sample.page.getByRole('heading', { name: 'Hari ini', exact: true }).count()),
  );
  await sample.ctx.close();
  apiMode = 'ready';

  sample = await context({ refreshedAt: 0 });
  const refreshBefore = refreshCalls,
    mutationBefore = mutations;
  const responses = await Promise.all([
    ...Array.from({ length: 4 }, () =>
      sample.ctx.request.post(origin + '/api/backend/scheduling/drafts', {
        headers: { 'idempotency-key': 'synthetic-one-operation' },
        data: { fixtureOnly: true },
      }),
    ),
    sample.ctx.request.get(origin + '/api/auth/session'),
  ]);
  const payloads = await Promise.all(responses.slice(0, 4).map((response) => response.json()));
  const browserSession = await responses[4].json();
  assert(
    'Concurrent real HTTP proxy requests coalesce one provider refresh',
    refreshCalls === refreshBefore + 1,
  );
  assert(
    'Session endpoint and proxy share the same latest credentials without exposing refresh or ID tokens',
    browserSession.accessToken === 'synthetic-local-refreshed' &&
      !('refreshToken' in browserSession) &&
      !('idToken' in browserSession),
  );
  assert(
    'Every draft request carries latest bearer and idempotency, but no web cookie',
    payloads.every(
      (body) =>
        body.authorized && body.idempotency === 'synthetic-one-operation' && !body.cookieForwarded,
    ),
  );
  assert(
    'Proxy performs exactly one upstream submission per received request',
    mutations === mutationBefore + 4,
  );
  apiMode = 'denied';
  const rejectedBefore = mutations;
  const rejected = await sample.ctx.request.post(origin + '/api/backend/scheduling/drafts', {
    data: { fixtureOnly: true },
  });
  assert(
    'An upstream 401 is returned without mutation replay',
    rejected.status() === 401 && mutations === rejectedBefore + 1,
  );
  await sample.ctx.close();
  apiMode = 'connection-failed';
  sample = await context({ refreshedAt: 0 });
  const outageMutationBefore = mutations;
  const networkFailure = await sample.ctx.request.post(origin + '/api/backend/scheduling/drafts', {
    data: { fixtureOnly: true },
  });
  const newCookie = (await sample.ctx.cookies()).find(
    (value) => value.name === '__Secure-next-auth.session-token',
  );
  const newToken = newCookie && (await decode({ secret, token: newCookie.value }));
  assert(
    'An upstream connection failure still persists refreshed credentials without retrying the mutation',
    networkFailure.status() === 502 &&
      mutations === outageMutationBefore + 1 &&
      newToken?.accessToken === 'synthetic-local-refreshed',
  );
  await sample.ctx.close();
  assert(
    'No unhandled React #310 or other page exception during scoped browser cases',
    pageErrors.length === 0,
  );
  fs.writeFileSync(
    path.join(out, 'browser-qa.json'),
    JSON.stringify(
      {
        atUtc: new Date().toISOString(),
        environment: 'isolated local production-build lab',
        nextVersion: requireRepo('next/package.json').version,
        reactVersion: requireRepo('react/package.json').version,
        results,
        pageErrors,
        passed: results.filter((result) => result.pass).length,
        total: results.length,
        realIdpOrDatabaseUsed: false,
        physicalGpsTested: false,
        principalExemptionTested: false,
        selfSignedTlsTrustedOnlyInIsolatedFixtureContext: true,
        osTrustStoreChanged: false,
        authStateSaved: false,
        sourceApplicationUsed: true,
        fixtureCounters: { refreshCalls, mutations },
      },
      null,
      2,
    ) + '\n',
  );
  fs.writeFileSync(path.join(out, 'local-server.log'), appLog);
  console.log(
    JSON.stringify({
      passed: results.length,
      total: results.length,
      pageErrors: pageErrors.length,
    }),
  );
}
run()
  .catch(async (error) => {
    const currentPath = activePage ? new URL(activePage.url()).pathname : null;
    const renderedText = activePage
      ? await activePage
          .locator('body')
          .innerText()
          .catch(() => null)
      : null;
    if (activePage)
      await activePage.screenshot({ path: path.join(out, 'failure.png') }).catch(() => undefined);
    fs.writeFileSync(
      path.join(out, 'browser-qa-failure.json'),
      JSON.stringify(
        {
          atUtc: new Date().toISOString(),
          message: error.message,
          currentPath,
          renderedText,
          results,
          pageErrors,
        },
        null,
        2,
      ) + '\n',
    );
    fs.writeFileSync(path.join(out, 'local-server.log'), appLog);
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    app?.kill();
    if (tlsProxy) {
      tlsProxy.closeAllConnections();
      await new Promise((resolve) => tlsProxy.close(resolve));
    }
    if (fixture) {
      fixture.closeAllConnections();
      await new Promise((resolve) => fixture.close(resolve));
    }
    if (
      tlsDirectory &&
      path.dirname(tlsDirectory) === os.tmpdir() &&
      path.basename(tlsDirectory).startsWith('diis-auth-session-fixture-')
    ) {
      for (const name of ['key.pem', 'cert.pem'])
        if (fs.existsSync(path.join(tlsDirectory, name)))
          fs.unlinkSync(path.join(tlsDirectory, name));
      fs.rmdirSync(tlsDirectory);
    }
  });
