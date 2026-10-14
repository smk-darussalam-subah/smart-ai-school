'use strict';
// Literal, read-only Git inventory plus generated evidence. No index/ref writes.
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  crypto = require('node:crypto');
const repo = path.resolve(__dirname, '..');
const verifyOnly = process.argv.includes('--verify');
const argumentsList = process.argv.slice(2).filter((argument) => argument !== '--verify');
const out =
  argumentsList[0] && path.isAbsolute(argumentsList[0]) ? path.resolve(argumentsList[0]) : null;
const predecessorPaths = argumentsList.slice(1);
if (!out || !path.isAbsolute(out) || predecessorPaths.length !== 2)
  throw Error('Absolute evidence output and both frozen manifests required');
const owned = [
  '.tasks/PLAN-AUTH-SESSION-RECOVERY-2026-10-13.md',
  '.tasks/done/AUTH-SESSION-RECOVERY-2026-10-13-DONE.md',
  'apps/web/src/__tests__/api-backend-proxy-auth.test.ts',
  'apps/web/src/__tests__/api-backend-proxy-transport.test.ts',
  'apps/web/src/__tests__/auth-middleware-lifecycle.test.ts',
  'apps/web/src/__tests__/auth-request-session.test.ts',
  'apps/web/src/__tests__/auth-session-lifecycle.test.ts',
  'apps/web/src/__tests__/middleware.test.ts',
  'apps/web/src/__tests__/w10d-auth-security.test.ts',
  'apps/web/src/app/api/auth/refresh/route.ts',
  'apps/web/src/app/api/backend/[...path]/route.ts',
  'apps/web/src/app/auth/session-unavailable/page.tsx',
  'apps/web/src/app/dashboard/layout.tsx',
  'apps/web/src/components/auth/AuthSessionBoundary.tsx',
  'apps/web/src/components/auth/SessionRecoveryNotice.tsx',
  'apps/web/src/components/providers/DashboardProviders.tsx',
  'apps/web/src/lib/auth-session-state.ts',
  'apps/web/src/lib/auth.ts',
  'apps/web/src/lib/request-session.ts',
  'apps/web/src/middleware.ts',
  'scripts/auth-session-recovery-browser.cjs',
  'scripts/auth-session-recovery-evidence.cjs',
  'scripts/verify-auth-session-recovery.cjs',
].sort(); // JS default = case-sensitive UTF-16 code-unit ordinal, NOT localeCompare.
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function git(args, input) {
  const result = cp.spawnSync(
    'git',
    ['-c', 'safe.directory=' + repo.replaceAll('\\', '/'), ...args],
    { cwd: repo, input, encoding: input ? undefined : 'utf8', windowsHide: true },
  );
  if (result.status !== 0) throw Error('Read-only git operation failed: ' + args[0]);
  return Buffer.isBuffer(result.stdout) ? result.stdout : result.stdout.trim();
}
const head = git(['rev-parse', 'HEAD']);
if (head !== 'be600fa4532b39501478e2ad82c4f898e4f65ba6') throw Error('Base HEAD drift');
const files = owned.map((name) => {
  const target = path.resolve(repo, name);
  if (!target.startsWith(repo + path.sep) || fs.lstatSync(target).isSymbolicLink())
    throw Error('Unsafe source path');
  const bytes = fs.readFileSync(target);
  const tracked = git(['ls-files', '--stage', '--', name]);
  return {
    path: name,
    bytes: bytes.length,
    sha256: hash(bytes),
    mode: tracked ? tracked.split(' ')[0] : '100644',
    baseBlob: tracked ? tracked.split(' ')[1] : null,
    rawGitBlob: git(['hash-object', '--no-filters', '--stdin'], bytes).toString().trim(),
  };
});
const canonical = files.map((file) => file.path + '|' + file.sha256 + '\n').join('');
const staged = git(['diff', '--cached', '--name-only']);
if (staged) throw Error('Index must stay empty');
const diffCheck = cp.spawnSync('git', ['diff', '--check'], {
  cwd: repo,
  encoding: 'utf8',
  windowsHide: true,
});
if (diffCheck.status !== 0) throw Error('Whitespace/conflict check failed');
const changed = git(['diff', '--name-only']).split(/\r?\n/).filter(Boolean);
if (changed.some((name) => !owned.includes(name))) throw Error('Unexpected tracked delta');
const previous = predecessorPaths.map((name) => ({ path: name, bytes: fs.readFileSync(name) }));
const preserved = previous.flatMap((item) =>
  JSON.parse(item.bytes).files.map((file) => {
    const current = hash(fs.readFileSync(path.join(repo, file.path)));
    return {
      path: file.path,
      expectedSha256: file.sha256,
      actualSha256: current,
      match: current === file.sha256,
      ownedIntersection: owned.includes(file.path),
    };
  }),
);
if (preserved.some((item) => !item.match && !item.ownedIntersection))
  throw Error('Unapproved predecessor drift');
const conflictHits = files
  .filter((file) =>
    /^(?:<<<<<<< |=======\s*$|>>>>>>> )/m.test(fs.readFileSync(path.join(repo, file.path), 'utf8')),
  )
  .map((file) => file.path);
if (conflictHits.length) throw Error('Conflict marker');
const literalHits = files.flatMap((file) => {
  const text = fs.readFileSync(path.join(repo, file.path), 'utf8');
  return Array.from(text.matchAll(/(?:password|clientSecret|secret)\s*[:=]\s*['"]([^'"]+)['"]/g))
    .filter((match) => !/(?:synthetic|fixture|local-session-regression)/i.test(match[1]))
    .map(() => file.path);
});
if (literalHits.length) throw Error('Non-fixture credential literal requires investigation');
const manifest = {
  atUtc: new Date().toISOString(),
  repo: repo.replaceAll('\\', '/'),
  branch: git(['branch', '--show-current']),
  head,
  baseTree: git(['rev-parse', 'HEAD^{tree}']),
  stagedFiles: 0,
  fileCount: files.length,
  aggregate: hash(Buffer.from(canonical, 'utf8')),
  aggregateRule:
    'Case-sensitive UTF-16 code-unit ordinal path sort (JavaScript default .sort; no locale comparator); UTF-8 path|lowercase raw-byte SHA-256 + LF per row including final LF; no BOM',
  files,
};
if (verifyOnly) {
  const frozen = JSON.parse(fs.readFileSync(path.join(out, 'candidate-manifest.json')));
  if (
    frozen.head !== head ||
    frozen.baseTree !== manifest.baseTree ||
    frozen.aggregate !== manifest.aggregate ||
    JSON.stringify(frozen.files) !== JSON.stringify(files)
  )
    throw Error('Frozen source manifest mismatch');
  const evidence = JSON.parse(fs.readFileSync(path.join(out, 'evidence-manifest.json')));
  for (const file of evidence.files) {
    const target = path.resolve(path.dirname(out), file.path);
    if (
      !target.startsWith(path.dirname(out) + path.sep) ||
      hash(fs.readFileSync(target)) !== file.sha256
    )
      throw Error('Frozen evidence mismatch: ' + file.path);
  }
  const evidenceAggregate = hash(
    Buffer.from(
      [...evidence.files]
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        .map((file) => file.path + '|' + file.sha256 + '\n')
        .join(''),
      'utf8',
    ),
  );
  if (evidenceAggregate !== evidence.aggregate || evidence.fileCount !== evidence.files.length)
    throw Error('Evidence aggregate/count mismatch');
  console.log(
    JSON.stringify({
      readOnly: true,
      sourceFilesVerified: files.length,
      evidenceFilesVerified: evidence.files.length,
      unchangedPredecessors: preserved.filter((item) => item.match).length,
      predecessorCount: preserved.length,
      stagedFiles: 0,
    }),
  );
  process.exit(0);
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
  path.join(out, 'candidate-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
fs.writeFileSync(
  path.join(out, 'preservation-and-controls.json'),
  JSON.stringify(
    {
      atUtc: new Date().toISOString(),
      predecessorManifests: previous.map((item) => ({ path: item.path, sha256: hash(item.bytes) })),
      predecessorCount: preserved.length,
      unchangedCount: preserved.filter((item) => item.match).length,
      ownedChangedIntersections: preserved.filter((item) => !item.match),
      stagedFiles: 0,
      trackedDeltaCount: changed.length,
      diffCheckExit: diffCheck.status,
      conflictMarkerHits: conflictHits.length,
      nonFixtureCredentialLiteralHits: literalHits.length,
      scope: 'Local owned-path literal/whitespace scan; not a comprehensive security audit',
      preserved,
    },
    null,
    2,
  ) + '\n',
);
const evidenceRoot = path.dirname(out);
const evidenceNames = [
  'baseline-jest.json',
  'frozen-verification/tests-receipt.json',
  'frozen-verification/tests-0.log',
  'frozen-verification/web-final-jest.json',
  'frozen-verification/checks-receipt.json',
  'frozen-verification/checks-0.log',
  'frozen-verification/checks-1.log',
  'frozen-verification/build-receipt.json',
  'frozen-verification/build-0.log',
  'browser-frozen/browser-qa.json',
  'browser-frozen/local-server.log',
  'browser-frozen/session-outage-mobile.png',
  'browser-frozen/login-recovery-desktop.png',
  'ui-quality-receipt.json',
  'final-snapshot/candidate-manifest.json',
  'final-snapshot/preservation-and-controls.json',
].sort();
const evidenceFiles = evidenceNames.map((name) => {
  const bytes = fs.readFileSync(path.join(evidenceRoot, name));
  return { path: name, bytes: bytes.length, sha256: hash(bytes) };
});
const browserResult = JSON.parse(
  fs.readFileSync(path.join(evidenceRoot, 'browser-frozen/browser-qa.json')),
);
const testResult = JSON.parse(
  fs.readFileSync(path.join(evidenceRoot, 'frozen-verification/web-final-jest.json')),
);
if (
  browserResult.passed !== browserResult.total ||
  browserResult.pageErrors.length ||
  !testResult.success
)
  throw Error('Verification receipt failure');
fs.writeFileSync(
  path.join(out, 'evidence-manifest.json'),
  JSON.stringify(
    {
      fileCount: evidenceFiles.length,
      aggregateRule: manifest.aggregateRule,
      aggregate: hash(
        Buffer.from(
          evidenceFiles.map((file) => file.path + '|' + file.sha256 + '\n').join(''),
          'utf8',
        ),
      ),
      files: evidenceFiles,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    fileCount: files.length,
    manifestSha256: hash(fs.readFileSync(path.join(out, 'candidate-manifest.json'))),
    aggregate: manifest.aggregate,
    unchangedPredecessors: preserved.filter((item) => item.match).length,
    changedIntersections: preserved.filter((item) => !item.match).map((item) => item.path),
    stagedFiles: 0,
  }),
);
