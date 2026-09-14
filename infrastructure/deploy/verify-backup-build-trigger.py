#!/usr/bin/env python3
"""Bind backup builds to an exact branch dispatch or one SHA-named bootstrap tag."""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


REPOSITORY = 'smk-darussalam-subah/smart-ai-school'
TAG_PREFIX = 'w10d-backup-build-'
WORKFLOW_PATH = '.github/workflows/backup-image.yml'
SHA = re.compile(r'[a-f0-9]{40}\Z')
INTEGER = re.compile(r'[1-9][0-9]*\Z')


def pairs(items):
    value = {}
    for key, item in items:
        if key in value:
            raise ValueError('duplicate-json-key')
        value[key] = item
    return value


def request(path):
    token = os.environ.get('GH_TOKEN', '')
    if not token:
        raise ValueError('github-token')
    query = urllib.request.Request(
        'https://api.github.com/' + path,
        headers={
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    )
    try:
        with urllib.request.urlopen(query, timeout=30) as response:
            raw = response.read(1024 * 1024 + 1)
    except (OSError, urllib.error.HTTPError, urllib.error.URLError):
        raise ValueError('github-metadata') from None
    if len(raw) > 1024 * 1024:
        raise ValueError('github-metadata-size')
    try:
        return json.loads(raw, object_pairs_hook=pairs)
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError):
        raise ValueError('github-metadata-json') from None


def ref_binding(value, expected_sha, reason):
    target = value.get('object') if type(value) is dict else None
    if (type(target) is not dict or target.get('type') != 'commit'
            or target.get('sha') != expected_sha):
        raise ValueError(reason)


def bootstrap_run_binding(requester, source, tag, run_id, run_attempt):
    if not INTEGER.fullmatch(run_id) or run_attempt != '1':
        raise ValueError('bootstrap-run-identity')
    current_id = int(run_id)
    current = requester(f'repos/{REPOSITORY}/actions/runs/{run_id}')
    expected = {
        'id': current_id,
        'event': 'push',
        'head_sha': source,
        'head_branch': tag,
        'path': WORKFLOW_PATH,
        'run_attempt': 1,
    }
    current_repository = current.get('repository') if type(current) is dict else None
    if (type(current) is not dict
            or type(current.get('id')) is not int
            or any(current.get(key) != value for key, value in expected.items())
            or type(current_repository) is not dict
            or current_repository.get('full_name') != REPOSITORY):
        raise ValueError('bootstrap-current-run')

    query = urllib.parse.urlencode({
        'event': 'push',
        'head_sha': source,
        'per_page': 100,
        'exclude_pull_requests': 'true',
    })
    history = requester(f'repos/{REPOSITORY}/actions/runs?{query}')
    runs = history.get('workflow_runs') if type(history) is dict else None
    total = history.get('total_count') if type(history) is dict else None
    if (type(runs) is not list or type(total) is not int or total != len(runs)
            or total > 100):
        raise ValueError('bootstrap-run-history')

    candidates = []
    for run in runs:
        if type(run) is not dict:
            raise ValueError('bootstrap-run-history')
        if run.get('path') != WORKFLOW_PATH:
            continue
        fields = (run.get('id'), run.get('event'), run.get('head_sha'),
                  run.get('head_branch'), run.get('run_attempt'))
        repository = run.get('repository')
        if (type(fields[0]) is not int or fields[1:] != ('push', source, tag, 1)
                or type(repository) is not dict
                or repository.get('full_name') != REPOSITORY):
            raise ValueError('bootstrap-run-history')
        candidates.append(fields[0])
    if not candidates or current_id not in candidates or current_id != min(candidates):
        raise ValueError('bootstrap-replay')


def verify(event, ref, source, operation='', requested_source='', profile='',
           run_id='', run_attempt='', requester=request):
    if not SHA.fullmatch(source):
        raise ValueError('source-sha')
    if event == 'workflow_dispatch':
        if (operation != 'build' or requested_source != source
                or profile not in ('backup', 'api', 'web')):
            raise ValueError('manual-build-input')
        expected_ref = 'refs/heads/develop' if profile == 'backup' else 'refs/heads/staging'
        if ref != expected_ref:
            raise ValueError('manual-build-branch')
        return {'source_sha': source, 'image_profile': profile, 'trigger_mode': 'manual'}

    if event != 'push' or any((operation, requested_source, profile)):
        raise ValueError('bootstrap-event')
    tag = TAG_PREFIX + source
    if ref != 'refs/tags/' + tag:
        raise ValueError('bootstrap-tag')
    develop = requester(f'repos/{REPOSITORY}/git/ref/heads/develop')
    tagged = requester(
        f'repos/{REPOSITORY}/git/ref/tags/{urllib.parse.quote(tag, safe="")}'
    )
    ref_binding(develop, source, 'bootstrap-develop-tip')
    ref_binding(tagged, source, 'bootstrap-tag-object')
    bootstrap_run_binding(requester, source, tag, run_id, run_attempt)
    return {'source_sha': source, 'image_profile': 'backup', 'trigger_mode': 'bootstrap-tag'}


def main(argv):
    if len(argv) != 9:
        return 64
    try:
        value = verify(*argv[1:])
    except (KeyError, TypeError, ValueError):
        print('BACKUP_BUILD_TRIGGER_REJECTED', file=sys.stderr)
        return 65
    for key in ('source_sha', 'image_profile', 'trigger_mode'):
        print(f'{key}={value[key]}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
