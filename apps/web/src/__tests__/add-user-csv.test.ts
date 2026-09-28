import {
  CSV_COLUMNS,
  TEMPLATE_HEADER,
  parseCsv,
  prepareUserRows,
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

  it('baris sintetis valid dapat diparse', () => {
    const rows = parseCsv(
      `${TEMPLATE_HEADER}\nGURU,QAIMP Guru,L,qaimp@example.test,081234567890,1985-01-01,Y0012,GTY,Alamat\n`,
    );
    expect(rows).toHaveLength(1);
    expect(rows.map(validateRaw)).toEqual([null]);
  });

  it('baris tanpa email ditolak sebelum bulk provision', () => {
    const [row] = parseCsv(
      [
        TEMPLATE_HEADER,
        'GURU,Ahmad Fauzi,L,,081234567890,1985-01-01,Y0012,GTY,"Jl. Merdeka No. 1"',
      ].join('\n'),
    );

    expect(validateRaw(row!)).toBe('email kosong');
    expect(toProvisionRow(row!)).not.toHaveProperty('email');
  });

  it('baris dengan email malformed ditolak sebelum bulk provision', () => {
    const [row] = parseCsv(
      [
        TEMPLATE_HEADER,
        'GURU,Ahmad Fauzi,L,bukan-email,081234567890,1985-01-01,Y0012,GTY,"Jl. Merdeka No. 1"',
      ].join('\n'),
    );

    expect(validateRaw(row!)).toBe('email tidak valid');
  });

  it('menolak tanggal lahir yang tampak valid tetapi tidak ada di kalender', () => {
    const [row] = parseCsv(
      `${TEMPLATE_HEADER}\nGURU,QAIMP Guru,L,qaimp@example.test,,2026-02-30,Y0012,GTY,\n`,
    );
    expect(validateRaw(row!)).toBe('tanggal lahir tidak valid');
    expect(validateRaw({ ...row!, birthDate: '2024-02-29' })).toBeNull();
  });

  it('validasi ulang seluruh draft menangkap duplikat yang ditambah lalu dihapus', () => {
    const [a, b] = parseCsv(
      `${TEMPLATE_HEADER}\nGURU,QAIMP A,L,a@example.test,,2024-02-29,N001,GTY,\nGURU,QAIMP B,L,b@example.test,,2024-02-29,N002,GTY,`,
    );
    const rows = [
      { sourceRow: 2, raw: a! },
      { sourceRow: 3, raw: b! },
    ];
    expect(prepareUserRows(rows, true).map((row) => row.error)).toEqual([null, null]);
    const duplicate = rows.map((row, index) =>
      index === 1 ? { ...row, raw: { ...row.raw, email: 'a@example.test' } } : row,
    );
    expect(prepareUserRows(duplicate, true).map((row) => row.error)).toEqual([
      'email duplikat dalam file',
      'email duplikat dalam file',
    ]);
    expect(prepareUserRows(rows, true).map((row) => row.error)).toEqual([null, null]);
    expect(
      prepareUserRows([{ ...rows[0]!, raw: { ...a!, birthDate: '2026-02-30' } }], true)[0]?.error,
    ).toBe('tanggal lahir tidak valid');
  });
});
