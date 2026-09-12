#!/usr/bin/env python3
"""Explicit D0 successor; historical validators still execute on their exact source."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile

BASE = 'a8d72b8e2a6e78438e4cef46ad21913ff369d3f0'
TREE = '75364250f2a5bbe875fc4bcf3da517c8f456adea'
ROOT = Path(__file__).resolve().parents[2]
REPORT = 'docs/audits/W10-D-INTEGRATED-D0-EXECUTOR-2026-09-11.md'
EVIDENCE = 'docs/audits/W10-D-INTEGRATED-D0-EVIDENCE-2026-09-11.json'
SOURCE = (
    '.github/workflows/backup-image.yml',
    '.github/workflows/ci.yml',
    '.github/workflows/capacity-lifecycle.yml',
    'docs/audits/W10-D-INTEGRATED-BLOCKER-CLOSURE-LEDGER-2026-09-11.md',
    'docs/runbooks/w10d-integrated-operations.md',
    'infrastructure/deploy/backup-image-artifact.py',
    'infrastructure/deploy/capacity_bundle.py',
    'infrastructure/deploy/install-w10d-legacy-writer-snapshot.py',
    'infrastructure/deploy/install-w10d-writer-compatibility.py',
    'infrastructure/deploy/legacy-backup-compatibility.sh',
    'infrastructure/deploy/staging-application-deploy.py',
    'infrastructure/deploy/staging-image-config.py',
    'infrastructure/deploy/verify-publication-metadata.py',
    'infrastructure/deploy/verify-published-backup-image.py',
    'infrastructure/deploy/verify-integrated-handoff.py',
    'infrastructure/deploy/tests/integrated-closure-contract.py',
    'infrastructure/deploy/tests/integrated-linux-proof.py',
    'infrastructure/deploy/tests/source-closure-contract.py',
)


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def pairs(items):
    value = {}
    for key, item in items:
        require(key not in value, 'duplicate-key')
        value[key] = item
    return value


def read(root, relative):
    path = root / relative
    require(path.resolve(strict=True) == path, 'unsafe-path')
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= 2*1024**2,
            'unsafe-file')
    raw = path.read_bytes()
    require(len(raw) == info.st_size and path.stat().st_mtime_ns == info.st_mtime_ns, 'file-drift')
    return raw


def git(root, *args):
    command = ['git']
    pointer = root / '.git'
    if os.name == 'posix' and pointer.is_file():
        value = pointer.read_text().strip().removeprefix('gitdir: ')
        if re.match('[A-Za-z]:/', value):
            command += ['--git-dir', '/mnt/' + value[0].lower() + value[2:],
                        '--work-tree', str(root)]
    # Git over a Windows-mounted worktree can take materially longer than native
    # Linux while still being a bounded, deterministic read. Keep the ceiling
    # finite without turning ordinary WSL filesystem latency into false drift.
    return subprocess.check_output([*command, *args], cwd=root, timeout=120,
                                   stderr=subprocess.DEVNULL)


def workspace_paths(root):
    modified = git(root, 'diff', '--name-only', '--diff-filter=ACDMRTUXB', BASE, '--')
    untracked = git(root, 'ls-files', '--others', '--exclude-standard')
    try:
        paths = {line for raw in (modified, untracked)
                 for line in raw.decode('utf-8').splitlines() if line}
    except UnicodeError:
        raise ValueError('workspace-path-encoding') from None
    require(all(not Path(path).is_absolute() and '..' not in Path(path).parts for path in paths),
            'workspace-path')
    return paths


def historical(root):
    """Materialize only tracked validator inputs, not the application or its data."""
    require(git(root, 'rev-parse', BASE+'^{tree}').decode().strip() == TREE, 'baseline-tree')
    paths = set()
    initial = ('infrastructure/deploy/verify-source-closure-handoff.py',
               'infrastructure/deploy/verify-capacity-handoff.py',
               'infrastructure/deploy/capacity_bundle.py')
    # These exact baseline modules are trusted reviewed source, never checkout code.
    namespace = {}
    for name in initial:
        raw = git(root, 'show', BASE+':'+name)
        if name.endswith('verify-capacity-handoff.py'):
            raw = raw.replace(b'import capacity_bundle', b'')
        scope = {'__file__': str(root/name), '__name__': 'historical_input_inventory'}
        exec(compile(raw, name, 'exec'), scope)
        namespace[name] = scope
        paths.add(name)
    closure = namespace[initial[0]]
    capacity = namespace[initial[1]]
    paths.update(Path(p).as_posix() for p in closure['FOLLOWUP_MANIFEST'])
    for key in ('REPORT_RELATIVE', 'EVIDENCE_RELATIVE', 'LEGACY_REPORT_RELATIVE',
                'LEGACY_EVIDENCE_RELATIVE', 'CONTRACT_RELATIVE'):
        paths.add(str(closure[key]))
    # The predecessor verifies every byte named by both its current and legacy
    # manifests. Materialize those declared inputs too; omitting them would make
    # an unchanged historical validator fail merely because its temporary tree
    # was incomplete.
    for evidence_path in (closure['EVIDENCE_RELATIVE'], closure['LEGACY_EVIDENCE_RELATIVE']):
        evidence = json.loads(git(root, 'show', BASE+':'+str(evidence_path)),
                              object_pairs_hook=pairs)
        manifest = evidence.get('sourceManifest')
        require(type(manifest) is list, 'historical-manifest-schema')
        for item in manifest:
            require(type(item) is dict and set(item) == {'path', 'sha256'}
                    and type(item['path']) is str, 'historical-manifest-entry')
            relative = Path(item['path'])
            require(not relative.is_absolute() and '..' not in relative.parts,
                    'historical-manifest-path')
            paths.add(relative.as_posix())
    paths.update(Path(p).as_posix() for p in capacity['SOURCE'])
    paths.update(Path(capacity[k]).as_posix() for k in ('REPORT','EVIDENCE','HOST_PACKET'))
    paths.update(Path(p).as_posix() for p in namespace[initial[2]]['FILES'])
    with tempfile.TemporaryDirectory(prefix='diis-historical-handoff-') as directory:
        destination = Path(directory)
        for name in sorted(paths):
            relative = Path(name)
            require(not relative.is_absolute() and '..' not in relative.parts, 'historical-path')
            raw = git(root, 'show', BASE+':'+relative.as_posix())
            require(len(raw) <= 2*1024**2, 'historical-size')
            target = destination/relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
            if name.startswith('docs/'):
                require(read(root, relative) == raw, 'historical-evidence-modified')
        for name in initial[:2]:
            subprocess.run([sys.executable, '-B', str(destination/name)],
                           check=True, timeout=60, capture_output=True)
    return len(paths)


def validate(root=ROOT, predecessors=True):
    require(workspace_paths(root) == set(SOURCE) | {REPORT, EVIDENCE},
            'successor-workspace-scope')
    evidence = json.loads(read(root,EVIDENCE),object_pairs_hook=pairs)
    require(type(evidence) is dict and set(evidence) == {
        'schema','baseline','sourceManifest','sourceManifestSha256','reportSha256',
        'rebindings','tests','observations','operationalStatus'}, 'successor-schema')
    require(evidence['schema']=='diis-integrated-d0-handoff-v1'
            and evidence['baseline']=={'sha':BASE,'tree':TREE}
            and evidence['operationalStatus']=='D1-D6 HOLD', 'successor-binding')
    manifest=evidence['sourceManifest']
    require(type(manifest) is dict and set(manifest)==set(SOURCE), 'manifest-path-set')
    for path,digest in manifest.items():
        require(type(digest) is str and re.fullmatch('[a-f0-9]{64}',digest)
                and sha(read(root,path))==digest, 'manifest-byte-drift')
    aggregate=''.join(f'{manifest[p]}  {p}\n' for p in sorted(manifest)).encode()
    require(sha(aggregate)==evidence['sourceManifestSha256'], 'manifest-aggregate')
    require(sha(read(root,REPORT))==evidence['reportSha256'], 'report-binding')
    rebindings=evidence['rebindings']
    require(type(rebindings) is dict, 'rebindings-schema')
    changed={}
    for path in SOURCE:
        entry=git(root,'ls-tree',BASE,'--',path).strip()
        if not entry:
            continue
        previous=sha(git(root,'show',BASE+':'+path))
        if manifest[path]!=previous:
            changed[path]={'before':previous,'after':manifest[path]}
    require(changed==rebindings, 'rebindings-mismatch')
    tests=evidence['tests']
    require(type(tests) is dict and tests, 'test-evidence-missing')
    for result in tests.values():
        require(type(result) is dict and result.get('executed') is True
                and result.get('exitCode') == 0 and type(result.get('cases')) is int
                and result['cases']>0 and result.get('command'), 'test-evidence-invalid')
    count=historical(root) if predecessors else 0
    return {'sourceFiles':len(manifest),'rebindings':len(changed),'historicalInputs':count}


if __name__=='__main__':
    try:
        print('INTEGRATED_HANDOFF_VALID '+json.dumps(validate(),sort_keys=True))
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError):
        sys.exit('INTEGRATED_HANDOFF_REJECTED')
