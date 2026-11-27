import { BadRequestException } from '@nestjs/common';
import { strToU8, zipSync } from 'fflate';
import { Prisma } from '@prisma/client';
import { escapeOfficeXml as esc, SHEET_OPTION_MARKER } from './office-question-import';
import type { AssessmentOption } from '@smk/types';
import { listQuestionMediaIds } from './question-media';

type Question = {
  body: string; type: string; subject: string; options: Prisma.JsonValue;
  answer: string | null; difficulty: string; tags: string[]; rubric: Prisma.JsonValue;
};
type Image = { id: string; bytes: Uint8Array; contentType: string; width: number; height: number };
type OfficeQuestion = {
  code: string; subject: string; type: string; kind: string; body: string; formula: string[];
  options: AssessmentOption[]; pairs: Array<{ id: string; prompt: string; match: string }>;
  rubric: Array<{ id: string; name: string; maxScore: number; weight: number; description?: string }>;
  answer: string; difficulty: string; tags: string[]; media: { id: string; alt: string }[];
};
const PKG = 'http://schemas.openxmlformats.org/package/2006';
const DOC = 'http://schemas.openxmlformats.org/officeDocument/2006';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MARKER = '<!--diis-question-html:v1-->';
const decode = (text: string) => text.replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/g,
  (match) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&nbsp;': ' ' })[match]!);

function items<T>(value: Prisma.JsonValue): T[] {
  return Array.isArray(value) ? value as T[] : [];
}
function readBody(value: string) {
  if (!value.startsWith(MARKER)) return { body: value, formula: [], media: [] };
  const formula = [...value.matchAll(/<span\b[^>]*data-diis-latex="([^"]+)"[^>]*>[\s\S]*?<\/span>/gi)];
  const imgs = [...value.matchAll(/<img\b[^>]*data-diis-media="([^"]+)"[^>]*>/gi)];
  const ids = listQuestionMediaIds(value);
  const media = imgs.filter((match) => ids.includes(match[1]!.toLowerCase()))
    .map((match) => ({ id: match[1]!.toLowerCase(), alt: decode(/\balt="([^"]*)"/i.exec(match[0])?.[1] ?? 'Ilustrasi soal') }));
  const plain = value.slice(MARKER.length)
    .replace(/<span\b[^>]*data-diis-latex="[^"]+"[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<br\s*\/?>|<\/(?:p|li|h\d|tr)>/gi, '\n').replace(/<[^>]*>/g, '').trim();
  return { body: decode(plain), formula: formula.map((match) => decode(match[1]!)), media };
}
const types: Record<string, [string, string]> = { multiple_choice: ['PG', 'Pilihan ganda'],
  true_false: ['BS', 'Benar salah'], essay: ['ESAI', 'Esai'], matching: ['PASANGAN', 'Menjodohkan'] };
function flatten(questions: Question[]): OfficeQuestion[] {
  return questions.map((question, index) => {
    const [type, kind] = types[question.type] ?? ['ESAI', 'Esai'];
    const raw = question.answer ?? '';
    const answers = type === 'PASANGAN' ? JSON.parse(raw || '{}') as Record<string, string> : {};
    const pairs = items<OfficeQuestion['pairs'][number]>(question.options);
    const options = type === 'PG' ? items<OfficeQuestion['options'][number]>(question.options) : [];
    const answerIndex = options.findIndex(({ id }) => id === raw);
    if (type === 'PG' && (answerIndex < 0 || options.length > 5)) {
      throw new BadRequestException('Pilihan ganda perlu 2–5 pilihan dan satu kunci yang valid.');
    }
    return {
      ...readBody(question.body), code: `Q${String(index + 1).padStart(3, '0')}`,
      subject: question.subject, type, kind, options,
      pairs: type === 'PASANGAN' ? pairs.map((pair) => ({
        ...pair, match: pairs.find(({ id }) => id === answers[pair.id])?.match ?? pair.match,
      })) : [],
      rubric: items(question.rubric), answer: type === 'BS' ? raw === 'true' ? 'Benar' : 'Salah' :
        type === 'PG' ? String.fromCharCode(65 + answerIndex) : raw,
      difficulty: ({ easy: 'Mudah', medium: 'Sedang', hard: 'Sulit' })[question.difficulty] ?? 'Sedang',
      tags: question.tags,
    };
  });
}
function zipText(parts: Record<string, string | Uint8Array>) {
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(parts).map(([name, data]) =>
    [name, typeof data === 'string' ? strToU8(data) : data])), { level: 4 }));
}
function roles(parts: string) {
  return `${XML}<Relationships xmlns="${PKG}/relationships">${parts}</Relationships>`;
}
function relation(id: string, type: string, target: string) {
  return `<Relationship Id="${id}" Type="${DOC}/relationships/${type}" Target="${target}"/>`;
}
function contentTypes(parts: string) {
  return `${XML}<Types xmlns="${PKG}/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${parts}</Types>`;
}
const imageName = (image: Image) => `${image.id}.${image.contentType.endsWith('jpeg') ? 'jpg' : image.contentType.split('/')[1]}`;
function xlsx(questions: OfficeQuestion[], images: Image[]) {
  if (questions.some(({ formula, media }) => formula.length > 1 || media.length > 1))
    throw new BadRequestException('Pilih ekspor Word untuk soal dengan lebih dari satu rumus atau gambar.');
  const media = new Map(images.map((image) => [image.id, imageName(image)]));
  const data = [
    ['Soal', [['Kode', 'Jenis', 'Mapel', 'Isi Soal', 'Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D', 'Pilihan E', 'Kunci atau Panduan', 'Tingkat', 'Tujuan Pembelajaran', 'Rumus LaTeX', 'Gambar', 'Deskripsi Gambar'],
      ...questions.map((q) => [q.code, q.type, q.subject, q.body,
        ...Array.from({ length: 5 }, (_, i) => {
          const option = q.options[i];
          return option?.parts?.length ? SHEET_OPTION_MARKER + JSON.stringify(option.parts.map((part) =>
            part.type === 'image' ? { type: 'image', file: media.get(part.mediaId)!, alt: part.alt } : part,
          )) : option?.text ?? '';
        }),
        q.answer, q.difficulty, q.tags.join(', '), q.formula[0] ?? '', q.media[0] ? media.get(q.media[0].id) ?? '' : '', q.media[0]?.alt ?? '']),
    ]],
    ['Pasangan', [['Kode Soal', 'ID Pasangan', 'Kolom Kiri', 'Jawaban Kolom Kanan'], ...questions.flatMap((q) =>
      q.pairs.map(({ id, prompt, match }) => [q.code, id, prompt, match]))]],
    ['Rubrik', [['Kode Soal', 'ID Kriteria', 'Kriteria', 'Skor Maksimum', 'Bobot persen', 'Deskripsi'], ...questions.flatMap((q) =>
      q.rubric.map((item) => [q.code, item.id, item.name, String(item.maxScore), String(item.weight), item.description ?? '']))]],
    ['Petunjuk', [['Paket Bank Soal DIIS'], ['Kunci dan rubrik hanya untuk Guru.']]],
  ] satisfies Array<[string, string[][]]>;
  const sheets = data.map(([name], i) => `<sheet name="${name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const parts: Record<string, string> = {
    '[Content_Types].xml': contentTypes('<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      data.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')),
    '_rels/.rels': roles(relation('rId1', 'officeDocument', 'xl/workbook.xml')),
    'xl/workbook.xml': `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${DOC}/relationships"><sheets>${sheets}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': roles(data.map((_, i) => relation(`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`)).join('')),
  };
  for (const [index, [, rows]] of data.entries()) {
    const xml = rows.map((row, i) => `<row r="${i + 1}">${row.map((cell, j) =>
      `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${esc(cell)}</t></is></c>`).join('')}</row>`).join('');
    parts[`xl/worksheets/sheet${index + 1}.xml`] = `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xml}</sheetData></worksheet>`;
  }
  const workbook = zipText(parts);
  return images.length
    ? { bytes: zipText({ 'Soal-DIIS.xlsx': workbook, ...Object.fromEntries(images.map((image) => [`media/${imageName(image)}`, image.bytes])) }),
        extension: 'zip', mime: 'application/zip' }
    : { bytes: workbook, extension: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

function docx(questions: OfficeQuestion[], images: Image[], student: boolean) {
  const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const p = (value: string) => `<w:p><w:r><w:t xml:space="preserve">${esc(value)}</w:t></w:r></w:p>`;
  const table = (rows: string[][]) => `<w:tbl>${rows.map((row) => `<w:tr>${row.map((cell) => `<w:tc>${p(cell)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
  const lookup = new Map(images.map((image, index) => [image.id, { ...image, ref: `rId${index + 1}` }]));
  let imageCounter = 0;
  const picture = ({ id, alt }: { id: string; alt: string }) => {
    const img = lookup.get(id);
    if (!img) return p(alt);
    const width = Math.min(img.width, 480) * 9525;
    const height = Math.round(width * img.height / img.width);
    const name = esc(alt);
    return `<w:p><w:r><w:drawing><wp:inline><wp:extent cx="${width}" cy="${height}"/><wp:docPr id="${++imageCounter}" name="Ilustrasi ${imageCounter}" descr="${name}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${img.ref}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  };
  const body = questions.map((q) => [
    p(`Soal ${q.code}`), p(`${q.kind} · Tingkat ${q.difficulty.toLowerCase()}`),
    ...q.body.split('\n').map(p), ...q.formula.map((formula) => p(`Rumus LaTeX: ${formula}`)),
    ...q.media.map(picture),
    ...q.options.flatMap((item, i) => {
      const label = String.fromCharCode(65 + i) + '. ';
      return item.parts?.length ? [p(label), ...item.parts.map((part) => part.type === 'text' ? p(part.text)
        : part.type === 'formula' ? p('Rumus LaTeX: ' + part.latex) : picture({ id: part.mediaId, alt: part.alt }))]
        : [p(label + item.text)];
    }),
    ...(q.type === 'BS' && student ? [p('Pilih Benar atau Salah.')] : []),
    ...(q.type === 'PASANGAN' ? student
      ? [p('Pasangkan setiap pertanyaan dengan salah satu pilihan.'),
        ...q.pairs.map(({ prompt }, index) => p(`${index + 1}. ${prompt}`)),
        ...q.pairs.map(({ match }) => match).sort((a, b) => a.localeCompare(b, 'id'))
          .map((match, index) => p(`${String.fromCharCode(65 + index)}. ${match}`))]
      : [table([['ID pasangan', 'Kolom kiri', 'Pasangan benar'], ...q.pairs.map(({ id, prompt, match }) => [id, prompt, match])])] : []),
    ...(!student && q.type !== 'PASANGAN' && q.answer ? [p(`${q.type === 'ESAI' ? 'Panduan' : 'Kunci'} jawaban  ${q.answer}`)] : []),
    ...(!student && q.rubric.length ? [table([['ID', 'Kriteria', 'Skor maks', 'Bobot', 'Deskripsi'],
      ...q.rubric.map(({ id, name, maxScore, weight, description }) => [id, name, String(maxScore), String(weight), description ?? ''])])] : []),
  ].join('')).join('');
  const bytes = zipText({
    '[Content_Types].xml': contentTypes('<Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'),
    '_rels/.rels': roles(relation('rId1', 'officeDocument', 'word/document.xml')),
    'word/document.xml': `${XML}<w:document xmlns:w="${w}" xmlns:r="${DOC}/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${p(student ? 'Naskah soal' : 'Paket Guru DIIS')}${body}<w:sectPr/></w:body></w:document>`,
    'word/_rels/document.xml.rels': roles([...lookup.values()].map((img) => relation(img.ref, 'image', `media/${imageName(img)}`)).join('')),
    ...Object.fromEntries(images.map((img) => [`word/media/${imageName(img)}`, img.bytes])),
  });
  return { bytes, extension: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
}

export type QuestionExportFormat = 'xlsx' | 'docx' | 'student-docx' | 'student-print';

function studentPrint(questions: OfficeQuestion[], images: Image[]) {
  const lookup = new Map(images.map((image) => [image.id, image]));
  const list = (values: string[], type = '1') => values.length
    ? '<ol type="' + type + '">' + values.map((value) => '<li dir="auto">' + esc(value) + '</li>').join('') + '</ol>'
    : '';
  const renderImage = (id: string, alt: string) => {
    const image = lookup.get(id)!;
    const source = 'data:' + esc(image.contentType) + ';base64,' + Buffer.from(image.bytes).toString('base64');
    return '<figure><img src="' + source + '" alt="' + esc(alt) + '"></figure>';
  };
  const body = questions.map((question, index) => {
    const elements = [
      '<h2>Soal ' + (index + 1) + ' <small>' + esc(question.kind) + '</small></h2>',
      ...question.body.split('\n').filter((line) => line.trim())
        .map((line) => '<p dir="auto">' + esc(line) + '</p>'),
      ...question.formula.map((latex) => '<p class="formula" dir="ltr" data-print-math>' + esc(latex) + '</p>'),
      ...question.media.map(({ id, alt }) => renderImage(id, alt)),
      ...(question.options.length ? ['<ol type="A">' + question.options.map((option) =>
        '<li dir="auto">' + (option.parts?.map((part) => part.type === 'text' ? esc(part.text)
          : part.type === 'formula' ? '<span dir="ltr" data-print-math>' + esc(part.latex) + '</span>'
          : renderImage(part.mediaId, part.alt)).join('') ?? esc(option.text)) + '</li>',
      ).join('') + '</ol>'] : []),
      ...(question.type === 'BS' ? ['<p>☐ Benar &nbsp; ☐ Salah</p>'] : []),
      ...(question.type === 'ESAI' ? ['<div class="answer-lines" aria-hidden="true"></div>'] : []),
      ...(question.type === 'PASANGAN' ? [
        '<p>Pasangkan setiap pernyataan dengan salah satu pilihan.</p>',
        '<div class="matching"><div>' + list(question.pairs.map(({ prompt }) => prompt)) +
        '</div><div>' + list(question.pairs.map(({ match }) => match).sort((a, b) => a.localeCompare(b, 'id')), 'A') +
        '</div></div>',
      ] : []),
    ];
    return '<section>' + elements.join('') + '</section>';
  }).join('');
  const subjects = [...new Set(questions.map(({ subject }) => subject))].join(' · ');
  const html = '<!doctype html><html lang="id"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Naskah Soal DIIS</title>' +
    '<style>' +
    '@font-face{font-family:DIIS Javanese;src:url(/diis/fonts/noto-sans-javanese.woff2) format("woff2");font-display:swap}' +
    '@page{size:A4;margin:15mm}' +
    'body{margin:24px auto;padding:0 16px;max-width:780px;color:#142321;background:#fff;font:16px/1.55 system-ui,"DIIS Javanese",sans-serif}' +
    'h1{font-size:1.8em;margin:0}h2{font-size:1.12em;margin:.4em 0;break-after:avoid}' +
    'small{font-size:.8em;color:#415550;font-weight:500;margin-inline-start:.5em}' +
    'p,ol{margin:.35em 0;overflow-wrap:anywhere}li{margin:.25em 0}' +
    'header{border-bottom:2px solid #146453;padding-bottom:.65em}section{padding:.65em 0;border-bottom:1px solid #becbc8}' +
    'figure{margin:.5em 0;break-inside:avoid}img{display:block;max-width:100%;max-height:115mm;object-fit:contain}' +
    '.formula{padding:.2em 0}.matching{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
    '.matching div{min-width:0}.answer-lines{height:2.5em;border-block:1px solid #becbc8;margin:1em 0}' +
    'button{font:inherit;border:0;border-radius:8px;background:#146453;color:#fff;min-height:44px;padding:0 16px;margin:.65em 0;cursor:pointer}' +
    '@media print{body{max-width:none;margin:0;padding:0;font-size:11pt}button{display:none}}' +
    '</style></head><body><header><h1>Naskah soal</h1><p dir="auto">' + esc(subjects) +
    '</p><p>Nama _______________________ &nbsp; Kelas __________</p></header><main>' + body + '</main></body></html>';
  return { bytes: Buffer.from(html), extension: 'html', mime: 'text/html; charset=utf-8' };
}

export function exportOfficeQuestions(rows: Question[], images: Image[], mode: QuestionExportFormat) {
  const questions = flatten(rows);
  const expected = new Set(questions.flatMap(({ media, options }) => [
    ...media.map(({ id }) => id),
    ...options.flatMap(({ parts }) => parts?.flatMap((part) => part.type === 'image' ? [part.mediaId] : []) ?? []),
  ]));
  if (images.length !== expected.size || images.some(({ id }) => !expected.has(id)))
    throw new BadRequestException('Media salah satu soal tidak tersedia.');
  if (mode === 'student-print') return studentPrint(questions, images);
  return mode === 'xlsx' ? xlsx(questions, images) : docx(questions, images, mode === 'student-docx');
}
