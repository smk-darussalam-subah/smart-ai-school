import { ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '@smk/auth';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';

const SHARED_ASSESSMENT_BUDGET = 'diis:shared-assessment-budget';
const SHARED_READ_BUDGET = 'diis:shared-read-budget';
/** 350 learners emit at least1400 heartbeats/min through one server proxy. */
export const SharedAssessmentBudget = () => SetMetadata(SHARED_ASSESSMENT_BUDGET, true);
/** Explicitly selected small, authenticated bootstrap reads share a Web peer.
 * 730 accounts ×4 reads/handler/min needs2920;6000 leaves bounded burst headroom.
 * This is a transport ceiling, not measured server capacity or authorization.
 */
export const SharedReadBudget = () => SetMetadata(SHARED_READ_BUDGET, true);

export function skipAiThrottle(context: ExecutionContext): boolean {
  return ![context.getHandler(), context.getClass()].some(
    (target) => Reflect.getMetadata(THROTTLER_LIMIT + 'aichat', target) !== undefined,
  );
}

/** Cheap IP ceiling before JWT work; user quotas run only after authentication. */
@Injectable()
export class PreAuthThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only selected handlers receive the shared transport budget. In particular,
    // marking a public endpoint or a mutation as a shared read does not raise it.
    // The post-authentication per-user limit remains unchanged; caller headers
    // never select the budget or the tracker.
    const handler = context.getHandler();
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const isPublic = [handler, context.getClass()].some(
      (target) => Reflect.getMetadata(IS_PUBLIC_KEY, target) === true,
    );
    const sharedRead =
      request.method === 'GET' &&
      !isPublic &&
      Reflect.getMetadata(SHARED_READ_BUDGET, handler) === true;
    const sharedAssessment = Reflect.getMetadata(SHARED_ASSESSMENT_BUDGET, handler) === true;
    const limit = sharedRead || sharedAssessment ? 6000 : 1200;
    return this.handleRequest({
      context,
      limit,
      ttl: 60_000,
      blockDuration: 60_000,
      throttler: { name: 'preauth', ttl: 60_000, limit },
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
