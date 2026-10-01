import {
  checkImportFile,
  buildImportTemplateData,
  IMPORT_MAX_ROWS,
  isConfirmedImportRejection,
  mapImportResults,
  parseImportCsv,
  rowsFromCells,
} from '@/lib/operational-import';
import readExcelFile from 'read-excel-file/node';
import writeExcelFile from 'write-excel-file/node';
import { strFromU8, unzipSync } from 'fflate';

const columns = ['nis', 'name', 'note'] as const;
const header = columns.join(',');

describe('operational import parser', () => {
  it('menolak ekstensi lama, file kosong, dan lebih dari 2 MiB sebelum parsing', () => {
    const file = (name: string, size: number) => ({ name, size }) as File;
    expect(checkImportFile(file('impor.xls', 1))).toContain('.xlsx');
    expect(checkImportFile(file('impor.xlsm', 1))).toContain('.xlsx');
    expect(checkImportFile(file('impor.xlsx', 0))).toContain('kosong');
    expect(checkImportFile(file('impor.xlsx', 2 * 1024 * 1024 + 1))).toContain('2 MiB');
    expect(checkImportFile(file('impor.xlsx', 2 * 1024 * 1024))).toBeNull();
  });

  it('melewati baris XLSX kosong tanpa mengubah nomor baris sumber', () => {
    const parsed = rowsFromCells(
      [
        { sourceRow: 1, cells: columns },
        { sourceRow: 3, cells: ['0001', 'QAIMP Siswa', ''] },
        { sourceRow: 7, cells: ['0002', 'QAIMP Dua', ''] },
      ],
      columns,
    );
    expect(parsed.rows.map((row) => row.sourceRow)).toEqual([3, 7]);
    expect(parsed.errors).toEqual([]);
  });
  it('template XLSX round-trip mempertahankan header, leading zero, dan baris sumber seperti CSV', async () => {
    const data = [
      columns.map((value) => ({ value, type: String })),
      ['0001', 'QAIMP Siswa', 'catatan'].map((value) => ({ value, type: String })),
    ];
    const buffer = await writeExcelFile(data, { sheet: 'Siswa' }).toBuffer();
    const sheets = await readExcelFile(buffer);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.sheet).toBe('Siswa');
    const xlsx = rowsFromCells(
      sheets[0]!.data.map((cells, index) => ({ sourceRow: index + 1, cells })),
      columns,
    );
    const csv = parseImportCsv(`${header}\n0001,QAIMP Siswa,catatan`, columns);
    expect(xlsx).toEqual(csv);
  });
  it('memetakan hasil parsial ke baris asli dan menolak indeks ambigu', () => {
    const sources = [{ index: 4 }, { index: 8 }];
    expect(
      mapImportResults(
        [
          { index: 1, status: 'error' },
          { index: 0, status: 'ok' },
        ],
        sources,
      ),
    ).toEqual([
      { index: 1, status: 'error', sourceIndex: 8 },
      { index: 0, status: 'ok', sourceIndex: 4 },
    ]);
    expect(mapImportResults([{ index: 0, status: 'ok' }], sources)).toBeNull();
    expect(
      mapImportResults(
        [
          { index: 0, status: 'ok' },
          { index: 0, status: 'error' },
        ],
        sources,
      ),
    ).toBeNull();
    expect(
      mapImportResults(
        [
          { index: 0, status: 'ok' },
          { index: 2, status: 'error' },
        ],
        sources,
      ),
    ).toBeNull();
  });
  it('membaca BOM, CRLF, quoted comma, multiline, escaped quote, trailing empty, dan baris kosong', () => {
    const result = parseImportCsv(
      `\uFEFF${header}\r\n0001,"QAIMP, Siswa","baris 1\r\nbaris ""2"""\r\n\r\n0002,QAIMP Dua,\r\n`,
      columns,
    );
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      { sourceRow: 2, raw: { nis: '0001', name: 'QAIMP, Siswa', note: 'baris 1\r\nbaris "2"' } },
      { sourceRow: 5, raw: { nis: '0002', name: 'QAIMP Dua', note: '' } },
    ]);
  });

  it.each([
    ['quote terbuka', `${header}\n0001,"QAIMP,abc`],
    ['karakter setelah quote', `${header}\n0001,"QAIMP"x,abc`],
    ['sel kurang', `${header}\n0001,QAIMP`],
    ['sel lebih', `${header}\n0001,QAIMP,abc,extra`],
    ['header salah', `name,nis,note\nQAIMP,0001,abc`],
    ['header duplikat', `nis,nis,note\n0001,QAIMP,abc`],
    ['header asing', `nis,name,unknown\n0001,QAIMP,abc`],
    ['header saja', header],
    ['kosong', ''],
  ])('menolak %s', (_case, text) => {
    expect(parseImportCsv(text, columns).errors.length).toBeGreaterThan(0);
  });

  it('menerima 36 dan menolak 37 sebelum payload tersedia', () => {
    const line = '0001,QAIMP,catatan';
    expect(
      parseImportCsv([header, ...Array(IMPORT_MAX_ROWS).fill(line)].join('\n'), columns).errors,
    ).toEqual([]);
    const overflow = parseImportCsv(
      [header, ...Array(IMPORT_MAX_ROWS + 1).fill(line)].join('\n'),
      columns,
    );
    expect(overflow.rows).toEqual([]);
    expect(overflow.dataCount).toBe(37);
    expect(overflow.errors[0]?.message).toContain('36');
  });

  it('baris berisi delimiter kosong bukan blank line', () => {
    const parsed = parseImportCsv(`${header}\n,,\n`, columns);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.sourceRow).toBe(2);
  });

  it('memvalidasi sel berdasarkan makna field, bukan satu tipe Excel untuk semua kolom', () => {
    const typedColumns = [
      { key: 'nis', kind: 'identifier' as const },
      { key: 'joinedAt', kind: 'date' as const },
      { key: 'consent', kind: 'boolean' as const },
    ];
    const result = rowsFromCells(
      [
        { sourceRow: 1, cells: ['nis', 'joinedAt', 'consent'] },
        { sourceRow: 3, cells: ['0001', new Date(2026, 0, 2), true] },
      ],
      typedColumns,
      'Siswa',
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.raw).toEqual({ nis: '0001', joinedAt: '2026-01-02', consent: 'true' });

    const invalid = rowsFromCells(
      [
        { sourceRow: 1, cells: ['nis', 'joinedAt', 'consent'] },
        { sourceRow: 2, cells: [123, '2026-02-30', 'mungkin'] },
        { sourceRow: 3, cells: ['1e+10', '2026-01-01', false] },
      ],
      typedColumns,
      'Siswa',
    );
    expect(invalid.rows).toEqual([]);
    expect(invalid.errors).toHaveLength(4);
    expect(invalid.errors[0]?.message).toContain('cell A2');
    expect(invalid.errors[0]?.message).not.toContain('123');
  });

  it('membangun file template dengan tepat 36 baris kosong dan format identifier/tanggal', async () => {
    const data = buildImportTemplateData([
      { key: 'nis', kind: 'identifier' },
      { key: 'joinedAt', kind: 'date' },
    ]);
    expect(data).toHaveLength(IMPORT_MAX_ROWS + 1);
    expect(data[1]?.[0]).toMatchObject({ value: '', format: '@' });
    expect(data[1]?.[1]).toMatchObject({ type: Date, format: 'yyyy-mm-dd' });
    const buffer = await writeExcelFile(data, { sheet: 'Siswa' }).toBuffer();
    const files = unzipSync(new Uint8Array(buffer));
    const worksheet = strFromU8(files['xl/worksheets/sheet1.xml']!);
    expect(worksheet).toContain('<row r="37"');
    expect(worksheet.match(/<row r=/g) ?? []).toHaveLength(IMPORT_MAX_ROWS + 1);
  });

  it('hanya penolakan sebelum proses yang boleh dicoba ulang dari preview', () => {
    expect([400, 401, 403].every(isConfirmedImportRejection)).toBe(true);
    expect([undefined, 408, 409, 429, 500, 503].some(isConfirmedImportRejection)).toBe(false);
  });
});
