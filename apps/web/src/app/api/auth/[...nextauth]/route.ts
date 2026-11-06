import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { matchesSignedOutSession, signedOutCookieName } from '@/lib/session-cookie-state';
import { sessionAppOrigin } from '@/lib/auth-session-state';

const handler: (
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) => Promise<Response> = NextAuth(authOptions);

async function sessionSafeHandler(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
): Promise<Response> {
  if (request.nextUrl.pathname.replace(/\/+$/, '') === '/api/auth/session') {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const secure = sessionAppOrigin(request.url).startsWith('https:');
    if (matchesSignedOutSession(token, request.cookies.get(signedOutCookieName(secure))?.value))
      return NextResponse.json(null, { headers: { 'cache-control': 'private, no-store' } });
  }
  return handler(request, context);
}

export { sessionSafeHandler as GET, sessionSafeHandler as POST };
