#!/usr/bin/env python3
"""Validate every generated Help PDF page and build visual review sheets."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageStat
from pypdf import PdfReader


FORBIDDEN = [
    re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I),
    re.compile(r"(?:\+62|\b08)\d[\d\s-]{7,}"),
    re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b", re.I),
    re.compile(r"(?:api[_-]?key|client[_-]?secret|password|pairing\s*code)\s*[:=]", re.I),
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def flatten_outline(items) -> int:
    count = 0
    for item in items:
        if isinstance(item, list):
            count += flatten_outline(item)
        else:
            count += 1
    return count


def resolved(value):
    return value.get_object() if hasattr(value, "get_object") else value


def validate_tagged_accessibility(reader: PdfReader, artifact_id: str) -> tuple[list[str], dict[str, int]]:
    issues: list[str] = []
    root = reader.root_object
    mark_info = resolved(root.get("/MarkInfo"))
    if not mark_info or not bool(mark_info.get("/Marked")):
        issues.append(f"{artifact_id}: document is not marked as tagged")
    struct_root = resolved(root.get("/StructTreeRoot"))
    if not struct_root:
        return issues + [f"{artifact_id}: StructTreeRoot missing"], {}
    parent_tree = resolved(struct_root.get("/ParentTree"))
    parent_nums = list(parent_tree.get("/Nums", [])) if parent_tree else []
    parent_map = {int(parent_nums[index]): resolved(parent_nums[index + 1]) for index in range(0, len(parent_nums), 2)}

    document = resolved(struct_root.get("/K"))
    if not document or document.get("/S") != "/Document":
        issues.append(f"{artifact_id}: Document structure element missing")
        return issues, {}
    children = list(document.get("/K", []))
    role_counts: dict[str, int] = {}
    last_order = (-1, -1)
    page_index_by_ref = {page.indirect_reference.idnum: index for index, page in enumerate(reader.pages)}
    for child_ref in children:
        child = resolved(child_ref)
        role = str(child.get("/S", ""))
        role_counts[role] = role_counts.get(role, 0) + 1
        page_ref = child.get("/Pg")
        page_index = page_index_by_ref.get(page_ref.idnum, -1) if page_ref else -1
        mcid = int(child.get("/K", -1))
        if (page_index, mcid) < last_order:
            issues.append(f"{artifact_id}: structure reading order is not monotonic")
            break
        last_order = (page_index, mcid)
        if role == "/Figure" and not str(child.get("/Alt", "")).strip():
            issues.append(f"{artifact_id}: Figure is missing alternative text")

    required_roles = {"/H1", "/H2", "/P", "/L", "/Table", "/Figure", "/Caption"}
    missing_roles = sorted(required_roles - set(role_counts))
    if missing_roles:
        issues.append(f"{artifact_id}: required structure roles missing {missing_roles}")

    for page_index, page in enumerate(reader.pages):
        if int(page.get("/StructParents", -1)) != page_index:
            issues.append(f"{artifact_id}: page {page_index + 1} StructParents mismatch")
        if page.get("/Tabs") != "/S":
            issues.append(f"{artifact_id}: page {page_index + 1} structure tab order missing")
        content = page.get_contents()
        payload = content.get_data() if content is not None else b""
        mcids = [int(value) for value in re.findall(rb"/MCID\s+(\d+)", payload)]
        if not mcids:
            issues.append(f"{artifact_id}: page {page_index + 1} has no marked content")
            continue
        if mcids != list(range(len(mcids))):
            issues.append(f"{artifact_id}: page {page_index + 1} MCIDs are not contiguous")
        if payload.count(b" BDC") + payload.count(b" BMC") != payload.count(b"EMC"):
            issues.append(f"{artifact_id}: page {page_index + 1} marked-content operators are unbalanced")
        parent_array = parent_map.get(page_index)
        if parent_array is None or len(parent_array) != len(mcids) or any(str(item) == "NullObject" for item in parent_array):
            issues.append(f"{artifact_id}: page {page_index + 1} ParentTree mapping incomplete")
    return issues, role_counts


def make_sheets(images: list[Path], output_dir: Path, stem: str) -> list[str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default()
    outputs = []
    for batch_index in range(0, len(images), 12):
        batch = images[batch_index:batch_index + 12]
        columns = 3
        thumb_w, thumb_h = 330, 466
        cell_w, cell_h = thumb_w + 24, thumb_h + 40
        rows = (len(batch) + columns - 1) // columns
        sheet = Image.new("RGB", (columns * cell_w + 24, rows * cell_h + 24), "#d8e0ea")
        draw = ImageDraw.Draw(sheet)
        for offset, source in enumerate(batch):
            with Image.open(source) as image:
                image = image.convert("RGB")
                image.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
                x = 24 + (offset % columns) * cell_w + (thumb_w - image.width) // 2
                y = 24 + (offset // columns) * cell_h + 22
                sheet.paste(image, (x, y))
                draw.text((x, y - 17), f"Halaman {batch_index + offset + 1}", font=font, fill="#162033")
        output = output_dir / f"{stem}-{batch_index // 12 + 1:02d}.jpg"
        sheet.save(output, quality=88, optimize=True)
        outputs.append(str(output))
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--pdf-dir", required=True, type=Path)
    parser.add_argument("--render-dir", required=True, type=Path)
    parser.add_argument("--sheet-dir", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if len(manifest) != 24:
        raise SystemExit(f"Expected 24 PDFs, received {len(manifest)}")
    report = {"pdfCount": len(manifest), "pageCount": 0, "issues": [], "files": {}}

    for artifact_id, expected in manifest.items():
        pdf_path = args.pdf_dir / expected["fileName"]
        reader = PdfReader(str(pdf_path))
        render_path = args.render_dir / pdf_path.stem
        images = sorted(render_path.glob("page-*.png"), key=lambda item: int(item.stem.split("-")[-1]))
        text_lengths = []
        edge_boxes = []
        if sha256(pdf_path) != expected["sha256"]:
            report["issues"].append(f"{artifact_id}: hash mismatch")
        if len(reader.pages) != expected["pageCount"] or len(images) != len(reader.pages):
            report["issues"].append(f"{artifact_id}: page/render count mismatch")
        metadata = reader.metadata or {}
        if metadata.get("/Title") is None or metadata.get("/Author") != "SMK Darussalam Subah":
            report["issues"].append(f"{artifact_id}: metadata incomplete")
        if reader.root_object.get("/Lang") != "id-ID":
            report["issues"].append(f"{artifact_id}: language metadata missing")
        accessibility_issues, role_counts = validate_tagged_accessibility(reader, artifact_id)
        report["issues"].extend(accessibility_issues)
        outline_count = flatten_outline(reader.outline)
        if outline_count < 1:
            report["issues"].append(f"{artifact_id}: bookmarks missing")

        for page_number, (page, image_path) in enumerate(zip(reader.pages, images), start=1):
            text = page.extract_text() or ""
            text_lengths.append(len(text.strip()))
            if len(text.strip()) < 35:
                report["issues"].append(f"{artifact_id}: page {page_number} has too little searchable text")
            for pattern in FORBIDDEN:
                if pattern.search(text):
                    report["issues"].append(f"{artifact_id}: page {page_number} contains forbidden text pattern")
            with Image.open(image_path) as image:
                gray = image.convert("L")
                stat = ImageStat.Stat(gray)
                if stat.stddev[0] < 3:
                    report["issues"].append(f"{artifact_id}: page {page_number} appears blank")
                inverse = gray.point(lambda value: 255 if value < 248 else 0)
                bbox = inverse.getbbox()
                if bbox is None:
                    report["issues"].append(f"{artifact_id}: page {page_number} has no rendered content")
                else:
                    edge_boxes.append(bbox)
                    if bbox[0] < 25 or bbox[1] < 25 or bbox[2] > image.width - 25 or bbox[3] > image.height - 12:
                        report["issues"].append(f"{artifact_id}: page {page_number} content approaches page edge {bbox}")

        sheets = make_sheets(images, args.sheet_dir, pdf_path.stem)
        report["files"][artifact_id] = {
            "fileName": expected["fileName"],
            "pages": len(reader.pages),
            "bookmarks": outline_count,
            "minTextChars": min(text_lengths),
            "maxTextChars": max(text_lengths),
            "contactSheets": sheets,
            "taggedAccessibility": "pass" if not accessibility_issues else "fail",
            "structureRoleCounts": role_counts,
        }
        report["pageCount"] += len(reader.pages)

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"pdfCount": report["pdfCount"], "pageCount": report["pageCount"], "issueCount": len(report["issues"])}))
    if report["issues"]:
        for issue in report["issues"][:30]:
            print(issue)
        raise SystemExit(1)
    for record in manifest.values():
        record["visualReview"] = "pass"
        record["accessibilityReview"] = "pass"
    temp_manifest = args.manifest.with_suffix(args.manifest.suffix + ".tmp")
    temp_manifest.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temp_manifest, args.manifest)


if __name__ == "__main__":
    main()
