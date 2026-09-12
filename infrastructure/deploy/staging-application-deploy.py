#!/usr/bin/env python3
"""Standard application transaction, transported with the exact reviewed core.

The separate recovery-only entrypoint remains unchanged. No image build/pull,
migration, provisioning, ingress or scheduler operation exists in this executor.
"""
import copy
import ctypes
import errno
import fcntl
import hashlib
import os
from pathlib import Path
import pwd
import re
import select
import signal
import stat
import sys
import time

import diis_staging_core as core

APPROVAL = core.STATE / 'staging-application-approval.json'
WRITER_LOCK = Path('/var/lock/diis-backup/backup.lock')
WRITER_LOCK_PARENT = Path('/var/lock/diis-backup')
WRITER_LOCK_CANONICAL_PARENT = Path('/run/lock/diis-backup')
IMAGE = re.compile(r'ghcr\.io/smk-darussalam-subah/diis-(api|web)@sha256:[a-f0-9]{64}')
PERSISTENT_WRITER_LIBRARY_SHA256 = \
    'bf881caf29af389e1d0d328e9b5816d570154b72b873ea82aac6d1be418e8e5a'
PERSISTENT_WRITER_WRAPPER_SHA256 = \
    '70cf649cc5845827aa4d66c3d4148bb6f6f718b169a93074ad4abd7da803718f'
LEGACY_WRITER_SHA256 = \
    'bc530d0a9110319684e7e4b60db56a3da1e1d979d9b1b6d8dc7887c209ff204e'
PERSISTENT_WRITER_ARTIFACT_SHA256 = hashlib.sha256(
    (PERSISTENT_WRITER_LIBRARY_SHA256 + '  backup-lib.sh\n'
     + PERSISTENT_WRITER_WRAPPER_SHA256 + '  legacy-backup-compatibility.sh\n').encode()
).hexdigest()
require = core.require


def validate(value, sha, now):
    require(type(value) is dict and set(value) == {
        'schema', 'baseline', 'baselineReceipt', 'targetApps', 'targetModelSha256',
        'writerEvidenceSha256'},
        'application-approval-schema')
    require(value['schema'] == 'diis-staging-application-approval-v2', 'application-version')
    baseline = core.validate(value['baseline'], sha, now)
    for key in ('targetModelSha256', 'writerEvidenceSha256'):
        require(type(value[key]) is str and core.HASH.fullmatch(value[key]) is not None
                and value[key] != '0' * 64, 'application-hash')
    receipt = value['baselineReceipt']
    require(type(receipt) is dict and set(receipt) == {
        'schema', 'sourceSha', 'modelSha256', 'configHashes', 'imageReferences'},
        'baseline-receipt-schema')
    require(receipt['schema'] == 'diis-staging-application-receipt-v1'
            and receipt['sourceSha'] == baseline['baseSha']
            and receipt['modelSha256'] == baseline['modelSha256'], 'baseline-receipt-binding')
    require(type(receipt['configHashes']) is dict
            and set(receipt['configHashes']) == set(core.APP_NAMES), 'baseline-config-schema')
    for item in receipt['configHashes'].values():
        require(type(item) is str and core.HASH.fullmatch(item) is not None
                and item != '0' * 64, 'baseline-config-hash')
    require(type(receipt['imageReferences']) is dict
            and set(receipt['imageReferences']) == set(core.APP_NAMES),
            'baseline-image-reference-schema')
    for service, item in receipt['imageReferences'].items():
        require(type(item) is str and (re.fullmatch(r'sha256:[a-f0-9]{64}', item) is not None
                or re.fullmatch(r'ghcr\.io/smk-darussalam-subah/diis-' + service
                                + r'@sha256:[a-f0-9]{64}', item) is not None),
                'baseline-image-reference')
    require(type(value['targetApps']) is dict and set(value['targetApps']) == {'api', 'web'},
            'application-targets')
    for service, target in value['targetApps'].items():
        require(type(target) is dict and set(target) == {'reference', 'id', 'revision', 'buildConfigSha256'},
                'application-target-schema')
        require(type(target['reference']) is str and IMAGE.fullmatch(target['reference'])
                is not None and target['reference'].startswith(
                    'ghcr.io/smk-darussalam-subah/diis-' + service + '@sha256:'),
                'application-image-reference')
        require(type(target['id']) is str and re.fullmatch(r'sha256:[a-f0-9]{64}', target['id'])
                is not None and target['revision'] == baseline['sourceSha'], 'application-image-binding')
        require(type(target['buildConfigSha256']) is str
                and core.HASH.fullmatch(target['buildConfigSha256']) is not None
                and target['buildConfigSha256'] != '0' * 64, 'application-build-config-hash')
    return value


def validate_writer_evidence(value, packet, library_sha256):
    require(type(value) is dict and set(value) == {
            'schema', 'expires', 'sourceSha', 'rootCronSha256', 'n8nSha256',
            'preservationSha256', 'writerInventorySha256', 'backupLibrarySha256',
            'allWritersUseCanonicalLock',
            'allWritersRejectPersistentApplicationQuarantine'}
            and value['schema'] == 'diis-writer-attestation-v2'
            and value['expires'] == packet['expires']
            and value['sourceSha'] == packet['sourceSha']
            and value['backupLibrarySha256'] == PERSISTENT_WRITER_LIBRARY_SHA256
            and library_sha256 == PERSISTENT_WRITER_LIBRARY_SHA256
            and value['allWritersUseCanonicalLock'] is True
            and value['allWritersRejectPersistentApplicationQuarantine'] is True,
            'writer-attestation')
    for key in ('rootCronSha256', 'n8nSha256', 'preservationSha256',
                'writerInventorySha256', 'backupLibrarySha256'):
        require(type(value[key]) is str and core.HASH.fullmatch(value[key]) is not None
                and value[key] != '0' * 64, 'writer-attestation-binding')


class Host(core.Host):
    def __init__(self, packet):
        super().__init__(packet['baseline'])
        self.packet = packet

    def application_delta(self):
        # This is the application path; schema/migrations still need another gate.
        require(not self.git('diff', '--name-only', self.p['baseSha'], self.p['sourceSha'],
                             '--', 'packages/database/prisma'), 'schema-migration-delta')

    def compatible_writer(self):
        # Fixed, private content-addressed artifact; never dirty the old checkout.
        parent = core.STATE / 'writer-compatibility'
        meta = parent.lstat()
        require(parent.resolve(strict=True) == parent and stat.S_ISDIR(meta.st_mode)
                and meta.st_uid == os.geteuid() and stat.S_IMODE(meta.st_mode) == 0o700,
                'writer-artifact-parent')
        artifact = parent / PERSISTENT_WRITER_ARTIFACT_SHA256
        library = artifact / 'backup-lib.sh'
        wrapper = artifact / 'legacy-backup-compatibility.sh'
        legacy = parent / 'legacy' / LEGACY_WRITER_SHA256 / 'legacy-backup.sh'
        library_raw = core.private_read(library, 65536)
        wrapper_raw = core.private_read(wrapper, 65536)
        legacy_raw = core.private_read(legacy, 65536)
        expected_library = self.git(
            'show', self.p['sourceSha'] + ':infrastructure/docker/scripts/backup-lib.sh')
        expected_wrapper = self.git(
            'show', self.p['sourceSha'] + ':infrastructure/deploy/legacy-backup-compatibility.sh')
        require(core.digest(library_raw) == PERSISTENT_WRITER_LIBRARY_SHA256
                and library_raw == expected_library
                and core.digest(wrapper_raw) == PERSISTENT_WRITER_WRAPPER_SHA256
                and wrapper_raw == expected_wrapper
                and core.digest(legacy_raw) == LEGACY_WRITER_SHA256,
                'writer-artifact-authority')
        mounts = core.decode(core.run(['docker', 'inspect', '--format', '{{json .Mounts}}', 'smk-pg-backup']))
        required_mounts = {
            '/backup.sh': str(wrapper),
            '/backup-lib.sh': str(library),
            '/legacy-backup.sh': str(legacy),
        }
        matches = {m.get('Destination'): m for m in mounts
                   if m.get('Destination') in required_mounts}
        require(set(matches) == set(required_mounts)
                and all(matches[destination].get('Type') == 'bind'
                        and matches[destination].get('Source') == source
                        and matches[destination].get('RW') is False
                        for destination, source in required_mounts.items()),
                'writer-artifact-mount')
        output = core.run(['docker', 'exec', 'smk-pg-backup', 'sha256sum',
                           '/backup.sh', '/backup-lib.sh', '/legacy-backup.sh']).decode().splitlines()
        hashes = {}
        for line in output:
            parts = line.split()
            require(len(parts) == 2 and parts[1] not in hashes, 'writer-runtime-hash-output')
            hashes[parts[1]] = parts[0]
        require(hashes == {
                    '/backup.sh': PERSISTENT_WRITER_WRAPPER_SHA256,
                    '/backup-lib.sh': PERSISTENT_WRITER_LIBRARY_SHA256,
                    '/legacy-backup.sh': LEGACY_WRITER_SHA256,
                },
                'writer-library-runtime-drift')
        return core.digest(library_raw)

    def build_configuration(self, service):
        if service == 'api':
            return {}
        values = re.findall(rb'^NEXT_PUBLIC_VAPID_PUBLIC_KEY=([A-Za-z0-9_-]{87})\r?$',
                            self.environment(), re.M)
        require(len(values) == 1, 'staging-public-build-key')
        return {'API_URL': 'http://smk-staging-api:3001',
                'NEXT_PUBLIC_VAPID_PUBLIC_KEY': values[0].decode('ascii')}

    def preflight(self):
        super().preflight()
        evidence = core.private_read(core.STATE / 'staging-writer-evidence.json')
        require(core.digest(evidence) == self.packet['writerEvidenceSha256'], 'writer-evidence-hash')
        value = core.decode(evidence)
        library_sha256 = self.compatible_writer()
        validate_writer_evidence(value, self.p, library_sha256)
        # The new build inputs are included as well as those enforced by the core.
        require(not self.git('diff', '--name-only', self.p['imageRevision'], self.p['sourceSha'],
                '--', 'scripts/build-backup-tools.py', 'scripts/install-baked-backup-tools.py'),
                'backup-tool-source-drift')
        for service, target in self.packet['targetApps'].items():
            image = core.decode(core.run(['docker', 'image', 'inspect', '--format',
                '{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}},'
                '"digests":{{json .RepoDigests}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}},'
                '"buildConfig":{{json (index .Config.Labels "org.diis.build-config-sha256")}}}',
                target['reference']]))
            require(image['id'] == target['id'] and image['os'] == 'linux'
                    and image['arch'] == 'amd64' and target['reference'] in image['digests']
                    and image['revision'] == self.p['sourceSha']
                    and image['buildConfig'] == target['buildConfigSha256']
                    == core.digest(core.canonical(self.build_configuration(service))),
                    'application-image-unavailable')

    def verify_compose_baseline(self):
        # Application releases use the prior validated receipt, not mutable tracked image refs.
        receipt = self.packet['baselineReceipt']
        self.model()
        for service, name in core.APP_NAMES.items():
            observed = core.run(['docker', 'inspect', '--format',
                '{{index .Config.Labels "com.docker.compose.config-hash"}}', name]).decode().strip()
            require(observed == receipt['configHashes'][service], 'compose-live-baseline-drift')

    def model(self):
        receipt = self.packet['baselineReceipt']
        return super().model(receipt['imageReferences'], receipt['modelSha256'])

    def target_model(self, baseline):
        model = copy.deepcopy(baseline)
        for service, target in self.packet['targetApps'].items():
            model['services'][service]['image'] = target['reference']
        require(core.digest(core.canonical(model)) == self.packet['targetModelSha256'],
                'target-model-binding')
        return model

    def verify_target(self):
        for service, name in core.APP_NAMES.items():
            observed = self.observation(name)
            require(observed['image'] == self.packet['targetApps'][service]['id']
                    and not observed['mounts'], 'target-runtime')
            networks = {'smk-staging-net'} if service == 'web' else {'smk-staging-net', 'smk-network'}
            require(set(observed['networks']) == networks, 'target-networks')
            # Compose itself supplies the config hash used to verify the running model.
        self.health()

    def config_hashes(self, path):
        hashes = {}
        for service, name in core.APP_NAMES.items():
            expected = core.run(['docker', 'compose', '-p', 'smk-staging', '-f', str(path),
                                 '--env-file', '/dev/null', 'config', '--hash', service],
                                cwd=core.ROOT).split()
            require(len(expected) == 2 and expected[0] == service.encode()
                    and core.HASH.fullmatch(expected[1].decode()) is not None,
                    'model-config-hash')
            hashes[service] = expected[1].decode()
        return hashes

    def verify_model(self, path, expected_hashes):
        require(self.config_hashes(path) == expected_hashes, 'model-config-binding')
        for service, name in core.APP_NAMES.items():
            observed = core.run(['docker', 'inspect', '--format',
                '{{index .Config.Labels "com.docker.compose.config-hash"}}', name]).strip()
            require(expected_hashes[service].encode() == observed, 'target-config-hash')


def transaction(host, directory):
    core.producers_absent()
    host.preflight()
    baseline = host.model()
    expected_configs = host.app_configs()
    target = host.target_model(baseline)
    paths = {name: directory / name for name in ('baseline.json', 'target.json', 'environment.snapshot')}
    blobs = {'baseline.json': core.compose_bytes(baseline), 'target.json': core.compose_bytes(target),
             'environment.snapshot': host.environment()}
    for name in paths:
        core.write_exclusive(paths[name], blobs[name])
    baseline_hashes = host.config_hashes(paths['baseline.json'])
    require(baseline_hashes == host.packet['baselineReceipt']['configHashes'],
            'baseline-model-receipt-drift')
    target_hashes = host.config_hashes(paths['target.json'])
    target_receipt = core.canonical({
        'schema': 'diis-staging-application-receipt-v1',
        'sourceSha': host.p['sourceSha'],
        'modelSha256': host.packet['targetModelSha256'],
        'configHashes': target_hashes,
        'imageReferences': {service: target['reference']
                            for service, target in host.packet['targetApps'].items()}})
    core.write_exclusive(directory / 'attempt.json', core.canonical({
        'sourceSha': host.p['sourceSha'], 'baseSha': host.p['baseSha'],
        'runId': host.run_id, 'status': 'owned-before-mutation', 'retry': 'prohibited'}))
    host.preflight()
    require(time.time() + 600 < host.p['expires'], 'application-window')
    try:
        host.git('merge', '--ff-only', host.p['sourceSha'])
        host.source_result()
        host.invariant()
        # New Compose source may not silently change app config, ports or networks.
        require(core.compose_bytes(host.model()) == blobs['baseline.json'], 'source-model-delta')
        for name in paths:
            require(core.private_read(paths[name]) == blobs[name], 'snapshot-drift')
        host.apply(paths['target.json'])
        core.wait_for_health(host)
        host.verify_target()
        host.verify_model(paths['target.json'], target_hashes)
        host.invariant()
        host.source_result()
    except BaseException as failure:
        if isinstance(failure, core.ProducerAmbiguous):
            raise
        core.producers_absent()
        # Signals cannot interrupt rollback; the original cancellation remains a failure.
        previous = signal.pthread_sigmask(signal.SIG_BLOCK, core.HANDLED_SIGNALS)
        old_deadline = core.COMMAND_DEADLINE
        core.DEFER_CANCELLATION = True
        core.COMMAND_DEADLINE = time.time() + 300
        rollback_failure = None
        try:
            for name in paths:
                require(core.private_read(paths[name]) == blobs[name], 'rollback-snapshot-drift')
            host.invariant()
            host.apply(paths['baseline.json'])
            core.wait_for_health(host)
            host.verify_apps(expected_configs)
            host.verify_model(paths['baseline.json'], baseline_hashes)
            host.invariant()
            require(not host.git('status', '--porcelain=v1', '--untracked-files=all'),
                    'rollback-source-drift')
            current = host.git('rev-parse', 'HEAD').decode().strip()
            require(current in (host.p['baseSha'], host.p['sourceSha']), 'rollback-head-drift')
            host.git('reset', '--keep', host.p['baseSha'])
            require(host.git('rev-parse', 'HEAD').decode().strip() == host.p['baseSha'],
                    'rollback-source-result')
        except BaseException as exc:
            rollback_failure = exc
        finally:
            core.COMMAND_DEADLINE = old_deadline
            try:
                signal.pthread_sigmask(signal.SIG_SETMASK, previous)
            except BaseException as exc:
                rollback_failure = rollback_failure or exc
            core.DEFER_CANCELLATION = False
        if rollback_failure is not None:
            raise core.ProducerAmbiguous('application-rollback-ambiguous-retained-no-retry') from None
        # Retain the journal and private baseline for independent rollback review.
        reason = ('application-cancelled-rollback-verified-retained-no-retry'
                  if core.DEFERRED_SIGNALS or str(failure) == 'interrupted'
                  else 'application-failed-rollback-verified-retained-no-retry')
        raise core.Stop(reason) from None
    core.producers_absent()
    # Keep receipt/journal as audit evidence; remove secret snapshots only after success.
    pending_receipt = directory / 'result.pending.json'
    final_receipt = directory / 'result.json'
    core.write_exclusive(pending_receipt, target_receipt)
    for name in paths:
        require(core.private_read(paths[name]) == blobs[name], 'cleanup-snapshot-drift')
        paths[name].unlink()
        require(not paths[name].exists(), 'cleanup-ambiguous')
    pending_receipt.rename(final_receipt)
    require(core.private_read(final_receipt) == target_receipt
            and not pending_receipt.exists(), 'receipt-commit-ambiguous')


def lock(path, owner):
    require(path.resolve(strict=True) == path, 'lock-path')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        meta = os.fstat(fd)
        require(stat.S_ISREG(meta.st_mode) and meta.st_uid == owner
                and meta.st_nlink == 1 and not stat.S_IMODE(meta.st_mode) & 0o022, 'lock-identity')
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        require(core.identity(path.stat()) == core.identity(meta), 'lock-replaced')
        return fd
    except BaseException:
        os.close(fd)
        raise


def _writer_identity():
    boot_id = Path('/proc/sys/kernel/random/boot_id').read_text(encoding='ascii').strip()
    process_stat = Path('/proc/self/stat').read_text(encoding='ascii').strip()
    fields = process_stat.rsplit(')', 1)
    trailing = fields[1].split() if len(fields) == 2 else []
    namespace = os.readlink('/proc/self/ns/pid')
    require(boot_id and len(trailing) >= 20 and trailing[19].isdigit() and namespace,
            'writer-lock-process-identity')
    return boot_id, str(os.getpid()), trailing[19], namespace


def _quarantine_namespace(actual_namespace):
    """Return a canonical non-runtime namespace that no shell writer may reclaim."""
    require(actual_namespace, 'writer-lock-guardian-namespace')
    return 'diis-application-quarantine:' + core.digest(actual_namespace.encode('ascii'))


def _validate_writer_parent(path):
    parent = path.parent
    require(path.is_absolute() and path.name == 'backup.lock', 'writer-lock-path')
    require(parent.is_dir() and not parent.is_symlink(), 'writer-lock-parent')
    meta = parent.stat()
    if path == WRITER_LOCK and parent == WRITER_LOCK_PARENT:
        require(parent.resolve(strict=True) == WRITER_LOCK_CANONICAL_PARENT,
                'writer-lock-parent-canonical')
        require(meta.st_uid == os.geteuid() and meta.st_gid == os.getegid()
                and stat.S_IMODE(meta.st_mode) == 0o750, 'writer-lock-parent-identity')
    else:
        # The non-canonical branch exists only for direct unit tests. Production
        # main binds the literal constant above and rejects every test selector.
        require(str(parent).startswith('/tmp/') and parent.resolve(strict=True) == parent
                and meta.st_uid == os.geteuid() and stat.S_IMODE(meta.st_mode) == 0o700,
                'writer-lock-test-parent')


def _application_lock_is_published(path, pid, start, namespace):
    try:
        owner = (path / 'owner').read_text(encoding='ascii').splitlines()
        marker = core.decode(core.private_read(path / 'application-owner.json'))
        quarantine_namespace = _quarantine_namespace(namespace)
        return (len(owner) == 5 and owner[1] == str(pid) and owner[2] == start
                and owner[4] == quarantine_namespace and marker['guardianPid'] == str(pid)
                and marker['guardianStart'] == start
                and marker['guardianPidNamespace'] == namespace
                and marker['ownerPidNamespace'] == quarantine_namespace)
    except BaseException:
        return False


def _cleanup_unpublished_lock(path):
    """Remove only the guardian's private, never-published staging directory."""
    try:
        if not path.exists() and not path.is_symlink():
            return True
        meta = path.stat(follow_symlinks=False)
        if (not stat.S_ISDIR(meta.st_mode) or path.is_symlink()
                or meta.st_uid != os.geteuid() or stat.S_IMODE(meta.st_mode) != 0o700):
            return False
        allowed = {'owner', 'application-owner.json', 'owner.tmp', 'application-owner.tmp'}
        entries = list(path.iterdir())
        if any(item.name not in allowed or item.is_symlink() for item in entries):
            return False
        for item in entries:
            item_meta = item.stat(follow_symlinks=False)
            if (not stat.S_ISREG(item_meta.st_mode) or item_meta.st_uid != os.geteuid()
                    or item_meta.st_nlink != 1):
                return False
        for item in entries:
            item.unlink()
        path.rmdir()
        return not path.exists()
    except BaseException:
        return False


def _start_writer_guardian(staged):
    """Start a detached live owner that survives an executor crash.

    The parent can release it by writing one byte. EOF means that the executor
    disappeared, so the guardian deliberately remains alive for reconciliation.
    """
    control_read, control_write = os.pipe()
    status_read, status_write = os.pipe()
    pid = os.fork()
    if pid == 0:
        try:
            os.close(control_write)
            os.close(status_read)
            os.setsid()
            for sig in core.HANDLED_SIGNALS:
                signal.signal(sig, signal.SIG_IGN)
            # A retained guardian must not keep an SSH/action stream, deploy lock,
            # or any other executor descriptor open after its parent exits.
            keep = {control_read, status_write}
            for item in os.listdir('/proc/self/fd'):
                fd = int(item)
                if fd not in keep:
                    try:
                        os.close(fd)
                    except OSError:
                        pass
            os.write(status_write, b'S')
            committed = False
            while True:
                command = os.read(control_read, 1)
                if command == b'P' and not committed:
                    try:
                        _rename_noreplace(staged, WRITER_LOCK)
                    except FileExistsError:
                        _cleanup_unpublished_lock(staged)
                        try:
                            os.write(status_write, b'B')
                        except BrokenPipeError:
                            pass
                        continue
                    except BaseException:
                        _cleanup_unpublished_lock(staged)
                        try:
                            os.write(status_write, b'E')
                        except BrokenPipeError:
                            pass
                        continue
                    committed = True
                    try:
                        _lock_publication_boundary(
                            'canonical-directory-published', os.getpid())
                        os.write(status_write, b'P')
                    except BaseException:
                        # Once rename commits, no hook/IPC failure may kill the live
                        # identity that keeps baseline stale recovery excluded.
                        while True:
                            signal.pause()
                    continue
                if command == b'R' and not committed:
                    require(_cleanup_unpublished_lock(staged),
                            'writer-lock-staging-cleanup')
                    os.write(status_write, b'R')
                    os._exit(0)
                if command == b'R' and committed:
                    retired = WRITER_LOCK.parent / (
                        '.backup.lock.retired.' + str(os.getpid()))
                    retired_committed = False
                    try:
                        require(not retired.exists() and not retired.is_symlink(),
                                'writer-lock-retired-exists')
                        _rename_noreplace(WRITER_LOCK, retired)
                        retired_committed = True
                        require(_cleanup_unpublished_lock(retired),
                                'writer-lock-retired-cleanup')
                        os.write(status_write, b'R')
                        os._exit(0)
                    except BaseException:
                        try:
                            os.write(status_write, b'E')
                        except BrokenPipeError:
                            pass
                        if not retired_committed:
                            while True:
                                signal.pause()
                        os._exit(126)
                if command == b'':
                    # Publication is an in-memory guardian state transition. Mutable
                    # marker visibility can never downgrade a committed quarantine.
                    if committed:
                        while True:
                            signal.pause()
                    os._exit(0 if _cleanup_unpublished_lock(staged) else 126)
                os.write(status_write, b'E')
                os._exit(127)
        except BaseException:
            os._exit(125)
    os.close(control_read)
    os.close(status_write)
    try:
        readable, _, _ = select.select([status_read], [], [], 5)
        require(readable and os.read(status_read, 1) == b'S', 'writer-lock-guardian-start')
        start = Path('/proc/' + str(pid) + '/stat').read_text(encoding='ascii').strip()
        fields = start.rsplit(')', 1)
        trailing = fields[1].split() if len(fields) == 2 else []
        namespace = os.readlink('/proc/' + str(pid) + '/ns/pid')
        require(len(trailing) >= 20 and trailing[19].isdigit() and namespace,
                'writer-lock-guardian-identity')
        return pid, trailing[19], namespace, control_write, status_read
    except BaseException:
        os.close(control_write)
        os.close(status_read)
        try:
            os.kill(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        except (ProcessLookupError, ChildProcessError):
            pass
        raise
def _rename_noreplace(source, target):
    """Atomically publish a complete directory without replacing a writer lock."""
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, 'renameat2', None)
    require(renameat2 is not None, 'writer-lock-atomic-publish-unavailable')
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int,
                          ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    result = renameat2(-100, os.fsencode(source), -100, os.fsencode(target), 1)
    if result == 0:
        return
    error = ctypes.get_errno()
    if error in (errno.EEXIST, errno.ENOTEMPTY):
        raise FileExistsError(error, os.strerror(error), str(target))
    raise OSError(error, os.strerror(error), str(target))


def _lock_publication_boundary(_name, _guardian_pid):
    """Inert production hook patched directly by isolated crash-boundary tests."""


def _guardian_command(held, command):
    fd = held.get('guardianControl')
    status_fd = held.get('guardianStatus')
    require(fd is not None and status_fd is not None, 'writer-lock-guardian-channel')
    os.write(fd, command)
    readable, _, _ = select.select([status_fd], [], [], 5)
    require(readable, 'writer-lock-guardian-timeout')
    observed = os.read(status_fd, 1)
    require(observed in (b'P', b'R', b'B', b'E'), 'writer-lock-guardian-command')
    return observed


def _stop_writer_guardian(held):
    fd = held.get('guardianControl')
    pid = held.get('guardianPid')
    if fd is None or pid is None:
        return
    require(_guardian_command(held, b'R') == b'R', 'writer-lock-guardian-release')
    os.close(fd)
    held['guardianControl'] = None
    os.close(held['guardianStatus'])
    held['guardianStatus'] = None
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        observed, status = os.waitpid(pid, os.WNOHANG)
        if observed == pid:
            require(os.waitstatus_to_exitcode(status) == 0, 'writer-lock-guardian-exit')
            held['guardianPid'] = None
            return
        time.sleep(.02)
    raise core.ProducerAmbiguous('writer-lock-guardian-stop-ambiguous-no-retry')


def retain_writer_lock(held):
    """Detach control without authorizing the crash-durable guardian to exit."""
    fd = held.get('guardianControl')
    if fd is not None:
        os.close(fd)
        held['guardianControl'] = None
    status_fd = held.get('guardianStatus')
    if status_fd is not None:
        os.close(status_fd)
        held['guardianStatus'] = None


def acquire_writer_lock(context):
    """Acquire a crash-durable application quarantine in the shared lock directory."""
    require(type(context) is dict and set(context) == {'sourceSha', 'approvalId', 'runId'}
            and core.SHA.fullmatch(context['sourceSha']) is not None
            and type(context['approvalId']) is str
            and re.fullmatch(r'[a-f0-9]{32}', context['approvalId']) is not None
            and context['approvalId'] != '0'*32
            and type(context['runId']) is str
            and re.fullmatch(r'[1-9][0-9]*', context['runId']) is not None,
            'writer-lock-context')
    _validate_writer_parent(WRITER_LOCK)
    staged = WRITER_LOCK.parent / ('.backup.lock.application.' + str(os.getpid()))
    require(staged != WRITER_LOCK and not staged.exists() and not staged.is_symlink(),
            'writer-lock-staging-exists')
    guardian = None
    publication_committed = False
    try:
        guardian_pid, guardian_start, guardian_namespace, guardian_control, guardian_status = \
            _start_writer_guardian(staged)
        guardian = {'guardianPid': guardian_pid, 'guardianControl': guardian_control,
                    'guardianStatus': guardian_status}
        _lock_publication_boundary('guardian-created', guardian_pid)
        staged.mkdir(mode=0o700)
        _lock_publication_boundary('directory-created', guardian_pid)
        created_meta = staged.stat()
        require(stat.S_ISDIR(created_meta.st_mode) and created_meta.st_uid == os.geteuid()
                and stat.S_IMODE(created_meta.st_mode) == 0o700, 'writer-lock-created-identity')
        boot_id, executor_pid, executor_start, executor_namespace = _writer_identity()
        stable_identity = (created_meta.st_dev, created_meta.st_ino, created_meta.st_mode,
                           created_meta.st_uid, created_meta.st_gid, created_meta.st_nlink)
        owner_namespace = _quarantine_namespace(guardian_namespace)
        token = core.digest(core.canonical((context, boot_id, guardian_pid, guardian_start,
                            guardian_namespace, owner_namespace, stable_identity)))
        owner_raw = ('\n'.join((boot_id, str(guardian_pid), guardian_start, token,
                                owner_namespace)) + '\n').encode('ascii')
        owner_tmp = staged / 'owner.tmp'
        owner = staged / 'owner'
        marker_tmp = staged / 'application-owner.tmp'
        marker = staged / 'application-owner.json'
        core.write_exclusive(owner_tmp, owner_raw)
        _lock_publication_boundary('owner-temporary-written', guardian_pid)
        os.replace(owner_tmp, owner)
        _lock_publication_boundary('owner-published-in-staging', guardian_pid)
        owner_meta = owner.stat(follow_symlinks=False)
        require(stat.S_ISREG(owner_meta.st_mode) and owner_meta.st_uid == os.geteuid()
                and stat.S_IMODE(owner_meta.st_mode) == 0o600 and owner_meta.st_nlink == 1,
                'writer-lock-owner-identity')
        raw = core.canonical({
            'schema': 'diis-staging-application-lock-v1',
            **context,
            'bootId': boot_id,
            'executorPid': executor_pid,
            'executorStart': executor_start,
            'executorPidNamespace': executor_namespace,
            'guardianPid': str(guardian_pid),
            'guardianStart': guardian_start,
            'guardianPidNamespace': guardian_namespace,
            'ownerPidNamespace': owner_namespace,
            'ownerTokenSha256': core.digest(token.encode('ascii')),
            'directoryIdentitySha256': core.digest(core.canonical(stable_identity)),
            'state': 'quarantined-until-verified-release',
            'retry': 'prohibited',
        })
        core.write_exclusive(marker_tmp, raw)
        _lock_publication_boundary('marker-temporary-written', guardian_pid)
        os.replace(marker_tmp, marker)
        _lock_publication_boundary('marker-published-in-staging', guardian_pid)
        marker_meta = marker.stat(follow_symlinks=False)
        require(stat.S_ISREG(marker_meta.st_mode) and marker_meta.st_uid == os.geteuid()
                and stat.S_IMODE(marker_meta.st_mode) == 0o600 and marker_meta.st_nlink == 1,
                'writer-lock-marker-identity')
        require(core.private_read(marker) == raw and core.private_read(owner) == owner_raw,
                'writer-lock-marker-drift')
        # The guardian owns the atomic commit and remembers it independently of
        # mutable filesystem evidence before acknowledging the executor.
        publication_status = _guardian_command(guardian, b'P')
        if publication_status == b'B':
            raise core.Stop('backup-writer-active-or-ambiguous')
        require(publication_status == b'P', 'writer-lock-atomic-publish-failed')
        publication_committed = True
        marker = WRITER_LOCK / 'application-owner.json'
        owner = WRITER_LOCK / 'owner'
        lock_meta = WRITER_LOCK.stat()
        marker_meta = marker.stat(follow_symlinks=False)
        owner_meta = owner.stat(follow_symlinks=False)
        require(_application_lock_is_published(
                WRITER_LOCK, guardian_pid, guardian_start, guardian_namespace)
                and core.private_read(marker) == raw and core.private_read(owner) == owner_raw,
                'writer-lock-published-drift')
        return {'path': WRITER_LOCK, 'markerRaw': raw, 'ownerRaw': owner_raw,
                'directoryIdentity': core.identity(lock_meta),
                'markerIdentity': core.identity(marker_meta),
                'ownerIdentity': core.identity(owner_meta), **guardian}
    except BaseException as exc:
        if publication_committed:
            retain_writer_lock(guardian)
            raise core.ProducerAmbiguous(
                'writer-lock-publication-ambiguous-retained-no-retry') from None
        cleaned = _cleanup_unpublished_lock(staged)
        try:
            if guardian is not None:
                _stop_writer_guardian(guardian)
        except BaseException:
            cleaned = False
        if not cleaned:
            raise core.ProducerAmbiguous(
                'writer-lock-staging-ambiguous-retained-no-retry') from None
        if isinstance(exc, core.Stop):
            raise
        raise core.Stop('writer-lock-publication-failed') from exc


def release_writer_lock(held):
    path = held['path']
    marker = path / 'application-owner.json'
    owner = path / 'owner'
    try:
        path_meta = path.stat(follow_symlinks=False)
        marker_meta = marker.stat(follow_symlinks=False)
        owner_meta = owner.stat(follow_symlinks=False)
        require(core.identity(path_meta) == held['directoryIdentity']
                and stat.S_ISDIR(path_meta.st_mode) and not path.is_symlink(),
                'writer-lock-directory-drift')
        require(core.identity(marker_meta) == held['markerIdentity']
                and stat.S_ISREG(marker_meta.st_mode) and not marker.is_symlink()
                and marker_meta.st_nlink == 1, 'writer-lock-marker-drift')
        require(core.identity(owner_meta) == held['ownerIdentity']
                and stat.S_ISREG(owner_meta.st_mode) and not owner.is_symlink()
                and owner_meta.st_nlink == 1, 'writer-lock-owner-drift')
        require(core.private_read(marker) == held['markerRaw']
                and core.private_read(owner) == held['ownerRaw'], 'writer-lock-marker-drift')
        # Guardian atomically retires the still-complete canonical directory. No
        # parent-side unlink can expose an ownerless path to a baseline writer.
        _stop_writer_guardian(held)
        require(not path.exists(), 'writer-lock-release-ambiguous')
    except BaseException:
        retain_writer_lock(held)
        raise core.ProducerAmbiguous('writer-lock-release-ambiguous-no-retry') from None


def main():
    held = []
    writer_lock = None
    directory = None
    status = 0
    reason = ''
    producer_ambiguous = False
    try:
        require(len(sys.argv) == 5, 'arguments')
        sha, approval_hash, run_id, attempt = sys.argv[1:]
        require(core.SHA.fullmatch(sha) is not None and core.HASH.fullmatch(approval_hash)
                is not None and re.fullmatch(r'[1-9][0-9]*', run_id) is not None
                and attempt == '1', 'argument-binding')
        require(pwd.getpwuid(os.geteuid()).pw_name == 'appuser', 'operator-account')
        require(not any(k.startswith(('DIIS_TEST_', 'ALLOW_TEST_'))
                        or k in ('DIIS_W10D_TEST_ROOT', 'HOST_LOCK') for k in os.environ),
                'test-controls-forbidden')
        core.DEFERRED_SIGNALS.clear()
        for sig in core.HANDLED_SIGNALS:
            signal.signal(sig, lambda number, _frame: core.DEFERRED_SIGNALS.add(number))
        raw = core.private_read(APPROVAL)
        require(core.digest(raw) == approval_hash, 'approval-byte-binding')
        packet = validate(core.decode(raw), sha, int(time.time()))
        host = Host(packet)
        host.run_id = run_id
        core.COMMAND_DEADLINE = min(time.time() + 600, host.p['expires'] - 300)
        host.preflight()
        held.append(lock(core.STATE / 'deploy.lock', os.geteuid()))
        writer_lock = acquire_writer_lock({'sourceSha': sha,
            'approvalId': host.p['approvalId'], 'runId': run_id})
        core.cancellation_point()
        require(core.private_read(APPROVAL) == raw, 'approval-drift')
        host.preflight()
        core.write_exclusive(core.STATE / ('staging-consumed-' + host.p['approvalId'] + '.json'),
                             core.canonical({'sourceSha': sha, 'runId': run_id, 'retry': 'prohibited'}))
        directory = core.STATE / ('staging-app-attempt-' + host.p['approvalId'])
        directory.mkdir(mode=0o700)
        transaction(host, directory)
        core.cancellation_point()
    except BaseException as exc:
        producer_ambiguous = isinstance(exc, core.ProducerAmbiguous)
        reason = str(exc) if isinstance(exc, core.Stop) else 'operation-failed'
        status = 74 if (directory is not None or core.OWNED_PRODUCERS
                        or isinstance(exc, core.ProducerAmbiguous)) else 65
    finally:
        core.COMMAND_DEADLINE = None
        if writer_lock is not None:
            if producer_ambiguous or core.OWNED_PRODUCERS:
                retain_writer_lock(writer_lock)
                if not reason:
                    reason = 'producer-ambiguous-writer-quarantined-no-retry'
                status = 74
            else:
                try:
                    release_writer_lock(writer_lock)
                except BaseException as exc:
                    reason = (str(exc) if isinstance(exc, core.Stop)
                              else 'writer-lock-release-ambiguous-no-retry')
                    status = 74
        for fd in reversed(held):
            os.close(fd)
    if status == 0 and core.DEFERRED_SIGNALS:
        reason = 'application-cancelled-writer-lock-released-no-retry'
        status = 74
    if status:
        print('APPLICATION_STAGING_STOP reason=' + reason + ' retry=prohibited', file=sys.stderr)
        return status
    print('APPLICATION_STAGING_COMPLETE source=' + sha)
    return 0


if __name__ == '__main__':
    sys.exit(main())
