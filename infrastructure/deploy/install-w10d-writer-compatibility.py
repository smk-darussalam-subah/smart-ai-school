#!/usr/bin/env python3
"""Install one released writer artifact outside both application checkouts.

Does not mount, restart, alter a scheduler or execute the installed files.
An incomplete prior publication is retained and rejected, never overwritten.
"""
import argparse
import hashlib
import os
from pathlib import Path
import pwd
import stat
import sys

import capacity_bundle

STATE = Path('/home/appuser/.local/state/diis-deploy')
LIBRARY = 'infrastructure/docker/scripts/backup-lib.sh'
LIBRARY_SHA = 'bf881caf29af389e1d0d328e9b5816d570154b72b873ea82aac6d1be418e8e5a'
WRAPPER = 'infrastructure/deploy/legacy-backup-compatibility.sh'
WRAPPER_SHA = '70cf649cc5845827aa4d66c3d4148bb6f6f718b169a93074ad4abd7da803718f'
ARTIFACT_FILES = {
    'backup-lib.sh': (LIBRARY, LIBRARY_SHA),
    'legacy-backup-compatibility.sh': (WRAPPER, WRAPPER_SHA),
}
ARTIFACT_SHA = hashlib.sha256(''.join(
    f'{ARTIFACT_FILES[name][1]}  {name}\n' for name in sorted(ARTIFACT_FILES)
).encode()).hexdigest()


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def directory(path):
    info = path.lstat()
    require(path.resolve(strict=True) == path and stat.S_ISDIR(info.st_mode)
            and info.st_uid == os.geteuid() and stat.S_IMODE(info.st_mode) == 0o700,
            'private-directory')


def exact(path, raw):
    require(path.resolve(strict=True) == path, 'artifact-symlink')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid()
                and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1
                and info.st_size == len(raw), 'artifact-metadata')
        require(os.read(fd,65537) == raw, 'artifact-bytes')
    finally:
        os.close(fd)


def install(bundle, expected, source_sha):
    manifest = capacity_bundle.verify(bundle, expected)
    require(manifest['status'] == 'RELEASED' and manifest['sourceSha'] == source_sha,
            'released-source-binding')
    payloads = {}
    for name, (relative, expected_sha) in ARTIFACT_FILES.items():
        raw = capacity_bundle.read(bundle, relative)
        require(hashlib.sha256(raw).hexdigest() == expected_sha, 'artifact-authority')
        payloads[name] = raw
    directory(STATE)
    parent = STATE/'writer-compatibility'
    try: parent.mkdir(mode=0o700)
    except FileExistsError: pass
    directory(parent)
    target = parent/ARTIFACT_SHA
    if target.exists():
        directory(target)
        require({p.name for p in target.iterdir()} == set(ARTIFACT_FILES),
                'prior-publication-incomplete')
        for name, raw in payloads.items():
            exact(target/name, raw)
        return 'UNCHANGED'
    target.mkdir(mode=0o700)  # exclusive claim; losing race is a stop, not overwrite
    for name in sorted(payloads):
        raw = payloads[name]
        fd = os.open(target/name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd,'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        exact(target/name, raw)
    directory_fd = os.open(target, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    return 'INSTALLED_NOT_MOUNTED'


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--bundle',required=True)
    parser.add_argument('--bundle-sha256',required=True)
    parser.add_argument('--source-sha',required=True)
    args=parser.parse_args()
    try:
        require(os.geteuid()==pwd.getpwnam('appuser').pw_uid,'appuser-required')
        result=install(Path(args.bundle),args.bundle_sha256,args.source_sha)
        print('WRITER_COMPATIBILITY_ARTIFACT '+result+' artifactSha256='+ARTIFACT_SHA
              +' librarySha256='+LIBRARY_SHA+' wrapperSha256='+WRAPPER_SHA)
    except (ValueError,OSError,KeyError):
        sys.exit('WRITER_ARTIFACT_STOP retain-partial-no-overwrite')
