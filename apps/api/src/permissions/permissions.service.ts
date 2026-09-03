import { Injectable } from '@nestjs/common';
import { PermissionOverrideSource, PermissionOverrideStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, isPrimaryRole } from '@smk/auth';
import { logger } from '@smk/logger';
import { getSchoolDate } from '../common/helpers/school-date.helper';

interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
  schoolDateMs: number;
  primaryRole: UserRole;
}

const ACTIVE_APPOINTMENT_STATUS = 'ACTIVE' as const;

@Injectable()
export class PermissionsService {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePermissions(keycloakId: string, _roles: UserRole[]): Promise<Set<string>> {
    const schoolDate = getSchoolDate();
    const primaryRole = await this.getAuthoritativePrimaryRole(keycloakId);
    if (!primaryRole) return new Set();

    const cached = this.cache.get(keycloakId);
    if (
      cached &&
      Date.now() < cached.expiresAt &&
      cached.schoolDateMs === schoolDate.getTime() &&
      cached.primaryRole === primaryRole
    ) {
      return cached.permissions;
    }

    const permissions =
      primaryRole === 'SUPER_ADMIN'
        ? new Set(['*'])
        : await this.resolvePermissions(keycloakId, [primaryRole], schoolDate);
    this.cache.set(keycloakId, {
      permissions,
      expiresAt: Date.now() + this.TTL_MS,
      schoolDateMs: schoolDate.getTime(),
      primaryRole,
    });

    return permissions;
  }

  invalidateUser(keycloakId: string): void {
    this.cache.delete(keycloakId);
  }

  /**
   * Perubahan permission level-role berdampak ke SEMUA user dengan role tsb.
   * Cache tidak menyimpan pemetaan role→user, jadi satu-satunya invalidasi
   * yang benar adalah membersihkan seluruh cache. Volume (≤350 user, TTL 5 menit)
   * membuat full-clear murah; konsistensi > hit-rate untuk otorisasi.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  async hasPermission(
    keycloakId: string,
    roles: UserRole[],
    requiredPermission: string,
  ): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(keycloakId, roles);
    return permissions.has('*') || permissions.has(requiredPermission);
  }

  async getAuthoritativePrimaryRole(keycloakId: string): Promise<UserRole | null> {
    try {
      const user = await this.prisma.user.findFirst({
        where: { keycloakId, isActive: true, deletedAt: null },
        select: { role: true },
      });
      return user && isPrimaryRole(user.role) ? user.role : null;
    } catch (err) {
      logger.error('[PermissionsService] primary role lookup gagal — akses ditolak', {
        errorType: err instanceof Error ? err.name : 'unknown',
      });
      return null;
    }
  }

  async getActivePositionCodes(
    keycloakId: string,
    schoolDate: Date = getSchoolDate(),
  ): Promise<Set<string>> {
    const authUserId = await this.findAuthUserId(keycloakId);
    if (!authUserId) return new Set();
    const activeYearId = await this.resolveSingleActiveAcademicYearId();
    if (!activeYearId) return new Set();

    try {
      const appointments = await this.prisma.appointment.findMany({
        where: {
          status: ACTIVE_APPOINTMENT_STATUS,
          staff: {
            userId: authUserId,
            deletedAt: null,
            user: { isActive: true, deletedAt: null },
          },
          academicYearId: activeYearId,
          position: { isActive: true },
          effectiveFrom: { lte: schoolDate },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: schoolDate } }],
          AND: [
            {
              OR: [
                { position: { scopeType: 'NONE' }, majorId: null },
                { position: { scopeType: 'MAJOR' }, major: { isActive: true } },
              ],
            },
          ],
        },
        select: { position: { select: { code: true } } },
      });

      return new Set(appointments.map((appointment) => appointment.position.code));
    } catch (err) {
      // Fail-soft: jika tabel appointments tidak ada atau query error, kembalikan Set kosong.
      // Guard gagal closed (user tidak dapat position-code access) tapi tidak 500.
      logger.warn('[PermissionsService] getActivePositionCodes gagal (fail-soft)', {
        error: err instanceof Error ? err.message : String(err),
      });
      return new Set();
    }
  }

  async getAllPermissions() {
    return this.prisma.permission.findMany({ orderBy: { module: 'asc' } });
  }

  async getPermissionByCode(code: string) {
    return this.prisma.permission.findUnique({ where: { code } });
  }

  async createPermission(code: string, description: string, module: string) {
    const permission = await this.prisma.permission.create({
      data: { code, description, module },
    });
    return permission;
  }

  async deletePermission(id: string) {
    const result = await this.prisma.permission.delete({ where: { id } });
    this.invalidateAll();
    return result;
  }

  async getRolePermissions(role: UserRole) {
    const rolePerms = await this.prisma.rolePermission.findMany({
      where: { role },
      include: { permission: true },
      orderBy: { permission: { module: 'asc' } },
    });
    return rolePerms.map((rp) => rp.permission);
  }

  async setRolePermissions(role: UserRole, permissionIds: string[]) {
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role } }),
      this.prisma.rolePermission.createMany({
        data: permissionIds.map((permId) => ({
          role,
          permissionId: permId,
        })),
      }),
    ]);

    this.invalidateAll();
    logger.info(`Permissions updated for role ${role}`, { permissionIds });
  }

  async getUserEffectivePermissions(userId: string) {
    const activeYearId = await this.resolveSingleActiveAcademicYearId();

    const overrides = await this.prisma.userPermissionOverride.findMany({
      where: {
        userId,
        status: PermissionOverrideStatus.ACTIVE,
        source: PermissionOverrideSource.MANUAL,
        OR: activeYearId
          ? [{ academicYearId: activeYearId }, { academicYearId: null }]
          : [{ academicYearId: null }],
      },
      include: { permission: true },
    });

    return overrides.map((o) => ({
      permission: o.permission,
      grant: o.grant,
    }));
  }

  async grantUserPermission(userId: string, permissionId: string) {
    const result = await this.writeGlobalOverride(userId, permissionId, true);
    await this.invalidateByAuthUserId(userId);
    return result;
  }

  async revokeUserPermission(userId: string, permissionId: string) {
    const result = await this.writeGlobalOverride(userId, permissionId, false);
    await this.invalidateByAuthUserId(userId);
    return result;
  }

  /**
   * Resolusi permission efektif:
   *   1. Union permission dari semua role user (role_permissions).
   *   2. Override per-user diterapkan DI ATAS role: grant=true menambah,
   *      grant=false MENARIK permission meski diberikan oleh role
   *      (semantik "true = beri, false = tarik" sesuai schema).
   * Semua filter dilakukan di QUERY level (bukan di JS atas seluruh tabel).
   *
   * TF2-P1-1: Filter override by active academic year. Override dengan
   * academicYearId = NULL (global/direct admin grant) tetap berlaku untuk
   * semua tahun. Override dengan academicYearId non-NULL hanya berlaku untuk
   * tahun yang cocok. Ini mencegah "zombie permissions" — izin bekas
   * pejabat tahun lama yang tetap aktif setelah tahun berganti.
   * Wave C architectural remediation: only MANUAL overrides are applied as
   * explicit exceptions. POSITION_ASSIGNMENT rows remain historical/TF2 data
   * but no longer grant appointment-derived authority.
   */
  private async resolvePermissions(
    keycloakId: string,
    roles: UserRole[],
    schoolDate: Date,
  ): Promise<Set<string>> {
    const permSet = new Set<string>();
    const primaryRoles = roles.filter(isPrimaryRole);

    const authUserId = await this.findAuthUserId(keycloakId);

    // TF2-P1-1: Ambil active academic year untuk filter override.
    const activeYearId = await this.resolveSingleActiveAcademicYearId();

    const [rolePermissions, userOverrides, appointmentPermissions] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { role: { in: primaryRoles } },
        select: { permission: { select: { code: true } } },
      }),
      authUserId
        ? this.prisma.userPermissionOverride.findMany({
            where: {
              userId: authUserId,
              status: PermissionOverrideStatus.ACTIVE,
              source: PermissionOverrideSource.MANUAL,
              OR: activeYearId
                ? [{ academicYearId: activeYearId }, { academicYearId: null }]
                : [{ academicYearId: null }],
            },
            select: { grant: true, permission: { select: { code: true } } },
          })
        : Promise.resolve([] as { grant: boolean; permission: { code: string } }[]),
      authUserId && activeYearId
        ? this.resolveActiveAppointmentPermissionCodes(authUserId, activeYearId, schoolDate)
        : Promise.resolve([] as string[]),
    ]);

    for (const rp of rolePermissions) {
      permSet.add(rp.permission.code);
    }

    for (const code of appointmentPermissions) {
      permSet.add(code);
    }

    // TF2-P1-1: Apply grants before revokes for deterministic least-privilege.
    for (const override of userOverrides.filter((item) => item.grant)) {
      permSet.add(override.permission.code);
    }

    for (const override of userOverrides.filter((item) => !item.grant)) {
      permSet.delete(override.permission.code);
    }

    return permSet;
  }

  private async writeGlobalOverride(userId: string, permissionId: string, grant: boolean) {
    const data = {
      grant,
      academicYearId: null,
      staffPositionId: null,
      source: PermissionOverrideSource.MANUAL,
      status: PermissionOverrideStatus.ACTIVE,
      reason: grant ? 'Manual global grant via Users UI' : 'Manual global revoke via Users UI',
    };

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.userPermissionOverride.findFirst({
          where: {
            userId,
            permissionId,
            academicYearId: null,
            status: PermissionOverrideStatus.ACTIVE,
          },
          select: { id: true },
        });

        return existing
          ? tx.userPermissionOverride.update({
              where: { id: existing.id },
              data,
            })
          : tx.userPermissionOverride.create({
              data: { userId, permissionId, ...data },
            });
      });
    } catch (err) {
      if (!this.isUniqueConflict(err)) {
        throw err;
      }

      const existing = await this.prisma.userPermissionOverride.findFirst({
        where: {
          userId,
          permissionId,
          academicYearId: null,
          status: PermissionOverrideStatus.ACTIVE,
        },
        select: { id: true },
      });

      if (!existing) {
        throw err;
      }

      return this.prisma.userPermissionOverride.update({
        where: { id: existing.id },
        data,
      });
    }
  }

  private isUniqueConflict(err: unknown): err is Prisma.PrismaClientKnownRequestError {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }

  /** Cache di-key dengan keycloakId; override memakai auth User.id → perlu reverse lookup. */
  private async invalidateByAuthUserId(userId: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { keycloakId: true },
      });
      if (user?.keycloakId) {
        this.invalidateUser(user.keycloakId);
      } else {
        this.invalidateAll();
      }
    } catch {
      // Fail-safe: bila lookup gagal, bersihkan semua agar tak ada izin basi.
      this.invalidateAll();
    }
  }

  private async findAuthUserId(keycloakId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { keycloakId },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  private async resolveActiveAppointmentPermissionCodes(
    userId: string,
    activeYearId: string,
    schoolDate: Date,
  ): Promise<string[]> {
    try {
      const appointments = await this.prisma.appointment.findMany({
        where: {
          status: ACTIVE_APPOINTMENT_STATUS,
          staff: {
            userId,
            deletedAt: null,
            user: { isActive: true, deletedAt: null },
          },
          academicYearId: activeYearId,
          position: { isActive: true },
          effectiveFrom: { lte: schoolDate },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: schoolDate } }],
          AND: [
            {
              OR: [
                { position: { scopeType: 'NONE' }, majorId: null },
                { position: { scopeType: 'MAJOR' }, major: { isActive: true } },
              ],
            },
          ],
        },
        select: {
          position: {
            select: {
              permissions: { select: { permissionId: true } },
            },
          },
        },
      });

      const permissionIds = Array.from(
        new Set(
          appointments.flatMap((appointment) =>
            appointment.position.permissions.map((permission) => permission.permissionId),
          ),
        ),
      );
      if (permissionIds.length === 0) return [];

      const permissions = await this.prisma.permission.findMany({
        where: { id: { in: permissionIds } },
        select: { code: true },
      });
      return permissions.map((permission) => permission.code);
    } catch (err) {
      // Fail-soft: jika tabel appointments tidak ada atau query error, kembalikan array kosong.
      // Resolver tidak menambahkan appointment permissions, tapi tidak crash.
      logger.warn(
        '[PermissionsService] resolveActiveAppointmentPermissionCodes gagal (fail-soft)',
        {
          error: err instanceof Error ? err.message : String(err),
        },
      );
      return [];
    }
  }

  /** Appointment authority is undefined unless exactly one academic year is active. */
  private async resolveSingleActiveAcademicYearId(): Promise<string | null> {
    try {
      const activeYears = await this.prisma.academicYear.findMany({
        where: { isActive: true },
        select: { id: true },
        take: 2,
      });
      if (activeYears.length !== 1) {
        if (activeYears.length > 1) {
          logger.warn(
            '[PermissionsService] multiple active academic years; scoped authority denied',
          );
        }
        return null;
      }
      return activeYears[0]?.id ?? null;
    } catch (err) {
      logger.warn('[PermissionsService] active academic year resolution failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}
