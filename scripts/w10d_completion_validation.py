#!/usr/bin/env python3
"""Strict shared validator for a W10-D completion manifest and checksum sidecar."""

from __future__ import annotations

import hashlib
import json
import re
import argparse
import sys
from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import Any

MAX_MANIFEST_BYTES = 128 * 1024
MAX_SIDECAR_BYTES = 4096
SHA256 = re.compile(r"^[a-f0-9]{64}$")
BACKUP_ID = re.compile(r"^[0-9]{8}T[0-9]{6}Z-[0-9]+$")
EXPECTED_KEYS = {
    "schemaVersion", "status", "backupId", "class", "protectionState", "createdAt",
    "createdEpoch", "dailyKey", "weeklyKey", "monthlyKey", "sha256", "bytes",
    "archiveValidated", "offsiteStatus", "offsiteConfigFingerprint", "objectStatus",
    "objectManifestSha256", "objectCount", "tableCount", "userCount", "studentCount",
    "targetTotalBytes", "targetFreeBytes",
}


class CompletionError(ValueError):
    """The supplied bytes do not prove a valid completed recovery point."""


def object_without_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise CompletionError("duplicate-key")
        value[key] = item
    return value


def _string(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value:
        raise CompletionError(f"invalid-{name}")
    return value


def _uint(value: Any, name: str, *, minimum: int = 0, maximum: int | None = None) -> int:
    if type(value) is not int or value < minimum or (maximum is not None and value > maximum):
        raise CompletionError(f"invalid-{name}")
    return value


def _hash(value: Any, name: str) -> str:
    text = _string(value, name)
    if not SHA256.fullmatch(text) or text == "0" * 64:
        raise CompletionError(f"invalid-{name}")
    return text


def validate_completion_bytes(
    raw: bytes, sidecar_raw: bytes, object_name: str
) -> tuple[dict[str, Any], str, str, str]:
    if not raw or len(raw) > MAX_MANIFEST_BYTES or b"\x00" in raw:
        raise CompletionError("payload-size-invalid")
    if not sidecar_raw or len(sidecar_raw) > MAX_SIDECAR_BYTES or b"\x00" in sidecar_raw:
        raise CompletionError("sidecar-size-invalid")
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=object_without_duplicates)
        sidecar_text = sidecar_raw.decode("utf-8")
    except (json.JSONDecodeError, UnicodeError) as exc:
        raise CompletionError("malformed-json-or-encoding") from exc
    if not isinstance(value, dict) or set(value) != EXPECTED_KEYS:
        raise CompletionError("unknown-schema")

    backup_id = _string(value["backupId"], "backup-id")
    if not BACKUP_ID.fullmatch(backup_id):
        raise CompletionError("invalid-backup-id")
    if PurePosixPath(object_name).name != f"{backup_id}.complete.json":
        raise CompletionError("object-name-mismatch")
    if value["schemaVersion"] != "diis-backup-v1" or value["status"] != "complete":
        raise CompletionError("completion-status-invalid")
    if value["offsiteStatus"] != "complete" or value["archiveValidated"] is not True:
        raise CompletionError("provenance-status-invalid")
    if (value["class"], value["protectionState"]) not in {
        ("daily", "none"), ("pre-change", "protected")
    }:
        raise CompletionError("class-protection-invalid")

    try:
        created = datetime.strptime(_string(value["createdAt"], "created-at"), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError as exc:
        raise CompletionError("invalid-created-at") from exc
    created_epoch = _uint(value["createdEpoch"], "created-epoch", minimum=1)
    if int(created.timestamp()) != created_epoch:
        raise CompletionError("created-time-mismatch")
    if not backup_id.startswith(created.strftime("%Y%m%dT%H%M%SZ-")):
        raise CompletionError("backup-time-mismatch")
    if value["dailyKey"] != created.strftime("%Y-%m-%d"):
        raise CompletionError("daily-key-mismatch")
    if value["weeklyKey"] != created.strftime("%G-W%V"):
        raise CompletionError("weekly-key-mismatch")
    if value["monthlyKey"] != created.strftime("%Y-%m"):
        raise CompletionError("monthly-key-mismatch")

    dump_sha = _hash(value["sha256"], "dump-sha256")
    _hash(value["offsiteConfigFingerprint"], "offsite-fingerprint")
    _hash(value["objectManifestSha256"], "object-manifest-sha256")
    _uint(value["bytes"], "dump-bytes", minimum=1024)
    object_count = _uint(value["objectCount"], "object-count")
    _uint(value["tableCount"], "table-count", minimum=1)
    user_count = _uint(value["userCount"], "user-count")
    student_count = _uint(value["studentCount"], "student-count")
    if student_count > user_count:
        raise CompletionError("student-count-exceeds-user-count")
    target_total = _uint(value["targetTotalBytes"], "target-total-bytes", minimum=1)
    target_free = _uint(value["targetFreeBytes"], "target-free-bytes", minimum=1)
    if target_free > target_total:
        raise CompletionError("target-free-exceeds-total")
    if (value["objectStatus"], object_count > 0) not in {("verified", True), ("empty", False)}:
        raise CompletionError("object-status-count-invalid")

    fields = sidecar_text.splitlines()
    if len(fields) != 1 or fields[0].split() != [dump_sha, f"{backup_id}.dump"]:
        raise CompletionError("sidecar-checksum-mismatch")
    return (
        value,
        hashlib.sha256(backup_id.encode()).hexdigest(),
        hashlib.sha256(raw).hexdigest(),
        hashlib.sha256(sidecar_raw).hexdigest(),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate one W10-D completion manifest and sidecar.")
    parser.add_argument("--object-name", required=True)
    parser.add_argument("--manifest-file", required=True)
    parser.add_argument("--sidecar-file", required=True)
    args = parser.parse_args()
    try:
        with open(args.manifest_file, "rb", buffering=0) as stream:
            raw = stream.read(MAX_MANIFEST_BYTES + 1)
        with open(args.sidecar_file, "rb", buffering=0) as stream:
            sidecar_raw = stream.read(MAX_SIDECAR_BYTES + 1)
        _, backup_id_sha, manifest_sha, sidecar_sha = validate_completion_bytes(
            raw, sidecar_raw, args.object_name
        )
    except (CompletionError, OSError) as exc:
        reason = str(exc) if isinstance(exc, CompletionError) else "file-read-failed"
        print(f"COMPLETION_MANIFEST_REJECTED reason={reason}", file=sys.stderr)
        return 65
    print(
        "COMPLETION_MANIFEST_VALID "
        f"backupIdSha256={backup_id_sha} manifestSha256={manifest_sha} sidecarSha256={sidecar_sha}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
