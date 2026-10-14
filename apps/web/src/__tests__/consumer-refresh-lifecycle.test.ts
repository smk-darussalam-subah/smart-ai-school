import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { GradeItem } from '@/lib/api';
import type { SummaryReadState, TeacherThreshold } from '@/lib/teacher-summary';
import { gradeRecordScore, type GradeReadSnapshot } from '@/lib/grade-consumers';
import Gradebook from '@/app/dashboard/akademik/_components/GradebookPenilaian';
import Capaian from '@/app/dashboard/akademik/_components/CapaianRapor';
jest.mock('@/app/dashboard/akademik/actions', () => ({
  updateGrade: jest.fn(),
  fetchCpProgress: jest.fn(),
}));
jest.mock('@/app/dashboard/akademik/_components/QuestionBankEditor', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/academic/shared', () => ({ RaporModal: () => null }));
const grade = (id: string, score: string): GradeItem => ({
  id,
  score,
  type: 'uh',
  studentId: 'synthetic-student',
  notes: null,
  academicYear: '2026/2027',
  semester: 1,
  student: { id: 'synthetic-student', nis: 'S-001', user: { fullName: 'Siswa Sintetis' } },
  assignment: {
    id: 'synthetic-assignment',
    subject: 'Matematika',
    academicYear: '2026/2027',
    classId: 'synthetic-class',
    class: { id: 'synthetic-class', name: 'Kelas Sintetis' },
  },
});
const grades = [grade('g1', '40'), grade('g2', '100')];
const snapshot = (): GradeReadSnapshot => ({ rows: grades, state: 'ready' });
const threshold = (kktp: number): TeacherThreshold[] => [
  { mapel: 'Matematika', kktp, kktpProvenance: 'config' },
];
const renderPair = (
  thresholds: TeacherThreshold[],
  thresholdState: SummaryReadState = 'ready',
  dataState: SummaryReadState = 'ready',
) => [
  renderToStaticMarkup(
    React.createElement(Gradebook, {
      grades,
      sourceSnapshot: grades,
      subject: 'Matematika',
      className: 'Kelas Sintetis',
      academicYear: '2026/2027',
      semester: 1,
      thresholds,
      thresholdState,
      dataState,
      onInputNilai: () => {},
    }),
  ),
  renderToStaticMarkup(
    React.createElement(Capaian, {
      grades,
      classId: 'synthetic-class',
      className: 'Kelas Sintetis',
      academicYear: '2026/2027',
      semester: 1,
      thresholds,
      thresholdState,
      dataState,
    }),
  ),
];
describe('R05: acknowledged edit belongs to one authoritative read', () => {
  it('temporary acknowledged60 overlays server40 before any new read', () => {
    const read = snapshot();
    expect(gradeRecordScore(40, read, { snapshot: read, score: 60 })).toBe(60);
  });
  it('an unrelated render with the same read keeps the acknowledged edit', () => {
    const read = snapshot(),
      edit = { snapshot: read, score: 60 };
    expect(gradeRecordScore(40, read, edit)).toBe(60);
    expect(gradeRecordScore(40, read, edit)).toBe(60);
  });
  it('server acknowledgement60 retires previous overlay; later90 wins', () => {
    const edit = { snapshot: snapshot(), score: 60 };
    expect(gradeRecordScore(60, snapshot(), edit)).toBe(60);
    expect(gradeRecordScore(90, snapshot(), edit)).toBe(90);
  });
  it('late success from an older read cannot cover server90', () => {
    const old = snapshot(),
      latest = snapshot();
    expect(gradeRecordScore(90, latest, { snapshot: old, score: 60 })).toBe(90);
  });
  it.each(['denied', 'unavailable'] as const)(
    'read%s never trusts a previous acknowledgement',
    (state) => {
      const read: GradeReadSnapshot = { rows: grades, state };
      expect(gradeRecordScore(90, read, { snapshot: read, score: 60 })).toBe(90);
    },
  );
  it('recovery with reused grade array still retires old read identity', () => {
    const old = snapshot(),
      recovered = snapshot();
    expect(old.rows).toBe(recovered.rows);
    expect(gradeRecordScore(90, recovered, { snapshot: old, score: 60 })).toBe(90);
  });
  it('no successful edit means the server value is used', () => {
    expect(gradeRecordScore(90, snapshot())).toBe(90);
  });
});
describe('R06: Penilaian and Capaian share incoming threshold authority', () => {
  it.each([80, 70, 75])('official%s produces consistent status for NA70', (kktp) => {
    const [book, cap] = renderPair(threshold(kktp));
    expect(book).toContain(kktp <= 70 ? '>Tuntas</span>' : '>Remedial</span>');
    expect(cap).toContain(kktp <= 70 ? '1/1 mapel' : '0/1 mapel');
    expect(book).toContain('KKTP ' + kktp);
    expect(cap).toMatch(/>70<\/td>/);
  });
  it.each(['denied', 'unavailable'] as const)(
    'incoming%s revokes both old status claims',
    (state) => {
      const [book, cap] = renderPair(threshold(80), state);
      expect(book).toContain('KKTP belum tersedia');
      expect(cap).toContain('Belum tersedia');
      expect(cap).not.toContain('0/1 mapel');
      expect(cap).not.toContain('1/1 mapel');
    },
  );
  it('missing metadata is unknown in both consumers, not default75', () => {
    const [book, cap] = renderPair([]);
    expect(book).toContain('KKTP belum tersedia');
    expect(cap).not.toContain('0/1 mapel');
  });
  it('ambiguous thresholds are unknown on both paths', () => {
    const [book, cap] = renderPair([...threshold(80), ...threshold(70)]);
    expect(book).toContain('KKTP belum tersedia');
    expect(cap).not.toContain('0/1 mapel');
  });
  it.each(['denied', 'unavailable'] as const)(
    'grade read%s removes student values from both consumers',
    (state) => {
      const pair = renderPair(threshold(80), 'ready', state);
      for (const html of pair) expect(html).not.toContain('Siswa Sintetis');
    },
  );
  it('actual Workspace forwards the same metadata/state plus unfiltered read identity', () => {
    const text = readFileSync(
      path.join(__dirname, '../app/dashboard/akademik/_components/AkademikWorkspace.tsx'),
      'utf8',
    );
    for (const component of ['GradebookPenilaian', 'CapaianRapor']) {
      const call = text.match(new RegExp('<' + component + '\\b[\\s\\S]*?/>'))?.[0];
      expect(call).toContain('thresholds={summaryThresholds}');
      expect(call).toContain('thresholdState={summaryAvailability?.kktp}');
      expect(call).toContain('dataState={summaryAvailability?.grades}');
    }
    expect(text).toContain('sourceSnapshot={grades}');
  });
  it('CP response is never an alternate threshold source', () => {
    const text = readFileSync(
      path.join(__dirname, '../app/dashboard/akademik/_components/CapaianRapor.tsx'),
      'utf8',
    );
    expect(text).not.toContain('setGradeMeta');
    expect(text).not.toContain('res.data.mapelProgress');
    expect(text).toContain('subjectThreshold(thresholds, subject)');
  });
});
