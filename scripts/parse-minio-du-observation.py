#!/usr/bin/env python3
"""Parse one `mc du --json` record without exposing its prefix."""

from __future__ import annotations

import json
import sys
from typing import Any


MAX_SIGNED_64 = (1 << 63) - 1
EXPECTED_KEYS = {"prefix", "size", "objects", "status", "isVersions"}


class ObservationError(ValueError):
    """The input does not prove one successful aggregate observation."""


def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ObservationError("duplicate-field")
        value[key] = item
    return value


def reject(code: str) -> None:
    raise ObservationError(code)


def main() -> int:
    try:
        raw = sys.stdin.buffer.read(1024 * 1024 + 1)
        if not raw or len(raw) > 1024 * 1024 or b"\x00" in raw:
            reject("invalid-input-size")
        text = raw.decode("utf-8")
        decoder = json.JSONDecoder(object_pairs_hook=unique_object)
        value, end = decoder.raw_decode(text.lstrip())
        consumed = len(text) - len(text.lstrip()) + end
        if text[consumed:].strip():
            reject("multiple-or-trailing-records")
        if not isinstance(value, dict) or set(value) != EXPECTED_KEYS:
            reject("unknown-schema")
        if value.get("status") != "success" or value.get("isVersions") is not False:
            reject("unsuccessful-observation")
        if not isinstance(value.get("prefix"), str) or not value["prefix"]:
            reject("invalid-prefix")
        for field in ("size", "objects"):
            item = value.get(field)
            if not isinstance(item, int) or isinstance(item, bool) or item < 0 \
                    or item > MAX_SIGNED_64:
                reject(f"invalid-{field}")
        print(value["size"])
        return 0
    except (ObservationError, UnicodeError, json.JSONDecodeError):
        print("MINIO_DU_OBSERVATION_REJECTED", file=sys.stderr)
        return 65


if __name__ == "__main__":
    sys.exit(main())
