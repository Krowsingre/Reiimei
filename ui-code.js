// Reiimei code editor: syntax coloring under the text box, line numbers,
// smart Tab/Enter, comment toggling, tidying, and previews:
//   HTML5 renders live in a sandboxed frame that cannot reach your notes.
//   XML is checked for errors and shown as a collapsible tree.
import { log } from './logger.js';
import * as K from './code.js';

const $ = (id) => document.getElementById(id);
let app = null;
let lang = null;
let painting = false;
let frameTimer = null;
let pendingHtml = null;

export const activeLang = () => lang;

function syncScroll() {
  const ta = $('body');
  $('code-layer').scrollTop = ta.scrollTop;
  $('code-layer').scrollLeft = ta.scrollLeft;
  $('gutter').scrollTop = ta.scrollTop;
}

function paint() {
  painting = false;
  if (!lang) return;
  const v = $('body').value;
  // A trailing newline keeps the colored layer as tall as the text box.
  $('code-hl').innerHTML = `${K.highlight(v, lang)}\n`;
  const count = v.split('\n').length;
  const g = $('gutter');
  if (+g.dataset.count !== count) {
    g.dataset.count = count;
    g.textContent = Array.from({ length: count }, (_, k) => k + 1).join('\n');
  }
  syncScroll();
}
const schedulePaint = () => { if (!painting) { painting = true; requestAnimationFrame(paint); } };

// Show or hide the code editor for a note.
export function render(note) {
  const next = note && K.isCode(note.format) ? note.format : null;
  const area = $('editor-area');
  const ta = $('body');
  area.classList.toggle('code', !!next);
  $('code-layer').hidden = !next;
  $('gutter').hidden = !next;
  if (next) {
    ta.setAttribute('wrap', 'off');
    ta.spellcheck = false;
    ta.setAttribute('autocapitalize', 'off');
    ta.setAttribute('autocorrect', 'off');
    ta.placeholder = next === 'python' ? '# Start with a comment that names this file' : next === 'html' ? '<!DOCTYPE html>' : '<?xml version="1.0" encoding="UTF-8"?>';
  } else if (lang) {
    ta.removeAttribute('wrap');
    ta.spellcheck = true;
    ta.removeAttribute('autocapitalize');
    ta.removeAttribute('autocorrect');
    ta.placeholder = 'Begin writing. The first line becomes the title.';
  }
  lang = next;
  if (lang) paint();
}

function edit(r) {
  const ta = $('body');
  ta.value = r.value;
  ta.setSelectionRange(r.start, r.end);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function onKey(e) {
  if (!lang || $('body').readOnly) return;
  const ta = $('body');
  const { selectionStart: s, selectionEnd: en, value: v } = ta;
  const unit = K.LANGS[lang].indent;
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    edit(K.indentLines(v, s, en, unit, e.shiftKey));
  } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && s === en) {
    e.preventDefault();
    const ind = K.newlineIndent(v, s, lang);
    edit({ value: `${v.slice(0, s)}\n${ind}${v.slice(en)}`, start: s + 1 + ind.length, end: s + 1 + ind.length });
  } else if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    edit(K.toggleComment(v, s, en, lang));
  }
}

export function action(id) {
  if (!lang) return;
  const ta = $('body');
  ta.focus();
  const { selectionStart: s, selectionEnd: en, value: v } = ta;
  const unit = K.LANGS[lang].indent;
  if (id === 'indent') {
    if (s === en) {
      // With no selection, the toolbar button indents the whole line.
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      edit({ value: v.slice(0, ls) + unit + v.slice(ls), start: s + unit.length, end: s + unit.length });
    } else edit(K.indentLines(v, s, en, unit, false));
  }
  else if (id === 'outdent') edit(K.indentLines(v, s, en, unit, true));
  else if (id === 'comment') edit(K.toggleComment(v, s, en, lang));
  else if (id === 'tidy') {
    const tidied = K.tidy(v, lang);
    if (tidied === v) { app.toast('Already tidy'); return; }
    const before = v;
    edit({ value: tidied, start: 0, end: 0 });
    log.info('code', 'Tidied', { lang });
    app.toast('Tidied', 'Undo', () => { const t = $('body'); t.value = before; t.dispatchEvent(new Event('input', { bubbles: true })); });
  }
}

// ---- Previews -------------------------------------------------------------------
export function previewLabel(format) {
  if (format === 'html') return 'Render';
  if (format === 'xml') return 'Check';
  return null; // Python has no preview
}

export function showPreview(note, on) {
  const frame = $('html-frame');
  const pv = $('preview');
  if (!on || !note || !K.isCode(note.format)) {
    frame.hidden = true;
    clearTimeout(frameTimer);
    return false;
  }
  $('body').hidden = true;
  $('code-layer').hidden = true;
  $('gutter').hidden = true;
  if (note.format === 'html') {
    pv.hidden = true;
    frame.hidden = false;
    pendingHtml = note.body;
    // Reload the frame each time so every render starts clean.
    frame.src = 'render.html';
    clearTimeout(frameTimer);
    frameTimer = setTimeout(() => {
      if (pendingHtml === null) return;
      frame.hidden = true;
      pv.hidden = false;
      pv.innerHTML = '<p class="hint">The preview page did not load. Open Reiimei once while online so it can save the preview page for offline use.</p>';
      log.warn('code', 'HTML preview frame did not respond');
    }, 5000);
    log.info('code', 'Rendering HTML', { chars: note.body.length });
    return true;
  }
  if (note.format === 'xml') {
    frame.hidden = true;
    pv.hidden = false;
    const res = K.checkXml(note.body);
    if (res.ok) {
      pv.innerHTML = `<p class="xml-ok">Well formed. ${res.doc.getElementsByTagName('*').length} elements.</p><div class="xml-tree">${K.xmlTreeHtml(res.doc)}</div>`;
    } else {
      const lines = note.body.split('\n');
      const at = res.line;
      const near = at ? lines.slice(Math.max(0, at - 3), at + 2).map((l, k) => {
        const n = Math.max(1, at - 2) + k;
        return `<div class="xml-line${n === at ? ' bad' : ''}"><span class="ln">${n}</span>${K.highlight(l, 'xml') || ' '}</div>`;
      }).join('') : '';
      pv.innerHTML = `<div class="xml-err"><strong>This XML has a problem${at ? ` on line ${at}` : ''}.</strong><p>${res.error.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</p>${near ? `<pre class="code-block">${near}</pre>` : ''}</div>`;
    }
    log.info('code', 'XML checked', { ok: res.ok, line: res.line || null });
    return true;
  }
  return false;
}

export function init(hooks) {
  app = hooks;
  const ta = $('body');
  ta.addEventListener('input', () => { if (lang) schedulePaint(); });
  ta.addEventListener('scroll', () => { if (lang) syncScroll(); });
  ta.addEventListener('keydown', onKey);
  $('code-tools').addEventListener('click', (e) => {
    const b = e.target.closest('[data-code]');
    if (b) action(b.dataset.code);
  });
  window.addEventListener('message', (e) => {
    const frame = $('html-frame');
    if (e.source !== frame.contentWindow || !e.data?.reiimeiPreviewReady || pendingHtml === null) return;
    clearTimeout(frameTimer);
    // The frame has its own sandboxed origin, so its origin is "null"; "*" is required.
    frame.contentWindow.postMessage({ html: pendingHtml }, '*');
    pendingHtml = null;
  });
}
