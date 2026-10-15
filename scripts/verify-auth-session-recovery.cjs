'use strict';
// Native-exit-code verification with explicit workspace cwd; no shell/Jest stderr
// interpretation and no credentials or environment dump in the receipt.
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process');
const repo = path.resolve(__dirname, '..'),
  web = path.join(repo, 'apps/web');
const phase = process.argv[2],
  out = process.argv[3];
if (!out || !['tests', 'checks', 'build'].includes(phase))
  throw Error('Phase and output directory required');
const commands = {
  tests: [
    [
      path.join(repo, 'node_modules/jest/bin/jest.js'),
      '--config',
      'jest.config.ts',
      '--runInBand',
      '--json',
      '--outputFile=' + path.join(out, 'web-final-jest.json'),
    ],
  ],
  checks: [
    [path.join(repo, 'node_modules/typescript/bin/tsc'), '--noEmit'],
    [path.join(repo, 'node_modules/next/dist/bin/next'), 'lint'],
  ],
  build: [[path.join(repo, 'node_modules/next/dist/bin/next'), 'build']],
};
fs.mkdirSync(out, { recursive: true });
const receipt = { atUtc: new Date().toISOString(), phase, cwd: web, commands: [] };
if (phase === 'build') {
  // A fresh local build is necessary after changing cwd/loader context. Preserve
  // generated cache recoverably; never delete source or a broad directory.
  const nextRoot = path.resolve(web, '.next'),
    cache = path.resolve(nextRoot, 'cache');
  const destination = path.resolve(nextRoot, 'cache-before-auth-verification-' + Date.now());
  if (fs.existsSync(cache)) {
    if (
      !cache.startsWith(nextRoot + path.sep) ||
      !destination.startsWith(nextRoot + path.sep) ||
      fs.lstatSync(cache).isSymbolicLink()
    )
      throw Error('Cache move scope check failed');
    fs.renameSync(cache, destination);
    receipt.preservedGeneratedCache = destination;
  }
}
for (const args of commands[phase]) {
  console.log('Running ' + phase + ' in apps/web');
  const result = cp.spawnSync(process.execPath, args, {
    cwd: web,
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  const log = phase + '-' + receipt.commands.length + '.log';
  fs.writeFileSync(path.join(out, log), (result.stdout || '') + (result.stderr || ''));
  receipt.commands.push({
    executable: process.execPath,
    args,
    exitCode: result.status,
    signal: result.signal,
    log,
  });
  if (result.error || result.status !== 0) {
    process.exitCode = 1;
    break;
  }
}
fs.writeFileSync(path.join(out, phase + '-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(
  JSON.stringify({
    phase,
    pass:
      receipt.commands.length === commands[phase].length &&
      receipt.commands.every((c) => c.exitCode === 0),
    commands: receipt.commands.map((c) => ({ exitCode: c.exitCode, log: c.log })),
  }),
);
