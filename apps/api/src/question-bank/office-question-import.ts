import { BadRequestException } from '@nestjs/common';
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
  assets: Array<{ filename: string; alt: string; image: OfficeAsset }>;
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
function choice(base: object, type: string, answer: string, options: string[], linked: string[][], rubric: string[][]) {
  if (type === 'PG') return { ...base, type: 'multiple_choice', options: options.map((option, index) =>
    ({ id: String.fromCharCode(97 + index), text: option })).filter((item) => item.text), answer: answer.toLowerCase() };
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
function enrich(code: string, value: unknown, assets: OfficeRow['assets'], result: OfficeResult) {
  const parsed = QuestionPayloadSchema.safeParse(value);
  if (parsed.success) result.rows.push({ code, question: parsed.data, assets });
  else result.errors.push({ code, message: parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join(' ').slice(0, 320) });
}
function readSheet(archiveFiles: Record<string, Uint8Array>, xmlPath: string, shared: string[]) {
  const rows = descendants(xml(archiveFiles[xmlPath]), 'row');
  if (rows.length > 500) return fail('Lembar melebihi batas baris template.');
  return rows.map((row, index) => {
    const values: string[] = [];
    for (const cell of elements(row, 'c')) {
      const col = /^([A-O])\d{1,4}$/.exec(cell.attributes.r ?? '')?.[1];
      if (!col) continue;
      const value = cell.attributes.t === 'inlineStr' ? text(cell) :
        cell.attributes.t === 's' ? shared[Number(text(cell, 'v'))] ?? '' : text(cell, 'v');
      values[col.charCodeAt(0) - 65] = elements(cell, 'f').length ? '\u0000formula' : value.trim();
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
function spreadsheet(book: Record<string, Uint8Array>, outer: Record<string, Uint8Array>, subject: string): OfficeResult {
  const result: OfficeResult = { rows: [], errors: [] };
  const sheets = descendants(xml(book['xl/workbook.xml']), 'sheet');
  const relationships = new Map(descendants(xml(book['xl/_rels/workbook.xml.rels']), 'Relationship')
    .map(({ attributes }) => [attributes.Id, attributes.Target]));
  const shared = book['xl/sharedStrings.xml']
    ? descendants(xml(book['xl/sharedStrings.xml']), 'si').map((node) => text(node)) : [];
  function groups(sheet: 'Soal' | 'Pasangan' | 'Rubrik') {
    const id = sheets.find(({ attributes }) => attributes.name === sheet)?.attributes['r:id'];
    const target = id && relationships.get(id);
    if (!target || !/^\/?(?:xl\/)?worksheets\/sheet\d+\.xml$/.test(target)) return fail(`Lembar ${sheet} tidak ditemukan.`);
    return groupRows(readSheet(book, target.replace(/^\/?(?:xl\/)?/, 'xl/'), shared), sheet, result);
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
  for (const [code, rows] of questions) {
    const row = rows[0]!;
    try {
      if (rows.length > 1) fail('Kode soal tercantum lebih dari satu kali.');
      if (row[2] !== subject) fail('Mapel pada baris soal harus sesuai dengan mapel yang dipilih.');
      const assets = row[13] ? [picture(outer[`media/${row[13]}`], row[13], row[14] ?? '')] : [];
      const base = { subject, body: MARKER + paragraph(row[3] ?? '') + (row[12] ? latex(row[12]) : ''),
        difficulty: difficulty(row[10] ?? ''), tags: row[11] ? [row[11]] : [] };
      enrich(code, choice(base, row[1] ?? '', row[9] ?? '', row.slice(4, 9),
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
      const options: string[] = [];
      let answer = '';
      let pairs: string[][] = [], rubric: string[][] = [];
      const assets: OfficeRow['assets'] = [];
      for (const node of nodes.slice(1)) {
        if (local(node.name) === 'tbl') {
          const rows = descendants(node, 'tr').map((row) => elements(row, 'tc').map((cell) => text(cell).trim()));
          if (type === 'PASANGAN') pairs = rows.slice(1);
          else if (type === 'ESAI') rubric = rows.slice(1);
          continue;
        }
        if (local(node.name) !== 'p') continue;
        const equation = descendants(node, 'oMath');
        if (equation.length) { fragments.push(...equation.map((entry) => latex(wordMath(entry)))); continue; }
        const blip = descendants(node, 'blip')[0];
        if (blip) {
          const rel = rels.find((item) => item.attributes.Id === blip.attributes['r:embed']);
          const target = rel?.attributes.Target ?? '';
          if (rel?.attributes.TargetMode === 'External' || !/^media\/[^/]+$/.test(target))
            fail('Gunakan gambar yang disisipkan di dalam dokumen Word.');
          const attrs = descendants(node, 'docPr')[0]?.attributes;
          assets.push(picture(files[`word/${target}`], target.split('/')[1]!, attrs?.descr || attrs?.title || `Ilustrasi untuk soal ${code}`));
          continue;
        }
        const value = text(node).trim();
        if (!value || /^(Total bobot rubrik|Poin setiap soal|Gambar \d)/i.test(value)) continue;
        if (value.startsWith('Rumus LaTeX:')) {
          fragments.push(latex(value.slice('Rumus LaTeX:'.length)));
          continue;
        }
        const option = /^([A-E])\.\s+(.+)$/.exec(value);
        if (option && type === 'PG') options[option[1]!.charCodeAt(0) - 65] = option[2]!;
        else if (/^(Kunci jawaban|Panduan jawaban)\b/i.test(value)) answer = value.replace(/^(Kunci jawaban|Panduan jawaban)[:\s]*/i, '');
        else fragments.push(paragraph(value));
      }
      enrich(code, choice({ subject, body: MARKER + fragments.join(''), tags: [], difficulty: difficulty(metadata) },
        type, answer, Array.from(options, (option) => option ?? ''), pairs, rubric), assets, result);
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
