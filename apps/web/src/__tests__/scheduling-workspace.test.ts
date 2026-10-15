import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { z } from 'zod';
import {
  allocatedJp,
  coverageStatus,
  coverageSummary,
  normalizedRoom,
  practiceRoomLabels,
  readWorkspacePages,
  readSchedulingSubjects,
  timetableLanes,
  timetableGroups,
  WorkspaceAssignmentSchema,
  type ScheduleItem,
} from '@/app/dashboard/jadwal/_components/scheduling-workspace';
import SchedulingDisclosure from '@/app/dashboard/jadwal/_components/SchedulingDisclosure';
import JadwalMatrix from '@/app/dashboard/jadwal/_components/JadwalMatrix';
import { BellPatternProvider } from '@/components/providers/BellPatternProvider';
jest.mock('@/app/dashboard/jadwal/actions', () => ({
  fetchScheduleList: jest.fn(),
  fetchSchedulingAssignments: jest.fn(),
  fetchSchedulingSubjectCatalog: jest.fn(),
}));
jest.mock('@/app/dashboard/jadwal/_components/JadwalForm', () => ({
  __esModule: true,
  default: () => null,
}));
// The incumbent pagination uses Next's automatic JSX; the real widget is exercised in browser QA.
jest.mock('@/components/ui/table-pagination', () => ({ TablePagination: () => null }));
const teacher = { id: 't1', user: { fullName: 'Guru Sintetis' } };
const kelas = { id: 'k1', name: 'X TKJ Sintetis', majorCode: 'TKJ', grade: 10 };
const assignment = {
  id: 'a1',
  academicYear: '2026/2027',
  hoursPerWeek: 4,
  subject: 'Praktik Jaringan',
  teacher,
  class: kelas,
};
const schedule: ScheduleItem = {
  id: 's1',
  classId: 'k1',
  class: kelas,
  academicYear: '2026/2027',
  semester: 1,
  dayOfWeek: 1,
  jpStart: 1,
  jpEnd: 2,
  room: 'LAB 1',
  teachingAssignment: { id: 'a1', subject: assignment.subject, teacher },
};

describe('compact overlap summaries', () => {
  const slot = (id: string, jpStart: number, jpEnd: number): ScheduleItem => ({
    ...schedule,
    id,
    jpStart,
    jpEnd,
  });
  it('preserves every simultaneous session rather than selecting the first', () => {
    const items = [slot('c', 2, 3), slot('a', 2, 3), slot('b', 2, 3)];
    expect(timetableGroups(items).map((group) => group.map((item) => item.id))).toEqual([
      ['a', 'b', 'c'],
    ]);
    expect(items.map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });
  it('groups transitively connected overlaps without losing later sessions', () => {
    expect(
      timetableGroups([slot('c', 5, 6), slot('a', 1, 3), slot('b', 3, 5)]).map((group) =>
        group.map((item) => item.id),
      ),
    ).toEqual([['a', 'b', 'c']]);
  });
  it('keeps adjacent non-overlapping sessions separate', () => {
    expect(
      timetableGroups([slot('b', 3, 4), slot('a', 1, 2)]).map((group) =>
        group.map((item) => item.id),
      ),
    ).toEqual([['a'], ['b']]);
  });
  it('accepts an empty day without fabricating a session', () => {
    expect(timetableGroups([])).toEqual([]);
  });
});

describe('complete bounded scheduling reads', () => {
  const schema = z.object({ id: z.string() });
  it('collects subsequent pages before certifying full counts', async () => {
    const request = jest.fn(async (page: number) => ({
      success: true as const,
      data: {
        data: Array.from({ length: page === 1 ? 100 : 3 }, (_, i) => ({
          id: String((page - 1) * 100 + i),
        })),
        total: 103,
        page,
      },
    }));
    expect(await readWorkspacePages(request, schema)).toHaveLength(103);
    expect(request.mock.calls.map((call) => call[0])).toEqual([1, 2]);
  });
  it('accepts a real empty list, not an error masquerading as empty', async () => {
    expect(
      await readWorkspacePages(
        async () => ({ success: true, data: { data: [], total: 0, page: 1 } }),
        schema,
      ),
    ).toEqual([]);
  });
  it.each([
    { data: [], total: 2, page: 1 },
    { data: [{ id: 's' }], total: 0, page: 1 },
    { data: [{ id: 's' }, { id: 's' }], total: 2, page: 1 },
    { data: [{ id: 's' }], total: 1, page: 2 },
    { data: [{ id: 's' }], total: 5001, page: 1 },
    { data: [{ id: 1 }], total: 1, page: 1 },
  ])('rejects incomplete, duplicate, wrong-page or malformed payload %#', async (data) => {
    await expect(
      readWorkspacePages(async () => ({ success: true, data }), schema),
    ).rejects.toThrow();
  });
  it('rejects count drift during pagination', async () => {
    await expect(
      readWorkspacePages(
        async (page) => ({
          success: true,
          data: { data: [{ id: String(page) }], total: page === 1 ? 2 : 3, page },
        }),
        schema,
      ),
    ).rejects.toThrow('Data berubah');
  });
  it('rejects a denied/error read without substituting []', async () => {
    await expect(
      readWorkspacePages(async () => ({ success: false, error: 'Akses ditolak' }), schema),
    ).rejects.toThrow('Akses ditolak');
  });
});

describe('complete catalog reads for official document codes', () => {
  const rows = Array.from({ length: 201 }, (_, i) => ({ id: String(i), name: `Mapel ${i}`, code: `CODE${i}`, isActive: i !== 0, createdAt: 'not exported' }));
  it('reads beyond one page, includes inactive historical subjects and strips unrelated fields', async () => {
    const request = jest.fn(async (offset: number, limit: number) => ({ success: true as const, data: { data: rows.slice(offset, offset + limit), total: rows.length, offset, limit } }));
    const catalog = await readSchedulingSubjects(request);
    expect(catalog).toHaveLength(201); expect(catalog[0]).toEqual({ name: 'Mapel 0', code: 'CODE0' });
    expect(request.mock.calls).toEqual([[0, 200], [200, 200]]);
  });
  it('accepts an empty successful catalog', async () => {
    expect(await readSchedulingSubjects(async () => ({ success: true, data: { data: [], total: 0, offset: 0, limit: 200 } }))).toEqual([]);
  });
  it.each([
    { data: [], total: 1, offset: 0, limit: 200 },
    { data: [rows[0]], total: 0, offset: 0, limit: 200 },
    { data: [rows[0]], total: 1, offset: 200, limit: 200 },
    { data: [rows[0]], total: 1, offset: 0, limit: 100 },
    { data: [rows[0], rows[0]], total: 2, offset: 0, limit: 200 },
    { data: [{ ...rows[0], code: '' }], total: 1, offset: 0, limit: 200 },
    { data: [], total: 5001, offset: 0, limit: 200 },
  ])('rejects incomplete/malformed/duplicate catalog rather than using partial codes: %j', async data => {
    await expect(readSchedulingSubjects(async () => ({ success: true, data }))).rejects.toThrow(/katalog/i);
  });
  it('rejects a denied or failed page after a successful first page', async () => {
    await expect(readSchedulingSubjects(async (offset, limit) => offset === 0
      ? { success: true, data: { data: rows.slice(0, 200), total: rows.length, offset, limit } }
      : { success: false, error: 'Tidak diizinkan' })).rejects.toThrow('Tidak diizinkan');
  });
  it('rejects changing total during pagination', async () => {
    await expect(readSchedulingSubjects(async (offset, limit) => ({ success: true, data: { data: rows.slice(offset, offset + limit), total: offset ? 200 : 201, offset, limit } }))).rejects.toThrow(/berubah/);
  });
});
describe('real-data projections', () => {
  it('strips unrelated staff personal data before the browser boundary', () => {
    const actual = WorkspaceAssignmentSchema.parse({
      ...assignment,
      teacher: {
        ...teacher,
        user: { ...teacher.user, email: 'private@example.invalid', staff: { niy: 'private' } },
      },
      schedules: [{ id: 'unused' }],
    });
    expect(actual).toEqual(assignment);
    expect(JSON.stringify(actual)).not.toMatch(/private|email|niy/);
  });
  it('uses assignment identity, not subject/class identity, for productive competency allocations', () => {
    const second = {
      ...schedule,
      id: 's2',
      jpStart: 3,
      jpEnd: 4,
      teachingAssignment: { ...schedule.teachingAssignment, id: 'a2' },
    };
    expect(allocatedJp([schedule, second], 'a1')).toBe(2);
    expect(allocatedJp([schedule, second], 'a2')).toBe(2);
    expect(
      coverageSummary([assignment, { ...assignment, id: 'a2' }], [schedule, second]),
    ).toMatchObject({ partial: 2, complete: 0, target: 8, credited: 4, percentage: 50 });
  });
  it.each([
    [4, 0, 'empty'],
    [4, 2, 'partial'],
    [4, 4, 'complete'],
    [4, 5, 'excess'],
    [0, 0, 'empty'],
  ] as const)('coverage %s/%s is %s', (target, actual, status) =>
    expect(coverageStatus(target, actual)).toBe(status),
  );
  it('does not invent a percentage when no target exists', () =>
    expect(coverageSummary([], []).percentage).toBeNull());
  it('normalizes actual practice labels without calling general classrooms labs', () => {
    expect(normalizedRoom(' lab   tkj 1 ')).toBe('LAB TKJ 1');
    expect(
      practiceRoomLabels([
        schedule,
        { ...schedule, id: 'b', room: ' lab 1 ' },
        { ...schedule, id: 'c', room: 'GE. 5' },
        { ...schedule, id: 'd', room: 'Bengkel TKR' },
      ]),
    ).toEqual(['BENGKEL TKR', 'LAB 1']);
  });
  it('overlapping entries remain visible in different timetable lanes', () => {
    const overlap = { ...schedule, id: 's2', jpStart: 2, jpEnd: 4, classId: 'k2' };
    const later = { ...schedule, id: 's3', jpStart: 5, jpEnd: 6 };
    const lanes = timetableLanes([overlap, later, schedule]);
    expect(lanes).toHaveLength(2);
    expect(
      lanes
        .flat()
        .map((s) => s.id)
        .sort(),
    ).toEqual(['s1', 's2', 's3']);
    expect(lanes[0]!.map((s) => s.id)).toEqual(['s1', 's3']);
  });
});
describe('scheduling SSR interaction contracts', () => {
  it('JP configuration is closed by default with a native accessible button', () => {
    const html = renderToStaticMarkup(
      React.createElement(SchedulingDisclosure, {
        summary: '8–10 JP per hari',
        children: React.createElement('input', { 'aria-label': 'Jumlah JP' }),
      }),
    );
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('hidden=""');
    expect(html).toContain('aria-controls=');
    expect(html).toContain('Konfigurasi Jam Pelajaran');
  });
  function render(staff: boolean, canReadAssignments: boolean, canManage: boolean) {
    return renderToStaticMarkup(
      React.createElement(BellPatternProvider, {
        profiles: [],
        children: React.createElement(JadwalMatrix, {
          initialSchedules: [schedule],
          initialTotal: 21,
          initialPage: 1,
          classes: [kelas],
          academicYears: [{ id: 'y1', code: '2026/2027', isActive: true }],
          initialAcademicYear: '2026/2027',
          initialSemester: 1,
          isStaff: staff,
          canReadAssignments,
          canManage,
        }),
      }),
    );
  }
  it('has the four requested tabs for authorized staff, without fake solver readiness', () => {
    const html = render(true, true, true);
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html).toContain('Jadwal RPS/LAB');
    expect(html).not.toContain('Jadwal Per Ruang');
    expect(html).toContain('Solver: wave lanjutan');
    expect(html).not.toContain('21 slot');
    expect(html).toContain('Memuat jadwal dan penugasan');
    expect(html).not.toContain('role="progressbar"');
    const coverageElement = html.match(/<div[^>]*aria-label="Cakupan target JP"[^>]*>/)?.[0];
    expect(coverageElement).toBeDefined();
    expect(coverageElement).not.toContain('aria-valuenow=');
    // The width separator has its own value even while schedule data is still loading.
    expect(html).toContain('aria-label="Atur lebar daftar dan pratinjau jadwal"');
  });
  it('does not expose assignment/import/mutation controls to a learner', () => {
    const html = render(false, false, false);
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).not.toContain('Penugasan Mengajar');
    expect(html).not.toContain('Impor Jadwal');
    expect(html).not.toContain('Tambah Slot');
    expect(html).not.toContain('Jadwal RPS/LAB');
  });
});
