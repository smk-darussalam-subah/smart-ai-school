#!/usr/bin/env python3
"""Build evidence binding and verification; never accepts residual risk itself."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import time

PACKAGE = 'ghcr.io/smk-darussalam-subah/diis-pg-backup'
FILES = ('image.tar', 'image.json', 'sbom.json', 'grype.json', 'grype-db.json', 'scanner.json', 'smoke.json')


def archive_config(path):
    # Read bounded metadata without extracting paths from the archive.
    with tarfile.open(path, 'r:') as archive:
        def bounded(name, cap):
            item = archive.getmember(name)
            if not item.isfile() or item.size > cap:
                raise ValueError('archive-metadata')
            return archive.extractfile(item).read(cap + 1)
        manifest = json.loads(bounded('manifest.json', 65536), object_pairs_hook=pairs)
        if type(manifest) is not list or len(manifest) != 1:
            raise ValueError('archive-manifest')
        config = bounded(manifest[0]['Config'], 1048576)
        return ('sha256:' + hashlib.sha256(config).hexdigest(),
                json.loads(config, object_pairs_hook=pairs))


def pairs(items):
    out = {}
    for key, value in items:
        if key in out:
            raise ValueError('duplicate-key')
        out[key] = value
    return out


def read(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 64 * 1024 * 1024:
        raise ValueError('metadata-file')
    return json.loads(path.read_bytes(), object_pairs_hook=pairs)


def sha(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_nlink != 1:
        raise ValueError('artifact-file')
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def validate_content(root, source):
    if not re.fullmatch(r'[a-f0-9]{40}', source):
        raise ValueError('source-sha')
    images = read(root / 'image.json')
    if type(images) is not list or len(images) != 1:
        raise ValueError('image-inspection')
    image = images[0]
    if (image['Os'] != 'linux' or image['Architecture'] != 'amd64'
            or image['Config']['Labels']['org.opencontainers.image.revision'] != source
            or not re.fullmatch(r'sha256:[a-f0-9]{64}', image['Id'])):
        raise ValueError('image-binding')
    config_id, config = archive_config(root / 'image.tar')
    if (config.get('os') != 'linux' or config.get('architecture') != 'amd64'
            or config.get('config', {}).get('Labels', {}).get('org.opencontainers.image.revision') != source):
        raise ValueError('archive-config-binding')
    scan = read(root / 'grype.json')
    if (type(scan.get('matches')) is not list or scan['descriptor']['name'] != 'grype'
            or scan['descriptor']['version'] != '0.118.0'
            or scan['source']['target']['imageID'] != config_id):
        raise ValueError('scan-binding')
    sbom = read(root / 'sbom.json')
    if sbom['source']['target']['imageID'] != config_id or not sbom.get('artifacts'):
        raise ValueError('sbom-binding')
    smoke = read(root / 'smoke.json')
    if smoke != {'schema': 'diis-image-smoke-v1', 'imageId': image['Id'],
                 'status': 'pass', 'network': 'none'}:
        raise ValueError('smoke-binding')
    scanner = read(root / 'scanner.json')
    if type(scanner) is not dict or set(scanner) != {'grypeExecutableSha256', 'syftExecutableSha256', 'dbSha256'}:
        raise ValueError('scanner-inventory')
    if any(not re.fullmatch(r'[a-f0-9]{64}', str(v)) or v == '0'*64 for v in scanner.values()):
        raise ValueError('scanner-hash')
    if read(root / 'grype-db.json').get('valid') is not True:
        raise ValueError('scanner-db-invalid')
    return image['Id']


def bind(root, source, run_id):
    image_id = validate_content(root, source)
    if not re.fullmatch(r'[1-9][0-9]*', run_id):
        raise ValueError('run-id')
    value = {'schema': 'diis-backup-artifact-v1', 'sourceSha': source,
             'buildRunId': run_id, 'imageId': image_id, 'platform': 'linux/amd64',
             'package': PACKAGE, 'files': {name: sha(root / name) for name in FILES}}
    with (root / 'binding.json').open('x') as output:
        json.dump(value, output, sort_keys=True)


def verify(root, source, run_id, approval, now):
    expected = {'schema', 'sourceSha', 'buildRunId', 'bindingSha256', 'expires',
                'notBefore', 'riskDecisionSha256', 'package', 'visibility'}
    if type(approval) is not dict or set(approval) != expected:
        raise ValueError('publication-approval-schema')
    if (approval['schema'] != 'diis-backup-publication-v1' or approval['sourceSha'] != source
            or approval['buildRunId'] != run_id or approval['package'] != PACKAGE
            or approval['visibility'] != 'private'
            or type(approval['notBefore']) is not int or type(approval['expires']) is not int
            or not approval['notBefore'] <= now < approval['expires']
            or not 0 < approval['expires'] - approval['notBefore'] <= 3600):
        raise ValueError('publication-approval-binding')
    for key in ('bindingSha256', 'riskDecisionSha256'):
        if not re.fullmatch(r'[a-f0-9]{64}', str(approval[key])) or approval[key] == '0' * 64:
            raise ValueError('publication-decision-hash')
    if sha(root / 'binding.json') != approval['bindingSha256']:
        raise ValueError('publication-artifact-binding')
    binding = read(root / 'binding.json')
    if (set(binding) != {'schema', 'sourceSha', 'buildRunId', 'imageId', 'platform', 'package', 'files'}
            or binding['schema'] != 'diis-backup-artifact-v1'
            or binding['sourceSha'] != source or binding['buildRunId'] != run_id
            or binding['platform'] != 'linux/amd64' or binding['package'] != PACKAGE
            or type(binding['files']) is not dict or set(binding['files']) != set(FILES)):
        raise ValueError('artifact-schema')
    for name in FILES:
        if sha(root / name) != binding['files'][name]:
            raise ValueError('artifact-content-drift')
    if validate_content(root, source) != binding['imageId']:
        raise ValueError('artifact-image-drift')
    return binding


if __name__ == '__main__':
    try:
        mode, directory, source, run_id = sys.argv[1:]
        root = Path(directory)
        if mode == 'bind':
            bind(root, source, run_id)
        elif mode == 'verify':
            value = verify(root, source, run_id,
                           json.loads(os.environ['PUBLICATION_APPROVAL'], object_pairs_hook=pairs),
                           int(time.time()))
            print(value['imageId'])
        else:
            raise ValueError('mode')
    except Exception:
        sys.exit('ARTIFACT_BINDING_STOP')
