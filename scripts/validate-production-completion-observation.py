#!/usr/bin/env python3
"""Validate one already bounded production completion marker and sidecar."""

from __future__ import annotations

import argparse
import sys

from w10d_completion_validation import CompletionError, validate_completion_bytes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--object-name", required=True)
    parser.add_argument("--manifest-file", required=True)
    parser.add_argument("--sidecar-file", required=True)
    args = parser.parse_args()
    try:
        with open(args.manifest_file, "rb", buffering=0) as stream:
            raw = stream.read(128 * 1024 + 1)
        with open(args.sidecar_file, "rb", buffering=0) as stream:
            sidecar_raw = stream.read(4097)
        _, backup_id_sha, manifest_sha, sidecar_sha = validate_completion_bytes(
            raw, sidecar_raw, args.object_name
        )
    except (CompletionError, OSError) as exc:
        reason = str(exc) if isinstance(exc, CompletionError) else "file-read-failed"
        print(f"COMPLETION_OBSERVATION_REJECTED reason={reason}", file=sys.stderr)
        return 65
    print(
        "COMPLETION_OBSERVATION_VALID "
        f"backupIdSha256={backup_id_sha} manifestSha256={manifest_sha} sidecarSha256={sidecar_sha}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
