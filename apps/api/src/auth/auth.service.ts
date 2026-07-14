// =============================================================================
// AuthService — /auth/me, consent, heartbeat, login-events
// =============================================================================

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UserRole } from '@smk/auth';
import { logger } from '@smk/logger';
import { UpdateMeDto } from './dto/update-me.dto';
import { RecordLoginEventDto } from './dto/login-event.dto';

// Select fields yang dikembalikan ke client — tidak ekspos data sensitif
const ME_SELECT = {
  id: true,
  keycloakId: true,
  email: true,
  fullName: true,
  role: true,
  phone: true,
  isActive: true,
  consentAt: true,
  consentVersion: true,
} as const;

export type MeResponse = {
  id: string;
  keycloakId: string;
  email: string;
  fullName: string;
  role: string;
  phone: string | null;
  isActive: boolean;
  consentAt: Date | null;
  consentVersion: string | null;
  permissions: string[];
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private permissionsService: PermissionsService,
  ) {}

  /**
   * Ambil profil user berdasarkan keycloakId (dari JWT).
   * Menggunakan data DB — bukan JWT — agar role selalu sinkron dengan DB.
   * Termasuk effective permissions dari role + override.
   */
  async getMe(keycloakId: string, roles: UserRole[]): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { keycloakId },
      select: ME_SELECT,
    });

    // Izin diturunkan dari ROLE di token — TIDAK bergantung pada ada/tidaknya
    // baris DB. SUPER_ADMIN → wildcard '*' (kontrak dgn web lib/permissions.can()):
    // getEffectivePermissions membaca DB; bila seed tertinggal daftar SA bisa
    // bolong dan menu SA ikut hilang. Wildcard menghilangkan ketergantungan itu.
    const permissions = roles.includes('SUPER_ADMIN')
      ? ['*']
      : Array.from(await this.permissionsService.getEffectivePermissions(keycloakId, roles)).sort();

    if (!user) {
      // Token sah tapi belum ada profil DB (mis. akun dibuat langsung di Keycloak,
      // belum diprovisi — insiden inspector 2026-06-13). JANGAN 404: itu membuat
      // /auth/me gagal → web menerima null → sidebar runtuh ke menu kosong.
      // Kembalikan profil minimal + izin dari role agar UI tetap benar.
      return {
        id: '',
        keycloakId,
        email: '',
        fullName: '',
        role: (roles[0] ?? '') as string,
        phone: null,
        isActive: true,
        consentAt: null,
        consentVersion: null,
        permissions,
      };
    }

    return { ...user, permissions };
  }

  /**
   * Update phone/avatarUrl user.
   * Hanya field yang di-passing UpdateMeDto — tidak ada field lain yang bisa diubah.
   */
  async updateMe(keycloakId: string, dto: UpdateMeDto): Promise<Omit<MeResponse, 'permissions'>> {
    const existing = await this.prisma.user.findUnique({
      where: { keycloakId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('User tidak ditemukan di database');
    }

    return this.prisma.user.update({
      where: { keycloakId },
      data: dto,
      select: ME_SELECT,
    });
  }

  // ── PDP Consent (R-05) ──────────────────────────────────────────────────────

  /**
   * Record user's acceptance of the LoA (Letter of Agreement).
   * Called when user clicks "Saya Menyetujui" on the consent page.
   * Stores both timestamp and version for re-consent tracking.
   */
  async recordConsent(keycloakId: string, version: string) {
    const user = await this.prisma.user.findUnique({
      where: { keycloakId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan di database');

    return this.prisma.user.update({
      where: { keycloakId },
      data: { consentAt: new Date(), consentVersion: version },
      select: { id: true, consentAt: true, consentVersion: true },
    });
  }

  // ── Heartbeat (online user tracking) ────────────────────────────────────────

  /**
   * Update lastSeenAt for the authenticated user.
   * Called every 60s from the dashboard HeartbeatProvider.
   * Single-column UPDATE — negligible load even at 350 concurrent users.
   */
  async heartbeat(keycloakId: string) {
    await this.prisma.user.update({
      where: { keycloakId },
      data: { lastSeenAt: new Date() },
      select: { id: true },
    });
    return { ok: true };
  }

  // ── Login Event Tracking ────────────────────────────────────────────────────

  /**
   * Record a login/logout/failed event.
   * userId, userName, userRole are resolved server-side from the authenticated
   * user's DB record — the client only sends eventType, ipAddress, userAgent.
   */
  async recordLoginEvent(keycloakId: string, dto: RecordLoginEventDto) {
    // Resolve user info from DB (fail-soft: if user not found, skip recording)
    const user = await this.prisma.user.findUnique({
      where: { keycloakId },
      select: { id: true, fullName: true, role: true },
    });

    if (!user) {
      logger.warn('[Auth] recordLoginEvent: user not found in DB', { keycloakId });
      return { ok: false, reason: 'user_not_found' };
    }

    await this.prisma.loginEvent.create({
      data: {
        userId: user.id,
        userRole: user.role,
        userName: user.fullName,
        eventType: dto.eventType,
        ipAddress: dto.ipAddress ?? null,
        userAgent: dto.userAgent ?? null,
      },
    });

    return { ok: true };
  }
}
