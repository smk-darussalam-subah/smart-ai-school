#!/usr/bin/env python3
"""Fail closed before registry login, including ambiguous 404/permission errors."""
import json
import hashlib
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

REPOSITORY = 'smk-darussalam-subah/smart-ai-school'
PACKAGES = {'backup': 'diis-pg-backup', 'api': 'diis-api', 'web': 'diis-web'}
BOOTSTRAP_TAG_PREFIX = 'w10d-backup-build-'


def pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError('duplicate-key')
        result[key] = value
    return result


def private_package(package, profile='backup'):
    if (profile not in PACKAGES or package.get('name') != PACKAGES[profile]
            or package.get('visibility') != 'private' or package.get('package_type') != 'container'
            or package.get('repository', {}).get('full_name') != REPOSITORY):
        raise ValueError('package-private-linkage')


def build_trigger(run, source, profile):
    expected_branch = 'develop' if profile == 'backup' else 'staging'
    if run.get('event') == 'workflow_dispatch' and run.get('head_branch') == expected_branch:
        return 'manual'
    if (profile == 'backup' and run.get('event') == 'push'
            and run.get('head_branch') == BOOTSTRAP_TAG_PREFIX + source):
        return 'bootstrap-tag'
    raise ValueError('build-run-trigger')


def verify(run, gate, package, source, run_id, profile='backup'):
    if profile not in PACKAGES:
        raise ValueError('image-profile')
    if (str(run.get('id')) != run_id or run.get('head_sha') != source
            or run.get('path') != '.github/workflows/backup-image.yml'
            or run.get('conclusion') != 'success'
            or run.get('repository', {}).get('full_name') != 'smk-darussalam-subah/smart-ai-school'):
        raise ValueError('build-run-binding')
    trigger = build_trigger(run, source, profile)
    reviewers = [r for r in gate.get('protection_rules', []) if r.get('type') == 'required_reviewers']
    if (len(reviewers) != 1 or not reviewers[0].get('reviewers')
            or gate.get('can_admins_bypass') is not False):
        raise ValueError('publication-environment-gate')
    private_package(package, profile)
    return trigger


def bootstrap_source_is_on_develop(source, tag):
    tagged = request(
        f'repos/{REPOSITORY}/git/ref/tags/{urllib.parse.quote(tag, safe="")}'
    )
    target = tagged.get('object') if type(tagged) is dict else None
    if (type(target) is not dict or target.get('type') != 'commit'
            or target.get('sha') != source):
        raise ValueError('bootstrap-tag-binding')
    comparison = request(f'repos/{REPOSITORY}/compare/{source}...develop')
    if (type(comparison) is not dict or comparison.get('status') not in ('identical', 'ahead')
            or comparison.get('merge_base_commit', {}).get('sha') != source
            or comparison.get('base_commit', {}).get('sha') != source):
        raise ValueError('bootstrap-develop-ancestry')


def first_publication(observation, attestation, expected_hash, source, run_id, profile, now):
    """404 is insufficient: require independently reviewed, exact owner evidence."""
    if profile not in PACKAGES or observation != {'status': 404, 'package': PACKAGES[profile]}:
        raise ValueError('first-publication-observation')
    if (not re.fullmatch('[a-f0-9]{64}', expected_hash)
            or hashlib.sha256(attestation).hexdigest() != expected_hash):
        raise ValueError('absence-attestation-hash')
    if len(attestation) > 16384:
        raise ValueError('absence-attestation-size')
    value = json.loads(attestation, object_pairs_hook=pairs)
    if (type(value) is not dict or set(value) != {
            'schema', 'repository', 'package', 'sourceSha', 'buildRunId', 'notBefore',
            'expires', 'authority', 'owner', 'inventoryEvidenceSha256', 'completeInventory',
            'packageAbsent'} or value['schema'] != 'diis-first-publication-owner-evidence-v1'
            or value['repository'] != REPOSITORY or value['package'] != PACKAGES[profile]
            or value['sourceSha'] != source or value['buildRunId'] != run_id
            or value['authority'] != 'organization-package-admin'
            or not re.fullmatch('[a-zA-Z0-9-]{1,39}', str(value['owner']))
            or value['completeInventory'] is not True or value['packageAbsent'] is not True
            or not re.fullmatch('[a-f0-9]{64}', str(value['inventoryEvidenceSha256']))
            or value['inventoryEvidenceSha256'] == '0' * 64
            or type(value['notBefore']) is not int or type(value['expires']) is not int
            or not value['notBefore'] <= now < value['expires']
            or not 0 < value['expires'] - value['notBefore'] <= 3600):
        raise ValueError('absence-attestation-binding')
    # The attestation is an external Director-reviewed prerequisite, not a claim
    # manufactured by this workflow identity from an ambiguous package lookup.
    return value


def request(path, allow_absent=False):
    req = urllib.request.Request('https://api.github.com/' + path, headers={
        'Authorization': 'Bearer ' + os.environ['GH_TOKEN'],
        'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
            if len(raw) > 2 * 1024 * 1024:
                raise ValueError('metadata-size')
            return json.loads(raw, object_pairs_hook=pairs)
    except urllib.error.HTTPError as error:
        if error.code == 404 and allow_absent:
            return None
        raise ValueError('metadata-inaccessible') from None


def collect(source, run_id, profile, mode):
    if (profile not in PACKAGES or mode not in ('existing', 'first')
            or not re.fullmatch('[a-f0-9]{40}', source)
            or not re.fullmatch('[1-9][0-9]*', run_id)):
        raise ValueError('metadata-arguments')
    run = request(f'repos/{REPOSITORY}/actions/runs/{run_id}')
    environment = 'backup-image-publication' if profile == 'backup' else 'staging-image-publication'
    gate = request(f'repos/{REPOSITORY}/environments/{environment}')
    branches = request(f'repos/{REPOSITORY}/environments/{environment}/deployment-branch-policies')
    expected_branch = 'develop' if profile == 'backup' else 'staging'
    if (gate.get('deployment_branch_policy') != {
            'protected_branches': False, 'custom_branch_policies': True}
            or branches.get('total_count') != 1
            or [(p.get('name'), p.get('type')) for p in branches.get('branch_policies', [])]
            != [(expected_branch, 'branch')]):
        raise ValueError('publication-branch-policy')
    package = request('orgs/smk-darussalam-subah/packages/container/' + PACKAGES[profile],
                      allow_absent=mode == 'first')
    if mode == 'first':
        if package is not None:
            raise ValueError('first-publication-package-already-exists')
        first_publication({'status': 404, 'package': PACKAGES[profile]},
            os.environ['FIRST_PUBLICATION_EVIDENCE'].encode(), os.environ['ABSENCE_SHA'],
            source, run_id, profile, int(time.time()))
        # Validate run and environment without representing this synthetic shape
        # as observed package metadata. Post-push private linkage is mandatory.
        package = {'name': PACKAGES[profile], 'visibility': 'private', 'package_type': 'container',
                   'repository': {'full_name': REPOSITORY}}
    trigger = verify(run, gate, package, source, run_id, profile)
    if trigger == 'bootstrap-tag':
        bootstrap_source_is_on_develop(source, BOOTSTRAP_TAG_PREFIX + source)
    return {'schema': 'diis-publication-preflight-v1', 'sourceSha': source,
            'buildRunId': run_id, 'profile': profile, 'mode': mode,
            'buildTrigger': trigger,
            'environmentId': gate['id'], 'packageState': 'owner-attested-absent' if mode == 'first' else 'existing-private'}


if __name__ == '__main__':
    try:
        if sys.argv[1] == 'collect':
            print(json.dumps(collect(*sys.argv[2:]), sort_keys=True))
        elif sys.argv[1] == 'post':
            profile = sys.argv[2]
            private_package(request('orgs/smk-darussalam-subah/packages/container/' + PACKAGES[profile]), profile)
            print('PUBLICATION_PRIVATE_LINKAGE_VERIFIED')
        else:
            verify(*(json.loads(Path(p).read_bytes()) for p in ('run.json', 'gate.json', 'metadata-package.json')),
                   *sys.argv[1:])
    except Exception:
        sys.exit('PUBLICATION_METADATA_STOP')
