import { createServer, request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const webRoot = resolve(projectRoot, 'apps', 'web');
const keycloakThemeRoot = resolve(projectRoot, 'infrastructure', 'keycloak', 'themes', 'diis', 'login');
const appRequire = createRequire(resolve(webRoot, 'package.json'));
const { encode } = appRequire('next-auth/jwt');
const nextBin = appRequire.resolve('next/dist/bin/next');
const host = '127.0.0.1';
const proxyPort = Number(process.env.WAVE9_QA_PORT ?? 3310);
const apiPort = proxyPort + 1;
const nextPort = proxyPort + 2;
const secret = randomBytes(32).toString('hex');

const personas = {
  guru: {
    roles: ['GURU'], positions: [],
    permissions: ['academic.teaching.read'], assignmentCount: 1, wali: false, children: [],
  },
  principal: {
    roles: ['GURU'], positions: ['KEPALA_SEKOLAH'],
    permissions: ['academic.final-report.read', 'academic.semester.close', 'finance.read'], assignmentCount: 0, wali: false, children: [],
  },
  parent: {
    roles: ['ORANG_TUA'], positions: [],
    permissions: ['grade.child.read', 'report.read', 'remedial.child.read', 'finance.child.read'], assignmentCount: 0, wali: false,
    children: [{ id: 'synthetic-child-a' }, { id: 'synthetic-child-b' }],
  },
  student: {
    roles: ['SISWA'], positions: [],
    permissions: ['grade.own.read', 'report.read', 'remedial.own.read', 'lms.read'], assignmentCount: 0, wali: false, children: [],
  },
};

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function personaFromAuth(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  return personas[token] ?? null;
}

const apiServer = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${apiPort}`);
  const persona = personaFromAuth(request);
  if (url.pathname === '/api/v1/school/profile') {
    return json(response, 200, { name: 'SMK Sintetis QA', phone: '+620000000000', email: 'qa@example.invalid' });
  }
  if (!persona) return json(response, 401, { message: 'Synthetic session required.' });
  if (url.pathname === '/api/v1/auth/login-events' || url.pathname === '/api/v1/auth/heartbeat') {
    return json(response, 200, { accepted: true });
  }
  if (url.pathname === '/api/v1/auth/me') {
    return json(response, 200, {
      permissions: persona.permissions,
      consentVersion: 'v1.0',
    });
  }
  if (url.pathname === '/api/v1/positions/my-positions') {
    return json(response, 200, {
      positions: persona.positions.map((code) => ({
        status: 'ACTIVE',
        position: { code, name: code === 'KEPALA_SEKOLAH' ? 'Kepala Sekolah' : code },
        major: null,
      })),
    });
  }
  if (url.pathname === '/api/v1/teaching-assignments/me/context') {
    return json(response, 200, { activeAssignmentCount: persona.assignmentCount });
  }
  if (url.pathname === '/api/v1/teachers/me/wali-classes') {
    return json(response, 200, { isWaliKelas: persona.wali, classes: [] });
  }
  if (url.pathname === '/api/v1/students/my-children') {
    return json(response, 200, { data: persona.children });
  }
  return json(response, 404, { message: 'Synthetic endpoint unavailable.' });
});

async function sessionCookie(personaName) {
  const persona = personas[personaName];
  if (!persona) return null;
  const now = Math.floor(Date.now() / 1000);
  const value = await encode({
    secret,
    maxAge: 8 * 60 * 60,
    token: {
      name: `Synthetic ${personaName}`,
      email: `${personaName}@example.invalid`,
      sub: `synthetic-${personaName}`,
      keycloakId: `synthetic-${personaName}`,
      accessToken: personaName,
      roles: persona.roles,
      consentVersion: 'synthetic-approved',
      expiresAt: now + (8 * 60 * 60),
      iat: now,
      exp: now + (8 * 60 * 60),
    },
  });
  return `next-auth.session-token=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${8 * 60 * 60}`;
}

const proxyServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${proxyPort}`);
  if (url.pathname === '/__qa__/keycloak-login-preview') {
    const [css, script] = await Promise.all([
      readFile(resolve(keycloakThemeRoot, 'resources', 'css', 'login.css'), 'utf8'),
      readFile(resolve(keycloakThemeRoot, 'resources', 'js', 'login.js'), 'utf8'),
    ]);
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return response.end(`<!doctype html>
<html lang="id" class="login-pf"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DIIS Login QA</title><style>*{box-sizing:border-box}body{margin:0}.pf-c-form-control{display:block;width:100%}${css}</style></head>
<body><div class="login-pf-page"><div id="kc-header"><div id="kc-header-wrapper">DIIS SMK Darussalam Subah</div></div><div class="card-pf">
  <div id="kc-content"><div id="kc-content-wrapper">
    <div id="kc-locale"><div id="kc-locale-wrapper"><div id="kc-locale-dropdown">
      <a id="kc-current-locale-link" href="#">Bahasa Indonesia</a>
      <ul><li><a href="#id">Bahasa Indonesia</a></li><li><a href="#en">English</a></li></ul>
    </div></div></div>
    <div id="kc-form"><div id="kc-form-wrapper"><div class="login-pf-header"><h1 id="kc-page-title">Masuk dengan Akun Sekolah</h1></div>
      <div class="form-group"><label for="username">Username atau Email</label><input class="pf-c-form-control" id="username" name="username" autocomplete="username"></div>
      <div class="form-group"><label for="password">Kata Sandi</label><input class="pf-c-form-control" id="password" name="password" type="password" autocomplete="current-password"></div>
      <div id="kc-form-buttons"><button class="pf-c-button pf-m-primary" id="kc-login" type="button">Masuk</button></div>
    </div></div>
  </div></div>
</div></div><script>${script}</script></body></html>`);
  }
  if (url.pathname === '/__qa__/login') {
    const personaName = url.searchParams.get('persona') ?? '';
    const cookie = await sessionCookie(personaName);
    if (!cookie) return json(response, 400, { message: 'Persona sintetis tidak valid.' });
    response.writeHead(302, {
      'Cache-Control': 'no-store',
      'Location': '/dashboard/panduan',
      'Set-Cookie': cookie,
    });
    return response.end();
  }
  if (url.pathname === '/__qa__/logout') {
    response.writeHead(302, {
      'Location': '/login/bantuan',
      'Set-Cookie': 'next-auth.session-token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    });
    return response.end();
  }

  const upstream = httpRequest({
    host,
    port: nextPort,
    method: request.method,
    path: request.url,
    headers: { ...request.headers, host: `${host}:${proxyPort}` },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on('error', () => json(response, 503, { message: 'Next.js fixture belum siap.' }));
  request.pipe(upstream);
});

const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(nextPort), '-H', host], {
  cwd: webRoot,
  env: {
    ...process.env,
    API_URL: `http://${host}:${apiPort}`,
    NEXTAUTH_SECRET: secret,
    NEXTAUTH_URL: `http://${host}:${proxyPort}`,
    KEYCLOAK_CLIENT_ID: 'synthetic-client',
    KEYCLOAK_CLIENT_SECRET: 'synthetic-only',
    KEYCLOAK_ISSUER: `http://${host}:9/realms/synthetic`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

child.stdout.on('data', (chunk) => process.stdout.write(`[next] ${chunk}`));
child.stderr.on('data', (chunk) => process.stderr.write(`[next] ${chunk}`));

apiServer.listen(apiPort, host);
proxyServer.listen(proxyPort, host, () => {
  process.stdout.write([
    `Wave 9 Help QA fixture: http://${host}:${proxyPort}`,
    `GURU: /__qa__/login?persona=guru`,
    `KS: /__qa__/login?persona=principal`,
    `ORANG TUA: /__qa__/login?persona=parent`,
    `SISWA: /__qa__/login?persona=student`,
    'All identities and contacts are synthetic; the fixture only binds to loopback.',
  ].join('\n') + '\n');
});

function shutdown() {
  proxyServer.close();
  apiServer.close();
  child.kill();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
child.once('exit', (code) => {
  proxyServer.close();
  apiServer.close();
  process.exitCode = code ?? 1;
});
