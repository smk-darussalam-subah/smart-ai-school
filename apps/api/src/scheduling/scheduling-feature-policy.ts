import { ServiceUnavailableException } from '@nestjs/common';

function ceiling(name: string, fallback: number, upper: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > upper) {
    throw new ServiceUnavailableException('Konfigurasi batas draft tidak valid');
  }
  return Number(raw);
}

/** Exact opt-in only; no environment flag is mutated by the application. */
export function schedulingPolicy() {
  if (process.env.SMART_SCHEDULER_ENABLED !== 'true') {
    throw new ServiceUnavailableException('Fondasi draft jadwal belum diaktifkan');
  }
  return {
    maxSlots: ceiling('SMART_SCHEDULER_MAX_DRAFT_SLOTS', 1000, 10000),
    maxClasses: ceiling('SMART_SCHEDULER_MAX_SCOPE_CLASSES', 256, 1024),
    maxOccurrenceDays: ceiling('SMART_SCHEDULER_MAX_DRAFT_DAYS', 370, 3660),
  };
}
