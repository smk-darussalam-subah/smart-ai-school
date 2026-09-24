// =============================================================================
// push.ts — PWA Push Notification subscription helper (T3-03).
// Provides client-side functions for subscribing/unsubscribing to push
// notifications via the browser Push API + service worker.
// Backend endpoint: POST /push/subscribe, POST /push/unsubscribe.
// =============================================================================

import { registerDiisServiceWorker } from '@/lib/pwa-runtime';

/** VAPID public key from env (injected at build time). */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export const DIIS_PUSH_STATE_CACHE = 'diis-pwa-v1-push-state';
export const DIIS_PUSH_STATE_URL = '/__diis/push-delivery-state';
export const DIIS_PUSH_STATE_ACK = 'DIIS_PUSH_DELIVERY_STATE_ACK';
export const DIIS_PUSH_STATE_PROTOCOL_VERSION = 2;
export type PushDeliveryState = 'signed-in' | 'signed-out';
export type PushStateCommandResult = 'applied' | 'stale' | 'failed';

interface PushDeliveryStateDependencies {
  getRegistration?: () => Promise<ServiceWorkerRegistration | undefined>;
  createMessageChannel?: () => MessageChannel;
  acknowledgementTimeoutMs?: number;
}

const PUSH_STATE_ACK_TIMEOUT_MS = 750;

type PushStateCommand =
  | { type: 'DIIS_SET_PUSH_DELIVERY_STATE'; action: 'force'; state: 'signed-out' }
  | { type: 'DIIS_CLAIM_PUSH_RECONCILIATION'; action: 'claim'; state: 'signed-out'; attemptId: string }
  | { type: 'DIIS_APPLY_PUSH_RECONCILIATION'; action: 'apply'; state: PushDeliveryState; attemptId: string }
  | { type: 'DIIS_ABORT_PUSH_RECONCILIATION'; action: 'abort'; state: 'signed-out'; attemptId: string };

function createPushReconciliationId(): string | null {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  if (typeof globalThis.crypto?.getRandomValues !== 'function') return null;
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sendPushStateCommand(
  worker: ServiceWorker,
  command: PushStateCommand,
  createMessageChannel: () => MessageChannel,
  timeoutMs: number,
): Promise<PushStateCommandResult> {
  let channel: MessageChannel;
  try {
    channel = createMessageChannel();
  } catch {
    return 'failed';
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: PushStateCommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel.port1.close();
      channel.port2.close();
      resolve(value);
    };
    const timer = setTimeout(() => finish('failed'), timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const value = event.data;
      if (!value || typeof value !== 'object') return finish('failed');
      const acknowledgement = value as Record<string, unknown>;
      const status = acknowledgement.status;
      const expectedAttemptId = 'attemptId' in command ? command.attemptId : null;
      if (
        acknowledgement.type !== DIIS_PUSH_STATE_ACK ||
        acknowledgement.version !== DIIS_PUSH_STATE_PROTOCOL_VERSION ||
        acknowledgement.action !== command.action ||
        acknowledgement.state !== command.state ||
        acknowledgement.attemptId !== expectedAttemptId ||
        (status !== 'applied' && status !== 'stale')
      ) {
        return finish('failed');
      }
      return finish(status);
    };
    channel.port1.onmessageerror = () => finish('failed');
    channel.port1.start();
    try {
      worker.postMessage({
        ...command,
        version: DIIS_PUSH_STATE_PROTOCOL_VERSION,
      }, [channel.port2]);
    } catch {
      finish('failed');
    }
  });
}

async function getPushRegistration(
  dependencies: PushDeliveryStateDependencies,
): Promise<{ registration?: ServiceWorkerRegistration; readable: boolean }> {
  const getRegistration = dependencies.getRegistration ?? (
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? () => navigator.serviceWorker.getRegistration()
      : undefined
  );
  if (!getRegistration) return { readable: true };
  try {
    return { registration: await getRegistration(), readable: true };
  } catch {
    return { readable: false };
  }
}

async function suppressLegacyRegistration(
  registration: ServiceWorkerRegistration,
): Promise<boolean> {
  const browserSuppressed = await registration.pushManager.getSubscription()
    .then((subscription) => subscription ? subscription.unsubscribe() : true)
    .catch(() => false);
  const unregistered = await registration.unregister().catch(() => false);
  return browserSuppressed || unregistered;
}

/**
 * Persist a PII-free delivery guard shared with the service worker. Signed-out
 * falls back to unregistering the worker if durable state cannot be written.
 */
export async function setPushDeliveryState(
  state: PushDeliveryState,
  dependencies: PushDeliveryStateDependencies = {},
): Promise<boolean> {
  if (state !== 'signed-out') return false;
  const createMessageChannel = dependencies.createMessageChannel ?? (() => new MessageChannel());
  const { registration, readable } = await getPushRegistration(dependencies);

  if (!registration) return readable;

  const result = registration.active
    ? await sendPushStateCommand(
      registration.active,
      { type: 'DIIS_SET_PUSH_DELIVERY_STATE', action: 'force', state },
      createMessageChannel,
      dependencies.acknowledgementTimeoutMs ?? PUSH_STATE_ACK_TIMEOUT_MS,
    )
    : 'failed';
  if (result === 'applied') return true;

  return suppressLegacyRegistration(registration);
}

export async function claimPushReconciliationAttempt(
  dependencies: PushDeliveryStateDependencies = {},
  requestedAttemptId?: string,
): Promise<string | null> {
  const { registration, readable } = await getPushRegistration(dependencies);
  if (!readable || !registration?.active) return null;
  const attemptId = requestedAttemptId ?? createPushReconciliationId();
  if (!attemptId) return null;
  const result = await sendPushStateCommand(
    registration.active,
    {
      type: 'DIIS_CLAIM_PUSH_RECONCILIATION',
      action: 'claim',
      state: 'signed-out',
      attemptId,
    },
    dependencies.createMessageChannel ?? (() => new MessageChannel()),
    dependencies.acknowledgementTimeoutMs ?? PUSH_STATE_ACK_TIMEOUT_MS,
  );
  return result === 'applied' ? attemptId : null;
}

export async function abortPushReconciliationAttempt(
  attemptId: string,
  dependencies: PushDeliveryStateDependencies = {},
): Promise<PushStateCommandResult> {
  const { registration, readable } = await getPushRegistration(dependencies);
  if (!readable || !registration?.active) return 'failed';
  return sendPushStateCommand(
    registration.active,
    { type: 'DIIS_ABORT_PUSH_RECONCILIATION', action: 'abort', state: 'signed-out', attemptId },
    dependencies.createMessageChannel ?? (() => new MessageChannel()),
    dependencies.acknowledgementTimeoutMs ?? PUSH_STATE_ACK_TIMEOUT_MS,
  );
}

export async function applyPushReconciliationState(
  state: PushDeliveryState,
  attemptId: string,
  dependencies: PushDeliveryStateDependencies = {},
): Promise<PushStateCommandResult> {
  const { registration, readable } = await getPushRegistration(dependencies);
  if (!readable || !registration?.active) return 'failed';
  return sendPushStateCommand(
    registration.active,
    {
      type: 'DIIS_APPLY_PUSH_RECONCILIATION',
      action: 'apply',
      state,
      attemptId,
    },
    dependencies.createMessageChannel ?? (() => new MessageChannel()),
    dependencies.acknowledgementTimeoutMs ?? PUSH_STATE_ACK_TIMEOUT_MS,
  );
}

/** Check if push notifications are supported in this browser. */
export function isPushSupported(): boolean {
  return typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    VAPID_PUBLIC_KEY !== '';
}

/** Convert base64 VAPID key to Uint8Array for subscribe(). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof window !== 'undefined' ? window.atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

/** Register service worker (idempotent — safe to call multiple times). */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  return registerDiisServiceWorker();
}

export type PushInitializationState =
  | 'browser'
  | 'unsupported'
  | 'denied'
  | 'subscribed'
  | 'unsubscribed'
  | 'reconcile-failed';

export type PushRegistrationResult = 'bound' | 'superseded' | 'failed';

interface PushInitializationDependencies {
  installed: boolean;
  supported: boolean;
  permission: NotificationPermission;
  ensureRegistration: () => Promise<ServiceWorkerRegistration | null>;
  registerOnServer: (dto: ReturnType<typeof subscriptionToDto>) => Promise<PushRegistrationResult>;
  claimReconciliation?: (attemptId: string) => Promise<string | null>;
  applyReconciliationState?: (
    state: PushDeliveryState,
    attemptId: string,
  ) => Promise<PushStateCommandResult>;
  abortReconciliation?: (attemptId: string) => Promise<PushStateCommandResult>;
}

interface PushReconciliationDependencies {
  subscription: PushSubscription;
  registerOnServer: (dto: ReturnType<typeof subscriptionToDto>) => Promise<PushRegistrationResult>;
  claimReconciliation?: (attemptId: string) => Promise<string | null>;
  applyReconciliationState?: (
    state: PushDeliveryState,
    attemptId: string,
  ) => Promise<PushStateCommandResult>;
  abortReconciliation?: (attemptId: string) => Promise<PushStateCommandResult>;
}

export async function reconcilePushSubscription({
  subscription,
  registerOnServer,
  claimReconciliation = (attemptId) => claimPushReconciliationAttempt({}, attemptId),
  applyReconciliationState = applyPushReconciliationState,
  abortReconciliation = abortPushReconciliationAttempt,
}: PushReconciliationDependencies): Promise<PushInitializationState> {
  const requestedAttemptId = createPushReconciliationId();
  if (!requestedAttemptId) return 'reconcile-failed';
  const attemptId = await claimReconciliation(requestedAttemptId).catch(() => null);
  if (!attemptId) {
    await abortReconciliation(requestedAttemptId).catch(() => 'failed' as const);
    return 'reconcile-failed';
  }

  const reconciliation = await registerOnServer(subscriptionToDto(subscription))
    .catch(() => 'failed' as const);

  if (reconciliation === 'bound') {
    const deliveryState = await applyReconciliationState('signed-in', attemptId)
      .catch(() => 'failed' as const);
    if (deliveryState === 'applied') return 'subscribed';
    if (deliveryState === 'stale') return 'reconcile-failed';
    await abortReconciliation(attemptId).catch(() => 'failed' as const);
    return 'reconcile-failed';
  }

  const localState = await applyReconciliationState('signed-out', attemptId)
    .catch(() => 'failed' as const);
  if (localState === 'stale') return 'reconcile-failed';
  if (localState === 'failed') {
    await abortReconciliation(attemptId).catch(() => 'failed' as const);
    return 'reconcile-failed';
  }
  return 'reconcile-failed';
}

/**
 * Resolve the initial push state without letting an ordinary browser tab mutate
 * the origin-scoped subscription shared with an installed DIIS window.
 */
export async function initializePushSubscription({
  installed,
  supported,
  permission,
  ensureRegistration,
  registerOnServer,
  claimReconciliation = (attemptId) => claimPushReconciliationAttempt({}, attemptId),
  applyReconciliationState = applyPushReconciliationState,
  abortReconciliation = abortPushReconciliationAttempt,
}: PushInitializationDependencies): Promise<PushInitializationState> {
  if (!installed) return 'browser';
  if (!supported) return 'unsupported';
  if (permission === 'denied') return 'denied';

  const registration = await ensureRegistration();
  if (!registration) return 'unsubscribed';

  const subscription = await registration.pushManager.getSubscription().catch(() => null);
  if (!subscription) return 'unsubscribed';

  return reconcilePushSubscription({
    subscription,
    registerOnServer,
    claimReconciliation,
    applyReconciliationState,
    abortReconciliation,
  });
}

export async function suppressPushSubscription(
  subscription: PushSubscription,
  unregisterOnServer: (endpoint: string) => Promise<boolean>,
  setDeliveryState: (state: PushDeliveryState) => Promise<boolean> = setPushDeliveryState,
): Promise<boolean> {
  const [, server, browser] = await Promise.allSettled([
    setDeliveryState('signed-out'),
    unregisterOnServer(subscription.endpoint),
    subscription.unsubscribe(),
  ]);
  const serverSuppressed = server.status === 'fulfilled' && server.value === true;
  const browserSuppressed = browser.status === 'fulfilled' && browser.value === true;
  return serverSuppressed || browserSuppressed;
}

/**
 * Subscribe to push notifications. Returns the PushSubscription or null on failure.
 * Caller is responsible for sending the subscription to the backend.
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return null;

  const reg = await ensureServiceWorker();
  if (!reg) return null;

  // Check if already subscribed
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
    return sub;
  } catch {
    return null;
  }
}

/** Unsubscribe from push notifications. Returns true if successful. */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return true;
  return sub.unsubscribe();
}

/** Check current push permission state. */
export function getPushPermission(): NotificationPermission {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
}

/** Convert PushSubscription to the DTO shape expected by backend. */
export function subscriptionToDto(sub: PushSubscription) {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    },
  };
}
