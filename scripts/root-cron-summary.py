#!/usr/bin/env python3
"""Produce a content-free root-crontab digest bound to a human semantic attestation."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys


def active_lines(raw: str) -> list[str]:
    """Return active records exactly, preserving order and significant whitespace."""
    result: list[str] = []
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        result.append(line)
    return result


def classify(lines: list[str], digest: str, attested_sha256: str, attestation: str) -> tuple[str, bool]:
    attested = bool(attested_sha256) and attested_sha256 == digest
    classification = (
        "clear"
        if not lines
        else "clear-attested"
        if attested and attestation == "no-writer"
        else "ambiguous"
    )
    return classification, attested


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--attested-sha256", default="")
    parser.add_argument("--attestation", choices=("no-writer", "ambiguous"), default="ambiguous")
    args = parser.parse_args()

    try:
        proc = subprocess.run(
            ["/usr/bin/crontab", "-l"], capture_output=True, text=True, timeout=5, check=False
        )
    except (OSError, subprocess.TimeoutExpired):
        print(json.dumps({"schemaVersion": "diis-root-cron-summary-v2", "status": "error"}, separators=(",", ":")))
        return 70

    no_crontab = proc.returncode == 1 and "no crontab" in proc.stderr.lower()
    if proc.returncode != 0 and not no_crontab:
        print(json.dumps({"schemaVersion": "diis-root-cron-summary-v2", "status": "error"}, separators=(",", ":")))
        return 70

    lines = [] if no_crontab else active_lines(proc.stdout)
    digest = hashlib.sha256("\n".join(lines).encode()).hexdigest()
    classification, attested = classify(lines, digest, args.attested_sha256, args.attestation)
    payload = {
        "schemaVersion": "diis-root-cron-summary-v2",
        "status": "none" if no_crontab else "ok",
        "activeCount": len(lines),
        "canonicalSha256": digest,
        "digestSemantics": "ordered-active-records-exact-whitespace-v1",
        "semanticClassification": classification,
        "operatorAttestationBound": attested,
    }
    print(json.dumps(payload, separators=(",", ":")))
    return 0 if classification in ("clear", "clear-attested") else 65


if __name__ == "__main__":
    sys.exit(main())
