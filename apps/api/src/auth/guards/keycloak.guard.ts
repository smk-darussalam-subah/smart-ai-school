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
import { UserStatusService } from '../user-status.service';

@Injectable()
export class KeycloakGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly userStatus: UserStatusService,
  ) {}

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

    let user: AuthUser;
    try {
      const payload = await verifyKeycloakToken(token);
      user = extractAuthUser(payload);
    } catch (error) {
      throw new UnauthorizedException('Token tidak valid atau sudah expired');
    }
    if (!user?.keycloakId) {
      // extractAuthUser gagal membentuk identitas → token tidak sah
      throw new UnauthorizedException('Token tidak valid atau sudah expired');
    }

    // 2J-0 (A4b): user dinonaktifkan/di-soft-delete dari dashboard TIDAK boleh
    // lewat meski token KC masih hidup. (Saklar KC menyusul di 2J-1/2.)
    if (await this.userStatus.isBlocked(user.keycloakId)) {
      throw new UnauthorizedException('Akun dinonaktifkan. Hubungi administrator.');
    }

    {
      // Inject user ke request untuk dipakai controller
      (request as FastifyRequest & { user: AuthUser }).user = user;

      auditLog('AUTH', 'token', user.keycloakId, user.keycloakId, {
        roles: user.roles,
        path: request.url,
      });

      return true;
    }
  }

  private extractToken(request: FastifyRequest): string | null {
    // 1. Priority: Authorization Bearer header
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.substring(7);

    // W2-C: SSE fallback — EventSource cannot send custom headers.
    // Accept ?token=xxx query param for SSE stream endpoints only.
    // The token is validated via the same verifyKeycloakToken() below,
    // so no security degradation — just transport adaptation.
    const url = request.url;
    if (url && url.includes('/stream')) {
      const queryToken = (request.query as Record<string, unknown> | null)?.token;
      if (typeof queryToken === 'string' && queryToken.length > 0) return queryToken;
    }

    return null;
  }
}
