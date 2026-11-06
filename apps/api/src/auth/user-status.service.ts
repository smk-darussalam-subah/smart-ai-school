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
//   • Row hilang, nonaktif atau diarsipkan → TOLAK sebagai sesi tidak berlaku.
//   • Lookup DB gagal → TOLAK sementara (503), tanpa menyimpulkan sesi berakhir.
// Route bootstrap/provisioning publik tetap dipisahkan melalui @Public() dan
// tidak melewati service ini.
// Cache TTL 5 menit (pola PermissionsService); updateActive() meng-invalidasi.
// =============================================================================

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { UserRole, isPrimaryRole } from '@smk/auth';
import { logger } from '@smk/logger';
import { PrismaService } from '../prisma/prisma.service';
import { logoutAuditId } from './session-binding';

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
  async getAuthorizationState(
    keycloakId: string,
    sessionBinding?: string,
  ): Promise<UserAuthorizationState> {
    // Revocation is durable and deliberately not cached. A late response may
    // restore a browser cookie, but can never restore its server authority.
    if (sessionBinding) {
      try {
        const revoked = await this.prisma.auditLog.findUnique({
          where: { id: logoutAuditId(sessionBinding) },
          select: { id: true },
        });
        if (revoked) return { blocked: true, primaryRole: null };
      } catch (error) {
        throw this.authorityUnavailable(error);
      }
    }
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
      throw this.authorityUnavailable(err);
    }
  }

  private authorityUnavailable(error: unknown): ServiceUnavailableException {
    logger.error('[UserStatus] authority unavailable — request denied temporarily', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return new ServiceUnavailableException({
      message: 'Layanan akun sementara tidak tersedia. Coba lagi sebentar.',
      code: 'AUTHORITY_UNAVAILABLE',
    });
  }

  /** Panggil saat updateActive/updateRole agar efek instan (tanpa tunggu TTL). */
  invalidate(keycloakId: string): void {
    this.cache.delete(keycloakId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
