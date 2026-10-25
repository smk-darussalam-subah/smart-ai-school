import { apiFetchResult } from './api';
import { readStudentTasks, readParentSpp } from './learner-dashboard-read';

export async function fetchStudentTasks(token: string) {
  return readStudentTasks(await apiFetchResult<unknown>('/student-dashboard/assignments', token));
}

export async function fetchParentSpp(token: string, childIds: string[]) {
  return readParentSpp(await apiFetchResult<unknown>('/student-dashboard/spp', token), childIds);
}
