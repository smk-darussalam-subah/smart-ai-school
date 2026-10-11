import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { inflateRawSync } from 'zlib';
import readXlsxFile from 'read-excel-file/node';
import { ImportFile, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from './dto/scheduling-import.dto';

const fail = (): never => { throw new BadRequestException('File impor tidak valid atau melebihi batas aman'); };
const MAX_COLUMNS = 32;
const MAX_CELL = 200;
const MAX_XML = 4 * 1024 * 1024;
const MAX_EXPANDED = 8 * 1024 * 1024;

/** Inspect the ZIP envelope BEFORE the XLSX parser can allocate XML or sparse cells. */
export function guardXlsx(bytes: Buffer) {
  const sheetRowCounts: number[] = [];
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) fail();
  const count = bytes.readUInt16LE(end + 10);
  if (!count || count > 200 || count !== bytes.readUInt16LE(end + 8)) fail();
  const centralSize = bytes.readUInt32LE(end + 12);
  let cursor = bytes.readUInt32LE(end + 16);
  if (cursor + centralSize !== end) fail();
  let expanded = 0;
  const names = new Set<string>();
  const ranges: Array<[number, number]> = [];
  let worksheets = 0;
  for (let n = 0; n < count; n++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) fail();
    const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10);
    const compressed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24);
    const nameSize = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32);
    const offset = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameSize + extra + comment;
    if (next > end || (flags & ~0x0808) !== 0 || ![0, 8].includes(method) || size > MAX_XML ||
      size > Math.max(compressed * 200, 1024) || (expanded += size) > MAX_EXPANDED) fail();
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameSize).toString('utf8');
    if (!/^[A-Za-z0-9_./[\]-]+$/.test(name) || name.includes('..') || name.startsWith('/') || names.has(name) ||
      /vba|externalLinks|embeddings|\.bin$/i.test(name)) fail();
    names.add(name);
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(name) && ++worksheets > 10) fail();
    if (offset + 30 > end || bytes.readUInt32LE(offset) !== 0x04034b50 ||
      bytes.readUInt16LE(offset + 6) !== flags || bytes.readUInt16LE(offset + 8) !== method) fail();
    const localNameSize = bytes.readUInt16LE(offset + 26), localExtra = bytes.readUInt16LE(offset + 28);
    if (localNameSize !== nameSize || bytes.subarray(offset + 30, offset + 30 + localNameSize).toString('utf8') !== name) fail();
    const start = offset + 30 + localNameSize + localExtra, stop = start + compressed;
    if (stop > bytes.readUInt32LE(end + 16) || ranges.some(([a,b]) => offset < b && stop > a)) fail();
    ranges.push([offset, stop]);
    let part: Buffer;
    try { part = method === 8 ? inflateRawSync(bytes.subarray(start, stop), { maxOutputLength: MAX_XML }) : bytes.subarray(start, stop); }
    catch { return fail(); }
    if (part.length !== size) fail();
    if (/\.(xml|rels)$/.test(name)) {
      const xml = part.toString('utf8');
      if (/<!DOCTYPE|<!ENTITY|<(?:[\w]+:)?f(?:\s|\/?>)|TargetMode\s*=\s*["']External["']/i.test(xml)) fail();
      // Limit sparse row/column references before library expands row arrays.
      const cells = new Set<string>();
      let maxCellRow = 0;
      // Inspect each complete tag and require a single canonical reference. The
      // pinned parser cannot decode spaces around '=' consistently; refuse rather
      // than silently lose cells. Namespace aliases may shadow `r` in that parser,
      // so inspect them too and reject them before it expands sparse arrays.
      const reference = (attributes: string) => {
        const refs = [...attributes.matchAll(/(?:^|\s)(?:[\w]+:)?r\s*=\s*["']([^"']*)["']/g)];
        if (refs.length !== 1 || !/^r=["']/.test(refs[0]![0].trim())) fail();
        return refs[0]![1]!;
      };
      for (const tag of xml.matchAll(/<(?:[\w]+:)?c\b([^>]*)>/g)) {
        const match = /^([A-Z]{1,2})([1-9][0-9]{0,3})$/.exec(reference(tag[1]!)) ?? fail();
        let col = 0;
        for (const char of match[1]!) col = col * 26 + char.charCodeAt(0) - 64;
        if (col > MAX_COLUMNS || Number(match[2]) > IMPORT_MAX_ROWS + 20) fail();
        if (cells.has(match[1]! + match[2]!)) fail();
        cells.add(match[1]! + match[2]!);
        maxCellRow = Math.max(maxCellRow, Number(match[2]));
      }
      const rowRefs = new Set<number>();
      for (const tag of xml.matchAll(/<(?:[\w]+:)?row\b([^>]*)>/g)) {
        const ref = reference(tag[1]!);
        if (!/^[1-9][0-9]{0,3}$/.test(ref) || Number(ref) > IMPORT_MAX_ROWS + 20) fail();
        if (rowRefs.has(Number(ref))) fail();
        rowRefs.add(Number(ref));
      }
      if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
        const rowCount = Math.max(0,...rowRefs);
        if (maxCellRow > rowCount) fail();
        sheetRowCounts.push(rowCount);
      }
    }
    cursor = next;
  }
  if (cursor !== end || !names.has('xl/workbook.xml') || !names.has('[Content_Types].xml')) fail();
  return sheetRowCounts;
}

function csvRows(bytes: Buffer, delimiter: string): string[][] {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); } catch { return fail(); }
  if (text.includes('\0')) fail();
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const endCell = () => { row.push(cell); if (row.length > MAX_COLUMNS) fail(); cell = ''; closed = false; };
  const endRow = () => { endCell(); rows.push(row); row = []; if (rows.length > IMPORT_MAX_ROWS + 20) fail(); };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; }
      } else cell += char;
    } else if (char === '"') {
      if (cell || closed) fail(); quoted = true;
    } else if (char === delimiter) endCell();
    else if (char === '\n' || char === '\r') { endRow(); if (char === '\r' && text[i + 1] === '\n') i++; }
    else { if (closed) fail(); cell += char; }
    if (cell.length > MAX_CELL) fail();
  }
  if (quoted) fail();
  if (cell || row.length || closed) endRow();
  return rows;
}

export async function parseImportFile(file: ImportFile) {
  const bytes = Buffer.from(file.contentBase64, 'base64');
  if (!bytes.length || bytes.length > IMPORT_MAX_BYTES || bytes.toString('base64') !== file.contentBase64) fail();
  let rows: unknown[][];
  let sheets: string[];
  if (file.format === 'CSV') {
    if (file.sheet !== 1) fail();
    rows = csvRows(bytes, file.delimiter); sheets = ['CSV'];
  } else {
    const rowCounts = guardXlsx(bytes);
    try {
      const workbook = await readXlsxFile(bytes, { trim: false });
      if (workbook.length > 10 || !workbook[file.sheet - 1]) fail();
      rows = workbook[file.sheet - 1]!.data; sheets = workbook.map((s) => s.sheet);
      // Some parsers trim styled/empty trailing rows. Refuse that lossy import rather than silently drop them.
      // ZIP entry order is not workbook sheet order. Each decoded sheet is bounded above
      // by its raw row refs, so equal totals (and sheet count) prove none were trimmed.
      if (rowCounts.length !== workbook.length || rowCounts.reduce((a,b) => a+b,0) !==
          workbook.reduce((total,s) => total+s.data.length,0)) fail();
    } catch { return fail(); }
  }
  if (rows.length > IMPORT_MAX_ROWS + 20 || !rows[file.headerRow - 1]) fail();
  const clean = Array.from(rows, (row) => {
    if (!Array.isArray(row)) fail();
    if (row.length > MAX_COLUMNS) fail();
    return row.map((cell) => {
      if (cell === null || cell === undefined) return '';
      if (typeof cell !== 'string' && typeof cell !== 'number') fail();
      const value = String(cell).trim();
      if (value.length > MAX_CELL || [...value].some((c) => c.charCodeAt(0) < 32 && !['\n','\r','\t'].includes(c)) || /^[=+@-]/.test(value)) fail();
      return value;
    });
  });
  const headers = clean[file.headerRow - 1]!;
  if (!headers.length || headers.some((h) => !h) || new Set(headers).size !== headers.length) fail();
  const data = clean.slice(file.headerRow).map((values, i) => ({ row: file.headerRow + i + 1, values }));
  // Blank data rows are errors, not silently skipped evidence.
  if (!data.length || data.length > IMPORT_MAX_ROWS || data.some((r) => r.values.length > headers.length)) fail();
  return { headers, rows: data, sheets, fileSha256: createHash('sha256').update(bytes).digest('hex') };
}
