// Reiimei Text notes: write the way you would in a word processor. Bold looks bold and a heading
// looks like a heading, with no symbols and no switching between editing and preview.
// Underneath, a Text note is kept as Markdown (in the hidden #body text box), so saving, sync,
// search, citations, sharing, papers and Copy all work exactly as they do for Markdown notes,
// and a note can switch between Text and Markdown without losing anything.
import { parseMarkdown, inlineToMarkdown, escapeHtml as esc } from './format.js';

const $ = (id) => document.getElementById(id);
let app = null;
let box = null;          // the editable page (#rich)
let shownId = null;      // note shown in it
let shownSrc = null;     // the Markdown it shows
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
      default: return `<p>${b.lines.map(inlineHtml).join('<br>') || '<br>'}</p>`;
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
function inlineMd(node) {
  let out = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { out += escText(n.nodeValue.replace(/\u00a0/g, ' ').replace(/\n/g, ' ')); continue; }
    if (n.nodeType !== 1) continue;
    const t = n.tagName;
    if (t === 'BR') { out += '\n'; continue; }
    if (t === 'CODE') { out += n.textContent ? `\`${n.textContent.replace(/`/g, "'")}\`` : ''; continue; }
    const inner = inlineMd(n);
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
const escLineStart = (line) => line.replace(/^(\s*)(#|>|[-*+](?=\s)|\d+[.)](?=\s))/, '$1\\$2');
function paraMd(el) {
  const text = inlineMd(el).replace(/\n+$/, '');
  return text.split('\n').map((l) => escLineStart(l.replace(/\s+$/, ''))).join('\n');
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
    out.push(`${'  '.repeat(level)}${marker} ${task}${inlineMd(own).replace(/\n+/g, ' ').trim()}`);
    for (const k of nested) listMd(k, level + 1, out);
  }
}
const BLOCK = /^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE|PRE|HR|TABLE|SECTION|ARTICLE|HEADER|FOOTER|LI)$/;
function blocksMd(parent) {
  const out = [];
  let loose = null; // inline content sitting straight in the page
  const flushLoose = () => { if (loose && loose.textContent.trim()) out.push(paraMd(loose)); loose = null; };
  for (const n of parent.childNodes) {
    if (n.nodeType === 1 && n.classList.contains('raw-block')) { flushLoose(); out.push(n.dataset.md || ''); continue; }
    if (n.nodeType !== 1 || !BLOCK.test(n.tagName)) {
      if (n.nodeType === 3 && !n.nodeValue.trim() && !loose) continue;
      (loose ||= n.ownerDocument.createElement('p')).appendChild(n.cloneNode(true));
      continue;
    }
    flushLoose();
    const t = n.tagName;
    if (/^H[1-6]$/.test(t)) { const s = inlineMd(n).replace(/\n+/g, ' ').trim(); if (s) out.push(`${'#'.repeat(+t[1])} ${s}`); }
    else if (t === 'UL' || t === 'OL') { const lines = []; listMd(n, 0, lines); if (lines.length) out.push(lines.join('\n')); }
    else if (t === 'BLOCKQUOTE') { const inner = blocksMd(n); if (inner.trim()) out.push(inner.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')); }
    else if (t === 'PRE') out.push(`\`\`\`${n.dataset.lang || ''}\n${n.textContent.replace(/\n$/, '')}\n\`\`\``);
    else if (t === 'HR') out.push('---');
    else if (n.querySelector('p,div,h1,h2,h3,h4,h5,h6,ul,ol,blockquote,pre,table')) { const inner = blocksMd(n); if (inner) out.push(inner); }
    else { const s = paraMd(n); if (s.trim()) out.push(s); }
  }
  flushLoose();
  return out.join('\n\n');
}
export const htmlToMarkdown = (el) => blocksMd(el);

// ---- Keeping the page and the text box in step --------------------------------------------
function show(md) {
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
  box.contentEditable = String(!note.deleted);
  box.dataset.placeholder = ta.placeholder;
  if (note.id !== shownId || ta.value !== shownSrc) { shownId = note.id; show(ta.value); }
}

export function focus(atStart = false) {
  if (!active()) return false;
  box.focus();
  const r = document.createRange();
  r.selectNodeContents(box.firstElementChild || box);
  r.collapse(atStart);
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
  if (s.rangeCount && inBox(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange();
}
function restoreCaret() {
  box.focus({ preventScroll: true });
  const s = sel();
  if (s.rangeCount && inBox(s.anchorNode)) return;
  const r = savedRange && inBox(savedRange.startContainer) ? savedRange : (() => { const x = document.createRange(); x.selectNodeContents(box); x.collapse(false); return x; })();
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

function keepSelection(fn) {
  const s = sel();
  const r = s.rangeCount ? s.getRangeAt(0) : null;
  const a = r && [r.startContainer, r.startOffset, r.endContainer, r.endOffset];
  fn();
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

// Wrap the selection in <tag>, or take the wrapping away if it is already there.
function toggleInline(tag) {
  const s = sel();
  const r = s.getRangeAt(0);
  const hit = closest(r.commonAncestorContainer, tag);
  if (hit) {
    keepSelection(() => { const parent = hit.parentNode; while (hit.firstChild) parent.insertBefore(hit.firstChild, hit); hit.remove(); });
    return;
  }
  if (r.collapsed) return;
  const el = document.createElement(tag);
  el.appendChild(r.extractContents());
  r.insertNode(el);
  r.selectNodeContents(el);
  s.removeAllRanges();
  s.addRange(r);
}

export async function apply(id) {
  if (!active() || box.contentEditable !== 'true') return;
  restoreCaret();
  tidyBlocks();
  if (!sel().rangeCount) return;
  const blocks = selectedBlocks();
  const items = blocks.filter((b) => b.tagName === 'LI');
  switch (id) {
    case 'b': document.execCommand('bold'); break;
    case 'i': document.execCommand('italic'); break;
    case 'u': document.execCommand('underline'); break;
    case 's': document.execCommand('strikeThrough'); break;
    case 'sup': document.execCommand('superscript'); break;
    case 'sub': document.execCommand('subscript'); break;
    case 'mark': toggleInline('mark'); break;
    case 'code': toggleInline('code'); break;
    case 'h': keepSelection(() => { if (!cycleHeading(blocks)) app.toast('Headings work on paragraphs, not list items.'); }); break;
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
  const r = document.createRange();
  r.selectNodeContents(h);
  r.collapse(false);
  box.focus();
  sel().removeAllRanges();
  sel().addRange(r);
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
  // Anything else that changes the text (citations, moving a section, Undo in a message, the
  // scene board) changes the hidden text box; show that on the page too.
  $('body').addEventListener('input', () => { if (!fromRich && active()) show($('body').value); });

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
    if (mod && !e.shiftKey && !e.altKey && ['b', 'i', 'u'].includes(e.key.toLowerCase())) { e.preventDefault(); apply(e.key.toLowerCase()); }
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
      const blocks = parseMarkdown(htmlToMarkdown(tmp));
      const single = blocks.length === 1 && blocks[0].t === 'p';
      document.execCommand('insertHTML', false, single ? blocks[0].lines.map(inlineHtml).join('<br>') : blocksHtml(blocks));
    } else {
      document.execCommand('insertText', false, text);
    }
    pushToBody();
  });
}
