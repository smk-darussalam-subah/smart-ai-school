#!/usr/bin/env python3
"""Build-only extraction of a checksum-pinned, bounded DEFLATE archive.

No downloader and no runtime configuration. Reject other compression methods
before opening the member (including the vulnerable BZIP2/LZMA paths).
"""
import hashlib
import json
from pathlib import Path
import stat
import sys
import zipfile

ARCHIVE_HASH = '7d69057e69385f6514a9684c7eaa424d972096b130284bb34dd967c4ed4f9dad'
MC_HASH = '01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891'
MEMBER = 'rclone-v1.70.3-linux-amd64/rclone'
LIMIT = 128 * 1024 * 1024


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def extract(archive, destination):
    if archive.stat().st_size > 64 * 1024 * 1024 or sha(archive) != ARCHIVE_HASH:
        raise ValueError('archive-binding')
    with zipfile.ZipFile(archive) as bundle:
        members = bundle.infolist()
        selected = [x for x in members if x.filename == MEMBER]
        if len(members) > 32 or len(selected) != 1:
            raise ValueError('archive-members')
        item = selected[0]
        mode = item.external_attr >> 16
        if (item.compress_type != zipfile.ZIP_DEFLATED or item.flag_bits & 1
                or not 0 < item.file_size <= LIMIT or not 0 < item.compress_size <= LIMIT
                or stat.S_IFMT(mode) not in (0, stat.S_IFREG)):
            raise ValueError('archive-metadata')
        # Exclusive build output; no overwrite or path derived from archive names.
        with bundle.open(item) as source, destination.open('xb') as output:
            remaining = item.file_size
            while remaining:
                chunk = source.read(min(1024 * 1024, remaining))
                if not chunk:
                    raise ValueError('archive-short')
                output.write(chunk)
                remaining -= len(chunk)
            if source.read(1):
                raise ValueError('archive-overflow')
    destination.chmod(0o755)


def main():
    root = Path('/usr/local/lib/diis-tools')
    if sha(root / 'mc') != MC_HASH:
        raise ValueError('mc-binding')
    extract(root / 'rclone.zip', root / 'rclone')
    (root / 'mc').chmod(0o755)
    manifest = {name: sha(root / name) for name in ('mc', 'rclone', 'rclone.zip')}
    with (root / 'manifest.json').open('x') as output:
        json.dump(manifest, output, sort_keys=True)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.exit('BACKUP_TOOL_BUILD_FAILED')
