import {
  parsePreviewQuestion,
  studentPreviewQuestion,
} from '../app/dashboard/akademik/_components/assessment-question-preview';
import { assessmentCompletionReadiness } from '../app/dashboard/akademik/_components/assessment-completion-readiness';

describe('assessment learner preview', () => {
  const common = {
    id: 'q-1',
    body: '<!--diis-question-html:v1--><p>Gaya dan gerak</p>',
    points: 15,
  };

  it('keeps formatted question content and drops the choice key from learner controls', () => {
    const question = parsePreviewQuestion({
      ...common,
      type: 'multiple_choice',
      options: [
        { id: 'a', text: '10 N' },
        { id: 'b', text: '20 N' },
      ],
      answer: 'b',
    });
    expect(question).not.toBeNull();
    if (!question) throw new Error('Preview missing');
    expect(studentPreviewQuestion(question)).toEqual({
      id: 'q-1',
      body: common.body,
      points: 15,
      type: 'multiple_choice',
      options: [
        { id: 'a', text: '10 N' },
        { id: 'b', text: '20 N' },
      ],
    });
    expect(studentPreviewQuestion(question)).not.toHaveProperty('answer');
  });

  it.each(['true', 'false', true, false])('handles stored true/false answer %p', (answer) => {
    const question = parsePreviewQuestion({ ...common, type: 'true_false', answer });
    expect(question?.type).toBe('true_false');
    if (question) expect(studentPreviewQuestion(question)).not.toHaveProperty('answer');
  });

  it('maps bank JSON matching data into the same controls without exposing matching keys', () => {
    const pairs = [
      { id: 'force', prompt: 'Gaya', match: 'Newton' },
      { id: 'energy', prompt: 'Energi', match: 'Joule' },
    ];
    const question = parsePreviewQuestion(
      {
        ...common,
        type: 'matching',
        options: pairs,
        answer: JSON.stringify({ force: 'force', energy: 'energy' }),
      },
      25,
    );
    expect(question?.points).toBe(25);
    if (!question) throw new Error('Preview missing');
    expect(studentPreviewQuestion(question)).toEqual({
      id: 'q-1',
      body: common.body,
      points: 25,
      type: 'matching',
      prompts: [
        { id: 'force', prompt: 'Gaya' },
        { id: 'energy', prompt: 'Energi' },
      ],
      choices: [
        { id: 'preview-energy', text: 'Joule' },
        { id: 'preview-force', text: 'Newton' },
      ],
    });
    expect(studentPreviewQuestion(question)).not.toHaveProperty('answer');
    expect(studentPreviewQuestion(question)).not.toHaveProperty('pairs');
  });

  it('accepts saved matching snapshots and excludes the teacher guide and weights from essay controls', () => {
    expect(
      parsePreviewQuestion({
        ...common,
        type: 'matching',
        pairs: [
          { id: 'x', prompt: 'A', match: 'B' },
          { id: 'y', prompt: 'C', match: 'D' },
        ],
        answer: { x: 'x', y: 'y' },
      })?.type,
    ).toBe('matching');
    const question = parsePreviewQuestion({
      ...common,
      type: 'essay',
      answer: 'Gunakan F = m × a.',
      rubric: [
        {
          id: 'c1',
          name: 'Konsep',
          description: 'Uraian penilaian guru',
          maxScore: 4,
          weight: 100,
        },
      ],
    });
    if (!question) throw new Error('Preview missing');
    expect(studentPreviewQuestion(question)).toEqual({
      id: 'q-1',
      body: common.body,
      points: 15,
      type: 'essay',
      rubricCriteria: [{ id: 'c1', name: 'Konsep', maxScore: 4 }],
    });
    expect(studentPreviewQuestion(question)).not.toHaveProperty('guideAnswer');
    expect(studentPreviewQuestion(question)).not.toHaveProperty('rubric');
  });

  it.each([
    null,
    { ...common, type: 'multiple_choice', options: 'broken', answer: 'a' },
    {
      ...common,
      type: 'multiple_choice',
      options: [
        { id: 'a', text: '10 N' },
        { id: 'b', text: '20 N' },
      ],
      answer: 'removed',
    },
    {
      ...common,
      type: 'matching',
      pairs: [
        { id: 'a', prompt: 'Gaya', match: 'Newton' },
        { id: 'b', prompt: 'Energi', match: 'Joule' },
      ],
      answer: { a: 'a', b: 'a' },
    },
    { ...common, type: 'matching', options: [], answer: '{invalid' },
    { ...common, type: 'essay', rubric: null },
    { ...common, points: Number.NaN, type: 'true_false', answer: 'false' },
  ])('keeps invalid or unavailable question details out of the preview', (source) => {
    expect(parsePreviewQuestion(source)).toBeNull();
  });

  it('keeps the saved choice order used in a learner attempt', () => {
    const question = parsePreviewQuestion({
      ...common,
      type: 'matching',
      pairs: [
        { id: 'a', prompt: 'Gaya', match: 'Newton' },
        { id: 'b', prompt: 'Energi', match: 'Joule' },
      ],
      answer: { a: 'a', b: 'b' },
      choiceIds: {
        a: '11111111-1111-4111-8111-111111111111',
        b: '22222222-2222-4222-8222-222222222222',
      },
    });
    if (!question) throw new Error('Preview missing');
    const learner = studentPreviewQuestion(question);
    expect(learner.type).toBe('matching');
    if (learner.type !== 'matching') throw new Error('Unexpected question type');
    expect(learner.choices.map(({ text }) => text)).toEqual(['Newton', 'Joule']);
    expect(learner).not.toHaveProperty('choiceIds');
  });
});

describe('assessment closing readiness', () => {
  const source = {
    session: { id: 'session-1', status: 'active' },
    classStudentCount: 5,
    submitted: 2,
    pendingManualCount: 1,
    pendingLateReviewCount: 1,
    responses: [
      {
        startedAt: '2026-11-19T00:00:00Z',
        submittedAt: '2026-11-19T00:20:00Z',
        lateSubmissionStatus: null,
      },
      {
        startedAt: '2026-11-19T00:00:00Z',
        submittedAt: '2026-11-19T00:20:00Z',
        lateSubmissionStatus: null,
      },
      { startedAt: '2026-11-19T00:00:00Z', submittedAt: null, lateSubmissionStatus: 'pending' },
      { startedAt: '2026-11-19T00:00:00Z', submittedAt: null, lateSubmissionStatus: null },
    ],
  };

  it('separates pending decisions, ongoing attempts and students who have not started', () => {
    expect(assessmentCompletionReadiness(source, 'session-1')).toEqual({
      total: 5,
      notStarted: 1,
      inProgress: 1,
      submitted: 2,
      pendingManual: 1,
      pendingLate: 1,
      rejectedLate: 0,
    });
  });

  it('retains a valid zero-participant result', () => {
    expect(
      assessmentCompletionReadiness(
        {
          ...source,
          classStudentCount: 0,
          submitted: 0,
          pendingManualCount: 0,
          pendingLateReviewCount: 0,
          responses: [],
        },
        'session-1',
      ),
    ).toEqual({
      total: 0,
      notStarted: 0,
      inProgress: 0,
      submitted: 0,
      pendingManual: 0,
      pendingLate: 0,
      rejectedLate: 0,
    });
  });

  it('counts rejected late submissions separately from ongoing attempts', () => {
    const response = source.responses[2];
    expect(
      assessmentCompletionReadiness(
        {
          ...source,
          pendingLateReviewCount: 0,
          responses: [
            ...source.responses.slice(0, 2),
            { ...response, lateSubmissionStatus: 'rejected' },
            source.responses[3],
          ],
        },
        'session-1',
      ),
    ).toMatchObject({ inProgress: 1, submitted: 2, pendingLate: 0, rejectedLate: 1 });
  });

  it.each([
    { ...source, session: { id: 'other', status: 'active' } },
    { ...source, session: { id: 'session-1', status: 'completed' } },
    { ...source, classStudentCount: null },
    { ...source, pendingManualCount: -1 },
    { ...source, responses: undefined },
  ])('rejects stale identity, closed sessions and missing or invalid readiness', (data) => {
    expect(assessmentCompletionReadiness(data, 'session-1')).toBeNull();
  });
});
