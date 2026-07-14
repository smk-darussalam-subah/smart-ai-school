// =============================================================================
// Application-wide constants
// =============================================================================

/**
 * Current PDP consent (LoA) version.
 * When this changes, all users must re-consent on next login.
 * Admin can also selectively reset consent via /users/:id/reset-consent.
 */
export const CURRENT_CONSENT_VERSION = 'v1.0';

/**
 * API base URL for server-side calls (Next.js server → NestJS backend).
 * Uses internal Docker network name in production, localhost in dev.
 */
export const API_BASE = process.env.API_URL ?? 'http://localhost:3001';
