import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  readLearnerGrades,
  learnerGradeSummary,
  type LearnerGradeState,
} from '@/lib/learner-grades';
import NilaiSiswa from '@/app/dashboard/akademik/_components/siswa/NilaiSiswa';
import NilaiOrtu from '@/app/dashboard/akademik/_components/ortu/NilaiOrtu';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));
const subject = {
  subject: 'Matematika',
  uh: 95,
  praktik: null,
  sikap: null,
  uts: null,
  uas: null,
  na: 95,
  kktp: 80,
  kktpProvenance: 'config',
  status: 'tuntas',
};
const response = (subjects: unknown[] = [subject]) => ({
  status: 'success' as const,
  httpStatus: 200,
  data: { data: [{ studentId: 'student-a', subjects }] },
});
const noop = () => {};
const renderers = [
  (state: LearnerGradeState, data = readLearnerGrades(response()).data) =>
    renderToStaticMarkup(
      React.createElement(NilaiSiswa, { grades: data, gradeState: state, showToast: noop }),
    ),
  (state: LearnerGradeState, data = readLearnerGrades(response()).data) =>
    renderToStaticMarkup(
      React.createElement(NilaiOrtu, {
        grades: data,
        gradeState: state,
        setModal: noop,
        onOpenOfficialReport: noop,
      }),
    ),
];
describe('R08/R09 canonical learner read model and real grade renderers', () => {
  it('preserves backend NA95 and KKTP80 without averaging raw records or default75', () => {
    const read = readLearnerGrades(response());
    expect(read.state).toBe('ready');
    expect(read.data[0]).toMatchObject({ mp: 'Matematika', na: 95, kktp: 80, status: 'tuntas' });
    expect(learnerGradeSummary(read.data)).toEqual({
      average: 95,
      assessed: 1,
      tuntas: 1,
      remedial: 0,
    });
  });
  it('rejects raw /grades payload instead of casting it to a learner view model', () => {
    expect(
      readLearnerGrades({
        status: 'success',
        httpStatus: 200,
        data: { data: [{ id: 'raw', score: '95', assignment: { subject: 'Matematika' } }] },
      }).state,
    ).toBe('unavailable');
  });
  it.each(['forbidden', 'unavailable', 'notFound', 'requestError'] as const)(
    '%s stays non-ready, never empty success',
    (status) => {
      expect(readLearnerGrades({ status, message: 'Synthetic' })).toEqual({
        state: status === 'forbidden' ? 'denied' : 'unavailable',
        data: [],
      });
    },
  );
  it('no selected period never issues a pretend success', () => {
    expect(readLearnerGrades(null).state).toBe('period-unavailable');
  });
  it('missing component remains null; score0 remains real zero', () => {
    const read = readLearnerGrades(response([{ ...subject, uh: 0, na: 0, status: 'remedial' }]));
    expect(read.data[0]?.components).toMatchObject({ uh: 0, praktik: null });
    expect(learnerGradeSummary(read.data).average).toBe(0);
  });
  it('missing threshold is not counted remedial', () => {
    const read = readLearnerGrades(
      response([{ ...subject, kktp: null, kktpProvenance: 'unconfigured', status: null }]),
    );
    expect(learnerGradeSummary(read.data)).toEqual({
      average: 95,
      assessed: 0,
      tuntas: 0,
      remedial: 0,
    });
  });
  it.each([NaN, Infinity, -1, 101])('rejects invalid score %s', (na) => {
    expect(readLearnerGrades(response([{ ...subject, na }])).state).toBe('unavailable');
  });
  it('rejects status/threshold contradiction', () => {
    expect(readLearnerGrades(response([{ ...subject, status: 'remedial' }])).state).toBe(
      'unavailable',
    );
  });
  it('rejects duplicate subject and duplicate student groups', () => {
    expect(readLearnerGrades(response([subject, subject])).state).toBe('unavailable');
    const value = response();
    value.data.data.push(value.data.data[0]!);
    expect(readLearnerGrades(value).state).toBe('unavailable');
  });
  it.each(renderers)(
    'populated real learner renderer has no exception and official metadata',
    (render) => {
      const html = render('ready');
      expect(html).toContain('Matematika');
      expect(html).toContain('95');
      expect(html).toContain('KKTP 80');
      expect(html).not.toContain('KKTP 75');
      expect(html).not.toContain('NaN');
    },
  );
  it.each(renderers)(
    'denied/unavailable discard stale rows and misleading empty claim',
    (render) => {
      for (const state of ['denied', 'unavailable', 'period-unavailable'] as const) {
        const html = render(state);
        expect(html).not.toContain('Matematika');
        expect(html).not.toContain('guru belum');
        expect(html).not.toContain('Belum ada nilai pada periode');
        expect(html).not.toContain('0/0');
      }
    },
  );
  it.each(renderers)('confirmed empty uses a truthful empty state', (render) => {
    expect(render('ready', [])).toContain('Belum ada nilai pada periode ini');
  });
  it.each(renderers)('unconfigured threshold stays unknown in UI', (render) => {
    const html = render(
      'ready',
      readLearnerGrades(
        response([{ ...subject, kktp: null, kktpProvenance: 'unconfigured', status: null }]),
      ).data,
    );
    expect(html).toContain('KKTP belum tersedia');
    expect(html).not.toContain('KKTP 75');
    expect(html).not.toContain('Perlu remedial ·');
  });
});
