// =============================================================================
// @smk/auth — Keycloak Auth Helpers
// Digunakan oleh apps/api (NestJS) dan apps/web (Next.js)
// =============================================================================

import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { z } from 'zod';

// ── Roles DIIS ───────────────────────────────────────────────────────────────
//
// Base roles (7) — role primer yang diberikan saat pembuatan akun di Keycloak.
// Position codes (13) — role turunan dari penugasan jabatan (Struktur Organisasi).
//   KEPALA_SEKOLAH adalah base role SEKALIGUS position code.
//   Saat PositionsService.assign() dijalankan, position code di-sync sebagai
//   Keycloak realm role agar RolesGuard (yang membaca JWT realm_access.roles)
//   dapat mengizinkan akses endpoint @Roles(positionCode).
// ────────────────────────────────────────────────────────────────────────────

/** 7 role identitas primer — disimpan di User.role, diberikan saat pembuatan akun. */
export const PRIMARY_ROLES = [
  'SUPER_ADMIN',
  'KEPALA_SEKOLAH',   // Base role SEKALIGUS position code
  'TATA_USAHA',       // Staf administrasi: keuangan, PPDB admin, data siswa
  'GURU',
  'SISWA',
  'ORANG_TUA',
  'INDUSTRI',         // Mitra industri: PKL/Prakerin, BKK, rekrutmen
] as const;

/** 13 kode jabatan dari Struktur Organisasi (2J-5). Harus exist sebagai Keycloak realm roles. */
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

// 19 unique values — KEPALA_SEKOLAH appears in both arrays but only once here.
export const UserRole = z.enum([
  // Primary roles (7)
  'SUPER_ADMIN',
  'KEPALA_SEKOLAH',
  'TATA_USAHA',
  'GURU',
  'SISWA',
  'ORANG_TUA',
  'INDUSTRI',
  // Position-only codes (12)
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
