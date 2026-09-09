#!/usr/bin/env python3
"""Synthetic workload measurement against the pre-authorized isolated lab only."""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'infrastructure/deploy'))
import capacity_runtime as r
import capacity_policy as p
import capacity_bundle as b


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--profile', required=True)
    args = parser.parse_args()
    backend = r.Backend(r.private_json(args.profile))
    p.require(backend.disposable, 'lab-only')
    task = backend.root
    context = task / ('workload-' + str(time.time_ns()))
    context.mkdir(mode=0o700)
    b.write(context / 'Dockerfile', b'FROM scratch\nCOPY payload /synthetic-private\n')
    b.write(context / 'payload', os.urandom(32 * 1024 ** 2))
    outer = [backend.profile['docker']]
    child = backend.profile['containerId']
    nested_context = '/tmp/' + context.name
    subprocess.run(outer + ['cp', str(context), child + ':' + nested_context], check=True, timeout=30)
    rows = []

    def probe_writer():
        start = time.monotonic()
        value = hashlib.sha256()
        for _ in range(8):
            value.update((context / 'payload').read_bytes())
        return {'seconds': time.monotonic() - start, 'readBytes': 256 * 1024 ** 2,
                'digest': value.hexdigest(), 'scope': 'local-synthetic-read-proxy-not-production-backup'}

    for phase in ('cold', 'warm', 'warm-with-reader'):
        start = time.monotonic()
        minimum_free = backend.space()[1]
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            reader = executor.submit(probe_writer) if phase == 'warm-with-reader' else None
            process = subprocess.Popen(backend.docker + ['buildx', 'build', '--network=none', '--progress=plain',
                                        '--output=type=local,dest=/tmp/export-' + context.name, nested_context],
                                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            until = time.monotonic() + 90
            while process.poll() is None:
                p.require(time.monotonic() < until, 'build-timeout')
                minimum_free = min(minimum_free, backend.space()[1])
                time.sleep(0.02)
            raw = process.communicate(timeout=5)[0]
            p.require(process.returncode == 0 and len(raw) < 1024 ** 2, 'build-failed')
            p.require(phase != 'cold' or b'CACHED' not in raw, 'cold-cache-not-cold')
            rows.append({'phase': phase, 'seconds': time.monotonic() - start,
                         'minimumFreeBytesSampled': minimum_free, 'cachedSteps': raw.count(b'CACHED'),
                         'outputSha256': p.digest(raw), 'reader': reader.result() if reader else None})
    b.write(task / ('measure-' + str(time.time_ns()) + '.json'), p.canonical({
        'schema': 'diis-synthetic-build-measurement-v1', 'rows': rows,
        'samplingNotContinuousPeak': True, 'datasetBytes': 32 * 1024 ** 2,
        'filesystem': backend.space(), 'identity': backend.identity()}))
    print(p.canonical(rows).decode())


if __name__ == '__main__':
    main()
