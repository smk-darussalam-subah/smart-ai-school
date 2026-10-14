// Edge-safe shared lifecycle rules. No provider secrets or Node imports here.
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const SESSION_POLL_SECONDS = 5 * 60;
export const SESSION_REFRESH_SECONDS = 10 * 60;
export const SESSION_RETRY_SECONDS = 30;

/** Reverse proxies can leave request.url on an internal service port. Use the
 * existing trusted auth origin, never caller-supplied forwarded identity headers.
 */
export function sessionAppOrigin(requestUrl: string): string {
  if (process.env.NODE_ENV === 'production' && !process.env.NEXTAUTH_URL)
    throw new Error('Application auth origin required');
  const url = new URL(process.env.NEXTAUTH_URL ?? requestUrl);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
  )
    throw new Error('Invalid application auth origin');
  return url.origin;
}

interface SessionTokenState {
  accessToken?: unknown;
  expiresAt?: unknown;
  refreshedAt?: unknown;
  refreshRetryAt?: unknown;
  error?: unknown;
}

/** Unknown failure markers also fail closed; only an explicit outage is retryable. */
export function isTerminalSessionError(error: unknown): boolean {
  return (
    error !== undefined &&
    error !== null &&
    error !== '' &&
    error !== 'RefreshAccessTokenTemporaryError'
  );
}

/** SessionProvider can return null after a transport failure as well as logout.
 * Probe the writable boundary once instead of inferring revocation from null.
 */
export function sessionRecoveryAction(
  status: 'loading' | 'authenticated' | 'unauthenticated',
  error: unknown,
  expired: boolean,
): 'LOGIN' | 'REFRESH' | null {
  if (isTerminalSessionError(error)) return 'LOGIN';
  if (status === 'unauthenticated') return 'REFRESH';
  if (expired && error !== 'RefreshAccessTokenTemporaryError') return 'REFRESH';
  return null;
}

export function hasUsableAccessToken(token: SessionTokenState | null, now = Date.now()): boolean {
  return Boolean(
    token &&
    !isTerminalSessionError(token.error) &&
    typeof token.accessToken === 'string' &&
    token.accessToken.trim() &&
    typeof token.expiresAt === 'number' &&
    Number.isFinite(token.expiresAt) &&
    token.expiresAt * 1000 > now,
  );
}

export function shouldRefreshSession(token: SessionTokenState, now = Date.now()): boolean {
  if (isTerminalSessionError(token.error)) return false;
  if (
    typeof token.refreshRetryAt === 'number' &&
    Number.isFinite(token.refreshRetryAt) &&
    token.refreshRetryAt * 1000 > now
  )
    return false;
  return (
    !hasUsableAccessToken(token, now + 30_000) ||
    typeof token.refreshedAt !== 'number' ||
    !Number.isFinite(token.refreshedAt) ||
    token.refreshedAt * 1000 + SESSION_REFRESH_SECONDS * 1000 <= now
  );
}
