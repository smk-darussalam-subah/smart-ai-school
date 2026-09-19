#!/usr/bin/env python3
"""Bind the application-only Compose compatibility fix to reviewed history."""
import hashlib
import json
import os
from contextlib import contextmanager
from pathlib import Path
import re
import stat
import subprocess
import sys


BASE = 'b702aac2c3b84db0c8ae0738449b8d2182e8343d'
TREE = '3b265ae1e1a12873964aac940eac8488d9441dd4'
ROOT = Path(__file__).resolve().parents[2]
SELF = 'infrastructure/deploy/verify-standard-deploy-compose-handoff.py'
REPORT = 'docs/audits/W10D-STANDARD-DEPLOY-COMPOSE-COMPATIBILITY-EXECUTOR-2026-09-15.md'
EVIDENCE = 'docs/audits/W10D-STANDARD-DEPLOY-COMPOSE-COMPATIBILITY-EVIDENCE-2026-09-15.json'
PREDECESSOR_VALIDATOR = 'infrastructure/deploy/verify-standard-deploy-handoff.py'
PREDECESSOR_REPORT = 'docs/audits/W10D-STANDARD-DEPLOY-WORKFLOW-RESTORATION-EXECUTOR-2026-09-14.md'
PREDECESSOR_EVIDENCE = 'docs/audits/W10D-STANDARD-DEPLOY-WORKFLOW-RESTORATION-EVIDENCE-2026-09-14.json'
PREDECESSOR_VALIDATOR_SHA = '848fe9f4573a3156608f5dc5a3d6d4109f6ce917dca2021b4081190fd185fb47'
PREDECESSOR_REPORT_SHA = 'af4b70b4f5f4721e2bc84ed4aa27b76748bee6edd159c01682a40d0603ba43db'
PREDECESSOR_EVIDENCE_SHA = '1a26463b0197d380d66a57d93412f541cfe466128409cd054aba0a6236673148'
PREDECESSOR_RESULT = {'sourceFiles': 7, 'pathCount': 9, 'historicalInputs': 96}
SOURCE = (
    '.github/workflows/capacity-lifecycle.yml',
    '.github/workflows/ci.yml',
    '.github/workflows/deploy.yml',
    'apps/api/src/__tests__/deploy-workflow-safety.spec.ts',
    'infrastructure/deploy/compose-application.sh',
    'infrastructure/deploy/tests/compose-application-contract.sh',
    'infrastructure/deploy/tests/standard-deploy-compose-handoff-contract.py',
    SELF,
)
HASH = re.compile(r'[a-f0-9]{64}\Z')
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
    if isinstance(relative, Path):
        relative = relative.as_posix()
    require(type(relative) is str, 'unsafe-path')
    relative = relative.replace('\\', '/')
    safe_path(relative)
    return git(root, 'show', f'{commit}:{relative}')


@contextmanager
def portable_historical_git_paths():
    """Normalize only Git object paths used by immutable predecessor validators."""
    original = subprocess.check_output
    original_path_str = Path.__str__

    def relative_posix_str(path):
        value = original_path_str(path)
        return value if path.is_absolute() else value.replace('\\', '/')

    def normalized(command, *args, **kwargs):
        if isinstance(command, (list, tuple)) and 'show' in command:
            command = list(command)
            show = command.index('show')
            if show + 1 < len(command) and ':' in command[show + 1]:
                commit, path = command[show + 1].split(':', 1)
                command[show + 1] = commit + ':' + path.replace('\\', '/')
        return original(command, *args, **kwargs)

    subprocess.check_output = normalized
    Path.__str__ = relative_posix_str
    try:
        yield
    finally:
        Path.__str__ = original_path_str
        subprocess.check_output = original


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
             '__name__': 'compose_compatibility_predecessor'}
    exec(compile(validator, PREDECESSOR_VALIDATOR, 'exec'), scope)
    source = set(scope['SOURCE']) | {scope['REPORT'], scope['EVIDENCE']}
    scope['workspace_paths'] = lambda _root: source
    scope['read'] = lambda _root, relative: git_blob(root, BASE, relative)
    with portable_historical_git_paths():
        result = scope['validate'](root, check_predecessor=True)
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
    require(evidence['schema'] == 'diis-standard-deploy-compose-handoff-v1',
            'schema-invalid')
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
        'composeBehaviorGitBash', 'composeBehaviorWsl', 'deployWorkflowSafety',
        'sourceClosure', 'integratedClosure', 'stagingReadiness',
        'capacityLifecycle', 'handoffContract',
    }, 'test-schema')
    for result in tests.values():
        require(type(result) is dict and set(result) == {
            'command', 'cases', 'exitCode', 'executed', 'note',
        } and result['executed'] is True and result['exitCode'] == 0
                and type(result['cases']) is int and result['cases'] > 0
                and type(result['command']) is str and result['command']
                and type(result['note']) is str, 'test-binding')
    require(evidence['claims'] == {
        'applicationComposeParsesWithoutCommissionedBackupImage': True,
        'backupServiceStillRequiresReviewedImage': True,
        'placeholderIsNonResolvingAndApplicationScoped': True,
        'standardDeployBehaviorOtherwiseChanged': False,
        'backupBehaviorChanged': False,
        'n8nBehaviorChanged': False,
        'historicalEvidenceChanged': False,
        'applicationRuntimeChanged': False,
        'stagingCheckoutAdvancedBeforeFailure': True,
        'stagingEnvReconciledBeforeFailure': True,
        'postFailureRuntimeMutations': False,
    }, 'claim-binding')
    require(evidence['operationalStatus']
            == 'SOURCE COMPLETE - INDEPENDENT REVIEW REQUIRED - STAGING HOLD',
            'operational-status')
    return manifest


def validate_package(root=ROOT, check_predecessor=True):
    root = Path(root).resolve()
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
        'pathCount': len(set(SOURCE) | {REPORT, EVIDENCE}),
        'historicalInputs': previous['historicalInputs'] + previous['sourceFiles'] + 2,
    }


def validate(root=ROOT, check_predecessor=True):
    root = Path(root).resolve()
    expected = set(SOURCE) | {REPORT, EVIDENCE}
    require(workspace_paths(root) == expected, 'workspace-path-set')
    return validate_package(root, check_predecessor)


if __name__ == '__main__':
    try:
        print('STANDARD_DEPLOY_COMPOSE_HANDOFF_VALID '
              + json.dumps(validate(), sort_keys=True))
    except (ValidationError, OSError, KeyError, TypeError, subprocess.SubprocessError):
        sys.exit('STANDARD_DEPLOY_COMPOSE_HANDOFF_REJECTED')
