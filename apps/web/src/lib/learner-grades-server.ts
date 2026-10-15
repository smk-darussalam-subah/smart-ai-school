import { apiFetchResult } from './api';
import { readLearnerGrades } from './learner-grades';

export async function fetchLearnerGrades(path: string | null, token: string) {
  return readLearnerGrades(path ? await apiFetchResult<unknown>(path, token) : null);
}
