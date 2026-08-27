const mockGetServerSession = jest.fn();
const mockResolveHelpAuthority = jest.fn();
const mockFindHelpArtifact = jest.fn();
const mockStreamHelpArtifact = jest.fn();

jest.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/help/help-authority', () => ({ resolveHelpAuthority: mockResolveHelpAuthority }));
jest.mock('@/lib/help/help-artifacts', () => {
  const actual = jest.requireActual('@/lib/help/help-artifacts');
  return {
    ...actual,
    findHelpArtifact: mockFindHelpArtifact,
    streamHelpArtifact: mockStreamHelpArtifact,
  };
});

import { GET } from '../app/api/help/artifacts/[id]/route';
import { HELP_ARTIFACTS } from '@/lib/help/help-evidence';
import { helpArtifactHeaders } from '@/lib/help/help-artifacts';
import type { HelpAuthoritySnapshot } from '@/lib/help/help-projection';
import type { HelpArtifact } from '@/lib/help/help-schema';

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

const artifact = (id: string, status: HelpArtifact['status'] = 'ready'): HelpArtifact => ({
  ...HELP_ARTIFACTS.find((item) => item.id === id)!,
  status,
});

async function get(id: string, query = '', signal?: AbortSignal) {
  return GET(new Request(`https://school.test/api/help/artifacts/${id}${query}`, { signal }), {
    params: Promise.resolve({ id }),
  });
}

describe('Help artifact route authority', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ accessToken: 'synthetic-token' });
    mockFindHelpArtifact.mockImplementation((id: string) => artifact(id));
    mockStreamHelpArtifact.mockImplementation(async (item: HelpArtifact, signal: AbortSignal) => {
      if (item.status !== 'ready' || signal.aborted) return null;
      return new Response('synthetic-pdf', { headers: helpArtifactHeaders(item, 13) });
    });
  });

  it('returns one generic response for unknown, pending, and cross-persona IDs', async () => {
    mockResolveHelpAuthority.mockResolvedValue({ authority: authority(), topics: [], warning: null });
    mockFindHelpArtifact.mockImplementation((id: string) => id === 'artifact.unknown' ? null : artifact(id, id === 'artifact.teacher' ? 'pending' : 'ready'));

    const responses = await Promise.all([
      get('artifact.unknown'),
      get('artifact.teacher'),
      get('artifact.student'),
      get('artifact.parent'),
    ]);
    const bodies = await Promise.all(responses.map((response) => response.text()));
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    expect(new Set(bodies).size).toBe(1);
    expect(mockStreamHelpArtifact).not.toHaveBeenCalled();
  });

  it('requires the verified selected child for a multi-child parent', async () => {
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

    expect((await get('artifact.parent')).status).toBe(404);
    expect((await get('artifact.parent', '?studentId=child-forged')).status).toBe(404);
    const response = await get('artifact.parent', '?studentId=child-owned');
    expect(response.status).toBe(200);
    expect(mockResolveHelpAuthority).toHaveBeenLastCalledWith(expect.anything(), 'child-owned');
  });

  it('supports a server-verified single child without trusting a client flag', async () => {
    mockResolveHelpAuthority.mockResolvedValue({
      authority: authority({
        identityRoles: ['ORANG_TUA'],
        permissions: ['report.read'],
        contexts: ['selected-child'],
        selectedChildVerified: true,
        childCount: 1,
      }),
      topics: [],
      warning: null,
    });
    expect((await get('artifact.parent')).status).toBe(200);
    expect(mockResolveHelpAuthority).toHaveBeenCalledWith(expect.anything(), null);
  });

  it('keeps missing files and aborted streams generic while preserving exact safe headers', async () => {
    mockResolveHelpAuthority.mockResolvedValue({ authority: authority(), topics: [], warning: null });
    mockStreamHelpArtifact.mockResolvedValueOnce(null);
    expect((await get('artifact.teacher')).status).toBe(404);

    const controller = new AbortController();
    controller.abort();
    expect((await get('artifact.teacher', '', controller.signal)).status).toBe(404);

    const response = await get('artifact.teacher');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0, no-transform');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="panduan-guru.pdf"');
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
