const CACHE_SCHEMA_VERSION = 'runtime-v1';
const CACHE_PREFIX = 'costco-my-account';
const CACHE_VERSION = `${CACHE_PREFIX}-${CACHE_SCHEMA_VERSION}`;
const PRECACHE_URLS = [
  './manifest.json',
  './icon.png'
];
const NETWORK_FIRST_ASSET_RE = /\.(?:js|css|json|webmanifest)$/i;
const CACHE_FIRST_ASSET_RE = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$/i;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);

    await Promise.all(PRECACHE_URLS.map(async url => {
      try {
        const response = await fetch(new Request(url, { cache: 'reload' }));
        if (response.ok) await cache.put(url, response);
      } catch (_) {
        // Precache failures should not block activation on flaky mobile networks.
      }
    }));

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
    await notifyClients();
  })());
});

self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ type: 'SW_VERSION', version: CACHE_SCHEMA_VERSION });
  }
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isHtmlRequest(request)) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  if (url.pathname.endsWith('/sw.js')) {
    event.respondWith(fetch(new Request(request, { cache: 'no-store' })));
    return;
  }

  if (NETWORK_FIRST_ASSET_RE.test(url.pathname)) {
    event.respondWith(networkFirstAsset(request));
    return;
  }

  if (CACHE_FIRST_ASSET_RE.test(url.pathname)) {
    event.respondWith(cacheFirstStatic(request));
  }
});

function isHtmlRequest(request) {
  return request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');
}

async function networkFirstHtml(request) {
  try {
    return await fetch(new Request(request, { cache: 'no-store' }));
  } catch (_) {
    return new Response(
      '<!doctype html><title>Offline</title><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#0d1726;color:#fff;font:16px system-ui">Connect to the internet to refresh this app.</body>',
      {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  }
}

async function networkFirstAsset(request) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const response = await fetch(new Request(request, { cache: 'no-cache' }));
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw _;
  }
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(new Request(request, { cache: 'reload' }));
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function notifyClients() {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  clients.forEach(client => {
    client.postMessage({
      type: 'SW_ACTIVATED',
      version: CACHE_SCHEMA_VERSION
    });
  });
}
