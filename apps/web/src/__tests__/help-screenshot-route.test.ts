const mockGetServerSession = jest.fn();
const mockResolveHelpAuthority = jest.fn();
const mockFindHelpScreenshot = jest.fn();
const mockStreamHelpScreenshot = jest.fn();

jest.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/help/help-authority', () => ({ resolveHelpAuthority: mockResolveHelpAuthority }));
jest.mock('@/lib/help/help-screenshots', () => {
  const actual = jest.requireActual('@/lib/help/help-screenshots');
  return {
    ...actual,
    findHelpScreenshot: mockFindHelpScreenshot,
    streamHelpScreenshot: mockStreamHelpScreenshot,
  };
});

import { GET } from '../app/api/help/screenshots/[id]/route';
import { HELP_SCREENSHOTS } from '@/lib/help/help-evidence';
import { helpScreenshotHeaders } from '@/lib/help/help-screenshots';
import type { HelpAuthoritySnapshot } from '@/lib/help/help-projection';
import type { HelpScreenshot } from '@/lib/help/help-schema';

const authority = (patch: Partial<HelpAuthoritySnapshot> = {}): HelpAuthoritySnapshot => ({
  identityRoles: ['GURU'],
  positionCodes: [],
  permissions: ['academic.teaching.read'],
  contexts: ['teaching-assignment'],
  viewAs: null,
  permissionCheckAvailable: true,
  selectedChildVerified: false,
  childCount: 0,
  ...patch,
});

const screenshot = (id: string, ready = true): HelpScreenshot => ({
  ...HELP_SCREENSHOTS.find((item) => item.id === id)!,
  assetStatus: ready ? 'ready' : 'pending',
  fileName: ready ? `${id.replace(/\./g, '-')}.png` : null,
  sha256: ready ? 'a'.repeat(64) : null,
  sizeBytes: ready ? 128 : null,
  width: ready ? 390 : null,
  height: ready ? 844 : null,
  candidateSha: ready ? 'b'.repeat(40) : null,
  capturedAt: ready ? '2026-08-28T10:00:00+07:00' : null,
  privacyReview: ready ? 'pass' : 'pending',
  visualReview: ready ? 'pass' : 'pending',
});

async function get(id: string, query = '', signal?: AbortSignal) {
  return GET(new Request(`https://school.test/api/help/screenshots/${id}${query}`, { signal }), {
    params: Promise.resolve({ id }),
  });
}

describe('Help screenshot route authority', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ accessToken: 'synthetic-token' });
    mockFindHelpScreenshot.mockImplementation((id: string) => screenshot(id));
    mockStreamHelpScreenshot.mockImplementation(async (_item: HelpScreenshot, signal: AbortSignal) => {
      if (signal.aborted) return null;
      return new Response('synthetic-image', { headers: helpScreenshotHeaders('image/png', 15) });
    });
  });

  it('returns an indistinguishable 404 for unknown, pending, and cross-persona media', async () => {
    mockResolveHelpAuthority.mockResolvedValue({ authority: authority(), topics: [], warning: null });
    mockFindHelpScreenshot.mockImplementation((id: string) => {
      if (id === 'shot.unknown') return null;
      return screenshot(id, id !== 'shot.academic.desktop');
    });

    const responses = await Promise.all([
      get('shot.unknown'),
      get('shot.academic.desktop'),
      get('shot.academic.mobile'),
      get('shot.report.mobile'),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.text()));
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    expect(new Set(bodies).size).toBe(1);
    expect(mockStreamHelpScreenshot).not.toHaveBeenCalled();
  });

  it('binds parent media to the server-verified selected child', async () => {
    mockResolveHelpAuthority.mockImplementation(async (_session: unknown, studentId?: string | null) => ({
      authority: authority({
        identityRoles: ['ORANG_TUA'],
        permissions: ['report.read'],
        contexts: studentId === 'child-owned' ? ['selected-child', 'multi-child'] : ['multi-child'],
        selectedChildVerified: studentId === 'child-owned',
        childCount: 2,
      }),
      topics: [],
      warning: null,
    }));

    expect((await get('shot.report.mobile')).status).toBe(404);
    expect((await get('shot.report.mobile', '?studentId=child-forged')).status).toBe(404);
    expect((await get('shot.report.mobile', '?studentId=child-owned')).status).toBe(200);
  });

  it('keeps corrupt, missing, and aborted streams generic with private image headers', async () => {
    mockResolveHelpAuthority.mockResolvedValue({
      authority: authority({ identityRoles: ['SISWA'], permissions: ['lms.read'], contexts: [] }),
      topics: [],
      warning: null,
    });
    mockStreamHelpScreenshot.mockResolvedValueOnce(null);
    expect((await get('shot.academic.mobile')).status).toBe(404);

    const controller = new AbortController();
    controller.abort();
    expect((await get('shot.academic.mobile', '', controller.signal)).status).toBe(404);

    const response = await get('shot.academic.mobile');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0, no-transform');
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
