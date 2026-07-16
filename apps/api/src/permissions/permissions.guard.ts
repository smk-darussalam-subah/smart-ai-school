import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { AuthUser } from '@smk/auth';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import {
  REQUIRED_PERMISSION_KEY,
  RequiredPermission,
} from './decorators/require-permission.decorator';
import { PermissionsService } from './permissions.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredPermission = this.reflector.getAllAndOverride<RequiredPermission>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) return true;

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthUser }>();

    const user = request.user;
    // FAIL-CLOSED: endpoint ber-@RequirePermission tanpa user terautentikasi
    // = tolak. (Sebelumnya return true — fail-open bila AuthGuard tak terpasang
    // pada rute, urutan guard berubah, atau rute keliru di-@Public().)
    if (!user) {
      throw new ForbiddenException(
        `Akses ditolak: permission '${this.formatRequired(requiredPermission)}' membutuhkan autentikasi`,
      );
    }

    const requiredPermissions = Array.isArray(requiredPermission)
      ? requiredPermission
      : [requiredPermission];

    const checks = await Promise.all(
      requiredPermissions.map((permission) =>
        this.permissionsService.hasPermission(
          user.keycloakId,
          user.roles,
          permission,
        ),
      ),
    );

    const hasPermission = checks.some(Boolean);

    if (!hasPermission) {
      throw new ForbiddenException(
        `Akses ditolak: membutuhkan salah satu permission '${this.formatRequired(requiredPermission)}'`,
      );
    }

    return true;
  }

  private formatRequired(requiredPermission: RequiredPermission): string {
    return Array.isArray(requiredPermission)
      ? requiredPermission.join("' atau '")
      : requiredPermission;
  }
}
