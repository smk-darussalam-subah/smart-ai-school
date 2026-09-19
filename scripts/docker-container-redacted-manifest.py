#!/usr/bin/env python3
"""Capture reconstructibility metadata without exposing environment values."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from typing import Any


def digest(value: Any) -> str:
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def redact(item: dict[str, Any]) -> dict[str, Any]:
    config = item.get("Config") or {}
    host = item.get("HostConfig") or {}
    env = config.get("Env") or []
    labels = config.get("Labels") or {}
    env_map: dict[str, str] = {}
    for entry in env:
        name, separator, value = entry.partition("=")
        if not name or not separator or name in env_map:
            raise ValueError("container environment is malformed or duplicated")
        env_map[name] = value
    env_names = sorted(env_map)
    recovery_binding_names = (
        "BACKUP_SCHEDULE_ENABLED",
        "BACKUP_BUCKET_CREATION_ALLOWED",
        "OFFSITE_RETENTION_APPLY",
        "BACKUP_LOCK_BOOTSTRAP_REQUIRED",
        "BACKUP_LOCK_DIR",
        "OFFSITE_CONFIG_FINGERPRINT",
        "OFFSITE_EXPECTED_PROVIDER",
        "OFFSITE_EXPECTED_ORIGIN",
        "OFFSITE_EXPECTED_TEAM_DRIVE_SHA256",
        "OFFSITE_EXPECTED_ROOT_FOLDER_SHA256",
        "OFFSITE_EXPECTED_AUTH_MODE",
        "OFFSITE_EXPECTED_PRINCIPAL_SHA256",
        "OFFSITE_EXPECTED_PROJECT_SHA256",
        "OFFSITE_EXPECTED_KEY_IDENTITY_SHA256",
        "OFFSITE_EXPECTED_CREDENTIAL_ARTIFACT_SHA256",
    )
    mounts = [
        {key: mount.get(key) for key in ("Type", "Name", "Source", "Destination", "RW", "Propagation")}
        for mount in item.get("Mounts") or []
    ]
    credential_destinations = (
        "/run/diis-secrets/rclone.conf",
        "/run/diis-secrets/google-service-account.json",
    )
    credential_mounts = {
        destination: [mount for mount in mounts if mount.get("Destination") == destination]
        for destination in credential_destinations
    }
    networks = sorted(((item.get("NetworkSettings") or {}).get("Networks") or {}).keys())
    return {
        "schemaVersion": "diis-container-rollback-redacted-v5",
        "containerId": item.get("Id"),
        "name": item.get("Name"),
        "imageId": item.get("Image"),
        "imageReference": config.get("Image"),
        "entrypoint": config.get("Entrypoint"),
        "command": config.get("Cmd"),
        "workingDir": config.get("WorkingDir"),
        "user": config.get("User"),
        "restartPolicy": host.get("RestartPolicy"),
        "networkMode": host.get("NetworkMode"),
        "networkNames": networks,
        "mounts": sorted(mounts, key=lambda value: json.dumps(value, sort_keys=True)),
        "credentialMounts": credential_mounts,
        "environmentNames": env_names,
        "environmentValuesSha256": digest(sorted(env)),
        "recoveryBindings": {name: env_map.get(name) for name in recovery_binding_names},
        "identityLabels": {
            key: labels.get(key)
            for key in ("com.diis.w10d.attempt", "com.diis.w10d.role")
        },
        "labelsSha256": digest(labels),
    }


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: docker-container-redacted-manifest.py CONTAINER", file=sys.stderr)
        return 64
    try:
        proc = subprocess.run(
            ["docker", "container", "inspect", sys.argv[1]],
            capture_output=True,
            text=True,
            check=True,
        )
        items = json.loads(proc.stdout)
        if not isinstance(items, list) or len(items) != 1 or not isinstance(items[0], dict):
            raise ValueError("unexpected inspect cardinality")
        proof = redact(items[0])
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError, ValueError):
        print("container redacted manifest rejected", file=sys.stderr)
        return 65
    print(json.dumps(proof, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
