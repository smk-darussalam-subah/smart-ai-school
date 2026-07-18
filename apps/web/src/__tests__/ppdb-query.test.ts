import { PPDB_LEADS_PAGE_LIMIT, ppdbLeadsListPath } from '@/app/dashboard/ppdb/ppdb-query';

describe('PPDB dashboard query contract', () => {
  it('keeps the dashboard list limit within the API DTO maximum', () => {
    expect(PPDB_LEADS_PAGE_LIMIT).toBeLessThanOrEqual(100);
    expect(ppdbLeadsListPath()).toBe('/ppdb/leads?page=1&limit=100');
  });

  it('serializes server pagination and filters explicitly', () => {
    expect(ppdbLeadsListPath({ page: 2, limit: 20, status: 'accepted', search: 'Budi' }))
      .toBe('/ppdb/leads?page=2&limit=20&status=accepted&search=Budi');
  });
});
