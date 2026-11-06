import type { JWT } from 'next-auth/jwt';

const SIGNED_OUT_COOKIE = 'diis.signed-out';

export function signedOutCookieName(secure: boolean): string {
  return secure ? `__Host-${SIGNED_OUT_COOKIE}` : SIGNED_OUT_COOKIE;
}

/** Navigation hint only. Durable server revocation remains the authority. */
export function matchesSignedOutSession(token: JWT | null, marker: string | undefined): boolean {
  if (!token || !marker) return false;
  return typeof token.browserSessionId === 'string'
    ? marker === token.browserSessionId
    : marker === 'legacy';
}
