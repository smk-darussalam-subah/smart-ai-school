// =============================================================================
// AuditInterceptor — Global interceptor yang mencatat setiap mutasi ke DB audit.
//
// Hanya mencatat: POST, PUT, PATCH, DELETE.
// GET tidak dicatat (volume tinggi, bukan mutasi).
// Fail-soft: kegagalan tulis audit TIDAK menggagalkan request user.
// PII-minimal: denylist field sensitif, tidak pernah simpan kredensial.
// =============================================================================

import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FastifyRequest } from 'fastify';
import { AuthUser } from '@smk/auth';
import { logger } from '@smk/logger';
import { AuditLogService, CreateAuditLogInput } from '../audit-log.service';
import {
  AUDIT_KEY,
  SKIP_AUDIT_KEY,
  AuditOptions,
} from '../decorators/audit.decorator';
import { Prisma } from '@prisma/client';

// Field names yang TIDAK BOLEH masuk ke metadata.metadata — strip nilainya.
const SENSITIVE_FIELDS = new Set([
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'clientSecret',
  'authorization',
  'apiKey',
  'privateKey',
  'credential',
  'credentials',
  'nik',
  'kk',
  'npwp',
]);

const MUTATIVE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthUser }>();
    const method = request.method.toUpperCase();

    // Hanya catat mutasi
    if (!MUTATIVE_METHODS.has(method)) {
      return next.handle();
    }

    // Cek @SkipAudit()
    const skipAudit = this.reflector.getAllAndOverride<boolean>(SKIP_AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipAudit) return next.handle();

    // Baca @Audit() options (opsional)
    const auditOptions =
      this.reflector.getAllAndOverride<AuditOptions>(AUDIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? {};

    const user = request.user;
    const rawUrl = request.url ?? '';
    const path = rawUrl.split('?')[0] ?? rawUrl;
    const ip = this.extractIp(request);
    const userAgentHeader = request.headers['user-agent'];
    const userAgent =
      typeof userAgentHeader === 'string' ? userAgentHeader : null;

    const resourceType =
      auditOptions.resourceType ?? this.deriveResourceType(path);

    const baseData = {
      actorId: user?.keycloakId ?? null,
      actorUsername: user?.username ?? null,
      actorRoles: user?.roles ?? [],
      method,
      path,
      ip,
      userAgent,
      resourceType,
    };

    return next.handle().pipe(
      tap({
        next: (responseBody: unknown) => {
          const action =
            auditOptions.action ?? this.deriveAction(resourceType, method);
          const resourceId = this.extractResourceId(
            method,
            request,
            responseBody,
          );
          const metadata = auditOptions.captureBody
            ? this.sanitizeBody(request.body)
            : null;

          // statusCode: POST→201, lainnya→200 (NestJS default sebelum reply dikirim)
          const statusCode = method === 'POST' ? 201 : 200;

          this.writeLog({
            ...baseData,
            action,
            resourceId,
            statusCode,
            outcome: 'success',
            metadata,
          });
        },
        error: (err: unknown) => {
          const action =
            auditOptions.action ?? this.deriveAction(resourceType, method);
          const statusCode =
            err instanceof HttpException ? err.getStatus() : 500;
          const errorMsg = err instanceof Error ? err.message : String(err);

          this.writeLog({
            ...baseData,
            action,
            resourceId: null,
            statusCode,
            outcome: 'failure',
            metadata: { error: errorMsg } as Prisma.InputJsonValue,
          });
          // tap error handler tidak meng-suppress error — tetap propagate downstream
        },
      }),
    );
  }

  // Fire-and-forget — kegagalan tulis audit TIDAK menggagalkan request
  private writeLog(data: CreateAuditLogInput): void {
    this.auditLogService.create(data).catch((err: unknown) => {
      logger.error('AuditInterceptor: gagal tulis audit log (fail-soft)', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private extractIp(req: FastifyRequest): string | null {
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (typeof xForwardedFor === 'string') {
      return xForwardedFor.split(',')[0]?.trim() || null;
    }
    if (Array.isArray(xForwardedFor) && xForwardedFor.length > 0) {
      const first = xForwardedFor[0] ?? '';
      return first.split(',')[0]?.trim() || null;
    }
    const xRealIp = req.headers['x-real-ip'];
    if (typeof xRealIp === 'string') return xRealIp || null;
    return req.ip || null;
  }

  private deriveResourceType(path: string): string {
    const parts = path.split('/').filter(Boolean);
    // Strip "api" and version prefix (e.g. "v1")
    const apiIdx = parts.indexOf('api');
    const nextPart = parts[apiIdx + 1];
    const startIdx =
      apiIdx !== -1 && nextPart !== undefined && /^v\d+$/.test(nextPart)
        ? apiIdx + 2
        : 0;
    return parts[startIdx] ?? 'unknown';
  }

  private deriveAction(resourceType: string, method: string): string {
    const verbMap: Record<string, string> = {
      POST: 'create',
      PUT: 'update',
      PATCH: 'update',
      DELETE: 'delete',
    };
    return `${resourceType}.${verbMap[method] ?? method.toLowerCase()}`;
  }

  private extractResourceId(
    method: string,
    req: FastifyRequest,
    responseBody: unknown,
  ): string | null {
    if (method === 'POST') {
      // Coba ambil id dari response body (CREATE)
      if (typeof responseBody === 'object' && responseBody !== null) {
        const body = responseBody as Record<string, unknown>;
        if (typeof body['id'] === 'string') return body['id'];
        const data = body['data'];
        if (typeof data === 'object' && data !== null) {
          const id = (data as Record<string, unknown>)['id'];
          if (typeof id === 'string') return id;
        }
      }
      return null;
    }

    // PATCH, PUT, DELETE — ambil dari params
    const params = (req as FastifyRequest & { params?: Record<string, string> })
      .params;
    if (typeof params?.['id'] === 'string') return params['id'];
    return null;
  }

  // Sanitasi request body: strip nilai field sensitif, pertahankan key + non-sensitif values
  private sanitizeBody(body: unknown): Prisma.InputJsonValue | null {
    if (typeof body !== 'object' || body === null) return null;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      body as Record<string, unknown>,
    )) {
      if (SENSITIVE_FIELDS.has(key)) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = '[object]';
      } else {
        result[key] = value;
      }
    }
    return result as Prisma.InputJsonValue;
  }
}
