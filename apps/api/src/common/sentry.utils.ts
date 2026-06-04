// =============================================================================
// sentry.utils.ts — PII scrubber untuk Sentry beforeSend hook
//
// WAJIB aktif (UU PDP): sekolah memproses data minor.
// Hapus semua header sensitif + request body sebelum event dikirim ke Sentry.
//
// Field yang di-scrub:
//   Headers          : Authorization, Cookie, Set-Cookie, X-Api-Key
//   Body             : seluruh request.data
//   Cookies          : dihapus seluruhnya
//   Request URL      : query-string di-strip (path tetap)
//   Exception values : pola NIS, email, nomor HP, nama (labeled) → [REDACTED]
//
// Fungsi ini pure (tidak ada side-effect) → mudah di-unit-test.
// =============================================================================

/** Minimal subset dari Sentry Event yang kita scrub — structural typing. */
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

export interface SentryEventLike {
  request?: SentryEventRequest;
  exception?: {
    values?: SentryExceptionValue[];
  };
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
 * Pola regex PII yang di-redact dari teks bebas (exception messages, dsb.).
 * Urutan penting: pola lebih spesifik didahulukan.
 * Tidak hardcode nilai sekolah — pola generik.
 */
export const PII_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly replacement: string }> = [
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
export function redactPiiFromText(text: string): string {
  return PII_PATTERNS.reduce(
    (result, { pattern, replacement }) =>
      result.replace(new RegExp(pattern.source, pattern.flags), replacement),
    text,
  );
}

/**
 * beforeBreadcrumb hook — selalu kembalikan null agar breadcrumb tidak dikirim.
 * Pasangan dengan maxBreadcrumbs: 0 di Sentry.init untuk defence-in-depth.
 */
export function scrubBreadcrumb(): null {
  return null;
}

/**
 * Scrub PII dari Sentry event sebelum dikirim ke Sentry cloud.
 * Dipakai sebagai `beforeSend` callback di Sentry.init().
 *
 * @returns Event yang sudah di-scrub (tidak pernah null — selalu kirim event,
 *          tapi tanpa data pribadi).
 */
export function scrubPii(event: SentryEventLike): SentryEventLike {
  const result: SentryEventLike = { ...event };

  // ── Scrub request ──────────────────────────────────────────────────────────
  if (result.request) {
    const req = { ...result.request };

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
        return { ...exVal, value: redactPiiFromText(exVal.value) };
      }),
    };
  }

  return result;
}
