export function formatAnalysisQuestionType(type: string): string {
  if (type === 'multiple_choice') return 'PG';
  if (type === 'essay') return 'Essay';
  if (type === 'matching') return 'Match';
  if (type === 'true_false') return 'B/S';
  return type;
}
