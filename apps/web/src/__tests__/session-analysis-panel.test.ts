import { formatAnalysisQuestionType } from '../app/dashboard/akademik/_components/session-analysis-labels';

describe('SessionAnalysisPanel question type labels', () => {
  it('renders matching distinctly from true/false in item analysis', () => {
    expect(formatAnalysisQuestionType('multiple_choice')).toBe('PG');
    expect(formatAnalysisQuestionType('essay')).toBe('Essay');
    expect(formatAnalysisQuestionType('matching')).toBe('Match');
    expect(formatAnalysisQuestionType('true_false')).toBe('B/S');
  });

  it('keeps unknown values visible instead of mislabeling them', () => {
    expect(formatAnalysisQuestionType('custom_type')).toBe('custom_type');
  });
});
