// =============================================================================
// counters.ts — Shared prom-client counter definitions
// Module-level singleton: aman diimpor dari mana saja tanpa double-registration.
// getSingleMetric guard mencegah error "already registered" di hot-reload / test.
// =============================================================================

import { Counter, Gauge, register } from 'prom-client';

function getOrCreateCounter(name: string, help: string, labelNames: string[]): Counter<string> {
  const existing = register.getSingleMetric(name);
  if (existing) return existing as Counter<string>;
  return new Counter({ name, help, labelNames });
}

/**
 * Counter: total HTTP request yang diproses smk-api, berlabel method (GET/POST/...).
 * Di-increment oleh LoggingInterceptor untuk setiap request yang selesai.
 */
export const httpRequestsTotal = getOrCreateCounter(
  'smk_http_requests_total',
  'Total HTTP requests processed by smk-api',
  ['method'],
);

function getOrCreateGauge(name: string, help: string): Gauge<string> {
  return (register.getSingleMetric(name) as Gauge<string> | undefined) ?? new Gauge({ name, help });
}

export const assessmentWritesActive = getOrCreateGauge(
  'smk_assessment_writes_active',
  'Assessment writes admitted before database acquisition',
);
export const assessmentWritesWaiting = getOrCreateGauge(
  'smk_assessment_writes_waiting',
  'Assessment writes waiting without holding database connections',
);
export const assessmentWritesBusy = getOrCreateCounter(
  'smk_assessment_writes_busy_total',
  'Assessment writes rejected before execution by bounded admission',
  [],
);
