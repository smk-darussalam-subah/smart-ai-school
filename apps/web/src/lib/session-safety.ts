import { encode, type JWTEncodeParams } from 'next-auth/jwt';

export const MAX_SESSION_JWE_BYTES = 6000;

/** Keep one logical Cookie header under the ingress budget. ID tokens are not
 * needed in the browser JWT: provider logout uses the server-held refresh token. */
export async function encodeBoundedSession(params: JWTEncodeParams): Promise<string> {
  const compact = { ...params.token };
  delete compact.idToken;
  const value = await encode({ ...params, token: compact });
  if (Buffer.byteLength(value, 'utf8') <= MAX_SESSION_JWE_BYTES) return value;
  return encode({
    ...params,
    token: {
      sub: compact.sub,
      browserSessionId: compact.browserSessionId,
      error: 'SessionCookieTooLarge',
    },
  });
}
