#!/usr/bin/env python3
"""Offline native Docker-driver GC candidate merge/restore. Never restarts Docker."""
import argparse
import copy
from pathlib import Path
import sys

import capacity_policy as p

PROPOSED = {'enabled': True, 'policy': [
    {'reservedSpace': '8GiB', 'maxUsedSpace': '12GiB', 'minFreeSpace': '24GiB',
     'keepDuration': '168h', 'filter': ['private=""'], 'all': False},
]}


def merge(original, proposed=PROPOSED):
    p.require(type(original) is dict, 'daemon-config-object')
    result = copy.deepcopy(original)
    builder = result.setdefault('builder', {})
    p.require(type(builder) is dict, 'builder-config-object')
    # A custom existing policy is a decision conflict, not silently replaced.
    p.require('gc' not in builder or builder['gc'] in ({'enabled': False}, proposed), 'existing-gc-conflict')
    builder['gc'] = copy.deepcopy(proposed)
    return result


def plan(raw, proposed=PROPOSED):
    original = p.decode(raw)
    candidate = merge(original, proposed)
    return {'schema': 'diis-native-gc-plan-v1', 'status': 'UNRELEASED_NOT_ACTIVE',
            'originalSha256': p.digest(raw), 'candidateSha256': p.digest(candidate),
            'candidate': candidate, 'restartRequired': True, 'driver': 'docker',
            'lockSerialized': False, 'physicalQuotaGuaranteed': False}


def restore(original_raw, current_raw, expected_current_hash, expected_original_hash):
    p.require(p.digest(current_raw) == expected_current_hash
              and p.digest(original_raw) == expected_original_hash, 'config-rollback-drift')
    p.decode(original_raw)
    p.decode(current_raw)
    return original_raw  # exact bytes, not reserialization


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--original', required=True)
    args = parser.parse_args()
    try:
        value = plan(p.local_input(args.original))
    except (ValueError, OSError):
        print('GC_PLAN_REJECTED', file=sys.stderr)
        return 65
    print(p.canonical(value).decode())
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
