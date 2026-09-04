#!/usr/bin/env python3
"""Validate W10-D candidate acceptance against actual checkout and proof files."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


SHA256 = re.compile(r"^[a-f0-9]{64}$")
GIT_SHA = re.compile(r"^[a-f0-9]{40}$")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_sha256(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    if not path.is_file() or path.is_symlink():
        raise ValueError(f"invalid evidence file: {path.name}")
    with path.open(encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise ValueError(f"evidence is not an object: {path.name}")
    return value


def require_equal(value: dict[str, Any], expected: dict[str, Any]) -> None:
    for key, wanted in expected.items():
        if value.get(key) != wanted:
            raise ValueError(f"field mismatch: {key}")


def require_hash(value: Any, name: str) -> str:
    text = str(value)
    if not SHA256.fullmatch(text):
        raise ValueError(f"invalid SHA-256: {name}")
    return text


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, text=True, check=True
    ).stdout.strip()


def mount_at(runtime: dict[str, Any], destination: str) -> dict[str, Any]:
    matches = [mount for mount in runtime.get("mounts", []) if mount.get("Destination") == destination]
    if len(matches) != 1:
        raise ValueError(f"mount mismatch: {destination}")
    return matches[0]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("bundle", type=Path)
    parser.add_argument("main_sha")
    parser.add_argument("main_tree")
    parser.add_argument("candidate_container")
    parser.add_argument("repo", type=Path)
    parser.add_argument("runtime_manifest", type=Path)
    parser.add_argument("root_cron_evidence", type=Path)
    parser.add_argument("manual_manifest", type=Path)
    parser.add_argument("provenance", type=Path)
    parser.add_argument("db_proof", type=Path)
    parser.add_argument("object_proof", type=Path)
    parser.add_argument("tool_evidence", type=Path)
    return parser.parse_args()


def validate(args: argparse.Namespace) -> None:
    if not GIT_SHA.fullmatch(args.main_sha) or not GIT_SHA.fullmatch(args.main_tree):
        raise ValueError("invalid source binding")
    if git(args.repo, "rev-parse", "HEAD") != args.main_sha:
        raise ValueError("actual checkout SHA mismatch")
    if git(args.repo, "rev-parse", "HEAD^{tree}") != args.main_tree:
        raise ValueError("actual checkout tree mismatch")
    if git(args.repo, "status", "--porcelain", "--untracked-files=normal"):
        raise ValueError("actual checkout is not clean")

    bundle = load_json(args.bundle)
    runtime = load_json(args.runtime_manifest)
    root_cron = load_json(args.root_cron_evidence)
    manual = load_json(args.manual_manifest)
    provenance = load_json(args.provenance)
    db_proof = load_json(args.db_proof)
    object_proof = load_json(args.object_proof)
    tool = load_json(args.tool_evidence)

    require_equal(bundle, {
        "schemaVersion": "diis-w10d-backup-candidate-acceptance-v2",
        "status": "accepted",
        "mainSha": args.main_sha,
        "mainTree": args.main_tree,
        "candidateContainer": args.candidate_container,
        "offsiteSource": "independent-crypt",
        "localMinioFallback": False,
        "retentionApply": False,
        "manualBackupStatus": "complete",
        "dbRestoreStatus": "success",
        "objectRestoreStatus": "success",
    })

    evidence_bindings = {
        "candidateRuntimeManifestSha256": args.runtime_manifest,
        "rootCronEvidenceSha256": args.root_cron_evidence,
        "manualBackupManifestSha256": args.manual_manifest,
        "offsiteRetrievalProvenanceSha256": args.provenance,
        "dbRestoreProofSha256": args.db_proof,
        "objectRestoreProofSha256": args.object_proof,
        "toolEvidenceSha256": args.tool_evidence,
    }
    for key, path in evidence_bindings.items():
        if require_hash(bundle.get(key), key) != sha256_file(path):
            raise ValueError(f"actual evidence hash mismatch: {key}")

    source_bindings = {
        "backupScriptSha256": args.repo / "infrastructure/docker/scripts/backup.sh",
        "backupLibrarySha256": args.repo / "infrastructure/docker/scripts/backup-lib.sh",
        "offsiteScriptSha256": args.repo / "infrastructure/docker/scripts/offsite-replication.sh",
        "objectRestoreScriptSha256": args.repo / "infrastructure/docker/scripts/restore-objects.sh",
        "databaseRestoreScriptSha256": args.repo / "scripts/restore-drill.sh",
        "baseComposeSha256": args.repo / "infrastructure/docker/docker-compose.yml",
        "candidateComposeSha256": args.repo / "infrastructure/docker/docker-compose.backup-candidate.yml",
        "toolCaptureScriptSha256": args.repo / "scripts/capture-w10d-candidate-tool-evidence.sh",
        "runtimeManifestScriptSha256": args.repo / "scripts/docker-container-redacted-manifest.py",
    }
    for key, path in source_bindings.items():
        if require_hash(bundle.get(key), key) != sha256_file(path):
            raise ValueError(f"actual source hash mismatch: {key}")

    candidate_name = str(runtime.get("name", "")).lstrip("/")
    candidate_image = str(bundle.get("candidateImageReference", ""))
    candidate_image_id = str(bundle.get("candidateImageId", ""))
    if candidate_name != args.candidate_container:
        raise ValueError("runtime candidate name mismatch")
    require_equal(runtime, {
        "schemaVersion": "diis-container-rollback-redacted-v2",
        "imageReference": candidate_image,
        "imageId": candidate_image_id,
    })
    if not re.fullmatch(r"[^@\s]+@sha256:[a-f0-9]{64}", candidate_image):
        raise ValueError("candidate image reference is not immutable")
    if not re.fullmatch(r"sha256:[a-f0-9]{64}", candidate_image_id):
        raise ValueError("candidate image ID is invalid")
    candidate_container_id = str(bundle.get("candidateContainerId", ""))
    if not re.fullmatch(r"[a-f0-9]{64}", candidate_container_id):
        raise ValueError("candidate container ID is invalid")
    if runtime.get("containerId") != candidate_container_id:
        raise ValueError("actual candidate container ID mismatch")

    runtime_contract = bundle.get("candidateRuntimeContract")
    contract_keys = {
        "entrypoint", "command", "workingDir", "user", "restartPolicy", "networkMode",
        "networkNames", "mounts", "environmentNames", "environmentValuesSha256", "identityLabels",
        "labelsSha256",
    }
    if not isinstance(runtime_contract, dict) or set(runtime_contract) != contract_keys:
        raise ValueError("candidate runtime contract fields invalid")
    if require_hash(bundle.get("candidateRuntimeContractSha256"), "runtime contract") \
            != canonical_sha256(runtime_contract):
        raise ValueError("candidate runtime contract hash mismatch")
    runtime_keys = contract_keys | {
        "schemaVersion", "containerId", "name", "imageId", "imageReference",
    }
    if set(runtime) != runtime_keys:
        raise ValueError("candidate runtime manifest has unexpected fields")
    for key in contract_keys:
        if runtime.get(key) != runtime_contract.get(key):
            raise ValueError(f"candidate runtime drift: {key}")
    require_hash(runtime_contract.get("environmentValuesSha256"), "runtime environment values")
    require_hash(runtime_contract.get("labelsSha256"), "runtime labels")
    attempt_id = str(bundle.get("candidateAttemptId", ""))
    if not re.fullmatch(r"w10d-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}", attempt_id):
        raise ValueError("candidate attempt ID invalid")
    if runtime_contract.get("identityLabels") != {
        "com.diis.w10d.attempt": attempt_id,
        "com.diis.w10d.role": "backup-candidate",
    }:
        raise ValueError("candidate identity label drift")
    if runtime_contract.get("networkNames") != ["smk-network"]:
        raise ValueError("candidate network set drift")
    if runtime_contract.get("networkMode") != "smk-network":
        raise ValueError("candidate network mode drift")
    restart_policy = runtime_contract.get("restartPolicy")
    if not isinstance(restart_policy, dict) or restart_policy.get("Name") != "unless-stopped":
        raise ValueError("candidate restart policy drift")

    tool_volume = str(bundle.get("candidateToolVolume", ""))
    minio_volume = str(bundle.get("minioSourceVolume", ""))
    lock_source = str(bundle.get("backupLockHostPath", ""))
    if not re.fullmatch(r"diis-backup-bin-w10d-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}", tool_volume):
        raise ValueError("candidate tool volume is not isolated")
    if tool_volume != f"diis-backup-bin-{attempt_id}":
        raise ValueError("candidate tool volume attempt binding mismatch")
    require_hash(bundle.get("rcloneConfigFingerprint"), "rclone config fingerprint")
    tool_mount = mount_at(runtime, "/opt/backup-bin")
    minio_mount = mount_at(runtime, "/var/lib/diis-minio-target")
    lock_mount = mount_at(runtime, "/var/lock/diis-backup")
    config_mount = mount_at(runtime, "/run/diis-secrets/rclone.conf")
    if tool_mount.get("Name") != tool_volume or tool_mount.get("RW") is not True:
        raise ValueError("actual candidate tool mount mismatch")
    if minio_mount.get("Name") != minio_volume or minio_mount.get("RW") is not False:
        raise ValueError("actual MinIO source mount mismatch")
    if lock_mount.get("Source") != lock_source or lock_mount.get("RW") is not True:
        raise ValueError("actual shared writer lock mount mismatch")
    if config_mount.get("RW") is not False:
        raise ValueError("actual rclone config mount is not read-only")

    required_env = {
        "BACKUP_SCHEDULE_ENABLED", "BACKUP_BUCKET_CREATION_ALLOWED", "OFFSITE_RETENTION_APPLY",
        "OFFSITE_CONFIG_FINGERPRINT", "OFFSITE_EXPECTED_TEAM_DRIVE_SHA256",
        "OFFSITE_EXPECTED_ROOT_FOLDER_SHA256", "BACKUP_LOCK_DIR",
    }
    environment_names = runtime.get("environmentNames")
    if not isinstance(environment_names, list) or len(environment_names) != len(set(environment_names)):
        raise ValueError("candidate runtime environment-name set invalid")
    if not required_env.issubset(set(environment_names)):
        raise ValueError("candidate runtime environment-name set incomplete")

    require_equal(root_cron, {
        "schemaVersion": "diis-root-cron-summary-v2",
        "digestSemantics": "ordered-active-records-exact-whitespace-v1",
    })
    require_hash(root_cron.get("canonicalSha256"), "root cron digest")
    root_count = root_cron.get("activeCount")
    if not isinstance(root_count, int) or root_count < 0:
        raise ValueError("root cron count invalid")
    if root_count == 0:
        if root_cron.get("status") not in ("none", "ok") or root_cron.get("semanticClassification") != "clear":
            raise ValueError("empty root cron is not clear")
    elif not (root_cron.get("status") == "ok"
              and root_cron.get("semanticClassification") == "clear-attested"
              and root_cron.get("operatorAttestationBound") is True):
        raise ValueError("active root cron lacks bound private attestation")

    backup_id = manual.get("backupId")
    require_equal(manual, {
        "schemaVersion": "diis-backup-v1",
        "status": "complete",
        "offsiteStatus": "complete",
        "offsiteConfigFingerprint": bundle.get("rcloneConfigFingerprint"),
    })
    if not re.fullmatch(r"[0-9]{8}T[0-9]{6}Z-[0-9]+", str(backup_id)):
        raise ValueError("backup ID invalid")
    dump_sha = require_hash(manual.get("sha256"), "manual dump")
    object_sha = require_hash(manual.get("objectManifestSha256"), "manual object manifest")
    if not isinstance(manual.get("bytes"), int) or manual["bytes"] <= 0:
        raise ValueError("manual dump size invalid")
    if not isinstance(manual.get("objectCount"), int) or manual["objectCount"] < 0:
        raise ValueError("manual object count invalid")

    require_equal(provenance, {
        "schemaVersion": "diis-offsite-restore-input-v1",
        "source": "independent-crypt",
        "backupId": backup_id,
        "offsiteConfigFingerprint": bundle.get("rcloneConfigFingerprint"),
        "dumpSha256": dump_sha,
        "dumpBytes": manual.get("bytes"),
        "objectManifestSha256": object_sha,
        "objectCount": manual.get("objectCount"),
        "dumpFile": f"{backup_id}.dump",
        "sidecarFile": f"{backup_id}.sha256",
        "completionFile": f"{backup_id}.complete.json",
        "objectManifestFile": f"{backup_id}.objects.tsv",
    })
    provenance_sha = sha256_file(args.provenance)
    require_equal(db_proof, {
        "schemaVersion": "diis-restore-proof-v2", "status": "success",
        "backupId": backup_id, "source": "independent-crypt",
        "sourceProvenanceSha256": provenance_sha, "dumpSha256": dump_sha,
        "objectManifestSha256": object_sha,
    })
    require_equal(object_proof, {
        "schemaVersion": "diis-object-restore-proof-v1", "status": "success",
        "backupId": backup_id, "source": "independent-crypt",
        "sourceProvenanceSha256": provenance_sha, "objectManifestSha256": object_sha,
        "objectCount": manual.get("objectCount"),
    })

    require_equal(tool, {
        "schemaVersion": "diis-backup-tool-evidence-v3", "toolVolume": tool_volume,
        "mcSha256": "01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891",
        "rcloneZipSha256": "7d69057e69385f6514a9684c7eaa424d972096b130284bb34dd967c4ed4f9dad",
        "rcloneArchiveEntry": "rclone-v1.70.3-linux-amd64/rclone",
        "mcVersion": "RELEASE.2025-08-13T08-35-41Z",
        "rcloneVersion": "v1.70.3",
    })
    rclone_sha = require_hash(tool.get("rcloneSha256"), "rclone executable")
    archive_entry_sha = require_hash(
        tool.get("rcloneArchiveEntrySha256"), "rclone archive entry"
    )
    if rclone_sha != archive_entry_sha:
        raise ValueError("rclone executable does not match pinned archive entry")
    if set(tool) != {
        "schemaVersion", "toolVolume", "mcSha256", "rcloneZipSha256",
        "rcloneArchiveEntry", "rcloneArchiveEntrySha256", "rcloneSha256",
        "mcVersion", "rcloneVersion",
    }:
        raise ValueError("tool evidence has unexpected fields")


def main() -> int:
    try:
        validate(parse_args())
    except (ValueError, OSError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        print(f"candidate acceptance rejected: {exc}", file=sys.stderr)
        return 65
    print("CANDIDATE_ACCEPTANCE_VALID")
    return 0


if __name__ == "__main__":
    sys.exit(main())
