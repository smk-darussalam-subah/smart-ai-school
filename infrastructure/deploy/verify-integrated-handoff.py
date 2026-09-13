#!/usr/bin/env python3
"""Bind the D2 build-bootstrap follow-up to its reviewed D0 predecessor."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys


BASE = 'b2ee3b369db6b95b09de7cbca6de94dd2e779b8e'
TREE = '5453bfb7701d4adac7691fbef46a3e80f7782b20'
ROOT = Path(__file__).resolve().parents[2]
SELF = 'infrastructure/deploy/verify-integrated-handoff.py'
REPORT = 'docs/audits/W10-D-D2-BUILD-BOOTSTRAP-FOLLOWUP-2026-09-12.md'
EVIDENCE = 'docs/audits/W10-D-D2-BUILD-BOOTSTRAP-EVIDENCE-2026-09-12.json'
PREDECESSOR_REPORT = 'docs/audits/W10-D-INTEGRATED-D0-EXECUTOR-2026-09-11.md'
PREDECESSOR_EVIDENCE = 'docs/audits/W10-D-INTEGRATED-D0-EVIDENCE-2026-09-11.json'
PREDECESSOR_VALIDATOR_SHA = 'c9902efdd754805251470804bcd8689ddb8eae24062931abfe00d5a2b86db7df'
PREDECESSOR_REPORT_SHA = '4b8c4ce0dd35e461443d50b0dfa5d112221bb85c21a1ffa5ab97cfe180a8272e'
PREDECESSOR_EVIDENCE_SHA = 'a382267cf5a23fce79a46d02a582e89d318a0c515752c762378932323275b0ab'
PREDECESSOR_MANIFEST_SHA = 'c75c1c81e0889ed1b99f2bac4796e650d6ac30462e1bb8452a57410a62994709'
SOURCE = (
    '.github/workflows/backup-image.yml',
    'infrastructure/deploy/tests/integrated-closure-contract.py',
    'infrastructure/deploy/tests/source-closure-contract.py',
    'infrastructure/deploy/verify-backup-build-trigger.py',
    SELF,
    'infrastructure/deploy/verify-publication-metadata.py',
)
HASH = re.compile(r'[a-f0-9]{64}\Z')


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pairs(items):
    value = {}
    for key, item in items:
        require(key not in value, 'duplicate-key')
        value[key] = item
    return value


def safe_path(value):
    require(type(value) is str and value and '\\' not in value, 'unsafe-path')
    path = Path(value)
    require(not path.is_absolute() and '..' not in path.parts and '.' not in path.parts,
            'unsafe-path')
    return path


def read(root, relative):
    path = root / safe_path(relative)
    require(path.resolve(strict=True) == path, 'unsafe-path')
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1
            and info.st_size <= 2 * 1024**2, 'unsafe-file')
    raw = path.read_bytes()
    require(len(raw) == info.st_size and path.stat().st_mtime_ns == info.st_mtime_ns,
            'file-drift')
    return raw


def parse(raw, reason):
    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=pairs)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
        raise ValueError(reason) from None


def git(root, *args):
    command = ['git']
    pointer = root / '.git'
    if os.name == 'posix' and pointer.is_file():
        value = pointer.read_text().strip().removeprefix('gitdir: ')
        if re.match('[A-Za-z]:/', value):
            command += ['--git-dir', '/mnt/' + value[0].lower() + value[2:],
                        '--work-tree', str(root)]
    return subprocess.check_output([*command, *args], cwd=root, timeout=120,
                                   stderr=subprocess.DEVNULL)


def workspace_paths(root):
    modified = git(root, 'diff', '--name-only', '--diff-filter=ACDMRTUXB', BASE, '--')
    untracked = git(root, 'ls-files', '--others', '--exclude-standard')
    try:
        paths = {line for raw in (modified, untracked)
                 for line in raw.decode('utf-8').splitlines() if line}
    except UnicodeError:
        raise ValueError('workspace-path-encoding') from None
    require(all(not Path(path).is_absolute() and '..' not in Path(path).parts
                for path in paths), 'workspace-path')
    return paths


def manifest_hash(manifest):
    raw = ''.join(f'{manifest[path]}  {path}\n' for path in sorted(manifest)).encode()
    return sha(raw)


def predecessor(root):
    """Verify D0 from exact Git bytes and execute its historical validator chain."""
    require(git(root, 'rev-parse', BASE + '^{tree}').decode().strip() == TREE,
            'baseline-tree')
    validator = git(root, 'show', BASE + ':' + SELF)
    require(sha(validator) == PREDECESSOR_VALIDATOR_SHA, 'predecessor-validator')

    report = read(root, PREDECESSOR_REPORT)
    evidence_raw = read(root, PREDECESSOR_EVIDENCE)
    require(sha(report) == PREDECESSOR_REPORT_SHA
            and report == git(root, 'show', BASE + ':' + PREDECESSOR_REPORT),
            'predecessor-report')
    require(sha(evidence_raw) == PREDECESSOR_EVIDENCE_SHA
            and evidence_raw == git(root, 'show', BASE + ':' + PREDECESSOR_EVIDENCE),
            'predecessor-evidence')
    evidence = parse(evidence_raw, 'predecessor-evidence-json')
    require(type(evidence) is dict
            and evidence.get('schema') == 'diis-integrated-d0-handoff-v1'
            and evidence.get('baseline') == {
                'sha': 'a8d72b8e2a6e78438e4cef46ad21913ff369d3f0',
                'tree': '75364250f2a5bbe875fc4bcf3da517c8f456adea',
            }, 'predecessor-binding')
    manifest = evidence.get('sourceManifest')
    require(type(manifest) is dict and manifest, 'predecessor-manifest')
    for path, digest in manifest.items():
        safe_path(path)
        require(type(digest) is str and HASH.fullmatch(digest)
                and sha(git(root, 'show', BASE + ':' + path)) == digest,
                'predecessor-manifest-drift')
    require(manifest_hash(manifest) == PREDECESSOR_MANIFEST_SHA
            and evidence.get('sourceManifestSha256') == PREDECESSOR_MANIFEST_SHA
            and evidence.get('reportSha256') == PREDECESSOR_REPORT_SHA,
            'predecessor-manifest-aggregate')

    scope = {'__file__': str(root / SELF), '__name__': 'd0_predecessor'}
    exec(compile(validator, SELF, 'exec'), scope)
    require(scope.get('BASE') == evidence['baseline']['sha']
            and scope.get('TREE') == evidence['baseline']['tree'],
            'predecessor-validator-binding')
    return scope['historical'](root)


def expected_rebindings(root, manifest):
    changed = {}
    for path in SOURCE:
        entry = git(root, 'ls-tree', BASE, '--', path).strip()
        before = sha(git(root, 'show', BASE + ':' + path)) if entry else None
        if before != manifest[path]:
            changed[path] = {'before': before, 'after': manifest[path]}
    return changed


def validate(root=ROOT, predecessors=True):
    root = Path(root).resolve()
    require(workspace_paths(root) == set(SOURCE) | {REPORT, EVIDENCE},
            'successor-workspace-scope')
    evidence = parse(read(root, EVIDENCE), 'successor-evidence-json')
    require(type(evidence) is dict and set(evidence) == {
        'schema', 'baseline', 'supersedes', 'sourceManifest',
        'sourceManifestSha256', 'reportSha256', 'rebindings', 'tests',
        'observations', 'operationalStatus',
    }, 'successor-schema')
    require(evidence['schema'] == 'diis-w10d-d2-build-bootstrap-handoff-v1'
            and evidence['baseline'] == {'sha': BASE, 'tree': TREE}
            and evidence['operationalStatus']
            == 'SOURCE COMPLETE - INDEPENDENT REVIEW REQUIRED - D2 BUILD AND D3-D6 HOLD',
            'successor-binding')
    require(evidence['supersedes'] == {
        'validatorPath': SELF,
        'validatorSha256': PREDECESSOR_VALIDATOR_SHA,
        'reportPath': PREDECESSOR_REPORT,
        'reportSha256': PREDECESSOR_REPORT_SHA,
        'evidencePath': PREDECESSOR_EVIDENCE,
        'evidenceSha256': PREDECESSOR_EVIDENCE_SHA,
        'sourceManifestSha256': PREDECESSOR_MANIFEST_SHA,
    }, 'predecessor-declaration')

    manifest = evidence['sourceManifest']
    require(type(manifest) is dict and set(manifest) == set(SOURCE),
            'manifest-path-set')
    for path, digest in manifest.items():
        require(type(digest) is str and HASH.fullmatch(digest)
                and sha(read(root, path)) == digest, 'manifest-byte-drift')
    require(manifest_hash(manifest) == evidence['sourceManifestSha256'],
            'manifest-aggregate')
    require(sha(read(root, REPORT)) == evidence['reportSha256'], 'report-binding')
    require(expected_rebindings(root, manifest) == evidence['rebindings'],
            'rebindings-mismatch')

    tests = evidence['tests']
    require(type(tests) is dict and tests, 'test-evidence-missing')
    for result in tests.values():
        require(type(result) is dict and result.get('executed') is True
                and result.get('exitCode') == 0 and type(result.get('cases')) is int
                and result['cases'] > 0 and type(result.get('command')) is str
                and result['command'], 'test-evidence-invalid')
    observations = evidence['observations']
    require(type(observations) is dict
            and observations.get('dispatchOutcome') == 'stopped-before-run'
            and observations.get('artifactOrPackageCreated') is False
            and observations.get('publishFromBootstrapTag') is False
            and observations.get('bootstrapSingleUse')
            == 'oldest-exact-workflow-run-only'
            and observations.get('driveRole') == 'encrypted-offsite-archive-source'
            and observations.get('restoreComputePolicy')
            == 'existing-school-owned-no-new-cost-only'
            and observations.get('googleCloudBillingLinked') is False
            and observations.get('executableRestoreTarget') == 'not-yet-accepted',
            'observation-evidence-invalid')
    historical = predecessor(root) if predecessors else 0
    return {
        'sourceFiles': len(manifest),
        'rebindings': len(evidence['rebindings']),
        'historicalInputs': historical,
    }


if __name__ == '__main__':
    try:
        print('COMMISSIONING_BOOTSTRAP_HANDOFF_VALID '
              + json.dumps(validate(), sort_keys=True))
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError):
        sys.exit('COMMISSIONING_BOOTSTRAP_HANDOFF_REJECTED')
