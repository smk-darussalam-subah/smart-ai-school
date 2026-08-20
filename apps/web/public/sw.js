// =============================================================================
// Service Worker — DIIS Smart AI School PWA (P16 W3-6)
// Basic offline caching for LMS modules and static assets.
// =============================================================================

const CACHE_NAME = 'diis-v2-static';
const STATIC_ASSETS = [
  '/manifest.json',
];

function shouldHandleFetch(request) {
  if (request.method !== 'GET') return false;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (url.origin !== self.location.origin) return false;
  if (request.mode === 'navigate' || request.destination === 'document') return false;
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/dashboard') ||
    url.pathname.startsWith('/consent') ||
    url.pathname.startsWith('/login')
  ) {
    return false;
  }
  return true;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (!shouldHandleFetch(event.request)) return;

  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => new Response('Offline', { status: 503, statusText: 'Offline' }));
    })
  );
});

function safeSameOriginPath(value) {
  if (typeof value !== 'string') return '/dashboard';
  const candidate = value.trim();
  if (
    candidate.length > 2048 ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\')
  ) {
    return '/dashboard';
  }
  try {
    decodeURI(candidate);
    const url = new URL(candidate, self.location.origin);
    if (url.origin !== self.location.origin) return '/dashboard';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/dashboard';
  }
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title
    : 'Notifikasi DIIS';
  const body = typeof payload.body === 'string' && payload.body.trim()
    ? payload.body
    : 'Ada pembaruan di DIIS.';
  const url = safeSameOriginPath(payload.url);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: typeof payload.tag === 'string' ? payload.tag : 'diis-notification',
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = safeSameOriginPath(event.notification.data?.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
