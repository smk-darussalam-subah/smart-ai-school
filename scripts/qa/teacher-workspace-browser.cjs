'use strict';
// Actual standalone browser + explicit loopback backend adapter. No live service.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const http = require('node:http'),
  https = require('node:https'),
  cp = require('node:child_process'),
  crypto = require('node:crypto');
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  if (i < 0 || !args[i + 1]) throw Error('Required ' + name);
  return args[i + 1];
};
const output = path.resolve(arg('--output')),
  image = arg('--image');
const { chromium } = require(arg('--playwright'));
const { encode } = require(arg('--jwt-module'));
const command = (exe, argv) =>
  cp.execFileSync(exe, argv, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 45000,
    maxBuffer: 8e6,
  });
const result = {
  startedAt: new Date().toISOString(),
  image,
  cases: [],
  limitations: [
    'Real built Next UI and Server Actions; synthetic encrypted sessions and HTTP backend adapter.',
    'Actual JWT/JWKS/guards/services/PostgreSQL are verified separately.',
    'No live Keycloak, shared ingress, staging or production in this browser recipe.',
  ],
};
let browser,
  proxy,
  container,
  tls,
  running = false;
const name = 'diis-teacher-browser-' + crypto.randomBytes(5).toString('hex');
const secret = crypto.randomBytes(32).toString('hex');
const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function check(row, name, actual) {
  row.checks.push({ name, pass: Boolean(actual) });
}
function control(input) {
  const script = `const http=require('http');const body=${JSON.stringify(input ? JSON.stringify(input) : '')};const q=http.request({hostname:'127.0.0.1',port:3901,path:${JSON.stringify(input ? '/__fixture/control' : '/__fixture/state')},method:${JSON.stringify(input ? 'POST' : 'GET')},headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)}},r=>{r.pipe(process.stdout)});q.on('error',e=>{console.error(e.message);process.exitCode=1});q.end(body);`;
  return JSON.parse(command('docker', ['exec', name, 'node', '-e', script]));
}
async function session(context, profile, serial = 1, legacy = false) {
  const role = { TEACHER: 'GURU', HUMAS: 'GURU', ADMIN: 'SUPER_ADMIN', TU: 'TATA_USAHA' }[profile];
  const now = Math.floor(Date.now() / 1000);
  const jwt = await encode({
    secret,
    token: {
      sub: 'qa-' + profile,
      keycloakId: 'qa-' + profile,
      name: 'QA ' + (profile === 'TEACHER' ? 'Guru' : profile),
      roles: [role],
      accessToken: `qa-${profile}-access-${serial}`,
      refreshToken: `qa-${profile}-refresh-${serial}`,
      browserSessionId: `qa-${profile}-nonce-${serial}`,
      consentVersion: 'v1.0',
      expiresAt: now + 3600,
      refreshedAt: now,
      ...(legacy ? { idToken: 'legacy-fixture-' + 'x'.repeat(3300) } : {}),
    },
  });
  const chunk = 3800,
    list = [];
  for (let i = 0; i < jwt.length; i += chunk)
    list.push({
      name: '__Secure-next-auth.session-token' + (jwt.length > chunk ? '.' + i / chunk : ''),
      value: jwt.slice(i, i + chunk),
      domain: 'localhost',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
    });
  await context.addCookies(list);
}
async function journey(key, profile, route, run, options = {}) {
  if(args.includes('--case') && arg('--case')!==key)return;
  const row = { id: key, checks: [], errors: [], consoleErrors: [], failedHttp: [] };
  result.cases.push(row);
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
    timezoneId: options.timezone || 'Asia/Jakarta',
    colorScheme: options.dark ? 'dark' : 'light',
    serviceWorkers: 'block',
    acceptDownloads: true,
  });
  if (options.dark) await context.addInitScript(() => localStorage.setItem('diis-theme', 'dark'));
  await session(context, profile, options.serial || 1, options.legacy || false);
  const page = await context.newPage();
  page.on('pageerror', (e) => row.errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') row.consoleErrors.push(m.text().slice(0, 300));
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && new URL(r.url()).origin === result.origin)
      row.failedHttp.push({ path: new URL(r.url()).pathname, status: r.status() });
  });
  try {
    await page.goto(result.origin + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((e) =>
          Object.getOwnPropertyNames(e).some(
            (k) => k.startsWith('__reactProps') && typeof e[k]?.onClick === 'function',
          ),
        ),
      { timeout: 20000 },
    );
    await run(page, row, context);
    check(row, 'No uncaught exception, including recovery', row.errors.length === 0);
  } catch (e) {
    row.failure = e.message;
    check(row, 'Journey completed', false);
    await page
      .screenshot({ path: path.join(output, key + '-FAIL.png'), fullPage: true })
      .catch(() => {});
  }
  row.pass = row.checks.every((c) => c.pass);
  await context.close();
  fs.writeFileSync(path.join(output, 'PROGRESS.json'), JSON.stringify(result, null, 2));
}
const shot = async (p, file) => {
  if (
    (await p.getByRole('dialog').count()) === 0 &&
    (await p.getByRole('button', { name: 'Nanti', exact: true }).count())
  )
    await p.getByRole('button', { name: 'Nanti', exact: true }).click();
  return p.screenshot({
    path: path.join(output, file),
    fullPage: (await p.getByRole('dialog').count()) === 0,
  });
};
async function main() {
  if (fs.existsSync(path.join(output, 'RESULT.json'))) throw Error('Fresh output required');
  fs.mkdirSync(output, { recursive: true });
  result.imageId = JSON.parse(command('docker', ['image', 'inspect', image]))[0].Id;
  if (args.includes('--receipt')) {
    const receipt = JSON.parse(fs.readFileSync(arg('--receipt')));
    if (receipt.imageId !== result.imageId) throw Error('Image receipt mismatch');
  }
  tls = fs.mkdtempSync(path.join(os.tmpdir(), 'diis-teacher-browser-'));
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
  const reserve = http.createServer(),
    appPort = await listen(reserve);
  await new Promise((resolve) => reserve.close(resolve));
  proxy = https.createServer(
    {
      key: fs.readFileSync(path.join(tls, 'key.pem')),
      cert: fs.readFileSync(path.join(tls, 'cert.pem')),
    },
    (q, r) => {
      const upstream = http.request(
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
        (response) => {
          r.writeHead(response.statusCode, response.headers);
          response.pipe(r);
        },
      );
      upstream.on('error', () => {
        if (!r.headersSent) r.writeHead(502);
        r.end();
      });
      q.pipe(upstream);
      r.on('close', () => {
        if (!r.writableEnded) upstream.destroy();
      });
    },
  );
  result.origin = 'https://localhost:' + (await listen(proxy));
  container = cp.spawn(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '--name',
      name,
      '--label',
      'com.diis.qa=teacher-workspace-browser',
      '--memory',
      '1g',
      '--cpus',
      '2',
      '-p',
      `127.0.0.1:${appPort}:3900`,
      '--entrypoint',
      'node',
      image,
    ],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  running = true;
  result.serverLogs = [];
  container.stdout.on('data', (c) => result.serverLogs.push(String(c)));
  container.stderr.on('data', (c) => result.serverLogs.push(String(c)));
  container.stdin.end(
    'globalThis.__teacherWorkspaceFixture=' +
      JSON.stringify({ origin: result.origin, secret }) +
      ';\n' +
      fs.readFileSync(path.join(__dirname, 'teacher-workspace-fixture.cjs')),
  );
  let ready = false;
  for (let i = 0; i < 45 && !ready; i++) {
    ready = await new Promise((resolve) => {
      const q = https.get(result.origin + '/login', { rejectUnauthorized: false }, (r) => {
        r.resume();
        resolve(r.statusCode === 200);
      });
      q.on('error', () => resolve(false));
    });
    if (!ready) await wait(1000);
  }
  if (!ready) throw Error('Standalone ready deadline');
  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: [
      '--ignore-certificate-errors',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
    ],
  });
  result.browser = browser.version();
  if (args.includes('--reminder-only')) {
    await journey('PRESENSI-SNOOZE', 'TEACHER', '/dashboard', async (p, r) => {
      await p.getByRole('button', { name: 'Catat kehadiran', exact: true }).waitFor();
      const later = p.getByRole('button', { name: 'Nanti', exact: true });
      await later.waitFor();
      await later.click();
      await wait(500);
      check(
        r,
        'Native Nanti immediately hides reminder without hiding attendance entry',
        (await later.count()) === 0 &&
          (await p.getByRole('button', { name: 'Catat kehadiran', exact: true }).isVisible()),
      );
    });
    return;
  }
  if (args.includes('--jp-only')) {
    await jpJourney();
    return;
  }
  await journey('HOME-DESKTOP', 'TEACHER', '/dashboard', async (p, r) => {
    await p.getByRole('heading', { name: 'Literasi Data QA', exact: true }).waitFor();
    check(
      r,
      'Own session visible',
      await p
        .getByText('X QA · JP 1–2')
        .isVisible()
        .catch(() => false),
    );
    check(
      r,
      'Daily action hierarchy',
      (await p.getByRole('heading', { name: 'Presensi Saya', exact: true }).count()) === 1 &&
        (await p.getByRole('heading', { name: 'Perlu ditindaklanjuti', exact: true }).count()) ===
          1,
    );
    check(
      r,
      'Full JP recap absent from Home',
      (await p.getByRole('heading', { name: /Rekap.*JP/i }).count()) === 0,
    );
    check(
      r,
      'Actual start available',
      await p.getByRole('button', { name: 'Mulai sesi', exact: true }).isVisible(),
    );
    check(
      r,
      'Future/unstarted sessions are not certified as attendance complete',
      (await p
        .getByText('Belum ada sesi berjalan yang perlu diabsen.', { exact: true })
        .count()) === 1 &&
        (await p.getByText('Absensi sesi sudah lengkap.', { exact: true }).count()) === 0,
    );
    await p.getByRole('button', { name: 'Catat kehadiran', exact: true }).waitFor();
    await shot(p, '01-beranda-guru-desktop.png');
    const before = control().starts;
    await p.getByRole('button', { name: 'Mulai sesi', exact: true }).click();
    await p.waitForURL(
      (u) => u.pathname === '/dashboard/akademik' && u.searchParams.get('sessionId') === id(1),
      { timeout: 30000 },
    );
    check(
      r,
      'One start and exact period/session navigation',
      control().starts === before + 1 &&
        new URL(p.url()).searchParams.get('workspace') === 'teaching',
    );
    await p
      .getByRole('heading', { name: 'Ruang pembelajaran', exact: true })
      .waitFor({ timeout: 20000 });
    await p.getByRole('tab', { name: 'Ringkasan', exact: true }).waitFor({ timeout: 20000 });
    check(
      r,
      'Existing session detail resolves without an error boundary',
      (await p.getByText('Literasi Data QA', { exact: true }).count()) > 0 &&
        (await p.getByText('Terjadi Kesalahan', { exact: true }).count()) === 0,
    );
    await shot(p, '02-sesi-guru.png');
  });
  await journey(
    'HOME-MOBILE-DARK',
    'TEACHER',
    '/dashboard',
    async (p, r) => {
      await p.getByRole('heading', { name: 'Literasi Data QA', exact: true }).waitFor();
      check(
        r,
        'Mobile no page overflow',
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      );
      check(
        r,
        'Started session enters existing flow',
        await p.getByRole('button', { name: 'Masuk sesi', exact: true }).isVisible(),
      );
      await p.getByRole('button', { name: 'Catat kehadiran', exact: true }).waitFor();
      await shot(p, '03-beranda-guru-mobile-dark.png');
    },
    { viewport: { width: 390, height: 844 }, dark: true },
  );
  await journey(
    'HUMAS-AGENDA',
    'HUMAS',
    '/dashboard/kalender',
    async (p, r) => {
      await p.getByRole('heading', { name: 'Kalender & Agenda Sekolah' }).waitFor();
      const trigger = p.getByRole('button', { name: /Tambah Agenda/i }).first();
      await trigger.click();
      await p.getByRole('dialog').waitFor();
      await p.getByRole('button', { name: 'Simpan', exact: true }).click();
      check(
        r,
        'Validation prevents empty write',
        await p
          .getByRole('alert')
          .filter({ hasText: /minimal 2/ })
          .isVisible(),
      );
      await p.getByLabel('Nama Agenda *').fill('Pertemuan orang tua QA');
      await p.getByLabel('Jenis *').click();
      const option = p.getByRole('option', { name: 'Ujian', exact: true });
      await option.waitFor();
      check(
        r,
        'Nested type picker appears in front of its dialog',
        await option.evaluate((e) => {
          const b = e.getBoundingClientRect();
          return e.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
        }),
      );
      await option.click();
      await p.getByLabel('Sepanjang hari').uncheck();
      await p.getByLabel('Jam mulai (WIB)').fill('10:30');
      await p.getByLabel('Jam selesai (WIB)').fill('11:45');
      await p.getByLabel('Lokasi', { exact: true }).fill('Aula QA');
      await shot(p, '04-agenda-humas-editor.png');
      const before = control().calendarWrites;
      await p.getByRole('button', { name: 'Simpan', exact: true }).click();
      await p.getByRole('dialog').waitFor({ state: 'hidden' });
      await p.getByRole('button', { name: 'Edit agenda Pertemuan orang tua QA' }).waitFor();
      const saved = control();
      check(
        r,
        'Date time location saved once',
        saved.calendarWrites === before + 1 &&
          saved.events.some(
            (e) =>
              e.name === 'Pertemuan orang tua QA' &&
              e.location === 'Aula QA' &&
              e.startAt.endsWith('10:30:00+07:00'),
          ),
      );
      check(
        r,
        'Close returns trigger focus',
        await trigger.evaluate((e) => document.activeElement === e),
      );
      await p.getByRole('button', { name: 'Edit agenda Pertemuan orang tua QA' }).click();
      check(
        r,
        'WIB clock survives readback',
        (await p.getByLabel('Jam mulai (WIB)').inputValue()) === '10:30',
      );
      await p.keyboard.press('Escape');
      await p.getByRole('dialog').waitFor({ state: 'hidden' });
      await p.waitForFunction(
        () =>
          document.activeElement?.getAttribute('aria-label') ===
          'Edit agenda Pertemuan orang tua QA',
      );
      check(
        r,
        'Escape closes and restores edit focus',
        (await p.getByRole('dialog').count()) === 0 &&
          (await p
            .getByRole('button', { name: 'Edit agenda Pertemuan orang tua QA' })
            .evaluate((e) => document.activeElement === e)),
      );
      await shot(p, '05-agenda-humas.png');
    },
    { timezone: 'America/Los_Angeles' },
  );
  await journey('GURU-CALENDAR-DENIED', 'TEACHER', '/dashboard/kalender', async (p, r) => {
    await p.getByRole('heading', { name: 'Selamat datang, QA' }).waitFor();
    check(r, 'Denied teacher recovers Home', new URL(p.url()).pathname === '/dashboard');
  });
  control({ homeError: true });
  await journey('HOME-FAILED-READ-RECOVERY', 'TEACHER', '/dashboard', async (p, r) => {
    await p.getByRole('heading', { name: 'Sesi belum dapat dimuat', exact: true }).waitFor();
    check(
      r,
      'Failed sessions are not shown as no schedule',
      (await p
        .getByRole('heading', { name: 'Tidak ada sesi berikutnya hari ini', exact: true })
        .count()) === 0,
    );
    control({ homeError: false });
    await p.locator('[data-help-anchor="beranda-guru"] > header').getByRole('button', { name: 'Muat ulang', exact: true }).click();
    await p.getByRole('heading', { name: 'Literasi Data QA', exact: true }).waitFor();
    check(r, 'Explicit reload restores verified own sessions', true);
  });
  await journey('CREDENTIALS-SELECTED', 'ADMIN', '/dashboard/users', async (p, r, context) => {
    await p.getByLabel('Pilih akun QA Siswa 001').check();
    await p.getByLabel('Pilih akun QA Orang Tua').check();
    check(
      r,
      'Teacher cannot be selected for bulk credentials',
      (await p.getByLabel('Pilih akun QA Guru Lain', { exact: true }).count()) === 0,
    );
    await p.getByRole('button', { name: 'Terbitkan password sementara (2)', exact: true }).click();
    await p.getByRole('dialog').waitFor();
    const before = control().resets;
    check(r, 'Opening confirm has no mutation', control().resets === before);
    await p.getByRole('button', { name: 'Terbitkan untuk akun terpilih' }).click();
    await p.getByRole('button', { name: 'Ekspor XLSX', exact: true }).waitFor({ timeout: 25000 });
    check(r, 'Exactly selected two accounts issued', control().resets === before + 2);
    await shot(p, '06-hasil-kredensial.png');
    for (let i = 1; i <= 2; i++) {
      const download = p.waitForEvent('download', { timeout: 20000 });
      await p.getByRole('button', { name: 'Ekspor XLSX', exact: true }).click();
      await (await download).saveAs(path.join(output, `credentials-synthetic-${i}.xlsx`));
    }
    const popupPromise = context.waitForEvent('page');
    await p.getByRole('button', { name: 'Cetak / Simpan PDF', exact: true }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    check(
      r,
      'Print cards include both identities and forced change',
      (await popup.getByText('001234', { exact: true }).count()) === 1 &&
        (await popup.getByText('+628123000000', { exact: true }).count()) === 1 &&
        (await popup.getByText(/Wajib mengganti password/).count()) === 2,
    );
    check(r, 'Print popup has no opener', await popup.evaluate(() => window.opener === null));
    await popup.pdf({
      path: path.join(output, 'credentials-synthetic.pdf'),
      format: 'A4',
      printBackground: true,
    });
    await popup.close();
    check(r, 'Repeated exports never reset', control().resets === before + 2);
    await p.getByRole('button', { name: 'Tutup dan hapus tampilan' }).click();
    check(
      r,
      'Secrets cleared and stable keyboard focus',
      (await p.getByRole('dialog').count()) === 0 &&
        (await p.locator('#users-list-heading').evaluate((e) => document.activeElement === e)),
    );
  });
  control({ parentError: true });
  await journey(
    'CREDENTIALS-PARTIAL-MOBILE',
    'ADMIN',
    '/dashboard/users',
    async (p, r) => {
      await p.getByLabel('Pilih akun QA Siswa 001').check();
      await p.getByLabel('Pilih akun QA Orang Tua').check();
      await p
        .getByRole('button', { name: 'Terbitkan password sementara (2)', exact: true })
        .click();
      const before = control().resets;
      await p.getByRole('button', { name: 'Terbitkan untuk akun terpilih' }).click();
      await p.getByRole('button', { name: 'Ekspor XLSX', exact: true }).waitFor();
      check(
        r,
        'Partial failure preserves first result',
        (await p.getByText('Password baru siap diekspor.', { exact: true }).count()) === 1 &&
          (await p.getByRole('dialog').getByRole('alert').count()) === 1,
      );
      await wait(1200);
      check(r, 'No automatic reset retry', control().resets === before + 2);
      check(
        r,
        'Mobile dialog fits viewport',
        await p
          .getByRole('dialog')
          .evaluate(
            (e) =>
              e.getBoundingClientRect().width <= innerWidth &&
              e.getBoundingClientRect().height <= innerHeight,
          ),
      );
      await shot(p, '07-kredensial-parsial-mobile.png');
      await p.keyboard.press('Escape');
      await p.getByRole('dialog').waitFor({ state: 'hidden' });
      await p.waitForFunction(() => document.activeElement?.id === 'users-list-heading');
      check(
        r,
        'Escape restores stable focus',
        await p.locator('#users-list-heading').evaluate((e) => document.activeElement === e),
      );
    },
    { viewport: { width: 390, height: 844 }, dark: true },
  );
  control({ parentError: false });
  await jpJourney();
  await journey(
    'LOGOUT-LATE-RESPONSE',
    'TEACHER',
    '/dashboard',
    async (p, r, context) => {
      await p.getByRole('heading', { name: 'Selamat datang, QA' }).waitFor();
      control({ holdStatus: true });
      const late = context.request.get(result.origin + '/api/auth/session').catch(() => null);
      for (let i = 0; i < 30 && !control().held; i++) await wait(100);
      check(r, 'Read held before logout', control().held);
      await p.getByRole('button', { name: 'Keluar', exact: true }).first().click();
      await p.waitForURL((u) => u.pathname === '/login', { timeout: 20000 });
      control({ releaseStatus: true, holdStatus: false });
      const lateResponse = await late;
      r.lateResponse = {
        status: lateResponse?.status() ?? null,
        cookieWrites: (lateResponse?.headersArray() ?? []).filter(
          (h) => h.name.toLowerCase() === 'set-cookie',
        ).length,
      };
      await wait(500);
      const me = await context.request.get(result.origin + '/api/backend/auth/me');
      const auth = await context.request.get(result.origin + '/api/auth/session');
      const authBody = await auth.json();
      r.afterLogout = {
        apiStatus: me.status(),
        sessionStatus: auth.status(),
        sessionEmpty: authBody === null || Object.keys(authBody).length === 0,
      };
      check(
        r,
        'Late response cannot restore API or session authority',
        me.status() === 401 && r.afterLogout.sessionEmpty,
      );
      await p.goto(result.origin + '/dashboard');
      check(r, 'Signed-out navigation stays login', new URL(p.url()).pathname === '/login');
      await shot(p, '09-login-signed-out.png');
      await session(context, 'TEACHER', 2);
      await p.goto(result.origin + '/dashboard');
      await p.getByRole('heading', { name: 'Selamat datang, QA' }).waitFor();
      check(
        r,
        'Different fresh login is accepted',
        (await context.request.get(result.origin + '/api/backend/auth/me')).status() === 200,
      );
      const owned = (await context.cookies()).filter(
        (c) => c.name.includes('next-auth') || c.name.includes('diis.signed-out'),
      );
      r.cookieFootprint = {
        count: owned.length,
        bytes: owned.reduce((n, c) => n + c.name.length + c.value.length + 2, 0),
      };
      check(r, 'Owned browser cookie footprint bounded', r.cookieFootprint.bytes < 7000);
    },
    { legacy: true },
  );
}
async function jpJourney() {
  await journey('JP-RETAINED-PASSIVE', 'TU', '/dashboard/monitoring', async (p, r) => {
    const panel = p.getByRole('region', { name: 'Ringkasan kehadiran per JP' });
    await panel.waitFor({ timeout: 25000 });
    await p.waitForFunction(
      () =>
        document
          .querySelector('[aria-label="Ringkasan kehadiran per JP"]')
          ?.getAttribute('data-state') === 'ready',
      null,
      { timeout: 25000 },
    );
    const before = control().jpReads;
    await wait(10000);
    r.idleJpReads = control().jpReads - before;
    check(r, 'Retained JP stable during passive phase', r.idleJpReads === 0);
    if (!args.includes('--jp-only')) {
      await shot(p, '08-jp-monitoring-stable.png');
      control({ jpError: true });
      await p.reload();
      const retry = panel.getByRole('button', { name: 'Coba lagi', exact: true });
      await retry.waitFor();
      control({ jpError: false });
      const old = control().jpReads;
      await retry.focus();
      await p.keyboard.press('Enter');
      await p.waitForFunction(
        () =>
          document
            .querySelector('[aria-label="Ringkasan kehadiran per JP"]')
            ?.getAttribute('data-state') === 'ready',
      );
      check(
        r,
        'Explicit keyboard retry works once and preserves focus',
        control().jpReads === old + 1 &&
          (await panel.evaluate(
            (e) => e.contains(document.activeElement) || document.activeElement === e,
          )),
      );
    }
  });
}
main()
  .catch((e) => {
    result.harnessError = e.message;
    process.exitCode = 2;
  })
  .finally(async () => {
    if (running) {
      try {
        result.fixture = control();
      } catch {}
    }
    if (browser) await browser.close().catch(() => {});
    if (running) {
      try {
        command('docker', ['stop', '--time', '3', name]);
      } catch {}
      result.cleanupContainerAbsent = !command('docker', [
        'ps',
        '-a',
        '--filter',
        'name=^/' + name + '$',
        '--format',
        '{{.Names}}',
      ]).trim();
    }
    if (proxy) await new Promise((resolve) => proxy.close(resolve));
    if (
      tls &&
      path.basename(tls).startsWith('diis-teacher-browser-') &&
      path.resolve(tls).startsWith(path.resolve(os.tmpdir()) + path.sep)
    )
      fs.rmSync(tls, { recursive: true });
    result.endedAt = new Date().toISOString();
    result.pass =
      !result.harnessError && result.cases.length > 0 && result.cases.every((c) => c.pass);
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'RESULT.json'), JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify({
        pass: result.pass,
        cases: result.cases.map((c) => ({
          id: c.id,
          pass: c.pass,
          failure: c.failure,
          failed: c.checks.filter((x) => !x.pass),
        })),
        harnessError: result.harnessError,
      }),
    );
    if (!result.pass && !process.exitCode) process.exitCode = 1;
  });
