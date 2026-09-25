import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as vm from 'node:vm';
import manifest from '../app/manifest';
import {
  beginSharedDeviceLogout,
  cleanupSharedDeviceSession,
  DIIS_CACHE_PREFIX,
  FEDERATED_LOGOUT_URL,
} from '../lib/pwa-logout';
import { normalizeReleaseSummary, registerDiisServiceWorker } from '../lib/pwa-runtime';
import {
  completePwaOnboarding,
  isInstalledExperience,
  needsPwaOnboarding,
  purgeOwnedIndexedDatabases,
  purgeUserStorage,
  type IndexedDbLike,
  type StorageLike,
} from '../lib/pwa-preferences';
import {
  DIIS_PUSH_STATE_CACHE,
  DIIS_PUSH_STATE_URL,
  DIIS_PUSH_STATE_ACK,
  DIIS_PUSH_STATE_PROTOCOL_VERSION,
  claimPushReconciliationAttempt,
  applyPushReconciliationState,
  abortPushReconciliationAttempt,
  initializePushSubscription,
  reconcilePushSubscription,
  setPushDeliveryState,
  suppressPushSubscription,
} from '../lib/push';

const loadCommonJsModule = createRequire(__filename);
const DELIVERY_PROOF = 'a'.repeat(64);

function source(relativePath: string): string {
  return readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

type WorkerPolicy = {
  kind: 'navigation' | 'static';
  staticKind?: string;
};

interface WorkerTestApi {
  CACHE_NAME: string;
  DIIS_CACHE_PREFIX: string;
  PUSH_STATE_CACHE: string;
  PUSH_STATE_URL: string;
  PUSH_STATE_ACK: string;
  PUSH_STATE_PROTOCOL_VERSION: number;
  RELEASE_SUMMARY: {
    version: string;
    features: string[];
    fixes: string[];
  };
  OFFLINE_URL: string;
  PRECACHE_URLS: string[];
  classifyRequest(request: Record<string, unknown>): WorkerPolicy | null;
  isCacheableResponse(response: Response, staticKind: string): boolean;
  normalizeNotificationTarget(value: unknown): string;
  normalizePushPayload(value: unknown): { title: string; body: string; tag: string; url: string };
  normalizePushStateRecord(value: unknown): { state: string; attemptId: string | null };
  persistPushStateRecord(record: unknown): Promise<{ state: string; attemptId: string | null }>;
  readPushStateRecord(): Promise<{ state: string; attemptId: string | null }>;
  readPushDeliveryState(): Promise<string>;
  claimPushReconciliation(attemptId: string): Promise<{
    status: string;
    state: string;
    attemptId: string | null;
  }>;
  applyPushReconciliation(
    state: string,
    attemptId: string,
  ): Promise<{
    status: string;
    state: string;
    attemptId: string | null;
  }>;
  abortPushReconciliation(attemptId: string): Promise<{
    status: string;
    state: string;
    attemptId: string | null;
  }>;
  forcePushDeliveryState(state: string): Promise<{
    status: string;
    state: string;
    attemptId: string | null;
  }>;
}

type WorkerEvent = {
  data?: unknown;
  ports?: Array<{ postMessage(value: unknown): void }>;
  request?: Record<string, unknown>;
  waitUntil(promise: Promise<unknown>): void;
  respondWith?(promise: Promise<Response>): void;
};

type WorkerHandler = (event: WorkerEvent) => void;

function loadWorker() {
  const listeners = new Map<string, WorkerHandler>();
  const addAll = jest.fn().mockResolvedValue(undefined);
  const cacheEntries = new Map<string, Response>();
  const put = jest.fn(async (request: RequestInfo | URL, response: Response) => {
    cacheEntries.set(String(request), response.clone());
  });
  const stateMatch = jest.fn(async (request: RequestInfo | URL) =>
    cacheEntries.get(String(request))?.clone(),
  );
  const cacheDelete = jest.fn().mockResolvedValue(true);
  const claim = jest.fn().mockResolvedValue(undefined);
  const skipWaiting = jest.fn().mockResolvedValue(undefined);
  const match = jest.fn().mockResolvedValue(undefined);
  const cacheKeys = jest.fn().mockResolvedValue([]);
  const fetchMock = jest.fn(async (input: RequestInfo | URL) =>
    String(input) === '/api/backend/push/verify-delivery'
      ? new Response(JSON.stringify({ deliver: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      : new Response('asset', {
          status: 200,
          headers: { 'Content-Type': 'application/javascript' },
        }),
  );
  const sandboxSelf: Record<string, unknown> = {
    location: { origin: 'https://staging.smkdarussalamsubah.sch.id' },
    skipWaiting,
    addEventListener: (type: string, handler: WorkerHandler) => listeners.set(type, handler),
    clients: {
      claim,
      matchAll: jest.fn().mockResolvedValue([]),
      openWindow: jest.fn().mockResolvedValue(undefined),
    },
    registration: {
      showNotification: jest.fn().mockResolvedValue(undefined),
      pushManager: {
        getSubscription: jest
          .fn()
          .mockResolvedValue({ endpoint: 'https://fcm.googleapis.com/fcm/send/test' }),
      },
    },
  };
  const open = jest.fn().mockResolvedValue({ addAll, put, match: stateMatch });
  const sandbox: Record<string, unknown> = {
    self: sandboxSelf,
    caches: {
      open,
      keys: cacheKeys,
      delete: cacheDelete,
      match,
    },
    fetch: fetchMock,
    Headers,
    Response,
    URL,
    Promise,
    Object,
  };
  vm.runInNewContext(source('../public/sw.js'), sandbox, { filename: 'sw.js' });
  const api = sandboxSelf.__DIIS_SW_TEST__ as WorkerTestApi;

  function dispatchEvent(type: string, data: Omit<WorkerEvent, 'waitUntil'> = {}) {
    const waits: Promise<unknown>[] = [];
    const handler = listeners.get(type);
    if (!handler) throw new Error(`Missing ${type} handler`);
    handler({ ...data, waitUntil: (promise) => waits.push(Promise.resolve(promise)) });
    return Promise.all(waits);
  }

  async function waitEvent(type: string, data: Omit<WorkerEvent, 'waitUntil'> = {}) {
    await dispatchEvent(type, data);
  }

  async function fetchEvent(
    request: Record<string, unknown>,
  ): Promise<{ handled: boolean; response?: Response }> {
    const handler = listeners.get('fetch');
    if (!handler) throw new Error('Missing fetch handler');
    let responsePromise: Promise<Response> | undefined;
    handler({
      request,
      waitUntil: () => undefined,
      respondWith: (promise) => {
        responsePromise = Promise.resolve(promise);
      },
    });
    return {
      handled: Boolean(responsePromise),
      response: responsePromise ? await responsePromise : undefined,
    };
  }

  return {
    api,
    addAll,
    put,
    stateMatch,
    cacheDelete,
    cacheKeys,
    claim,
    skipWaiting,
    match,
    fetchMock,
    showNotification: (sandboxSelf.registration as { showNotification: jest.Mock })
      .showNotification,
    sandbox,
    dispatchEvent,
    waitEvent,
    fetchEvent,
  };
}

async function sendWorkerStateCommand(
  worker: ReturnType<typeof loadWorker>,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let acknowledgement: Record<string, unknown> | undefined;
  await worker.waitEvent('message', {
    data: { version: worker.api.PUSH_STATE_PROTOCOL_VERSION, ...data },
    ports: [
      {
        postMessage: (value: unknown) => {
          if (value && typeof value === 'object')
            acknowledgement = value as Record<string, unknown>;
        },
      },
    ],
  });
  if (!acknowledgement) throw new Error('Missing push-state acknowledgement');
  return acknowledgement;
}

function createWorkerReconciliation(
  worker: ReturnType<typeof loadWorker>,
  attemptIds: string[] = ['attempt-0000000001'],
) {
  let index = 0;
  return {
    setDeliveryState: async (state: 'signed-in' | 'signed-out') =>
      (
        await sendWorkerStateCommand(worker, {
          type: 'DIIS_SET_PUSH_DELIVERY_STATE',
          state,
        })
      ).status === 'applied',
    claimReconciliation: async (requestedAttemptId?: string) => {
      const attemptId =
        attemptIds[index] ?? requestedAttemptId ?? `attempt-${String(index + 1).padStart(10, '0')}`;
      index += 1;
      const acknowledgement = await sendWorkerStateCommand(worker, {
        type: 'DIIS_CLAIM_PUSH_RECONCILIATION',
        attemptId,
      });
      return acknowledgement.status === 'applied' ? attemptId : null;
    },
    applyReconciliationState: async (state: 'signed-in' | 'signed-out', attemptId: string) => {
      const acknowledgement = await sendWorkerStateCommand(worker, {
        type: 'DIIS_APPLY_PUSH_RECONCILIATION',
        state,
        attemptId,
      });
      return acknowledgement.status as 'applied' | 'stale' | 'failed';
    },
    abortReconciliation: async (attemptId: string) => {
      const acknowledgement = await sendWorkerStateCommand(worker, {
        type: 'DIIS_ABORT_PUSH_RECONCILIATION',
        attemptId,
      });
      return acknowledgement.status as 'applied' | 'stale' | 'failed';
    },
  };
}

describe('DIIS install identity and response policy', () => {
  it('exposes one stable canonical manifest without an orientation lock', () => {
    const value = manifest();
    const layout = source('app/layout.tsx');

    expect(value).toMatchObject({
      id: '/',
      name: 'DIIS',
      short_name: 'DIIS',
      scope: '/',
      start_url: '/dashboard',
      display: 'standalone',
    });
    expect(value.description).toContain('SMK Darussalam Subah');
    expect(value).not.toHaveProperty('orientation');
    expect(layout).toContain("manifest: '/manifest.webmanifest'");
    expect(existsSync(path.join(__dirname, '../../public/manifest.json'))).toBe(false);
  });

  it('declares deliberate service-worker, manifest, and offline freshness headers', async () => {
    const nextConfig = loadCommonJsModule('../../next.config.js') as {
      headers(): Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
    };
    const entries = await nextConfig.headers();
    const bySource = new Map(entries.map((entry) => [entry.source, entry.headers]));

    expect(bySource.get('/sw.js')).toEqual(
      expect.arrayContaining([
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ]),
    );
    expect(bySource.get('/manifest.webmanifest')).toContainEqual({
      key: 'Content-Type',
      value: 'application/manifest+json; charset=utf-8',
    });
    expect(bySource.has('/offline.html')).toBe(true);
  });

  it('keeps the offline shell static, PII-free, and truthful', () => {
    const offline = source('../public/offline.html');
    expect(offline).toContain('Perangkat sedang offline');
    expect(offline).toContain('tidak menyimpan data akun');
    expect(offline).not.toMatch(/@[a-z0-9.-]+|studentId|accessToken|nama siswa|nilai siswa/i);
  });

  it('treats only an installed experience as the private-device notification surface', () => {
    expect(isInstalledExperience({ displayModeStandalone: true, navigatorStandalone: false })).toBe(
      true,
    );
    expect(isInstalledExperience({ displayModeStandalone: false, navigatorStandalone: true })).toBe(
      true,
    );
    expect(
      isInstalledExperience({ displayModeStandalone: false, navigatorStandalone: false }),
    ).toBe(false);
  });

  it('keeps one origin subscription active when browser and installed clients share a registration', async () => {
    const unsubscribe = jest.fn().mockResolvedValue(true);
    const subscription = {
      endpoint: 'https://push.example.test/shared-capability',
      unsubscribe,
      toJSON: () => ({ keys: { p256dh: 'p256dh', auth: 'auth' } }),
    } as unknown as PushSubscription;
    const registration = {
      pushManager: { getSubscription: jest.fn().mockResolvedValue(subscription) },
    } as unknown as ServiceWorkerRegistration;
    const ensureRegistration = jest.fn().mockResolvedValue(registration);
    const registerOnServer = jest.fn().mockResolvedValue('bound');
    const claimReconciliation = jest.fn().mockResolvedValue('attempt-installed');
    const applyReconciliationState = jest.fn().mockResolvedValue('applied');

    const [browserState, installedState] = await Promise.all([
      initializePushSubscription({
        installed: false,
        supported: true,
        permission: 'granted',
        ensureRegistration,
        registerOnServer,
      }),
      initializePushSubscription({
        installed: true,
        supported: true,
        permission: 'granted',
        ensureRegistration,
        registerOnServer,
        claimReconciliation,
        applyReconciliationState,
      }),
    ]);

    expect(browserState).toBe('browser');
    expect(installedState).toBe('subscribed');
    expect(ensureRegistration).toHaveBeenCalledTimes(1);
    expect(registerOnServer).toHaveBeenCalledWith({
      endpoint: subscription.endpoint,
      keys: { p256dh: 'p256dh', auth: 'auth' },
    });
    expect(applyReconciliationState).toHaveBeenCalledWith('signed-in', 'attempt-installed');
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('keeps the local guard signed-out without revoking a shared capability when registration fails', async () => {
    const unsubscribe = jest.fn().mockResolvedValue(true);
    const subscription = {
      endpoint: 'https://push.example.test/stale-capability',
      unsubscribe,
      toJSON: () => ({ keys: { p256dh: 'old', auth: 'old' } }),
    } as unknown as PushSubscription;

    await expect(
      initializePushSubscription({
        installed: true,
        supported: true,
        permission: 'granted',
        ensureRegistration: async () =>
          ({
            pushManager: { getSubscription: async () => subscription },
          }) as unknown as ServiceWorkerRegistration,
        registerOnServer: async () => 'failed',
        claimReconciliation: async () => 'attempt-failed',
        applyReconciliationState: async () => 'applied',
      }),
    ).resolves.toBe('reconcile-failed');
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('fails closed on a superseded account response without unsubscribing the newer owner capability', async () => {
    const unsubscribe = jest.fn().mockResolvedValue(true);
    const applyReconciliationState = jest.fn().mockResolvedValue('applied');
    const subscription = {
      endpoint: 'https://push.example.test/new-owner-capability',
      unsubscribe,
      toJSON: () => ({ keys: { p256dh: 'new', auth: 'new' } }),
    } as unknown as PushSubscription;

    await expect(
      initializePushSubscription({
        installed: true,
        supported: true,
        permission: 'granted',
        ensureRegistration: async () =>
          ({
            pushManager: { getSubscription: async () => subscription },
          }) as unknown as ServiceWorkerRegistration,
        registerOnServer: async () => 'superseded',
        claimReconciliation: async () => 'attempt-superseded',
        applyReconciliationState,
      }),
    ).resolves.toBe('reconcile-failed');
    expect(applyReconciliationState).toHaveBeenCalledWith('signed-out', 'attempt-superseded');
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('aborts a superseded attempt without revoking the shared browser capability', async () => {
    const unsubscribe = jest.fn().mockResolvedValue(true);
    const subscription = {
      endpoint: 'https://push.example.test/ambiguous-capability',
      unsubscribe,
      toJSON: () => ({ keys: { p256dh: 'ambiguous', auth: 'ambiguous' } }),
    } as unknown as PushSubscription;

    await expect(
      initializePushSubscription({
        installed: true,
        supported: true,
        permission: 'granted',
        ensureRegistration: async () =>
          ({
            pushManager: { getSubscription: async () => subscription },
          }) as unknown as ServiceWorkerRegistration,
        registerOnServer: async () => 'superseded',
        claimReconciliation: async () => 'attempt-ambiguous',
        applyReconciliationState: async () => 'failed',
        abortReconciliation: async () => 'applied',
      }),
    ).resolves.toBe('reconcile-failed');
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('ignores a stale superseded response after a newer account binding succeeds', async () => {
    let resolveOld: ((value: 'superseded') => void) | undefined;
    let resolveNew: ((value: 'bound') => void) | undefined;
    const oldResult = new Promise<'superseded'>((resolve) => {
      resolveOld = resolve;
    });
    const newResult = new Promise<'bound'>((resolve) => {
      resolveNew = resolve;
    });
    const oldUnsubscribe = jest.fn().mockResolvedValue(true);
    const newUnsubscribe = jest.fn().mockResolvedValue(true);
    let currentAttempt = '';
    const claimReconciliation = jest
      .fn()
      .mockImplementationOnce(async () => {
        currentAttempt = 'attempt-old';
        return currentAttempt;
      })
      .mockImplementationOnce(async () => {
        currentAttempt = 'attempt-new';
        return currentAttempt;
      });
    const applyReconciliationState = jest.fn(
      async (_state: 'signed-in' | 'signed-out', attemptId: string) =>
        attemptId === currentAttempt ? ('applied' as const) : ('stale' as const),
    );
    const subscription = (endpoint: string, unsubscribe: jest.Mock) =>
      ({
        endpoint,
        unsubscribe,
        toJSON: () => ({ keys: { p256dh: 'key', auth: 'auth' } }),
      }) as unknown as PushSubscription;

    const oldAttempt = reconcilePushSubscription({
      subscription: subscription('https://push.example.test/old', oldUnsubscribe),
      registerOnServer: async () => oldResult,
      claimReconciliation,
      applyReconciliationState,
    });
    const newAttempt = reconcilePushSubscription({
      subscription: subscription('https://push.example.test/new', newUnsubscribe),
      registerOnServer: async () => newResult,
      claimReconciliation,
      applyReconciliationState,
    });

    resolveNew?.('bound');
    await expect(newAttempt).resolves.toBe('subscribed');
    resolveOld?.('superseded');
    await expect(oldAttempt).resolves.toBe('reconcile-failed');
    expect(applyReconciliationState).toHaveBeenCalledTimes(2);
    expect(applyReconciliationState).toHaveBeenNthCalledWith(1, 'signed-in', 'attempt-new');
    expect(applyReconciliationState).toHaveBeenNthCalledWith(2, 'signed-out', 'attempt-old');
    expect(oldUnsubscribe).not.toHaveBeenCalled();
    expect(newUnsubscribe).not.toHaveBeenCalled();
  });

  it('reports manual notification suppression as failed only when server and browser both fail', async () => {
    const subscription = {
      endpoint: 'https://push.example.test/manual-disable',
      unsubscribe: jest.fn().mockResolvedValue(false),
    } as unknown as PushSubscription;
    const unregisterOnServer = jest.fn().mockResolvedValue(false);

    const setDeliveryState = jest.fn().mockResolvedValue(false);
    await expect(
      suppressPushSubscription(subscription, unregisterOnServer, setDeliveryState),
    ).resolves.toBe(false);
    subscription.unsubscribe = jest.fn().mockResolvedValue(true);
    await expect(
      suppressPushSubscription(subscription, unregisterOnServer, setDeliveryState),
    ).resolves.toBe(true);
  });

  it('treats a missing registration as safely signed-out but never as signed-in', async () => {
    await expect(
      setPushDeliveryState('signed-out', {
        getRegistration: async () => undefined,
      }),
    ).resolves.toBe(true);

    await expect(
      setPushDeliveryState('signed-in', {
        getRegistration: async () => undefined,
      }),
    ).resolves.toBe(false);
  });

  it('requires an active-worker acknowledgement before accepting signed-out suppression', async () => {
    type FakePort = {
      onmessage: ((event: MessageEvent<unknown>) => void) | null;
      onmessageerror: (() => void) | null;
      start: jest.Mock;
      close: jest.Mock;
    };
    let clientPort: FakePort | undefined;
    const createMessageChannel = () => {
      clientPort = {
        onmessage: null,
        onmessageerror: null,
        start: jest.fn(),
        close: jest.fn(),
      };
      return {
        port1: clientPort,
        port2: { close: jest.fn() },
      } as unknown as MessageChannel;
    };
    const postMessage = jest.fn((message: unknown) => {
      clientPort?.onmessage?.({
        data: {
          type: DIIS_PUSH_STATE_ACK,
          version: DIIS_PUSH_STATE_PROTOCOL_VERSION,
          action: 'force',
          state: (message as { state: string }).state,
          attemptId: null,
          status: 'applied',
        },
      } as MessageEvent<unknown>);
    });
    const unregister = jest.fn().mockResolvedValue(false);

    await expect(
      setPushDeliveryState('signed-out', {
        getRegistration: async () =>
          ({
            active: { postMessage } as unknown as ServiceWorker,
            pushManager: { getSubscription: jest.fn() },
            unregister,
          }) as unknown as ServiceWorkerRegistration,
        createMessageChannel,
        acknowledgementTimeoutMs: 10,
      }),
    ).resolves.toBe(true);
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'DIIS_SET_PUSH_DELIVERY_STATE',
        action: 'force',
        version: DIIS_PUSH_STATE_PROTOCOL_VERSION,
        state: 'signed-out',
      },
      expect.any(Array),
    );
    expect(unregister).not.toHaveBeenCalled();
    await expect(
      setPushDeliveryState('signed-in', {
        getRegistration: async () =>
          ({ active: { postMessage } }) as unknown as ServiceWorkerRegistration,
      }),
    ).resolves.toBe(false);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it('unregisters a legacy active worker that cannot acknowledge signed-out suppression', async () => {
    let registered = true;
    const legacyShowNotification = jest.fn();
    const unregister = jest.fn().mockImplementation(async () => {
      registered = false;
      return true;
    });
    const unsubscribe = jest.fn().mockResolvedValue(false);
    const postMessage = jest.fn();

    await expect(
      setPushDeliveryState('signed-out', {
        getRegistration: async () =>
          ({
            active: { postMessage } as unknown as ServiceWorker,
            pushManager: { getSubscription: async () => ({ unsubscribe }) },
            unregister,
          }) as unknown as ServiceWorkerRegistration,
        createMessageChannel: () =>
          ({
            port1: {
              onmessage: null,
              onmessageerror: null,
              start: jest.fn(),
              close: jest.fn(),
            },
            port2: { close: jest.fn() },
          }) as unknown as MessageChannel,
        acknowledgementTimeoutMs: 5,
      }),
    ).resolves.toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(unregister).toHaveBeenCalledTimes(1);
    if (registered) legacyShowNotification();
    expect(legacyShowNotification).not.toHaveBeenCalled();
  });

  it('does not trust a cached signed-out marker when registration lookup fails', async () => {
    await expect(
      setPushDeliveryState('signed-out', {
        getRegistration: async () => {
          throw new Error('registration lookup failed');
        },
      }),
    ).resolves.toBe(false);
  });
});

describe('DIIS service-worker behavior', () => {
  it('pre-caches only the exact public shell and waits for an explicit update gesture', async () => {
    const worker = loadWorker();
    await worker.waitEvent('install');

    expect(worker.addAll).toHaveBeenCalledWith(worker.api.PRECACHE_URLS);
    expect(worker.api.PRECACHE_URLS).toEqual([
      '/offline.html',
      '/manifest.webmanifest',
      '/icon-192.png',
      '/icon-512.png',
      '/apple-touch-icon.png',
    ]);
    expect(worker.skipWaiting).not.toHaveBeenCalled();

    await worker.waitEvent('message', { data: { type: 'DIIS_SKIP_WAITING' } });
    expect(worker.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('returns bounded release notes from the exact waiting worker byte', async () => {
    const worker = loadWorker();
    const postMessage = jest.fn();
    await worker.waitEvent('message', {
      data: { type: 'DIIS_GET_RELEASE_SUMMARY' },
      ports: [{ postMessage }],
    });

    expect(postMessage).toHaveBeenCalledWith(worker.api.RELEASE_SUMMARY);
    expect(normalizeReleaseSummary(worker.api.RELEASE_SUMMARY)).toMatchObject({
      version: 'DIIS PWA 1.0',
      requiresLogin: false,
    });
    expect(
      normalizeReleaseSummary({
        ...worker.api.RELEASE_SUMMARY,
        features: ['x'.repeat(121)],
      }),
    ).toBeNull();
  });

  it('deletes only obsolete DIIS caches during activation', async () => {
    const worker = loadWorker();
    worker.cacheKeys.mockResolvedValue([
      worker.api.CACHE_NAME,
      worker.api.PUSH_STATE_CACHE,
      `${worker.api.DIIS_CACHE_PREFIX}v2-static`,
      'other-product-cache',
    ]);
    await worker.waitEvent('activate');

    expect(worker.cacheDelete).toHaveBeenCalledTimes(1);
    expect(worker.cacheDelete).toHaveBeenCalledWith(`${worker.api.DIIS_CACHE_PREFIX}v2-static`);
    expect(worker.cacheDelete).not.toHaveBeenCalledWith('other-product-cache');
    expect(worker.cacheDelete).not.toHaveBeenCalledWith(worker.api.PUSH_STATE_CACHE);
    expect(worker.claim).toHaveBeenCalledTimes(1);
  });

  it('suppresses push by default and after logout, then enables it only after reconciliation', async () => {
    const worker = loadWorker();
    const push = () =>
      worker.waitEvent('push', {
        data: {
          json: () => ({
            title: 'Pembaruan',
            body: 'Ada pembaruan.',
            deliveryProof: DELIVERY_PROOF,
          }),
        },
      });

    await push();
    expect(worker.showNotification).not.toHaveBeenCalled();

    const protocol = createWorkerReconciliation(worker);
    await expect(protocol.setDeliveryState('signed-in')).resolves.toBe(false);
    await push();
    expect(worker.showNotification).not.toHaveBeenCalled();
    const attemptId = await protocol.claimReconciliation();
    expect(attemptId).not.toBeNull();
    await expect(protocol.applyReconciliationState('signed-in', attemptId!)).resolves.toBe(
      'applied',
    );
    await push();
    expect(worker.showNotification).toHaveBeenCalledTimes(1);

    await worker.waitEvent('message', {
      data: {
        type: 'DIIS_SET_PUSH_DELIVERY_STATE',
        version: worker.api.PUSH_STATE_PROTOCOL_VERSION,
        state: 'signed-out',
      },
    });
    await push();
    expect(worker.showNotification).toHaveBeenCalledTimes(1);
  });

  it('does not trust a signed-in cache record from the legacy worker protocol', async () => {
    const worker = loadWorker();
    await worker.put(DIIS_PUSH_STATE_URL, new Response('signed-in'));
    await expect(worker.api.readPushDeliveryState()).resolves.toBe('signed-out');
    await worker.waitEvent('push', {
      data: { json: () => ({ title: 'Legacy owner update', deliveryProof: DELIVERY_PROOF }) },
    });
    expect(worker.showNotification).not.toHaveBeenCalled();
  });

  it('suppresses an old owner push after the active account receives an equal-generation collision', async () => {
    const worker = loadWorker();
    const protocol = createWorkerReconciliation(worker, ['attempt-collision-0001']);
    const subscription = {
      endpoint: 'https://push.example.test/equal-generation-collision',
      unsubscribe: jest.fn().mockResolvedValue(true),
      toJSON: () => ({ keys: { p256dh: 'current', auth: 'current' } }),
    } as unknown as PushSubscription;
    const push = () =>
      worker.waitEvent('push', {
        data: {
          json: () => ({
            title: 'Private update',
            body: 'Old owner payload',
            deliveryProof: DELIVERY_PROOF,
          }),
        },
      });

    const firstAttempt = await protocol.claimReconciliation();
    await expect(protocol.applyReconciliationState('signed-in', firstAttempt!)).resolves.toBe(
      'applied',
    );
    await push();
    expect(worker.showNotification).toHaveBeenCalledTimes(1);

    await expect(
      reconcilePushSubscription({
        subscription,
        registerOnServer: async () => 'superseded',
        claimReconciliation: protocol.claimReconciliation,
        applyReconciliationState: protocol.applyReconciliationState,
      }),
    ).resolves.toBe('reconcile-failed');
    await push();
    expect(worker.showNotification).toHaveBeenCalledTimes(1);
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it('blocks the old owner payload when the new account claim and abort both fail', async () => {
    const worker = loadWorker();
    const oldAttemptId = 'attempt-old-account-0001';
    await sendWorkerStateCommand(worker, {
      type: 'DIIS_CLAIM_PUSH_RECONCILIATION',
      attemptId: oldAttemptId,
    });
    await sendWorkerStateCommand(worker, {
      type: 'DIIS_APPLY_PUSH_RECONCILIATION',
      state: 'signed-in',
      attemptId: oldAttemptId,
    });
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      unsubscribe: jest.fn().mockResolvedValue(true),
      toJSON: () => ({ keys: { p256dh: 'key', auth: 'auth' } }),
    } as unknown as PushSubscription;
    const registerOnServer = jest.fn();
    await expect(
      reconcilePushSubscription({
        subscription,
        registerOnServer,
        claimReconciliation: async () => null,
        abortReconciliation: async () => 'failed',
      }),
    ).resolves.toBe('reconcile-failed');
    expect(registerOnServer).not.toHaveBeenCalled();
    await expect(worker.api.readPushStateRecord()).resolves.toEqual({
      state: 'signed-in',
      attemptId: oldAttemptId,
    });

    worker.fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ deliver: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await worker.waitEvent('push', {
      data: { json: () => ({ title: 'Private A', deliveryProof: DELIVERY_PROOF }) },
    });
    expect(worker.showNotification).not.toHaveBeenCalled();
    expect(worker.fetchMock).toHaveBeenCalledWith(
      '/api/backend/push/verify-delivery',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        body: JSON.stringify({ endpoint: subscription.endpoint, proof: DELIVERY_PROOF }),
      }),
    );
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it('suppresses push when identity verification is missing or unavailable', async () => {
    const worker = loadWorker();
    const protocol = createWorkerReconciliation(worker);
    const attemptId = await protocol.claimReconciliation();
    await protocol.applyReconciliationState('signed-in', attemptId!);
    await worker.waitEvent('push', { data: { json: () => ({ title: 'No proof' }) } });
    worker.fetchMock.mockRejectedValueOnce(new Error('offline'));
    await worker.waitEvent('push', {
      data: { json: () => ({ title: 'Network failed', deliveryProof: DELIVERY_PROOF }) },
    });
    worker.fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ deliver: false }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await worker.waitEvent('push', {
      data: { json: () => ({ title: 'Session denied', deliveryProof: DELIVERY_PROOF }) },
    });
    expect(worker.showNotification).not.toHaveBeenCalled();
    expect(worker.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('serializes a delayed signed-in write before a newer signed-out claim', async () => {
    const worker = loadWorker();
    const attemptA = 'attempt-window-a-0001';
    const attemptB = 'attempt-window-b-0001';
    await sendWorkerStateCommand(worker, {
      type: 'DIIS_CLAIM_PUSH_RECONCILIATION',
      attemptId: attemptA,
    });

    const originalPut = worker.put.getMockImplementation();
    if (!originalPut) throw new Error('Missing cache put implementation');
    let releaseSignedIn: (() => void) | undefined;
    let markSignedInStarted: (() => void) | undefined;
    const signedInStarted = new Promise<void>((resolve) => {
      markSignedInStarted = resolve;
    });
    const signedInGate = new Promise<void>((resolve) => {
      releaseSignedIn = resolve;
    });
    worker.put.mockImplementation(async (request: RequestInfo | URL, response: Response) => {
      const body = await response.clone().text();
      if (body.includes('"state":"signed-in"')) {
        markSignedInStarted?.();
        await signedInGate;
      }
      return originalPut(request, response);
    });

    const applyA = worker.dispatchEvent('message', {
      data: {
        type: 'DIIS_APPLY_PUSH_RECONCILIATION',
        version: worker.api.PUSH_STATE_PROTOCOL_VERSION,
        state: 'signed-in',
        attemptId: attemptA,
      },
      ports: [{ postMessage: jest.fn() }],
    });
    await signedInStarted;

    const claimBAck = jest.fn();
    const claimB = worker.dispatchEvent('message', {
      data: {
        type: 'DIIS_CLAIM_PUSH_RECONCILIATION',
        version: worker.api.PUSH_STATE_PROTOCOL_VERSION,
        attemptId: attemptB,
      },
      ports: [{ postMessage: claimBAck }],
    });
    await Promise.resolve();
    expect(claimBAck).not.toHaveBeenCalled();
    const pushAfterClaimB = worker.dispatchEvent('push', {
      data: {
        json: () => ({
          title: 'Old owner update',
          body: 'Private payload',
          deliveryProof: DELIVERY_PROOF,
        }),
      },
    });

    releaseSignedIn?.();
    await Promise.all([applyA, claimB, pushAfterClaimB]);
    await expect(worker.api.readPushStateRecord()).resolves.toEqual({
      state: 'signed-out',
      attemptId: attemptB,
    });
    expect(claimBAck).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claim',
        status: 'applied',
        state: 'signed-out',
        attemptId: attemptB,
      }),
    );
    expect(worker.showNotification).not.toHaveBeenCalled();
  });

  it('coordinates two windows in the worker when localStorage is unavailable', async () => {
    const worker = loadWorker();
    const windowA = createWorkerReconciliation(worker, ['attempt-window-a-0002']);
    const windowB = createWorkerReconciliation(worker, ['attempt-window-b-0002']);
    const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('storage denied');
      },
    });
    try {
      const attemptA = await windowA.claimReconciliation();
      const attemptB = await windowB.claimReconciliation();
      expect(attemptA).toBe('attempt-window-a-0002');
      expect(attemptB).toBe('attempt-window-b-0002');
      await expect(windowB.applyReconciliationState('signed-out', attemptB!)).resolves.toBe(
        'applied',
      );
      await expect(windowA.applyReconciliationState('signed-in', attemptA!)).resolves.toBe('stale');
      await expect(worker.api.readPushStateRecord()).resolves.toEqual({
        state: 'signed-out',
        attemptId: attemptB,
      });
      expect(source('lib/push.ts')).not.toContain('localStorage');
    } finally {
      if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('does not report an old bound response as subscribed after another window collides', async () => {
    const worker = loadWorker();
    const windowA = createWorkerReconciliation(worker, ['attempt-window-a-0003']);
    const windowB = createWorkerReconciliation(worker, ['attempt-window-b-0003']);
    let releaseOld: ((result: 'bound') => void) | undefined;
    let signalOldServer: (() => void) | undefined;
    const oldServerEntered = new Promise<void>((resolve) => {
      signalOldServer = resolve;
    });
    const oldServerResult = new Promise<'bound'>((resolve) => {
      releaseOld = resolve;
    });
    const makeSubscription = (endpoint: string) =>
      ({
        endpoint,
        unsubscribe: jest.fn().mockResolvedValue(true),
        toJSON: () => ({ keys: { p256dh: 'key', auth: 'auth' } }),
      }) as unknown as PushSubscription;
    const oldSubscription = makeSubscription('https://push.example.test/window-a');
    const newSubscription = makeSubscription('https://push.example.test/window-b');

    const oldAttempt = reconcilePushSubscription({
      subscription: oldSubscription,
      registerOnServer: () => {
        signalOldServer?.();
        return oldServerResult;
      },
      ...windowA,
    });
    await oldServerEntered;
    const newAttempt = reconcilePushSubscription({
      subscription: newSubscription,
      registerOnServer: async () => 'superseded',
      ...windowB,
    });
    await expect(newAttempt).resolves.toBe('reconcile-failed');
    releaseOld?.('bound');
    await expect(oldAttempt).resolves.toBe('reconcile-failed');
    await expect(worker.api.readPushStateRecord()).resolves.toEqual({
      state: 'signed-out',
      attemptId: 'attempt-window-b-0003',
    });
    expect(oldSubscription.unsubscribe).not.toHaveBeenCalled();
    expect(newSubscription.unsubscribe).not.toHaveBeenCalled();
  });

  it('does not let a lost claim acknowledgement suppress a newer account', async () => {
    const worker = loadWorker();
    const newer = createWorkerReconciliation(worker, ['attempt-new-owner-0001']);
    const unsubscribe = jest.fn().mockResolvedValue(true);
    const subscription = {
      endpoint: 'https://push.example.test/shared-claim',
      unsubscribe,
      toJSON: () => ({ keys: { p256dh: 'key', auth: 'auth' } }),
    } as unknown as PushSubscription;
    let claimWritten: (() => void) | undefined;
    let releaseOld: (() => void) | undefined;
    const written = new Promise<void>((resolve) => {
      claimWritten = resolve;
    });
    const delayedAck = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });

    const old = reconcilePushSubscription({
      subscription,
      registerOnServer: async () => 'bound',
      claimReconciliation: async (attemptId) => {
        await sendWorkerStateCommand(worker, { type: 'DIIS_CLAIM_PUSH_RECONCILIATION', attemptId });
        claimWritten?.();
        await delayedAck;
        return null;
      },
      abortReconciliation: newer.abortReconciliation,
    });
    await written;
    await expect(
      reconcilePushSubscription({
        subscription,
        registerOnServer: async () => 'bound',
        ...newer,
      }),
    ).resolves.toBe('subscribed');
    releaseOld?.();
    await expect(old).resolves.toBe('reconcile-failed');
    await expect(worker.api.readPushStateRecord()).resolves.toEqual({
      state: 'signed-in',
      attemptId: 'attempt-new-owner-0001',
    });
    expect(unsubscribe).not.toHaveBeenCalled();
    await worker.waitEvent('push', {
      data: { json: () => ({ title: 'New owner update', deliveryProof: DELIVERY_PROOF }) },
    });
    expect(worker.showNotification).toHaveBeenCalledTimes(1);
  });

  it('does not let a lost apply acknowledgement unsubscribe or suppress a newer account', async () => {
    const worker = loadWorker();
    const older = createWorkerReconciliation(worker, ['attempt-old-owner-0002']);
    const newer = createWorkerReconciliation(worker, ['attempt-new-owner-0002']);
    const unsubscribe = jest.fn().mockResolvedValue(true);
    const subscription = {
      endpoint: 'https://push.example.test/shared-apply',
      unsubscribe,
      toJSON: () => ({ keys: { p256dh: 'key', auth: 'auth' } }),
    } as unknown as PushSubscription;
    let applyWritten: (() => void) | undefined;
    let releaseOld: (() => void) | undefined;
    const written = new Promise<void>((resolve) => {
      applyWritten = resolve;
    });
    const delayedAck = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });

    const old = reconcilePushSubscription({
      subscription,
      registerOnServer: async () => 'bound',
      ...older,
      applyReconciliationState: async (state, attemptId) => {
        await sendWorkerStateCommand(worker, {
          type: 'DIIS_APPLY_PUSH_RECONCILIATION',
          state,
          attemptId,
        });
        applyWritten?.();
        await delayedAck;
        return 'failed';
      },
    });
    await written;
    await expect(
      reconcilePushSubscription({
        subscription,
        registerOnServer: async () => 'bound',
        ...newer,
      }),
    ).resolves.toBe('subscribed');
    releaseOld?.();
    await expect(old).resolves.toBe('reconcile-failed');
    await expect(worker.api.readPushStateRecord()).resolves.toEqual({
      state: 'signed-in',
      attemptId: 'attempt-new-owner-0002',
    });
    expect(unsubscribe).not.toHaveBeenCalled();
    await worker.waitEvent('push', {
      data: { json: () => ({ title: 'New owner update', deliveryProof: DELIVERY_PROOF }) },
    });
    expect(worker.showNotification).toHaveBeenCalledTimes(1);
  });

  it('keeps push signed-out when the current claim or apply acknowledgement is lost', async () => {
    for (const lostAction of ['claim', 'apply'] as const) {
      const worker = loadWorker();
      const protocol = createWorkerReconciliation(worker, [`attempt-current-${lostAction}-0001`]);
      const unsubscribe = jest.fn().mockResolvedValue(true);
      const subscription = {
        endpoint: 'https://push.example.test/current',
        unsubscribe,
        toJSON: () => ({ keys: { p256dh: 'key', auth: 'auth' } }),
      } as unknown as PushSubscription;
      await expect(
        reconcilePushSubscription({
          subscription,
          registerOnServer: async () => 'bound',
          ...protocol,
          claimReconciliation:
            lostAction === 'claim'
              ? async (attemptId) => {
                  await sendWorkerStateCommand(worker, {
                    type: 'DIIS_CLAIM_PUSH_RECONCILIATION',
                    attemptId,
                  });
                  return null;
                }
              : protocol.claimReconciliation,
          applyReconciliationState:
            lostAction === 'apply'
              ? async (state, attemptId) => {
                  await sendWorkerStateCommand(worker, {
                    type: 'DIIS_APPLY_PUSH_RECONCILIATION',
                    state,
                    attemptId,
                  });
                  return 'failed' as const;
                }
              : protocol.applyReconciliationState,
        }),
      ).resolves.toBe('reconcile-failed');
      await expect(worker.api.readPushDeliveryState()).resolves.toBe('signed-out');
      expect(unsubscribe).not.toHaveBeenCalled();
      await worker.waitEvent('push', {
        data: { json: () => ({ title: 'Private update', deliveryProof: DELIVERY_PROOF }) },
      });
      expect(worker.showNotification).not.toHaveBeenCalled();
    }
  });

  it('returns a stale acknowledgement to the browser without suppressing the newer owner', async () => {
    const worker = loadWorker();
    const active = {
      postMessage(message: unknown, ports: MessagePort[]) {
        void worker.dispatchEvent('message', {
          data: message,
          ports: ports as unknown as Array<{ postMessage(value: unknown): void }>,
        });
      },
    } as unknown as ServiceWorker;
    const registration = { active } as ServiceWorkerRegistration;
    const dependencies = {
      getRegistration: async () => registration,
      createMessageChannel: () => {
        const port1 = {
          onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
          onmessageerror: null,
          start: jest.fn(),
          close: jest.fn(),
        };
        const port2 = {
          postMessage(value: unknown) {
            port1.onmessage?.({ data: value } as MessageEvent<unknown>);
          },
          close: jest.fn(),
        };
        return { port1, port2 } as unknown as MessageChannel;
      },
      acknowledgementTimeoutMs: 50,
    };

    const older = await claimPushReconciliationAttempt(dependencies);
    const newer = await claimPushReconciliationAttempt(dependencies);
    expect(older).not.toBeNull();
    expect(newer).not.toBeNull();
    expect(older).not.toBe(newer);
    await expect(applyPushReconciliationState('signed-out', newer!, dependencies)).resolves.toBe(
      'applied',
    );
    await expect(applyPushReconciliationState('signed-in', older!, dependencies)).resolves.toBe(
      'stale',
    );
    await expect(abortPushReconciliationAttempt(older!, dependencies)).resolves.toBe('stale');
    await expect(worker.api.readPushStateRecord()).resolves.toEqual({
      state: 'signed-out',
      attemptId: newer,
    });
  });

  it('invalidates an in-flight reconciliation when logout forces signed-out', async () => {
    const worker = loadWorker();
    const attemptId = 'attempt-before-logout-0001';
    await sendWorkerStateCommand(worker, {
      type: 'DIIS_CLAIM_PUSH_RECONCILIATION',
      attemptId,
    });
    await expect(
      sendWorkerStateCommand(worker, {
        type: 'DIIS_SET_PUSH_DELIVERY_STATE',
        state: 'signed-out',
      }),
    ).resolves.toMatchObject({ status: 'applied', attemptId: null });
    await expect(
      sendWorkerStateCommand(worker, {
        type: 'DIIS_APPLY_PUSH_RECONCILIATION',
        state: 'signed-in',
        attemptId,
      }),
    ).resolves.toMatchObject({ status: 'stale', state: 'signed-in', attemptId });
    await expect(worker.api.readPushStateRecord()).resolves.toEqual({
      state: 'signed-out',
      attemptId: null,
    });
  });

  it('allows only exact mandatory assets and hashed static files into cache handling', () => {
    const worker = loadWorker();
    const request = (url: string, destination = '', extra: Record<string, unknown> = {}) => ({
      method: 'GET',
      url,
      destination,
      mode: 'cors',
      headers: new Headers(),
      ...extra,
    });
    const origin = 'https://staging.smkdarussalamsubah.sch.id';

    expect(
      worker.api.classifyRequest(request(`${origin}/manifest.webmanifest`, 'manifest'))?.kind,
    ).toBe('static');
    expect(
      worker.api.classifyRequest(
        request(`${origin}/_next/static/chunks/app/page-a1b2c3d4.js`, 'script'),
      )?.kind,
    ).toBe('static');
    expect(worker.api.classifyRequest(request(`${origin}/api/v1/students`))).toBeNull();
    expect(
      worker.api.classifyRequest(
        request(`${origin}/dashboard?_rsc=secret`, '', { mode: 'navigate' }),
      ),
    ).toBeNull();
    expect(
      worker.api.classifyRequest(request(`${origin}/login`, 'document', { mode: 'navigate' })),
    ).toBeNull();
    expect(
      worker.api.classifyRequest(request(`${origin}/dashboard`, 'document', { mode: 'navigate' }))
        ?.kind,
    ).toBe('navigation');
    expect(
      worker.api.classifyRequest(
        request('https://evil.example/_next/static/chunks/a-a1b2c3d4.js', 'script'),
      ),
    ).toBeNull();
    expect(
      worker.api.classifyRequest({ ...request(`${origin}/icon-192.png`, 'image'), method: 'POST' }),
    ).toBeNull();
  });

  it('validates response status and content type before writing a static response', () => {
    const worker = loadWorker();
    expect(
      worker.api.isCacheableResponse(
        new Response('ok', {
          status: 200,
          headers: { 'Content-Type': 'application/javascript' },
        }),
        'script',
      ),
    ).toBe(true);
    expect(
      worker.api.isCacheableResponse(
        new Response('html', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
        'script',
      ),
    ).toBe(false);
    expect(worker.api.isCacheableResponse(new Response('bad', { status: 404 }), 'mandatory')).toBe(
      false,
    );
  });

  it('never caches navigation HTML and falls back to the PII-free shell when offline', async () => {
    const worker = loadWorker();
    worker.fetchMock.mockRejectedValueOnce(new Error('offline'));
    worker.match.mockResolvedValueOnce(
      new Response('offline shell', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const result = await worker.fetchEvent({
      method: 'GET',
      url: 'https://staging.smkdarussalamsubah.sch.id/dashboard',
      mode: 'navigate',
      destination: 'document',
      headers: new Headers(),
    });

    expect(result.handled).toBe(true);
    expect(await result.response?.text()).toBe('offline shell');
    expect(worker.put).not.toHaveBeenCalled();
  });

  it.each([
    '//evil.example/steal',
    'https://evil.example/dashboard',
    '/dashboard/../api',
    '/dashboard/%2e%2e/api',
    '/dashboard/%252e%252e/api',
    '/dashboard/%2fapi',
    '/api/backend/users',
    '/api/auth/callback',
    '/dashboard/users',
    '/dashboard/rapor?studentId=not-a-uuid',
    '/dashboard/rapor?studentId=11111111-1111-4111-8111-111111111111&next=/api',
  ])('fails closed for notification target %s', (target) => {
    const worker = loadWorker();
    expect(worker.api.normalizeNotificationTarget(target)).toBe('/dashboard');
  });

  it('normalizes only the producer-backed academic and report targets', () => {
    const worker = loadWorker();
    const studentId = '11111111-1111-4111-8111-111111111111';
    expect(worker.api.normalizeNotificationTarget('/dashboard/akademik')).toBe(
      '/dashboard/akademik',
    );
    expect(worker.api.normalizeNotificationTarget(`/dashboard/rapor?studentId=${studentId}`)).toBe(
      `/dashboard/rapor?studentId=${studentId}`,
    );
  });

  it('bounds and sanitizes malformed notification fields without executing payload content', () => {
    const worker = loadWorker();
    const result = worker.api.normalizePushPayload({
      title: `Judul\u0000${'x'.repeat(100)}`,
      body: 'Isi\n'.repeat(200),
      tag: 'invalid tag with spaces',
      url: 'javascript:alert(1)',
    });
    expect(result.title).toHaveLength(80);
    expect(result.body.length).toBeLessThanOrEqual(240);
    expect(result.tag).toBe('diis-notification');
    expect(result.url).toBe('/dashboard');
  });
});

describe('global registration and shared-device logout', () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  afterEach(() => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  });

  function memoryStorage(entries: Record<string, string>): StorageLike {
    const values = new Map(Object.entries(entries));
    return {
      get length() {
        return values.size;
      },
      key: (index) => [...values.keys()][index] ?? null,
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
  }

  function databaseRequest(outcome: 'success' | 'blocked' | 'error' | 'timeout'): IDBOpenDBRequest {
    const request = {} as IDBOpenDBRequest;
    queueMicrotask(() => {
      if (outcome === 'success') request.onsuccess?.(new Event('success'));
      if (outcome === 'blocked') request.onblocked?.(new Event('blocked') as IDBVersionChangeEvent);
      if (outcome === 'error') request.onerror?.(new Event('error'));
    });
    return request;
  }

  it('degrades gracefully when service-worker registration fails', async () => {
    const register = jest.fn().mockRejectedValue(new Error('unsupported'));
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { serviceWorker: { register } },
    });

    await expect(registerDiisServiceWorker()).resolves.toBeNull();
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' });
  });

  it('purges only DIIS caches and attempts server plus browser unsubscribe', async () => {
    const unsubscribe = jest.fn().mockResolvedValue(true);
    const fetcher = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const deleteCache = jest.fn().mockResolvedValue(true);
    const cacheStorage = {
      keys: jest
        .fn()
        .mockResolvedValue([
          `${DIIS_CACHE_PREFIX}v2`,
          `${DIIS_CACHE_PREFIX}v4-static`,
          DIIS_PUSH_STATE_CACHE,
          'unrelated-cache',
        ]),
      delete: deleteCache,
    } as Pick<CacheStorage, 'keys' | 'delete'>;
    const local = memoryStorage({
      'diis-ai-session-id': 'private-session',
      'diis-theme': 'dark',
      'diis-ortu-theme': 'light',
      'unrelated-product': 'keep',
    });
    const session = memoryStorage({
      'diis:spmb-2027-intake:idempotency-key': 'private-session-key',
      unrelated: 'keep',
    });

    const cleanup = await cleanupSharedDeviceSession({
      getRegistration: async () => ({
        pushManager: {
          getSubscription: async () => ({
            endpoint: 'https://push.example.test/capability',
            unsubscribe,
          }),
        },
      }),
      cacheStorage,
      localStorage: local,
      sessionStorage: session,
      fetcher: fetcher as typeof fetch,
      indexedDb: {
        databases: jest.fn().mockResolvedValue([]),
        deleteDatabase: jest.fn(),
      } as unknown as IndexedDbLike,
      timeoutMs: 100,
    });

    expect(deleteCache).toHaveBeenCalledWith(`${DIIS_CACHE_PREFIX}v2`);
    expect(deleteCache).not.toHaveBeenCalledWith(`${DIIS_CACHE_PREFIX}v4-static`);
    expect(deleteCache).not.toHaveBeenCalledWith(DIIS_PUSH_STATE_CACHE);
    expect(deleteCache).not.toHaveBeenCalledWith('unrelated-cache');
    expect(fetcher).toHaveBeenCalledWith(
      '/api/backend/push/unsubscribe',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(local.getItem('diis-ai-session-id')).toBeNull();
    expect(local.getItem('diis-theme')).toBe('dark');
    expect(local.getItem('diis-ortu-theme')).toBe('light');
    expect(local.getItem('unrelated-product')).toBe('keep');
    expect(session.getItem('diis:spmb-2027-intake:idempotency-key')).toBeNull();
    expect(session.getItem('unrelated')).toBe('keep');
    expect(cleanup).toMatchObject({ complete: true, timedOut: false });
  });

  it('deletes owned IndexedDB state only after a verified absence check', async () => {
    const databases = jest
      .fn()
      .mockResolvedValueOnce([{ name: 'diis-private-state' }, { name: 'other-product' }])
      .mockResolvedValueOnce([{ name: 'other-product' }]);
    const deleteDatabase = jest.fn(() => databaseRequest('success'));
    const requestClosure = jest.fn();

    await expect(
      purgeOwnedIndexedDatabases({ databases, deleteDatabase } as IndexedDbLike, {
        attemptTimeoutMs: 5,
        retryDelayMs: 0,
        requestClosure,
      }),
    ).resolves.toEqual({
      complete: true,
      deleted: ['diis-private-state'],
      incomplete: [],
    });
    expect(deleteDatabase).toHaveBeenCalledWith('diis-private-state');
    expect(deleteDatabase).not.toHaveBeenCalledWith('other-product');
    expect(requestClosure).toHaveBeenCalledWith(['diis-private-state']);
  });

  it('deletes the known assessment database when enumeration is unavailable', async () => {
    const deleteDatabase = jest.fn(() => databaseRequest('success'));
    const result = await purgeOwnedIndexedDatabases({ deleteDatabase } as IndexedDbLike, {
      attemptTimeoutMs: 5,
      retryDelayMs: 0,
      requestClosure: jest.fn(),
    });

    expect(result).toEqual({
      complete: true,
      deleted: ['diis-assessment-outbox-v1'],
      incomplete: [],
    });
    expect(deleteDatabase).toHaveBeenCalledWith('diis-assessment-outbox-v1');
  });

  it.each([
    ['blocked', 'blocked'],
    ['error', 'error'],
    ['timeout', 'timeout'],
  ] as const)(
    'reports %s IndexedDB deletion as incomplete after one bounded retry',
    async (outcome, status) => {
      const factory = {
        databases: jest.fn().mockResolvedValue([{ name: 'diis-private-state' }]),
        deleteDatabase: jest.fn(() => databaseRequest(outcome)),
      } as IndexedDbLike;
      const requestClosure = jest.fn();

      const result = await purgeOwnedIndexedDatabases(factory, {
        attemptTimeoutMs: 5,
        retryDelayMs: 0,
        requestClosure,
      });

      expect(result).toEqual({
        complete: false,
        deleted: [],
        incomplete: [{ name: 'diis-private-state', status }],
      });
      expect(factory.deleteDatabase).toHaveBeenCalledTimes(2);
      expect(requestClosure).toHaveBeenCalledTimes(2);
    },
  );

  it('does not claim success when a database remains after a successful delete event', async () => {
    const factory = {
      databases: jest.fn().mockResolvedValue([{ name: 'diis-private-state' }]),
      deleteDatabase: jest.fn(() => databaseRequest('success')),
    } as IndexedDbLike;

    await expect(
      purgeOwnedIndexedDatabases(factory, {
        attemptTimeoutMs: 5,
        retryDelayMs: 0,
        requestClosure: jest.fn(),
      }),
    ).resolves.toEqual({
      complete: false,
      deleted: [],
      incomplete: [{ name: 'diis-private-state', status: 'still-present' }],
    });
  });

  it('marks the logout cleanup incomplete when IndexedDB deletion is blocked', async () => {
    const result = await cleanupSharedDeviceSession({
      indexedDb: {
        databases: jest.fn().mockResolvedValue([{ name: 'diis-private-state' }]),
        deleteDatabase: jest.fn(() => databaseRequest('blocked')),
      } as IndexedDbLike,
      timeoutMs: 1000,
    });

    expect(result.complete).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.indexedDb.incomplete).toEqual([
      { name: 'diis-private-state', status: 'blocked' },
    ]);
  });

  it('does not claim logout cleanup success when cache, server, and browser suppression fail', async () => {
    const result = await cleanupSharedDeviceSession({
      getRegistration: async () => ({
        pushManager: {
          getSubscription: async () => ({
            endpoint: 'https://push.example.test/still-active',
            unsubscribe: async () => false,
          }),
        },
      }),
      cacheStorage: {
        keys: async () => [`${DIIS_CACHE_PREFIX}v2`],
        delete: async () => false,
      },
      fetcher: jest.fn().mockResolvedValue(new Response(null, { status: 500 })) as typeof fetch,
      timeoutMs: 100,
    });

    expect(result).toMatchObject({
      complete: false,
      timedOut: false,
      cacheComplete: false,
      push: {
        registrationRead: true,
        serverUnsubscribed: false,
        browserUnsubscribed: false,
      },
    });
  });

  it('persists generic onboarding state while purging user-scoped DIIS storage', () => {
    const local = memoryStorage({ 'diis-ai-session-id': 'private' });
    expect(needsPwaOnboarding(local)).toBe(true);
    completePwaOnboarding(local);
    expect(needsPwaOnboarding(local)).toBe(false);
    purgeUserStorage(local);
    expect(needsPwaOnboarding(local)).toBe(false);
    expect(local.getItem('diis-ai-session-id')).toBeNull();
  });

  it('navigates once only after private cleanup completes and coalesces concurrent attempts', async () => {
    const navigate = jest.fn();
    const cleanup = jest.fn().mockResolvedValue({
      complete: true,
      push: { registrationRead: true, serverUnsubscribed: null, browserUnsubscribed: null },
    });
    const suppressDelivery = jest.fn().mockResolvedValue(true);
    const first = beginSharedDeviceLogout(navigate, cleanup, suppressDelivery);
    const second = beginSharedDeviceLogout(navigate, cleanup, suppressDelivery);

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(suppressDelivery).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(FEDERATED_LOGOUT_URL);
  });

  it('blocks account transition when assessment cleanup fails even if push is suppressed', async () => {
    const navigate = jest.fn();
    const cleanup = jest.fn().mockResolvedValue({
      complete: false,
      push: { registrationRead: true, serverUnsubscribed: true, browserUnsubscribed: true },
      indexedDb: {
        complete: false,
        deleted: [],
        incomplete: [{ name: 'diis-assessment-outbox-v1', status: 'blocked' }],
      },
    });

    await expect(beginSharedDeviceLogout(navigate, cleanup, async () => true)).rejects.toThrow(
      'Data privat belum dapat dibersihkan untuk logout',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('blocks navigation when neither the signed-out guard nor cleanup suppresses push delivery', async () => {
    const navigate = jest.fn();
    const cleanup = jest.fn().mockResolvedValue({
      complete: false,
      push: { registrationRead: true, serverUnsubscribed: false, browserUnsubscribed: false },
    });
    const suppressDelivery = jest.fn().mockResolvedValue(false);

    await expect(beginSharedDeviceLogout(navigate, cleanup, suppressDelivery)).rejects.toThrow(
      'Data privat belum dapat dibersihkan untuk logout',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('routes every visible logout surface through the shared coordinator', () => {
    const surfaces = [
      source('components/layout/TopBar.tsx'),
      source('components/layout/Sidebar.tsx'),
      source('app/dashboard/akademik/_components/siswa/SiswaWorkspace.tsx'),
      source('app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx'),
    ];
    for (const surface of surfaces) {
      expect(surface).toContain('@/components/shared/LogoutButton');
      expect(surface).not.toContain("window.location.href = '/api/auth/federated-logout'");
    }
    const runtime = source('components/pwa/PwaRuntime.tsx');
    const welcome = source('components/pwa/PwaWelcome.tsx');
    const pushToggle = source('components/shared/PushNotificationToggle.tsx');
    expect(runtime).toContain('w-[calc(100%-1.5rem)]');
    expect(runtime).toContain('min-h-11');
    expect(runtime).toContain('focus-visible:ring-2');
    expect(runtime).toContain('requestWaitingWorkerReleaseSummary');
    expect(welcome).toContain('Lewati pengantar');
    expect(welcome).toContain('SMK Darussalam Subah');
    expect(welcome).toContain('prefers-reduced-motion: reduce');
    expect(pushToggle).toContain('installed: isInstalledExperience()');
    expect(pushToggle).toContain('initializePushSubscription');
    expect(pushToggle).toContain('Mode browser perangkat bersama');
  });
});
