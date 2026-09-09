#!/usr/bin/env python3
"""Pure, fail-closed capacity selection; no Docker or deletion in this module."""
import hashlib
import json
import re
import os
import stat
from pathlib import Path
from datetime import datetime, timezone

GIB = 1024 ** 3
MAX_INT = 2 ** 63 - 1
MAX_RECORDS = 4096
ID = re.compile(r'[a-z0-9]{12,64}\Z')
HASH = re.compile(r'[a-f0-9]{64}\Z')
STAMP = re.compile(r'(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)\Z')
RECORD_KEYS = {'id', 'parents', 'size', 'inUse', 'shared', 'mutable', 'type', 'createdAt', 'lastUsedAt'}
POLICY_KEYS = {'schema', 'minAgeSeconds', 'cutoff', 'minimumFreeBytes', 'minimumFreePercent',
               'reservedLogicalBytes', 'marginBytes', 'maximumSeconds'}


class Rejected(ValueError):
    pass


def require(condition, code):
    if not condition:
        raise Rejected(code)


def pairs(items):
    value = {}
    for key, item in items:
        require(key not in value, 'duplicate-json-key')
        value[key] = item
    return value


def decode(raw):
    require(isinstance(raw, bytes) and 0 < len(raw) <= 16 * 1024 ** 2, 'input-size')
    try:
        return json.loads(raw.decode('utf-8'), object_pairs_hook=pairs,
                          parse_constant=lambda _: require(False, 'non-finite-number'))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise Rejected('invalid-json') from error


def local_input(filename):
    path = Path(filename)
    require(path.is_absolute() and path.resolve(strict=True) == path, 'local-input-path')
    meta = path.lstat()
    require(stat.S_ISREG(meta.st_mode) and meta.st_nlink == 1 and meta.st_size <= 16 * 1024 ** 2,
            'local-input-type-size')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        raw = os.read(fd, 16 * 1024 ** 2 + 1)
        after = os.fstat(fd)
        require((meta.st_dev, meta.st_ino, meta.st_size, meta.st_mtime_ns, meta.st_ctime_ns)
                == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
                'local-input-drift')
        return raw
    finally:
        os.close(fd)


def growth_projection(points, target_free_bytes):
    require(type(points) is list and len(points) <= 10000, 'history-bound')
    previous = None
    for point in points:
        require(type(point) is dict and set(point) == {'observedAt', 'usedBytes', 'totalBytes'}, 'history-schema')
        moment = timestamp(point['observedAt'])
        uint(point['usedBytes'], 0, uint(point['totalBytes'], 1))
        require(previous is None or moment > previous, 'history-order')
        previous = moment
    if len(points) < 3 or timestamp(points[-1]['observedAt']) - timestamp(points[0]['observedAt']) < 7 * 86400 * 10 ** 9:
        return {'status': 'INSUFFICIENT_HISTORY', 'growthBytesPerDay': None, 'daysUntilFloor': None}
    require(len({point['totalBytes'] for point in points}) == 1, 'history-filesystem-resized')
    days = (timestamp(points[-1]['observedAt']) - timestamp(points[0]['observedAt'])) / (86400 * 10 ** 9)
    growth = (points[-1]['usedBytes'] - points[0]['usedBytes']) / days
    free = points[-1]['totalBytes'] - points[-1]['usedBytes']
    return {'status': 'OBSERVED_NOT_FORECAST_GUARANTEE', 'growthBytesPerDay': growth,
            'daysUntilFloor': max(0, (free - target_free_bytes) / growth) if growth > 0 else None}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else canonical(value)).hexdigest()


def uint(value, minimum=0, maximum=MAX_INT):
    require(type(value) is int and minimum <= value <= maximum, 'integer-range')
    return value


def timestamp(value):
    require(type(value) is str and STAMP.fullmatch(value), 'timestamp')
    match = STAMP.fullmatch(value)
    try:
        moment = datetime.fromisoformat(match[1] + match[3].replace('Z', '+00:00'))
        seconds = int(moment.timestamp())
    except ValueError as error:
        raise Rejected('timestamp') from error
    require(seconds > 0, 'timestamp-range')
    return seconds * 10 ** 9 + int((match[2] or '').ljust(9, '0'))


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def validate_policy(policy, observed_at, disposable=False):
    require(type(policy) is dict and set(policy) == POLICY_KEYS
            and policy['schema'] == 'diis-capacity-policy-v1', 'policy-schema')
    age = uint(policy['minAgeSeconds'], 1, 365 * 86400)
    if not disposable:
        require(age in (48 * 3600, 72 * 3600, 7 * 86400), 'production-age-policy')
    observed = timestamp(observed_at)
    cutoff = timestamp(policy['cutoff'])
    require(cutoff <= observed - age * 10 ** 9, 'cutoff-too-recent')
    uint(policy['minimumFreeBytes'], 1 if disposable else 24 * GIB)
    uint(policy['minimumFreePercent'], 1 if disposable else 25, 90)
    uint(policy['reservedLogicalBytes'], 0 if disposable else 8 * GIB)
    uint(policy['marginBytes'], 0 if disposable else 2 * GIB)
    uint(policy['maximumSeconds'], 5, 900)
    return cutoff


def normalize_records(rows, observed_at):
    require(type(rows) is list and len(rows) <= MAX_RECORDS, 'record-count')
    now = timestamp(observed_at)
    result = {}
    total = 0
    for row in rows:
        require(type(row) is dict and set(row) == RECORD_KEYS, 'record-schema')
        key = row['id']
        require(type(key) is str and ID.fullmatch(key) and key not in result, 'record-id')
        total += uint(row['size'])
        uint(total)
        require(all(type(row[flag]) is bool for flag in ('inUse', 'shared', 'mutable')), 'record-flags')
        require(row['type'] in ('regular', 'source.local', 'source.git.checkout', 'exec.cachemount',
                                'internal', 'frontend'), 'record-type')
        require(type(row['parents']) is list and len(row['parents']) <= MAX_RECORDS
                and all(type(item) is str and ID.fullmatch(item) for item in row['parents'])
                and len(set(row['parents'])) == len(row['parents'])
                and key not in row['parents'], 'record-parents')
        # Unknown last use is never silently replaced by creation time.
        created = timestamp(row['createdAt'])
        used = None if row['lastUsedAt'] is None else timestamp(row['lastUsedAt'])
        require(created <= now and (used is None or created <= used <= now), 'record-time-order')
        result[key] = {**row, 'parents': sorted(row['parents'])}
    require(all(parent in result for row in result.values() for parent in row['parents']), 'missing-parent')
    visiting, visited = set(), set()

    def visit(key):
        require(key not in visiting, 'parent-cycle')
        if key in visited:
            return
        visiting.add(key)
        for parent in result[key]['parents']:
            visit(parent)
        visiting.remove(key)
        visited.add(key)
    try:
        for key in result:
            visit(key)
    except RecursionError as error:
        raise Rejected('parent-depth') from error
    return result


def select(snapshot, policy, explicit_protected, disposable=False):
    require(type(snapshot) is dict and set(snapshot) == {'schema', 'identity', 'observedAt', 'records',
                                                       'totalBytes', 'freeBytes', 'noTouchSha256',
                                                       'preservationSha256'}, 'snapshot-schema')
    require(snapshot['schema'] == 'diis-capacity-snapshot-v1', 'snapshot-version')
    cutoff = validate_policy(policy, snapshot['observedAt'], disposable)
    total = uint(snapshot['totalBytes'], 1)
    free = uint(snapshot['freeBytes'], 0, total)
    records = normalize_records(snapshot['records'], snapshot['observedAt'])
    require(type(explicit_protected) is list and len(set(explicit_protected)) == len(explicit_protected)
            and all(key in records for key in explicit_protected), 'protected-set')
    for key in ('noTouchSha256', 'preservationSha256'):
        require(type(snapshot[key]) is str and HASH.fullmatch(snapshot[key]), 'snapshot-hash')
    protected = set(explicit_protected)
    for key, row in records.items():
        if row['inUse'] or row['shared'] or row['type'] in ('internal', 'frontend'):
            protected.add(key)
        if row['lastUsedAt'] is None or timestamp(row['lastUsedAt']) > cutoff:
            protected.add(key)
    # The transitive parent closure of EVERY retained record remains protected.
    pending = list(protected)
    while pending:
        for parent in records[pending.pop()]['parents']:
            if parent not in protected:
                protected.add(parent)
                pending.append(parent)
    candidates = [records[key] for key in sorted(set(records) - protected)]
    logical = sum(item['size'] for item in candidates)
    private_total = sum(item['size'] for item in records.values() if not item['shared'])
    # A lower-bound on physical reclamation cannot be inferred from logical records.
    logical_budget = max(0, private_total - policy['reservedLogicalBytes'] - policy['marginBytes'])
    target = max(policy['minimumFreeBytes'], (total * policy['minimumFreePercent'] + 99) // 100)
    stable = {'identity': snapshot['identity'], 'policy': policy, 'policySha256': digest(policy),
              'records': [records[key] for key in sorted(records)], 'candidates': candidates,
              'protected': sorted(protected), 'noTouchSha256': snapshot['noTouchSha256'],
              'preservationSha256': snapshot['preservationSha256'], 'totalBytes': total,
              'effectiveTargetBytes': target}
    return {'schema': 'diis-capacity-candidate-v1', 'observedAt': snapshot['observedAt'],
            'expiresEpoch': timestamp(snapshot['observedAt']) // 10 ** 9 + 600,
            'stable': stable, 'candidateSha256': digest(stable), 'freeBytes': free,
            'logicalEligibleBytes': logical, 'logicalBudgetBytes': logical_budget,
            'guaranteedPhysicalReclaimBytes': 0, 'targetMet': free >= target,
            'cleanupAuthorized': False}


def id_filter(ids):
    require(0 < len(ids) <= MAX_RECORDS and len(ids) == len(set(ids))
            and all(type(key) is str and ID.fullmatch(key) for key in ids), 'action-ids')
    value = 'id~=^(' + '|'.join(re.escape(key) for key in sorted(ids)) + ')$'
    require(len(value) < 120000, 'action-filter-size')
    return value
