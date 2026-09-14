#!/usr/bin/env python3
"""Exact new capacity handoff; historical SC10 verifier remains unchanged."""
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

import capacity_bundle

ROOT = Path(__file__).resolve().parents[2]
REPORT = 'docs/audits/WAVE10-D-CAPACITY-LIFECYCLE-CLEANUP-FIRST-IMPLEMENTATION-2026-09-09.md'
EVIDENCE = 'docs/audits/WAVE10-D-CAPACITY-LIFECYCLE-CLEANUP-FIRST-EVIDENCE-2026-09-09.json'
HOST_PACKET = 'docs/audits/WAVE10-D-CAPACITY-LIFECYCLE-HOST-APPROVAL-DRAFT-2026-09-09.md'
SOURCE = (
    '.github/workflows/capacity-lifecycle.yml',
    'docs/runbooks/w10d-capacity-lifecycle-cleanup-first.md',
    'infrastructure/deploy/capacity-gc.candidate.json',
    'infrastructure/deploy/capacity_bundle.py',
    'infrastructure/deploy/capacity_gc.py',
    'infrastructure/deploy/capacity_policy.py',
    'infrastructure/deploy/capacity_runtime.py',
    'infrastructure/deploy/diis-build-cache-cleanup.sh',
    'infrastructure/deploy/offsite_reference_plan.py',
    'infrastructure/deploy/verify-capacity-handoff.py',
    'infrastructure/deploy/tests/capacity-export-evidence.py',
    'infrastructure/deploy/tests/capacity-lab-completion.py',
    'infrastructure/deploy/tests/capacity-lab-measure.py',
    'infrastructure/deploy/tests/capacity-lifecycle-contract.py',
    'infrastructure/deploy/tests/capacity-lifecycle-lab.py',
    'infrastructure/deploy/tests/capacity-run-contracts.py',
    'infrastructure/deploy/tests/fixtures/capacity-lab-daemon.json',
    'infrastructure/deploy/tests/fixtures/capacity-lab-gc.json',
    'infrastructure/deploy/tests/fixtures/historical-build-cache-cleanup.sh',
    'infrastructure/docker/tests/recovery-operator-contract.sh',
)


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def read(root, relative):
    require(type(relative) is str and relative in SOURCE + (REPORT, EVIDENCE, HOST_PACKET), 'manifest-path')
    path = root / relative
    require(path.resolve(strict=True) == path, 'manifest-symlink')
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= 32 * 1024 ** 2, 'manifest-file')
    raw = path.read_bytes()
    require(len(raw) == info.st_size and path.stat().st_mtime_ns == info.st_mtime_ns, 'manifest-file-drift')
    return raw


def count_tests(raw):
    tree = ast.parse(raw)
    require(not any(isinstance(item, ast.FunctionDef) and item.name == 'load_tests' for item in tree.body),
            'dynamic-test-discovery')
    tests = []
    for item in tree.body:
        if not isinstance(item, ast.ClassDef):
            continue
        if any(isinstance(base, ast.Attribute) and isinstance(base.value, ast.Name)
               and base.value.id == 'unittest' and base.attr == 'TestCase' for base in item.bases):
            for member in item.body:
                if isinstance(member, ast.FunctionDef) and member.name.startswith('test_'):
                    tests.append(item.name + '.' + member.name)
    require(len(tests) == len(set(tests)) and tests, 'test-discovery')
    return len(tests)


def pairs(items):
    value = {}
    for key, item in items:
        require(key not in value, 'duplicate-key')
        value[key] = item
    return value


def validate_counts(report, runner, source):
    count = count_tests(source)
    rows = re.findall(rb'^\| Current capacity contract\s*\|\s*([0-9]+)/([0-9]+)\s*\|', report, re.M)
    require(rows == [(str(count).encode(), str(count).encode())], 'report-test-count')
    require(type(runner['cases']) is int and runner['cases'] == count and runner['exitCode'] == 0
            and runner['sourceSha256'] == sha(source), 'runner-count-or-source')
    return count


def validate(root=ROOT):
    evidence = json.loads(read(root, EVIDENCE), object_pairs_hook=pairs)
    require(evidence['schema'] == 'diis-capacity-lifecycle-handoff-v1', 'schema')
    manifest = evidence['sourceManifest']
    require(type(manifest) is dict and set(manifest) == set(SOURCE), 'source-manifest-set')
    for relative, expected in manifest.items():
        require(sha(read(root, relative)) == expected, 'source-hash-mismatch:' + relative)
    require(evidence['sourceManifestCount'] == len(SOURCE), 'manifest-count')
    require(sha(read(root, REPORT)) == evidence['reportSha256']
            and sha(read(root, HOST_PACKET)) == evidence['hostPacketSha256'], 'report-hash')
    count = validate_counts(read(root, REPORT), evidence['focusedReceipt'],
                            read(root, 'infrastructure/deploy/tests/capacity-lifecycle-contract.py'))
    require(set(evidence['bundleManifest']['files']) == set(capacity_bundle.FILES), 'bundle-manifest-set')
    for path, digest in evidence['bundleManifest']['files'].items():
        target = root / path
        require(target.resolve(strict=True) == target and target.is_file(), 'bundle-path')
        actual = target.read_bytes()
        require(sha(actual) == digest, 'bundle-source-drift')
    return {'sourceManifest': len(SOURCE), 'sourceTests': count, 'bundleFiles': len(evidence['bundleManifest']['files'])}


if __name__ == '__main__':
    try:
        print('CAPACITY_HANDOFF_VALID ' + json.dumps(validate(), sort_keys=True))
    except (ValueError, OSError, KeyError, TypeError) as error:
        print('CAPACITY_HANDOFF_INVALID ' + str(error), file=sys.stderr)
        raise SystemExit(65)
