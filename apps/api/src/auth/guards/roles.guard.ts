// =============================================================================
// RolesGuard
// Checks stable identity roles from JWT and period-bound position codes from
// active DIIS appointments. Position codes must not come back as Keycloak roles.
// =============================================================================

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import {
  AuthUser,
  UserRole,
  isPositionCode,
  isPrimaryRole,
} from '@smk/auth';
import { PermissionsService } from '../../permissions/permissions.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Akses ditolak: user tidak terautentikasi');
    }

    const hasRequiredIdentityRole = requiredRoles.some((role) =>
      isPrimaryRole(role) && user.roles.includes(role),
    );
    if (hasRequiredIdentityRole) return true;

    const requiredPositionCodes = requiredRoles.filter(isPositionCode);
    if (requiredPositionCodes.length > 0) {
      const activePositionCodes = await this.permissions.getActivePositionCodes(user.keycloakId);
      const hasRequiredPosition = requiredPositionCodes.some((role) =>
        activePositionCodes.has(role),
      );
      if (hasRequiredPosition) return true;
    }

    throw new ForbiddenException('Akses ditolak: role atau appointment aktif tidak mencukupi');
  }
}
