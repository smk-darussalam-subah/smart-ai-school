#!/usr/bin/env python3
"""Fail closed when the current W10-D source-closure handoff drifts."""
import ast
import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path


SCHEMA = 'diis-w10d-source-closure-handoff-v2'
LEGACY_SCHEMA = 'diis-w10d-source-closure-evidence-v1'
MAX_INPUT_BYTES = 1_048_576
EXPECTED_BASE_SHA = '380080b2d92f064c1221395c9a525a953d94a163'
EXPECTED_BASE_TREE = '6de3c10f7853b8ee46fe72eaf2f27c4f9cc9da54'
REPORT_RELATIVE = Path(
    'docs/audits/WAVE10-D-CI-HANDOFF-COMPATIBILITY-FOLLOWUP-2026-09-11.md')
EVIDENCE_RELATIVE = Path(
    'docs/audits/WAVE10-D-CI-HANDOFF-COMPATIBILITY-EVIDENCE-2026-09-11.json')
LEGACY_REPORT_RELATIVE = Path(
    'docs/audits/WAVE10-D-SOURCE-CLOSURE-EXECUTOR-2026-09-08.md')
LEGACY_EVIDENCE_RELATIVE = Path(
    'docs/audits/WAVE10-D-SOURCE-CLOSURE-EVIDENCE-2026-09-08.json')
SELF_RELATIVE = Path('infrastructure/deploy/verify-source-closure-handoff.py')
CONTRACT_RELATIVE = Path('infrastructure/deploy/tests/source-closure-contract.py')
FOLLOWUP_MANIFEST = tuple(Path(item) for item in (
    'docs/audits/WAVE10-D-CLEANUP-PREPARATION-OWNER-EVIDENCE-AND-LOCAL-BUNDLE-EVIDENCE-2026-09-09.json',
    'docs/audits/WAVE10-D-N8N-MINIO-SIGNING-EMAIL-FOLLOWUP-EVIDENCE-2026-09-10.json',
    'docs/audits/WAVE10-D-N8N-MINIO-SIGNING-EMAIL-FOLLOWUP-EXECUTOR-2026-09-10.md',
    'infrastructure/deploy/tests/source-closure-contract.py',
    'infrastructure/deploy/verify-source-closure-handoff.py',
    'infrastructure/docker/scripts/backup.sh',
    'infrastructure/docker/tests/backup-contract.sh',
    'infrastructure/docker/tests/fixtures/n8n-smtp-sink.js',
    'infrastructure/docker/tests/n8n-backup-monitor-integration.sh',
    'infrastructure/n8n/README.md',
    'infrastructure/n8n/workflows/backup-daily.json',
))
COUNT_LINE = re.compile(
    r'^\|\s*Source closure contract\s*\|\s*([0-9]+)/([0-9]+)\s*[^|\r\n]*\|\s*$',
    re.MULTILINE,
)
HASH = re.compile(r'[0-9a-f]{64}\Z')
GIT_SHA = re.compile(r'[0-9a-f]{40}\Z')


class ValidationError(ValueError):
    """Raised for any malformed, incomplete, or mismatched handoff input."""


def fail(message):
    raise ValidationError(message)


def pairs(items):
    value = {}
    for key, item in items:
        if key in value:
            fail('duplicate-json-key')
        value[key] = item
    return value


def read_regular(root, relative):
    """Read one bounded, non-symlink regular file contained in ``root``."""
    if not isinstance(relative, Path) or relative.is_absolute() or '..' in relative.parts:
        fail('unsafe-path')
    base = root.resolve(strict=True)
    path = root / relative
    try:
        entry = os.lstat(path)
    except OSError:
        fail('unreadable-input')
    if stat.S_ISLNK(entry.st_mode) or not stat.S_ISREG(entry.st_mode):
        fail('unsafe-input-type')
    if entry.st_size > MAX_INPUT_BYTES:
        fail('input-too-large')
    try:
        resolved = path.resolve(strict=True)
        resolved.relative_to(base)
        raw = resolved.read_bytes()
    except (OSError, ValueError):
        fail('unreadable-input')
    if len(raw) != entry.st_size:
        fail('input-drift')
    return raw


def parse_json(raw, reason):
    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=pairs)
    except (UnicodeDecodeError, json.JSONDecodeError, ValidationError):
        fail(reason)


def source_path(value):
    if not isinstance(value, str) or not value or '\\' in value:
        fail('unsafe-manifest-path')
    path = Path(value)
    if path.is_absolute() or '..' in path.parts or '.' in path.parts:
        fail('unsafe-manifest-path')
    return path


def manifest_entries(value, count, reason_prefix='manifest'):
    if not isinstance(value, list) or type(count) is not int:
        fail(f'{reason_prefix}-schema-invalid')
    if count != len(value) or count <= 0:
        fail(f'{reason_prefix}-count-mismatch')
    result = {}
    for item in value:
        if not isinstance(item, dict) or set(item) != {'path', 'sha256'}:
            fail(f'{reason_prefix}-entry-invalid')
        path = source_path(item['path'])
        digest = item['sha256']
        if path in result or not isinstance(digest, str) or not HASH.fullmatch(digest):
            fail(f'{reason_prefix}-entry-invalid')
        result[path] = digest
    return result


def manifest_hash(manifest):
    raw = ''.join(
        f'{manifest[path]}  {path.as_posix()}\n'
        for path in sorted(manifest, key=lambda item: item.as_posix())
    ).encode('utf-8')
    return hashlib.sha256(raw).hexdigest()


def source_count(report):
    try:
        text = report.decode('utf-8')
    except UnicodeDecodeError:
        fail('report-not-utf8')
    matches = COUNT_LINE.findall(text)
    if len(matches) != 1:
        fail('report-source-count-missing-or-ambiguous')
    actual, expected = (int(item) for item in matches[0])
    if actual != expected or actual <= 0:
        fail('report-source-count-invalid')
    return actual


def is_test_case(node):
    return (isinstance(node, ast.ClassDef)
            and len(node.bases) == 1
            and isinstance(node.bases[0], ast.Attribute)
            and isinstance(node.bases[0].value, ast.Name)
            and node.bases[0].value.id == 'unittest'
            and node.bases[0].attr == 'TestCase')


def discovered_contract_count(root):
    """Statically count direct unittest cases from the currently bound contract."""
    try:
        source = read_regular(root, CONTRACT_RELATIVE).decode('utf-8')
        tree = ast.parse(source, filename=CONTRACT_RELATIVE.as_posix())
    except (UnicodeDecodeError, SyntaxError):
        fail('source-contract-not-parseable')
    if any(isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
           and node.name == 'load_tests' for node in tree.body):
        fail('dynamic-source-contract-discovery-prohibited')
    count = 0
    for node in tree.body:
        if not is_test_case(node):
            continue
        names = set()
        for member in node.body:
            if not isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if not member.name.startswith('test_'):
                continue
            if member.name in names:
                fail('duplicate-source-contract-test-name')
            names.add(member.name)
            count += 1
    if count <= 0:
        fail('source-contract-test-count-empty')
    return count


def validate(root, report_relative=REPORT_RELATIVE, evidence_relative=EVIDENCE_RELATIVE):
    """Validate the immutable predecessor and its explicit current successor."""
    root = Path(root)
    report = read_regular(root, report_relative)
    raw_evidence = read_regular(root, evidence_relative)
    evidence = parse_json(raw_evidence, 'invalid-evidence-json')
    expected_keys = {
        'schema', 'baseline', 'supersedes', 'reportSha256', 'sourceManifestCount',
        'sourceManifest', 'sourceManifestSha256', 'authorizedRebindings', 'tests', 'holds',
    }
    if not isinstance(evidence, dict) or set(evidence) != expected_keys:
        fail('evidence-schema-invalid')
    if evidence['schema'] != SCHEMA:
        fail('evidence-schema-invalid')

    baseline = evidence['baseline']
    if (not isinstance(baseline, dict)
            or set(baseline) != {'developSha', 'developTree'}
            or baseline.get('developSha') != EXPECTED_BASE_SHA
            or baseline.get('developTree') != EXPECTED_BASE_TREE
            or not GIT_SHA.fullmatch(baseline.get('developSha', ''))
            or not GIT_SHA.fullmatch(baseline.get('developTree', ''))):
        fail('baseline-binding-invalid')

    supersedes = evidence['supersedes']
    supersedes_keys = {
        'evidencePath', 'evidenceSha256', 'reportPath', 'reportSha256',
        'sourceManifestSha256',
    }
    if not isinstance(supersedes, dict) or set(supersedes) != supersedes_keys:
        fail('superseded-binding-invalid')
    if supersedes['evidencePath'] != LEGACY_EVIDENCE_RELATIVE.as_posix():
        fail('superseded-binding-invalid')
    if supersedes['reportPath'] != LEGACY_REPORT_RELATIVE.as_posix():
        fail('superseded-binding-invalid')
    for key in ('evidenceSha256', 'reportSha256', 'sourceManifestSha256'):
        if not isinstance(supersedes[key], str) or not HASH.fullmatch(supersedes[key]):
            fail('superseded-binding-invalid')

    legacy_report = read_regular(root, LEGACY_REPORT_RELATIVE)
    legacy_evidence_raw = read_regular(root, LEGACY_EVIDENCE_RELATIVE)
    if hashlib.sha256(legacy_report).hexdigest() != supersedes['reportSha256']:
        fail('superseded-report-hash-mismatch')
    if hashlib.sha256(legacy_evidence_raw).hexdigest() != supersedes['evidenceSha256']:
        fail('superseded-evidence-hash-mismatch')
    legacy_evidence = parse_json(legacy_evidence_raw, 'invalid-superseded-evidence-json')
    if not isinstance(legacy_evidence, dict) or legacy_evidence.get('schema') != LEGACY_SCHEMA:
        fail('superseded-evidence-schema-invalid')
    legacy_manifest = manifest_entries(
        legacy_evidence.get('sourceManifest'), legacy_evidence.get('sourceManifestCount'),
        'superseded-manifest')
    if manifest_hash(legacy_manifest) != supersedes['sourceManifestSha256']:
        fail('superseded-manifest-hash-mismatch')

    manifest = manifest_entries(evidence['sourceManifest'], evidence['sourceManifestCount'])
    if set(manifest) != set(FOLLOWUP_MANIFEST):
        fail('manifest-set-mismatch')
    if manifest_hash(manifest) != evidence['sourceManifestSha256']:
        fail('manifest-aggregate-hash-mismatch')
    for path, digest in manifest.items():
        if hashlib.sha256(read_regular(root, path)).hexdigest() != digest:
            fail('source-manifest-hash-mismatch')

    actual_rebindings = set()
    for path, historical_digest in legacy_manifest.items():
        current_digest = hashlib.sha256(read_regular(root, path)).hexdigest()
        if current_digest != historical_digest:
            actual_rebindings.add(path)
            if manifest.get(path) != current_digest:
                fail('historical-drift-not-authorized')
    rebindings = evidence['authorizedRebindings']
    if not isinstance(rebindings, list):
        fail('authorized-rebindings-mismatch')
    parsed_rebindings = []
    for item in rebindings:
        parsed = source_path(item)
        if parsed in parsed_rebindings:
            fail('authorized-rebindings-mismatch')
        parsed_rebindings.append(parsed)
    if set(parsed_rebindings) != actual_rebindings:
        fail('authorized-rebindings-mismatch')

    if hashlib.sha256(report).hexdigest() != evidence['reportSha256']:
        fail('report-hash-mismatch')
    report_total = source_count(report)
    tests = evidence['tests']
    if not isinstance(tests, dict) or set(tests) != {'sourceClosure'}:
        fail('evidence-source-count-invalid')
    if type(tests['sourceClosure']) is not int or tests['sourceClosure'] != report_total:
        fail('report-evidence-source-count-mismatch')
    discovered_total = discovered_contract_count(root)
    if report_total != discovered_total:
        fail('report-source-count-stale')
    if not isinstance(evidence['holds'], list) or not evidence['holds']:
        fail('holds-invalid')
    if any(not isinstance(item, str) or not item for item in evidence['holds']):
        fail('holds-invalid')
    return {
        'sourceClosure': discovered_total,
        'sourceManifest': len(manifest),
        'authorizedRebindings': len(actual_rebindings),
    }


def main():
    try:
        result = validate(Path(__file__).resolve().parents[2])
    except ValidationError as error:
        print(f'SOURCE_CLOSURE_HANDOFF_INVALID reason={error}', file=sys.stderr)
        return 65
    print(
        'SOURCE_CLOSURE_HANDOFF_VALID '
        f"sourceClosure={result['sourceClosure']} "
        f"manifest={result['sourceManifest']}/{result['sourceManifest']} "
        f"rebindings={result['authorizedRebindings']}"
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
