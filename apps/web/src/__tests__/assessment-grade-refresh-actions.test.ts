jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../lib/auth', () => ({ authOptions: {} }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
import { getServerSession } from 'next-auth';
import { revalidatePath } from 'next/cache';
import {
  completeAssessmentSession,
  gradeEssayResponse,
  reviewLateAssessmentSubmission,
} from '../app/dashboard/akademik/actions';

const fetchMock = jest.fn();
const originalFetch = global.fetch;
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock;
  jest.mocked(getServerSession).mockResolvedValue({ accessToken: 'synthetic-local-token' });
});
afterAll(() => {
  global.fetch = originalFetch;
});

describe('assessment mutation -> authoritative academic page invalidation', () => {
  const actions = [
    () => completeAssessmentSession('session-1'),
    () =>
      gradeEssayResponse('session-1', 'response-1', {
        questionId: 'question-1',
        criteriaScores: { reasoning: 90 },
      }),
    () =>
      reviewLateAssessmentSubmission('session-1', 'response-1', {
        decision: 'accept',
        note: 'Koneksi telah diperiksa',
      }),
  ];
  it.each(actions.map((action, index) => [index, action] as const))(
    'refreshes official reads after successful mutation %i',
    async (_index, action) => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'session-1', gradingSummary: { gradedCount: 1 } }), {
          status: 200,
        }),
      );
      expect((await action()).success).toBe(true);
      expect(revalidatePath).toHaveBeenCalledTimes(1);
      expect(revalidatePath).toHaveBeenCalledWith('/dashboard/akademik');
      expect(fetchMock.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ method: 'PATCH', cache: 'no-store' }),
      );
    },
  );
  it.each(actions.map((action, index) => [index, action] as const))(
    'keeps a failed mutation %i distinct from a fresh successful read',
    async (_index, action) => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Periode ditutup' }), { status: 409 }),
      );
      expect((await action()).success).toBe(false);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
});
