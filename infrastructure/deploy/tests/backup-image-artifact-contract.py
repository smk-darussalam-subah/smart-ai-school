#!/usr/bin/env python3
"""Focused contract for portable Syft and Grype image identity binding."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    'backup_image_artifact', ROOT / 'infrastructure/deploy/backup-image-artifact.py')
ARTIFACT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ARTIFACT)


class ArtifactIdentity(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        root = Path(temporary.name)
        source = 'a' * 40
        config = json.dumps({
            'os': 'linux',
            'architecture': 'amd64',
            'config': {'Labels': {'org.opencontainers.image.revision': source}},
        }).encode()
        config_id = 'sha256:' + hashlib.sha256(config).hexdigest()
        local_id = 'sha256:' + 'b' * 64
        fixtures = {
            'image.json': [{
                'Id': local_id,
                'Os': 'linux',
                'Architecture': 'amd64',
                'Config': {'Labels': {'org.opencontainers.image.revision': source}},
            }],
            'grype.json': {
                'source': {'target': {'imageID': config_id}},
                'descriptor': {'name': 'grype', 'version': '0.118.0'},
                'matches': [],
            },
            'grype-db.json': {'valid': True},
            'scanner.json': {key: 'c' * 64 for key in (
                'grypeExecutableSha256', 'syftExecutableSha256', 'dbSha256')},
            'smoke.json': {
                'schema': 'diis-image-smoke-v1',
                'imageId': local_id,
                'status': 'pass',
                'network': 'none',
            },
        }
        for name, value in fixtures.items():
            (root / name).write_text(json.dumps(value), encoding='ascii')
        with tarfile.open(root / 'image.tar', 'w') as archive:
            for name, raw in (
                    ('manifest.json', b'[{"Config":"config.json"}]'),
                    ('config.json', config)):
                member = tarfile.TarInfo(name)
                member.size = len(raw)
                archive.addfile(member, io.BytesIO(raw))
        return temporary, root, source, config_id

    def test_syft_metadata_identity_is_bound_to_saved_config(self):
        temporary, root, source, config_id = self.fixture()
        with temporary:
            (root / 'sbom.json').write_text(json.dumps({
                'source': {'metadata': {'imageID': config_id}},
                'artifacts': [{'name': 'synthetic'}],
            }), encoding='ascii')
            self.assertEqual(ARTIFACT.validate_content(root, source), config_id)

    def test_legacy_target_identity_remains_supported(self):
        temporary, root, source, config_id = self.fixture()
        with temporary:
            (root / 'sbom.json').write_text(json.dumps({
                'source': {'target': {'imageID': config_id}},
                'artifacts': [{'name': 'synthetic'}],
            }), encoding='ascii')
            self.assertEqual(ARTIFACT.validate_content(root, source), config_id)

    def test_missing_malformed_conflicting_and_cross_image_ids_fail_closed(self):
        temporary, root, source, config_id = self.fixture()
        with temporary:
            invalid_sources = (
                {'metadata': {}},
                {'metadata': {'imageID': 'not-a-digest'}},
                {'target': 'not-an-object'},
                {'target': {'imageID': config_id},
                 'metadata': {'imageID': 'sha256:' + 'd' * 64}},
                {'metadata': {'imageID': 'sha256:' + 'd' * 64}},
            )
            for invalid in invalid_sources:
                with self.subTest(invalid=invalid):
                    (root / 'sbom.json').write_text(json.dumps({
                        'source': invalid,
                        'artifacts': [{'name': 'synthetic'}],
                    }), encoding='ascii')
                    with self.assertRaises(ValueError):
                        ARTIFACT.validate_content(root, source)


if __name__ == '__main__':
    unittest.main(verbosity=2)
