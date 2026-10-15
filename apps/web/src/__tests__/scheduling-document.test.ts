import { buildSchedulingDocument, documentSlotStatus, documentTime, downloadSchedulingWorkbook, openSchedulingPrint, schedulingDocumentHtml, schedulingPresentationSheet, schedulingReportPrintFeature, schedulingWorkbook, type SchedulingDocumentInput } from '@/lib/scheduling-document';
import { patternForPeriod, type BellProfile } from '@/lib/bell-patterns';
import type { ScheduleItem, WorkspaceAssignment } from '@/app/dashboard/jadwal/_components/scheduling-workspace';
import writeXlsx from 'write-excel-file/browser';
import type { CellObject } from 'write-excel-file/browser';

jest.mock('write-excel-file/browser', () => ({ __esModule: true, default: jest.fn() }));
const teacher = (id: string) => ({ id, user: { fullName: `Guru ${id}` } });
const kelas = (id: string) => ({ id, name: `Kelas ${id}`, majorCode: 'QA', grade: 10 });
const assignment = (id: string, t = id, k = id): WorkspaceAssignment => ({ id, teacher: teacher(t), class: kelas(k), subject: `Mapel ${id}`, academicYear: '2026/2027', hoursPerWeek: 4 });
const slot = (id: string, a = assignment(id)): ScheduleItem => ({ id, classId: a.class.id, class: a.class, academicYear: a.academicYear, semester: 1, dayOfWeek: 1, jpStart: 1, jpEnd: 2, room: 'LAB 1', teachingAssignment: { id: a.id, subject: a.subject, teacher: a.teacher } });
const period = { academicYear: { code: '2026/2027' }, number: 1, startDate: '2026-10-05', endDate: '2026-10-10' };
const profile: BellProfile = { id: 'b', code: 'QA', name: 'QA', kind: 'NORMAL', effectiveFrom: period.startDate, effectiveUntil: period.endDate, revokedAt: null, provenance: 'SYNTHETIC', segments: Array.from({ length: 6 }, (_, i) => [1, 2, ...(i === 0 ? [3] : [])].map(jp => ({ dayOfWeek: i + 1, jpNumber: jp, label: `JP ${jp}`, type: 'INSTRUCTION' as const, startMinute: 420 + (jp - 1) * 45, endMinute: 420 + jp * 45, sortOrder: jp }))).flat() };
function input(overrides: Partial<SchedulingDocumentInput> = {}): SchedulingDocumentInput {
  return { view: 'assignments', schoolName: 'Sekolah QA', academicYear: '2026/2027', semester: 1, schedules: [slot('a')], assignments: [assignment('a')], classes: [kelas('a')], subjects: [{ name: 'Mapel a', code: 'BINDO' }, { name: 'Mapel b', code: 'BING' }], bell: patternForPeriod([profile], period), generatedAt: new Date('2026-10-11T06:00:00Z'), ...overrides };
}

describe('Scheduling document complete scope', () => {
  it.each(['assignments', 'classes', 'teachers', 'rooms'] as const)('builds %s with its exact title, period, scope and timestamp', view => {
    const doc = buildSchedulingDocument(input({ view }));
    expect(doc.title).toMatch(/Penugasan Mengajar|Per Kelas|Per Guru|RPS\/LAB/);
    expect(doc.academicYear).toBe('2026/2027'); expect(doc.semesterLabel).toBe('Ganjil (1)');
    expect(doc.periodLabel).toBe('2026-10-05 s.d. 2026-10-10'); expect(doc.generatedLabel).toContain('13.00');
    expect(doc.scopeLabel).toContain('tidak dibatasi pencarian atau halaman');
    expect(doc.sections.flatMap(s => s.schedules).map(s => s.id)).toEqual(['a']);
  });
  it('retains 24 assignments, beyond the 10-row screen page, without mutating input', () => {
    const assignments = Array.from({ length: 24 }, (_, i) => assignment(String(i)));
    const source = input({ assignments, schedules: assignments.map(a => slot(a.id, a)) });
    const before = JSON.stringify(source);
    const doc = buildSchedulingDocument(source);
    expect(doc.sections.flatMap(s => s.assignments)).toHaveLength(24);
    expect(doc.sections.flatMap(s => s.schedules)).toHaveLength(24);
    expect(JSON.stringify(source)).toBe(before);
    expect(schedulingWorkbook(doc).rows).toHaveLength(24);
  });
  it('selected assignment exports ALL subjects and classes of that teacher, not others', () => {
    const assignments = [assignment('a', 't1', 'k1'), assignment('b', 't1', 'k2'), assignment('c', 't2', 'k3')];
    const doc = buildSchedulingDocument(input({ assignments, schedules: assignments.map(a => slot(a.id, a)), selectedId: 'a' }));
    expect(doc.sections).toHaveLength(1); expect(doc.sections[0]!.title).toBe('Guru t1');
    expect(doc.sections[0]!.assignments.map(a => a.id)).toEqual(['a', 'b']);
    expect(doc.sections[0]!.schedules.map(s => s.id)).toEqual(['a', 'b']);
  });
  it.each(['classes', 'teachers', 'rooms'] as const)('selected %s contains only that resource', view => {
    const a = assignment('a'), b = assignment('b');
    const doc = buildSchedulingDocument(input({ view, assignments: [a, b], schedules: [slot('a', a), { ...slot('b', b), room: 'LAB 2' }], selectedId: view === 'rooms' ? 'LAB 2' : 'b' }));
    expect(doc.sections).toHaveLength(1); expect(doc.sections[0]!.schedules.map(s => s.id)).toEqual(['b']);
  });
  it.each(['assignments', 'classes', 'teachers', 'rooms'] as const)('rejects stale selection in %s', view => {
    expect(() => buildSchedulingDocument(input({ view, selectedId: 'missing' }))).toThrow(/Pilihan/);
  });
  it('rejects a period mismatch or invalid semester rather than exporting stale data', () => {
    expect(() => buildSchedulingDocument(input({ semester: 2 }))).toThrow(/periode/);
    expect(() => buildSchedulingDocument(input({ academicYear: '2027/2028' }))).toThrow(/periode/);
    expect(() => buildSchedulingDocument(input({ semester: 0 }))).toThrow(/Periode/);
  });
  it('retains empty classes and teachers with unscheduled assignments in print and workbook', () => {
    for (const view of ['classes', 'teachers'] as const) {
      const doc = buildSchedulingDocument(input({ view, schedules: [] }));
      expect(doc.sections).toHaveLength(1); expect(schedulingWorkbook(doc).rows).toHaveLength(1);
      expect(schedulingDocumentHtml(doc)).toContain('Belum ada slot jadwal tersimpan');
      expect(schedulingWorkbook(doc).rows[0]![18]).toBe('Belum ada slot tersimpan');
    }
  });
  it('retains a legacy slot not in the assignment catalog and all overlapping slots', () => {
    const doc = buildSchedulingDocument(input({ schedules: [slot('a'), slot('b')], assignments: [] }));
    expect(doc.sections.flatMap(s => s.schedules)).toHaveLength(2);
    expect(schedulingWorkbook(doc).rows).toHaveLength(2);
  });
  it('normalizes RPS labels without certifying capacity or including theory rooms', () => {
    const doc = buildSchedulingDocument(input({ view: 'rooms', schedules: [slot('a'), { ...slot('b'), room: ' lab   1 ' }, { ...slot('c'), room: 'GC 1' }] }));
    expect(doc.sections).toHaveLength(1); expect(doc.sections[0]!.schedules).toHaveLength(2);
    expect(doc.notes.join(' ')).toContain('bukan inventaris atau bukti kapasitas');
  });
  it('represents truly empty accessible data without inventing a school or schedule', () => {
    const doc = buildSchedulingDocument(input({ schoolName: '', schedules: [], assignments: [], classes: [] }));
    expect(doc.schoolName).toContain('nama sekolah belum tersedia');
    expect(doc.sections).toHaveLength(0); expect(schedulingDocumentHtml(doc)).toContain('Belum ada data');
  });
});

describe('Printed timing and safe content', () => {
  it('uses configured 45-minute JP and different daily JP counts, not fixed 40 minutes', () => {
    const doc = buildSchedulingDocument(input({ view: 'classes' }));
    expect(documentTime(slot('a'), doc.bell)).toBe('07:00–08:30 WIB');
    expect(doc.bell.slotsForDay(1)).toHaveLength(3); expect(doc.bell.slotsForDay(2)).toHaveLength(2);
    expect(schedulingDocumentHtml(doc)).toContain('JP 3');
  });
  it('does not print fabricated times when bell is incomplete or the range has gaps', () => {
    const doc = buildSchedulingDocument(input({ bell: patternForPeriod([], period) }));
    expect(documentTime(slot('a'), doc.bell)).toBe('Waktu JP belum tersedia');
    expect(doc.notes).toContain(doc.bell.problem);
    expect(documentTime({ ...slot('a'), jpEnd: 4 }, input().bell)).toBe('Waktu JP belum tersedia');
  });
  it('does not claim one time where profiles vary during the semester', () => {
    const doc = buildSchedulingDocument(input({ bell: { ...input().bell, varies: true, slotsForDay: day => input().bell.slotsForDay(day).map(s => ({ ...s, timingVaries: true })) } }));
    expect(documentTime(slot('a'), doc.bell)).toContain('Waktu bervariasi');
    expect(doc.notes.join(' ')).toContain('periksa tanggal');
  });
  it('prints Sunday slots instead of dropping the seventh day', () => {
    const doc = buildSchedulingDocument(input({ view: 'classes', schedules: [{ ...slot('a'), dayOfWeek: 7 }] }));
    expect(schedulingDocumentHtml(doc)).toContain('Minggu');
  });
  it('marks concurrent sessions and expiry without declaring an exception active', () => {
    const item = { ...slot('a'), concurrencyGroup: { id: 'g', mode: 'AUTHORIZED_EXCEPTION', expiresOn: '2026-10-01' } };
    expect(documentSlotStatus(item, new Map([['a', ['Guru bentrok']]]))).toBe('Pengecualian tercatat · s.d. 2026-10-01 · Guru bentrok');
    expect(documentSlotStatus({ ...item, concurrencyGroup: { id: 'g', mode: 'JOINT_CLASS', expiresOn: null } }, new Map())).toContain('Kelas gabungan tercatat');
  });
  it('escapes all user-sourced text and includes no executable scripts or raw URLs', () => {
    const evil = '</td><script>alert(1)</script><img src=x onerror=alert(2)> & "';
    const a = { ...assignment('a'), subject: evil, teacher: { id: 't', user: { fullName: evil } }, class: { ...kelas('k'), name: evil } };
    const doc = buildSchedulingDocument(input({ schoolName: evil, assignments: [a], schedules: [{ ...slot('a', a), room: evil }] }));
    const html = schedulingDocumentHtml(doc);
    expect(html).not.toContain('<script>'); expect(html).not.toContain('<img'); expect(html).toContain('&lt;script&gt;');
    expect(doc.filename).not.toMatch(/[<>/\\]/);
  });
  it('has landscape print CSS, repeated table headers, wrap, color and page numbers', () => {
    const html = schedulingDocumentHtml(buildSchedulingDocument(input()));
    expect(html).toContain('size:A4 landscape'); expect(html).toContain('display:table-header-group');
    expect(html).toContain('overflow-wrap:anywhere'); expect(html).toContain('print-color-adjust:exact');
    expect(html).toContain('counter(page)'); expect(html).toContain('Sekolah QA');
    expect(html).toContain('.weekly td{font-size:7.5pt}');
    expect(html).toContain('.weekly th,.weekly td{padding:3px}');
    expect(html).toContain('.entity>p.muted{break-inside:avoid;break-after:avoid}');
  });
});

describe('Export actions', () => {
  beforeEach(() => jest.clearAllMocks());
  it('sets supported landscape print fitting only on the report and rejects changed writer structure', () => {
    const transform = schedulingReportPrintFeature.files!.transform!['xl/worksheets/sheet{id}.xml']!.transform!;
    const xml = '<worksheet xmlns="test"><sheetViews/><sheetData/><pageSetup paperSize="9" orientation="landscape"/></worksheet>';
    const properties = { sheetIndex: 0, sheetId: '1' };
    const report = transform(xml, { sheet: 'Laporan' }, properties);
    expect(report).toContain('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
    expect(report).toContain('fitToWidth="1" fitToHeight="0"');
    expect(transform(xml, { sheet: 'Data Jadwal' }, properties)).toBe(xml);
    expect(() => transform('<worksheet/>', { sheet: 'Laporan' }, properties)).toThrow(/Pengaturan cetak/);
    expect(() => transform(report, { sheet: 'Laporan' }, properties)).toThrow(/Pengaturan cetak/);
  });
  it('writes a presentation report plus full data and information sheets, with safe typed external values', async () => {
    const toFile = jest.fn().mockResolvedValue(undefined);
    jest.mocked(writeXlsx).mockReturnValue({ toFile, toBlob: async () => new Blob() });
    const a = { ...assignment('a'), subject: '=HYPERLINK("x")' };
    await downloadSchedulingWorkbook(buildSchedulingDocument(input({ assignments: [a], schedules: [slot('a', a)] })));
    const sheets = jest.mocked(writeXlsx).mock.calls[0]![0];
    expect(sheets).toHaveLength(3);
    expect(sheets).toEqual(expect.arrayContaining([expect.objectContaining({ sheet: 'Laporan', showGridLines: false }), expect.objectContaining({ sheet: 'Data Jadwal' })]));
    expect(JSON.stringify(sheets)).not.toContain('Formula');
    expect(JSON.stringify(sheets)).toContain('=HYPERLINK');
    expect(toFile).toHaveBeenCalledWith(expect.stringMatching(/Daftar-Penugasan-Mengajar-seluruh.*\.xlsx$/));
  });
  it('provides monochrome without changing font sizes, subject codes, conflict text or session coverage', () => {
    const doc = buildSchedulingDocument(input({ view: 'teachers', schedules: [slot('a'), { ...slot('b'), jpStart: 1, jpEnd: 2 }] }));
    const color = schedulingDocumentHtml(doc), mono = schedulingDocumentHtml(doc, 'monochrome');
    expect(color).toContain('data-color-mode="color"');
    expect(mono).toContain('data-color-mode="monochrome"');
    expect(mono).toContain('.lesson,.legend b{background:white!important');
    expect(mono).toContain('Bentrok'); expect(mono).toContain('BINDO'); expect(mono).not.toContain('M01');
    expect(mono).toContain('.weekly td{font-size:7.5pt}');
    expect(mono.match(/<section class="entity">/g)).toHaveLength(doc.sections.length);
  });
  it.each(['assignments', 'classes', 'teachers', 'rooms'] as const)('keeps %s report metadata, all source sessions and missing assignment coverage', view => {
    const a = assignment('a'), b = assignment('b', 'a', 'a');
    const doc = buildSchedulingDocument(input({ view, assignments: [a, b], schedules: [slot('a')] }));
    const report = schedulingPresentationSheet(doc);
    const content = JSON.stringify(report.data);
    expect(content).toContain(doc.title); expect(content).toContain(doc.academicYear);
    expect(content).toContain(doc.periodLabel); expect(content).toContain('Mapel a');
    if (view !== 'rooms') { expect(content).toContain('Mapel b'); expect(content).toContain('Belum dijadwalkan'); }
    if (view !== 'assignments') { expect(content).toContain('BINDO'); expect(content).toContain('07:00'); }
    expect(report.columns).toHaveLength(8);
  });
  it('retains simultaneous slots, seventh day, variable timing and expiry labels in Excel', () => {
    const a = assignment('a', 't', 'a'), b = assignment('b', 't', 'b');
    const doc = buildSchedulingDocument(input({ view: 'teachers', assignments: [a, b], schedules: [slot('a', a), slot('b', b),
      { ...slot('sun', a), dayOfWeek: 7, concurrencyGroup: { id: 'g', mode: 'AUTHORIZED_EXCEPTION', expiresOn: '2026-10-01' } }] }));
    const content = JSON.stringify(schedulingPresentationSheet(doc).data);
    expect(content).toContain('BINDO'); expect(content).toContain('BING'); expect(content).toContain('BENTROK');
    expect(content).toContain('Minggu'); expect(content).toContain('s.d. 2026-10-01');
    expect(content).toContain('Waktu JP belum tersedia');
  });
  it('propagates download failure to the UI recovery path', async () => {
    jest.mocked(writeXlsx).mockReturnValue({ toFile: jest.fn().mockRejectedValue(new Error('Unduh gagal')), toBlob: async () => new Blob() });
    await expect(downloadSchedulingWorkbook(buildSchedulingDocument(input()))).rejects.toThrow('Unduh gagal');
  });
  it('reports popup blocking without claiming print success', () => {
    const original = global.window;
    Object.defineProperty(global, 'window', { configurable: true, value: { open: () => null } });
    try { expect(() => openSchedulingPrint(buildSchedulingDocument(input()))).toThrow(/diblokir/); }
    finally { Object.defineProperty(global, 'window', { configurable: true, value: original }); }
  });
});

describe('Official subject catalog codes', () => {
  it.each(['classes', 'teachers', 'rooms'] as const)('uses the same catalog codes in global/selected %s PDF and Excel, independent of ordering', view => {
    const a = assignment('a', 't1', 'k1'), b = assignment('b', 't2', 'k2');
    const source = input({ view, assignments: [b, a], schedules: [slot('b', b), slot('a', a)] });
    const before = JSON.stringify(source);
    const selectedId = view === 'classes' ? 'k1' : view === 'teachers' ? 't1' : 'LAB 1';
    for (const doc of [buildSchedulingDocument(source), buildSchedulingDocument({ ...source, selectedId })]) {
      for (const format of ['color', 'monochrome'] as const) {
        const html = schedulingDocumentHtml(doc, format);
        expect(html).toContain('<strong>BINDO</strong>');
        expect(html).not.toMatch(/M0[12]/);
      }
      const data = JSON.stringify(schedulingPresentationSheet(doc).data);
      expect(data).toContain('BINDO'); expect(data).not.toMatch(/M0[12]/);
    }
    expect(JSON.stringify(source)).toBe(before);
  });
  it.each([
    [],
    [{ name: 'Mapel lain', code: 'OTHER' }],
    [{ name: 'mapel a', code: 'CASE' }],
    [{ name: 'Mapel a', code: 'ONE' }, { name: 'Mapel a', code: 'TWO' }],
    [{ name: 'Mapel a', code: 'SAME' }, { name: 'Mapel b', code: 'SAME' }],
    [{ name: 'Mapel a', code: ' ' }],
  ].map(subjects => ({ subjects })))('uses the full subject name when catalog matching is missing or ambiguous: %j', ({ subjects }) => {
    const doc = buildSchedulingDocument(input({ view: 'classes', subjects }));
    const html = schedulingDocumentHtml(doc);
    expect(html).toContain('<strong>Mapel a</strong>');
    expect(html).toContain('kode katalog belum tersedia atau tidak unik');
    expect(html).not.toMatch(/M0[12]/);
    const data = JSON.stringify(schedulingPresentationSheet(doc).data);
    expect(data).toContain('Mapel a · JP'); expect(data).not.toMatch(/M0[12]/);
  });
  it('escapes catalog codes in PDF and keeps them typed strings in Excel, without executing them', () => {
    const code = '</strong><script>bad()</script>=HYPERLINK("x")';
    const doc = buildSchedulingDocument(input({ view: 'teachers', subjects: [{ name: 'Mapel a', code }] }));
    const html = schedulingDocumentHtml(doc);
    expect(html).not.toContain('<script>'); expect(html).toContain('&lt;script&gt;');
    const cells = schedulingPresentationSheet(doc).data.flat().filter((cell): cell is CellObject => cell !== null && typeof cell === 'object' && 'value' in cell && String(cell.value).includes('HYPERLINK'));
    expect(cells.length).toBeGreaterThan(0); expect(cells.every(cell => cell?.type === String)).toBe(true);
  });
});
