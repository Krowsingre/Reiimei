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
import * as modes from './modes.js';

const $ = (id) => document.getElementById(id);
let app = null; // hooks supplied by app.js
let previewOn = false;
let caret = { start: 0, end: 0 };

const styleOf = (note) => (note?.meta?.style === 'mla' ? 'mla' : note?.meta?.style === 'apa' ? 'apa' : app.prefs().style);
const sourcesOf = (note) => note?.meta?.sources || [];
const citerFor = (note) => C.makeCiter(sourcesOf(note), styleOf(note));
const fmtOf = (note) => (note?.format === 'populi' ? 'populi' : 'markdown');
const isCodeNote = (note) => !!note && isCode(note.format);

async function saveMeta(patch) {
  const note = app.note();
  if (!note) return;
  await app.update({ meta: { ...(note.meta || {}), ...patch } });
}

// ---- Toolbar -------------------------------------------------------------
const LABELS = { b: 'B', i: 'I', u: 'U', s: 'S', mark: '<span>H</span>', sup: 'x²', sub: 'x₂', h: 'H', ul: '•', ol: '1.', task: '☐', outdent: '⇤', indent: '⇥', quote: '❝', code: '{ }', link: 'Link' };

export function renderToolbar(note) {
  const bar = $('toolbar');
  bar.hidden = !note;
  if (!note) { storyUi.renderToolbar(null); return; }
  const code = isCodeNote(note);
  const format = fmtOf(note);
  $('note-format').value = code ? note.format : format;
  const ro = !!note.deleted;
  $('note-format').disabled = ro;
  // Code notes get code tools; writing notes get formatting buttons.
  $('tool-buttons').hidden = code;
  $('code-tools').hidden = !code;
  $('code-tools').querySelectorAll('.tool').forEach((b) => { b.disabled = ro || previewOn; });
  $('btn-sources').hidden = code;
  research.renderToolbar(note, code);
  $('btn-paper').hidden = code;
  const pl = code ? codeUi.previewLabel(note.format) : 'Preview';
  $('btn-preview').hidden = !pl;
  if (code && !pl) previewOn = false;
  codeUi.render(note);
  const tools = F.TOOLBAR[format];
  const holder = $('tool-buttons');
  if (holder.dataset.format !== format) {
    holder.dataset.format = format;
    holder.innerHTML = tools.map((t) => `<button class="tool t-${t.id}" data-tool="${t.id}" title="${t.label}${t.key ? ` (Ctrl+${t.key.toUpperCase()})` : ''}" aria-label="${t.label}">${LABELS[t.id] || t.label}</button>`).join('');
  }
  holder.querySelectorAll('.tool').forEach((b) => { b.disabled = ro || previewOn; });
  $('btn-preview').setAttribute('aria-pressed', String(previewOn));
  $('btn-preview').textContent = previewOn ? 'Edit' : pl || 'Preview';
  $('btn-sources').textContent = sourcesOf(note).length ? `Sources (${sourcesOf(note).length})` : 'Sources';
  renderPreview(note);
  storyUi.renderToolbar(note, code, previewOn);
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

function applyToolById(id) {
  const note = app.note();
  if (!note || note.deleted) return;
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
  await app.flushSave();
  const current = app.note();
  if (isCode(to) || isCode(current.format)) {
    // Code and writing formats share plain text, so nothing is converted.
    const before = current.format || 'markdown';
    previewOn = false;
    await app.update({ format: to });
    log.info('format', 'Note type changed', { from: before, to });
    app.toast(isCode(to) ? `This note is now ${LANGS[to].label} code` : `This note is now ${to === 'populi' ? 'Populi' : 'Markdown'}`, 'Undo', () => app.update({ format: before }));
    return;
  }
  const from = fmtOf(current);
  const result = to === 'populi' ? F.markdownToPopuli(current.body) : F.populiToMarkdown(current.body);
  if (result.lost.length) {
    const ok = await app.ask({
      title: `Convert to ${to === 'populi' ? 'Populi markup' : 'Markdown'}?`,
      text: `Populi has no equivalent for: ${result.lost.join(', ')}. Everything else carries over exactly. You can undo right after converting.`,
      okText: 'Convert',
    });
    if (ok.action !== 'ok') { $('note-format').value = from; return; }
  }
  const before = { body: current.body, format: from };
  await app.update({ body: result.text, format: to });
  app.setEditorText(result.text);
  log.info('format', 'Note converted', { from, to, simplified: result.lost });
  app.toast(`Converted to ${to === 'populi' ? 'Populi' : 'Markdown'}`, 'Undo', async () => {
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
  else if (target === 'plain') text = plainText(note, ctx) + referencesText(note, 'plain');
  else text = F.exportNote(note.body, fmtOf(note), target, ctx) + referencesText(note, target);
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
  research.init(hooks, { renderSources, saveMeta, insertText: (t) => insertAtCaret(t), sourcesOf, styleOf, citerFor });

  $('tool-buttons').addEventListener('click', (e) => {
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

export function resetView() {
  previewOn = false;
}
export const isPreview = () => previewOn;
export const newNoteMeta = (prefs) => ({ style: prefs.style });
// Notes without a saved style use the preferred style everywhere, including sharing.
export const setStyleDefault = (fn) => S.setDefaultStyle(fn);
