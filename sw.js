// Prickly Panic service worker: lets the installed app open instantly and play offline.
// The page itself is fetched network-first, so a new version shows up as soon as you're online;
// everything else (icons, the pixel font) is served from cache and refreshed in the background.
const CACHE = 'prickly-panic-v1';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// "someone beat your score" pings from the leaderboard API
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Prickly Panic', {
    body: d.body || 'Someone just beat your score. Fly again?',
    icon: 'icon-192.png',
    tag: d.tag || 'beaten',
    renotify: true,
    data: { url: d.url || './' },
  }));
});

// tapping a ping opens the game (or brings an open tab to the front)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !font) return;

  if (req.mode === 'navigate') {
    // network first, keep the latest page for offline; fall back to the cached page
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('index.html', copy)); }
          return res;
        })
        .catch(() => caches.match('index.html')),
    );
    return;
  }

  // stale-while-revalidate for icons, manifest and fonts
  e.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; })
          .catch(() => hit);
        return hit || net;
      }),
    ),
  );
});
