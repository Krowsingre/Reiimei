// Reiimei service worker: caches the app shell so it opens with no connection.
// Bump VERSION whenever any app file changes so devices pick up the update.
const VERSION = 'reiimei-v0.16.7';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './app.js',
  './boot.js',
  './brackets.js',
  './capitals.js',
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
  './IlunirChancery-Regular.woff',
  './IlunirCipherHand-Regular.woff',
  './IlunirCodexCapitals-Regular.woff',
  './IlunirEarthshine-Regular.woff',
  './IlunirFlow-Bold.woff',
  './IlunirFlow-BoldItalic.woff',
  './IlunirFlow-ExtraBold.woff',
  './IlunirFlow-Italic.woff',
  './IlunirFlow-Regular.woff',
  './IlunirFlow-Thin.woff',
  './IlunirFlow-ThinItalic.woff',
  './IlunirFlowCodex-Bold.woff',
  './IlunirFlowCodex-BoldItalic.woff',
  './IlunirFlowCodex-ExtraBold.woff',
  './IlunirFlowCodex-Italic.woff',
  './IlunirFlowCodex-Regular.woff',
  './IlunirFlowCodex-Thin.woff',
  './IlunirFlowCodex-ThinItalic.woff',
  './IlunirFlowEclipse-Bold.woff',
  './IlunirFlowEclipse-BoldItalic.woff',
  './IlunirFlowEclipse-ExtraBold.woff',
  './IlunirFlowEclipse-Italic.woff',
  './IlunirFlowEclipse-Regular.woff',
  './IlunirFlowEclipse-Thin.woff',
  './IlunirFlowEclipse-ThinItalic.woff',
  './IlunirFlowNewMoon-Bold.woff',
  './IlunirFlowNewMoon-BoldItalic.woff',
  './IlunirFlowNewMoon-ExtraBold.woff',
  './IlunirFlowNewMoon-Italic.woff',
  './IlunirFlowNewMoon-Regular.woff',
  './IlunirFlowNewMoon-Thin.woff',
  './IlunirFlowNewMoon-ThinItalic.woff',
  './IlunirFlowSigil-Bold.woff',
  './IlunirFlowSigil-BoldItalic.woff',
  './IlunirFlowSigil-ExtraBold.woff',
  './IlunirFlowSigil-Italic.woff',
  './IlunirFlowSigil-Regular.woff',
  './IlunirFlowSigil-Thin.woff',
  './IlunirFlowSigil-ThinItalic.woff',
  './IlunirMoonlitHand-Regular.woff',
  './IlunirPhaseLine-Regular.woff',
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
