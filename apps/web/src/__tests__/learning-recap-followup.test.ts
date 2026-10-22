import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GradeItem } from '@/lib/api';
import type { TeacherThreshold, SummaryReadState } from '@/lib/teacher-summary';
import RekapPembelajaran from '@/app/dashboard/akademik/_components/RekapPembelajaran';

const grade = (score = '80', subject = 'Bahasa Indonesia', semester = 1): GradeItem => ({
  id: `${subject}-${score}-${semester}`,
  studentId: 'synthetic-student',
  score,
  academicYear: '2026/2027',
  semester,
  type: 'uh',
  notes: null,
  student: { id: 'synthetic-student', nis: 'synthetic', user: { fullName: 'Siswa sintetis' } },
  assignment: {
    subject,
    classId: 'class',
    academicYear: '2026/2027',
    class: { id: 'class', name: 'X AKL' },
  },
});
const threshold = (
  kktp: number | null,
  mapel = 'Bahasa Indonesia',
  kktpProvenance = 'config',
): TeacherThreshold => ({ mapel, kktp, kktpProvenance });
const props = () => ({
  subject: 'all',
  grades: [grade()],
  attendances: [],
  activities: [],
  approvedRpp: [],
  academicYear: '2026/2027',
  semester: 1,
  thresholds: [threshold(90)],
  thresholdState: 'ready' as SummaryReadState,
  dataState: 'ready' as SummaryReadState,
  onBack: () => {},
});
const render = (patch: Partial<React.ComponentProps<typeof RekapPembelajaran>> = {}) =>
  renderToStaticMarkup(React.createElement(RekapPembelajaran, { ...props(), ...patch }));
// Extract only visible text for assertions; all four consumers render their percentage.
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('P2-LR-01 official KKTP in legacy recap', () => {
  it.each([
    ['80', 90, 'config', 0],
    ['70', 65, 'config', 100],
    ['80', 75, 'system_default', 100],
    ['74', 75, 'system_default', 0],
    ['80', 90, 'module', 0],
    ['90', 90, 'config', 100],
  ])(
    'score %s / official KKTP %i (%s) -> %i%% in every view',
    (score, kktp, provenance, expected) => {
      const html = render({
        grades: [grade(score)],
        thresholds: [threshold(kktp, 'Bahasa Indonesia', provenance)],
      });
      expect(text(html).match(new RegExp(`(?:^| )${expected}%`, 'g')) ?? []).toHaveLength(4);
      expect(text(html)).toContain(` ${kktp} `);
      expect(text(html)).toContain('Setiap siswa dihitung sekali per mapel');
    },
  );
  it.each(['denied', 'unavailable'] as const)(
    'does not classify on %s even if stale thresholds exist',
    (state) => {
      const html = render({ thresholdState: state });
      expect(text(html)).toContain('Ketuntasan belum dapat dipastikan');
      expect(text(html)).toContain('Belum tersedia');
      expect(text(html)).not.toMatch(/(?:^| )(?:0|100)%/);
      expect(text(html)).toContain('Tuntas / Remedial — / —');
    },
  );
  it.each(
    [
      [],
      [threshold(null)],
      [threshold(90, 'Bahasa Indonesia', 'unconfigured')],
      [threshold(90), threshold(65)],
      [threshold(Number.NaN)],
      [threshold(101)],
    ].map((thresholds) => ({ thresholds })),
  )('holds classification for missing/ambiguous/invalid metadata %j', ({ thresholds }) => {
    const html = text(render({ thresholds }));
    expect(html).toContain('Ketuntasan belum dapat dipastikan');
    expect(html).not.toMatch(/(?:^| )(?:0|100)%/);
  });
  it('evaluates mixed subjects separately, not with an average/shared threshold', () => {
    const html = text(
      render({
        grades: [grade(), grade('70', 'Bahasa Inggris')],
        thresholds: [threshold(90), threshold(65, 'Bahasa Inggris')],
      }),
    );
    expect(html).toContain('50%');
    expect(html).toContain('0%');
    expect(html).toContain('100%');
    expect(html).toContain('Tuntas / Remedial 1 / 1');
  });
  it('unknown threshold in one subject prevents a misleading total but preserves known subject results', () => {
    const html = text(render({ grades: [grade(), grade('70', 'Bahasa Inggris')] }));
    expect(html).toContain('Ketuntasan belum dapat dipastikan');
    expect(html).toContain('Tuntas / Remedial — / —');
    expect(html).toContain('Belum tersedia');
    expect(html).toContain('0%');
  });
  it('applies the subject filter to the KPI, breakdown and matrix together', () => {
    const html = text(
      render({
        subject: 'Bahasa Indonesia',
        grades: [grade(), grade('99', 'Bahasa Inggris')],
        thresholds: [threshold(90), threshold(65, 'Bahasa Inggris')],
      }),
    );
    expect(html).not.toContain('Bahasa Inggris');
    expect(html).not.toContain('100%');
    expect(html).toContain('Tuntas / Remedial 0 / 1');
  });
  it('uses only the selected semester and its refreshed threshold snapshot', () => {
    const grades = [grade('80'), grade('70', 'Bahasa Indonesia', 2)];
    expect(text(render({ grades }))).toContain('Tuntas / Remedial 0 / 1');
    const next = text(render({ grades, semester: 2, thresholds: [threshold(65)] }));
    expect(next).toContain('Tuntas / Remedial 1 / 0');
    expect(next).toContain('100%');
    expect(next).not.toMatch(/(?:^| )0%/);
  });
  it('never uses previous year grades or assignment period', () => {
    const old = grade();
    old.academicYear = '2025/2026';
    const wrong = grade();
    wrong.assignment.academicYear = '2025/2026';
    const html = text(render({ grades: [old, wrong] }));
    expect(html).toContain('Entri nilai 0');
    expect(html).not.toContain('Rekap per Mapel');
  });
  it('counts one student once after applying official component aggregation', () => {
    const html = text(render({ grades: [grade(), { ...grade('95'), type: 'uts' }] }));
    expect(html).toContain('Entri nilai 2');
    expect(html).toContain('Penilaian siswa per mapel 1');
    expect(html).toContain('Tuntas / Remedial 0 / 1');
    expect(html).toContain('0%');
  });
  it.each(['', 'NaN', 'Infinity', '-1', '101'])('does not classify invalid score %j', (score) => {
    const html = text(render({ grades: [grade(score)] }));
    expect(html).toContain('Entri nilai 0');
    expect(html).not.toContain('Rekap per Mapel');
  });
  it.each(['denied', 'unavailable'] as const)('does not use stale grades after %s', (dataState) => {
    const html = text(render({ dataState }));
    expect(html).toContain('Tuntas / Remedial — / —');
    expect(html).not.toMatch(/(?:^| )(?:0|100)%/);
  });
});
