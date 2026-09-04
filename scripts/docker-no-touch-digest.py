#!/usr/bin/env python3
"""Hash Docker runtime metadata without printing config, environment, or resource names."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from typing import Any


def docker_json(kind: str, args: list[str]) -> list[dict[str, Any]]:
    ids = sorted(set(subprocess.run(["docker", *args], capture_output=True, text=True, check=True).stdout.split()))
    if not ids:
        return []
    inspect_prefix = {
        "containers": ["docker", "container", "inspect"],
        "images": ["docker", "image", "inspect"],
        "volumes": ["docker", "volume", "inspect"],
        "networks": ["docker", "network", "inspect"],
    }[kind]
    return json.loads(subprocess.run([*inspect_prefix, *ids], capture_output=True, text=True, check=True).stdout)


def secret_hash(values: list[str] | None) -> str:
    normalized = "\n".join(sorted(values or []))
    return hashlib.sha256(normalized.encode()).hexdigest()


def normalize(kind: str, item: dict[str, Any]) -> dict[str, Any]:
    if kind == "containers":
        config = item.get("Config") or {}
        host = item.get("HostConfig") or {}
        state = item.get("State") or {}
        networks = (item.get("NetworkSettings") or {}).get("Networks") or {}
        return {
            "Id": item.get("Id"), "Name": item.get("Name"), "Image": item.get("Image"),
            "Path": item.get("Path"), "Args": item.get("Args"), "EnvSha256": secret_hash(config.get("Env")),
            "LabelsSha256": secret_hash([f"{k}={v}" for k, v in (config.get("Labels") or {}).items()]),
            "RestartPolicy": host.get("RestartPolicy"), "NetworkMode": host.get("NetworkMode"),
            "Binds": sorted(host.get("Binds") or []),
            "Mounts": sorted([{k: m.get(k) for k in ("Type", "Name", "Source", "Destination", "RW", "Propagation")} for m in item.get("Mounts") or []], key=lambda x: json.dumps(x, sort_keys=True)),
            "Networks": {k: {p: v.get(p) for p in ("NetworkID", "EndpointID", "Gateway", "IPAddress", "IPPrefixLen", "MacAddress")} for k, v in sorted(networks.items())},
            "State": {"Status": state.get("Status"), "Running": state.get("Running"), "Health": (state.get("Health") or {}).get("Status")},
        }
    if kind == "images":
        return {k: item.get(k) for k in ("Id", "RepoTags", "RepoDigests", "Parent", "Architecture", "Os", "Size")}
    if kind == "volumes":
        return {k: item.get(k) for k in ("Name", "Driver", "Scope", "Mountpoint", "Labels", "Options")}
    if kind == "networks":
        containers = item.get("Containers") or {}
        return {
            **{k: item.get(k) for k in ("Name", "Id", "Driver", "Scope", "Internal", "Attachable", "Ingress", "IPAM", "Options", "Labels")},
            "Containers": {k: {p: v.get(p) for p in ("Name", "EndpointID", "MacAddress", "IPv4Address", "IPv6Address")} for k, v in sorted(containers.items())},
        }
    raise ValueError(kind)


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in {"containers", "images", "volumes", "networks"}:
        print("usage: docker-no-touch-digest.py containers|images|volumes|networks", file=sys.stderr)
        return 64
    kind = sys.argv[1]
    list_args = {
        "containers": ["ps", "-aq", "--no-trunc"],
        "images": ["image", "ls", "-q", "--no-trunc"],
        "volumes": ["volume", "ls", "-q"],
        "networks": ["network", "ls", "-q"],
    }[kind]
    items = docker_json(kind, list_args)
    canonical = json.dumps(sorted((normalize(kind, i) for i in items), key=lambda x: json.dumps(x, sort_keys=True)), sort_keys=True, separators=(",", ":"))
    print(json.dumps({"schemaVersion": "diis-docker-no-touch-v1", "surface": kind, "count": len(items), "sha256": hashlib.sha256(canonical.encode()).hexdigest()}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
