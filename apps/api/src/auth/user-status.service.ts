// =============================================================================
// UserStatusService — penegakan isActive/deletedAt di jalur auth (2J-0, A4b).
//
// Latar: tombol "Nonaktifkan" dashboard hanya mengubah kolom DB; Keycloak tetap
// menerbitkan token dan TIDAK ADA pengecekan isActive di guard mana pun →
// user nonaktif tetap bisa login. Service ini = sabuk pengaman sisi-API.
// (Saklar utama di Keycloak menyusul saat KeycloakAdminService hadir — 2J-1/2.)
//
// Semantik (sengaja):
//   • Row ada + (isActive=false ATAU deletedAt terisi) → TOLAK (fail-closed).
//   • Row TIDAK ada → IZINKAN + log warn — status quo dipertahankan karena
//     belum ada first-login sync; menolak akan mengunci user KC yang sah
//     namun belum punya baris auth.users (kondisi nyata saat ini).
//   • Error DB → IZINKAN + log error — guard ini lapisan tambahan; kegagalan
//     infrastruktur tidak boleh mematikan seluruh API (KeycloakGuard tetap
//     memvalidasi token).
// Cache TTL 5 menit (pola PermissionsService); updateActive() meng-invalidasi.
// =============================================================================

import { Injectable } from '@nestjs/common';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';

interface CacheEntry {
  blocked: boolean;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;

@Injectable()
export class UserStatusService {
  private cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /** true = user DIBLOKIR (nonaktif/soft-deleted). */
  async isBlocked(keycloakId: string): Promise<boolean> {
    const cached = this.cache.get(keycloakId);
    if (cached && Date.now() < cached.expiresAt) return cached.blocked;

    let blocked = false;
    try {
      const user = await this.prisma.user.findUnique({
        where: { keycloakId },
        select: { isActive: true, deletedAt: true },
      });
      if (!user) {
        // Status quo: token KC sah tanpa baris DB → izinkan, tapi tercatat.
        logger.warn('[UserStatus] token sah tanpa baris auth.users', { keycloakId });
        blocked = false;
      } else {
        blocked = !user.isActive || user.deletedAt !== null;
      }
    } catch (err) {
      logger.error('[UserStatus] lookup gagal — melewatkan pengecekan (lapisan tambahan)', {
        error: err instanceof Error ? err.message : String(err),
      });
      blocked = false;
    }

    this.cache.set(keycloakId, { blocked, expiresAt: Date.now() + TTL_MS });
    return blocked;
  }

  /** Panggil saat updateActive/updateRole agar efek instan (tanpa tunggu TTL). */
  invalidate(keycloakId: string): void {
    this.cache.delete(keycloakId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
