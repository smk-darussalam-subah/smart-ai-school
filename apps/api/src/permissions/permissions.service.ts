import { Injectable } from '@nestjs/common';
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
    const overrides = await this.prisma.userPermissionOverride.findMany({
      where: { userId },
      include: { permission: true },
    });

    return overrides.map((o) => ({
      permission: o.permission,
      grant: o.grant,
    }));
  }

  async grantUserPermission(userId: string, permissionId: string) {
    const result = await this.prisma.userPermissionOverride.upsert({
      where: {
        userId_permissionId: { userId, permissionId },
      },
      update: { grant: true },
      create: { userId, permissionId, grant: true },
    });
    await this.invalidateByAuthUserId(userId);
    return result;
  }

  async revokeUserPermission(userId: string, permissionId: string) {
    const result = await this.prisma.userPermissionOverride.upsert({
      where: {
        userId_permissionId: { userId, permissionId },
      },
      update: { grant: false },
      create: { userId, permissionId, grant: false },
    });
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
   */
  private async resolvePermissions(keycloakId: string, roles: UserRole[]): Promise<Set<string>> {
    const permSet = new Set<string>();

    const authUserId = await this.findAuthUserId(keycloakId);

    const [rolePermissions, userOverrides] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { role: { in: roles } },
        select: { permission: { select: { code: true } } },
      }),
      authUserId
        ? this.prisma.userPermissionOverride.findMany({
            where: { userId: authUserId },
            select: { grant: true, permission: { select: { code: true } } },
          })
        : Promise.resolve([] as { grant: boolean; permission: { code: string } }[]),
    ]);

    for (const rp of rolePermissions) {
      permSet.add(rp.permission.code);
    }

    for (const override of userOverrides) {
      if (override.grant) {
        permSet.add(override.permission.code);
      } else {
        permSet.delete(override.permission.code);
      }
    }

    return permSet;
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
