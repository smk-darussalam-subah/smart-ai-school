#!/usr/bin/env python3
"""Validate W10-D candidate acceptance against actual checkout and proof files."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from w10d_completion_validation import CompletionError, validate_completion_bytes


SHA256 = re.compile(r"^[a-f0-9]{64}$")
GIT_SHA = re.compile(r"^[a-f0-9]{40}$")
MAX_EVIDENCE_BYTES = 16 * 1024 * 1024


class DuplicateKeyError(ValueError):
    """A JSON object contains an ambiguous duplicate member."""


def object_without_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise DuplicateKeyError(f"duplicate JSON field: {key}")
        value[key] = item
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_sha256(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def read_once(path: Path, expected_owner_uid: int, maximum: int) -> bytes:
    parent = path.parent
    parent_stat = os.stat(parent, follow_symlinks=False)
    if not stat.S_ISDIR(parent_stat.st_mode) or stat.S_IMODE(parent_stat.st_mode) != 0o700:
        raise ValueError(f"evidence parent is not private: {path.name}")
    if parent_stat.st_uid != expected_owner_uid or parent.is_symlink():
        raise ValueError(f"evidence parent owner or link invalid: {path.name}")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        file_stat = os.fstat(fd)
        if not stat.S_ISREG(file_stat.st_mode) or stat.S_IMODE(file_stat.st_mode) != 0o600:
            raise ValueError(f"evidence file mode invalid: {path.name}")
        if file_stat.st_uid != expected_owner_uid or not 0 < file_stat.st_size <= maximum:
            raise ValueError(f"evidence owner or size invalid: {path.name}")
        chunks: list[bytes] = []
        remaining = maximum + 1
        while remaining > 0:
            chunk = os.read(fd, min(1024 * 1024, remaining))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        raw = b"".join(chunks)
        file_stat_after = os.fstat(fd)
        stable_fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns")
        if any(getattr(file_stat, key) != getattr(file_stat_after, key) for key in stable_fields):
            raise ValueError(f"evidence changed during read: {path.name}")
        if len(raw) > maximum or len(raw) != file_stat.st_size:
            raise ValueError(f"evidence size invalid: {path.name}")
        return raw
    finally:
        os.close(fd)


def snapshot_bytes(raw: bytes, snapshot_dir: Path, name: str) -> None:
    destination = snapshot_dir / name
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb", buffering=0) as stream:
            fd = -1
            stream.write(raw)
    finally:
        if fd >= 0:
            os.close(fd)


def load_json(path: Path, args: argparse.Namespace, name: str) -> tuple[dict[str, Any], bytes, str]:
    raw = read_once(path, args.expected_owner_uid, MAX_EVIDENCE_BYTES)
    snapshot_bytes(raw, args.snapshot_dir, f"{name}.json")
    value = json.loads(raw.decode("utf-8"), object_pairs_hook=object_without_duplicates)
    if not isinstance(value, dict):
        raise ValueError(f"evidence is not an object: {path.name}")
    return value, raw, hashlib.sha256(raw).hexdigest()


def require_equal(value: dict[str, Any], expected: dict[str, Any]) -> None:
    for key, wanted in expected.items():
        if value.get(key) != wanted:
            raise ValueError(f"field mismatch: {key}")


def require_exact_keys(value: dict[str, Any], expected: set[str], name: str) -> None:
    if set(value) != expected:
        raise ValueError(f"{name} fields invalid")


def require_string(value: Any, name: str, *, allow_empty: bool = False) -> str:
    if not isinstance(value, str) or (not allow_empty and not value):
        raise ValueError(f"invalid string: {name}")
    return value


def require_uint(value: Any, name: str, *, positive: bool = False) -> int:
    if type(value) is not int or value < (1 if positive else 0):
        raise ValueError(f"invalid integer: {name}")
    return value


def require_hash(value: Any, name: str) -> str:
    if not isinstance(value, str) or not SHA256.fullmatch(value):
        raise ValueError(f"invalid SHA-256: {name}")
    return value


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
    parser.add_argument("--expected-bundle-sha256", required=True)
    parser.add_argument("--snapshot-dir", type=Path, required=True)
    parser.add_argument("--expected-owner-uid", type=int, required=True)
    parser.add_argument("--test-root", type=Path)
    parser.add_argument("--test-lock-host-path")
    parser.add_argument("--test-pause-marker", type=Path)
    parser.add_argument("--test-pause-release", type=Path)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("main_sha")
    parser.add_argument("main_tree")
    parser.add_argument("candidate_container")
    parser.add_argument("repo", type=Path)
    parser.add_argument("runtime_manifest", type=Path)
    parser.add_argument("root_cron_evidence", type=Path)
    parser.add_argument("manual_manifest", type=Path)
    parser.add_argument("manual_sidecar", type=Path)
    parser.add_argument("provenance", type=Path)
    parser.add_argument("db_proof", type=Path)
    parser.add_argument("object_proof", type=Path)
    parser.add_argument("tool_evidence", type=Path)
    parser.add_argument("service_account_evidence", type=Path)
    return parser.parse_args()


def validate_test_boundary(args: argparse.Namespace) -> Path | None:
    inherited = [name for name in os.environ if name.startswith("DIIS_ACCEPTANCE_TEST_")]
    inherited += [name for name in ("DIIS_W10D_TEST_ROOT",) if os.environ.get(name)]
    test_options = (args.test_lock_host_path, args.test_pause_marker, args.test_pause_release)
    if args.test_root is None:
        if inherited or any(item is not None for item in test_options):
            raise ValueError("test controls forbidden in production mode")
        return None
    if inherited:
        raise ValueError("inherited test controls are forbidden")
    root = args.test_root.resolve(strict=True)
    root_stat = os.stat(root, follow_symlinks=False)
    if args.test_root.is_symlink() or root.parent != Path("/tmp") \
            or not stat.S_ISDIR(root_stat.st_mode) \
            or stat.S_IMODE(root_stat.st_mode) != 0o700 \
            or root_stat.st_uid != args.expected_owner_uid:
        raise ValueError("test root must be one canonical private direct child of /tmp")

    confined = [
        args.bundle, args.snapshot_dir, args.repo, args.runtime_manifest,
        args.root_cron_evidence, args.manual_manifest, args.manual_sidecar,
        args.provenance, args.db_proof, args.object_proof, args.tool_evidence,
        args.service_account_evidence,
    ]
    if args.test_lock_host_path is not None:
        confined.append(Path(args.test_lock_host_path))
    for path in confined:
        resolved = path.resolve(strict=path.exists())
        if resolved == root or root not in resolved.parents:
            raise ValueError("test path escapes canonical private test root")
    if (args.test_pause_marker is None) != (args.test_pause_release is None):
        raise ValueError("test pause marker and release must be supplied together")
    for path in (args.test_pause_marker, args.test_pause_release):
        if path is not None and (path.parent.resolve(strict=True) != root or path.is_symlink()):
            raise ValueError("test pause path must be a direct child of test root")
    return root


def validate(args: argparse.Namespace) -> None:
    test_root = validate_test_boundary(args)
    if not GIT_SHA.fullmatch(args.main_sha) or not GIT_SHA.fullmatch(args.main_tree):
        raise ValueError("invalid source binding")
    if git(args.repo, "rev-parse", "HEAD") != args.main_sha:
        raise ValueError("actual checkout SHA mismatch")
    if git(args.repo, "rev-parse", "HEAD^{tree}") != args.main_tree:
        raise ValueError("actual checkout tree mismatch")
    if git(args.repo, "status", "--porcelain", "--untracked-files=normal"):
        raise ValueError("actual checkout is not clean")

    snapshot_stat = os.stat(args.snapshot_dir, follow_symlinks=False)
    if args.snapshot_dir.is_symlink() or not stat.S_ISDIR(snapshot_stat.st_mode) \
            or stat.S_IMODE(snapshot_stat.st_mode) != 0o700 \
            or snapshot_stat.st_uid != args.expected_owner_uid:
        raise ValueError("snapshot directory is not private")
    if any(args.snapshot_dir.iterdir()):
        raise ValueError("snapshot directory is not empty")
    loaded = {
        "bundle": load_json(args.bundle, args, "bundle"),
        "runtime": load_json(args.runtime_manifest, args, "runtime"),
        "root_cron": load_json(args.root_cron_evidence, args, "root-cron"),
        "manual": load_json(args.manual_manifest, args, "manual"),
        "provenance": load_json(args.provenance, args, "provenance"),
        "db_proof": load_json(args.db_proof, args, "db-proof"),
        "object_proof": load_json(args.object_proof, args, "object-proof"),
        "tool": load_json(args.tool_evidence, args, "tool"),
        "service_account": load_json(args.service_account_evidence, args, "service-account"),
    }
    sidecar_raw = read_once(args.manual_sidecar, args.expected_owner_uid, 4096)
    snapshot_bytes(sidecar_raw, args.snapshot_dir, "manual.sha256")
    bundle, runtime, root_cron, manual, provenance, db_proof, object_proof, tool, service_account = (
        loaded[name][0] for name in (
            "bundle", "runtime", "root_cron", "manual", "provenance", "db_proof",
            "object_proof", "tool", "service_account"
        )
    )
    evidence_sha = {name: item[2] for name, item in loaded.items()}
    if args.test_pause_marker is not None:
        marker = args.test_pause_marker
        release = args.test_pause_release
        assert release is not None and test_root is not None
        fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write("snapshot-complete\n")
        deadline = time.monotonic() + 5
        while not release.exists():
            if time.monotonic() >= deadline:
                raise ValueError("test pause timed out")
            time.sleep(0.02)
    if not SHA256.fullmatch(args.expected_bundle_sha256) \
            or evidence_sha["bundle"] != args.expected_bundle_sha256:
        raise ValueError("candidate acceptance bundle hash mismatch")

    bundle_keys = {
        "schemaVersion", "status", "mainSha", "mainTree", "candidateContainer",
        "candidateContainerId", "candidateAttemptId", "offsiteSource", "localMinioFallback",
        "retentionApply", "manualBackupStatus", "dbRestoreStatus", "objectRestoreStatus",
        "candidateImageReference", "candidateImageId", "candidateToolVolume", "minioSourceVolume",
        "backupLockHostPath", "rcloneConfigFingerprint", "sharedDriveSha256",
        "sharedDriveRootFolderSha256", "offsiteProvider", "offsiteOrigin",
        "candidateRuntimeContract", "candidateRuntimeContractSha256", "serviceAccountAuthMode",
        "serviceAccountPrincipalSha256", "serviceAccountProjectSha256",
        "serviceAccountKeyIdentitySha256", "serviceAccountArtifactSha256",
        "candidateEnvironmentNamesSha256", "candidateRuntimeManifestSha256",
        "rootCronEvidenceSha256", "manualBackupManifestSha256", "manualBackupSidecarSha256",
        "manualBackupManifestProducerExitCode", "manualBackupSidecarProducerExitCode",
        "offsiteRetrievalProvenanceSha256", "dbRestoreProofSha256", "objectRestoreProofSha256",
        "toolEvidenceSha256", "serviceAccountEvidenceSha256", "backupScriptSha256",
        "backupLibrarySha256", "offsiteScriptSha256", "objectRestoreScriptSha256",
        "databaseRestoreScriptSha256", "baseComposeSha256", "candidateComposeSha256",
        "toolCaptureScriptSha256", "runtimeManifestScriptSha256", "serviceAccountParserSha256",
    }
    require_exact_keys(bundle, bundle_keys, "acceptance bundle")
    for key, item in bundle.items():
        if key == "candidateRuntimeContract":
            if not isinstance(item, dict):
                raise ValueError("runtime contract type invalid")
        elif key in {"localMinioFallback", "retentionApply"}:
            if type(item) is not bool:
                raise ValueError(f"invalid boolean: {key}")
        elif key in {"manualBackupManifestProducerExitCode", "manualBackupSidecarProducerExitCode"}:
            if type(item) is not int:
                raise ValueError(f"invalid producer status: {key}")
        else:
            require_string(item, f"bundle {key}")

    require_equal(bundle, {
        "schemaVersion": "diis-w10d-backup-candidate-acceptance-v6",
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
        "offsiteProvider": "google",
        "offsiteOrigin": "provider-default",
        "manualBackupManifestProducerExitCode": 0,
        "manualBackupSidecarProducerExitCode": 0,
    })

    evidence_bindings = {
        "candidateRuntimeManifestSha256": "runtime",
        "rootCronEvidenceSha256": "root_cron",
        "manualBackupManifestSha256": "manual",
        "offsiteRetrievalProvenanceSha256": "provenance",
        "dbRestoreProofSha256": "db_proof",
        "objectRestoreProofSha256": "object_proof",
        "toolEvidenceSha256": "tool",
        "serviceAccountEvidenceSha256": "service_account",
    }
    for key, evidence_name in evidence_bindings.items():
        if require_hash(bundle.get(key), key) != evidence_sha[evidence_name]:
            raise ValueError(f"actual evidence hash mismatch: {key}")
    if require_hash(bundle.get("manualBackupSidecarSha256"), "manual sidecar") \
            != hashlib.sha256(sidecar_raw).hexdigest():
        raise ValueError("actual evidence hash mismatch: manualBackupSidecarSha256")

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
        "serviceAccountParserSha256": args.repo / "scripts/google-service-account-binding.py",
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
        "schemaVersion": "diis-container-rollback-redacted-v5",
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
        "labelsSha256", "credentialMounts",
        "recoveryBindings",
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
    for key in ("schemaVersion", "containerId", "name", "imageId", "imageReference",
                "workingDir", "user", "networkMode", "environmentValuesSha256", "labelsSha256"):
        require_string(runtime.get(key), f"runtime {key}", allow_empty=key in {"workingDir", "user"})
    for key in ("entrypoint", "command", "networkNames", "mounts", "environmentNames"):
        if not isinstance(runtime.get(key), list):
            raise ValueError(f"runtime list type invalid: {key}")
    if not isinstance(runtime.get("restartPolicy"), dict) \
            or not isinstance(runtime.get("credentialMounts"), dict) \
            or not isinstance(runtime.get("recoveryBindings"), dict) \
            or not isinstance(runtime.get("identityLabels"), dict):
        raise ValueError("runtime object type invalid")
    for key in ("entrypoint", "command", "networkNames", "environmentNames"):
        if not all(isinstance(item, str) for item in runtime[key]):
            raise ValueError(f"runtime list item invalid: {key}")
    mount_keys = {"Type", "Name", "Source", "Destination", "RW", "Propagation"}
    for mount in runtime["mounts"]:
        if not isinstance(mount, dict) or set(mount) != mount_keys:
            raise ValueError("runtime mount fields invalid")
        if not isinstance(mount["Destination"], str) or type(mount["RW"]) is not bool:
            raise ValueError("runtime mount types invalid")
        for key in ("Type", "Name", "Source", "Propagation"):
            if mount[key] is not None and not isinstance(mount[key], str):
                raise ValueError("runtime mount types invalid")
    require_exact_keys(runtime["restartPolicy"], {"Name", "MaximumRetryCount"}, "restart policy")
    if not isinstance(runtime["restartPolicy"]["Name"], str) \
            or type(runtime["restartPolicy"]["MaximumRetryCount"]) is not int:
        raise ValueError("restart policy types invalid")
    require_exact_keys(
        runtime["identityLabels"],
        {"com.diis.w10d.attempt", "com.diis.w10d.role"},
        "identity labels",
    )
    require_exact_keys(
        runtime["credentialMounts"],
        {"/run/diis-secrets/rclone.conf", "/run/diis-secrets/google-service-account.json"},
        "credential mounts",
    )
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
    allowed_lock_source = "/var/lock/diis-backup"
    if args.test_lock_host_path is not None:
        if test_root is None:
            raise ValueError("test lock path mode unavailable")
        allowed_lock_source = args.test_lock_host_path
    if lock_source != allowed_lock_source:
        raise ValueError("backup lock host path is not canonical")
    if not re.fullmatch(r"diis-backup-bin-w10d-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}", tool_volume):
        raise ValueError("candidate tool volume is not isolated")
    if tool_volume != f"diis-backup-bin-{attempt_id}":
        raise ValueError("candidate tool volume attempt binding mismatch")
    require_hash(bundle.get("rcloneConfigFingerprint"), "rclone config fingerprint")
    tool_mount = mount_at(runtime, "/opt/backup-bin")
    minio_mount = mount_at(runtime, "/var/lib/diis-minio-target")
    lock_mount = mount_at(runtime, "/var/lock/diis-backup")
    config_mount = mount_at(runtime, "/run/diis-secrets/rclone.conf")
    credential_mount = mount_at(runtime, "/run/diis-secrets/google-service-account.json")
    if tool_mount.get("Name") != tool_volume or tool_mount.get("RW") is not True:
        raise ValueError("actual candidate tool mount mismatch")
    if minio_mount.get("Name") != minio_volume or minio_mount.get("RW") is not False:
        raise ValueError("actual MinIO source mount mismatch")
    if lock_mount.get("Source") != lock_source or lock_mount.get("RW") is not True:
        raise ValueError("actual shared writer lock mount mismatch")
    if config_mount.get("Source") != "/etc/diis/rclone.conf" or config_mount.get("RW") is not False:
        raise ValueError("actual rclone config mount is not read-only")
    if credential_mount.get("Type") != "bind" \
            or credential_mount.get("Source") != "/etc/diis/google-service-account.json" \
            or credential_mount.get("RW") is not False:
        raise ValueError("actual Service Account mount mismatch")
    if runtime_contract.get("credentialMounts") != {
        "/run/diis-secrets/rclone.conf": [config_mount],
        "/run/diis-secrets/google-service-account.json": [credential_mount],
    }:
        raise ValueError("credential mount binding drift")

    service_account_expected = {
        "schemaVersion": "diis-google-service-account-binding-v1",
        "authMode": "service-account-file",
    }
    require_equal(service_account, service_account_expected)
    if set(service_account) != {
        "schemaVersion", "authMode", "principalSha256", "projectSha256",
        "keyIdentitySha256", "credentialArtifactSha256",
    }:
        raise ValueError("Service Account evidence fields invalid")
    identity_fields = {
        "serviceAccountPrincipalSha256": "principalSha256",
        "serviceAccountProjectSha256": "projectSha256",
        "serviceAccountKeyIdentitySha256": "keyIdentitySha256",
        "serviceAccountArtifactSha256": "credentialArtifactSha256",
    }
    if bundle.get("serviceAccountAuthMode") != "service-account-file":
        raise ValueError("Service Account auth mode mismatch")
    for bundle_key, evidence_key in identity_fields.items():
        if require_hash(bundle.get(bundle_key), bundle_key) != require_hash(
            service_account.get(evidence_key), evidence_key
        ):
            raise ValueError(f"Service Account binding mismatch: {bundle_key}")

    shared_drive_sha = require_hash(bundle.get("sharedDriveSha256"), "Shared Drive")
    root_folder_sha = require_hash(bundle.get("sharedDriveRootFolderSha256"), "Shared Drive root")
    expected_recovery_bindings = {
        "BACKUP_SCHEDULE_ENABLED": "0",
        "BACKUP_BUCKET_CREATION_ALLOWED": "0",
        "OFFSITE_RETENTION_APPLY": "0",
        "BACKUP_LOCK_BOOTSTRAP_REQUIRED": "1",
        "BACKUP_LOCK_DIR": "/var/lock/diis-backup/backup.lock",
        "OFFSITE_CONFIG_FINGERPRINT": bundle.get("rcloneConfigFingerprint"),
        "OFFSITE_EXPECTED_PROVIDER": bundle.get("offsiteProvider"),
        "OFFSITE_EXPECTED_ORIGIN": bundle.get("offsiteOrigin"),
        "OFFSITE_EXPECTED_TEAM_DRIVE_SHA256": shared_drive_sha,
        "OFFSITE_EXPECTED_ROOT_FOLDER_SHA256": root_folder_sha,
        "OFFSITE_EXPECTED_AUTH_MODE": "service-account-file",
        "OFFSITE_EXPECTED_PRINCIPAL_SHA256": service_account.get("principalSha256"),
        "OFFSITE_EXPECTED_PROJECT_SHA256": service_account.get("projectSha256"),
        "OFFSITE_EXPECTED_KEY_IDENTITY_SHA256": service_account.get("keyIdentitySha256"),
        "OFFSITE_EXPECTED_CREDENTIAL_ARTIFACT_SHA256": service_account.get(
            "credentialArtifactSha256"
        ),
    }
    if runtime_contract.get("recoveryBindings") != expected_recovery_bindings:
        raise ValueError("actual candidate recovery binding values mismatch")

    required_env = {
        "BACKUP_SCHEDULE_ENABLED", "BACKUP_BUCKET_CREATION_ALLOWED", "OFFSITE_RETENTION_APPLY",
        "OFFSITE_CONFIG_FINGERPRINT", "OFFSITE_EXPECTED_TEAM_DRIVE_SHA256",
        "OFFSITE_EXPECTED_PROVIDER", "OFFSITE_EXPECTED_ORIGIN",
        "OFFSITE_EXPECTED_ROOT_FOLDER_SHA256", "BACKUP_LOCK_DIR",
        "BACKUP_LOCK_BOOTSTRAP_REQUIRED",
        "OFFSITE_EXPECTED_AUTH_MODE", "OFFSITE_EXPECTED_PRINCIPAL_SHA256",
        "OFFSITE_EXPECTED_PROJECT_SHA256", "OFFSITE_EXPECTED_KEY_IDENTITY_SHA256",
        "OFFSITE_EXPECTED_CREDENTIAL_ARTIFACT_SHA256",
    }
    environment_names = runtime.get("environmentNames")
    if not isinstance(environment_names, list) or len(environment_names) != len(set(environment_names)):
        raise ValueError("candidate runtime environment-name set invalid")
    if not required_env.issubset(set(environment_names)):
        raise ValueError("candidate runtime environment-name set incomplete")
    forbidden_env = re.compile(
        r"(^|_)(TOKEN|REFRESH_TOKEN|CLIENT_ID|CLIENT_SECRET|SERVICE_ACCOUNT_CREDENTIALS|IMPERSONATE)(_|$)",
        re.IGNORECASE,
    )
    if any(forbidden_env.search(name) for name in environment_names):
        raise ValueError("candidate runtime contains forbidden auth environment")
    if require_hash(bundle.get("candidateEnvironmentNamesSha256"), "environment-name set") \
            != canonical_sha256(environment_names):
        raise ValueError("candidate environment-name set hash mismatch")

    require_exact_keys(root_cron, {
        "schemaVersion", "status", "activeCount", "canonicalSha256", "digestSemantics",
        "semanticClassification", "operatorAttestationBound",
    }, "root cron evidence")
    require_equal(root_cron, {
        "schemaVersion": "diis-root-cron-summary-v2",
        "digestSemantics": "ordered-active-records-exact-whitespace-v1",
    })
    require_hash(root_cron.get("canonicalSha256"), "root cron digest")
    root_count = root_cron.get("activeCount")
    require_uint(root_count, "root cron count")
    if type(root_cron.get("operatorAttestationBound")) is not bool:
        raise ValueError("root cron attestation type invalid")
    if root_count == 0:
        if root_cron.get("status") not in ("none", "ok") or root_cron.get("semanticClassification") != "clear":
            raise ValueError("empty root cron is not clear")
    elif not (root_cron.get("status") == "ok"
              and root_cron.get("semanticClassification") == "clear-attested"
              and root_cron.get("operatorAttestationBound") is True):
        raise ValueError("active root cron lacks bound private attestation")

    backup_id = manual.get("backupId")
    validated_manual, _, _, _ = validate_completion_bytes(
        loaded["manual"][1], sidecar_raw, f"{backup_id}.complete.json"
    )
    if validated_manual != manual:
        raise ValueError("manual completion snapshot mismatch")
    if manual.get("offsiteConfigFingerprint") != bundle.get("rcloneConfigFingerprint"):
        raise ValueError("manual off-site fingerprint mismatch")
    dump_sha = str(manual["sha256"])
    object_sha = str(manual["objectManifestSha256"])

    require_exact_keys(provenance, {
        "schemaVersion", "source", "backupId", "offsiteConfigFingerprint", "dumpSha256",
        "dumpBytes", "objectManifestSha256", "objectCount", "dumpFile", "sidecarFile",
        "completionFile", "objectManifestFile", "createdAt",
    }, "offsite provenance")
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
    for key in ("schemaVersion", "source", "backupId", "offsiteConfigFingerprint", "dumpSha256",
                "objectManifestSha256", "dumpFile", "sidecarFile", "completionFile",
                "objectManifestFile", "createdAt"):
        require_string(provenance.get(key), f"provenance {key}")
    require_uint(provenance.get("dumpBytes"), "provenance dump bytes", positive=True)
    require_uint(provenance.get("objectCount"), "provenance object count")
    provenance_sha = evidence_sha["provenance"]
    require_exact_keys(db_proof, {
        "schemaVersion", "status", "backupId", "source", "sourceProvenanceSha256",
        "dumpSha256", "objectManifestSha256", "tableCount", "userCount", "studentCount",
        "createdEpoch",
    }, "database restore proof")
    require_equal(db_proof, {
        "schemaVersion": "diis-restore-proof-v3", "status": "success",
        "backupId": backup_id, "source": "independent-crypt",
        "sourceProvenanceSha256": provenance_sha, "dumpSha256": dump_sha,
        "objectManifestSha256": object_sha,
        "tableCount": manual.get("tableCount"),
        "userCount": manual.get("userCount"),
        "studentCount": manual.get("studentCount"),
    })
    require_uint(db_proof.get("tableCount"), "database proof table count", positive=True)
    require_uint(db_proof.get("userCount"), "database proof user count")
    require_uint(db_proof.get("studentCount"), "database proof student count")
    require_uint(db_proof.get("createdEpoch"), "database proof created epoch", positive=True)
    require_exact_keys(object_proof, {
        "schemaVersion", "status", "backupId", "source", "sourceProvenanceSha256",
        "objectManifestSha256", "objectCount", "createdEpoch",
    }, "object restore proof")
    require_equal(object_proof, {
        "schemaVersion": "diis-object-restore-proof-v1", "status": "success",
        "backupId": backup_id, "source": "independent-crypt",
        "sourceProvenanceSha256": provenance_sha, "objectManifestSha256": object_sha,
        "objectCount": manual.get("objectCount"),
    })
    require_uint(object_proof.get("createdEpoch"), "object proof created epoch", positive=True)

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
