/* ============================================================
   Navya — Service Worker  sw.js
   Cache-first for app shell + JSON data.
   Handles NOTIFY messages from main thread to show OS notifications
   even when the page is backgrounded (tab open, window minimised).

   What this does NOT do:
   • It cannot wake a closed browser tab — that requires Web Push + a push server.
   • Background sync is not implemented — out of scope.
   ============================================================ */

const CACHE_NAME = 'navya-v1';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './partner.html',
  './partner.js',
  './bf_symptom_cards.json',
  './meal_plan.json'
];

/* ── INSTALL ─────────────────────────────────────────────── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()) // don't block install on cache failure
  );
});

/* ── ACTIVATE ────────────────────────────────────────────── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => clients.claim())
  );
});

/* ── FETCH ───────────────────────────────────────────────── */
self.addEventListener('fetch', e => {
  // Only handle GET requests; let POST/PUT pass through
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request)
        .then(res => {
          // Cache successful same-origin responses
          if (res.ok && e.request.url.startsWith(self.location.origin)) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match('./index.html')) // offline fallback
      )
  );
});

/* ── NOTIFICATION from main thread ──────────────────────── */
// Main thread calls: registration.active.postMessage({ type: 'NOTIFY', title, body, tag })
// SW calls showNotification — works even when page is in background (not closed)
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'NOTIFY') return;

  const { title = 'Navya', body = '', tag = 'navya' } = e.data;

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: './icon-192.png',
      badge: './icon-72.png',
      vibrate: [200, 100, 200],
      requireInteraction: false
    })
  );
});

/* ── NOTIFICATION CLICK ──────────────────────────────────── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        const existing = list.find(c => c.url.includes('index.html') || c.url.endsWith('/'));
        if (existing) return existing.focus();
        return clients.openWindow('./index.html');
      })
  );
});
