export const DIIS_SERVICE_WORKER_URL = '/sw.js';

export interface PwaReleaseSummary {
  version: string;
  date: string;
  features: string[];
  fixes: string[];
  requiresLogin: boolean;
}

function boundedTextList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 3) return null;
  const entries = value.filter((entry): entry is string => (
    typeof entry === 'string' && entry.trim().length > 0 && entry.length <= 120
  ));
  return entries.length === value.length ? entries : null;
}

export function normalizeReleaseSummary(value: unknown): PwaReleaseSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const features = boundedTextList(candidate.features);
  const fixes = boundedTextList(candidate.fixes);
  if (
    typeof candidate.version !== 'string' || candidate.version.length > 40 ||
    typeof candidate.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.date) ||
    typeof candidate.requiresLogin !== 'boolean' || !features || !fixes
  ) return null;
  return {
    version: candidate.version,
    date: candidate.date,
    features,
    fixes,
    requiresLogin: candidate.requiresLogin,
  };
}

export function requestWaitingWorkerReleaseSummary(
  worker: ServiceWorker,
  timeoutMs = 800,
): Promise<PwaReleaseSummary | null> {
  if (typeof MessageChannel === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = (value: PwaReleaseSummary | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      channel.port1.close();
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      finish(normalizeReleaseSummary(event.data));
    };
    try {
      worker.postMessage({ type: 'DIIS_GET_RELEASE_SUMMARY' }, [channel.port2]);
    } catch {
      finish(null);
    }
  });
}

export function supportsServiceWorker(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export async function registerDiisServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!supportsServiceWorker()) return null;
  try {
    return await navigator.serviceWorker.register(DIIS_SERVICE_WORKER_URL, {
      scope: '/',
      updateViaCache: 'none',
    });
  } catch {
    return null;
  }
}

export function waitingWorkerFromRegistration(
  registration: ServiceWorkerRegistration,
): ServiceWorker | null {
  return registration.waiting && navigator.serviceWorker.controller
    ? registration.waiting
    : null;
}
