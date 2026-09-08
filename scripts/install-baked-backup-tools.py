#!/usr/bin/env python3
"""Copy only image-baked tools into an isolated, empty or byte-identical volume.

No network, archive parsing, overwrite, deletion, or scheduler operation. Partial
installation is retained and fails closed; an operator must inspect it explicitly.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import sys

SOURCE = Path('/usr/local/lib/diis-tools')
DESTINATION = Path('/opt/backup-bin')
NAMES = {'mc', 'rclone', 'rclone.zip'}


def identity(meta):
    return (meta.st_dev, meta.st_ino, meta.st_size, meta.st_mtime_ns,
            meta.st_ctime_ns, meta.st_mode, meta.st_uid, meta.st_nlink)


def read_regular(path, limit):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > limit:
            raise ValueError('tool-file')
        with os.fdopen(os.dup(fd), 'rb') as stream:
            raw = stream.read(limit + 1)
        after = os.fstat(fd)
        if (len(raw) != before.st_size or identity(before) != identity(after)
                or identity(path.stat()) != identity(after)):
            raise ValueError('tool-drift')
        return raw
    finally:
        os.close(fd)


def install(source=SOURCE, target=DESTINATION):
    if target.resolve(strict=True) != target or source.resolve(strict=True) != source:
        raise ValueError('tool-path')
    meta = target.stat()
    if meta.st_uid != os.geteuid() or stat.S_IMODE(meta.st_mode) & 0o022:
        raise ValueError('tool-volume-owner-mode')
    # Directory inode itself is the lock: no replaceable lock file or bootstrap.
    fd = os.open(target, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if os.fstat(fd) != target.stat():
            raise ValueError('tool-volume-drift')
        manifest = json.loads(read_regular(source / 'manifest.json', 4096))
        if type(manifest) is not dict or set(manifest) != NAMES:
            raise ValueError('tool-manifest')
        blobs = {name: read_regular(source / name, 128 * 1024 * 1024) for name in NAMES}
        if any(hashlib.sha256(raw).hexdigest() != manifest[name] for name, raw in blobs.items()):
            raise ValueError('baked-tool-binding')
        entries = set(os.listdir(target))
        if entries:
            if entries != NAMES:
                raise ValueError('tool-volume-nonempty-or-partial')
            for name in NAMES:
                if read_regular(target / name, 128 * 1024 * 1024) != blobs[name]:
                    raise ValueError('tool-volume-content-drift')
                if name != 'rclone.zip' and not os.access(target / name, os.X_OK):
                    raise ValueError('tool-mode')
            return
        for name in sorted(NAMES):
            out = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                          0o600 if name == 'rclone.zip' else 0o700, dir_fd=fd)
            with os.fdopen(out, 'wb') as stream:
                stream.write(blobs[name])
                stream.flush()
                os.fsync(stream.fileno())
        os.fsync(fd)
        if set(os.listdir(target)) != NAMES:
            raise ValueError('tool-volume-result')
        for name in NAMES:
            if read_regular(target / name, 128 * 1024 * 1024) != blobs[name]:
                raise ValueError('tool-copy-result')
    finally:
        os.close(fd)


if __name__ == '__main__':
    try:
        install()
    except BaseException:
        print('BAKED_TOOLS_STOP retry=prohibited retained=1', file=sys.stderr)
        sys.exit(74)
    print('BAKED_TOOLS_READY')
