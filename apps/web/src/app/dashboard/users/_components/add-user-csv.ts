export const STAFF_ROLES = ['GURU', 'TATA_USAHA', 'KEPALA_SEKOLAH'];

export const ROLE_VALUES = ['GURU', 'TATA_USAHA', 'KEPALA_SEKOLAH', 'INDUSTRI'];

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

export const TEMPLATE_ROWS = [
  ['GURU', 'Ahmad Fauzi', 'L', 'ahmad.fauzi@smkdarussalamsubah.sch.id', '081234567890', '1985-01-01', 'Y0012', 'GTY', 'Jl. Merdeka No. 1, Subah'],
  ['TATA_USAHA', 'Budi Santoso', 'L', 'budi.santoso@smkdarussalamsubah.sch.id', '081211112222', '1988-07-20', 'Y0101', 'PTY', 'Jl. Raya Subah No. 9'],
  ['KEPALA_SEKOLAH', 'Drs Hasanuddin', 'L', 'kepsek@smkdarussalamsubah.sch.id', '081233334444', '1972-11-05', 'Y0001', 'GTY', 'Perum Griya Asri C2'],
  ['INDUSTRI', 'PT Maju Jaya - Rina', 'P', 'rina@majujaya.example', '081255556666', '', '', '', 'Kawasan Industri Batang'],
] as const;

export const TEMPLATE_HEADER = CSV_COLUMNS.join(',');

function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export const TEMPLATE_BODY = TEMPLATE_ROWS
  .map((row) => row.map(escapeCsvCell).join(','))
  .join('\n');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += c;
      }
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else if (c === '"') {
      inQuote = true;
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]!).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
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
  const staff = STAFF_ROLES.includes(role);
  const status = (r.employmentStatus || '').trim();
  if (staff && !status) return 'status kepegawaian kosong';
  if (staff && status && !['GTY', 'GTT', 'PTY', 'PTT'].includes(status)) return 'status tidak valid';
  if (!staff && ((r.niy || '').trim() || status)) return 'Industri tidak boleh niy/status';
  return null;
}
