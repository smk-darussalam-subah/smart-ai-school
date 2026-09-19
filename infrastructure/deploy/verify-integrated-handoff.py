#!/usr/bin/env python3
"""Bind the writer-compatibility follow-up to reviewed predecessor packets."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys


BASE = '57c95976d48e6dce1e8a99290125948f0180c180'
TREE = 'f79ba17f186bd05f3f76a70cf9cbc4759c319dfd'
ROUNDTRIP_BASE = '2d6d05313ec301dbf30929812193245d7d1153b5'
ROUNDTRIP_BASE_TREE = 'a624ee4ab494112bee6401960b6684af5e3dad2e'
ROOT = Path(__file__).resolve().parents[2]
SELF = 'infrastructure/deploy/verify-integrated-handoff.py'
REPORT = 'docs/audits/W10D-WRITER-COMPATIBILITY-HANDOFF-EXECUTOR-2026-09-14.md'
EVIDENCE = 'docs/audits/W10D-WRITER-COMPATIBILITY-HANDOFF-EVIDENCE-2026-09-14.json'
PREDECESSOR_REPORT = 'docs/audits/W10-D-D2-BUILD-BOOTSTRAP-FOLLOWUP-2026-09-12.md'
PREDECESSOR_EVIDENCE = 'docs/audits/W10-D-D2-BUILD-BOOTSTRAP-EVIDENCE-2026-09-12.json'
PREDECESSOR_VALIDATOR_SHA = '25b8d423145db844ac00d36205156032f98c2a05628076b580dc53faccf8cdf0'
PREDECESSOR_REPORT_SHA = 'd44a9f0505a274391e6f5982479ea21fa83313d1f7685201c27e2a60b90f94e5'
PREDECESSOR_EVIDENCE_SHA = '0ab4c8ae532b1686e02d21aa25a669dbe6e6cd16df1b241863af46731f3f9a83'
PREDECESSOR_MANIFEST_SHA = '7d48dcfdff0ed0c909eb15efc1c2a8673683ba7c7fa52d00cfa63940244fe958'
ROUNDTRIP_REPORT = 'docs/audits/W10D-BACKUP-RESTORE-GDRIVE-ROUNDTRIP-EXECUTOR-2026-09-13.md'
ROUNDTRIP_EVIDENCE = 'docs/audits/W10D-BACKUP-RESTORE-GDRIVE-ROUNDTRIP-EVIDENCE-2026-09-13.json'
ROUNDTRIP_RECEIPT_DIR = \
    'docs/audits/W10D-BACKUP-RESTORE-GDRIVE-ROUNDTRIP-FOLLOWUP-RECEIPTS-2026-09-13'
ROUNDTRIP_REPORT_SHA = '202857d3436297302add583c7f1cd159b74f54da9928c107a7a186f6e12a6e2a'
ROUNDTRIP_EVIDENCE_SHA = '538626353e6cdbd0c3a3adc70ae0f583db5bbd5a00c026ef69746f742f0740ff'
ROUNDTRIP_MANIFEST_SHA = '3b05579d80ce4fb0fee028408d75ff2687480266da1111c14993ffbe7d0aac83'
ROUNDTRIP_RECEIPT_MANIFEST_SHA = \
    'ab0db74aea3a47033dcd8f9fb31af94f02142c0d2f4866032f73b05c23df7883'
WRITER_LIBRARY = 'infrastructure/docker/scripts/backup-lib.sh'
WRITER_LIBRARY_SHA = 'a2a665af38a5e187a351397c7d0adf7082205c59c1fd97dbf0dac706cc5edb86'
WRITER_WRAPPER = 'infrastructure/deploy/legacy-backup-compatibility.sh'
WRITER_WRAPPER_SHA = 'ceba770caa09446a83f09ce7dc72d317782d26e2c06121e7730f0bc07042c326'
WRITER_ARTIFACT_SHA = '001f40b7c1cdcfca4b5e623bedd646bd86e997e6683faa0245df4102883148ca'
STALE_WRITER_HASHES = (
    'bf881caf29af389e1d0d328e9b5816d570154b72b873ea82aac6d1be418e8e5a',
    '70cf649cc5845827aa4d66c3d4148bb6f6f718b169a93074ad4abd7da803718f',
)
SOURCE = (
    'infrastructure/deploy/install-w10d-writer-compatibility.py',
    WRITER_WRAPPER,
    'infrastructure/deploy/staging-application-deploy.py',
    'infrastructure/deploy/tests/integrated-closure-contract.py',
    'infrastructure/deploy/tests/source-closure-contract.py',
    SELF,
)
ROUNDTRIP_SOURCE = (
    'docs/runbooks/backup-restore.md',
    'docs/runbooks/restore-database.md',
    'infrastructure/docker/docker-compose.yml',
    'infrastructure/docker/pg-backup.Dockerfile',
    WRITER_LIBRARY,
    'infrastructure/docker/scripts/backup.sh',
    'infrastructure/docker/scripts/offsite-replication.sh',
    'infrastructure/docker/tests/backup-contract.sh',
    'infrastructure/n8n/workflows/backup-daily.json',
    'scripts/restore-drill.sh',
)
ROUNDTRIP_RECEIPTS = tuple(
    f'{ROUNDTRIP_RECEIPT_DIR}/{name}' for name in (
        '01-preflight.json', '02-backup.json', '03-offsite-fetch.json',
        '04-postgresql-restore.json', '05-object-restore.json',
        '06-remote-and-resource-cleanup.json', '07-local-cleanup.json',
        'manifest.json', 'proof-payloads.json',
    )
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


def git_blob(root, commit, relative):
    safe_path(relative)
    return git(root, 'show', f'{commit}:{relative}')


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
    """Execute the prior D2 validator against exact Git bytes."""
    require(git(root, 'rev-parse', BASE + '^{tree}').decode().strip() == TREE,
            'baseline-tree')
    validator = git_blob(root, BASE, SELF)
    require(sha(validator) == PREDECESSOR_VALIDATOR_SHA, 'predecessor-validator')
    report = git_blob(root, BASE, PREDECESSOR_REPORT)
    evidence_raw = git_blob(root, BASE, PREDECESSOR_EVIDENCE)
    require(sha(report) == PREDECESSOR_REPORT_SHA, 'predecessor-report')
    require(sha(evidence_raw) == PREDECESSOR_EVIDENCE_SHA, 'predecessor-evidence')

    scope = {'__file__': str(root / SELF), '__name__': 'd2_predecessor'}
    exec(compile(validator, SELF, 'exec'), scope)
    expected = set(scope['SOURCE']) | {scope['REPORT'], scope['EVIDENCE']}
    scope['workspace_paths'] = lambda _root: expected
    scope['read'] = lambda _root, relative: git_blob(root, BASE, relative)
    result = scope['validate'](root, predecessors=True)
    require(result == {'sourceFiles': 6, 'rebindings': 6, 'historicalInputs': 59},
            'predecessor-result')
    return 59 + len(expected)


def roundtrip_predecessor(root):
    """Bind the reviewed 21-path round-trip packet already present in BASE."""
    require(git(root, 'rev-parse', ROUNDTRIP_BASE + '^{tree}').decode().strip()
            == ROUNDTRIP_BASE_TREE, 'roundtrip-base-tree')
    package = set(ROUNDTRIP_SOURCE) | {ROUNDTRIP_REPORT, ROUNDTRIP_EVIDENCE} \
        | set(ROUNDTRIP_RECEIPTS)
    changed = set(git(root, 'diff', '--name-only', ROUNDTRIP_BASE, BASE, '--')
                  .decode('utf-8').splitlines())
    require(changed == package, 'roundtrip-path-set')
    report = git_blob(root, BASE, ROUNDTRIP_REPORT)
    evidence_raw = git_blob(root, BASE, ROUNDTRIP_EVIDENCE)
    require(sha(report) == ROUNDTRIP_REPORT_SHA, 'roundtrip-report')
    require(sha(evidence_raw) == ROUNDTRIP_EVIDENCE_SHA, 'roundtrip-evidence')
    evidence = parse(evidence_raw, 'roundtrip-evidence-json')
    source = evidence.get('source')
    require(type(source) is dict and source.get('sha') == ROUNDTRIP_BASE
            and source.get('tree') == ROUNDTRIP_BASE_TREE
            and source.get('changedFileCount') == len(ROUNDTRIP_SOURCE)
            and source.get('aggregateSha256') == ROUNDTRIP_MANIFEST_SHA,
            'roundtrip-binding')
    entries = source.get('fileManifest')
    require(type(entries) is list and len(entries) == len(ROUNDTRIP_SOURCE),
            'roundtrip-manifest')
    manifest = {}
    for entry in entries:
        require(type(entry) is dict and set(entry) == {'path', 'sha256'},
                'roundtrip-manifest-entry')
        path, digest = entry['path'], entry['sha256']
        safe_path(path)
        require(path not in manifest and path in ROUNDTRIP_SOURCE
                and type(digest) is str and HASH.fullmatch(digest)
                and sha(git_blob(root, BASE, path)) == digest,
                'roundtrip-manifest-drift')
        manifest[path] = digest
    require(set(manifest) == set(ROUNDTRIP_SOURCE)
            and manifest_hash(manifest) == ROUNDTRIP_MANIFEST_SHA,
            'roundtrip-manifest-aggregate')

    receipt_path = f'{ROUNDTRIP_RECEIPT_DIR}/manifest.json'
    receipt_raw = git_blob(root, BASE, receipt_path)
    require(sha(receipt_raw) == ROUNDTRIP_RECEIPT_MANIFEST_SHA
            and evidence.get('receiptBundle', {}).get('manifestSha256')
            == ROUNDTRIP_RECEIPT_MANIFEST_SHA, 'roundtrip-receipt-manifest')
    receipt = parse(receipt_raw, 'roundtrip-receipt-json')
    require(receipt.get('schemaVersion') == 'w10d-roundtrip-receipt-manifest-v1'
            and receipt.get('status') == 'PASS'
            and receipt.get('receiptCount') == 7, 'roundtrip-receipt-binding')
    receipt_entries = [receipt.get('proofPayload')] + receipt.get('receipts', [])
    require(len(receipt_entries) == 8, 'roundtrip-receipt-count')
    for entry in receipt_entries:
        require(type(entry) is dict and set(entry) == {'path', 'sha256'},
                'roundtrip-receipt-entry')
        path = f"{ROUNDTRIP_RECEIPT_DIR}/{entry['path']}"
        require(path in ROUNDTRIP_RECEIPTS and type(entry['sha256']) is str
                and HASH.fullmatch(entry['sha256'])
                and sha(git_blob(root, BASE, path)) == entry['sha256'],
                'roundtrip-receipt-drift')
    return len(package)


def expected_rebindings(root, manifest):
    changed = {}
    for path in SOURCE:
        before = sha(git_blob(root, BASE, path))
        if before != manifest[path]:
            changed[path] = {'before': before, 'after': manifest[path]}
    return changed


def validate(root=ROOT, predecessors=True):
    root = Path(root).resolve()
    require(workspace_paths(root) == set(SOURCE) | {REPORT, EVIDENCE},
            'successor-workspace-scope')
    evidence = parse(read(root, EVIDENCE), 'successor-evidence-json')
    require(type(evidence) is dict and set(evidence) == {
        'schema', 'baseline', 'supersedes', 'roundtripPredecessor',
        'sourceManifest', 'sourceManifestSha256', 'reportSha256',
        'rebindings', 'writerChain', 'tests', 'observations',
        'operationalStatus',
    }, 'successor-schema')
    require(evidence['schema'] == 'diis-w10d-writer-compatibility-handoff-v1'
            and evidence['baseline'] == {'sha': BASE, 'tree': TREE}
            and evidence['operationalStatus']
            == 'SOURCE COMPLETE - INDEPENDENT REVIEW REQUIRED - PR659 AND OPERATIONS HOLD',
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
    require(evidence['roundtripPredecessor'] == {
        'baseSha': ROUNDTRIP_BASE,
        'baseTree': ROUNDTRIP_BASE_TREE,
        'headSha': BASE,
        'headTree': TREE,
        'pathCount': 21,
        'sourceManifestSha256': ROUNDTRIP_MANIFEST_SHA,
        'reportSha256': ROUNDTRIP_REPORT_SHA,
        'evidenceSha256': ROUNDTRIP_EVIDENCE_SHA,
        'receiptManifestSha256': ROUNDTRIP_RECEIPT_MANIFEST_SHA,
    }, 'roundtrip-declaration')

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

    library_sha = sha(read(root, WRITER_LIBRARY))
    wrapper_sha = sha(read(root, WRITER_WRAPPER))
    artifact_sha = sha((library_sha + '  backup-lib.sh\n'
                        + wrapper_sha + '  legacy-backup-compatibility.sh\n').encode())
    require(evidence['writerChain'] == {
        'libraryPath': WRITER_LIBRARY,
        'librarySha256': WRITER_LIBRARY_SHA,
        'wrapperPath': WRITER_WRAPPER,
        'wrapperSha256': WRITER_WRAPPER_SHA,
        'artifactSha256': WRITER_ARTIFACT_SHA,
        'staleBindingsRejected': list(STALE_WRITER_HASHES),
    } and library_sha == WRITER_LIBRARY_SHA and wrapper_sha == WRITER_WRAPPER_SHA
            and artifact_sha == WRITER_ARTIFACT_SHA,
            'writer-chain')

    tests = evidence['tests']
    require(type(tests) is dict and tests, 'test-evidence-missing')
    for result in tests.values():
        require(type(result) is dict and result.get('executed') is True
                and result.get('exitCode') == 0 and type(result.get('cases')) is int
                and result['cases'] > 0 and type(result.get('command')) is str
                and result['command'], 'test-evidence-invalid')
    require(evidence['observations'] == {
        'pr659CiFailure': 'reproduced-before-followup',
        'failureMode': 'writer-library-hash-chain-stale',
        'backupBehaviorChanged': False,
        'n8nBehaviorChanged': False,
        'historicalEvidenceChanged': False,
        'commitPushPrOrDeployment': False,
        'operationalMutations': False,
    }, 'observation-evidence-invalid')

    historical = 0
    if predecessors:
        historical = predecessor(root) + roundtrip_predecessor(root)
    return {
        'sourceFiles': len(manifest),
        'rebindings': len(evidence['rebindings']),
        'historicalInputs': historical,
    }


if __name__ == '__main__':
    try:
        print('WRITER_COMPATIBILITY_HANDOFF_VALID '
              + json.dumps(validate(), sort_keys=True))
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError):
        sys.exit('WRITER_COMPATIBILITY_HANDOFF_REJECTED')
