// Reiimei sharing: turn one note, or any set of notes, into text or files.
//   - One note as text (plain, Markdown, or Populi markup)
//   - A combined document with one section per note (Word, web page, Markdown, text)
//   - An archive (.zip) with each note as its own file, in folders
// Citations are filled in and each note's reference list is included.
import { parseNote, inlineToRuns, exportNote, noteToHtml, escapeHtml } from './format.js';
import { makeCiter, referenceList, referenceHeading } from './cite.js';
import { isCode, LANGS, highlight, codeTitle } from './code.js';
import { blocksXml, docxPackage } from './paper.js';
import { zip } from './zip.js';

// ---- Titles and snippets (used by the note list too) ---------------------
const lines = (body) => String(body || '').split('\n').map((l) => l.trim()).filter(Boolean);
function plainLine(line, format) {
  if (!line) return '';
  const b = parseNote(line, format === 'populi' ? 'populi' : 'markdown')[0];
  if (!b) return line;
  const nodes = b.t === 'h' ? b.c : b.t === 'list' ? b.items[0].c : b.t === 'p' ? b.lines[0] : b.t === 'quote' && b.blocks[0]?.lines ? b.blocks[0].lines[0] : null;
  return nodes ? inlineToRuns(nodes).map((r) => r.text).join('') : line;
}
// A title typed in the title field (meta.title) wins; without one, the first line is the title.
export const ownTitle = (note) => String(note?.meta?.title || '').replace(/\s+/g, ' ').trim();
export function fallbackTitle(note) {
  if (isCode(note.format)) return codeTitle(note.body, note.format).slice(0, 120);
  return (plainLine(lines(note.body)[0], note.format) || '').slice(0, 120);
}
export function noteTitle(note) {
  return ownTitle(note).slice(0, 200) || fallbackTitle(note) || (isCode(note.format) ? 'Untitled' : 'New Note');
}
export function noteSnippet(note) {
  if (isCode(note.format)) return `${LANGS[note.format].label} · ${lines(note.body).length} lines`;
  return plainLine(lines(note.body)[ownTitle(note) ? 0 : 1], note.format) || 'No additional text';
}

// ---- Citation context -------------------------------------------------------
let defaultStyle = () => 'apa';
export const setDefaultStyle = (fn) => { defaultStyle = fn; };
const styleOf = (note) => (note?.meta?.style === 'mla' ? 'mla' : note?.meta?.style === 'apa' ? 'apa' : defaultStyle());
export function citeContext(note) {
  const citer = makeCiter(note?.meta?.sources || [], styleOf(note));
  return { cite: citer.cite, ncite: citer.ncite };
}

export function referencesText(note, target) {
  const refs = referenceList(note?.meta?.sources || [], styleOf(note));
  if (!refs.length) return '';
  const it = (t) => (target === 'populi' ? `_${t}_` : target === 'markdown' ? `*${t}*` : t);
  const head = referenceHeading(styleOf(note));
  const heading = target === 'markdown' ? `## ${head}` : target === 'populi' ? `*${head}*` : head;
  return `\n\n${heading}\n\n${refs.map((r) => r.runs.map((x) => (x.italic ? it(x.text) : x.text)).join('')).join('\n\n')}`;
}

export function plainText(note, ctx = citeContext(note)) {
  const blocks = parseNote(note.body, note.format === 'populi' ? 'populi' : 'markdown');
  const txt = (nodes) => inlineToRuns(nodes, ctx).map((r) => r.text).join('');
  const out = [];
  const walk = (bs, prefix = '') => bs.forEach((b) => {
    if (b.t === 'h') out.push(prefix + txt(b.c));
    else if (b.t === 'p') out.push(b.lines.map((l) => prefix + txt(l)).join('\n'));
    else if (b.t === 'list') out.push(b.items.map((i, k) => prefix + '  '.repeat(i.level) + (i.task ? (i.checked ? '[x] ' : '[ ] ') : i.ordered ? `${i.num ?? k + 1}. ` : '• ') + txt(i.c)).join('\n'));
    else if (b.t === 'quote') walk(b.blocks, `${prefix}    `);
    else if (b.t === 'code') out.push(b.v);
    else if (b.t === 'table') out.push([b.head, ...b.rows].map((r) => r.map(txt).join('\t')).join('\n'));
    else if (b.t === 'hr') out.push('* * *');
  });
  walk(blocks);
  return out.join('\n\n');
}

// One note as text. target: 'plain' | 'markdown' | 'populi'
// A title typed in the title field is not part of the text, so it is put back on top.
export function titleLine(note, target = 'plain') {
  const t = ownTitle(note);
  if (!t || isCode(note.format)) return '';
  return `${target === 'markdown' ? '# ' : ''}${t}

`;
}
export function noteText(note, target = 'plain') {
  if (isCode(note.format)) return note.body;
  const ctx = citeContext(note);
  const from = note.format === 'populi' ? 'populi' : 'markdown';
  if (target === 'plain') return titleLine(note) + plainText(note, ctx) + referencesText(note, 'plain');
  return titleLine(note, target) + exportNote(note.body, from, target, ctx) + referencesText(note, target);
}

// ---- File names -------------------------------------------------------------
export function safeName(s, fallback = 'Untitled') {
  const n = String(s || '').replace(/[\\/:*?"<>|#%&{}$!'@+`=\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 80);
  return n || fallback;
}
function uniquePath(path, used) {
  if (!used.has(path.toLowerCase())) { used.add(path.toLowerCase()); return path; }
  const dot = path.lastIndexOf('.');
  const [base, ext] = dot > path.lastIndexOf('/') ? [path.slice(0, dot), path.slice(dot)] : [path, ''];
  for (let k = 2; ; k++) {
    const p = `${base} (${k})${ext}`;
    if (!used.has(p.toLowerCase())) { used.add(p.toLowerCase()); return p; }
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
function metaLine(note, folderName) {
  const bits = [];
  if (folderName) bits.push(`Folder: ${folderName}`);
  if (note.tags?.length) bits.push(`Tags: ${note.tags.map((t) => `#${t}`).join(' ')}`);
  if (isCode(note.format)) bits.push(LANGS[note.format].label);
  bits.push(`Updated ${longDate(note.updated_at)}`);
  return bits.join(' · ');
}

// The note's first line becomes the section heading, so the body starts after it
// (unless the note has a title of its own, which is the heading instead).
function bodyAfterTitle(note) {
  if (ownTitle(note)) return String(note.body || '');
  const ls = String(note.body || '').split('\n');
  const k = ls.findIndex((l) => l.trim());
  return k >= 0 ? ls.slice(k + 1).join('\n') : '';
}

// ---- Word ---------------------------------------------------------------------
function noteBlocks(note) {
  if (isCode(note.format)) return note.body.replace(/\s+$/, '').split('\n').map((l) => ({ k: 'code', runs: [{ text: l }] }));
  const ctx = citeContext(note);
  const out = [];
  const walk = (blocks, quoted = false) => {
    for (const b of blocks) {
      if (b.t === 'h') out.push({ k: 'sub-heading', runs: inlineToRuns(b.c, ctx) });
      else if (b.t === 'p') b.lines.forEach((l) => out.push({ k: quoted ? 'quote' : 'plain', runs: inlineToRuns(l, ctx) }));
      else if (b.t === 'quote') walk(b.blocks, true);
      else if (b.t === 'list') {
        let n = 0;
        b.items.forEach((it) => out.push({ k: 'list', level: it.level, marker: it.task ? (it.checked ? '☑' : '☐') : it.ordered ? `${it.num ?? ++n}.` : '•', runs: inlineToRuns(it.c, ctx) }));
      } else if (b.t === 'code') b.v.split('\n').forEach((l) => out.push({ k: 'code', runs: [{ text: l }] }));
      else if (b.t === 'table') out.push({ k: 'table', rows: [b.head, ...b.rows].map((r) => r.map((c) => inlineToRuns(c, ctx))) });
      else if (b.t === 'hr') out.push({ k: 'center', runs: [{ text: '*  *  *' }] });
    }
  };
  walk(parseNote(bodyAfterTitle(note), note.format === 'populi' ? 'populi' : 'markdown'));
  const refs = referenceList(note.meta?.sources || [], styleOf(note));
  if (refs.length) {
    out.push({ k: 'sub-heading', runs: [{ text: referenceHeading(styleOf(note)) }] });
    refs.forEach((r) => out.push({ k: 'ref', runs: r.runs.map((x) => ({ text: x.text, i: x.italic })) }));
  }
  return out;
}

function toDocx(notes, folderOf, title) {
  const blocks = [];
  notes.forEach((n, k) => {
    blocks.push({ k: 'note-title', pageBreak: k > 0, runs: [{ text: noteTitle(n) }] });
    blocks.push({ k: 'meta', runs: [{ text: metaLine(n, folderOf(n)) }] });
    blocks.push(...noteBlocks(n));
  });
  return docxPackage({ body: blocksXml(blocks, 'apa'), title, line: 276, pageNumbers: true });
}

// ---- Web page ---------------------------------------------------------------------
const PAGE_CSS = `
:root{--ink:#1d232c;--muted:#5b6676;--rule:#d8dee6;--accent:#2f5f8f;--code:#f4f6f9}
@media (prefers-color-scheme:dark){:root{--ink:#e3e8ef;--muted:#9aa6b6;--rule:#2a3442;--accent:#9cc2ea;--code:#141b26}body{background:#0e131c}}
body{margin:0;padding:32px 16px 80px;color:var(--ink);font:17px/1.6 Georgia,"Times New Roman",serif}
main{max-width:46rem;margin:0 auto}
h1.doc{font-size:2rem;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 24px}
nav ol{padding-left:1.4em}nav a{color:var(--accent)}
section{border-top:1px solid var(--rule);margin-top:40px;padding-top:24px}
section>h1{font-size:1.6rem;margin:0}.meta{color:var(--muted);font-style:italic;font-size:.9rem;margin:2px 0 18px}
pre{background:var(--code);padding:12px 14px;border-radius:8px;overflow-x:auto;font:13.5px/1.5 ui-monospace,Consolas,Menlo,monospace}
code{font-family:ui-monospace,Consolas,Menlo,monospace;font-size:.9em}
blockquote{margin:0 0 1em;padding-left:14px;border-left:3px solid var(--rule);color:var(--muted)}
table{border-collapse:collapse}th,td{border:1px solid var(--rule);padding:4px 10px}
mark{background:#fff1b3}.refs p{padding-left:2em;text-indent:-2em}
.tk-com{color:#6a737d;font-style:italic}.tk-str,.tk-val{color:#2a7a3b}.tk-kw,.tk-tag{color:#8a3fb8}.tk-num{color:#b05a00}
.tk-fn,.tk-cls,.tk-sel{color:#1f63b5}.tk-dec,.tk-pi,.tk-doc{color:#9a6a12}.tk-bi,.tk-self{color:#0f7c8c}.tk-attr,.tk-prop{color:#a14a2a}.tk-ent{color:#b05a00}
@media (prefers-color-scheme:dark){.tk-com{color:#7f8a99}.tk-str,.tk-val{color:#8fd19e}.tk-kw,.tk-tag{color:#d0a6f2}.tk-num,.tk-ent{color:#f2b36b}.tk-fn,.tk-cls,.tk-sel{color:#8ec1f4}.tk-dec,.tk-pi,.tk-doc{color:#e2c07a}.tk-bi,.tk-self{color:#7fd3dc}.tk-attr,.tk-prop{color:#f0a184}}
@media print{section{break-before:page;border:0}nav{display:none}}
`;

function noteHtml(note) {
  if (isCode(note.format)) return `<pre><code>${highlight(note.body, note.format)}</code></pre>`;
  const ctx = citeContext(note);
  let html = noteToHtml(bodyAfterTitle(note), note.format === 'populi' ? 'populi' : 'markdown', { ...ctx, readOnly: true });
  const refs = referenceList(note.meta?.sources || [], styleOf(note));
  if (refs.length) {
    html += `<div class="refs"><h2>${referenceHeading(styleOf(note))}</h2>${refs.map((r) => `<p>${r.runs.map((x) => (x.italic ? `<em>${escapeHtml(x.text)}</em>` : escapeHtml(x.text))).join('')}</p>`).join('')}</div>`;
  }
  return html;
}

function toHtml(notes, folderOf, title) {
  const toc = notes.length > 1
    ? `<nav><ol>${notes.map((n, k) => `<li><a href="#note-${k + 1}">${escapeHtml(noteTitle(n))}</a></li>`).join('')}</ol></nav>`
    : '';
  const sections = notes.map((n, k) => `<section id="note-${k + 1}"><h1>${escapeHtml(noteTitle(n))}</h1><p class="meta">${escapeHtml(metaLine(n, folderOf(n)))}</p>${noteHtml(n)}</section>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>${PAGE_CSS}</style></head>
<body><main><h1 class="doc">${escapeHtml(title)}</h1><p class="sub">${notes.length} ${notes.length === 1 ? 'note' : 'notes'} from Reiimei · ${longDate(new Date().toISOString())}</p>${toc}
${sections}
</main></body></html>
`;
}

// ---- Markdown and plain text --------------------------------------------------------
function noteMarkdown(note) {
  if (isCode(note.format)) return `\`\`\`${note.format}\n${note.body.replace(/\s+$/, '')}\n\`\`\``;
  return noteText(note, 'markdown');
}
function toMarkdown(notes, folderOf, title) {
  const head = notes.length > 1 ? `# ${title}\n\n${notes.map((n) => `- ${noteTitle(n)}`).join('\n')}\n\n---\n\n` : '';
  return head + notes.map((n) => `# ${noteTitle(n)}\n\n*${metaLine(n, folderOf(n))}*\n\n${dropFirstLine(noteMarkdown(n), n)}`).join('\n\n---\n\n') + '\n';
}
function toText(notes, folderOf, title) {
  const rule = '='.repeat(60);
  const head = notes.length > 1 ? `${title}\n${rule}\n\n${notes.map((n, k) => `${k + 1}. ${noteTitle(n)}`).join('\n')}\n\n\n` : '';
  return head + notes.map((n) => {
    const t = noteTitle(n);
    return `${t}\n${'-'.repeat(Math.min(60, Math.max(3, t.length)))}\n${metaLine(n, folderOf(n))}\n\n${dropFirstLine(noteText(n, 'plain'), n)}`;
  }).join(`\n\n\n${'* '.repeat(3).trim()}\n\n\n`) + '\n';
}
// The first line is already used as the section heading.
function dropFirstLine(text, note) {
  if (isCode(note.format)) return text;
  const ls = text.split('\n');
  const k = ls.findIndex((l) => l.trim());
  return k >= 0 ? ls.slice(k + 1).join('\n').replace(/^\s*\n/, '') : text;
}

// ---- Public API -----------------------------------------------------------------------
export const COMBINED = {
  docx: { label: 'Word document (.docx)', ext: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  html: { label: 'Web page (.html)', ext: 'html', type: 'text/html' },
  md: { label: 'Markdown (.md)', ext: 'md', type: 'text/markdown' },
  txt: { label: 'Plain text (.txt)', ext: 'txt', type: 'text/plain' },
};

// notes: array; folders: array of {id, name}; kind: 'docx'|'html'|'md'|'txt'
export function buildCombined(notes, folders, kind, title) {
  const folderOf = (n) => folders.find((f) => f.id === n.folder_id && !f.deleted)?.name || '';
  const t = title || (notes.length === 1 ? noteTitle(notes[0]) : 'Reiimei notes');
  const spec = COMBINED[kind];
  let data;
  if (kind === 'docx') data = toDocx(notes, folderOf, t);
  else if (kind === 'html') data = toHtml(notes, folderOf, t);
  else if (kind === 'md') data = toMarkdown(notes, folderOf, t);
  else data = toText(notes, folderOf, t);
  return { name: `${safeName(t)}.${spec.ext}`, type: spec.type, data };
}

// The file a single note naturally becomes inside an archive (or as a source file).
export function nativeFile(note) {
  if (isCode(note.format)) return { ext: LANGS[note.format].ext, type: LANGS[note.format].mime, data: note.body };
  if (note.format === 'populi') return { ext: 'txt', type: 'text/plain', data: noteText(note, 'populi') };
  return { ext: 'md', type: 'text/markdown', data: noteText(note, 'markdown') };
}

export function buildArchive(notes, folders, title) {
  const used = new Set();
  const files = notes.map((n) => {
    const folder = folders.find((f) => f.id === n.folder_id && !f.deleted);
    const f = nativeFile(n);
    const path = uniquePath(`${folder ? `${safeName(folder.name, 'Folder')}/` : ''}${safeName(noteTitle(n))}.${f.ext}`, used);
    return { name: path, data: f.data };
  });
  const t = title || 'Reiimei notes';
  const contents = `${t}\n${'='.repeat(Math.min(60, t.length))}\n\n${files.map((f, k) => `${f.name}\n    ${metaLine(notes[k], folders.find((x) => x.id === notes[k].folder_id && !x.deleted)?.name || '')}`).join('\n')}\n\nMarkdown notes are .md files, Populi notes are .txt files with Populi markup,\nand code notes keep their own extension (.py, .html, .xml).\n`;
  files.unshift({ name: uniquePath('Contents.txt', used), data: contents });
  return { name: `${safeName(t)}.zip`, type: 'application/zip', data: zip(files), count: notes.length };
}

export function sharedFileCheck() {
  return {
    text: typeof navigator !== 'undefined' && !!navigator.share,
    files: typeof navigator !== 'undefined' && !!navigator.canShare && (() => {
      try { return navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] }); } catch { return false; }
    })(),
  };
}
