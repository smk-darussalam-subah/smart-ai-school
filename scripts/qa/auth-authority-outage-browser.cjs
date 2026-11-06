'use strict';
// Real standalone Web -> its proxy/Server Component -> signed Nest guard -> disposable PostgreSQL.
// Domain/shell payloads and NextAuth login are explicit QA fixtures, not live Keycloak.
const fs = require('fs'),
  path = require('path'),
  os = require('os'),
  http = require('http'),
  https = require('https'),
  cp = require('child_process'),
  crypto = require('crypto');
const args = process.argv.slice(2),
  arg = (k) => {
    const i = args.indexOf(k);
    if (i < 0 || !args[i + 1]) throw Error('Required ' + k);
    return args[i + 1];
  };
const out = path.resolve(arg('--output')),
  repo = path.resolve(__dirname, '../..'),
  apiImage = arg('--api-image'),
  webImage = arg('--web-image');
if (fs.existsSync(out)) throw Error('Use a fresh evidence directory');
fs.mkdirSync(out, { recursive: true });
const { chromium } = require(arg('--playwright')),
  { encode } = require(arg('--jwt-module'));
const names = {
    db: 'diis-r01r02-db-20261104',
    api: 'diis-r01r02-api-20261104',
    web: 'diis-r01r02-web-20261104',
  },
  network = 'diis-r01r02-20261104',
  label = 'authority-outage-20261104';
const secret = crypto.randomBytes(32).toString('hex'),
  password = crypto.randomBytes(24).toString('hex'),
  key = crypto.randomBytes(24).toString('hex');
const result = {
  startedAt: new Date().toISOString(),
  cases: [],
  limitations: [
    'Real Linux standalone, proxy, signed JWT/JWKS, production KeycloakGuard/UserStatusService/filter and disposable PostgreSQL.',
    'NextAuth identity and unrelated domain/shell payloads are QA adapters; no live Keycloak, production, school ingress or capacity acceptance.',
  ],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
result.recipeSha256 = hash(fs.readFileSync(__filename));
result.fixtureSha256 = hash(
  fs.readFileSync(path.join(__dirname, 'auth-authority-outage-fixture.cjs')),
);
fs.copyFileSync(__filename, path.join(out, 'RECIPE.cjs'));
fs.copyFileSync(
  path.join(__dirname, 'auth-authority-outage-fixture.cjs'),
  path.join(out, 'FIXTURE.cjs'),
);
function command(exe, a, input) {
  const p = cp.spawnSync(exe, a, {
    input,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 8e6,
  });
  if (p.error || p.status !== 0) throw Error(p.error?.message || p.stderr || p.stdout);
  return p.stdout.trim();
}
const docker = (...a) => command('docker', a),
  save = (f, v) => fs.writeFileSync(path.join(out, f), JSON.stringify(v, null, 2));
const check = (row, name, pass) => row.checks.push({ name, pass: Boolean(pass) });
let apiUrl,
  appPort,
  origin,
  proxy,
  browser,
  webProcess,
  tls,
  bootstrap,
  dbCreated = false,
  apiCreated = false,
  netCreated = false,
  webCreated = false;
const listen = (s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)));
async function ready(fn, seconds = 45) {
  for (let i = 0; i < seconds; i++) {
    try {
      if (await fn()) return;
    } catch {}
    await sleep(1000);
  }
  throw Error('Local readiness deadline');
}
const ctl = async (state) => {
  const r = await fetch(apiUrl + '/__proof/control', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-proof-key': key },
    body: JSON.stringify(state ? { state } : {}),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error('QA control ' + r.status);
  return r.json();
};
const pgReady = () =>
  cp.spawnSync('docker', ['exec', names.db, 'pg_isready', '-U', 'postgres'], {
    encoding: 'utf8',
    windowsHide: true,
  }).status === 0;
async function cookie(context) {
  const now = Math.floor(Date.now() / 1000),
    value = await encode({
      secret,
      token: {
        sub: 'qa-TEACHER',
        keycloakId: 'qa-TEACHER',
        name: 'QA Guru',
        roles: ['GURU'],
        accessToken: 'qa-TEACHER-access-1',
        refreshToken: 'qa-TEACHER-refresh-1',
        browserSessionId: 'qa-TEACHER-nonce-1',
        consentVersion: 'v1.0',
        expiresAt: now + 3600,
        refreshedAt: now,
      },
    });
  await context.addCookies([
    {
      name: '__Secure-next-auth.session-token',
      value,
      url: origin,
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}
function fixture() {
  let s = fs.readFileSync(path.join(__dirname, 'teacher-workspace-fixture.cjs'), 'utf8');
  const needle = '  const access = String(q.headers.authorization';
  if (!s.includes(needle)) throw Error('Fixture contract changed');
  s = s.replace(
    needle,
    `  if(p==='/auth/me'||p==='/auth/session-status'){
    const upstream=http.request({hostname:'host.docker.internal',port:${new URL(apiUrl).port},path:'/api/v1'+p,method:'GET',headers:{authorization:'Bearer '+config.authorityToken}},response=>{r.writeHead(response.statusCode,response.headers);response.pipe(r);});
    upstream.on('error',()=>send(r,503,{message:'QA backend unavailable'}));upstream.end();return;
  }
${needle}`,
  );
  return (
    'globalThis.__teacherWorkspaceFixture=' +
    JSON.stringify({ origin, secret, authorityToken: bootstrap.token }) +
    ';\n' +
    s
  );
}
async function probe(page) {
  return page.evaluate(async () => {
    const r = await fetch('/api/backend/auth/me', { cache: 'no-store' });
    return {
      status: r.status,
      body: await r.json().catch(() => null),
      retry: r.headers.get('retry-after'),
    };
  });
}
async function journey(name, mobile) {
  const row = { name, checks: [], errors: [] };
  result.cases.push(row);
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    timezoneId: 'Asia/Jakarta',
    colorScheme: mobile ? 'dark' : 'light',
  });
  await cookie(context);
  if (mobile) await context.addInitScript(() => localStorage.setItem('diis-theme', 'dark'));
  const page = await context.newPage();
  page.on('pageerror', (e) => row.errors.push(e.message));
  try {
    await ctl('healthy');
    await page.goto(origin + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    check(row, 'Authorized dashboard renders', new URL(page.url()).pathname === '/dashboard');
    const healthy = await probe(page);
    check(row, 'Healthy signed API read 200', healthy.status === 200);
    if (healthy.status !== 200)
      throw Error('QA browser identity preflight failed: ' + healthy.status);
    await page.screenshot({ path: path.join(out, name + '-healthy.png'), fullPage: true });
    docker('stop', '-t', '1', names.db);
    const direct = await fetch(apiUrl + '/api/v1/auth/me', {
      headers: { authorization: 'Bearer ' + bootstrap.token },
    });
    row.directOutage = {
      status: direct.status,
      body: await direct.json(),
      retry: direct.headers.get('retry-after'),
    };
    check(
      row,
      'Actual guard/filter returns safe authority 503',
      row.directOutage.status === 503 &&
        row.directOutage.body.code === 'AUTHORITY_UNAVAILABLE' &&
        row.directOutage.retry === '2',
    );
    const outage = await probe(page);
    row.outage = outage;
    check(row, 'Real database outage is 503, not 401', outage.status === 503);
    check(
      row,
      'Web session precheck remains retryable without claiming expiry',
      Number(outage.retry) > 0 && !/berakhir|expired/i.test(outage.body?.message ?? ''),
    );
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(800);
    row.outageUrl = new URL(page.url()).pathname;
    check(
      row,
      'Server Component outage keeps dashboard instead of login',
      row.outageUrl === '/dashboard',
    );
    check(
      row,
      'Session cookie preserved during outage',
      (await context.cookies()).some((c) => c.name.startsWith('__Secure-next-auth.session-token')),
    );
    await page.screenshot({ path: path.join(out, name + '-outage.png'), fullPage: true });
    docker('start', names.db);
    await ready(pgReady);
    await ready(() => ctl('healthy'));
    const retry = page.getByRole('link', { name: 'Coba muat ulang', exact: true });
    await retry.waitFor();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
      retry.click(),
    ]);
    check(
      row,
      'Visible recovery action returns to dashboard without a new login',
      new URL(page.url()).pathname === '/dashboard',
    );
    const recovered = await probe(page);
    check(
      row,
      'Same browser session recovers to 200',
      recovered.status === 200 && new URL(page.url()).pathname === '/dashboard',
    );
    await page.screenshot({ path: path.join(out, name + '-recovered.png'), fullPage: true });
    await ctl('role-unavailable');
    const roleOutage = await probe(page);
    row.roleOutage = roleOutage;
    check(
      row,
      'Fresh permission-role lookup outage remains503 rather than false403',
      roleOutage.status === 503,
    );
    await page.goto(origin + '/dashboard', { waitUntil: 'domcontentloaded' });
    check(
      row,
      'Role lookup outage preserves dashboard route instead of login or access-denied',
      new URL(page.url()).pathname === '/dashboard',
    );
    await page.screenshot({ path: path.join(out, name + '-role-outage.png'), fullPage: true });
    await ctl('healthy');
    const roleRetry = page.getByRole('link', { name: 'Coba muat ulang', exact: true });
    await roleRetry.waitFor({ timeout: 15000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
      roleRetry.click(),
    ]);
    check(
      row,
      'Visible retry after role outage restores the same session',
      (await probe(page)).status === 200 && new URL(page.url()).pathname === '/dashboard',
    );
    await page.screenshot({ path: path.join(out, name + '-role-recovered.png'), fullPage: true });
    await page.goto(origin + '/dashboard/executive', { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 20000 });
    check(
      row,
      'Teacher executive access denied and Beranda recovers',
      new URL(page.url()).pathname === '/dashboard',
    );
    await ctl('revoked');
    check(row, 'Genuine revoked signed session remains 401', (await probe(page)).status === 401);
    await page.goto(origin + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForURL((u) => u.pathname === '/login', { timeout: 20000 });
    check(
      row,
      'Genuine revocation still redirects login',
      new URL(page.url()).pathname === '/login',
    );
    await page.screenshot({ path: path.join(out, name + '-revoked.png'), fullPage: true });
    check(row, 'No uncaught render/runtime exception', row.errors.length === 0);
  } catch (e) {
    row.failure = e.message;
    check(row, 'Journey completed', false);
    await page
      .screenshot({ path: path.join(out, name + '-failure.png'), fullPage: true })
      .catch(() => {});
  } finally {
    if (!pgReady()) {
      docker('start', names.db);
      await ready(pgReady);
    }
    await ready(() => ctl('healthy'));
    await context.close();
    row.pass = row.checks.every((c) => c.pass);
    save('BROWSER-PROGRESS.json', result);
  }
}
(async () => {
  try {
    for (const n of [...Object.values(names), network]) {
      const p = cp.spawnSync('docker', ['inspect', n], { encoding: 'utf8', windowsHide: true });
      if (p.status === 0) throw Error('Existing resource preserved ' + n);
    }
    docker('network', 'create', '--label', 'diis.task=' + label, network);
    netCreated = true;
    docker(
      'run',
      '-d',
      '--name',
      names.db,
      '--label',
      'diis.task=' + label,
      '--network',
      network,
      '--memory',
      '1g',
      '--cpus',
      '2',
      '-e',
      'POSTGRES_PASSWORD=' + password,
      '-e',
      'POSTGRES_DB=diis_authority_test',
      'pgvector/pgvector:pg16',
    );
    dbCreated = true;
    await ready(pgReady);
    const url = `postgresql://postgres:${password}@${names.db}:5432/diis_authority_test?connection_limit=5&pool_timeout=2&connect_timeout=1`;
    const migration = docker(
      'run',
      '--rm',
      '--network',
      network,
      '-e',
      'DATABASE_URL=' + url,
      '-e',
      'DIRECT_URL=' + url,
      '--entrypoint',
      'node',
      apiImage,
      '/app/node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--schema',
      '/app/packages/database/prisma/schema.prisma',
    );
    fs.writeFileSync(path.join(out, 'MIGRATE.log'), migration);
    docker(
      'run',
      '-d',
      '--name',
      names.api,
      '--label',
      'diis.task=' + label,
      '--network',
      network,
      '--memory',
      '512m',
      '--cpus',
      '2',
      '-p',
      '127.0.0.1::3001',
      '-e',
      'LAB_DATABASE_URL=' + url,
      '-e',
      'LAB_KEY=' + key,
      '-e',
      'NODE_ENV=production',
      '-v',
      path.join(__dirname, 'auth-authority-outage-fixture.cjs').replaceAll('\\', '/') +
        ':/lab/server.cjs:ro',
      '--entrypoint',
      'node',
      apiImage,
      '/lab/server.cjs',
    );
    apiCreated = true;
    apiUrl = 'http://127.0.0.1:' + docker('port', names.api, '3001/tcp').split(':').pop();
    await ready(async () => {
      const r = await fetch(apiUrl + '/__proof/bootstrap', { headers: { 'x-proof-key': key } });
      if (!r.ok) return false;
      bootstrap = await r.json();
      return true;
    });
    result.apiImageId = docker('image', 'inspect', apiImage, '--format', '{{.Id}}');
    result.webImageId = docker('image', 'inspect', webImage, '--format', '{{.Id}}');
    result.signedTokenFingerprint = bootstrap.fingerprint;
    tls = fs.mkdtempSync(path.join(os.tmpdir(), 'diis-authority-browser-'));
    command(arg('--openssl'), [
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
      path.join(tls, 'key.pem'),
      '-out',
      path.join(tls, 'cert.pem'),
    ]);
    const reserved = http.createServer();
    appPort = await listen(reserved);
    await new Promise((r) => reserved.close(r));
    proxy = https.createServer(
      {
        key: fs.readFileSync(path.join(tls, 'key.pem')),
        cert: fs.readFileSync(path.join(tls, 'cert.pem')),
      },
      (q, r) => {
        const up = http.request(
          {
            hostname: '127.0.0.1',
            port: appPort,
            path: q.url,
            method: q.method,
            headers: {
              ...q.headers,
              'x-forwarded-proto': 'https',
              'x-forwarded-host': q.headers.host,
            },
          },
          (res) => {
            r.writeHead(res.statusCode, res.headers);
            res.pipe(r);
          },
        );
        up.on('error', () => {
          if (!r.headersSent) r.writeHead(502);
          r.end();
        });
        q.pipe(up);
        r.on('close', () => {
          if (!r.writableEnded) up.destroy();
        });
      },
    );
    origin = 'https://localhost:' + (await listen(proxy));
    webProcess = cp.spawn(
      'docker',
      [
        'run',
        '--rm',
        '-i',
        '--name',
        names.web,
        '--label',
        'diis.task=' + label,
        '--cpus',
        '2',
        '--memory',
        '1g',
        '-p',
        `127.0.0.1:${appPort}:3900`,
        '--entrypoint',
        'node',
        webImage,
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    webCreated = true;
    const webLogs = [];
    webProcess.stdout.on('data', (b) => webLogs.push(String(b)));
    webProcess.stderr.on('data', (b) => webLogs.push(String(b)));
    webProcess.stdin.end(fixture());
    await ready(
      () =>
        new Promise((resolve) => {
          const q = https.get(origin + '/login', { rejectUnauthorized: false }, (r) => {
            r.resume();
            resolve(r.statusCode === 200);
          });
          q.on('error', () => resolve(false));
        }),
    );
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: [
        '--ignore-certificate-errors',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
      ],
    });
    result.browser = browser.version();
    await journey('desktop', false);
    await journey('mobile-dark', true);
    const ledger = await ctl();
    result.apiCalls = ledger.calls;
    result.oneSignedTokenAcrossReads = new Set(ledger.calls.map((c) => c.tokenHash)).size === 1;
    result.pass = result.cases.every((c) => c.pass) && result.oneSignedTokenAcrossReads;
    fs.writeFileSync(path.join(out, 'WEB.log'), webLogs.join(''));
    save('RESULT.json', result);
    console.log(
      JSON.stringify({
        pass: result.pass,
        cases: result.cases.map((c) => ({
          name: c.name,
          pass: c.pass,
          failure: c.failure,
          failed: c.checks.filter((v) => !v.pass),
        })),
        oneSignedToken: result.oneSignedTokenAcrossReads,
      }),
    );
    if (!result.pass) process.exitCode = 1;
  } catch (e) {
    result.failure = e.message;
    save('FAILURE.json', result);
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (proxy) await new Promise((r) => proxy.close(r));
    const cleanup = [];
    for (const n of [names.web, names.api, names.db]) {
      try {
        const obj = JSON.parse(docker('inspect', n))[0];
        if (obj.Config.Labels?.['diis.task'] !== label) continue;
        try {
          const logs = docker('logs', n)
            .replaceAll(password, '[redacted]')
            .replaceAll(key, '[redacted]')
            .replaceAll(bootstrap?.token ?? '__absent__', '[redacted-token]');
          fs.writeFileSync(path.join(out, n + '.log'), logs);
        } catch {}
        docker('rm', '-f', '-v', n);
        cleanup.push(n);
      } catch {}
    }
    if (netCreated) docker('network', 'rm', network);
    if (tls) {
      const base = path.resolve(os.tmpdir()) + path.sep;
      if (
        !path.resolve(tls).startsWith(base) ||
        !path.basename(tls).startsWith('diis-authority-browser-')
      )
        throw Error('Invalid temp cleanup target');
      fs.rmSync(tls, { recursive: true, force: true });
    }
    save('CLEANUP.json', {
      removed: cleanup,
      remaining: docker(
        'ps',
        '-a',
        '--filter',
        'label=diis.task=' + label,
        '--format',
        '{{.Names}}',
      ),
    });
  }
})();
