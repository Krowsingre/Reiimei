// Reiimei Coding screens: the name check (dotted underline), autocomplete, find and replace,
// the outline panel, and the project snippet library. Logic lives in codeintel.js.
import { log } from './logger.js';
import * as F from './format.js';
import * as K from './code.js';
import * as I from './codeintel.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => F.escapeHtml(String(t ?? ''));
let app = null;
let lang = null;
let noteId = null;
let flags = [];
let spellCur = null;
let spellTimer = null;
let outlineOn = false;
let outlineTimer = null;
let typed = null;                  // where you last typed, so a name you are still typing is not underlined
const sessionKeep = new Set();     // kept spellings in a note that is not in a Coding project
const nameCache = new Map();       // other notes' defined names, by note id
const find = { open: false, q: '', matches: [], cur: -1 };
const ac = { on: false, items: [], sel: 0, start: 0, end: 0 };
let suppressAc = false;
const BIG = 300000;                // notes longer than this are not checked while typing

export const activeLang = () => lang;
const inProject = (note) => !!note && app.inCodingProject(note.folder_id);

// ---- Names from the rest of the project --------------------------------------------------
function projectData(note) {
  if (!inProject(note)) return { project: [], keep: [...sessionKeep] };
  const seen = new Set();
  const names = [];
  for (const n of app.projectNotes(note.folder_id, 'coding')) {
    if (n.id === note.id || !K.isCode(n.format)) continue;
    const sig = `${n.updated_at}:${n.body.length}`;
    let c = nameCache.get(n.id);
    if (!c || c.sig !== sig) { c = { sig, names: I.definedNames(n.body, n.format).map((d) => d.name) }; nameCache.set(n.id, c); }
    for (const x of c.names) if (!seen.has(x)) { seen.add(x); names.push(x); }
  }
  return { project: names, keep: [...(app.registry(note.folder_id).keep || []), ...sessionKeep] };
}

// ---- The underline and find layer ------------------------------------------------------------
function paintMarks() {
  const layer = $('mark-layer');
  const ta = $('body');
  layer.hidden = !lang || ta.hidden;
  if (layer.hidden) return;
  const text = ta.value;
  const ranges = flags.map((f) => ({ s: f.start, e: f.end, sp: true }));
  if (find.open && find.q) find.matches.forEach((m, i) => ranges.push({ s: m, e: m + find.q.length, fm: true, cur: i === find.cur }));
  if (!ranges.length) { layer.textContent = ''; return; }
  const cuts = new Set([0, text.length]);
  ranges.forEach((r) => { cuts.add(r.s); cuts.add(r.e); });
  const pts = [...cuts].filter((x) => x >= 0 && x <= text.length).sort((a, b) => a - b);
  ranges.sort((a, b) => a.s - b.s);
  let html = '';
  let next = 0;
  let active = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    while (next < ranges.length && ranges[next].s <= a) active.push(ranges[next++]);
    active = active.filter((r) => r.e > a);
    let chunk = esc(text.slice(a, b));
    const sp = active.some((r) => r.sp);
    const fm = active.find((r) => r.fm);
    if (sp) chunk = `<u class="sp">${chunk}</u>`;
    if (fm) chunk = `<mark class="fm${fm.cur ? ' cur' : ''}">${chunk}</mark>`;
    html += chunk;
  }
  layer.innerHTML = `${html}\n`;
  layer.scrollTop = ta.scrollTop;
  layer.scrollLeft = ta.scrollLeft;
}
const syncMarks = () => { const l = $('mark-layer'); const ta = $('body'); l.scrollTop = ta.scrollTop; l.scrollLeft = ta.scrollLeft; };

// ---- Name check ----------------------------------------------------------------------------------
function scheduleSpell() { clearTimeout(spellTimer); spellTimer = setTimeout(runSpell, 300); }
function runSpell() {
  clearTimeout(spellTimer);
  const note = app.note();
  const ta = $('body');
  if (!lang || !note || ta.value.length > BIG || !I.CHECKED.has(lang)) { flags = []; paintMarks(); showSpellBar(); return; }
  const caret = typed && Date.now() - typed.at < 3000 && ta.selectionStart === ta.selectionEnd && ta.selectionStart === typed.pos ? typed.pos : null;
  const t0 = performance.now();
  flags = I.checkNames(ta.value, lang, { ...projectData(note), caret });
  const ms = Math.round(performance.now() - t0);
  if (ms > 150) log.warn('code', 'Name check was slow', { ms, chars: ta.value.length });
  paintMarks();
  showSpellBar();
}

function showSpellBar() {
  const bar = $('spell-bar');
  const ta = $('body');
  const p = ta.selectionStart;
  const f = lang && !ta.hidden && ta.selectionStart === ta.selectionEnd ? flags.find((x) => p >= x.start && p <= x.end) : null;
  spellCur = f || null;
  bar.hidden = !f;
  if (!f) return;
  $('spell-msg').textContent = `"${f.word}" is not defined here. Did you mean`;
  $('spell-fix').textContent = f.suggest;
  $('spell-fix').title = `Replace with ${f.suggest}`;
}

function setValue(value, selStart, selEnd = selStart) {
  const ta = $('body');
  ta.value = value;
  ta.setSelectionRange(selStart, selEnd);
  suppressAc = true;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  suppressAc = false;
}

function fixSpelling() {
  const f = spellCur;
  const ta = $('body');
  if (!f || ta.value.slice(f.start, f.end) !== f.word) return;
  setValue(ta.value.slice(0, f.start) + f.suggest + ta.value.slice(f.end), f.start + f.suggest.length);
  log.info('code', 'Name corrected', { from: f.word, to: f.suggest });
  ta.focus();
}

async function keepSpelling() {
  const f = spellCur;
  const note = app.note();
  if (!f || !note) return;
  if (inProject(note)) {
    const reg = app.registry(note.folder_id);
    await app.saveRegistry(note.folder_id, { ...reg, keep: [...new Set([...(reg.keep || []), f.word])] });
    app.toast(`Kept "${f.word}" in this project`);
  } else {
    sessionKeep.add(f.word);
    app.toast(`Kept "${f.word}" until you close Reiimei. Move this note to a Coding project to remember it.`);
  }
  log.info('code', 'Spelling kept', { word: f.word, project: inProject(note) });
  runSpell();
}

// ---- Autocomplete --------------------------------------------------------------------------------------
function caretXY(ta, pos) {
  const cs = getComputedStyle(ta);
  const d = document.createElement('div');
  d.style.cssText = `position:absolute;visibility:hidden;left:0;top:0;white-space:pre;font:${cs.font};letter-spacing:${cs.letterSpacing};tab-size:${cs.tabSize};padding:${cs.padding};border:0;box-sizing:border-box;`;
  d.textContent = ta.value.slice(0, pos);
  const m = document.createElement('span');
  m.textContent = '​';
  d.appendChild(m);
  document.body.appendChild(d);
  const r = { x: m.offsetLeft - ta.scrollLeft, y: m.offsetTop - ta.scrollTop, lh: parseFloat(cs.lineHeight) || 20 };
  d.remove();
  return r;
}

function hideAc() { ac.on = false; $('ac').hidden = true; }

function htmlContext(v, pos) {
  const lo = v.slice(0, pos).toLowerCase();
  if (lo.lastIndexOf('<script') > lo.lastIndexOf('</script')) return 'javascript';
  if (lo.lastIndexOf('<style') > lo.lastIndexOf('</style')) return 'css';
  return 'html';
}

function onTyped(e) {
  const ta = $('body');
  typed = { pos: ta.selectionStart, at: Date.now() };
  if (!lang) return;
  scheduleSpell();
  if (outlineOn) { clearTimeout(outlineTimer); outlineTimer = setTimeout(renderOutline, 300); }
  flags = [];                          // positions have moved; the check redraws them in a moment
  spellCur = null;
  $('spell-bar').hidden = true;
  if (find.open) refreshFind(false); else paintMarks();
  if (suppressAc) return;
  const t = (e && e.inputType) || '';
  if (!t.startsWith('insert') || /Paste|Drop|LineBreak|Paragraph/.test(t) || !I.completes(lang) || ta.selectionStart !== ta.selectionEnd) { hideAc(); return; }
  const v = ta.value;
  const pos = ta.selectionStart;
  const wordRe = lang === 'css' || lang === 'html' || lang === 'xml' ? /[\w$:.-]+$/ : /[\w$]+$/;
  const m = wordRe.exec(v.slice(Math.max(0, pos - 80), pos));
  if (!m || m[0].length < 2 || !/^[A-Za-z_$-]/.test(m[0]) || /[\w$]/.test(v[pos] || '')) { hideAc(); return; }
  const prefix = m[0];
  if (I.inCommentOrString(v, pos, lang === 'html' || lang === 'xml' ? lang : lang)) { hideAc(); return; }
  const note = app.note();
  const mine = I.definedNames(v, lang).map((d) => d.name);
  const proj = projectData(note).project;
  const before = v[pos - prefix.length - 1];
  let items;
  if (lang === 'xml') {
    if (before !== '<' && before !== '/') { hideAc(); return; }
    items = I.suggestNames(prefix, 'xml', mine, [], 6, false);
  } else if (lang === 'html') {
    if (before === '<' || (before === '/' && v[pos - prefix.length - 2] === '<')) items = I.suggestNames(prefix, 'html', I.HTML_TAG_LIST, [], 6, false);
    else { const ctx = htmlContext(v, pos); items = I.suggestNames(prefix, 'html', mine, proj, 6, ctx !== 'html', ctx === 'html' ? 'html' : ctx); }
  } else items = I.suggestNames(prefix, lang, mine, proj);
  if (!items.length) { hideAc(); return; }
  const src = (n) => (mine.includes(n) ? 'this note' : proj.includes(n) ? 'project' : 'built in');
  ac.items = items.map((n) => ({ n, src: lang === 'xml' || before === '<' ? '' : src(n) }));
  ac.sel = 0;
  ac.start = pos - prefix.length;
  ac.end = pos;
  ac.on = true;
  const box = $('ac');
  box.innerHTML = ac.items.map((it, i) => `<li role="option" data-i="${i}" aria-selected="${i === 0}"><span>${esc(it.n)}</span><span class="ac-src">${esc(it.src)}</span></li>`).join('');
  box.hidden = false;
  const xy = caretXY(ta, pos);
  const area = $('editor-area');
  const maxLeft = Math.max(0, area.clientWidth - box.offsetWidth - 8);
  box.style.left = `${Math.max(4, Math.min(xy.x, maxLeft))}px`;
  const below = xy.y + xy.lh + 4;
  box.style.top = `${below + box.offsetHeight > area.clientHeight ? Math.max(0, xy.y - box.offsetHeight - 4) : below}px`;
}

function acceptAc(i = ac.sel) {
  const it = ac.items[i];
  const ta = $('body');
  if (!it) return;
  const v = ta.value;
  hideAc();
  setValue(v.slice(0, ac.start) + it.n + v.slice(ac.end), ac.start + it.n.length);
  log.info('code', 'Name completed', { chars: it.n.length });
  ta.focus();
}

function moveAc(d) {
  ac.sel = (ac.sel + d + ac.items.length) % ac.items.length;
  $('ac').querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', String(i === ac.sel)));
}

// Runs before the code editor's own Tab and Enter handling.
function onKeyCapture(e) {
  if (!lang) return;
  const ta = $('body');
  if (ac.on) {
    if (e.key === 'Tab' || e.key === 'Enter') {
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) { hideAc(); return; }
      e.preventDefault(); e.stopImmediatePropagation(); acceptAc(); return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hideAc(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); moveAc(e.key === 'ArrowDown' ? 1 : -1); return; }
    if (e.key.length === 1 || e.key === 'Backspace') return;   // typing goes on; the list is rebuilt after the keystroke
    hideAc();                                                    // anything else keeps what you typed
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault(); e.stopImmediatePropagation();
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    openFind(sel && !sel.includes('\n') ? sel : '');
  }
}

// ---- Find and replace ----------------------------------------------------------------------------------
const opts = () => ({ matchCase: $('f-case').checked, wholeWord: $('f-word').checked });

function refreshFind(jump = true) {
  find.q = $('f-find').value;
  find.matches = find.open && lang ? I.findAll($('body').value, find.q, opts()) : [];
  if (!find.matches.length) find.cur = -1;
  else if (find.cur < 0 || find.cur >= find.matches.length) find.cur = nearest();
  $('f-count').textContent = !find.q ? '' : find.matches.length ? `${find.cur + 1} of ${find.matches.length}` : 'No matches';
  paintMarks();
  if (jump && find.cur >= 0) reveal(find.matches[find.cur]);
}
function nearest() {
  const p = $('body').selectionStart;
  const i = find.matches.findIndex((m) => m >= p);
  return i < 0 ? 0 : i;
}
function reveal(index) {
  const ta = $('body');
  const xy = caretXY(ta, index);
  const lh = xy.lh;
  if (xy.y < 0 || xy.y > ta.clientHeight - lh * 2) ta.scrollTop = Math.max(0, ta.scrollTop + xy.y - ta.clientHeight / 3);
  if (xy.x < 60 || xy.x > ta.clientWidth - 60) ta.scrollLeft = Math.max(0, ta.scrollLeft + xy.x - ta.clientWidth / 3);
  syncMarks();
  const g = $('gutter'); g.scrollTop = ta.scrollTop;
  $('code-layer').scrollTop = ta.scrollTop; $('code-layer').scrollLeft = ta.scrollLeft;
}
function goFind(d) {
  if (!find.matches.length) return;
  find.cur = (find.cur + d + find.matches.length) % find.matches.length;
  const m = find.matches[find.cur];
  $('body').setSelectionRange(m, m + find.q.length);
  $('f-count').textContent = `${find.cur + 1} of ${find.matches.length}`;
  paintMarks();
  reveal(m);
}
function openFind(text = '') {
  if (!lang) return;
  find.open = true;
  $('findbar').hidden = false;
  $('btn-find').setAttribute('aria-pressed', 'true');
  if (text) $('f-find').value = text;
  $('f-find').focus();
  $('f-find').select();
  refreshFind(true);
}
function closeFind() {
  find.open = false;
  $('findbar').hidden = true;
  $('btn-find').setAttribute('aria-pressed', 'false');
  find.matches = [];
  paintMarks();
  if (lang) $('body').focus();
}
function replaceOne() {
  const ta = $('body');
  if (!find.matches.length || find.cur < 0) return;
  const m = find.matches[find.cur];
  const repl = $('f-repl').value;
  setValue(I.replaceAt(ta.value, m, find.q.length, repl), m + repl.length);
  find.cur = -1;
  find.matches = I.findAll(ta.value, find.q, opts());
  find.cur = find.matches.findIndex((x) => x >= m + repl.length);
  if (find.cur < 0 && find.matches.length) find.cur = 0;
  refreshFind(true);
  log.info('code', 'Replaced one');
}
function replaceEvery() {
  const ta = $('body');
  const before = ta.value;
  const r = I.replaceAll(before, $('f-find').value, $('f-repl').value, opts());
  if (!r.count) { app.toast('Nothing to replace'); return; }
  setValue(r.value, 0);
  refreshFind(false);
  log.info('code', 'Replaced all', { count: r.count });
  app.toast(`Replaced ${r.count} ${r.count === 1 ? 'match' : 'matches'}`, 'Undo', () => { setValue(before, 0); refreshFind(false); });
}

// ---- Outline ----------------------------------------------------------------------------------------------------
function renderOutline() {
  clearTimeout(outlineTimer);
  const box = $('outline');
  const note = app.note();
  if (!lang || !note) { return; }
  box.hidden = !outlineOn;
  if (!outlineOn) return;
  const rows = I.outline($('body').value, lang);
  const what = { python: 'No functions or classes yet.', javascript: 'No functions or classes yet.', css: 'No rules yet.', sql: 'No statements yet.', json: 'No keys yet.', xml: 'No elements yet.', html: 'No headings, ids or scripts yet.' }[lang];
  box.innerHTML = rows.length ? rows.map((r, i) => `<div class="ol-row" data-i="${i}" data-line="${r.line}" style="padding-left:${(Math.min(r.level, 4) - 1) * 14}px">
      <button class="ol-title" data-act="jump" title="Line ${r.line}">${esc(r.title)}</button><span class="badge">${r.line}</span></div>`).join('')
    : `<p class="ol-empty">${what}</p>`;
}
function jumpLine(line) {
  const ta = $('body');
  const lines = ta.value.split('\n');
  let off = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) off += lines[i].length + 1;
  ta.focus();
  ta.setSelectionRange(off, off + (lines[line - 1] || '').length);
  const xy = caretXY(ta, off);
  ta.scrollTop = Math.max(0, ta.scrollTop + xy.y - xy.lh * 2);
  syncMarks();
  $('gutter').scrollTop = ta.scrollTop;
  $('code-layer').scrollTop = ta.scrollTop;
}

// ---- Snippets ---------------------------------------------------------------------------------------------------------
let editing = null;   // snippet id being edited, '' for a new one
const nowIso = () => new Date().toISOString();
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(16).slice(2)}`);

function snipNote() {
  const note = app.note();
  if (!note || !K.isCode(note.format)) return null;
  return note;
}
function openSnippets(prefill = null) {
  const note = snipNote();
  if (!note) return;
  if (!inProject(note)) { app.toast('Snippets belong to Coding projects. Move this note to Coding mode first.'); return; }
  $('snip-dialog').showModal();
  $('snip-project').textContent = `Shared by every code note in ${app.projectLabel(note.folder_id)}.`;
  $('sn-lang').innerHTML = Object.entries(K.LANGS).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  $('snip-msg').textContent = '';
  if (prefill) startForm('', prefill); else showList();
}
function showList() {
  editing = null;
  $('snip-form').hidden = true;
  $('snip-main').hidden = false;
  const note = snipNote();
  const reg = app.registry(note.folder_id);
  const only = $('snip-only').checked;
  const list = reg.snippets.filter((s) => !only || s.lang === note.format);
  $('snip-list').innerHTML = list.length ? list.map((s) => `<li data-id="${esc(s.id)}"><p class="ref-text"><strong>${esc(s.name)}</strong> <span class="badge">${esc(K.LANGS[s.lang]?.label || s.lang)}</span></p>
      <pre>${esc(s.body.length > 600 ? `${s.body.slice(0, 600)}\n…` : s.body)}</pre>
      <div class="row"><button class="btn primary" data-act="insert">Insert</button><button class="btn" data-act="edit">Edit</button><button class="btn" data-act="delete">Delete</button></div></li>`).join('')
    : `<li class="side-empty">${only && reg.snippets.length ? `No ${esc(K.LANGS[note.format].label)} snippets yet. Untick the box to see all ${reg.snippets.length}.` : 'No snippets yet. Select code in a note and choose "Save selection as snippet".'}</li>`;
}
function startForm(id, data) {
  editing = id;
  $('snip-main').hidden = true;
  $('snip-form').hidden = false;
  $('sn-name').value = data.name || '';
  $('sn-lang').value = data.lang || snipNote().format;
  $('sn-body').value = data.body || '';
  $('sn-name').focus();
}
async function saveSnippet(e) {
  e.preventDefault();
  const note = snipNote();
  if (!note) return;
  const name = $('sn-name').value.trim();
  const body = $('sn-body').value.replace(/\s+$/, '');
  if (!name || !body) { $('snip-msg').textContent = 'A snippet needs a name and some code.'; return; }
  const reg = app.registry(note.folder_id);
  const dupe = reg.snippets.some((s) => s.id !== editing && s.name.toLowerCase() === name.toLowerCase() && s.lang === $('sn-lang').value);
  if (dupe) { $('snip-msg').textContent = 'A snippet with that name already exists for this language.'; return; }
  const snip = { id: editing || newId(), name: name.slice(0, 80), lang: $('sn-lang').value, body, at: nowIso() };
  await app.saveRegistry(note.folder_id, { ...reg, snippets: [...reg.snippets.filter((s) => s.id !== snip.id), snip] });
  log.info('snippets', editing ? 'Snippet updated' : 'Snippet saved', { lang: snip.lang, chars: body.length });
  $('snip-msg').textContent = 'Saved.';
  showList();
}
function insertSnippet(s) {
  const ta = $('body');
  const v = ta.value;
  const a = ta.selectionStart;
  const b = ta.selectionEnd;
  const ls = v.lastIndexOf('\n', a - 1) + 1;
  const ind = /^[ \t]*/.exec(v.slice(ls, a))[0];
  const text = s.body.split('\n').map((l, i) => (i ? ind + l : l)).join('\n');
  const before = v;
  setValue(v.slice(0, a) + text + v.slice(b), a + text.length);
  $('snip-dialog').close();
  ta.focus();
  log.info('snippets', 'Snippet inserted', { lang: s.lang });
  app.toast(`Inserted "${s.name}"`, 'Undo', () => { setValue(before, a); });
}
async function snippetClick(e) {
  const btn = e.target.closest('[data-act]');
  const li = e.target.closest('li[data-id]');
  const note = snipNote();
  if (!btn || !li || !note) return;
  const reg = app.registry(note.folder_id);
  const s = reg.snippets.find((x) => x.id === li.dataset.id);
  if (!s) return;
  if (btn.dataset.act === 'insert') insertSnippet(s);
  else if (btn.dataset.act === 'edit') startForm(s.id, s);
  else if (btn.dataset.act === 'delete') {
    const c = await app.ask({ title: `Delete "${s.name}"?`, text: 'It will be removed for every code note in this project.', okText: 'Delete snippet' });
    if (c.action !== 'ok') return;
    const cur = app.registry(note.folder_id);
    await app.saveRegistry(note.folder_id, { ...cur, snippets: cur.snippets.filter((x) => x.id !== s.id), gone: [...new Set([...(cur.gone || []), s.id])] });
    log.info('snippets', 'Snippet deleted');
    showList();
  }
}

// ---- Wiring ---------------------------------------------------------------------------------------------------------------
export function renderToolbar(note) {
  const next = note && !note.deleted && K.isCode(note.format) ? note.format : null;
  const changed = next !== lang || (note && note.id) !== noteId;
  lang = next;
  noteId = note ? note.id : null;
  if (!lang) {
    $('findbar').hidden = true;
    $('spell-bar').hidden = true;
    $('mark-layer').hidden = true;
    hideAc();
    flags = [];
    return;
  }
  $('findbar').hidden = !find.open;
  $('btn-find').setAttribute('aria-pressed', String(find.open));
  $('btn-code-outline').setAttribute('aria-pressed', String(outlineOn));
  if (changed) { hideAc(); typed = null; if (find.open) refreshFind(false); runSpell(); }
  else paintMarks();
  renderOutline();
}

export function init(hooks) {
  app = hooks;
  const ta = $('body');
  ta.addEventListener('keydown', onKeyCapture, true);
  ta.addEventListener('input', onTyped);
  ta.addEventListener('scroll', syncMarks);
  ta.addEventListener('keyup', (e) => { if (lang && !/^(Shift|Control|Alt|Meta)$/.test(e.key) && !e.isComposing) { if (/^Arrow|Home|End|Page/.test(e.key)) { hideAc(); showSpellBar(); scheduleSpell(); } } });
  ta.addEventListener('click', () => { hideAc(); if (lang) { showSpellBar(); scheduleSpell(); } });
  ta.addEventListener('blur', () => setTimeout(hideAc, 120));
  $('ac').addEventListener('mousedown', (e) => { e.preventDefault(); const li = e.target.closest('li'); if (li) acceptAc(+li.dataset.i); });
  $('spell-fix').addEventListener('click', fixSpelling);
  $('spell-keep').addEventListener('click', keepSpelling);
  window.addEventListener('resize', hideAc);

  $('btn-find').addEventListener('click', () => (find.open ? closeFind() : openFind()));
  $('f-close').addEventListener('click', closeFind);
  $('f-find').addEventListener('input', () => { find.cur = -1; refreshFind(true); });
  [$('f-case'), $('f-word')].forEach((c) => c.addEventListener('change', () => { find.cur = -1; refreshFind(true); }));
  $('f-next').addEventListener('click', () => goFind(1));
  $('f-prev').addEventListener('click', () => goFind(-1));
  $('f-one').addEventListener('click', replaceOne);
  $('f-all').addEventListener('click', replaceEvery);
  $('findbar').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
    else if (e.key === 'Enter' && e.target.id === 'f-find') { e.preventDefault(); goFind(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Enter' && e.target.id === 'f-repl') { e.preventDefault(); replaceOne(); }
  });

  $('btn-code-outline').addEventListener('click', () => { outlineOn = !outlineOn; $('btn-code-outline').setAttribute('aria-pressed', String(outlineOn)); if (!outlineOn) $('outline').hidden = true; renderOutline(); });
  $('outline').addEventListener('click', (e) => {
    if (!lang) return;
    const row = e.target.closest('.ol-row[data-line]');
    if (row && e.target.closest('[data-act="jump"]')) jumpLine(+row.dataset.line);
  });

  $('btn-snippets').addEventListener('click', () => openSnippets());
  $('btn-close-snip').addEventListener('click', () => $('snip-dialog').close());
  $('snip-only').addEventListener('change', showList);
  $('snip-new').addEventListener('click', () => startForm('', { lang: snipNote()?.format }));
  $('snip-from-note').addEventListener('click', () => {
    const t = $('body');
    const sel = t.value.slice(t.selectionStart, t.selectionEnd);
    startForm('', { lang: snipNote()?.format, body: sel || t.value });
  });
  $('snip-list').addEventListener('click', snippetClick);
  $('snip-form').addEventListener('submit', saveSnippet);
  $('sn-cancel').addEventListener('click', showList);
}
