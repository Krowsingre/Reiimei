// Reiimei Bible reader: read the WEB by book and chapter, find a passage by its reference or by
// its words, see the footnotes, and copy verses or put them into the note you are writing.
import * as B from './bible.js';
import { log } from './logger.js';

let app = null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let at = { book: 'GEN', c: 1 };
let picked = new Set(); // "book:c:v"
let forInsert = false;
let shown = 'chapter';  // or 'results'

const key = (b, c, v) => `${b}:${c}:${v}`;

export function isOpen() { return !$('bible-view').hidden; }

export async function open({ insert = false } = {}) {
  forInsert = insert;
  const view = $('bible-view');
  view.hidden = false;
  document.documentElement.dataset.bible = 'on';
  $('bible-insert').hidden = !canInsert();
  setStatus('');
  if (!B.loaded()) {
    setStatus('Getting the Bible ready… The first time, it is fetched once (about 1.5 MB), then it works offline.');
    try { await B.load(); } catch (e) {
      setStatus(`The Bible could not be fetched. Connect to the internet once and open it again. (${e.message})`);
      log.warn('bible', 'Could not load the Bible', { error: e.message });
      return;
    }
    setStatus('');
  }
  fillBooks();
  const last = app.prefs().bibleAt;
  if (last && B.book(last.book)) at = { book: last.book, c: Math.min(last.c, B.book(last.book).c.length) };
  showChapter(at.book, at.c);
  if (insert) $('bible-search').focus();
}

export function close() {
  $('bible-view').hidden = true;
  delete document.documentElement.dataset.bible;
  picked.clear();
  renderBar();
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

function fillBooks() {
  const sel = $('bible-book');
  if (sel.options.length) return;
  const books = B.books();
  const ot = books.slice(0, 39);
  const nt = books.slice(39);
  sel.innerHTML = `<optgroup label="Old Testament">${ot.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</optgroup><optgroup label="New Testament">${nt.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</optgroup>`;
}
function fillChapters(id) {
  const b = B.book(id);
  $('bible-chapter').innerHTML = b.c.map((_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
}

function verseHtml(b, c, v, item) {
  const [text] = item;
  const k = `${c}:${v}`;
  const notes = b.f[k];
  const lines = esc(text).replace(/\n\t/g, '<br><span class="bv-indent"></span>').replace(/\n/g, '<br>');
  const sel = picked.has(key(b.id, c, v)) ? ' picked' : '';
  const empty = text ? '' : ' empty';
  return `<span class="bv${sel}${empty}" data-v="${v}" id="bv-${c}-${v}"><sup class="bv-n">${v}</sup>${lines}${notes ? `<button type="button" class="bv-note" data-k="${k}" aria-label="Footnote">†</button>` : ''}</span> `;
}

export function showChapter(id, c, { select = null, scroll = null } = {}) {
  const b = B.book(id);
  if (!b) return;
  at = { book: id, c };
  shown = 'chapter';
  app.setPrefs({ bibleAt: at });
  $('bible-book').value = id;
  fillChapters(id);
  $('bible-chapter').value = String(c);
  if (select) for (const v of select) picked.add(key(id, c, v));
  const verses = b.c[c - 1];
  let html = `<h2 class="bible-chapter-title">${esc(b.name)} ${c}</h2>`;
  let open = null; // 'p' or 'q'
  const closeBlock = () => { if (open) { html += '</p>'; open = null; } };
  verses.forEach((item, i) => {
    const v = i + 1;
    const title = b.t[`${c}:${v}`];
    if (title) { closeBlock(); html += `<p class="bible-title">${esc(title)}</p>`; }
    const kind = item[1];
    if (kind === 'p' || kind === 'b' || !open) { closeBlock(); html += `<p class="bible-p${kind === 'b' ? ' gap' : ''}">`; open = 'p'; }
    if (kind === 'q1' || kind === 'q2') { closeBlock(); html += `<p class="bible-q ${kind}">`; open = 'q'; }
    html += verseHtml(b, c, v, item);
  });
  closeBlock();
  const books = B.books();
  const bi = books.findIndex((x) => x.id === id);
  const prev = c > 1 ? [id, c - 1] : bi > 0 ? [books[bi - 1].id, books[bi - 1].c.length] : null;
  const next = c < b.c.length ? [id, c + 1] : bi < books.length - 1 ? [books[bi + 1].id, 1] : null;
  html += `<nav class="bible-nav">${prev ? `<button type="button" class="btn" data-go="${prev[0]}:${prev[1]}">‹ ${esc(B.book(prev[0]).name)} ${prev[1]}</button>` : '<span></span>'}${next ? `<button type="button" class="btn" data-go="${next[0]}:${next[1]}">${esc(B.book(next[0]).name)} ${next[1]} ›</button>` : ''}</nav>`;
  html += `<p class="bible-credit">${esc(B.NAME)} (${B.SHORT}), public domain.</p>`;
  const body = $('bible-body');
  body.innerHTML = html;
  const target = scroll ? $(`bv-${c}-${scroll}`) : null;
  if (target) target.scrollIntoView({ block: 'center' }); else body.scrollTop = 0;
  renderBar();
}

function showResults(q) {
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
  const body = $('bible-body');
  body.innerHTML = `<p class="bible-count">${r.total ? `${r.total.toLocaleString()} ${r.total === 1 ? 'verse' : 'verses'}${r.total > r.hits.length ? ` (the first ${r.hits.length} shown)` : ''}` : 'No verses found'}</p>`
    + r.hits.map((x) => `<button type="button" class="bible-hit${picked.has(key(x.book, x.c, x.v)) ? ' picked' : ''}" data-ref="${x.book}:${x.c}:${x.v}"><span class="bh-ref">${esc(B.book(x.book).name)} ${x.c}:${x.v}</span><span class="bh-text">${mark(x.text.replace(/\n\t?/g, ' '))}</span></button>`).join('');
  body.scrollTop = 0;
  renderBar();
}

function runSearch() {
  const q = $('bible-search').value.trim();
  if (!q) { showChapter(at.book, at.c); return; }
  const ref = B.parseRef(q);
  if (ref) {
    const vs = ref.whole ? [] : B.passage({ ...ref, c2: ref.c1, v2: ref.c1 === ref.c2 ? ref.v2 : B.book(ref.book).c[ref.c1 - 1].length }).map((x) => x.v);
    picked.clear();
    if (!ref.whole) for (const x of B.passage(ref)) picked.add(key(x.book, x.c, x.v));
    showChapter(ref.book, ref.c1, { scroll: ref.whole ? null : vs[0] });
    return;
  }
  showResults(q);
}

// The picked verses as runs of neighbouring verses, in Bible order.
function runs() {
  const order = B.books().map((b) => b.id);
  const list = [...picked].map((k) => { const [b, c, v] = k.split(':'); return { book: b, c: +c, v: +v }; })
    .sort((x, y) => order.indexOf(x.book) - order.indexOf(y.book) || x.c - y.c || x.v - y.v);
  const out = [];
  for (const x of list) {
    const last = out[out.length - 1];
    const ch = B.book(x.book).c;
    const follows = last && last.book === x.book && ((last.c2 === x.c && last.v2 + 1 === x.v) || (last.c2 + 1 === x.c && x.v === 1 && last.v2 === ch[last.c2 - 1].length));
    if (follows) { last.c2 = x.c; last.v2 = x.v; } else out.push({ book: x.book, c1: x.c, v1: x.v, c2: x.c, v2: x.v });
  }
  return out;
}

function renderBar() {
  const n = picked.size;
  $('bible-bar').hidden = !n;
  if (!n) return;
  const r = runs();
  $('bible-sel').textContent = r.map((x) => B.label(x)).join('; ');
  $('bible-insert').hidden = !canInsert();
}

// Markdown for a note: a quote with verse numbers (superscript) and the reference under it.
const mdEsc = (s) => s.replace(/([\\`*_[\]~^])/g, '\\$1').replace(/==/g, '\\==').replace(/\+\+/g, '\\++');
export function quoteMarkdown(ranges, { numbers = true } = {}) {
  return ranges.map((r) => {
    const lines = B.passage(r).filter((x) => x.text).map((x) => {
      const text = x.text.replace(/\n\t?/g, ' ').replace(/\s+/g, ' ').trim();
      return `> ${numbers ? `^${x.v}^ ` : ''}${mdEsc(text)}`;
    });
    return `${lines.join('\n')}\n>\n> — ${B.label(r)} (${B.SHORT})`;
  }).join('\n\n');
}
export function quotePlain(ranges, { numbers = true } = {}) {
  return ranges.map((r) => `${B.passage(r).filter((x) => x.text).map((x) => `${numbers ? `${x.v} ` : ''}${x.text.replace(/\n\t?/g, ' ')}`).join(' ')}\n— ${B.label(r)} (${B.SHORT})`).join('\n\n');
}

export function init(hooks) {
  app = hooks;
  $('bible-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen() && !document.querySelector('dialog[open]')) { e.preventDefault(); close(); } });
  $('bible-book').addEventListener('change', (e) => showChapter(e.target.value, 1));
  $('bible-chapter').addEventListener('change', (e) => showChapter(at.book, +e.target.value));
  let t = null;
  $('bible-search').addEventListener('input', () => { clearTimeout(t); t = setTimeout(runSearch, 250); });
  $('bible-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(t); runSearch(); } });
  $('bible-body').addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { const [b, c] = go.dataset.go.split(':'); showChapter(b, +c); return; }
    const note = e.target.closest('.bv-note');
    if (note) {
      e.stopPropagation();
      const k = note.dataset.k;
      const next = note.nextElementSibling;
      if (next && next.classList.contains('bv-note-text')) { next.remove(); return; }
      const box = document.createElement('span');
      box.className = 'bv-note-text';
      box.textContent = (B.book(at.book).f[k] || []).join(' ');
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
    close();
    app.insertBlocks(md);
    app.toast(`${r.map((x) => B.label(x)).join('; ')} put in the note`);
    log.info('bible', 'Passage inserted', { refs: r.map((x) => B.label(x)) });
  });
}
