#!/usr/bin/env python3
"""Normalize PPTX ZIP metadata so identical slide content has identical bytes."""

from __future__ import annotations

import argparse
import html
import os
import re
import tempfile
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


FIXED_TIMESTAMP = (2026, 8, 30, 12, 0, 0)
FIXED_ISO_TIMESTAMP = "2026-08-30T12:00:00Z"
CREATION_ID_PATTERN = re.compile(
    rb'(<[^>]*creationId[^>]*\bid=")\{[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\}'
)
RELATIONSHIP_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships"
DECK_ALT_TEXTS = {
    "presentasi-yayasan-komite.pptx": {
        2: "Ilustrasi ekosistem sekolah Indonesia yang terhubung melalui DIIS dengan akses sesuai tanggung jawab.",
        5: "Tim pimpinan sekolah meninjau ringkasan kehadiran, kesiapan semester, Rapor, dan akuntabilitas pada layar bersama.",
        6: "Dasbor Eksekutif DIIS menampilkan ringkasan kondisi sekolah dan jalur menuju proses sumber dengan data sintetis.",
        7: "Halaman Penutupan Semester DIIS menampilkan readiness, blocker, dan riwayat snapshot dengan data sintetis.",
    },
    "presentasi-internal-sekolah.pptx": {
        2: "Ilustrasi ekosistem sekolah Indonesia yang terhubung melalui DIIS dengan akses sesuai tanggung jawab.",
        5: "Guru dan petugas sekolah bekerja pada jadwal, data, dan tugas digital yang saling terhubung sesuai tanggung jawabnya.",
        6: "Halaman Jadwal DIIS menampilkan kegiatan kelas berdasarkan hari, kelas, mata pelajaran, dan periode dengan data sintetis.",
        7: "Halaman Penugasan Guru DIIS menampilkan kelas dan mata pelajaran yang menjadi tanggung jawab guru dengan data sintetis.",
    },
    "presentasi-siswa.pptx": {
        2: "Ilustrasi ekosistem sekolah Indonesia yang terhubung melalui DIIS dengan akses sesuai tanggung jawab.",
        5: "Siswa menggunakan perangkat belajar untuk mengikuti modul, asesmen, remedial, dan hasil belajar secara terarah.",
        6: "Beranda Akademik siswa menampilkan kegiatan yang perlu dikerjakan pada tampilan seluler dengan data sintetis.",
        7: "Halaman Rapor siswa menampilkan snapshot semester resmi pada tampilan seluler dengan data sintetis.",
    },
    "presentasi-orang-tua-industri.pptx": {
        2: "Ilustrasi ekosistem sekolah Indonesia yang terhubung melalui DIIS dengan akses sesuai tanggung jawab.",
        5: "Orang tua dan mitra industri menerima informasi sekolah melalui jalur yang jelas, terbatas, dan menjaga privasi.",
        6: "Halaman Rapor orang tua menampilkan konteks anak terpilih pada tampilan seluler dengan data sintetis.",
        7: "Halaman kemitraan industri menampilkan keadaan layanan secara jujur dan mengarahkan koordinasi melalui sekolah.",
    },
}
SLIDE_PATH_PATTERN = re.compile(r"^ppt/slides/slide(\d+)\.xml$")


def normalized_info(source: ZipInfo) -> ZipInfo:
    target = ZipInfo(source.filename, FIXED_TIMESTAMP)
    target.compress_type = ZIP_DEFLATED
    target.comment = source.comment
    target.extra = b""
    target.create_system = source.create_system
    target.external_attr = source.external_attr
    target.internal_attr = source.internal_attr
    target.flag_bits = source.flag_bits
    return target


def owner_for_relationship(path: str) -> str | None:
    relationship = Path(path)
    if relationship.as_posix() == "_rels/.rels" or relationship.parent.name != "_rels":
        return None
    return (relationship.parent.parent / relationship.name.removesuffix(".rels")).as_posix()


def canonicalize_creation_ids(path: str, payload: bytes) -> bytes:
    counter = 0

    def replace(match: re.Match[bytes]) -> bytes:
        nonlocal counter
        counter += 1
        value = uuid.uuid5(uuid.NAMESPACE_URL, f"diis:{path}:creation:{counter}")
        return match.group(1) + ("{" + str(value).upper() + "}").encode("ascii")

    payload = CREATION_ID_PATTERN.sub(replace, payload)
    numeric_counter = 0

    def replace_numeric(match: re.Match[bytes]) -> bytes:
        nonlocal numeric_counter
        numeric_counter += 1
        digest = uuid.uuid5(uuid.NAMESPACE_URL, f"diis:{path}:numeric-creation:{numeric_counter}")
        value = 1 + (digest.int % 2_147_483_646)
        return match.group(1) + str(value).encode("ascii")

    return re.sub(rb'(<[^>]*creationId[^>]*\bval=")\d+', replace_numeric, payload)


def inject_picture_alt_text(deck_name: str, part_path: str, payload: bytes) -> bytes:
    slide_match = SLIDE_PATH_PATTERN.match(part_path)
    if not slide_match:
        return payload
    slide_number = int(slide_match.group(1))
    alt_text = DECK_ALT_TEXTS.get(deck_name, {}).get(slide_number)
    if not alt_text:
        return payload
    encoded_alt = html.escape(alt_text, quote=True).encode("utf-8")

    pattern = re.compile(rb"(<p:pic\b.*?<p:cNvPr\b)([^>]*)(/>)", re.DOTALL)

    def replace(match: re.Match[bytes]) -> bytes:
        attributes = re.sub(rb'\s+(?:name|title|descr)="[^"]*"', b"", match.group(2))
        metadata = b' name="Gambar informatif" title="Gambar informatif" descr="' + encoded_alt + b'"'
        return match.group(1) + attributes + metadata + match.group(3)

    payload, count = pattern.subn(replace, payload, count=1)
    if count != 1:
        raise ValueError(f"Expected one informative picture in {deck_name} {part_path}")
    return payload


def canonicalize_xml(deck_name: str, path: str, payload: bytes) -> bytes:
    if not (path.endswith(".xml") or path.endswith(".rels")):
        return payload
    payload = payload.lstrip(b"\xef\xbb\xbf")
    payload = canonicalize_creation_ids(path, payload)
    if path == "docProps/core.xml":
        payload = re.sub(
            rb'(<dcterms:(?:created|modified)[^>]*>)[^<]*(</dcterms:(?:created|modified)>)',
            lambda match: match.group(1) + FIXED_ISO_TIMESTAMP.encode("ascii") + match.group(2),
            payload,
        )
    if path == "ppt/presentation.xml":
        slide_counter = 255
        master_counter = 2147483647

        def replace_slide(match: re.Match[bytes]) -> bytes:
            nonlocal slide_counter
            slide_counter += 1
            return match.group(1) + str(slide_counter).encode("ascii")

        def replace_master(match: re.Match[bytes]) -> bytes:
            nonlocal master_counter
            master_counter += 1
            return match.group(1) + str(master_counter).encode("ascii")

        payload = re.sub(rb'(<p:sldId\s+id=")\d+', replace_slide, payload)
        payload = re.sub(rb'(<p:sldMasterId\s+id=")\d+', replace_master, payload)
    return inject_picture_alt_text(deck_name, path, payload)


def canonicalize_relationships(entries: dict[str, bytes]) -> None:
    for path in sorted(name for name in entries if name.endswith(".rels")):
        root = ET.fromstring(entries[path].lstrip(b"\xef\xbb\xbf"))
        relationships = list(root)
        relationships.sort(
            key=lambda item: (
                item.attrib.get("Type", ""),
                item.attrib.get("Target", ""),
                item.attrib.get("TargetMode", ""),
            )
        )
        owner = owner_for_relationship(path)
        owner_payload = entries.get(owner) if owner else None
        for child in list(root):
            root.remove(child)
        for index, relationship in enumerate(relationships, start=1):
            old_id = relationship.attrib.get("Id", "").encode("ascii")
            new_id = f"rId{index}".encode("ascii")
            relationship.set("Id", new_id.decode("ascii"))
            root.append(relationship)
            if owner_payload is not None:
                owner_payload = owner_payload.replace(old_id, new_id)
        ET.register_namespace("", RELATIONSHIP_NAMESPACE)
        entries[path] = ET.tostring(root, encoding="utf-8", xml_declaration=True)
        if owner and owner_payload is not None:
            entries[owner] = owner_payload


def normalize(path: Path) -> None:
    if path.suffix.lower() != ".pptx" or not path.is_file():
        raise ValueError(f"Expected a PPTX file: {path}")

    with ZipFile(path, "r") as source:
        source_entries = {entry.filename: entry for entry in source.infolist()}
        payloads = {entry.filename: source.read(entry.filename) for entry in source.infolist()}

    canonicalize_relationships(payloads)
    payloads = {name: canonicalize_xml(path.name, name, payload) for name, payload in payloads.items()}

    handle, temp_name = tempfile.mkstemp(prefix=f"{path.stem}-", suffix=".pptx", dir=path.parent)
    os.close(handle)
    temp_path = Path(temp_name)
    try:
        with ZipFile(temp_path, "w", compression=ZIP_DEFLATED, compresslevel=9) as target:
            for name in sorted(payloads):
                target.writestr(
                    normalized_info(source_entries[name]),
                    payloads[name],
                    compress_type=ZIP_DEFLATED,
                    compresslevel=9,
                )
        os.replace(temp_path, path)
    finally:
        temp_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args()
    for path in args.paths:
        normalize(path)


if __name__ == "__main__":
    main()
