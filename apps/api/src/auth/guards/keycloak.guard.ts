// =============================================================================
// KeycloakGuard — Memvalidasi Keycloak JWT di setiap request protected
// Gunakan: @UseGuards(KeycloakGuard) di controller
// Skip auth: @Public() decorator
// =============================================================================

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { verifyKeycloakToken, extractAuthUser, AuthUser } from '@smk/auth';
import { auditLog } from '@smk/logger';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class KeycloakGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Cek apakah route di-mark @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token tidak ditemukan');
    }

    try {
      const payload = await verifyKeycloakToken(token);
      const user = extractAuthUser(payload);

      // Inject user ke request untuk dipakai controller
      (request as FastifyRequest & { user: AuthUser }).user = user;

      auditLog('AUTH', 'token', user.keycloakId, user.keycloakId, {
        roles: user.roles,
        path: request.url,
      });

      return true;
    } catch (error) {
      throw new UnauthorizedException('Token tidak valid atau sudah expired');
    }
  }

  private extractToken(request: FastifyRequest): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return null;
    return authHeader.substring(7);
  }
}
