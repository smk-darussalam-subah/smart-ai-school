import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readStudentTasks } from '@/lib/learner-dashboard-read';
import { QUESTION_HTML_PREFIX, questionBodyForEditor } from '@/lib/question-content';
import QuestionContent from '@/components/learning/QuestionContent';
import TugasSiswa from '@/app/dashboard/akademik/_components/siswa/TugasSiswa';

const base = {
  id: 'task',
  type: 'assessment',
  title: 'QA sintetis',
  subject: 'Matematika',
  guru: null,
  status: 'pending',
};
function tasks(items: unknown[]) {
  const result = readStudentTasks({
    status: 'success',
    httpStatus: 200,
    data: { data: [{ studentId: 'own', assignments: items }] },
  });
  if (result.state !== 'ready') throw Error('Expected ready');
  return result.data;
}

describe('learner task semantics', () => {
  it('does not convert module completion into a grade', () => {
    const module = tasks([{ ...base, type: 'lms', status: 'graded', progress: 100 }])[0]!;
    expect(module).toMatchObject({ sourceKind: 'lms', progress: 100, status: 'graded' });
    expect(module.score).toBeUndefined();
    expect(module.assessmentSessionId).toBeUndefined();
  });
  it('retains legitimate assessment zero, distinct from absent and pending scores', () => {
    const [zero, pending, rejected] = tasks([
      { ...base, status: 'graded', progress: 0 },
      { ...base, status: 'submitted', progress: 0 },
      { ...base, status: 'graded', progress: 90, lateSubmissionStatus: 'rejected' },
    ]);
    expect(zero?.score).toBe(0);
    expect(pending?.score).toBeUndefined();
    expect(rejected?.score).toBeUndefined();
  });
  it.each(['pending', 'closed'])(
    'hides a new-start workflow when closed API status=%s',
    (status) => {
      const [closed] = tasks([
        { ...base, status, sessionStatus: 'completed', attemptStarted: false },
      ]);
      expect(closed?.status).toBe('closed');
      const markup = renderToStaticMarkup(
        React.createElement(TugasSiswa, {
          tasks: [closed!],
          showToast: () => {},
          go: () => {},
          setModal: () => {},
        }),
      );
      expect(markup).not.toContain('QA sintetis'); // Not a pending task; remains under Ditutup/Semua.
    },
  );
  it('preserves the started late/resume workflow after session completion', () => {
    const [started] = tasks([{ ...base, sessionStatus: 'completed', attemptStarted: true }]);
    expect(started).toMatchObject({
      status: 'pending',
      attemptStarted: true,
      sessionStatus: 'completed',
    });
  });
  it('does not infer closed from missing lifecycle metadata in a mixed-version response', () => {
    expect(tasks([base])[0]?.status).toBe('pending');
  });
});

describe('question format compatibility', () => {
  it.each([
    'Apa fungsi <a> dan <img>?',
    '<script>alert(1)</script>',
    'Jika x < 5 dan y > 2',
    'A & B\nBaris kedua',
  ])('keeps legacy text literal: %s', (body) => {
    const markup = renderToStaticMarkup(React.createElement(QuestionContent, { body }));
    expect(markup).not.toContain('<script>');
    expect(markup).not.toContain('<img>');
    expect(questionBodyForEditor(body)).toContain('<p>');
    if (body.includes('<a>')) expect(markup).toContain('&lt;a&gt;');
  });
  it('preserves the explicit rich document for the shared sanitized renderer', () => {
    const body = QUESTION_HTML_PREFIX + '<h2>Data</h2><p><strong>Amati</strong> tabel.</p>';
    expect(questionBodyForEditor(body)).toBe('<h2>Data</h2><p><strong>Amati</strong> tabel.</p>');
    const markup = renderToStaticMarkup(React.createElement(QuestionContent, { body }));
    expect(markup).toContain('Menyiapkan');
    expect(markup).not.toContain('<h2>'); // HTML never bypasses browser sanitization on SSR.
  });
});
