// =============================================================================
// sentry.client.config.ts — Sentry init untuk browser (Next.js client bundle)
// Di-import via instrumentation.ts
// Env-gated: tanpa NEXT_PUBLIC_SENTRY_DSN → no-op.
// =============================================================================

import * as Sentry from '@sentry/nextjs';
import { scrubBreadcrumbNext, scrubPiiNext } from './src/lib/sentry.utils';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'production',
    tracesSampleRate: 0,
    sendDefaultPii: false,

    // Session replay dimatikan — privasi siswa (data minor UU PDP)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Breadcrumbs dimatikan: bisa mengandung URL, query-param, atau body request
    // yang memuat PII (UU PDP — data minor).
    maxBreadcrumbs: 0,
    beforeBreadcrumb: scrubBreadcrumbNext,

    beforeSend(event) {
      return scrubPiiNext(event as unknown as Parameters<typeof scrubPiiNext>[0]) as unknown as typeof event;
    },
  });
}
