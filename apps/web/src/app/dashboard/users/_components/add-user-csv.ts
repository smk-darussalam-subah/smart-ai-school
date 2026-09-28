export const STAFF_ROLES = ['GURU', 'TATA_USAHA'];

export const ROLE_VALUES = ['GURU', 'TATA_USAHA', 'INDUSTRI'];

export const CSV_COLUMNS = [
  'role',
  'fullName',
  'gender',
  'email',
  'phone',
  'birthDate',
  'niy',
  'employmentStatus',
  'address',
] as const;

export const TEMPLATE_ROWS: readonly (readonly string[])[] = [];

export const TEMPLATE_HEADER = CSV_COLUMNS.join(',');

export const TEMPLATE_BODY = '';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

import { isIsoCalendarDate, parseImportCsv, type ImportRow } from '@/lib/operational-import';

export interface UserParsedRow extends ImportRow {
  error: string | null;
}

export function prepareUserRows(rows: ImportRow[], isSuperAdmin: boolean): UserParsedRow[] {
  const emailCounts = new Map<string, number>();
  const niyCounts = new Map<string, number>();
  for (const { raw } of rows) {
    const email = (raw.email ?? '').trim().toLowerCase();
    const niy = (raw.niy ?? '').trim().toLowerCase();
    if (email) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    if (niy) niyCounts.set(niy, (niyCounts.get(niy) ?? 0) + 1);
  }
  return rows.map(({ sourceRow, raw }) => {
    const email = (raw.email ?? '').trim().toLowerCase();
    const niy = (raw.niy ?? '').trim().toLowerCase();
    return {
      sourceRow,
      raw,
      error:
        validateRaw(raw) ||
        (!isSuperAdmin && raw.role === 'TATA_USAHA'
          ? 'hanya Super Admin dapat membuat Tata Usaha'
          : null) ||
        (email && (emailCounts.get(email) ?? 0) > 1 ? 'email duplikat dalam file' : null) ||
        (niy && (niyCounts.get(niy) ?? 0) > 1 ? 'NIY duplikat dalam file' : null),
    };
  });
}

export function parseCsvLine(line: string): string[] {
  const result = parseImportCsv(`${CSV_COLUMNS.join(',')}\n${line}`, CSV_COLUMNS);
  return CSV_COLUMNS.map((column) => result.rows[0]?.raw[column] ?? '');
}

export function parseCsv(text: string): Record<string, string>[] {
  return parseImportCsv(text, CSV_COLUMNS).rows.map((row) => row.raw);
}

export function toProvisionRow(r: Record<string, string>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of CSV_COLUMNS) {
    const v = r[k]?.trim();
    if (v) o[k] = v;
  }
  return o;
}

export function validateRaw(r: Record<string, string>): string | null {
  const role = (r.role || '').trim();
  if (!role) return 'role kosong';
  if (!ROLE_VALUES.includes(role)) return 'role tidak dikenal';
  if (!(r.fullName || '').trim()) return 'nama kosong';
  if (!['L', 'P'].includes((r.gender || '').trim())) return 'jenis kelamin harus L/P';
  const email = (r.email || '').trim();
  if (!email) return 'email kosong';
  if (!EMAIL_RE.test(email)) return 'email tidak valid';
  const phone = (r.phone || '').trim();
  if (phone && !/^(?:\+62|0)\d{8,14}$/.test(phone)) return 'nomor telepon tidak valid';
  const birthDate = (r.birthDate || '').trim();
  if (birthDate && !isIsoCalendarDate(birthDate)) return 'tanggal lahir tidak valid';
  const staff = STAFF_ROLES.includes(role);
  const status = (r.employmentStatus || '').trim();
  if (staff && !status) return 'status kepegawaian kosong';
  if (staff && status && !['GTY', 'GTT', 'PTY', 'PTT'].includes(status))
    return 'status tidak valid';
  if (!staff && ((r.niy || '').trim() || status)) return 'Industri tidak boleh niy/status';
  return null;
}
