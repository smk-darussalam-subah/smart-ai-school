import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';
export const SKIP_AUDIT_KEY = 'skipAudit';

export interface AuditOptions {
  action?: string;
  resourceType?: string;
  // When true, non-sensitive request body field values are included in metadata.
  // Sensitive fields (password, token, etc.) are always redacted regardless.
  captureBody?: boolean;
}

/**
 * Override action/resourceType per handler, or enable body capture.
 * @example @Audit({ action: 'auth.login', resourceType: 'session' })
 */
export const Audit = (options: AuditOptions = {}) =>
  SetMetadata(AUDIT_KEY, options);

/**
 * Prevent AuditInterceptor from logging this handler.
 * Use on: GET /audit-logs, /health, /metrics, and any read-only endpoint
 * where audit volume would be excessive.
 */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);
