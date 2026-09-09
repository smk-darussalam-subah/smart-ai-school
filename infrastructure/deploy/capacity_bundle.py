#!/usr/bin/env python3
"""Literal private bundle. No credentials, installed packages, images or app copy."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
import types

# Literal transitive dependency closure, preserving paths required by the helpers.
FILES = (
    'infrastructure/deploy/diis-build-cache-cleanup.sh',
    'infrastructure/deploy/capacity_bundle.py',
    'infrastructure/deploy/capacity_policy.py',
    'infrastructure/deploy/capacity_runtime.py',
    'infrastructure/deploy/capacity_gc.py',
    'infrastructure/deploy/capacity-gc.candidate.json',
    'infrastructure/deploy/offsite_reference_plan.py',
    'infrastructure/deploy/staging-readiness-deploy.py',
    'infrastructure/deploy/staging-application-deploy.py',
    'infrastructure/deploy/install-w10d-backup-lock-bootstrap.sh',
    'infrastructure/systemd/diis-backup-lock.conf',
    'infrastructure/docker/scripts/backup-lib.sh',
    'scripts/w10d-test-boundary.sh',
    'scripts/w10d_completion_validation.py',
)


def require(condition, code):
    if not condition:
        raise ValueError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def identity(meta):
    # Reads may update atime. That is not content/ownership drift.
    return (meta.st_dev, meta.st_ino, meta.st_size, meta.st_mtime_ns, meta.st_ctime_ns,
            meta.st_mode, meta.st_uid, meta.st_gid, meta.st_nlink)


def read(root, relative, private=True):
    require(relative in FILES or relative == 'bundle.json', 'bundle-path')
    root = Path(root)
    require(root.is_absolute() and root.resolve(strict=True) == root, 'bundle-root')
    path = root / relative
    cursor = path.parent
    while True:
        meta = cursor.lstat()
        require(stat.S_ISDIR(meta.st_mode) and not cursor.is_symlink(), 'bundle-directory')
        if private:
            require(meta.st_uid == os.geteuid() and stat.S_IMODE(meta.st_mode) == 0o700, 'bundle-owner-mode')
        if cursor == root:
            break
        cursor = cursor.parent
    meta = path.lstat()
    require(stat.S_ISREG(meta.st_mode) and meta.st_nlink == 1 and meta.st_size < 2 * 1024 ** 2, 'bundle-file')
    if private:
        require(meta.st_uid == os.geteuid() and stat.S_IMODE(meta.st_mode) == 0o600, 'bundle-file-mode')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        require(identity(os.fstat(fd)) == identity(meta), 'bundle-file-race')
        raw = os.read(fd, 2 * 1024 ** 2)
        require(identity(os.fstat(fd)) == identity(meta) and identity(path.lstat()) == identity(meta)
                and len(raw) == meta.st_size, 'bundle-file-drift')
        return raw
    finally:
        os.close(fd)


def write(path, raw):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())


def pairs(items):
    value = {}
    for key, item in items:
        require(key not in value, 'duplicate-key')
        value[key] = item
    return value


def verify(root, expected):
    raw = read(root, 'bundle.json')
    require(sha(raw) == expected, 'external-bundle-hash')
    manifest = json.loads(raw, object_pairs_hook=pairs)
    require(type(manifest) is dict and set(manifest) == {'schema', 'status', 'sourceSha', 'sourceTree', 'files'}
            and manifest['schema'] == 'diis-capacity-bundle-v1'
            and manifest['status'] in ('UNRELEASED', 'RELEASED')
            and re.fullmatch('[a-f0-9]{40}', manifest['sourceSha'])
            and re.fullmatch('[a-f0-9]{40}', manifest['sourceTree']), 'bundle-schema')
    require(type(manifest['files']) is dict and set(manifest['files']) == set(FILES), 'bundle-manifest')
    discovered = set()
    for directory, dirs, files in os.walk(root, followlinks=False):
        require(all(not (Path(directory) / name).is_symlink() for name in dirs), 'bundle-symlink')
        discovered.update((Path(directory) / name).relative_to(root).as_posix() for name in files)
    require(discovered == set(FILES) | {'bundle.json'}, 'bundle-extra-or-missing')
    for relative, expected_hash in manifest['files'].items():
        require(sha(read(root, relative)) == expected_hash, 'bundle-helper-hash')
    return manifest


def build(source, output, source_sha, source_tree):
    require(re.fullmatch('[a-f0-9]{40}', source_sha) and re.fullmatch('[a-f0-9]{40}', source_tree), 'source-binding')
    output.mkdir(mode=0o700)  # no overwrite or merge of an existing directory
    hashes = {}
    for relative in FILES:
        raw = read(source, relative, private=False)
        target = output / relative
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        # pathlib parents use umask, so explicitly constrain ONLY our new bundle.
        for parent in target.parents:
            if parent == output.parent:
                break
            parent.chmod(0o700)
        write(target, raw)
        hashes[relative] = sha(raw)
    manifest = {'schema': 'diis-capacity-bundle-v1', 'status': 'UNRELEASED', 'sourceSha': source_sha,
                'sourceTree': source_tree, 'files': hashes}
    write(output / 'bundle.json', canonical(manifest))
    identity = sha(canonical(manifest))
    verify(output, identity)
    return identity


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    create = sub.add_parser('build')
    create.add_argument('--source', required=True)
    create.add_argument('--output', required=True)
    create.add_argument('--source-sha', required=True)
    create.add_argument('--source-tree', required=True)
    for name in ('verify', 'run'):
        command = sub.add_parser(name)
        command.add_argument('--root', required=True)
        command.add_argument('--sha256', required=True)
        if name == 'run':
            command.add_argument('runtime_args', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    try:
        if args.command == 'build':
            result = build(Path(args.source), Path(args.output), args.source_sha, args.source_tree)
            print('UNRELEASED bundleSha256=' + result)
            return 0
        manifest = verify(Path(args.root), args.sha256)
        if args.command == 'verify':
            print('BUNDLE_VALID files=' + str(len(FILES)))
            return 0
        args.runtime_args = args.runtime_args[1:] if args.runtime_args[:1] == ['--'] else args.runtime_args
        # Execute the exact verified snapshots, not paths reopened after verification.
        snapshots = {relative: read(Path(args.root), relative) for relative in FILES}
        require(all(sha(raw) == manifest['files'][relative] for relative, raw in snapshots.items()), 'bundle-load-drift')
        sys.dont_write_bytecode = True
        directory = Path(args.root) / 'infrastructure/deploy'
        modules = [('capacity_policy', 'capacity_policy.py'),
                   ('diis_staging_core', 'staging-readiness-deploy.py'),
                   ('diis_capacity_guardian', 'staging-application-deploy.py'),
                   ('capacity_runtime', 'capacity_runtime.py')]
        for name, filename in modules:
            module = types.ModuleType(name)
            module.__file__ = str(directory / filename)
            sys.modules[name] = module
            exec(compile(snapshots['infrastructure/deploy/' + filename], module.__file__, 'exec'), module.__dict__)
        runtime = sys.modules['capacity_runtime']
        sys.argv = ['capacity_runtime'] + args.runtime_args
        return runtime.main(args.sha256, manifest['sourceSha'], released=manifest['status'] == 'RELEASED')
    except (ValueError, OSError, KeyError, IndexError) as error:
        print('BUNDLE_REJECTED reason=' + (str(error) if isinstance(error, ValueError) else 'input-failed'), file=sys.stderr)
        return 65


if __name__ == '__main__':
    raise SystemExit(main())
