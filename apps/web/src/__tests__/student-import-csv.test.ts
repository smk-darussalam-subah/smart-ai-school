import {
  STUDENT_CSV_COLUMNS,
  STUDENT_TEMPLATE_HEADER,
  countStudentCsvRows,
  escapeCsvReportCell,
  getRetryableStudentImportRows,
  isStudentImportOverLimit,
  parseStudentCsv,
  parseStudentImport,
  prepareStudentRows,
  toStudentProvisionRow,
  validateStudentRaw,
} from '@/app/dashboard/siswa/_components/student-import-csv';

const classes = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'X RPL 1' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'X DKV 1' },
];

describe('student import CSV contract', () => {
  it('template header sesuai kontrak import siswa', () => {
    expect(STUDENT_TEMPLATE_HEADER).toBe(STUDENT_CSV_COLUMNS.join(','));
    expect(STUDENT_TEMPLATE_HEADER.split(',')).toEqual([
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
    ]);
  });

  it('baris sintetis valid dapat diparse', () => {
    const rows = parseStudentCsv(
      `${STUDENT_TEMPLATE_HEADER}\n00001,QAIMP Siswa,L,X RPL 1,2026-07-15,active,QAIMP Wali,+6281234567890,,true,true\n`,
    );
    expect(rows).toHaveLength(1);
    expect(rows.map((row) => validateStudentRaw(row, classes))).toEqual([null]);
  });

  it('menolak tanggal masuk mustahil dan menerima tahun kabisat', () => {
    const [row] = parseStudentCsv(
      `${STUDENT_TEMPLATE_HEADER}\n00001,QAIMP Siswa,L,X RPL 1,2026-02-30,active,QAIMP Wali,+6281234567890,,true,true\n`,
    );
    expect(validateStudentRaw(row!, classes)).toBe('tanggal masuk tidak valid');
    expect(validateStudentRaw({ ...row!, tanggalMasuk: '2024-02-29' }, classes)).toBeNull();
  });

  it('validasi ulang seluruh draft menangkap duplikat NIS yang ditambah lalu dihapus', () => {
    const [a, b] = parseStudentCsv(
      `${STUDENT_TEMPLATE_HEADER}\n00001,QAIMP A,L,X RPL 1,2026-07-15,active,QAIMP Wali,+6281234567890,,true,true\n00002,QAIMP B,P,X RPL 1,2026-07-15,active,QAIMP Wali,+6281234567890,,true,true`,
    );
    const rows = [
      { sourceRow: 2, raw: a! },
      { sourceRow: 3, raw: b! },
    ];
    expect(prepareStudentRows(rows, classes).map((row) => row.error)).toEqual([null, null]);
    const duplicate = rows.map((row, index) =>
      index === 1 ? { ...row, raw: { ...row.raw, nis: '00001' } } : row,
    );
    expect(prepareStudentRows(duplicate, classes).map((row) => row.error)).toEqual([
      'NIS duplikat dalam file',
      'NIS duplikat dalam file',
    ]);
    expect(prepareStudentRows(rows, classes).map((row) => row.error)).toEqual([null, null]);
    expect(
      prepareStudentRows([{ ...rows[0]!, raw: { ...a!, tanggalMasuk: '2026-02-30' } }], classes)[0]
        ?.error,
    ).toBe('tanggal masuk tidak valid');
  });

  it('menolak NIS duplikat dalam file sebelum submit', () => {
    const rows = parseStudentImport(
      [
        STUDENT_TEMPLATE_HEADER,
        '20260001,Ahmad Rizky,L,X RPL 1,2026-07-15,active,Siti,+6281234567890,,true,true',
        '20260001,Nadia Putri,P,X DKV 1,2026-07-15,active,Budi,+6289876543210,,true,true',
      ].join('\n'),
      classes,
    );

    expect(rows.map((row) => row.error)).toEqual([
      'NIS duplikat dalam file',
      'NIS duplikat dalam file',
    ]);
  });

  it('menolak email wali malformed dan consent kosong', () => {
    const [badEmail, noConsent] = parseStudentCsv(
      [
        STUDENT_TEMPLATE_HEADER,
        '20260003,Ahmad Rizky,L,X RPL 1,2026-07-15,active,Siti,+6281234567890,bukan-email,true,true',
        '20260004,Nadia Putri,P,X DKV 1,2026-07-15,active,Budi,+6289876543210,,true,false',
      ].join('\n'),
    );

    expect(validateStudentRaw(badEmail!, classes)).toBe('email wali tidak valid');
    expect(validateStudentRaw(noConsent!, classes)).toBe('consent belum dikonfirmasi');
  });

  it('memetakan row valid menjadi payload /provision/students/bulk', () => {
    const [row] = parseStudentCsv(
      [
        STUDENT_TEMPLATE_HEADER,
        '20260005,Ahmad Rizky,L,X RPL 1,2026-07-15,active,Siti,+6281234567890,,true,true',
      ].join('\n'),
    );

    expect(toStudentProvisionRow(row!, classes)).toEqual({
      siswa: {
        nis: '20260005',
        fullName: 'Ahmad Rizky',
        gender: 'L',
        classId: classes[0]!.id,
        joinedAt: '2026-07-15',
        status: 'active',
      },
      ortu: {
        name: 'Siti',
        phone: '+6281234567890',
      },
      reuseParentByPhone: true,
      consent: true,
    });
  });

  it('mendeteksi file di atas 36 baris sebagai hard reject', () => {
    const rows = Array.from(
      { length: 37 },
      (_, i) =>
        `2027${String(i).padStart(4, '0')},Siswa ${i},L,X RPL 1,2026-07-15,active,Wali,+6281234567890,,true,true`,
    );
    const csv = [STUDENT_TEMPLATE_HEADER, ...rows].join('\n');

    expect(countStudentCsvRows(csv)).toBe(37);
    expect(isStudentImportOverLimit(csv)).toBe(true);
  });

  it('retry import melewati row yang sudah sukses dan melanjutkan row gagal/belum diproses', () => {
    const parsed = parseStudentImport(
      [
        STUDENT_TEMPLATE_HEADER,
        '20260006,Ahmad Rizky,L,X RPL 1,2026-07-15,active,Siti,+6281234567890,,true,true',
        '20260007,Nadia Putri,P,X DKV 1,2026-07-15,active,Budi,+6289876543210,,true,true',
        '20260008,Bima Putra,L,X RPL 1,2026-07-15,active,Rini,+6281111111111,,true,true',
      ].join('\n'),
      classes,
    );

    const retryable = getRetryableStudentImportRows(parsed, [
      { sourceIndex: 0, status: 'ok' },
      { sourceIndex: 1, status: 'error' },
    ]);

    expect(retryable.map((item) => item.index)).toEqual([1, 2]);
  });

  it('export CSV memproteksi formula spreadsheet', () => {
    expect(escapeCsvReportCell('=HYPERLINK("http://bad")')).toBe('"\'=HYPERLINK(""http://bad"")"');
    expect(escapeCsvReportCell('@cmd')).toBe('"\'@cmd"');
  });
});
