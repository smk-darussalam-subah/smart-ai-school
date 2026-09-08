#!/usr/bin/env python3
"""Fail closed when the W10-D source-closure handoff drifts from its evidence."""
import ast
import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path


SCHEMA = 'diis-w10d-source-closure-evidence-v1'
MAX_INPUT_BYTES = 1_048_576
REPORT_RELATIVE = Path('docs/audits/WAVE10-D-SOURCE-CLOSURE-EXECUTOR-2026-09-08.md')
EVIDENCE_RELATIVE = Path('docs/audits/WAVE10-D-SOURCE-CLOSURE-EVIDENCE-2026-09-08.json')
SELF_RELATIVE = Path('infrastructure/deploy/verify-source-closure-handoff.py')
CONTRACT_RELATIVE = Path('infrastructure/deploy/tests/source-closure-contract.py')
COUNT_LINE = re.compile(
    r'^\|\s*Source closure contract\s*\|\s*([0-9]+)/([0-9]+)\s*[^|\r\n]*\|\s*$',
    re.MULTILINE,
)
HASH = re.compile(r'[0-9a-f]{64}\Z')


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
    except OSError as error:
        fail('unreadable-input')
    if stat.S_ISLNK(entry.st_mode) or not stat.S_ISREG(entry.st_mode):
        fail('unsafe-input-type')
    if entry.st_size > MAX_INPUT_BYTES:
        fail('input-too-large')
    try:
        resolved = path.resolve(strict=True)
        resolved.relative_to(base)
        return resolved.read_bytes()
    except (OSError, ValueError):
        fail('unreadable-input')


def source_path(value):
    if not isinstance(value, str) or not value or '\\' in value:
        fail('unsafe-manifest-path')
    path = Path(value)
    if path.is_absolute() or '..' in path.parts or '.' in path.parts:
        fail('unsafe-manifest-path')
    return path


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
    """Statically count the direct unittest cases CI runs from the bound source."""
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
    """Return checked counts or raise ``ValidationError`` without a partial success."""
    root = Path(root)
    report = read_regular(root, report_relative)
    raw_evidence = read_regular(root, evidence_relative)
    try:
        evidence = json.loads(raw_evidence.decode('utf-8'), object_pairs_hook=pairs)
    except (UnicodeDecodeError, json.JSONDecodeError, ValidationError):
        fail('invalid-evidence-json')
    if not isinstance(evidence, dict) or evidence.get('schema') != SCHEMA:
        fail('evidence-schema-invalid')
    tests = evidence.get('tests')
    report_total = source_count(report)
    if not isinstance(tests, dict) or type(tests.get('sourceClosure')) is not int:
        fail('evidence-source-count-invalid')
    if tests['sourceClosure'] != report_total:
        fail('report-evidence-source-count-mismatch')
    discovered_total = discovered_contract_count(root)
    if report_total != discovered_total:
        fail('report-source-count-stale')
    if tests['sourceClosure'] != discovered_total:
        fail('evidence-source-count-stale')
    manifest = evidence.get('sourceManifest')
    manifest_count = evidence.get('sourceManifestCount')
    if not isinstance(manifest, list) or type(manifest_count) is not int:
        fail('manifest-schema-invalid')
    if manifest_count != len(manifest) or manifest_count <= 0:
        fail('manifest-count-mismatch')
    paths = set()
    for item in manifest:
        if not isinstance(item, dict) or set(item) != {'path', 'sha256'}:
            fail('manifest-entry-invalid')
        path = source_path(item['path'])
        digest = item['sha256']
        if path in paths or not isinstance(digest, str) or not HASH.fullmatch(digest):
            fail('manifest-entry-invalid')
        paths.add(path)
        actual = hashlib.sha256(read_regular(root, path)).hexdigest()
        if actual != digest:
            fail('source-manifest-hash-mismatch')
    if SELF_RELATIVE not in paths or CONTRACT_RELATIVE not in paths:
        fail('validator-input-not-bound-by-manifest')
    return {'sourceClosure': discovered_total, 'sourceManifest': manifest_count}


def main():
    try:
        result = validate(Path(__file__).resolve().parents[2])
    except ValidationError as error:
        print(f'SOURCE_CLOSURE_HANDOFF_INVALID reason={error}', file=sys.stderr)
        return 65
    print('SOURCE_CLOSURE_HANDOFF_VALID '
          f"sourceClosure={result['sourceClosure']} manifest={result['sourceManifest']}/{result['sourceManifest']}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
