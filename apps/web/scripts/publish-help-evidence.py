#!/usr/bin/env python3
"""Verify generated Help evidence and publish its typed JSON registry."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image
from pypdf import PdfReader


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, dict[str, object]]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def verify_common(path: Path, record: dict[str, object]) -> None:
    if not path.is_file():
        raise ValueError(f"Missing evidence file: {path}")
    if path.stat().st_size != record["sizeBytes"]:
        raise ValueError(f"Size mismatch: {path.name}")
    if sha256(path) != record["sha256"]:
        raise ValueError(f"Hash mismatch: {path.name}")
    if record.get("privacyReview") != "pass" or record.get("visualReview") != "pass":
        raise ValueError(f"Reviews are not complete: {path.name}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--screenshot-manifest", type=Path, required=True)
    parser.add_argument("--artifact-manifest", type=Path, required=True)
    parser.add_argument("--screenshot-root", type=Path, required=True)
    parser.add_argument("--artifact-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    screenshots = load_json(args.screenshot_manifest)
    artifacts = load_json(args.artifact_manifest)
    if len(screenshots) != 40 or len(artifacts) != 24:
        raise ValueError("Checkpoint B requires exactly 40 screenshots and 24 PDFs")

    for record in screenshots.values():
        path = args.screenshot_root / str(record["fileName"])
        verify_common(path, record)
        with Image.open(path) as image:
            if [image.width, image.height] != [record["width"], record["height"]]:
                raise ValueError(f"Dimension mismatch: {path.name}")

    for record in artifacts.values():
        path = args.artifact_root / str(record["fileName"])
        verify_common(path, record)
        if record.get("accessibilityReview") != "pass":
            raise ValueError(f"Accessibility review is not complete: {path.name}")
        if len(PdfReader(path).pages) != record["pageCount"]:
            raise ValueError(f"Page count mismatch: {path.name}")

    payload = {"screenshots": screenshots, "artifacts": artifacts}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
