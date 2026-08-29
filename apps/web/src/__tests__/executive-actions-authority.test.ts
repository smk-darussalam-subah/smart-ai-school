const mockRequireAccess = jest.fn();
const mockApiFetch = jest.fn();

jest.mock('@/app/dashboard/executive/executive-authority.server', () => ({
  requireExecutiveDashboardAccess: mockRequireAccess,
}));
jest.mock('@/lib/api', () => ({ apiFetch: mockApiFetch }));

import {
  fetchAcademicYears,
  fetchExecutiveBundle,
  fetchExecutivePageData,
} from '@/app/dashboard/executive/actions';

describe('executive Server Action authority', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['academic-year action', () => fetchAcademicYears()],
    ['executive-bundle action', () => fetchExecutiveBundle({})],
  ])('stops an unauthorized %s before any API request', async (_label, invoke) => {
    mockRequireAccess.mockRejectedValueOnce(new Error('NEXT_REDIRECT'));

    await expect(invoke()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('guards both exported actions before loading executive data', async () => {
    mockRequireAccess.mockResolvedValue({ accessToken: 'synthetic-token' });
    mockApiFetch.mockResolvedValue(null);

    await expect(fetchAcademicYears()).resolves.toEqual([]);
    await expect(fetchExecutiveBundle({})).resolves.toEqual(expect.objectContaining({
      studentsActive: null,
      majors: [],
    }));
    expect(mockRequireAccess).toHaveBeenCalledTimes(2);
    expect(mockApiFetch).toHaveBeenCalled();
  });

  it('resolves authority once for the initial page bundle', async () => {
    mockRequireAccess.mockResolvedValue({ accessToken: 'synthetic-token' });
    mockApiFetch.mockResolvedValue(null);

    await expect(fetchExecutivePageData({})).resolves.toEqual(expect.objectContaining({
      initial: expect.objectContaining({ studentsActive: null, majors: [] }),
      years: [],
    }));
    expect(mockRequireAccess).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalled();
  });
});
