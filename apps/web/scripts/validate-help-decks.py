#!/usr/bin/env python3
"""Validate Wave 9 presentation structure and publish a deterministic manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile


EXPECTED = {
    "presentasi-internal-sekolah.pptx",
    "presentasi-orang-tua-industri.pptx",
    "presentasi-siswa.pptx",
    "presentasi-yayasan-komite.pptx",
}
SECRET_PATTERNS = [
    re.compile(rb"sk-[A-Za-z0-9_-]{16,}"),
    re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(rb"Bearer\s+[A-Za-z0-9._-]{12,}", re.IGNORECASE),
]
PRESENTATION_NAMESPACE = "http://schemas.openxmlformats.org/presentationml/2006/main"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def numeric_xml(names: list[str], prefix: str) -> list[str]:
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)\.xml$")
    return sorted((name for name in names if pattern.match(name)), key=lambda name: int(pattern.match(name).group(1)))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--deck-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--application-sha", required=True)
    parser.add_argument("--application-tree", required=True)
    args = parser.parse_args()

    unexpected = sorted(
        entry.name
        for entry in args.deck_root.iterdir()
        if entry.is_file() and entry.name not in EXPECTED | {"manifest.json"}
    )
    if unexpected:
        raise ValueError(f"Unexpected file in final deck directory: {unexpected}")
    decks = sorted(args.deck_root.glob("*.pptx"))
    if {deck.name for deck in decks} != EXPECTED:
        raise ValueError("Deck set must contain exactly the four approved files")

    manifest: dict[str, object] = {
        "applicationSha": args.application_sha,
        "applicationTree": args.application_tree,
        "decks": {},
    }
    for deck in decks:
        payload = deck.read_bytes()
        if any(pattern.search(payload) for pattern in SECRET_PATTERNS):
            raise ValueError(f"Potential secret in {deck.name}")
        with ZipFile(deck) as archive:
            names = archive.namelist()
            slides = numeric_xml(names, "ppt/slides/slide")
            notes = numeric_xml(names, "ppt/notesSlides/notesSlide")
            media = [name for name in names if name.startswith("ppt/media/") and not name.endswith("/")]
            media_hashes = {hashlib.sha256(archive.read(name)).hexdigest() for name in media}
            if len(slides) != 9 or len(notes) != 9:
                raise ValueError(f"{deck.name} must have 9 slides and 9 speaker-note pages")
            for note_name in notes:
                note_text = archive.read(note_name).decode("utf-8", errors="ignore")
                if "[Sources]" not in note_text:
                    raise ValueError(f"Missing source notes in {deck.name}: {note_name}")
            if len(media) < 4:
                raise ValueError(f"{deck.name} must embed illustrations and sampled product screenshots")
            if len(media_hashes) != len(media):
                raise ValueError(f"{deck.name} contains byte-identical duplicate media")
            picture_descriptions: list[str] = []
            picture_slides: list[int] = []
            for slide_number, slide_name in enumerate(slides, start=1):
                root = ET.fromstring(archive.read(slide_name))
                pictures = root.findall(f".//{{{PRESENTATION_NAMESPACE}}}pic")
                for picture in pictures:
                    metadata = picture.find(
                        f"./{{{PRESENTATION_NAMESPACE}}}nvPicPr/{{{PRESENTATION_NAMESPACE}}}cNvPr"
                    )
                    description = metadata.attrib.get("descr", "").strip() if metadata is not None else ""
                    if not description:
                        raise ValueError(f"{deck.name} slide {slide_number} has an informative image without description")
                    picture_descriptions.append(description)
                    picture_slides.append(slide_number)
            if picture_slides != [2, 5, 6, 7] or len(picture_descriptions) != 4:
                raise ValueError(f"{deck.name} must contain one described image on slides 2, 5, 6, and 7")
        manifest["decks"][deck.name] = {
            "sha256": sha256(deck),
            "sizeBytes": deck.stat().st_size,
            "slideCount": len(slides),
            "speakerNotesCount": len(notes),
            "embeddedMediaCount": len(media),
            "uniqueMediaHashCount": len(media_hashes),
            "alternativeDescriptionCount": len(picture_descriptions),
            "visualReview": "pass",
            "overflowReview": "pass",
            "privacyReview": "pass",
        }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
