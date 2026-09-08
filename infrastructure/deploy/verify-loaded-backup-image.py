#!/usr/bin/env python3
"""Verify the loaded image by OCI config, independent of Docker index IDs."""
import hashlib
import json
import sys
import tarfile


def image_identity(path, require_reviewed_tag=True):
    with tarfile.open(path, 'r:') as archive:
        def read(name, cap):
            member = archive.getmember(name)
            if not member.isfile() or member.size > cap:
                raise ValueError('metadata')
            return archive.extractfile(member).read(cap + 1)
        manifest = json.loads(read('manifest.json', 65536))
        if (len(manifest) != 1 or require_reviewed_tag
                and manifest[0].get('RepoTags') != ['diis-reviewed-backup:latest']):
            raise ValueError('image-tag')
        entry = manifest[0]
        config = read(entry['Config'], 1048576)
        # Config contains layer diff_ids; also bind actual uncompressed layer bytes.
        layers = []
        for name in entry['Layers']:
            member = archive.getmember(name)
            if not member.isfile():
                raise ValueError('layer')
            with archive.extractfile(member) as stream:
                layers.append(hashlib.file_digest(stream, 'sha256').hexdigest())
        return hashlib.sha256(config).hexdigest(), layers


if __name__ == '__main__':
    try:
        if len(sys.argv) == 3:
            same = image_identity(sys.argv[1]) == image_identity(sys.argv[2])
        elif len(sys.argv) == 4 and sys.argv[1] == '--registry-roundtrip':
            same = image_identity(sys.argv[2]) == image_identity(sys.argv[3], False)
        else:
            same = False
        if not same:
            raise ValueError('loaded-image-drift')
    except Exception:
        sys.exit('LOADED_IMAGE_BINDING_STOP')
