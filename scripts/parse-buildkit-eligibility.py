#!/usr/bin/env python3
"""Reduce filtered BuildKit NDJSON to a secret-minimal eligibility proof."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


MAX_SIGNED_64 = (1 << 63) - 1
BUILDER = "default"
FILTERS = ["until=1h", "inuse=false", "private=true"]
EXPECTED_KEYS = {
    "CreatedAt",
    "Description",
    "ID",
    "LastUsedAt",
    "Mutable",
    "Parents",
    "Reclaimable",
    "Shared",
    "Size",
    "Type",
    "UsageCount",
}


class EligibilityError(ValueError):
    """An input cannot prove the exact filtered eligibility set."""


def reject(code: str) -> None:
    raise EligibilityError(code)


def object_without_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            reject("duplicate-key")
        value[key] = item
    return value


def parse_record(line: str) -> tuple[str, int, dict[str, Any]]:
    try:
        value: Any = json.loads(line, object_pairs_hook=object_without_duplicates)
    except json.JSONDecodeError:
        reject("malformed-json")
    if not isinstance(value, dict) or set(value) != EXPECTED_KEYS:
        reject("unknown-schema")
    record_id = value["ID"]
    if not isinstance(record_id, str) or not record_id or any(char.isspace() for char in record_id):
        reject("invalid-id")
    if not isinstance(value["Size"], str) or not value["Size"].isdigit():
        reject("invalid-size")
    size = int(value["Size"])
    if size < 0 or size > MAX_SIGNED_64:
        reject("invalid-size")
    if value["Reclaimable"] is not True:
        reject("noneligible-record")
    if not isinstance(value["Mutable"], bool) or not isinstance(value["Shared"], bool):
        reject("invalid-flags")
    if value["Shared"] is not False:
        reject("shared-record")
    if not isinstance(value["Parents"], list) or not all(
        isinstance(parent, str) and parent for parent in value["Parents"]
    ):
        reject("invalid-parents")
    if not isinstance(value["UsageCount"], int) or isinstance(value["UsageCount"], bool) \
            or value["UsageCount"] < 0:
        reject("invalid-usage-count")
    for key in ("CreatedAt", "Description", "Type"):
        if not isinstance(value[key], str) or not value[key]:
            reject("invalid-metadata")
    if value["LastUsedAt"] is not None and not isinstance(value["LastUsedAt"], str):
        reject("invalid-metadata")
    return record_id, size, value


def reduce_ndjson(raw: str, reserved_bytes: int) -> dict[str, Any]:
    if "\x00" in raw:
        reject("malformed-json")
    records: list[tuple[str, int, dict[str, Any]]] = []
    seen: set[str] = set()
    total = 0
    for line in raw.splitlines():
        if not line.strip():
            reject("blank-record")
        record = parse_record(line)
        if record[0] in seen:
            reject("duplicate-record")
        seen.add(record[0])
        total += record[1]
        if total > MAX_SIGNED_64:
            reject("size-overflow")
        records.append(record)
    if not records:
        reject("empty-unprovable")
    records.sort(key=lambda item: item[0])
    canonical_records = [item[2] for item in records]
    canonical = json.dumps(
        canonical_records, sort_keys=True, separators=(",", ":"), ensure_ascii=True
    ).encode()
    lower_bound = max(0, total - reserved_bytes)
    return {
        "schemaVersion": "diis-buildkit-eligibility-v2",
        "builder": BUILDER,
        "filters": FILTERS,
        "eligibleRecordCount": len(records),
        "eligiblePrivateBytes": total,
        "reservedBytes": reserved_bytes,
        "deletableBytesLowerBound": lower_bound,
        "canonicalSha256": hashlib.sha256(canonical).hexdigest(),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("--reserved-bytes", required=True, type=int)
    args = parser.parse_args()
    try:
        if not args.input.is_file() or args.input.is_symlink():
            reject("input-unavailable")
        if args.input.stat().st_size > 64 * 1024 * 1024:
            reject("input-too-large")
        if args.reserved_bytes < 0 or args.reserved_bytes > MAX_SIGNED_64:
            reject("invalid-reserved-bytes")
        proof = reduce_ndjson(args.input.read_text(encoding="utf-8"), args.reserved_bytes)
    except (EligibilityError, OSError, UnicodeError) as exc:
        code = str(exc) if isinstance(exc, EligibilityError) else "input-unreadable"
        print(f"BUILDKIT_ELIGIBILITY_REJECTED reason={code}", file=sys.stderr)
        return 65
    print(json.dumps(proof, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
