export const PPDB_LEADS_PAGE_LIMIT = 100;

export interface PpdbLeadsListParams {
  page?: number;
  limit?: number;
  status?: string;
  source?: string;
  search?: string;
}

export function ppdbLeadsListPath(params: PpdbLeadsListParams = {}): string {
  const query = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? PPDB_LEADS_PAGE_LIMIT),
  });
  if (params.status) query.set('status', params.status);
  if (params.source) query.set('source', params.source);
  if (params.search) query.set('search', params.search);
  return `/ppdb/leads?${query.toString()}`;
}
