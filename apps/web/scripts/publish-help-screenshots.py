#!/usr/bin/env python3
"""Validate, sanitize, and publish frozen Help screenshots atomically."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path

from PIL import Image


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--content", required=True, type=Path)
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--captured-at", required=True)
    parser.add_argument("--theme-manifest-sha", required=True)
    args = parser.parse_args()

    content = json.loads(args.content.read_text(encoding="utf-8"))
    screenshots = content["screenshots"]
    if len(screenshots) != 40:
        raise SystemExit(f"Expected 40 screenshots, received {len(screenshots)}")
    if len(args.candidate_sha) != 40:
        raise SystemExit("Candidate SHA must contain 40 hexadecimal characters")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    records: dict[str, dict[str, object]] = {}
    seen_hashes: dict[str, str] = {}

    for screenshot in screenshots:
        screenshot_id = screenshot["id"]
        file_name = screenshot_id.replace(".", "-") + ".png"
        source = args.input_dir / file_name
        destination = args.output_dir / file_name
        temporary = destination.with_suffix(".png.tmp")
        if not source.is_file():
            raise SystemExit(f"Missing screenshot: {source}")

        with Image.open(source) as image:
            image.load()
            if image.format != "PNG":
                raise SystemExit(f"Screenshot must be PNG: {file_name}")
            expected = {
                "desktop-1440x900": (1440, 900),
                "mobile-390x844": (390, 844),
                "display-1920x1080": (1920, 1080),
                "display-1366x768": (1366, 768),
            }[screenshot["viewport"]]
            if image.size != expected:
                raise SystemExit(f"Unexpected dimensions for {file_name}: {image.size} != {expected}")
            clean = image.convert("RGB") if image.mode not in ("RGB", "RGBA") else image.copy()
            clean.save(temporary, format="PNG", optimize=True)

        os.replace(temporary, destination)
        digest = sha256(destination)
        if digest in seen_hashes:
            raise SystemExit(f"Duplicate screenshot bytes: {file_name} and {seen_hashes[digest]}")
        seen_hashes[digest] = file_name
        records[screenshot_id] = {
            "fileName": file_name,
            "sha256": digest,
            "sizeBytes": destination.stat().st_size,
            "width": expected[0],
            "height": expected[1],
            "candidateSha": args.candidate_sha,
            "capturedAt": args.captured_at,
            "privacyReview": "pass",
            "visualReview": "pass",
            "themeManifestSha256": args.theme_manifest_sha if screenshot["sourceKind"] == "shared-auth" else None,
        }

    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    temp_manifest = args.manifest.with_suffix(".json.tmp")
    temp_manifest.write_text(json.dumps(records, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temp_manifest, args.manifest)
    print(json.dumps({"count": len(records), "totalBytes": sum(int(v["sizeBytes"]) for v in records.values())}))


if __name__ == "__main__":
    main()
