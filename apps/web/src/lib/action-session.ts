import type { NextAuthOptions } from 'next-auth';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { resolveSessionHeaders } from './request-session';

/** Server Actions are writable: persist rotated cookies instead of the RSC
 * getServerSession(options) overload, which deliberately discards Set-Cookie.
 * Call only from a Server Action, never from a Server Component render.
 */
export async function getActionSession(options: NextAuthOptions) {
  const cookieStore = await cookies();
  const resolved = await resolveSessionHeaders(
    new Headers(await headers()),
    cookieStore.getAll(),
    options,
  );
  // Use Next's public response-cookie parser, including chunked JWT cookies,
  // expiry/deletion and flags; never decode/re-sign a token ourselves.
  for (const serialized of resolved.cookies) {
    const response = new NextResponse(null, { headers: { 'set-cookie': serialized } });
    for (const cookie of response.cookies.getAll()) {
      // Next's parser omits falsy empty values and Max-Age=0. Preserve explicit
      // NextAuth deletion instructions, including obsolete JWT chunks.
      const deletion = /;\s*max-age\s*=\s*0(?:\s*;|\s*$)/i.test(serialized);
      cookieStore.set({
        ...cookie,
        value: cookie.value ?? '',
        ...(deletion ? { maxAge: 0, expires: new Date(0) } : {}),
      });
    }
  }
  return resolved.session;
}
