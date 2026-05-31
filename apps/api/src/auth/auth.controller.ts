// =============================================================================
// AuthController — GET/PATCH /auth/me
// Rate limit ketat: 15 req/menit (override global 100) — auth endpoints sensitif
// =============================================================================

import { Controller, Get, Patch, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '@smk/auth';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ZodPipe } from '../common/pipes/zod-validation.pipe';
import { UpdateMeSchema, UpdateMeDto } from './dto/update-me.dto';

@Throttle({ default: { ttl: 60_000, limit: 15 } })
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Profil user yang sedang login.
   * Semua role authenticated boleh akses — tidak ada @Roles() restriction.
   * Data dari DB (bukan JWT) agar role selalu sinkron.
   */
  @Get('me')
  getMe(@CurrentUser() user: AuthUser) {
    return this.authService.getMe(user.keycloakId);
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
}
