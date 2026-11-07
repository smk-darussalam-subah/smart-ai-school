'use strict';
// Disposable local nginx boundary; this is not the user's live cookie jar or ingress.
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  crypto = require('node:crypto'),
  http = require('node:http');
const output = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw Error('Explicit evidence directory required');
fs.mkdirSync(output, { recursive: true });
if (fs.existsSync(path.join(output, 'RESULT.json')))
  throw Error('Fresh evidence directory required');
const name = 'diis-cookie-budget-' + crypto.randomBytes(5).toString('hex');
const config =
  'events {}\nhttp { access_log off; server { listen 8080; location / { return 200 "local fixture\\n"; } } }\n';
const configFile = path.join(output, 'nginx.conf');
fs.writeFileSync(configFile, config);
const exec = (args) =>
  cp.execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 30000 });
const result = {
  startedAt: new Date().toISOString(),
  cases: [],
  limitations: [
    'Local default nginx header boundary only; original live 400 root cause remains unverified.',
    'No shared ingress changes, credentials, production or staging requests.',
  ],
};
let running = false;
async function request(port, cookie) {
  return new Promise((resolve, reject) => {
    const q = http.get({ hostname: '127.0.0.1', port, headers: { Cookie: cookie } }, (r) => {
      let body = '';
      r.on('data', (c) => (body += c));
      r.on('end', () =>
        resolve({
          status: r.statusCode,
          headerBytes: Buffer.byteLength(cookie),
          oversizeMessage: /Request Header Or Cookie Too Large/.test(body),
        }),
      );
    });
    q.on('error', reject);
  });
}
(async () => {
  exec([
    'run',
    '--rm',
    '-d',
    '--name',
    name,
    '--label',
    'com.diis.qa=teacher-cookie-budget',
    '-p',
    '127.0.0.1::8080',
    '-v',
    configFile.replace(/\\/g, '/') + ':/etc/nginx/nginx.conf:ro',
    'nginx:1.31.1-alpine',
  ]);
  running = true;
  const info = JSON.parse(exec(['inspect', name]))[0];
  result.imageId = info.Image;
  const port = Number(info.NetworkSettings.Ports['8080/tcp'][0].HostPort);
  const bounded =
    '__Secure-next-auth.session-token.0=' +
    'a'.repeat(3800) +
    '; __Secure-next-auth.session-token.1=' +
    'b'.repeat(2200) +
    '; __Secure-next-auth.callback-url=' +
    'c'.repeat(1024) +
    '; __Host-next-auth.csrf-token=' +
    'd'.repeat(96) +
    '; __Host-diis.signed-out=' +
    'e'.repeat(36);
  for (const [id, cookie, expected] of [
    ['BOUNDED-OWNED-COOKIES', bounded, 200],
    ['OVERSIZED-COOKIE-CONTROL', 'legacy=' + 'x'.repeat(12000), 400],
  ]) {
    const actual = await request(port, cookie);
    result.cases.push({
      id,
      expected,
      ...actual,
      pass: actual.status === expected && (expected !== 400 || actual.oversizeMessage),
    });
  }
  result.configSha256 = crypto.createHash('sha256').update(config).digest('hex');
})()
  .catch((e) => {
    result.harnessError = e.message;
    process.exitCode = 2;
  })
  .finally(() => {
    if (running) {
      exec(['stop', '--timeout', '2', name]);
      result.cleanupContainerAbsent = !exec([
        'ps',
        '-a',
        '--filter',
        'name=^/' + name + '$',
        '--format',
        '{{.Names}}',
      ]).trim();
    }
    result.pass =
      !result.harnessError && result.cases.length === 2 && result.cases.every((r) => r.pass);
    result.endedAt = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'RESULT.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    if (!result.pass && !process.exitCode) process.exitCode = 1;
  });
