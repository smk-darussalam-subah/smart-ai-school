import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatusService } from '../auth/user-status.service';
import { PermissionsService } from '../permissions/permissions.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { UserRole, PRIMARY_ROLES } from '@smk/auth';
import { logger } from '@smk/logger';
import {
  ListUsersQuery,
  GroupedUsersQuery,
  ListConsentQuery,
  OnlineUsersQuery,
  ListLoginEventsQuery,
} from './dto/list-users.dto';

const USER_SELECT = {
  id: true,
  keycloakId: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userStatus: UserStatusService,
    private readonly kc: KeycloakAdminService,
    private readonly permissions: PermissionsService,
  ) {}

  async findAll(query: ListUsersQuery) {
    const { role, search, isActive, page, limit, cursor } = query;

    const where: Record<string, unknown> = { deletedAt: null };
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    // Cursor-based pagination
    if (cursor) {
      where.id = { lt: cursor };
      const data = await this.prisma.user.findMany({
        where,
        take: limit,
        select: USER_SELECT,
        orderBy: { id: 'desc' },
      });
      const nextCursor = data.length === limit ? data[data.length - 1]!.id : null;
      return { data, total: -1, page: -1, limit, nextCursor };
    }

    // Offset-based pagination (backward compatible)
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: USER_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit, nextCursor: null as string | null };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_SELECT,
        student: { select: { id: true, nis: true } },
        teacher: { select: { id: true } },
        staff: { select: { niy: true, employmentStatus: true } },
      },
    });

    if (!user) throw new NotFoundException('User tidak ditemukan');
    return user;
  }

  // ── findGrouped ──────────────────────────────────────────────────────────────

  private readonly ROLE_ORDER: readonly UserRole[] = PRIMARY_ROLES;

  private readonly ROLE_LABELS: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    KEPALA_SEKOLAH: 'Kepala Sekolah',
    TATA_USAHA: 'Tata Usaha',
    GURU: 'Guru',
    SISWA: 'Siswa',
    ORANG_TUA: 'Orang Tua',
    INDUSTRI: 'Industri',
  };

  async findGrouped(query: GroupedUsersQuery) {
    const { search, limit } = query;

    const baseWhere: Record<string, unknown> = { deletedAt: null };
    if (search) {
      baseWhere.OR = [
        { fullName: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    const groups = await Promise.all(
      this.ROLE_ORDER.map(async (role) => {
        const where = { ...baseWhere, role };
        const [users, count] = await Promise.all([
          this.prisma.user.findMany({
            where,
            take: limit,
            select: USER_SELECT,
            orderBy: { fullName: 'asc' },
          }),
          this.prisma.user.count({ where }),
        ]);

        return {
          role,
          label: this.ROLE_LABELS[role],
          count,
          users,
        };
      }),
    );

    return { groups };
  }

  // ── getEffectivePermissions ──────────────────────────────────────────────────

  async getEffectivePermissions(id: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { keycloakId: true, role: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    const permSet = await this.permissions.getEffectivePermissions(
      user.keycloakId,
      [user.role as UserRole],
    );
    return Array.from(permSet).sort();
  }

  /**
   * TF-4 P1 fix: updateRole() sekarang DB-first + KC sync best-effort (fail-soft).
   *
   * Strategi lama: KC-first → bila KC throw, seluruh operasi gagal & DB tidak ter-update.
   * Strategi baru: DB update dulu (single source of truth) → cache invalidate →
   * KC sync best-effort. Bila KC gagal, operasi tetap sukses dengan flag
   * `keycloakSyncPending: true` di response agar frontend bisa tampilkan toast warning.
   *
   * Fail-soft pattern mengikuti positions.service.ts:228-237, 293-303 (reference terbukti).
   * Lihat academic-lifecycle.md §14.1 untuk prinsip fail-soft DIIS.
   */
  async updateRole(id: string, role: UserRole, actor: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, keycloakId: true, fullName: true, role: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    const oldRole = user.role as UserRole;

    if (oldRole === role) {
      const existing = await this.prisma.user.findUnique({
        where: { id },
        select: USER_SELECT,
      });
      return existing!;
    }

    // C3-(a): last-SA protection (DB-side, jalan pertama, tidak boleh di-skip)
    if (
      oldRole === 'SUPER_ADMIN' &&
      role !== 'SUPER_ADMIN'
    ) {
      const saCount = await this.prisma.user.count({
        where: {
          role: 'SUPER_ADMIN',
          isActive: true,
          deletedAt: null,
          id: { not: id },
        },
      });
      if (saCount === 0) {
        throw new ConflictException(
          'Tidak dapat mengubah role Super Admin terakhir — sistem akan terkunci',
        );
      }
    }

    // C3-(b): multi-role detection via KC.
    // TF-4: fail-soft — bila KC down untuk getUserRealmRoles, skip check dengan warning
    // (pola positions.service.ts:337-344). Sebelumnya: throw ke caller, membatalkan operasi.
    let primaryRoleCount = 0;
    try {
      const kcRoles = await this.kc.getUserRealmRoles(user.keycloakId);
      const primaryRoleSet = PRIMARY_ROLES as readonly string[];
      primaryRoleCount = kcRoles.filter((r) => primaryRoleSet.includes(r)).length;
    } catch (kcErr) {
      logger.warn('[UsersService] KC getUserRealmRoles gagal — multi-role check dilewati (fail-soft)', {
        userId: id,
        error: kcErr instanceof Error ? kcErr.message : String(kcErr),
      });
      // primaryRoleCount tetap 0 — check dilewati, operasi lanjut.
    }
    if (primaryRoleCount > 1) {
      throw new ConflictException(
        'Akun memiliki multiple role di Keycloak — kelola role melalui Keycloak Admin Console',
      );
    }

    // TF-4: DB-first update (single source of truth untuk status user).
    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: USER_SELECT,
    });

    // Cache invalidation WAJIB setelah DB commit, sebelum KC sync.
    // Memastikan permintaan berikutnya ditolak/izinkan berdasarkan status DB baru.
    this.permissions.invalidateUser(user.keycloakId);
    this.userStatus.invalidate(user.keycloakId);

    logger.info(`User role updated: ${user.fullName} ${oldRole} → ${role}`, {
      actor,
      userId: id,
      oldRole,
      newRole: role,
    });

    // TF-4: KC sync best-effort (fail-soft). Bila gagal, return flag ke frontend.
    let keycloakSyncPending = false;
    try {
      await this.kc.assignRealmRole(user.keycloakId, role);
      await this.kc.removeRealmRole(user.keycloakId, oldRole);
    } catch (kcErr) {
      logger.warn('[UsersService] KC role sync gagal (fail-soft — DB sudah benar)', {
        userId: id,
        oldRole,
        newRole: role,
        error: kcErr instanceof Error ? kcErr.message : String(kcErr),
      });
      keycloakSyncPending = true;
    }

    return { ...updated, keycloakSyncPending };
  }

  /**
   * TF-4 P1 fix: updateActive() sekarang DB-first + KC sync best-effort (fail-soft).
   *
   * Strategi lama: KC-first → bila KC throw, seluruh operasi gagal & DB tidak ter-update.
   * Akibatnya: user tetap aktif di DB saat KC down, bisa login dengan token lama.
   *
   * Strategi baru: DB update dulu (single source of truth untuk status user) →
   * cache invalidate → KC sync best-effort. Bila KC gagal, operasi tetap sukses dengan
   * flag `keycloakSyncPending: true` di response.
   *
   * Fail-soft pattern mengikuti positions.service.ts:228-237 (reference terbukti).
   * Lihat academic-lifecycle.md §14.1 untuk prinsip fail-soft DIIS.
   */
  async updateActive(id: string, isActive: boolean, actor: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, keycloakId: true, fullName: true, role: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    // C3-(a): last-SA protection (DB-side, jalan pertama, tidak boleh di-skip)
    if (
      user.role === 'SUPER_ADMIN' &&
      !isActive
    ) {
      const saCount = await this.prisma.user.count({
        where: {
          role: 'SUPER_ADMIN',
          isActive: true,
          deletedAt: null,
          id: { not: id },
        },
      });
      if (saCount === 0) {
        throw new ConflictException(
          'Tidak dapat menonaktifkan Super Admin terakhir — sistem akan terkunci',
        );
      }
    }

    // TF-4: DB-first update (single source of truth untuk status user).
    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: USER_SELECT,
    });

    // Cache invalidation WAJIB setelah DB commit, sebelum KC sync.
    // Memastikan KeycloakGuard & permission checks berikutnya membaca status DB baru.
    this.userStatus.invalidate(updated.keycloakId);

    logger.info(`User ${isActive ? 'activated' : 'deactivated'}: ${user.fullName}`, {
      actor,
      userId: id,
    });

    // TF-4: KC sync best-effort (fail-soft). Bila gagal, return flag ke frontend.
    let keycloakSyncPending = false;
    try {
      await this.kc.setEnabled(user.keycloakId, isActive);
    } catch (kcErr) {
      logger.warn('[UsersService] KC enabled sync gagal (fail-soft — DB sudah benar)', {
        userId: id,
        isActive,
        error: kcErr instanceof Error ? kcErr.message : String(kcErr),
      });
      keycloakSyncPending = true;
    }

    return { ...updated, keycloakSyncPending };
  }

  // ── Consent Status (admin) ─────────────────────────────────────────────────

  /**
   * List users with their consent status for PDP compliance monitoring.
   * Filters: role, consentStatus (given/pending/all).
   */
  async getConsentStatus(query: ListConsentQuery) {
    const { role, consentStatus, limit, offset } = query;

    const where: Record<string, unknown> = { deletedAt: null };
    if (role) where.role = role;
    if (consentStatus === 'given') where.consentAt = { not: null };
    if (consentStatus === 'pending') where.consentAt = null;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: offset,
        take: limit,
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          consentAt: true,
          consentVersion: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, limit, offset };
  }

  /**
   * Reset a user's consent (set consentAt = NULL) — forces re-consent on next login.
   * Used by admin when LoA policy changes.
   */
  async resetConsent(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    await this.prisma.user.update({
      where: { id: userId },
      data: { consentAt: null, consentVersion: null },
    });

    return { ok: true, userId };
  }

  // ── Online Users (admin) ───────────────────────────────────────────────────

  /**
   * Get users who have sent a heartbeat within the threshold window.
   * Default threshold: 120 seconds (2 minutes).
   */
  async getOnlineUsers(query: OnlineUsersQuery) {
    const { threshold, role } = query;
    const thresholdDate = new Date(Date.now() - threshold * 1000);

    const where: Record<string, unknown> = {
      lastSeenAt: { gte: thresholdDate },
      isActive: true,
      deletedAt: null,
    };
    if (role) where.role = role;

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        role: true,
        email: true,
        lastSeenAt: true,
        avatarUrl: true,
      },
      orderBy: { lastSeenAt: 'desc' },
    });

    return { users, threshold };
  }

  // ── Login Events (admin) ───────────────────────────────────────────────────

  /**
   * List login events with pagination and filters.
   * Denormalized table — no FK join needed.
   */
  async getLoginEvents(query: ListLoginEventsQuery) {
    const { userId, role, eventType, from, to, limit, offset } = query;

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (role) where.userRole = role;
    if (eventType) where.eventType = eventType;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.loginEvent.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.loginEvent.count({ where }),
    ]);

    return { data, total, limit, offset };
  }
}
