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
import { REQUIRED_PERMISSION_KEY } from './decorators/require-permission.decorator';
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

    const requiredPermission = this.reflector.getAllAndOverride<string>(
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
        `Akses ditolak: permission '${requiredPermission}' membutuhkan autentikasi`,
      );
    }

    const hasPermission = await this.permissionsService.hasPermission(
      user.keycloakId,
      user.roles,
      requiredPermission,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Akses ditolak: membutuhkan permission '${requiredPermission}'`,
      );
    }

    return true;
  }
}
