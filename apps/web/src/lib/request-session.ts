import { getServerSession, type NextAuthOptions, type Session } from 'next-auth';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { NextRequest } from 'next/server';
import { authOptions } from './auth';
import { getToken, type JWT } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import { matchesSignedOutSession, signedOutCookieName } from './session-cookie-state';
import { sessionAppOrigin } from './auth-session-state';

/** Use NextAuth v4's request/response overload so updated JWT cookies are not lost
 * through the read-only RSC overload. Only the documented header operations used
 * by its cookie serializer are adapted; no cookies are manually signed/chunked.
 */
export async function resolveRequestSession(
  request: NextRequest,
  allowSignedOut = false,
): Promise<{ session: Session | null; cookies: string[] }> {
  return resolveSessionHeaders(
    request.headers,
    request.cookies.getAll(),
    authOptions,
    allowSignedOut,
  );
}

export async function resolveSessionHeaders(
  requestHeaders: Headers,
  requestCookies: ReadonlyArray<{ name: string; value: string }>,
  options: NextAuthOptions,
  allowSignedOut = false,
): Promise<{ session: Session | null; cookies: string[] }> {
  let cookies: string[] = [];
  const before = await decodeSessionCookies(requestHeaders, requestCookies, [], options);
  const secure = sessionAppOrigin(process.env.NEXTAUTH_URL ?? 'http://localhost').startsWith(
    'https:',
  );
  const signedOut = requestCookies.find(
    (cookie) => cookie.name === signedOutCookieName(secure),
  )?.value;
  if (!allowSignedOut && matchesSignedOutSession(before, signedOut))
    return { session: null, cookies: [] };
  const headers: Record<string, string> = {};
  requestHeaders.forEach((value, name) => {
    headers[name] = value;
  });
  const req = {
    headers,
    cookies: Object.fromEntries(requestCookies.map((cookie) => [cookie.name, cookie.value])),
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
    options,
  );
  const after = await decodeSessionCookies(requestHeaders, requestCookies, cookies, options);
  // A plain read must not renew an identical JWT and invalidate the RSC tree.
  // Actual refresh/consent/error changes and deletion cookies are preserved.
  const renewedRecently =
    before && typeof before.iat === 'number' && Date.now() / 1000 - before.iat < 10 * 60;
  if (before && after && renewedRecently && semanticToken(before) === semanticToken(after))
    cookies = [];
  return { session, cookies };
}

function semanticToken(token: JWT): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(token)
        .filter(([key]) => !['iat', 'exp', 'jti'].includes(key))
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
}

/** Official NextAuth decode + Next response-cookie parser; no custom JWT codec. */
export async function decodeSessionCookies(
  requestHeaders: Headers,
  requestCookies: ReadonlyArray<{ name: string; value: string }>,
  updates: readonly string[],
  options: NextAuthOptions = authOptions,
): Promise<JWT | null> {
  const values = new Map(requestCookies.map((cookie) => [cookie.name, cookie.value]));
  for (const serialized of updates) {
    const parsed = new NextResponse(null, { headers: { 'set-cookie': serialized } });
    for (const cookie of parsed.cookies.getAll()) {
      if (!cookie.value || /;\s*max-age\s*=\s*0(?:\s*;|\s*$)/i.test(serialized))
        values.delete(cookie.name);
      else values.set(cookie.name, cookie.value);
    }
  }
  const headers: Record<string, string> = {};
  requestHeaders.forEach((value, name) => {
    headers[name] = value;
  });
  return getToken({
    req: { headers, cookies: Object.fromEntries(values) } as NextApiRequest,
    secret: options.secret ?? process.env.NEXTAUTH_SECRET,
    ...(options.cookies?.sessionToken?.name
      ? { cookieName: options.cookies.sessionToken.name }
      : {}),
    ...(options.jwt?.decode ? { decode: options.jwt.decode } : {}),
  });
}

export function persistSessionCookies(response: Response, cookies: readonly string[]): Response {
  for (const value of cookies) response.headers.append('set-cookie', value);
  response.headers.set('cache-control', 'private, no-store');
  return response;
}
