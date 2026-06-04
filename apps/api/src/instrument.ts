// =============================================================================
// instrument.ts — Sentry SDK initialization
//
// WAJIB di-import sebagai baris PERTAMA di main.ts (sebelum semua import lain).
// Sentry harus meng-hook Node.js modules sebelum module lain di-require.
//
// Env-gated: tanpa SENTRY_DSN → no-op, tidak ada error, CI tetap hijau.
// =============================================================================

import * as Sentry from '@sentry/nestjs';
import { scrubBreadcrumb, scrubPii } from './common/sentry.utils';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,

    // Hanya tangkap error — matikan performance tracing (0 = off).
    tracesSampleRate: 0,

    // Jangan kirim PII secara default (IP, user-agent, dll.)
    sendDefaultPii: false,

    // Breadcrumbs dimatikan: bisa mengandung URL, query-param, atau body request
    // yang memuat PII (UU PDP — data minor).
    maxBreadcrumbs: 0,

    // Defence-in-depth: pastikan tidak ada breadcrumb yang lolos filter maxBreadcrumbs.
    beforeBreadcrumb: scrubBreadcrumb,

    // PII scrubber wajib — header sensitif + body + URL query + exception values.
    beforeSend(event) {
      return scrubPii(event as unknown as Parameters<typeof scrubPii>[0]) as unknown as typeof event;
    },
  });
}
