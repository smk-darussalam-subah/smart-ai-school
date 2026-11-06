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
    'Real Linux standalone UI/Server Actions; synthetic NextAuth identity and shell adapter; recap payloads are not mocked.',
    'Recap calls cross the Server Action/proxy and actual Nest/JWKS/guards/service/disposable PostgreSQL.',
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
  const role = { TEACHER: 'GURU', HUMAS: 'GURU', ADMIN: 'GURU', TU: 'TATA_USAHA' }[profile];
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
let bridgeData;
async function main() {
  bridgeData = await fetch('http://127.0.0.1:55881/__qa/bootstrap').then((r) => r.json());
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
      JSON.stringify({ origin: result.origin, secret, bridgeData }) +
      ';\n' +
      recapFixture(),
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
  const route =
    '/dashboard/akademik?view=attendance-recap&attendanceFrom=2026-11-02&attendanceTo=2026-11-02&workspace=';
  const panel = (p) => p.locator('section[data-attendance-recap]:visible');
  const recapReady = async (p) => {
    await panel(p).getByTestId('recap-attendance').waitFor({ timeout: 30000 });
    await wait(120);
  };
  const text = async (p) => panel(p).innerText();
  const dismiss = async (p) => {
    const b = p.getByRole('button', { name: 'Nanti', exact: true });
    if (await b.count()) await b.click();
  };
  await journey('GURU-DESKTOP', 'TEACHER', route + 'teaching', async (p, r) => {
    await dismiss(p);
    await recapReady(p);
    check(
      r,
      'Own attendance H2 of4 =50%; coverage100%',
      (await panel(p).getByTestId('recap-attendance').innerText()) === '50%' &&
        (await panel(p).getByTestId('recap-coverage').innerText()) === '100%',
    );
    check(
      r,
      'Unprepared class is disclosed; no whole-school claim',
      (await text(p)).includes('kelas belum mempunyai sesi'),
    );
    await shot(p, '01-guru-ringkasan.png');
    const before = control().recapReads;
    await wait(32000);
    check(r, 'Passive recap has zero repeated reads', control().recapReads === before);
    await panel(p).getByRole('button', { name: 'Per Siswa', exact: true }).click();
    await recapReady(p);
    const b = p
      .getByRole('row')
      .filter({ hasText: 'QA Siswa B' })
      .getByRole('button', { name: 'Lihat rincian', exact: true });
    await b.click();
    const dialog = p.getByRole('dialog');
    await dialog.getByText('Izin QA', { exact: true }).waitFor();
    check(
      r,
      'Detail uses persisted permission-scoped notes',
      await dialog.getByText('Izin QA', { exact: true }).isVisible(),
    );
    await shot(p, '02-guru-rincian.png');
    await p.keyboard.press('Escape');
    await wait(250);
    check(
      r,
      'Escape returns focus to trigger',
      await b.evaluate((e) => e === document.activeElement),
    );
    await panel(p).getByRole('button', { name: 'Lihat rincian', exact: true }).first().click();
    await p
      .getByRole('dialog')
      .getByRole('button', { name: 'Riwayat koreksi', exact: true })
      .click();
    await p.getByRole('dialog').getByText('Pencatat: QA Guru A', { exact: true }).waitFor();
    check(
      r,
      'Stored audit displayed for selected student only',
      (await p.getByRole('dialog').innerText()).includes('izin → hadir'),
    );
    await shot(p, '02b-audit-nyata.png');
    await p.keyboard.press('Escape');
    await panel(p).getByLabel('Status hasil', { exact: true }).selectOption('A');
    await recapReady(p);
    check(
      r,
      'Status filter narrows rows while KPI retains declared cohort',
      (await panel(p).getByRole('button', { name: 'Lihat rincian', exact: true }).count()) === 1 &&
        (await panel(p).getByTestId('recap-attendance').innerText()) === '50%',
    );
    await panel(p).getByLabel('Status hasil', { exact: true }).selectOption('');
    await recapReady(p);
    await panel(p).getByRole('button', { name: 'Matriks JP', exact: true }).focus();
    await p.keyboard.press('Enter');
    await recapReady(p);
    check(
      r,
      'Keyboard tab survives refresh and matrix has dated JP columns',
      (await panel(p)
        .getByRole('button', { name: 'Matriks JP', exact: true })
        .evaluate((e) => e === document.activeElement)) &&
        (await panel(p).getByLabel('Tanggal matriks').inputValue()) === '2026-11-02',
    );
    await shot(p, '03-guru-matriks.png');
    const download = p.waitForEvent('download');
    await panel(p).getByRole('button', { name: 'Ekspor CSV' }).click();
    const d = await download;
    const stream = await d.createReadStream();
    let csv = '';
    for await (const chunk of stream) csv += chunk.toString();
    check(
      r,
      'CSV carries same own cohort and stored notes',
      csv.includes('Izin QA') &&
        csv.includes('Matematika QA') &&
        !csv.includes('Bahasa QA') &&
        !csv.includes('Mapel Asing'),
    );
    fs.writeFileSync(path.join(output, 'GURU-EXPORT.csv'), csv);
    await panel(p).getByRole('button', { name: 'Kelas Binaan', exact: true }).click();
    await recapReady(p);
    check(
      r,
      'Wali reads all subjects in their class:66.67% and75%',
      (await panel(p).getByTestId('recap-attendance').innerText()) === '66,67%' &&
        (await panel(p).getByTestId('recap-coverage').innerText()) === '75%',
    );
    await panel(p).getByRole('button', { name: 'Belum Dicatat', exact: true }).click();
    await recapReady(p);
    check(
      r,
      'Wali missing work opens read detail rather than operation impersonation',
      (await panel(p).getByRole('button', { name: 'Lihat rincian', exact: true }).count()) === 1 &&
        (await panel(p).getByRole('link', { name: 'Buka sesi' }).count()) === 0,
    );
    await shot(p, '04-wali-tindak-lanjut.png');
    await panel(p).getByRole('button', { name: 'Lihat rincian', exact: true }).click();
    await recapReady(p);
    check(
      r,
      'Wali missing drill reaches matrix and retains own class',
      (await panel(p)
        .getByRole('button', { name: 'Matriks JP', exact: true })
        .getAttribute('aria-pressed')) === 'true' && !(await text(p)).includes('XI QA B'),
    );
  });
  await journey('KS-DESKTOP', 'HUMAS', route + 'operations', async (p, r) => {
    await dismiss(p);
    await recapReady(p);
    check(
      r,
      'KS DB-backed appointment sees all school JP:62.5% and80%',
      (await panel(p).getByTestId('recap-attendance').innerText()) === '62,5%' &&
        (await panel(p).getByTestId('recap-coverage').innerText()) === '80%',
    );
    await shot(p, '05-ks-sekolah.png');
    await panel(p).locator('summary').click();
    await panel(p).getByLabel('Kelas', { exact: true }).selectOption(bridgeData.foreignClassId);
    await recapReady(p);
    check(
      r,
      'Class filter changes amount and truthful scope label',
      (await text(p)).includes('Kelas XI QA B') &&
        (await panel(p).getByTestId('recap-attendance').innerText()) === '50%' &&
        (await panel(p).getByTestId('recap-coverage').innerText()) === '100%',
    );
    const popup = p.waitForEvent('popup');
    await panel(p).getByRole('button', { name: 'Cetak / PDF' }).click();
    const print = await popup;
    await print.getByRole('heading', { name: 'Rekap Kehadiran Siswa' }).waitFor();
    await wait(300);
    const printed = await print.locator('body').innerText();
    check(
      r,
      'Print preview respects selected class and values',
      printed.includes('Kelas XI QA B') && printed.includes('50%') && !printed.includes('X QA A'),
    );
    await print.screenshot({ path: path.join(output, '06-cetak-cakupan.png') });
    await print.pdf({
      path: path.join(output, 'CETAK-KELAS.pdf'),
      format: 'A4',
      printBackground: true,
    });
    check(
      r,
      'PDF artifact produced from same scoped print surface',
      fs.readFileSync(path.join(output, 'CETAK-KELAS.pdf')).subarray(0, 4).toString() === '%PDF',
    );
    await print.close();
    await panel(p).getByLabel('Kelas', { exact: true }).selectOption('');
    await recapReady(p);
    await panel(p).getByLabel('Jam pelajaran', { exact: true }).selectOption('range');
    await recapReady(p);
    await panel(p).getByLabel('Dari JP', { exact: true }).selectOption('2');
    await recapReady(p);
    await panel(p).getByLabel('Sampai JP', { exact: true }).selectOption('3');
    await recapReady(p);
    check(
      r,
      'JP range applies to metadata and visible aggregate',
      (await text(p)).includes('JP 2–3'),
    );
    control({ jpError: true });
    await panel(p).getByRole('button', { name: 'Muat ulang', exact: true }).click();
    await panel(p).getByRole('button', { name: 'Coba lagi', exact: true }).waitFor();
    check(
      r,
      'Failure has explicit retry with no false zero',
      (await panel(p).getByTestId('recap-attendance').count()) === 0,
    );
    await shot(p, '07-gagal-muat.png');
    control({ jpError: false });
    await panel(p).getByRole('button', { name: 'Coba lagi', exact: true }).focus();
    await p.keyboard.press('Enter');
    await recapReady(p);
    check(
      r,
      'Keyboard retry restores heading focus',
      await panel(p)
        .getByRole('heading', { name: 'Kehadiran siswa', exact: true })
        .evaluate((e) => e === document.activeElement),
    );
  });
  await journey(
    'WAKA-DARK-MOBILE',
    'ADMIN',
    route + 'operations',
    async (p, r) => {
      await dismiss(p);
      await recapReady(p);
      check(
        r,
        'Waka actual appointment reaches same authorized school aggregate',
        (await panel(p).getByTestId('recap-attendance').innerText()) === '62,5%',
      );
      const contrast=await panel(p).evaluate(e=>{
      const rgb=s=>(s.match(/[0-9.]+/g)||[]).slice(0,3).map(Number);
      const lum=a=>a.map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[0.2126,0.7152,0.0722][i],0);
      const a=lum(rgb(getComputedStyle(e.querySelector('h2+p')).color)),b=lum(rgb(getComputedStyle(e).backgroundColor));return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    });
    check(r,'Dark mobile explanatory text meets 4.5:1 contrast',contrast>=4.5);
    r.contrastRatio=contrast;
    await shot(p, '08-waka-mobile-gelap.png');
      check(
        r,
        'No page-wide horizontal overflow',
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      );
      await panel(p).getByRole('button', { name: 'Per Siswa', exact: true }).click();
      await recapReady(p);
      await panel(p).getByRole('button', { name: 'Lihat rincian', exact: true }).first().click();
      await p.getByRole('dialog').getByRole('button', { name: 'Kronologi JP' }).waitFor();
      await wait(500);
      check(
        r,
        'Detail dialog opaque in dark mobile',
        await p.getByRole('dialog').evaluate((e) => {
          const c = getComputedStyle(e).backgroundColor;
          return c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
        }),
      );
      await shot(p, '09-rincian-mobile-gelap.png');
      await p.keyboard.press('Escape');
    },
    { viewport: { width: 390, height: 844 }, dark: true },
  );
  await journey(
    'GURU-LIGHT-MOBILE',
    'TEACHER',
    route + 'teaching',
    async (p, r) => {
      await dismiss(p);
      await recapReady(p);
      check(
        r,
        'Mobile light same own values',
        (await panel(p).getByTestId('recap-attendance').innerText()) === '50%',
      );
      await shot(p, '10-guru-mobile-terang.png');
      check(
        r,
        'No page-wide mobile overflow',
        await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      );
      await p.goto(result.origin + '/dashboard/executive', { waitUntil: 'domcontentloaded' });
      await p.waitForURL('**/dashboard');
      await p.getByRole('heading', { name: 'Presensi Saya', exact: true }).waitFor();
      check(
        r,
        'Teacher denied executive recovers to actionable home',
        p.url().endsWith('/dashboard') &&
          (await p.getByRole('button', { name: 'Catat kehadiran', exact: true }).count()) > 0,
      );
      await shot(p, '11-beranda-guru.png');
    },
    { viewport: { width: 390, height: 844 } },
  );
  await journey('EMPTY-REAL-DATA','TEACHER',route.replaceAll('2026-11-02','2026-11-03')+'teaching',async(p,r)=>{
    await dismiss(p);await recapReady(p);
    check(r,'No records does not invent attendance zero',await panel(p).getByTestId('recap-attendance').innerText()==='Belum tersedia');
    check(r,'No due JP does not invent completeness100',await panel(p).getByTestId('recap-coverage').innerText()==='Belum tersedia');
    await shot(p,'13-belum-ada-sesi.png');
  });
  await journey(
    'FOREIGN-CLASS-DENIED',
    'TEACHER',
    route + 'teaching&attendanceClass=' + bridgeData.foreignClassId,
    async (p, r) => {
      await dismiss(p);
      await panel(p).getByRole('button', { name: 'Coba lagi', exact: true }).waitFor();
      check(
        r,
        'Foreign class denied without showing foreign records',
        (await panel(p).getByTestId('recap-attendance').count()) === 0 &&
          !(await text(p)).includes('QA Siswa C'),
      );
      await shot(p, '12-akses-ditolak.png');
    },
  );
}
function recapFixture() {
  let s = fs.readFileSync(path.join(__dirname, 'teacher-workspace-fixture.cjs'), 'utf8');
  s = s.replace('jpReads: 0,', 'jpReads: 0, recapReads: 0,');
  s = s.replace(
    "  if (p === '/auth/session-status') {",
    `  if (p === '/attendance/student-sessions/recap') {
    state.recapReads++;
    if(state.jpError){call.status=503;return send(r,503,{message:'QA deliberate temporary read outage'});}
    const upstream=http.request({hostname:'host.docker.internal',port:55882,path:'/api/v1'+p+url.search,headers:{authorization:'Bearer '+config.bridgeData.tokens[profile]}}, response=>{call.status=response.statusCode;r.writeHead(response.statusCode,{'content-type':'application/json'});response.pipe(r);});
    upstream.on('error',()=>send(r,503,{message:'QA bridge unavailable'}));upstream.end();return;
  }
  if (p === '/auth/me') return send(r,200,config.bridgeData.identities[profile]);
  if (p === '/positions/my-positions') return send(r,200,{positions:config.bridgeData.identities[profile].positions});
  if (p === '/auth/session-status') {`,
  );
  return s;
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
    ) {
      for (const entry of fs.readdirSync(tls)) fs.unlinkSync(path.join(tls, entry));
      fs.rmdirSync(tls);
    }
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
