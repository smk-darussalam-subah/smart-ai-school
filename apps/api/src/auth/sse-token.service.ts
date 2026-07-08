// =============================================================================
// SseTokenService — R-11: Short-lived SSE token management
//
// Replaces full Keycloak JWT in ?token=xxx query param for SSE endpoints.
// Tokens are:
//   - Cryptographically random (256-bit / 64 hex chars)
//   - One-time use (consumed on validation, cannot be replayed)
//   - Expire in 5 minutes
//   - Stored in auth.sse_tokens table
//
// Flow:
//   1. Client calls POST /auth/sse-token (authenticated via Keycloak JWT)
//   2. Service creates token record with user identity snapshot
//   3. Client opens EventSource with ?token=<sse-token> (not Keycloak JWT)
//   4. SSE endpoint validates token via validateAndConsumeToken()
//   5. Token is marked as used — cannot be reused even if intercepted
// =============================================================================

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AuthUser, UserRole } from '@smk/auth';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';

/** Token TTL: 5 minutes (generous for EventSource connection setup). */
const SSE_TOKEN_TTL_MS = 5 * 60 * 1000;

/** Random bytes for token generation (256 bits → 64 hex chars). */
const SSE_TOKEN_BYTES = 32;

@Injectable()
export class SseTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a short-lived, one-time-use SSE token.
   * The token encodes a snapshot of the user's identity at creation time,
   * so subsequent role/permission changes don't affect active SSE sessions.
   *
   * @returns `{ token, expiresIn }` — token is a 64-char hex string
   */
  async createToken(user: AuthUser): Promise<{ token: string; expiresIn: number }> {
    const token = randomBytes(SSE_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + SSE_TOKEN_TTL_MS);

    await this.prisma.sseToken.create({
      data: {
        token,
        keycloakId: user.keycloakId,
        roles: user.roles,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        expiresAt,
      },
    });

    logger.info('[SseToken] Created SSE token', { keycloakId: user.keycloakId });
    return { token, expiresIn: SSE_TOKEN_TTL_MS };
  }

  /**
   * Validate and consume a one-time SSE token.
   * After validation, the token is marked as used and cannot be reused.
   *
   * @returns AuthUser reconstructed from the token record
   * @throws UnauthorizedException if token is invalid, expired, or already used
   */
  async validateAndConsumeToken(token: string): Promise<AuthUser> {
    if (!token || token.length !== SSE_TOKEN_BYTES * 2) {
      throw new UnauthorizedException('SSE token tidak valid');
    }

    const record = await this.prisma.sseToken.findUnique({
      where: { token },
    });

    if (!record) {
      throw new UnauthorizedException('SSE token tidak ditemukan');
    }

    if (record.used) {
      // Token replay attempt — log and reject
      logger.warn('[SseToken] Rejected replay of consumed SSE token', {
        keycloakId: record.keycloakId,
      });
      throw new UnauthorizedException('SSE token sudah digunakan');
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('SSE token sudah expired');
    }

    // Mark as consumed (one-time use — prevents replay even if token is intercepted)
    await this.prisma.sseToken.update({
      where: { id: record.id },
      data: { used: true, consumedAt: new Date() },
    });

    // Reconstruct AuthUser from token record
    const validRoles = record.roles.filter((r: string): r is UserRole =>
      (UserRole.options as readonly string[]).includes(r),
    );

    return {
      keycloakId: record.keycloakId,
      email: record.email,
      username: record.username,
      roles: validRoles,
      fullName: record.fullName,
    };
  }

  /**
   * Delete expired and consumed SSE tokens.
   * Called opportunistically on token creation to avoid stale records.
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.sseToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      logger.info('[SseToken] Cleaned up expired tokens', { count: result.count });
    }
    return result.count;
  }
}
