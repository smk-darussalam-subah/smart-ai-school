#!/usr/bin/env python3
"""Synthetic-only behavioral contracts. No Docker, SSH or provider invocation."""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import tempfile
import time
import unittest
import io
from contextlib import redirect_stdout, redirect_stderr
from types import SimpleNamespace
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'staging-readiness-deploy.py'
spec = importlib.util.spec_from_file_location('staging', SOURCE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def packet():
    now = int(time.time())
    return dict(schema='diis-staging-approval-v1', sourceSha='a'*40, sourceTree='b'*40,
                baseSha='c'*40, environmentSha256='d'*64, legacySha256='e'*64,
                sharedSha256='f'*64, modelSha256='1'*64,
                backupImage='ghcr.io/smk-darussalam-subah/diis-pg-backup@sha256:'+'2'*64,
                backupImageId='sha256:'+'3'*64, platform='linux/amd64',
                apps={s: dict(id='4'*64, image='sha256:'+'5'*64, runtimeSha256='6'*64)
                      for s in ('api', 'web')}, notBefore=now-5, expires=now+1800,
                approvalId='9'*32, mediaEvidenceSha256='7'*64, imageRevision='8'*40)


class FakeHost:
    def __init__(self, root, fail=''):
        self.p = packet()
        self.run_id = '123'
        self.root = root
        self.events = []
        self.fail = fail
        self.apply_count = 0
        self.head = self.p['baseSha']
        self.env = b'PRIVATE_SYNTHETIC=do-not-log$literal\n'

    def preflight(self):
        self.events.append('preflight')
        if self.fail == 'preflight':
            raise m.Stop('test-preflight')

    def model(self):
        if self.fail == 'model-after' and self.head == self.p['sourceSha']:
            return {'changed': True}
        return {'synthetic': '$literal', 'services': {}}

    def environment(self):
        if self.fail == 'env-after' and self.head == self.p['sourceSha']:
            return b'other-writer'
        return self.env

    def app_configs(self):
        return {'api': {}, 'web': {}}

    def verify_apps(self, expected):
        self.events.append('verify-apps')
        if self.fail == 'verify-apps' and self.apply_count == 1:
            raise m.Stop('test-runtime-drift')

    def source_result(self):
        self.events.append('source-result')
        if self.fail == 'source-after':
            raise m.Stop('source-result-drift')

    def git(self, *args):
        if args[0] == 'merge':
            self.events.append('checkout')
            # Journal and BOTH snapshots exist before mutation even if signal follows.
            assert (self.root/'attempt.json').is_file()
            assert (self.root/'apps.json').is_file()
            assert (self.root/'environment.snapshot').is_file()
            self.head = self.p['sourceSha']
            if self.fail == 'checkout-after':
                raise m.Stop('test-partial-checkout')
            if self.fail == 'signal-after':
                os.kill(os.getpid(), signal.SIGTERM)
            return b''
        return self.head.encode()

    def invariant(self):
        self.events.append('invariant')
        if self.environment() != self.env:
            raise m.Stop('test-env-drift')
        if self.fail == 'legacy-after' and self.head == self.p['sourceSha']:
            raise m.Stop('test-legacy-drift')

    def apply(self, path):
        self.apply_count += 1
        self.events.append('apply')
        assert json.loads(m.private_read(path)) == {'synthetic': '$$literal', 'services': {}}
        if self.fail in ('apply-after', 'rollback-failure'):
            if self.apply_count == 1 or self.fail == 'rollback-failure':
                raise m.Stop('test-apply-partial')

    def health(self):
        self.events.append('health')
        if self.fail == 'health-after' and self.apply_count == 1:
            raise m.Stop('test-health')


class Contract(unittest.TestCase):
    def test_reviewed_application_test_transition_only(self):
        host = m.Host(packet())
        for raw in (b'', m.REVIEWED_TEST_DELTA):
            with self.subTest(raw=raw), patch.object(host, 'git', return_value=raw) as observe:
                host.application_delta()
                observe.assert_called_once_with(
                    'diff', '--raw', '-z', '--no-abbrev', '--no-renames',
                    '--no-ext-diff', '--no-textconv', host.p['baseSha'],
                    host.p['sourceSha'], '--', 'apps', 'packages')

    def test_application_transition_rejects_runtime_schema_migration_unknown(self):
        host = m.Host(packet())
        path = b'apps/api/src/__tests__/deploy-workflow-safety.spec.ts'
        for other in (b'apps/api/src/main.ts', b'packages/database/prisma/schema.prisma',
                      b'packages/database/prisma/migrations/unknown/migration.sql',
                      b'apps/api/src/__tests__/unknown.spec.ts', b'packages/unknown',
                      path + b'\nunknown'):
            raw = m.REVIEWED_TEST_DELTA.replace(path, other)
            for value in (raw, m.REVIEWED_TEST_DELTA + raw):
                with self.subTest(path=other), patch.object(host, 'git', return_value=value):
                    with self.assertRaisesRegex(m.Stop, 'application-or-migration-delta'):
                        host.application_delta()

    def test_application_transition_rejects_mode_status_blob_and_malformed(self):
        host = m.Host(packet())
        good = m.REVIEWED_TEST_DELTA
        for raw in (good.replace(b'100644', b'100755'),
                    good.replace(b'100644', b'120000', 1),
                    good.replace(b'100644', b'160000'),
                    good.replace(b' M\0', b' T\0'), good.replace(b' M\0', b' R100\0'),
                    good.replace(b' M\0', b' A\0'), good.replace(b' M\0', b' D\0'),
                    good.replace(b'a03f3580', b'00000000'),
                    good.replace(b'8d493094', b'11111111'), good[:-1], good + b'\0',
                    good + good, b'\n', b'garbage', good.replace(b'\0', b'\t')):
            with self.subTest(raw=raw), patch.object(host, 'git', return_value=raw):
                with self.assertRaisesRegex(m.Stop, 'application-or-migration-delta'):
                    host.application_delta()

    def test_application_git_observation_failure_propagates(self):
        host = m.Host(packet())
        for reason in ('command-failed', 'command-timeout', 'command-overflow'):
            with self.subTest(reason=reason), patch.object(host, 'git', side_effect=m.Stop(reason)):
                with self.assertRaisesRegex(m.Stop, reason):
                    host.application_delta()

    def test_valid_approval(self):
        p = packet()
        self.assertEqual(m.validate(p, p['sourceSha'], int(time.time())), p)

    def test_unknown_missing_duplicate_schema(self):
        p = packet()
        for key in p:
            with self.subTest(key=key):
                bad = copy.deepcopy(p); del bad[key]
                with self.assertRaises(m.Stop): m.validate(bad, p['sourceSha'], int(time.time()))
        with self.assertRaises(m.Stop): m.decode(b'{"a":1,"a":2}')
        p['extra'] = 1
        with self.assertRaises(m.Stop): m.validate(p, p['sourceSha'], int(time.time()))

    def test_reject_tag_platform_dummy_and_bool(self):
        p = packet()
        for k, v in [('backupImage','ghcr.io/smk-darussalam-subah/diis-pg-backup:latest'),
                     ('backupImage','other.example/private@sha256:'+'a'*64),
                     ('platform','linux/arm64'),('legacySha256','0'*64),
                     ('expires',True),('approvalId',True),('approvalId','0'*32),('imageRevision','invalid')]:
            with self.subTest(key=k):
                bad = copy.deepcopy(p); bad[k] = v
                with self.assertRaises(m.Stop): m.validate(bad,p['sourceSha'],int(time.time()))

    def test_window_and_source(self):
        p = packet()
        with self.assertRaises(m.Stop): m.validate(p,'f'*40,int(time.time()))
        for now in (p['notBefore']-1,p['expires']-599,p['expires']+1):
            with self.assertRaises(m.Stop): m.validate(p,p['sourceSha'],now)

    def test_private_read_and_symlink(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'approval'; m.write_exclusive(p,b'{}')
            self.assertEqual(m.private_read(p),b'{}')
            q=Path(d)/'alias'; q.symlink_to(p)
            with self.assertRaises(m.Stop): m.private_read(q)
            p.chmod(0o644)
            with self.assertRaises(m.Stop): m.private_read(p)

    def test_private_parent_and_size(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'approval'; m.write_exclusive(p,b'abc')
            with self.assertRaises(m.Stop): m.private_read(p,2)
            Path(d).chmod(0o755)
            with self.assertRaises(m.Stop): m.private_read(p)

    def test_exclusive_no_clobber(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'file'; m.write_exclusive(p,b'original')
            with self.assertRaises(FileExistsError): m.write_exclusive(p,b'changed')
            self.assertEqual(p.read_bytes(),b'original')

    def test_literal_dollar_protection(self):
        value={'a':'secret$VAR','b':['${VALUE}',True], 'c':1}
        escaped=json.loads(m.compose_bytes(value))
        self.assertEqual(escaped['a'],'secret$$VAR')
        self.assertEqual(escaped['b'],['$${VALUE}',True])

    def test_bounded_capture_success(self):
        self.assertEqual(m.run([sys.executable,'-c','print("safe")'],cwd=Path('/tmp')),b'safe\n')

    def test_bounded_failure_redacts_output(self):
        with self.assertRaisesRegex(m.Stop,'command-failed'):
            m.run([sys.executable,'-c','import sys; print("PRIVATE_SYNTHETIC");sys.exit(2)'],cwd=Path('/tmp'))

    def test_bounded_overflow(self):
        with self.assertRaisesRegex(m.Stop,'command-overflow'):
            m.run([sys.executable,'-c','print("a"*2000)'],cap=50,cwd=Path('/tmp'))

    def test_descendant_stdout_timeout(self):
        code='import subprocess; subprocess.Popen(["sleep","2"])'
        start=time.monotonic()
        with self.assertRaises(m.Stop): m.run([sys.executable,'-c',code],timeout=.2,cwd=Path('/tmp'))
        self.assertLess(time.monotonic()-start,6)

    def transaction_case(self, failure=''):
        outer=tempfile.TemporaryDirectory()
        root=Path(outer.name)/'attempt';root.mkdir(mode=0o700)
        host=FakeHost(root,failure)
        return outer,root,host

    def test_success_cleanup_before_return(self):
        outer,root,host=self.transaction_case()
        with outer:
            m.transaction(host,root)
            self.assertFalse(root.exists())
            self.assertEqual(host.apply_count,1)
            self.assertEqual(host.events.count('preflight'),2)

    def test_preflight_stops_without_mutation(self):
        outer,root,host=self.transaction_case('preflight')
        with outer:
            with self.assertRaises(m.Stop): m.transaction(host,root)
            self.assertEqual(host.events,['preflight'])
            self.assertEqual(list(root.iterdir()),[])

    def test_forward_failure_boundaries_rollback(self):
        for failure in ('checkout-after','model-after','apply-after','health-after','verify-apps','source-after'):
            with self.subTest(failure=failure):
                outer,root,host=self.transaction_case(failure)
                with outer:
                    with self.assertRaisesRegex(m.Stop,'rollback-verified-no-retry'):
                        m.transaction(host,root)
                    self.assertTrue((root/'attempt.json').exists())
                    self.assertFalse((root/'apps.json').exists())
                    self.assertFalse((root/'environment.snapshot').exists())

    def test_external_config_or_legacy_drift_no_blind_rollback(self):
        for failure in ('env-after','legacy-after'):
            outer,root,host=self.transaction_case(failure)
            with outer:
                with self.assertRaisesRegex(m.Stop,'rollback-ambiguous-retained-no-retry'):
                    m.transaction(host,root)
                self.assertTrue(root.exists())

    def test_rollback_failure_retains_evidence(self):
        outer,root,host=self.transaction_case('rollback-failure')
        with outer:
            with self.assertRaisesRegex(m.Stop,'rollback-ambiguous-retained-no-retry'):
                m.transaction(host,root)
            self.assertEqual(host.apply_count,2)

    def test_actual_signal_after_checkout(self):
        outer,root,host=self.transaction_case('signal-after')
        original=signal.signal(signal.SIGTERM,lambda *_: (_ for _ in ()).throw(m.Stop('signal')))
        try:
            with outer:
                with self.assertRaisesRegex(m.Stop,'rollback-verified-no-retry'):
                    m.transaction(host,root)
                self.assertEqual(host.apply_count,1)
                self.assertTrue((root/'attempt.json').exists())
        finally: signal.signal(signal.SIGTERM,original)

    def test_snapshot_drift_no_rollback_execution(self):
        outer,root,host=self.transaction_case()
        def corrupt(path):
            path.write_bytes(b'corrupt')
            raise m.Stop('partial')
        host.apply=corrupt
        with outer:
            with self.assertRaisesRegex(m.Stop,'rollback-ambiguous'):
                m.transaction(host,root)

    def test_cleanup_failure_never_success(self):
        outer,root,host=self.transaction_case()
        original=Path.unlink
        def fail(path,*args,**kwargs):
            if path.name=='environment.snapshot':raise OSError('synthetic')
            return original(path,*args,**kwargs)
        with outer:
            with patch.object(Path,'unlink',fail):
                with self.assertRaises(OSError):m.transaction(host,root)
            self.assertTrue((root/'attempt.json').exists())

    def test_expiry_before_mutation(self):
        outer,root,host=self.transaction_case()
        host.p['expires']=int(time.time())+599
        with outer:
            with self.assertRaisesRegex(m.Stop,'execution-window'):m.transaction(host,root)
            self.assertNotIn('checkout',host.events)

    def test_environment_binding_cases(self):
        with tempfile.TemporaryDirectory() as d:
            p=packet(); file=Path(d)/'env'
            for raw in (b'OTHER=1\n',b'PG_BACKUP_IMAGE=tag\n',
                        ('PG_BACKUP_IMAGE='+p['backupImage']+'\nPG_BACKUP_IMAGE='+p['backupImage']+'\n').encode()):
                file.write_bytes(raw);file.chmod(0o600);p['environmentSha256']=m.digest(raw)
                with patch.object(m,'ENV',file):
                    with self.assertRaises(m.Stop):m.Host(p).environment()

    def test_workflow_scope(self):
        workflow=SOURCE.parents[2]/'.github/workflows/deploy.yml'
        text=workflow.read_text()
        staging=text.split('- name: Guarded recovery-only staging')[1].split('- name: Deploy production via SSH')[0]
        self.assertIn("if: github.ref == 'refs/heads/staging'",staging)
        for forbidden in ('docker exec','docker compose','VAPID','git fetch','git merge'):
            self.assertNotIn(forbidden,staging)
        self.assertIn("- name: Deploy production via SSH\n        if: github.ref == 'refs/heads/main'",text)

    def test_main_receipt_and_replay(self):
        with tempfile.TemporaryDirectory() as d:
            state=Path(d); p=packet(); raw=m.canonical(p)
            approval=state/'approval.json';m.write_exclusive(approval,raw)
            m.write_exclusive(state/'deploy.lock',b'')
            root=state/('staging-attempt-'+p['approvalId'])
            def factory(value):
                h=FakeHost(root);h.p=value;return h
            out=io.StringIO();err=io.StringIO()
            handlers={s:signal.getsignal(s) for s in (signal.SIGHUP,signal.SIGINT,signal.SIGTERM)}
            try:
                with patch.object(m,'STATE',state),patch.object(m,'APPROVAL',approval), \
                     patch.object(m,'Host',factory),patch.object(m.pwd,'getpwuid',return_value=SimpleNamespace(pw_name='appuser')), \
                     patch.object(sys,'argv',['executor',p['sourceSha'],m.digest(raw),'123','1']), \
                     patch.dict(os.environ,{},clear=True),redirect_stdout(out),redirect_stderr(err):
                    self.assertEqual(m.main(),0)
                    self.assertEqual(m.main(),65)
                self.assertEqual(out.getvalue().count('STAGING_COMPLETE'),1)
                self.assertNotIn('PRIVATE_SYNTHETIC',out.getvalue()+err.getvalue())
                self.assertFalse(root.exists())
                receipt=state/('staging-consumed-'+p['approvalId']+'.json')
                self.assertEqual(json.loads(receipt.read_bytes())['runId'],'123')
                self.assertEqual(stat.S_IMODE(receipt.stat().st_mode),0o600)
            finally:
                for s,handler in handlers.items():signal.signal(s,handler)

    def test_main_preflight_failure_has_zero_files_or_success(self):
        with tempfile.TemporaryDirectory() as d:
            state=Path(d);p=packet();raw=m.canonical(p)
            approval=state/'approval.json';m.write_exclusive(approval,raw)
            before=set(state.iterdir());out=io.StringIO();err=io.StringIO()
            handlers={s:signal.getsignal(s) for s in (signal.SIGHUP,signal.SIGINT,signal.SIGTERM)}
            try:
                with patch.object(m,'STATE',state),patch.object(m,'APPROVAL',approval), \
                     patch.object(m,'Host',lambda _:FakeHost(state,'preflight')), \
                     patch.object(m.pwd,'getpwuid',return_value=SimpleNamespace(pw_name='appuser')), \
                     patch.object(sys,'argv',['executor',p['sourceSha'],m.digest(raw),'123','1']), \
                     patch.dict(os.environ,{},clear=True),redirect_stdout(out),redirect_stderr(err):
                    self.assertEqual(m.main(),65)
                self.assertEqual(set(state.iterdir()),before)
                self.assertEqual(out.getvalue(),'')
            finally:
                for s,handler in handlers.items():signal.signal(s,handler)

    def test_live_adapter_guard_matrix(self):
        p=packet()
        media=dict(schema='diis-media-readonly-v1',environmentSha256=p['environmentSha256'],
                   expires=p['expires'],status='verified',owner='synthetic-owner',scope='existing-staging-media-only')
        media_raw=m.canonical(media);p['mediaEvidenceSha256']=m.digest(media_raw)
        events=[]
        class H(m.Host):
            def verify_compose_baseline(self):events.append('baseline-hash')
            def environment(self): return b'synthetic'
            def legacy(self):return self.p['legacySha256']
            def shared(self):return self.p['sharedSha256']
            def health(self):events.append('health')
            def observation(self,name):return dict(id='4'*64,image='sha256:'+'5'*64,mounts=[])
            def app_runtime(self,value):return '6'*64
            def git(self,*args):
                events.append(('git',args))
                if args[:2]==('rev-parse','HEAD'):return self.p['baseSha'].encode()
                if args[0]=='rev-parse':return self.p['sourceTree'].encode()
                if args[0]=='branch':return b'staging'
                if args[0]=='ls-remote':return (self.p['sourceSha']+' refs/heads/staging').encode()
                if args[0]=='ls-tree':return b'packages/database/prisma/migrations/001/migration.sql\n'
                return b''
        for failure in ('','architecture','image-id','image-revision','registry','version','migration','observer-error'):
            events.clear()
            def command(argv,**kwargs):
                events.append(tuple(argv))
                if failure=='observer-error':raise m.Stop('command-failed')
                if argv[0]=='uname':return b'arm64' if failure=='architecture' else b'x86_64'
                if argv[:3]==['docker','image','inspect']:
                    if argv[-1].startswith('sha256:'):return argv[-1].encode()
                    return m.canonical(dict(id='bad' if failure=='image-id' else p['backupImageId'],
                        os='linux',arch='amd64',digests=[p['backupImage']],
                        revision='bad' if failure=='image-revision' else p['imageRevision']))
                if argv[:3]==['docker','manifest','inspect']:
                    if failure=='registry':raise m.Stop('command-failed')
                    return b'{"schemaVersion":2}'
                if argv[3:]==['postgres','--version']:return b'PostgreSQL 17.1' if failure=='version' else b'PostgreSQL 16.4'
                return b'' if failure=='migration' else b'001\n'
            info=SimpleNamespace(f_bavail=30*1024**3,f_frsize=1,f_blocks=80*1024**3)
            with self.subTest(failure=failure),patch.object(m,'run',command), \
                 patch.object(m,'ROOT',Path('/tmp')),patch.object(m.os,'statvfs',return_value=info),patch.object(m,'private_read',return_value=media_raw):
                if failure:
                    with self.assertRaises(m.Stop):H(p).preflight()
                else:H(p).preflight()
            self.assertFalse(any('up' in e or 'merge' in e or 'fetch' in e for e in events if isinstance(e,tuple)))

    def test_legacy_hash_all_code_and_reject_overlap(self):
        p=packet();host=m.Host(p)
        with tempfile.TemporaryDirectory() as d:
            base=Path(d);staging=base/'staging';staging.mkdir();outside=base/'legacy.sh';outside.touch()
            value=dict(status='running',mounts=[dict(Type='bind',Source=str(outside),Destination='/backup.sh')])
            seen=[]
            def command(argv,**kwargs):
                seen.append(argv)
                if 'find' in argv:return b'a  /opt/backup-bin/mc\n'
                return b'a  /etc/crontabs/root\nb  /backup.sh\n'
            with patch.object(m,'ROOT',staging),patch.object(host,'observation',return_value=value),patch.object(m,'run',command):
                self.assertRegex(host.legacy(),r'^[a-f0-9]{64}$')
                value['mounts'][0]['Source']=str(staging)
                with self.assertRaisesRegex(m.Stop,'mount-overlap'):host.legacy()
            self.assertEqual(len(seen),2)

    def test_model_live_environment_must_match_before_mutation(self):
        p=packet();host=m.Host(p)
        full={'services':{s:dict(container_name=n,environment={'SYNTHETIC':'literal$value'},
              networks={k:{} for k in (['smk-staging-net'] if s=='web' else ['smk-staging-net','smk-network'])})
              for s,n in m.APP_NAMES.items()}}
        expected=copy.deepcopy(full)
        for s in expected['services']:
            expected['services'][s].update(image=p['apps'][s]['image'],pull_policy='never')
        expected['networks']={k:dict(name=k,external=True) for k in ('smk-staging-net','smk-network')}
        p['modelSha256']=m.digest(m.canonical(expected))
        with patch.object(m,'run',return_value=m.compose_bytes(full)), \
             patch.object(host,'app_config',return_value={'env':['SYNTHETIC=literal$value']}):
            self.assertEqual(host.model(),expected)
        with patch.object(m,'run',return_value=m.compose_bytes(full)), \
             patch.object(host,'app_config',return_value={'env':['SYNTHETIC=other']}):
            with self.assertRaisesRegex(m.Stop,'model-live-env-drift'):host.model()

    def test_expired_command_budget_does_not_spawn(self):
        with patch.object(m,'COMMAND_DEADLINE',time.time()-1),patch.object(m.subprocess,'Popen') as popen:
            with self.assertRaisesRegex(m.Stop,'command-budget'):
                m.run(['never-spawn'],cwd=Path('/tmp'))
            popen.assert_not_called()

    def test_compose_baseline_mismatch_fails(self):
        host=m.Host(packet())
        def command(argv,**kwargs):
            if argv[1]=='compose':return (argv[-1]+' '+'a'*64).encode()
            return b'b'*64
        with patch.object(m,'run',command):
            with self.assertRaisesRegex(m.Stop,'compose-live-baseline-drift'):
                host.verify_compose_baseline()

    def test_config_render_literal_dollar(self):
        # Compose config is client-side only: no daemon/image/container operation.
        import shutil
        if not shutil.which('docker'):
            self.skipTest('Docker Compose unavailable')
        model={'services':{'api':{'image':'synthetic.invalid/unused:never-pulled',
                                 'environment':{'VALUE':'literal${DO_NOT_EXPAND}'}}}}
        result=subprocess.run(['docker','compose','--env-file','/dev/null','-f','-',
                               'config','--format','json'],input=m.compose_bytes(model),
                              capture_output=True,env={'PATH':os.environ['PATH'],'HOME':os.environ.get('HOME','/tmp')},timeout=30)
        self.assertEqual(result.returncode,0,'synthetic Compose config failed')
        self.assertEqual(m.compose_values(json.loads(result.stdout))['services']['api']['environment']['VALUE'],
                         'literal${DO_NOT_EXPAND}')
        again=subprocess.run(['docker','compose','--env-file','/dev/null','-f','-',
                              'config','--format','json'],input=result.stdout,
                             capture_output=True,timeout=30)
        self.assertEqual(again.returncode,0)
        self.assertEqual(json.loads(again.stdout),json.loads(result.stdout))


class ReadinessClosure(unittest.TestCase):
    def test_exact_http_status(self):
        host = m.Host(packet())
        for status in (b'301', b'302', b'204', b'500', b'200\n', b''):
            with self.subTest(status=status), patch.object(m, 'run', return_value=status):
                with self.assertRaisesRegex(m.Stop, 'health-not-ready'):
                    host.health()
        with patch.object(m, 'run', return_value=b'200') as runner:
            host.health()
            self.assertEqual(runner.call_count, 4)
            self.assertIn('--write-out', runner.call_args.args[0])
            self.assertNotIn('--location', runner.call_args.args[0])

    def test_transient_convergence_no_reapply(self):
        calls = []
        def health():
            calls.append(1)
            if len(calls) < 3:
                raise m.Stop('health-not-ready')
        with patch.object(m.time, 'sleep'):
            m.wait_for_health(SimpleNamespace(health=health))
        self.assertEqual(len(calls), 3)

    def test_permanent_failure_is_bounded(self):
        clock = [100.0]
        def sleep(n): clock[0] += n
        host = SimpleNamespace(health=lambda: (_ for _ in ()).throw(m.Stop('health-not-ready')))
        with patch.object(m.time, 'time', side_effect=lambda: clock[0]), \
             patch.object(m.time, 'sleep', side_effect=sleep), \
             patch.object(m, 'COMMAND_DEADLINE', 105.0):
            with self.assertRaisesRegex(m.Stop, 'health-readiness-timeout'):
                m.wait_for_health(host)
            self.assertEqual(clock[0], 105.0)
            self.assertEqual(m.COMMAND_DEADLINE, 105.0)

    def test_signal_never_retried(self):
        host = SimpleNamespace(health=lambda: (_ for _ in ()).throw(m.Stop('interrupted')))
        with patch.object(m.time, 'sleep') as sleeper:
            with self.assertRaisesRegex(m.Stop, 'interrupted'):
                m.wait_for_health(host)
            sleeper.assert_not_called()

    def test_forward_and_rollback_use_same_wait(self):
        source = SOURCE.read_text()
        self.assertEqual(source.count('wait_for_health(host)'), 2)


class ProducerClosure(unittest.TestCase):
    def test_spawn_signal_and_selector_failures_reap(self):
        real_spawn = subprocess.Popen
        real_selector = m.selectors.DefaultSelector
        for boundary in ('spawn-signal', 'selector-create', 'selector-register'):
            children = []
            def spawn(*args, **kwargs):
                child = real_spawn(*args, **kwargs)
                children.append(child)
                if boundary == 'spawn-signal':
                    os.kill(os.getpid(), signal.SIGTERM)
                return child
            def selector():
                if boundary == 'selector-create':
                    raise OSError('synthetic')
                result = real_selector()
                if boundary == 'selector-register':
                    result.register = lambda *args: (_ for _ in ()).throw(OSError('synthetic'))
                return result
            previous = signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(m.Stop('interrupted')))
            try:
                with self.subTest(boundary=boundary), patch.object(m.subprocess, 'Popen', spawn), \
                     patch.object(m.selectors, 'DefaultSelector', selector):
                    with self.assertRaises((m.Stop, OSError)):
                        m.run([sys.executable, '-c', 'import time; time.sleep(60)'], cwd=Path('/tmp'))
                    self.assertIsNotNone(children[0].poll())
                    self.assertFalse(m.group_exists(children[0].pid))
                    self.assertEqual(m.OWNED_PRODUCERS, {})
            finally:
                signal.signal(signal.SIGTERM, previous)
                for child in children:
                    if child.poll() is None:
                        os.killpg(child.pid, signal.SIGKILL)
                        child.wait(timeout=3)

    def test_repeat_signal_during_cleanup(self):
        real_kill = os.killpg
        def kill(pid, sig):
            if sig:
                os.kill(os.getpid(), signal.SIGTERM)
            return real_kill(pid, sig)
        previous = signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(m.Stop('interrupted')))
        try:
            with patch.object(m.os, 'killpg', kill):
                with self.assertRaises(m.Stop):
                    m.run([sys.executable, '-c', 'pass'], cwd=Path('/tmp'))
            self.assertEqual(m.OWNED_PRODUCERS, {})
        finally:
            signal.signal(signal.SIGTERM, previous)

    def test_signal_during_cleanup_mask_transition(self):
        real_mask = signal.pthread_sigmask
        delivered = []
        def mask(how, signals):
            if how == signal.SIG_BLOCK and m.OWNED_PRODUCERS and not delivered:
                delivered.append(True)
                os.kill(os.getpid(), signal.SIGTERM)
            return real_mask(how, signals)
        previous = signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(m.Stop('interrupted')))
        try:
            with patch.object(m.signal, 'pthread_sigmask', mask):
                with self.assertRaises(m.Stop):
                    m.run([sys.executable, '-c', 'import time; time.sleep(60)'],
                          timeout=.1, cwd=Path('/tmp'))
            self.assertTrue(delivered)
            self.assertEqual(m.OWNED_PRODUCERS, {})
        finally:
            signal.signal(signal.SIGTERM, previous)

    def test_signal_before_first_cleanup_instruction(self):
        finish = m.finish_producer
        children = []
        def boundary(process, selector):
            children.append(process)
            os.kill(os.getpid(), signal.SIGTERM)
            return finish(process, selector)
        previous = signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(m.Stop('interrupted')))
        try:
            with patch.object(m, 'finish_producer', boundary):
                with self.assertRaises(m.Stop):
                    m.run([sys.executable, '-c', 'import time; time.sleep(60)'],
                          timeout=.1, cwd=Path('/tmp'))
            self.assertEqual(m.OWNED_PRODUCERS, {})
            self.assertIsNotNone(children[0].poll())
            self.assertFalse(m.group_exists(children[0].pid))
        finally:
            signal.signal(signal.SIGTERM, previous)
            for child in children:
                if child.poll() is None:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait(timeout=3)

    def test_ambiguity_retains_all_snapshots_without_rollback(self):
        for kind in ('typed', 'owned'):
            with tempfile.TemporaryDirectory() as temp, self.subTest(kind=kind):
                root = Path(temp); root.chmod(0o700)
                host = FakeHost(root)
                def apply(path):
                    host.apply_count += 1
                    if kind == 'owned':
                        m.OWNED_PRODUCERS[99999999] = object()
                        raise OSError('synthetic observer failure')
                    raise m.ProducerAmbiguous('synthetic-cleanup-failure')
                try:
                    with patch.object(host, 'apply', apply):
                        with self.assertRaises(m.ProducerAmbiguous):
                            m.transaction(host, root)
                    self.assertEqual(host.apply_count, 1)
                    for name in ('apps.json', 'environment.snapshot', 'attempt.json'):
                        self.assertTrue((root/name).is_file())
                finally:
                    m.OWNED_PRODUCERS.pop(99999999, None)

    def test_observation_failure_is_typed_and_blocks_next_command(self):
        with patch.object(m, 'group_exists', side_effect=OSError('synthetic')):
            with self.assertRaises(m.ProducerAmbiguous):
                m.run([sys.executable, '-c', 'pass'], cwd=Path('/tmp'))
        try:
            self.assertTrue(m.OWNED_PRODUCERS)
            with patch.object(m.subprocess, 'Popen') as spawn:
                with self.assertRaises(m.ProducerAmbiguous):
                    m.run(['never'], cwd=Path('/tmp'))
                spawn.assert_not_called()
            for child in m.OWNED_PRODUCERS.values():
                self.assertIsNotNone(child.poll())
                self.assertFalse(m.group_exists(child.pid))
        finally:
            m.OWNED_PRODUCERS.clear()


class CancellationClosure(unittest.TestCase):
    def test_success_failure_signal_boundary_matrix(self):
        for sig in m.HANDLED_SIGNALS:
            for code in ('pass', 'raise SystemExit(7)'):
                for boundary in ('entry', 'mask', 'kill', 'close'):
                    with self.subTest(signal=sig, code=code, boundary=boundary):
                        finish, mask, kill = m.finish_producer, signal.pthread_sigmask, os.killpg
                        delivered, children = [], []
                        def inject():
                            delivered.append(True)
                            os.kill(os.getpid(), sig)
                        def cleanup(process, selector):
                            children.append(process)
                            if boundary == 'entry': inject()
                            if boundary == 'close':
                                close = selector.close
                                def closing():
                                    inject()
                                    close()
                                selector.close = closing
                            return finish(process, selector)
                        def masking(how, signals):
                            if boundary == 'mask' and how == signal.SIG_BLOCK and m.OWNED_PRODUCERS:
                                inject()
                            return mask(how, signals)
                        def killing(pid, value):
                            if boundary == 'kill' and value: inject()
                            return kill(pid, value)
                        previous = signal.signal(sig, lambda *_: (_ for _ in ()).throw(m.Stop('interrupted')))
                        try:
                            with patch.object(m, 'finish_producer', cleanup), \
                                 patch.object(m.signal, 'pthread_sigmask', masking), \
                                 patch.object(m.os, 'killpg', killing):
                                with self.assertRaisesRegex(m.Stop, '^interrupted$'):
                                    m.run([sys.executable, '-c', code], cwd=Path('/tmp'))
                            self.assertTrue(delivered)
                            self.assertEqual(m.OWNED_PRODUCERS, {})
                            self.assertIsNotNone(children[0].poll())
                            self.assertFalse(m.group_exists(children[0].pid))
                        finally:
                            signal.signal(sig, previous)
                            for child in children:
                                if child.poll() is None:
                                    kill(child.pid, signal.SIGKILL)
                                    child.wait(timeout=3)

    def test_successful_merge_cancellation_only_allows_verified_rollback(self):
        for sig in m.HANDLED_SIGNALS:
            with tempfile.TemporaryDirectory() as temp, self.subTest(signal=sig):
                root = Path(temp); root.chmod(0o700)
                host = FakeHost(root)
                git, finish = host.git, m.finish_producer
                delivered = []
                def cleanup(process, selector):
                    delivered.append(True)
                    os.kill(os.getpid(), sig)
                    return finish(process, selector)
                def merge(*args):
                    result = git(*args)
                    if args[0] == 'merge':
                        with patch.object(m, 'finish_producer', cleanup):
                            m.run([sys.executable, '-c', 'pass'], cwd=Path('/tmp'))
                    return result
                previous = signal.signal(sig, lambda *_: (_ for _ in ()).throw(m.Stop('interrupted')))
                try:
                    with patch.object(host, 'git', merge):
                        with self.assertRaisesRegex(m.Stop, '^deployment-failed-rollback-verified-no-retry$'):
                            m.transaction(host, root)
                    self.assertEqual(len(delivered), 1)
                    self.assertEqual(host.apply_count, 1)  # rollback, never forward apply
                    self.assertNotIn('source-result', host.events)
                    self.assertTrue((root/'attempt.json').is_file())
                    self.assertEqual(m.OWNED_PRODUCERS, {})
                finally:
                    signal.signal(sig, previous)

    def test_cleanup_ambiguity_precedes_pending_cancellation(self):
        for sig in m.HANDLED_SIGNALS:
            for failure in ('observation', 'close'):
                with self.subTest(signal=sig, failure=failure):
                    finish = m.finish_producer
                    children = []
                    def cleanup(process, selector):
                        children.append(process)
                        os.kill(os.getpid(), sig)
                        if failure == 'close':
                            close = selector.close
                            def broken_close():
                                close()
                                raise OSError('synthetic')
                            selector.close = broken_close
                            return finish(process, selector)
                        with patch.object(m, 'group_exists', side_effect=OSError('synthetic')):
                            return finish(process, selector)
                    previous = signal.signal(sig, lambda *_: (_ for _ in ()).throw(m.Stop('interrupted')))
                    try:
                        with patch.object(m, 'finish_producer', cleanup):
                            with self.assertRaises(m.ProducerAmbiguous):
                                m.run([sys.executable, '-c', 'pass'], cwd=Path('/tmp'))
                        self.assertTrue(m.OWNED_PRODUCERS)
                        with patch.object(m.subprocess, 'Popen') as spawn:
                            with self.assertRaises(m.ProducerAmbiguous):
                                m.run(['never'], cwd=Path('/tmp'))
                            spawn.assert_not_called()
                        self.assertIsNotNone(children[0].poll())
                        self.assertFalse(m.group_exists(children[0].pid))
                    finally:
                        signal.signal(sig, previous)
                        m.OWNED_PRODUCERS.clear()


if __name__=='__main__':
    unittest.main(verbosity=2)
