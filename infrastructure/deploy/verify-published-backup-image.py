#!/usr/bin/env python3
"""Verify one digest-qualified GHCR round trip and emit a non-secret receipt."""
import hashlib
import json
from pathlib import Path
import re
import sys

PACKAGE = 'ghcr.io/smk-darussalam-subah/diis-pg-backup'
PACKAGES = {PACKAGE, 'ghcr.io/smk-darussalam-subah/diis-api',
            'ghcr.io/smk-darussalam-subah/diis-web'}
DIGEST = re.compile(r'sha256:[a-f0-9]{64}')


def pairs(items):
    value = {}
    for key, item in items:
        if key in value:
            raise ValueError('duplicate-key')
        value[key] = item
    return value


def read(path, cap=16 * 1024 * 1024):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > cap:
        raise ValueError('registry-evidence-file')
    return json.loads(path.read_bytes(), object_pairs_hook=pairs)


def raw(path, cap=16 * 1024 * 1024):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > cap:
        raise ValueError('registry-manifest-file')
    value = path.read_bytes()
    if len(value) != path.stat().st_size:
        raise ValueError('registry-manifest-drift')
    return value


def sha(value):
    return hashlib.sha256(value).hexdigest()


def select(binding, digests):
    if (type(binding) is not dict or binding.get('package') not in PACKAGES
            or not DIGEST.fullmatch(str(binding.get('imageId', '')))):
        raise ValueError('registry-binding')
    if type(digests) is not list or not all(type(item) is str for item in digests):
        raise ValueError('registry-digests')
    prefix = binding['package'] + '@'
    matches = [item for item in digests if item.startswith(prefix)
               and DIGEST.fullmatch(item[len(prefix):])]
    if len(matches) != 1:
        raise ValueError('registry-digest-ambiguous')
    return matches[0]


def manifest(raw_value, expected_digest):
    if sha(raw_value) != expected_digest.removeprefix('sha256:'):
        raise ValueError('registry-manifest-digest')
    value = json.loads(raw_value, object_pairs_hook=pairs)
    if type(value) is not dict or value.get('schemaVersion') != 2:
        raise ValueError('registry-manifest-schema')
    return value


def resolve(binding, root_reference, root_raw):
    select(binding, [root_reference])
    root_digest = root_reference.rsplit('@', 1)[1]
    value = manifest(root_raw, root_digest)
    if type(value.get('manifests')) is list:
        choices = [item for item in value['manifests']
                   if item.get('platform') == {'architecture': 'amd64', 'os': 'linux'}
                   and DIGEST.fullmatch(str(item.get('digest', '')))]
        if len(choices) != 1:
            raise ValueError('registry-platform-ambiguous')
        return binding['package'] + '@' + choices[0]['digest']
    if not DIGEST.fullmatch(str(value.get('config', {}).get('digest', ''))):
        raise ValueError('registry-image-manifest')
    return root_reference


def verify(binding, binding_sha, root_reference, root_raw, platform_reference, platform_raw, image):
    if not re.fullmatch(r'[a-f0-9]{64}', binding_sha):
        raise ValueError('registry-binding-sha')
    if select(binding, [root_reference]) != root_reference:
        raise ValueError('registry-root-reference')
    expected_platform = resolve(binding, root_reference, root_raw)
    if platform_reference != expected_platform:
        raise ValueError('registry-platform-reference')
    platform_digest = platform_reference.rsplit('@', 1)[1]
    value = manifest(platform_raw, platform_digest)
    config = value.get('config', {})
    layers = value.get('layers')
    if (config.get('digest') != binding['imageId'] or type(layers) is not list or not layers
            or any(type(item) is not dict or not DIGEST.fullmatch(str(item.get('digest', '')))
                   or type(item.get('size')) is not int or item['size'] <= 0 for item in layers)
            or len({item['digest'] for item in layers}) != len(layers)):
        raise ValueError('registry-artifact-identity')
    allowed_ids = {binding['imageId'], platform_digest, root_reference.rsplit('@', 1)[1]}
    if (type(image) is not list or len(image) != 1 or image[0].get('Id') not in allowed_ids
            or image[0].get('Os') != 'linux' or image[0].get('Architecture') != 'amd64'
            or platform_reference not in image[0].get('RepoDigests', [])
            or image[0].get('Config', {}).get('Labels', {}).get(
                'org.opencontainers.image.revision') != binding['sourceSha']):
        raise ValueError('registry-pulled-image')
    receipt = {
        'schema': 'diis-backup-publication-receipt-v1',
        'sourceSha': binding['sourceSha'],
        'buildRunId': binding['buildRunId'],
        'package': binding['package'],
        'rootDigest': root_reference.rsplit('@', 1)[1],
        'platformDigest': platform_digest,
        'configDigest': config['digest'],
        'observedRuntimeImageId': image[0]['Id'],
        'layerDigests': [item['digest'] for item in layers],
        'platform': 'linux/amd64',
        'archiveBindingSha256': binding_sha,
        'roundTripArchiveIdentity': 'verified',
    }
    if binding['package'] != PACKAGE:
        expected = 'api' if binding['package'].endswith('/diis-api') else 'web'
        config = binding.get('publicBuildConfig')
        if (binding.get('profile') != expected or type(config) is not dict
                or binding.get('schema') != 'diis-staging-image-artifact-v1'):
            raise ValueError('registry-application-profile')
        config_sha = sha(json.dumps(config, sort_keys=True, separators=(',', ':')).encode())
        if image[0]['Config']['Labels'].get('org.diis.build-config-sha256') != config_sha:
            raise ValueError('registry-application-config')
        receipt.update(schema='diis-staging-image-publication-receipt-v1',
                       profile=expected, publicBuildConfigSha256=config_sha)
    return receipt


def write_exclusive(path, value):
    with Path(path).open('x', encoding='ascii', newline='\n') as output:
        json.dump(value, output, sort_keys=True, separators=(',', ':'))
        output.write('\n')


if __name__ == '__main__':
    try:
        mode = sys.argv[1]
        if mode == 'select' and len(sys.argv) == 4:
            print(select(read(sys.argv[2]), read(sys.argv[3])))
        elif mode == 'resolve' and len(sys.argv) == 5:
            print(resolve(read(sys.argv[2]), sys.argv[3], raw(sys.argv[4])))
        elif mode == 'verify' and len(sys.argv) == 9:
            binding_raw = raw(sys.argv[2])
            binding = json.loads(binding_raw, object_pairs_hook=pairs)
            result = verify(binding, sha(binding_raw), sys.argv[3], raw(sys.argv[4]),
                            sys.argv[5], raw(sys.argv[6]), read(sys.argv[7]))
            write_exclusive(sys.argv[8], result)
        else:
            raise ValueError('arguments')
    except Exception:
        sys.exit('REGISTRY_ARTIFACT_STOP retry=prohibited')
