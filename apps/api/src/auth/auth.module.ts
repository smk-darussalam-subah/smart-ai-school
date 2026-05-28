// =============================================================================
// AuthModule — Authentication & Authorization
// =============================================================================
//
// ⚠️  KEPUTUSAN ARSITEKTUR (SMA-16, W3-03 Item 8):
// Semua auth endpoint (login, token-exchange, password-reset, dll.) yang dibuat
// di Tahap 1 WAJIB menggunakan rate limit yang lebih ketat dari default:
//
//   @Throttle({ default: { ttl: 60_000, limit: 15 } })
//   @Controller('auth')
//   export class AuthController { ... }
//
// Alasan: Mencegah credential stuffing attack.
// Default global throttle (100 req/menit) terlalu longgar untuk auth endpoints.
// Auth endpoints dibatasi maks 15 req/menit per IP.
//
// Lihat juga: CLAUDE.md Section 10 — "Auth Rate Limit"
// =============================================================================

import { Module } from '@nestjs/common';
import { KeycloakGuard } from './guards/keycloak.guard';

@Module({
  providers: [KeycloakGuard],
  exports: [KeycloakGuard],
})
export class AuthModule {}
