#!/usr/bin/env python3
"""Exercise the same publisher cleanup helper used by the workflow."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]
HELPER = ROOT/'infrastructure/deploy/cleanup-publisher.sh'


class PublisherCleanup(unittest.TestCase):
    def test_workflow_calls_canonical_cleanup(self):
        workflow = (ROOT/'.github/workflows/backup-image.yml').read_text()
        self.assertIn(
            "trap 'bash infrastructure/deploy/cleanup-publisher.sh "
            "\"$DOCKER_CONFIG\" \"$RUNNER_TEMP\" \"$GITHUB_RUN_ID\" \"$?\"' EXIT",
            workflow)
        self.assertIn('publisher-cleanup-contract.py', workflow)

    def test_nested_state_original_failure_and_outside_guard(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fake_bin = root/'bin'
            fake_bin.mkdir()
            docker = fake_bin/'docker'
            docker.write_text('#!/bin/sh\n[ "$1" = logout ] && [ "$2" = ghcr.io ]\n')
            docker.chmod(0o755)
            runner = root/'runner'
            runner.mkdir()
            config = runner/'diis-publisher-123'
            outside = root/'outside'
            outside.mkdir()
            (outside/'keep').write_text('keep')
            env = {**os.environ, 'PATH': str(fake_bin) + os.pathsep + os.environ['PATH']}

            for original in ('0', '37'):
                (config/'buildx').mkdir(parents=True)
                (config/'config.json').write_text('{}')
                (config/'buildx'/'current').write_text('builder')
                result = subprocess.run(
                    ['bash', str(HELPER), str(config), str(runner), '123', original],
                    env=env, capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, int(original), result.stderr)
                self.assertFalse(config.exists())
                self.assertTrue((outside/'keep').exists())

            config.symlink_to(outside, target_is_directory=True)
            result = subprocess.run(
                ['bash', str(HELPER), str(config), str(runner), '123', '0'],
                env=env, capture_output=True, text=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertTrue((outside/'keep').exists())

            result = subprocess.run(
                ['bash', str(HELPER), str(outside), str(runner), '123', '0'],
                env=env, capture_output=True, text=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertTrue((outside/'keep').exists())

    def test_cleanup_failure_still_fails_and_keeps_recovery_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fake_bin = root/'bin'
            fake_bin.mkdir()
            for name, body in (
                    ('docker', '#!/bin/sh\nexit 0\n'),
                    ('rm', '#!/bin/sh\nexit 42\n')):
                executable = fake_bin/name
                executable.write_text(body)
                executable.chmod(0o755)
            runner = root/'runner'
            config = runner/'diis-publisher-123'
            config.mkdir(parents=True)
            (config/'config.json').write_text('{}')
            env = {**os.environ, 'PATH': str(fake_bin) + os.pathsep + os.environ['PATH']}
            result = subprocess.run(
                ['bash', str(HELPER), str(config), str(runner), '123', '0'],
                env=env, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 42)
            self.assertTrue((config/'config.json').exists())

    def test_exit_trap_preserves_publisher_failure_and_cleans_nested_state(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fake_bin = root/'bin'
            fake_bin.mkdir()
            docker = fake_bin/'docker'
            docker.write_text('#!/bin/sh\nexit 0\n')
            docker.chmod(0o755)
            runner = root/'runner'
            runner.mkdir()
            config = runner/'diis-publisher-123'
            env = {**os.environ, 'PATH': str(fake_bin) + os.pathsep + os.environ['PATH'],
                   'RUNNER_TEMP': str(runner), 'GITHUB_RUN_ID': '123',
                   'DOCKER_CONFIG': str(config), 'HELPER': str(HELPER)}
            script = (
                'set -euo pipefail\n'
                'mkdir -m700 "$DOCKER_CONFIG"\n'
                'trap \'bash "$HELPER" "$DOCKER_CONFIG" "$RUNNER_TEMP" '
                '"$GITHUB_RUN_ID" "$?"\' EXIT\n'
                'trap \'rc=$?; exit "$rc"\' ERR\n'
                'mkdir "$DOCKER_CONFIG/buildx"\n'
                'false\n'
            )
            result = subprocess.run(['bash', '-c', script], env=env,
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertFalse(config.exists())


if __name__ == '__main__':
    unittest.main()
