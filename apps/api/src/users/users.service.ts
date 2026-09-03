import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserStatusService } from '../auth/user-status.service';
import { PermissionsService } from '../permissions/permissions.service';
import { KeycloakAdminService } from '../keycloak-admin/keycloak-admin.service';
import { UserRole, PRIMARY_ROLES, isPrimaryRole, type PrimaryRole } from '@smk/auth';
import { logger } from '@smk/logger';
import { Prisma } from '@prisma/client';
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
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const USER_IDENTITY_MUTATION_LOCK = 'users:last-active-super-admin';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userStatus: UserStatusService,
    private readonly kc: KeycloakAdminService,
    private readonly permissions: PermissionsService,
  ) {}

  private isMissingAtomicWrite(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2025'
    );
  }

  private async acquireIdentityMutationLock(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${USER_IDENTITY_MUTATION_LOCK}))`,
    );
  }

  async findAll(query: ListUsersQuery, actorKeycloakId?: string) {
    const { role, search, isActive, page, limit, cursor } = query;
    const status = query.status ?? (isActive === false ? 'inactive' : 'active');

    if (status === 'archived') {
      await this.assertActiveSuperAdmin(actorKeycloakId);
    }

    const where: Record<string, unknown> =
      status === 'archived'
        ? { deletedAt: { not: null } }
        : { deletedAt: null, isActive: status === 'active' };
    if (role) where.role = role;
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

  async findById(id: string, actorKeycloakId?: string) {
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
    if (user.deletedAt) {
      await this.assertActiveSuperAdmin(actorKeycloakId);
    }
    return user;
  }

  private async assertActiveSuperAdmin(actorKeycloakId?: string) {
    if (!actorKeycloakId) {
      throw new ForbiddenException('Hanya Super Admin yang dapat mengelola arsip pengguna');
    }
    const actor = await this.prisma.user.findFirst({
      where: { keycloakId: actorKeycloakId, role: 'SUPER_ADMIN', isActive: true, deletedAt: null },
      select: { id: true, role: true },
    });
    if (!actor || actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Hanya Super Admin aktif yang dapat mengelola arsip pengguna');
    }
    return actor;
  }

  // ── findGrouped ──────────────────────────────────────────────────────────────

  private readonly ROLE_ORDER: readonly PrimaryRole[] = PRIMARY_ROLES;

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
      select: { keycloakId: true, role: true, deletedAt: true },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    if (user.deletedAt) {
      throw new ConflictException('Izin akun arsip tidak tersedia. Pulihkan akun terlebih dahulu.');
    }

    const permSet = await this.permissions.getEffectivePermissions(user.keycloakId, [
      user.role as UserRole,
    ]);
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
    const actorUser = await this.prisma.user.findFirst({
      where: { keycloakId: actor, isActive: true, deletedAt: null },
      select: { id: true, role: true },
    });
    if (!actorUser || actorUser.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Hanya Super Admin yang dapat mengubah role identitas');
    }
    if (actorUser.id === id) {
      throw new ForbiddenException('Super Admin tidak dapat mengubah role akunnya sendiri');
    }
    if (!isPrimaryRole(role)) {
      throw new BadRequestException(
        `Role ${role} adalah jabatan period-bound. Kelola melalui appointment/Struktur Organisasi, bukan role identitas Keycloak.`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        keycloakId: true,
        fullName: true,
        role: true,
        deletedAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    if (user.deletedAt) {
      throw new ConflictException('Pengguna diarsipkan. Pulihkan akun sebelum mengubah role.');
    }

    const expectedUpdatedAt = user.updatedAt;

    // C3-(b): multi-role detection via KC.
    // TF-4: fail-soft — bila KC down untuk getUserRealmRoles, skip check dengan warning
    // (pola positions.service.ts:337-344). Sebelumnya: throw ke caller, membatalkan operasi.
    if (user.role !== role) {
      let primaryRoleCount = 0;
      try {
        const kcRoles = await this.kc.getUserRealmRoles(user.keycloakId);
        const primaryRoleSet = PRIMARY_ROLES as readonly string[];
        primaryRoleCount = kcRoles.filter((r) => primaryRoleSet.includes(r)).length;
      } catch (kcErr) {
        logger.warn(
          '[UsersService] KC getUserRealmRoles gagal — multi-role check dilewati (fail-soft)',
          {
            userId: id,
            error: kcErr instanceof Error ? kcErr.message : String(kcErr),
          },
        );
        // primaryRoleCount tetap 0 — check dilewati, operasi lanjut.
      }
      if (primaryRoleCount > 1) {
        throw new ConflictException(
          'Akun memiliki multiple role di Keycloak — kelola role melalui Keycloak Admin Console',
        );
      }
    }

    const transition = await this.prisma.$transaction(async (tx) => {
      await this.acquireIdentityMutationLock(tx);

      const [lockedActor, lockedUser] = await Promise.all([
        tx.user.findFirst({
          where: { keycloakId: actor, isActive: true, deletedAt: null },
          select: { id: true, role: true },
        }),
        tx.user.findUnique({
          where: { id },
          select: {
            id: true,
            keycloakId: true,
            fullName: true,
            role: true,
            deletedAt: true,
            updatedAt: true,
          },
        }),
      ]);

      if (!lockedActor || lockedActor.role !== 'SUPER_ADMIN') {
        throw new ForbiddenException('Hanya Super Admin yang dapat mengubah role identitas');
      }
      if (lockedActor.id === id) {
        throw new ForbiddenException('Super Admin tidak dapat mengubah role akunnya sendiri');
      }
      if (!lockedUser) throw new NotFoundException('User tidak ditemukan');
      if (lockedUser.deletedAt) {
        throw new ConflictException('Pengguna diarsipkan. Pulihkan akun sebelum mengubah role.');
      }
      if (lockedUser.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ConflictException(
          'Data pengguna berubah atau telah diarsipkan. Muat ulang daftar.',
        );
      }

      const oldRole = lockedUser.role as UserRole;
      if (oldRole === role) {
        const existing = await tx.user.findUnique({ where: { id }, select: USER_SELECT });
        return { updated: existing!, oldRole, changed: false };
      }

      if (oldRole === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') {
        const remainingSuperAdmins = await tx.user.count({
          where: {
            role: 'SUPER_ADMIN',
            isActive: true,
            deletedAt: null,
            id: { not: id },
          },
        });
        if (remainingSuperAdmins === 0) {
          throw new ConflictException(
            'Tidak dapat mengubah role Super Admin terakhir — sistem akan terkunci',
          );
        }
      }

      const updated = await tx.user
        .update({
          where: { id, deletedAt: null, updatedAt: expectedUpdatedAt },
          data: { role },
          select: USER_SELECT,
        })
        .catch((error: unknown) => {
          if (this.isMissingAtomicWrite(error)) {
            throw new ConflictException(
              'Data pengguna berubah atau telah diarsipkan. Muat ulang daftar.',
            );
          }
          throw error;
        });

      return { updated, oldRole, changed: true };
    });

    const { updated, oldRole, changed } = transition;
    if (!changed) return updated;

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
      if (isPrimaryRole(oldRole)) {
        await this.kc.removeRealmRole(user.keycloakId, oldRole);
      }
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
    const actorUser = await this.prisma.user.findFirst({
      where: { keycloakId: actor, isActive: true, deletedAt: null },
      select: { id: true, role: true },
    });
    if (!actorUser || !['SUPER_ADMIN', 'TATA_USAHA'].includes(actorUser.role)) {
      throw new ForbiddenException('Aktor tidak berwenang mengubah status akun');
    }
    if (actorUser.id === id && !isActive) {
      throw new ForbiddenException('Pengguna tidak dapat menonaktifkan akunnya sendiri');
    }
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        keycloakId: true,
        fullName: true,
        role: true,
        deletedAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User tidak ditemukan');
    if (user.deletedAt) {
      throw new ConflictException('Pengguna diarsipkan. Gunakan tindakan Pulihkan.');
    }
    const expectedUpdatedAt = user.updatedAt;
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.acquireIdentityMutationLock(tx);

      const [lockedActor, lockedUser] = await Promise.all([
        tx.user.findFirst({
          where: { keycloakId: actor, isActive: true, deletedAt: null },
          select: { id: true, role: true },
        }),
        tx.user.findUnique({
          where: { id },
          select: {
            id: true,
            keycloakId: true,
            fullName: true,
            role: true,
            deletedAt: true,
            updatedAt: true,
          },
        }),
      ]);

      if (!lockedActor || !['SUPER_ADMIN', 'TATA_USAHA'].includes(lockedActor.role)) {
        throw new ForbiddenException('Aktor tidak berwenang mengubah status akun');
      }
      if (lockedActor.id === id && !isActive) {
        throw new ForbiddenException('Pengguna tidak dapat menonaktifkan akunnya sendiri');
      }
      if (!lockedUser) throw new NotFoundException('User tidak ditemukan');
      if (lockedUser.deletedAt) {
        throw new ConflictException('Pengguna diarsipkan. Gunakan tindakan Pulihkan.');
      }
      if (lockedUser.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
        throw new ConflictException(
          'Data pengguna berubah atau telah diarsipkan. Muat ulang daftar.',
        );
      }
      if (
        lockedActor.role === 'TATA_USAHA' &&
        ['SUPER_ADMIN', 'TATA_USAHA'].includes(lockedUser.role)
      ) {
        throw new ForbiddenException('Tata Usaha tidak dapat mengubah status akun istimewa');
      }

      if (lockedUser.role === 'SUPER_ADMIN' && !isActive) {
        const remainingSuperAdmins = await tx.user.count({
          where: {
            role: 'SUPER_ADMIN',
            isActive: true,
            deletedAt: null,
            id: { not: id },
          },
        });
        if (remainingSuperAdmins === 0) {
          throw new ConflictException(
            'Tidak dapat menonaktifkan Super Admin terakhir — sistem akan terkunci',
          );
        }
      }

      return tx.user
        .update({
          where: { id, deletedAt: null, updatedAt: expectedUpdatedAt },
          data: { isActive },
          select: USER_SELECT,
        })
        .catch((error: unknown) => {
          if (this.isMissingAtomicWrite(error)) {
            throw new ConflictException(
              'Data pengguna berubah atau telah diarsipkan. Muat ulang daftar.',
            );
          }
          throw error;
        });
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

  async archiveUser(
    id: string,
    input: { reason: string; expectedUpdatedAt: string },
    actorKeycloakId: string,
  ) {
    const actor = await this.assertActiveSuperAdmin(actorKeycloakId);
    if (actor.id === id) {
      throw new ForbiddenException('Super Admin tidak dapat mengarsipkan akunnya sendiri');
    }

    const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        keycloakId: true,
        fullName: true,
        role: true,
        deletedAt: true,
        updatedAt: true,
      },
    });
    if (!target) throw new NotFoundException('User tidak ditemukan');
    if (target.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('Akun Super Admin tidak boleh diarsipkan');
    }
    if (target.deletedAt) {
      throw new ConflictException('Pengguna sudah diarsipkan');
    }
    if (target.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new ConflictException(
        'Data pengguna telah berubah. Segarkan daftar sebelum mengarsipkan.',
      );
    }

    const archivedAt = new Date();
    const claimed = await this.prisma.user.updateMany({
      where: { id, deletedAt: null, updatedAt: expectedUpdatedAt },
      data: { isActive: false, deletedAt: archivedAt, updatedAt: archivedAt },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('Permintaan arsip sudah usang atau sedang diproses');
    }

    this.userStatus.invalidate(target.keycloakId);
    this.permissions.invalidateUser(target.keycloakId);

    const [disableResult, logoutResult] = await Promise.allSettled([
      this.kc.setEnabled(target.keycloakId, false),
      this.kc.logoutUser(target.keycloakId),
    ]);
    const keycloakSyncPending = disableResult.status === 'rejected';
    const sessionTerminationPending = logoutResult.status === 'rejected';
    if (keycloakSyncPending || sessionTerminationPending) {
      logger.warn('[UsersService] arsip tersimpan tetapi sinkronisasi Keycloak tertunda', {
        keycloakSyncPending,
        sessionTerminationPending,
      });
    }

    const archived = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    return {
      ...archived!,
      keycloakSyncPending,
      sessionTerminationPending,
      reasonRecorded: true,
    };
  }

  async restoreUser(
    id: string,
    input: { reason: string; expectedUpdatedAt: string },
    actorKeycloakId: string,
  ) {
    await this.assertActiveSuperAdmin(actorKeycloakId);
    const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        keycloakId: true,
        deletedAt: true,
        updatedAt: true,
      },
    });
    if (!target) throw new NotFoundException('User tidak ditemukan');
    if (!target.deletedAt) {
      throw new ConflictException('Pengguna tidak berada di arsip');
    }
    if (target.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new ConflictException(
        'Data pengguna telah berubah. Segarkan daftar sebelum memulihkan.',
      );
    }

    try {
      await this.kc.setEnabled(target.keycloakId, true);
    } catch {
      throw new ServiceUnavailableException(
        'Keycloak belum dapat mengaktifkan akun. Pengguna tetap diarsipkan dan aman.',
      );
    }

    const restoredAt = new Date();
    const claimed = await this.prisma.user.updateMany({
      where: { id, deletedAt: { not: null }, updatedAt: expectedUpdatedAt },
      data: { isActive: true, deletedAt: null, updatedAt: restoredAt },
    });
    if (claimed.count !== 1) {
      const current = await this.prisma.user.findUnique({
        where: { id },
        select: { deletedAt: true },
      });
      if (current?.deletedAt) {
        try {
          await this.kc.setEnabled(target.keycloakId, false);
        } catch {
          logger.error('[UsersService] kompensasi restore Keycloak gagal');
        }
      }
      throw new ConflictException('Permintaan pemulihan sudah usang atau sedang diproses');
    }

    this.userStatus.invalidate(target.keycloakId);
    this.permissions.invalidateUser(target.keycloakId);
    const restored = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    return { ...restored!, keycloakSyncPending: false, reasonRecorded: true };
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
