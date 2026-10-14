import { getServerSession, type Session } from 'next-auth';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { NextRequest } from 'next/server';
import { authOptions } from './auth';

/** Use NextAuth v4's request/response overload so updated JWT cookies are not lost
 * through the read-only RSC overload. Only the documented header operations used
 * by its cookie serializer are adapted; no cookies are manually signed/chunked.
 */
export async function resolveRequestSession(
  request: NextRequest,
): Promise<{ session: Session | null; cookies: string[] }> {
  let cookies: string[] = [];
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    headers[name] = value;
  });
  const req = {
    headers,
    cookies: Object.fromEntries(
      request.cookies.getAll().map((cookie) => [cookie.name, cookie.value]),
    ),
  };
  const res = {
    getHeader(name: string) {
      return name.toLowerCase() === 'set-cookie' ? cookies : undefined;
    },
    setHeader(name: string, value: string | string[] | number) {
      if (name.toLowerCase() === 'set-cookie')
        cookies = Array.isArray(value) ? [...value] : [String(value)];
    },
  };
  const session = await getServerSession(
    req as NextApiRequest,
    res as unknown as NextApiResponse,
    authOptions,
  );
  return { session, cookies };
}

export function persistSessionCookies(response: Response, cookies: readonly string[]): Response {
  for (const value of cookies) response.headers.append('set-cookie', value);
  response.headers.set('cache-control', 'private, no-store');
  return response;
}
