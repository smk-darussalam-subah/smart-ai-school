// =============================================================================
// sentry.server.config.ts — Sentry init untuk Node.js server runtime (Next.js)
// Di-import via instrumentation.ts saat NEXT_RUNTIME === 'nodejs'
// Env-gated: tanpa SENTRY_DSN → no-op.
// =============================================================================

import * as Sentry from '@sentry/nextjs';
import { scrubPiiNext } from './src/lib/sentry.utils';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubPiiNext(event as unknown as Parameters<typeof scrubPiiNext>[0]) as unknown as typeof event;
    },
  });
}
