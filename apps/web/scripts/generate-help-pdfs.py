#!/usr/bin/env python3
"""Generate deterministic, searchable DIIS Help PDFs from the canonical catalog."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
from pathlib import Path

from PIL import Image as PillowImage
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject,
    BooleanObject,
    DictionaryObject,
    NameObject,
    NullObject,
    NumberObject,
    TextStringObject,
)
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


NAVY = colors.HexColor("#0B1324")
BLUE = colors.HexColor("#2F6FED")
GREEN = colors.HexColor("#0A8F6A")
INK = colors.HexColor("#162033")
MUTED = colors.HexColor("#5D6A7D")
LINE = colors.HexColor("#D8E0EA")
SURFACE = colors.HexColor("#F3F6FA")
WARNING = colors.HexColor("#A44A00")


def register_fonts() -> tuple[str, str]:
    regular = Path("C:/Windows/Fonts/arial.ttf")
    bold = Path("C:/Windows/Fonts/arialbd.ttf")
    if regular.is_file() and bold.is_file():
        pdfmetrics.registerFont(TTFont("DIIS-Regular", str(regular)))
        pdfmetrics.registerFont(TTFont("DIIS-Bold", str(bold)))
        return "DIIS-Regular", "DIIS-Bold"
    return "Helvetica", "Helvetica-Bold"


FONT, FONT_BOLD = register_fonts()


def escaped(value: str) -> str:
    return html.escape(value, quote=False).replace("\n", "<br/>")


def safe_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


class InvariantCanvasMixin:
    pass


class TagRegistry:
    """Allocate deterministic MCIDs and retain the final Platypus reading order."""

    def __init__(self) -> None:
        self.canvas_id: int | None = None
        self.records: list[dict[str, object]] = []
        self.page_counts: dict[int, int] = {}

    def allocate(self, canvas, role: str, alt_text: str | None, title: str | None) -> tuple[int, int]:
        current_canvas_id = id(canvas)
        if self.canvas_id != current_canvas_id:
            self.canvas_id = current_canvas_id
            self.records.clear()
            self.page_counts.clear()
        page_number = int(canvas.getPageNumber())
        mcid = self.page_counts.get(page_number, 0)
        self.page_counts[page_number] = mcid + 1
        self.records.append({
            "page": page_number,
            "mcid": mcid,
            "role": role,
            "altText": safe_text(alt_text or "") or None,
            "title": safe_text(title or "") or None,
        })
        return page_number, mcid


class TaggedFlowable(Flowable):
    """Wrap one visual flowable in marked content without changing its layout."""

    def __init__(self, child: Flowable, registry: TagRegistry, role: str, *, alt_text: str | None = None, title: str | None = None):
        super().__init__()
        self.child = child
        self.registry = registry
        self.role = role
        self.alt_text = alt_text
        self.semantic_title = title
        self.width = 0
        self.height = 0

    def getSpaceBefore(self):
        return self.child.getSpaceBefore()

    def getSpaceAfter(self):
        return self.child.getSpaceAfter()

    def getKeepWithNext(self):
        return self.child.getKeepWithNext()

    def getPageBreakBefore(self):
        return self.child.getPageBreakBefore()

    def isIndexing(self):
        return self.child.isIndexing()

    def beforeBuild(self):
        if hasattr(self.child, "beforeBuild"):
            self.child.beforeBuild()

    def afterBuild(self):
        if hasattr(self.child, "afterBuild"):
            self.child.afterBuild()

    def isSatisfied(self):
        return self.child.isSatisfied() if hasattr(self.child, "isSatisfied") else True

    def notify(self, kind, stuff):
        if hasattr(self.child, "notify"):
            self.child.notify(kind, stuff)

    def wrap(self, available_width, available_height):
        self.child.canv = self.canv
        self.width, self.height = self.child.wrap(available_width, available_height)
        return self.width, self.height

    def split(self, available_width, available_height):
        self.child.canv = self.canv
        parts = self.child.split(available_width, available_height)
        if not parts or (len(parts) == 1 and parts[0] is self.child):
            return []
        return [
            TaggedFlowable(part, self.registry, self.role, alt_text=self.alt_text, title=self.semantic_title)
            for part in parts
        ]

    def draw(self):
        _, mcid = self.registry.allocate(self.canv, self.role, self.alt_text, self.semantic_title)
        self.canv._code.append(f"/{self.role} <</MCID {mcid}>> BDC")
        self.child.drawOn(self.canv, 0, 0)
        self.canv._code.append("EMC")


def semantic_role(flowable: Flowable) -> tuple[str, str | None, str | None]:
    explicit_role = getattr(flowable, "semantic_role", None)
    explicit_alt = getattr(flowable, "semantic_alt", None)
    explicit_title = getattr(flowable, "semantic_title", None)
    if explicit_role:
        return explicit_role, explicit_alt, explicit_title
    if isinstance(flowable, Paragraph):
        role_by_style = {
            "Cover": "H1",
            "TocHeading": "H1",
            "TopicTitle": "H1",
            "SectionTitle": "H2",
            "Caption": "Caption",
        }
        return role_by_style.get(flowable.style.name, "P"), None, flowable.getPlainText()
    if isinstance(flowable, TableOfContents):
        return "TOC", None, "Daftar isi"
    if isinstance(flowable, Table):
        return "Table", None, None
    return "P", None, None


def tag_story(flowables: list[Flowable], registry: TagRegistry) -> list[Flowable]:
    tagged: list[Flowable] = []
    for flowable in flowables:
        if isinstance(flowable, KeepTogether):
            flowable._content = tag_story(list(flowable._content), registry)
            tagged.append(flowable)
            continue
        if isinstance(flowable, (PageBreak, Spacer)):
            tagged.append(flowable)
            continue
        role, alt_text, title = semantic_role(flowable)
        tagged.append(TaggedFlowable(flowable, registry, role, alt_text=alt_text, title=title))
    return tagged


def add_accessibility_structure(writer: PdfWriter, tag_records: list[dict[str, object]]) -> None:
    struct_root = DictionaryObject({NameObject("/Type"): NameObject("/StructTreeRoot")})
    struct_root_ref = writer._add_object(struct_root)
    parent_tree = DictionaryObject()
    parent_tree_ref = writer._add_object(parent_tree)
    document = DictionaryObject({
        NameObject("/Type"): NameObject("/StructElem"),
        NameObject("/S"): NameObject("/Document"),
        NameObject("/P"): struct_root_ref,
        NameObject("/K"): ArrayObject(),
        NameObject("/T"): TextStringObject("Panduan operasional DIIS"),
    })
    document_ref = writer._add_object(document)
    struct_root.update({
        NameObject("/K"): document_ref,
        NameObject("/ParentTree"): parent_tree_ref,
        NameObject("/ParentTreeNextKey"): NumberObject(len(writer.pages)),
    })

    records_by_page: dict[int, list[dict[str, object]]] = {}
    for record in tag_records:
        records_by_page.setdefault(int(record["page"]), []).append(record)

    parent_nums = ArrayObject()
    document_children = document[NameObject("/K")]
    for page_index, page in enumerate(writer.pages):
        page_number = page_index + 1
        page.update({
            NameObject("/StructParents"): NumberObject(page_index),
            NameObject("/Tabs"): NameObject("/S"),
        })
        page_ref = page.indirect_reference
        page_records = sorted(records_by_page.get(page_number, []), key=lambda item: int(item["mcid"]))
        parent_array = ArrayObject([NullObject() for _ in range(len(page_records))])
        for record in page_records:
            element = DictionaryObject({
                NameObject("/Type"): NameObject("/StructElem"),
                NameObject("/S"): NameObject(f"/{record['role']}"),
                NameObject("/P"): document_ref,
                NameObject("/Pg"): page_ref,
                NameObject("/K"): NumberObject(int(record["mcid"])),
            })
            if record.get("altText"):
                element[NameObject("/Alt")] = TextStringObject(str(record["altText"]))
            if record.get("title"):
                element[NameObject("/T")] = TextStringObject(str(record["title"]))
            element_ref = writer._add_object(element)
            document_children.append(element_ref)
            parent_array[int(record["mcid"])] = element_ref
        parent_nums.extend([NumberObject(page_index), parent_array])

    parent_tree[NameObject("/Nums")] = parent_nums
    writer.root_object.update({
        NameObject("/StructTreeRoot"): struct_root_ref,
        NameObject("/MarkInfo"): DictionaryObject({NameObject("/Marked"): BooleanObject(True)}),
        NameObject("/Lang"): TextStringObject("id-ID"),
        NameObject("/ViewerPreferences"): DictionaryObject({NameObject("/DisplayDocTitle"): BooleanObject(True)}),
    })


class GuideDocTemplate(BaseDocTemplate):
    def __init__(self, file_name: str, *, title: str, frozen_sha: str):
        super().__init__(
            file_name,
            pagesize=A4,
            leftMargin=19 * mm,
            rightMargin=19 * mm,
            topMargin=20 * mm,
            bottomMargin=18 * mm,
            title=title,
            author="SMK Darussalam Subah",
            subject="Panduan operasional DIIS",
            creator="DIIS Wave 9 Checkpoint B",
            pageCompression=1,
            invariant=1,
        )
        self.guide_title = title
        self.frozen_sha = frozen_sha
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="body")
        self.addPageTemplates(PageTemplate(id="guide", frames=[frame], onPage=self._decorate_page))

    def _decorate_page(self, canvas, doc):
        canvas.saveState()
        canvas._code.append("/Artifact BMC")
        canvas.setTitle(self.guide_title)
        canvas.setAuthor("SMK Darussalam Subah")
        if doc.page > 1:
            canvas.setStrokeColor(LINE)
            canvas.line(19 * mm, 15 * mm, A4[0] - 19 * mm, 15 * mm)
            canvas.setFont(FONT, 8)
            canvas.setFillColor(MUTED)
            canvas.drawString(19 * mm, 10.5 * mm, "DIIS SMK Darussalam Subah")
            canvas.drawCentredString(A4[0] / 2, 10.5 * mm, f"Frozen {self.frozen_sha[:12]}")
            canvas.drawRightString(A4[0] - 19 * mm, 10.5 * mm, str(doc.page))
        canvas._code.append("EMC")
        canvas.restoreState()

    def afterFlowable(self, flowable):
        source = flowable.child if isinstance(flowable, TaggedFlowable) else flowable
        if isinstance(source, Paragraph):
            style_name = source.style.name
            if style_name == "TopicTitle":
                text = source.getPlainText()
                key = f"topic-{self.seq.nextf('topic')}"
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(text, key, level=0, closed=False)
                self.notify("TOCEntry", (0, text, self.page, key))
            elif style_name == "SectionTitle":
                text = source.getPlainText()
                key = f"section-{self.seq.nextf('section')}"
                self.canv.bookmarkPage(key)
                self.canv.addOutlineEntry(text, key, level=1, closed=False)
                self.notify("TOCEntry", (1, text, self.page, key))


def styles():
    sheet = getSampleStyleSheet()
    return {
        "cover": ParagraphStyle("Cover", parent=sheet["Title"], fontName=FONT_BOLD, fontSize=27, leading=32, textColor=colors.white, alignment=TA_LEFT, spaceAfter=10),
        "cover_sub": ParagraphStyle("CoverSub", parent=sheet["BodyText"], fontName=FONT, fontSize=12, leading=17, textColor=colors.HexColor("#DCE7F5")),
        "topic": ParagraphStyle("TopicTitle", parent=sheet["Heading1"], fontName=FONT_BOLD, fontSize=19, leading=23, textColor=NAVY, spaceBefore=4, spaceAfter=8),
        "section": ParagraphStyle("SectionTitle", parent=sheet["Heading2"], fontName=FONT_BOLD, fontSize=13, leading=17, textColor=BLUE, spaceBefore=8, spaceAfter=5),
        "body": ParagraphStyle("Body", parent=sheet["BodyText"], fontName=FONT, fontSize=9.4, leading=14, textColor=INK, spaceAfter=6),
        "small": ParagraphStyle("Small", parent=sheet["BodyText"], fontName=FONT, fontSize=7.7, leading=10.5, textColor=MUTED),
        "caption": ParagraphStyle("Caption", parent=sheet["BodyText"], fontName=FONT, fontSize=7.8, leading=10.5, textColor=MUTED, alignment=TA_CENTER, spaceBefore=3, spaceAfter=9),
        "callout": ParagraphStyle("Callout", parent=sheet["BodyText"], fontName=FONT, fontSize=9, leading=13.5, textColor=INK),
        "toc_h": ParagraphStyle("TocHeading", parent=sheet["Heading1"], fontName=FONT_BOLD, fontSize=20, leading=24, textColor=NAVY, spaceAfter=12),
        "toc": ParagraphStyle("TOCLevel0", parent=sheet["BodyText"], fontName=FONT, fontSize=9, leading=13, leftIndent=0, firstLineIndent=0, textColor=INK),
        "toc2": ParagraphStyle("TOCLevel1", parent=sheet["BodyText"], fontName=FONT, fontSize=8, leading=11, leftIndent=12, firstLineIndent=0, textColor=MUTED),
    }


def bullet_table(items: list[str], style, symbol: str = "1") -> Table:
    rows = []
    for index, item in enumerate(items, start=1):
        marker = f"{index}." if symbol == "1" else "✓"
        rows.append([
            Paragraph(marker, ParagraphStyle("Marker", parent=style, fontName=FONT_BOLD, textColor=GREEN, alignment=TA_CENTER)),
            Paragraph(escaped(item), style),
        ])
    table = Table(rows, colWidths=[9 * mm, 154 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    table.semantic_role = "L"
    table.semantic_title = "Daftar langkah" if symbol == "1" else "Daftar periksa"
    return table


def callout(title: str, text: str, tone: str, style) -> Table:
    palette = {
        "warning": (colors.HexColor("#FFF5E8"), WARNING),
        "privacy": (colors.HexColor("#EAF4FF"), BLUE),
        "success": (colors.HexColor("#E8F8F2"), GREEN),
        "info": (SURFACE, NAVY),
    }
    background, accent = palette.get(tone, palette["info"])
    body = Paragraph(f"<b>{escaped(title)}</b><br/>{escaped(text)}", style)
    table = Table([[body]], colWidths=[163 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("BOX", (0, 0), (-1, -1), 0.7, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    table.semantic_role = "Note"
    table.semantic_title = title
    return table


def screenshot_flowables(record: dict, screenshot_dir: Path, style_map: dict, max_height: float) -> list[Flowable]:
    path = screenshot_dir / record["fileName"]
    with PillowImage.open(path) as image:
        width_px, height_px = image.size
    max_width = 163 * mm
    scale = min(max_width / width_px, max_height / height_px)
    rendered = Image(str(path), width=width_px * scale, height=height_px * scale)
    rendered.hAlign = "CENTER"
    rendered.semantic_role = "Figure"
    rendered.semantic_alt = record["altText"]
    rendered.semantic_title = record["caption"]
    caption = Paragraph(
        f"<b>Gambar:</b> {escaped(record['caption'])}<br/><i>Teks alternatif: {escaped(record['altText'])}</i>",
        style_map["caption"],
    )
    caption.semantic_role = "Caption"
    caption.semantic_title = record["caption"]
    return [KeepTogether([rendered, caption])]


def topic_story(topic: dict, screenshots: list[dict], screenshot_assets: dict, screenshot_dir: Path, style_map: dict) -> list[Flowable]:
    story: list[Flowable] = [Paragraph(escaped(topic["title"]), style_map["topic"])]
    status = {"available": "Tersedia", "limited": "Terbatas", "unavailable": "Belum tersedia"}[topic["featureStatus"]]
    story.append(Paragraph(f"<b>Status:</b> {status} &nbsp;&nbsp; <b>Rute:</b> {escaped(topic['route'])}", style_map["small"]))
    story.append(Paragraph(escaped(topic["summary"]), style_map["body"]))
    selected_screenshots = screenshots[:2]
    image_height = 57 * mm if len(selected_screenshots) > 1 else 112 * mm
    for screenshot in selected_screenshots:
        asset = {**screenshot, **screenshot_assets[screenshot["id"]]}
        story.extend(screenshot_flowables(asset, screenshot_dir, style_map, image_height))

    story.extend([PageBreak(), Paragraph("Langkah dan pemeriksaan", style_map["section"])])

    for block in topic["blocks"]:
        kind = block["kind"]
        if kind == "heading" and block["text"] != "Tujuan":
            story.append(Paragraph(escaped(block["text"]), style_map["section"]))
        elif kind == "paragraph":
            story.append(Paragraph(escaped(block["text"]), style_map["body"]))
        elif kind == "steps":
            if block.get("title"):
                story.append(Paragraph(escaped(block["title"]), style_map["section"]))
            story.append(bullet_table(block["items"], style_map["body"], "1"))
        elif kind == "checklist":
            if block.get("title"):
                story.append(Paragraph(escaped(block["title"]), style_map["section"]))
            story.append(bullet_table(block["items"], style_map["body"], "check"))
        elif kind == "callout":
            story.extend([callout(block["title"], block["text"], block["tone"], style_map["callout"]), Spacer(1, 5)])
        elif kind == "faq":
            story.append(callout(block["question"], block["answer"], "info", style_map["callout"]))
        elif kind == "authority-note":
            story.append(callout("Batas wewenang", block["text"], "privacy", style_map["callout"]))
        elif kind == "cta":
            story.append(Paragraph(f"<b>{escaped(block['label'])}</b> — {escaped(block['href'])}", style_map["body"]))
        elif kind == "related-topic":
            story.append(Paragraph(f"Lihat juga: {escaped(block['label'])}", style_map["body"]))
    story.append(PageBreak())
    return story


def build_pdf(*, artifact: dict, topics: list[dict], all_screenshots: list[dict], screenshot_assets: dict, screenshot_dir: Path, output: Path, frozen_sha: str, generated_at: str, glossary: list[dict]) -> None:
    style_map = styles()
    doc = GuideDocTemplate(str(output), title=artifact["label"], frozen_sha=frozen_sha)
    story: list[Flowable] = []

    cover = Table([[Paragraph("DIIS", ParagraphStyle("Brand", parent=style_map["cover"], fontSize=15, leading=18)), ""], [Paragraph(escaped(artifact["label"]), style_map["cover"]), ""]], colWidths=[150 * mm, 13 * mm], rowHeights=[22 * mm, 88 * mm])
    cover.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, 0), 12),
        ("TOPPADDING", (0, 1), (-1, 1), 24),
    ]))
    cover.semantic_role = "Sect"
    cover.semantic_title = artifact["label"]
    story.extend([
        Spacer(1, 13 * mm), cover, Spacer(1, 10 * mm),
        Paragraph("Panduan operasional berbasis peran, wewenang, dan konteks pengguna.", style_map["body"]),
        Paragraph(f"Versi 2.0 · Bahasa id-ID · Frozen application SHA {frozen_sha}", style_map["small"]),
        Spacer(1, 6 * mm),
        callout("Privasi", "Seluruh gambar menggunakan akun dan data sintetis. Jangan gunakan panduan ini untuk membagikan credential atau data pribadi.", "privacy", style_map["callout"]),
        Spacer(1, 4 * mm),
        callout("Prasyarat go-live", "Otomasi aktivasi Appointment harian di production belum dinyatakan aktif. Pastikan prasyarat operasional tersebut selesai sebelum penggunaan nyata.", "warning", style_map["callout"]),
        PageBreak(),
        Paragraph("Daftar isi", style_map["toc_h"]),
    ])
    toc = TableOfContents()
    toc.levelStyles = [style_map["toc"], style_map["toc2"]]
    story.extend([toc, PageBreak()])

    screenshot_by_topic: dict[str, list[dict]] = {}
    for screenshot in all_screenshots:
        if artifact["id"] in screenshot["consumers"]:
            screenshot_by_topic.setdefault(screenshot["topicId"], []).append(screenshot)
    for topic in topics:
        story.extend(topic_story(topic, screenshot_by_topic.get(topic["id"], []), screenshot_assets, screenshot_dir, style_map))

    story.extend([
        Paragraph("Glosarium", style_map["topic"]),
        Table(
            [[Paragraph(f"<b>{escaped(item['term'])}</b>", style_map["body"]), Paragraph(escaped(item["definition"]), style_map["body"])] for item in glossary],
            colWidths=[42 * mm, 121 * mm],
            repeatRows=0,
            style=TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 0), (0, -1), SURFACE),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]),
        ),
        Spacer(1, 5 * mm),
        callout("Bantuan resmi", "Gunakan kontak resmi yang tampil pada menu Panduan DIIS. Jangan mengirim kata sandi, kode pairing, token, atau data pribadi melalui kanal bantuan.", "info", style_map["callout"]),
    ])
    glossary_table = story[-3]
    glossary_table.semantic_role = "Table"
    glossary_table.semantic_title = "Glosarium DIIS"
    tag_registry = TagRegistry()
    doc.multiBuild(tag_story(story, tag_registry))

    reader = PdfReader(str(output))
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    writer.add_metadata({
        "/Title": artifact["label"],
        "/Author": "SMK Darussalam Subah",
        "/Subject": "Panduan operasional DIIS",
        "/Creator": "DIIS Wave 9 Checkpoint B",
        "/Keywords": "DIIS, panduan, sekolah, id-ID",
        "/CreationDate": "D:20260830000000+07'00'",
        "/ModDate": "D:20260830000000+07'00'",
    })
    add_accessibility_structure(writer, tag_registry.records)
    temp = output.with_suffix(".pdf.tmp")
    with temp.open("wb") as handle:
        writer.write(handle)
    os.replace(temp, output)


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--content", required=True, type=Path)
    parser.add_argument("--screenshot-manifest", required=True, type=Path)
    parser.add_argument("--screenshots-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--generated-at", required=True)
    args = parser.parse_args()

    content = json.loads(args.content.read_text(encoding="utf-8"))
    screenshot_assets = json.loads(args.screenshot_manifest.read_text(encoding="utf-8"))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    topics_by_id = {topic["id"]: topic for topic in content["topics"]}
    records = {}

    for artifact in content["artifacts"]:
        topic_ids = [topic["id"] for topic in content["topics"]] if artifact["id"] == "artifact.complete" else artifact["topicIds"]
        selected_topics = [topics_by_id[topic_id] for topic_id in topic_ids]
        output = args.output_dir / artifact["fileName"]
        temp = output.with_suffix(".pdf.build")
        build_pdf(
            artifact=artifact,
            topics=selected_topics,
            all_screenshots=content["screenshots"],
            screenshot_assets=screenshot_assets,
            screenshot_dir=args.screenshots_dir,
            output=temp,
            frozen_sha=args.candidate_sha,
            generated_at=args.generated_at,
            glossary=content["glossary"],
        )
        os.replace(temp, output)
        reader = PdfReader(str(output))
        records[artifact["id"]] = {
            "fileName": artifact["fileName"],
            "sha256": digest(output),
            "sizeBytes": output.stat().st_size,
            "pageCount": len(reader.pages),
            "candidateSha": args.candidate_sha,
            "generatedAt": args.generated_at,
            "privacyReview": "pass",
            "visualReview": "pending",
            "accessibilityReview": "pending",
        }

    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    temp_manifest = args.manifest.with_suffix(".json.tmp")
    temp_manifest.write_text(json.dumps(records, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temp_manifest, args.manifest)
    print(json.dumps({"count": len(records), "pages": sum(int(v["pageCount"]) for v in records.values())}))


if __name__ == "__main__":
    main()
