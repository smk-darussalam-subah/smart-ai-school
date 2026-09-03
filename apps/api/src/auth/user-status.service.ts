// =============================================================================
// UserStatusService — penegakan isActive/deletedAt di jalur auth (2J-0, A4b).
//
// Latar: tombol "Nonaktifkan" dashboard hanya mengubah kolom DB; Keycloak tetap
// menerbitkan token dan TIDAK ADA pengecekan isActive di guard mana pun →
// user nonaktif tetap bisa login. Service ini = sabuk pengaman sisi-API.
// (Saklar utama di Keycloak menyusul saat KeycloakAdminService hadir — 2J-1/2.)
//
// Semantik fail-closed untuk seluruh route aplikasi terlindungi:
//   • Row ada + aktif + tidak diarsipkan → IZINKAN.
//   • Row hilang, nonaktif, diarsipkan, atau lookup DB gagal → TOLAK.
// Route bootstrap/provisioning publik tetap dipisahkan melalui @Public() dan
// tidak melewati service ini.
// Cache TTL 5 menit (pola PermissionsService); updateActive() meng-invalidasi.
// =============================================================================

import { Injectable } from '@nestjs/common';
import { UserRole, isPrimaryRole } from '@smk/auth';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';

interface CacheEntry {
  blocked: boolean;
  primaryRole: UserRole | null;
  expiresAt: number;
}

export interface UserAuthorizationState {
  blocked: boolean;
  primaryRole: UserRole | null;
}

const TTL_MS = 5 * 60 * 1000;

@Injectable()
export class UserStatusService {
  private cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /** true = user DIBLOKIR (nonaktif/soft-deleted). */
  async isBlocked(keycloakId: string): Promise<boolean> {
    return (await this.getAuthorizationState(keycloakId)).blocked;
  }

  /**
   * Status akun dan primary role dibaca sebagai satu snapshot. Token Keycloak
   * boleh tertinggal saat sinkronisasi gagal, tetapi authority request tidak.
   */
  async getAuthorizationState(keycloakId: string): Promise<UserAuthorizationState> {
    const cached = this.cache.get(keycloakId);
    if (cached && Date.now() < cached.expiresAt) {
      return { blocked: cached.blocked, primaryRole: cached.primaryRole };
    }

    try {
      const user = await this.prisma.user.findUnique({
        where: { keycloakId },
        select: { isActive: true, deletedAt: true, role: true },
      });
      if (!user) {
        logger.warn('[UserStatus] token sah tanpa baris auth.users — akses ditolak');
        return { blocked: true, primaryRole: null };
      }
      const primaryRole = isPrimaryRole(user.role) ? user.role : null;
      const blocked = !user.isActive || user.deletedAt !== null || primaryRole === null;
      this.cache.set(keycloakId, {
        blocked,
        primaryRole: blocked ? null : primaryRole,
        expiresAt: Date.now() + TTL_MS,
      });
      return { blocked, primaryRole: blocked ? null : primaryRole };
    } catch (err) {
      logger.error('[UserStatus] lookup gagal — akses ditolak fail-closed', {
        errorType: err instanceof Error ? err.name : 'unknown',
      });
      return { blocked: true, primaryRole: null };
    }
  }

  /** Panggil saat updateActive/updateRole agar efek instan (tanpa tunggu TTL). */
  invalidate(keycloakId: string): void {
    this.cache.delete(keycloakId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
