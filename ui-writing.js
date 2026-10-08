// Reiimei writing tools: formatting toolbar, preview, Markdown/Populi
// conversion, copying, sources and citations, and MLA/APA papers.
import { log } from './logger.js';
import * as F from './format.js';
import * as C from './cite.js';
import * as P from './paper.js';
import { uuid } from './db.js';
import * as codeUi from './ui-code.js';
import { isCode, LANGS } from './code.js';
import * as S from './share.js';
import * as research from './ui-research.js';
import * as storyUi from './ui-storyboard.js';
import * as codingUi from './ui-coding.js';
import * as modes from './modes.js';
import * as rich from './ui-rich.js';
import * as fonts from './fonts.js';
import * as brackets from './brackets.js';
import * as capitals from './capitals.js';

const $ = (id) => document.getElementById(id);
let app = null; // hooks supplied by app.js
let previewOn = false;
let caret = { start: 0, end: 0 };

const styleOf = (note) => (note?.meta?.style === 'mla' ? 'mla' : note?.meta?.style === 'apa' ? 'apa' : app.prefs().style);
const sourcesOf = (note) => note?.meta?.sources || [];
const citerFor = (note) => C.makeCiter(sourcesOf(note), styleOf(note));
// Text notes are kept as Markdown underneath, so they share its tools, conversion and exports.
const fmtOf = (note) => (note?.format === 'populi' ? 'populi' : 'markdown');
const FORMAT_NAMES = { text: 'Text', markdown: 'Markdown', populi: 'Populi markup' };
const isCodeNote = (note) => !!note && isCode(note.format);

async function saveMeta(patch) {
  const note = app.note();
  if (!note) return;
  await app.update({ meta: { ...(note.meta || {}), ...patch } });
}

// ---- Toolbar -------------------------------------------------------------
// The buttons are in labelled groups (index.html). On a computer every group that applies to the
// note is shown. On a phone each group belongs to a chip, and a chip opens its groups as a sheet.
const ribbonOpen = new Set(); // sections open now; every section starts closed
// On a phone the ribbon is one scrolling row of chips, and one section at a time opens as a sheet.
const isPhone = () => window.matchMedia('(max-width: 760px)').matches;
function syncRibbon() {
  const panels = $('rb-panels');
  // The Insert menu is there only when something can be inserted in this note.
  const ins = $('btn-insert-menu');
  ins.hidden = ![...ins.parentElement.querySelectorAll('.tool:not(.insert-menu)')].some((b) => !b.hidden);
  document.querySelectorAll('#rb-chips .rb-chip').forEach((chip) => {
    const secs = [...panels.querySelectorAll(`.rb-sec[data-sec="${chip.dataset.sec}"]`)];
    const live = secs.filter((x) => !x.parentElement.hidden && [...x.querySelectorAll('.tool, .rb-row')].some((b) => !b.hidden));
    chip.hidden = !live.length;
    const open = !!live.length && (!isPhone() || ribbonOpen.has(chip.dataset.sec));
    chip.setAttribute('aria-expanded', String(open));
    secs.forEach((x) => { x.hidden = !(open && live.includes(x)); });
  });
  $('toolbar').dataset.open = String(!!panels.querySelector('.rb-sec:not([hidden])'));
  // A row with nothing in it for this note (Options for a code note) is left out.
  panels.querySelectorAll('.rb-line').forEach((l) => { l.hidden = !l.querySelector('.rb-sec:not([hidden])'); });
  fitToolbar();
}

// On a computer the labelled groups stay on one line: when they would not fit (a wide interface
// font, a narrow window), the whole toolbar is drawn smaller, down to half size, instead of
// wrapping. At full size when it already fits.
export function fitToolbar() {
  const bar = $('toolbar');
  const panels = $('rb-panels');
  if (isPhone() || bar.hidden) { bar.style.removeProperty('--tb'); return; }
  const secs = [...panels.querySelectorAll('.rb-line[data-line="buttons"] .rb-sec[data-label]')].filter((x) => !x.hidden && x.offsetParent);
  if (!secs.length) return;
  // Borders do not shrink with the rest, so measure again until it really fits (a few rounds).
  let scale = 1;
  for (let k = 0; k < 8; k++) {
    bar.style.setProperty('--tb', String(scale));
    const avail = panels.clientWidth - 2;
    const gap = parseFloat(getComputedStyle(panels).columnGap) || 0;
    const need = secs.reduce((w, x) => w + x.getBoundingClientRect().width, 0) + gap * (secs.length - 1);
    if (need <= avail || scale <= 0.5) break;
    scale = Math.max(0.5, Math.min(scale - 0.005, Math.floor(scale * (avail / need) * 1000) / 1000));
  }
}

export function renderToolbar(note) {
  const bar = $('toolbar');
  bar.hidden = !note;
  if (!note) { storyUi.renderToolbar(null); codingUi.renderToolbar(null); return; }
  const code = isCodeNote(note);
  const format = fmtOf(note);
  $('note-format').value = code || note.format === 'text' ? note.format : format;
  const ro = !!note.deleted;
  $('note-format').disabled = ro;
  // Code notes get code tools; writing notes get formatting buttons.
  $('tool-buttons').hidden = code;
  $('code-tools').hidden = !code;
  $('code-tools').querySelectorAll('.tool').forEach((b) => { b.disabled = ro || previewOn; });
  $('btn-sources').hidden = code;
  research.renderToolbar(note, code);
  $('btn-paper').hidden = code;
  // Text notes are always shown formatted, so they have no Preview.
  const pl = code ? codeUi.previewLabel(note.format) : note.format === 'text' ? null : 'Preview';
  $('btn-preview').hidden = !pl;
  if (!pl) previewOn = false;
  codeUi.render(note);
  // Writing buttons the note's format has (Populi has no headings, lists of tasks, quotes or code).
  const ids = new Set(F.TOOLBAR[format].map((t) => t.id));
  $('rb-panels').querySelectorAll('[data-tool]').forEach((b) => { b.hidden = code || !ids.has(b.dataset.tool === 'list' ? 'ul' : b.dataset.tool); b.disabled = ro || previewOn; });
  $('btn-preview').setAttribute('aria-pressed', String(previewOn));
  $('btn-preview').textContent = previewOn ? 'Edit' : pl || 'Preview';
  $('btn-sources').textContent = sourcesOf(note).length ? `Sources (${sourcesOf(note).length})` : 'Sources';
  renderPreview(note);
  storyUi.renderToolbar(note, code, previewOn);
  codingUi.renderToolbar(note);
  const fs = $('note-font');
  $('note-font-row').hidden = code;
  $('note-font-box').hidden = code;
  fs.disabled = ro;
  fonts.fillFontSelect(fs, { hidden: app.prefs().hiddenFonts || [], current: fonts.fontId(note.meta?.font) });
  rich.render(note);
  // Brackets and Spacing belong to writing notes.
  $('note-brackets-row').hidden = code;
  $('note-case-row').hidden = code;
  $('btn-case').disabled = ro;
  $('note-brackets-copy-wrap').hidden = code || !note.meta?.brackets;
  $('note-brackets-copy').checked = app.prefs().bracketCopy !== false;
  $('note-spacing-row').hidden = code;
  $('note-brackets').checked = !!note.meta?.brackets;
  // The phone's bar shows what applies to this note.
  for (const b of $('phone-bar').querySelectorAll('.pb')) {
    const w = b.dataset.pb;
    if (['b', 'i', 'u', 's'].includes(w)) b.hidden = code || !ids.has(w);
    else if (w === 'list') b.hidden = code || !ids.has('ul');
    else if (w === 'font' || w === 'brackets' || w === 'case') b.hidden = code;
    if (b.tagName === 'BUTTON' && w !== 'more' && w !== 'undo' && w !== 'redo') b.disabled = ro || previewOn;
  }
  $('phone-bar').querySelector('[data-pb="brackets"]').setAttribute('aria-pressed', String(!!note.meta?.brackets));
  fonts.fillFontSelect($('pb-font'), { hidden: app.prefs().hiddenFonts || [], current: fonts.fontId(note.meta?.font) });
  $('pb-font').disabled = ro;
  $('note-brackets').disabled = ro;
  applySpacing(note);
  paintBrackets();
  syncRibbon();
  applyParts();
}

// ---- Spacing ---------------------------------------------------------------------
// Line height, letter spacing and word spacing for the whole note (meta.lh, meta.ls, meta.ws), or
// the defaults from Settings › Fonts & Styles when the note has not set its own.
// Line spacing is counted as in a word processor: 1 is single spacing, 2 is double.
export const SPACING_DEFAULT = { lh: 1, ls: 0.01, ws: 0 };
const SINGLE = 1.25; // the line height of single spacing, in ems
const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
export function spacingOf(note) {
  const p = app.prefs();
  const d = { lh: num(p.lh, SPACING_DEFAULT.lh), ls: num(p.ls, SPACING_DEFAULT.ls), ws: num(p.ws, SPACING_DEFAULT.ws) };
  const m = note?.meta || {};
  return { lh: num(m.lh, d.lh), ls: num(m.ls, d.ls), ws: num(m.ws, d.ws), own: ['lh', 'ls', 'ws'].some((k) => m[k] !== undefined && m[k] !== null) };
}
const fmt = { lh: (v) => String(Math.round(v * 100) / 100), ls: (v) => `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(2)}`, ws: (v) => `${v >= 0 ? '' : '−'}${Math.abs(v).toFixed(2)}` };
export function applySpacing(note, live = null) {
  const s = live || spacingOf(note);
  const ed = $('editor');
  ed.style.setProperty('--lh', String(Math.round(s.lh * SINGLE * 1000) / 1000));
  ed.style.setProperty('--ls', `${s.ls}em`);
  ed.style.setProperty('--ws', `${s.ws}em`);
  $('btn-spacing').textContent = `Line ${fmt.lh(s.lh)}`;
  $('btn-spacing').classList.toggle('own', !!s.own);
}
let spacingTimer = null;
function openSpacing(anchor) {
  const note = app.note();
  if (!note || note.deleted) return;
  const dlg = $('spacing-dialog');
  const s = spacingOf(note);
  for (const k of ['lh', 'ls', 'ws']) { $(`sp-${k}`).value = String(s[k]); $(`sp-${k}-v`).textContent = fmt[k](s[k]); }
  dlg.style.top = '';
  dlg.style.left = '';
  dlg.showModal();
  if (!isPhone()) {
    const r = anchor.getBoundingClientRect();
    dlg.style.top = `${Math.round(Math.max(8, Math.min(r.bottom + 4, window.innerHeight - dlg.offsetHeight - 8)))}px`;
    dlg.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - dlg.offsetWidth - 8)))}px`;
  }
}
function spacingInput() {
  const v = { lh: Number($('sp-lh').value), ls: Number($('sp-ls').value), ws: Number($('sp-ws').value), own: true };
  for (const k of ['lh', 'ls', 'ws']) $(`sp-${k}-v`).textContent = fmt[k](v[k]);
  applySpacing(app.note(), v);
  clearTimeout(spacingTimer);
  spacingTimer = setTimeout(() => { const n = app.note(); if (n) app.update({ meta: { ...(n.meta || {}), lh: v.lh, ls: v.ls, ws: v.ws } }); }, 300);
}

// ---- Brackets --------------------------------------------------------------------
// True when copying and pasting should leave the [labels] out: Brackets on, "Copy [ ]" unticked.
export function dropLabels() {
  const note = app.note();
  return !!note && !isCodeNote(note) && !!note.meta?.brackets && app.prefs().bracketCopy === false;
}

// ---- Capitals (the Aa button) --------------------------------------------------------
async function changeCase() {
  const note = app.note();
  if (!note || note.deleted || isCodeNote(note)) return;
  let mode = null;
  let undo = null;
  if (rich.active()) {
    ({ mode, undo } = rich.recase(capitals.recase));
  } else {
    const ta = $('body');
    const a = ta.selectionStart;
    const b = ta.selectionEnd;
    const sel = b > a;
    const before = ta.value;
    const r = capitals.recase([{ text: ta.value, markdown: note.format === 'markdown', editable: sel ? (i) => i >= a && i < b : null }]);
    mode = r.mode;
    if (mode) {
      ta.focus();
      applyEdit(ta, r.texts[0], a, b); // stays undoable with Ctrl+Z too
      undo = () => { applyEdit(ta, before, a, b); };
    }
  }
  if (!mode) { app.toast('Nothing to change.'); return; }
  log.info('format', 'Capitals', { mode });
  app.toast(mode === 'capitalize' ? 'Capitalized' : 'Made lowercase', 'Undo', undo);
}
let bracketTimer = null;
export function paintBrackets() {
  const note = app.note();
  const on = !!note && !isCodeNote(note) && !!note.meta?.brackets;
  const pv = $('preview');
  if (rich.active()) brackets.paint('rm-brackets', $('rich'), on);
  else if (!pv.hidden) brackets.paint('rm-brackets', pv, on);
  else brackets.paint('rm-brackets', null, false);
  brackets.paintBehind($('bracket-layer'), $('body'), on && !rich.active() && !$('body').hidden && pv.hidden);
}

// ---- Folding (computer) -------------------------------------------------------------------
// Three parts, Title, Tags and Formatting, and one of them open at a time. Inside Formatting, each
// row (Buttons, Format & Font, Options) folds, and so does each labelled box in it.
const listPref = (key) => (Array.isArray(app.prefs()[key]) ? app.prefs()[key] : []);
const closedGroups = () => listPref('closedGroups');
// The open part: 'meta', 'format' or null. Before v0.16.5 each part folded on its own (closedParts).
function openPart() {
  const p = app.prefs();
  if (p.openPart !== undefined) return p.openPart === 'meta' ? 'title' : p.openPart; // Title & Tags (v0.17.1–v0.17.2) is now Title
  const old = listPref('closedParts');
  if (!old.includes('format')) return 'format';
  if (!old.includes('title')) return 'title';
  if (!old.includes('tags')) return 'tags';
  return null;
}
function applyParts() {
  const open = openPart();
  const groups = closedGroups();
  const lines = listPref('closedLines');
  document.querySelectorAll('.ed-part').forEach((p) => {
    const closed = p.dataset.part !== open;
    p.classList.toggle('closed', closed);
    document.querySelector(`#ed-heads .ed-head[data-part="${p.dataset.part}"]`)?.setAttribute('aria-expanded', String(!closed));
  });
  document.querySelectorAll('#rb-panels .rb-line').forEach((l) => {
    const closed = lines.includes(l.dataset.line);
    l.classList.toggle('closed', closed);
    l.querySelector(':scope > .rb-line-head')?.setAttribute('aria-expanded', String(!closed));
  });
  document.querySelectorAll('#rb-panels .rb-sec[data-label], #rb-panels .rb-box[data-box]').forEach((sec) => {
    const closed = groups.includes(sec.dataset.label || sec.dataset.box);
    sec.classList.toggle('closed', closed);
    sec.querySelector(':scope > .rb-label')?.setAttribute('aria-expanded', String(!closed));
  });
  fitToolbar();
}
function togglePart(part) {
  app.setPrefs({ openPart: openPart() === part ? null : part });
  applyParts();
}
function toggleIn(key, value) {
  const list = Array.isArray(app.prefs()[key]) ? app.prefs()[key] : [];
  app.setPrefs({ [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] });
  applyParts();
}

let lastRendered = null;
function renderPreview(note) {
  const pv = $('preview');
  const body = $('body');
  if (!note || !previewOn) {
    pv.hidden = true;
    lastRendered = null;
    codeUi.showPreview(null, false);
    if (note) { body.hidden = false; codeUi.render(note); }
    return;
  }
  if (isCodeNote(note)) {
    // Re-render only when the code or note changed (saving re-renders the toolbar).
    const sig = `${note.id}:${note.updated_at}:${note.body.length}`;
    if (sig !== lastRendered) { lastRendered = sig; codeUi.showPreview(note, true); }
    return;
  }
  codeUi.showPreview(null, false);
  body.hidden = true;
  pv.hidden = false;
  const citer = citerFor(note);
  const ctx = { cite: citer.cite, ncite: citer.ncite, readOnly: !!note.deleted };
  let html = F.noteToHtml(note.body, fmtOf(note), ctx);
  const refs = C.referenceList(sourcesOf(note), styleOf(note));
  if (refs.length) {
    html += `<section class="refs"><h2>${C.referenceHeading(styleOf(note))}</h2>${refs.map((r) => `<p>${r.runs.map((x) => (x.italic ? `<em>${F.escapeHtml(x.text)}</em>` : F.escapeHtml(x.text))).join('')}</p>`).join('')}</section>`;
  }
  pv.innerHTML = html || '<p class="hint">Nothing to preview yet.</p>';
  paintBrackets();
}

// Replace the text with `value` the way typing would, so Ctrl+Z / Undo still works.
// Only the part that changed is rewritten.
export function applyEdit(ta, value, start, end) {
  const old = ta.value;
  if (value !== old) {
    let p = 0;
    const max = Math.min(old.length, value.length);
    while (p < max && old[p] === value[p]) p++;
    let q = 0;
    while (q < max - p && old[old.length - 1 - q] === value[value.length - 1 - q]) q++;
    ta.setSelectionRange(p, old.length - q);
    const mid = value.slice(p, value.length - q);
    let ok = false;
    try { ok = mid ? document.execCommand('insertText', false, mid) : document.execCommand('delete'); } catch { ok = false; }
    if (!ok || ta.value !== value) {
      ta.value = value;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  ta.setSelectionRange(start, end);
}

// The List button in a Markdown or Populi note: the lines the selection touches step through
// bullets, numbers, a checklist (Markdown) and back to plain lines.
const LIST_KIND = (line) => (/^\s*[-*+]\s+\[[ xX]\]\s/.test(line) ? 'task' : /^\s*[-*+]\s/.test(line) ? 'ul' : /^\s*\d+[.)]\s/.test(line) ? 'ol' : 'none');
const stripList = (l) => l.replace(/^(\s*)([-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '$1');
export function cycleListText(value, start, end, { tasks = true } = {}) {
  const ls = value.lastIndexOf('\n', start - 1) + 1;
  let le = value.indexOf('\n', end);
  if (le < 0) le = value.length;
  const lines = value.slice(ls, le).split('\n');
  const order = tasks ? ['none', 'ul', 'ol', 'task'] : ['none', 'ul', 'ol'];
  const next = order[(order.indexOf(LIST_KIND(lines[0])) + 1) % order.length];
  let n = 0;
  const out = lines.map((l) => {
    if (!l.trim()) return l;
    const [, lead, rest] = /^(\s*)([\s\S]*)$/.exec(stripList(l));
    if (next === 'none') return lead + rest;
    if (next === 'ul') return `${lead}- ${rest}`;
    if (next === 'ol') return `${lead}${++n}. ${rest}`;
    return `${lead}- [ ] ${rest}`;
  }).join('\n');
  return { value: value.slice(0, ls) + out + value.slice(le), start: ls, end: ls + out.length, kind: next };
}

export function applyToolById(id, { tasks = true } = {}) {
  const note = app.note();
  if (!note || note.deleted) return;
  if (rich.active()) { rich.apply(id, { tasks }); return; }
  if (id === 'list') {
    const ta = $('body');
    const r = cycleListText(ta.value, ta.selectionStart, ta.selectionEnd, { tasks: tasks && F.TOOLBAR[fmtOf(note)].some((t) => t.id === 'task') });
    ta.focus();
    applyEdit(ta, r.value, r.start, r.end);
    return;
  }
  const tool = F.TOOLBAR[fmtOf(note)].find((t) => t.id === id);
  if (!tool) return;
  const ta = $('body');
  const run = (extra = {}) => {
    const r = F.applyTool(tool, ta.value, ta.selectionStart, ta.selectionEnd, { ...extra, format: fmtOf(note) });
    ta.focus();
    if (tool.indent || tool.id === 'ul' || tool.id === 'ol') {
      applyEdit(ta, r.value, r.start, r.end); // list edits stay undoable
    } else {
      ta.value = r.value;
      ta.setSelectionRange(r.start, r.end);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  if (tool.link) {
    const sel = { s: ta.selectionStart, e: ta.selectionEnd };
    app.ask({ title: 'Add a link', value: 'https://', okText: 'Add link' }).then((r) => {
      if (r.action !== 'ok' || !/^(https?:\/\/|mailto:)\S+/i.test(r.value)) return;
      ta.setSelectionRange(sel.s, sel.e);
      run({ url: r.value });
    });
    return;
  }
  run();
}

// ---- Format conversion --------------------------------------------------
async function changeFormat(to) {
  const note = app.note();
  if (!note || (note.format || 'markdown') === to) return;
  if (to === 'text' || note.format === 'text') rich.saveCaret();
  await app.flushSave();
  const current = app.note();
  if (isCode(to) || isCode(current.format)) {
    // Code and writing formats share plain text, so nothing is converted.
    const before = current.format || 'markdown';
    previewOn = false;
    await app.update({ format: to });
    if (isCode(to)) app.setPrefs({ codeLang: to });
    log.info('format', 'Note type changed', { from: before, to });
    app.toast(isCode(to) ? `This note is now ${LANGS[to].label} code` : `This note is now ${to === 'populi' ? 'Populi' : 'Markdown'}`, 'Undo', () => app.update({ format: before }));
    return;
  }
  const from = current.format || 'markdown';
  // Text and Markdown are the same text underneath, so switching between them changes nothing.
  if (fmtOf(current) === fmtOf({ format: to })) {
    previewOn = false;
    await app.update({ format: to });
    log.info('format', 'Note type changed', { from, to });
    const runs = current.body.includes('[[f:') && to === 'markdown';
    app.toast(runs ? 'This note is now Markdown. Fonts on selected words show as [[f:…]] marks, and come back if you switch to Text.' : `This note is now ${FORMAT_NAMES[to]}`, 'Undo', () => app.update({ format: from }));
    return;
  }
  const result = to === 'populi' ? F.markdownToPopuli(current.body) : F.populiToMarkdown(current.body);
  if (result.lost.length) {
    const ok = await app.ask({
      title: `Convert to ${FORMAT_NAMES[to]}?`,
      text: `Populi has no equivalent for: ${result.lost.join(', ')}. Everything else carries over exactly. You can undo right after converting.`,
      okText: 'Convert',
    });
    if (ok.action !== 'ok') { $('note-format').value = from; return; }
  }
  const before = { body: current.body, format: from };
  await app.update({ body: result.text, format: to });
  app.setEditorText(result.text);
  log.info('format', 'Note converted', { from, to, simplified: result.lost });
  app.toast(`Converted to ${FORMAT_NAMES[to]}`, 'Undo', async () => {
    await app.update(before);
    app.setEditorText(before.body);
    log.info('format', 'Conversion undone');
  });
}

// ---- Copying ---------------------------------------------------------------
const referencesText = (note, target) => S.referencesText(note, target);
const plainText = (note, ctx) => S.plainText(note, ctx);

async function writeClipboard(text, html) {
  try {
    if (html && window.ClipboardItem && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      })]);
    } else {
      await navigator.clipboard.writeText(text);
    }
    return true;
  } catch (e) {
    log.warn('copy', 'Clipboard write failed', e);
    return false;
  }
}

async function copyAs(target) {
  await app.flushSave();
  const note = app.note();
  if (!note) return;
  const citer = citerFor(note);
  const ctx = { cite: citer.cite, ncite: citer.ncite };
  let text;
  if (isCodeNote(note)) text = note.body;
  else if (target === 'plain') text = S.titleLine(note) + plainText(note, ctx) + referencesText(note, 'plain');
  else text = S.titleLine(note, target) + F.exportNote(note.body, fmtOf(note), target, ctx) + referencesText(note, target);
  if (dropLabels()) text = brackets.stripLabels(text);
  const ok = await writeClipboard(text);
  $('copy-msg').textContent = ok ? `Copied ${target === 'populi' ? 'for Populi' : target === 'markdown' ? 'as Markdown' : 'as plain text'}.` : 'Copying was blocked. Try again.';
  $('copy-msg').className = `msg ${ok ? 'ok' : 'error'}`;
  log.info('copy', 'Note copied', { target, ok });
}

// ---- Sources ---------------------------------------------------------------
function renderSources() {
  const note = app.note();
  if (!note) return;
  const style = styleOf(note);
  $('sources-dialog').querySelectorAll('.seg-btn').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === style)));
  const list = C.referenceList(sourcesOf(note), style);
  const byId = new Map(sourcesOf(note).map((s) => [s.id, s]));
  const cited = C.citedKeys(note.body);
  $('source-list').innerHTML = list.length ? list.map((r) => {
    const s = byId.get(r.id);
    return `<li data-id="${r.id}">
      <p class="ref-text">${r.runs.map((x) => (x.italic ? `<em>${F.escapeHtml(x.text)}</em>` : F.escapeHtml(x.text))).join('')}</p>
      ${s.note ? `<p class="src-note">${F.escapeHtml(s.note)}</p>` : ''}
      <div class="src-actions">
        <span class="src-key">@${F.escapeHtml(s.key)}${cited.has(s.key) ? '' : ' · not cited yet'}</span>
        ${research.isResearchNote(note) ? `<select class="src-status" aria-label="Reading status">${research.statusOptions(s.status)}</select>` : ''}
        <button class="btn small" data-act="cite"${note.deleted ? ' disabled' : ''}>Cite</button>
        <button class="btn small" data-act="edit">Edit</button>
        <button class="btn small danger" data-act="delete">Delete</button>
      </div></li>`;
  }).join('') : '<li class="src-empty">No sources yet. Add the books, articles, and web pages you are citing.</li>';
  research.renderLibrary(note);
}

function openSources() {
  const ta = $('body');
  caret = { start: ta.selectionStart, end: ta.selectionEnd };
  $('sources-msg').textContent = '';
  renderSources();
  $('sources-dialog').showModal();
}

async function setStyle(style) {
  const note = app.note();
  if (!note || styleOf(note) === style) return;
  await saveMeta({ style });
  log.info('cite', 'Citation style changed', { style });
  renderSources();
  syncPaperForm();
  renderToolbar(app.note());
}

// Source form
function personRow(p = {}, kind = 'author') {
  const div = document.createElement('div');
  div.className = 'person';
  div.innerHTML = `<label>Last name<input data-f="family" autocomplete="off"></label>
    <label>First and middle<input data-f="given" autocomplete="off"></label>
    <button type="button" class="icon-btn" aria-label="Remove ${kind}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;
  div.querySelector('[data-f="family"]').value = p.family || '';
  div.querySelector('[data-f="given"]').value = p.given || '';
  div.querySelector('button').addEventListener('click', () => { div.remove(); updateSourcePreview(); });
  return div;
}

const SF = ['status', 'note', 'title', 'year', 'month', 'day', 'bookTitle', 'journal', 'volume', 'issue', 'edition', 'publisher', 'site', 'doi', 'url', 'accessed', 'key', 'org'];
let editingId = null;

function readSourceForm() {
  const s = C.blankSource($('sf-type').value);
  for (const f of SF) s[f] = $(`sf-${f}`).value.trim();
  s.pages = (s.type === 'article' ? $('sf-pages-a') : $('sf-pages-c')).value.trim();
  const people = (holder) => [...$(holder).querySelectorAll('.person')].map((d) => ({
    family: d.querySelector('[data-f="family"]').value.trim(),
    given: d.querySelector('[data-f="given"]').value.trim(),
  })).filter((p) => p.family || p.given);
  if ($('sf-is-org').checked) { s.authors = []; } else { s.org = ''; s.authors = people('sf-people'); }
  s.editors = s.type === 'chapter' ? people('sf-editors') : [];
  s.id = editingId || '';
  return s;
}

function showFieldsFor(type) {
  $('source-form').querySelectorAll('[data-for]').forEach((el) => {
    el.hidden = !el.dataset.for.split(' ').includes(type);
  });
}

function updateSourcePreview() {
  const s = readSourceForm();
  const fmt = (runs) => runs.map((x) => (x.italic ? `<em>${F.escapeHtml(x.text)}</em>` : F.escapeHtml(x.text))).join('');
  const ok = s.title || C.hasAuthor(s);
  $('sf-prev-apa').innerHTML = ok ? fmt(C.formatReference(s, 'apa')) : '';
  $('sf-prev-mla').innerHTML = ok ? fmt(C.formatReference(s, 'mla')) : '';
}

function openSourceForm(source = null) {
  editingId = source?.id || null;
  const s = source || C.blankSource('book');
  $('source-form-title').textContent = source ? 'Edit source' : 'Add source';
  $('sf-type').value = s.type;
  for (const f of SF) $(`sf-${f}`).value = s[f] || '';
  $('sf-pages-a').value = s.type === 'article' ? s.pages || '' : '';
  $('sf-pages-c').value = s.type === 'chapter' ? s.pages || '' : '';
  $('sf-is-org').checked = !!s.org;
  $('sf-org-wrap').hidden = !s.org;
  $('sf-people').hidden = !!s.org;
  $('sf-add-person').hidden = !!s.org;
  $('sf-people').replaceChildren(...(s.authors?.length ? s.authors : [{}]).map((p) => personRow(p)));
  $('sf-editors').replaceChildren(...(s.editors || []).map((p) => personRow(p, 'editor')));
  $('sf-key').placeholder = 'Filled in automatically';
  $('sf-msg').textContent = '';
  showFieldsFor(s.type);
  $('source-form').querySelectorAll('[data-research]').forEach((x) => { x.hidden = !research.isResearchNote(app.note()); });
  updateSourcePreview();
  $('source-dialog').showModal();
}

async function saveSourceForm() {
  const note = app.note();
  if (!note) return false;
  const s = readSourceForm();
  if (!s.title) { $('sf-msg').textContent = 'Add a title.'; return false; }
  if (s.year && !/^\d{4}$/.test(s.year)) { $('sf-msg').textContent = 'Year should be four digits, or left blank if there is no date.'; return false; }
  if (s.month && !(+s.month >= 1 && +s.month <= 12)) { $('sf-msg').textContent = 'Month should be a number from 1 to 12.'; return false; }
  if (s.url && !/^https?:\/\//i.test(s.url)) { $('sf-msg').textContent = 'The URL should start with https://'; return false; }
  const others = sourcesOf(note).filter((x) => x.id !== s.id);
  const prev = sourcesOf(note).find((x) => x.id === s.id);
  if (s.key) {
    if (!/^[A-Za-z][A-Za-z0-9_:-]*$/.test(s.key)) { $('sf-msg').textContent = 'The citation key can use letters, numbers, - and _, and must start with a letter.'; return false; }
    if (others.some((x) => x.key === s.key)) { $('sf-msg').textContent = 'Another source already uses that key.'; return false; }
  } else {
    // Keep an existing key so citations in the text keep working.
    s.key = prev?.key || C.makeKey(s, others.map((x) => x.key));
  }
  let body = null;
  if (prev && prev.key !== s.key) {
    // A renamed key: update citations in the text to match.
    const re = new RegExp(`@${prev.key.replace(/[-:]/g, '\\$&')}(?![\\w:-])`, 'g');
    body = note.body.replace(re, `@${s.key}`);
  }
  if (!s.id) s.id = uuid();
  const sources = prev ? sourcesOf(note).map((x) => (x.id === s.id ? s : x)) : [...sourcesOf(note), s];
  const meta = { ...(note.meta || {}), sources, style: styleOf(note) };
  await app.update(body !== null ? { meta, body } : { meta });
  if (body !== null) app.setEditorText(body);
  log.info('cite', prev ? 'Source updated' : 'Source added', { type: s.type });
  return true;
}

async function deleteSource(id) {
  const note = app.note();
  const s = sourcesOf(note).find((x) => x.id === id);
  if (!s) return;
  const cited = C.citedKeys(note.body).has(s.key);
  const r = await app.ask({
    title: 'Delete this source?',
    text: cited ? `It is cited in this note as @${s.key}. Those citations will show as missing until you remove them.` : 'It is not cited in this note.',
    okText: 'Delete source',
  });
  if (r.action !== 'ok') { $('sources-dialog').showModal(); renderSources(); return; }
  await saveMeta({ sources: sourcesOf(note).filter((x) => x.id !== id) });
  log.info('cite', 'Source deleted');
  $('sources-dialog').showModal();
  renderSources();
  renderToolbar(app.note());
}

// Insert citation
let citeKind = 'paren';
let citeSource = null;
function updateCitePreview() {
  const note = app.note();
  const citer = citerFor(note);
  const loc = $('cite-loc').value.trim();
  const runs = citeKind === 'narrative' ? citer.ncite(citeSource.key) : citer.cite(`@${citeSource.key}${loc ? `, ${loc}` : ''}`);
  $('cite-preview').innerHTML = (runs || []).map((x) => (x.italic ? `<em>${F.escapeHtml(x.text)}</em>` : F.escapeHtml(x.text))).join('');
  $('cite-dialog').querySelectorAll('.seg-btn').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.kind === citeKind)));
  $('cite-loc-wrap').hidden = citeKind === 'narrative';
}
function openCite(source) {
  citeSource = source;
  citeKind = 'paren';
  $('cite-name').textContent = `@${source.key}`;
  $('cite-loc').value = '';
  updateCitePreview();
  const dlg = $('cite-dialog');
  dlg.returnValue = '';
  dlg.showModal();
  dlg.addEventListener('close', async () => {
    if (dlg.returnValue !== 'ok') { $('sources-dialog').showModal(); return; }
    const loc = $('cite-loc').value.trim().replace(/[\]\n;]/g, '');
    const token = citeKind === 'narrative' ? `@${source.key}` : `[@${source.key}${loc ? `, ${loc}` : ''}]`;
    insertAtCaret(token);
    log.info('cite', 'Citation inserted', { kind: citeKind });
  }, { once: true });
}

function insertAtCaret(text) {
  if (previewOn) { previewOn = false; renderToolbar(app.note()); }
  if (rich.active()) { rich.insertText(text); return; }
  const ta = $('body');
  const v = ta.value;
  const start = Math.min(caret.start, v.length);
  const end = Math.min(caret.end, v.length);
  const before = v.slice(0, start);
  const pad = before && !/[\s(]$/.test(before) ? ' ' : '';
  ta.value = before + pad + text + v.slice(end);
  const pos = start + pad.length + text.length;
  ta.focus();
  ta.setSelectionRange(pos, pos);
  caret = { start: pos, end: pos };
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

async function copyReferences() {
  const note = app.note();
  const refs = C.referenceList(sourcesOf(note), styleOf(note));
  if (!refs.length) return;
  const text = refs.map((r) => C.runsToText(r.runs)).join('\n\n');
  const html = refs.map((r) => `<p style="margin-left:.5in;text-indent:-.5in;font-family:'Times New Roman';font-size:12pt;line-height:2">${r.runs.map((x) => (x.italic ? `<i>${F.escapeHtml(x.text)}</i>` : F.escapeHtml(x.text))).join('')}</p>`).join('');
  const ok = await writeClipboard(text, html);
  $('sources-msg').textContent = ok ? 'Copied with italics. Paste into Word, Google Docs, or Pages.' : 'Copying was blocked. Try again.';
  $('sources-msg').className = `msg ${ok ? 'ok' : 'error'}`;
}

// ---- Paper -------------------------------------------------------------
function paperData(note) {
  const d = P.defaultPaper(note);
  const p = note.meta?.paper || {};
  return { ...d, ...p, mla: { ...d.mla, ...(p.mla || {}) }, apa: { ...d.apa, ...(p.apa || {}) } };
}

function syncPaperForm() {
  const note = app.note();
  if (!note || !$('paper-dialog').open) return;
  const style = styleOf(note);
  $('paper-dialog').querySelectorAll('.seg-btn').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.style === style)));
  $('pp-mla').hidden = style !== 'mla';
  $('pp-apa').hidden = style !== 'apa';
  // Carry shared details across styles when the other style's field is empty.
  const pairs = [['pp-mla-name', 'pp-apa-author'], ['pp-mla-instructor', 'pp-apa-instructor'], ['pp-mla-course', 'pp-apa-course']];
  let copied = false;
  for (const [m, a] of pairs) {
    const [to, from] = style === 'mla' ? [m, a] : [a, m];
    if (!$(to).value.trim() && $(from).value.trim()) { $(to).value = $(from).value.trim(); copied = true; }
  }
  if (copied) schedulePaperSave();
}

function openPaper() {
  const note = app.note();
  if (!note) return;
  const p = paperData(note);
  $('pp-title').value = p.title;
  $('pp-date').value = p.date;
  for (const f of ['name', 'instructor', 'course']) $(`pp-mla-${f}`).value = p.mla[f] || '';
  for (const f of ['author', 'affiliation', 'course', 'instructor']) $(`pp-apa-${f}`).value = p.apa[f] || '';
  // Fill the other style's name when only one has been entered.
  if (!p.mla.name && p.apa.author) $('pp-mla-name').value = p.apa.author;
  if (!p.apa.author && p.mla.name) $('pp-apa-author').value = p.mla.name;
  $('paper-msg').textContent = '';
  $('paper-dialog').showModal();
  syncPaperForm();
}

function readPaperForm() {
  return {
    title: $('pp-title').value.trim(),
    date: $('pp-date').value,
    mla: { name: $('pp-mla-name').value.trim(), instructor: $('pp-mla-instructor').value.trim(), course: $('pp-mla-course').value.trim() },
    apa: { author: $('pp-apa-author').value.trim(), affiliation: $('pp-apa-affiliation').value.trim(), course: $('pp-apa-course').value.trim(), instructor: $('pp-apa-instructor').value.trim() },
  };
}

let paperTimer = null;
function schedulePaperSave() {
  clearTimeout(paperTimer);
  paperTimer = setTimeout(() => saveMeta({ paper: readPaperForm() }), 500);
}
async function flushPaper() {
  if (paperTimer) { clearTimeout(paperTimer); paperTimer = null; await saveMeta({ paper: readPaperForm() }); }
}

function isTouchDevice() { return window.matchMedia('(pointer: coarse)').matches; }

export async function saveFile(bytes, name, type) {
  const blob = new Blob([bytes], { type });
  // On phones, the share sheet is the dependable way to save into Files.
  try {
    const file = new File([blob], name, { type });
    if (isTouchDevice() && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled';
    log.warn('file', 'Share sheet unavailable, downloading instead', e);
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  return 'downloaded';
}

async function downloadDocx(msgEl) {
  await app.flushSave();
  await flushPaper();
  const note = app.note();
  const layout = P.layoutPaper(note);
  const missing = C.citedKeys(note.body);
  const unknown = [...missing].filter((k) => /\d/.test(k) && !sourcesOf(note).some((s) => s.key === k));
  const bytes = P.paperToDocx(layout, paperData(note)[styleOf(note) === 'mla' ? 'mla' : 'apa'][styleOf(note) === 'mla' ? 'name' : 'author'] || '');
  const name = P.safeFileName(layout.title, 'docx');
  const how = await saveFile(bytes, name, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  log.info('paper', 'Word file created', { style: layout.style, bytes: bytes.length, how });
  if (msgEl) {
    msgEl.textContent = how === 'cancelled' ? '' : `${name} is ready.${unknown.length ? ` Note: no source matches ${unknown.map((k) => `@${k}`).join(', ')}.` : ''}`;
    msgEl.className = 'msg ok';
  }
}

let pageRuleIndex = -1;
function setPrintHeader(text) {
  // Page numbers in print come from an @page rule added with CSSOM (allowed by the security policy).
  const sheet = [...document.styleSheets].find((s) => (s.href || '').endsWith('styles.css'));
  if (!sheet) return;
  try {
    if (pageRuleIndex >= 0) sheet.deleteRule(pageRuleIndex);
    const label = text.replace(/["\\]/g, '');
    pageRuleIndex = sheet.insertRule(`@page { @top-right { content: "${label}" counter(page); font: 12pt "Times New Roman", serif; } }`, sheet.cssRules.length);
  } catch {
    pageRuleIndex = -1; // This browser does not support page-margin boxes.
  }
}

async function openPaperView() {
  await app.flushSave();
  await flushPaper();
  const layout = P.layoutPaper(app.note());
  $('paper-sheet').innerHTML = P.paperToHtml(layout);
  setPrintHeader(layout.headerText);
  $('paper-dialog').close();
  $('paper-view').hidden = false;
  log.info('paper', 'Paper preview opened', { style: layout.style });
}

// ---- Wiring --------------------------------------------------------------
export function init(hooks) {
  app = hooks;
  codeUi.init(hooks);
  storyUi.init(hooks);
  rich.init(hooks);
  fonts.fillFontSelect($('note-font'), { hidden: app.prefs().hiddenFonts || [] });
  codingUi.init(hooks);
  research.init(hooks, { renderSources, saveMeta, insertText: (t) => insertAtCaret(t), sourcesOf, styleOf, citerFor });

  // Each labelled group gets its name as a button that folds it to just that name.
  document.querySelectorAll('#rb-panels .rb-sec[data-label], #rb-panels .rb-box[data-box]').forEach((sec) => {
    const name = sec.dataset.label || sec.dataset.box;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rb-label';
    b.textContent = name;
    b.title = sec.dataset.box ? `Show or hide ${name}` : `Show or hide the ${name} buttons`;
    b.setAttribute('aria-expanded', 'true');
    b.addEventListener('click', () => toggleIn('closedGroups', name));
    sec.prepend(b);
  });
  document.querySelectorAll('.ed-head').forEach((h) => h.addEventListener('click', () => togglePart(h.dataset.part)));
  document.querySelectorAll('.rb-line-head').forEach((h) => h.addEventListener('click', () => toggleIn('closedLines', h.dataset.line)));
  // Copy [ ]: with Brackets on, whether copying and pasting keep the labels (this device).
  $('note-brackets-copy').addEventListener('change', (e) => { app.setPrefs({ bracketCopy: e.target.checked }); log.info('format', 'Copy with brackets', { on: e.target.checked }); });
  $('note-brackets-copy-wrap').addEventListener('click', (e) => e.stopPropagation());
  $('btn-case').addEventListener('click', changeCase);
  // The phone's bar: the everyday tools straight away, the rest under More.
  const bar = $('phone-bar');
  bar.addEventListener('pointerdown', (e) => { if (e.target.closest('button.pb') && (document.activeElement === $('body') || document.activeElement === $('rich'))) e.preventDefault(); });
  bar.addEventListener('mousedown', (e) => { if (e.target.closest('button.pb') && (document.activeElement === $('body') || document.activeElement === $('rich'))) e.preventDefault(); });
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button.pb');
    if (!b || b.disabled) return;
    const what = b.dataset.pb;
    if (what === 'undo') $('btn-undo').click();
    else if (what === 'redo') $('btn-redo').click();
    else if (what === 'list') applyToolById('list', { tasks: false });
    else if (what === 'case') changeCase();
    else if (what === 'brackets') $('note-brackets').click();
    else if (what === 'more') {
      const open = $('toolbar').dataset.more !== 'on';
      $('toolbar').dataset.more = open ? 'on' : 'off';
      b.setAttribute('aria-expanded', String(open));
      if (!open) { ribbonOpen.clear(); syncRibbon(); }
    } else applyToolById(what);
  });
  $('pb-font').addEventListener('change', (e) => { const f = $('note-font'); f.value = e.target.value; f.dispatchEvent(new Event('change', { bubbles: true })); });
  // Insert on a computer is one menu of the Insert buttons that apply to this note.
  $('btn-insert-menu').addEventListener('click', (e) => {
    const sec = e.currentTarget.closest('.rb-sec');
    const items = [...sec.querySelectorAll('.tool:not(.insert-menu)')].filter((b) => !b.hidden).map((b) => ({
      label: { quote: 'Quote', code: 'Code', link: 'Link…' }[b.dataset.tool] || (b.id === 'btn-quote' ? 'Quote a source…' : b.id === 'btn-sources' ? `${b.textContent.trim()}…` : b.textContent.trim()),
      hint: b.dataset.tool === 'quote' ? 'A quoted passage' : b.dataset.tool === 'code' ? 'Code in the text' : b.id === 'btn-sources' ? 'Add sources and cite them' : '',
      disabled: b.disabled,
      run: () => b.click(),
    }));
    app.menu(e.currentTarget, 'Insert', items);
  });
  // Markdown and Populi notes: copying, cutting and pasting without the labels.
  const ta = $('body');
  const plainCopy = (e) => {
    if (!dropLabels() || rich.active() || ta.selectionEnd <= ta.selectionStart || !e.clipboardData) return;
    const note = app.note();
    e.clipboardData.setData('text/plain', brackets.stripLabels(ta.value.slice(ta.selectionStart, ta.selectionEnd), { markdown: note?.format === 'markdown' }));
    e.preventDefault();
    if (e.type === 'cut' && !ta.readOnly) applyEdit(ta, ta.value.slice(0, ta.selectionStart) + ta.value.slice(ta.selectionEnd), ta.selectionStart, ta.selectionStart);
  };
  ta.addEventListener('copy', plainCopy);
  ta.addEventListener('cut', plainCopy);
  ta.addEventListener('paste', (e) => {
    if (!dropLabels() || rich.active() || ta.readOnly || !e.clipboardData) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const kept = brackets.stripLabels(text);
    const a = ta.selectionStart;
    applyEdit(ta, ta.value.slice(0, a) + kept + ta.value.slice(ta.selectionEnd), a + kept.length, a + kept.length);
  });
  $('note-brackets').addEventListener('change', (e) => {
    const note = app.note();
    if (!note) return;
    app.update({ meta: { ...(note.meta || {}), brackets: e.target.checked } });
    log.info('format', 'Brackets', { on: e.target.checked });
  });
  $('body').addEventListener('input', () => { clearTimeout(bracketTimer); bracketTimer = setTimeout(paintBrackets, 80); });
  $('body').addEventListener('scroll', () => { $('bracket-layer').scrollTop = $('body').scrollTop; });
  $('btn-spacing').addEventListener('click', (e) => openSpacing(e.currentTarget));
  for (const k of ['lh', 'ls', 'ws']) $(`sp-${k}`).addEventListener('input', spacingInput);
  $('sp-reset').addEventListener('click', async () => {
    clearTimeout(spacingTimer);
    const n = app.note();
    if (!n) return;
    const meta = { ...(n.meta || {}) };
    delete meta.lh; delete meta.ls; delete meta.ws;
    await app.update({ meta });
    const s = spacingOf(app.note());
    for (const k of ['lh', 'ls', 'ws']) { $(`sp-${k}`).value = String(s[k]); $(`sp-${k}-v`).textContent = fmt[k](s[k]); }
  });
  $('sp-done').addEventListener('click', () => $('spacing-dialog').close());
  $('spacing-dialog').addEventListener('click', (e) => {
    const d = e.currentTarget; const r = d.getBoundingClientRect();
    if (e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) d.close();
  });
  $('rb-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.rb-chip');
    if (!chip) return;
    const sec = chip.dataset.sec;
    const wasOpen = chip.getAttribute('aria-expanded') === 'true';
    if (isPhone()) ribbonOpen.clear();
    if (wasOpen) ribbonOpen.delete(sec); else ribbonOpen.add(sec);
    syncRibbon();
  });
  // Buttons in the ribbon keep the text box focused, so a phone keeps its keyboard up.
  $('toolbar').addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' && e.target.closest('.tool, .rb-chip') && (document.activeElement === $('body') || document.activeElement === $('rich'))) e.preventDefault(); });
  $('toolbar').addEventListener('mousedown', (e) => { if (e.target.closest('.tool, .rb-chip') && (document.activeElement === $('body') || document.activeElement === $('rich'))) e.preventDefault(); });
  $('ed-top').addEventListener('mousedown', (e) => { if (e.target.closest('.rb-label, .ed-head, .rb-line-head') && document.activeElement === $('rich')) e.preventDefault(); });
  $('ed-heads').addEventListener('mousedown', (e) => { if (e.target.closest('.ed-head') && document.activeElement === $('rich')) e.preventDefault(); });
  // With words selected, the Font menu sets the font of those words only (Text and Markdown notes);
  // with nothing selected it sets the font of the whole note.
  $('note-font').addEventListener('change', async (e) => {
    const note = app.note();
    if (!note) return;
    const id = e.target.value;
    const own = fonts.fontId(note.meta?.font);
    if (rich.active() && rich.hasSelection()) {
      e.target.value = own;
      if (rich.applyFont(id, own)) { app.toast(`${fonts.fontName(id)} for the selected text`); log.info('format', 'Font set on selected text', { font: id }); }
      return;
    }
    const ta = $('body');
    if (!rich.active() && note.format === 'markdown' && !isCodeNote(note) && ta.selectionEnd > ta.selectionStart) {
      e.target.value = own;
      const { selectionStart: a, selectionEnd: b } = ta;
      const words = ta.value.slice(a, b);
      applyEdit(ta, `${ta.value.slice(0, a)}[[f:${id}]]${words}[[/f]]${ta.value.slice(b)}`, a + id.length + 6, a + id.length + 6 + words.length);
      app.toast(`${fonts.fontName(id)} for the selected text`);
      return;
    }
    await app.update({ meta: { ...(note.meta || {}), font: id } });
    log.info('format', 'Note font changed', { font: id });
  });
  window.addEventListener('resize', syncRibbon);
  // Fonts load after the first drawing; measure again once they have.
  document.fonts?.addEventListener?.('loadingdone', fitToolbar);
  document.fonts?.ready?.then(fitToolbar);
  $('rb-panels').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (b) applyToolById(b.dataset.tool);
  });
  // Lists: Enter continues, Tab / Shift+Tab move an item in and out, Ctrl+Shift+8 / 7 start a list.
  $('body').addEventListener('keydown', (e) => {
    const note = app.note();
    if (!note || note.deleted || isCodeNote(note) || e.isComposing || e.altKey) return;
    const ta = $('body');
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const r = F.listEnter(ta.value, ta.selectionStart, ta.selectionEnd);
      if (r) { e.preventDefault(); applyEdit(ta, r.value, r.start, r.end); }
    } else if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
      const r = F.listIndent(ta.value, ta.selectionStart, ta.selectionEnd, e.shiftKey ? -1 : 1);
      if (r.value !== ta.value) { e.preventDefault(); applyEdit(ta, r.value, r.start, r.end); }
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'Digit8' || e.code === 'Digit7')) {
      e.preventDefault();
      applyToolById(e.code === 'Digit8' ? 'ul' : 'ol');
    }
  });
  $('body').addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    const note = app.note();
    if (isCodeNote(note)) return;
    const tool = note && F.TOOLBAR[fmtOf(note)].find((t) => t.key === k);
    if (tool) { e.preventDefault(); applyToolById(tool.id); }
  });
  $('note-format').addEventListener('change', (e) => changeFormat(e.target.value));
  $('btn-preview').addEventListener('click', async () => {
    await app.flushSave();
    previewOn = !previewOn;
    renderToolbar(app.note());
  });
  $('preview').addEventListener('change', async (e) => {
    const box = e.target.closest('input[type="checkbox"][data-line]');
    const note = app.note();
    if (!box || !note || note.deleted) return;
    const body = F.toggleTaskLine(note.body, +box.dataset.line);
    await app.update({ body });
    app.setEditorText(body);
  });

  // Copy
  $('btn-copy').addEventListener('click', () => {
    const code = isCodeNote(app.note());
    $('btn-copy-populi').hidden = code;
    $('btn-copy-md').hidden = code;
    $('btn-copy-plain').textContent = code ? 'Copy code' : 'Copy as plain text';
    $('copy-dialog').querySelector('.hint').hidden = code;
    $('copy-msg').textContent = '';
    $('copy-dialog').showModal();
  });
  $('btn-copy-populi').addEventListener('click', () => copyAs('populi'));
  $('btn-copy-md').addEventListener('click', () => copyAs('markdown'));
  $('btn-copy-plain').addEventListener('click', () => copyAs('plain'));
  $('btn-copy-close').addEventListener('click', () => $('copy-dialog').close());

  // Sources
  $('btn-sources').addEventListener('click', openSources);
  $('btn-close-sources').addEventListener('click', () => $('sources-dialog').close());
  $('sources-dialog').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => setStyle(b.dataset.style)));
  $('btn-add-source').addEventListener('click', () => { $('sources-dialog').close(); openSourceForm(); });
  $('btn-copy-refs').addEventListener('click', copyReferences);
  $('source-list').addEventListener('change', async (e) => {
    const sel = e.target.closest('.src-status');
    if (!sel) return;
    const id = sel.closest('li').dataset.id;
    const note = app.note();
    await saveMeta({ sources: sourcesOf(note).map((x) => (x.id === id ? { ...x, status: sel.value } : x)) });
    log.info('research', 'Reading status changed', { status: sel.value });
    renderSources();
  });
  $('source-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('li').dataset.id;
    const s = sourcesOf(app.note()).find((x) => x.id === id);
    if (!s) return;
    $('sources-dialog').close();
    if (btn.dataset.act === 'edit') openSourceForm(s);
    else if (btn.dataset.act === 'delete') deleteSource(id);
    else openCite(s);
  });

  // Source form
  $('sf-type').addEventListener('change', () => { showFieldsFor($('sf-type').value); updateSourcePreview(); });
  $('sf-is-org').addEventListener('change', () => {
    const org = $('sf-is-org').checked;
    $('sf-org-wrap').hidden = !org;
    $('sf-people').hidden = org;
    $('sf-add-person').hidden = org;
    updateSourcePreview();
  });
  $('sf-add-person').addEventListener('click', () => { $('sf-people').appendChild(personRow()); });
  $('sf-add-editor').addEventListener('click', () => { $('sf-editors').appendChild(personRow({}, 'editor')); });
  $('source-form').addEventListener('input', updateSourcePreview);
  $('source-form').addEventListener('submit', async (e) => {
    if (e.submitter?.value !== 'save') return;
    e.preventDefault();
    if (await saveSourceForm()) {
      $('source-dialog').close();
      renderToolbar(app.note());
      openSources();
    }
  });
  $('source-dialog').addEventListener('close', () => {
    if ($('source-dialog').returnValue === 'cancel') openSources();
  });

  // Cite
  $('cite-dialog').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => { citeKind = b.dataset.kind; updateCitePreview(); }));
  $('cite-loc').addEventListener('input', updateCitePreview);

  // Paper
  $('btn-paper').addEventListener('click', openPaper);
  $('btn-close-paper').addEventListener('click', async () => { await flushPaper(); $('paper-dialog').close(); });
  $('paper-dialog').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => setStyle(b.dataset.style)));
  $('paper-dialog').addEventListener('input', schedulePaperSave);
  $('btn-paper-docx').addEventListener('click', () => downloadDocx($('paper-msg')));
  $('btn-paper-view').addEventListener('click', openPaperView);
  $('btn-paper-close').addEventListener('click', () => { $('paper-view').hidden = true; });
  $('btn-paper-print').addEventListener('click', () => window.print());
  $('btn-paper-docx2').addEventListener('click', () => downloadDocx(null));
}

// Put the caret in the note's text (the formatted page for Text notes).
export function focusText(atStart = false) {
  if (rich.focus(atStart)) return;
  const ta = $('body');
  ta.focus();
  if (atStart) { ta.setSelectionRange(0, 0); ta.scrollTop = 0; }
}

export function resetView() {
  previewOn = false;
}
export const isPreview = () => previewOn;
export const newNoteMeta = (prefs) => ({ style: prefs.style, ...(fonts.fontId(prefs.noteFont) !== fonts.DEFAULT_FONT ? { font: fonts.fontId(prefs.noteFont) } : {}), ...(prefs.brackets ? { brackets: true } : {}) });
// Notes without a saved style use the preferred style everywhere, including sharing.
export const setStyleDefault = (fn) => S.setDefaultStyle(fn);
