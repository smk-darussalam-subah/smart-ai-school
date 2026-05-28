// =============================================================================
// NextAuth Configuration — Keycloak SSO Provider
// Docs: https://next-auth.js.org/providers/keycloak
// =============================================================================

import { NextAuthOptions, Session } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import KeycloakProvider from 'next-auth/providers/keycloak';

// Extend next-auth types to carry DIIS-specific fields
declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    roles?: string[];
    keycloakId?: string;
    error?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    roles?: string[];
    keycloakId?: string;
    error?: string;
  }
}

// =============================================================================
// Helper: Extract Keycloak realm roles from token payload
// =============================================================================
function extractKeycloakRoles(token: JWT & Record<string, unknown>): string[] {
  const realmAccess = token['realm_access'] as { roles?: string[] } | undefined;
  return realmAccess?.roles?.filter((r) => !r.startsWith('default-roles')) ?? [];
}

// =============================================================================
// Helper: Refresh access token using Keycloak token endpoint
// =============================================================================
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const keycloakUrl = process.env.KEYCLOAK_ISSUER!;
    const response = await fetch(`${keycloakUrl}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
        refresh_token: token.refreshToken ?? '',
      }),
    });

    const refreshed = await response.json();

    if (!response.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
      error: undefined,
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' };
  }
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
    maxAge: 8 * 60 * 60, // 8 hours — matches school working day
  },

  callbacks: {
    // ------------------------------------------------------------------
    // jwt: called on every token creation/refresh
    // ------------------------------------------------------------------
    async jwt({ token, account, profile }) {
      // Initial sign-in: persist tokens from Keycloak
      if (account && profile) {
        const p = profile as JWT & Record<string, unknown>;
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          roles: extractKeycloakRoles(p),
          keycloakId: profile.sub,
        };
      }

      // Token still valid — return as-is
      if (Date.now() < (token.expiresAt ?? 0) * 1000 - 30_000) {
        return token;
      }

      // Access token expired — try to refresh
      return refreshAccessToken(token);
    },

    // ------------------------------------------------------------------
    // session: what the client receives via useSession()
    // ------------------------------------------------------------------
    async session({ session, token }): Promise<Session> {
      return {
        ...session,
        accessToken: token.accessToken,
        roles: token.roles,
        keycloakId: token.keycloakId,
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
