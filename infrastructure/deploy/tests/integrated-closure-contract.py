#!/usr/bin/env python3
"""D0 regressions against the actual pre-promotion Git baseline; no remote mutation."""
import base64
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


c = load('diis_staging_core', 'infrastructure/deploy/staging-readiness-deploy.py')
a = load('application', 'infrastructure/deploy/staging-application-deploy.py')
m = load('metadata', 'infrastructure/deploy/verify-publication-metadata.py')
trigger = load('build_trigger', 'infrastructure/deploy/verify-backup-build-trigger.py')
p = load('artifact', 'infrastructure/deploy/backup-image-artifact.py')
registry = load('registry', 'infrastructure/deploy/verify-published-backup-image.py')
sys.path.insert(0,str(ROOT/'infrastructure/deploy'))
installer=load('writer_installer','infrastructure/deploy/install-w10d-writer-compatibility.py')
bundle=installer.capacity_bundle
snapshot=load('legacy_snapshot','infrastructure/deploy/install-w10d-legacy-writer-snapshot.py')
d0=load('integrated_handoff','infrastructure/deploy/verify-integrated-handoff.py')


class Publication(unittest.TestCase):
    def setUp(self):
        self.now = int(time.time())
        self.value = {'schema': 'diis-first-publication-owner-evidence-v1',
            'repository': m.REPOSITORY, 'package': 'diis-pg-backup', 'sourceSha': 'a'*40,
            'buildRunId': '12', 'notBefore': self.now-1, 'expires': self.now+600,
            'authority': 'organization-package-admin', 'owner': 'synthetic-owner',
            'inventoryEvidenceSha256': 'b'*64, 'completeInventory': True, 'packageAbsent': True}

    def check(self, value=None, observation=None, digest=None):
        raw = json.dumps(value or self.value).encode()
        return m.first_publication(observation or {'status':404, 'package':'diis-pg-backup'},
            raw, digest or hashlib.sha256(raw).hexdigest(), 'a'*40, '12', 'backup', self.now)

    def test_first_requires_exact_independent_absence(self):
        self.assertEqual(self.check()['authority'], 'organization-package-admin')
        for key, value in [('completeInventory',False), ('packageAbsent',False),
                           ('authority','workflow-token'), ('package','other'),
                           ('sourceSha','c'*40), ('buildRunId','13'), ('expires',self.now),
                           ('inventoryEvidenceSha256','0'*64)]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.check({**self.value,key:value})

    def test_403_401_200_and_hash_drift_never_mean_absent(self):
        for code in (401,403,200,429,500):
            with self.subTest(code=code), self.assertRaises(ValueError):
                self.check(observation={'status':code,'package':'diis-pg-backup'})
        with self.assertRaises(ValueError):
            self.check(digest='c'*64)
        duplicate=(json.dumps(self.value)[:-1]
                   + ',"packageAbsent":true}').encode()
        with self.assertRaises(ValueError):
            m.first_publication({'status':404,'package':'diis-pg-backup'},duplicate,
                hashlib.sha256(duplicate).hexdigest(),'a'*40,'12','backup',self.now)

    def test_collect_binds_branch_policy_and_owner_attested_first_mode(self):
        run={'id':12,'head_sha':'a'*40,'head_branch':'develop','event':'workflow_dispatch',
             'path':'.github/workflows/backup-image.yml','conclusion':'success',
             'repository':{'full_name':m.REPOSITORY}}
        gate={'id':9,'can_admins_bypass':False,
              'deployment_branch_policy':{'protected_branches':False,
                                           'custom_branch_policies':True},
              'protection_rules':[{'type':'required_reviewers','reviewers':[{'id':1}]}]}
        branches={'total_count':1,'branch_policies':[{'name':'develop','type':'branch'}]}
        raw=json.dumps(self.value)
        def request(path,allow_absent=False):
            if '/actions/runs/' in path:return run
            if path.endswith('/deployment-branch-policies'):return branches
            if '/environments/' in path:return gate
            if '/packages/container/' in path and allow_absent:return None
            raise AssertionError((path,allow_absent))
        with patch.object(m,'request',side_effect=request), patch.dict(os.environ,{
                'FIRST_PUBLICATION_EVIDENCE':raw,
                'ABSENCE_SHA':hashlib.sha256(raw.encode()).hexdigest()}):
            result=m.collect('a'*40,'12','backup','first')
            self.assertEqual(result['packageState'],'owner-attested-absent')
        with patch.object(m,'request',side_effect=request), patch.dict(os.environ,{
                'FIRST_PUBLICATION_EVIDENCE':raw,'ABSENCE_SHA':'0'*64}), \
                self.assertRaises(ValueError):
            m.collect('a'*40,'12','backup','first')
        wrong={**branches,'branch_policies':[{'name':'main','type':'branch'}]}
        with patch.object(m,'request',side_effect=lambda path,allow_absent=False:
                wrong if path.endswith('/deployment-branch-policies') else request(path,allow_absent)), \
                self.assertRaises(ValueError):
            m.collect('a'*40,'12','backup','first')

    def test_bootstrap_build_metadata_requires_exact_tag_and_develop_ancestry(self):
        source = 'a' * 40
        tag = trigger.TAG_PREFIX + source
        run = {'id': 12, 'head_sha': source, 'head_branch': tag, 'event': 'push',
               'path': '.github/workflows/backup-image.yml', 'conclusion': 'success',
               'repository': {'full_name': m.REPOSITORY}}
        gate = {'id': 9, 'can_admins_bypass': False,
                'deployment_branch_policy': {'protected_branches': False,
                                             'custom_branch_policies': True},
                'protection_rules': [{'type': 'required_reviewers',
                                      'reviewers': [{'id': 1}]}]}
        branches = {'total_count': 1,
                    'branch_policies': [{'name': 'develop', 'type': 'branch'}]}
        package = {'name': m.PACKAGES['backup'], 'visibility': 'private',
                   'package_type': 'container', 'repository': {'full_name': m.REPOSITORY}}
        comparison = {'status': 'ahead', 'base_commit': {'sha': source},
                      'merge_base_commit': {'sha': source}}

        def request(path, allow_absent=False):
            if '/actions/runs/' in path:
                return run
            if path.endswith('/deployment-branch-policies'):
                return branches
            if '/environments/' in path:
                return gate
            if '/packages/container/' in path:
                return package
            if '/git/ref/tags/' in path:
                return {'object': {'type': 'commit', 'sha': source}}
            if '/compare/' in path:
                return comparison
            raise AssertionError((path, allow_absent))

        with patch.object(m, 'request', side_effect=request):
            result = m.collect(source, '12', 'backup', 'existing')
        self.assertEqual(result['buildTrigger'], 'bootstrap-tag')
        for bad_run in ({**run, 'head_branch': tag + 'x'},
                        {**run, 'event': 'workflow_dispatch'}):
            with self.subTest(run=bad_run), self.assertRaises(ValueError):
                m.verify(bad_run, gate, package, source, '12')
        with patch.object(m, 'request', side_effect=lambda path, allow_absent=False:
                {**comparison, 'status': 'diverged'} if '/compare/' in path
                else request(path, allow_absent)), self.assertRaises(ValueError):
            m.collect(source, '12', 'backup', 'existing')

    def test_api_web_build_only_actual_staging_merge(self):
        gate={'can_admins_bypass':False,'protection_rules':[{'type':'required_reviewers','reviewers':[{'id':1}]}]}
        run={'id':12,'head_sha':'a'*40,'head_branch':'staging','event':'workflow_dispatch',
             'path':'.github/workflows/backup-image.yml','conclusion':'success',
             'repository':{'full_name':m.REPOSITORY}}
        for profile in ('api','web'):
            package={'name':m.PACKAGES[profile],'visibility':'private','package_type':'container',
                     'repository':{'full_name':m.REPOSITORY}}
            m.verify(run,gate,package,'a'*40,'12',profile)
            with self.assertRaises(ValueError):
                m.verify({**run,'head_branch':'develop'},gate,package,'a'*40,'12',profile)
            with self.assertRaises(ValueError):
                m.verify(run,gate,{**package,'visibility':'public'},'a'*40,'12',profile)

    def test_public_config_fixed_and_no_private_input(self):
        self.assertEqual(p.build_config('api'), {})
        public_key=base64.urlsafe_b64encode(b'\x04'+b'\x01'*64).decode().rstrip('=')
        config=p.build_config('web',public_key)
        self.assertEqual(config['API_URL'],'http://smk-staging-api:3001')
        for key in ('', 'secret\nvalue', 'https://production.example', 'A'*87, 'A'*88):
            with self.assertRaises(ValueError):
                p.build_config('web',key)
        with self.assertRaises(ValueError):
            p.build_config('api',public_key)

    def test_exact_packages_only_roundtrip(self):
        for package in registry.PACKAGES:
            binding={'package':package,'imageId':'sha256:'+'a'*64}
            ref=package+'@sha256:'+'b'*64
            self.assertEqual(registry.select(binding,[ref]),ref)
            with self.assertRaises(ValueError):
                registry.select(binding,['ghcr.io/foreign/pkg@sha256:'+'b'*64])

    def test_registry_runtime_id_is_bounded_to_config_platform_or_root(self):
        binding={'package':registry.PACKAGE,'imageId':'sha256:'+'a'*64,
                 'sourceSha':'b'*40,'buildRunId':'12'}
        platform=json.dumps({'schemaVersion':2,'config':{'digest':binding['imageId']},
            'layers':[{'digest':'sha256:'+'c'*64,'size':12}]},
            sort_keys=True,separators=(',',':')).encode()
        platform_digest='sha256:'+hashlib.sha256(platform).hexdigest()
        index=json.dumps({'schemaVersion':2,'manifests':[{'digest':platform_digest,
            'platform':{'architecture':'amd64','os':'linux'}}]},
            sort_keys=True,separators=(',',':')).encode()
        root_digest='sha256:'+hashlib.sha256(index).hexdigest()
        root_ref=registry.PACKAGE+'@'+root_digest
        platform_ref=registry.PACKAGE+'@'+platform_digest
        for runtime_id in (binding['imageId'],platform_digest,root_digest):
            image=[{'Id':runtime_id,'Os':'linux','Architecture':'amd64',
                    'RepoDigests':[platform_ref],
                    'Config':{'Labels':{'org.opencontainers.image.revision':'b'*40}}}]
            receipt=registry.verify(binding,'e'*64,root_ref,index,platform_ref,platform,image)
            self.assertEqual(receipt['observedRuntimeImageId'],runtime_id)
        image[0]['Id']='sha256:'+'d'*64
        with self.assertRaises(ValueError):
            registry.verify(binding,'e'*64,root_ref,index,platform_ref,platform,image)

    def test_bootstrap_mode_not_reused_with_old_approval(self):
        with self.assertRaisesRegex(ValueError,'publication-approval-schema'):
            p.verify(Path('/nonexistent'),'a'*40,'12',{},self.now,'backup','first','b'*64)

    def test_publish_uses_portable_config_and_archive_identity(self):
        workflow=(ROOT/'.github/workflows/backup-image.yml').read_text()
        self.assertIn('config_id=$(python3 infrastructure/deploy/backup-image-artifact.py verify',
                      workflow)
        self.assertIn('verify-loaded-backup-image.py evidence/image.tar',workflow)
        self.assertIn('verify-loaded-backup-image.py --registry-roundtrip',workflow)
        self.assertNotIn("docker image inspect --format '{{.Id}}' diis-reviewed-backup)\" = \"$image",
                         workflow)

    def test_d0_workflows_pin_actions_and_bind_cross_run_download(self):
        workflows = [
            ROOT / '.github/workflows/backup-image.yml',
            ROOT / '.github/workflows/ci.yml',
            ROOT / '.github/workflows/capacity-lifecycle.yml',
        ]
        for path in workflows:
            with self.subTest(path=path.name):
                for line in path.read_text().splitlines():
                    stripped = line.strip()
                    if stripped.startswith(('uses:', '- uses:')):
                        reference = stripped.split('#', 1)[0].rsplit('@', 1)[-1].strip()
                        self.assertRegex(reference, r'^[0-9a-f]{40}$')
        workflow = workflows[0].read_text()
        self.assertIn('run-id: ${{ inputs.build_run_id }}', workflow)
        self.assertIn('github-token: ${{ github.token }}', workflow)
        self.assertIn('repository: ${{ github.repository }}', workflow)

    def test_scan_identity_accepts_only_bound_config_or_local_image(self):
        source='a'*40
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            config_bytes=json.dumps({'os':'linux','architecture':'amd64',
                'config':{'Labels':{'org.opencontainers.image.revision':source}}}).encode()
            config_id='sha256:'+hashlib.sha256(config_bytes).hexdigest()
            local_id='sha256:'+'b'*64
            fixtures={'image.json':[{'Id':local_id,'Os':'linux','Architecture':'amd64',
                'Config':{'Labels':{'org.opencontainers.image.revision':source}}}],
                'grype-db.json':{'valid':True},
                'scanner.json':{key:'c'*64 for key in (
                    'grypeExecutableSha256','syftExecutableSha256','dbSha256')},
                'smoke.json':{'schema':'diis-image-smoke-v1','imageId':local_id,
                              'status':'pass','network':'none'}}
            for name,value in fixtures.items():
                (root/name).write_text(json.dumps(value))
            import io,tarfile
            with tarfile.open(root/'image.tar','w') as archive:
                for name,raw in [('manifest.json',b'[{"Config":"config.json"}]'),
                                 ('config.json',config_bytes)]:
                    member=tarfile.TarInfo(name);member.size=len(raw)
                    archive.addfile(member,io.BytesIO(raw))
            for identity in (config_id,local_id):
                (root/'grype.json').write_text(json.dumps({'source':{'target':{'imageID':identity}},
                    'descriptor':{'name':'grype','version':'0.118.0'},'matches':[]}))
                (root/'sbom.json').write_text(json.dumps({'source':{'target':{'imageID':identity}},
                    'artifacts':[{'name':'synthetic'}]}))
                self.assertEqual(p.validate_content(root,source),config_id)
            (root/'grype.json').write_text(json.dumps({'source':{'target':{'imageID':'sha256:'+'d'*64}},
                'descriptor':{'name':'grype','version':'0.118.0'},'matches':[]}))
            with self.assertRaises(ValueError):
                p.validate_content(root,source)


class WriterCompatibility(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.state=Path(self.tmp.name)
        self.parent=self.state/'writer-compatibility'
        self.parent.mkdir(mode=0o700)
        self.directory=self.parent/a.PERSISTENT_WRITER_ARTIFACT_SHA256
        self.directory.mkdir(mode=0o700)
        self.library=self.directory/'backup-lib.sh'
        self.raw=(ROOT/'infrastructure/docker/scripts/backup-lib.sh').read_bytes()
        self.library.write_bytes(self.raw)
        self.library.chmod(0o600)
        self.wrapper=self.directory/'legacy-backup-compatibility.sh'
        self.wrapper_raw=(ROOT/'infrastructure/deploy/legacy-backup-compatibility.sh').read_bytes()
        self.wrapper.write_bytes(self.wrapper_raw)
        self.wrapper.chmod(0o600)
        self.legacy_raw=b'#!/bin/sh\nexit 0\n'
        self.legacy_sha=hashlib.sha256(self.legacy_raw).hexdigest()
        self.legacy=self.parent/'legacy'/self.legacy_sha/'legacy-backup.sh'
        self.legacy.parent.mkdir(parents=True,mode=0o700)
        self.legacy.write_bytes(self.legacy_raw)
        self.legacy.chmod(0o600)
        self.host=a.Host({'baseline':{'sourceSha':'a'*40}})
        self.mounts=[
            {'Destination':'/backup.sh','Source':str(self.wrapper),'Type':'bind','RW':False},
            {'Destination':'/backup-lib.sh','Source':str(self.library),'Type':'bind','RW':False},
            {'Destination':'/legacy-backup.sh','Source':str(self.legacy),'Type':'bind','RW':False},
        ]

    def tearDown(self):
        self.tmp.cleanup()

    def run_probe(self,argv):
        if argv[:2]==['docker','inspect']:
            return json.dumps(self.mounts).encode()
        return (a.PERSISTENT_WRITER_WRAPPER_SHA256+'  /backup.sh\n'
                +a.PERSISTENT_WRITER_LIBRARY_SHA256+'  /backup-lib.sh\n'
                +self.legacy_sha+'  /legacy-backup.sh\n').encode()

    def source(self,*argv):
        target=argv[-1]
        if target.endswith('infrastructure/docker/scripts/backup-lib.sh'):
            return self.raw
        if target.endswith('infrastructure/deploy/legacy-backup-compatibility.sh'):
            return self.wrapper_raw
        raise AssertionError(target)

    def check(self):
        with patch.object(c,'STATE',self.state), patch.object(a,'LEGACY_WRITER_SHA256',self.legacy_sha), \
                patch.object(self.host,'git',side_effect=self.source), \
                patch.object(c,'run',side_effect=self.run_probe):
            return self.host.compatible_writer()

    def test_real_old_base_remains_byte_identical(self):
        git=['git']
        pointer=ROOT/'.git'
        if pointer.is_file() and os.name == 'posix':
            value=pointer.read_text().strip().removeprefix('gitdir: ')
            if len(value)>2 and value[1:3]==':/':
                git += ['--git-dir', '/mnt/'+value[0].lower()+value[2:]]
        old=subprocess.check_output([*git,'show',
            '777314b12bcd168e2772603a31d657919aafa5bb:infrastructure/docker/scripts/backup-lib.sh'],cwd=ROOT)
        self.assertNotEqual(hashlib.sha256(old).hexdigest(),a.PERSISTENT_WRITER_LIBRARY_SHA256)
        checkout=self.state/'old-checkout'
        checkout.mkdir()
        legacy=checkout/'backup-lib.sh'
        legacy.write_bytes(old)
        with patch.object(c,'ROOT',checkout):
            self.assertEqual(self.check(),a.PERSISTENT_WRITER_LIBRARY_SHA256)
        self.assertEqual(legacy.read_bytes(),old)

    def test_runtime_mount_must_be_exact_readonly_artifact(self):
        for field,value in [('RW',True),('Source','/old-checkout/backup-lib.sh'),('Type','volume')]:
            original=copy.deepcopy(self.mounts)
            self.mounts[1][field]=value
            with self.subTest(field=field), self.assertRaises(c.Stop):
                self.check()
            self.mounts=original

    def test_artifact_drift_symlink_and_permissions_fail_closed(self):
        self.library.write_bytes(self.raw+b'\n')
        with self.assertRaises(c.Stop):self.check()
        self.library.write_bytes(self.raw)
        self.library.chmod(0o644)
        with self.assertRaises(c.Stop):self.check()
        self.library.chmod(0o600)
        target=self.state/'target'
        self.library.rename(target)
        self.library.symlink_to(target)
        with self.assertRaises(c.Stop):self.check()
        self.library.unlink()
        self.library.write_bytes(self.raw)
        self.library.chmod(0o600)
        self.wrapper.write_bytes(self.wrapper_raw+b'\n')
        with self.assertRaises(c.Stop):self.check()

    def test_source_authority_and_runtime_hash_are_separate(self):
        with patch.object(c,'STATE',self.state), patch.object(a,'LEGACY_WRITER_SHA256',self.legacy_sha), \
                patch.object(self.host,'git',return_value=b'wrong'):
            with self.assertRaises(c.Stop):self.host.compatible_writer()
        with patch.object(c,'STATE',self.state), patch.object(a,'LEGACY_WRITER_SHA256',self.legacy_sha), \
                patch.object(self.host,'git',side_effect=self.source), \
                patch.object(c,'run',side_effect=[json.dumps(self.mounts).encode(),b'wrong']):
            with self.assertRaises(c.Stop):self.host.compatible_writer()


class ArtifactInstall(unittest.TestCase):
    def released_bundle(self, root):
        output=root/'bundle'
        digest=bundle.build(ROOT,output,'a'*40,'b'*40)
        manifest=json.loads((output/'bundle.json').read_bytes())
        manifest['status']='RELEASED'  # synthetic custodian fixture, not a release
        raw=bundle.canonical(manifest)
        (output/'bundle.json').write_bytes(raw)
        return output,hashlib.sha256(raw).hexdigest()

    def test_legacy_snapshot_is_bounded_exact_private_and_idempotent(self):
        legacy=b'#!/bin/sh\nexit 0\n'
        legacy_sha=hashlib.sha256(legacy).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);root.chmod(0o700)
            output,digest=self.released_bundle(root)
            state=root/'state';state.mkdir(mode=0o700)

            def capture(_helper,target):
                target.write_bytes(legacy)
                target.chmod(0o600)

            patches=(patch.object(snapshot,'STATE',state),
                     patch.object(snapshot,'LEGACY_SHA256',legacy_sha),
                     patch.object(snapshot,'runtime_identity',return_value='a'*64),
                     patch.object(snapshot,'runtime_hash',return_value=legacy_sha),
                     patch.object(snapshot,'bounded_capture',side_effect=capture),
                     patch.object(snapshot,'syntax_valid'))
            with patches[0],patches[1],patches[2],patches[3],patches[4],patches[5]:
                self.assertEqual(snapshot.install(output,digest,'a'*40),'INSTALLED_NOT_MOUNTED')
                self.assertEqual(snapshot.install(output,digest,'a'*40),'UNCHANGED')
                target=state/'writer-compatibility'/'legacy'/legacy_sha/'legacy-backup.sh'
                self.assertEqual(target.read_bytes(),legacy)
                self.assertEqual(target.stat().st_mode & 0o777,0o600)
                target.write_bytes(b'partial')
                with self.assertRaises(ValueError):
                    snapshot.install(output,digest,'a'*40)
                self.assertEqual(target.read_bytes(),b'partial')

    def test_legacy_snapshot_rejects_runtime_drift_before_capture(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);root.chmod(0o700)
            output,digest=self.released_bundle(root)
            state=root/'state';state.mkdir(mode=0o700)
            capture=patch.object(snapshot,'bounded_capture')
            with patch.object(snapshot,'STATE',state), \
                    patch.object(snapshot,'runtime_identity',return_value='a'*64), \
                    patch.object(snapshot,'runtime_hash',return_value='b'*64),capture as invoked:
                with self.assertRaises(ValueError):
                    snapshot.install(output,digest,'a'*40)
                invoked.assert_not_called()

    def test_legacy_failure_and_signal_retain_persistent_quarantine(self):
        for mode,payload in [('failure',b'#!/bin/sh\nexit 1\n'),
                             ('signal',b'#!/bin/sh\nkill -TERM "$PPID"\nexit 1\n')]:
            with self.subTest(mode=mode), tempfile.TemporaryDirectory(prefix='diis-bridge-',dir='/tmp') as directory:
                root=Path(directory);root.chmod(0o700)
                (root/'locks').mkdir(mode=0o700)
                (root/'backup-lib.sh').write_bytes((ROOT/'infrastructure/docker/scripts/backup-lib.sh').read_bytes())
                (root/'legacy-backup.sh').write_bytes(payload)
                env={**os.environ,'W10D_TEST_MODE':'1','DIIS_W10D_TEST_ROOT':str(root),'W10D_TEST_RESULT':mode}
                command=['sh',str(ROOT/'infrastructure/deploy/legacy-backup-compatibility.sh')]
                failed=subprocess.run(command,env=env,capture_output=True,timeout=5)
                self.assertEqual(failed.returncode,74)
                self.assertTrue((root/'locks/backup.lock/application-owner.json').exists())
                self.assertIn('diis-application-quarantine:',(root/'locks/backup.lock/owner').read_text())
                replay=subprocess.run(command,env=env,capture_output=True,timeout=5)
                self.assertNotEqual(replay.returncode,0)

    def test_released_hash_exact_noop_and_partial_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            output=root/'bundle'
            digest=bundle.build(ROOT,output,'a'*40,'b'*40)
            state=root/'state';state.mkdir(mode=0o700)
            with patch.object(installer,'STATE',state):
                with self.assertRaises(ValueError):installer.install(output,digest,'a'*40)
                manifest=json.loads((output/'bundle.json').read_bytes())
                manifest['status']='RELEASED'  # synthetic custodian fixture, not a release
                raw=bundle.canonical(manifest)
                (output/'bundle.json').write_bytes(raw)
                digest=hashlib.sha256(raw).hexdigest()
                with self.assertRaises(ValueError):installer.install(output,digest,'c'*40)
                self.assertEqual(installer.install(output,digest,'a'*40),'INSTALLED_NOT_MOUNTED')
                self.assertEqual(installer.install(output,digest,'a'*40),'UNCHANGED')
                target=state/'writer-compatibility'/installer.ARTIFACT_SHA/'backup-lib.sh'
                target.write_bytes(b'partial')
                with self.assertRaises(ValueError):installer.install(output,digest,'a'*40)
                self.assertEqual(target.read_bytes(),b'partial')

    def test_legacy_bridge_success_and_reject_before_producer(self):
        with tempfile.TemporaryDirectory(prefix='diis-bridge-',dir='/tmp') as directory:
            root=Path(directory);root.chmod(0o700)
            (root/'locks').mkdir(mode=0o700)
            (root/'backup-lib.sh').write_bytes((ROOT/'infrastructure/docker/scripts/backup-lib.sh').read_bytes())
            (root/'legacy-backup.sh').write_bytes(b'#!/bin/sh\nexit 0\n')
            env={**os.environ,'W10D_TEST_MODE':'1','DIIS_W10D_TEST_ROOT':str(root)}
            command=['sh',str(ROOT/'infrastructure/deploy/legacy-backup-compatibility.sh')]
            success=subprocess.run(command,env=env,capture_output=True,timeout=5)
            self.assertEqual(success.returncode,0,success.stderr)
            self.assertFalse((root/'locks/backup.lock').exists())
            lock=root/'locks/backup.lock';lock.mkdir()
            (lock/'application-owner.json').write_text('{}')
            blocked=subprocess.run(command,env=env,capture_output=True,timeout=5)
            self.assertNotEqual(blocked.returncode,0)
            self.assertTrue(lock.exists())
            (root/'legacy-backup.sh').write_bytes(b'#!/bin/sh\ntouch SHOULD_NOT_RUN\n')
            rejected=subprocess.run(command,env=env,capture_output=True,timeout=5)
            self.assertNotEqual(rejected.returncode,0)
            self.assertFalse((ROOT/'SHOULD_NOT_RUN').exists())


class Handoff(unittest.TestCase):
    def test_successor_rejects_tamper_missing_wrong_binding_and_extra_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve()
            for relative in d0.SOURCE:
                target=root/relative
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_bytes((ROOT/relative).read_bytes())
            report=root/d0.REPORT
            report.parent.mkdir(parents=True,exist_ok=True)
            report.write_bytes(b'# Synthetic handoff fixture\n')

            def manifest():
                return {path:hashlib.sha256((root/path).read_bytes()).hexdigest()
                        for path in d0.SOURCE}

            def baseline_bytes(path):
                return ('baseline:' + path).encode()

            def rebindings(values):
                return {
                    path: {
                        'before': None if path == 'infrastructure/deploy/verify-backup-build-trigger.py'
                        else hashlib.sha256(baseline_bytes(path)).hexdigest(),
                        'after': values[path],
                    }
                    for path in d0.SOURCE
                }

            def write_evidence(baseline=None, binding=None):
                values=manifest()
                aggregate=''.join(f'{values[path]}  {path}\n'
                                  for path in sorted(values)).encode()
                evidence={'schema':'diis-w10d-d2-build-bootstrap-handoff-v1',
                    'baseline':baseline or {'sha':d0.BASE,'tree':d0.TREE},
                    'supersedes': {
                        'validatorPath': d0.SELF,
                        'validatorSha256': d0.PREDECESSOR_VALIDATOR_SHA,
                        'reportPath': d0.PREDECESSOR_REPORT,
                        'reportSha256': d0.PREDECESSOR_REPORT_SHA,
                        'evidencePath': d0.PREDECESSOR_EVIDENCE,
                        'evidenceSha256': d0.PREDECESSOR_EVIDENCE_SHA,
                        'sourceManifestSha256': d0.PREDECESSOR_MANIFEST_SHA,
                    },
                    'sourceManifest':values,
                    'sourceManifestSha256':hashlib.sha256(aggregate).hexdigest(),
                    'reportSha256':hashlib.sha256(report.read_bytes()).hexdigest(),
                    'rebindings':binding or rebindings(values),
                    'tests':{'synthetic':{'executed':True,'exitCode':0,'cases':1,
                                          'command':'synthetic isolated contract'}},
                    'observations': {
                        'dispatchOutcome': 'stopped-before-run',
                        'artifactOrPackageCreated': False,
                        'publishFromBootstrapTag': False,
                        'bootstrapSingleUse': 'oldest-exact-workflow-run-only',
                        'driveRole': 'encrypted-offsite-archive-source',
                        'restoreComputePolicy':
                            'existing-school-owned-no-new-cost-only',
                        'googleCloudBillingLinked': False,
                        'executableRestoreTarget': 'not-yet-accepted',
                    },
                    'operationalStatus':
                        'SOURCE COMPLETE - INDEPENDENT REVIEW REQUIRED - D2 BUILD AND D3-D6 HOLD'}
                target=root/d0.EVIDENCE
                target.write_text(json.dumps(evidence),encoding='ascii')

            def baseline_git(_root,*argv):
                if argv[0]=='ls-tree':
                    return (b'' if argv[-1] == 'infrastructure/deploy/verify-backup-build-trigger.py'
                            else b'100644 blob synthetic\tfile\n')
                if argv[0]=='show':
                    return baseline_bytes(argv[-1].split(':',1)[1])
                raise AssertionError(argv)

            expected=set(d0.SOURCE)|{d0.REPORT,d0.EVIDENCE}
            write_evidence()
            with patch.object(d0,'git',side_effect=baseline_git), \
                    patch.object(d0,'workspace_paths',return_value=expected):
                self.assertEqual(
                    d0.validate(root,predecessors=False)['rebindings'], len(d0.SOURCE))
                changed=root/d0.SOURCE[0]
                original=changed.read_bytes()
                changed.write_bytes(original+b'\n')
                with self.assertRaises(ValueError):
                    d0.validate(root,predecessors=False)
                changed.write_bytes(original)
                evidence=root/d0.EVIDENCE
                evidence.unlink()
                with self.assertRaises(OSError):
                    d0.validate(root,predecessors=False)
                write_evidence({'sha':'0'*40,'tree':d0.TREE})
                with self.assertRaises(ValueError):
                    d0.validate(root,predecessors=False)
                write_evidence()
                payload=json.loads((root/d0.EVIDENCE).read_text())
                payload['rebindings'].pop(next(iter(payload['rebindings'])))
                (root/d0.EVIDENCE).write_text(json.dumps(payload),encoding='ascii')
                with self.assertRaises(ValueError):
                    d0.validate(root,predecessors=False)
                for key, value in (
                        ('bootstrapSingleUse', 'replay-allowed'),
                        ('restoreComputePolicy', 'paid-cloud'),
                        ('googleCloudBillingLinked', True)):
                    write_evidence()
                    payload=json.loads((root/d0.EVIDENCE).read_text())
                    payload['observations'][key]=value
                    (root/d0.EVIDENCE).write_text(json.dumps(payload),encoding='ascii')
                    with self.subTest(observation=key), self.assertRaises(ValueError):
                        d0.validate(root,predecessors=False)
                write_evidence()
                with patch.object(d0,'workspace_paths',return_value=expected|{'unexpected.txt'}), \
                        self.assertRaises(ValueError):
                    d0.validate(root,predecessors=False)
if __name__=='__main__':
    unittest.main(verbosity=2)
