#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { dirname, relative, resolve } = require('node:path');

const root = resolve(__dirname, '..');
const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
const packages = lock.packages;
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

const workerPath = require.resolve('thread-stream/lib/worker.js', { paths: [root] });
const resolvedPackage = require.resolve('real-require/package.json', {
  paths: [dirname(workerPath)],
});
const actual = JSON.parse(readFileSync(resolvedPackage, 'utf8'));
const relativePackage = relative(root, resolvedPackage).replaceAll('\\', '/');

assert.equal(actual.version, '0.2.0', 'worker resolves an incompatible real-require version');
assert.equal(
  relativePackage,
  'node_modules/real-require/package.json',
  'worker must use the valid root dependency, not a nested override',
);

process.stdout.write(
  `${JSON.stringify({
    status: 'DEPENDENCY_GRAPH_VALID',
    threadStream: thread.version,
    declaredRealRequire: thread.dependencies['real-require'],
    resolvedRealRequire: actual.version,
    resolvedPath: relativePackage,
  })}\n`,
);
