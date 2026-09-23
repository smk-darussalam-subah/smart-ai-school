import {
  purgeOwnedIndexedDatabases,
  purgeUserStorage,
  type IndexedDbLike,
  type IndexedDbCleanupResult,
  type StorageLike,
} from './pwa-preferences';
import { DIIS_PUSH_STATE_CACHE, setPushDeliveryState } from './push';

export const DIIS_CACHE_PREFIX = 'diis-pwa-';
export const FEDERATED_LOGOUT_URL = '/api/auth/federated-logout';
const CLEANUP_TIMEOUT_MS = 2500;

interface PushSubscriptionLike {
  endpoint: string;
  unsubscribe(): Promise<boolean>;
}

interface ServiceWorkerRegistrationLike {
  pushManager?: {
    getSubscription(): Promise<PushSubscriptionLike | null>;
  };
}

export interface SharedDeviceCleanupDependencies {
  getRegistration?: () => Promise<ServiceWorkerRegistrationLike | undefined>;
  cacheStorage?: Pick<CacheStorage, 'keys' | 'delete'>;
  localStorage?: StorageLike;
  sessionStorage?: StorageLike;
  indexedDb?: IndexedDbLike;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export interface SharedDeviceCleanupResult {
  complete: boolean;
  timedOut: boolean;
  cacheComplete: boolean;
  push: {
    registrationRead: boolean;
    serverUnsubscribed: boolean | null;
    browserUnsubscribed: boolean | null;
  };
  indexedDb: IndexedDbCleanupResult;
}

function browserStorage(kind: 'localStorage' | 'sessionStorage'): StorageLike | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window[kind];
  } catch {
    return undefined;
  }
}

async function purgeOwnedCaches(cacheStorage?: Pick<CacheStorage, 'keys' | 'delete'>): Promise<boolean> {
  if (!cacheStorage) return true;
  const names = await cacheStorage.keys();
  const results = await Promise.allSettled(
    names.filter((name) => name.startsWith(DIIS_CACHE_PREFIX) && name !== DIIS_PUSH_STATE_CACHE)
      .map((name) => cacheStorage.delete(name)),
  );
  return results.every((result) => result.status === 'fulfilled' && result.value === true);
}

async function readCurrentSubscription(
  getRegistration?: () => Promise<ServiceWorkerRegistrationLike | undefined>,
): Promise<{ complete: boolean; subscription: PushSubscriptionLike | null }> {
  if (!getRegistration) return { complete: true, subscription: null };
  try {
    const registration = await getRegistration();
    return {
      complete: true,
      subscription: await registration?.pushManager?.getSubscription() ?? null,
    };
  } catch {
    return { complete: false, subscription: null };
  }
}

async function runBounded<T>(task: Promise<T>, timeoutMs: number): Promise<{
  timedOut: boolean;
  value?: T;
}> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });
  const result = await Promise.race([
    task.then((value) => ({ timedOut: false as const, value })),
    timeout,
  ]);
  if (timer) clearTimeout(timer);
  return result;
}

export async function cleanupSharedDeviceSession(
  dependencies: SharedDeviceCleanupDependencies = {},
): Promise<SharedDeviceCleanupResult> {
  const getRegistration = dependencies.getRegistration ?? (
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? () => navigator.serviceWorker.getRegistration()
      : undefined
  );
  const cacheStorage = dependencies.cacheStorage ?? (
    typeof caches !== 'undefined' ? caches : undefined
  );
  const fetcher = dependencies.fetcher ?? (
    typeof fetch !== 'undefined' ? fetch : undefined
  );
  const local = dependencies.localStorage ?? browserStorage('localStorage');
  const session = dependencies.sessionStorage ?? browserStorage('sessionStorage');
  const indexedDb = dependencies.indexedDb ?? (
    typeof indexedDB !== 'undefined' ? indexedDB : undefined
  );

  const cleanup = (async (): Promise<SharedDeviceCleanupResult> => {
    purgeUserStorage(local, session);
    const subscriptionPromise = readCurrentSubscription(getRegistration);
    const purgePromise = purgeOwnedCaches(cacheStorage);
    const indexedDbPromise = purgeOwnedIndexedDatabases(indexedDb);
    const subscriptionRead = await subscriptionPromise;
    const subscriptionTasks: Array<Promise<boolean>> = [];

    if (subscriptionRead.subscription) {
      if (fetcher) {
        subscriptionTasks.push(fetcher('/api/backend/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscriptionRead.subscription.endpoint }),
          cache: 'no-store',
          credentials: 'same-origin',
          keepalive: true,
        }).then((response) => response.ok));
      } else {
        subscriptionTasks.push(Promise.resolve(false));
      }
      subscriptionTasks.push(subscriptionRead.subscription.unsubscribe());
    }

    const [cacheResult, indexedDbResult, ...subscriptionResults] = await Promise.allSettled([
      purgePromise,
      indexedDbPromise,
      ...subscriptionTasks,
    ]);
    const indexedDbCleanup = indexedDbResult.status === 'fulfilled'
      ? indexedDbResult.value
      : { complete: false, deleted: [], incomplete: [{ name: 'cleanup', status: 'error' as const }] };
    const serverUnsubscribed = subscriptionRead.subscription
      ? subscriptionResults[0]?.status === 'fulfilled' && subscriptionResults[0].value === true
      : null;
    const browserUnsubscribed = subscriptionRead.subscription
      ? subscriptionResults[1]?.status === 'fulfilled' && subscriptionResults[1].value === true
      : null;
    const cacheComplete = cacheResult.status === 'fulfilled' && cacheResult.value === true;
    const pushComplete = subscriptionRead.complete
      && (!subscriptionRead.subscription || (serverUnsubscribed === true && browserUnsubscribed === true));
    return {
      complete: cacheComplete && indexedDbCleanup.complete && pushComplete,
      timedOut: false,
      cacheComplete,
      push: {
        registrationRead: subscriptionRead.complete,
        serverUnsubscribed,
        browserUnsubscribed,
      },
      indexedDb: indexedDbCleanup,
    };
  })();

  const bounded = await runBounded(cleanup, dependencies.timeoutMs ?? CLEANUP_TIMEOUT_MS);
  if (!bounded.timedOut && bounded.value) return bounded.value;
  return {
    complete: false,
    timedOut: true,
    cacheComplete: false,
    push: {
      registrationRead: false,
      serverUnsubscribed: null,
      browserUnsubscribed: null,
    },
    indexedDb: { complete: false, deleted: [], incomplete: [{ name: 'cleanup', status: 'timeout' }] },
  };
}

let logoutInFlight: Promise<void> | null = null;

function cleanupSuppressedPush(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const cleanup = value as Partial<SharedDeviceCleanupResult>;
  if (cleanup.complete === true) return true;
  return cleanup.push?.serverUnsubscribed === true || cleanup.push?.browserUnsubscribed === true;
}

export function beginSharedDeviceLogout(
  navigate: (url: string) => void,
  cleanup: () => Promise<unknown> = cleanupSharedDeviceSession,
  suppressDelivery: () => Promise<boolean> = () => setPushDeliveryState('signed-out'),
): Promise<void> {
  if (logoutInFlight) return logoutInFlight;
  logoutInFlight = (async () => {
    const locallySuppressed = await suppressDelivery().catch(() => false);
    let cleanupResult: unknown;
    try {
      cleanupResult = await cleanup();
    } catch {
      cleanupResult = undefined;
    }
    if (!locallySuppressed && !cleanupSuppressedPush(cleanupResult)) {
      throw new Error('Notifikasi belum dapat diamankan untuk logout');
    }
    navigate(FEDERATED_LOGOUT_URL);
  })().finally(() => {
    logoutInFlight = null;
  });
  return logoutInFlight;
}
