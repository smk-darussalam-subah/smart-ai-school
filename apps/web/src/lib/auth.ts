// =============================================================================
// NextAuth Configuration — Keycloak SSO Provider
// Docs: https://next-auth.js.org/providers/keycloak
// =============================================================================

import { NextAuthOptions, Session } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import KeycloakProvider from 'next-auth/providers/keycloak';
import { PRIMARY_ROLES } from '@smk/auth';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  hasUsableAccessToken,
  isTerminalSessionError,
  shouldRefreshSession,
  SESSION_MAX_AGE_SECONDS,
  SESSION_RETRY_SECONDS,
} from './auth-session-state';

// Extend next-auth types to carry DIIS-specific fields
declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    roles?: string[];
    keycloakId?: string;
    consentVersion?: string | null;
    error?: string;
    accessTokenExpiresAt?: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    idToken?: string; // untuk federated logout (id_token_hint ke Keycloak end-session)
    expiresAt?: number;
    roles?: string[];
    keycloakId?: string;
    consentVersion?: string | null;
    error?: string;
    refreshedAt?: number;
    refreshRetryAt?: number;
  }
}

// =============================================================================
// Helper: Extract Keycloak realm roles from token payload
// =============================================================================
function extractKeycloakRoles(token: JWT & Record<string, unknown>): string[] {
  const realmAccess = token['realm_access'] as { roles?: string[] } | undefined;
  return realmAccess?.roles?.filter((r) => (PRIMARY_ROLES as readonly string[]).includes(r)) ?? [];
}

// =============================================================================
// Helper: Refresh access token using Keycloak token endpoint
// =============================================================================
const refreshPayload = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().finite().int().gt(30),
});
type RefreshOutcome =
  | {
      accessToken: string;
      refreshToken?: string;
      expiresAt: number;
      refreshedAt: number;
      error?: undefined;
      refreshRetryAt?: undefined;
    }
  | { error: 'RefreshAccessTokenError' | 'RefreshAccessTokenTemporaryError' };
// Per-process single-flight, not a distributed lock. Short retention also covers
// parallel HTTP requests arriving with an old cookie before Set-Cookie is applied.
const refreshFlights = new Map<string, { promise: Promise<RefreshOutcome>; retainUntil: number }>();
const MAX_REFRESH_FLIGHTS = 256;

function applyRefreshOutcome(token: JWT, outcome: RefreshOutcome): JWT {
  if (!outcome.error)
    return { ...token, ...outcome, refreshToken: outcome.refreshToken ?? token.refreshToken };
  if (outcome.error === 'RefreshAccessTokenError')
    return {
      ...token,
      accessToken: undefined,
      refreshToken: undefined,
      expiresAt: 0,
      refreshRetryAt: undefined,
      error: outcome.error,
    };
  return {
    ...token,
    accessToken: hasUsableAccessToken(token) ? token.accessToken : undefined,
    error: outcome.error,
    refreshRetryAt: Math.floor(Date.now() / 1000) + SESSION_RETRY_SECONDS,
  };
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) return applyRefreshOutcome(token, { error: 'RefreshAccessTokenError' });
  const key = createHash('sha256')
    .update(
      JSON.stringify([
        process.env.KEYCLOAK_ISSUER,
        process.env.KEYCLOAK_CLIENT_ID,
        token.keycloakId ?? token.sub,
        token.refreshToken,
      ]),
    )
    .digest('hex');
  const now = Date.now();
  for (const [id, entry] of refreshFlights) if (entry.retainUntil <= now) refreshFlights.delete(id);
  const existing = refreshFlights.get(key);
  if (existing) return applyRefreshOutcome(token, await existing.promise);
  if (refreshFlights.size >= MAX_REFRESH_FLIGHTS)
    return applyRefreshOutcome(token, { error: 'RefreshAccessTokenTemporaryError' });
  const promise = (async (): Promise<RefreshOutcome> => {
    try {
      const response = await fetch(`${process.env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
        method: 'POST',
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: process.env.KEYCLOAK_CLIENT_ID ?? '',
          client_secret: process.env.KEYCLOAK_CLIENT_SECRET ?? '',
          refresh_token: token.refreshToken!,
        }),
      });
      if (!response.ok) {
        // Only explicit credential rejection is terminal. Timeouts, throttling,
        // malformed responses and provider/config outages must remain retryable.
        const body: unknown = await response.json().catch(() => null);
        const rejected =
          (response.status === 400 || response.status === 401) &&
          body !== null &&
          typeof body === 'object' &&
          'error' in body &&
          body.error === 'invalid_grant';
        return { error: rejected ? 'RefreshAccessTokenError' : 'RefreshAccessTokenTemporaryError' };
      }
      const parsed = refreshPayload.safeParse(await response.json());
      if (!parsed.success) return { error: 'RefreshAccessTokenTemporaryError' };
      const stamp = Math.floor(Date.now() / 1000);
      return {
        accessToken: parsed.data.access_token,
        refreshToken: parsed.data.refresh_token,
        expiresAt: stamp + parsed.data.expires_in,
        refreshedAt: stamp,
        error: undefined,
        refreshRetryAt: undefined,
      };
    } catch {
      return { error: 'RefreshAccessTokenTemporaryError' };
    }
  })();
  const entry = { promise, retainUntil: Infinity };
  refreshFlights.set(key, entry);
  const outcome = await promise;
  entry.retainUntil = Date.now() + (outcome.error ? SESSION_RETRY_SECONDS * 1000 : 15_000);
  return applyRefreshOutcome(token, outcome);
}

// =============================================================================
// NextAuth Options
// =============================================================================
export const authOptions: NextAuthOptions = {
  providers: [
    KeycloakProvider({
      clientId: process.env.KEYCLOAK_CLIENT_ID!,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SECONDS, // Existing eight-hour policy is unchanged.
  },

  callbacks: {
    // ------------------------------------------------------------------
    // jwt: called on every token creation/refresh
    // ------------------------------------------------------------------
    async jwt({ token, account, profile }) {
      // Initial sign-in: persist tokens from Keycloak
      if (account && profile) {
        const p = profile as JWT & Record<string, unknown>;

        // Fetch consentVersion from /auth/me to embed in JWT.
        // This allows middleware to check consent without API calls.
        let consentVersion: string | null = null;
        try {
          const apiBase = process.env.API_URL ?? 'http://localhost:3001';
          const meRes = await fetch(new URL('/api/v1/auth/me', apiBase), {
            headers: { Authorization: `Bearer ${account.access_token}` },
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
          });
          if (meRes.status === 401 || meRes.status === 403)
            return {
              ...token,
              accessToken: undefined,
              refreshToken: undefined,
              expiresAt: 0,
              error: 'AccountAccessError',
              keycloakId: profile.sub,
              roles: extractKeycloakRoles(p),
            };
          if (meRes.ok) {
            const me: unknown = await meRes.json();
            consentVersion =
              me !== null &&
              typeof me === 'object' &&
              'consentVersion' in me &&
              typeof me.consentVersion === 'string'
                ? me.consentVersion
                : null;
          }
        } catch {
          // Fail-soft: consent check will redirect to /consent if null
        }

        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          idToken: account.id_token,
          expiresAt: account.expires_at,
          roles: extractKeycloakRoles(p),
          keycloakId: profile.sub,
          consentVersion,
          refreshedAt: Math.floor(Date.now() / 1000),
          refreshRetryAt: undefined,
          error: undefined,
        };
      }

      if (isTerminalSessionError(token.error)) return { ...token, accessToken: undefined };
      return shouldRefreshSession(token) ? refreshAccessToken(token) : token;
    },

    // ------------------------------------------------------------------
    // session: what the client receives via useSession()
    // ------------------------------------------------------------------
    async session({ session, token }): Promise<Session> {
      return {
        ...session,
        accessToken: hasUsableAccessToken(token) ? token.accessToken : undefined,
        accessTokenExpiresAt: token.expiresAt,
        roles: token.roles,
        keycloakId: token.keycloakId,
        consentVersion: token.consentVersion,
        error: token.error,
      };
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  // Force HTTPS on Keycloak callback in production
  ...(process.env.NODE_ENV === 'production' && {
    cookies: {
      sessionToken: {
        name: '__Secure-next-auth.session-token',
        options: { httpOnly: true, sameSite: 'lax', path: '/', secure: true },
      },
    },
  }),
};
