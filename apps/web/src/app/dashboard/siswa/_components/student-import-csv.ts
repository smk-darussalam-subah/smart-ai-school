import {
  IMPORT_MAX_ROWS,
  isIsoCalendarDate,
  parseImportCsv,
  type ImportRow,
} from '@/lib/operational-import';

export const STUDENT_IMPORT_MAX_ROWS = IMPORT_MAX_ROWS;

export const STUDENT_CSV_COLUMNS = [
  'nis',
  'namaSiswa',
  'jenisKelamin',
  'kelas',
  'tanggalMasuk',
  'status',
  'namaWali',
  'teleponWali',
  'emailWali',
  'reuseWaliByPhone',
  'consentConfirmed',
] as const;

export const STUDENT_TEMPLATE_ROWS: readonly (readonly string[])[] = [];

export const STUDENT_TEMPLATE_HEADER = STUDENT_CSV_COLUMNS.join(',');

export const STUDENT_TEMPLATE_BODY = '';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_VALUES = ['active', 'inactive', 'graduated', 'dropped'];
const TRUE_VALUES = ['true', 'ya', 'yes', '1', 'setuju'];

export interface ImportClassOption {
  id: string;
  name: string;
}

export interface StudentParsedRow {
  raw: Record<string, string>;
  error: string | null;
  sourceRow: number;
}

export interface StudentImportRowResult {
  sourceIndex: number;
  status: 'ok' | 'error';
}

export function parseStudentCsvLine(line: string): string[] {
  const result = parseImportCsv(`${STUDENT_CSV_COLUMNS.join(',')}\n${line}`, STUDENT_CSV_COLUMNS);
  return STUDENT_CSV_COLUMNS.map((column) => result.rows[0]?.raw[column] ?? '');
}

export function parseStudentCsv(text: string): Record<string, string>[] {
  return parseImportCsv(text, STUDENT_CSV_COLUMNS).rows.map((row) => row.raw);
}

export function countStudentCsvRows(text: string): number {
  return parseImportCsv(text, STUDENT_CSV_COLUMNS).dataCount ?? 0;
}

export function isStudentImportOverLimit(text: string): boolean {
  return countStudentCsvRows(text) > STUDENT_IMPORT_MAX_ROWS;
}

function normalizeClassName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function findClassId(className: string, classes: ImportClassOption[]): string | null {
  const normalized = normalizeClassName(className);
  return classes.find((c) => normalizeClassName(c.name) === normalized)?.id ?? null;
}

function boolValue(value: string): boolean {
  return TRUE_VALUES.includes(value.trim().toLowerCase());
}

export function validateStudentRaw(
  row: Record<string, string>,
  classes: ImportClassOption[],
  duplicateNis?: Set<string>,
): string | null {
  const nis = (row.nis || '').trim();
  const fullName = (row.namaSiswa || '').trim();
  const gender = (row.jenisKelamin || '').trim().toUpperCase();
  const className = (row.kelas || '').trim();
  const joinedAt = (row.tanggalMasuk || '').trim();
  const status = (row.status || '').trim() || 'active';
  const parentName = (row.namaWali || '').trim();
  const parentPhone = (row.teleponWali || '').trim();
  const parentEmail = (row.emailWali || '').trim();

  if (!nis) return 'NIS kosong';
  if (duplicateNis?.has(nis)) return 'NIS duplikat dalam file';
  if (!fullName) return 'nama siswa kosong';
  if (!['L', 'P'].includes(gender)) return 'jenis kelamin harus L/P';
  if (!className) return 'kelas kosong';
  if (!findClassId(className, classes)) return 'kelas tidak ditemukan';
  if (!joinedAt) return 'tanggal masuk kosong';
  if (!DATE_RE.test(joinedAt)) return 'tanggal masuk harus YYYY-MM-DD';
  if (!isIsoCalendarDate(joinedAt)) return 'tanggal masuk tidak valid';
  if (!STATUS_VALUES.includes(status)) return 'status tidak valid';
  if (!parentName) return 'nama wali kosong';
  if (!parentPhone) return 'telepon wali kosong';
  if (!/^\+62\d{8,14}$/.test(parentPhone)) return 'telepon wali harus format +62';
  if (parentEmail && !EMAIL_RE.test(parentEmail)) return 'email wali tidak valid';
  if (
    row.reuseWaliByPhone &&
    !/^(?:true|false|ya|tidak|yes|no|0|1|setuju)$/i.test(row.reuseWaliByPhone.trim())
  )
    return 'reuse wali harus boolean';
  if (!boolValue(row.consentConfirmed || '')) return 'consent belum dikonfirmasi';
  return null;
}

export function parseStudentImport(text: string, classes: ImportClassOption[]): StudentParsedRow[] {
  return prepareStudentRows(parseImportCsv(text, STUDENT_CSV_COLUMNS).rows, classes);
}

export function prepareStudentRows(
  rows: ImportRow[],
  classes: ImportClassOption[],
): StudentParsedRow[] {
  const nisCounts = new Map<string, number>();
  rows.forEach(({ raw }) => {
    const nis = (raw.nis || '').trim();
    if (nis) nisCounts.set(nis, (nisCounts.get(nis) ?? 0) + 1);
  });

  return rows.map(({ raw, sourceRow }) => {
    const nis = (raw.nis || '').trim();
    const duplicateSet = nis && (nisCounts.get(nis) ?? 0) > 1 ? new Set([nis]) : undefined;
    return { raw, sourceRow, error: validateStudentRaw(raw, classes, duplicateSet) };
  });
}

export function getRetryableStudentImportRows<T extends StudentImportRowResult>(
  parsed: StudentParsedRow[],
  results: T[],
): Array<{ row: StudentParsedRow; index: number }> {
  const okIndexes = new Set(
    results.filter((result) => result.status === 'ok').map((result) => result.sourceIndex),
  );
  return parsed
    .map((row, index) => ({ row, index }))
    .filter((item) => !item.row.error && !okIndexes.has(item.index));
}

export function protectSpreadsheetFormula(value: string): string {
  const trimmedStart = value.trimStart();
  if (/^[=+\-@]/.test(trimmedStart)) return `'${value}`;
  return value;
}

export function escapeCsvReportCell(value: string): string {
  const protectedValue = protectSpreadsheetFormula(value);
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function toStudentProvisionRow(
  row: Record<string, string>,
  classes: ImportClassOption[],
): Record<string, unknown> {
  const classId = findClassId(row.kelas || '', classes);
  const email = (row.emailWali || '').trim();
  const status = (row.status || '').trim() || 'active';
  const siswa: Record<string, unknown> = {
    nis: (row.nis || '').trim(),
    fullName: (row.namaSiswa || '').trim(),
    gender: (row.jenisKelamin || '').trim().toUpperCase(),
    joinedAt: (row.tanggalMasuk || '').trim(),
    status,
  };
  if (classId) siswa.classId = classId;
  return {
    siswa,
    ortu: {
      name: (row.namaWali || '').trim(),
      phone: (row.teleponWali || '').trim(),
      ...(email ? { email } : {}),
    },
    reuseParentByPhone: boolValue(row.reuseWaliByPhone || ''),
    consent: true,
  };
}
