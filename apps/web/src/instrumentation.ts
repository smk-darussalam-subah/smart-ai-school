// =============================================================================
// instrumentation.ts — Next.js 15 instrumentation hook
//
// Next.js 15 App Router memanggil register() saat server start.
// Sentry config diload per-runtime (nodejs vs edge) agar bundle tidak bloat.
// Env-gated: tanpa DSN → no-op.
// =============================================================================

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}
