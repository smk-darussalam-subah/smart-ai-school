import { apiFetchResult, type PaginatedResponse } from './api';
import { readAcademicPages, readAcademicCatalog } from './academic-scheduling';

export function academicPagesResult<T extends { id: string }>(path: string | null, token: string) {
  return readAcademicPages<T>(path, (query) => apiFetchResult<PaginatedResponse<T>>(query, token));
}
export async function academicPages<T extends { id: string }>(
  path: string | null,
  token: string,
): Promise<PaginatedResponse<T> | null> {
  const result = await academicPagesResult<T>(path, token);
  return result.status === 'success' ? result.data : null;
}
export async function academicCatalog<T extends { id: string }>(
  path: string,
  token: string,
): Promise<PaginatedResponse<T> | null> {
  const result = await readAcademicCatalog<T>(path, (query) =>
    apiFetchResult<{ data: T[]; total: number; limit: number; offset: number }>(query, token),
  );
  return result.status === 'success' ? result.data : null;
}
