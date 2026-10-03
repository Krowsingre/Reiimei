// Reiimei HTML preview frame. It runs inside a sandboxed iframe with its own
// origin, so the page being previewed cannot reach your notes or Reiimei.
window.addEventListener('message', (e) => {
  if (e.source !== window.parent || !e.data || typeof e.data.html !== 'string') return;
  document.open();
  document.write(e.data.html);
  document.close();
});
window.parent.postMessage({ reiimeiPreviewReady: true }, '*');
