// =============================================================================
// LoggingInterceptor — Log setiap request & response time
// =============================================================================

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FastifyRequest } from 'fastify';
import { logger } from '@smk/logger';
import { AuthUser } from '@smk/auth';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          logger.info(`${method} ${url} — ${duration}ms`, {
            type: 'request',
            method,
            url,
            duration,
            userId: (request as FastifyRequest & { user?: AuthUser }).user?.keycloakId,
          });
        },
        error: (error: Error) => {
          const duration = Date.now() - startTime;
          logger.error(`${method} ${url} — ERROR ${duration}ms`, {
            type: 'request_error',
            method,
            url,
            duration,
            error: error.message,
          });
        },
      }),
    );
  }
}
