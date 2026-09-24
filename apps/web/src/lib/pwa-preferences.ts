export const PWA_ONBOARDING_VERSION = '1';
export const PWA_ONBOARDING_KEY = 'diis-pwa-onboarding-version';

const OWNED_STORAGE_PREFIXES = ['diis-', 'diis:'];
const PERSISTED_LOCAL_KEYS = new Set([
  'diis-theme',
  'diis-ortu-theme',
  'diis-language',
  PWA_ONBOARDING_KEY,
]);

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface IndexedDbLike {
  databases?: () => Promise<Array<{ name?: string }>>;
  deleteDatabase(name: string): IDBOpenDBRequest;
}

export type IndexedDbDeletionStatus = 'deleted' | 'blocked' | 'error' | 'timeout' | 'unavailable';

const KNOWN_OWNED_INDEXED_DATABASES = ['diis-assessment-outbox-v1'];

export interface IndexedDbCleanupResult {
  complete: boolean;
  deleted: string[];
  incomplete: Array<{ name: string; status: IndexedDbDeletionStatus | 'still-present' }>;
}

export interface IndexedDbCleanupOptions {
  attemptTimeoutMs?: number;
  retryDelayMs?: number;
  requestClosure?: (names: string[]) => void | Promise<void>;
}

export interface InstalledExperienceDependencies {
  displayModeStandalone?: boolean;
  navigatorStandalone?: boolean;
}

function isOwnedStorageKey(key: string): boolean {
  return OWNED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function storageKeys(storage: StorageLike): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

export function isInstalledExperience(dependencies: InstalledExperienceDependencies = {}): boolean {
  const standalone =
    dependencies.displayModeStandalone ??
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches);
  const iosStandalone =
    dependencies.navigatorStandalone ??
    (typeof navigator !== 'undefined' &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  return standalone || iosStandalone;
}

export function needsPwaOnboarding(storage?: StorageLike): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(PWA_ONBOARDING_KEY) !== PWA_ONBOARDING_VERSION;
  } catch {
    return true;
  }
}

export function completePwaOnboarding(storage?: StorageLike): void {
  if (!storage) return;
  try {
    storage.setItem(PWA_ONBOARDING_KEY, PWA_ONBOARDING_VERSION);
  } catch {
    // The welcome can close even when persistence is unavailable.
  }
}

export function purgeUserStorage(local?: StorageLike, session?: StorageLike): void {
  if (local) {
    for (const key of storageKeys(local)) {
      if (isOwnedStorageKey(key) && !PERSISTED_LOCAL_KEYS.has(key)) {
        local.removeItem(key);
      }
    }
  }
  if (session) {
    for (const key of storageKeys(session)) {
      if (isOwnedStorageKey(key)) session.removeItem(key);
    }
  }
}

function defaultClosureRequest(names: string[]): void {
  if (typeof BroadcastChannel === 'undefined' || names.length === 0) return;
  const channel = new BroadcastChannel('diis-pwa-storage-cleanup');
  channel.postMessage({ type: 'DIIS_CLOSE_OWNED_DATABASES', names });
  channel.close();
}

function deleteDatabase(
  factory: IndexedDbLike,
  name: string,
  timeoutMs: number,
): Promise<IndexedDbDeletionStatus> {
  return new Promise((resolve) => {
    let settled = false;
    let blocked = false;
    const finish = (status: IndexedDbDeletionStatus) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(status);
    };
    const timer = setTimeout(() => finish(blocked ? 'blocked' : 'timeout'), timeoutMs);
    try {
      const request = factory.deleteDatabase(name);
      request.onsuccess = () => finish('deleted');
      request.onerror = () => finish('error');
      request.onblocked = () => {
        blocked = true;
      };
    } catch {
      finish('error');
    }
  });
}

function ownedDatabaseNames(databases: Array<{ name?: string }>): string[] {
  return databases
    .map((database) => database.name)
    .filter((name): name is string => Boolean(name && isOwnedStorageKey(name)));
}

export async function purgeOwnedIndexedDatabases(
  factory?: IndexedDbLike,
  options: IndexedDbCleanupOptions = {},
): Promise<IndexedDbCleanupResult> {
  if (!factory) {
    return {
      complete: false,
      deleted: [],
      incomplete: [{ name: 'indexedDB', status: 'unavailable' }],
    };
  }
  const timeoutMs = options.attemptTimeoutMs ?? 250;
  const retryDelayMs = options.retryDelayMs ?? 50;
  const requestClosure = options.requestClosure ?? defaultClosureRequest;

  try {
    const enumerableNames = factory.databases ? ownedDatabaseNames(await factory.databases()) : [];
    const names = factory.databases ? enumerableNames : KNOWN_OWNED_INDEXED_DATABASES;
    if (names.length === 0) return { complete: true, deleted: [], incomplete: [] };

    await requestClosure(names);
    const firstPass = await Promise.all(
      names.map(async (name) => ({
        name,
        status: await deleteDatabase(factory, name, timeoutMs),
      })),
    );
    const retryNames = firstPass
      .filter(({ status }) => status !== 'deleted')
      .map(({ name }) => name);

    let results = firstPass;
    if (retryNames.length > 0) {
      await requestClosure(retryNames);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      const retries = new Map(
        await Promise.all(
          retryNames.map(
            async (name) => [name, await deleteDatabase(factory, name, timeoutMs)] as const,
          ),
        ),
      );
      results = firstPass.map((entry) =>
        retries.has(entry.name) ? { name: entry.name, status: retries.get(entry.name)! } : entry,
      );
    }

    const remaining = new Set(
      factory.databases ? ownedDatabaseNames(await factory.databases()) : [],
    );
    const deleted = results
      .filter(({ name, status }) => status === 'deleted' && !remaining.has(name))
      .map(({ name }) => name);
    const incomplete = results
      .filter(({ name, status }) => status !== 'deleted' || remaining.has(name))
      .map(({ name, status }) => ({
        name,
        status: remaining.has(name) && status === 'deleted' ? ('still-present' as const) : status,
      }));

    return { complete: incomplete.length === 0, deleted, incomplete };
  } catch {
    return { complete: false, deleted: [], incomplete: [{ name: 'enumeration', status: 'error' }] };
  }
}
