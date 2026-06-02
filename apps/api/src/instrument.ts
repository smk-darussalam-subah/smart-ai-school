// =============================================================================
// instrument.ts — Sentry SDK initialization
//
// WAJIB di-import sebagai baris PERTAMA di main.ts (sebelum semua import lain).
// Sentry harus meng-hook Node.js modules sebelum module lain di-require.
//
// Env-gated: tanpa SENTRY_DSN → no-op, tidak ada error, CI tetap hijau.
// =============================================================================

import * as Sentry from '@sentry/nestjs';
import { scrubPii } from './common/sentry.utils';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,

    // Hanya tangkap error — matikan performance tracing (0 = off).
    // Performance tracing menambah overhead dan data yang tidak diperlukan saat ini.
    tracesSampleRate: 0,

    // Jangan kirim PII secara default (IP, user-agent, dll.)
    sendDefaultPii: false,

    // PII scrubber wajib — sekolah memproses data minor (UU PDP).
    // Hapus header sensitif + request body sebelum event dikirim.
    beforeSend(event) {
      // Double-cast via unknown: Sentry Event dan SentryEventLike
      // adalah subset struktural satu sama lain — cast aman secara runtime.
      // (TypeScript strict tidak mengizinkan cast langsung karena konflik
      // dengan tipe DOM ErrorEvent yang memiliki property 'type' required.)
      return scrubPii(event as unknown as Parameters<typeof scrubPii>[0]) as unknown as typeof event;
    },
  });
}
