// =============================================================================
// @smk/auth — Keycloak Auth Helpers
// Digunakan oleh apps/api (NestJS) dan apps/web (Next.js)
// =============================================================================

import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { z } from 'zod';

// ── Roles DIIS ───────────────────────────────────────────────────────────────

export const UserRole = z.enum([
  'SUPER_ADMIN',
  'KEPALA_SEKOLAH',
  'TATA_USAHA',   // Staf administrasi: keuangan, PPDB admin, data siswa
  'GURU',
  'SISWA',
  'ORANG_TUA',
  'INDUSTRI',     // Mitra industri: PKL/Prakerin, BKK, rekrutmen
]);
export type UserRole = z.infer<typeof UserRole>;

// ── JWT Payload dari Keycloak ─────────────────────────────────────────────────

export const KeycloakTokenPayloadSchema = z.object({
  sub: z.string(),                          // Keycloak user ID (UUID)
  email: z.string().email().optional(),
  email_verified: z.boolean().optional(),
  preferred_username: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  realm_access: z.object({
    roles: z.array(z.string()),
  }).optional(),
  resource_access: z.record(z.object({
    roles: z.array(z.string()),
  })).optional(),
  iat: z.number(),
  exp: z.number(),
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
});

export type KeycloakTokenPayload = z.infer<typeof KeycloakTokenPayloadSchema>;

// ── AuthUser (yang diinjeksi ke setiap request) ───────────────────────────────

export interface AuthUser {
  keycloakId: string;
  email: string;
  username: string;
  roles: UserRole[];
  fullName: string;
}

// ── JWKS Client untuk verifikasi token ──────────────────────────────────────

let _jwksClient: jwksClient.JwksClient | null = null;

function getJwksClient(): jwksClient.JwksClient {
  if (!_jwksClient) {
    const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8080';
    const realm = process.env.KEYCLOAK_REALM || 'smk-ecosystem';

    _jwksClient = jwksClient({
      jwksUri: `${keycloakUrl}/realms/${realm}/protocol/openid-connect/certs`,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 10 * 60 * 1000, // 10 menit
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }
  return _jwksClient;
}

/**
 * Verifikasi dan decode Keycloak JWT
 * @throws Error jika token invalid atau expired
 */
export async function verifyKeycloakToken(token: string): Promise<KeycloakTokenPayload> {
  const client = getJwksClient();

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
    throw new Error('Token tidak valid: tidak bisa di-decode');
  }

  const key = await client.getSigningKey(decoded.header.kid);
  const publicKey = key.getPublicKey();

  const keycloakUrl = process.env.KEYCLOAK_URL || 'http://localhost:8080';
  const realm = process.env.KEYCLOAK_REALM || 'smk-ecosystem';
  const issuer = process.env.KEYCLOAK_ISSUER || `${keycloakUrl}/realms/${realm}`;

  const verified = jwt.verify(token, publicKey, {
    issuer,
    algorithms: ['RS256'],
  });

  return KeycloakTokenPayloadSchema.parse(verified);
}

/**
 * Ekstrak AuthUser dari Keycloak token payload
 */
export function extractAuthUser(payload: KeycloakTokenPayload): AuthUser {
  const realmRoles = payload.realm_access?.roles || [];
  const validRoles = realmRoles.filter((r): r is UserRole =>
    UserRole.options.includes(r as UserRole)
  );

  return {
    keycloakId: payload.sub,
    email: payload.email || '',
    username: payload.preferred_username || payload.sub,
    roles: validRoles,
    fullName: [payload.given_name, payload.family_name].filter(Boolean).join(' ') || payload.preferred_username || '',
  };
}

/**
 * Cek apakah user memiliki role tertentu
 */
export function hasRole(user: AuthUser, ...roles: UserRole[]): boolean {
  return roles.some((role) => user.roles.includes(role));
}

/**
 * Cek apakah user adalah admin (SUPER_ADMIN atau KEPALA_SEKOLAH)
 */
export function isAdmin(user: AuthUser): boolean {
  return hasRole(user, 'SUPER_ADMIN', 'KEPALA_SEKOLAH');
}
