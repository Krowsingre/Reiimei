// Reiimei Research mode: project source library, quotes, and the outline panel.
// Research notes live in projects (see modes.js). A project's library is every source
// used by the notes in that project; importing copies a source from another project.
import { log } from './logger.js';
import * as F from './format.js';
import * as C from './cite.js';
import * as modes from './modes.js';
import { uuid } from './db.js';

const $ = (id) => document.getElementById(id);
let app = null;
let w = null; // helpers from ui-writing.js
let outlineOn = false;
let caret = { start: 0, end: 0 };
let libFor = null;

export const isResearchNote = (note) => !!note && !note.deleted && modes.kindOf(note) === 'research';
const esc = (t) => F.escapeHtml(String(t ?? ''));
const runsHtml = (runs) => runs.map((x) => (x.italic ? `<em>${esc(x.text)}</em>` : esc(x.text))).join('');

export const STATUS = { '': 'Not set', toread: 'To read', reading: 'Reading', done: 'Done' };
export const statusOptions = (cur = '') => Object.entries(STATUS).map(([v, l]) => `<option value="${v}"${v === (cur || '') ? ' selected' : ''}>${l}</option>`).join('');

// Two sources are "the same" when type, title, year, and first author match.
export function sourceSig(s) {
  const who = (s.org || s.authors?.[0]?.family || '').toLowerCase().trim();
  return [s.type, String(s.title || '').toLowerCase().replace(/\s+/g, ' ').trim(), s.year || '', who].join('|');
}

// ---- Library -------------------------------------------------------------------
export function librarySources(folderId) {
  const out = new Map();
  for (const n of app.projectNotes(folderId)) {
    for (const s of n.meta?.sources || []) if (!out.has(sourceSig(s))) out.set(sourceSig(s), s);
  }
  return [...out.values()];
}

// Copy a source into a note under a fresh id and a key that is free in that note.
export async function addCopy(note, source) {
  const have = note.meta?.sources || [];
  const hit = have.find((x) => sourceSig(x) === sourceSig(source));
  if (hit) return hit;
  const copy = { ...source, id: uuid() };
  copy.key = C.makeKey(copy, have.map((x) => x.key));
  await w.saveMeta({ sources: [...have, copy] });
  log.info('research', 'Source copied into note', { type: copy.type });
  return copy;
}

export function renderLibrary(note) {
  const box = $('library');
  const on = isResearchNote(note);
  box.hidden = !on;
  if (!on) return;
  const sel = $('lib-from');
  const here = note.folder_id;
  const projects = app.projects();
  // The picker starts on this note's own project and stays where you put it while you work on the note.
  const keep = libFor === note.id && sel.value && projects.some((p) => p.id === sel.value) ? sel.value : here;
  libFor = note.id;
  sel.innerHTML = projects.map((p) => `<option value="${p.id}">${esc(p.name)}${p.id === here ? ' (this project)' : ''}</option>`).join('');
  sel.value = keep;
  const mine = new Set((note.meta?.sources || []).map(sourceSig));
  const list = librarySources(sel.value).filter((s) => !mine.has(sourceSig(s)));
  const other = sel.value !== here;
  $('lib-hint').textContent = other
    ? 'Importing makes a copy in this note. Your sources in the other project are not changed.'
    : 'Sources used by other notes in this project that this note does not have yet.';
  const style = w.styleOf(note);
  $('lib-list').innerHTML = list.length ? list.map((s, i) => {
    const r = C.referenceList([s], style)[0];
    return `<li data-i="${i}"><p class="ref-text">${r ? runsHtml(r.runs) : esc(s.title)}</p>
      ${s.status ? `<span class="badge">${STATUS[s.status] || ''}</span>` : ''}
      ${s.note ? `<p class="src-note">${esc(s.note)}</p>` : ''}
      <div class="src-actions"><button class="btn small" data-act="add"${note.deleted ? ' disabled' : ''}>${other ? 'Import' : 'Add to this note'}</button></div></li>`;
  }).join('') : `<li class="src-empty">${other ? 'Nothing to import from there.' : 'This note already has every source in the project.'}</li>`;
  $('lib-list')._items = list;
}

// ---- Quotes --------------------------------------------------------------------
let quoteChoices = []; // { source, inNote }
function quoteSources(note) {
  const mine = note.meta?.sources || [];
  const seen = new Set(mine.map(sourceSig));
  const out = mine.map((s) => ({ source: s, inNote: true }));
  for (const s of librarySources(note.folder_id)) if (!seen.has(sourceSig(s))) out.push({ source: s, inNote: false });
  return out;
}

function savedQuotes(note) {
  const all = [];
  for (const n of app.projectNotes(note.folder_id)) for (const q of n.meta?.quotes || []) all.push({ ...q, fromNote: n.id });
  return all;
}

function refText(s, note) {
  const r = C.referenceList([s], w.styleOf(note))[0];
  return r ? r.runs.map((x) => x.text).join('') : s.title;
}

function renderQuoteDialog(note) {
  quoteChoices = quoteSources(note);
  $('q-source').innerHTML = quoteChoices.length
    ? quoteChoices.map((c, i) => `<option value="${i}">${esc(refText(c.source, note).slice(0, 90))}${c.inNote ? '' : ' (from project library)'}</option>`).join('')
    : '<option value="">No sources yet. Add one in Sources first.</option>';
  const saved = savedQuotes(note);
  $('q-saved').innerHTML = saved.length ? saved.map((q, i) => `<li data-i="${i}"><p class="ref-text">“${esc(q.text)}”</p><p class="src-note">${esc(q.src?.title || '')}${q.loc ? ', ' + esc(q.loc) : ''}</p>
    <div class="src-actions"><button class="btn small" data-act="insert">Insert</button><button class="btn small danger" data-act="remove">Remove</button></div></li>`).join('')
    : '<li class="src-empty">No saved quotes yet.</li>';
  $('q-saved')._items = saved;
  updateQuotePreview(note);
}

function updateQuotePreview(note) {
  const c = quoteChoices[+$('q-source').value];
  const text = $('q-text').value.trim();
  $('q-prev').textContent = c && text ? quoteText(text, c.source, $('q-loc').value.trim(), true) : '';
}

function quoteText(text, source, loc, preview = false) {
  const body = text.replace(/\s*\n\s*/g, ' ');
  const key = source.key || '';
  const tok = `[@${key}${loc ? `, ${loc.replace(/[\]\n;]/g, '')}` : ''}]`;
  return `> “${body}” ${tok}`;
}

async function resolveSource(note, choice) {
  if (choice.inNote) return choice.source;
  return addCopy(note, choice.source);
}

async function insertQuote(note, text, source, loc) {
  const ta = $('body');
  const line = quoteText(text, source, loc);
  const v = ta.value;
  const a = Math.min(caret.start, v.length), b = Math.min(caret.end, v.length);
  const before = v.slice(0, a), after = v.slice(b);
  const pre = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
  const post = after && !after.startsWith('\n\n') ? (after.startsWith('\n') ? '\n' : '\n\n') : '';
  ta.value = before + pre + line + post + after;
  const pos = (before + pre + line).length;
  ta.focus(); ta.setSelectionRange(pos, pos); caret = { start: pos, end: pos };
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  log.info('research', 'Quote inserted');
}

function openQuote() {
  const note = app.note();
  if (!isResearchNote(note)) return;
  const ta = $('body');
  caret = { start: ta.selectionStart, end: ta.selectionEnd };
  const sel = ta.value.slice(caret.start, caret.end).trim();
  $('q-text').value = sel;
  $('q-loc').value = '';
  $('q-msg').textContent = '';
  renderQuoteDialog(note);
  $('quote-dialog').showModal();
}

async function doQuote(insert) {
  const note = app.note();
  const text = $('q-text').value.trim();
  const choice = quoteChoices[+$('q-source').value];
  if (!text) { $('q-msg').textContent = 'Add the quote first.'; return; }
  if (!choice) { $('q-msg').textContent = 'Add a source first (Sources button).'; return; }
  const loc = $('q-loc').value.trim();
  const source = await resolveSource(note, choice);
  const fresh = app.note();
  const quotes = [...(fresh.meta?.quotes || []), { id: uuid(), text, loc, src: { type: source.type, title: source.title, year: source.year, authors: source.authors, org: source.org } }];
  await w.saveMeta({ quotes });
  log.info('research', 'Quote saved', { insert });
  if (insert) { $('quote-dialog').close(); await insertQuote(app.note(), text, source, loc); return; }
  $('q-msg').textContent = 'Saved to this project.';
  $('q-text').value = ''; $('q-loc').value = '';
  renderQuoteDialog(app.note());
}

async function savedAction(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const note = app.note();
  const q = $('q-saved')._items[+btn.closest('li').dataset.i];
  if (!q) return;
  if (btn.dataset.act === 'remove') {
    const owner = app.projectNotes(note.folder_id).find((n) => n.id === q.fromNote);
    if (owner) await app.updateNote(owner, { meta: { ...owner.meta, quotes: (owner.meta.quotes || []).filter((x) => x.id !== q.id) } });
    renderQuoteDialog(app.note());
    return;
  }
  // Insert: find the quote's source in this note or the library, copying it in if needed.
  const sig = sourceSig(q.src || {});
  const hit = quoteSources(note).find((c) => sourceSig(c.source) === sig);
  if (!hit) { $('q-msg').textContent = 'That quote’s source is no longer in this project. Add it in Sources first.'; return; }
  const source = await resolveSource(note, hit);
  $('quote-dialog').close();
  await insertQuote(app.note(), q.text, source, q.loc || '');
}

// ---- Outline ---------------------------------------------------------------------
// Headings are lines starting with # (Markdown). Lines inside code fences do not count.
export function headings(text) {
  const lines = text.split('\n');
  const out = [];
  let fence = false, offset = 0;
  lines.forEach((ln, i) => {
    if (/^\s*```/.test(ln)) fence = !fence;
    const m = !fence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(ln);
    if (m) out.push({ line: i, level: m[1].length, title: m[2], offset });
    offset += ln.length + 1;
  });
  return { lines, heads: out };
}

// The lines of heading i's section: up to the next heading of the same or a higher level.
function sectionEnd(heads, i, total) {
  for (let j = i + 1; j < heads.length; j++) if (heads[j].level <= heads[i].level) return heads[j].line;
  return total;
}

export function moveSection(text, i, dir) {
  const { lines, heads } = headings(text);
  const h = heads[i];
  if (!h) return null;
  let a, b; // two adjacent sibling sections, a before b
  if (dir < 0) {
    let j = i - 1;
    while (j >= 0 && heads[j].level > h.level) j--;
    if (j < 0 || heads[j].level !== h.level) return null;
    a = { s: heads[j].line, e: h.line }; b = { s: h.line, e: sectionEnd(heads, i, lines.length) };
  } else {
    const e = sectionEnd(heads, i, lines.length);
    const k = heads.findIndex((x) => x.line === e);
    if (k < 0 || heads[k].level !== h.level) return null;
    a = { s: h.line, e }; b = { s: e, e: sectionEnd(heads, k, lines.length) };
  }
  const A = lines.slice(a.s, a.e), B = lines.slice(b.s, b.e);
  // Keep a blank line between sections when one was at the end of the text.
  if (A.length && A[A.length - 1].trim() !== '' && b.e === lines.length) A.push('');
  const next = [...lines.slice(0, a.s), ...B, ...A, ...lines.slice(b.e)];
  return next.join('\n').replace(/\n+$/, (m) => (text.endsWith('\n') ? '\n' : ''));
}

function renderOutline() {
  const box = $('outline');
  const note = app.note();
  box.hidden = !(outlineOn && isResearchNote(note) && note.format !== 'populi');
  if (box.hidden) return;
  const { heads } = headings($('body').value);
  box.innerHTML = heads.length ? heads.map((h, i) => `<div class="ol-row" data-i="${i}" style="padding-left:${(h.level - 1) * 14}px">
      <button class="ol-title" data-act="jump">${esc(h.title)}</button>
      <button class="ol-move" data-act="up" aria-label="Move section up" title="Move section up">↑</button>
      <button class="ol-move" data-act="down" aria-label="Move section down" title="Move section down">↓</button></div>`).join('')
    : '<p class="ol-empty">No headings yet. Start a line with # to make one.</p>';
}

function jump(i) {
  const { heads } = headings($('body').value);
  const h = heads[i];
  if (!h) return;
  const ta = $('body');
  ta.focus();
  ta.setSelectionRange(h.offset, h.offset + h.title.length + h.level + 1);
  // Scroll the heading near the top: measure with a mirror of the text above it.
  const mirror = document.createElement('div');
  const cs = getComputedStyle(ta);
  mirror.style.cssText = `position:absolute;visibility:hidden;white-space:pre-wrap;word-wrap:break-word;width:${ta.clientWidth}px;font:${cs.font};letter-spacing:${cs.letterSpacing};padding:${cs.padding};`;
  mirror.textContent = ta.value.slice(0, h.offset) || ' ';
  document.body.appendChild(mirror);
  ta.scrollTop = Math.max(0, mirror.offsetHeight - parseFloat(cs.lineHeight || 24) - 16);
  mirror.remove();
}

async function outlineClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const i = +btn.closest('.ol-row').dataset.i;
  if (btn.dataset.act === 'jump') { jump(i); return; }
  const ta = $('body');
  const before = ta.value;
  const next = moveSection(before, i, btn.dataset.act === 'up' ? -1 : 1);
  if (next === null || next === before) { app.toast('That section cannot move further.'); return; }
  ta.value = next;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  log.info('research', 'Section moved', { dir: btn.dataset.act });
  app.toast('Section moved', 'Undo', () => { ta.value = before; ta.dispatchEvent(new Event('input', { bubbles: true })); renderOutline(); });
  renderOutline();
}

// ---- Wiring ----------------------------------------------------------------------
export function renderToolbar(note, isCodeNote) {
  const on = isResearchNote(note) && !isCodeNote;
  $('btn-quote').hidden = !on;
  $('btn-outline').hidden = !(on && note.format !== 'populi');
  $('btn-outline').setAttribute('aria-pressed', String(outlineOn));
  if (!on) $('outline').hidden = true; else renderOutline();
}

export function init(hooks, helpers) {
  app = hooks;
  w = helpers;
  $('btn-quote').addEventListener('click', openQuote);
  $('btn-close-quote').addEventListener('click', () => $('quote-dialog').close());
  $('q-insert').addEventListener('click', () => doQuote(true));
  $('q-save').addEventListener('click', () => doQuote(false));
  ['q-text', 'q-loc'].forEach((id) => $(id).addEventListener('input', () => updateQuotePreview(app.note())));
  $('q-source').addEventListener('change', () => updateQuotePreview(app.note()));
  $('q-saved').addEventListener('click', savedAction);
  $('btn-outline').addEventListener('click', () => { outlineOn = !outlineOn; renderToolbar(app.note(), false); });
  $('outline').addEventListener('click', outlineClick);
  let t = null;
  $('body').addEventListener('input', () => { if (!outlineOn) return; clearTimeout(t); t = setTimeout(renderOutline, 250); });
  $('lib-from').addEventListener('change', () => renderLibrary(app.note()));
  $('lib-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act="add"]');
    if (!btn) return;
    const note = app.note();
    const s = $('lib-list')._items[+btn.closest('li').dataset.i];
    if (!s) return;
    await addCopy(note, s);
    $('sources-msg').textContent = 'Added to this note.';
    w.renderSources();
  });
}
