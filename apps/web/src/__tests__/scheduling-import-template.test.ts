import { buildSchedulingTemplateData, downloadSchedulingTemplate, schedulingTemplateColumns,
  schedulingTemplateCsv, schedulingTemplateSheets, suggestSchedulingTemplateColumns } from '@/lib/scheduling-import-template';
import { downloadImportBlob } from '@/lib/operational-import';
import writeXlsxFile from 'write-excel-file/browser';

jest.mock('@/lib/operational-import', () => ({ downloadImportBlob: jest.fn() }));
jest.mock('write-excel-file/browser', () => ({ __esModule: true, default: jest.fn() }));

describe('Scheduling template contract', () => {
  const headers = ['Penugasan', 'Hari', 'JP mulai', 'JP selesai', 'Ruang'];
  beforeEach(() => jest.clearAllMocks());

  it('has exactly the same five headers in CSV and XLSX without sample or blank data rows', () => {
    const data = buildSchedulingTemplateData();
    expect(data).toHaveLength(1);
    expect(data[0]!.map((cell) => cell.value)).toEqual(headers);
    expect(schedulingTemplateCsv()).toBe('\uFEFF' + headers.join(',') + '\r\n');
    expect(schedulingTemplateColumns.map((column) => column.header)).toEqual(headers);
  });

  it('does not map optional session index: blank optional indices cannot become invalid rows', () => {
    expect(suggestSchedulingTemplateColumns(headers)).toEqual({ assignment: 0, day: 1, jpStart: 2, jpEnd: 3, room: 4 });
    expect(suggestSchedulingTemplateColumns(headers)).not.toHaveProperty('sessionIndex');
  });

  it('suggests exact unique headers in any order and does not guess custom headers', () => {
    expect(suggestSchedulingTemplateColumns(['Ruang', 'JP selesai', 'Penugasan', 'Hari', 'JP mulai']))
      .toEqual({ room: 0, jpEnd: 1, assignment: 2, day: 3, jpStart: 4 });
    expect(suggestSchedulingTemplateColumns(['Teacher', 'hari', ' JP mulai ', 'Grup resmi'])).toEqual({});
    expect(suggestSchedulingTemplateColumns(['Penugasan', 'Penugasan', 'Hari'])).toEqual({ day: 2 });
  });

  it('downloads CSV using the existing user-import blob helper with UTF-8 and BOM', async () => {
    await downloadSchedulingTemplate('CSV');
    const call = jest.mocked(downloadImportBlob).mock.calls[0]!;
    expect(call[1]).toBe('template-jadwal-diis.csv');
    expect(call[0].type).toBe('text/csv;charset=utf-8');
    expect(Buffer.from(await call[0].arrayBuffer()).subarray(0, 3).toString('hex')).toBe('efbbbf');
    expect(await call[0].text()).toBe(headers.join(',') + '\r\n');
    expect(writeXlsxFile).not.toHaveBeenCalled();
  });

  it('downloads the input sheet first, with separate reference and guidance sheets', async () => {
    const toFile = jest.fn().mockResolvedValue(undefined);
    jest.mocked(writeXlsxFile).mockReturnValue({ toFile, toBlob: async () => new Blob() });
    await downloadSchedulingTemplate('XLSX');
    expect(writeXlsxFile).toHaveBeenCalledWith(schedulingTemplateSheets());
    expect(schedulingTemplateSheets().map(s => s.sheet)).toEqual(['Jadwal', 'Referensi Penugasan', 'Panduan']);
    expect(schedulingTemplateSheets()[0]!.data).toEqual(buildSchedulingTemplateData());
    expect(toFile).toHaveBeenCalledWith('template-jadwal-diis.xlsx');
    expect(downloadImportBlob).not.toHaveBeenCalled();
  });

  it('keeps distinct productive assignments and exact copyable IDs, without guessing names or sessions', () => {
    const assignments = [
      { id: '00000000-0000-4000-8000-000000000002', className: 'X TKJ', subject: '=SUM(1,2)', teacherName: 'Guru B', targetJp: 4 },
      { id: '00000000-0000-4000-8000-000000000001', className: 'X TKJ', subject: '=SUM(1,2)', teacherName: 'Guru A', targetJp: 6 },
    ];
    const sheets = schedulingTemplateSheets({ assignments, academicYear: '2026/2027', semester: 1,
      effectiveFrom: '2026-07-13', effectiveUntil: '2026-12-19', classNames: ['X TKJ'] });
    expect(sheets[0]!.data).toHaveLength(1);
    expect(sheets[1]!.data).toHaveLength(3);
    expect(JSON.stringify(sheets[1]!.data)).toContain(assignments[0]!.id);
    expect(JSON.stringify(sheets[1]!.data)).toContain(assignments[1]!.id);
    const rows = sheets[1]!.data!;
    expect(rows[1]![0]).toMatchObject({ value: assignments[1]!.id, type: String });
    expect(rows[1]![2]).toMatchObject({ value: '=SUM(1,2)', type: String });
    expect(rows[1]![4]).toMatchObject({ value: 6, type: Number });
    expect(JSON.stringify(sheets[2]!.data)).toContain('2026/2027');
    expect(JSON.stringify(sheets[2]!.data)).toContain('ulangi kode yang sama');
    expect(assignments[0]!.teacherName).toBe('Guru B'); // source order preserved
  });

  it('propagates writer failure so the dialog can show recovery instead of success', async () => {
    jest.mocked(writeXlsxFile).mockReturnValue({ toFile: jest.fn().mockRejectedValue(new Error('synthetic download failed')), toBlob: async () => new Blob() });
    await expect(downloadSchedulingTemplate('XLSX')).rejects.toThrow('synthetic download failed');
  });
});
