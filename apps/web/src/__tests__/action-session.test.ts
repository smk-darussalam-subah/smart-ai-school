import { getActionSession } from '../lib/action-session';
import { resolveSessionHeaders } from '../lib/request-session';
import { NextResponse } from 'next/server';
const mockSet = jest.fn();
jest.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-test': 'safe' }),
  cookies: async () => ({
    getAll: () => [{ name: 'next-auth.session-token', value: 'old' }],
    set: (...args: unknown[]) => mockSet(...args),
  }),
}));
jest.mock('../lib/request-session', () => ({ resolveSessionHeaders: jest.fn() }));
const resolveMock = jest.mocked(resolveSessionHeaders);

beforeEach(() => {
  jest.clearAllMocks();
});
it('persists rotated/chunked cookies with security attributes', async () => {
  resolveMock.mockResolvedValue({
    session: { user: { name: 'safe' }, expires: 'future' },
    cookies: [
      'next-auth.session-token.0=part0; Path=/; HttpOnly; SameSite=Lax; Secure',
      'next-auth.session-token.1=part1; Path=/; HttpOnly; SameSite=Lax; Secure',
    ],
  });
  const result = await getActionSession({ providers: [] });
  expect(result?.user?.name).toBe('safe');
  expect(mockSet).toHaveBeenCalledTimes(2);
  expect(mockSet).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'next-auth.session-token.0',
      value: 'part0',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    }),
  );
  expect(mockSet).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'next-auth.session-token.1', value: 'part1' }),
  );
});
it('preserves deletion cookies and does not synthesize a session after logout', async () => {
  resolveMock.mockResolvedValue({
    session: null,
    cookies: ['next-auth.session-token=; Path=/; Max-Age=0; HttpOnly'],
  });
  expect(await getActionSession({ providers: [] })).toBeNull();
  expect(mockSet).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'next-auth.session-token', value: '', maxAge: 0 }),
  );
});
it('never swallows persistence failure before a mutation', async () => {
  resolveMock.mockResolvedValue({
    session: { expires: 'future' },
    cookies: ['next-auth.session-token=new; Path=/'],
  });
  mockSet.mockImplementationOnce(() => {
    throw new Error('not writable');
  });
  await expect(getActionSession({ providers: [] })).rejects.toThrow('not writable');
});
it('uses Next cookie parsing semantics for duplicate cookie updates', () => {
  const response = new NextResponse(null, {
    headers: [
      ['set-cookie', 'a=old; Path=/'],
      ['set-cookie', 'a=new; Path=/'],
    ],
  });
  expect(response.cookies.get('a')?.value).toBe('new');
});
