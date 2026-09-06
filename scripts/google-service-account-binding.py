#!/usr/bin/env python3
"""Validate a dedicated Google Service Account artifact without exposing identity values."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import sys
from pathlib import Path
from typing import Any


REQUIRED_IDENTITY_FIELDS = ("client_email", "project_id", "private_key_id")


class CredentialError(ValueError):
    """A credential artifact violates the W10-D binding contract."""


def reject(code: str) -> None:
    raise CredentialError(code)


def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            reject("duplicate-field")
        value[key] = item
    return value


def hash_text(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def validate_artifact(path: Path, expected_path: str, expected_owner_uid: int = 0) -> dict[str, str]:
    if str(path) != expected_path:
        reject("wrong-path")
    try:
        info = os.lstat(path)
    except OSError:
        reject("artifact-unavailable")
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        reject("artifact-not-regular")
    if info.st_uid != expected_owner_uid:
        reject("wrong-owner")
    if stat.S_IMODE(info.st_mode) != 0o600:
        reject("unsafe-mode")
    if info.st_size <= 0 or info.st_size > 128 * 1024:
        reject("invalid-size")
    try:
        raw = path.read_bytes()
        value: Any = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object)
    except CredentialError:
        raise
    except (OSError, UnicodeError, json.JSONDecodeError):
        reject("malformed-json")
    if not isinstance(value, dict) or value.get("type") != "service_account":
        reject("wrong-auth-type")
    for field in REQUIRED_IDENTITY_FIELDS:
        item = value.get(field)
        if not isinstance(item, str) or not item.strip():
            reject("missing-identity-field")
    private_key = value.get("private_key")
    if not isinstance(private_key, str) or not private_key.strip():
        reject("missing-private-key")
    forbidden = {
        "token",
        "refresh_token",
        "client_secret",
        "service_account_credentials",
        "impersonate_service_account",
        "impersonate",
        "subject",
    }
    if any(key in value for key in forbidden):
        reject("forbidden-auth-field")
    return {
        "schemaVersion": "diis-google-service-account-binding-v1",
        "authMode": "service-account-file",
        "principalSha256": hash_text(value["client_email"]),
        "projectSha256": hash_text(value["project_id"]),
        "keyIdentitySha256": hash_text(value["private_key_id"]),
        "credentialArtifactSha256": hashlib.sha256(raw).hexdigest(),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--expected-path", required=True)
    parser.add_argument("--expected-owner-uid", type=int, default=0)
    args = parser.parse_args()
    try:
        if args.expected_owner_uid < 0:
            reject("wrong-owner")
        proof = validate_artifact(args.artifact, args.expected_path, args.expected_owner_uid)
    except CredentialError as exc:
        print(f"GOOGLE_SERVICE_ACCOUNT_REJECTED reason={exc}", file=sys.stderr)
        return 65
    print(json.dumps(proof, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
