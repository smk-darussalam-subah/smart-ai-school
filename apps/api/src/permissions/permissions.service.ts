import { Injectable } from '@nestjs/common';
import {
  PermissionOverrideSource,
  PermissionOverrideStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@smk/auth';
import { logger } from '@smk/logger';

interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
}

@Injectable()
export class PermissionsService {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async getEffectivePermissions(keycloakId: string, roles: UserRole[]): Promise<Set<string>> {
    const cached = this.cache.get(keycloakId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.permissions;
    }

    const permissions = await this.resolvePermissions(keycloakId, roles);
    this.cache.set(keycloakId, {
      permissions,
      expiresAt: Date.now() + this.TTL_MS,
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

  async hasPermission(keycloakId: string, roles: UserRole[], requiredPermission: string): Promise<boolean> {
    if (roles.includes('SUPER_ADMIN')) return true;

    const permissions = await this.getEffectivePermissions(keycloakId, roles);
    return permissions.has(requiredPermission);
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
    const activeYear = await this.prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    const activeYearId = activeYear?.id ?? null;

    const overrides = await this.prisma.userPermissionOverride.findMany({
      where: {
        userId,
        status: PermissionOverrideStatus.ACTIVE,
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
   * Only ACTIVE rows are read; ambiguous historical grants are quarantined by
   * migration and therefore fail-closed.
   */
  private async resolvePermissions(keycloakId: string, roles: UserRole[]): Promise<Set<string>> {
    const permSet = new Set<string>();

    const authUserId = await this.findAuthUserId(keycloakId);

    // TF2-P1-1: Ambil active academic year untuk filter override.
    const activeYear = await this.prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    const activeYearId = activeYear?.id ?? null;

    const [rolePermissions, userOverrides] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { role: { in: roles } },
        select: { permission: { select: { code: true } } },
      }),
      authUserId
        ? this.prisma.userPermissionOverride.findMany({
            where: {
              userId: authUserId,
              status: PermissionOverrideStatus.ACTIVE,
              OR: activeYearId
                ? [{ academicYearId: activeYearId }, { academicYearId: null }]
                : [{ academicYearId: null }],
            },
            select: { grant: true, permission: { select: { code: true } } },
          })
        : Promise.resolve([] as { grant: boolean; permission: { code: string } }[]),
    ]);

    for (const rp of rolePermissions) {
      permSet.add(rp.permission.code);
    }

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
}
