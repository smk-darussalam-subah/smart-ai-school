// =============================================================================
// SseTokenService — R-11: Short-lived SSE token management
//
// Replaces full Keycloak JWT in ?token=xxx query param for SSE endpoints.
// Tokens are:
//   - Cryptographically random (256-bit) plus an opaque session binding
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
import { logoutAuditId } from './session-binding';

/** Token TTL: 5 minutes (generous for EventSource connection setup). */
const SSE_TOKEN_TTL_MS = 5 * 60 * 1000;

/** Random bytes for token generation (256 bits). */
const SSE_TOKEN_BYTES = 32;

@Injectable()
export class SseTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a short-lived, one-time-use SSE token.
   * The token encodes a snapshot of the user's identity at creation time,
   * with an opaque session binding for logout revocation.
   *
   * @returns `{ token, expiresIn }` — opaque, random, session-bound ticket
   */
  async createToken(user: AuthUser): Promise<{ token: string; expiresIn: number }> {
    if (!user.sessionBinding || !/^[a-f0-9]{64}$/.test(user.sessionBinding))
      throw new UnauthorizedException('Sesi tidak dapat diverifikasi. Silakan masuk kembali.');
    const token = `${randomBytes(SSE_TOKEN_BYTES).toString('base64url')}.${user.sessionBinding}`;
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
    if (!token || !/^[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/.test(token)) {
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

    const sessionBinding = token.slice(token.indexOf('.') + 1);
    if (
      await this.prisma.auditLog.findUnique({
        where: { id: logoutAuditId(sessionBinding) },
        select: { id: true },
      })
    )
      throw new UnauthorizedException('Sesi telah berakhir.');
    // Atomic consumption also rejects simultaneous connections with the same ticket.
    const consumed = await this.prisma.sseToken.updateMany({
      where: { id: record.id, used: false, expiresAt: { gt: new Date() } },
      data: { used: true, consumedAt: new Date() },
    });
    if (consumed.count !== 1) throw new UnauthorizedException('SSE token sudah digunakan');

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
      sessionBinding,
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
