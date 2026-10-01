export const IMPORT_MAX_ROWS = 36;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export type ImportCellKind = 'text' | 'identifier' | 'date' | 'boolean';
export interface ImportColumnDefinition {
  key: string;
  kind: ImportCellKind;
}
export type ImportColumns = readonly (string | ImportColumnDefinition)[];

function columnDefinitions(columns: ImportColumns): ImportColumnDefinition[] {
  return columns.map((column) =>
    typeof column === 'string' ? { key: column, kind: 'text' } : column,
  );
}

function excelColumn(index: number): string {
  let current = index + 1;
  let result = '';
  while (current > 0) {
    current--;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function safeCellValue(value: unknown): string {
  if (value instanceof Date) return '[date]';
  if (typeof value === 'string') return `[text:${value.length}]`;
  return `[${typeof value}]`;
}

function calendarDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeCell(value: unknown, definition: ImportColumnDefinition): string | null {
  if (value == null || value === '') return '';
  if (definition.kind === 'date' && value instanceof Date && !Number.isNaN(value.getTime())) {
    return calendarDate(value);
  }
  if (definition.kind === 'boolean' && typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (definition.kind === 'identifier' && /^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(text)) return null;
  if (definition.kind === 'date' && text && !isIsoCalendarDate(text)) return null;
  if (definition.kind === 'boolean' && text) {
    const normalized = text.toLowerCase();
    if (['true', 'ya', 'yes', '1', 'setuju'].includes(normalized)) return 'true';
    if (['false', 'tidak', 'no', '0'].includes(normalized)) return 'false';
    return null;
  }
  return text;
}

export function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isConfirmedImportRejection(status?: number): boolean {
  return status === 400 || status === 401 || status === 403;
}

export interface ImportRow {
  sourceRow: number;
  raw: Record<string, string>;
}

export interface ImportIssue {
  sourceRow?: number;
  column?: string;
  message: string;
}

export interface ImportParseResult {
  rows: ImportRow[];
  errors: ImportIssue[];
  dataCount?: number;
}

export function mapImportResults<T extends { index: number; status: 'ok' | 'error' }>(
  results: readonly T[],
  sources: readonly { index: number }[],
): Array<T & { sourceIndex: number }> | null {
  if (results.length !== sources.length) return null;
  const seen = new Set<number>();
  const mapped: Array<T & { sourceIndex: number }> = [];
  for (const result of results) {
    if (
      !Number.isInteger(result.index) ||
      result.index < 0 ||
      result.index >= sources.length ||
      seen.has(result.index) ||
      (result.status !== 'ok' && result.status !== 'error')
    )
      return null;
    seen.add(result.index);
    mapped.push({ ...result, sourceIndex: sources[result.index]!.index });
  }
  return mapped;
}

export function checkImportFile(file: File): string | null {
  if (!/\.(csv|xlsx)$/i.test(file.name)) return 'Pilih file .xlsx atau .csv.';
  if (file.size > IMPORT_MAX_BYTES) return 'Ukuran file maksimal 2 MiB.';
  if (file.size === 0) return 'File kosong.';
  return null;
}

export function parseImportCsv(text: string, columns: ImportColumns): ImportParseResult {
  const records: Array<{ sourceRow: number; cells: string[] }> = [];
  const errors: ImportIssue[] = [];
  let cells: string[] = [];
  let cell = '';
  let state: 'start' | 'plain' | 'quoted' | 'closed' = 'start';
  let line = 1;
  let recordLine = 1;
  let hasStructure = false;

  const finishCell = () => {
    cells.push(cell);
    cell = '';
    state = 'start';
  };
  const finishRecord = () => {
    finishCell();
    if (hasStructure || cells.some((value) => value.trim() !== ''))
      records.push({ sourceRow: recordLine, cells });
    cells = [];
    hasStructure = false;
    recordLine = line + 1;
  };

  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (state === 'quoted') {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') state = 'closed';
      else {
        cell += char;
        if (char === '\n') line++;
        if (char === '\r' && input[i + 1] !== '\n') line++;
      }
      continue;
    }
    if (char === '"') {
      if (state === 'start') {
        state = 'quoted';
        hasStructure = true;
      } else {
        errors.push({ sourceRow: line, message: 'Tanda kutip CSV tidak pada tempatnya.' });
        break;
      }
    } else if (char === ',') {
      hasStructure = true;
      finishCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      finishRecord();
      line++;
    } else if (state === 'closed') {
      if (char !== ' ' && char !== '\t') {
        errors.push({ sourceRow: line, message: 'Karakter setelah tanda kutip CSV tidak valid.' });
        break;
      }
    } else {
      cell += char;
      state = 'plain';
    }
  }
  if (state === 'quoted')
    errors.push({ sourceRow: recordLine, message: 'Tanda kutip CSV tidak ditutup.' });
  if (errors.length) return { rows: [], errors };
  if (cells.length || cell !== '' || state !== 'start') finishRecord();
  return rowsFromCells(records, columns);
}

export function rowsFromCells(
  records: Array<{ sourceRow: number; cells: readonly unknown[] }>,
  columns: ImportColumns,
  sheet = 'Data',
): ImportParseResult {
  const definitions = columnDefinitions(columns);
  const keys = definitions.map(({ key }) => key);
  const errors: ImportIssue[] = [];
  const [header, ...data] = records;
  if (!header) return { rows: [], errors: [{ message: 'File kosong atau header tidak ada.' }] };
  const names = header.cells.map((cell) =>
    typeof cell === 'string' ? cell.replace(/^\uFEFF/, '').trim() : cell,
  );
  if (names.length !== keys.length || names.some((name, i) => name !== keys[i])) {
    return {
      rows: [],
      errors: [{ sourceRow: header.sourceRow, message: `Header harus persis: ${keys.join(',')}` }],
    };
  }
  if (data.length === 0) return { rows: [], errors: [{ message: 'File hanya berisi header.' }] };
  if (data.length > IMPORT_MAX_ROWS) {
    return {
      rows: [],
      errors: [{ message: `Maksimal ${IMPORT_MAX_ROWS} baris data per file.` }],
      dataCount: data.length,
    };
  }
  const rows = data.map(({ sourceRow, cells }) => {
    if (cells.length !== keys.length)
      errors.push({ sourceRow, message: `Jumlah kolom harus ${keys.length}.` });
    const raw: Record<string, string> = {};
    definitions.forEach((definition, index) => {
      const value = cells[index];
      const normalized = normalizeCell(value, definition);
      if (normalized === null) {
        const cell = `${excelColumn(index)}${sourceRow}`;
        errors.push({
          sourceRow,
          column: definition.key,
          message: `Sheet ${sheet}, cell ${cell}, kolom ${definition.key}: nilai ${safeCellValue(value)} tidak sesuai tipe ${definition.kind}. Perbaiki nilai atau gunakan template resmi.`,
        });
      }
      raw[definition.key] = normalized ?? '';
    });
    return { sourceRow, raw };
  });
  return { rows: errors.length ? [] : rows, errors, dataCount: data.length };
}

export async function parseImportFile(
  file: File,
  columns: ImportColumns,
  sheet: string,
): Promise<ImportParseResult> {
  const fileError = checkImportFile(file);
  if (fileError) return { rows: [], errors: [{ message: fileError }] };
  if (/\.csv$/i.test(file.name)) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.includes('\0')) throw new Error('NUL');
      return parseImportCsv(text, columns);
    } catch {
      return { rows: [], errors: [{ message: 'CSV harus berupa teks UTF-8 yang valid.' }] };
    }
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { guardOperationalXlsx } = await import('./operational-xlsx-guard');
    await guardOperationalXlsx(bytes, sheet);
    let sheets: Awaited<ReturnType<typeof import('read-excel-file/browser').default>>;
    try {
      const { default: readExcelFile } = await import('read-excel-file/browser');
      sheets = await readExcelFile(bytes.buffer);
    } catch {
      return { rows: [], errors: [{ message: 'XLSX tidak dapat dibaca.' }] };
    }
    if (sheets.length !== 1 || sheets[0]?.sheet !== sheet) {
      return {
        rows: [],
        errors: [{ message: `XLSX harus memiliki satu sheet bernama ${sheet}.` }],
      };
    }
    const records = sheets[0].data
      .map((cells, index) => ({ sourceRow: index + 1, cells }))
      .filter(({ cells }) => cells.some((value) => value != null && String(value).trim() !== ''));
    return rowsFromCells(records, columns, sheet);
  } catch (error) {
    const message =
      error instanceof Error && /^(XLSX|Struktur|Formula|Link)/.test(error.message)
        ? error.message
        : 'XLSX tidak dapat dibaca.';
    return { rows: [], errors: [{ message }] };
  }
}

export async function downloadImportTemplate(
  columns: ImportColumns,
  sheet: string,
  name: string,
): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const data = buildImportTemplateData(columns);
  await writeExcelFile(data, { sheet }).toFile(name);
}

export function buildImportTemplateData(columns: ImportColumns) {
  const definitions = columnDefinitions(columns);
  const header = definitions.map(({ key }) => ({
    value: key,
    type: String,
    fontWeight: 'bold' as const,
  }));
  const blankRows = Array.from({ length: IMPORT_MAX_ROWS }, () =>
    definitions.map(({ kind }) =>
      kind === 'date'
        ? { value: undefined, type: Date, format: 'yyyy-mm-dd' }
        : { value: '', type: String, format: '@' },
    ),
  );
  return [header, ...blankRows];
}

export function downloadCsvTemplate(columns: ImportColumns, name: string): void {
  const blob = new Blob(
    [
      `${columnDefinitions(columns)
        .map(({ key }) => key)
        .join(',')}\n`,
    ],
    { type: 'text/csv;charset=utf-8' },
  );
  downloadImportBlob(blob, name);
}

export function downloadImportBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
