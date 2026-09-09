#!/usr/bin/env python3
"""Final lab evidence: real replay, config rollback, GC and protected identities."""
import argparse
import concurrent.futures
import json
from pathlib import Path
import subprocess
import sys
import time
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'infrastructure/deploy'))
import capacity_policy as p
import capacity_runtime as r
import capacity_bundle as b
import capacity_gc as gc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--profile', required=True)
    args = parser.parse_args()
    backend = r.Backend(r.private_json(args.profile))
    p.require(backend.disposable, 'lab-only')
    task, child = backend.root, backend.profile['containerId']
    outer = [backend.profile['docker']]
    end = min(backend.profile['labExpires'], time.time() + 480)

    def run(argv, timeout=60):
        p.require(time.time() + 2 < end, 'lab-deadline')
        result = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=min(timeout, max(1, end - time.time())))
        p.require(result.returncode == 0 and len(result.stdout) < 16 * 1024 ** 2, 'lab-command')
        return result.stdout

    def inside(argv, timeout=60):
        return run(outer + ['exec', child] + argv, timeout)

    def switch(config):
        path = ROOT / 'infrastructure/deploy/tests/fixtures' / config
        run(outer + ['cp', str(path), child + ':/tmp/next.json'])
        inside(['dockerd', '--validate', '--config-file=/tmp/next.json'])
        daemon_pid = inside(['cat', '/var/run/docker.pid']).decode().strip()
        p.require(daemon_pid.isdecimal(), 'lab-daemon-pid')
        inside(['kill', '-TERM', daemon_pid])
        until = time.monotonic() + 30
        while True:
            observed = inside(['ps', '-o', 'pid,args']).decode()
            if not any(line.split()[:1] == [daemon_pid] for line in observed.splitlines()):
                break
            p.require(time.monotonic() < until, 'lab-daemon-stop')
            time.sleep(.1)
        run(outer + ['exec', '-d', child, 'dockerd', '--config-file=/tmp/next.json'])
        until = time.monotonic() + 45
        while True:
            result = subprocess.run(outer + ['exec', child, 'docker', 'info', '--format', '{{.ServerVersion}}'],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
            if result.returncode == 0:
                p.require(result.stdout.strip() == b'29.5.2', 'lab-daemon-version')
                break
            p.require(time.monotonic() < until, 'lab-daemon-start')
            time.sleep(.2)
        return p.digest(inside(['cat', '/tmp/next.json']))

    p.require(not (task / 'final-lab-proof.json').exists(), 'lab-proof-already-exists')
    # Establish a post-restart baseline before testing GC's own restart. Docker
    # normalizes a newly created container's HostConfig.Dns from null to [] on
    # its first daemon restart. Do not weaken the operational no-touch hash.
    initial_config_sha = switch('capacity-lab-daemon.json')

    def no_touch_details():
        observed = {}
        original = p.digest
        def capture(value):
            if type(value) is dict and set(value) == {'container', 'image', 'volume', 'network'}:
                observed.update(value)
            return original(value)
        with patch.object(p, 'digest', capture):
            result = backend.no_touch()
        return result, observed

    # Real replay: same operation ID, private input and actual daemon. Zero new prune.
    approval_path = sorted(task.glob('normal-*-approval.json'))[-1]
    prefix = approval_path.name.removesuffix('-approval.json')
    approval = json.loads(approval_path.read_bytes())
    bundle_root = task / ('bundle-' + prefix)
    command = [sys.executable, '-I', '-B', str(bundle_root / 'infrastructure/deploy/capacity_bundle.py'),
               'run', '--root', str(bundle_root), '--sha256', approval['bundleSha256'], '--', 'apply',
               '--profile', str(task / 'profile.json'), '--policy', str(task / (prefix + '-policy.json')),
               '--candidate', str(task / (prefix + '-candidate.json')), '--approval', str(approval_path),
               '--approval-sha256', p.digest(approval_path.read_bytes()), '--writer-evidence',
               str(task / (prefix + '-writer.json')), '--output', str(task / ('replay-' + str(time.time_ns()) + '.json'))]
    before_cache = backend.records()
    replay = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
    p.require(replay.returncode == 65 and sorted(backend.records(), key=lambda row: row['id'])
              == sorted(before_cache, key=lambda row: row['id']), 'real-replay-not-blocked')
    p.require(not r.app.WRITER_LOCK.exists(), 'replay-lock-residue')
    before_no_touch, before_details = no_touch_details()
    before_preservation = r.preservation(backend.profile['preservationRoot'])
    before_space = backend.space()
    # Populate unshared cache again. Dataset is already a bounded synthetic context.
    inside(['docker', 'buildx', 'build', '--network=none', '--progress=plain',
            '--output=type=local,dest=/tmp/gc-export', '/tmp/context'])
    warm = backend.records()
    gc_config_sha = switch('capacity-lab-gc.json')
    inspection = inside(['docker', 'buildx', 'inspect', 'default']).decode()
    p.require('GC Policy rule#0:' in inspection and 'Reserved Space: 1MiB' in inspection, 'gc-readback')

    def reader():
        started = time.monotonic()
        raw = inside(['sh', '-c', 'dd if=/tmp/context/payload of=/dev/null bs=1M count=32 2>/dev/null; '
                      'dd if=/tmp/context/payload of=/dev/null bs=1M count=32 2>/dev/null'])
        return {'seconds': time.monotonic() - started, 'bytesRead': 64 * 1024 ** 2, 'outputSha256': p.digest(raw)}

    observations = []
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(reader)
        deadline = time.monotonic() + 90
        while True:
            rows = backend.records()
            observations.append({'seconds': time.monotonic() - started, 'count': len(rows),
                                 'logicalBytes': sum(row['size'] for row in rows), 'space': backend.space()})
            if sum(row['size'] for row in rows if not row['shared']) < sum(row['size'] for row in warm if not row['shared']):
                break
            p.require(time.monotonic() < deadline, 'gc-no-observed-reclamation')
            time.sleep(.5)
        concurrent_read = future.result(timeout=20)
    gc_no_touch, after_details = no_touch_details()
    if gc_no_touch != before_no_touch:
        b.write(task / ('gc-drift-' + str(time.time_ns()) + '.json'), p.canonical({
            'before': before_details, 'after': after_details}))
    p.require(gc_no_touch == before_no_touch and r.preservation(backend.profile['preservationRoot']) == before_preservation,
              'gc-protected-drift')
    rollback_sha = switch('capacity-lab-daemon.json')
    expected = p.digest((ROOT / 'infrastructure/deploy/tests/fixtures/capacity-lab-daemon.json').read_bytes())
    p.require(rollback_sha == expected and 'GC Policy' not in inside(['docker', 'buildx', 'inspect', 'default']).decode(),
              'gc-rollback-readback')
    backend.identity()
    result = {'schema': 'diis-capacity-final-lab-proof-v1', 'observedAt': p.utc_now(),
              'manualPreconditioningConfigSha256': initial_config_sha,
              'replayExitCode': replay.returncode, 'replayOutputSha256': p.digest(replay.stdout),
              'gcConfigurationSha256': gc_config_sha, 'gcActualInspectionSha256': p.digest(inspection.encode()),
              'gcObservations': observations, 'beforeSpace': before_space,
              'beforeLogicalBytes': sum(row['size'] for row in warm), 'concurrentSyntheticRead': concurrent_read,
              'nativeGcPruneCallsByHarness': 0, 'protectedBeforeSha256': before_no_touch,
              'protectedAfterSha256': gc_no_touch, 'preservation': before_preservation,
              'rollbackExactBytesSha256': rollback_sha, 'rollbackReadbackGcDisabled': True,
              'restartRequired': True, 'sameTmpfsNotProductionBenchmark': True}
    b.write(task / 'final-lab-proof.json', p.canonical(result))
    print(p.canonical(result).decode())


if __name__ == '__main__':
    main()
