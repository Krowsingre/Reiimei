// Reiimei service worker: caches the app shell so it opens with no connection.
// Bump VERSION whenever any app file changes so devices pick up the update.
const VERSION = 'reiimei-v0.14.5';
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
  './ui-rich.js',
  './fonts.js',
  './ui-security.js',
  './code.js',
  './modes.js',
  './ui-research.js',
  './storyboard.js',
  './codeintel.js',
  './ui-coding.js',
  './ui-storyboard.js',
  './share.js',
  './ui-code.js',
  './ui-share.js',
  './render.html',
  './render.js',
  './Echolume-VF.woff2',
  './ReiimeiDisplay-Light.woff',
  './ReiimeiDisplay-LightItalic.woff',
  './ReiimeiDisplay-Regular.woff',
  './ReiimeiDisplay-Italic.woff',
  './ReiimeiDisplay-Bold.woff',
  './ReiimeiDisplay-BoldItalic.woff',
  './Echolume-Italic-VF.woff2',
  './LunarianChancery-Regular.woff',
  './LunarianCipherHand-Regular.woff',
  './LunarianCodexCapitals-Regular.woff',
  './LunarianEarthshine-Regular.woff',
  './LunarianFlow-Bold.woff',
  './LunarianFlow-BoldItalic.woff',
  './LunarianFlow-ExtraBold.woff',
  './LunarianFlow-Italic.woff',
  './LunarianFlow-Regular.woff',
  './LunarianFlow-Thin.woff',
  './LunarianFlow-ThinItalic.woff',
  './LunarianFlowCodex-Bold.woff',
  './LunarianFlowCodex-BoldItalic.woff',
  './LunarianFlowCodex-ExtraBold.woff',
  './LunarianFlowCodex-Italic.woff',
  './LunarianFlowCodex-Regular.woff',
  './LunarianFlowCodex-Thin.woff',
  './LunarianFlowCodex-ThinItalic.woff',
  './LunarianFlowEclipse-Bold.woff',
  './LunarianFlowEclipse-BoldItalic.woff',
  './LunarianFlowEclipse-ExtraBold.woff',
  './LunarianFlowEclipse-Italic.woff',
  './LunarianFlowEclipse-Regular.woff',
  './LunarianFlowEclipse-Thin.woff',
  './LunarianFlowEclipse-ThinItalic.woff',
  './LunarianFlowNewMoon-Bold.woff',
  './LunarianFlowNewMoon-BoldItalic.woff',
  './LunarianFlowNewMoon-ExtraBold.woff',
  './LunarianFlowNewMoon-Italic.woff',
  './LunarianFlowNewMoon-Regular.woff',
  './LunarianFlowNewMoon-Thin.woff',
  './LunarianFlowNewMoon-ThinItalic.woff',
  './LunarianFlowSigil-Bold.woff',
  './LunarianFlowSigil-BoldItalic.woff',
  './LunarianFlowSigil-ExtraBold.woff',
  './LunarianFlowSigil-Italic.woff',
  './LunarianFlowSigil-Regular.woff',
  './LunarianFlowSigil-Thin.woff',
  './LunarianFlowSigil-ThinItalic.woff',
  './LunarianMoonlitHand-Regular.woff',
  './LunarianPhaseLine-Regular.woff',
  './icon-maskable-512.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // Fetch every file past the browser's own HTTP cache ('reload'). Otherwise an update can store
  // the old copy of a file that the browser still holds, and the new page would run old code.
  event.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(SHELL.map((u) => fetch(new Request(u, { cache: 'reload' })).then((res) => {
        if (!res.ok) throw new Error(`${u}: ${res.status}`);
        return c.put(u, res);
      }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;

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
