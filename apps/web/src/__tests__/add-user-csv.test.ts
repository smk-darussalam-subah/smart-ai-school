import {
  CSV_COLUMNS,
  TEMPLATE_BODY,
  TEMPLATE_HEADER,
  parseCsv,
  toProvisionRow,
  validateRaw,
} from '@/app/dashboard/users/_components/add-user-csv';

describe('add-user CSV template', () => {
  it('template header sesuai urutan kolom impor dan memuat email wajib', () => {
    expect(TEMPLATE_HEADER).toBe(CSV_COLUMNS.join(','));
    expect(TEMPLATE_HEADER.split(',')).toEqual([
      'role',
      'fullName',
      'gender',
      'email',
      'phone',
      'birthDate',
      'niy',
      'employmentStatus',
      'address',
    ]);
  });

  it('template body bisa diparse dan semua row contoh valid', () => {
    const rows = parseCsv(`${TEMPLATE_HEADER}\n${TEMPLATE_BODY}\n`);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.email)).toBe(true);
    expect(rows.map(validateRaw)).toEqual(rows.map(() => null));
  });

  it('baris tanpa email ditolak sebelum bulk provision', () => {
    const [row] = parseCsv([
      TEMPLATE_HEADER,
      'GURU,Ahmad Fauzi,L,,081234567890,1985-01-01,Y0012,GTY,"Jl. Merdeka No. 1"',
    ].join('\n'));

    expect(validateRaw(row!)).toBe('email kosong');
    expect(toProvisionRow(row!)).not.toHaveProperty('email');
  });

  it('baris dengan email malformed ditolak sebelum bulk provision', () => {
    const [row] = parseCsv([
      TEMPLATE_HEADER,
      'GURU,Ahmad Fauzi,L,bukan-email,081234567890,1985-01-01,Y0012,GTY,"Jl. Merdeka No. 1"',
    ].join('\n'));

    expect(validateRaw(row!)).toBe('email tidak valid');
  });
});
