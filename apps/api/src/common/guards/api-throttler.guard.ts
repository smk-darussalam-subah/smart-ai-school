import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '@smk/auth';

export function skipAiThrottle(context: ExecutionContext): boolean {
  return ![context.getHandler(), context.getClass()].some(
    (target) => Reflect.getMetadata(THROTTLER_LIMIT + 'aichat', target) !== undefined,
  );
}

/** Cheap IP ceiling before JWT work; user quotas run only after authentication. */
@Injectable()
export class PreAuthThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    return this.handleRequest({
      context,
      limit: 1200,
      ttl: 60_000,
      blockDuration: 60_000,
      throttler: { name: 'preauth', ttl: 60_000, limit: 1200 },
      getTracker: (request: Record<string, unknown>) =>
        Promise.resolve(typeof request.ip === 'string' ? request.ip : 'unresolved'),
      generateKey: this.generateKey.bind(this),
    });
  }
}

@Injectable()
export class AuthenticatedThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(request: FastifyRequest & { user?: AuthUser }): Promise<string> {
    return request.user?.keycloakId ? `user:${request.user.keycloakId}` : `ip:${request.ip}`;
  }
}
