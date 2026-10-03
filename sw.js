// Reiimei service worker: caches the app shell so it opens with no connection.
// Bump VERSION whenever any app file changes so devices pick up the update.
const VERSION = 'reiimei-v0.5.0';
const FONT_CACHE = 'reiimei-fonts';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './app.js',
  './db.js',
  './sync.js',
  './logger.js',
  './crypto.js',
  './format.js',
  './cite.js',
  './paper.js',
  './zip.js',
  './ui-writing.js',
  './ui-security.js',
  './code.js',
  './share.js',
  './ui-code.js',
  './ui-share.js',
  './render.html',
  './render.js',
  './Echolume-VF.woff2',
  './Echolume-Italic-VF.woff2',
  './icon-maskable-512.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;

  // Web fonts: keep a copy after the first online launch so they work offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      }))).catch(() => new Response('', { status: 504 })),
    );
    return;
  }

  // Only handle our own files. Sync requests to Supabase go straight to the network.
  if (url.origin !== self.location.origin) return;

  // Network first for the page itself (so updates arrive), cache as fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Cache first for everything else.
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
