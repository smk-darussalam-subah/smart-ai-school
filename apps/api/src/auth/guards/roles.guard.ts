// =============================================================================
// RolesGuard — Cek @Roles() metadata terhadap user.roles dari JWT
// Urutan guard: ThrottlerGuard → KeycloakGuard → RolesGuard
// Endpoint tanpa @Roles() = lolos (hanya butuh autentikasi, sudah di KeycloakGuard)
// =============================================================================

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { AuthUser, UserRole } from '@smk/auth';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // @Public() bypass semua pengecekan (auth + roles)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Tidak ada @Roles() → endpoint butuh autentikasi saja, role apapun OK
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthUser }>();
    const user = request.user;

    // Tidak ada user di request → KeycloakGuard seharusnya sudah throw 401 lebih dulu
    if (!user) {
      throw new ForbiddenException('Akses ditolak: user tidak terautentikasi');
    }

    const hasRequiredRole = requiredRoles.some((role) =>
      user.roles.includes(role),
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException('Akses ditolak: role tidak mencukupi');
    }

    return true;
  }
}
