'use strict';

// Production-build regression: real Next routing, SSR, hydration and client
// interactions; synthetic encrypted Guru session and loopback HTTP backend.
// Exit 1 means an application assertion failed; exit 2 is a harness failure.
// A recovered page NEVER erases a preceding uncaught exception.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const https = require('node:https');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { exceptionFree } = require('./router-recovery-contract.cjs');
const argv = process.argv.slice(2);
function option(name) {
  const index = argv.indexOf(name);
  if (index < 0 || !argv[index + 1] || argv[index + 1].startsWith('--'))
    throw Error('Required option: ' + name);
  return argv[index + 1];
}
const repo = path.resolve(__dirname, '../..');
const inputRoot = argv.includes('--input-root') ? path.resolve(option('--input-root')) : repo;
const output = path.resolve(option('--output-dir'));
const image = option('--image');
const { chromium } = require(option('--playwright-module'));
const { encode } = require(option('--next-auth-module'));
const openssl = option('--openssl-exe');
const profile = argv.includes('--profile') ? option('--profile') : 'split-authority';
const attendanceProvider = !argv.includes('--without-attendance-provider');
if (
  ![
    'immediate',
    'authority-delayed',
    'slow-client',
    'warm-context',
    'native-browser',
    'split-authority',
  ].includes(profile)
)
  throw Error('Unknown timing profile');
const runId = crypto.randomBytes(6).toString('hex');
const containerName = 'diis-router-regression-' + runId;
const report = {
  startedAt: new Date().toISOString(),
  image,
  profile,
  attendanceProvider,
  cases: [],
  serverLogs: [],
  backendCalls: [],
  limitations: [
    'Synthetic signed session; real Keycloak omitted.',
    'Loopback backend adapter; Nest/database and live ingress omitted.',
    'Local image; no staging/production access.',
  ],
};
let browser, proxy, container, tlsDirectory, jwt;
let containerStarted = false;
let outputOwned = false;
function write(name, value) {
  fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n');
}
function command(program, args) {
  return cp.execFileSync(program, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 8e6,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  });
}
function check(row, name, actual) {
  row.checks.push({ name, pass: Boolean(actual) });
}
async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}
async function port() {
  const server = http.createServer();
  const value = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return value;
}
async function hydratedButton(page, label) {
  await page.waitForFunction(
    (name) => {
      const element = [...document.querySelectorAll('button')].find(
        (node) => node.getAttribute('aria-label') === name,
      );
      if (!element) return false;
      const key = Object.getOwnPropertyNames(element).find((value) =>
        value.startsWith('__reactProps'),
      );
      return Boolean(key && typeof element[key].onClick === 'function');
    },
    label,
    { timeout: 20000 },
  );
  return page.getByRole('button', { name: label, exact: true });
}
async function journey(id, requestedPath, viewport, anonymous = false) {
  const row = {
    id,
    requestedPath,
    viewport,
    checks: [],
    errors: [],
    consoleErrors: [],
    network: [],
    blockedExternal: [],
  };
  report.cases.push(row);
  const context = await browser.newContext({
    viewport,
    ignoreHTTPSErrors: true,
    serviceWorkers: profile === 'native-browser' ? 'allow' : 'block',
  });
  let page;
  try {
    // Do not install request routing: Playwright routing disables HTTP cache,
    // changing the very hydration timing investigated here. The isolated Chrome
    // process cannot resolve non-loopback hosts (launch host-resolver rules).
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== report.origin)
        row.blockedExternal.push(url.origin + url.pathname);
    });
    if (!anonymous)
      await context.addCookies([
        {
          name: '__Secure-next-auth.session-token',
          value: jwt,
          domain: 'localhost',
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);
    if (
      ['warm-context', 'native-browser'].includes(profile) &&
      requestedPath === '/dashboard/executive' &&
      !anonymous
    ) {
      const warmPage = await context.newPage();
      row.warmupErrors = [];
      warmPage.on('pageerror', (error) => row.warmupErrors.push(error.message));
      await warmPage.goto(report.origin + '/dashboard', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await warmPage
        .getByRole('heading', { name: 'Selamat datang, QA' })
        .waitFor({ timeout: 20000 });
      await hydratedButton(
        warmPage,
        viewport.width >= 768 ? 'Sembunyikan atau tampilkan menu' : 'Buka menu navigasi',
      );
      await warmPage.close();
      check(row, 'Warmup authorized page has no exception', row.warmupErrors.length === 0);
    }
    page = await context.newPage();
    if (profile === 'slow-client') {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 100,
        downloadThroughput: 500000,
        uploadThroughput: 200000,
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    page.on('pageerror', (error) =>
      row.errors.push({ at: new Date().toISOString(), message: error.message, stack: error.stack }),
    );
    page.on('console', (message) => {
      if (message.type() === 'error') row.consoleErrors.push(message.text());
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (['document', 'fetch', 'xhr'].includes(response.request().resourceType()))
        row.network.push({
          path: url.pathname,
          status: response.status(),
          method: response.request().method(),
          rsc: response.headers()['content-type']?.includes('text/x-component') === true,
          actionRedirect: response.headers()['x-action-redirect'] ?? null,
          actionRevalidated: response.headers()['x-action-revalidated'] ?? null,
          serverAction: Boolean(response.request().headers()['next-action']),
          setsCookie: Boolean(response.headers()['set-cookie']),
        });
    });
    const response = await page.goto(report.origin + requestedPath, {
      waitUntil: 'domcontentloaded',
      timeout: 40000,
    });
    row.initialHttp = response?.status();
    if (anonymous) {
      await page.waitForURL((url) => url.pathname === '/login', { timeout: 20000 });
      await page
        .getByRole('button', { name: /Lanjut dengan akun sekolah/ })
        .waitFor({ timeout: 15000 });
      check(row, 'Anonymous is redirected to login', new URL(page.url()).pathname === '/login');
    } else {
      await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 25000 });
      await page.getByRole('heading', { name: 'Selamat datang, QA' }).waitFor({ timeout: 25000 });
      check(row, 'Guru destination is Beranda', new URL(page.url()).pathname === '/dashboard');
      check(
        row,
        'Protected executive content absent',
        (await page.getByRole('heading', { name: 'Dasbor Eksekutif', exact: true }).count()) === 0,
      );
      const session = await context.request.get(report.origin + '/api/auth/session');
      const identity = await session.json();
      check(
        row,
        'Valid Guru session remains intact',
        session.ok() && JSON.stringify(identity.roles) === '["GURU"]',
      );
      if (attendanceProvider) {
        await page
          .getByRole('button', { name: 'Periksa lokasi', exact: true })
          .waitFor({ timeout: 15000 });
        check(row, 'Staff attendance provider stays mounted and offers location check', true);
      }
      if (viewport.width >= 768) {
        const toggle = await hydratedButton(page, 'Sembunyikan atau tampilkan menu');
        const previous = await toggle.getAttribute('aria-expanded');
        await toggle.click();
        await page.waitForFunction(
          (value) =>
            document
              .querySelector('button[aria-label="Sembunyikan atau tampilkan menu"]')
              ?.getAttribute('aria-expanded') !== value,
          previous,
          { timeout: 10000 },
        );
        check(row, 'Recovered shell responds to native click', true);
        await toggle.click();
        await page.getByRole('link', { name: 'Panduan halaman', exact: true }).click();
        await page
          .getByRole('heading', { name: 'Panduan DIIS', exact: true })
          .waitFor({ timeout: 25000 });
        check(
          row,
          'Real client navigation to guide completes',
          new URL(page.url()).pathname === '/dashboard/panduan',
        );
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.getByRole('heading', { name: 'Selamat datang, QA' }).waitFor({ timeout: 20000 });
        check(
          row,
          'Browser back returns usable Beranda',
          new URL(page.url()).pathname === '/dashboard',
        );
      } else {
        const menu = await hydratedButton(page, 'Buka menu navigasi');
        await menu.click();
        await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 10000 });
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 10000 });
        check(row, 'Recovered mobile menu opens and closes by keyboard', true);
      }
    }
    // Observe beyond completed hydration/interactions, not a loading screenshot.
    await page.waitForTimeout(1200);
    if (!anonymous && argv.includes('--expect-json-activity')) {
      check(
        row,
        'Background activity completes via JSON without dispatching a Server Action',
        row.network.filter(
          (item) =>
            item.path === '/api/auth/activity' && item.method === 'POST' && item.status === 204,
        ).length >= 2 && !row.network.some((item) => item.serverAction),
      );
    }
    row.finalPath = new URL(page.url()).pathname;
    check(
      row,
      'No application error screen',
      !/Application error: a client-side exception/.test(await page.locator('body').innerText()),
    );
    check(
      row,
      'No uncaught exception throughout navigation and recovery',
      exceptionFree(row.errors, row.consoleErrors),
    );
    check(row, 'No unexpected external browser request', row.blockedExternal.length === 0);
    await page.screenshot({ path: path.join(output, id + '.png'), fullPage: true });
  } catch (error) {
    row.executionError = error.message;
    check(row, 'Journey reaches all expected states within deadline', false);
    if (page)
      await page
        .screenshot({ path: path.join(output, id + '-failure.png'), fullPage: true })
        .catch(() => {});
  } finally {
    row.pass = row.checks.every((item) => item.pass) && !row.executionError;
    await context.close();
    write('RESULT.json', report);
    console.log(
      JSON.stringify({
        id,
        pass: row.pass,
        errors: row.errors.map((item) => item.message),
        executionError: row.executionError,
      }),
    );
  }
}
async function activityHttp() {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  report.activityHttp = [];
  try {
    for (const [id, expected, method, body, authenticated, origin, contentType] of [
      [
        'HEARTBEAT',
        204,
        'POST',
        '{"eventType":"heartbeat"}',
        true,
        report.origin,
        'application/json',
      ],
      ['LOGIN', 204, 'POST', '{"eventType":"login"}', true, report.origin, 'application/json'],
      [
        'ANONYMOUS',
        401,
        'POST',
        '{"eventType":"heartbeat"}',
        false,
        report.origin,
        'application/json',
      ],
      [
        'FOREIGN-ORIGIN',
        403,
        'POST',
        '{"eventType":"heartbeat"}',
        true,
        'https://untrusted.invalid',
        'application/json',
      ],
      ['INVALID-JSON', 400, 'POST', '{broken', true, report.origin, 'application/json'],
      [
        'IDENTITY-INJECTION',
        400,
        'POST',
        '{"eventType":"login","userId":"forged"}',
        true,
        report.origin,
        'application/json',
      ],
      ['OVERSIZE', 413, 'POST', ' '.repeat(129), true, report.origin, 'application/json'],
      [
        'WRONG-CONTENT-TYPE',
        415,
        'POST',
        '{"eventType":"heartbeat"}',
        true,
        report.origin,
        'text/plain',
      ],
      ['READ-NO-MUTATION', 405, 'GET', undefined, true, report.origin, 'application/json'],
    ]) {
      // Explicit synthetic cookie per request: the anonymous control cannot
      // inherit renewed credentials from a previous response's cookie jar.
      const response = await context.request.fetch(report.origin + '/api/auth/activity', {
        method,
        data: body,
        timeout: 15000,
        maxRedirects: 0,
        headers: {
          Origin: origin,
          'Content-Type': contentType,
          Cookie: authenticated ? '__Secure-next-auth.session-token=' + jwt : '',
        },
      });
      const row = {
        id,
        expected,
        status: response.status(),
        noRedirect: !response.headers()['location'] && !response.headers()['x-action-redirect'],
        noRsc: !response.headers()['content-type']?.includes('text/x-component'),
      };
      row.pass = row.status === expected && row.noRedirect && row.noRsc;
      report.activityHttp.push(row);
    }
  } finally {
    await context.close();
  }
}
async function main() {
  if (fs.existsSync(path.join(output, 'RESULT.json')))
    throw Error('Choose a fresh output directory; prior receipts must not be overwritten.');
  fs.mkdirSync(output, { recursive: true });
  outputOwned = true;
  report.head = command('git', ['-C', repo, 'rev-parse', 'HEAD']).trim();
  report.tree = command('git', ['-C', repo, 'rev-parse', 'HEAD^{tree}']).trim();
  report.sourceState = command('git', ['-C', repo, 'status', '--porcelain=v1']);
  const imageInfo = JSON.parse(command('docker', ['image', 'inspect', image]))[0];
  report.imageId = imageInfo.Id;
  if (imageInfo.Os !== 'linux') throw Error('A Linux standalone image is required.');
  const imageReceipt = JSON.parse(fs.readFileSync(option('--image-receipt'), 'utf8'));
  if (imageReceipt.imageId !== imageInfo.Id)
    throw Error('Image digest does not match the reviewed receipt');
  const binding = JSON.parse(fs.readFileSync(option('--input-binding'), 'utf8'));
  if (!Array.isArray(binding) || binding.length === 0) throw Error('Empty build input binding');
  for (const file of binding) {
    const target = path.resolve(inputRoot, file.path);
    if (!target.startsWith(inputRoot + path.sep))
      throw Error('Build input outside selected input root');
    const hash = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    if (hash !== file.sha256) throw Error('Image/source mismatch: ' + file.path);
  }
  report.imageSourceBinding = {
    count: binding.length,
    allMatch: true,
    receiptImageId: imageReceipt.imageId,
    sourceRoot: inputRoot,
  };
  const appPort = await port();
  tlsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'diis-router-tls-'));
  command(openssl, [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-keyout',
    path.join(tlsDirectory, 'key.pem'),
    '-out',
    path.join(tlsDirectory, 'cert.pem'),
  ]);
  proxy = https.createServer(
    {
      key: fs.readFileSync(path.join(tlsDirectory, 'key.pem')),
      cert: fs.readFileSync(path.join(tlsDirectory, 'cert.pem')),
    },
    (request, response) => {
      const upstream = http.request(
        {
          hostname: '127.0.0.1',
          port: appPort,
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
      request.on('aborted', () => upstream.destroy());
      response.on('close', () => {
        if (!response.writableEnded) upstream.destroy();
      });
      request.pipe(upstream);
    },
  );
  report.origin = 'https://localhost:' + (await listen(proxy));
  const secret = crypto.randomBytes(32).toString('hex');
  const token = crypto.randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  jwt = await encode({
    secret,
    token: {
      sub: 'synthetic-router-guru',
      keycloakId: 'synthetic-router-guru',
      name: 'QA Guru',
      roles: ['GURU'],
      accessToken: token,
      consentVersion: 'v1.0',
      expiresAt: now + 3600,
      refreshedAt: now,
    },
  });
  container = cp.spawn(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '--name',
      containerName,
      '--label',
      'com.diis.qa=built-router-recovery',
      '--memory',
      '1g',
      '--cpus',
      '2',
      '-p',
      '127.0.0.1:' + appPort + ':3900',
      '--entrypoint',
      'node',
      image,
    ],
    { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
  );
  containerStarted = true;
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('Fixture ready deadline')), 45000);
    const lines = readline.createInterface({ input: container.stdout });
    lines.on('line', (line) => {
      let item;
      try {
        item = JSON.parse(line);
      } catch {
        report.serverLogs.push(line);
        return;
      }
      if (item.type === 'ready') {
        report.versions = { next: item.next, react: item.react };
        clearTimeout(timeout);
        resolve();
      } else if (item.type === 'backend-call') report.backendCalls.push(item.call);
      else if (item.type === 'backend-calls') report.backendCalls = item.calls;
      else report.serverLogs.push(item);
    });
    container.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    container.on('exit', (code) => {
      if (!report.versions) {
        clearTimeout(timeout);
        reject(Error('Fixture exit ' + code));
      }
    });
  });
  container.stderr.on('data', (chunk) => report.serverLogs.push(String(chunk)));
  report.authorityDelayMs = profile === 'authority-delayed' ? 750 : 0;
  container.stdin.end(
    'globalThis.__routerFixture=' +
      JSON.stringify({
        origin: report.origin,
        secret,
        token,
        authorityDelayMs: report.authorityDelayMs,
        splitAuthority: profile === 'split-authority',
        attendanceProvider,
      }) +
      ';\n' +
      fs.readFileSync(path.join(__dirname, 'built-router-fixture.cjs'), 'utf8'),
  );
  await ready;
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
      ...(profile === 'native-browser' ? ['--ignore-certificate-errors'] : []),
    ],
  });
  report.browser = {
    channel: 'chrome',
    version: browser.version(),
    headless: true,
    hostNode: process.version,
  };
  if (!argv.includes('--focused-denial'))
    await journey('GURU-DIRECT-HOME', '/dashboard', { width: 1366, height: 900 });
  await journey('GURU-EXECUTIVE-DENIED-1', '/dashboard/executive', { width: 1366, height: 900 });
  if (!argv.includes('--focused-denial')) {
    await journey('GURU-EXECUTIVE-DENIED-2', '/dashboard/executive', { width: 1366, height: 900 });
    await journey('GURU-EXECUTIVE-DENIED-MOBILE', '/dashboard/executive', {
      width: 390,
      height: 844,
    });
    await journey(
      'ANONYMOUS-EXECUTIVE-DENIED',
      '/dashboard/executive',
      { width: 1366, height: 900 },
      true,
    );
  }
  if (argv.includes('--expect-json-activity')) await activityHttp();
  report.pass =
    report.cases.every((row) => row.pass) && (report.activityHttp ?? []).every((row) => row.pass);
  process.exitCode = report.pass ? 0 : 1;
}
main()
  .catch((error) => {
    report.harnessError = error.message;
    process.exitCode = 2;
  })
  .finally(async () => {
    if (browser) await browser.close().catch(() => {});
    if (containerStarted) {
      await new Promise((resolve) =>
        cp.execFile(
          'docker',
          ['stop', '--time', '5', containerName],
          { windowsHide: true, timeout: 15000 },
          () => resolve(),
        ),
      );
      report.cleanupContainerAbsent = !command('docker', [
        'ps',
        '-a',
        '--filter',
        'name=^/' + containerName + '$',
        '--format',
        '{{.Names}}',
      ]).trim();
      report.executiveBackendNotRead =
        report.backendCalls.length > 0 &&
        !report.backendCalls.some((call) => /\/(analytics|finance|spp)(\/|$)/.test(call.path));
      report.noAttendanceMutation = !report.backendCalls.some((call) =>
        /\/staff-attendance\/(check-in|check-out)$/.test(call.path),
      );
      if (argv.includes('--expect-json-activity')) {
        const events = report.backendCalls.filter((call) =>
          call.path.endsWith('/auth/login-events'),
        );
        report.loginMetadataPreserved =
          events.length > 0 &&
          events.every(
            (call) =>
              call.status === 200 &&
              call.activityPayload?.valid &&
              call.activityPayload?.userAgentSupplied,
          );
        if (!report.loginMetadataPreserved && process.exitCode !== 2) {
          report.pass = false;
          process.exitCode = 1;
        }
      }
      if (!report.executiveBackendNotRead && process.exitCode !== 2) {
        report.pass = false;
        process.exitCode = 1;
      }
    }
    if (proxy) {
      proxy.closeAllConnections();
      await new Promise((resolve) => proxy.close(resolve));
    }
    if (tlsDirectory) {
      for (const name of ['key.pem', 'cert.pem']) fs.unlinkSync(path.join(tlsDirectory, name));
      fs.rmdirSync(tlsDirectory);
    }
    report.endedAt = new Date().toISOString();
    report.exitCode = process.exitCode ?? 0;
    if (outputOwned) write('RESULT.json', report);
    console.log(
      JSON.stringify({
        pass: report.pass,
        exitCode: report.exitCode,
        harnessError: report.harnessError,
        output,
      }),
    );
  });
