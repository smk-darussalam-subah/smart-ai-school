#!/usr/bin/env python3
"""Real local Docker/Compose writer compatibility. Synthetic owned resources only."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[3]


def load(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    module=importlib.util.module_from_spec(spec)
    sys.modules[name]=module
    spec.loader.exec_module(module)
    return module


c=load('diis_staging_core','infrastructure/deploy/staging-readiness-deploy.py')
a=load('app','infrastructure/deploy/staging-application-deploy.py')
p=load('artifact','infrastructure/deploy/backup-image-artifact.py')
sys.path.insert(0,str(ROOT/'infrastructure/deploy'))
snapshot=load('legacy_snapshot','infrastructure/deploy/install-w10d-legacy-writer-snapshot.py')
bundle=snapshot.capacity_bundle


def run(argv):
    result=subprocess.run(argv,check=True,timeout=60,capture_output=True)
    if len(result.stdout)>1024*1024:
        raise ValueError('test-output-cap')
    return result.stdout


def main():
    image=os.environ['W10D_SYNTHETIC_IMAGE_ID']
    if not re.fullmatch('sha256:[a-f0-9]{64}',image):
        raise ValueError('test-image-must-be-existing-immutable-id')
    if run(['docker','image','inspect','--format','{{.Id}}',image]).decode().strip()!=image:
        raise ValueError('test-image-unavailable-no-pull')
    root=Path(tempfile.mkdtemp(prefix='diis-d0-linux-'))
    project='diis-d0-'+uuid.uuid4().hex[:12]
    name=project+'-writer'
    capture_name=project+'-capture'
    artifact=root/'writer-compatibility'/a.PERSISTENT_WRITER_ARTIFACT_SHA256
    library=artifact/'backup-lib.sh'
    library.parent.mkdir(parents=True,mode=0o700)
    library.parent.parent.chmod(0o700)
    raw=(ROOT/'infrastructure/docker/scripts/backup-lib.sh').read_bytes()
    library.write_bytes(raw)
    library.chmod(0o600)
    wrapper=artifact/'legacy-backup-compatibility.sh'
    wrapper_raw=(ROOT/'infrastructure/deploy/legacy-backup-compatibility.sh').read_bytes()
    wrapper.write_bytes(wrapper_raw)
    wrapper.chmod(0o600)
    legacy_raw=b'#!/bin/sh\nexit 0\n'
    legacy_sha=hashlib.sha256(legacy_raw).hexdigest()
    legacy=root/'writer-compatibility'/'legacy'/legacy_sha/'legacy-backup.sh'
    legacy.parent.mkdir(parents=True,mode=0o700)
    legacy.write_bytes(legacy_raw)
    legacy.chmod(0o600)
    compose=root/'compose.json'
    compose.write_text(json.dumps({'services':{'writer':{
        'image':image,'container_name':name,'entrypoint':['sh','-c','sleep 300'],
        'network_mode':'none','read_only':True,'cap_drop':['ALL'],
        'security_opt':['no-new-privileges:true'],'pids_limit':32,'mem_limit':'64m',
        'labels':{'diis.synthetic-owner':project},
        'volumes':[
            {'type':'bind','source':str(wrapper),'target':'/backup.sh','read_only':True},
            {'type':'bind','source':str(library),'target':'/backup-lib.sh','read_only':True},
            {'type':'bind','source':str(legacy),'target':'/legacy-backup.sh','read_only':True},
        ]},'capture':{
        'image':image,'container_name':capture_name,'entrypoint':['sh','-c','sleep 300'],
        'network_mode':'none','read_only':True,'cap_drop':['ALL'],
        'security_opt':['no-new-privileges:true'],'pids_limit':32,'mem_limit':'64m',
        'labels':{'diis.synthetic-owner':project},
        'volumes':[
            {'type':'bind','source':str(legacy),'target':'/backup.sh','read_only':True},
        ]}}}))
    args=['docker','compose','-p',project,'-f',str(compose)]
    host=a.Host({'baseline':{'sourceSha':'a'*40}})
    checks=0
    try:
        run([*args,'up','-d','--no-build','--pull','never'])
        output=root/'bundle'
        digest=bundle.build(ROOT,output,'a'*40,'b'*40)
        manifest=json.loads((output/'bundle.json').read_bytes())
        manifest['status']='RELEASED'  # synthetic custodian fixture, not a release
        raw_manifest=bundle.canonical(manifest)
        (output/'bundle.json').write_bytes(raw_manifest)
        digest=hashlib.sha256(raw_manifest).hexdigest()
        snapshot_state=root/'snapshot-state';snapshot_state.mkdir(mode=0o700)
        with patch.object(snapshot,'STATE',snapshot_state), \
                patch.object(snapshot,'CONTAINER',capture_name), \
                patch.object(snapshot,'LEGACY_SHA256',legacy_sha):
            if snapshot.install(output,digest,'a'*40)!='INSTALLED_NOT_MOUNTED':
                raise ValueError('actual-snapshot-install')
            if snapshot.install(output,digest,'a'*40)!='UNCHANGED':
                raise ValueError('actual-snapshot-idempotency')
            captured=(snapshot_state/'writer-compatibility'/'legacy'/legacy_sha/'legacy-backup.sh')
            if captured.read_bytes()!=legacy_raw:
                raise ValueError('actual-snapshot-bytes')
            checks+=2
        def docker(argv):
            return run([name if arg=='smk-pg-backup' else arg for arg in argv])
        def source(*argv):
            if argv[-1].endswith('infrastructure/docker/scripts/backup-lib.sh'):
                return raw
            if argv[-1].endswith('infrastructure/deploy/legacy-backup-compatibility.sh'):
                return wrapper_raw
            raise ValueError('unexpected-git-source')
        with patch.object(c,'STATE',root),patch.object(a,'LEGACY_WRITER_SHA256',legacy_sha), \
                patch.object(host,'git',side_effect=source),patch.object(c,'run',side_effect=docker):
            assert host.compatible_writer()==a.PERSISTENT_WRITER_LIBRARY_SHA256
            checks+=1
            library.write_bytes(raw+b'\n')
            try:host.compatible_writer()
            except c.Stop:checks+=1
            else:raise ValueError('actual-byte-drift-not-rejected')
            library.write_bytes(raw)
            assert host.compatible_writer()==a.PERSISTENT_WRITER_LIBRARY_SHA256
            checks+=1
        # Runtime must enforce read-only bytes for all three execution-chain files.
        for path,source_file,expected in (
                ('/backup.sh',wrapper,a.PERSISTENT_WRITER_WRAPPER_SHA256),
                ('/backup-lib.sh',library,a.PERSISTENT_WRITER_LIBRARY_SHA256),
                ('/legacy-backup.sh',legacy,legacy_sha)):
            attempt=subprocess.run(['docker','exec',name,'sh','-c','printf x >> '+path],
                                   capture_output=True,timeout=10)
            if attempt.returncode==0 or hashlib.sha256(source_file.read_bytes()).hexdigest()!=expected:
                raise ValueError('readonly-write-negative-failed')
            checks+=1

        # Docker's containerd store may expose an OCI-index Id. Bind both that
        # local runtime identity and the portable config digest from docker save.
        evidence=root/'image-evidence'
        evidence.mkdir(mode=0o700)
        run(['docker','save','--output',str(evidence/'image.tar'),image])
        inspection=json.loads(run(['docker','image','inspect',image]))
        source=inspection[0].get('Config',{}).get('Labels',{}).get(
            'org.opencontainers.image.revision')
        if not isinstance(source,str) or not re.fullmatch('[a-f0-9]{40}',source):
            raise ValueError('synthetic-image-source-label')
        config_id,_=p.archive_config(evidence/'image.tar')
        fixtures={
            'image.json':inspection,
            'sbom.json':{'source':{'target':{'imageID':config_id}},
                         'artifacts':[{'name':'synthetic-binding-proof'}]},
            'grype.json':{'source':{'target':{'imageID':config_id}},
                          'descriptor':{'name':'grype','version':'0.118.0'},'matches':[]},
            'grype-db.json':{'valid':True},
            'scanner.json':{key:'a'*64 for key in (
                'grypeExecutableSha256','syftExecutableSha256','dbSha256')},
            'smoke.json':{'schema':'diis-image-smoke-v1','imageId':inspection[0]['Id'],
                          'status':'pass','network':'none'},
        }
        for filename,value in fixtures.items():
            (evidence/filename).write_text(json.dumps(value),encoding='ascii')
        p.bind(evidence,source,'1')
        now=int(time.time())
        approval={'schema':'diis-backup-publication-v1','sourceSha':source,
            'buildRunId':'1','bindingSha256':p.sha(evidence/'binding.json'),
            'notBefore':now-1,'expires':now+600,'riskDecisionSha256':'b'*64,
            'package':p.PACKAGE,'visibility':'private'}
        binding=p.verify(evidence,source,'1',approval,now)
        if (binding['imageId']!=config_id
                or binding['localImageId']!=inspection[0]['Id']):
            raise ValueError('portable-local-image-identity')
        checks+=1
    finally:
        run([*args,'down','--timeout','5'])
        containers=run(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project]).strip()
        networks=run(['docker','network','ls','-q','--filter','label=com.docker.compose.project='+project]).strip()
        volumes=run(['docker','volume','ls','-q','--filter','label=com.docker.compose.project='+project]).strip()
        if containers or networks or volumes:
            raise ValueError('owned-cleanup-ambiguous-preserved:'+str(root))
        shutil.rmtree(root)
    print(json.dumps({'schema':'diis-d0-linux-proof-v1','cases':checks,'exitCode':0,
        'containerResidue':0,'networkResidue':0,'volumeResidue':0,'temporaryDirectoryResidue':0,
        'imageId':image,'sourceLibrarySha256':hashlib.sha256(raw).hexdigest()},sort_keys=True))


if __name__=='__main__':
    main()
