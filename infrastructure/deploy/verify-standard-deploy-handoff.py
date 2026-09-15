#!/usr/bin/env python3
"""Bind the standard deployment restoration to the reviewed W10-D history."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys


BASE = '715121657e3d432f9c7cda82aa8cfefe7b32c199'
TREE = 'f6eb45f7f19eaca55b9294bac8a3d4652c54bd8f'
ROOT = Path(__file__).resolve().parents[2]
SELF = 'infrastructure/deploy/verify-standard-deploy-handoff.py'
REPORT = 'docs/audits/W10D-STANDARD-DEPLOY-WORKFLOW-RESTORATION-EXECUTOR-2026-09-14.md'
EVIDENCE = 'docs/audits/W10D-STANDARD-DEPLOY-WORKFLOW-RESTORATION-EVIDENCE-2026-09-14.json'
PREDECESSOR_VALIDATOR = 'infrastructure/deploy/verify-integrated-handoff.py'
PREDECESSOR_REPORT = 'docs/audits/W10D-WRITER-COMPATIBILITY-HANDOFF-EXECUTOR-2026-09-14.md'
PREDECESSOR_EVIDENCE = 'docs/audits/W10D-WRITER-COMPATIBILITY-HANDOFF-EVIDENCE-2026-09-14.json'
PREDECESSOR_VALIDATOR_SHA = '41c6cfa39defb6ab6b3e1fc10aa53375a4a23a5b7f3a5fb4218cd509b19f2840'
PREDECESSOR_REPORT_SHA = 'd17cb4c9ca4e714af9c1f5b861aba25d90be9eb19a28ecc80d3a268094ef7528'
PREDECESSOR_EVIDENCE_SHA = '9632ae8b735b86118418f8148e53a4926ffe297786ed6cd183560a1233aad69a'
PREDECESSOR_RESULT = {'sourceFiles': 6, 'rebindings': 6, 'historicalInputs': 88}
SOURCE = (
    '.github/workflows/capacity-lifecycle.yml',
    '.github/workflows/ci.yml',
    '.github/workflows/deploy.yml',
    'apps/api/src/__tests__/deploy-workflow-safety.spec.ts',
    'infrastructure/deploy/tests/staging-readiness-contract.py',
    'infrastructure/deploy/tests/standard-deploy-handoff-contract.py',
    SELF,
)
HASH = re.compile(r'[a-f0-9]{64}\Z')
GIT_SHA = re.compile(r'[a-f0-9]{40}\Z')
MAX_INPUT_BYTES = 2 * 1024 * 1024


class ValidationError(ValueError):
    pass


def require(condition, reason):
    if not condition:
        raise ValidationError(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pairs(items):
    value = {}
    for key, item in items:
        require(key not in value, 'duplicate-json-key')
        value[key] = item
    return value


def safe_path(value):
    require(type(value) is str and value and '\\' not in value, 'unsafe-path')
    path = Path(value)
    require(not path.is_absolute() and '..' not in path.parts and '.' not in path.parts,
            'unsafe-path')
    return path


def read(root, relative):
    root = Path(root).resolve(strict=True)
    path = root / safe_path(relative)
    try:
        before = path.lstat()
        resolved = path.resolve(strict=True)
        resolved.relative_to(root)
        require(stat.S_ISREG(before.st_mode) and not stat.S_ISLNK(before.st_mode)
                and before.st_size <= MAX_INPUT_BYTES, 'unsafe-input')
        raw = resolved.read_bytes()
        after = path.lstat()
    except (OSError, ValueError):
        raise ValidationError('unreadable-input') from None
    require(len(raw) == before.st_size and before.st_mtime_ns == after.st_mtime_ns
            and before.st_ino == after.st_ino, 'input-drift')
    return raw


def parse(raw, reason):
    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=pairs)
    except (UnicodeDecodeError, json.JSONDecodeError, ValidationError):
        raise ValidationError(reason) from None


def git(root, *args):
    command = ['git']
    pointer = Path(root) / '.git'
    if os.name == 'posix' and pointer.is_file():
        value = pointer.read_text().strip().removeprefix('gitdir: ')
        if re.match('[A-Za-z]:/', value):
            command += ['--git-dir', '/mnt/' + value[0].lower() + value[2:],
                        '--work-tree', str(root)]
    return subprocess.check_output([*command, *args], cwd=root, timeout=120,
                                   stderr=subprocess.DEVNULL)


def git_blob(root, commit, relative):
    safe_path(relative)
    return git(root, 'show', f'{commit}:{relative}')


def workspace_paths(root):
    modified = git(root, 'diff', '--name-only', '--diff-filter=ACDMRTUXB', BASE, '--')
    untracked = git(root, 'ls-files', '--others', '--exclude-standard')
    try:
        return {line for raw in (modified, untracked)
                for line in raw.decode('utf-8').splitlines() if line}
    except UnicodeError:
        raise ValidationError('workspace-path-encoding') from None


def manifest_hash(manifest):
    raw = ''.join(f'{manifest[path]}  {path}\n' for path in sorted(manifest)).encode()
    return sha(raw)


def predecessor(root):
    require(git(root, 'rev-parse', BASE + '^{tree}').decode().strip() == TREE,
            'baseline-tree-mismatch')
    validator = git_blob(root, BASE, PREDECESSOR_VALIDATOR)
    report = git_blob(root, BASE, PREDECESSOR_REPORT)
    evidence = git_blob(root, BASE, PREDECESSOR_EVIDENCE)
    require(sha(validator) == PREDECESSOR_VALIDATOR_SHA, 'predecessor-validator-drift')
    require(sha(report) == PREDECESSOR_REPORT_SHA, 'predecessor-report-drift')
    require(sha(evidence) == PREDECESSOR_EVIDENCE_SHA, 'predecessor-evidence-drift')

    scope = {'__file__': str(Path(root) / PREDECESSOR_VALIDATOR),
             '__name__': 'standard_deploy_predecessor'}
    exec(compile(validator, PREDECESSOR_VALIDATOR, 'exec'), scope)
    expected = set(scope['SOURCE']) | {scope['REPORT'], scope['EVIDENCE']}
    scope['workspace_paths'] = lambda _root: expected
    scope['read'] = lambda _root, relative: git_blob(root, BASE, relative)
    result = scope['validate'](root, predecessors=True)
    require(result == PREDECESSOR_RESULT, 'predecessor-result-mismatch')
    return result


def expected_changes(root, manifest):
    changes = {}
    for path in SOURCE:
        try:
            before = sha(git_blob(root, BASE, path))
            status = 'modified'
        except subprocess.CalledProcessError:
            before = None
            status = 'added'
        changes[path] = {
            'status': status,
            'beforeSha256': before,
            'afterSha256': manifest[path],
        }
    return changes


def validate_packet(evidence, report_raw, source_bytes, changes):
    require(type(evidence) is dict and set(evidence) == {
        'schema', 'baseline', 'supersedes', 'sourceManifest',
        'sourceManifestSha256', 'reportSha256', 'changes', 'tests',
        'claims', 'operationalStatus',
    }, 'evidence-schema')
    require(evidence['schema'] == 'diis-standard-deploy-handoff-v1', 'schema-invalid')
    require(evidence['baseline'] == {'sha': BASE, 'tree': TREE}, 'baseline-binding')
    require(evidence['supersedes'] == {
        'validatorPath': PREDECESSOR_VALIDATOR,
        'validatorSha256': PREDECESSOR_VALIDATOR_SHA,
        'reportPath': PREDECESSOR_REPORT,
        'reportSha256': PREDECESSOR_REPORT_SHA,
        'evidencePath': PREDECESSOR_EVIDENCE,
        'evidenceSha256': PREDECESSOR_EVIDENCE_SHA,
        'result': PREDECESSOR_RESULT,
    }, 'predecessor-binding')
    manifest = evidence['sourceManifest']
    require(type(manifest) is dict and set(manifest) == set(SOURCE), 'manifest-path-set')
    require(set(source_bytes) == set(SOURCE), 'source-byte-set')
    for path, digest in manifest.items():
        require(type(digest) is str and HASH.fullmatch(digest)
                and sha(source_bytes[path]) == digest, 'source-byte-drift')
    require(evidence['sourceManifestSha256'] == manifest_hash(manifest),
            'manifest-aggregate')
    require(type(evidence['reportSha256']) is str
            and HASH.fullmatch(evidence['reportSha256'])
            and sha(report_raw) == evidence['reportSha256'], 'report-binding')
    require(evidence['changes'] == changes, 'change-binding')
    tests = evidence['tests']
    require(type(tests) is dict and set(tests) == {
        'capacityLifecycle', 'deployWorkflowSafety', 'stagingReadiness',
        'sourceClosure', 'integratedClosure', 'handoffContract',
    }, 'test-schema')
    for result in tests.values():
        require(type(result) is dict and set(result) == {
            'command', 'cases', 'exitCode', 'executed',
        } and result['executed'] is True and result['exitCode'] == 0
                and type(result['cases']) is int and result['cases'] > 0
                and type(result['command']) is str and result['command'], 'test-binding')
    require(evidence['claims'] == {
        'standardStagingDeployRestored': True,
        'recoveryExecutorsRetainedButNotWired': True,
        'hostLockRetained': True,
        'shaBindingRetained': True,
        'dirtyCheckoutRejected': True,
        'sharedIngressFailClosedRetained': True,
        'backupBehaviorChanged': False,
        'n8nBehaviorChanged': False,
        'historicalEvidenceChanged': False,
        'runtimeMutations': False,
    }, 'claim-binding')
    require(evidence['operationalStatus']
            == 'SOURCE COMPLETE - INDEPENDENT REVIEW REQUIRED - DEPLOYMENT HOLD',
            'operational-status')
    return manifest


def validate(root=ROOT, check_predecessor=True):
    root = Path(root).resolve()
    expected = set(SOURCE) | {REPORT, EVIDENCE}
    require(workspace_paths(root) == expected, 'workspace-path-set')
    report_raw = read(root, REPORT)
    evidence = parse(read(root, EVIDENCE), 'evidence-json')
    source_bytes = {path: read(root, path) for path in SOURCE}
    manifest = evidence.get('sourceManifest') if type(evidence) is dict else None
    require(type(manifest) is dict, 'manifest-schema')
    changes = expected_changes(root, manifest)
    validate_packet(evidence, report_raw, source_bytes, changes)
    previous = predecessor(root) if check_predecessor else PREDECESSOR_RESULT
    return {
        'sourceFiles': len(SOURCE),
        'pathCount': len(expected),
        'historicalInputs': previous['historicalInputs'] + previous['sourceFiles'] + 2,
    }


if __name__ == '__main__':
    try:
        print('STANDARD_DEPLOY_HANDOFF_VALID '
              + json.dumps(validate(), sort_keys=True))
    except (ValidationError, OSError, KeyError, TypeError, subprocess.SubprocessError):
        sys.exit('STANDARD_DEPLOY_HANDOFF_REJECTED')
