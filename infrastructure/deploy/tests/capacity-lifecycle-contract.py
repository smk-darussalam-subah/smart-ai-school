#!/usr/bin/env python3
"""Current capacity contract; unittest results are the authoritative case count."""
import base64
import copy
from datetime import datetime, timezone
import json
import os
import signal
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'infrastructure/deploy'))
import capacity_policy as p
import capacity_bundle as b
import capacity_gc as gc
import capacity_runtime as r
import offsite_reference_plan as refs

handoff = r.load('diis_capacity_handoff', 'verify-capacity-handoff.py')

NOW = '2026-09-09T01:00:00Z'


def record(key='a' * 25, **changes):
    return {'id': key, 'parents': [], 'size': 20 * p.GIB, 'inUse': False, 'shared': False,
            'mutable': False, 'type': 'regular', 'createdAt': '2026-08-01T00:00:00Z',
            'lastUsedAt': '2026-09-01T00:00:00Z', **changes}


def snapshot(rows=None):
    return {'schema': 'diis-capacity-snapshot-v1', 'identity': {'mainSha': 'a' * 40, 'mainTree': 'b' * 40},
            'observedAt': NOW, 'records': rows if rows is not None else [record()],
            'totalBytes': 80 * p.GIB, 'freeBytes': 12 * p.GIB,
            'noTouchSha256': 'c' * 64, 'preservationSha256': 'd' * 64}


def policy():
    return {'schema': 'diis-capacity-policy-v1', 'minAgeSeconds': 7 * 86400,
            'cutoff': '2026-09-02T01:00:00Z', 'minimumFreeBytes': 24 * p.GIB,
            'minimumFreePercent': 30, 'reservedLogicalBytes': 8 * p.GIB,
            'marginBytes': 2 * p.GIB, 'maximumSeconds': 90}


class Selection(unittest.TestCase):
    def test_positive_no_physical_promise(self):
        value = p.select(snapshot(), policy(), [])
        self.assertEqual(value['logicalEligibleBytes'], 20 * p.GIB)
        self.assertEqual(value['guaranteedPhysicalReclaimBytes'], 0)
        self.assertFalse(value['cleanupAuthorized'])

    def test_age_policies_from_one_snapshot(self):
        counts = []
        for hours in (168, 72, 48):
            rule = policy()
            rule['minAgeSeconds'] = hours * 3600
            rule['cutoff'] = datetime.fromtimestamp(p.timestamp(NOW) / 1e9 - hours * 3600,
                                                    timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
            counts.append(len(p.select(snapshot(), rule, [])['stable']['candidates']))
        self.assertEqual(counts, [1, 1, 1])

    def test_cutoff_nanosecond_boundary(self):
        for stamp, expected in [('2026-09-02T00:59:59.999999999Z', 1),
                                ('2026-09-02T01:00:00.000000000Z', 1),
                                ('2026-09-02T01:00:00.000000001Z', 0)]:
            self.assertEqual(len(p.select(snapshot([record(lastUsedAt=stamp)]), policy(), [])['stable']['candidates']), expected)

    def test_timezone_equivalence(self):
        self.assertEqual(p.timestamp('2026-09-02T08:00:00+07:00'), p.timestamp('2026-09-02T01:00:00Z'))

    def test_missing_last_use_protected(self):
        self.assertFalse(p.select(snapshot([record(lastUsedAt=None)]), policy(), [])['stable']['candidates'])

    def test_invalid_future_times_rejected(self):
        for stamp in ('invalid', '2027-01-01T00:00:00Z', '2026-07-01T00:00:00Z'):
            with self.assertRaises(p.Rejected):
                p.select(snapshot([record(lastUsedAt=stamp)]), policy(), [])

    def test_unknown_schema_and_fields(self):
        for value in ({**snapshot(), 'extra': 1}, {**snapshot(), 'schema': 'unknown'}):
            with self.assertRaises(p.Rejected):
                p.select(value, policy(), [])

    def test_duplicate_json_and_nonfinite(self):
        for raw in (b'{"a":1,"a":2}', b'{"a":NaN}', b'{"a":Infinity}', b''):
            with self.assertRaises(p.Rejected):
                p.decode(raw)

    def test_oversized_capture_input(self):
        with self.assertRaises(p.Rejected):
            p.decode(b' ' * (16 * 1024 ** 2 + 1))

    def test_bool_size_and_overflow(self):
        for size in (True, -1, '445B', 2 ** 63):
            with self.assertRaises(p.Rejected):
                p.select(snapshot([record(size=size)]), policy(), [])
        with self.assertRaises(p.Rejected):
            p.select(snapshot([record(size=2 ** 62), record('b' * 25, size=2 ** 62)]), policy(), [])

    def test_duplicate_missing_parent_and_cycle(self):
        for rows in ([record(), record()], [record(parents=['b' * 25])],
                     [record(parents=['b' * 25]), record('b' * 25, parents=['a' * 25])]):
            with self.assertRaises(p.Rejected):
                p.select(snapshot(rows), policy(), [])

    def test_shared_inuse_and_transitive_parent(self):
        rows = [record(), record('b' * 25, parents=['a' * 25]), record('c' * 25, parents=['b' * 25], shared=True),
                record('d' * 25, inUse=True)]
        value = p.select(snapshot(rows), policy(), [])
        self.assertEqual(len(value['stable']['protected']), 4)
        self.assertEqual(value['logicalEligibleBytes'], 0)

    def test_recent_child_keeps_old_parent(self):
        rows = [record(), record('b' * 25, parents=['a' * 25], lastUsedAt=NOW)]
        self.assertFalse(p.select(snapshot(rows), policy(), [])['stable']['candidates'])

    def test_default_30_percent_preserved(self):
        value = snapshot()
        value['totalBytes'] = 100 * p.GIB + 1
        self.assertEqual(p.select(value, policy(), [])['stable']['effectiveTargetBytes'], 30 * p.GIB + 1)

    def test_production_floor_cannot_be_test_budget(self):
        for key, value in [('minimumFreeBytes', 1), ('minimumFreePercent', 24), ('minAgeSeconds', 1)]:
            with self.assertRaises(p.Rejected):
                p.select(snapshot(), {**policy(), key: value}, [])

    def test_stable_excludes_observed_time_only(self):
        first = p.select(snapshot(), policy(), [])
        second = p.select({**snapshot(), 'observedAt': '2026-09-09T02:00:00Z', 'freeBytes': 10 * p.GIB}, policy(), [])
        self.assertEqual(first['candidateSha256'], second['candidateSha256'])
        for change in ({'size': 19 * p.GIB}, {'shared': True}, {'lastUsedAt': '2026-09-01T01:00:00Z'}):
            third = p.select(snapshot([record(**change)]), policy(), [])
            self.assertNotEqual(first['candidateSha256'], third['candidateSha256'])

    def test_id_filter_is_anchored_and_no_widening(self):
        self.assertEqual(p.id_filter(['b' * 25, 'a' * 25]), 'id~=^(' + 'a' * 25 + '|' + 'b' * 25 + ')$')
        for ids in ([], ['.*'], ['a' * 25, 'a' * 25], ['a' * 25 + '|.*']):
            with self.assertRaises(p.Rejected):
                p.id_filter(ids)

    def test_growth_insufficient_not_zero(self):
        self.assertEqual(p.growth_projection([], 1)['status'], 'INSUFFICIENT_HISTORY')
        self.assertIsNone(p.growth_projection([], 1)['growthBytesPerDay'])

    def test_growth_actual_history_and_invalid_order(self):
        points = [{'observedAt': '2026-09-01T00:00:00Z', 'usedBytes': 10, 'totalBytes': 100},
                  {'observedAt': '2026-09-05T00:00:00Z', 'usedBytes': 14, 'totalBytes': 100},
                  {'observedAt': '2026-09-09T00:00:00Z', 'usedBytes': 18, 'totalBytes': 100}]
        self.assertEqual(p.growth_projection(points, 24)['growthBytesPerDay'], 1)
        with self.assertRaises(p.Rejected):
            p.growth_projection(list(reversed(points)), 24)


class ConfigAndBundle(unittest.TestCase):
    def test_unreleased_profile_rechecked_before_any_backend_observation(self):
        args = ['capacity', 'observe', '--profile', '/unused/profile', '--policy', '/unused/policy',
                '--output', '/unused/output']
        with patch.object(sys, 'argv', args), patch.object(r, 'private_json', return_value={'kind': 'production'}), \
                patch.object(r, 'Backend') as backend, patch('builtins.print'):
            self.assertEqual(r.main('a' * 64, 'b' * 40, released=False), 65)
            backend.assert_not_called()

    def test_report_evidence_stale_pair_rejected_against_ast(self):
        source = Path(__file__).read_bytes()
        count = handoff.count_tests(source)
        runner = {'cases': count, 'exitCode': 0, 'sourceSha256': p.digest(source)}
        report = ('| Current capacity contract | ' + str(count) + '/' + str(count) + ' |\n').encode()
        self.assertEqual(handoff.validate_counts(report, runner, source), count)
        stale = ('| Current capacity contract | ' + str(count - 1) + '/' + str(count - 1) + ' |\n').encode()
        with self.assertRaisesRegex(ValueError, 'report-test-count'):
            handoff.validate_counts(stale, {**runner, 'cases': count - 1}, source)

    def test_handoff_duplicate_tests_and_runner_drift_rejected(self):
        with self.assertRaisesRegex(ValueError, 'test-discovery'):
            handoff.count_tests(b'class X(unittest.TestCase):\n def test_a(self): pass\n def test_a(self): pass\n')
        source = b'class X(unittest.TestCase):\n def test_a(self): pass\n'
        with self.assertRaisesRegex(ValueError, 'runner-count-or-source'):
            handoff.validate_counts(b'| Current capacity contract | 1/1 |\n',
                                    {'cases': 1, 'exitCode': 0, 'sourceSha256': 'a' * 64}, source)

    def test_gc_preserves_unrelated_keys_and_idempotent(self):
        original = {'log-driver': 'json-file', 'builder': {'entitlements': {'network-host': False}}}
        result = gc.merge(original)
        self.assertEqual(result['log-driver'], original['log-driver'])
        self.assertEqual(result['builder']['entitlements'], original['builder']['entitlements'])
        self.assertEqual(gc.merge(result), result)

    def test_gc_conflict_rejected(self):
        for value in ([], {'builder': []}, {'builder': {'gc': {'enabled': True}}}):
            with self.assertRaises(p.Rejected):
                gc.merge(value)

    def test_gc_exact_rollback_and_drift(self):
        original, candidate = b'{"debug": false}\n', p.canonical(gc.merge({'debug': False}))
        self.assertEqual(gc.restore(original, candidate, p.digest(candidate), p.digest(original)), original)
        with self.assertRaises(p.Rejected):
            gc.restore(original, candidate + b' ', p.digest(candidate), p.digest(original))

    def test_bundle_external_root_and_extra_file(self):
        with tempfile.TemporaryDirectory(prefix='diis-capacity-contract-') as directory:
            output = Path(directory) / 'bundle'
            sha = b.build(ROOT, output, 'a' * 40, 'b' * 40)
            self.assertEqual(len(b.verify(output, sha)['files']), len(b.FILES))
            (output / 'extra').write_text('x')
            with self.assertRaises(ValueError):
                b.verify(output, sha)

    def test_bundle_symlink_mode_and_hash(self):
        with tempfile.TemporaryDirectory(prefix='diis-capacity-contract-') as directory:
            output = Path(directory) / 'bundle'
            sha = b.build(ROOT, output, 'a' * 40, 'b' * 40)
            target = output / b.FILES[0]
            target.chmod(0o644)
            with self.assertRaises(ValueError):
                b.verify(output, sha)
            target.chmod(0o600)
            target.unlink()
            target.symlink_to('/etc/passwd')
            with self.assertRaises(ValueError):
                b.verify(output, sha)

    def test_preservation_legacy_and_mixed_content(self):
        with tempfile.TemporaryDirectory(prefix='diis-capacity-contract-') as directory:
            root = Path(directory)
            for index in range(8):
                (root / (str(index) + '.sql.gz')).write_bytes(b'synthetic')
            legacy = r.preservation(root)
            self.assertEqual(legacy['count'], 8)
            self.assertFalse(legacy['recoveryValidated'])
            (root / 'synthetic.complete.json').write_bytes(b'synthetic-not-claimed-valid')
            self.assertEqual(r.preservation(root)['count'], 9)
            (root / '0.sql.gz').write_bytes(b'changed')
            self.assertNotEqual(r.preservation(root)['contentSetSha256'], legacy['contentSetSha256'])

    def test_preservation_symlink_rejected(self):
        with tempfile.TemporaryDirectory(prefix='diis-capacity-contract-') as directory:
            (Path(directory) / 'link').symlink_to('/etc/passwd')
            with self.assertRaises(p.Rejected):
                r.preservation(Path(directory))

    def test_preservation_unreadable_directory_is_not_empty(self):
        def failed_walk(root, **options):
            options['onerror'](PermissionError('synthetic unreadable directory'))
            yield root, [], []
        with tempfile.TemporaryDirectory(prefix='diis-capacity-contract-') as directory:
            with patch.object(r.os, 'walk', failed_walk):
                with self.assertRaisesRegex(p.Rejected, 'preservation-directory-unreadable'):
                    r.preservation(Path(directory))

    def test_preservation_directory_budget_counts_empty_directories(self):
        with tempfile.TemporaryDirectory(prefix='diis-capacity-contract-') as directory:
            with patch.object(r.os, 'walk', return_value=iter([(directory, [], [])] * 20001)):
                with self.assertRaisesRegex(p.Rejected, 'preservation-count'):
                    r.preservation(Path(directory))


class Lifecycle(unittest.TestCase):
    def fixture(self):
        return {'schema': 'diis-offsite-reference-input-v1', 'scope': refs.PREFIX, 'complete': True,
                'observedAt': NOW, 'graceSeconds': 72 * 3600, 'originFingerprint': 'a' * 64,
                'points': [], 'inventory': [{'key': refs.PREFIX + 'b' * 64, 'sha256': 'b' * 64, 'bytes': 20,
                 'modifiedAt': '2026-08-01T00:00:00Z', 'protected': False}], 'inProgress': []}

    def test_dry_run_never_deletes(self):
        result = refs.plan(self.fixture())
        self.assertEqual(result['candidateUnreferenced']['count'], 1)
        self.assertEqual(result['remoteCalls'], 0)
        self.assertEqual(result['deletions'], 0)

    def test_inprogress_protected_grace(self):
        for field in ('inProgress', 'protected', 'recent'):
            packet = self.fixture()
            if field == 'inProgress':
                packet['inProgress'] = [packet['inventory'][0]['key']]
            elif field == 'protected':
                packet['inventory'][0]['protected'] = True
            else:
                packet['inventory'][0]['modifiedAt'] = NOW
            self.assertEqual(refs.plan(packet)['candidateUnreferenced']['count'], 0)

    def test_incomplete_scope_and_malformed(self):
        for key, value in [('complete', False), ('scope', 'other/'), ('inProgress', ['unknown'])]:
            with self.assertRaises(p.Rejected):
                refs.plan({**self.fixture(), key: value})
        packet = self.fixture()
        packet['points'] = [{'objectName': 'bad', 'completionBase64': 'e30=', 'sidecarBase64': 'eA==',
                             'objectManifestBase64': 'eA=='}]
        with self.assertRaises(ValueError):
            refs.plan(packet)

    def point(self, object_hash='b' * 64, suffix='1'):
        backup_id = '20260901T000000Z-' + suffix
        manifest = ('diis-object-manifest-v1|' + backup_id + '|exact\n' + object_hash
                    + '|20|' + base64.b64encode(b'synthetic/object').decode() + '\n').encode()
        value = {'schemaVersion': 'diis-backup-v1', 'status': 'complete', 'backupId': backup_id,
                 'class': 'pre-change', 'protectionState': 'protected', 'createdAt': '2026-09-01T00:00:00Z',
                 'createdEpoch': 1788220800, 'dailyKey': '2026-09-01', 'weeklyKey': '2026-W36',
                 'monthlyKey': '2026-09', 'sha256': 'c' * 64, 'bytes': 1024, 'archiveValidated': True,
                 'offsiteStatus': 'complete', 'offsiteConfigFingerprint': 'a' * 64, 'objectStatus': 'verified',
                 'objectManifestSha256': p.digest(manifest), 'objectCount': 1, 'tableCount': 1,
                 'userCount': 0, 'studentCount': 0, 'targetTotalBytes': 2000, 'targetFreeBytes': 1000}
        return {'objectName': backup_id + '.complete.json',
                'completionBase64': base64.b64encode(p.canonical(value)).decode(),
                'sidecarBase64': base64.b64encode(('c' * 64 + '  ' + backup_id + '.dump\n').encode()).decode(),
                'objectManifestBase64': base64.b64encode(manifest).decode()}

    def test_shared_reference_union_protected_points(self):
        packet = self.fixture()
        packet['points'] = [self.point(), self.point(suffix='2')]
        result = refs.plan(packet)
        self.assertEqual(result['referenced']['count'], 1)
        self.assertEqual(result['referenced']['bytes'], 20)
        self.assertEqual(result['candidateUnreferenced']['count'], 0)

    def test_object_hash_missing_reference_and_count_rejected(self):
        packet = self.fixture()
        packet['points'] = [self.point(object_hash='d' * 64)]
        with self.assertRaises(p.Rejected):
            refs.plan(packet)
        packet['points'] = [self.point()]
        packet['points'][0]['objectManifestBase64'] = base64.b64encode(b'wrong').decode()
        with self.assertRaises(p.Rejected):
            refs.plan(packet)


class Producer(unittest.TestCase):
    def test_bounded_real_timeout(self):
        with self.assertRaises(r.core.Stop):
            r.core.run([sys.executable, '-c', 'import time; time.sleep(30)'], timeout=0.1, cwd=Path('/tmp'))
        r.core.producers_absent()

    def test_descendant_stdout_no_early_success(self):
        with self.assertRaises(r.core.Stop):
            r.core.run([sys.executable, '-c', 'import os,time; pid=os.fork(); time.sleep(5) if pid==0 else None'],
                       timeout=0.1, cwd=Path('/tmp'))
        r.core.producers_absent()


class Transaction(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='diis-capacity-transaction-')
        self.root = Path(self.tmp.name)
        self.old_lock = r.app.WRITER_LOCK
        r.app.WRITER_LOCK = self.root / 'backup.lock'
        (self.root / 'deploy.lock').touch(mode=0o600)
        self.value = snapshot([record(size=16 * 1024 ** 2)])
        self.value['observedAt'] = p.utc_now()
        self.value['totalBytes'], self.value['freeBytes'] = 2 * p.GIB, p.GIB
        self.rule = {**policy(), 'minimumFreeBytes': p.GIB + 1, 'minimumFreePercent': 1,
                     'reservedLogicalBytes': 0, 'marginBytes': 0}
        self.candidate = p.select(self.value, self.rule, [], True)
        now = int(time.time())
        self.writer = {'schema': 'diis-writer-attestation-v2', 'expires': now + 500, 'sourceSha': 'a' * 40,
                       'rootCronSha256': 'a' * 64, 'n8nSha256': 'b' * 64, 'preservationSha256': 'd' * 64,
                       'writerInventorySha256': 'c' * 64,
                       'backupLibrarySha256': r.app.PERSISTENT_WRITER_LIBRARY_SHA256,
                       'allWritersUseCanonicalLock': True, 'allWritersRejectPersistentApplicationQuarantine': True,
                       'quietWindowStart': now - 20, 'quietWindowEnd': now + 500,
                       'nativeGcDisabled': True, 'allHostMutatorsUseCanonicalLock': True,
                       'allHostMutatorsHonorBackupQuarantine': True}
        self.backend = type('FixtureBackend', (), {})()
        self.backend.root = self.root
        self.backend.disposable = True
        self.backend.host_lock = self.root / 'deploy.lock'
        self.backend.profile = {'backupLibrary': str(ROOT / 'infrastructure/docker/scripts/backup-lib.sh')}
        self.backend.snapshot = lambda: copy.deepcopy(self.value)
        self.calls = 0
        self.backend.run = self.prune
        self.approval = {'schema': 'diis-capacity-approval-v1', 'operationId': '1' * 32, 'runId': '1',
                         'notBefore': now - 1, 'expires': now + 500, 'sourceSha': 'a' * 40,
                         'bundleSha256': 'b' * 64, 'profileSha256': p.digest(self.backend.profile),
                         'candidateSha256': self.candidate['candidateSha256'],
                         'policySha256': self.candidate['stable']['policySha256'],
                         'mainSha': 'a' * 40, 'mainTree': 'b' * 40, 'identity': self.value['identity'],
                         'writerEvidenceSha256': p.digest(self.writer)}

    def tearDown(self):
        # Exact synthetic root only; retained guardian identity comes from its marker.
        marker = self.root / 'backup.lock/application-owner.json'
        if marker.exists():
            meta = json.loads(marker.read_bytes())
            try:
                os.kill(int(meta['guardianPid']), signal.SIGKILL)
                os.waitpid(int(meta['guardianPid']), 0)
            except (ProcessLookupError, ChildProcessError):
                pass
        r.app.WRITER_LOCK = self.old_lock
        r.core.OWNED_PRODUCERS.clear()
        r.core.DEFERRED_SIGNALS.clear()
        self.tmp.cleanup()

    def prune(self, args, timeout):
        self.calls += 1
        self.assertIn(p.id_filter(['a' * 25]), args)
        self.value['records'] = []
        self.value['freeBytes'] += 16 * 1024 ** 2
        return ('ID:\t' + 'a' * 25 + '\nSize:\t16.78MB\n\nTotal:\t16.78MB\n').encode()

    def execute(self):
        return r.transaction(self.backend, self.candidate, self.approval, 'b' * 64, 'a' * 40, p.canonical(self.writer))

    def test_completed_target_met_and_release(self):
        receipt, code = self.execute()
        self.assertEqual((receipt['outcome'], code, self.calls), ('CLEANUP_COMPLETED_TARGET_MET', 0, 1))
        self.assertFalse(r.app.WRITER_LOCK.exists())

    def test_completed_below_target_not_success(self):
        def below(args, timeout):
            raw = self.prune(args, timeout)
            self.value['freeBytes'] = p.GIB
            return raw
        self.backend.run = below
        receipt, code = self.execute()
        self.assertEqual((receipt['outcome'], code), ('CLEANUP_COMPLETED_TARGET_NOT_MET', 73))
        self.assertFalse(r.app.WRITER_LOCK.exists())

    def test_noop_and_replay_denied(self):
        self.value['freeBytes'] += 100
        receipt, code = self.execute()
        self.assertEqual((receipt['outcome'], code, self.calls), ('NOOP_TARGET_MET', 0, 0))
        receipt, code = self.execute()
        self.assertEqual(code, 65)
        self.assertEqual(self.calls, 0)

    def test_wrong_approval_fields_and_expiry(self):
        for key in ('sourceSha', 'bundleSha256', 'candidateSha256', 'policySha256', 'mainTree', 'profileSha256'):
            with self.subTest(key=key):
                original = self.approval[key]
                self.approval[key] = 'f' * len(original)
                self.assertEqual(self.execute()[1], 65)
                self.approval[key] = original
        self.approval['expires'] = int(time.time()) - 1
        self.assertEqual(self.execute()[1], 65)
        self.assertEqual(self.calls, 0)

    def test_candidate_expiry_independent_of_new_approval(self):
        self.candidate['expiresEpoch'] = int(time.time()) - 1
        self.assertEqual(self.execute()[1], 65)
        self.assertEqual(self.calls, 0)

    def test_locked_drift_blocks(self):
        self.value['records'][0]['size'] += 1
        self.assertEqual(self.execute()[1], 65)
        self.assertEqual(self.calls, 0)
        self.assertFalse(r.app.WRITER_LOCK.exists())

    def test_host_contention_and_writer_contention(self):
        fd = r.app.lock(self.backend.host_lock, os.geteuid())
        self.assertEqual(self.execute()[1], 65)
        os.close(fd)
        r.app.WRITER_LOCK.mkdir(mode=0o700)
        self.assertEqual(self.execute()[1], 65)
        self.assertEqual(self.calls, 0)

    def test_missing_authority_blocks(self):
        self.writer['allWritersUseCanonicalLock'] = False
        self.approval['writerEvidenceSha256'] = p.digest(self.writer)
        self.assertEqual(self.execute()[1], 65)
        self.assertEqual(self.calls, 0)

    def test_client_failure_retains_guardian_after_executor(self):
        def fail(*args, **kwargs):
            raise r.core.Stop('command-failed')
        self.backend.run = fail
        receipt, code = self.execute()
        self.assertEqual((receipt['outcome'], code), ('PARTIAL_OR_AMBIGUOUS_NO_RETRY', 74))
        marker = json.loads((r.app.WRITER_LOCK / 'application-owner.json').read_bytes())
        os.kill(int(marker['guardianPid']), 0)
        # Independent shell writer, not a mocked lock check.
        result = subprocess.run(['sh', '-c', '. "$1"; acquire_directory_lock "$2"', 'fixture',
                                 str(ROOT / 'infrastructure/docker/scripts/backup-lib.sh'), str(r.app.WRITER_LOCK)],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        self.assertNotEqual(result.returncode, 0)

    def test_empty_daemon_receipt_retains_lock(self):
        self.backend.run = lambda *args, **kwargs: b''
        self.assertEqual(self.execute()[1], 74)
        self.assertTrue(r.app.WRITER_LOCK.exists())

    def test_postcheck_failure_retains_lock(self):
        def mutate(args, timeout):
            raw = self.prune(args, timeout)
            self.value['noTouchSha256'] = 'f' * 64
            return raw
        self.backend.run = mutate
        self.assertEqual(self.execute()[1], 74)
        self.assertTrue(r.app.WRITER_LOCK.exists())

    def test_lost_daemon_proof_retains_lock(self):
        original = r.core.write_exclusive
        def write(path, raw):
            if path.name == 'daemon-proof.json':
                raise OSError('synthetic failure')
            original(path, raw)
        with patch.object(r.core, 'write_exclusive', write):
            self.assertEqual(self.execute()[1], 74)
        self.assertTrue(r.app.WRITER_LOCK.exists())

    def test_release_failure_never_success_receipt(self):
        with patch.object(r.app, 'release_writer_lock', side_effect=r.core.ProducerAmbiguous('release-failed')):
            self.assertEqual(self.execute()[1], 74)
        self.assertTrue(r.app.WRITER_LOCK.exists())
        self.assertFalse((self.root / ('operation-' + '1' * 32) / 'receipt.json').exists())

    def interrupted(self, sig):
        before = signal.getsignal(sig)
        def handler(*_):
            raise r.core.Stop('interrupted')
        signal.signal(sig, handler)
        def interrupt(*args, **kwargs):
            return r.core.run([sys.executable, '-c',
                               'import os,signal,time; os.kill(os.getppid(),' + str(sig) + '); time.sleep(3)'],
                              timeout=5, cwd=self.root)
        self.backend.run = interrupt
        try:
            self.assertEqual(self.execute()[1], 74)
            self.assertTrue(r.app.WRITER_LOCK.exists())
            r.core.producers_absent()
        finally:
            signal.signal(sig, before)

    def test_hup_real_child_cancellation(self):
        self.interrupted(signal.SIGHUP)

    def test_int_real_child_cancellation(self):
        self.interrupted(signal.SIGINT)

    def test_term_real_child_cancellation(self):
        self.interrupted(signal.SIGTERM)

    def test_host_mutator_without_quarantine_participation_rejected(self):
        self.writer['allHostMutatorsHonorBackupQuarantine'] = False
        self.approval['writerEvidenceSha256'] = p.digest(self.writer)
        self.assertEqual(self.execute()[1], 65)


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    started = time.time()
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print(p.canonical({'schema': 'diis-test-receipt-v1', 'suite': Path(__file__).name,
                       'discovered': suite.countTestCases() if not result.testsRun else result.testsRun,
                       'run': result.testsRun, 'failures': len(result.failures), 'errors': len(result.errors),
                       'skipped': len(result.skipped), 'seconds': time.time() - started,
                       'sourceSha256': p.digest(Path(__file__).read_bytes())}).decode())
    raise SystemExit(0 if result.wasSuccessful() else 1)
