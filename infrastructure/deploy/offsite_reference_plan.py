#!/usr/bin/env python3
"""Offline shared-blob reference planner. No networking, subprocess or deletion."""
import argparse
import base64
import importlib.util
from pathlib import Path
import re
import sys

import capacity_policy as p

VALIDATOR = Path(__file__).resolve().parents[2] / 'scripts/w10d_completion_validation.py'
spec = importlib.util.spec_from_file_location('capacity_completion', VALIDATOR)
completion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(completion)
PREFIX = 'objects/blobs/'


def raw64(value, maximum):
    p.require(type(value) is str and len(value) <= (maximum + 2) * 4 // 3, 'encoded-size')
    try:
        raw = base64.b64decode(value, validate=True)
    except ValueError as error:
        raise p.Rejected('invalid-base64') from error
    p.require(len(raw) <= maximum, 'decoded-size')
    return raw


def plan(packet):
    p.require(type(packet) is dict and set(packet) == {'schema', 'scope', 'complete', 'observedAt',
              'graceSeconds', 'originFingerprint', 'points', 'inventory', 'inProgress'}, 'planner-schema')
    p.require(packet['schema'] == 'diis-offsite-reference-input-v1' and packet['complete'] is True
              and packet['scope'] == PREFIX and p.HASH.fullmatch(packet['originFingerprint']), 'inventory-incomplete')
    now = p.timestamp(packet['observedAt'])
    grace = p.uint(packet['graceSeconds'], 72 * 3600, 365 * 86400) * 10 ** 9
    p.require(type(packet['inventory']) is list and len(packet['inventory']) <= 100000
              and type(packet['points']) is list and len(packet['points']) <= 10000
              and type(packet['inProgress']) is list, 'inventory-bound')
    inventory = {}
    for item in packet['inventory']:
        p.require(type(item) is dict and set(item) == {'key', 'sha256', 'bytes', 'modifiedAt', 'protected'}, 'blob-schema')
        key = item['key']
        p.require(type(key) is str and re.fullmatch(re.escape(PREFIX) + '[a-f0-9]{64}', key)
                  and key == PREFIX + item['sha256'] and key not in inventory, 'blob-scope-identity')
        p.uint(item['bytes'])
        p.require(type(item['protected']) is bool and p.timestamp(item['modifiedAt']) <= now, 'blob-metadata')
        inventory[key] = item
    referenced, point_ids = set(), set()
    for point in packet['points']:
        p.require(type(point) is dict and set(point) == {'objectName', 'completionBase64', 'sidecarBase64',
                  'objectManifestBase64'}, 'point-schema')
        value, _, _, _ = completion.validate_completion_bytes(
            raw64(point['completionBase64'], 128 * 1024), raw64(point['sidecarBase64'], 4096), point['objectName'])
        p.require(value['backupId'] not in point_ids and value['offsiteConfigFingerprint'] == packet['originFingerprint'],
                  'point-binding')
        point_ids.add(value['backupId'])
        raw = raw64(point['objectManifestBase64'], 8 * 1024 ** 2)
        p.require(p.digest(raw) == value['objectManifestSha256'], 'object-manifest-hash')
        names, count = set(), 0
        lines = raw.splitlines()
        p.require(lines and lines[0] == ('diis-object-manifest-v1|' + value['backupId'] + '|exact').encode(),
                  'object-manifest-header')
        for line in lines[1:]:
            fields = line.decode('ascii').split('|')
            p.require(len(fields) == 3 and p.HASH.fullmatch(fields[0]) and fields[1].isdecimal(), 'object-manifest-row')
            size = p.uint(int(fields[1]))
            name = raw64(fields[2], 4096)
            p.require(name and b'\x00' not in name and name not in names and not name.startswith(b'/')
                      and b'..' not in name.split(b'/'), 'object-manifest-name')
            names.add(name)
            key = PREFIX + fields[0]
            p.require(key in inventory and inventory[key]['bytes'] == size, 'missing-or-mismatched-reference')
            referenced.add(key)
            count += 1
        p.require(count == value['objectCount'], 'object-manifest-count')
    p.require(len(set(packet['inProgress'])) == len(packet['inProgress'])
              and all(key in inventory for key in packet['inProgress']), 'inprogress-unknown')
    unknown = set(packet['inProgress'])
    for key, item in inventory.items():
        if item['protected'] or now - p.timestamp(item['modifiedAt']) < grace:
            unknown.add(key)
    candidate = set(inventory) - referenced - unknown

    def group(keys):
        return {'count': len(keys), 'bytes': sum(inventory[key]['bytes'] for key in keys),
                'setSha256': p.digest(sorted(keys))}
    return {'schema': 'diis-offsite-reference-plan-v1', 'status': 'DRY_RUN_ONLY_NOT_DELETE_APPROVAL',
            'inputSha256': p.digest(packet), 'referenced': group(referenced),
            'unknownOrProtected': group(unknown - referenced), 'candidateUnreferenced': group(candidate),
            'remoteCalls': 0, 'deletions': 0}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    args = parser.parse_args()
    try:
        result = plan(p.decode(p.local_input(args.input)))
    except (ValueError, OSError, UnicodeError, KeyError):
        print('REFERENCE_PLAN_REJECTED', file=sys.stderr)
        return 65
    print(p.canonical(result).decode())
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
