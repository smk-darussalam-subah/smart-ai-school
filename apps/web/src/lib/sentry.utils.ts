// =============================================================================
// sentry.utils.ts (apps/web) — PII scrubber untuk Sentry beforeSend
//
// Mirror dari apps/api/src/common/sentry.utils.ts untuk frontend.
// Berlaku di server, edge, dan client bundle.
// =============================================================================

const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'Authorization',
  'Cookie',
  'Set-Cookie',
  'X-Api-Key',
] as const;

export interface SentryEventRequest {
  headers?: Record<string, string>;
  data?: unknown;
  cookies?: string | Record<string, string>;
  [key: string]: unknown;
}

export interface SentryEventLikeNext {
  request?: SentryEventRequest;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Scrub PII dari Sentry event (Next.js) sebelum dikirim ke Sentry cloud.
 * Hapus header auth/session + request body (bisa mengandung data siswa/staff).
 */
export function scrubPiiNext(event: SentryEventLikeNext): SentryEventLikeNext {
  if (!event.request) return event;

  const req = { ...event.request };

  if (req.headers) {
    const headers = { ...req.headers };
    for (const header of SENSITIVE_HEADERS) {
      delete headers[header];
    }
    req.headers = headers;
  }

  req.data = '[REDACTED - request body tidak dikirim ke Sentry (UU PDP)]';
  req.cookies = {};

  return { ...event, request: req };
}
