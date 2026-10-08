// Reiimei Text notes: write the way you would in a word processor. Bold looks bold and a heading
// looks like a heading, with no symbols and no switching between editing and preview.
// Underneath, a Text note is kept as Markdown (in the hidden #body text box), so saving, sync,
// search, citations, sharing, papers and Copy all work exactly as they do for Markdown notes,
// and a note can switch between Text and Markdown without losing anything.
import { parseMarkdown, inlineToMarkdown, noteToHtml, escapeHtml as esc } from './format.js';
import { plainText } from './share.js';
import { stripFragment, stripLabels, labelsIn } from './brackets.js';
import { trace } from './typingcheck.js';

const $ = (id) => document.getElementById(id);
let app = null;
let box = null;          // the editable page (#rich)
let shownId = null;      // note shown in it
let shownSrc = null;     // the Markdown it shows
let composing = false;   // words are being composed (dictation, a Japanese or Chinese keyboard…)
let fromRich = false;    // true while the page itself is updating the text box
let savedRange = null;   // where the caret was when a dialog took focus

export const isTextNote = (note) => !!note && note.format === 'text';
export const active = () => !!box && !box.hidden;

// ---- Markdown -> page ---------------------------------------------------------------
const TAG = { b: 'strong', i: 'em', u: 'u', s: 's', sup: 'sup', sub: 'sub', mark: 'mark' };
function inlineHtml(nodes) {
  return nodes.map((n) => {
    switch (n.t) {
      case 'text': return esc(n.v);
      case 'code': return `<code>${esc(n.v)}</code>`;
      case 'link': return `<a href="${esc(n.href)}">${inlineHtml(n.c)}</a>`;
      // Citations, web addresses, images and emoji codes stay as you typed them.
      case 'cite': return esc(`[${n.raw}]`);
      case 'ncite': return esc(n.raw);
      case 'url': return esc(n.v);
      case 'img': return esc(`![${n.alt}](${n.src})`);
      case 'emoji': return esc(`:${n.name}:`);
      case 'font': return `<span class="f-run" data-font="${esc(n.font)}">${inlineHtml(n.c)}</span>`;
      default: return TAG[n.t] ? `<${TAG[n.t]}>${inlineHtml(n.c)}</${TAG[n.t]}>` : '';
    }
  }).join('');
}
function listHtml(items) {
  let html = '';
  const stack = [];
  for (const it of items) {
    const tag = it.ordered ? 'ol' : 'ul';
    while (stack.length && stack[stack.length - 1].level > it.level) html += `</li></${stack.pop().tag}>`;
    const top = stack[stack.length - 1];
    if (!top || top.level < it.level) { html += `<${tag}>`; stack.push({ level: it.level, tag }); } else html += '</li>';
    html += `<li${it.task ? ` class="task" data-done="${it.checked}"` : ''}>${inlineHtml(it.c) || '<br>'}`;
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}
function blocksHtml(blocks) {
  return blocks.map((b) => {
    switch (b.t) {
      case 'h': return `<h${b.level}>${inlineHtml(b.c) || '<br>'}</h${b.level}>`;
      case 'hr': return '<hr>';
      case 'code': return `<pre data-lang="${esc(b.lang || '')}">${esc(b.v)}</pre>`;
      case 'quote': return `<blockquote>${blocksHtml(b.blocks) || '<p><br></p>'}</blockquote>`;
      case 'list': return listHtml(b.items);
      case 'table': {
        // Tables (from Markdown notes) are shown but kept as they are.
        const md = [b.head, b.head.map(() => '---'), ...b.rows].map((r, k) => `| ${(k === 1 ? r : r.map((c) => inlineToMarkdown(c))).join(' | ')} |`).join('\n');
        const cell = (c, t) => `<${t}>${inlineHtml(c)}</${t}>`;
        return `<div class="raw-block" contenteditable="false" data-md="${esc(md)}"><table><tr>${b.head.map((c) => cell(c, 'th')).join('')}</tr>${b.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('')}</table></div>`;
      }
      default: return b.blank ? '<p><br></p>' : `<p>${b.lines.map(inlineHtml).join('<br>') || '<br>'}</p>`;
    }
  }).join('');
}
export const markdownToHtml = (md) => blocksHtml(parseMarkdown(md || '')) || '<p><br></p>';

// ---- Page -> Markdown ---------------------------------------------------------------
const MARK = { STRONG: '**', B: '**', EM: '*', I: '*', U: '++', S: '~~', STRIKE: '~~', DEL: '~~', MARK: '==', SUP: '^', SUB: '~' };
// Citations, web addresses and emoji codes are written back untouched; other text is escaped
// so that a * or # you type stays a character instead of becoming formatting.
const KEEP = /(\[@[\w:-]+[^\]\n]*\]|https?:\/\/[^\s<>"]*[^\s<>"'.,:;!?)\]]|:[a-z0-9_+-]+:)/gi;
function escText(s) {
  return s.split(KEEP).map((part, k) => (k % 2 ? part : part.replace(/([\\`*_[\]~^])/g, '\\$1').replace(/==/g, '\\==').replace(/\+\+/g, '\\++'))).join('');
}
function inlineMd(node, font = null) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { out += escText(n.nodeValue.replace(/\u00a0/g, ' ').replace(/\n/g, ' ')); continue; }
    if (n.nodeType !== 1) continue;
    const t = n.tagName;
    if (t === 'BR') { out += '\n'; continue; }
    if (t === 'CODE') { out += n.textContent ? `\`${n.textContent.replace(/`/g, "'")}\`` : ''; continue; }
    if (t === 'SPAN' && n.dataset.font && /^[a-z][a-z0-9-]*$/.test(n.dataset.font)) {
      const f = n.dataset.font;
      const inner = inlineMd(n, f);
      if (!inner.trim() || f === font) { out += inner; continue; }
      const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
      out += `${lead}${font ? '[[/f]]' : ''}[[f:${f}]]${core}[[/f]]${font ? `[[f:${font}]]` : ''}${trail}`;
      continue;
    }
    const inner = inlineMd(n, font);
    if (t === 'A') { const href = n.getAttribute('href') || ''; out += /^(https?:|mailto:)/i.test(href) && inner.trim() ? `[${inner}](${href})` : inner; continue; }
    let m = MARK[t];
    if (!m && t === 'SPAN') { const st = n.getAttribute('data-style') || ''; m = /font-weight:\s*(bold|[6-9]00)/i.test(st) ? '**' : /font-style:\s*italic/i.test(st) ? '*' : ''; }
    if (!m || !inner.trim()) { out += inner; continue; }
    // Spaces stay outside the marks, where Markdown expects them.
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
    out += `${lead}${m}${core}${m}${trail}`;
  }
  return out;
}
// A line of a paragraph that starts like a heading, list or quote is escaped to stay text.
const escLineStart = (line) => (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line) ? line.replace(/^(\s*)/, '$1\\') : line.replace(/^(\s*)(#|>|[-*+](?=\s)|\d+[.)](?=\s))/, '$1\\$2'));
const dropEmptyRuns = (s) => s.replace(/\[\[f:[a-z][a-z0-9-]*\]\]\[\[\/f\]\]/g, '');
function paraParts(el) {
  // The last line break of a paragraph only holds the line open (the browser adds one after a
  // Shift+Enter at the end of a line), so one is dropped; any more are lines left empty on purpose.
  const lines = dropEmptyRuns(inlineMd(el)).replace(/\n$/, '').split('\n').map((l) => escLineStart(l.replace(/\s+$/, '')));
  // An empty line inside a paragraph (two line breaks in a row: Shift+Enter twice, Shift+Enter at
  // the end of a line, typing on an iPhone, pasted text) is a blank line kept on purpose, just
  // like an empty paragraph.
  const out = [];
  let cur = [];
  for (const l of lines) {
    if (l.trim()) { cur.push(l); continue; }
    if (cur.length) { out.push(cur.join('\n')); cur = []; }
    out.push(BLANK_LINE);
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}
function listMd(list, level, out) {
  let n = 0;
  for (const c of list.children) {
    if (c.tagName === 'UL' || c.tagName === 'OL') { listMd(c, level + 1, out); continue; }
    if (c.tagName !== 'LI') continue;
    const marker = list.tagName === 'OL' ? `${++n}.` : '-';
    const task = c.classList.contains('task') ? (c.dataset.done === 'true' ? '[x] ' : '[ ] ') : '';
    const own = c.ownerDocument.createElement('div');
    const nested = [];
    for (const k of c.childNodes) { if (k.nodeType === 1 && (k.tagName === 'UL' || k.tagName === 'OL')) nested.push(k); else own.appendChild(k.cloneNode(true)); }
    out.push(`${'  '.repeat(level)}${marker} ${task}${dropEmptyRuns(inlineMd(own)).replace(/\n+/g, ' ').trim()}`);
    for (const k of nested) listMd(k, level + 1, out);
  }
}
const BLOCK = /^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE|PRE|HR|TABLE|SECTION|ARTICLE|HEADER|FOOTER|LI)$/;
function blocksMd(parent) {
  const out = [];
  let loose = null; // inline content sitting straight in the page
  const flushLoose = () => { if (loose && loose.textContent.trim()) out.push(...paraParts(loose)); loose = null; };
  for (const n of parent.childNodes) {
    if (n.nodeType === 1 && n.classList.contains('raw-block')) { flushLoose(); out.push(n.dataset.md || ''); continue; }
    if (n.nodeType !== 1 || !BLOCK.test(n.tagName)) {
      if (n.nodeType === 3 && !n.nodeValue.trim() && !loose) continue;
      (loose ||= n.ownerDocument.createElement('p')).appendChild(n.cloneNode(true));
      continue;
    }
    flushLoose();
    const t = n.tagName;
    if (/^H[1-6]$/.test(t)) { const s = dropEmptyRuns(inlineMd(n)).replace(/\n+/g, ' ').trim(); if (s) out.push(`${'#'.repeat(+t[1])} ${s}`); }
    else if (t === 'UL' || t === 'OL') { const lines = []; listMd(n, 0, lines); if (lines.length) out.push(lines.join('\n')); }
    else if (t === 'BLOCKQUOTE') { const inner = blocksMd(n); if (inner.trim()) out.push(inner.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')); }
    else if (t === 'PRE') out.push(`\`\`\`${n.dataset.lang || ''}\n${n.textContent.replace(/\n$/, '')}\n\`\`\``);
    else if (t === 'HR') out.push('---');
    else if (n.querySelector('p,div,h1,h2,h3,h4,h5,h6,ul,ol,blockquote,pre,table')) { const inner = blocksMd(n); if (inner) out.push(inner); }
    else { const parts = paraParts(n); out.push(...(parts.length ? parts : [BLANK_LINE])); }
  }
  flushLoose();
  // A blank line typed on purpose is kept as "&nbsp;" (standard Markdown for an empty paragraph),
  // except at the very start and end of the note.
  while (out[0] === BLANK_LINE) out.shift();
  while (out[out.length - 1] === BLANK_LINE) out.pop();
  return out.join('\n\n');
}
const BLANK_LINE = '&nbsp;';
export const htmlToMarkdown = (el) => blocksMd(el);

// ---- Keeping the page and the text box in step --------------------------------------------
function show(md) {
  trace('redraw', { chars: md.length });
  box.innerHTML = markdownToHtml(md);
  shownSrc = md;
  markEmpty();
}
function markEmpty() { box.classList.toggle('empty', !box.textContent.trim() && !box.querySelector('li,hr,.raw-block')); }

function pushToBody() {
  const md = htmlToMarkdown(box);
  markEmpty();
  if (md === shownSrc) return;
  shownSrc = md;
  const ta = $('body');
  ta.value = md;
  fromRich = true;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  fromRich = false;
}

// Called whenever the editor is drawn: show the page for Text notes, the plain box otherwise.
export function render(note) {
  const on = isTextNote(note) && $('board').hidden && !note.locked;
  box.hidden = !on;
  if (!on) { shownId = null; return; }
  const ta = $('body');
  ta.hidden = true;
  // Only what changed is written: on an iPhone, touching the box while you dictate into it makes
  // the words come out twice.
  const editable = String(!note.deleted);
  if (box.contentEditable !== editable) box.contentEditable = editable;
  if (box.dataset.placeholder !== ta.placeholder) box.dataset.placeholder = ta.placeholder;
  if (note.id !== shownId) { shownId = note.id; show(ta.value); }
  else if (ta.value !== shownSrc && !composing) show(ta.value);
}

// A caret at the end of an element, but before the line break that holds an empty line open:
// typing or dictating from after that break goes wrong (Chrome keeps a stray letter, and an iPhone
// writes the dictated words twice).
function endOf(el) {
  const r = document.createRange();
  let n = el;
  while (n.lastChild && n.lastChild.nodeType === 1 && n.lastChild.tagName !== 'BR' && !/^(UL|OL|TABLE|HR|IMG)$/.test(n.lastChild.tagName)) n = n.lastChild;
  if (n.lastChild?.nodeName === 'BR') r.setStartBefore(n.lastChild);
  else { r.selectNodeContents(n); r.collapse(false); }
  r.collapse(true);
  return r;
}

export function focus(atStart = false) {
  if (!active()) return false;
  box.focus();
  let r = document.createRange();
  if (atStart) { r.selectNodeContents(box.firstElementChild || box); r.collapse(true); } else r = endOf(box.firstElementChild || box);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
  if (atStart) box.scrollTop = 0;
  return true;
}

// ---- Formatting --------------------------------------------------------------------------
// Block tools (headings, lists, checklists, moving items in and out, quotes) are done by hand
// rather than with the browser's own commands, which behave differently on iPhone and can nest
// a list inside a paragraph. Every tool works on all the paragraphs the selection touches, and
// text is moved, never copied, so the caret and selection stay where they were.
const sel = () => getSelection();
const inBox = (node) => !!node && box.contains(node.nodeType === 1 ? node : node.parentNode);
const closest = (node, selector) => { const n = node?.nodeType === 1 ? node : node?.parentElement; const hit = n?.closest(selector); return hit && box.contains(hit) ? hit : null; };
const LEAF = /^(P|DIV|H[1-6]|LI|PRE)$/;
const isList = (n) => n?.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL');

// The caret is remembered whenever it moves inside the note, so a button or a dialog that takes
// focus (as a tap does on iPhone) can put it back.
export function saveCaret() {
  const s = sel();
  if (s.rangeCount && inBox(s.anchorNode)) { savedRange = s.getRangeAt(0).cloneRange(); return; }
  const a = document.activeElement;
  // (Fields in dialogs, such as Add source, do not count: the citation goes back where the caret was.)
  if (a && a !== box && !a.closest('dialog') && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName))) savedRange = null;
}
// True when words are selected in the note (or were, just before a menu took the focus).
export function hasSelection() {
  const s = sel();
  if (s.rangeCount && inBox(s.anchorNode) && !s.isCollapsed) return true;
  return !!savedRange && !savedRange.collapsed && inBox(savedRange.startContainer);
}
function restoreCaret() {
  box.focus({ preventScroll: true });
  const s = sel();
  if (s.rangeCount && inBox(s.anchorNode)) return;
  const r = savedRange && inBox(savedRange.startContainer) ? savedRange : endOf(box);
  s.removeAllRanges();
  s.addRange(r);
}

// Loose text sitting straight in the page goes into a paragraph, and blocks a browser has put
// inside a paragraph are taken out of it, so every tool has proper paragraphs to work on.
function tidyBlocks() {
  let p = null;
  for (const n of [...box.childNodes]) {
    if (n.nodeType === 1 && (BLOCK.test(n.tagName) || n.classList.contains('raw-block'))) { p = null; continue; }
    if (n.nodeType === 3 && !n.nodeValue.trim() && !p) { n.remove(); continue; }
    if (!p) { p = document.createElement('p'); n.before(p); }
    p.appendChild(n);
  }
  for (const para of [...box.querySelectorAll('p')]) {
    const inner = [...para.children].filter((c) => isList(c) || /^(BLOCKQUOTE|H[1-6]|PRE|P|DIV)$/.test(c.tagName));
    for (const c of inner.reverse()) para.after(c);
    if (!para.childNodes.length || (!para.textContent.trim() && !para.querySelector('br') && inner.length)) para.remove();
  }
  if (!box.firstChild) box.innerHTML = '<p><br></p>';
}

// The paragraphs, headings and list items the selection touches, in order. A list item counts
// only for its own text, so a caret in a nested item does not also pick the item around it.
function selectedBlocks() {
  const r = sel().getRangeAt(0);
  if (r.collapsed) {
    const at = r.startContainer === box ? box.childNodes[Math.min(r.startOffset, box.childNodes.length - 1)] : r.startContainer;
    const one = at && (at.nodeType === 1 && LEAF.test(at.tagName) ? at : closest(at, 'p,div,h1,h2,h3,h4,h5,h6,li,pre'));
    return one && one !== box ? [one] : [];
  }
  const own = (b) => [...b.childNodes].filter((k) => !isList(k));
  return [...box.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,pre')].filter((b) => {
    if (b.closest('.raw-block')) return false;
    if (b.tagName === 'LI') return own(b).some((k) => r.intersectsNode(k));
    if (b.tagName === 'DIV' && b.querySelector('p,div,h1,h2,h3,h4,h5,h6,li,ul,ol,blockquote')) return false;
    return r.intersectsNode(b);
  });
}

// An element replaced by another (a list item that became a paragraph, a list of another kind),
// so a caret that was in the old one can go into the new one.
const movedTo = new WeakMap();
const current = (n) => { while (n && !n.isConnected && movedTo.has(n)) n = movedTo.get(n); return n; };
function keepSelection(fn) {
  const s = sel();
  const r = s.rangeCount ? s.getRangeAt(0) : null;
  const a = r && [r.startContainer, r.startOffset, r.endContainer, r.endOffset];
  fn();
  if (a) { a[0] = current(a[0]); a[2] = current(a[2]); }
  if (!a || !box.contains(a[0]) || !box.contains(a[2])) return;
  const len = (n) => (n.nodeType === 3 ? n.length : n.childNodes.length);
  const nr = document.createRange();
  nr.setStart(a[0], Math.min(a[1], len(a[0])));
  nr.setEnd(a[2], Math.min(a[3], len(a[2])));
  s.removeAllRanges();
  s.addRange(nr);
}
const moveKids = (from, to) => { while (from.firstChild) to.appendChild(from.firstChild); if (!to.firstChild) to.appendChild(document.createElement('br')); };
function rename(el, tag) {
  const n = document.createElement(tag);
  for (const a of el.attributes) n.setAttribute(a.name, a.value);
  moveKids(el, n);
  el.replaceWith(n);
  movedTo.set(el, n);
  return n;
}
const nestedLists = (li) => [...li.children].filter(isList);
const isNestedList = (list) => list.parentElement !== box && (list.parentElement.tagName === 'LI' || isList(list.parentElement));

// A list item becomes a paragraph again, splitting its list in two if it was in the middle.
function unlist(li) {
  const list = li.parentElement;
  const p = document.createElement('p');
  for (const k of [...li.childNodes]) if (!isList(k)) p.appendChild(k);
  if (!p.firstChild) p.appendChild(document.createElement('br'));
  const after = [...list.children].slice([...list.children].indexOf(li) + 1);
  const kids = nestedLists(li);
  list.after(p);
  let last = p;
  for (const k of kids) { last.after(k); last = k; }
  if (after.length) { const rest = document.createElement(list.tagName); after.forEach((x) => rest.appendChild(x)); last.after(rest); }
  li.remove();
  movedTo.set(li, p);
  if (!list.children.length) list.remove();
  return p;
}

function toList(tag, blocks = selectedBlocks()) {
  const items = blocks.filter((b) => b.tagName === 'LI');
  const others = blocks.filter((b) => b.tagName !== 'LI' && b.tagName !== 'PRE');
  if (!others.length && items.length) {
    // All list items already: the same button again turns them back into paragraphs (or, for a
    // nested item, moves it out); the other list button switches the kind of list.
    if (items.every((li) => li.parentElement.tagName === tag)) {
      for (const li of items.reverse()) { if (isNestedList(li.parentElement)) outdent(li); else unlist(li); }
    } else {
      new Set(items.map((li) => li.parentElement)).forEach((list) => { if (list.tagName !== tag) rename(list, tag); });
    }
    return [];
  }
  const made = [];
  for (const b of others) {
    const li = document.createElement('li');
    moveKids(b, li);
    const prev = b.previousElementSibling;
    if (prev && prev.tagName === tag && !prev.classList.contains('raw-block')) { prev.appendChild(li); b.remove(); }
    else { const list = document.createElement(tag); list.appendChild(li); b.replaceWith(list); }
    // Join a list that follows straight after.
    const list = li.parentElement;
    const next = list.nextElementSibling;
    if (next && next.tagName === tag) { while (next.firstChild) list.appendChild(next.firstChild); next.remove(); }
    made.push(li);
  }
  return made;
}

function indent(li) {
  const list = li.parentElement;
  const prev = li.previousElementSibling;
  if (prev && prev.tagName === 'LI') {
    let sub = nestedLists(prev).pop();
    if (!sub) { sub = document.createElement(list.tagName); prev.appendChild(sub); }
    sub.appendChild(li);
  } else {
    // The first item of a list moves in on its own.
    const sub = document.createElement(list.tagName);
    li.before(sub);
    sub.appendChild(li);
  }
}
function outdent(li) {
  const list = li.parentElement;
  if (!isNestedList(list)) { unlist(li); return; }
  const holder = list.parentElement.tagName === 'LI' ? list.parentElement : list;
  const after = [...list.children].slice([...list.children].indexOf(li) + 1);
  holder.after(li);
  if (after.length) { const sub = document.createElement(list.tagName); after.forEach((x) => sub.appendChild(x)); li.appendChild(sub); }
  if (!list.children.length) list.remove();
}

const topOf = (n) => { while (n.parentElement && n.parentElement !== box) n = n.parentElement; return n; };
function toggleQuote(blocks) {
  const q = closest(blocks[0], 'blockquote');
  if (q) { while (q.firstChild) q.before(q.firstChild); q.remove(); return; }
  const tops = [...new Set(blocks.map(topOf))];
  const bq = document.createElement('blockquote');
  tops[0].before(bq);
  tops.forEach((t) => bq.appendChild(t));
  const prev = bq.previousElementSibling;
  if (prev?.tagName === 'BLOCKQUOTE') { while (bq.firstChild) prev.appendChild(bq.firstChild); bq.remove(); }
}

// The List button: no list → bullets → numbers → checklist → no list, judged by where the caret is.
export function listKind() {
  const s = sel();
  const li = s.rangeCount ? closest(s.anchorNode, 'li') : null;
  if (!li) return 'none';
  if (li.classList.contains('task')) return 'task';
  return li.parentElement.tagName === 'OL' ? 'ol' : 'ul';
}
// Only the chosen items change kind: they move into a list of their own when the rest of their
// list stays as it was.
function retag(items, tag) {
  const groups = new Map();
  for (const li of items) { const l = li.parentElement; if (!groups.has(l)) groups.set(l, []); groups.get(l).push(li); }
  for (const [list, lis] of groups) {
    if (list.tagName === tag) continue;
    const kids = [...list.children];
    if (lis.length === kids.length) { rename(list, tag); continue; }
    const i0 = kids.indexOf(lis[0]);
    const i1 = kids.indexOf(lis[lis.length - 1]);
    const mid = document.createElement(tag);
    kids.slice(i0, i1 + 1).forEach((k) => mid.appendChild(k));
    const after = kids.slice(i1 + 1);
    list.after(mid);
    if (after.length) { const rest = document.createElement(list.tagName); after.forEach((k) => rest.appendChild(k)); mid.after(rest); }
    if (!list.children.length) list.remove();
  }
}
function cycleList(blocks, tasks = true) {
  const kind = listKind();
  const items = blocks.filter((b) => b.tagName === 'LI');
  if (kind === 'none' || !items.length) { toList('UL', blocks); return; }
  if (kind === 'ul') { retag(items, 'OL'); return; }
  if (kind === 'ol' && !tasks) { toList('OL', items); return; } // the phone's List: bullets, numbers, none
  if (kind === 'ol') { retag(items, 'UL'); items.forEach((li) => { li.classList.add('task'); li.dataset.done = 'false'; }); return; }
  items.forEach((li) => { li.classList.remove('task'); delete li.dataset.done; });
  toList('UL', items);
}

function toggleTask(blocks) {
  const items = blocks.filter((b) => b.tagName === 'LI');
  const made = toList('UL', blocks.filter((b) => b.tagName !== 'LI'));
  const all = [...items, ...made];
  const off = made.length === 0 && items.every((li) => li.classList.contains('task'));
  for (const li of all) {
    if (off) { li.classList.remove('task'); delete li.dataset.done; }
    else if (!li.classList.contains('task')) { li.classList.add('task'); li.dataset.done = 'false'; }
  }
}

const HEADINGS = ['P', 'H1', 'H2', 'H3'];
function cycleHeading(blocks) {
  const paras = blocks.filter((b) => /^(P|DIV|H[1-6])$/.test(b.tagName));
  if (!paras.length) return false;
  const cur = HEADINGS.includes(paras[0].tagName) ? paras[0].tagName : 'P';
  const next = HEADINGS[(HEADINGS.indexOf(cur) + 1) % HEADINGS.length];
  for (const b of paras) rename(b, next);
  return true;
}

// The text nodes a range covers, split at its ends so each lies wholly inside it.
function textsIn(r) {
  const out = [];
  const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.length && r.intersectsNode(n) && !n.parentElement.closest('.raw-block') ? 1 : 2) });
  const all = [];
  while (walk.nextNode()) all.push(walk.currentNode);
  const { startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = r;
  for (const n of all) {
    const start = n === sc ? so : 0;
    const end = n === ec ? eo : n.length;
    if (start >= end) continue;
    let t = n;
    if (end < t.length) t.splitText(end);
    if (start > 0) t = t.splitText(start);
    out.push(t);
  }
  return out;
}
function selectTexts(texts) {
  if (!texts.length) return;
  const r = document.createRange();
  r.setStart(texts[0], 0);
  r.setEnd(texts[texts.length - 1], texts[texts.length - 1].length);
  sel().removeAllRanges();
  sel().addRange(r);
}
function wrapText(t, make) {
  const el = make();
  t.before(el);
  el.appendChild(t);
  return el;
}
// Join neighbouring runs of the same kind so a note does not fill up with tiny pieces.
function mergeRuns(selector, same) {
  for (const el of [...box.querySelectorAll(selector)]) {
    const prev = el.previousSibling;
    if (prev && prev.nodeType === 1 && prev.matches(selector) && same(prev, el)) { while (el.firstChild) prev.appendChild(el.firstChild); el.remove(); }
  }
}
// Highlight and code: wrap the selected text (across paragraphs too), or take it away when all of
// the selected text already has it.
// The elements that already carry each style (a browser or a paste may use either tag).
const STYLE_TAGS = { strong: 'strong,b', em: 'em,i', u: 'u', s: 's,strike,del', sup: 'sup', sub: 'sub', mark: 'mark', code: 'code' };
function toggleWrap(tag, r) {
  const texts = textsIn(r);
  if (!texts.length) return;
  const inside = (t) => closest(t, STYLE_TAGS[tag] || tag);
  if (texts.every(inside)) {
    for (const el of new Set(texts.map(inside))) { const parent = el.parentNode; while (el.firstChild) parent.insertBefore(el.firstChild, el); el.remove(); }
  } else {
    for (const t of texts) if (!inside(t)) wrapText(t, () => document.createElement(tag));
    mergeRuns(tag, () => true);
    if (tag === 'sup' || tag === 'sub') {
      // Superscript and subscript do not stack: the other one comes off this text.
      for (const t of texts) { const o = closest(t, tag === 'sup' ? 'sub' : 'sup'); if (o) { const parent = o.parentNode; while (o.firstChild) parent.insertBefore(o.firstChild, o); o.remove(); } }
    }
  }
  selectTexts(texts);
}

const fontRun = (id) => { const el = document.createElement('span'); el.className = 'f-run'; el.dataset.font = id; return el; };
// A font on the selected text only. Choosing the note's own font takes the run away again.
export function applyFont(id, noteFont) {
  if (!active() || box.contentEditable !== 'true') return false;
  restoreCaret();
  if (!sel().rangeCount || sel().isCollapsed) return false;
  tidyBlocks();
  const texts = textsIn(sel().getRangeAt(0));
  if (!texts.length) return false;
  for (const t of texts) {
    const run = t.parentElement;
    if (run.matches('span.f-run')) {
      // The text sits straight in a font run: split the run around it.
      const after = run.cloneNode(false);
      let n = t.nextSibling;
      while (n) { const next = n.nextSibling; after.appendChild(n); n = next; }
      run.after(t);
      if (after.childNodes.length) t.after(after);
      if (!run.childNodes.length) run.remove();
      if (id !== noteFont || t.parentElement.closest('span.f-run')) wrapText(t, () => fontRun(id));
    } else if (id !== noteFont || t.parentElement.closest('span.f-run')) {
      // Inside bold or similar: a run of its own, which wins over a run around it.
      wrapText(t, () => fontRun(id));
    }
  }
  mergeRuns('span.f-run', (a, b) => a.dataset.font === b.dataset.font);
  selectTexts(texts);
  saveCaret();
  pushToBody();
  return true;
}

export async function apply(id, { typing = false, tasks = true } = {}) {
  if (!active() || box.contentEditable !== 'true') return;
  restoreCaret();
  tidyBlocks();
  if (!sel().rangeCount) return;
  const blocks = selectedBlocks();
  const items = blocks.filter((b) => b.tagName === 'LI');
  // Bold, italic and the other text styles change the selected words, or the whole note when
  // nothing is selected. (Headings, lists, quotes and indents change the paragraph you are in.)
  const INLINE = { b: 'bold', i: 'italic', u: 'underline', s: 'strikeThrough', sup: 'superscript', sub: 'subscript' };
  const WRAP = { b: 'strong', i: 'em', u: 'u', s: 's', sup: 'sup', sub: 'sub', mark: 'mark', code: 'code' };
  if (WRAP[id]) {
    // Ctrl+B, Ctrl+I and Ctrl+U with nothing selected keep a word processor's habit instead:
    // they switch the style on or off for what you type next.
    if (typing && sel().isCollapsed && INLINE[id]) { document.execCommand(INLINE[id]); return; }
    const whole = sel().isCollapsed;
    const keep = whole ? [sel().anchorNode, sel().anchorOffset] : null;
    if (whole) { const r = document.createRange(); r.selectNodeContents(box); sel().removeAllRanges(); sel().addRange(r); }
    // Done by hand rather than with the browser's command, which can try to write inline styles
    // (blocked by the app's security policy) when taking a style off.
    toggleWrap(WRAP[id], sel().getRangeAt(0));
    if (whole) {
      const r = document.createRange();
      if (keep[0] && box.contains(keep[0])) { r.setStart(keep[0], Math.min(keep[1], keep[0].nodeType === 3 ? keep[0].length : keep[0].childNodes.length)); } else { r.selectNodeContents(box); r.collapse(false); }
      r.collapse(true);
      sel().removeAllRanges();
      sel().addRange(r);
    }
    box.focus({ preventScroll: true });
    saveCaret();
    pushToBody();
    return;
  }
  switch (id) {
    case 'h': keepSelection(() => { if (!cycleHeading(blocks)) app.toast('Headings work on paragraphs, not list items.'); }); break;
    case 'list': keepSelection(() => cycleList(blocks, tasks)); break;
    case 'ul': keepSelection(() => toList('UL', blocks)); break;
    case 'ol': keepSelection(() => toList('OL', blocks)); break;
    case 'task': keepSelection(() => toggleTask(blocks)); break;
    case 'indent':
      if (!items.length) { app.toast('Move in works on list items. Start a list with • or 1. first.'); return; }
      keepSelection(() => items.forEach(indent));
      break;
    case 'outdent':
      if (!items.length) { app.toast('Move out works on list items.'); return; }
      keepSelection(() => [...items].reverse().forEach(outdent));
      break;
    case 'quote': if (blocks.length) keepSelection(() => toggleQuote(blocks)); break;
    case 'link': {
      saveCaret();
      const r = await app.ask({ title: 'Add a link', value: 'https://', okText: 'Add link' });
      restoreCaret();
      if (r.action !== 'ok' || !/^(https?:\/\/|mailto:)\S+/i.test(r.value)) return;
      if (sel().isCollapsed) document.execCommand('insertHTML', false, `<a href="${esc(r.value)}">${esc(r.value)}</a>`);
      else document.execCommand('createLink', false, r.value);
      break;
    }
    default: return;
  }
  box.focus({ preventScroll: true });
  saveCaret();
  pushToBody();
}

// Typing "1. " (or "1) ") at the start of a paragraph starts a numbered list, and "- ", "* " or
// "• " a bulleted one, the way a word processor does.
function autoList(e) {
  if (e.inputType !== 'insertText' || e.data !== ' ') return;
  const s = sel();
  if (!s.rangeCount || !s.isCollapsed) return;
  const r = s.getRangeAt(0);
  const block = closest(r.startContainer, 'p,div,h1,h2,h3,h4,h5,h6,li,pre');
  if (!block || !/^(P|DIV)$/.test(block.tagName) || block === box) return;
  const before = document.createRange();
  before.setStart(block, 0);
  before.setEnd(r.startContainer, r.startOffset);
  const typed = before.toString();
  const m = /^(\d+[.)]|[-*•])$/.exec(typed);
  if (!m) return;
  e.preventDefault();
  before.deleteContents();
  if (!block.textContent && !block.querySelector('br')) block.appendChild(document.createElement('br'));
  const caret = document.createRange();
  caret.setStart(block, 0);
  caret.collapse(true);
  s.removeAllRanges();
  s.addRange(caret);
  const [li] = toList(/\d/.test(m[1]) ? 'OL' : 'UL', [block]);
  if (li) { const c = document.createRange(); c.setStart(li, 0); c.collapse(true); s.removeAllRanges(); s.addRange(c); }
  pushToBody();
}

// The Aa button on a Text note: capitals for the selected words, or the whole note. recaseFn is
// capitals.recase. Returns what was done and a way to undo it.
export function recase(recaseFn) {
  if (!active() || box.contentEditable !== 'true') return { mode: null };
  restoreCaret();
  tidyBlocks();
  const s = sel();
  const hasSel = s.rangeCount && inBox(s.anchorNode) && !s.isCollapsed;
  const selected = hasSel ? new Set(textsIn(s.getRangeAt(0))) : null;
  const leaf = (b) => b.tagName !== 'PRE' && !(b.tagName === 'DIV' && b.querySelector('p,div,h1,h2,h3,h4,h5,h6,li,ul,ol,blockquote'));
  const pieces = [];
  for (const b of [...box.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li')].filter(leaf)) {
    // The block's own text, line by line (a line break inside it starts a new line).
    const map = [];
    let text = '';
    const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => {
        if (n.nodeType === 3 || n.tagName === 'BR') return NodeFilter.FILTER_ACCEPT;
        return /^(UL|OL|CODE|PRE)$/.test(n.tagName) && n !== b ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
      },
    });
    let n;
    while ((n = walk.nextNode())) {
      if (n.nodeType === 1) { if (text) text += '\n'; continue; } // a line break starts a new line
      map.push({ node: n, from: text.length });
      text += n.nodeValue;
    }
    if (!text.trim()) continue;
    if (selected && !map.some((m) => selected.has(m.node))) continue;
    const owner = (i) => { let hit = null; for (const m of map) { if (i >= m.from && i < m.from + m.node.nodeValue.length) { hit = m.node; break; } } return hit; };
    pieces.push({ text, map, markdown: false, editable: selected ? (i) => selected.has(owner(i)) : null });
  }
  const r = recaseFn(pieces);
  if (!r.mode) return { mode: null };
  const before = $('body').value;
  pieces.forEach((p, k) => { for (const m of p.map) m.node.nodeValue = r.texts[k].slice(m.from, m.from + m.node.nodeValue.length); });
  if (selected) selectTexts([...selected].filter((t) => t.isConnected));
  pushToBody();
  return { mode: r.mode, undo: () => { const ta = $('body'); ta.value = before; ta.dispatchEvent(new Event('input', { bubbles: true })); } };
}

// Citations and quotes go in where the caret was before the dialog opened.
export function insertText(text) {
  restoreCaret();
  const s = sel();
  const before = s.rangeCount ? s.getRangeAt(0).startContainer.textContent.slice(0, s.getRangeAt(0).startOffset) : '';
  document.execCommand('insertText', false, `${before && !/[\s(]$/.test(before) ? ' ' : ''}${text}`);
  saveCaret();
  pushToBody();
}

export function scrollToHeading(i) {
  const h = box.querySelectorAll('h1,h2,h3,h4,h5,h6')[i];
  if (!h) return false;
  h.scrollIntoView({ block: 'start' });
  const r = endOf(h);
  box.focus();
  sel().removeAllRanges();
  sel().addRange(r);
  return true;
}

// With Brackets on and "Copy [ ]" unticked, labels stay out of copies and pastes.
const dropLabels = () => { const n = app.note(); return !!n?.meta?.brackets && n.format === 'text' && app.prefs().bracketCopy === false; };
const stripLabelsPlain = (text) => stripLabels(text);
// Plain text over several lines: each line a line, and each empty line a blank line. Put in by
// hand: the browser's own command can try to write inline styles (blocked by the app's security
// policy) when the lines go into the middle of a line that already has text.
function pastePlain(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  const s = sel();
  const BLK = 'p,div,h1,h2,h3,h4,h5,h6,li';
  const r = s.rangeCount ? s.getRangeAt(0) : null;
  const blk = r && closest(r.startContainer, BLK);
  if (lines.length < 2 || !blk || !box.contains(blk) || blk.closest('pre')) {
    document.execCommand('insertText', false, lines.join('\n'));
    pushToBody();
    return;
  }
  r.deleteContents();
  // What follows the caret in its line moves to the end of the last pasted line.
  const rest = document.createRange();
  rest.setStart(r.startContainer, r.startOffset);
  rest.setEnd(blk, blk.childNodes.length);
  const tail = rest.extractContents();
  for (const x of [...blk.querySelectorAll('br')]) if (!x.nextSibling) x.remove();
  if (lines[0]) blk.appendChild(document.createTextNode(lines[0]));
  let after = blk;
  let last = null;
  for (let k = 1; k < lines.length; k++) {
    const line = document.createElement(blk.tagName === 'LI' ? 'li' : 'p');
    if (lines[k]) { last = document.createTextNode(lines[k]); line.appendChild(last); } else last = null;
    if (k === lines.length - 1) {
      const end = document.createRange();
      if (last) end.setStartAfter(last); else end.setStart(line, 0);
      end.collapse(true);
      line.appendChild(tail);
      r.setStart(end.startContainer, end.startOffset);
    }
    after.after(line);
    after = line;
  }
  for (const el of [blk, ...box.querySelectorAll(BLK)]) if (el.isConnected && !el.textContent && !el.querySelector('br')) el.appendChild(document.createElement('br'));
  r.collapse(true);
  s.removeAllRanges();
  s.addRange(r);
  tidyBlocks();
  pushToBody();
}

// ---- Find and replace (Text notes) --------------------------------------------------------
// Matches are found line by line (a match never runs from one paragraph into the next), shown
// with highlights that leave the text itself alone, and replaced as ordinary edits.
const FIND_BLOCKS = 'p,div,h1,h2,h3,h4,h5,h6,li,pre,blockquote';
export function findRanges(re) {
  const out = [];
  if (!active() || !re) return out;
  const leaf = (b) => !b.querySelector(':scope > p, :scope > div, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > blockquote');
  for (const b of [...box.querySelectorAll(FIND_BLOCKS)].filter(leaf)) {
    const map = [];
    let text = '';
    const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.nodeType === 1 ? (n !== b && (/^(UL|OL)$/.test(n.tagName) || n.matches(FIND_BLOCKS)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : NodeFilter.FILTER_ACCEPT),
    });
    let n;
    while ((n = walk.nextNode())) { map.push({ node: n, from: text.length }); text += n.nodeValue; }
    if (!text) continue;
    const at = (i, end) => {
      for (const m of map) { const len = m.node.nodeValue.length; if (i < m.from + len || (end && i === m.from + len)) return [m.node, i - m.from]; }
      const last = map[map.length - 1];
      return [last.node, last.node.nodeValue.length];
    };
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      if (!m[0].length) { re.lastIndex++; continue; }
      const r = document.createRange();
      const [sn, so] = at(m.index, false);
      const [en, eo] = at(m.index + m[0].length, true);
      r.setStart(sn, so);
      r.setEnd(en, eo);
      out.push(r);
    }
  }
  return out;
}
export function paintFind(ranges, cur) {
  if (typeof CSS === 'undefined' || !CSS.highlights) return;
  if (!ranges.length) { CSS.highlights.delete('rm-find'); CSS.highlights.delete('rm-find-cur'); return; }
  CSS.highlights.set('rm-find', new Highlight(...ranges.filter((_, i) => i !== cur)));
  if (cur >= 0 && ranges[cur]) CSS.highlights.set('rm-find-cur', new Highlight(ranges[cur])); else CSS.highlights.delete('rm-find-cur');
}
// Bring a match into view and select it (the find box keeps the focus).
export function showRange(r) {
  const s = sel();
  s.removeAllRanges();
  s.addRange(r.cloneRange());
  savedRange = r.cloneRange();
  const rect = r.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (rect.top < b.top + 40 || rect.bottom > b.bottom - 40) box.scrollTop += rect.top - b.top - b.height / 3;
}
export function replaceRanges(ranges, text) {
  if (!ranges.length) return;
  for (const r of [...ranges].reverse()) {
    r.deleteContents();
    if (text) r.insertNode(document.createTextNode(text));
  }
  box.normalize();
  pushToBody();
}

// ---- Following the caret (phone) ----------------------------------------------------------
// The keyboard covers the bottom of the screen, and dictation adds words without key presses, so
// the browser does not always scroll to follow them. The caret is kept inside the part of the
// note you can see: above the keyboard and above the formatting chips.
const isPhoneView = () => window.matchMedia('(max-width: 760px)').matches;
let followFrame = 0;
function followCaret() {
  if (followFrame || !isPhoneView()) return;
  followFrame = requestAnimationFrame(() => { followFrame = 0; keepCaretVisible(); });
}
export function keepCaretVisible() {
  const s = sel();
  if (!active() || !s.rangeCount || !inBox(s.focusNode)) return false;
  const r = s.getRangeAt(0).cloneRange();
  r.collapse(false);
  let rect = [...r.getClientRects()].pop();
  if (!rect || (!rect.height && !rect.width && !rect.top)) rect = closest(r.endContainer, 'p,div,li,h1,h2,h3,h4,h5,h6,pre,blockquote')?.getBoundingClientRect();
  if (!rect) return false;
  const b = box.getBoundingClientRect();
  const vv = window.visualViewport;
  const bar = $('toolbar');
  const barTop = bar && !bar.hidden && bar.offsetParent ? bar.getBoundingClientRect().top : Infinity;
  const bottom = Math.min(b.bottom, barTop > b.top ? barTop : Infinity, vv ? vv.offsetTop + vv.height : window.innerHeight) - 28;
  const top = Math.max(b.top, vv ? vv.offsetTop : 0) + 8;
  if (rect.bottom > bottom) { trace('scroll-to-caret', { by: Math.round(rect.bottom - bottom) }); box.scrollTop += rect.bottom - bottom; }
  else if (rect.top < top) { trace('scroll-to-caret', { by: -Math.round(top - rect.top) }); box.scrollTop -= top - rect.top; }
  return true;
}

// ---- The caret as a place in the text (for Undo) -------------------------------------------
// Counted the same way both ways: each character, each line break and the start of each block.
const COUNTED = /^(P|DIV|H[1-6]|LI|PRE|BLOCKQUOTE|UL|OL|TABLE|TR|HR)$/;
function offsetAt(node, off) {
  // Everything before (node, off), counted as above, without copying the note.
  let n = 0;
  const visit = (el) => {
    const kids = el.childNodes;
    for (let i = 0; i < kids.length; i++) {
      if (el === node && i === off) return true;
      const c = kids[i];
      if (c.nodeType === 3) { if (c === node) { n += off; return true; } n += c.length; }
      else if (c.nodeType === 1) {
        if (c.tagName === 'BR') n += 1;
        else { if (COUNTED.test(c.tagName)) n += 1; if (visit(c)) return true; }
      }
    }
    return el === node; // the end of an element
  };
  visit(box);
  return n;
}
function pointAt(n) {
  let count = 0;
  let hit = null;
  const visit = (el) => {
    for (const c of el.childNodes) {
      if (hit) return;
      if (c.nodeType === 3) {
        if (count + c.length >= n) { hit = [c, Math.max(0, n - count)]; return; }
        count += c.length;
      } else if (c.nodeType === 1) {
        if (c.tagName === 'BR') {
          if (count >= n) { hit = [el, [...el.childNodes].indexOf(c)]; return; }
          count += 1;
        } else {
          if (COUNTED.test(c.tagName)) count += 1;
          visit(c);
        }
      }
    }
  };
  visit(box);
  if (hit) return hit;
  const r = endOf(box);
  return [r.startContainer, r.startOffset];
}
export function caretOffsets() {
  if (!active()) return null;
  const s = sel();
  const r = s.rangeCount && inBox(s.anchorNode) ? s.getRangeAt(0) : savedRange && inBox(savedRange.startContainer) ? savedRange : null;
  if (!r) return null;
  return [offsetAt(r.startContainer, r.startOffset), offsetAt(r.endContainer, r.endOffset)];
}
export function setCaretOffsets(pair) {
  if (!active() || !pair) return false;
  const a = pointAt(pair[0]);
  const b = pair[1] === pair[0] ? a : pointAt(pair[1]);
  const r = document.createRange();
  r.setStart(a[0], a[1]);
  r.setEnd(b[0], b[1]);
  box.focus({ preventScroll: true });
  const s = sel();
  s.removeAllRanges();
  s.addRange(r);
  savedRange = r.cloneRange();
  keepCaretVisible();
  return true;
}

// ---- Wiring ------------------------------------------------------------------------------
export function init(hooks) {
  app = hooks;
  box = $('rich');
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, false); } catch { /* not needed everywhere */ }

  box.addEventListener('input', pushToBody);
  box.addEventListener('blur', () => app.flushSave());
  document.addEventListener('selectionchange', saveCaret);
  box.addEventListener('beforeinput', autoList);
  // "---" alone on a line, then Enter: a divider line. ("--- " with a space stays as typed.)
  box.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'insertParagraph' || e.isComposing || box.contentEditable !== 'true') return;
    const s = sel();
    if (!s.rangeCount || !s.isCollapsed) return;
    const blk = closest(s.anchorNode, 'p,div');
    if (!blk || blk.parentElement !== box || blk.textContent !== '---') return;
    e.preventDefault();
    const hr = document.createElement('hr');
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    blk.replaceWith(hr);
    hr.after(p);
    const r = document.createRange();
    r.setStart(p, 0);
    r.collapse(true);
    s.removeAllRanges();
    s.addRange(r);
    pushToBody();
  });
  // Anything else that changes the text (citations, moving a section, Undo in a message, the
  // scene board) changes the hidden text box; show that on the page too.
  $('body').addEventListener('input', () => { if (!fromRich && active() && !composing) show($('body').value); });
  box.addEventListener('compositionstart', () => { composing = true; });
  box.addEventListener('compositionend', () => { composing = false; followCaret(); });
  // 2. Keep the caret where you can see it while you type or dictate (phone).
  box.addEventListener('input', followCaret);
  document.addEventListener('selectionchange', () => { if (document.activeElement === box) followCaret(); });
  window.visualViewport?.addEventListener('resize', () => { if (document.activeElement === box) followCaret(); });

  box.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    const li = closest(sel().anchorNode, 'li');
    if (e.key === 'Tab' && li) { e.preventDefault(); apply(e.shiftKey ? 'outdent' : 'indent'); return; }
    // A new checklist item starts unticked (the browser copies the ticked one).
    if (e.key === 'Enter' && li?.classList.contains('task')) {
      setTimeout(() => {
        const now = closest(sel().anchorNode, 'li');
        if (now && now !== li && now.dataset.done === 'true') { now.dataset.done = 'false'; pushToBody(); }
      });
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && (e.code === 'Digit8' || e.code === 'Digit7')) { e.preventDefault(); apply(e.code === 'Digit8' ? 'ul' : 'ol'); return; }
    if (mod && !e.shiftKey && !e.altKey && ['b', 'i', 'u'].includes(e.key.toLowerCase())) { e.preventDefault(); apply(e.key.toLowerCase(), { typing: true }); }
  });
  // Tap the box in front of a checklist item to tick it.
  box.addEventListener('click', (e) => {
    const li = e.target.closest?.('li.task');
    if (!li || box.contentEditable !== 'true') return;
    if (e.clientX < li.getBoundingClientRect().left + 2) { li.dataset.done = String(li.dataset.done !== 'true'); pushToBody(); }
  });
  // Links open in a new tab with Ctrl/Cmd+click (a plain click puts the caret in them).
  box.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (a && (e.ctrlKey || e.metaKey) && /^(https?:|mailto:)/i.test(a.getAttribute('href'))) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
  });
  // Copy and cut write the clipboard themselves: browsers and apps disagree about the spacing of
  // paragraphs, so a plain-text paste got doubled or lost blank lines. Plain text gets one blank
  // line between paragraphs plus each blank line typed; formatted text gets real paragraphs.
  const copyOut = (e) => {
    const s = sel();
    if (!s.rangeCount || s.isCollapsed || !inBox(s.anchorNode) || !e.clipboardData) return;
    const holder = document.createElement('div');
    holder.appendChild(s.getRangeAt(0).cloneContents());
    // A selection inside one list item or heading comes out as bare text; keep its kind.
    const one = closest(s.getRangeAt(0).commonAncestorContainer, 'li, h1, h2, h3, h4, h5, h6');
    if (one && !holder.querySelector('li, h1, h2, h3, h4, h5, h6')) { const w = document.createElement(one.tagName === 'LI' ? 'p' : one.tagName); while (holder.firstChild) w.appendChild(holder.firstChild); holder.appendChild(w); }
    if (dropLabels()) stripFragment(holder);
    const md = htmlToMarkdown(holder);
    e.clipboardData.setData('text/plain', plainText({ body: md, format: 'text', meta: {} }, {}).replace(/\n/g, '\r\n').replace(/\r\r\n/g, '\r\n'));
    // Lines, not spaced paragraphs: other apps should not add a gap after each line.
    e.clipboardData.setData('text/html', noteToHtml(md, 'markdown').replace(/<p class="blank">&nbsp;<\/p>/g, '<p style="margin:0"><br></p>').replace(/<p>/g, '<p style="margin:0">'));
    e.preventDefault();
    if (e.type === 'cut' && box.contentEditable === 'true') {
      // Take the text out by hand (the browser's delete can try to write inline styles), and join
      // the two paragraphs the cut began and ended in, as a word processor does.
      const r = s.getRangeAt(0);
      const BLK = 'p,div,h1,h2,h3,h4,h5,h6,li,pre';
      const a = closest(r.startContainer, BLK);
      const b = closest(r.endContainer, BLK);
      r.deleteContents();
      if (a && b && a !== b && a.isConnected && b.isConnected && !b.contains(a)) { while (b.firstChild) a.appendChild(b.firstChild); b.remove(); }
      for (const el of [...box.querySelectorAll(BLK)]) if (!el.childNodes.length) el.appendChild(document.createElement('br'));
      tidyBlocks();
      r.collapse(true);
      s.removeAllRanges();
      s.addRange(r);
      pushToBody();
    }
  };
  box.addEventListener('copy', copyOut);
  box.addEventListener('cut', copyOut);
  // Pasted text keeps bold, italics, headings and lists, and nothing else.
  box.addEventListener('paste', (e) => {
    const html = e.clipboardData?.getData('text/html');
    const text = e.clipboardData?.getData('text/plain') || '';
    e.preventDefault();
    if (html) {
      // Read the pasted page where it was parsed; it is never put into the app as it is.
      const tpl = document.createElement('template');
      tpl.innerHTML = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/\sstyle="[^"]*"/gi, (m) => (/font-weight:\s*(bold|[6-9]00)|font-style:\s*italic/i.test(m) ? ` data-style="${m.slice(8, -1)}"` : ''));
      const tmp = tpl.content;
      tmp.querySelectorAll('script,style,meta,link,img,iframe,object,title').forEach((x) => x.remove());
      if (dropLabels()) stripFragment(tmp);
      const blocks = parseMarkdown(htmlToMarkdown(tmp));
      const single = blocks.length === 1 && blocks[0].t === 'p';
      document.execCommand('insertHTML', false, single ? blocks[0].lines.map(inlineHtml).join('<br>') : blocksHtml(blocks));
    } else if (dropLabels() && labelsIn(text).length) {
      // Leave the labels out of pasted text (each line a line, as below).
      return pastePlain(stripLabelsPlain(text));
    } else if (/\n/.test(text)) {
      return pastePlain(text);
    } else {
      document.execCommand('insertText', false, text);
    }
    pushToBody();
  });
}
