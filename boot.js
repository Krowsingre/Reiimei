// Reiimei start-up check. It runs straight after app.js.
// Just after an update, the first launch can get the new page but the previous version's scripts
// (the old offline copy is still in charge for a moment). The page then shows new settings that
// the old scripts cannot fill in. When that happens, wait for the new version to take over and
// load the app again, once.
(function () {
  const want = document.documentElement.dataset.version;
  // A beta copy (served from a folder with "beta" in its name) keeps its own names (channel.js).
  const key = /beta/.test((location.pathname.split('/').filter(Boolean)[0] || '').toLowerCase()) ? 'reiimei-beta.reloadFor' : 'reiimei.reloadFor';
  const have = window.__reiimeiVersion;
  if (!want || have === want) { try { sessionStorage.removeItem(key); } catch (e) { /* storage blocked */ } return; }
  try {
    if (sessionStorage.getItem(key) === want) return; // at most once per version
    sessionStorage.setItem(key, want);
  } catch (e) { return; }
  let done = false;
  const go = () => { if (!done) { done = true; location.reload(); } };
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', go);
    navigator.serviceWorker.getRegistration().then((reg) => { if (reg) reg.update().catch(() => {}); });
  }
  setTimeout(go, 10000);
}());
