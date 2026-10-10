import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BellPatternProvider } from '@/components/providers/BellPatternProvider';
import { slotsForDay, type BellProfile } from '@/lib/bell-patterns';
import { readLearnerSchedule } from '@/lib/learner-schedule';
import type { ScheduleItem } from '@/app/dashboard/akademik/_components/guru-types';
import type { AttendanceItem } from '@/lib/api';
import BerandaOrtu from '@/app/dashboard/akademik/_components/ortu/BerandaOrtu';
import BerandaSiswa from '@/app/dashboard/akademik/_components/siswa/BerandaSiswa';
import JadwalSiswa from '@/app/dashboard/akademik/_components/siswa/JadwalSiswa';
import LearnerScheduleNotice from '@/app/dashboard/akademik/_components/LearnerScheduleNotice';
import SiswaWorkspace from '@/app/dashboard/akademik/_components/siswa/SiswaWorkspace';
import { filterByStudentId, mapTodaySchedule } from '@/app/dashboard/akademik/_components/ortu/ortu-mappers';
import { scheduleClassName, studentLessonPhase, transformApiSchedule } from '@/app/dashboard/akademik/_components/siswa/siswa-data';

const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { name: 'Siswa sintetis' } } }) }));
jest.mock('@/app/dashboard/akademik/actions', () => ({ fetchTeachers: jest.fn(), fetchDailyQuests: jest.fn(), fetchPersonalCalendar: jest.fn() }));
jest.mock('@/app/dashboard/akademik/_components/ortu/RemedialOrtu', () => ({ __esModule: true, default: () => null }));
// Isolate unrelated screens/modals; keep the real workspace and schedule/home renderers.
jest.mock('@/components/layout/ViewAsBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/shared/PushNotificationToggle', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/shared/LogoutButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/ModulSiswa', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/ModulDetailSiswa', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/NilaiSiswa', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/TugasSiswa', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/KehadiranSiswa', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/CapaianSiswa', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/ProfileCV', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/PengumumanModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/BadgeCelebration', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/LessonSessionModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/ClassDetailModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/TaskDetailModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/DayDetailModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/BadgeDetailModal', () => ({ __esModule: true, default: () => null }));

const profile: BellProfile = {
  id: 'test', code: 'test', name: 'Synthetic', kind: 'NORMAL', provenance: 'test', revokedAt: null,
  effectiveFrom: '2020-01-01', effectiveUntil: '2030-12-31',
  segments: [
    { dayOfWeek: 0, type: 'INSTRUCTION', jpNumber: 1, label: 'JP 1', startMinute: 450, endMinute: 490, sortOrder: 1 },
    { dayOfWeek: 0, type: 'INSTRUCTION', jpNumber: 2, label: 'JP 2', startMinute: 490, endMinute: 530, sortOrder: 2 },
    { dayOfWeek: 0, type: 'INSTRUCTION', jpNumber: 3, label: 'JP 3', startMinute: 530, endMinute: 570, sortOrder: 3 },
    { dayOfWeek: 0, type: 'BREAK', jpNumber: null, label: 'Istirahat', startMinute: 570, endMinute: 585, sortOrder: 4 },
    { dayOfWeek: 0, type: 'INSTRUCTION', jpNumber: 4, label: 'JP 4', startMinute: 585, endMinute: 625, sortOrder: 5 },
  ],
};
const noop = () => undefined;
function lesson(start = 1, end = 2, day = 1): ScheduleItem {
  return { id: `lesson-${start}`, classId: 'class-a', class: { id: 'class-a', name: 'X TKJ A', grade: 10, majorCode: 'TKJ' },
    jpStart: start, jpEnd: end, dayOfWeek: day, room: 'Lab TKJ',
    teachingAssignment: { subject: 'Matematika', teacher: { user: { fullName: 'Ibu Pengajar, S.Pd.' } } } };
}
function render(element: React.ReactNode, bell: BellProfile[] = [profile]) {
  return renderToStaticMarkup(React.createElement(BellPatternProvider, { profiles: bell, children: element }));
}
const parentProps = { showToast: noop, go: noop, setModal: noop,
  children: [{ id: 1, studentId: 'child-a', name: 'Anak A', kelas: 'X TKJ A', active: true, avg: 0, att: 0, wali: '—' }],
  activeChildIndex: 0, schedule: [lesson()], spp: [], waLog: [], attendance: [] };
const studentProps = { showToast: noop, go: noop, setModal: noop, kalender: [], schedule: [lesson()], studentClassName: 'X TKJ A' };
const homeProps = { showToast: noop, go: noop, setModal: noop, setBadgeCelebration: noop, setActiveModulId: noop,
  grades: [], tasks: [], badges: [], modules: [], quest: { title: 'Daily Quest', tasks: [] },
  xp: { level: 1, current: 0, next: 500 }, kehStats: { hadir: 0, izin: 0, sakit: 0, alpha: 0, total: 0, pct: 0 },
  schedule: [lesson()], studentClassName: 'X TKJ A' };

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-05T08:00:00+07:00')); });
afterEach(() => jest.useRealTimers());

describe('actual parent schedule renderer', () => {
  it.each([[1, 1, '07:30–08:10'], [1, 2, '07:30–08:50'], [3, 4, '08:50–10:25']])(
    'renders JP %i–%i through its real final bell, including a break', (start, end, expected) => {
      const html = render(React.createElement(BerandaOrtu, { ...parentProps, schedule: [lesson(start, end)] }));
      expect(html).toContain(expected);
      expect(html).toContain('Ibu Pengajar');
      if (end > start) expect(html).not.toContain(start === 1 ? '07:30–08:10' : '08:50–09:30');
    });
  it('uses the selected weekday bell instead of a static 40 minute assumption', () => {
    const daily = { ...profile, segments: profile.segments.map((s) => ({ ...s, dayOfWeek: 1, startMinute: s.startMinute + 10, endMinute: s.endMinute + 10 })) };
    expect(render(React.createElement(BerandaOrtu, parentProps), [daily])).toContain('07:40–09:00');
  });
  it('states unavailable timing explicitly instead of falling back to JP1', () => {
    expect(render(React.createElement(BerandaOrtu, parentProps), [])).toContain('Waktu JP belum tersedia');
  });
  it('keeps two child schedules independent, including different ranges', () => {
    const rows = [{ ...lesson(), studentId: 'child-a' }, { ...lesson(3, 4), studentId: 'child-b' }];
    expect(mapTodaySchedule(filterByStudentId(rows, 'child-a'), 1, slotsForDay(profile, 1))[0]?.timeRange).toBe('07:30–08:50');
    const html = render(React.createElement(BerandaOrtu, { ...parentProps, schedule: filterByStudentId(rows, 'child-b') }));
    expect(html).toContain('08:50–10:25');
    expect(html).not.toContain('07:30–08:50');
  });
});

describe('actual student metadata and timing', () => {
  it('maps the assigned teacher to every instruction JP, never to a break', () => {
    const data = transformApiSchedule([lesson(3, 4)], profile);
    expect(data[1]?.[2]?.g).toBe('Ibu Pengajar, S.Pd.');
    expect(data[1]?.[4]?.g).toBe('Ibu Pengajar, S.Pd.');
    expect(data[1]?.[3]).toBeUndefined();
  });
  it('gets class directly from owned schedules with no leaderboard', () => {
    expect(scheduleClassName([lesson()])).toBe('X TKJ A');
    expect(scheduleClassName([])).toBeNull();
    expect(scheduleClassName([null, {}, { class: {} }])).toBeNull();
    expect(scheduleClassName([lesson(), { class: { name: 'X TKR B' } }])).toBeNull();
  });
  it.each(['timetable', 'home'])('renders both teacher and class on student %s', (surface) => {
    const html = surface === 'timetable' ? render(React.createElement(JadwalSiswa, studentProps)) : render(React.createElement(BerandaSiswa, homeProps));
    expect(html).toContain('Ibu Pengajar');
    expect(html).toContain('X TKJ A');
  });
  it('wires owned class into the real student workspace with an empty leaderboard', () => {
    const html = render(React.createElement(SiswaWorkspace, { schedule: [lesson()], realLeaderboard: [] }));
    expect(html).toContain('X TKJ A');
    expect(html).toContain('Ibu Pengajar');
  });
  it('keeps honest fallback when teacher metadata is absent', () => {
    expect(transformApiSchedule([{ ...lesson(), teachingAssignment: { subject: 'Matematika' } }], profile)[1]?.[0]?.g).toBe('—');
  });
  it.each([[449, 'upcoming'], [450, 'current'], [489, 'current'], [490, 'finished'], [900, 'finished']])(
    'uses inclusive start/exclusive end at minute %i', (minutes, expected) => {
      expect(studentLessonPhase({ jsDay: 1, minutes }, 1, slotsForDay(profile, 1)[0])).toBe(expected);
    });
  it('does not highlight another weekday as current or finished', () => {
    expect(studentLessonPhase({ jsDay: 1, minutes: 470 }, 2, slotsForDay(profile, 2)[0])).toBe('upcoming');
    expect(studentLessonPhase({ jsDay: 1, minutes: 900 }, 2, slotsForDay(profile, 2)[0])).toBe('upcoming');
  });
  it('keeps previous lessons finished during breaks and after school', () => {
    for (const minutes of [575, 900]) expect(studentLessonPhase({ jsDay: 1, minutes }, 1, slotsForDay(profile, 1)[2])).toBe('finished');
    expect(studentLessonPhase({ jsDay: 1, minutes: 575 }, 1, slotsForDay(profile, 1)[3])).toBe('upcoming');
    jest.setSystemTime(new Date('2026-10-05T16:00:00+07:00'));
    expect(render(React.createElement(JadwalSiswa, studentProps))).toContain('Selesai');
    expect(render(React.createElement(JadwalSiswa, studentProps))).not.toContain('Sedang berlangsung');
  });
});

// Optional artifacts use the same real renderers and committed CSS, not parallel mockups.
it('exports deterministic local browser specimens when requested', () => {
  const directory = process.env.DIIS_QA_RENDER_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  const longLesson = { ...lesson(), room: 'Lab'.repeat(40), teachingAssignment: {
    subject: 'Administrasi Infrastruktur Jaringan '.repeat(4), teacher: { user: { fullName: 'NamaGuru'.repeat(22) } } } };
  const specimens: Array<[string, 'ortu' | 'siswa', React.ReactElement]> = [
    ['parent-a', 'ortu', React.createElement(BerandaOrtu, parentProps)],
    ['parent-b', 'ortu', React.createElement(BerandaOrtu, { ...parentProps, schedule: [lesson(3, 4)] })],
    ['parent-long', 'ortu', React.createElement(BerandaOrtu, { ...parentProps, schedule: [longLesson] })],
    ['student', 'siswa', React.createElement(JadwalSiswa, studentProps)],
    ['student-home', 'siswa', React.createElement(BerandaSiswa, homeProps)],
    ['student-long', 'siswa', React.createElement(JadwalSiswa, { ...studentProps, schedule: [longLesson] })],
    ['student-error', 'siswa', React.createElement(JadwalSiswa, { ...studentProps, scheduleState: 'error' })],
    ['parent-error', 'ortu', React.createElement(BerandaOrtu, { ...parentProps, schedule: [], scheduleState: 'error' })],
    ['parent-denied', 'ortu', React.createElement(BerandaOrtu, { ...parentProps, schedule: [], scheduleState: 'denied' })],
    ['parent-unassigned', 'ortu', React.createElement(BerandaOrtu, { ...parentProps, schedule: [], scheduleState: 'unassigned' })],
    ['student-empty', 'siswa', React.createElement(JadwalSiswa, { ...studentProps, schedule: [] })],
  ];
  for (const [name, role, element] of specimens) {
    writeFileSync(path.join(directory, `${name}.html`), `<!doctype html><html lang="id" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"></head><body><main class="${role}-app mx-auto max-w-[560px] bg-[var(--bg)] text-[var(--text)]">${render(element)}</main></body></html>`);
  }
});

describe('failed requests are never a holiday or empty success', () => {
  it('retry invokes the real recovery handler and refreshes without changing ownership selectors', () => {
    const transition = jest.spyOn(React, 'useTransition').mockImplementation(() => [false, (action) => { void action(); }]);
    try {
      mockRefresh.mockClear();
      const element = LearnerScheduleNotice({ state: 'error' }) as React.ReactElement<{ children: React.ReactElement<{ onClick: () => void }>[] }>;
      element.props.children[1]!.props.onClick();
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    } finally { transition.mockRestore(); }
  });
  it.each([429, 500, 503])('preserves HTTP %i failure', (httpStatus) => {
    expect(readLearnerSchedule({ status: 'requestError', httpStatus, message: 'test' })).toEqual({ data: [], state: 'error' });
  });
  it('distinguishes forbidden, network failure, malformed payload and genuine empty', () => {
    expect(readLearnerSchedule({ status: 'forbidden', httpStatus: 403, message: 'test' }).state).toBe('denied');
    expect(readLearnerSchedule({ status: 'unavailable', message: 'test' }).state).toBe('error');
    expect(readLearnerSchedule({ status: 'success', httpStatus: 200, data: { data: null } } as unknown as Parameters<typeof readLearnerSchedule>[0]).state).toBe('error');
    expect(readLearnerSchedule({ status: 'success', httpStatus: 200, data: { data: [] } })).toEqual({ data: [], state: 'ready' });
  });
  it.each(['error', 'denied', 'unassigned'] as const)('renders %s without holiday claims on all three surfaces', (state) => {
    const htmls = [render(React.createElement(BerandaOrtu, { ...parentProps, schedule: [], scheduleState: state })),
      render(React.createElement(JadwalSiswa, { ...studentProps, schedule: [], scheduleState: state })),
      render(React.createElement(BerandaSiswa, { ...homeProps, schedule: [], scheduleState: state }))];
    for (const html of htmls) {
      // Check the whole page, including the attendance summary's standalone label.
      expect(html).not.toContain('Libur');
      expect(html).not.toContain('Belum ada jadwal');
      expect(html).not.toContain('Ibu Pengajar');
      expect(html).toContain(state === 'error' ? 'Muat ulang jadwal' : state === 'denied' ? 'belum memiliki izin' : 'Kelas anak belum ditetapkan');
    }
  });
  it.each(['error', 'denied', 'unassigned', 'ready'] as const)('keeps monthly attendance independent of an empty %s schedule', (state) => {
    const recorded: AttendanceItem = { id: 'att-a', studentId: 'child-a', classId: 'class-a', date: '2026-10-05',
      status: 'hadir', notes: null, student: { id: 'child-a', nis: 'SYNTHETIC', user: { fullName: 'Anak A' } },
      class: { id: 'class-a', name: 'X TKJ A', majorCode: 'TKJ' } };
    for (const date of ['2026-10-05T08:00:00+07:00', '2026-10-11T08:00:00+07:00']) {
      jest.setSystemTime(new Date(date));
      for (const attendance of [[], [recorded]]) {
        const html = render(React.createElement(BerandaOrtu, { ...parentProps, schedule: [], scheduleState: state, attendance }));
        expect(html).not.toContain('Libur');
        expect(html).toContain(attendance.length ? '>Tercatat<' : '>Belum ada data<');
        expect(html).toContain(attendance.length ? 'Bulan ini: 1 hadir' : 'Bulan ini: 0 hadir');
      }
    }
  });
  it('keeps a real empty response distinct from errors', () => {
    const html = render(React.createElement(JadwalSiswa, { ...studentProps, schedule: [] }));
    expect(html).toContain('Belum ada jadwal');
    expect(html).not.toContain('Muat ulang jadwal');
  });
  it('does not claim a holiday when bell timing cannot load', () => {
    for (const html of [render(React.createElement(JadwalSiswa, studentProps), []), render(React.createElement(BerandaSiswa, homeProps), [])]) {
      expect(html).toContain('Waktu JP belum');
      expect(html).not.toContain('Libur —');
    }
  });
  it('does not hide an unmappable JP range as a holiday or a complete timetable', () => {
    const schedule = [lesson(5, 6)];
    for (const html of [render(React.createElement(JadwalSiswa, { ...studentProps, schedule })),
      render(React.createElement(BerandaSiswa, { ...homeProps, schedule }))]) {
      expect(html).toContain('Waktu JP belum');
      expect(html).not.toContain('Belum ada jadwal');
    }
  });
});
