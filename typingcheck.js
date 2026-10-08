// Reiimei typing check: a recorder for what the phone's keyboard does in a note, for finding out
// why dictation, holding Delete, capitals, tapping and selecting misbehave on an iPhone.
// Settings › Log › Start typing check. Everything is kept in memory only while it records; Stop
// gives a text file to send. It records which keys and edits arrive, where the caret is (with
// the dozen letters before it), what Reiimei itself changes, and how the screen moves.

const MAX = 4000;
let on = false;
let t0 = 0;
let rows = [];
let observer = null;
const listeners = [];

export const recording = () => on;

const now = () => Math.round(performance.now() - t0);
const short = (s, n = 40) => (s == null ? '' : String(s).replace(/\n/g, '⏎').slice(0, n));
function push(type, data = {}) {
  if (!on) return;
  if (rows.length >= MAX) rows.shift();
  rows.push([now(), type, data]);
}
// Reiimei's own steps (redraws, caret moves, scrolling) are noted from the code that does them.
export function trace(type, data) { if (on) push(`app:${type}`, data); }

function where() {
  const s = getSelection();
  if (!s || !s.rangeCount) return { sel: 'none' };
  const box = document.getElementById('rich');
  const a = s.anchorNode;
  const inBox = box && a && box.contains(a);
  let before = '';
  if (inBox) {
    try {
      const r = document.createRange();
      const block = (a.nodeType === 1 ? a : a.parentElement).closest('p,div,li,h1,h2,h3,h4,h5,h6,pre') || box;
      r.setStart(block, 0);
      r.setEnd(a, s.anchorOffset);
      before = r.toString().slice(-12);
    } catch { /* not measurable */ }
  }
  return { in: inBox ? 'rich' : (document.activeElement?.id || document.activeElement?.tagName || ''), node: a?.nodeName, off: s.anchorOffset, collapsed: s.isCollapsed, len: s.toString().length, before: short(before, 12) };
}

function on_(target, type, fn, opts = { capture: true, passive: true }) {
  target.addEventListener(type, fn, opts);
  listeners.push([target, type, fn, opts]);
}

export function start() {
  if (on) return;
  on = true;
  t0 = performance.now();
  rows = [];
  const vv = window.visualViewport;
  push('start', {
    version: window.__reiimeiVersion, ua: navigator.userAgent, w: innerWidth, h: innerHeight, vv: vv ? `${Math.round(vv.width)}x${Math.round(vv.height)}+${Math.round(vv.offsetTop)}` : '',
    standalone: !!(navigator.standalone || matchMedia('(display-mode: standalone)').matches),
  });
  on_(document, 'keydown', (e) => push('keydown', { key: e.key, code: e.code, kc: e.keyCode, repeat: e.repeat, comp: e.isComposing }));
  on_(document, 'keyup', (e) => push('keyup', { key: e.key, kc: e.keyCode }));
  on_(document, 'beforeinput', (e) => push('beforeinput', { type: e.inputType, data: short(e.data), comp: e.isComposing, can: e.cancelable }));
  on_(document, 'input', (e) => push('input', { type: e.inputType, data: short(e.data), target: e.target?.id }));
  for (const t of ['compositionstart', 'compositionupdate', 'compositionend']) on_(document, t, (e) => push(t, { data: short(e.data) }));
  on_(document, 'selectionchange', () => push('selection', where()));
  on_(document, 'focusin', (e) => push('focus', { target: e.target?.id || e.target?.tagName }));
  on_(document, 'focusout', (e) => push('blur', { target: e.target?.id || e.target?.tagName }));
  for (const t of ['touchstart', 'touchend', 'touchcancel']) {
    on_(document, t, (e) => { const p = (e.touches[0] || e.changedTouches[0]); push(t, { n: e.touches.length, x: p ? Math.round(p.clientX) : '', y: p ? Math.round(p.clientY) : '', target: e.target?.id || e.target?.nodeName }); });
  }
  if (vv) {
    on_(vv, 'resize', () => push('viewport', { h: Math.round(vv.height), top: Math.round(vv.offsetTop) }));
    on_(vv, 'scroll', () => push('viewport-scroll', { h: Math.round(vv.height), top: Math.round(vv.offsetTop) }));
  }
  on_(window, 'scroll', () => push('window-scroll', { y: Math.round(scrollY) }));
  const box = document.getElementById('rich');
  if (box) {
    on_(box, 'scroll', () => push('note-scroll', { top: Math.round(box.scrollTop) }));
    observer = new MutationObserver((list) => {
      for (const m of list) push('change', { kind: m.type, el: m.target.nodeName, attr: m.attributeName || '', add: m.addedNodes.length, del: m.removedNodes.length });
    });
    observer.observe(box, { subtree: true, childList: true, characterData: true, attributes: true });
  }
}

// Stops and returns the recording as text.
export function stop() {
  if (!on) return '';
  push('stop', {});
  on = false;
  for (const [target, type, fn, opts] of listeners) target.removeEventListener(type, fn, opts);
  listeners.length = 0;
  observer?.disconnect();
  observer = null;
  const lines = rows.map(([t, type, d]) => `${String(t).padStart(7)} ms  ${type.padEnd(16)} ${Object.entries(d).map(([k, v]) => `${k}=${typeof v === 'string' ? JSON.stringify(v) : v}`).join(' ')}`);
  rows = [];
  return `Reiimei typing check\n${lines.join('\n')}\n`;
}
