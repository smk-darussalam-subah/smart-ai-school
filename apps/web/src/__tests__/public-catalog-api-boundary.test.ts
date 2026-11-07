import { apiFetch, apiMutate } from '../lib/api';
import { publicAcademicCatalog } from '../lib/public-academic-catalog';
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
const originalFetch = global.fetch;
const mockFetch = jest.fn();
beforeEach(() => { publicAcademicCatalog.invalidate(); mockFetch.mockReset(); global.fetch = mockFetch; });
afterAll(() => { global.fetch = originalFetch; });

it('shares only deliberately public bodies and never forwards account credentials into shared reads', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ number: 1 }) });
  await Promise.all([apiFetch('/school/semesters/active','account-one'), apiFetch('/school/semesters/active','account-two')]);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch.mock.calls[0][1]).toEqual({ cache: 'no-store', signal: expect.any(AbortSignal) });
  await apiFetch('/auth/me','account-one'); await apiFetch('/auth/me','account-two');
  expect(mockFetch).toHaveBeenCalledTimes(3);
  expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer account-one');
  expect(mockFetch.mock.calls[2][1].headers.Authorization).toBe('Bearer account-two');
});
it('invalidates on a confirmed period mutation even with204; rejected writes retain prior read', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ number: 1 }) });
  await apiFetch('/school/semesters/active','one');
  mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => '' });
  await apiMutate('/school/semesters/id','one',{ method:'PATCH', body:{ isActive:true } });
  await apiFetch('/school/semesters/active','two'); expect(mockFetch).toHaveBeenCalledTimes(2);
  mockFetch.mockResolvedValueOnce({ ok:true, status:204, text:async()=>'' });
  await apiMutate('/school/semesters/id','one',{ method:'PATCH', body:{ isActive:true } });
  await apiFetch('/school/semesters/active','two'); expect(mockFetch).toHaveBeenCalledTimes(4);
});
