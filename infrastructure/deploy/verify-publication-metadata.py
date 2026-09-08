#!/usr/bin/env python3
"""Fail closed before registry login, including ambiguous 404/permission errors."""
import json
from pathlib import Path
import sys


def verify(run, gate, package, source, run_id):
    if (str(run.get('id')) != run_id or run.get('head_sha') != source
            or run.get('head_branch') != 'develop' or run.get('event') != 'workflow_dispatch'
            or run.get('path') != '.github/workflows/backup-image.yml'
            or run.get('conclusion') != 'success'
            or run.get('repository', {}).get('full_name') != 'smk-darussalam-subah/smart-ai-school'):
        raise ValueError('build-run-binding')
    reviewers = [r for r in gate.get('protection_rules', []) if r.get('type') == 'required_reviewers']
    if (len(reviewers) != 1 or not reviewers[0].get('reviewers')
            or gate.get('can_admins_bypass') is not False):
        raise ValueError('publication-environment-gate')
    if (package.get('name') != 'diis-pg-backup' or package.get('visibility') != 'private'
            or package.get('package_type') != 'container'
            or package.get('repository', {}).get('full_name') != 'smk-darussalam-subah/smart-ai-school'):
        raise ValueError('package-private-linkage')


if __name__ == '__main__':
    try:
        verify(*(json.loads(Path(p).read_bytes()) for p in ('run.json', 'gate.json', 'metadata-package.json')),
               *sys.argv[1:])
    except Exception:
        sys.exit('PUBLICATION_METADATA_STOP')
