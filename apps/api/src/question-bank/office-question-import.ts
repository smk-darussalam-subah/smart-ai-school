import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { assessmentOptionText, type AssessmentOption, type OptionPart } from '@smk/types';
import { strFromU8, unzipSync } from 'fflate';
import { SaxesParser } from 'saxes';
import { QuestionPayload, QuestionPayloadSchema } from '../assessment/assessment-contract';
import { validateQuestionMedia } from './question-media';

const MARKER = '<!--diis-question-html:v1-->';
const MAX_ARCHIVE_BYTES = 600 * 1024;
const MAX_UNCOMPRESSED = 8 * 1024 * 1024;
const MAX_ROWS = 100;
const mediaPattern = /^[a-z0-9_-][a-z0-9_.-]{0,100}\.(?:png|jpe?g|webp)$/i;

type Xml = { name: string; attributes: Record<string, string>; items: (Xml | string)[] };
export type OfficeAsset = ReturnType<typeof validateQuestionMedia>;
export interface OfficeRow {
  code: string;
  question: QuestionPayload;
  assets: Array<{ filename: string; alt: string; image: OfficeAsset; optionRef?: string }>;
}
type ErrorRow = { code: string; message: string };
export type OfficeResult = { rows: OfficeRow[]; errors: ErrorRow[] };
const fail = (message: string): never => { throw new BadRequestException(message); };
export const escapeOfficeXml = (value: string) => value.replace(/[<>&"']/g, (char) =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);
const local = (name: string) => name.split(':').at(-1)!;
const elements = (node: Xml, name?: string) => node.items.filter(
  (item): item is Xml => typeof item !== 'string' && (!name || local(item.name) === name));
function descendants(node: Xml, name: string): Xml[] {
  return elements(node).flatMap((child) => local(child.name) === name ? [child] : descendants(child, name));
}
function text(node?: Xml, tag = 't'): string {
  if (!node) return '';
  return descendants(node, tag).map((el) => el.items.filter((item) => typeof item === 'string').join('')).join('');
}
function xml(data: Uint8Array | undefined): Xml {
  if (!data) return fail('Bagian dokumen yang diperlukan tidak ditemukan.');
  const root: Xml = { name: '', attributes: {}, items: [] };
  const stack = [root];
  let count = 0;
  const parser = new SaxesParser();
  parser.on('doctype', () => fail('DTD tidak didukung dalam template soal.'));
  parser.on('error', () => fail('XML dokumen tidak valid.'));
  parser.on('opentag', (tag) => {
    if (++count > 50_000 || stack.length > 45) fail('Struktur XML terlalu besar.');
    const next: Xml = { name: tag.name, attributes: tag.attributes, items: [] };
    stack.at(-1)!.items.push(next);
    stack.push(next);
  });
  parser.on('text', (value) => stack.at(-1)!.items.push(value));
  parser.on('closetag', () => { stack.pop(); });
  parser.write(strFromU8(data)).close();
  return root;
}
function archive(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > MAX_ARCHIVE_BYTES) return fail('Ukuran dokumen maksimal 600 KB.');
  if ([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((byte, i) => bytes[i] === byte))
    return fail('Gunakan Simpan Sebagai untuk mengubah dokumen lama menjadi DOCX atau XLSX.');
  const names = new Set<string>();
  let total = 0;
  try {
    return unzipSync(bytes, { filter: ({ name, originalSize }) => {
      if (names.size >= 120 || names.has(name) || /(^\/|\\|(^|\/)\.\.(\/|$)|\.bin$|vbaProject|activeX)/i.test(name))
        fail('Paket memuat bagian aktif, duplikat, atau jalur yang tidak didukung.');
      names.add(name);
      total += originalSize;
      if (total > MAX_UNCOMPRESSED || originalSize > MAX_UNCOMPRESSED) fail('Isi paket terlalu besar.');
      return !name.endsWith('/');
    } });
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    return fail('Berkas Office atau ZIP tidak dapat dibaca.');
  }
}
function picture(bytes: Uint8Array | undefined, filename: string, alt: string) {
  if (!bytes || !mediaPattern.test(filename) || !alt.trim() || alt.trim().length > 180)
    return fail('Berkas gambar atau deskripsinya belum valid.');
  const mime = /\.png$/i.test(filename) ? 'image/png' : /\.webp$/i.test(filename) ? 'image/webp' : 'image/jpeg';
  return { filename, alt: alt.trim(), image: validateQuestionMedia(Buffer.from(bytes), mime) };
}
function latex(value: string): string {
  const safe = value.trim();
  if (!safe || safe.length > 480 || /\\(?:def|gdef|edef|xdef|let|futurelet|global|includegraphics|html[A-Za-z]*|url|href)\b/.test(safe))
    return fail('Rumus tidak didukung atau terlalu panjang.');
  return `<p><span data-diis-latex="${escapeOfficeXml(safe)}" data-diis-display="true">${escapeOfficeXml(safe)}</span></p>`;
}
function paragraph(value: string) {
  return `<p dir="auto">${escapeOfficeXml(value).replace(/\r?\n/g, '<br>')}</p>`;
}
function choice(base: object, type: string, answer: string, options: Array<Omit<AssessmentOption, 'id'> | undefined>, linked: string[][], rubric: string[][]) {
  if (type === 'PG') {
    const last = options.reduce((index, option, position) => option ? position : index, -1);
    const filled = options.slice(0, last + 1);
    if (filled.some((option) => !option)) fail('Isi pilihan berurutan mulai dari A tanpa melewati huruf.');
    return { ...base, type: 'multiple_choice', options: filled.map((option, index) =>
      ({ id: String.fromCharCode(97 + index), ...option })), answer: answer.toLowerCase() };
  }
  if (type === 'BS' && /^(benar|salah|true|false)$/i.test(answer))
    return { ...base, type: 'true_false', answer: /^(benar|true)$/i.test(answer) };
  if (type === 'PASANGAN') return { ...base, type: 'matching',
    pairs: linked.map(([id, prompt, match]) => ({ id, prompt, match })),
    answer: Object.fromEntries(linked.map(([id]) => [id, id])),
  };
  if (type === 'ESAI') return { ...base, type: 'essay', guideAnswer: answer || undefined,
    rubric: rubric.map(([id, name, maxScore, weight, description]) => ({ id, name,
      maxScore: Number(maxScore), weight: Number(weight?.replace(/%$/, '')), ...(description ? { description } : {}) })),
  };
  return fail('Jenis soal atau kunci belum sesuai template.');
}
type ParsedMedia = ReturnType<typeof picture>;

function appendOptionImage(assets: OfficeRow['assets'], asset: ParsedMedia): OptionPart {
  const bytes = createHash('sha256').update(asset.image.bytes).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString('hex');
  const optionRef = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  if (!assets.some((item) => item.optionRef === optionRef)) assets.push({ ...asset, optionRef });
  return { type: 'image', mediaId: optionRef, alt: asset.alt };
}

function assembleOption(parts: OptionPart[]): Omit<AssessmentOption, 'id'> | undefined {
  if (!parts.length) return undefined;
  const text = assessmentOptionText(parts);
  if (!text) return undefined;
  return parts.every((part) => part.type === 'text') ? { text } : { text: text.slice(0, 500), parts };
}

export const SHEET_OPTION_MARKER = 'DIIS-OPSI-V1:';

function sheetOption(value: string, embedded: ParsedMedia[], outer: Record<string, Uint8Array>, assets: OfficeRow['assets']) {
  const parts: OptionPart[] = [];
  if (value.startsWith(SHEET_OPTION_MARKER)) {
    const raw: unknown = JSON.parse(value.slice(SHEET_OPTION_MARKER.length));
    if (!Array.isArray(raw) || !raw.length || raw.length > 10) return fail('Isi opsi bergambar atau berumus belum valid.');
    for (const item of raw) {
      if (!item || typeof item !== 'object') return fail('Bagian opsi belum valid.');
      if (item.type === 'text' && typeof item.text === 'string') parts.push({ type: 'text', text: item.text });
      else if (item.type === 'formula' && typeof item.latex === 'string') parts.push({ type: 'formula', latex: item.latex });
      else if (item.type === 'image' && typeof item.file === 'string' && typeof item.alt === 'string')
        parts.push(appendOptionImage(assets, picture(outer[`media/${item.file}`], item.file, item.alt)));
      else return fail('Bagian opsi belum valid.');
    }
  } else if (/^Rumus LaTeX:/i.test(value)) {
    parts.push({ type: 'formula', latex: value.slice('Rumus LaTeX:'.length).trim() });
  } else if (value) parts.push({ type: 'text', text: value });
  return assembleOption([...parts, ...embedded.map((asset) => appendOptionImage(assets, asset))]);
}

function enrich(code: string, value: unknown, assets: OfficeRow['assets'], result: OfficeResult) {
  const parsed = QuestionPayloadSchema.safeParse(value);
  if (parsed.success) result.rows.push({ code, question: parsed.data, assets });
  else result.errors.push({ code, message: parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join(' ').slice(0, 320) });
}
function readSheet(sheet: Xml, shared: string[]) {
  const rows = descendants(sheet, 'row');
  if (rows.length > 500) return fail('Lembar melebihi batas baris template.');
  return rows.map((row, index) => {
    const values: string[] = [];
    for (const cell of elements(row, 'c')) {
      const col = /^([A-O])\d{1,4}$/.exec(cell.attributes.r ?? '')?.[1];
      if (!col) continue;
      const value = cell.attributes.t === 'inlineStr' ? text(cell) :
        cell.attributes.t === 's' ? shared[Number(text(cell, 'v'))] ?? '' : text(cell, 'v');
      values[col.charCodeAt(0) - 65] = cell.attributes.vm ? '\u0000media' :
        elements(cell, 'f').length ? '\u0000formula' : value.trim();
    }
    return { number: row.attributes.r ?? String(index + 1), values: Array.from(values, (value) => value ?? '') };
  });
}
function groupRows(
  rows: ReturnType<typeof readSheet>,
  sheet: 'Soal' | 'Pasangan' | 'Rubrik',
  result: OfficeResult,
) {
  const header = sheet === 'Soal' ? 'Kode' : 'Kode Soal';
  const index = rows.findIndex(({ values }) => values[0] === header);
  if (index < 0) return fail(`Header ${header} pada lembar ${sheet} belum sesuai template.`);
  const groups = new Map<string, string[][]>();
  for (const { number, values } of rows.slice(index + 1)) {
    const code = (values[0] ?? '').toUpperCase();
    if (!values.some(Boolean)) continue;
    // The distributed rubric template puts a label in D and its total formula in E.
    if (sheet === 'Rubrik' && !values.slice(0, 3).some(Boolean) &&
      /^Total bobot Q\d{3,5}$/i.test(values[3] ?? '') && values[4] === '\u0000formula' &&
      !values.slice(5).some(Boolean)) continue;
    const location = `${sheet} baris ${number}`;
    if (!/^Q\d{3,5}$/.test(code)) {
      result.errors.push({ code: location, message: 'Kode soal harus seperti Q001.' });
      continue;
    }
    const embeddedMedia = values.indexOf('\u0000media');
    if (embeddedMedia !== -1) {
      const column = String.fromCharCode(65 + embeddedMedia);
      result.errors.push({ code, message: `${location}, kolom ${column} memuat gambar atau data tertanam. Gunakan kolom Gambar dan folder media.` });
      continue;
    }
    if (values.some((value) => value.includes('\u0000'))) {
      result.errors.push({ code, message: `${location} berisi formula Excel. Gunakan nilai atau teks.` });
      continue;
    }
    const group = groups.get(code);
    if (group) group.push(values);
    else groups.set(code, [values]);
  }
  return groups;
}
function checkSheetDrawings(
  book: Record<string, Uint8Array>,
  sheetPath: string,
  sheet: Xml,
  rows: ReturnType<typeof readSheet>,
  result: OfficeResult,
) {
  const drawings = descendants(sheet, 'drawing');
  const assigned = new Map<string, Map<number, ParsedMedia[]>>();
  if (!drawings.length) return assigned;
  const header = rows.findIndex(({ values }) => values[0] === 'Kode');
  if (header < 0) return assigned;
  const codesByRow = new Map(rows.slice(header + 1).map(({ number, values }) => [number, values[0]?.toUpperCase()]));
  const relationshipPath = sheetPath.replace(/([^/]+)$/, '_rels/$1.rels');
  const links = descendants(xml(book[relationshipPath]), 'Relationship');
  for (const drawing of drawings) {
    const link = links.find(({ attributes }) => attributes.Id === drawing.attributes['r:id'])?.attributes;
    const target = link?.Target?.match(/^(?:\.\.\/|\/xl\/)drawings\/(drawing\d+\.xml)$/)?.[1];
    if (!target || link?.TargetMode === 'External')
      return fail('Gambar tertanam pada lembar Soal tidak dapat diperiksa. Gunakan kolom Gambar dan folder media.');
    const root = descendants(xml(book[`xl/drawings/${target}`]), 'wsDr')[0];
    if (!root) return fail('Posisi gambar pada lembar Soal tidak dapat diperiksa.');
    const relationFile = book[`xl/drawings/_rels/${target}.rels`];
    const imageLinks = relationFile ? descendants(xml(relationFile), 'Relationship') : [];
    for (const anchor of elements(root)) {
      if (!['oneCellAnchor', 'twoCellAnchor', 'absoluteAnchor'].includes(local(anchor.name))) continue;
      const from = elements(anchor, 'from')[0];
      const columnIndex = text(from, 'col').trim();
      const rowIndex = text(from, 'row').trim();
      const code = /^\d{1,6}$/.test(rowIndex) ? codesByRow.get(String(Number(rowIndex) + 1)) : undefined;
      if (!code || !/^Q\d{3,5}$/.test(code) || !/^\d{1,5}$/.test(columnIndex))
        return fail('Posisi gambar tertanam tidak dapat dikaitkan dengan satu soal. Gunakan kolom Gambar dan folder media.');
      const column = Number(columnIndex);
      const position = column >= 4 && column <= 8 ? ` pada opsi ${String.fromCharCode(61 + column)}` : '';
      const to = elements(anchor, 'to')[0];
      const blips = descendants(anchor, 'blip');
      const pictureNode = elements(anchor, 'pic')[0];
      const relationship = imageLinks.find(({ attributes }) => attributes.Id === blips[0]?.attributes['r:embed'])?.attributes;
      const filename = /^(?:\.\.\/|\/xl\/)media\/([^/]+)$/.exec(relationship?.Target ?? '')?.[1];
      const fitsCell = !to || (text(to, 'col').trim() === columnIndex && text(to, 'row').trim() === rowIndex);
      if (!position || !fitsCell || !pictureNode || blips.length !== 1 || relationship?.TargetMode === 'External' || !filename) {
        result.errors.push({ code, message: `Gambar atau objek tertanam${position} belum dapat dipetakan ke satu opsi. Gunakan template ZIP dan folder media.` });
        continue;
      }
      try {
        const attrs = descendants(pictureNode, 'cNvPr')[0]?.attributes;
        const asset = picture(book[`xl/media/${filename}`], filename, attrs?.descr || `Ilustrasi opsi ${String.fromCharCode(61 + column)}`);
        const options = assigned.get(code) ?? new Map<number, ParsedMedia[]>();
        options.set(column - 4, [...(options.get(column - 4) ?? []), asset]);
        assigned.set(code, options);
      } catch (error) {
        result.errors.push({ code, message: `Gambar${position}: ${error instanceof Error ? error.message : 'gambar tidak valid'}` });
      }
    }
  }
  return assigned;
}

function spreadsheet(book: Record<string, Uint8Array>, outer: Record<string, Uint8Array>, subject: string): OfficeResult {
  const result: OfficeResult = { rows: [], errors: [] };
  const sheets = descendants(xml(book['xl/workbook.xml']), 'sheet');
  const relationships = new Map(descendants(xml(book['xl/_rels/workbook.xml.rels']), 'Relationship')
    .map(({ attributes }) => [attributes.Id, attributes.Target]));
  const shared = book['xl/sharedStrings.xml']
    ? descendants(xml(book['xl/sharedStrings.xml']), 'si').map((node) => text(node)) : [];
  let embedded = new Map<string, Map<number, ParsedMedia[]>>();
  function groups(sheet: 'Soal' | 'Pasangan' | 'Rubrik') {
    const id = sheets.find(({ attributes }) => attributes.name === sheet)?.attributes['r:id'];
    const target = id && relationships.get(id);
    if (!target || !/^\/?(?:xl\/)?worksheets\/sheet\d+\.xml$/.test(target)) return fail(`Lembar ${sheet} tidak ditemukan.`);
    const sheetPath = target.replace(/^\/?(?:xl\/)?/, 'xl/');
    const tree = xml(book[sheetPath]);
    const rows = readSheet(tree, shared);
    if (sheet === 'Soal') embedded = checkSheetDrawings(book, sheetPath, tree, rows, result);
    return groupRows(rows, sheet, result);
  }
  const questions = groups('Soal');
  const pairs = groups('Pasangan');
  const criteria = groups('Rubrik');
  if ([...questions.values()].reduce((count, rows) => count + rows.length, 0) > MAX_ROWS)
    return fail('Gunakan maksimal 100 soal per file.');
  if (!questions.size && !result.errors.length) return fail('Isi setidaknya satu soal sesuai template.');
  for (const [sheet, linked] of [['Pasangan', pairs], ['Rubrik', criteria]] as const) {
    for (const code of linked.keys()) {
      if (!questions.has(code)) result.errors.push({ code, message: `Kode pada lembar ${sheet} tidak memiliki soal induk.` });
    }
  }
  const blockedCodes = new Set(result.errors.map(({ code }) => code));
  for (const [code, rows] of questions) {
    if (blockedCodes.has(code)) continue;
    const row = rows[0]!;
    try {
      if (rows.length > 1) fail('Kode soal tercantum lebih dari satu kali.');
      if (row[2] !== subject) fail('Mapel pada baris soal harus sesuai dengan mapel yang dipilih.');
      const assets = row[13] ? [picture(outer[`media/${row[13]}`], row[13], row[14] ?? '')] : [];
      const base = { subject, body: MARKER + paragraph(row[3] ?? '') + (row[12] ? latex(row[12]) : ''),
        difficulty: difficulty(row[10] ?? ''), tags: row[11] ? [row[11]] : [] };
      if (row[1] !== 'PG' && embedded.has(code)) fail('Gambar di kolom opsi hanya tersedia pada pilihan ganda.');
      const options = Array.from({ length: 5 }, (_, i) => {
        try { return sheetOption(row[4 + i] ?? '', embedded.get(code)?.get(i) ?? [], outer, assets); }
        catch (error) { return fail(`Opsi ${String.fromCharCode(65 + i)}: ${error instanceof Error ? error.message : 'format belum valid'}`); }
      });
      enrich(code, choice(base, row[1] ?? '', row[9] ?? '', options,
        (pairs.get(code) ?? []).map((item) => item.slice(1)),
        (criteria.get(code) ?? []).map((item) => item.slice(1))), assets, result);
    } catch (error) {
      result.errors.push({ code, message: error instanceof Error ? error.message : 'Soal belum sesuai template.' });
    }
  }
  return result;
}
function difficulty(value: string) {
  const match = value.toLowerCase();
  return /mudah|easy/.test(match) ? 'easy' : /sulit|hard/.test(match) ? 'hard' : 'medium';
}
function wordMath(node: Xml): string {
  const name = local(node.name);
  const value = (part: string) => elements(node, part).map(wordMath).join('');
  if (name === 'f') return `\\frac{${value('num')}}{${value('den')}}`;
  if (name === 'sSup') return `{${value('e')}}^{${value('sup')}}`;
  if (name === 'sSub') return `{${value('e')}}_{${value('sub')}}`;
  if (name === 'rad') return `\\sqrt{${value('e')}}`;
  if (name === 't') return node.items.filter((part) => typeof part === 'string').join('')
    .replaceAll('Δ', '\\Delta ').replaceAll('×', '\\times ').replaceAll('−', '-');
  if (['oMath', 'oMathPara', 'r', 'num', 'den', 'e', 'sup', 'sub'].includes(name))
    return elements(node).filter((child) => !local(child.name).endsWith('Pr')).map(wordMath).join('');
  return fail('Persamaan Word memuat struktur yang belum didukung.');
}
function wordPicture(node: Xml, files: Record<string, Uint8Array>, rels: Xml[], fallbackAlt: string) {
  const blip = descendants(node, 'blip')[0];
  const rel = rels.find((item) => item.attributes.Id === blip?.attributes['r:embed']);
  const target = rel?.attributes.Target ?? '';
  if (rel?.attributes.TargetMode === 'External' || !/^media\/[^/]+$/.test(target))
    return fail('Gunakan gambar yang disisipkan di dalam dokumen Word.');
  const attrs = descendants(node, 'docPr')[0]?.attributes;
  return picture(files[`word/${target}`], target.split('/')[1]!, attrs?.descr || attrs?.title || fallbackAlt);
}

function wordOptionParts(
  node: Xml, prefixLength: number, files: Record<string, Uint8Array>, rels: Xml[],
  assets: OfficeRow['assets'], option: string,
): OptionPart[] {
  const parts: OptionPart[] = [];
  let toSkip = prefixLength;
  function visit(part: Xml) {
    const name = local(part.name);
    if (name === 'oMath') {
      parts.push({ type: 'formula', latex: wordMath(part) });
      return;
    }
    if (name === 'drawing') {
      parts.push(appendOptionImage(assets, wordPicture(part, files, rels, `Ilustrasi opsi ${option}`)));
      return;
    }
    if (name === 't') {
      const value = part.items.filter((item) => typeof item === 'string').join('');
      const skipped = Math.min(value.length, toSkip);
      toSkip -= skipped;
      const text = value.slice(skipped);
      if (text) {
        const previous = parts.at(-1);
        if (previous?.type === 'text') previous.text += text;
        else parts.push({ type: 'text', text });
      }
      return;
    }
    if ((name === 'br' || name === 'tab') && toSkip === 0) {
      const previous = parts.at(-1);
      const text = name === 'br' ? '\n' : '\t';
      if (previous?.type === 'text') previous.text += text;
      else parts.push({ type: 'text', text });
      return;
    }
    for (const child of elements(part)) visit(child);
  }
  visit(node);
  return parts;
}

function word(files: Record<string, Uint8Array>, subject: string): OfficeResult {
  const result: OfficeResult = { rows: [], errors: [] };
  const body = descendants(xml(files['word/document.xml']), 'body')[0];
  if (!body) return fail('Dokumen tidak memuat isi soal.');
  const rels = files['word/_rels/document.xml.rels'] ? descendants(xml(files['word/_rels/document.xml.rels']), 'Relationship') : [];
  const blocks: { code: string; nodes: Xml[] }[] = [];
  for (const node of elements(body)) {
    const code = /^Soal\s+(Q\d{3,5})$/i.exec(text(node).trim())?.[1]?.toUpperCase();
    if (code) blocks.push({ code, nodes: [] });
    else blocks.at(-1)?.nodes.push(node);
  }
  const codes = new Set<string>();
  if (!blocks.length || blocks.length > MAX_ROWS) return fail('Gunakan judul Soal Q001 dan pertahankan struktur template.');
  for (const { code, nodes } of blocks) {
    try {
      if (codes.has(code)) fail('Kode soal berulang.');
      codes.add(code);
      const metadata = text(nodes[0]).toLowerCase();
      const type = metadata.startsWith('pilihan ganda') ? 'PG' : metadata.startsWith('benar salah') ? 'BS' :
        metadata.startsWith('menjodohkan') ? 'PASANGAN' : metadata.startsWith('esai') ? 'ESAI' : fail('Jenis soal tidak dikenali.');
      const fragments: string[] = [];
      const options: OptionPart[][] = [];
      let answer = '';
      let activeOption: string | undefined;
      let pairs: string[][] = [], rubric: string[][] = [];
      const assets: OfficeRow['assets'] = [];
      for (const node of nodes.slice(1)) {
        const raw = text(node);
        const value = raw.trim();
        const option = type === 'PG' ? /^\s*([A-E])[.)](?=\s|$)\s*/.exec(raw) : null;
        const isAnswer = /^(Kunci jawaban|Panduan jawaban)\b/i.test(value);
        if (isAnswer) activeOption = undefined;
        else if (option) activeOption = option[1];
        const equation = descendants(node, 'oMath');
        const drawings = descendants(node, 'drawing');
        const blips = descendants(node, 'blip');
        const hasUnsupportedObject = ['pict', 'object', 'AlternateContent'].some((name) => descendants(node, name).length);
        if (hasUnsupportedObject || drawings.length !== blips.length || drawings.length > 1) {
          fail(activeOption ? 'Opsi ' + activeOption + ' memuat objek Word yang belum didukung.'
            : 'Objek Word belum didukung. Gunakan gambar yang disisipkan sesuai template.');
        }
        if (local(node.name) === 'tbl') {
          if (activeOption) fail('Opsi ' + activeOption + ' tidak mendukung tabel.');
          const rows = descendants(node, 'tr').map((row) => elements(row, 'tc').map((cell) => text(cell).trim()));
          if (type === 'PASANGAN') pairs = rows.slice(1);
          else if (type === 'ESAI') rubric = rows.slice(1);
          continue;
        }
        if (local(node.name) !== 'p') continue;
        if (isAnswer) {
          if (equation.length || drawings.length) fail('Kunci jawaban harus merujuk ke huruf opsi.');
          answer = value.replace(/^(Kunci jawaban|Panduan jawaban)[:\s]*/i, '');
          continue;
        }
        if (activeOption) {
          const index = activeOption.charCodeAt(0) - 65;
          if (option && options[index] !== undefined) fail('Opsi ' + activeOption + ' tercantum lebih dari satu kali.');
          options[index] ??= [];
          try {
            if (value.startsWith('Rumus LaTeX:')) {
              options[index].push({ type: 'formula', latex: value.slice('Rumus LaTeX:'.length).trim() });
            } else if (option || equation.length || drawings.length || value) {
              options[index].push(...wordOptionParts(node, option?.[0].length ?? 0, files, rels, assets, activeOption));
            }
          } catch (error) {
            fail('Opsi ' + activeOption + ': ' + (error instanceof Error ? error.message : 'format belum valid'));
          }
          continue;
        }
        if (equation.length) { fragments.push(...equation.map((entry) => latex(wordMath(entry)))); continue; }
        if (blips.length) {
          assets.push(wordPicture(node, files, rels, 'Ilustrasi untuk soal ' + code));
          continue;
        }
        if (!value || /^(Total bobot rubrik|Poin setiap soal|Gambar \d)/i.test(value)) continue;
        if (value.startsWith('Rumus LaTeX:')) fragments.push(latex(value.slice('Rumus LaTeX:'.length)));
        else fragments.push(paragraph(value));
      }
      const assembled = Array.from(options, (parts) => parts ? assembleOption(parts) : undefined);
      if (options.some((parts, index) => parts && !assembled[index])) fail('Ada opsi tanpa isi jawaban.');
      enrich(code, choice({ subject, body: MARKER + fragments.join(''), tags: [], difficulty: difficulty(metadata) },
        type, answer, assembled, pairs, rubric), assets, result);
    } catch (error) {
      result.errors.push({ code, message: error instanceof Error ? error.message : 'Bagian soal belum dapat dibaca.' });
    }
  }
  return result;
}

export function previewOfficeQuestions(bytes: Buffer, subject: string): OfficeResult {
  const files = archive(bytes);
  if (files['word/document.xml']) return word(files, subject);
  if (files['xl/workbook.xml']) return spreadsheet(files, {}, subject);
  const workbooks = Object.keys(files).filter((name) => /^[^/]+\.xlsx$/i.test(name));
  if (workbooks.length !== 1) return fail('Pilih template XLSX, DOCX, atau ZIP berisi satu XLSX dan folder media.');
  return spreadsheet(archive(files[workbooks[0]!]!), files, subject);
}
