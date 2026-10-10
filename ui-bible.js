// Reiimei Bible reader: read any of the translations by book and chapter, switch translation in
// place, find a passage by its reference or its words (in every translation on the device, or
// online), see the footnotes, and copy verses or put them into the note you are writing.
// Verses can be highlighted in a few colours, and notes taken on a passage (on a computer the
// reader and the note sit side by side; on a phone one shows at a time).
import * as B from './bible.js';
import { log } from './logger.js';

let app = null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let ver = B.DEFAULT;
let at = { book: 'GEN', c: 1 };
const picked = new Set(); // "book:c:v": the same verses in every translation
let shown = 'chapter';  // or 'results'
let lastQuery = '';
let marks = new Map(); // highlights: "book:c:v" -> {color}

const key = (b, c, v) => `${b}:${c}:${v}`;
export const isOpen = () => !$('bible-view').hidden;
export const current = () => ver;

async function ensure(v) {
  if (B.loaded(v)) return true;
  setStatus(`Getting the ${B.version(v).name} ready… The first time, it is fetched once (about 1.5 MB), then it works offline.`);
  try { await B.load(v); setStatus(''); return true; } catch (e) {
    setStatus(`The ${B.version(v).name} could not be fetched. Connect to the internet once and open it again. (${e.message})`);
    log.warn('bible', 'Could not load a translation', { version: v, error: e.message });
    return false;
  }
}

// at: a passage to show ({book, c1, v1, c2, v2, whole}); side: beside the open note (computer only);
// books: the list of books. Otherwise the Bible opens where you last read, or on the list of books.
export async function open({ insert = false, version = null, query = '', at: go = null, side = null, books = false } = {}) {
  const view = $('bible-view');
  view.hidden = false;
  setSide(side === null ? isSide() : side);
  setStatus('');
  const last = app.prefs().bibleAt;
  ver = version || last?.version || B.DEFAULT;
  if (!(await ensure(ver))) return;
  fillVersions();
  fillBooks();
  const hasLast = !!(last && B.book(last.book, ver));
  if (hasLast) at = { book: last.book, c: Math.min(last.c, B.book(last.book, ver).c.length) };
  $('bible-insert').hidden = !canInsert();
  if (go && B.book(go.book, ver)) {
    picked.clear();
    if (!go.whole) for (const x of B.passage(go, ver)) picked.add(key(x.book, x.c, x.v));
    showChapter(go.book, Math.min(go.c1, B.book(go.book, ver).c.length), { scroll: go.whole ? null : go.v1 });
  } else if (query) { $('bible-search').value = query; await runSearch(); } else if (books || !hasLast) showBooks(); else showChapter(at.book, at.c, { scroll: last.v > 1 ? last.v : null });
  if (insert || query) $('bible-search').focus();
  app.onBible?.();
}

export function close() {
  keepPlace();
  $('bible-view').hidden = true;
  delete document.documentElement.dataset.bible;
  app.sideBySide?.();
  picked.clear();
  renderBar();
  app.onBible?.();
}

// Side by side: the reader on the left half, the open note on the right (a computer only).
export const isSide = () => document.documentElement.dataset.bible === 'side';
function setSide(on) {
  const side = !!on && !app.phone() && !!app.note();
  document.documentElement.dataset.bible = side ? 'side' : 'on';
  const b = $('bible-side');
  b.hidden = app.phone() || !app.note();
  b.setAttribute('aria-pressed', String(side));
  b.title = side ? 'Show the Bible on its own' : 'Read beside the open note';
  app.sideBySide?.();
}

function canInsert() {
  const n = app.note();
  return !!n && !n.deleted && !n.locked && !/^(python|html|xml|javascript|css|json|sql)$/.test(n.format || '');
}

function setStatus(text) {
  const s = $('bible-status');
  s.textContent = text;
  s.hidden = !text;
}

function fillVersions() {
  const sel = $('bible-version');
  if (!sel.options.length) sel.innerHTML = B.VERSIONS.map((v) => `<option value="${v.id}">${esc(v.short)}</option>`).join('');
  sel.value = ver;
  sel.title = B.version(ver).name;
}
function fillBooks() {
  const books = B.books(ver);
  const sel = $('bible-book');
  sel.innerHTML = `<optgroup label="Old Testament">${books.slice(0, 39).map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</optgroup><optgroup label="New Testament">${books.slice(39).map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</optgroup>`;
}
function fillChapters(id) {
  const b = B.book(id, ver);
  $('bible-chapter').innerHTML = b.c.map((_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
}

function verseHtml(b, c, v, item) {
  const [text] = item;
  const k = `${c}:${v}`;
  const notes = b.f[k];
  const lines = esc(text).replace(/\n\t/g, '<br><span class="bv-indent"></span>').replace(/\n/g, '<br>');
  const sel = picked.has(key(b.id, c, v)) ? ' picked' : '';
  const empty = text ? '' : ' empty';
  const hl = marks.get(key(b.id, c, v));
  return `<span class="bv${sel}${empty}${hl ? ` hl-${hl.color}` : ''}" data-v="${v}" id="bv-${c}-${v}"><sup class="bv-n">${v}</sup>${lines}${notes ? `<button type="button" class="bv-note" data-k="${k}" aria-label="Footnote">†</button>` : ''}</span> `;
}

export function showChapter(id, c, { scroll = null } = {}) {
  const b = B.book(id, ver);
  if (!b) return;
  at = { book: id, c };
  shown = 'chapter';
  app.setPrefs({ bibleAt: { ...at, version: ver, label: `${b.name} ${c}`, v: scroll || 1 } });
  $('bible-book').value = id;
  fillChapters(id);
  $('bible-chapter').value = String(c);
  const list = b.c[c - 1];
  marks = app.highlights();
  let html = `<div class="bible-chapter-head"><h2 class="bible-chapter-title">${esc(b.name)} ${c} <span class="bible-ver">${esc(B.version(ver).short)}</span></h2><span class="bible-chapter-acts"><button type="button" class="text-btn" id="bible-chapter-mark">Bookmark</button><button type="button" class="text-btn" id="bible-chapter-notes">Take notes</button></span></div>`;
  let open = false;
  const closeBlock = () => { if (open) { html += '</p>'; open = false; } };
  list.forEach((item, i) => {
    const v = i + 1;
    const title = b.t[`${c}:${v}`];
    if (title) { closeBlock(); html += `<p class="bible-title">${esc(title)}</p>`; }
    const kind = item[1];
    if (kind === 'q1' || kind === 'q2') { closeBlock(); html += `<p class="bible-q ${kind}">`; open = true; }
    else if (kind === 'p' || kind === 'b' || !open) { closeBlock(); html += `<p class="bible-p${kind === 'b' ? ' gap' : ''}">`; open = true; }
    html += verseHtml(b, c, v, item);
  });
  closeBlock();
  const books = B.books(ver);
  const bi = books.findIndex((x) => x.id === id);
  const prev = c > 1 ? [id, c - 1] : bi > 0 ? [books[bi - 1].id, books[bi - 1].c.length] : null;
  const next = c < b.c.length ? [id, c + 1] : bi < books.length - 1 ? [books[bi + 1].id, 1] : null;
  html += `<nav class="bible-nav">${prev ? `<button type="button" class="btn" data-go="${prev[0]}:${prev[1]}">‹ ${esc(B.book(prev[0], ver).name)} ${prev[1]}</button>` : '<span></span>'}${next ? `<button type="button" class="btn" data-go="${next[0]}:${next[1]}">${esc(B.book(next[0], ver).name)} ${next[1]} ›</button>` : ''}</nav>`;
  html += `<p class="bible-credit">${esc(B.version(ver).name)} (${B.version(ver).short}), public domain.</p>`;
  const body = $('bible-body');
  body.innerHTML = html;
  const target = scroll ? $(`bv-${c}-${scroll}`) : null;
  if (target) target.scrollIntoView({ block: 'center' }); else body.scrollTop = 0;
  renderBar();
}

// The last place read is kept (with the verse at the top) as the Bible page's "Last read".
function keepPlace() {
  if (shown !== 'chapter' || !isOpen()) return;
  const b = B.book(at.book, ver);
  app.setPrefs({ bibleAt: { ...at, version: ver, label: `${b.name} ${at.c}`, v: topVerse() || 1 } });
}

// The books, Old and New Testament; then a book's chapters.
export function showBooks() {
  shown = 'books';
  const books = B.books(ver);
  const grid = (list) => `<div class="bk-grid">${list.map((b) => `<button type="button" class="bk-btn" data-book="${b.id}">${esc(b.name)}</button>`).join('')}</div>`;
  $('bible-body').innerHTML = `<h2 class="bible-chapter-title">Books <span class="bible-ver">${esc(B.version(ver).short)}</span></h2>`
    + `<h3 class="bk-head">Old Testament</h3>${grid(books.slice(0, 39))}<h3 class="bk-head">New Testament</h3>${grid(books.slice(39))}`;
  $('bible-body').scrollTop = 0;
  renderBar();
}
function showChapters(id) {
  const b = B.book(id, ver);
  if (b.c.length === 1) { showChapter(id, 1); return; }
  shown = 'chapters';
  $('bible-body').innerHTML = `<h2 class="bible-chapter-title">${esc(b.name)} <span class="bible-ver">${esc(B.version(ver).short)}</span></h2>`
    + `<div class="ch-grid">${b.c.map((_, i) => `<button type="button" class="ch-btn" data-chap="${id}:${i + 1}">${i + 1}</button>`).join('')}</div>`
    + '<p><button type="button" class="text-btn" data-books>‹ All books</button></p>';
  $('bible-body').scrollTop = 0;
  renderBar();
}

// The first verse showing at the top, to keep the place when switching translation.
function topVerse() {
  const body = $('bible-body');
  const top = body.getBoundingClientRect().top;
  for (const el of body.querySelectorAll('.bv')) if (el.getBoundingClientRect().bottom > top + 4) return +el.dataset.v;
  return null;
}
export async function switchVersion(v) {
  if (v === ver) return;
  const keep = shown === 'chapter' ? topVerse() : null;
  if (!(await ensure(v))) { $('bible-version').value = ver; return; }
  ver = v;
  fillVersions();
  fillBooks();
  if (shown === 'results' && lastQuery) showResults(lastQuery);
  else if (shown === 'books' || shown === 'chapters') showBooks();
  else showChapter(at.book, Math.min(at.c, B.book(at.book, ver).c.length), { scroll: keep && keep > 1 ? keep : null });
  log.info('bible', 'Translation switched', { version: v });
}

function showResults(q) {
  lastQuery = q;
  const r = B.search(q);
  shown = 'results';
  const marks = r.words || [];
  const mark = (t) => {
    let h = esc(t);
    for (const w of marks) {
      const safe = esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      h = h.replace(new RegExp(`(${safe})`, 'gi'), '<mark>$1</mark>');
    }
    return h;
  };
  const shortOf = (id) => B.version(id).short;
  const count = r.total
    ? `${r.close ? 'Nothing has all of those words. Closest: ' : ''}${r.total.toLocaleString()} ${r.total === 1 ? 'verse' : 'verses'}${r.total > r.hits.length ? ` (the first ${r.hits.length} shown)` : ''}`
    : 'No verses found';
  const online = `<button type="button" class="btn small" id="bible-online">Search online</button>`;
  $('bible-body').innerHTML = `<div class="bible-count"><span>${count}${B.loadedVersions().length < B.VERSIONS.length ? ` · searched ${B.loadedVersions().map(shortOf).join(', ')}` : ''}</span>${online}</div>`
    + r.hits.map((x) => {
      // The verse in the translation being read, or in the one that matched when it is empty there.
      const here = B.passage({ book: x.book, c1: x.c, v1: x.v, c2: x.c, v2: x.v }, ver)[0]?.text;
      const from = here ? ver : x.in[0];
      const text = here || B.passage({ book: x.book, c1: x.c, v1: x.v, c2: x.c, v2: x.v }, from)[0]?.text || '';
      const other = x.in.filter((v) => v !== ver);
      const note = !x.in.includes(ver) && other.length ? `<span class="bh-in">matched the ${other.map(shortOf).join(', ')} wording</span>` : '';
      return `<button type="button" class="bible-hit${picked.has(key(x.book, x.c, x.v)) ? ' picked' : ''}" data-ref="${x.book}:${x.c}:${x.v}"><span class="bh-ref">${esc(B.book(x.book, ver)?.name || x.book)} ${x.c}:${x.v}</span>${note}<span class="bh-text">${mark(text.replace(/\n\t?/g, ' '))}</span></button>`;
    }).join('');
  $('bible-body').scrollTop = 0;
  renderBar();
}

export function searchOnline(q) {
  const words = (q || '').trim();
  if (!words) return;
  const site = B.searchSite(app.prefs().searchSite);
  window.open(site.url(words), '_blank', 'noopener');
  log.info('bible', 'Searched online', { site: site.id });
}

async function runSearch() {
  const q = $('bible-search').value.trim();
  if (!q) { showChapter(at.book, at.c); return; }
  const ref = B.parseRef(q, ver);
  if (ref) {
    picked.clear();
    if (!ref.whole) for (const x of B.passage(ref, ver)) picked.add(key(x.book, x.c, x.v));
    showChapter(ref.book, ref.c1, { scroll: ref.whole ? null : ref.v1 });
    return;
  }
  // Words: every translation already on this device takes part.
  for (const v of B.VERSIONS) if (!B.loaded(v.id) && await B.stored(v.id)) await B.load(v.id).catch(() => {});
  showResults(q);
}

// The picked verses as runs of neighbouring verses, in Bible order.
function runs() {
  const order = B.books(ver).map((b) => b.id);
  const list = [...picked].map((k) => { const [b, c, v] = k.split(':'); return { book: b, c: +c, v: +v }; })
    .sort((x, y) => order.indexOf(x.book) - order.indexOf(y.book) || x.c - y.c || x.v - y.v);
  const out = [];
  for (const x of list) {
    const last = out[out.length - 1];
    const ch = B.book(x.book, ver).c;
    const follows = last && last.book === x.book && ((last.c2 === x.c && last.v2 + 1 === x.v) || (last.c2 + 1 === x.c && x.v === 1 && last.v2 === ch[last.c2 - 1].length));
    if (follows) { last.c2 = x.c; last.v2 = x.v; } else out.push({ book: x.book, c1: x.c, v1: x.v, c2: x.c, v2: x.v });
  }
  return out;
}

function renderBar() {
  const n = picked.size;
  $('bible-bar').hidden = !n;
  if (!n) return;
  $('bible-sel').textContent = runs().map((x) => B.label(x, ver)).join('; ');
  $('bible-insert').hidden = !canInsert();
  const colors = new Set([...picked].map((k) => marks.get(k)?.color).filter(Boolean));
  $('bible-unhl').hidden = !colors.size;
  for (const d of document.querySelectorAll('#bible-colors .hl-dot')) {
    const on = colors.size === 1 && colors.has(d.dataset.color);
    d.classList.toggle('on', on);
    d.setAttribute('aria-pressed', String(on));
  }
}

// The picked verses as they are in the translation being read (for highlights).
function pickedVerses() {
  const out = [];
  for (const r of runs()) for (const x of B.passage(r, ver)) out.push({ book: x.book, c: x.c, v: x.v, version: ver, text: x.text.replace(/\n\t?/g, ' '), label: B.label({ book: x.book, c1: x.c, v1: x.v, c2: x.c, v2: x.v }, ver) });
  return out;
}
async function highlight(color) {
  const verses = pickedVerses();
  if (!verses.length) return;
  await app.setHighlight(verses, color);
  marks = app.highlights();
  for (const el of document.querySelectorAll('#bible-body .bv')) {
    const k = key(at.book, at.c, +el.dataset.v);
    el.className = el.className.replace(/\s*hl-[a-z]+(-\d)?/g, '') + (marks.get(k) ? ` hl-${marks.get(k).color}` : '');
  }
  picked.clear();
  document.querySelectorAll('#bible-body .picked').forEach((x) => x.classList.remove('picked'));
  renderBar();
  app.toast(color ? 'Highlighted' : 'Highlight removed');
}

// A bookmark on the picked verses, or on the chapter when none are picked.
function passageHere() {
  const r = shown === 'chapter' ? runs() : [];
  const b = B.book(at.book, ver);
  return r.length
    ? { ...r[0], version: ver, label: r.map((x) => B.label(x, ver)).join('; ') }
    : { book: at.book, c1: at.c, v1: 1, c2: at.c, v2: b.c[at.c - 1].length, whole: true, version: ver, label: `${b.name} ${at.c}` };
}
async function bookmark() {
  await app.addBookmark(passageHere());
  picked.clear();
  document.querySelectorAll('#bible-body .picked').forEach((x) => x.classList.remove('picked'));
  renderBar();
}

// Notes on the picked verses, or on the chapter when none are picked.
async function takeNotes() {
  const passage = passageHere();
  const phone = app.phone();
  picked.clear();
  document.querySelectorAll('#bible-body .picked').forEach((x) => x.classList.remove('picked'));
  renderBar();
  if (phone) close();
  await app.takeNotes(passage, `Notes on ${passage.label}`);
  if (!phone) setSide(true);
  log.info('bible', 'Notes taken', { passage: passage.label, side: !phone });
}

// Markdown for a note: a quote with verse numbers (superscript) and the reference under it.
const mdEsc = (s) => s.replace(/([\\`*_[\]~^])/g, '\\$1').replace(/==/g, '\\==').replace(/\+\+/g, '\\++');
export function quoteMarkdown(ranges, { numbers = true, v = ver } = {}) {
  return ranges.map((r) => {
    const lines = B.passage(r, v).filter((x) => x.text).map((x) => {
      const text = x.text.replace(/\n\t?/g, ' ').replace(/\s+/g, ' ').trim();
      return `> ${numbers ? `^${x.v}^ ` : ''}${mdEsc(text)}`;
    });
    return `${lines.join('\n')}\n>\n> — ${B.label(r, v)} (${B.version(v).short})`;
  }).join('\n\n');
}
export function quotePlain(ranges, { numbers = true, v = ver } = {}) {
  return ranges.map((r) => `${B.passage(r, v).filter((x) => x.text).map((x) => `${numbers ? `${x.v} ` : ''}${x.text.replace(/\n\t?/g, ' ')}`).join(' ')}\n— ${B.label(r, v)} (${B.version(v).short})`).join('\n\n');
}

export function init(hooks) {
  app = hooks;
  $('bible-close').addEventListener('click', close);
  // Escape closes the reader; beside a note, only while you are in the reader (Escape in the note is the note's own).
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen() && !document.querySelector('dialog[open]') && (!isSide() || $('bible-view').contains(document.activeElement) || document.activeElement === document.body)) { e.preventDefault(); close(); } });
  $('bible-side').addEventListener('click', () => setSide(!isSide()));
  $('bible-colors').innerHTML = B.highlightPalette(null);
  $('bible-colors').addEventListener('click', (e) => { const d = e.target.closest('[data-color]'); if (d) highlight(d.dataset.color); });
  $('bible-unhl').addEventListener('click', () => highlight(null));
  $('bible-take').addEventListener('click', takeNotes);
  $('bible-mark').addEventListener('click', bookmark);
  $('bible-books').addEventListener('click', showBooks);
  $('bible-version').addEventListener('change', (e) => switchVersion(e.target.value));
  $('bible-book').addEventListener('change', (e) => showChapters(e.target.value));
  $('bible-chapter').addEventListener('change', (e) => showChapter(at.book, +e.target.value));
  let t = null;
  $('bible-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(runSearch, 300); });
  $('bible-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(t); runSearch(); } });
  $('bible-body').addEventListener('click', (e) => {
    if (e.target.closest('#bible-online')) { searchOnline($('bible-search').value); return; }
    if (e.target.closest('#bible-chapter-notes')) { takeNotes(); return; }
    if (e.target.closest('#bible-chapter-mark')) { bookmark(); return; }
    if (e.target.closest('[data-books]')) { showBooks(); return; }
    const bk = e.target.closest('[data-book]');
    if (bk) { showChapters(bk.dataset.book); return; }
    const ch = e.target.closest('[data-chap]');
    if (ch) { const [b, c] = ch.dataset.chap.split(':'); showChapter(b, +c); return; }
    const go = e.target.closest('[data-go]');
    if (go) { const [b, c] = go.dataset.go.split(':'); showChapter(b, +c); return; }
    const note = e.target.closest('.bv-note');
    if (note) {
      e.stopPropagation();
      const next = note.nextElementSibling;
      if (next && next.classList.contains('bv-note-text')) { next.remove(); return; }
      const box = document.createElement('span');
      box.className = 'bv-note-text';
      box.textContent = (B.book(at.book, ver).f[note.dataset.k] || []).join(' ');
      note.after(box);
      return;
    }
    const hit = e.target.closest('.bible-hit');
    if (hit) {
      const [b, c, v] = hit.dataset.ref.split(':');
      picked.add(key(b, +c, +v));
      showChapter(b, +c, { scroll: +v });
      return;
    }
    const verse = e.target.closest('.bv');
    if (verse && shown === 'chapter') {
      const k = key(at.book, at.c, +verse.dataset.v);
      if (picked.has(k)) picked.delete(k); else picked.add(k);
      verse.classList.toggle('picked', picked.has(k));
      renderBar();
    }
  });
  $('bible-clear').addEventListener('click', () => { picked.clear(); document.querySelectorAll('#bible-body .picked').forEach((x) => x.classList.remove('picked')); renderBar(); });
  $('bible-copy').addEventListener('click', async () => {
    const text = quotePlain(runs(), { numbers: $('bible-numbers').checked });
    try { await navigator.clipboard.writeText(text); app.toast('Copied'); } catch { app.toast('Could not copy here'); }
  });
  $('bible-insert').addEventListener('click', () => {
    const r = runs();
    if (!r.length) return;
    const md = quoteMarkdown(r, { numbers: $('bible-numbers').checked });
    const labels = r.map((x) => B.label(x, ver)).join('; ');
    // Beside the note, the reader stays open.
    if (isSide()) { picked.clear(); document.querySelectorAll('#bible-body .picked').forEach((x) => x.classList.remove('picked')); renderBar(); } else close();
    app.insertBlocks(md);
    app.toast(`${labels} put in the note`);
    log.info('bible', 'Passage inserted', { refs: labels, version: ver });
  });
}
