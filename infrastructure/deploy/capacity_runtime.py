#!/usr/bin/env python3
"""Capacity cleanup transaction. Operator inputs are private, hash-bound files.

The disposable transport changes target identity, paths and budgets only. Selection,
authorization, locking, prune and postconditions are identical to the host path.
"""
import argparse
import importlib.util
import os
from pathlib import Path
import pwd
import re
import signal
import stat
import sys
import time

import capacity_policy as policy

HERE = Path(__file__).resolve().parent


def load(name, filename):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


core = load('diis_staging_core', 'staging-readiness-deploy.py')
app = load('diis_capacity_guardian', 'staging-application-deploy.py')
require = policy.require
PRODUCTION_SOCKET = 'unix:///var/run/docker.sock'
PRODUCTION_HOST_LOCK = Path('/home/appuser/.local/state/diis-deploy/deploy.lock')
DIND_IMAGE = 'sha256:392437eb2d6e54f9ae2be9c0aac2cbca95e3f5eb9854b0f0b1d664d473856633'
PROFILE_KEYS = {'schema', 'kind', 'endpoint', 'docker', 'dockerSha256', 'root', 'targetCheckout',
                'filesystemPath', 'preservationRoot', 'backupLibrary', 'containerId', 'labExpires'}
APPROVAL_KEYS = {'schema', 'operationId', 'runId', 'notBefore', 'expires', 'sourceSha',
                 'bundleSha256', 'profileSha256', 'candidateSha256', 'policySha256',
                 'mainSha', 'mainTree', 'identity', 'writerEvidenceSha256'}


def private_json(path):
    return policy.decode(core.private_read(Path(path), limit=16 * 1024 ** 2))


def file_hash(path):
    deadline = time.monotonic() + 30
    path = Path(path)
    meta = path.lstat()
    require(stat.S_ISREG(meta.st_mode) and not path.is_symlink() and meta.st_nlink == 1,
            'file-identity')
    require(meta.st_size <= 256 * 1024 ** 2, 'file-size')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        require(core.identity(before) == core.identity(meta), 'file-race')
        import hashlib
        value = hashlib.sha256()
        count = 0
        while True:
            require(time.monotonic() < deadline, 'file-read-timeout')
            chunk = os.read(fd, 1024 ** 2)
            if not chunk:
                break
            count += len(chunk)
            require(count <= 256 * 1024 ** 2, 'file-growth')
            value.update(chunk)
        require(core.identity(os.fstat(fd)) == core.identity(before)
                and core.identity(path.lstat()) == core.identity(before), 'file-drift')
        return value.hexdigest(), count
    finally:
        os.close(fd)


def preservation(root):
    """Content-set proof, not a recovery proof. Never emits filenames or content."""
    root = Path(root)
    require(root.is_absolute() and root.resolve(strict=True) == root and root.is_dir(), 'preservation-root')
    rows, total, directory_count = [], 0, 0
    deadline = time.monotonic() + 120
    before = root.stat()
    def inaccessible(error):
        raise policy.Rejected('preservation-directory-unreadable') from error
    for directory, dirs, files in os.walk(root, followlinks=False, onerror=inaccessible):
        require(time.monotonic() < deadline, 'preservation-timeout')
        directory_count += 1
        require(directory_count + len(rows) + len(dirs) + len(files) <= 20000, 'preservation-count')
        require(Path(directory).resolve(strict=True) == Path(directory), 'preservation-directory-drift')
        for name in dirs:
            child = Path(directory) / name
            require(child.is_dir() and not child.is_symlink(), 'preservation-symlink')
        for name in files:
            require(time.monotonic() < deadline, 'preservation-timeout')
            child = Path(directory) / name
            value, size = file_hash(child)
            total += size
            require(total <= 8 * policy.GIB, 'preservation-size')
            rows.append({'pathSha256': policy.digest(child.relative_to(root).as_posix().encode()),
                         'sha256': value, 'bytes': size})
        require(len(rows) <= 20000, 'preservation-count')
    require(core.identity(root.stat()) == core.identity(before), 'preservation-directory-drift')
    return {'count': len(rows), 'bytes': total,
            'contentSetSha256': policy.digest(sorted(rows, key=lambda row: row['pathSha256'])),
            'recoveryValidated': False}


class Backend:
    def __init__(self, profile):
        require(type(profile) is dict and set(profile) == PROFILE_KEYS
                and profile['schema'] == 'diis-capacity-target-v1', 'profile-schema')
        self.profile = profile
        self.disposable = profile['kind'] == 'disposable'
        require(self.disposable or profile['kind'] == 'production', 'target-kind')
        self.root = Path(profile['root'])
        require(self.root.is_absolute() and self.root.resolve(strict=True) == self.root
                and stat.S_IMODE(self.root.stat().st_mode) == 0o700
                and self.root.stat().st_uid == os.geteuid(), 'state-root')
        require(file_hash(profile['docker'])[0] == profile['dockerSha256'], 'docker-binary')
        self.docker = [profile['docker']]
        if self.disposable:
            require(self.root.parent == Path('/tmp') and self.root.name.startswith('diis-capacity-'), 'lab-root')
            marker = private_json(self.root / 'lab.json')
            require(set(marker) == {'schema', 'containerId', 'expires', 'ownerUid'}
                    and marker['schema'] == 'diis-capacity-lab-v1'
                    and marker['containerId'] == profile['containerId']
                    and marker['ownerUid'] == os.geteuid()
                    and marker['expires'] == profile['labExpires']
                    and time.time() < marker['expires'] <= time.time() + 3600, 'lab-marker')
            require(re.fullmatch(r'[a-f0-9]{64}', profile['containerId']), 'lab-container-id')
            info = policy.decode(core.run(self.docker + ['inspect', profile['containerId']], cwd=self.root))[0]
            require(info['Config']['Labels'].get('diis.capacity.task') == self.root.name
                    and info['State']['Running'] and info['HostConfig']['Privileged']
                    and info['HostConfig']['NetworkMode'] == 'none'
                    and info['HostConfig']['Memory'] == 4 * policy.GIB
                    and info['HostConfig']['NanoCpus'] == 4 * 10 ** 9
                    and info['Mounts'] == []
                    and info['HostConfig']['Tmpfs'] == {'/run': 'rw,size=64m', '/var/lib/docker': 'rw,size=2g'},
                    'lab-isolation')
            images = policy.decode(core.run(self.docker + ['image', 'inspect', info['Image']], cwd=self.root))
            require(any(value.endswith('@' + DIND_IMAGE) for value in images[0]['RepoDigests']), 'lab-image')
            require(profile['endpoint'] == PRODUCTION_SOCKET, 'lab-socket')
            self.docker += ['exec', profile['containerId'], 'docker']
            for key in ('targetCheckout', 'preservationRoot', 'backupLibrary'):
                require(Path(profile[key]).resolve(strict=True).is_relative_to(self.root), 'lab-path')
            self.host_lock = self.root / 'deploy.lock'
            app.WRITER_LOCK = self.root / 'backup.lock'
        else:
            require(os.geteuid() == pwd.getpwnam('appuser').pw_uid
                    and profile['endpoint'] == PRODUCTION_SOCKET
                    and profile['containerId'] is None and profile['labExpires'] is None
                    and profile['filesystemPath'] == '/var/lib/docker', 'production-boundary')
            self.host_lock = PRODUCTION_HOST_LOCK
            app.WRITER_LOCK = Path('/var/lock/diis-backup/backup.lock')
        self.docker += ['--host', profile['endpoint']]

    def run(self, args, timeout=60, cap=16 * 1024 ** 2):
        require(file_hash(self.profile['docker'])[0] == self.profile['dockerSha256'], 'docker-binary-drift')
        return core.run(self.docker + args, timeout=timeout, cap=cap, cwd=self.root)

    def identity(self):
        version = policy.decode(self.run(['version', '--format', '{{json .Server}}']))
        require(version['Version'] == '29.5.2' and version['GitCommit'] == '568f755'
                and version['Os'] == 'linux' and version['Arch'] == 'amd64', 'engine-version')
        buildx = self.run(['buildx', 'version']).decode().strip()
        expected_buildx = ('github.com/docker/buildx v0.34.1 e0b0e77d18d3379bc1e0d55f3b37de288d36fe47'
                          if self.disposable else
                          'github.com/docker/buildx v0.34.0 3e73561e39785683b31b05eeab1ef645be44ca42')
        require(buildx == expected_buildx, 'buildx-version')
        builder = self.run(['buildx', 'inspect', 'default']).decode()
        for key, expected in (('Driver', 'docker'), ('Endpoint', 'default'), ('Status', 'running'),
                              ('BuildKit version', 'v0.30.0')):
            require(re.findall(r'^' + key + r':\s*([^\n]+)$', builder, re.M) == [expected], 'builder-identity')
        info = policy.decode(self.run(['info', '--format', '{{json .}}']))
        require(info['DockerRootDir'] == '/var/lib/docker', 'daemon-root')
        require('GC Policy' not in builder, 'native-gc-must-be-disabled-during-manual-cleanup')
        plugins = [item for item in info['ClientInfo']['Plugins'] if item['Name'] == 'buildx']
        require(len(plugins) == 1, 'buildx-plugin-cardinality')
        plugin_path = plugins[0]['Path']
        require(plugin_path in ('/usr/libexec/docker/cli-plugins/docker-buildx',
                                '/usr/local/libexec/docker/cli-plugins/docker-buildx'), 'buildx-plugin-path')
        if self.disposable:
            binary = core.run([self.profile['docker'], 'exec', self.profile['containerId'], 'sha256sum',
                               plugin_path], cwd=self.root).decode().split()[0]
        else:
            binary = file_hash(plugin_path)[0]
        expected_binary = ('f1332ddb9010bd0b72628266c3a906d9a6979848033df4c8d9bd2cd113bae12b'
                           if self.disposable else
                           'bac6d4838cc38b22ef5975beaadd67ab093c409d595bbae0481ca38ba978aab2')
        require(binary == expected_binary, 'buildx-binary')
        checkout = Path(self.profile['targetCheckout'])
        sha = core.run(['git', '-C', str(checkout), 'rev-parse', 'HEAD'], cwd=self.root).decode().strip()
        tree = core.run(['git', '-C', str(checkout), 'show', '-s', '--format=%T', 'HEAD'], cwd=self.root).decode().strip()
        require(not core.run(['git', '-C', str(checkout), 'status', '--porcelain', '--untracked-files=no'],
                             cwd=self.root), 'runtime-tracked-dirty')
        if self.disposable:
            fs_raw = core.run([self.profile['docker'], 'exec', self.profile['containerId'],
                               'stat', '-f', '-c', '%i:%T:%S:%b', '/var/lib/docker'], cwd=self.root)
            host = policy.digest(self.profile['containerId'].encode())
        else:
            fs_raw = core.run(['stat', '-f', '-c', '%i:%T:%S:%b', self.profile['filesystemPath']], cwd=self.root)
            host = file_hash('/etc/machine-id')[0]
        return {'hostSha256': host, 'daemonIdSha256': policy.digest(info['ID'].encode()),
                'endpoint': self.profile['endpoint'], 'driver': 'docker', 'builder': 'default',
                'engine': version['Version'], 'engineCommit': version['GitCommit'],
                'buildx': buildx, 'buildxSha256': binary, 'buildxPath': plugin_path,
                'buildkit': 'v0.30.0', 'dockerSha256': self.profile['dockerSha256'],
                'filesystemSha256': policy.digest(fs_raw), 'mainSha': sha, 'mainTree': tree}

    def space(self):
        args = ['stat', '-f', '-c', '%S %b %a', self.profile['filesystemPath']]
        if self.disposable:
            args = [self.profile['docker'], 'exec', self.profile['containerId']] + args
        parts = core.run(args, cwd=self.root).decode().split()
        require(len(parts) == 3 and all(part.isdecimal() for part in parts), 'filesystem-output')
        size, blocks, available = map(int, parts)
        total, free = size * blocks, size * available
        policy.uint(total, 1)
        policy.uint(free, 0, total)
        return total, free

    def records(self):
        # Engine API integer bytes, not the human-readable Buildx du formatter.
        rows = []
        if self.disposable:
            raw = core.run([self.profile['docker'], 'exec', self.profile['containerId'], 'wget', '-qO-',
                            'http://127.0.0.1:2375/v1.53/system/df'], cwd=self.root, timeout=60, cap=16 * 1024 ** 2)
        else:
            raw = core.run(['curl', '--silent', '--fail', '--max-time', '60', '--unix-socket',
                            '/var/run/docker.sock', 'http://localhost/v1.53/system/df'], cwd=self.root,
                           timeout=65, cap=16 * 1024 ** 2)
        values = policy.decode(raw)['BuildCache']
        require(type(values) is list, 'engine-cache-array')
        du_rows = [policy.decode(line) for line in self.run(['buildx', 'du', '--format=json']).splitlines()]
        du = {row['ID']: row for row in du_rows}
        require(len(du) == len(du_rows) and set(du) == {value['ID'] for value in values}, 'du-engine-id-mismatch')
        for value in values:
            presentation = du[value['ID']]
            require(presentation['Reclaimable'] == (not value['InUse']) and presentation['Shared'] == value['Shared']
                    and presentation['Type'] == value['Type'], 'du-engine-flags')
            parents = presentation['Parents'] or []
            rows.append({'id': value['ID'], 'parents': parents, 'size': value['Size'],
                         'inUse': value['InUse'], 'shared': value['Shared'], 'mutable': presentation['Mutable'],
                         'type': value['Type'], 'createdAt': value['CreatedAt'], 'lastUsedAt': value.get('LastUsedAt')})
        require(len(rows) <= policy.MAX_RECORDS, 'record-count')
        return rows

    def no_touch(self):
        # Volatile status/health timestamps are excluded; content/config and
        # resources are not. Errors observing an empty universe are not empty.
        groups = {}
        for kind, listing in [('container', ['container', 'ls', '-aq', '--no-trunc']),
                              ('image', ['image', 'ls', '-aq', '--no-trunc']),
                              ('volume', ['volume', 'ls', '-q']), ('network', ['network', 'ls', '-q', '--no-trunc'])]:
            ids = sorted(set(self.run(listing).decode().splitlines()))
            require(len(ids) <= 2048, 'no-touch-count')
            rows = []
            if ids:
                raw = policy.decode(self.run([kind, 'inspect'] + ids))
                require(type(raw) is list and len(raw) == len(ids), 'no-touch-observation')
                for item in raw:
                    if kind == 'container':
                        item = {key: item[key] for key in ('Id', 'Image', 'Config', 'HostConfig', 'Mounts')}
                    elif kind == 'network':
                        item.pop('Containers', None)
                    rows.append(item)
            groups[kind] = sorted(rows, key=policy.digest)
        return policy.digest(groups)

    def snapshot(self):
        identity = self.identity()
        before = self.records()
        no_touch = self.no_touch()
        kept = preservation(self.profile['preservationRoot'])
        total, free = self.space()
        after = self.records()
        require(policy.digest(sorted(before, key=lambda row: row['id']))
                == policy.digest(sorted(after, key=lambda row: row['id'])), 'cache-drift-during-observation')
        return {'schema': 'diis-capacity-snapshot-v1', 'identity': identity,
                'observedAt': policy.utc_now(), 'records': after, 'totalBytes': total, 'freeBytes': free,
                'noTouchSha256': no_touch, 'preservationSha256': policy.digest(kept)}


def validate_approval(value, backend, candidate, bundle_sha, source_sha, writer_raw):
    require(type(value) is dict and set(value) == APPROVAL_KEYS
            and value['schema'] == 'diis-capacity-approval-v1', 'approval-schema')
    require(type(value['operationId']) is str and re.fullmatch(r'[a-f0-9]{32}', value['operationId'])
            and value['operationId'] != '0' * 32, 'operation-id')
    require(type(value['runId']) is str and re.fullmatch(r'[1-9][0-9]{0,19}', value['runId']), 'run-id')
    start, end = policy.uint(value['notBefore'], 1), policy.uint(value['expires'], 1)
    require(start <= time.time() < end and end - start <= 3600, 'approval-window')
    require(time.time() < policy.uint(candidate['expiresEpoch'], 1)
            and end <= candidate['expiresEpoch'], 'candidate-expiry')
    require(value['sourceSha'] == source_sha and value['bundleSha256'] == bundle_sha
            and value['profileSha256'] == policy.digest(backend.profile)
            and value['candidateSha256'] == candidate['candidateSha256']
            and value['policySha256'] == candidate['stable']['policySha256']
            and value['identity'] == candidate['stable']['identity']
            and value['mainSha'] == value['identity']['mainSha']
            and value['mainTree'] == value['identity']['mainTree'], 'approval-binding')
    require(value['writerEvidenceSha256'] == policy.digest(writer_raw), 'writer-evidence-hash')
    writer = policy.decode(writer_raw)
    require(type(writer) is dict and set(writer) == {'schema', 'expires', 'sourceSha', 'rootCronSha256',
            'n8nSha256', 'preservationSha256', 'writerInventorySha256', 'backupLibrarySha256',
            'allWritersUseCanonicalLock', 'allWritersRejectPersistentApplicationQuarantine',
            'quietWindowStart', 'quietWindowEnd', 'nativeGcDisabled', 'allHostMutatorsUseCanonicalLock',
            'allHostMutatorsHonorBackupQuarantine'},
            'writer-schema')
    app.validate_writer_evidence({key: item for key, item in writer.items() if key not in {
        'quietWindowStart', 'quietWindowEnd', 'nativeGcDisabled', 'allHostMutatorsUseCanonicalLock',
        'allHostMutatorsHonorBackupQuarantine'}},
        {'sourceSha': source_sha, 'expires': end}, file_hash(backend.profile['backupLibrary'])[0])
    require(policy.uint(writer['quietWindowStart'], 1) <= start
            and end <= policy.uint(writer['quietWindowEnd'], 1)
            and writer['nativeGcDisabled'] is True and writer['allHostMutatorsUseCanonicalLock'] is True
            and writer['allHostMutatorsHonorBackupQuarantine'] is True
            and writer['preservationSha256'] == candidate['stable']['preservationSha256']
            and file_hash(backend.profile['backupLibrary'])[0] == app.PERSISTENT_WRITER_LIBRARY_SHA256,
            'writer-participation')


def transaction(backend, candidate, approval, bundle_sha, source_sha, writer_raw):
    """One attempt, one ID filter, no retry. Journal precedes mutation dispatch."""
    held, host_fd, started, confirmed = None, None, False, False
    receipt = {'schema': 'diis-capacity-receipt-v1', 'outcome': 'BLOCKED_BEFORE_MUTATION',
               'sourceSha': source_sha, 'bundleSha256': bundle_sha,
               'candidateSha256': candidate['candidateSha256'], 'startedAt': policy.utc_now(),
               'retry': 'new-approval-required', 'pruneCalls': 0}
    journal = None
    try:
        validate_approval(approval, backend, candidate, bundle_sha, source_sha, writer_raw)
        core.COMMAND_DEADLINE = approval['expires']
        host_fd = app.lock(backend.host_lock, os.geteuid())
        held = app.acquire_writer_lock({'sourceSha': source_sha, 'approvalId': approval['operationId'],
                                       'runId': approval['runId']})
        journal = backend.root / ('operation-' + approval['operationId'])
        journal.mkdir(mode=0o700)  # O_EXCL directory: even a prior blocked ID cannot be replayed.
        core.write_exclusive(journal / 'approval.json', policy.canonical(approval))
        current = policy.select(backend.snapshot(), candidate['stable']['policy'],
                                candidate.get('explicitProtected', []), backend.disposable)
        require(current['candidateSha256'] == candidate['candidateSha256'], 'locked-candidate-drift')
        validate_approval(approval, backend, current, bundle_sha, source_sha, writer_raw)
        target = current['stable']['effectiveTargetBytes']
        receipt.update({'operationId': approval['operationId'], 'identity': current['stable']['identity'],
                        'freeBytesBefore': current['freeBytes'], 'effectiveTargetBytes': target,
                        'logicalEligibleBytes': current['logicalEligibleBytes'],
                        'noTouchBeforeSha256': current['stable']['noTouchSha256'],
                        'preservationBeforeSha256': current['stable']['preservationSha256'],
                        'protectedSetSha256': policy.digest(current['stable']['protected']),
                        'protectedCount': len(current['stable']['protected']),
                        'candidateCount': len(current['stable']['candidates']),
                        'guaranteedPhysicalReclaimBytes': 0})
        if current['targetMet']:
            receipt.update(outcome='NOOP_TARGET_MET', freeBytesAfter=current['freeBytes'])
        else:
            ids = [row['id'] for row in current['stable']['candidates']]
            require(ids and current['logicalBudgetBytes'] > 0, 'logical-reservation')
            args = ['buildx', 'prune', '--builder', 'default', '--force', '--filter', policy.id_filter(ids),
                    '--filter', 'private=""', '--reserved-space', str(current['stable']['policy']['reservedLogicalBytes']
                                                                         + current['stable']['policy']['marginBytes']),
                    '--min-free-space', str(target), '--verbose']
            core.cancellation_point()
            require(time.time() + current['stable']['policy']['maximumSeconds'] < approval['expires'], 'window-insufficient')
            core.write_exclusive(journal / 'mutation-intent.json', policy.canonical({'argsSha256': policy.digest(args),
                                                                                  'retry': 'prohibited'}))
            started = True  # Conservatively before dispatch, including child creation races.
            receipt['pruneCalls'] = 1
            raw = backend.run(args, timeout=current['stable']['policy']['maximumSeconds'])
            # Successful EOF AND producer absence come from reviewed core.run.
            # Validate terminal daemon receipt separately; client exit alone is insufficient.
            text = raw.decode('utf-8')
            require(re.search(r'\n?Total:\s+(?:0|[1-9][0-9]*)(?:\.[0-9]+)?[kMGTPE]?B\n\Z', text)
                    and len(re.findall(r'^Total:', text, re.M)) == 1, 'daemon-receipt-missing')
            deleted = re.findall(r'^ID:\s+([a-z0-9]{12,64})$', text, re.M)
            require(len(deleted) == len(re.findall(r'^ID:', text, re.M)), 'daemon-id-format')
            require(len(set(deleted)) == len(deleted) and set(deleted) <= set(ids), 'daemon-deleted-set')
            post = backend.snapshot()
            require(post['identity'] == current['stable']['identity']
                    and post['noTouchSha256'] == current['stable']['noTouchSha256']
                    and post['preservationSha256'] == current['stable']['preservationSha256'], 'postcheck-no-touch')
            old = {row['id']: row for row in current['stable']['records']}
            new = {row['id']: row for row in policy.normalize_records(post['records'], post['observedAt']).values()}
            require(set(new) <= set(old) and set(old) - set(new) <= set(ids), 'postcheck-deletion-universe')
            require(all(new[key] == old[key] for key in new), 'postcheck-record-drift')
            require(set(deleted) == set(old) - set(new), 'daemon-receipt-inventory-mismatch')
            confirmed = True
            receipt.update(freeBytesAfter=post['freeBytes'], deletedCount=len(deleted),
                           noTouchAfterSha256=post['noTouchSha256'],
                           preservationAfterSha256=post['preservationSha256'],
                           daemonReceiptSha256=policy.digest(raw),
                           physicalDeltaBytes=post['freeBytes'] - current['freeBytes'],
                           outcome=('CLEANUP_COMPLETED_TARGET_MET' if post['freeBytes'] >= target
                                    else 'CLEANUP_COMPLETED_TARGET_NOT_MET'))
        core.cancellation_point()
        core.producers_absent()
        core.write_exclusive(journal / 'daemon-proof.json', policy.canonical({
            **receipt, 'phase': 'EXCLUSION_HELD_NOT_FINAL_SUCCESS'}))
        app.release_writer_lock(held)
        held = None
        try:
            core.write_exclusive(journal / 'receipt.json', policy.canonical(receipt))
        except OSError:
            # Daemon completion and no-touch proof are already durable. Never
            # mislabel a completed action as blocked-before-mutation. No retry.
            receipt.update(receiptDelivery='failed-after-proven-release', retry='prohibited')
            return receipt, 74
        return receipt, 0 if receipt['outcome'] in ('NOOP_TARGET_MET', 'CLEANUP_COMPLETED_TARGET_MET') else 73
    except BaseException as error:
        if started or isinstance(error, core.ProducerAmbiguous):
            receipt.update(outcome='PARTIAL_OR_AMBIGUOUS_NO_RETRY', retry='prohibited',
                           daemonCompletionObserved=confirmed)
        receipt['reason'] = str(error) if isinstance(error, (policy.Rejected, core.Stop)) else 'operation-failed'
        if held is not None:
            if started or isinstance(error, core.ProducerAmbiguous):
                app.retain_writer_lock(held)
            else:
                try:
                    app.release_writer_lock(held)
                except BaseException:
                    app.retain_writer_lock(held)
                    receipt.update(outcome='PARTIAL_OR_AMBIGUOUS_NO_RETRY', retry='prohibited', reason='lock-release')
        if journal is not None:
            try:
                core.write_exclusive(journal / 'failure.json', policy.canonical(receipt))
            except BaseException:
                pass  # No success: immutable intent plus retained lock is reconciliation evidence.
        return receipt, 74 if receipt['outcome'] == 'PARTIAL_OR_AMBIGUOUS_NO_RETRY' else 65
    finally:
        core.COMMAND_DEADLINE = None
        if host_fd is not None:
            os.close(host_fd)


def main(bundle_sha, source_sha, released=False):
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['observe', 'apply', 'status'], nargs='?', default='observe')
    parser.add_argument('--profile', required=True)
    parser.add_argument('--policy', required=True)
    parser.add_argument('--candidate')
    parser.add_argument('--approval')
    parser.add_argument('--approval-sha256')
    parser.add_argument('--writer-evidence')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    completed_receipt = None
    try:
        require(not any(key.startswith(('W10_TEST', 'CAPACITY_TEST')) or key in ('HOST_LOCK', 'LD_PRELOAD', 'PYTHONPATH')
                        for key in os.environ), 'environment-selector')
        for sig in core.HANDLED_SIGNALS:
            signal.signal(sig, lambda *_: (_ for _ in ()).throw(core.Stop('interrupted')))
        profile = private_json(args.profile)
        require(profile.get('kind') == 'disposable' or released is True, 'unreleased-production-prohibited')
        backend = Backend(profile)
        approved_policy = private_json(args.policy)
        output = Path(args.output)
        require(output.parent == backend.root and not output.exists() and not output.is_symlink(), 'output-path')
        if args.mode != 'apply':
            value = policy.select(backend.snapshot(), approved_policy, [], backend.disposable)
            core.write_exclusive(output, policy.canonical(value))
            print(policy.canonical({'outcome': 'OBSERVED_NO_MUTATION', 'candidateSha256': value['candidateSha256'],
                                    'candidateCount': len(value['stable']['candidates']),
                                    'freeBytes': value['freeBytes'], 'targetMet': value['targetMet']}).decode())
            return 0
        require(all((args.candidate, args.approval, args.approval_sha256, args.writer_evidence)), 'approval-required')
        approval_raw = core.private_read(Path(args.approval))
        require(policy.digest(approval_raw) == args.approval_sha256, 'approval-external-hash')
        candidate = private_json(args.candidate)
        require(type(candidate) is dict and set(candidate) == {'schema', 'observedAt', 'expiresEpoch',
                'stable', 'candidateSha256', 'freeBytes', 'logicalEligibleBytes', 'logicalBudgetBytes',
                'guaranteedPhysicalReclaimBytes', 'targetMet', 'cleanupAuthorized'}
                and candidate['schema'] == 'diis-capacity-candidate-v1'
                and candidate['cleanupAuthorized'] is False
                and policy.digest(candidate['stable']) == candidate['candidateSha256'], 'candidate-schema-binding')
        require(candidate['stable']['policy'] == approved_policy, 'policy-file-binding')
        receipt, code = transaction(backend, candidate, policy.decode(approval_raw), bundle_sha, source_sha,
                                    core.private_read(Path(args.writer_evidence)))
        completed_receipt = receipt
        core.write_exclusive(output, policy.canonical(receipt))
        print(policy.canonical({'outcome': receipt['outcome'], 'retry': receipt['retry']}).decode())
        return code
    except BaseException as error:
        if completed_receipt is not None:
            print(policy.canonical({'outcome': completed_receipt['outcome'], 'retry': 'prohibited',
                                    'receiptDelivery': 'failed-consult-operation-journal'}).decode())
            return 74
        reason = str(error) if isinstance(error, (policy.Rejected, core.Stop)) else 'input-or-observation-failed'
        print(policy.canonical({'outcome': 'BLOCKED_BEFORE_MUTATION', 'reason': reason}).decode())
        return 65
