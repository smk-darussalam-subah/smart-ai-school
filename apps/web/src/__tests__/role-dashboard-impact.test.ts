import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  readLearnerAttendance,
  attendanceMonth,
  attendanceStats,
  jakartaToday,
  attendanceTrend,
} from '@/lib/learner-attendance';
import KehadiranOrtu from '@/app/dashboard/akademik/_components/ortu/KehadiranOrtu';
import KehadiranSiswa from '@/app/dashboard/akademik/_components/siswa/KehadiranSiswa';
import LearnerGradeView from '@/app/dashboard/akademik/_components/LearnerGradeView';
import { readLearnerGrades } from '@/lib/learner-grades';
import fs from 'fs';
import path from 'path';
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
const row = (id: string, date: string, status = 'hadir', studentId = 'a') => ({
  id,
  studentId,
  classId: 'class',
  date,
  status,
});
const ok = (data: unknown) => ({ status: 'success' as const, httpStatus: 200, data: { data } });
const text = (element: React.ReactElement) =>
  renderToStaticMarkup(element)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');

describe('Role dashboard attendance contracts', () => {
  it('keeps gaps and a lone real trend point visible without invented lines', () => {
    expect(attendanceTrend([{ date: 'a', pct: 50 }]).points[0]?.x).toBe(310);
    const result = attendanceTrend([
      { date: 'a', pct: 50 },
      { date: 'b', pct: null },
      { date: 'c', pct: 0 },
    ]);
    expect(result.points).toHaveLength(2);
    expect(result.segments).toHaveLength(2);
  });
  it('filters a child before aggregation and does not mix siblings', () => {
    const read = readLearnerAttendance(
      ok([row('1', '2026-10-01'), row('2', '2026-10-02', 'alpha', 'b')]),
      'a',
    );
    expect(read.state).toBe('ready');
    expect(attendanceStats(read.data).pct).toBe(100);
  });
  it('monthly counts exclude other months, including when all rows belong to selected semester', () => {
    const rows = [
      row('1', '2026-09-01', 'alpha'),
      row('2', '2026-10-01'),
      row('3', '2026-10-02', 'izin'),
    ];
    expect(attendanceStats(attendanceMonth(rows, '2026-10'))).toMatchObject({
      hadir: 1,
      izin: 1,
      total: 2,
      pct: 50,
    });
  });
  it('empty is not 0% attendance and recorded alpha remains actual 0%', () => {
    expect(attendanceStats([]).pct).toBeNull();
    expect(attendanceStats([row('1', '2026-10-01', 'alpha')]).pct).toBe(0);
  });
  it.each(['forbidden', 'unavailable'] as const)('does not turn %s into valid empty', (status) =>
    expect(readLearnerAttendance({ status, message: 'synthetic' }).state).toBe(
      status === 'forbidden' ? 'denied' : 'unavailable',
    ),
  );
  it('holds without a period, on duplicate student/day and malformed payload', () => {
    expect(readLearnerAttendance(null).state).toBe('period-unavailable');
    expect(readLearnerAttendance(ok([row('1', '2026-10-01'), row('2', '2026-10-01')])).state).toBe(
      'unavailable',
    );
    expect(readLearnerAttendance(ok([{ status: 'hadir' }])).state).toBe('unavailable');
  });
  it('uses school timezone across UTC midnight', () =>
    expect(jakartaToday(new Date('2026-10-21T18:00:00Z'))).toBe('2026-10-22'));
  it('parent JP screen does not display the removed daily error or a false zero rate', () => {
    const result = text(
      React.createElement(KehadiranOrtu, {
        setModal: () => {},
        attendance: [],
        waLog: [],
        attendanceState: 'unavailable',
      }),
    );
    expect(result).toContain('Kehadiran per JP');
    expect(result).toContain('Memuat kehadiran per JP');
    expect(result).not.toContain('0%');
    expect(result).not.toContain('Belum ada data kehadiran');
    expect(result).not.toContain('Catatan harian');
    expect(result).not.toContain('bukan absensi per JP');
  });
  it('parent does not render a second legacy calendar even if old input is available', () => {
    const result = text(
      React.createElement(KehadiranOrtu, {
        setModal: () => {},
        attendance: [],
        waLog: [],
        attendanceState: 'ready',
      }),
    );
    expect(result).toContain('Kehadiran per JP');
    expect(result).not.toContain('Catatan harian');
    expect(result).not.toContain('0%');
  });
  it('student renders only the JP screen, preserving the requested period and date', () => {
    const result = text(
      React.createElement(KehadiranSiswa, {
        showToast: () => {},
        go: () => {},
        setModal: () => {},
        stats: { hadir: 1, izin: 0, sakit: 0, alpha: 0, total: 1, pct: 100 },
        attendance: [],
        period: { dateFrom: '2026-07-01', dateTo: '2026-12-31' },
        initialDate: '2026-10-22',
      }),
    );
    expect(result).toContain('Kehadiran per JP');
    expect(result).not.toContain('Catatan harian');
    expect(result).not.toContain('100%');
  });
  it('both learner shells render the same official NA and threshold', () => {
    const read = readLearnerGrades(
      ok([
        {
          studentId: 'a',
          subjects: [
            {
              subject: 'Bahasa Indonesia',
              uh: 79.6,
              praktik: null,
              sikap: null,
              uts: null,
              uas: null,
              na: 79.6,
              kktp: 80,
              kktpProvenance: 'config',
              status: 'remedial',
            },
          ],
        },
      ]),
    );
    expect(read.state).toBe('ready');
    for (const shell of ['siswa', 'ortu'] as const) {
      const result = text(
        React.createElement(LearnerGradeView, {
          grades: read.data,
          state: read.state,
          title: 'Nilai',
          onReport: () => {},
          shell,
        }),
      );
      expect(result).toContain('79.6');
      expect(result).toContain('Perlu remedial');
    }
  });
  it('page passes separate per-child states, period bounds and no false CP grade cast', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/app/dashboard/akademik/page.tsx'),
      'utf8',
    );
    expect(source).toContain(
      "academicPagesResult<AttendanceItem>(pp('/attendance', 'attendance'), token)",
    );
    expect(source).toContain('attendanceStates={Object.fromEntries');
    expect(source).toMatch(/attendancePeriod=\{\s*selectedPeriod/);
    expect(source).not.toContain("'/analytics/attendance/stats'");
    expect(source).not.toContain("apiFetch<{ data: unknown[] }>('/student-dashboard/cp'");
  });
  it('monthly and heatmap reads use complete bounded pages, never invalid limit 200', () => {
    const actions = fs.readFileSync(
      path.join(process.cwd(), 'src/app/dashboard/akademik/actions.ts'),
      'utf8',
    );
    const month = actions.slice(
      actions.indexOf('export async function fetchStudentAttendanceMonth'),
      actions.indexOf('/** B3: Fetch learning timeline'),
    );
    expect(month).toContain('academicPagesResult<StudentAttendanceMonthItem>');
    expect(month).not.toContain('limit=200');
    const home = fs.readFileSync(path.join(process.cwd(), 'src/app/dashboard/actions.ts'), 'utf8');
    const detail = home.slice(home.indexOf('export async function fetchAttendanceDetailAction'));
    expect(detail).toContain('academicPagesResult<AttendanceItem>');
  });
});
