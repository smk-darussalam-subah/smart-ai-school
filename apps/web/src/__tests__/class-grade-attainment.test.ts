import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GradeItem } from '@/lib/api';
import RekapPembelajaran from '@/app/dashboard/akademik/_components/RekapPembelajaran';
import { averageGradeComponents } from '@/lib/grade-consumers';
import { naOf } from '@/lib/academic';
import type { SummaryReadState, TeacherThreshold } from '@/lib/teacher-summary';

function grade(
  studentId: string,
  score: number | string,
  type: GradeItem['type'] = 'uh',
  id = studentId,
): GradeItem {
  return {
    id,
    studentId,
    score: String(score),
    semester: 1,
    academicYear: '2026/2027',
    type,
    notes: null,
    student: { id: studentId, nis: `SYN-${studentId}`, user: { fullName: 'Nama sintetis sama' } },
    assignment: {
      id: 'assignment',
      subject: 'Bahasa Indonesia',
      classId: 'class',
      academicYear: '2026/2027',
      class: { id: 'class', name: 'X AKL' },
    },
  };
}
const defaults = {
  academicYear: '2026/2027',
  semester: 1,
  subject: 'all',
  thresholds: [
    { mapel: 'Bahasa Indonesia', kktp: 80, kktpProvenance: 'config' },
  ] as TeacherThreshold[],
  thresholdState: 'ready' as SummaryReadState,
  dataState: 'ready' as SummaryReadState,
  attendances: [],
  activities: [],
  approvedRpp: [],
  onBack: () => {},
};
const render = (
  grades: GradeItem[],
  patch: Partial<React.ComponentProps<typeof RekapPembelajaran>> = {},
) =>
  renderToStaticMarkup(React.createElement(RekapPembelajaran, { ...defaults, grades, ...patch }))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');

describe('Approved class attainment per student/subject using canonical NA', () => {
  it.each([
    { a: 95, b: 75, average: 85, passed: 1, pct: 50 },
    { a: 95, b: 85, average: 90, passed: 2, pct: 100 },
    { a: 75, b: 65, average: 70, passed: 0, pct: 0 },
    { a: 80, b: 79, average: 79.5, passed: 1, pct: 50 },
    { a: 70, b: 100, average: 85, passed: 1, pct: 50 },
    { a: 80, b: 80, average: 80, passed: 2, pct: 100 },
    { a: 100, b: 60, average: 80, passed: 1, pct: 50 },
  ])('A=$a B=$b mean=$average, $passed/2 students => $pct%', ({ a, b, average, passed, pct }) => {
    const html = render([grade('A', a), grade('B', b)]);
    expect(html).toContain(`Rata-rata nilai akhir ${average}`);
    expect(html).toContain(`Tuntas / Remedial ${passed} / ${2 - passed}`);
    expect(html.match(new RegExp(`(?:^| )${pct}%`, 'g')) ?? []).toHaveLength(4);
    expect(html).toContain('Penilaian siswa per mapel 2');
  });
  it('two 95 records from A do not outweigh the one 75 record from B', () => {
    const html = render([grade('A', 95, 'uh', 'a1'), grade('A', 95, 'uh', 'a2'), grade('B', 75)]);
    expect(html).toContain('Entri nilai 3');
    expect(html).toContain('Penilaian siswa per mapel 2');
    expect(html).toContain('Rata-rata nilai akhir 85');
    expect(html).toContain('Tuntas / Remedial 1 / 1');
    expect(html.match(/50%/g) ?? []).toHaveLength(4);
    expect(html).not.toContain('67%');
  });
  it('canonical NA, not component pass counts or mean of raw rows, decides attainment', () => {
    const rows = [grade('A', 100, 'uh', 'a1'), grade('A', 40, 'sikap', 'a2'), grade('B', 95)];
    expect(naOf(averageGradeComponents(rows.filter((x) => x.studentId === 'A')))).toBe(74.3);
    const html = render(rows);
    expect(html).toContain('Rata-rata nilai akhir 84.7');
    expect(html).toContain('Tuntas / Remedial 1 / 1');
    expect(html.match(/50%/g) ?? []).toHaveLength(4);
  });
  it('repeated scores in one component are averaged before canonical weighting', () => {
    const html = render([grade('A', 100, 'uh', 'a1'), grade('A', 60, 'uh', 'a2'), grade('B', 79)]);
    expect(html).toContain('Rata-rata nilai akhir 79.5');
    expect(html).toContain('Tuntas / Remedial 1 / 1');
  });
  it('does not merge two different students sharing a display name', () => {
    const html = render([grade('A', 95), grade('B', 75)]);
    expect(html).toContain('Penilaian siswa per mapel 2');
    expect(html).toContain('50%');
  });
  it('counts each student separately per subject, not once globally', () => {
    const a = grade('A', 95),
      b = grade('A', 75);
    b.assignment = { ...b.assignment, subject: 'Bahasa Inggris' };
    const html = render([a, b], {
      thresholds: [
        ...defaults.thresholds,
        { mapel: 'Bahasa Inggris', kktp: 80, kktpProvenance: 'config' },
      ],
    });
    expect(html).toContain('Penilaian siswa per mapel 2');
    expect(html).toContain('50%');
    expect(html).toContain('100%');
    expect(html).toContain('0%');
  });
  it('separates stable class IDs even if the names happen to match', () => {
    const a = grade('A', 95),
      b = grade('A', 75);
    b.assignment = { ...b.assignment, classId: 'other', class: { id: 'other', name: 'X AKL' } };
    const html = render([a, b]);
    expect(html).toContain('2 baris');
    expect(html).toContain('Penilaian siswa per mapel 2');
    expect(html).toContain('50%');
  });
  it('ungraded/invalid student is excluded, not called remedial', () => {
    const html = render([grade('A', 95), grade('B', ''), grade('C', 'NaN'), grade('D', 101)]);
    expect(html).toContain('Penilaian siswa per mapel 1');
    expect(html).toContain('Tuntas / Remedial 1 / 0');
    expect(html).toContain('Siswa yang belum memiliki nilai tidak dianggap remedial');
  });
  it('zero is a legitimate score and empty class has no false percentage', () => {
    expect(render([grade('A', 0), grade('B', 80)])).toContain('Tuntas / Remedial 1 / 1');
    expect(render([])).not.toMatch(/(?:^| )(?:0|100)%/);
  });
  it.each(['denied', 'unavailable'] as const)(
    'does not classify students on threshold state %s',
    (thresholdState) => {
      const html = render([grade('A', 95), grade('B', 75)], { thresholdState });
      expect(html).toContain('Ketuntasan belum dapat dipastikan');
      expect(html).not.toMatch(/(?:^| )(?:0|50|100)%/);
    },
  );
  it('record order cannot change student NA or attainment', () => {
    const rows = [grade('A', 100, 'uh', 'a1'), grade('A', 40, 'sikap', 'a2'), grade('B', 95)];
    expect(render(rows)).toBe(render([...rows].reverse()));
  });
  it('changing semester cannot import another semester components into NA', () => {
    const old = grade('A', 100, 'uas', 'old');
    old.semester = 2;
    const rows = [grade('A', 75), old];
    expect(render(rows)).toContain('Tuntas / Remedial 0 / 1');
    expect(render(rows, { semester: 2 })).toContain('Tuntas / Remedial 1 / 0');
  });
});
