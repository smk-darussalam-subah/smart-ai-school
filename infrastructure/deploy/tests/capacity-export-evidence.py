#!/usr/bin/env python3
"""Export only non-secret task-owned lab receipts and the literal source bundle."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import time


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--lab-root', required=True)
    parser.add_argument('--artifact-root', required=True)
    args = parser.parse_args()
    lab = Path(args.lab_root)
    assert lab.parent == Path('/tmp') and lab.name == 'diis-capacity-20260909'
    marker = json.loads((lab / 'lab.json').read_bytes())
    assert not (lab / 'backup.lock').exists()
    destination = Path(args.artifact_root)
    destination.mkdir(parents=True, exist_ok=False)
    raw_destination = destination / 'private-lab-json'
    raw_destination.mkdir(mode=0o700)
    rows = []
    permitted = ('-receipt.json', '-execution.json')
    for path in sorted(lab.glob('*.json')):
        # This is the wholly synthetic lab, never operator/provider inputs.
        # Keep exact approval/candidate/profile bytes for independent binding.
        (raw_destination / path.name).write_bytes(path.read_bytes())
        if path.name.endswith(permitted) or path.name.startswith('measure-') or path.name in (
                'filter-proof.json', 'gc-observed.json', 'final-lab-proof.json',
                'regressions-1.json', 'focused-final.json', 'receipt.json'):
            raw = path.read_bytes()
            value = json.loads(raw)
            if path.name == 'gc-observed.json':
                value['cache'] = {'count': len(value['cache']['BuildCache']),
                                  'logicalBytes': sum(row['Size'] for row in value['cache']['BuildCache'])}
            rows.append({'artifact': path.name, 'rawSha256': digest(raw), 'value': value})
    bundles = sorted(lab.glob('bundle-normal-*'), key=lambda path: path.stat().st_mtime_ns)
    chosen = bundles[-1]
    manifest_raw = (chosen / 'bundle.json').read_bytes()
    with tarfile.open(destination / 'capacity-operator-UNRELEASED.tar', 'w') as archive:
        archive.add(chosen, arcname='capacity-operator', recursive=True)
    raw_archive = (destination / 'capacity-operator-UNRELEASED.tar').read_bytes()
    evidence = {'schema': 'diis-capacity-lifecycle-evidence-v1', 'capturedEpoch': time.time(),
                'sourceBase': '39f1db9ba49d8c89ceb8c3e13c6850744b9294e1',
                'sourceBaseTree': '23970b65a8e4551c37b6478bdc5da5b52445e60f',
                'bundleSha256': digest(manifest_raw), 'bundleManifest': json.loads(manifest_raw),
                'archiveSha256': digest(raw_archive), 'archiveBytes': len(raw_archive),
                'labContainerIdSha256': digest(marker['containerId'].encode()),
                'labExpiryEpoch': marker['expires'], 'receipts': rows,
                'cleanup': {'status': 'PENDING_REMOVAL_CONFIRMATION'}}
    (destination / 'evidence-precleanup.json').write_text(json.dumps(evidence, indent=2) + '\n')
    for path in lab.glob('*.log'):
        # Synthetic contract logs only, kept out of packaging.
        (destination / path.name).write_bytes(path.read_bytes())
    print(json.dumps({'archiveSha256': evidence['archiveSha256'], 'bundleSha256': evidence['bundleSha256'],
                      'receiptCount': len(rows), 'archiveBytes': len(raw_archive)}))


if __name__ == '__main__':
    main()
