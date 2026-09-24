const DIIS_CACHE_PREFIX = 'diis-pwa-';
const CACHE_NAME = `${DIIS_CACHE_PREFIX}v4-static`;
const PUSH_STATE_CACHE = 'diis-pwa-v1-push-state';
const PUSH_STATE_URL = '/__diis/push-delivery-state';
const PUSH_STATE_ACK = 'DIIS_PUSH_DELIVERY_STATE_ACK';
const PUSH_STATE_PROTOCOL_VERSION = 2;
const OFFLINE_URL = '/offline.html';
const DEFAULT_TARGET = '/dashboard';
const RELEASE_SUMMARY = Object.freeze({
  version: 'DIIS PWA 1.0',
  date: '2026-09-21',
  features: [
    'DIIS dapat dipasang di ponsel dan komputer.',
    'Pengantar aplikasi menjelaskan fitur dan privasi perangkat.',
    'Notifikasi tersedia pada DIIS yang dipasang sebagai aplikasi.',
  ],
  fixes: [
    'Logout membersihkan state pengguna pada perangkat bersama.',
    'Cache offline dibatasi pada aset publik tanpa data akun.',
  ],
  requiresLogin: false,
});
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

let pushStateMutationQueue = Promise.resolve();

const CONTENT_TYPES = {
  script: /^(?:application|text)\/javascript\b/i,
  style: /^text\/css\b/i,
  font: /^(?:font\/|application\/(?:font|vnd\.ms-fontobject))/i,
  image: /^image\//i,
};

function requestHeader(request, name) {
  return request.headers && typeof request.headers.get === 'function'
    ? request.headers.get(name)
    : null;
}

function isRscOrPrefetch(request, url) {
  return Boolean(
    url.searchParams.has('_rsc') ||
    requestHeader(request, 'RSC') ||
    requestHeader(request, 'Next-Router-Prefetch') ||
    requestHeader(request, 'Next-Router-State-Tree') ||
    requestHeader(request, 'Purpose') === 'prefetch' ||
    requestHeader(request, 'Sec-Purpose') === 'prefetch'
  );
}

function isSensitiveNavigation(pathname) {
  const path = pathname.toLowerCase();
  return (
    path.startsWith('/api/') ||
    path === '/login' ||
    path.startsWith('/login/') ||
    path === '/auth' ||
    path.startsWith('/auth/') ||
    path.includes('/callback') ||
    path.includes('logout')
  );
}

function isMandatoryAsset(url) {
  return url.search === '' && PRECACHE_URLS.includes(url.pathname);
}

function isHashedStaticPath(pathname) {
  if (!pathname.startsWith('/_next/static/')) return false;
  return /\/[a-f0-9]{8,}(?:[-.][^/]*)?\.(?:js|css|woff2?|png|jpe?g|webp|avif|svg)$/i.test(pathname) ||
    /-[a-f0-9]{8,}\.(?:js|css|woff2?|png|jpe?g|webp|avif|svg)$/i.test(pathname);
}

function staticRequestKind(request, url) {
  if (isMandatoryAsset(url)) return 'mandatory';
  if (!isHashedStaticPath(url.pathname) || url.search) return null;
  return Object.prototype.hasOwnProperty.call(CONTENT_TYPES, request.destination)
    ? request.destination
    : null;
}

function classifyRequest(request) {
  if (!request || request.method !== 'GET') return null;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (url.origin !== self.location.origin || isRscOrPrefetch(request, url)) return null;
  if (request.mode === 'navigate' || request.destination === 'document') {
    return isSensitiveNavigation(url.pathname) ? null : { kind: 'navigation', url };
  }
  const staticKind = staticRequestKind(request, url);
  return staticKind ? { kind: 'static', staticKind, url } : null;
}

function isCacheableResponse(response, staticKind) {
  if (!response || response.status !== 200 || (response.type && !['basic', 'default'].includes(response.type))) {
    return false;
  }
  if (staticKind === 'mandatory') return true;
  const contentType = response.headers && typeof response.headers.get === 'function'
    ? response.headers.get('content-type') || ''
    : '';
  return Boolean(CONTENT_TYPES[staticKind] && CONTENT_TYPES[staticKind].test(contentType));
}

function cleanText(value, fallback, maxLength) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function hasUnsafePathEncoding(value) {
  const rawPath = value.split(/[?#]/, 1)[0];
  if (/%(?:2e|2f|5c)/i.test(rawPath)) return true;
  let decoded = rawPath;
  for (let index = 0; index < 3; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return true;
    }
  }
  return decoded.includes('..') || decoded.includes('\\') || decoded.includes('//');
}

function normalizeNotificationTarget(value) {
  if (typeof value !== 'string') return DEFAULT_TARGET;
  const candidate = value.trim();
  if (
    candidate.length === 0 ||
    candidate.length > 1024 ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    hasUnsafePathEncoding(candidate)
  ) {
    return DEFAULT_TARGET;
  }

  let url;
  try {
    url = new URL(candidate, self.location.origin);
  } catch {
    return DEFAULT_TARGET;
  }
  if (url.origin !== self.location.origin || url.username || url.password || url.hash) return DEFAULT_TARGET;

  if (url.pathname === '/dashboard/akademik') {
    return url.search === '' ? url.pathname : DEFAULT_TARGET;
  }
  if (url.pathname === '/dashboard/rapor') {
    const keys = [...url.searchParams.keys()];
    if (keys.length === 0) return url.pathname;
    if (keys.length !== 1 || keys[0] !== 'studentId' || url.searchParams.getAll('studentId').length !== 1) {
      return DEFAULT_TARGET;
    }
    const studentId = url.searchParams.get('studentId') || '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentId)) {
      return DEFAULT_TARGET;
    }
    return `${url.pathname}?${url.searchParams.toString()}`;
  }
  return DEFAULT_TARGET;
}

function normalizePushPayload(value) {
  const payload = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const rawTag = cleanText(payload.tag, 'diis-notification', 64);
  return {
    title: cleanText(payload.title, 'Notifikasi DIIS', 80),
    body: cleanText(payload.body, 'Ada pembaruan di DIIS.', 240),
    tag: /^[a-z0-9:_-]{1,64}$/i.test(rawTag) ? rawTag : 'diis-notification',
    url: normalizeNotificationTarget(payload.url),
  };
}

function normalizePushStateRecord(value) {
  if (value === 'signed-in' || value === 'signed-out') {
    return { state: 'signed-out', attemptId: null };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { state: 'signed-out', attemptId: null };
  }
  const attemptId = isValidAttemptId(value.attemptId) ? value.attemptId : null;
  return {
    state: value.state === 'signed-in' && attemptId ? 'signed-in' : 'signed-out',
    attemptId,
  };
}

async function persistPushStateRecord(record) {
  const normalized = normalizePushStateRecord(record);
  const cache = await caches.open(PUSH_STATE_CACHE);
  await cache.put(PUSH_STATE_URL, new Response(JSON.stringify(normalized), {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  }));
  return normalized;
}

async function readPushStateRecord() {
  try {
    const cache = await caches.open(PUSH_STATE_CACHE);
    const response = await cache.match(PUSH_STATE_URL);
    const stored = response ? await response.text() : '';
    if (stored === 'signed-in' || stored === 'signed-out') {
      return normalizePushStateRecord(stored);
    }
    return normalizePushStateRecord(stored ? JSON.parse(stored) : null);
  } catch {
    return { state: 'signed-out', attemptId: null };
  }
}

async function readPushDeliveryState() {
  return (await readPushStateRecord()).state;
}

function enqueuePushStateOperation(operation) {
  const result = pushStateMutationQueue.then(operation, operation);
  pushStateMutationQueue = result.catch(() => undefined);
  return result;
}

function isValidAttemptId(value) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 200 && /^[a-z0-9-]+$/i.test(value);
}

async function claimPushReconciliation(attemptId) {
  if (!isValidAttemptId(attemptId)) return { status: 'failed', state: 'signed-out', attemptId: null };
  const record = await persistPushStateRecord({ state: 'signed-out', attemptId });
  return { status: 'applied', ...record };
}

async function applyPushReconciliation(state, attemptId) {
  if ((state !== 'signed-in' && state !== 'signed-out') || !isValidAttemptId(attemptId)) {
    return { status: 'failed', state: 'signed-out', attemptId: null };
  }
  const current = await readPushStateRecord();
  if (current.attemptId !== attemptId) return { status: 'stale', ...current };
  const record = await persistPushStateRecord({ state, attemptId });
  return { status: 'applied', ...record };
}

async function abortPushReconciliation(attemptId) {
  if (!isValidAttemptId(attemptId)) return { status: 'failed', state: 'signed-out', attemptId: null };
  const current = await readPushStateRecord();
  if (current.attemptId !== attemptId) return { status: 'stale', ...current };
  const record = await persistPushStateRecord({ state: 'signed-out', attemptId });
  return { status: 'applied', ...record };
}

async function forcePushDeliveryState(state) {
  if (state !== 'signed-out') {
    return { status: 'failed', state: 'signed-out', attemptId: null };
  }
  const record = await persistPushStateRecord({ state: 'signed-out', attemptId: null });
  return { status: 'applied', ...record };
}

async function verifyPushDelivery(proof) {
  if (typeof proof !== 'string' || !/^[a-f0-9]{64}$/.test(proof)) return false;
  try {
    const subscription = await self.registration.pushManager.getSubscription();
    if (!subscription) return false;
    const response = await fetch('/api/backend/push/verify-delivery', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint, proof }),
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result && typeof result === 'object' && result.deliver === true;
  } catch {
    return false;
  }
}

function postPushStateAcknowledgement(event, action, result) {
  if (!event.ports || !event.ports[0]) return;
  event.ports[0].postMessage({
    type: PUSH_STATE_ACK,
    version: PUSH_STATE_PROTOCOL_VERSION,
    action,
    state: action === 'claim' || action === 'abort' ? 'signed-out' : event.data.state,
    attemptId: action === 'force' ? null : event.data.attemptId,
    status: result.status,
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'DIIS_SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'DIIS_GET_RELEASE_SUMMARY' && event.ports && event.ports[0]) {
    event.ports[0].postMessage(RELEASE_SUMMARY);
  }
  if (!event.data || event.data.version !== PUSH_STATE_PROTOCOL_VERSION) return;

  let action;
  let operation;
  if (event.data.type === 'DIIS_CLAIM_PUSH_RECONCILIATION') {
    action = 'claim';
    operation = () => claimPushReconciliation(event.data.attemptId);
  } else if (event.data.type === 'DIIS_APPLY_PUSH_RECONCILIATION') {
    action = 'apply';
    operation = () => applyPushReconciliation(event.data.state, event.data.attemptId);
  } else if (event.data.type === 'DIIS_ABORT_PUSH_RECONCILIATION') {
    action = 'abort';
    operation = () => abortPushReconciliation(event.data.attemptId);
  } else if (event.data.type === 'DIIS_SET_PUSH_DELIVERY_STATE') {
    action = 'force';
    operation = () => forcePushDeliveryState(event.data.state);
  } else {
    return;
  }

  const update = enqueuePushStateOperation(operation)
    .then((result) => {
      postPushStateAcknowledgement(event, action, result);
      return result;
    })
    .catch(() => {
      postPushStateAcknowledgement(event, action, {
        status: 'failed',
        state: 'signed-out',
        attemptId: null,
      });
    });
  if (typeof event.waitUntil === 'function') event.waitUntil(update);
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => (
          name.startsWith(DIIS_CACHE_PREFIX) && name !== CACHE_NAME && name !== PUSH_STATE_CACHE
        ))
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const policy = classifyRequest(event.request);
  if (!policy) return;

  if (policy.kind === 'navigation') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const shell = await caches.match(OFFLINE_URL);
        return shell || new Response('DIIS sedang offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;
      const response = await fetch(event.request);
      if (isCacheableResponse(response, policy.staticKind)) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    }),
  );
});

self.addEventListener('push', (event) => {
  let rawPayload = {};
  try {
    rawPayload = event.data ? event.data.json() : {};
  } catch {
    rawPayload = {};
  }
  const payload = normalizePushPayload(rawPayload);
  event.waitUntil(enqueuePushStateOperation(async () => {
    if (await readPushDeliveryState() !== 'signed-in') return;
    if (!await verifyPushDelivery(rawPayload.deliveryProof)) return;
    await self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload.url },
    });
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = normalizeNotificationTarget(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
      for (const client of windowClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === self.location.origin && 'focus' in client) {
          if ('navigate' in client) await client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.__DIIS_SW_TEST__ = {
  CACHE_NAME,
  PUSH_STATE_CACHE,
  PUSH_STATE_URL,
  PUSH_STATE_ACK,
  PUSH_STATE_PROTOCOL_VERSION,
  RELEASE_SUMMARY,
  DIIS_CACHE_PREFIX,
  OFFLINE_URL,
  PRECACHE_URLS,
  classifyRequest,
  isCacheableResponse,
  normalizeNotificationTarget,
  normalizePushPayload,
  normalizePushStateRecord,
  persistPushStateRecord,
  readPushStateRecord,
  readPushDeliveryState,
  claimPushReconciliation,
  applyPushReconciliation,
  abortPushReconciliation,
  forcePushDeliveryState,
  verifyPushDelivery,
};
