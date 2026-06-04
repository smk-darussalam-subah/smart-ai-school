// =============================================================================
// sentry.utils.ts (apps/web) — PII scrubber untuk Sentry beforeSend
//
// Mirror dari apps/api/src/common/sentry.utils.ts untuk frontend.
// Berlaku di server, edge, dan client bundle.
// Pola PII konsisten — tidak duplikasi divergen.
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
  url?: string;
  [key: string]: unknown;
}

export interface SentryExceptionValue {
  value?: string;
  type?: string;
  [key: string]: unknown;
}

export interface SentryEventLikeNext {
  request?: SentryEventRequest;
  exception?: {
    values?: SentryExceptionValue[];
  };
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Pola regex PII yang di-redact dari teks bebas (exception messages, dsb.).
 * Konsisten dengan api/src/common/sentry.utils.ts — jangan divergen.
 */
export const PII_PATTERNS_NEXT: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly replacement: string;
}> = [
  // Email addresses
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[REDACTED]',
  },
  // Nomor HP Indonesia: +62xxx / 62xxx / 08xxx (8–12 digit setelah awalan)
  {
    pattern: /(?:\+62|62|0)[0-9]{8,12}\b/g,
    replacement: '[REDACTED]',
  },
  // NIS berlabel: "NIS: 12345678" atau "NIS 1234567890"
  {
    pattern: /\bNIS\s*:?\s*\d{5,20}\b/gi,
    replacement: '[REDACTED]',
  },
  // Nama berlabel: "nama: Ahmad", "fullName: Budi", "full_name: ..."
  {
    pattern: /\b(?:nama|fullname|full_name|full name|nama_siswa)\s*[:=]?\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{1,48}/gi,
    replacement: '[REDACTED]',
  },
];

/**
 * Ganti semua pola PII dalam teks dengan [REDACTED].
 * Pure function — tidak mengubah input.
 */
export function redactPiiFromTextNext(text: string): string {
  return PII_PATTERNS_NEXT.reduce(
    (result, { pattern, replacement }) =>
      result.replace(new RegExp(pattern.source, pattern.flags), replacement),
    text,
  );
}

/**
 * beforeBreadcrumb hook — selalu kembalikan null agar breadcrumb tidak dikirim.
 * Pasangan dengan maxBreadcrumbs: 0 di Sentry.init untuk defence-in-depth.
 */
export function scrubBreadcrumbNext(): null {
  return null;
}

/**
 * Scrub PII dari Sentry event (Next.js) sebelum dikirim ke Sentry cloud.
 * Hapus header auth/session + request body + query-string dari URL +
 * redact exception values yang mengandung PII.
 */
export function scrubPiiNext(event: SentryEventLikeNext): SentryEventLikeNext {
  const result: SentryEventLikeNext = { ...event };

  // ── Scrub request ──────────────────────────────────────────────────────────
  if (result.request) {
    const req = { ...result.request };

    if (req.headers) {
      const headers = { ...req.headers };
      for (const header of SENSITIVE_HEADERS) {
        delete headers[header];
      }
      req.headers = headers;
    }

    req.data = '[REDACTED - request body tidak dikirim ke Sentry (UU PDP)]';
    req.cookies = {};

    // Strip query-string dari URL (path tetap, query bisa mengandung PII)
    if (typeof req.url === 'string' && req.url.includes('?')) {
      req.url = req.url.split('?')[0];
    }

    result.request = req;
  }

  // ── Scrub exception values ─────────────────────────────────────────────────
  if (result.exception?.values) {
    result.exception = {
      ...result.exception,
      values: result.exception.values.map((exVal) => {
        if (!exVal || typeof exVal.value !== 'string') return exVal;
        return { ...exVal, value: redactPiiFromTextNext(exVal.value) };
      }),
    };
  }

  return result;
}
