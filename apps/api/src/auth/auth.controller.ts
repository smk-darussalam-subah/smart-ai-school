// =============================================================================
// AuthController — GET/PATCH /auth/me
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
}
