#!/usr/bin/env python3
"""Capture the exact legacy writer into private content-addressed custody.

This helper only reads the fixed backup container and installs a verified host
snapshot. It does not alter the container, mounts, schedules, or application.
"""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys
import uuid

import capacity_bundle

STATE = Path('/home/appuser/.local/state/diis-deploy')
CONTAINER = 'smk-pg-backup'
RUNTIME_PATH = '/backup.sh'
LEGACY_SHA256 = 'bc530d0a9110319684e7e4b60db56a3da1e1d979d9b1b6d8dc7887c209ff204e'
CAPTURE_HELPER = 'scripts/bounded-command-capture.py'
MAX_BYTES = 65536


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise ValueError(reason)


def directory(path: Path) -> None:
    info = path.lstat()
    require(path.resolve(strict=True) == path and stat.S_ISDIR(info.st_mode)
            and info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o700,
            'private-directory')


def exact_file(path: Path, expected: bytes) -> None:
    require(path.resolve(strict=True) == path, 'snapshot-symlink')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid()
                and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1
                and info.st_size == len(expected), 'snapshot-metadata')
        require(os.read(fd, MAX_BYTES + 1) == expected, 'snapshot-bytes')
    finally:
        os.close(fd)


def read_capture(path: Path) -> bytes:
    before = path.lstat()
    require(path.resolve(strict=True) == path and stat.S_ISREG(before.st_mode)
            and before.st_uid == os.geteuid() and stat.S_IMODE(before.st_mode) == 0o600
            and before.st_nlink == 1 and 0 < before.st_size <= MAX_BYTES,
            'capture-metadata')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        opened = os.fstat(fd)
        require((opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns,
                 opened.st_ctime_ns, opened.st_mode, opened.st_uid, opened.st_gid,
                 opened.st_nlink)
                == (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns,
                    before.st_ctime_ns, before.st_mode, before.st_uid, before.st_gid,
                    before.st_nlink), 'capture-open-race')
        raw = os.read(fd, MAX_BYTES + 1)
        after = os.fstat(fd)
        require(len(raw) == before.st_size
                and (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns,
                     after.st_ctime_ns, after.st_mode, after.st_uid, after.st_gid,
                     after.st_nlink)
                == (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns,
                    before.st_ctime_ns, before.st_mode, before.st_uid, before.st_gid,
                    before.st_nlink), 'capture-read-race')
        return raw
    finally:
        os.close(fd)


def command(argv: list[str], cap: int = 512, timeout: int = 15) -> bytes:
    result = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            timeout=timeout, check=False)
    require(result.returncode == 0 and len(result.stdout) <= cap, 'runtime-observation')
    return result.stdout


def runtime_identity() -> str:
    value = command(['docker', 'inspect', '--format', '{{.Id}}', CONTAINER]).decode().strip()
    require(re.fullmatch(r'[a-f0-9]{64}', value) is not None, 'container-identity')
    return value


def runtime_hash() -> str:
    value = command(['docker', 'exec', CONTAINER, 'sha256sum', RUNTIME_PATH]).decode().strip()
    match = re.fullmatch(r'([a-f0-9]{64})\s+/backup\.sh', value)
    require(match is not None, 'runtime-hash-output')
    return match.group(1)


def bounded_capture(helper: bytes, output: Path) -> None:
    result = subprocess.run([
        sys.executable, '-B', '-', '--output', str(output),
        '--max-bytes', str(MAX_BYTES), '--timeout-seconds', '30', '--',
        'docker', 'exec', CONTAINER, 'cat', RUNTIME_PATH,
    ], input=helper, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
       timeout=40, check=False)
    require(result.returncode == 0, 'bounded-capture')


def syntax_valid(path: Path) -> None:
    result = subprocess.run(['sh', '-n', str(path)], stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, timeout=10, check=False)
    require(result.returncode == 0, 'legacy-syntax')


def ensure_directory(path: Path) -> None:
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        pass
    directory(path)


def install(bundle: Path, bundle_sha256: str, source_sha: str) -> str:
    manifest = capacity_bundle.verify(bundle, bundle_sha256)
    require(manifest['status'] == 'RELEASED' and manifest['sourceSha'] == source_sha,
            'released-source-binding')
    # Re-read the exact helper after bundle verification so a swapped launcher
    # cannot silently weaken the bounded capture contract.
    helper = capacity_bundle.read(bundle, CAPTURE_HELPER)
    directory(STATE)
    parent = STATE / 'writer-compatibility'
    ensure_directory(parent)
    legacy_parent = parent / 'legacy'
    ensure_directory(legacy_parent)

    before_id = runtime_identity()
    require(runtime_hash() == LEGACY_SHA256, 'legacy-runtime-hash-before')
    temporary = legacy_parent / ('.capture-' + uuid.uuid4().hex)
    try:
        bounded_capture(helper, temporary)
        require(temporary.exists(), 'capture-missing')
        raw = read_capture(temporary)
        require(0 < len(raw) <= MAX_BYTES
                and hashlib.sha256(raw).hexdigest() == LEGACY_SHA256,
                'captured-legacy-hash')
        syntax_valid(temporary)
        require(runtime_identity() == before_id, 'container-replaced-during-capture')
        require(runtime_hash() == LEGACY_SHA256, 'legacy-runtime-hash-after')

        target = legacy_parent / LEGACY_SHA256
        destination = target / 'legacy-backup.sh'
        if target.exists():
            directory(target)
            require({item.name for item in target.iterdir()} == {'legacy-backup.sh'},
                    'prior-snapshot-incomplete')
            exact_file(destination, raw)
            return 'UNCHANGED'
        target.mkdir(mode=0o700)
        fd = os.open(destination,
                     os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        exact_file(destination, raw)
        directory_fd = os.open(target, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        return 'INSTALLED_NOT_MOUNTED'
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', required=True)
    parser.add_argument('--bundle-sha256', required=True)
    parser.add_argument('--source-sha', required=True)
    args = parser.parse_args()
    try:
        require(os.geteuid() == pwd.getpwnam('appuser').pw_uid, 'appuser-required')
        outcome = install(Path(args.bundle), args.bundle_sha256, args.source_sha)
        print('LEGACY_WRITER_SNAPSHOT ' + outcome + ' sourceSha256=' + LEGACY_SHA256)
    except (ValueError, OSError, KeyError, subprocess.SubprocessError):
        sys.exit('LEGACY_WRITER_SNAPSHOT_STOP retain-existing-no-runtime-mutation')
