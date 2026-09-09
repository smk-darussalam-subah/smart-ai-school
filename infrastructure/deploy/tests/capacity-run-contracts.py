#!/usr/bin/env python3
"""Local scoped regression runner with an immutable machine-readable receipt."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[3]
COMMANDS = [
    ['python3', '-B', 'infrastructure/deploy/tests/capacity-lifecycle-contract.py'],
    ['python3', '-B', 'infrastructure/deploy/tests/buildkit-capacity-adapter-contract.py'],
    ['bash', 'infrastructure/docker/tests/recovery-operator-contract.sh'],
    ['bash', 'infrastructure/docker/tests/backup-contract.sh'],
    ['python3', '-B', 'infrastructure/deploy/tests/source-closure-contract.py'],
    ['python3', '-B', 'infrastructure/deploy/tests/staging-readiness-contract.py'],
    ['bash', 'infrastructure/deploy/tests/deploy-lock-contract.sh'],
    ['bash', 'infrastructure/deploy/tests/shared-ingress-contract.sh'],
    ['python3', '-B', 'infrastructure/deploy/verify-source-closure-handoff.py'],
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--focused', action='store_true')
    args = parser.parse_args()
    output = Path(args.output)
    if output.exists() or output.is_symlink():
        raise ValueError('output-exists')
    results = []
    for command in (COMMANDS[:1] if args.focused else COMMANDS):
        start = time.time()
        value = subprocess.run(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=600)
        raw = value.stdout
        if len(raw) > 16 * 1024 ** 2:
            raise ValueError('output-too-large')
        text = raw.decode('utf-8', errors='replace')
        count = re.findall(r'^Ran ([0-9]+) tests? in ', text, re.M) or re.findall(r'^1\.\.([0-9]+)$', text, re.M)
        log = output.parent / (output.stem + '-' + str(len(results)) + '.log')
        with log.open('xb') as stream:
            stream.write(raw)
        item = {'command': command, 'startedEpoch': start, 'seconds': time.time() - start,
                'exitCode': value.returncode, 'cases': int(count[-1]) if count else None,
                'outputSha256': hashlib.sha256(raw).hexdigest(),
                'sourceSha256': hashlib.sha256((ROOT / command[-1]).read_bytes()).hexdigest()}
        results.append(item)
        print(json.dumps(item), flush=True)
    with output.open('x', encoding='utf-8') as stream:
        json.dump({'schema': 'diis-capacity-regression-receipt-v1', 'results': results}, stream, indent=2)
    return 0 if all(row['exitCode'] == 0 for row in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
