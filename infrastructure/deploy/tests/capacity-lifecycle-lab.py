#!/usr/bin/env python3
"""Director-authorized, bounded nested-daemon lab; never targets the shared engine.

Requires an already-created labelled dind container, no host bind mounts and a
private /tmp root. This harness neither provisions privilege nor downloads tools.
"""
import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'infrastructure/deploy'))
import capacity_bundle as bundle
import capacity_policy as p
import capacity_runtime as runtime

BASE = '39f1db9ba49d8c89ceb8c3e13c6850744b9294e1'
TREE = '23970b65a8e4551c37b6478bdc5da5b52445e60f'


def command(args, timeout=120):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout).stdout


def write(path, value):
    bundle.write(path, p.canonical(value) if not isinstance(value, bytes) else value)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--container-id', required=True)
    parser.add_argument('--expires', required=True, type=int)
    parser.add_argument('--root', default='/tmp/diis-capacity-20260909')
    parser.add_argument('--phase', choices=['setup', 'observe', 'transaction'], required=True)
    parser.add_argument('--case', choices=['normal', 'below', 'noop'], default='normal')
    args = parser.parse_args()
    task = Path(args.root)
    if args.phase == 'setup':
        task.mkdir(mode=0o700)
        write(task / 'lab.json', {'schema': 'diis-capacity-lab-v1', 'containerId': args.container_id,
                                  'expires': args.expires, 'ownerUid': os.geteuid()})
        (task / 'target').mkdir(mode=0o700)
        command(['git', 'init', '-q', str(task / 'target')])
        command(['git', '-C', str(task / 'target'), '-c', 'user.name=Disposable Fixture',
                 '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic baseline', '--allow-empty'])
        (task / 'backup').mkdir(mode=0o700)
        for number in range(8):
            write(task / 'backup' / ('synthetic-' + str(number) + '.sql.gz'), ('synthetic-' + str(number)).encode())
        write(task / 'backup-lib.sh', (ROOT / 'infrastructure/docker/scripts/backup-lib.sh').read_bytes())
        write(task / 'deploy.lock', b'')
        docker = Path('/usr/bin/docker').resolve(strict=True)
        profile = {'schema': 'diis-capacity-target-v1', 'kind': 'disposable', 'endpoint': runtime.PRODUCTION_SOCKET,
                   'docker': str(docker), 'dockerSha256': runtime.file_hash(docker)[0], 'root': str(task),
                   'targetCheckout': str(task / 'target'), 'filesystemPath': '/var/lib/docker',
                   'preservationRoot': str(task / 'backup'), 'backupLibrary': str(task / 'backup-lib.sh'),
                   'containerId': args.container_id, 'labExpires': args.expires}
        write(task / 'profile.json', profile)
        context = task / 'context'
        context.mkdir(mode=0o700)
        write(context / 'Dockerfile', b'FROM scratch\nCOPY payload /payload\n')
        # Incompressible data; never real records or a host-sensitive mount.
        with open(context / 'payload', 'xb') as stream:
            for _ in range(32):
                stream.write(os.urandom(1024 ** 2))
        command(['docker', 'cp', str(context), args.container_id + ':/tmp/context'])
        start = time.monotonic()
        command(['docker', 'exec', args.container_id, 'docker', 'buildx', 'build', '--network=none',
                 '--progress=plain', '--output=type=local,dest=/tmp/export', '/tmp/context'])
        duration = time.monotonic() - start
        write(task / 'build-cold.json', {'seconds': duration})
        print('LAB_SETUP_COMPLETE')
        return 0
    profile = json.loads((task / 'profile.json').read_bytes())
    if args.phase == 'observe':
        backend = runtime.Backend(profile)
        snapshot = backend.snapshot()
        write(task / 'snapshot.json', snapshot)
        old = backend.run(['buildx', 'du', '--filter', 'until=1h', '--filter', 'inuse=false',
                           '--filter', 'private=true', '--format=json'])
        new = backend.run(['buildx', 'du', '--filter', 'private=""', '--format=json'])
        aged = backend.run(['buildx', 'du', '--filter', 'private=""', '--filter', 'until=168h', '--format=json'])
        write(task / 'filter-proof.json', {'oldCount': len(old.splitlines()), 'privateCount': len(new.splitlines()),
                                          'duUntil168hCount': len(aged.splitlines()), 'duUntil168hSha256': p.digest(aged),
                                          'oldSha256': p.digest(old), 'privateSha256': p.digest(new),
                                          'identity': snapshot['identity']})
        print('LAB_OBSERVED count=' + str(len(snapshot['records'])))
        return 0
    backend = runtime.Backend(profile)
    snapshot = backend.snapshot()
    cutoff = p.utc_now()
    from datetime import datetime, timezone
    cutoff = datetime.fromtimestamp(time.time() - 2, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    target = snapshot['freeBytes'] + 16 * 1024 ** 2
    if args.case == 'below':
        target = snapshot['totalBytes'] + 1
    elif args.case == 'noop':
        target = 1
    policy = {'schema': 'diis-capacity-policy-v1', 'minAgeSeconds': 1, 'cutoff': cutoff,
              'minimumFreeBytes': target, 'minimumFreePercent': 1,
              'reservedLogicalBytes': 0, 'marginBytes': 0, 'maximumSeconds': 90}
    candidate = p.select(snapshot, policy, [], True)
    prefix = args.case + '-' + str(time.time_ns())
    identity = bundle.build(ROOT, task / ('bundle-' + prefix), BASE, TREE)
    # Exact same portable launcher as operator, outside source checkout.
    write(task / (prefix + '-policy.json'), policy)
    write(task / (prefix + '-candidate.json'), candidate)
    expires = min(int(time.time()) + 400, args.expires - 10)
    writer = {'schema': 'diis-writer-attestation-v2', 'expires': expires, 'sourceSha': BASE,
              'rootCronSha256': p.digest(b'synthetic-no-cron'), 'n8nSha256': p.digest(b'synthetic-no-n8n'),
              'preservationSha256': candidate['stable']['preservationSha256'],
              'writerInventorySha256': p.digest(b'synthetic-all-writers-use-bundled-library'),
              'backupLibrarySha256': runtime.app.PERSISTENT_WRITER_LIBRARY_SHA256,
              'allWritersUseCanonicalLock': True, 'allWritersRejectPersistentApplicationQuarantine': True,
              'quietWindowStart': int(time.time()) - 30, 'quietWindowEnd': expires,
              'nativeGcDisabled': True, 'allHostMutatorsUseCanonicalLock': True,
              'allHostMutatorsHonorBackupQuarantine': True}
    write(task / (prefix + '-writer.json'), writer)
    approval = {'schema': 'diis-capacity-approval-v1', 'operationId': uuid.uuid4().hex, 'runId': '1',
                'notBefore': int(time.time()) - 1, 'expires': expires, 'sourceSha': BASE, 'bundleSha256': identity,
                'profileSha256': p.digest(profile), 'candidateSha256': candidate['candidateSha256'],
                'policySha256': candidate['stable']['policySha256'], 'mainSha': snapshot['identity']['mainSha'],
                'mainTree': snapshot['identity']['mainTree'], 'identity': snapshot['identity'],
                'writerEvidenceSha256': p.digest(writer)}
    write(task / (prefix + '-approval.json'), approval)
    cmd = [sys.executable, '-B', str(task / ('bundle-' + prefix) / 'infrastructure/deploy/capacity_bundle.py'), 'run',
           '--root', str(task / ('bundle-' + prefix)), '--sha256', identity, '--', 'apply', '--profile', str(task / 'profile.json'),
           '--policy', str(task / (prefix + '-policy.json')), '--candidate', str(task / (prefix + '-candidate.json')), '--approval',
           str(task / (prefix + '-approval.json')), '--approval-sha256', p.digest(approval), '--writer-evidence',
           str(task / (prefix + '-writer.json')), '--output', str(task / (prefix + '-receipt.json'))]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180)
    write(task / (prefix + '-execution.json'), {'exitCode': result.returncode, 'stdout': result.stdout.decode(),
                                   'stderrSha256': p.digest(result.stderr), 'bundleSha256': identity})
    print(result.stdout.decode())
    print('LAB_TRANSACTION_EXIT=' + str(result.returncode))
    return 0 if result.returncode == (73 if args.case == 'below' else 0) else 1


if __name__ == '__main__':
    raise SystemExit(main())
