#!/usr/bin/env python3
"""Synthetic offline contracts. No Docker, network, provider or mutation route."""
import copy
import importlib.util
import json
import os
import select
import signal
from pathlib import Path
import subprocess
import sys
import time
import unittest
from unittest import mock

SOURCE = Path(__file__).resolve().parents[3] / 'scripts/assess-buildkit-capacity.py'
SPEC = importlib.util.spec_from_file_location('capacity', SOURCE)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)
COLLECTOR_SPEC = importlib.util.spec_from_file_location('collector', SOURCE.with_name('observe-buildkit-capacity.py'))
C = importlib.util.module_from_spec(COLLECTOR_SPEC)
COLLECTOR_SPEC.loader.exec_module(C)


def fixture():
    row = {'idSha256': 'a' * 64, 'size': 30 * M.GIB,
           'createdAt': '2026-09-06T00:00:00Z', 'lastUsedAt': '2026-09-06T01:00:00Z',
           'inUse': False, 'shared': False, 'type': 'regular'}
    return dict(M.VERSIONS, observedAt='2026-09-07T00:00:00Z', beforeAfterStable=True,
                engineCache=[row], duQueries=[
                    {'filters': ['until=1h', 'inuse=false', 'private=true'],
                     'rawSha256': 'b' * 64, 'records': []},
                    {'filters': ['private=""'], 'rawSha256': 'c' * 64,
                     'records': [{'idSha256': 'a' * 64, 'sizeDisplay': '445B',
                                  'reclaimable': True, 'shared': False}]}])


def encode(value):
    return json.dumps(value, separators=(',', ':')).encode()


class Contract(unittest.TestCase):
    def run_value(self, value):
        return M.assess(encode(value), 80 * M.GIB, 14 * M.GIB)

    def reject(self, mutate):
        value = fixture()
        mutate(value)
        with self.assertRaises((ValueError, TypeError)):
            self.run_value(value)

    def test_estimate_never_authorizes(self):
        result = self.run_value(fixture())
        self.assertEqual(result['conservativeLogicalEstimateBytes'], 20 * M.GIB)
        self.assertEqual(result['additionalFreeBytesNeeded'], 10 * M.GIB)
        self.assertIs(result['cleanupAuthorized'], False)
        self.assertEqual(result['guaranteedReclaimableBytes'], 0)

    def test_display_not_used_as_exact_bytes(self):
        value = fixture()
        value['duQueries'][1]['records'][0]['sizeDisplay'] = '8.192kB'
        self.assertEqual(self.run_value(value)['eligibleLogicalBytes'], 30 * M.GIB)

    def test_age_boundary(self):
        for last, count in [('2026-09-06T23:00:00Z', 1), ('2026-09-06T23:00:01Z', 0)]:
            value = fixture()
            value['engineCache'][0]['lastUsedAt'] = last
            self.assertEqual(self.run_value(value)['eligibleRecordCount'], count)

    def test_nanosecond_age_boundary(self):
        value = fixture()
        value['engineCache'][0]['lastUsedAt'] = '2026-09-06T23:00:00.000000001Z'
        self.assertEqual(self.run_value(value)['eligibleRecordCount'], 0)

    def test_actual_redacted_fixture(self):
        path = Path(__file__).parent / 'fixtures/buildkit-v0300-engine2952-redacted-20260907.json'
        raw = path.read_bytes()
        self.assertEqual(M.hashlib.sha256(raw).hexdigest(),
                         '39b1a1cb6d31979acca762e593b0fee4ae953ea36b30fc1db9a35f8e5d8040e5')
        result = M.assess(raw, 80 * M.GIB, 14 * M.GIB)
        self.assertEqual(result['engineRecordCount'], 231)
        self.assertEqual(result['privateRecordCount'], 200)
        self.assertEqual(result['eligibleLogicalBytes'], 23726916538)
        self.assertEqual(result['conservativeLogicalEstimateBytes'], 12989498298)
        self.assertIs(result['cleanupAuthorized'], False)

    def test_null_last_used_excluded(self):
        value = fixture()
        value['engineCache'][0]['lastUsedAt'] = None
        self.assertEqual(self.run_value(value)['eligibleRecordCount'], 0)

    def test_internal_frontend_inuse_excluded(self):
        for field, target in [('type', 'internal'), ('type', 'frontend'), ('inUse', True)]:
            value = fixture()
            value['engineCache'][0][field] = target
            if field == 'inUse':
                value['duQueries'][1]['records'][0]['reclaimable'] = False
            self.assertEqual(self.run_value(value)['eligibleRecordCount'], 0)

    def test_shared_excluded_and_set_reconciled(self):
        value = fixture()
        value['engineCache'][0]['shared'] = True
        value['duQueries'][1]['records'] = []
        self.assertEqual(self.run_value(value)['eligibleRecordCount'], 0)

    def test_version_fields_fail_closed(self):
        for key in M.VERSIONS:
            with self.subTest(key=key):
                self.reject(lambda v: v.__setitem__(key, 'unknown'))

    def test_unknown_field(self):
        self.reject(lambda v: v.__setitem__('extra', 1))
        self.reject(lambda v: v['engineCache'][0].__setitem__('extra', 1))

    def test_empty_cache(self):
        self.reject(lambda v: v.__setitem__('engineCache', []))

    def test_negative_control_must_be_empty(self):
        self.reject(lambda v: v['duQueries'][0].__setitem__('records', [{}]))

    def test_predicate_binding(self):
        self.reject(lambda v: v['duQueries'][1].__setitem__('filters', ['private=true']))

    def test_missing_selected_id(self):
        self.reject(lambda v: v['duQueries'][1].__setitem__('records', []))

    def test_extra_selected_id(self):
        self.reject(lambda v: v['duQueries'][1]['records'][0].__setitem__('idSha256', 'd' * 64))

    def test_duplicate_ids(self):
        self.reject(lambda v: v['engineCache'].append(copy.deepcopy(v['engineCache'][0])))
        self.reject(lambda v: v['duQueries'][1]['records'].append(copy.deepcopy(v['duQueries'][1]['records'][0])))

    def test_reclaimable_contradiction(self):
        self.reject(lambda v: v['duQueries'][1]['records'][0].__setitem__('reclaimable', False))

    def test_size_invalid(self):
        for size in [-1, True, '445B', 1.5, M.MAX + 1]:
            self.reject(lambda v: v['engineCache'][0].__setitem__('size', size))

    def test_aggregate_overflow(self):
        value = fixture()
        value['engineCache'][0]['size'] = M.MAX
        row = copy.deepcopy(value['engineCache'][0])
        row.update(idSha256='d' * 64, shared=True, size=1)
        value['engineCache'].append(row)
        with self.assertRaises(ValueError):
            self.run_value(value)

    def test_timestamp_drift_and_contradictions(self):
        for field, date in [('createdAt', '2026-09-08T00:00:00Z'),
                            ('lastUsedAt', '2026-09-08T00:00:00Z'),
                            ('lastUsedAt', '2026-09-05T00:00:00Z'),
                            ('lastUsedAt', 'yesterday')]:
            self.reject(lambda v: v['engineCache'][0].__setitem__(field, date))

    def test_stability_required(self):
        for stable in [False, 1, 'true']:
            self.reject(lambda v: v.__setitem__('beforeAfterStable', stable))

    def test_strict_boolean_type(self):
        self.reject(lambda v: v['engineCache'][0].__setitem__('inUse', 0))

    def test_unknown_record_type(self):
        self.reject(lambda v: v['engineCache'][0].__setitem__('type', 'new-type'))

    def test_json_duplicate_and_malformed(self):
        for raw in [b'', b'{', b'{"a":1,"a":2}', b'{"a":NaN}', b'x' * (M.CAP + 1)]:
            with self.assertRaises(ValueError):
                M.assess(raw, 100, 10)

    def test_capacity_contradictions(self):
        for total, free in [(0, 0), (1, 2), (True, 0), (M.MAX + 1, 0), (10, -1)]:
            with self.assertRaises(ValueError):
                M.assess(encode(fixture()), total, free)

    def test_percentage_target_and_zero_estimate(self):
        value = fixture()
        value['engineCache'][0]['size'] = M.GIB
        result = M.assess(encode(value), 200 * M.GIB, 14 * M.GIB)
        self.assertEqual(result['targetFreeBytes'], 50 * M.GIB)
        self.assertEqual(result['conservativeLogicalEstimateBytes'], 0)

    def test_cli_invalid_no_success_stdout(self):
        result = subprocess.run([sys.executable, '-B', str(SOURCE), '--total-bytes', '100',
                                 '--free-bytes', '10'], input=b'{', capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 65)
        self.assertEqual(result.stdout, b'')
        self.assertEqual(result.stderr.strip(), b'BUILDKIT_ASSESSMENT_REJECTED')


class CaptureContract(unittest.TestCase):
    def setUp(self):
        C.END = time.monotonic() + 3

    def command(self, code):
        return [sys.executable, '-B', '-c', code]

    def test_capture_success(self):
        self.assertEqual(C.capture(self.command('print("synthetic")')), b'synthetic\n')

    def test_capture_nonzero(self):
        with self.assertRaisesRegex(ValueError, 'producer-failed'):
            C.capture(self.command('print("not-success"); raise SystemExit(2)'))

    def test_capture_cap(self):
        with mock.patch.object(C, 'CAP', 16):
            with self.assertRaisesRegex(ValueError, 'capture-limit'):
                C.capture(self.command('print("x"*100)'))

    def test_capture_deadline(self):
        C.END = time.monotonic() + .1
        with self.assertRaisesRegex(ValueError, 'deadline'):
            C.capture(self.command('import time;time.sleep(5)'))

    def test_capture_descendant_stdout_deadline(self):
        C.END = time.monotonic() + .3
        spawned = []
        original = C.subprocess.Popen

        def record(*args, **kwargs):
            process = original(*args, **kwargs)
            spawned.append(process)
            return process

        with mock.patch.object(C.subprocess, 'Popen', side_effect=record):
            with self.assertRaisesRegex(ValueError, 'deadline'):
                C.capture(self.command('import os,time\nif os.fork()==0: time.sleep(5)'))
        self.assertEqual(len(spawned), 1)
        self.assertIsNotNone(spawned[0].poll())
        # Parent process is reaped; check synthetic descendants stop executing.
        # WSL PID1 can retain dead zombies, which are not running descendants.
        deadline = time.monotonic() + 2
        active = []
        while time.monotonic() < deadline:
            active = []
            for path in Path('/proc').glob('[0-9]*/stat'):
                try:
                    fields = path.read_text().rsplit(')', 1)[1].split()
                    if int(fields[2]) == spawned[0].pid and fields[0] != 'Z':
                        active.append(path)
                except (FileNotFoundError, ProcessLookupError, PermissionError):
                    pass
            if not active:
                break
            time.sleep(.02)
        self.assertEqual(active, [])

    def test_capture_descendant_closed_stdout_rejected(self):
        with self.assertRaisesRegex(ValueError, 'descendant'):
            C.capture(self.command('import os,time\nif os.fork()==0:\n os.close(1)\n time.sleep(5)'))

    def test_cleanup_failure_cannot_return_success(self):
        # Producer has completed; inject cleanup observation failure only.
        with mock.patch.object(C.os, 'killpg', side_effect=PermissionError('synthetic')):
            with self.assertRaises(PermissionError):
                C.capture(self.command('print("not-success")'))

    def test_endpoint_contract_static(self):
        source = SOURCE.with_name('observe-buildkit-capacity.py').read_text()
        self.assertEqual(C.ENV['DOCKER_CONTEXT'], 'default')
        self.assertNotIn('DOCKER_HOST', C.ENV)
        self.assertIn("endpoint != b'unix:///var/run/docker.sock'", source)
        self.assertIn("'--unix-socket',", source)

    def test_upstream_duplicate_and_nonfinite_rejected(self):
        for raw in (b'{"Size":1,"Size":999}', b'{"Size":NaN}', b'{"Size":Infinity}'):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                C.decode(raw)

    def test_exact_binary_no_plugin_resolution(self):
        with mock.patch.object(C.subprocess, 'Popen', side_effect=RuntimeError('stop')) as spawn:
            with self.assertRaises(RuntimeError):
                C.capture(['docker', 'buildx', 'version'])
            self.assertEqual(spawn.call_args.args[0], [C.BUILDX, 'version'])
        source = SOURCE.with_name('observe-buildkit-capacity.py').read_text()
        self.assertLess(source.index('binary, binary_identity = binary_binding()'),
                        source.index("buildx = capture(['docker', 'buildx', 'version'])"))

    def test_actual_signal_cleans_owned_producer(self):
        code = f'''
import importlib.util,sys,time
s=importlib.util.spec_from_file_location('c',{str(SOURCE.with_name('observe-buildkit-capacity.py'))!r})
c=importlib.util.module_from_spec(s);s.loader.exec_module(c)
c.install_signals();c.END=time.monotonic()+10
original=c.subprocess.Popen
def record(*a,**kw):
 p=original(*a,**kw);print(p.pid,flush=True);return p
c.subprocess.Popen=record
try:
 c.capture([sys.executable,'-B','-c','import time;time.sleep(10)'])
 print('UNEXPECTED_SUCCESS')
except ValueError:
 print('REJECTED')
'''
        for sig in (signal.SIGTERM, signal.SIGHUP):
            p = subprocess.Popen(self.command(code), stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE, start_new_session=True)
            child = None
            try:
                self.assertTrue(select.select([p.stdout], [], [], 3)[0])
                child = int(p.stdout.readline())
                p.send_signal(sig)
                out, _ = p.communicate(timeout=6)
                self.assertEqual(p.returncode, 0)
                self.assertIn(b'REJECTED', out)
                self.assertNotIn(b'UNEXPECTED_SUCCESS', out)
                with self.assertRaises(ProcessLookupError):
                    os.killpg(child, 0)
            finally:
                if p.poll() is None:
                    p.kill(); p.wait(timeout=3)
                if child is not None:
                    try: os.killpg(child, signal.SIGKILL)
                    except ProcessLookupError: pass

    def test_signal_between_spawn_and_assignment(self):
        spawned = []
        original = C.subprocess.Popen
        previous = {sig: signal.getsignal(sig) for sig in
                    (signal.SIGHUP, signal.SIGINT, signal.SIGTERM)}
        def spawn(*args, **kwargs):
            child = original(*args, **kwargs)
            spawned.append(child)
            os.kill(os.getpid(), signal.SIGTERM)
            return child
        try:
            C.install_signals()
            with mock.patch.object(C.subprocess, 'Popen', side_effect=spawn):
                with self.assertRaisesRegex(ValueError, 'observation-interrupted'):
                    C.capture(self.command('import time;time.sleep(10)'))
            self.assertIsNotNone(spawned[0].poll())
            with self.assertRaises(ProcessLookupError): os.killpg(spawned[0].pid, 0)
        finally:
            for sig, handler in previous.items(): signal.signal(sig, handler)

    def test_selector_failure_cleans_registered_producer(self):
        spawned = []
        original = C.subprocess.Popen
        def spawn(*args, **kwargs):
            child = original(*args, **kwargs); spawned.append(child); return child
        with mock.patch.object(C.subprocess, 'Popen', side_effect=spawn), \
             mock.patch.object(C.selectors, 'DefaultSelector', side_effect=RuntimeError('synthetic')):
            with self.assertRaises(RuntimeError):
                C.capture(self.command('import time;time.sleep(10)'))
        self.assertIsNotNone(spawned[0].poll())
        with self.assertRaises(ProcessLookupError): os.killpg(spawned[0].pid, 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
