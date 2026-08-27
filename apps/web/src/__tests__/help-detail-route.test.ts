const mockGetServerSession = jest.fn();
const mockResolveHelpAuthority = jest.fn();
const mockNotFound = jest.fn(() => { throw new Error('not-found'); });
const mockRedirect = jest.fn((url: string) => { throw new Error(`redirect:${url}`); });

jest.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
jest.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/help/help-authority', () => ({ resolveHelpAuthority: mockResolveHelpAuthority }));
jest.mock('@/lib/api', () => ({ apiFetchResult: jest.fn() }));

import HelpTopicPage, { metadata } from '../app/dashboard/panduan/[slug]/page';
import type { HelpAuthoritySnapshot } from '@/lib/help/help-projection';

const unauthorized: HelpAuthoritySnapshot = {
  identityRoles: ['GURU'],
  positionCodes: [],
  permissions: [],
  contexts: [],
  viewAs: null,
  permissionCheckAvailable: true,
  selectedChildVerified: false,
  childCount: 0,
};

describe('Help detail metadata boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ accessToken: 'synthetic-token' });
    mockResolveHelpAuthority.mockResolvedValue({ authority: unauthorized, topics: [], warning: null });
  });

  it('uses the same generic metadata for every detail slug', () => {
    expect(metadata).toEqual({ title: 'Panduan DIIS' });
  });

  it('does not distinguish a valid forbidden slug from an unknown slug', async () => {
    const forbidden = HelpTopicPage({
      params: Promise.resolve({ slug: 'pengguna-audit-dan-kesehatan-sistem' }),
      searchParams: Promise.resolve({}),
    });
    await expect(forbidden).rejects.toThrow('not-found');

    const unknown = HelpTopicPage({
      params: Promise.resolve({ slug: 'topik-yang-tidak-ada' }),
      searchParams: Promise.resolve({}),
    });
    await expect(unknown).rejects.toThrow('not-found');
    expect(mockNotFound).toHaveBeenCalledTimes(2);
  });
});
