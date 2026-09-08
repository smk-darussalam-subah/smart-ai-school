#!/usr/bin/env python3
"""Approval-bound staging transaction. No build, pull, provisioning or migration.

Transported from the Actions checkout in memory; never loaded from the old host
checkout. Runtime inputs are a private, externally approved, digest-bound packet.
Public output is reason codes only. No production test environment switches.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import selectors
import signal
import stat
import subprocess
import sys
import time

ROOT = Path('/opt/diis-staging/smart-ai-school')
STATE = Path('/home/appuser/.local/state/diis-deploy')
APPROVAL = STATE / 'staging-approval.json'
ENV = ROOT / 'infrastructure/docker/.env.staging'
SHA = re.compile(r'[a-f0-9]{40}')
HASH = re.compile(r'[a-f0-9]{64}')
IMAGE = re.compile(r'ghcr\.io/smk-darussalam-subah/diis-pg-backup@sha256:[a-f0-9]{64}')
APP_NAMES = {'api': 'smk-staging-api', 'web': 'smk-staging-web'}
COMPOSE_FILES = ['infrastructure/docker/docker-compose.yml',
                 'infrastructure/docker/docker-compose.staging.yml']
SAFE_ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
            'HOME': '/home/appuser', 'LANG': 'C.UTF-8', 'DOCKER_CONFIG': '/home/appuser/.docker'}
COMMAND_DEADLINE = None  # internal wall-clock deadline, never selected by environment
OWNED_PRODUCERS = {}  # removed only after bounded reap AND process-group absence
HANDLED_SIGNALS = (signal.SIGHUP, signal.SIGINT, signal.SIGTERM)
DEFER_CANCELLATION = False  # application rollback owns a bounded deferral policy
DEFERRED_SIGNALS = set()  # signal numbers only; never serialized or printed
# One reviewed non-runtime transition, not a general test-file allowlist.
# Raw NUL-delimited Git output binds path, status, regular mode and both blobs.
REVIEWED_TEST_DELTA = (
    b':100644 100644 a03f35802d33e05155cef3ed6623974e8f892a22 '
    b'8d4930940184ec452cca1bbf36d8d6ce57b89369 M\0'
    b'apps/api/src/__tests__/deploy-workflow-safety.spec.ts\0'
)


class Stop(Exception):
    """Public reason must be a literal code, never a subprocess exception."""


class ProducerAmbiguous(Stop):
    """Cleanup could not prove producer absence; prohibit further mutation."""


def producers_absent() -> None:
    if OWNED_PRODUCERS:
        raise ProducerAmbiguous('command-group-ambiguous-retained-no-retry')


def cancellation_point() -> None:
    """Latch blocked signals; only recovery may defer raising cancellation."""
    DEFERRED_SIGNALS.update(set(HANDLED_SIGNALS).intersection(signal.sigpending()))
    if DEFERRED_SIGNALS and not DEFER_CANCELLATION:
        raise Stop('interrupted')


def finish_producer(process, selector) -> None:
    cleanup_mask = signal.pthread_sigmask(signal.SIG_BLOCK, HANDLED_SIGNALS)
    failed = False
    try:
        # Keep dispositions unchanged: SIG_IGN discards already-pending signals.
        # The lifetime mask alone protects cleanup from repeated cancellation.
        if process is not None:
            for sig in (signal.SIGTERM, signal.SIGKILL):
                try:
                    os.killpg(process.pid, sig)
                except ProcessLookupError:
                    pass
                except BaseException:
                    failed = True
                try:
                    process.wait(timeout=2)
                    until = time.monotonic() + 2
                    while group_exists(process.pid) and time.monotonic() < until:
                        time.sleep(0.02)
                except subprocess.TimeoutExpired:
                    pass  # escalation is allowed; final absence remains mandatory
                except BaseException:
                    failed = True
            try:
                if process.poll() is None or group_exists(process.pid):
                    failed = True
            except BaseException:
                failed = True
        for resource in (selector, process.stdout if process is not None else None):
            if resource is not None:
                try:
                    resource.close()
                except BaseException:
                    failed = True
        if failed:
            raise ProducerAmbiguous('command-group-ambiguous-retained-no-retry')
        if process is not None:
            OWNED_PRODUCERS.pop(process.pid, None)
    finally:
        signal.pthread_sigmask(signal.SIG_SETMASK, cleanup_mask)


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise Stop(reason)


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def pairs(items: list[tuple[str, object]]) -> dict:
    value = {}
    for key, item in items:
        require(key not in value, 'duplicate-json-key')
        value[key] = item
    return value


def decode(raw: bytes) -> object:
    try:
        return json.loads(raw, object_pairs_hook=pairs)
    except (ValueError, UnicodeError):
        raise Stop('invalid-json') from None


def private_read(path: Path, limit: int = 131072) -> bytes:
    require(path.is_absolute() and path.resolve(strict=True) == path, 'private-path')
    parent = path.parent.stat()
    require(parent.st_uid == os.geteuid() and stat.S_IMODE(parent.st_mode) == 0o700,
            'private-parent')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        meta = os.fstat(fd)
        require(stat.S_ISREG(meta.st_mode) and meta.st_uid == os.geteuid()
                and stat.S_IMODE(meta.st_mode) == 0o600 and meta.st_nlink == 1,
                'private-file')
        with os.fdopen(os.dup(fd), 'rb') as stream:
            raw = stream.read(limit + 1)
        require(len(raw) <= limit and len(raw) == meta.st_size, 'private-file-size')
        require(identity(os.fstat(fd)) == identity(meta)
                and identity(path.stat()) == identity(meta), 'private-file-drift')
        return raw
    finally:
        os.close(fd)


def identity(meta: os.stat_result) -> tuple:
    return (meta.st_dev, meta.st_ino, meta.st_size, meta.st_mtime_ns, meta.st_ctime_ns,
            meta.st_mode, meta.st_uid, meta.st_gid, meta.st_nlink)


def group_exists(pid: int) -> bool:
    try:
        os.killpg(pid, 0)
        return True
    except ProcessLookupError:
        return False


def run(argv: list[str], timeout: float = 30, cap: int = 1048576,
        cwd: Path = ROOT, extra_env: dict | None = None) -> bytes:
    """Bound stdout, discard stderr, require success AND pipe EOF/group absence."""
    env = dict(SAFE_ENV)
    if extra_env:
        env.update(extra_env)
    require(COMMAND_DEADLINE is None or time.time() < COMMAND_DEADLINE, 'command-budget')
    producers_absent()
    process = selector = None
    output = bytearray()
    deadline = time.monotonic() + timeout
    if COMMAND_DEADLINE is not None:
        deadline = min(deadline, time.monotonic() + max(0, COMMAND_DEADLINE - time.time()))
    eof = False
    previous_mask = signal.pthread_sigmask(signal.SIG_BLOCK, HANDLED_SIGNALS)
    try:
        process = subprocess.Popen(argv, cwd=cwd, env=env, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL, start_new_session=True)
        OWNED_PRODUCERS[process.pid] = process
        selector = selectors.DefaultSelector()
        assert process.stdout is not None
        selector.register(process.stdout, selectors.EVENT_READ)
        while True:
            cancellation_point()
            require(time.monotonic() < deadline, 'command-timeout')
            for key, _ in ([] if eof else selector.select(0.05)):
                chunk = os.read(key.fd, 65536)
                if not chunk:
                    selector.unregister(process.stdout)
                    eof = True
                output.extend(chunk)
                require(len(output) <= cap, 'command-overflow')
            rc = process.poll()
            require(rc is None or rc == 0, 'command-failed')
            if eof and rc == 0 and not group_exists(process.pid):
                return bytes(output)
            if eof:
                time.sleep(0.02)
    finally:
        cleanup_failure = None
        try:
            finish_producer(process, selector)
        except BaseException as exc:
            cleanup_failure = exc
        try:
            signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)
        except BaseException:
            if cleanup_failure is not None:
                raise cleanup_failure from None
            raise
        if cleanup_failure is not None:
            raise cleanup_failure
        cancellation_point()


def validate(packet: object, sha: str, now: int) -> dict:
    keys = {'schema', 'sourceSha', 'sourceTree', 'baseSha', 'environmentSha256',
            'legacySha256', 'sharedSha256', 'modelSha256', 'backupImage',
            'backupImageId', 'platform', 'apps', 'notBefore', 'expires', 'approvalId',
            'mediaEvidenceSha256', 'imageRevision'}
    require(type(packet) is dict and set(packet) == keys, 'approval-schema')
    p = packet
    require(p['schema'] == 'diis-staging-approval-v1', 'approval-version')
    for key in ('sourceSha', 'sourceTree', 'baseSha', 'imageRevision'):
        require(type(p[key]) is str and SHA.fullmatch(p[key]) is not None, 'approval-sha')
    require(p['sourceSha'] == sha and p['baseSha'] != sha, 'approval-source')
    for key in ('environmentSha256', 'legacySha256', 'sharedSha256', 'modelSha256',
                'mediaEvidenceSha256'):
        require(type(p[key]) is str and HASH.fullmatch(p[key]) is not None
                and p[key] != '0' * 64, 'approval-hash')
    require(type(p['backupImage']) is str and IMAGE.fullmatch(p['backupImage']) is not None,
            'approval-image')
    require(type(p['backupImageId']) is str
            and re.fullmatch(r'sha256:[a-f0-9]{64}', p['backupImageId']) is not None,
            'approval-image-id')
    require(p['platform'] == 'linux/amd64', 'approval-platform')
    require(all(type(p[k]) is int for k in ('notBefore', 'expires')),
            'approval-integer')
    require(type(p['approvalId']) is str and re.fullmatch(r'[a-f0-9]{32}',p['approvalId'])
            is not None and p['approvalId'] != '0'*32, 'approval-id')
    require(p['notBefore'] <= now and now + 600 <= p['expires']
            and 0 < p['expires'] - p['notBefore'] <= 3600, 'approval-window')
    require(type(p['apps']) is dict and set(p['apps']) == set(APP_NAMES), 'approval-apps')
    for value in p['apps'].values():
        require(type(value) is dict and set(value) == {'id', 'image', 'runtimeSha256'},
                'approval-app-schema')
        require(HASH.fullmatch(str(value['id'])) is not None
                and HASH.fullmatch(str(value['runtimeSha256'])) is not None
                and re.fullmatch(r'sha256:[a-f0-9]{64}', str(value['image'])) is not None,
                'approval-app-binding')
    return p


class Host:
    def __init__(self, packet: dict):
        self.p = packet
        self.run_id = ''

    def git(self, *args: str) -> bytes:
        return run(['git', *args])

    def observation(self, name: str) -> dict:
        # Never request .Config.Env, command, full inspect, labels or log body.
        form = '{"id":{{json .Id}},"image":{{json .Image}},"started":{{json .State.StartedAt}},"status":{{json .State.Status}},"mounts":{{json .Mounts}},"networks":{{json .NetworkSettings.Networks}}}'
        value = decode(run(['docker', 'inspect', '--format', form, name]))
        require(type(value) is dict and value.get('status') == 'running', 'runtime-unhealthy')
        return value

    def legacy(self) -> str:
        value = self.observation('smk-pg-backup')
        for mount in value['mounts']:
            if mount['Type'] == 'bind':
                source = Path(mount['Source']).resolve(strict=True)
                require(not source.is_relative_to(ROOT) and not ROOT.is_relative_to(source),
                        'legacy-staging-mount-overlap')
        # Hash exact mounted code, not credential mounts. A successful find proves
        # the optional rclone files absent/present without interpreting stat errors.
        code = sorted({x['Destination'] for x in value['mounts']
                       if x['Type'] == 'bind' and x['Destination'].endswith(('.sh','.py'))})
        require('/backup.sh' in code and all(re.fullmatch(r'/[A-Za-z0-9_./-]+',x)
                                           for x in code), 'legacy-code-mounts')
        hashes = run(['docker', 'exec', 'smk-pg-backup', 'sha256sum',
                      '/etc/crontabs/root', *code])
        require(len(hashes.splitlines()) == len(code)+1, 'legacy-hash-count')
        tools = run(['docker', 'exec', 'smk-pg-backup', 'find', '/opt/backup-bin',
                     '-maxdepth', '1', '-type', 'f', '(', '-name', 'mc', '-o', '-name',
                     'rclone', '-o', '-name', 'rclone.zip', ')', '-exec', 'sha256sum', '{}', '+'])
        require(any(line.endswith(b'  /opt/backup-bin/mc') for line in tools.splitlines()),
                'legacy-mc-missing')
        return digest(canonical(value) + hashes + b'\n'.join(sorted(tools.splitlines())))

    def shared(self) -> str:
        values = [self.observation(name) for name in
                  ('smk-postgres', 'smk-minio', 'smk-keycloak', 'smk-nginx')]
        nginx = run(['docker', 'exec', 'smk-nginx', 'sha256sum', '/etc/nginx/nginx.conf'])
        return digest(canonical(values) + nginx)

    def environment(self) -> bytes:
        # Host env parent is not required 0700 by old deployment; file itself must be private.
        require(ENV.resolve(strict=True) == ENV, 'env-path')
        fd = os.open(ENV, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        try:
            meta = os.fstat(fd)
            require(stat.S_ISREG(meta.st_mode) and meta.st_uid == os.geteuid()
                    and stat.S_IMODE(meta.st_mode) == 0o600 and meta.st_nlink == 1,
                    'env-mode')
            raw = os.read(fd, 131073)
            require(len(raw) <= 131072 and len(raw) == meta.st_size
                    and digest(raw) == self.p['environmentSha256'],
                    'env-binding')
            require(identity(os.fstat(fd)) == identity(meta)
                    and identity(ENV.stat()) == identity(meta), 'env-drift')
        finally:
            os.close(fd)
        lines = re.findall(rb'^PG_BACKUP_IMAGE=([^\r\n]*)$', raw, re.M)
        require(lines == [self.p['backupImage'].encode()], 'env-image-binding')
        return raw

    def health(self) -> None:
        for url in ('https://staging-api.smkdarussalamsubah.sch.id/health',
                    'https://staging.smkdarussalamsubah.sch.id/',
                    'https://api.smkdarussalamsubah.sch.id/health',
                    'https://smkdarussalamsubah.sch.id/'):
            try:
                status = run(['curl', '--fail', '--silent', '--show-error', '--max-time', '20',
                              '--output', '/dev/null', '--write-out', '%{http_code}', url])
            except Stop as exc:
                if str(exc) in ('command-failed', 'command-timeout'):
                    raise Stop('health-not-ready') from None
                raise
            require(status == b'200', 'health-not-ready')

    def application_delta(self) -> None:
        # No rename heuristics, text conversion, external diff or quoted filenames.
        # Any extra record, changed blob, missing terminator or observation error
        # fails before deployment writes, including unknown apps/packages paths.
        raw = self.git('diff', '--raw', '-z', '--no-abbrev', '--no-renames',
                       '--no-ext-diff', '--no-textconv',
                       self.p['baseSha'], self.p['sourceSha'], '--', 'apps', 'packages')
        require(raw in (b'', REVIEWED_TEST_DELTA), 'application-or-migration-delta')

    def preflight(self) -> None:
        p = self.p
        require(ROOT.resolve(strict=True) == ROOT, 'checkout-path')
        self.environment()
        require(self.git('rev-parse', 'HEAD').decode().strip() == p['baseSha'], 'base-drift')
        require(self.git('branch', '--show-current').strip() == b'staging', 'wrong-branch')
        require(not self.git('status', '--porcelain=v1', '--untracked-files=all'), 'checkout-drift')
        require(self.git('rev-parse', p['sourceSha'] + '^{tree}').decode().strip()
                == p['sourceTree'], 'source-tree')
        # Object must already exist. No fetch/write fallback before approval guard.
        remote = self.git('ls-remote', 'origin', 'refs/heads/staging').split()
        require(len(remote) == 2 and remote[0].decode() == p['sourceSha'], 'remote-sha')
        self.git('merge-base', '--is-ancestor', p['baseSha'], p['sourceSha'])
        self.application_delta()
        self.git('merge-base', '--is-ancestor', p['imageRevision'], p['sourceSha'])
        require(not self.git('diff', '--name-only', p['imageRevision'], p['sourceSha'], '--',
                'infrastructure/docker/pg-backup.Dockerfile', 'scripts/w10d_completion_validation.py',
                'scripts/bounded-command-capture.py', 'scripts/parse-minio-du-observation.py'),
                'image-source-drift')
        require(run(['uname', '-m']).strip() == b'x86_64', 'host-platform')
        image = decode(run(['docker', 'image', 'inspect', '--format',
                            '{"id":{{json .Id}},"os":{{json .Os}},"arch":{{json .Architecture}},"digests":{{json .RepoDigests}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}',
                            p['backupImage']]))
        require(image['id'] == p['backupImageId'] and image['os'] == 'linux'
                and image['arch'] == 'amd64' and p['backupImage'] in image['digests']
                and image['revision'] == p['imageRevision'],
                'local-image-binding')
        # Digest-qualified registry request. Failure never means package absent.
        registry = decode(run(['docker', 'manifest', 'inspect', p['backupImage']]))
        require(type(registry) is dict and registry.get('schemaVersion') == 2, 'registry-image')
        require(self.legacy() == p['legacySha256'], 'legacy-drift')
        require(self.shared() == p['sharedSha256'], 'shared-drift')
        for service, name in APP_NAMES.items():
            value = self.observation(name)
            expected = p['apps'][service]
            require(value['id'] == expected['id'] and value['image'] == expected['image']
                    and self.app_runtime(value) == expected['runtimeSha256'], 'app-baseline')
            require(not value['mounts'], 'app-baseline-mounts')
            observed_image = run(['docker','image','inspect','--format','{{.Id}}',expected['image']])
            require(observed_image.decode().strip() == expected['image'], 'rollback-image-unavailable')
        for target in (ROOT, Path('/var/lib/docker'), STATE):
            info = os.statvfs(target)
            free = info.f_bavail * info.f_frsize
            require(free >= 24 * 1024**3 and info.f_blocks > 0
                    and info.f_bavail / info.f_blocks >= .25, 'capacity')
        versions = run(['docker', 'exec', 'smk-postgres', 'postgres', '--version'])
        require(re.search(rb'\b16\.', versions) is not None, 'postgres-version')
        query = "SELECT CASE WHEN finished_at IS NULL THEN 'INCOMPLETE:' || migration_name ELSE migration_name END FROM public._prisma_migrations WHERE rolled_back_at IS NULL ORDER BY migration_name"
        observed = run(['docker', 'exec', 'smk-postgres', 'sh', '-ceu',
                        'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d smk_staging_db -Atc "$1"',
                        'sh', query]).decode().splitlines()
        files = self.git('ls-tree', '-r', '--name-only', p['sourceSha'],
                         'packages/database/prisma/migrations').decode().splitlines()
        expected = sorted(Path(f).parent.name for f in files if f.endswith('/migration.sql'))
        require(expected and observed == expected, 'migration-baseline')
        evidence = private_read(STATE / 'staging-media-evidence.json')
        require(digest(evidence) == p['mediaEvidenceSha256'], 'media-evidence')
        media = decode(evidence)
        require(type(media) is dict and set(media) == {'schema', 'environmentSha256',
                'expires', 'status', 'owner', 'scope'} and media['schema'] == 'diis-media-readonly-v1'
                and media['environmentSha256'] == p['environmentSha256']
                and media['expires'] == p['expires'] and media['status'] == 'verified'
                and media['scope'] == 'existing-staging-media-only'
                and type(media['owner']) is str and 1 <= len(media['owner']) <= 80,
                'media-attestation')
        self.health()
        self.verify_compose_baseline()

    def verify_compose_baseline(self) -> None:
        args = ['docker','compose','-p','smk-staging']
        for f in COMPOSE_FILES:
            args += ['-f',str(ROOT/f)]
        args += ['--env-file',str(ENV),'config','--hash']
        for service,name in APP_NAMES.items():
            model_hash = run(args+[service],extra_env={'PG_BACKUP_IMAGE':self.p['backupImage']}).split()
            require(len(model_hash) == 2 and model_hash[0].decode() == service
                    and HASH.fullmatch(model_hash[1].decode()) is not None, 'compose-baseline-hash')
            runtime_hash = run(['docker','inspect','--format',
                                '{{index .Config.Labels "com.docker.compose.config-hash"}}',name]).strip()
            require(runtime_hash == model_hash[1], 'compose-live-baseline-drift')

    def app_runtime(self, value: dict) -> str:
        # Sensitive fields are captured bounded in memory, hashed, never printed/stored raw.
        return digest(canonical(value) + canonical(self.app_config(value['id'])))

    def app_config(self, container: str) -> dict:
        config = run(['docker', 'inspect', '--format',
                      '{"env":{{json .Config.Env}},"cmd":{{json .Config.Cmd}},"entrypoint":{{json .Config.Entrypoint}},"user":{{json .Config.User}},"workdir":{{json .Config.WorkingDir}},"host":{{json .HostConfig}}}',
                      container])
        value = decode(config)
        require(type(value) is dict, 'runtime-config')
        # Ordering of environment entries is not semantic; duplicate names are.
        entries = value['env'] or []
        require(len({x.split('=', 1)[0] for x in entries}) == len(entries), 'runtime-env-duplicates')
        value['env'] = sorted(entries)
        return value

    def app_configs(self) -> dict:
        return {service: self.app_config(name) for service, name in APP_NAMES.items()}

    def verify_apps(self, expected: dict) -> None:
        require(self.app_configs() == expected, 'app-config-drift')
        for service, name in APP_NAMES.items():
            value = self.observation(name)
            require(value['image'] == self.p['apps'][service]['image']
                    and not value['mounts'], 'app-result')
            networks = {'smk-staging-net'} if service == 'web' else {'smk-staging-net', 'smk-network'}
            require(set(value['networks']) == networks, 'app-network-drift')

    def model(self, image_references=None, expected_sha=None) -> dict:
        if image_references is None:
            image_references = {service: self.p['apps'][service]['image'] for service in APP_NAMES}
        require(type(image_references) is dict and set(image_references) == set(APP_NAMES),
                'model-image-references')
        args = ['docker', 'compose', '-p', 'smk-staging']
        for f in COMPOSE_FILES:
            args += ['-f', str(ROOT / f)]
        args += ['--env-file', str(ENV), 'config', '--format', 'json']
        full = compose_values(decode(run(args, extra_env={'PG_BACKUP_IMAGE': self.p['backupImage']})))
        require(type(full) is dict, 'compose-model')
        services = {}
        for service, name in APP_NAMES.items():
            value = dict(full['services'][service])
            require(set(value) <= {'container_name','environment','networks','image','pull_policy',
                    'build','depends_on','restart','healthcheck','deploy','ports','command',
                    'entrypoint','user','working_dir'}, 'app-model-unknown-field')
            require(value['container_name'] == name and not value.get('volumes')
                    and not value.get('privileged') and not value.get('network_mode')
                    and not value.get('devices') and not value.get('cap_add'), 'app-model-scope')
            value.pop('build', None)
            value.pop('depends_on', None)
            value['image'] = image_references[service]
            value['pull_policy'] = 'never'
            current = self.app_config(name)
            live_env = dict(item.split('=',1) for item in current['env'])
            require(all(type(v) is str and live_env.get(k) == v
                        for k,v in value.get('environment',{}).items()), 'model-live-env-drift')
            for field, live_key in (('command','cmd'),('entrypoint','entrypoint'),
                                    ('user','user'),('working_dir','workdir')):
                if field in value and value[field] is not None:
                    require(value[field] == current[live_key], 'model-live-config-drift')
            services[service] = value
        require(set(services['web']['networks']) == {'smk-staging-net'}
                and set(services['api']['networks']) == {'smk-staging-net', 'smk-network'},
                'app-network-scope')
        model = {'services': services, 'networks': {
            'smk-staging-net': {'name': 'smk-staging-net', 'external': True},
            'smk-network': {'name': 'smk-network', 'external': True}}}
        require(digest(canonical(model)) == (expected_sha or self.p['modelSha256']), 'model-binding')
        return model

    def apply(self, model_file: Path) -> None:
        run(['docker', 'compose', '-p', 'smk-staging', '-f', str(model_file),
             '--env-file', '/dev/null', 'up', '-d', '--no-deps', '--no-build',
             '--pull', 'never', 'api', 'web'], timeout=120)

    def invariant(self) -> None:
        self.environment()
        require(self.legacy() == self.p['legacySha256'], 'legacy-drift')
        require(self.shared() == self.p['sharedSha256'], 'shared-drift')

    def source_result(self) -> None:
        require(self.git('rev-parse','HEAD').decode().strip() == self.p['sourceSha'], 'source-result')
        require(not self.git('status','--porcelain=v1','--untracked-files=all'), 'source-result-drift')


def write_exclusive(path: Path, raw: bytes) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())


def compose_bytes(model: dict) -> bytes:
    # Compose interpolates YAML/JSON string values again on consumption. Protect
    # literal dollars in passwords/commands instead of expanding a second time.
    def escape(value: object) -> object:
        if isinstance(value, str):
            return value.replace('$', '$$')
        if isinstance(value, dict):
            return {key: escape(item) for key, item in value.items()}
        if isinstance(value, list):
            return [escape(item) for item in value]
        return value
    return canonical(escape(model))


def compose_values(value: object) -> object:
    # `compose config` emits a re-loadable serialization, escaping every literal
    # dollar. Decode exactly that serialization once for comparisons with runtime.
    # The config-only idempotence contract guards this CLI-dependent boundary.
    if isinstance(value, str):
        require(re.search(r'(?<!\$)(?:\$\$)*\$(?!\$)', value) is None,
                'compose-dollar-encoding')
        return value.replace('$$', '$')
    if isinstance(value, dict):
        return {key: compose_values(item) for key,item in value.items()}
    if isinstance(value, list):
        return [compose_values(item) for item in value]
    return value


def wait_for_health(host: Host) -> None:
    """Poll reads only after apply, bounded inside the existing transaction budget."""
    global COMMAND_DEADLINE
    previous = COMMAND_DEADLINE
    end = min(time.time() + 90, previous if previous is not None else float('inf'))
    COMMAND_DEADLINE = end
    try:
        while time.time() < end:
            try:
                host.health()
                return
            except Stop as exc:
                # Never retry signals, invariant failures or exhausted command budget.
                if str(exc) != 'health-not-ready':
                    raise
            remaining = end - time.time()
            if remaining > 0:
                time.sleep(min(2, remaining))
        raise Stop('health-readiness-timeout')
    finally:
        COMMAND_DEADLINE = previous


def transaction(host: Host, directory: Path) -> None:
    """directory/ownership pre-created before mutation; retained on ambiguity."""
    global COMMAND_DEADLINE
    producers_absent()
    p = host.p
    host.preflight()
    model = host.model()
    app_configs = host.app_configs()
    raw = compose_bytes(model)
    rollback = directory / 'apps.json'
    write_exclusive(rollback, raw)
    # Raw configuration is private and unchanged. No dotenv write occurs at all.
    env_snapshot = directory / 'environment.snapshot'
    write_exclusive(env_snapshot, host.environment())
    journal = directory / 'attempt.json'
    write_exclusive(journal, canonical({'schema': 'diis-staging-attempt-v1',
                    'sourceSha': p['sourceSha'], 'baseSha': p['baseSha'],
                    'modelSha256': digest(raw), 'environmentSha256': p['environmentSha256'],
                    'status': 'owned-before-mutation', 'runId': host.run_id}))
    host.preflight()
    require(int(time.time()) + 600 <= p['expires'], 'execution-window')
    require(COMMAND_DEADLINE is None or time.time() + 240 < COMMAND_DEADLINE, 'forward-budget')
    # The approved recovery-only delta must preserve the application model exactly.
    # Apply flags prohibit builds/pulls/migrations/provisioning/scheduler activation.
    mutation = False
    try:
        mutation = True  # pre-registration closes signal-after-mutation windows
        host.git('merge', '--ff-only', p['sourceSha'])
        require(host.git('rev-parse', 'HEAD').decode().strip() == p['sourceSha'], 'checkout-result')
        host.invariant()
        require(compose_bytes(host.model()) == raw, 'target-model-drift')
        require(private_read(rollback) == raw, 'snapshot-drift')
        host.apply(rollback)
        wait_for_health(host)
        host.verify_apps(app_configs)
        host.invariant()
        host.source_result()
    except BaseException as failure:
        if isinstance(failure, ProducerAmbiguous):
            raise ProducerAmbiguous('producer-ambiguous-retained-no-retry') from None
        producers_absent()
        if mutation:
            # Stop repeated signals only during the bounded containment section.
            previous = {s: signal.signal(s, signal.SIG_IGN) for s in
                        (signal.SIGHUP, signal.SIGINT, signal.SIGTERM)}
            old_deadline = COMMAND_DEADLINE
            COMMAND_DEADLINE = time.time() + 300
            try:
                require(private_read(rollback) == raw, 'rollback-snapshot-drift')
                require(private_read(env_snapshot) == host.environment(), 'rollback-env-drift')
                host.invariant()
                producers_absent()
                host.apply(rollback)
                wait_for_health(host)
                host.verify_apps(app_configs)
                host.invariant()
            except BaseException:
                raise Stop('rollback-ambiguous-retained-no-retry') from None
            finally:
                COMMAND_DEADLINE = old_deadline
                for s, handler in previous.items():
                    signal.signal(s, handler)
            try:
                producers_absent()
                rollback.unlink()
                env_snapshot.unlink()
                require(not rollback.exists() and not env_snapshot.exists(), 'cleanup-ambiguous')
            except BaseException:
                raise Stop('rollback-verified-cleanup-ambiguous-no-retry') from None
        raise Stop('deployment-failed-rollback-verified-no-retry') from None
    # Keep private journal until all secret snapshots are demonstrably removed.
    producers_absent()
    rollback.unlink()
    env_snapshot.unlink()
    require(not rollback.exists() and not env_snapshot.exists(), 'cleanup-ambiguous')
    journal.unlink()
    directory.rmdir()
    require(not directory.exists(), 'cleanup-ambiguous')


def main() -> int:
    global COMMAND_DEADLINE
    directory = None
    lock_fd = None
    try:
        require(len(sys.argv) == 5, 'arguments')
        sha, approval_hash, run_id, attempt = sys.argv[1:]
        require(SHA.fullmatch(sha) is not None and HASH.fullmatch(approval_hash) is not None,
                'argument-binding')
        require(pwd.getpwuid(os.geteuid()).pw_name == 'appuser', 'operator-account')
        require(not any(k.startswith(('DIIS_TEST_', 'ALLOW_TEST_')) or k == 'DIIS_W10D_TEST_ROOT'
                        for k in os.environ), 'test-controls-forbidden')
        for sig in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, lambda *_: (_ for _ in ()).throw(Stop('interrupted')))
        raw = private_read(APPROVAL)
        require(digest(raw) == approval_hash, 'approval-byte-binding')
        p = validate(decode(raw), sha, int(time.time()))
        COMMAND_DEADLINE = min(time.time() + 600, p['expires'] - 300)
        require(re.fullmatch(r'[1-9][0-9]*',run_id) is not None and attempt == '1', 'run-binding')
        require('PG_BACKUP_IMAGE' not in os.environ
                or os.environ['PG_BACKUP_IMAGE'] == p['backupImage'], 'inherited-image-conflict')
        host = Host(p)
        host.run_id = run_id
        host.preflight()  # no writes, not even lock bootstrap
        require(STATE.resolve(strict=True) == STATE, 'state-path')
        lock_fd = os.open(STATE / 'deploy.lock', os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK)
        meta = os.fstat(lock_fd)
        require(stat.S_ISREG(meta.st_mode) and meta.st_uid == os.geteuid()
                and stat.S_IMODE(meta.st_mode) == 0o600 and meta.st_nlink == 1, 'lock-mode')
        deadline = time.monotonic() + 60
        while True:
            try:
                fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                require(time.monotonic() < deadline, 'lock-timeout')
                time.sleep(.1)
        require(private_read(APPROVAL) == raw, 'approval-drift')
        require(identity(os.stat(STATE / 'deploy.lock')) == identity(meta), 'lock-replaced')
        host.preflight()
        # A permanent non-secret receipt consumes the approval before mutation.
        # This avoids requiring a future GitHub run ID at Director ratification.
        receipt = STATE / ('staging-consumed-' + p['approvalId'] + '.json')
        write_exclusive(receipt, canonical({'approvalSha256':approval_hash,'runId':run_id,
                                          'sourceSha':sha,'retry':'prohibited'}))
        directory = STATE / ('staging-attempt-' + p['approvalId'])
        directory.mkdir(mode=0o700)
        transaction(host, directory)
    except BaseException as exc:
        reason = str(exc) if isinstance(exc, Stop) else 'operation-failed'
        retained = directory is not None and directory.exists()
        print('STAGING_STOP reason=' + reason + ' retry=prohibited retained=' + str(int(retained)),
              file=sys.stderr)
        return 74 if retained or isinstance(exc, ProducerAmbiguous) or OWNED_PRODUCERS else 65
    finally:
        COMMAND_DEADLINE = None
        if lock_fd is not None:
            os.close(lock_fd)
    print('STAGING_COMPLETE source=' + sha)
    return 0


if __name__ == '__main__':
    sys.exit(main())
