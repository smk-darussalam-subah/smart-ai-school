// =============================================================================
// @smk/auth — Keycloak Auth Helpers
// Digunakan oleh apps/api (NestJS) dan apps/web (Next.js)
// =============================================================================

import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { z } from 'zod';

// ── Roles DIIS ───────────────────────────────────────────────────────────────
//
// Stable identity roles (6) are the only roles assigned as Keycloak realm roles.
// Position codes (13), including KEPALA_SEKOLAH, are period-bound DIIS catalog
// values and must not be created, assigned, or removed through Keycloak roles.
// ────────────────────────────────────────────────────────────────────────────

/** Stable identity roles stored in User.role and assigned to accounts in Keycloak. */
// Appointment Wave A: stable identity roles only. KEPALA_SEKOLAH is now a
// period-bound position code and must not be assigned as a Keycloak realm role.
export const PRIMARY_ROLES = [
  'SUPER_ADMIN',
  'TATA_USAHA',       // Staf administrasi: keuangan, PPDB admin, data siswa
  'GURU',
  'SISWA',
  'ORANG_TUA',
  'INDUSTRI',         // Mitra industri: PKL/Prakerin, BKK, rekrutmen
] as const;

export type PrimaryRole = typeof PRIMARY_ROLES[number];
export const PrimaryRoleSchema = z.enum(PRIMARY_ROLES);

/** Position codes from Struktur Organisasi. They are not Keycloak realm roles. */
// Appointment Wave A: position codes remain DIIS catalog values only.
export const POSITION_CODES = [
  'KEPALA_SEKOLAH',
  'WAKA_KURIKULUM',
  'WAKA_KESISWAAN',
  'WAKA_HUMAS',
  'WAKA_SARPRAS',
  'KEPALA_TU',
  'KAPROG',
  'KOOR_BKK',
  'KOOR_HUBIN',
  'GURU_BK',
  'BENDAHARA',
  'STAF_KEPEGAWAIAN',
  'OPERATOR_DAPODIK',
] as const;

export type PositionCode = typeof POSITION_CODES[number];

// 19 unique values: 6 identity roles + 13 position-only codes.
export const UserRole = z.enum([
  // Stable identity roles (6)
  'SUPER_ADMIN',
  'TATA_USAHA',
  'GURU',
  'SISWA',
  'ORANG_TUA',
  'INDUSTRI',
  // Position-only codes (13)
  'KEPALA_SEKOLAH',
  'WAKA_KURIKULUM',
  'WAKA_KESISWAAN',
  'WAKA_HUMAS',
  'WAKA_SARPRAS',
  'KEPALA_TU',
  'KAPROG',
  'KOOR_BKK',
  'KOOR_HUBIN',
  'GURU_BK',
  'BENDAHARA',
  'STAF_KEPEGAWAIAN',
  'OPERATOR_DAPODIK',
]);
export type UserRole = z.infer<typeof UserRole>;

/** Cek apakah suatu role adalah position code (bukan base role). */
export function isPositionCode(role: string): role is PositionCode {
  return (POSITION_CODES as readonly string[]).includes(role);
}

/** Cek apakah suatu role adalah stable identity role Keycloak. */
export function isPrimaryRole(role: string): role is PrimaryRole {
  return (PRIMARY_ROLES as readonly string[]).includes(role);
}

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
    isPrimaryRole(r)
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
 * Cek apakah user adalah stable identity admin.
 * KEPALA_SEKOLAH adalah jabatan period-bound dan tidak lagi dihitung dari JWT role.
 */
export function isAdmin(user: AuthUser): boolean {
  return hasRole(user, 'SUPER_ADMIN');
}
