import {
  STUDENT_CSV_COLUMNS,
  STUDENT_TEMPLATE_BODY,
  STUDENT_TEMPLATE_HEADER,
  countStudentCsvRows,
  escapeCsvReportCell,
  getRetryableStudentImportRows,
  isStudentImportOverLimit,
  parseStudentCsv,
  parseStudentImport,
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

  it('template body bisa diparse dan contoh row valid', () => {
    const rows = parseStudentCsv(`${STUDENT_TEMPLATE_HEADER}\n${STUDENT_TEMPLATE_BODY}\n`);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => validateStudentRaw(row, classes))).toEqual([null, null]);
  });

  it('menolak NIS duplikat dalam file sebelum submit', () => {
    const rows = parseStudentImport([
      STUDENT_TEMPLATE_HEADER,
      '20260001,Ahmad Rizky,L,X RPL 1,2026-07-15,active,Siti,+6281234567890,,true,true',
      '20260001,Nadia Putri,P,X DKV 1,2026-07-15,active,Budi,+6289876543210,,true,true',
    ].join('\n'), classes);

    expect(rows.map((row) => row.error)).toEqual([
      'NIS duplikat dalam file',
      'NIS duplikat dalam file',
    ]);
  });

  it('menolak email wali malformed dan consent kosong', () => {
    const [badEmail, noConsent] = parseStudentCsv([
      STUDENT_TEMPLATE_HEADER,
      '20260003,Ahmad Rizky,L,X RPL 1,2026-07-15,active,Siti,+6281234567890,bukan-email,true,true',
      '20260004,Nadia Putri,P,X DKV 1,2026-07-15,active,Budi,+6289876543210,,true,false',
    ].join('\n'));

    expect(validateStudentRaw(badEmail!, classes)).toBe('email wali tidak valid');
    expect(validateStudentRaw(noConsent!, classes)).toBe('consent belum dikonfirmasi');
  });

  it('memetakan row valid menjadi payload /provision/students/bulk', () => {
    const [row] = parseStudentCsv([
      STUDENT_TEMPLATE_HEADER,
      '20260005,Ahmad Rizky,L,X RPL 1,2026-07-15,active,Siti,+6281234567890,,true,true',
    ].join('\n'));

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

  it('mendeteksi file di atas 500 baris sebagai hard reject', () => {
    const rows = Array.from({ length: 501 }, (_, i) =>
      `2027${String(i).padStart(4, '0')},Siswa ${i},L,X RPL 1,2026-07-15,active,Wali,+6281234567890,,true,true`,
    );
    const csv = [STUDENT_TEMPLATE_HEADER, ...rows].join('\n');

    expect(countStudentCsvRows(csv)).toBe(501);
    expect(isStudentImportOverLimit(csv)).toBe(true);
  });

  it('retry import melewati row yang sudah sukses dan melanjutkan row gagal/belum diproses', () => {
    const parsed = parseStudentImport([
      STUDENT_TEMPLATE_HEADER,
      '20260006,Ahmad Rizky,L,X RPL 1,2026-07-15,active,Siti,+6281234567890,,true,true',
      '20260007,Nadia Putri,P,X DKV 1,2026-07-15,active,Budi,+6289876543210,,true,true',
      '20260008,Bima Putra,L,X RPL 1,2026-07-15,active,Rini,+6281111111111,,true,true',
    ].join('\n'), classes);

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
