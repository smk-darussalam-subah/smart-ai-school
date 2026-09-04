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
    env_names = sorted({entry.split("=", 1)[0] for entry in env})
    mounts = [
        {key: mount.get(key) for key in ("Type", "Name", "Source", "Destination", "RW", "Propagation")}
        for mount in item.get("Mounts") or []
    ]
    networks = sorted(((item.get("NetworkSettings") or {}).get("Networks") or {}).keys())
    return {
        "schemaVersion": "diis-container-rollback-redacted-v2",
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
        "environmentNames": env_names,
        "environmentValuesSha256": digest(sorted(env)),
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
    proc = subprocess.run(
        ["docker", "container", "inspect", sys.argv[1]], capture_output=True, text=True, check=True
    )
    items = json.loads(proc.stdout)
    if len(items) != 1:
        print("container inspect did not return exactly one item", file=sys.stderr)
        return 65
    print(json.dumps(redact(items[0]), sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
