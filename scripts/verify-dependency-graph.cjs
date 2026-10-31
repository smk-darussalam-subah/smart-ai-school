#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const { existsSync, readFileSync, realpathSync } = require('node:fs');
const { dirname, relative, resolve } = require('node:path');

const root = resolve(__dirname, '..');
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
const packages = lock.packages;
const { createRequire } = require('node:module');
const apiManifest = resolve(root, 'apps/api/package.json');
const webManifest = resolve(root, 'apps/web/package.json');
const contexts = { api: existsSync(apiManifest), web: existsSync(webManifest) };
assert(contexts.api || contexts.web, 'API or Web workspace manifest required');
// GHSA-p3m5-59mp-jv5r: App Router Server Actions require the patched 15.x line.
// The global lock remains authoritative even in an API-only Docker context.
const nextVersionSafe = (version) => {
  const parts = /^(15)\.(\d+)\.(\d+)$/.exec(version ?? '');
  return !!parts && (Number(parts[2]) > 5 || (Number(parts[2]) === 5 && Number(parts[3]) >= 28));
};
const nextEntries = Object.entries(packages).filter(([name]) =>
  /(?:^|\/)node_modules\/next$/.test(name),
);
assert(nextEntries.length > 0, 'Next.js must be locked');
for (const [name, entry] of nextEntries) {
  assert(
    nextVersionSafe(entry.version),
    `${name}: Next.js 15.5.28 or later patched 15.x is required`,
  );
}
assert.equal(
  packages['node_modules/sharp']?.version,
  '0.35.5',
  'sharp lock must retain the reviewed native baseline',
);
assert.equal(packages['node_modules/rxjs']?.version, '7.8.2');
assert.deepEqual(
  Object.keys(packages).filter(
    (p) => p.endsWith('/node_modules/rxjs') || p === 'node_modules/rxjs',
  ),
  ['node_modules/rxjs'],
  'nested RxJS copy must not be locked',
);
const thread = packages['node_modules/thread-stream'];

assert.equal(thread?.version, '3.2.0', 'unexpected thread-stream version');
assert.equal(
  thread?.dependencies?.['real-require'],
  '^0.2.0',
  'thread-stream dependency contract changed',
);
assert.equal(packages['node_modules/real-require']?.version, '0.2.0');
assert.equal(
  packages['node_modules/thread-stream/node_modules/real-require'],
  undefined,
  'invalid nested real-require must not be locked',
);

// Absence of a workspace is intentional in its sibling's Dockerfile. When a
// manifest is present, missing/broken modules must still fail rather than skip.
let webProof = null;
if (contexts.web) {
  const webRequire = createRequire(webManifest);
  const nextPackage = webRequire('next/package.json');
  assert(
    nextVersionSafe(nextPackage.version),
    'installed Next.js must include the Server Actions fix',
  );
  assert.equal(
    nextPackage.version,
    packages['node_modules/next']?.version,
    'Next.js install/lock drift',
  );
  const nextRequire = createRequire(webRequire.resolve('next/package.json'));
  const sharpVersion = nextRequire('sharp').versions.sharp;
  assert.equal(sharpVersion, packages['node_modules/sharp'].version, 'sharp install/lock drift');
  webProof = { next: nextPackage.version, sharp: sharpVersion };
}

let apiProof = null;
if (contexts.api) {
  // Nest normalizes async controllers using Observable constructor identity.
  const appRequire = createRequire(apiManifest);
  const coreRequire = createRequire(appRequire.resolve('@nestjs/core/package.json'));
  const appRx = appRequire('rxjs');
  const coreRx = coreRequire('rxjs');
  assert.equal(
    appRx.Observable,
    coreRx.Observable,
    'API and Nest must share one Observable constructor',
  );
  const workerPath = require.resolve('thread-stream/lib/worker.js', { paths: [root] });
  const resolvedPackage = require.resolve('real-require/package.json', {
    paths: [dirname(workerPath)],
  });
  const actual = JSON.parse(readFileSync(resolvedPackage, 'utf8'));
  const installedRoot = realpathSync(resolve(root, 'node_modules'));
  const relativePackage =
    'node_modules/' + relative(installedRoot, realpathSync(resolvedPackage)).replaceAll('\\', '/');
  assert.equal(actual.version, '0.2.0', 'worker resolves an incompatible real-require version');
  assert.equal(
    relativePackage,
    'node_modules/real-require/package.json',
    'worker must use the valid root dependency, not a nested override',
  );
  apiProof = {
    rxjs: appRequire('rxjs/package.json').version,
    sharedObservableConstructor: true,
    resolvedRealRequire: actual.version,
    resolvedPath: relativePackage,
  };
}

process.stdout.write(
  `${JSON.stringify({
    status: 'DEPENDENCY_GRAPH_VALID',
    contexts,
    physicalChecks: { api: apiProof !== null, web: webProof !== null },
    next: webProof?.next ?? null,
    sharp: webProof?.sharp ?? null,
    lockedNext: nextEntries.map(([, entry]) => entry.version),
    lockedSharp: packages['node_modules/sharp'].version,
    nextServerActionsSecurityBaseline: '15.5.28',
    rxjs: apiProof?.rxjs ?? null,
    sharedObservableConstructor: apiProof?.sharedObservableConstructor ?? null,
    threadStream: thread.version,
    declaredRealRequire: thread.dependencies['real-require'],
    resolvedRealRequire: apiProof?.resolvedRealRequire ?? null,
    resolvedPath: apiProof?.resolvedPath ?? null,
  })}\n`,
);
