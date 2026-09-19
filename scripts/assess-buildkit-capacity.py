#!/usr/bin/env python3
"""Offline, non-authorizing assessment of one redacted BuildKit observation."""
import argparse
import calendar
import datetime as dt
import hashlib
import json
import re
import sys

CAP = 16 * 1024 * 1024
MAX = (1 << 63) - 1
GIB = 1 << 30
RESERVE = 8 * GIB
MARGIN = 2 * GIB
VERSIONS = {
    'schema': 'diis-buildkit-redacted-fixture-v2',
    'engineVersion': '29.5.2', 'engineCommit': '568f755', 'engineApi': '1.53',
    'buildkitVersion': 'v0.30.0',
    'buildx': 'github.com/docker/buildx v0.34.0 3e73561e39785683b31b05eeab1ef645be44ca42',
    'buildxSha256': 'bac6d4838cc38b22ef5975beaadd67ab093c409d595bbae0481ca38ba978aab2',
}
TYPES = {'regular', 'internal', 'frontend', 'source.local', 'source.git.checkout',
         'exec.cachemount'}


def require(condition):
    if not condition:
        raise ValueError('observation-rejected')


def exact(value, keys):
    require(type(value) is dict and set(value) == set(keys))


def integer(value):
    require(type(value) is int and 0 <= value <= MAX)
    return value


def digest(value):
    require(type(value) is str and re.fullmatch('[0-9a-f]{64}', value) is not None)
    require(value != '0' * 64)


def timestamp(value):
    require(type(value) is str and len(value) <= 40)
    require(re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|\+00:00)', value) is not None)
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.year >= 2000)
    fraction = re.search(r'\.(\d+)', value)
    nanos = int(fraction.group(1).ljust(9, '0')) if fraction else 0
    return calendar.timegm(parsed.timetuple()) * 1000000000 + nanos


def pairs(values):
    result = {}
    for key, value in values:
        require(key not in result)
        result[key] = value
    return result


def load(raw):
    require(type(raw) is bytes and 0 < len(raw) <= CAP)
    return json.loads(raw, object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('constant')))


def assess(raw, total, free):
    total, free = integer(total), integer(free)
    require(total > 0 and free <= total)
    fixture = load(raw)
    exact(fixture, set(VERSIONS) | {'observedAt', 'beforeAfterStable', 'engineCache', 'duQueries'})
    require(all(fixture[key] == value for key, value in VERSIONS.items()))
    require(fixture['beforeAfterStable'] is True)
    observed = timestamp(fixture['observedAt'])
    rows = fixture['engineCache']
    require(type(rows) is list and 0 < len(rows) <= 100000)
    records, total_cache, eligible, count = {}, 0, 0, 0
    for row in rows:
        exact(row, {'idSha256', 'size', 'createdAt', 'lastUsedAt', 'inUse', 'shared', 'type'})
        digest(row['idSha256'])
        require(row['idSha256'] not in records)
        size = integer(row['size'])
        require(type(row['inUse']) is bool and type(row['shared']) is bool)
        require(type(row['type']) is str and row['type'] in TYPES)
        created = timestamp(row['createdAt'])
        require(created <= observed)
        last = None if row['lastUsedAt'] is None else timestamp(row['lastUsedAt'])
        require(last is None or created <= last <= observed)
        total_cache = integer(total_cache + size)
        records[row['idSha256']] = row
        # Missing last-use timestamps are deliberately excluded, even though
        # BuildKit prune permits them: this is a conservative subset estimate.
        if (last is not None and observed - last >= 3600 * 1000000000
                and not row['inUse'] and not row['shared']
                and row['type'] not in {'internal', 'frontend'}):
            eligible = integer(eligible + size)
            count += 1
    queries = fixture['duQueries']
    require(type(queries) is list and len(queries) == 2)
    for query in queries:
        exact(query, {'filters', 'rawSha256', 'records'})
        digest(query['rawSha256'])
        require(type(query['records']) is list)
    require(queries[0]['filters'] == ['until=1h', 'inuse=false', 'private=true'])
    require(queries[0]['records'] == [])
    require(queries[1]['filters'] == ['private=""'])
    selected = set()
    for row in queries[1]['records']:
        exact(row, {'idSha256', 'sizeDisplay', 'reclaimable', 'shared'})
        digest(row['idSha256'])
        require(row['idSha256'] not in selected and row['idSha256'] in records)
        require(type(row['sizeDisplay']) is str and 0 < len(row['sizeDisplay']) <= 64)
        require(all(32 <= ord(c) <= 126 for c in row['sizeDisplay']))
        require(type(row['reclaimable']) is bool and row['shared'] is False)
        require(row['reclaimable'] == (not records[row['idSha256']]['inUse']))
        selected.add(row['idSha256'])
    require(selected == {key for key, row in records.items() if not row['shared']})
    # Subtract the entire reservation, rather than treating unrelated/shared
    # bytes as guaranteed reservation coverage. Logical sizes do not promise df.
    estimate = max(0, eligible - RESERVE - MARGIN)
    target = max(24 * GIB, (total + 3) // 4)
    needed = max(0, target - free)
    return {'schema': 'diis-buildkit-offline-assessment-v1',
            'fixtureSha256': hashlib.sha256(raw).hexdigest(),
            'observedAt': fixture['observedAt'], 'engineRecordCount': len(rows),
            'privateRecordCount': len(selected), 'eligibleRecordCount': count,
            'totalLogicalCacheBytes': total_cache, 'eligibleLogicalBytes': eligible,
            'reservationBytes': RESERVE, 'marginBytes': MARGIN,
            'conservativeLogicalEstimateBytes': estimate,
            'guaranteedReclaimableBytes': 0, 'cleanupAuthorized': False,
            'capacityInputProvenance': 'separate-operator-input-not-fixture-bound',
            'filesystemTotalBytes': total, 'filesystemFreeBytes': free,
            'targetFreeBytes': target, 'additionalFreeBytesNeeded': needed,
            'estimateMeetsTarget': estimate >= needed,
            'verdict': 'OBSERVATION ONLY - CLEANUP HOLD'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--total-bytes', type=int, required=True)
    parser.add_argument('--free-bytes', type=int, required=True)
    args = parser.parse_args()
    result = assess(sys.stdin.buffer.read(CAP + 1), args.total_bytes, args.free_bytes)
    print(json.dumps(result, sort_keys=True, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, TypeError, KeyError, OverflowError, RecursionError):
        print('BUILDKIT_ASSESSMENT_REJECTED', file=sys.stderr)
        raise SystemExit(65)
