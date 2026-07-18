export const PPDB_LEADS_PAGE_LIMIT = 100;

export function ppdbLeadsListPath(): string {
  return `/ppdb/leads?limit=${PPDB_LEADS_PAGE_LIMIT}`;
}
