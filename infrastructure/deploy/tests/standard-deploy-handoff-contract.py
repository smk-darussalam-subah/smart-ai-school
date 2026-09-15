#!/usr/bin/env python3
"""Negative controls for the standard deployment restoration handoff."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'infrastructure/deploy/verify-standard-deploy-handoff.py'
SPEC = importlib.util.spec_from_file_location('standard_deploy_handoff', SOURCE)
HANDOFF = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HANDOFF)


def packet():
    evidence = HANDOFF.parse(HANDOFF.read(ROOT, HANDOFF.EVIDENCE), 'evidence-json')
    report = HANDOFF.read(ROOT, HANDOFF.REPORT)
    sources = {path: HANDOFF.read(ROOT, path) for path in HANDOFF.SOURCE}
    changes = HANDOFF.expected_changes(ROOT, evidence['sourceManifest'])
    return evidence, report, sources, changes


class Contract(unittest.TestCase):
    def test_actual_handoff_and_predecessor_chain(self):
        self.assertEqual(HANDOFF.validate_package(), {
            'sourceFiles': 7,
            'pathCount': 9,
            'historicalInputs': 96,
        })

    def test_changed_source_byte_is_rejected(self):
        evidence, report, sources, changes = packet()
        sources['.github/workflows/deploy.yml'] += b'\n'
        with self.assertRaisesRegex(HANDOFF.ValidationError, 'source-byte-drift'):
            HANDOFF.validate_packet(evidence, report, sources, changes)

    def test_shared_workflows_invoke_semantic_contract_only(self):
        for path in ('.github/workflows/ci.yml',
                     '.github/workflows/capacity-lifecycle.yml'):
            workflow = HANDOFF.read(ROOT, path).decode()
            with self.subTest(path=path):
                self.assertIn(
                    'infrastructure/deploy/tests/standard-deploy-handoff-contract.py',
                    workflow,
                )
                self.assertNotIn(
                    'infrastructure/deploy/verify-standard-deploy-handoff.py',
                    workflow,
                )

    def test_unrelated_future_path_only_blocks_exact_packaging_gate(self):
        expected = set(HANDOFF.SOURCE) | {HANDOFF.REPORT, HANDOFF.EVIDENCE}
        original = HANDOFF.workspace_paths
        HANDOFF.workspace_paths = lambda _root: expected | {'docs/future-change.md'}
        try:
            self.assertEqual(HANDOFF.validate_package(check_predecessor=False), {
                'sourceFiles': 7,
                'pathCount': 9,
                'historicalInputs': 96,
            })
            with self.assertRaisesRegex(HANDOFF.ValidationError, 'workspace-path-set'):
                HANDOFF.validate(check_predecessor=False)
        finally:
            HANDOFF.workspace_paths = original

    def test_missing_or_extra_source_is_rejected(self):
        evidence, report, sources, changes = packet()
        del sources['.github/workflows/ci.yml']
        with self.assertRaisesRegex(HANDOFF.ValidationError, 'source-byte-set'):
            HANDOFF.validate_packet(evidence, report, sources, changes)
        sources['.github/workflows/ci.yml'] = HANDOFF.read(ROOT, '.github/workflows/ci.yml')
        sources['unreviewed'] = b'x'
        with self.assertRaisesRegex(HANDOFF.ValidationError, 'source-byte-set'):
            HANDOFF.validate_packet(evidence, report, sources, changes)

    def test_wrong_baseline_and_predecessor_are_rejected(self):
        evidence, report, sources, changes = packet()
        for key in ('baseline', 'supersedes'):
            bad = copy.deepcopy(evidence)
            bad[key] = {}
            with self.subTest(key=key), self.assertRaises(HANDOFF.ValidationError):
                HANDOFF.validate_packet(bad, report, sources, changes)

    def test_report_and_change_binding_are_rejected(self):
        evidence, report, sources, changes = packet()
        with self.assertRaisesRegex(HANDOFF.ValidationError, 'report-binding'):
            HANDOFF.validate_packet(evidence, report + b'\n', sources, changes)
        bad_changes = copy.deepcopy(changes)
        bad_changes['.github/workflows/deploy.yml']['status'] = 'added'
        with self.assertRaisesRegex(HANDOFF.ValidationError, 'change-binding'):
            HANDOFF.validate_packet(evidence, report, sources, bad_changes)

    def test_duplicate_json_key_is_rejected(self):
        with self.assertRaisesRegex(HANDOFF.ValidationError, 'evidence-json'):
            HANDOFF.parse(b'{"schema":"a","schema":"b"}', 'evidence-json')


if __name__ == '__main__':
    unittest.main(verbosity=2)
