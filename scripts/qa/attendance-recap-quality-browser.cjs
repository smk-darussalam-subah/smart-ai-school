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
  const role = { TEACHER: 'GURU', HUMAS: 'GURU', ADMIN: 'GURU', TU: 'TATA_USAHA', KAPROG: 'GURU' }[profile];
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
    await panel(p).getByTestId('recap-attendance').waitFor({ timeout: 15000 });
  };
  const dismiss = async (p) => {
    const b = p.getByRole('button', { name: 'Nanti', exact: true });
    if (await b.count()) await b.click();
  };
  for (const [name, profile, mode] of [
    ['GURU', 'TEACHER', 'teaching'],
    ['KS', 'HUMAS', 'operations'],
    ['WAKA', 'ADMIN', 'operations'],
    ['KAPROG', 'KAPROG', 'operations'],
  ]) {
    await journey('DRILL-' + name, profile, route + mode, async (p, r) => {
      await dismiss(p);
      await recapReady(p);
      await wait(600);
      r.initialRecapReads = control().recapReads;
      if(name==='KAPROG'){
        check(r,'Kaprog scoped summary excludes other majors',await panel(p).getByTestId('recap-attendance').innerText()==='66,67%' && !(await panel(p).innerText()).includes('XI QA B'));
        const denied=await fetch('http://127.0.0.1:55882/api/v1/attendance/student-sessions/recap?context=authorized&classId='+bridgeData.foreignClassId,{headers:{authorization:'Bearer '+bridgeData.tokens.KAPROG}});
        check(r,'Actual HTTP controller denies foreign major for Kaprog',denied.status===403);await denied.arrayBuffer();
      }
      check(r, 'Only selected workspace reads recap at entry', r.initialRecapReads === 1);
      await panel(p).getByRole('button', { name: 'Per Siswa', exact: true }).click();
      await recapReady(p);
      await panel(p).getByRole('button', { name: 'Lihat rincian', exact: true }).first().click();
      const dialog = p.getByRole('dialog');
      await dialog.getByRole('link', { name: 'Buka sesi', exact: true }).first().waitFor();
      r.sourceHref = await dialog
        .getByRole('link', { name: 'Buka sesi', exact: true })
        .first()
        .getAttribute('href');
      await dialog.getByRole('link', { name: 'Buka sesi', exact: true }).first().click();
      const detail = p.getByRole('heading', {
        name: mode === 'teaching' ? 'Ruang pembelajaran' : 'Rincian pertemuan',
        exact: true,
      });
      const reached = await detail.waitFor({ timeout: 7000 }).then(
        () => true,
        () => false,
      );
      check(
        r,
        'Selected attendance row opens exact source session',
        reached &&
          new URL(p.url()).searchParams.get('sessionId') ===
            new URL(r.sourceHref, 'https://fixture.invalid').searchParams.get('sessionId'),
      );
      if (reached) {
        const selectedId = new URL(r.sourceHref, 'https://fixture.invalid').searchParams.get(
          'sessionId',
        );
        const expected = await fetch(
          'http://127.0.0.1:55882/api/v1/class-sessions?id=' + selectedId,
          { headers: { authorization: 'Bearer ' + bridgeData.tokens[profile] } },
        )
          .then((x) => x.json())
          .then((x) => x.data[0]);
        await p
          .getByText(expected.subjectSnapshot, { exact: true })
          .first()
          .waitFor({ timeout: 10000 });
        await p
          .getByText(expected.assignedTeacherName, { exact: true })
          .first()
          .waitFor({ timeout: 10000 });
        check(
          r,
          'Source session finishes reading exact real producer data',
          (await p.locator('body').innerText()).includes(expected.classNameSnapshot),
        );
      }
      await shot(p, 'drill-' + name + '.png');
      if (reached && name === 'GURU') {
        await p.getByRole('button', { name: 'Kehadiran', exact: true }).click();
        await recapReady(p);
        await panel(p).getByRole('button', { name: 'Per Siswa', exact: true }).click();
        await recapReady(p);
        await panel(p).getByRole('button', { name: 'Lihat rincian', exact: true }).first().click();
        await p
          .getByRole('dialog')
          .getByRole('link', { name: 'Buka sesi', exact: true })
          .first()
          .click();
        const repeated = await detail.waitFor({ timeout: 5000 }).then(
          () => true,
          () => false,
        );
        check(r, 'Repeated drill after a local tab change still selects source session', repeated);
      }
    });
    control({ resetReads: true });
  }
  control({resetReads:true});
  await journey('ROLE-PANEL-PRESERVATION','HUMAS',route+'operations',async(p,r)=>{
    await dismiss(p);await recapReady(p);await panel(p).locator('summary').click();
    await panel(p).getByLabel('Kelas',{exact:true}).selectOption(bridgeData.foreignClassId);await recapReady(p);
    await panel(p).getByLabel('Nama siswa / NIS',{exact:true}).fill('draft belum dikirim');
    const before=control().recapReads;
    await p.getByRole('tab',{name:/Pengajaran Saya/}).click();await recapReady(p);
    check(r,'First visit starts personal workspace once',control().recapReads===before+1);
    const visited=control().recapReads;
    await p.getByRole('tab',{name:/Kepemimpinan Sekolah/}).click();await recapReady(p);
    check(r,'Returning to visited workspace does not restart data read',control().recapReads===visited);
    check(r,'Unsubmitted input and selected class survive role-tab switch',await panel(p).getByLabel('Nama siswa / NIS',{exact:true}).inputValue()==='draft belum dikirim'&&await panel(p).getByTestId('recap-attendance').innerText()==='50%');
    await shot(p,'role-panel-preservation.png');
  });
  await journey('SEMESTER-KS', 'HUMAS', route + 'operations', async (p, r) => {
    await dismiss(p);
    await recapReady(p);
    await p.getByRole('button', { name: 'Genap', exact: true }).click();
    await p.waitForURL('**semester=2*', { timeout: 10000 }).catch(() => {});
    await wait(1600);
    const loaded = await panel(p).getByTestId('recap-attendance').count();
    check(
      r,
      'Semester change clears incompatible old attendance dates',
      !new URL(p.url()).searchParams.has('attendanceFrom') && !!loaded,
    );
    check(
      r,
      'New semester shows valid empty rates instead of read failure',
      loaded && (await panel(p).getByTestId('recap-attendance').innerText()) === 'Belum tersedia',
    );
    await shot(p, 'semester-KS.png');
  });
}

function recapFixture() {
  let s = fs.readFileSync(path.join(__dirname, 'teacher-workspace-fixture.cjs'), 'utf8');
  s=s.replace("  TU: { role: 'TATA_USAHA', name: 'QA TU' },", "  TU: { role: 'TATA_USAHA', name: 'QA TU' }, KAPROG:{role:'GURU',name:'QA Kaprog'},");
  s=s.replace('TEACHER|HUMAS|ADMIN|TU','TEACHER|HUMAS|ADMIN|TU|KAPROG');
  s = s.replace('jpReads: 0,', 'jpReads: 0, recapReads: 0,');
  s = s.replace(
    "  if (p === '/auth/session-status') {",
    `  if (p === '/attendance/student-sessions/recap' || p === '/class-sessions' || p.startsWith('/attendance/student-sessions/sessions/')) {
    if(p === '/attendance/student-sessions/recap')state.recapReads++;
    if(state.jpError){call.status=503;return send(r,503,{message:'QA deliberate temporary read outage'});}
    const upstream=http.request({hostname:'host.docker.internal',port:55882,path:'/api/v1'+p+url.search,headers:{authorization:'Bearer '+config.bridgeData.tokens[profile]}}, response=>{call.status=response.statusCode;r.writeHead(response.statusCode,{'content-type':'application/json'});response.pipe(r);});
    upstream.on('error',()=>send(r,503,{message:'QA bridge unavailable'}));upstream.end();return;
  }
  if (p === '/auth/me') return send(r,200,config.bridgeData.identities[profile]);
  if (p === '/positions/my-positions') return send(r,200,{positions:config.bridgeData.identities[profile].positions});
  if (p === '/auth/session-status') {`,
  );
  s = s.replace(
    "if (p === '/school/semesters') return send(r, 200, [semester]);",
    "if (p === '/school/semesters') return send(r, 200, [semester,{...semester,id:id(22),number:2,isActive:false,startDate:'2027-01-01T00:00:00.000Z',endDate:'2027-06-30T00:00:00.000Z'}]);",
  );
  s = s.replace("if (p === '/__fixture/control') {", "if (p === '/__fixture/control') {");
  s = s.replace(
    "if (typeof input[key] === 'boolean') state[key] = input[key];",
    "if (typeof input[key] === 'boolean') state[key] = input[key]; if(input.resetReads)state.recapReads=0;",
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
