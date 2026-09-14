#!/usr/bin/env python3
"""Build evidence binding and verification; never accepts residual risk itself."""
import base64
import binascii
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
PROFILES = {'backup': PACKAGE, 'api': 'ghcr.io/smk-darussalam-subah/diis-api',
            'web': 'ghcr.io/smk-darussalam-subah/diis-web'}


def build_config(profile, public_key=''):
    if profile not in PROFILES:
        raise ValueError('image-profile')
    if profile != 'web':
        if public_key:
            raise ValueError('unexpected-public-config')
        return {}
    # An uncompressed P-256 point is exactly 65 bytes and begins with 0x04.
    # This is public material, never a private key or an arbitrary build arg.
    if not re.fullmatch('[A-Za-z0-9_-]{87}', public_key):
        raise ValueError('staging-vapid-public-key')
    try:
        decoded = base64.b64decode(public_key + '=', altchars=b'-_', validate=True)
    except (binascii.Error, ValueError):
        raise ValueError('staging-vapid-public-key') from None
    if len(decoded) != 65 or decoded[0] != 4:
        raise ValueError('staging-vapid-public-key')
    return {'API_URL': 'http://smk-staging-api:3001',
            'NEXT_PUBLIC_VAPID_PUBLIC_KEY': public_key}


def validate_build_label(root, config):
    expected = hashlib.sha256(json.dumps(config, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    _, archive = archive_config(root / 'image.tar')
    observed = read(root / 'image.json')[0]['Config'].get('Labels', {})
    if (observed.get('org.diis.build-config-sha256') != expected
            or archive.get('config', {}).get('Labels', {}).get('org.diis.build-config-sha256') != expected):
        raise ValueError('application-build-label')


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


def validate_content(root, source, profile='backup'):
    if profile not in PROFILES:
        raise ValueError('image-profile')
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
    scan_id = scan.get('source', {}).get('target', {}).get('imageID')
    sbom = read(root / 'sbom.json')
    sbom_id = sbom.get('source', {}).get('target', {}).get('imageID')
    image_ids = {config_id, image['Id']}
    if (type(scan.get('matches')) is not list or scan['descriptor']['name'] != 'grype'
            or scan['descriptor']['version'] != '0.118.0'
            or scan_id != sbom_id or scan_id not in image_ids):
        raise ValueError('scan-binding')
    if not sbom.get('artifacts'):
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
    # Docker's containerd store reports an OCI index as .Id; the portable
    # registry config identity comes from the exact saved config bytes instead.
    return config_id


def bind(root, source, run_id, profile='backup', public_config=None):
    image_id = validate_content(root, source, profile)
    if not re.fullmatch(r'[1-9][0-9]*', run_id):
        raise ValueError('run-id')
    value = {'schema': 'diis-backup-artifact-v1', 'sourceSha': source,
             'buildRunId': run_id, 'imageId': image_id, 'platform': 'linux/amd64',
             'localImageId': read(root/'image.json')[0]['Id'],
             'package': PROFILES[profile], 'files': {name: sha(root / name) for name in FILES}}
    if profile != 'backup':
        config = public_config if public_config is not None else {}
        if config != build_config(profile, config.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')):
            raise ValueError('application-build-config')
        validate_build_label(root, config)
        value.update(schema='diis-staging-image-artifact-v1', profile=profile,
                     publicBuildConfig=config)
    with (root / 'binding.json').open('x') as output:
        json.dump(value, output, sort_keys=True)


def verify(root, source, run_id, approval, now, profile='backup', mode='existing', absence_sha=''):
    if profile not in PROFILES or mode not in ('existing', 'first'):
        raise ValueError('publication-profile-mode')
    expected = {'schema', 'sourceSha', 'buildRunId', 'bindingSha256', 'expires',
                'notBefore', 'riskDecisionSha256', 'package', 'visibility'}
    revised = profile != 'backup' or mode == 'first'
    if revised:
        expected |= {'profile', 'publicationMode', 'absenceEvidenceSha256'}
    if type(approval) is not dict or set(approval) != expected:
        raise ValueError('publication-approval-schema')
    if (approval['schema'] != ('diis-image-publication-v2' if revised else 'diis-backup-publication-v1')
            or approval['sourceSha'] != source
            or approval['buildRunId'] != run_id or approval['package'] != PROFILES[profile]
            or approval['visibility'] != 'private'
            or type(approval['notBefore']) is not int or type(approval['expires']) is not int
            or not approval['notBefore'] <= now < approval['expires']
            or not 0 < approval['expires'] - approval['notBefore'] <= 3600):
        raise ValueError('publication-approval-binding')
    if revised and (approval['profile'] != profile or approval['publicationMode'] != mode
            or approval['absenceEvidenceSha256'] != absence_sha
            or (mode == 'first' and not re.fullmatch('[a-f0-9]{64}', absence_sha))
            or (mode == 'existing' and absence_sha != '')):
        raise ValueError('publication-bootstrap-binding')
    for key in ('bindingSha256', 'riskDecisionSha256'):
        if not re.fullmatch(r'[a-f0-9]{64}', str(approval[key])) or approval[key] == '0' * 64:
            raise ValueError('publication-decision-hash')
    if sha(root / 'binding.json') != approval['bindingSha256']:
        raise ValueError('publication-artifact-binding')
    binding = read(root / 'binding.json')
    binding_keys = {'schema', 'sourceSha', 'buildRunId', 'imageId', 'localImageId', 'platform', 'package', 'files'}
    if profile != 'backup':
        binding_keys |= {'profile', 'publicBuildConfig'}
    if (set(binding) != binding_keys
            or binding['schema'] != ('diis-backup-artifact-v1' if profile == 'backup' else 'diis-staging-image-artifact-v1')
            or binding['sourceSha'] != source or binding['buildRunId'] != run_id
            or binding['platform'] != 'linux/amd64' or binding['package'] != PROFILES[profile]
            or type(binding['files']) is not dict or set(binding['files']) != set(FILES)):
        raise ValueError('artifact-schema')
    if profile != 'backup':
        config = binding['publicBuildConfig']
        if (binding['profile'] != profile or type(config) is not dict
                or config != build_config(profile, config.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY', ''))):
            raise ValueError('artifact-public-config')
        validate_build_label(root, config)
    for name in FILES:
        if sha(root / name) != binding['files'][name]:
            raise ValueError('artifact-content-drift')
    if binding['localImageId'] != read(root/'image.json')[0]['Id']:
        raise ValueError('artifact-local-image-drift')
    if validate_content(root, source, profile) != binding['imageId']:
        raise ValueError('artifact-image-drift')
    return binding


if __name__ == '__main__':
    try:
        mode, directory, source, run_id = sys.argv[1:5]
        profile = sys.argv[5] if len(sys.argv) == 6 else 'backup'
        root = Path(directory)
        if mode == 'bind':
            bind(root, source, run_id, profile,
                 build_config(profile, os.environ.get('STAGING_VAPID_PUBLIC_KEY', '') if profile == 'web' else ''))
        elif mode == 'verify':
            value = verify(root, source, run_id,
                           json.loads(os.environ['PUBLICATION_APPROVAL'], object_pairs_hook=pairs),
                           int(time.time()), profile, os.environ.get('PUBLICATION_MODE', 'existing'),
                           os.environ.get('ABSENCE_SHA', ''))
            # Config digest is portable across Docker storage implementations;
            # localImageId remains evidence of the build runner only.
            print(value['imageId'])
        else:
            raise ValueError('mode')
    except Exception:
        sys.exit('ARTIFACT_BINDING_STOP')
