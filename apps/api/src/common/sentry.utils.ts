// =============================================================================
// sentry.utils.ts — PII scrubber untuk Sentry beforeSend hook
//
// WAJIB aktif (UU PDP): sekolah memproses data minor.
// Hapus semua header sensitif + request body sebelum event dikirim ke Sentry.
//
// Field yang di-scrub:
//   Headers : Authorization, Cookie, Set-Cookie, X-Api-Key
//   Body    : seluruh request.data (bisa mengandung NIS, fullName, nilai, dsb.)
//   Cookies : dihapus seluruhnya
//
// Fungsi ini pure (tidak ada side-effect) → mudah di-unit-test.
// =============================================================================

/** Minimal subset dari Sentry Event yang kita scrub — structural typing. */
export interface SentryEventRequest {
  headers?: Record<string, string>;
  data?: unknown;
  cookies?: string | Record<string, string>;
  [key: string]: unknown;
}

export interface SentryEventLike {
  request?: SentryEventRequest;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
}

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

/**
 * Scrub PII dari Sentry event sebelum dikirim ke Sentry cloud.
 * Dipakai sebagai `beforeSend` callback di Sentry.init().
 *
 * @returns Event yang sudah di-scrub (tidak pernah null — selalu kirim event,
 *          tapi tanpa data pribadi).
 */
export function scrubPii(event: SentryEventLike): SentryEventLike {
  if (!event.request) return event;

  const req = { ...event.request };

  // Hapus header sensitif
  if (req.headers) {
    const headers = { ...req.headers };
    for (const header of SENSITIVE_HEADERS) {
      delete headers[header];
    }
    req.headers = headers;
  }

  // Hapus request body — bisa mengandung NIS, fullName, nilai, dll.
  req.data = '[REDACTED - request body tidak dikirim ke Sentry (UU PDP)]';

  // Hapus cookies
  req.cookies = {};

  return { ...event, request: req };
}
