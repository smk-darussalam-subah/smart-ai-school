#!/usr/bin/env python3
"""Executable synthetic regressions for the three source lanes; Linux required."""
import base64
import copy
import fcntl
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import select
import signal
import subprocess
import sys
import tempfile
import tarfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[3]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


c = load('diis_staging_core', 'infrastructure/deploy/staging-readiness-deploy.py')
a = load('application', 'infrastructure/deploy/staging-application-deploy.py')
t = load('installer', 'scripts/install-baked-backup-tools.py')
b = load('builder', 'scripts/build-backup-tools.py')
p = load('artifact', 'infrastructure/deploy/backup-image-artifact.py')
meta = load('metadata', 'infrastructure/deploy/verify-publication-metadata.py')
transport = load('transport', 'infrastructure/deploy/package-staging-executor.py')
loaded = load('loaded', 'infrastructure/deploy/verify-loaded-backup-image.py')
published = load('published', 'infrastructure/deploy/verify-published-backup-image.py')
handoff = load('handoff', 'infrastructure/deploy/verify-source-closure-handoff.py')


class Fake:
    def __init__(self, fail=None):
        self.p = {'sourceSha': 'a'*40, 'baseSha': 'b'*40, 'expires': time.time()+1800}
        self.packet = {'targetModelSha256': '3'*64, 'baselineReceipt': {
            'schema': 'diis-staging-application-receipt-v1', 'sourceSha': self.p['baseSha'],
            'modelSha256': '4'*64, 'configHashes': {'api': '1'*64, 'web': '2'*64},
            'imageReferences': {'api':'sha256:'+'7'*64, 'web':'sha256:'+'8'*64}},
            'targetApps': {name: {'reference':
                'ghcr.io/smk-darussalam-subah/diis-'+name+'@sha256:'+'9'*64}
                for name in ('api','web')}}
        self.run_id = '1'
        self.events = []
        self.fail = fail
        self.applies = 0
        self.head = self.p['baseSha']

    def preflight(self):
        self.events.append('preflight')
        if self.fail == 'preflight':
            raise c.Stop('preflight')

    def model(self):
        return {'services': {'api': {'image': 'old'}, 'web': {'image': 'old'}}}

    def target_model(self, baseline):
        return {'services': {'api': {'image': 'new'}, 'web': {'image': 'new'}}}

    def app_configs(self):
        return {'env': 'SYNTHETIC'}

    def config_hashes(self, path):
        return {'api': '1'*64, 'web': '2'*64} if path.name == 'baseline.json' else {
            'api': '5'*64, 'web': '6'*64}

    def environment(self):
        return b'SYNTHETIC=private\n'

    def git(self, *args):
        self.events.append(args[0])
        if args[0] == 'merge':
            self.head = self.p['sourceSha']
            if self.fail == 'merge':
                raise c.Stop('merge')
        if args[0] == 'reset':
            self.head = self.p['baseSha']
        if args[0] == 'rev-parse':
            return self.head.encode()
        return b''

    def source_result(self):
        if self.fail == 'source' and self.applies == 1:
            raise c.Stop('source')

    def invariant(self):
        if self.fail == 'invariant':
            raise c.Stop('invariant')

    def apply(self, path):
        self.events.append(path.name)
        self.applies += 1
        if self.fail == 'ambiguous':
            raise c.ProducerAmbiguous('ambiguous')
        if self.fail == 'apply' and self.applies == 1:
            raise c.Stop('apply')
        if self.fail == 'rollback':
            raise c.Stop('apply')
        if self.fail in c.HANDLED_SIGNALS and self.applies == 1:
            os.kill(os.getpid(), self.fail)

    def health(self):
        pass

    def verify_target(self):
        if self.fail == 'verify':
            raise c.Stop('verify')

    def verify_apps(self, expected):
        pass

    def verify_model(self, path, expected):
        self.asserted_hashes = expected
        if self.fail == 'config' and self.applies == 1:
            raise c.Stop('config')


class Application(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.root.chmod(0o700)

    def tearDown(self):
        c.OWNED_PRODUCERS.clear()
        c.DEFERRED_SIGNALS.clear()
        c.DEFER_CANCELLATION = False
        self.tmp.cleanup()

    def writer_context(self):
        return {'sourceSha': 'a'*40, 'approvalId': '9'*32, 'runId': '1'}

    def shell_writer(self, lock, library=None):
        library = library or ROOT/'infrastructure/docker/scripts/backup-lib.sh'
        environment = {**os.environ, 'DIIS_W10D_TEST_ROOT': str(self.root),
                       'BACKUP_LOCK_TEST_MODE': '1'}
        return subprocess.run(['/bin/sh', '-ceu',
            '. "$1"; acquire_directory_lock "$2"; release_directory_lock "$2"',
            'sh', str(library), str(lock)], env=environment,
            capture_output=True, timeout=10, check=False)

    def legacy_shell_writer(self, lock):
        # Exact stale-owner decision used by the currently deployed staging/main
        # backup-lib revisions. A live guardian must block this older algorithm;
        # an ownerless marker alone would be reclaimed after its bounded wait.
        script = r'''
lock_dir=$1
boot_id=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || printf unknown)
self_namespace=$(readlink "/proc/$$/ns/pid" 2>/dev/null || printf unknown)
if ! mkdir "$lock_dir" 2>/dev/null; then
  owner_file="${lock_dir}/owner"
  attempt=0
  while [ ! -s "$owner_file" ] && [ "$attempt" -lt 20 ]; do
    attempt=$((attempt + 1)); sleep 0.05
  done
  owner_boot=$(sed -n '1p' "$owner_file" 2>/dev/null || true)
  owner_pid=$(sed -n '2p' "$owner_file" 2>/dev/null || true)
  owner_start=$(sed -n '3p' "$owner_file" 2>/dev/null || true)
  owner_namespace=$(sed -n '5p' "$owner_file" 2>/dev/null || true)
  owner_live=false
  case "$owner_pid" in ''|*[!0-9]*) ;;
    *)
      if [ "$owner_boot" = "$boot_id" ] && [ "$owner_namespace" = "$self_namespace" ] \
        && kill -0 "$owner_pid" 2>/dev/null; then
        current_start=$(awk '{print $22}' "/proc/${owner_pid}/stat" 2>/dev/null || true)
        [ -n "$current_start" ] && [ "$current_start" = "$owner_start" ] && owner_live=true
      fi
      ;;
  esac
  [ "$owner_live" = false ] || exit 23
  [ "$owner_boot" != "$boot_id" ] || [ "$owner_namespace" = "$self_namespace" ] || exit 24
  stale_dir="${lock_dir}.stale.$$"
  mv "$lock_dir" "$stale_dir"
  mkdir "$lock_dir"
  rm -rf "$stale_dir"
fi
exit 0
'''
        return subprocess.run(['/bin/sh', '-ceu', script, 'sh', str(lock)],
                              capture_output=True, timeout=10, check=False)

    def writer_evidence(self):
        return {
            'schema': 'diis-writer-attestation-v2',
            'expires': 1234567890,
            'sourceSha': 'a'*40,
            'rootCronSha256': '1'*64,
            'n8nSha256': '2'*64,
            'preservationSha256': '3'*64,
            'writerInventorySha256': '4'*64,
            'backupLibrarySha256': a.PERSISTENT_WRITER_LIBRARY_SHA256,
            'allWritersUseCanonicalLock': True,
            'allWritersRejectPersistentApplicationQuarantine': True,
        }

    def test_writer_attestation_requires_exact_persistent_library_before_lock(self):
        library = ROOT/'infrastructure/docker/scripts/backup-lib.sh'
        actual = hashlib.sha256(library.read_bytes()).hexdigest()
        self.assertEqual(actual, a.PERSISTENT_WRITER_LIBRARY_SHA256)
        packet = {'expires': 1234567890, 'sourceSha': 'a'*40}
        a.validate_writer_evidence(self.writer_evidence(), packet, actual)
        for field, value in (
                ('schema', 'diis-writer-attestation-v1'),
                ('backupLibrarySha256', '5235dece7fc99e0bce21ab1bfa3d0caeca8637e8ff0e8dbf1e4a14898653886f'),
                ('allWritersRejectPersistentApplicationQuarantine', False)):
            changed = self.writer_evidence()
            changed[field] = value
            with self.subTest(field=field), self.assertRaises(c.Stop):
                a.validate_writer_evidence(changed, packet, actual)
        with self.assertRaises(c.Stop):
            a.validate_writer_evidence(self.writer_evidence(), packet,
                                       '5235dece7fc99e0bce21ab1bfa3d0caeca8637e8ff0e8dbf1e4a14898653886f')

    def test_prior_boot_quarantine_blocks_current_and_frozen_compatible_writer(self):
        lock = self.root/'backup.lock'
        lock.mkdir(mode=0o700)
        frozen = self.root/'compatible-backup-lib.sh'
        frozen.write_bytes((ROOT/'infrastructure/docker/scripts/backup-lib.sh').read_bytes())
        frozen.chmod(0o600)
        owner = ('prior-boot-id\n999999\n1\nretained-token\n'
                 'diis-application-quarantine:'+'a'*64+'\n').encode('ascii')
        marker = json.dumps({'schema': 'diis-staging-application-lock-v1',
                             'state': 'quarantined-until-verified-release',
                             'retry': 'prohibited'}, separators=(',', ':')).encode('ascii')
        (lock/'owner').write_bytes(owner)
        (lock/'application-owner.json').write_bytes(marker)
        before = {name: (lock/name).read_bytes()
                  for name in ('owner', 'application-owner.json')}
        for name, library in (('current', None), ('frozen-compatible', frozen)):
            with self.subTest(writer=name):
                contender = self.shell_writer(lock, library)
                self.assertNotEqual(contender.returncode, 0)
                self.assertIn(b'karantina aplikasi aktif atau ambigu', contender.stderr)
                self.assertEqual({item: (lock/item).read_bytes() for item in before}, before)
        (lock/'application-owner.json').unlink()
        for name, library in (('current-marker-missing', None),
                              ('frozen-compatible-marker-missing', frozen)):
            with self.subTest(writer=name):
                contender = self.shell_writer(lock, library)
                self.assertNotEqual(contender.returncode, 0)
                self.assertIn(b'karantina aplikasi aktif atau ambigu', contender.stderr)
                self.assertEqual((lock/'owner').read_bytes(), before['owner'])
        (lock/'owner').unlink()
        lock.rmdir()

    def test_success_cleanup(self):
        host = Fake()
        a.transaction(host, self.root)
        self.assertEqual(host.applies, 1)
        self.assertEqual(set(x.name for x in self.root.iterdir()), {'attempt.json', 'result.json'})
        receipt = json.loads((self.root/'result.json').read_bytes())
        self.assertEqual(receipt['configHashes'], {'api': '5'*64, 'web': '6'*64})

    def test_preflight_no_mutation(self):
        host = Fake('preflight')
        with self.assertRaises(c.Stop):
            a.transaction(host, self.root)
        self.assertNotIn('merge', host.events)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_failure_rollback_matrix(self):
        for failure in ('merge', 'apply', 'verify', 'config', 'source'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                root = Path(directory); root.chmod(0o700)
                host = Fake(failure)
                with self.assertRaisesRegex(c.Stop, 'rollback-verified'):
                    a.transaction(host, root)
                self.assertEqual(host.head, host.p['baseSha'])
                self.assertIn('baseline.json', host.events)
                self.assertTrue((root/'baseline.json').exists())

    def test_ambiguity_prohibits_rollback_and_cleanup(self):
        host = Fake('ambiguous')
        with self.assertRaises(c.ProducerAmbiguous):
            a.transaction(host, self.root)
        self.assertEqual(host.applies, 1)
        self.assertNotIn('reset', host.events)
        self.assertTrue((self.root/'baseline.json').exists())

    def test_rollback_failure_retains(self):
        with self.assertRaises(c.ProducerAmbiguous):
            a.transaction(Fake('rollback'), self.root)
        self.assertTrue((self.root/'environment.snapshot').exists())

    def test_signal_matrix(self):
        for sig in c.HANDLED_SIGNALS:
            with self.subTest(signal=sig), tempfile.TemporaryDirectory() as directory:
                root = Path(directory); root.chmod(0o700)
                old = signal.signal(sig, lambda *_: (_ for _ in ()).throw(c.Stop('interrupted')))
                try:
                    host = Fake(sig)
                    with self.assertRaises(c.Stop):
                        a.transaction(host, root)
                    self.assertEqual(host.head, host.p['baseSha'])
                finally:
                    signal.signal(sig, old)

    def test_real_runner_defers_repeated_signal_until_verified_rollback(self):
        class Repeated(Fake):
            def __init__(self, sig, boundary):
                super().__init__('apply')
                self.sig, self.boundary = sig, boundary

            def invariant(self):
                if self.applies == 1 and self.boundary == 'observation':
                    os.kill(os.getpid(), self.sig); os.kill(os.getpid(), self.sig)
                    c.run(['/bin/true'], cwd=ROOT)

            def apply(self, path):
                self.applies += 1
                if self.applies == 1:
                    raise c.Stop('apply')
                if self.boundary == 'apply':
                    os.kill(os.getpid(), self.sig); os.kill(os.getpid(), self.sig)
                    c.run(['/bin/true'], cwd=ROOT)

            def verify_model(self, path, expected):
                if self.applies == 2 and self.boundary == 'final':
                    os.kill(os.getpid(), self.sig); os.kill(os.getpid(), self.sig)
                    c.run(['/bin/true'], cwd=ROOT)

        for sig in c.HANDLED_SIGNALS:
            for boundary in ('observation', 'apply', 'final'):
                with self.subTest(signal=sig, boundary=boundary), tempfile.TemporaryDirectory() as directory:
                    root = Path(directory); root.chmod(0o700)
                    old = signal.signal(sig, lambda number, _frame: c.DEFERRED_SIGNALS.add(number))
                    c.DEFERRED_SIGNALS.clear()
                    try:
                        host = Repeated(sig, boundary)
                        with self.assertRaisesRegex(c.Stop, '^application-cancelled-rollback-verified'):
                            a.transaction(host, root)
                        self.assertEqual(host.head, host.p['baseSha'])
                        self.assertFalse(c.DEFER_CANCELLATION)
                    finally:
                        signal.signal(sig, old)
                        c.DEFERRED_SIGNALS.clear()

    def test_rollback_cleanup_ambiguity_has_priority_over_repeated_signal(self):
        class Ambiguous(Fake):
            def apply(self, path):
                self.applies += 1
                if self.applies == 1:
                    raise c.Stop('apply')
                os.kill(os.getpid(), signal.SIGTERM)
                finish = c.finish_producer
                def cleanup_then_fail(process, selector):
                    finish(process, selector)
                    raise c.ProducerAmbiguous('cleanup')
                with patch.object(c, 'finish_producer', side_effect=cleanup_then_fail):
                    c.run(['/bin/true'], cwd=ROOT)
        old = signal.signal(signal.SIGTERM,
                            lambda number, _frame: c.DEFERRED_SIGNALS.add(number))
        try:
            with self.assertRaisesRegex(c.ProducerAmbiguous, '^application-rollback-ambiguous'):
                a.transaction(Ambiguous(), self.root)
        finally:
            signal.signal(signal.SIGTERM, old)
            c.DEFERRED_SIGNALS.clear()

    def test_schema_migration_rejected(self):
        host = a.Host({'baseline': Fake().p})
        host.git = lambda *args: b'packages/database/prisma/schema.prisma\n'
        with self.assertRaises(c.Stop):
            host.application_delta()

    def test_git_observation_failure_not_empty(self):
        host = a.Host({'baseline': Fake().p})
        host.git = lambda *args: (_ for _ in ()).throw(c.Stop('read'))
        with self.assertRaises(c.Stop):
            host.application_delta()

    def test_deploy_file_lock_contention_and_symlink(self):
        path = self.root/'lock'; path.touch(mode=0o600)
        fd = a.lock(path, os.geteuid())
        try:
            with self.assertRaises(BlockingIOError):
                a.lock(path, os.geteuid())
        finally:
            os.close(fd)
        link = self.root/'link'; link.symlink_to(path)
        with self.assertRaises(c.Stop):
            a.lock(link, os.geteuid())

    def test_writer_directory_lock_interoperates_with_backup_writer(self):
        lock = self.root/'backup.lock'
        library = ROOT/'infrastructure/docker/scripts/backup-lib.sh'
        environment = {**os.environ, 'DIIS_W10D_TEST_ROOT': str(self.root),
                       'BACKUP_LOCK_TEST_MODE': '1'}
        with patch.object(a, 'WRITER_LOCK', lock):
            held = a.acquire_writer_lock(self.writer_context())
            owner = (lock/'owner').read_bytes()
            contender = subprocess.run(['/bin/sh', '-ceu',
                '. "$1"; acquire_directory_lock "$2"', 'sh', str(library), str(lock)],
                env=environment, capture_output=True, timeout=10, check=False)
            self.assertNotEqual(contender.returncode, 0)
            self.assertIn(b'karantina aplikasi aktif atau ambigu', contender.stderr)
            self.assertEqual(self.legacy_shell_writer(lock).returncode, 24)
            self.assertEqual((lock/'owner').read_bytes(), owner)
            a.release_writer_lock(held)
            self.assertFalse(lock.exists())

            holder = subprocess.Popen(['/bin/sh', '-ceu',
                'trap \'release_directory_lock "$2" >/dev/null 2>&1 || :\' EXIT; '
                '. "$1"; acquire_directory_lock "$2"; printf "READY\\n"; read line',
                'sh', str(library), str(lock)], env=environment,
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                self.assertEqual(holder.stdout.readline(), b'READY\n')
                with self.assertRaisesRegex(c.Stop, 'backup-writer-active-or-ambiguous'):
                    a.acquire_writer_lock(self.writer_context())
            finally:
                holder.stdin.write(b'finish\n'); holder.stdin.flush()
                stdout, stderr = holder.communicate(timeout=10)
                self.assertEqual((holder.returncode, stdout, stderr), (0, b'', b''))
            self.assertFalse(lock.exists())

    def test_writer_lock_rejects_unsafe_parent_and_release_drift(self):
        lock = self.root/'backup.lock'
        with patch.object(a, 'WRITER_LOCK', lock):
            held = a.acquire_writer_lock(self.writer_context())
            (lock/'application-owner.json').write_text('changed\n', encoding='ascii')
            try:
                with self.assertRaisesRegex(c.ProducerAmbiguous, 'writer-lock-release-ambiguous'):
                    a.release_writer_lock(held)
            finally:
                self.clear_test_quarantine(lock, held['guardianPid'])
        unsafe = self.root/'unsafe'; unsafe.mkdir(mode=0o755)
        with patch.object(a, 'WRITER_LOCK', unsafe/'backup.lock'), self.assertRaises(c.Stop):
            a.acquire_writer_lock(self.writer_context())

    def run_actual_main(self, host, transaction_function, lock):
        state = self.root/('state-'+str(host.fail or 'success'))
        state.mkdir(mode=0o700)
        deploy_lock = state/'deploy.lock'
        if not deploy_lock.exists(): deploy_lock.touch(mode=0o600)
        approval = state/'staging-application-approval.json'
        approval.write_bytes(b'{}'); approval.chmod(0o600)
        stdout = self.root/('main-'+host.fail.__str__()+'.out')
        stderr = self.root/('main-'+host.fail.__str__()+'.err')
        child = os.fork()
        if child == 0:
            try:
                out_fd = os.open(stdout, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                err_fd = os.open(stderr, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                os.dup2(out_fd, 1); os.dup2(err_fd, 2)
                os.close(out_fd); os.close(err_fd)
                host.p['approvalId'] = '9'*32
                host.p['expires'] = time.time()+1800
                with patch.object(c, 'STATE', state), patch.object(a, 'APPROVAL', approval), \
                     patch.object(a, 'WRITER_LOCK', lock), patch.object(a, 'Host', return_value=host), \
                     patch.object(a, 'validate', return_value={'baseline':host.p}), \
                     patch.object(a.pwd, 'getpwuid', return_value=SimpleNamespace(pw_name='appuser')), \
                     patch.object(a, 'transaction', side_effect=transaction_function), \
                     patch.object(sys, 'argv', ['application', 'a'*40, c.digest(b'{}'), '1', '1']):
                    result = a.main()
                sys.stdout.flush(); sys.stderr.flush()
                os._exit(result)
            except BaseException:
                os._exit(120)
        _, wait_status = os.waitpid(child, 0)
        return os.waitstatus_to_exitcode(wait_status), stdout.read_bytes(), stderr.read_bytes(), state

    def clear_test_quarantine(self, lock, guardian=None):
        marker = lock/'application-owner.json'
        if guardian is None:
            self.assertTrue(marker.is_file() and not marker.is_symlink())
            value = json.loads(marker.read_bytes())
            guardian = int(value['guardianPid'])
        try:
            os.kill(guardian, signal.SIGKILL)
        except ProcessLookupError:
            pass
        try:
            os.waitpid(guardian, 0)
        except ChildProcessError:
            deadline = time.monotonic()+5
            while Path('/proc/'+str(guardian)).exists() and time.monotonic() < deadline:
                time.sleep(.02)
        self.assertFalse(Path('/proc/'+str(guardian)).exists())
        if marker.exists(): marker.unlink()
        (lock/'owner').unlink(); lock.rmdir()

    def test_committed_guardian_retains_when_marker_disappears_before_executor_eof(self):
        lock = self.root/'backup.lock'
        with patch.object(a, 'WRITER_LOCK', lock):
            held = a.acquire_writer_lock(self.writer_context())
            guardian = held['guardianPid']
            owner = (lock/'owner').read_bytes()
            (lock/'application-owner.json').unlink()
            a.retain_writer_lock(held)
            time.sleep(.1)
            self.assertTrue(Path('/proc/'+str(guardian)).exists())
            self.assertNotEqual(self.shell_writer(lock).returncode, 0)
            self.assertEqual(self.legacy_shell_writer(lock).returncode, 24)
            self.assertEqual((lock/'owner').read_bytes(), owner)
            self.clear_test_quarantine(lock, guardian)

    def test_post_publish_validation_failure_retains_complete_quarantine(self):
        lock = self.root/'backup.lock'
        with patch.object(a, 'WRITER_LOCK', lock), \
             patch.object(a, '_application_lock_is_published', return_value=False):
            with self.assertRaisesRegex(c.ProducerAmbiguous,
                                        'writer-lock-publication-ambiguous'):
                a.acquire_writer_lock(self.writer_context())
        marker = json.loads((lock/'application-owner.json').read_bytes())
        guardian = int(marker['guardianPid'])
        owner = (lock/'owner').read_bytes()
        self.assertTrue(Path('/proc/'+str(guardian)).exists())
        self.assertNotEqual(self.shell_writer(lock).returncode, 0)
        self.assertEqual(self.legacy_shell_writer(lock).returncode, 24)
        self.assertEqual((lock/'owner').read_bytes(), owner)
        self.clear_test_quarantine(lock, guardian)

    def test_guardian_death_after_publish_cannot_enable_current_or_legacy_writer(self):
        lock = self.root/'backup.lock'
        with patch.object(a, 'WRITER_LOCK', lock):
            held = a.acquire_writer_lock(self.writer_context())
            guardian = held['guardianPid']
            owner = (lock/'owner').read_bytes()
            os.kill(guardian, signal.SIGKILL)
            _, wait_status = os.waitpid(guardian, 0)
            self.assertEqual(os.waitstatus_to_exitcode(wait_status), -signal.SIGKILL)
            self.assertNotEqual(self.shell_writer(lock).returncode, 0)
            self.assertEqual(self.legacy_shell_writer(lock).returncode, 24)
            self.assertEqual((lock/'owner').read_bytes(), owner)
            with self.assertRaisesRegex(c.ProducerAmbiguous, 'writer-lock-release-ambiguous'):
                a.release_writer_lock(held)
            self.clear_test_quarantine(lock, guardian)

    def test_atomic_retirement_failure_retains_complete_canonical_quarantine(self):
        lock = self.root/'backup.lock'
        with patch.object(a, 'WRITER_LOCK', lock):
            held = a.acquire_writer_lock(self.writer_context())
            guardian = held['guardianPid']
            retired = lock.parent/('.backup.lock.retired.'+str(guardian))
            retired.mkdir(mode=0o700)
            try:
                owner = (lock/'owner').read_bytes()
                marker = (lock/'application-owner.json').read_bytes()
                with self.assertRaisesRegex(c.ProducerAmbiguous,
                                            'writer-lock-release-ambiguous'):
                    a.release_writer_lock(held)
                self.assertTrue(Path('/proc/'+str(guardian)).exists())
                self.assertEqual((lock/'owner').read_bytes(), owner)
                self.assertEqual((lock/'application-owner.json').read_bytes(), marker)
                self.assertNotEqual(self.shell_writer(lock).returncode, 0)
                self.assertEqual(self.legacy_shell_writer(lock).returncode, 24)
            finally:
                retired.rmdir()
                self.clear_test_quarantine(lock, guardian)

    def test_actual_main_retains_quarantine_after_ambiguous_child_and_exit(self):
        lock = self.root/'backup.lock'
        producer = subprocess.Popen(['/bin/sleep', '30'], start_new_session=True,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        def ambiguous(_host, directory):
            c.write_exclusive(directory/'attempt.json', b'RECOVERY-EVIDENCE')
            c.OWNED_PRODUCERS[producer.pid] = producer
            raise c.ProducerAmbiguous('synthetic-live-producer')
        try:
            status, stdout, stderr, state = self.run_actual_main(Fake(), ambiguous, lock)
            self.assertEqual(status, 74)
            self.assertNotIn(b'APPLICATION_STAGING_COMPLETE', stdout)
            self.assertIn(b'retry=prohibited', stderr)
            self.assertTrue((state/('staging-app-attempt-'+'9'*32)/'attempt.json').is_file())
            self.assertIsNone(producer.poll())
            owner = (lock/'owner').read_bytes()
            self.assertNotEqual(self.shell_writer(lock).returncode, 0)
            self.assertEqual(self.legacy_shell_writer(lock).returncode, 24)
            self.assertEqual((lock/'owner').read_bytes(), owner)
            os.killpg(producer.pid, signal.SIGKILL); producer.wait(timeout=5)
            self.assertNotEqual(self.shell_writer(lock).returncode, 0)
            self.assertEqual(self.legacy_shell_writer(lock).returncode, 24)
            self.assertEqual((lock/'owner').read_bytes(), owner)
        finally:
            if producer.poll() is None:
                os.killpg(producer.pid, signal.SIGKILL); producer.wait(timeout=5)
            if lock.exists(): self.clear_test_quarantine(lock)

    def test_actual_main_success_and_verified_rollback_release_writer(self):
        lock = self.root/'backup.lock'
        for failure, expected in ((None, 0), ('apply', 74)):
            with self.subTest(failure=failure):
                host = Fake(failure)
                status, stdout, stderr, _state = self.run_actual_main(host, a.transaction, lock)
                self.assertEqual(status, expected)
                self.assertFalse(lock.exists())
                writer = self.shell_writer(lock)
                self.assertEqual((writer.returncode, writer.stderr), (0, b''))
                if expected == 0:
                    self.assertIn(b'APPLICATION_STAGING_COMPLETE', stdout)
                else:
                    self.assertIn(b'rollback-verified', stderr)

    def test_executor_sigkill_leaves_pre_registered_quarantine(self):
        lock = self.root/'backup.lock'
        ready = self.root/'executor-ready'
        stream_read, stream_write = os.pipe()
        child = os.fork()
        if child == 0:
            try:
                os.close(stream_read)
                os.dup2(stream_write, 1); os.dup2(stream_write, 2)
                os.close(stream_write)
                with patch.object(a, 'WRITER_LOCK', lock):
                    a.acquire_writer_lock(self.writer_context())
                    ready.write_bytes(b'READY')
                    signal.pause()
            finally:
                os._exit(121)
        os.close(stream_write)
        try:
            deadline = time.monotonic()+5
            while not ready.exists() and time.monotonic() < deadline: time.sleep(.02)
            self.assertTrue(ready.exists())
            os.kill(child, signal.SIGKILL)
            _, wait_status = os.waitpid(child, 0)
            self.assertEqual(os.waitstatus_to_exitcode(wait_status), -signal.SIGKILL)
            readable, _, _ = select.select([stream_read], [], [], 2)
            self.assertTrue(readable)
            self.assertEqual(os.read(stream_read, 1), b'')
            self.assertNotEqual(self.shell_writer(lock).returncode, 0)
            self.assertEqual(self.legacy_shell_writer(lock).returncode, 24)
        finally:
            os.close(stream_read)
            try: os.kill(child, signal.SIGKILL)
            except ProcessLookupError: pass
            try: os.waitpid(child, 0)
            except ChildProcessError: pass
            if lock.exists(): self.clear_test_quarantine(lock)

    def test_sigkill_at_every_atomic_publication_boundary(self):
        boundaries = (
            'guardian-created', 'directory-created', 'owner-temporary-written',
            'owner-published-in-staging', 'marker-temporary-written',
            'marker-published-in-staging', 'canonical-directory-published')
        for index, boundary in enumerate(boundaries):
            with self.subTest(boundary=boundary):
                parent = self.root/('boundary-'+str(index)); parent.mkdir(mode=0o700)
                lock = parent/'backup.lock'
                barrier = self.root/('barrier-'+str(index))
                child = os.fork()
                if child == 0:
                    def stop_here(name, guardian_pid):
                        if name == boundary:
                            barrier.write_text(
                                str(os.getpid())+':'+str(guardian_pid), encoding='ascii')
                            while True: signal.pause()
                    try:
                        with patch.object(a, 'WRITER_LOCK', lock), \
                             patch.object(a, '_lock_publication_boundary', side_effect=stop_here):
                            a.acquire_writer_lock(self.writer_context())
                    finally:
                        os._exit(121)
                deadline = time.monotonic()+5
                while not barrier.exists() and time.monotonic() < deadline: time.sleep(.02)
                self.assertTrue(barrier.exists())
                executor_pid, guardian = (int(item) for item in
                    barrier.read_text(encoding='ascii').split(':'))
                staged = parent/('.backup.lock.application.' + str(executor_pid))
                os.kill(child, signal.SIGKILL)
                _, wait_status = os.waitpid(child, 0)
                self.assertEqual(os.waitstatus_to_exitcode(wait_status), -signal.SIGKILL)
                if boundary == 'canonical-directory-published':
                    deadline = time.monotonic()+5
                    while not (lock/'application-owner.json').is_file() \
                            and time.monotonic() < deadline: time.sleep(.02)
                    self.assertTrue((lock/'owner').is_file())
                    self.assertTrue(Path('/proc/'+str(guardian)).exists())
                    owner = (lock/'owner').read_bytes()
                    self.assertNotEqual(self.shell_writer(lock).returncode, 0)
                    self.assertEqual(self.legacy_shell_writer(lock).returncode, 24)
                    self.assertEqual((lock/'owner').read_bytes(), owner)
                    self.clear_test_quarantine(lock, guardian)
                else:
                    deadline = time.monotonic()+5
                    while ((staged.exists() or Path('/proc/'+str(guardian)).exists())
                           and time.monotonic() < deadline): time.sleep(.02)
                    self.assertFalse(lock.exists())
                    self.assertFalse(staged.exists())
                    self.assertFalse(Path('/proc/'+str(guardian)).exists())
                    current = self.shell_writer(lock)
                    self.assertEqual((current.returncode, current.stderr), (0, b''))
                    legacy = self.legacy_shell_writer(lock)
                    self.assertEqual(legacy.returncode, 0)
                    lock.rmdir()

    def test_transport_preserves_recovery_bytes(self):
        self.assertEqual(base64.b64decode(transport.package('recovery-only')),
                         (ROOT/'infrastructure/deploy/staging-readiness-deploy.py').read_bytes())
        with self.assertRaises(ValueError):
            transport.package('unknown')
        compile(base64.b64decode(transport.package('application')), 'transport', 'exec')

    def test_target_approval_schema_and_immutable_identity(self):
        legacy = load('packet_fixture', 'infrastructure/deploy/tests/staging-readiness-contract.py')
        base = legacy.packet()
        packet = dict(schema='diis-staging-application-approval-v1', baseline=base,
            targetModelSha256='a'*64, writerEvidenceSha256='b'*64,
            baselineReceipt=dict(schema='diis-staging-application-receipt-v1',
                sourceSha=base['baseSha'], modelSha256=base['modelSha256'],
                configHashes={'api':'1'*64, 'web':'2'*64},
                imageReferences={name:'sha256:'+'9'*64 for name in ('api','web')}),
            targetApps={name:dict(reference=f'ghcr.io/smk-darussalam-subah/diis-{name}@sha256:'+'c'*64,
                        id='sha256:'+'d'*64, revision=base['sourceSha']) for name in ('api','web')})
        a.validate(packet, base['sourceSha'], int(time.time()))
        for key, value in [('reference','ghcr.io/smk-darussalam-subah/diis-api:latest'),
                           ('revision','0'*40), ('id','sha256:bad')]:
            changed = copy.deepcopy(packet); changed['targetApps']['api'][key] = value
            with self.subTest(key=key), self.assertRaises(c.Stop):
                a.validate(changed, base['sourceSha'], int(time.time()))
        with self.assertRaises(c.Stop):
            a.validate({**packet,'unknown':True}, base['sourceSha'], int(time.time()))
        changed = copy.deepcopy(packet); changed['baselineReceipt']['sourceSha'] = '0'*40
        with self.assertRaises(c.Stop):
            a.validate(changed, base['sourceSha'], int(time.time()))

    def test_target_model_cannot_change_environment(self):
        base = Fake().model()
        base['services']['api']['environment'] = {'SYNTHETIC':'literal$value'}
        packet = {'baseline':Fake().p, 'targetApps':{
            name:{'reference':'ghcr.io/smk-darussalam-subah/diis-'+name+'@sha256:'+'c'*64}
            for name in ('api','web')}}
        target = copy.deepcopy(base)
        for name in target['services']:
            target['services'][name]['image'] = packet['targetApps'][name]['reference']
        packet['targetModelSha256'] = c.digest(c.canonical(target))
        host = a.Host(packet)
        self.assertEqual(host.target_model(base), target)
        self.assertEqual(base['services']['api']['image'],'old')
        packet['targetModelSha256'] = '0'*64
        with self.assertRaises(c.Stop):
            host.target_model(base)

    def test_actual_compose_hash_receipt_supports_two_releases_and_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def model(image):
                return {'services': {name: {'container_name': 'smk-staging-'+name,
                    'image': image+name, 'pull_policy': 'never', 'networks': ['smk-staging-net']}
                    for name in ('api','web')}, 'networks': {
                    'smk-staging-net': {'name':'smk-staging-net','external':True}}}
            paths = []
            for name, image in (('a','old-'),('b','middle-'),('c','new-')):
                path = root/(name+'.json'); path.write_bytes(c.compose_bytes(model(image))); paths.append(path)
            fake = Fake()
            with patch.object(c, 'ROOT', ROOT):
                hashes = [a.Host.config_hashes(fake, path) for path in paths]
            self.assertEqual(len({item['api'] for item in hashes}), 3)
            for index in (0, 1):
                packet = {'baseline': fake.p, 'baselineReceipt': {
                    'schema':'diis-staging-application-receipt-v1',
                    'sourceSha': fake.p['baseSha'], 'modelSha256':'4'*64,
                    'configHashes':hashes[index],
                    'imageReferences': {name:(('old-','middle-')[index]+name)
                                        for name in ('api','web')}}}
                host = a.Host(packet)
                host.model = lambda value=model(('old-','middle-')[index]): value
                def observed(argv, **_kwargs):
                    service = 'api' if argv[-1].endswith('api') else 'web'
                    return hashes[index][service].encode()
                with patch.object(c, 'run', side_effect=observed):
                    host.verify_compose_baseline()
            # A failed C deployment can still verify the retained B receipt on a fresh preflight.
            with patch.object(c, 'ROOT', ROOT):
                self.assertEqual(hashes[1], a.Host.config_hashes(fake, paths[1]))


class Tools(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.source = self.root/'source'; self.source.mkdir(mode=0o700)
        self.target = self.root/'target'; self.target.mkdir(mode=0o700)
        data = {name: ('synthetic-'+name).encode() for name in t.NAMES}
        for name, raw in data.items():
            (self.source/name).write_bytes(raw)
        (self.source/'manifest.json').write_text(json.dumps(
            {name: hashlib.sha256(raw).hexdigest() for name, raw in data.items()}))

    def tearDown(self):
        self.tmp.cleanup()

    def test_install_and_exact_noop(self):
        t.install(self.source, self.target)
        before = {p.name: t.identity(p.stat()) for p in self.target.iterdir()}
        t.install(self.source, self.target)
        self.assertEqual(before, {p.name: t.identity(p.stat()) for p in self.target.iterdir()})

    def test_legacy_drift_never_overwritten(self):
        (self.target/'mc').write_bytes(b'legacy')
        with self.assertRaises(ValueError):
            t.install(self.source, self.target)
        self.assertEqual((self.target/'mc').read_bytes(), b'legacy')

    def test_symlink_and_hardlink(self):
        (self.target/'mc').symlink_to(self.source/'mc')
        with self.assertRaises(ValueError):
            t.install(self.source, self.target)
        (self.target/'mc').unlink()
        os.link(self.source/'mc', self.target/'mc')
        with self.assertRaises(ValueError):
            t.install(self.source, self.target)

    def test_source_tamper_before_write(self):
        (self.source/'mc').write_bytes(b'other')
        with self.assertRaises(ValueError):
            t.install(self.source, self.target)
        self.assertEqual(list(self.target.iterdir()), [])

    def test_partial_write_stops_retry(self):
        original = os.open
        count = 0
        def fault(path, flags, *args, **kwargs):
            nonlocal count
            if flags & os.O_CREAT:
                count += 1
                if count == 2:
                    raise OSError('synthetic')
            return original(path, flags, *args, **kwargs)
        with patch.object(t.os, 'open', side_effect=fault), self.assertRaises(OSError):
            t.install(self.source, self.target)
        with self.assertRaises(ValueError):
            t.install(self.source, self.target)

    def test_directory_lock_exclusion(self):
        fd = os.open(self.target, os.O_RDONLY | os.O_DIRECTORY)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):
                t.install(self.source, self.target)
        finally:
            os.close(fd)

    def test_zip_compression_matrix(self):
        for compression in (zipfile.ZIP_DEFLATED, zipfile.ZIP_STORED,
                            zipfile.ZIP_BZIP2, zipfile.ZIP_LZMA):
            archive = self.root/'sample.zip'; target = self.root/'rclone'
            with zipfile.ZipFile(archive, 'w', compression=compression) as bundle:
                bundle.writestr(b.MEMBER, b'hello')
            with patch.object(b, 'ARCHIVE_HASH', b.sha(archive)):
                if compression == zipfile.ZIP_DEFLATED:
                    b.extract(archive, target)
                    self.assertEqual(target.read_bytes(), b'hello'); target.unlink()
                else:
                    with self.assertRaises(ValueError):
                        b.extract(archive, target)
                    self.assertFalse(target.exists())

    def test_zip_hash_size_duplicate_and_no_clobber(self):
        archive = self.root/'sample.zip'; target = self.root/'rclone'
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as bundle:
            bundle.writestr(b.MEMBER, b'hello')
        with self.assertRaises(ValueError):
            b.extract(archive, target)
        with patch.object(b, 'ARCHIVE_HASH', b.sha(archive)), patch.object(b, 'LIMIT', 1):
            with self.assertRaises(ValueError):
                b.extract(archive, target)
        target.write_bytes(b'keep')
        with patch.object(b, 'ARCHIVE_HASH', b.sha(archive)), self.assertRaises(FileExistsError):
            b.extract(archive, target)
        self.assertEqual(target.read_bytes(), b'keep')


class Publisher(unittest.TestCase):
    def test_loaded_image_checks_config_and_layer_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = [Path(directory)/name for name in ('a.tar','b.tar')]
            def write(path, layer):
                with tarfile.open(path, 'w') as archive:
                    for name, raw in [('manifest.json',json.dumps([{'Config':'config.json',
                        'Layers':['layer.tar'],'RepoTags':['diis-reviewed-backup:latest']}]).encode()),
                        ('config.json',b'{}'),('layer.tar',layer)]:
                        member=tarfile.TarInfo(name); member.size=len(raw)
                        archive.addfile(member,io.BytesIO(raw))
            for path in paths:
                write(path,b'original')
            self.assertEqual(loaded.image_identity(paths[0]),loaded.image_identity(paths[1]))
            write(paths[1],b'changed')
            self.assertNotEqual(loaded.image_identity(paths[0]),loaded.image_identity(paths[1]))

    def test_artifact_binding_drift_expiry_and_residuals(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config_bytes = json.dumps({'os':'linux', 'architecture':'amd64',
                'config':{'Labels':{'org.opencontainers.image.revision':'a'*40}}}).encode()
            image = 'sha256:'+hashlib.sha256(config_bytes).hexdigest()
            source = 'a'*40
            fixtures = {
                'image.json': [{'Id':image, 'Os':'linux', 'Architecture':'amd64',
                    'Config':{'Labels':{'org.opencontainers.image.revision':source}}}],
                'sbom.json': {'source':{'target':{'imageID':image}}, 'artifacts':[{'name':'synthetic'}]},
                'grype.json': {'source':{'target':{'imageID':image}},
                    'descriptor':{'name':'grype','version':'0.118.0'},
                    'matches':[{'vulnerability':{'id':'CVE-synthetic','severity':'High'}}]},
                'grype-db.json': {'valid':True},
                'scanner.json': {k:'a'*64 for k in ('grypeExecutableSha256','syftExecutableSha256','dbSha256')},
                'smoke.json': {'schema':'diis-image-smoke-v1','imageId':image,'status':'pass','network':'none'},
            }
            for name, value in fixtures.items():
                (root/name).write_text(json.dumps(value))
            with tarfile.open(root/'image.tar', 'w') as archive:
                for name, data in [('manifest.json', b'[{"Config":"config.json"}]'),
                                   ('config.json', config_bytes)]:
                    member = tarfile.TarInfo(name); member.size = len(data)
                    archive.addfile(member, io.BytesIO(data))
            p.bind(root, source, '12')
            now = int(time.time())
            approval = dict(schema='diis-backup-publication-v1', sourceSha=source, buildRunId='12',
                            bindingSha256=p.sha(root/'binding.json'), notBefore=now-1,
                            expires=now+600, riskDecisionSha256='c'*64,
                            package=p.PACKAGE, visibility='private')
            self.assertEqual(p.verify(root, source, '12', approval, now)['imageId'], image)
            for key, value in [('riskDecisionSha256', '0'*64), ('expires', now),
                               ('visibility', 'public'), ('buildRunId','13')]:
                with self.subTest(key=key), self.assertRaises(ValueError):
                    p.verify(root, source, '12', {**approval,key:value}, now)
            (root/'image.tar').write_bytes(b'changed')
            with self.assertRaises(ValueError):
                p.verify(root, source, '12', approval, now)

    def test_metadata_rejects_unknown_private_linkage_and_gate(self):
        run = dict(id=1, head_sha='a'*40, head_branch='develop', event='workflow_dispatch',
                   path='.github/workflows/backup-image.yml', conclusion='success',
                   repository={'full_name':'smk-darussalam-subah/smart-ai-school'})
        gate = dict(can_admins_bypass=False,
                    protection_rules=[dict(type='required_reviewers', reviewers=[{'id':1}])])
        package = dict(name='diis-pg-backup', visibility='private', package_type='container',
                       repository={'full_name':'smk-darussalam-subah/smart-ai-school'})
        meta.verify(run, gate, package, 'a'*40, '1')
        for field, value in [('visibility', 'public'), ('repository', {}), ('name', 'wrong')]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                meta.verify(run, gate, {**package, field:value}, 'a'*40, '1')
        with self.assertRaises(ValueError):
            meta.verify(run, {**gate, 'can_admins_bypass':True}, package, 'a'*40, '1')
        with self.assertRaises(ValueError):
            meta.verify({**run, 'event':'pull_request'}, gate, package, 'a'*40, '1')

    def test_registry_receipt_rejects_empty_wrong_ambiguous_and_mismatch(self):
        config = 'sha256:'+'a'*64
        binding = {'package': published.PACKAGE, 'imageId': config,
                   'sourceSha':'b'*40, 'buildRunId':'12'}
        root_manifest = json.dumps({'schemaVersion':2, 'config':{'digest':config},
            'layers':[{'digest':'sha256:'+'c'*64,'size':12}]},
            sort_keys=True, separators=(',',':')).encode()
        root_ref = published.PACKAGE+'@sha256:'+hashlib.sha256(root_manifest).hexdigest()
        image = [{'Id':config,'Os':'linux','Architecture':'amd64','RepoDigests':[root_ref],
                  'Config':{'Labels':{'org.opencontainers.image.revision':'b'*40}}}]
        self.assertEqual(published.select(binding,[root_ref]),root_ref)
        receipt = published.verify(binding,'e'*64,root_ref,root_manifest,
                                   root_ref,root_manifest,image)
        self.assertEqual(receipt['configDigest'],config)
        for digests in ([], ['other.example/x@sha256:'+'d'*64], [root_ref,root_ref]):
            with self.subTest(digests=digests), self.assertRaises(ValueError):
                published.select(binding,digests)
        with self.assertRaises(ValueError):
            published.verify(binding,'e'*64,root_ref,root_manifest+b' ',
                             root_ref,root_manifest,image)
        wrong = json.dumps({'schemaVersion':2,'config':{'digest':'sha256:'+'d'*64},
            'layers':[{'digest':'sha256:'+'c'*64,'size':12}]},
            sort_keys=True,separators=(',',':')).encode()
        wrong_ref = published.PACKAGE+'@sha256:'+hashlib.sha256(wrong).hexdigest()
        with self.assertRaises(ValueError):
            published.verify(binding,'e'*64,wrong_ref,wrong,wrong_ref,wrong,image)

    def test_registry_index_resolves_exact_linux_amd64_manifest(self):
        binding = {'package': published.PACKAGE, 'imageId':'sha256:'+'a'*64,
                   'sourceSha':'b'*40, 'buildRunId':'12'}
        platform = json.dumps({'schemaVersion':2,
            'config':{'digest':binding['imageId']},
            'layers':[{'digest':'sha256:'+'c'*64,'size':12}]},
            sort_keys=True,separators=(',',':')).encode()
        platform_digest = 'sha256:'+hashlib.sha256(platform).hexdigest()
        index = json.dumps({'schemaVersion':2,'manifests':[{
            'digest':platform_digest,'platform':{'architecture':'amd64','os':'linux'}}]},
            sort_keys=True,separators=(',',':')).encode()
        root_ref = published.PACKAGE+'@sha256:'+hashlib.sha256(index).hexdigest()
        platform_ref = published.PACKAGE+'@'+platform_digest
        self.assertEqual(published.resolve(binding,root_ref,index),platform_ref)
        image = [{'Id':binding['imageId'],'Os':'linux','Architecture':'amd64',
                  'RepoDigests':[platform_ref],
                  'Config':{'Labels':{'org.opencontainers.image.revision':'b'*40}}}]
        receipt = published.verify(binding,'e'*64,root_ref,index,
                                   platform_ref,platform,image)
        self.assertEqual(receipt['rootDigest'],root_ref.rsplit('@',1)[1])
        duplicate = json.loads(index)
        duplicate['manifests'].append(duplicate['manifests'][0])
        duplicate_raw = json.dumps(duplicate,sort_keys=True,separators=(',',':')).encode()
        duplicate_ref = published.PACKAGE+'@sha256:'+hashlib.sha256(duplicate_raw).hexdigest()
        with self.assertRaises(ValueError):
            published.resolve(binding,duplicate_ref,duplicate_raw)

    def test_publication_workflow_requires_registry_roundtrip_receipt(self):
        workflow = (ROOT/'.github/workflows/backup-image.yml').read_text()
        for required in ('repo-digests.json', 'imagetools inspect --raw',
                         'docker pull --platform linux/amd64', '--registry-roundtrip',
                         'verify-published-backup-image.py verify',
                         'REGISTRY_PUBLICATION_AMBIGUOUS retry=prohibited',
                         'diis-backup-publication-receipt', 'if-no-files-found: error'):
            self.assertIn(required, workflow)
        self.assertNotIn("docker image inspect --format '{{json .RepoDigests}}' \"$tag\"\n",
                         workflow)
        uses = re.findall(r'^\s*- uses: ([^\s]+)$', workflow, re.MULTILINE)
        self.assertEqual(len(uses), 5)
        self.assertTrue(all(re.fullmatch(r'[^@]+@[a-f0-9]{40}', item) for item in uses))
        self.assertIn('on:\n  workflow_dispatch:', workflow)
        self.assertNotIn('\n  push:', workflow)

    def test_approval_invalid_before_artifact_read(self):
        with self.assertRaises(ValueError):
            p.verify(Path('/nonexistent'), 'a'*40, '1', {}, int(time.time()))
        with self.assertRaises(ValueError):
            json.loads('{"sourceSha":1,"sourceSha":2}', object_pairs_hook=p.pairs)


class Handoff(unittest.TestCase):
    def test_report_evidence_manifest_validator_binds_discovered_test_count(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'docs/audits').mkdir(parents=True, mode=0o700)
            (root/'infrastructure/deploy').mkdir(parents=True, mode=0o700)
            contract = root/handoff.CONTRACT_RELATIVE
            contract.parent.mkdir(parents=True, exist_ok=True)
            methods = ''.join(
                f'    def test_case_{index}(self):\n        pass\n'
                for index in range(43))
            contract.write_text('import unittest\n\nclass Contract(unittest.TestCase):\n'
                                + methods, encoding='utf-8')
            for relative in handoff.FOLLOWUP_MANIFEST:
                path = root/relative
                path.parent.mkdir(parents=True, exist_ok=True)
                if not path.exists():
                    path.write_bytes(('current:' + relative.as_posix()).encode())

            legacy_report = root/handoff.LEGACY_REPORT_RELATIVE
            legacy_report.write_text('historical report\n', encoding='utf-8')
            legacy_sources = {
                handoff.SELF_RELATIVE: b'legacy-validator',
                handoff.CONTRACT_RELATIVE: b'legacy-contract',
                Path('infrastructure/docker/tests/backup-contract.sh'): b'legacy-backup',
            }
            legacy_payload = {
                'schema': handoff.LEGACY_SCHEMA,
                'sourceManifestCount': len(legacy_sources),
                'sourceManifest': [
                    {'path': path.as_posix(), 'sha256': hashlib.sha256(raw).hexdigest()}
                    for path, raw in legacy_sources.items()
                ],
            }
            legacy_evidence = root/handoff.LEGACY_EVIDENCE_RELATIVE
            legacy_evidence.write_text(json.dumps(legacy_payload), encoding='utf-8')

            report = root/handoff.REPORT_RELATIVE
            report.write_text('| Source closure contract | 43/43 synthetic |\n', encoding='utf-8')
            evidence = root/handoff.EVIDENCE_RELATIVE
            manifest = {
                relative: hashlib.sha256((root/relative).read_bytes()).hexdigest()
                for relative in handoff.FOLLOWUP_MANIFEST
            }
            payload = {
                'schema': handoff.SCHEMA,
                'baseline': {
                    'developSha': handoff.EXPECTED_BASE_SHA,
                    'developTree': handoff.EXPECTED_BASE_TREE,
                },
                'supersedes': {
                    'evidencePath': handoff.LEGACY_EVIDENCE_RELATIVE.as_posix(),
                    'evidenceSha256': hashlib.sha256(legacy_evidence.read_bytes()).hexdigest(),
                    'reportPath': handoff.LEGACY_REPORT_RELATIVE.as_posix(),
                    'reportSha256': hashlib.sha256(legacy_report.read_bytes()).hexdigest(),
                    'sourceManifestSha256': handoff.manifest_hash({
                        path: hashlib.sha256(raw).hexdigest()
                        for path, raw in legacy_sources.items()
                    }),
                },
                'reportSha256': hashlib.sha256(report.read_bytes()).hexdigest(),
                'sourceManifestCount': len(manifest),
                'sourceManifest': [
                    {'path': path.as_posix(), 'sha256': digest}
                    for path, digest in manifest.items()
                ],
                'sourceManifestSha256': handoff.manifest_hash(manifest),
                'authorizedRebindings': [path.as_posix() for path in legacy_sources],
                'tests': {'sourceClosure': 43},
                'holds': ['all-operational-mutations'],
            }
            evidence.write_text(json.dumps(payload), encoding='utf-8')
            self.assertEqual(handoff.validate(root), {
                'sourceClosure': 43,
                'sourceManifest': len(handoff.FOLLOWUP_MANIFEST),
                'authorizedRebindings': 3,
            })

            bound = root/Path('infrastructure/n8n/README.md')
            original_bound = bound.read_bytes()
            bound.write_bytes(original_bound + b' tampered')
            with self.assertRaisesRegex(handoff.ValidationError,
                                        'source-manifest-hash-mismatch'):
                handoff.validate(root)
            bound.write_bytes(original_bound)

            evidence.unlink()
            with self.assertRaisesRegex(handoff.ValidationError, 'unreadable-input'):
                handoff.validate(root)
            evidence.write_text(json.dumps(payload), encoding='utf-8')

            payload['baseline']['developSha'] = 'f'*40
            evidence.write_text(json.dumps(payload), encoding='utf-8')
            with self.assertRaisesRegex(handoff.ValidationError, 'baseline-binding-invalid'):
                handoff.validate(root)
            payload['baseline']['developSha'] = handoff.EXPECTED_BASE_SHA
            evidence.write_text(json.dumps(payload), encoding='utf-8')

            original_legacy = legacy_evidence.read_bytes()
            legacy_evidence.write_bytes(original_legacy + b' ')
            with self.assertRaisesRegex(handoff.ValidationError,
                                        'superseded-evidence-hash-mismatch'):
                handoff.validate(root)
            legacy_evidence.write_bytes(original_legacy)

            payload['tests']['sourceClosure'] = 42
            evidence.write_text(json.dumps(payload), encoding='utf-8')
            with self.assertRaisesRegex(handoff.ValidationError,
                                        'report-evidence-source-count-mismatch'):
                handoff.validate(root)


if __name__ == '__main__':
    unittest.main(verbosity=2)
