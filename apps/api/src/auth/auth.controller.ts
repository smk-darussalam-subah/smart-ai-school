// =============================================================================
// AuthController — /auth/me, /auth/consent, /auth/heartbeat, /auth/login-events
// Rate limit ketat: 15 req/menit (override global 100) — auth endpoints sensitif
// =============================================================================

import { Controller, Get, Patch, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '@smk/auth';
import { AuthService } from './auth.service';
import { SseTokenService } from './sse-token.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { UpdateMeSchema, UpdateMeDto } from './dto/update-me.dto';
import { ConsentSchema, ConsentDto } from './dto/consent.dto';
import { RecordLoginEventSchema, RecordLoginEventDto } from './dto/login-event.dto';

@Throttle({ default: { ttl: 60_000, limit: 15 } })
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private sseTokenService: SseTokenService,
  ) {}

  /**
   * Profil user yang sedang login.
   * Semua role authenticated boleh akses — tidak ada @Roles() restriction.
   * Data dari DB (bukan JWT) agar role selalu sinkron.
   */
  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.authService.getMe(user.keycloakId, user.roles);
  }

  /**
   * Update phone/avatarUrl diri sendiri.
   * Field lain (role, email, keycloakId) tidak bisa diubah — strict() di Zod menolak 400.
   */
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body(ZodPipe(UpdateMeSchema)) dto: UpdateMeDto,
  ) {
    return this.authService.updateMe(user.keycloakId, dto);
  }

  /**
   * R-11: Create a short-lived, one-time-use SSE token.
   *
   * EventSource API cannot send custom headers, so SSE endpoints accept
   * ?token=xxx query param. Previously this exposed the full Keycloak JWT
   * in browser history, server logs, and referrer headers.
   *
   * This endpoint returns a throwaway token (5-min TTL, one-time use) that
   * is validated independently from Keycloak JWT. The token encodes a
   * snapshot of the user's identity at creation time.
   */
  @Post('sse-token')
  createSseToken(@CurrentUser() user: AuthUser) {
    return this.sseTokenService.createToken(user);
  }

  // ── PDP Consent (R-05) ──────────────────────────────────────────────────────

  /**
   * POST /auth/consent — record user's acceptance of the LoA.
   * Any authenticated user can consent for themselves.
   */
  @Post('consent')
  recordConsent(
    @CurrentUser() user: AuthUser,
    @Body(ZodPipe(ConsentSchema)) dto: ConsentDto,
  ) {
    return this.authService.recordConsent(user.keycloakId, dto.version);
  }

  // ── Heartbeat (online user tracking) ────────────────────────────────────────

  /**
   * POST /auth/heartbeat — update lastSeenAt for the authenticated user.
   * Throttled to 2 req/min — called every 60s from the dashboard.
   */
  @Post('heartbeat')
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  heartbeat(@CurrentUser() user: AuthUser) {
    return this.authService.heartbeat(user.keycloakId);
  }

  // ── Login Event Tracking ────────────────────────────────────────────────────

  /**
   * POST /auth/login-events — record a login/logout/failed event.
   * Called from the dashboard server action (has full request context: IP, UA).
   * userId, userName, userRole are resolved server-side from the JWT.
   */
  @Post('login-events')
  recordLoginEvent(
    @CurrentUser() user: AuthUser,
    @Body(ZodPipe(RecordLoginEventSchema)) dto: RecordLoginEventDto,
  ) {
    return this.authService.recordLoginEvent(user.keycloakId, dto);
  }
}
