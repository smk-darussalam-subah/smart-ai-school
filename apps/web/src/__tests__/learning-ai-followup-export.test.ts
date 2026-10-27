const mockToFile = jest.fn(async () => undefined);
const mockXlsx = jest.fn((_sheets: Array<{ data: Array<Array<{ value?: unknown } | null>> }>) => ({
  toFile: mockToFile,
}));
jest.mock('write-excel-file/browser', () => ({
  __esModule: true,
  default: (...args: Parameters<typeof mockXlsx>) => mockXlsx(...args),
}));
import {
  downloadLearningRecap,
  learningDocumentHtml,
  type LearningDocumentInput,
} from '@/lib/learning-recap-document';
const input: LearningDocumentInput = {
  academicYear: '2026/2027',
  semester: 1,
  from: '2026-10-19',
  until: '2026-10-21',
  scopeLabel: 'Guru <QA>',
  rows: [],
  codes: {},
};
describe('R05 shared recap export narrative', () => {
  it.each([false, true])('print/PDF notes are accurate and escaped (monochrome=%s)', (mono) => {
    const html = learningDocumentHtml(input, mono);
    expect(html).toContain('Rincian absensi per JP tersedia pada sesi yang dipilih');
    expect(html).not.toContain('harian');
    expect(html).not.toContain('Absensi siswa disimpan sebagai absensi harian kelas');
    expect(html).toContain('Guru &lt;QA&gt;');
    expect(html).not.toContain('Guru <QA>');
    expect(html).toContain('2026/2027');
    expect(html).toContain('Semester 1 (Ganjil)');
  });
  it('XLSX consumes the same per-JP notes, not a second stale narrative', async () => {
    await downloadLearningRecap(input);
    const values = mockXlsx.mock.calls[0]![0][0]!.data.flatMap((row) =>
      row.flatMap((cell) => (cell?.value === undefined ? [] : [String(cell.value)])),
    );
    expect(values).toContain(
      'Status selesai tidak otomatis menandakan seluruh catatan pembelajaran lengkap. Rincian absensi per JP tersedia pada sesi yang dipilih.',
    );
    expect(values.join('\n')).not.toContain('Absensi siswa disimpan sebagai absensi harian kelas');
    expect(values.join('\n')).not.toContain('harian');
    expect(mockToFile).toHaveBeenCalledWith('rekap-pembelajaran-2026-10-19-2026-10-21.xlsx');
  });
});
