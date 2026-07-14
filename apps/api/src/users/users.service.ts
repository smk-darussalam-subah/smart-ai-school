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

    // C3-(a): last-SA protection
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

    // C3-(b): multi-role detection via KC
    // Hanya cek primary roles — position codes (R-23 sync) tidak dihitung
    const kcRoles = await this.kc.getUserRealmRoles(user.keycloakId);
    const primaryRoleSet = PRIMARY_ROLES as readonly string[];
    const primaryRoleCount = kcRoles.filter((r) => primaryRoleSet.includes(r)).length;
    if (primaryRoleCount > 1) {
      throw new ConflictException(
        'Akun memiliki multiple role di Keycloak — kelola role melalui Keycloak Admin Console',
      );
    }

    // KC-first: replace role
    try {
      await this.kc.assignRealmRole(user.keycloakId, role);
      await this.kc.removeRealmRole(user.keycloakId, oldRole);
    } catch (kcErr) {
      logger.error('[UsersService] KC role sync gagal', {
        userId: id,
        error: kcErr instanceof Error ? kcErr.message : String(kcErr),
      });
      throw kcErr;
    }

    // DB update with compensation
    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data: { role },
        select: USER_SELECT,
      });

      this.permissions.invalidateUser(user.keycloakId);
      this.userStatus.invalidate(user.keycloakId);

      logger.info(`User role updated: ${user.fullName} ${oldRole} → ${role}`, {
        actor,
        userId: id,
        oldRole,
        newRole: role,
      });

      return updated;
    } catch (dbErr) {
      // Compensation: restore KC role
      try {
        await this.kc.assignRealmRole(user.keycloakId, oldRole);
        await this.kc.removeRealmRole(user.keycloakId, role);
      } catch (compErr) {
        logger.error('[UsersService] kompensasi KC gagal — role mungkin inkonsisten', {
          userId: id,
          error: compErr instanceof Error ? compErr.message : String(compErr),
        });
      }
      throw dbErr;
    }
  }

  async updateActive(id: string, isActive: boolean, actor: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, keycloakId: true, fullName: true, role: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');

    // C3-(a): last-SA protection
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

    // KC-first
    try {
      await this.kc.setEnabled(user.keycloakId, isActive);
    } catch (kcErr) {
      logger.error('[UsersService] KC enabled sync gagal', {
        userId: id,
        error: kcErr instanceof Error ? kcErr.message : String(kcErr),
      });
      throw kcErr;
    }

    // DB update with compensation
    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data: { isActive },
        select: USER_SELECT,
      });

      this.userStatus.invalidate(updated.keycloakId);

      logger.info(`User ${isActive ? 'activated' : 'deactivated'}: ${user.fullName}`, {
        actor,
        userId: id,
      });

      return updated;
    } catch (dbErr) {
      // Compensation: restore KC enabled state
      try {
        await this.kc.setEnabled(user.keycloakId, !isActive);
      } catch (compErr) {
        logger.error('[UsersService] kompensasi KC enabled gagal', {
          userId: id,
          error: compErr instanceof Error ? compErr.message : String(compErr),
        });
      }
      throw dbErr;
    }
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
