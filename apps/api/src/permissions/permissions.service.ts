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

  invalidateRole(_role: UserRole): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < Date.now()) {
        this.cache.delete(key);
      }
    }
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
    return this.prisma.permission.delete({ where: { id } });
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

    this.invalidateRole(role);
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
    return result;
  }

  private async resolvePermissions(keycloakId: string, roles: UserRole[]): Promise<Set<string>> {
    const permSet = new Set<string>();

    const [rolePermissions, userOverrides] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { role: { in: roles } },
        select: { permission: { select: { code: true } } },
      }),
      this.prisma.userPermissionOverride.findMany({
        where: { grant: true },
        select: {
          permission: { select: { code: true } },
          userId: true,
        },
      }),
    ]);

    for (const rp of rolePermissions) {
      permSet.add(rp.permission.code);
    }

    for (const override of userOverrides) {
      if (override.userId === keycloakId || override.userId === (await this.findAuthUserId(keycloakId))) {
        permSet.add(override.permission.code);
      }
    }

    return permSet;
  }

  private async findAuthUserId(keycloakId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { keycloakId },
      select: { id: true },
    });
    return user?.id ?? null;
  }
}
