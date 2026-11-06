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
  recipeSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  cases: [],
  limitations: [
    'Real Linux standalone UI/Server Actions; synthetic NextAuth identity and shell adapter; recap payloads are not mocked.',
    'Recap calls cross the Server Action/proxy and actual Nest/JWKS/guards/service/disposable PostgreSQL.',
    'No live Keycloak, shared ingress, staging or production in this browser recipe.',
    'Assessment analysis and essay-save use synthetic HTTP fixtures; UI and Server Actions are real. No business grades are written.',
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
  if(options.slow)await context.route('**/_next/static/**/*.js',async route=>{await wait(1800);await route.continue();});
  if (options.dark) await context.addInitScript(() => localStorage.setItem('diis-theme', 'dark'));
  await session(context, profile, options.serial || 1, options.legacy || false);
  const page = await context.newPage();
  page.on('pageerror', (e) => {row.errors.push(e.message);(row.stacks??=[]).push(e.stack);});
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
  fs.copyFileSync(__filename,path.join(output,'RECIPE.cjs'));
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
  const panel = (p) => p.locator('section[data-attendance-recap]:visible, section[aria-labelledby="recap-heading"]:visible');
  const recapReady = async (p) => {
    await panel(p).getByTestId('recap-attendance').waitFor({ timeout: 15000 });
  };
  const dismiss = async (p) => {
    const b = p.getByRole('button', { name: 'Nanti', exact: true });
    if (await b.count()) await b.click();
  };

  for(const [profile,mode]of [['TEACHER','teaching'],['HUMAS','operations'],['ADMIN','operations']]){
    for(let round=0;round<(args.includes('--soak')?12:4);round++)await journey('HYDRATE-'+profile+'-'+round,profile,route+mode,async(p,r)=>{
      await recapReady(p);await wait(250);await dismiss(p);
      check(r,'Recap hydrated with resolved business data',await panel(p).getByTestId('recap-attendance').isVisible());
      const headers=await p.locator('[role=tab][aria-selected=true]').allTextContents();r.activeTabs=headers;
      await panel(p).getByRole('button',{name:'Per Siswa',exact:true}).click();
      await panel(p).getByRole('button',{name:'Lihat rincian',exact:true}).first().waitFor({timeout:15000});
      check(r,'Hydrated tab interactive',await panel(p).getByRole('button',{name:'Lihat rincian',exact:true}).first().isVisible());
      if(round===0)await shot(p,'hydrate-'+profile+'.png');
    },{slow:round%2===0,dark:round%2===1,timezone:round<2?'Asia/Jakarta':'America/Los_Angeles'});
  }
  await journey('WORKSPACE-HISTORY','HUMAS',route+'operations',async(p,r)=>{
    await recapReady(p);await dismiss(p);
    await p.getByRole('tab',{name:/Pengajaran Saya/}).click();await recapReady(p);
    check(r,'Role-tab selection is represented in the shareable URL',new URL(p.url()).searchParams.get('workspace')==='teaching');
    await p.evaluate(()=>{const u=new URL(location.href);u.searchParams.set('workspace','operations');history.pushState(null,'',u);});
    await wait(500);
    check(r,'Client navigation restores operations workspace',await p.getByRole('tab',{name:/Kepemimpinan Sekolah/}).getAttribute('aria-selected')==='true');
    await p.goBack();await wait(500);
    check(r,'Back restores teaching workspace',await p.getByRole('tab',{name:/Pengajaran Saya/}).getAttribute('aria-selected')==='true');
    await p.goForward();await wait(500);
    check(r,'Forward restores operations workspace',await p.getByRole('tab',{name:/Kepemimpinan Sekolah/}).getAttribute('aria-selected')==='true');
    await shot(p,'workspace-history.png');
  });
  const analysisJourney=async(p,r)=>{
    control({analysisCase:'official',resetEssay:true});
    const studio=p.getByRole('button',{name:'Buka Studio',exact:true}).first();await studio.waitFor();
    const nudge=p.getByRole('button',{name:'Nanti',exact:true});await nudge.waitFor({timeout:3000}).then(()=>nudge.click(),()=>{});
    await studio.click();
    const dialog=p.getByRole('dialog',{name:/^Penilaian -/});
    await dialog.getByRole('button',{name:'Analisis',exact:true}).click();
    await dialog.getByText('Ketuntasan Belajar',{exact:true}).waitFor({timeout:15000});
    check(r,'Analysis uses KKTP80 while preserving average85 and ketuntasan50%',(await dialog.innerText()).includes('50% siswa mencapai KKTP 80. 1 dari 2 siswa tuntas.'));
    await shot(p,r.id+'-analysis-official80.png');
    control({analysisCase:'missing'});await dialog.getByRole('button',{name:'Sesi',exact:true}).click();await dialog.getByRole('button',{name:'Analisis',exact:true}).click();
    await dialog.getByText('Batas ketuntasan belum tersedia.',{exact:true}).waitFor({timeout:15000});
    check(r,'Missing metadata shows no invented threshold or ketuntasan',!(await dialog.innerText()).includes('50% siswa'));
    await shot(p,r.id+'-analysis-missing-metadata.png');
    control({analysisCase:'default'});await dialog.getByRole('button',{name:'Sesi',exact:true}).click();await dialog.getByRole('button',{name:'Analisis',exact:true}).click();
    await dialog.getByText(/KKTP 75 \(batas bawaan\)/).waitFor({timeout:15000});
    check(r,'Fallback is disclosed as default', (await dialog.innerText()).includes('KKTP 75 (batas bawaan)'));

    await dialog.getByRole('button').first().focus();await p.keyboard.press('Shift+Tab');
    check(r,'Assessment keyboard focus stays inside modal',await dialog.evaluate(el=>el.contains(document.activeElement)));
    await dialog.getByRole('button',{name:'Buka Koreksi Esai',exact:true}).click();
    const child=p.locator('[role=dialog]').filter({has:p.getByText('Rubrik Penilaian',{exact:true})}).last();await child.waitFor();await wait(200);
    check(r,'Nested essay dialog receives focus',await child.evaluate(el=>el.contains(document.activeElement)));
    const top=await child.evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.left+b.width/2,b.top+b.height/2));});
    check(r,'Nested essay dialog appears above assessment',top);
    await shot(p,r.id+'-assessment-nested-essay.png');await p.keyboard.press('Escape');
    const closed=await child.waitFor({state:'hidden',timeout:2500}).then(()=>true,()=>false);
    check(r,'Escape closes only child dialog',closed&&await dialog.count()===1);
    if(!closed)await child.getByRole('button',{name:'Tutup',exact:true}).click();
    await wait(100);check(r,'Child close restores focus to assessment',await dialog.evaluate(el=>el.contains(document.activeElement)));

    await dialog.getByRole('button',{name:'Buka Koreksi Esai',exact:true}).click();
    await child.getByLabel('Nilai Penalaran').fill('10');
    await child.getByRole('button',{name:'Simpan Nilai',exact:true}).click();
    await p.keyboard.press('Escape');await wait(120);
    check(r,'Escape cannot close essay while save is in flight',await child.count()===1);
    const empty=p.getByRole('dialog',{name:'Koreksi esai',exact:true});
    await empty.getByText('Tidak ada jawaban esai yang perlu dinilai.',{exact:true}).waitFor({timeout:20000});
    check(r,'Saved final essay transitions to accessible empty state',await empty.isVisible());
    await shot(p,r.id+'-essay-saved-empty.png');await p.keyboard.press('Escape');
    const emptyClosed=await empty.waitFor({state:'hidden',timeout:2500}).then(()=>true,()=>false);
    check(r,'Empty essay dialog also closes with Escape',emptyClosed);
    if(!emptyClosed)await empty.getByRole('button',{name:'Tutup',exact:true}).last().click();
    await p.keyboard.press('Escape');
    const parentClosed=await dialog.waitFor({state:'hidden',timeout:2500}).then(()=>true,()=>false);
    check(r,'Escape closes assessment dialog',parentClosed);
    if(!parentClosed)await dialog.getByRole('button',{name:'Tutup',exact:true}).click();
    await wait(150);check(r,'Parent close returns focus to original studio button',await p.evaluate(()=>document.activeElement?.textContent?.includes('Buka Studio')));
    check(r,'No page-wide horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  };
  await journey('ANALYSIS-KKTP','TEACHER','/dashboard/akademik?view=assessment',analysisJourney);
  await journey('ANALYSIS-KKTP-MOBILE','TEACHER','/dashboard/akademik?view=assessment',analysisJourney,{viewport:{width:390,height:844},dark:true});
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

  s=s.replace("jpReads: 0,", "jpReads: 0, analysisCase:'official',");
  s=s.replace("if (p === '/__fixture/control') {", "if (p === '/__fixture/control') {");
  s=s.replace("if (typeof input[key] === 'boolean') state[key] = input[key];", "if (typeof input[key] === 'boolean') state[key] = input[key]; if(['official','missing','default'].includes(input.analysisCase))state.analysisCase=input.analysisCase;if(input.resetEssay)state.essaySaved=false;");
  const session={id:id(40),teacherId:id(5),classId:id(3),teachingAssignmentId:id(4),title:'Asesmen QA',status:'completed',academicYear:'2026/2027',semester:1,questions:[],type:'formatif',purpose:'regular',durationMinutes:null,randomizeOrder:false,startedAt:null,completedAt:null,class:{id:id(3),name:'X QA'},teachingAssignment:{id:id(4),subject:'Matematika'}};
  const inject=`  if(p==='/assessment/sessions/'+id(40)+'/analysis')return send(r,200,{session:{id:id(40),title:'Asesmen QA',type:'formatif',status:'completed'},summary:{totalStudents:2,avgScore:85,minScore:75,maxScore:95,medianScore:85,ketuntasanPct:state.analysisCase==='default'?100:50,tuntasCount:state.analysisCase==='default'?2:1,belumTuntasCount:state.analysisCase==='default'?0:1,kktpValue:state.analysisCase==='missing'?null:state.analysisCase==='default'?75:80,kktpProvenance:state.analysisCase==='missing'?'unconfigured':state.analysisCase==='default'?'system_default':'config'},scoreDistribution:[],itemAnalysis:[]});
  if(p==='/assessment/sessions/'+id(40)+'/responses/'+id(42)+'/grade-essay'&&q.method==='PATCH'){setTimeout(()=>{state.essaySaved=true;send(r,200,{graded:true});},1500);return;}
  if(p==='/assessment/sessions/'+id(40)+'/results')return send(r,200,{session:{id:id(40),title:'Asesmen QA',type:'formatif',status:'completed'},classStudentCount:3,submitted:3,finalCount:2,pendingManualCount:1,pendingLateReviewCount:0,avgScore:85,responses:[],essayCorrections:state.essaySaved?[]:[{responseId:id(42),questionId:id(43),studentName:'QA Esai',nis:'QA003',body:'Jelaskan kesimpulan Anda.',answer:'Kesimpulan QA',status:'manual_pending',rubric:[{id:'qa-rubrik',name:'Penalaran',description:'Alasan sesuai data',weight:100,maxScore:10}]}]});
  if(p==='/assessment/sessions/'+id(40))return send(r,200,${JSON.stringify(session)});
  if(p==='/assessment/sessions')return send(r,200,page([${JSON.stringify(session)}]));
`;
  s=s.replace("  if (p === '/assessment/sessions')",inject+"  if (p === '/assessment/sessions')");
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
