#!/usr/bin/env python3
"""Read-only version-bound observation; emits only redacted cache metadata.

No prune route, files, locks, credentials or test/environment path overrides.
Run as appuser through the existing authorized operator channel.
"""
import datetime
import hashlib
import json
import os
import pwd
import selectors
import signal
import stat
import subprocess
import time

DEADLINE_SECONDS = 150
CAP = 16 * 1024 * 1024
ENV = {'PATH': '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
       'HOME': '/home/appuser', 'LANG': 'C', 'DOCKER_CONFIG': '/home/appuser/.docker',
       'DOCKER_CONTEXT': 'default'}
END = 0.0
BUILDX = '/usr/libexec/docker/cli-plugins/docker-buildx'


def install_signals():
    def interrupted(*_):
        raise ValueError('observation-interrupted')
    for sig in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, interrupted)


def decode(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise ValueError('duplicate-json-key')
            value[key] = item
        return value
    def nonfinite(_):
        raise ValueError('nonfinite-json')
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=nonfinite)


def binary_binding():
    before = os.lstat(BUILDX)
    if not stat.S_ISREG(before.st_mode) or before.st_uid != 0 or before.st_mode & 0o022:
        raise ValueError('buildx-file-metadata')
    digest = capture(['sha256sum', BUILDX]).decode().split()[0]
    after = os.lstat(BUILDX)
    def identity(value):
        return (value.st_dev, value.st_ino, value.st_size, value.st_mtime_ns,
                value.st_ctime_ns, value.st_mode, value.st_uid, value.st_gid)
    if identity(before) != identity(after):
        raise ValueError('buildx-file-drift')
    if digest != 'bac6d4838cc38b22ef5975beaadd67ab093c409d595bbae0481ca38ba978aab2':
        raise ValueError('buildx-bytes')
    return digest, identity(after)


def group_exists(pid):
    try:
        os.killpg(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def terminate_group(p):
    handlers = {sig: signal.signal(sig, signal.SIG_IGN)
                for sig in (signal.SIGHUP, signal.SIGINT, signal.SIGTERM)}
    try:
        for sig in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.killpg(p.pid, sig)
            except ProcessLookupError:
                pass
            end = time.monotonic() + 2
            while time.monotonic() < end:
                p.poll()  # reap direct child before group-absence observation
                if not group_exists(p.pid):
                    return
                time.sleep(.02)
        raise ValueError('process-cleanup-ambiguous')
    finally:
        for sig, handler in handlers.items():
            signal.signal(sig, handler)


def capture(args):
    if time.monotonic() >= END:
        raise ValueError('deadline')
    if args[:2] == ['docker', 'buildx']:
        args = [BUILDX] + args[2:]  # execute the bytes actually hashed, no plugin lookup
    p, s = None, None
    out, eof = bytearray(), False
    previous_mask = signal.pthread_sigmask(signal.SIG_BLOCK,
                                           {signal.SIGHUP, signal.SIGINT, signal.SIGTERM})
    try:
        # Defer signals until ownership is registered inside this cleanup scope.
        p = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                             env=ENV, start_new_session=True)
        s = selectors.DefaultSelector()
        s.register(p.stdout, selectors.EVENT_READ)
        signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)
        while not (eof and p.poll() is not None):
            if time.monotonic() >= END:
                raise ValueError('deadline')
            for key, _ in ([] if eof else s.select(.05)):
                chunk = os.read(key.fd, 65536)
                if not chunk:
                    eof = True
                    s.unregister(p.stdout)
                out.extend(chunk)
                if len(out) > CAP:
                    raise ValueError('capture-limit')
        if p.returncode:
            raise ValueError('producer-failed')
        if group_exists(p.pid):
            raise ValueError('descendant-remains')
        return bytes(out)
    finally:
        # Descendants retaining pipes cannot yield a successful bounded capture.
        try:
            if p is not None:
                terminate_group(p)
        finally:
            try:
                if s is not None:
                    s.close()
                if p is not None and p.stdout is not None:
                    p.stdout.close()
            finally:
                signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def cache():
    raw = capture(['curl', '--silent', '--fail', '--max-time', '30', '--unix-socket',
                   '/var/run/docker.sock', 'http://localhost/v1.53/system/df'])
    rows = decode(raw)['BuildCache']
    result = []
    for row in rows:
        result.append({'idSha256': sha(row['ID'].encode()), 'size': row['Size'],
                       'createdAt': row['CreatedAt'], 'lastUsedAt': row.get('LastUsedAt'),
                       'inUse': row['InUse'], 'shared': row['Shared'], 'type': row['Type']})
    return sorted(result, key=lambda row: row['idSha256'])


def main():
    global END
    END = time.monotonic() + DEADLINE_SECONDS
    install_signals()
    if pwd.getpwuid(os.geteuid()).pw_name != 'appuser':
        raise ValueError('operator')
    endpoint = capture(['docker', 'context', 'inspect', 'default', '--format',
                        '{{.Endpoints.docker.Host}}']).strip()
    if endpoint != b'unix:///var/run/docker.sock':
        raise ValueError('endpoint')
    version = decode(capture(['docker', 'version', '--format', '{{json .Server}}']))
    binary, binary_identity = binary_binding()
    buildx = capture(['docker', 'buildx', 'version']).decode().strip()
    if version['Version'] != '29.5.2' or version['GitCommit'] != '568f755':
        raise ValueError('engine-version')
    if buildx != 'github.com/docker/buildx v0.34.0 3e73561e39785683b31b05eeab1ef645be44ca42':
        raise ValueError('buildx-version')
    if binary != 'bac6d4838cc38b22ef5975beaadd67ab093c409d595bbae0481ca38ba978aab2':
        raise ValueError('buildx-bytes')
    # Only extract the engine's BuildKit version, never worker labels/hostnames.
    inspection = capture(['docker', 'buildx', 'inspect', 'default']).decode()
    if ('Driver:        docker\n' not in inspection or
            inspection.count('Endpoint:') != 1 or 'Endpoint:         default\n' not in inspection):
        raise ValueError('builder-endpoint')
    versions = [line.split(':', 1)[1].strip() for line in inspection.splitlines()
                if line.startswith('BuildKit version:')]
    if versions != ['v0.30.0']:
        raise ValueError('buildkit-version')
    before = cache()
    queries = []
    for filters in (['until=1h', 'inuse=false', 'private=true'], ['private=""']):
        args = ['docker', 'buildx', 'du', '--builder', 'default', '--format=json']
        for item in filters:
            args.extend(['--filter', item])
        raw = capture(args)
        rows = [decode(line) for line in raw.splitlines()]
        queries.append({'filters': filters, 'rawSha256': sha(raw), 'records': [
            {'idSha256': sha(row['ID'].encode()), 'sizeDisplay': row['Size'],
             'reclaimable': row['Reclaimable'], 'shared': row['Shared']}
            for row in rows]})
    after = cache()
    if before != after:
        raise ValueError('cache-drift')
    if binary_binding() != (binary, binary_identity):
        raise ValueError('buildx-file-drift')
    now = datetime.datetime.now(datetime.timezone.utc)
    result = {'schema': 'diis-buildkit-redacted-fixture-v2', 'observedAt': now.isoformat(),
              'engineVersion': version['Version'], 'engineCommit': version['GitCommit'],
              'engineApi': '1.53', 'buildkitVersion': 'v0.30.0', 'buildx': buildx,
              'buildxSha256': binary, 'beforeAfterStable': True, 'engineCache': before,
              'duQueries': queries}
    print(canonical(result).decode())


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('BUILDKIT_OBSERVATION_REJECTED', file=__import__('sys').stderr)
        raise SystemExit(65)
