// Reiimei formatting engine: Markdown and Populi markup.
// Both formats parse into the same tree of nodes, so they can be rendered to
// HTML, converted into each other, or flattened into styled runs (for papers).
// Nothing in a note is ever inserted as raw HTML: all text is escaped.
import { highlight, langFromFence } from './code.js';

// ---- Shared helpers ----------------------------------------------------
export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SAFE_URL = /^(https?:\/\/|mailto:)/i;
const URL_RE = /^https?:\/\/[^\s<>"]*[^\s<>"'.,:;!?)\]]/i;
const IMAGE_URL = /\.(jpe?g|png|gif|bmp|webp)(\?[^\s]*)?$/i;
const isAlnum = (c) => !!c && /[\p{L}\p{N}]/u.test(c);

// A small set of common emoji codes (Populi supports these and many more).
export const EMOJI = {
  smile: '😄', grin: '😁', laughing: '😆', wink: '😉', blush: '😊', heart: '❤️', thumbsup: '👍', '+1': '👍',
  thumbsdown: '👎', clap: '👏', star: '⭐', sparkles: '✨', fire: '🔥', tada: '🎉', bulb: '💡', book: '📖',
  books: '📚', pencil: '📝', memo: '📝', check: '✔️', white_check_mark: '✅', x: '❌', warning: '⚠️',
  question: '❓', exclamation: '❗', calendar: '📅', pushpin: '📌', paperclip: '📎', santa: '🎅',
  rice_scene: '🎑', snowflake: '❄️', crescent_moon: '🌙', full_moon: '🌕', tangerine: '🍊', lemon: '🍋',
  coffee: '☕', pray: '🙏', muscle: '💪', eyes: '👀', thinking: '🤔', cry: '😢', sob: '😭', angry: '😠',
};

// ---- Inline parsing ----------------------------------------------------
// Node shapes: {t:'text', v} | {t:'b'|'i'|'u'|'s'|'sup'|'sub'|'mark', c:[...]}
// | {t:'code', v} | {t:'link', href, c} | {t:'img', src, alt} | {t:'url', v}
// | {t:'emoji', name} | {t:'cite', raw} | {t:'ncite', key}

const MD_PAIRS = [
  ['**', 'b'], ['__', 'b'], ['++', 'u'], ['==', 'mark'], ['~~', 's'],
  ['*', 'i'], ['_', 'i'], ['^', 'sup'], ['~', 'sub'],
];
const POPULI_PAIRS = [['*', 'b'], ['_', 'i'], ['#', 'u'], ['^', 'sup'], ['~', 'sub'], ['+', 'mark']];

function findClose(src, delim, from, flank) {
  let i = from;
  while (i < src.length) {
    const j = src.indexOf(delim, i);
    if (j < 0) return -1;
    if (src[j - 1] === '\\') { i = j + 1; continue; }
    // Do not let a single-char delimiter close on part of a doubled one (** vs *).
    if (delim.length === 1 && (src[j + 1] === delim || src[j - 1] === delim)) { i = j + 2; continue; }
    const inner = src.slice(from, j);
    if (!inner || /^\s/.test(inner) || /\s$/.test(inner)) { i = j + 1; continue; }
    if (flank && isAlnum(src[j + delim.length])) { i = j + 1; continue; }
    // For "***" closing "**", close on the last two so the inner "*" pairs up.
    let k = j;
    if (delim.length > 1) while (src[k + delim.length] === delim[0]) k++;
    return k;
  }
  return -1;
}

function parseInline(src, mode) {
  const pairs = mode === 'populi' ? POPULI_PAIRS : MD_PAIRS;
  const out = [];
  let buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const rest = src.slice(i);
    const prev = src[i - 1];

    if (ch === '\\' && i + 1 < src.length && /[\\`*_{}[\]()#+\-.!~^=>|:@]/.test(src[i + 1])) {
      buf += src[i + 1]; i += 2; continue;
    }
    // A font on part of the text (set from the Font menu with text selected): [[f:flow]]text[[/f]].
    // Typed brackets are escaped when a Text note is saved, so this never appears by accident.
    let m = ch === '[' && /^\[\[f:([a-z][a-z0-9-]*)\]\]/.exec(rest);
    if (m) {
      const close = src.indexOf('[[/f]]', i + m[0].length);
      if (close >= 0) { flush(); out.push({ t: 'font', font: m[1], c: parseInline(src.slice(i + m[0].length, close), mode) }); i = close + 6; continue; }
    }
    // Citation tokens work in both formats: [@key], [@key, 42; @other]
    m = /^\[(@[\w:-]+[^\]\n]*)\]/.exec(rest);
    if (m) { flush(); out.push({ t: 'cite', raw: m[1] }); i += m[0].length; continue; }
    if (ch === '@' && !isAlnum(prev) && (m = /^@([A-Za-z](?:[\w-]*[A-Za-z0-9])?)/.exec(rest))) {
      flush(); out.push({ t: 'ncite', key: m[1], raw: m[0] }); i += m[0].length; continue;
    }
    if (mode !== 'populi') {
      if (ch === '`' && (m = /^`([^`\n]+)`/.exec(rest))) { flush(); out.push({ t: 'code', v: m[1] }); i += m[0].length; continue; }
      if (ch === '!' && (m = /^!\[([^\]\n]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/.exec(rest))) {
        flush(); out.push({ t: 'img', alt: m[1], src: m[2] }); i += m[0].length; continue;
      }
      if (ch === '[' && (m = /^\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/.exec(rest))) {
        flush(); out.push({ t: 'link', href: m[2], c: parseInline(m[1], mode) }); i += m[0].length; continue;
      }
    }
    if ((ch === 'h' || ch === 'H') && !isAlnum(prev) && (m = URL_RE.exec(rest))) {
      flush(); out.push({ t: 'url', v: m[0] }); i += m[0].length; continue;
    }
    if (ch === ':' && (m = /^:([a-z0-9_+-]+):/.exec(rest)) && EMOJI[m[1]]) {
      flush(); out.push({ t: 'emoji', name: m[1] }); i += m[0].length; continue;
    }
    let matched = false;
    for (const [d, type] of pairs) {
      if (!rest.startsWith(d)) continue;
      const flank = mode === 'populi' ? !(d === '^' || d === '~') : (d === '_' || d === '__');
      if (flank && isAlnum(prev)) continue;
      const close = findClose(src, d, i + d.length, flank);
      if (close < 0) continue;
      flush();
      out.push({ t: type, c: parseInline(src.slice(i + d.length, close), mode) });
      i = close + d.length;
      matched = true;
      break;
    }
    if (matched) continue;
    buf += ch;
    i++;
  }
  flush();
  return out;
}

export const parseInlineMarkdown = (s) => parseInline(s, 'markdown');
export const parseInlinePopuli = (s) => parseInline(s, 'populi');

// ---- Block parsing -----------------------------------------------------
// Blocks: {t:'p', lines:[nodes...]} | {t:'h', level, c} | {t:'hr'} | {t:'code', v}
// | {t:'quote', blocks} | {t:'list', items:[{level, ordered, num, task, checked, c, line}]}
// | {t:'table', head:[cells], rows:[[cells]], align:[...]} | {t:'blank'}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function parseMarkdown(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    let m;
    if (/^\s*```/.test(line)) {
      const lang = langFromFence(line.replace(/^\s*```/, ''));
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ t: 'code', v: body.join('\n'), lang });
      continue;
    }
    if (!line.trim()) { i++; continue; }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      blocks.push({ t: 'h', level: m[1].length, c: parseInlineMarkdown(m[2]), line: i });
      i++; continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push({ t: 'hr' }); i++; continue; }
    if (/^\s*>/.test(line)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ t: 'quote', blocks: parseMarkdown(q.join('\n')) });
      continue;
    }
    if (LIST_RE.test(line)) {
      const items = [];
      while (i < lines.length && (m = LIST_RE.exec(lines[i]))) {
        const ordered = /\d/.test(m[2]);
        items.push({
          level: Math.floor(m[1].replace(/\t/g, '  ').length / 2),
          ordered,
          num: ordered ? parseInt(m[2], 10) : null,
          task: m[3] !== undefined,
          checked: m[3] === 'x' || m[3] === 'X',
          c: parseInlineMarkdown(m[4]),
          line: i,
        });
        i++;
      }
      blocks.push({ t: 'list', items });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = splitRow(line).map(parseInlineMarkdown);
      const align = splitRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left'));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]).map(parseInlineMarkdown));
      blocks.push({ t: 'table', head, align, rows });
      continue;
    }
    // An empty line kept on purpose (a blank line typed in a Text note) is written "&nbsp;".
    if (line.trim() === '&nbsp;') { blocks.push({ t: 'p', lines: [], blank: true }); i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && lines[i].trim() !== '&nbsp;' && !/^(#{1,6})\s/.test(lines[i]) && !/^\s*>/.test(lines[i]) &&
      !LIST_RE.test(lines[i]) && !/^\s*```/.test(lines[i])) {
      para.push(parseInlineMarkdown(lines[i++]));
    }
    blocks.push({ t: 'p', lines: para });
  }
  return blocks;
}

// Populi text is line based: each paragraph is a run of lines.
export function parsePopuli(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) blocks.push({ t: 'p', lines: para }); para = []; };
  for (const line of lines) {
    if (!line.trim()) { flush(); continue; }
    para.push(parseInlinePopuli(line));
  }
  flush();
  return blocks;
}

export const parseNote = (body, format) => (format === 'populi' ? parsePopuli(body) : parseMarkdown(body));

// ---- HTML rendering ----------------------------------------------------
// ctx.cite(raw) and ctx.ncite(key) return runs [{text, italic}] or null.
const TAGS = { b: 'strong', i: 'em', u: 'u', s: 's', sup: 'sup', sub: 'sub', mark: 'mark' };

function runsToHtml(runs) {
  return runs.map((r) => (r.italic ? `<em>${escapeHtml(r.text)}</em>` : escapeHtml(r.text))).join('');
}

export function inlineToHtml(nodes, ctx = {}) {
  return nodes.map((n) => {
    switch (n.t) {
      case 'text': return escapeHtml(n.v);
      case 'code': return `<code>${escapeHtml(n.v)}</code>`;
      case 'emoji': return EMOJI[n.name] || escapeHtml(`:${n.name}:`);
      case 'url': {
        if (ctx.embedImages && IMAGE_URL.test(n.v)) return `<img src="${escapeHtml(n.v)}" alt="" loading="lazy">`;
        return `<a href="${escapeHtml(n.v)}" target="_blank" rel="noopener noreferrer">${escapeHtml(n.v)}</a>`;
      }
      case 'link': {
        const inner = inlineToHtml(n.c, ctx);
        return SAFE_URL.test(n.href)
          ? `<a href="${escapeHtml(n.href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
          : inner;
      }
      case 'img':
        return /^https:\/\//i.test(n.src) ? `<img src="${escapeHtml(n.src)}" alt="${escapeHtml(n.alt)}" loading="lazy">` : escapeHtml(n.alt);
      case 'cite': {
        const runs = ctx.cite ? ctx.cite(n.raw) : null;
        if (!runs) return `<span class="cite-missing">[${escapeHtml(n.raw)}]</span>`;
        return `<span class="cite">${runsToHtml(runs)}</span>`;
      }
      case 'ncite': {
        const runs = ctx.ncite ? ctx.ncite(n.key) : null;
        return runs ? `<span class="cite">${runsToHtml(runs)}</span>` : escapeHtml(n.raw);
      }
      case 'font': return `<span class="f-run" data-font="${escapeHtml(n.font)}">${inlineToHtml(n.c, ctx)}</span>`;
      default: return `<${TAGS[n.t]}>${inlineToHtml(n.c, ctx)}</${TAGS[n.t]}>`;
    }
  }).join('');
}

function listToHtml(items, ctx) {
  // Build nested lists from item levels.
  let html = '';
  const stack = [];
  for (const it of items) {
    const tag = it.ordered ? 'ol' : 'ul';
    while (stack.length && stack[stack.length - 1].level > it.level) html += `</li></${stack.pop().tag}>`;
    const top = stack[stack.length - 1];
    if (!top || top.level < it.level) {
      const start = it.ordered && it.num && it.num !== 1 ? ` start="${it.num}"` : '';
      html += `<${tag}${start}${it.task ? ' class="tasks"' : ''}>`;
      stack.push({ level: it.level, tag });
    } else {
      html += '</li>';
    }
    const box = it.task
      ? `<input type="checkbox" data-line="${it.line}"${it.checked ? ' checked' : ''}${ctx.readOnly ? ' disabled' : ''} aria-label="Done"> `
      : '';
    html += `<li${it.task ? ` class="task${it.checked ? ' done' : ''}"` : ''}>${box}${inlineToHtml(it.c, ctx)}`;
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}

export function blocksToHtml(blocks, ctx = {}) {
  return blocks.map((b) => {
    switch (b.t) {
      case 'h': return `<h${b.level}>${inlineToHtml(b.c, ctx)}</h${b.level}>`;
      case 'hr': return '<hr>';
      case 'code': return b.lang
        ? `<pre class="code-block"><code class="lang-${b.lang}">${highlight(b.v, b.lang)}</code></pre>`
        : `<pre><code>${escapeHtml(b.v)}</code></pre>`;
      case 'quote': return `<blockquote>${blocksToHtml(b.blocks, ctx)}</blockquote>`;
      case 'list': return listToHtml(b.items, ctx);
      case 'table': {
        const al = (k) => `al-${b.align[k] || 'left'}`;
        const th = b.head.map((c, k) => `<th class="${al(k)}">${inlineToHtml(c, ctx)}</th>`).join('');
        const rows = b.rows.map((r) => `<tr>${r.map((c, k) => `<td class="${al(k)}">${inlineToHtml(c, ctx)}</td>`).join('')}</tr>`).join('');
        return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
      }
      default: return b.blank ? '<p class="blank">&nbsp;</p>' : `<p>${b.lines.map((l) => inlineToHtml(l, ctx)).join('<br>')}</p>`;
    }
  }).join('\n');
}

export function noteToHtml(body, format, ctx = {}) {
  return blocksToHtml(parseNote(body, format), { ...ctx, embedImages: format === 'populi' || ctx.embedImages });
}

// ---- Serializing to Markdown and Populi -----------------------------------
const MD_MARK = { b: '**', i: '*', u: '++', s: '~~', sup: '^', sub: '~', mark: '==' };
const POPULI_MARK = { b: '*', i: '_', u: '#', sup: '^', sub: '~', mark: '+' };

function escMdText(s) {
  return s.replace(/([\\`*_[\]~^])/g, '\\$1').replace(/==/g, '\\==').replace(/\+\+/g, '\\++');
}

// ctx.resolve: when true, citation tokens are replaced with formatted text.
export function inlineToMarkdown(nodes, ctx = {}) {
  return nodes.map((n) => {
    switch (n.t) {
      case 'text': return ctx.raw ? n.v : escMdText(n.v);
      case 'code': return '`' + n.v + '`';
      case 'emoji': return `:${n.name}:`;
      case 'url': return n.v;
      case 'link': return `[${inlineToMarkdown(n.c, ctx)}](${n.href})`;
      case 'img': return `![${n.alt}](${n.src})`;
      case 'cite': {
        const runs = ctx.resolve && ctx.cite ? ctx.cite(n.raw) : null;
        return runs ? runs.map((r) => (r.italic ? `*${r.text}*` : r.text)).join('') : `[${n.raw}]`;
      }
      case 'ncite': {
        const runs = ctx.resolve && ctx.ncite ? ctx.ncite(n.key) : null;
        return runs ? runs.map((r) => (r.italic ? `*${r.text}*` : r.text)).join('') : n.raw;
      }
      // Kept inside Reiimei; Markdown made for other apps leaves the font out.
      case 'font': return ctx.resolve ? inlineToMarkdown(n.c, ctx) : `[[f:${n.font}]]${inlineToMarkdown(n.c, ctx)}[[/f]]`;
      default: return MD_MARK[n.t] + inlineToMarkdown(n.c, ctx) + MD_MARK[n.t];
    }
  }).join('');
}

// Converting to Populi records anything Populi cannot show in `lost`.
export function inlineToPopuli(nodes, ctx = {}, lost = new Set()) {
  return nodes.map((n) => {
    switch (n.t) {
      case 'text': return n.v;
      case 'code': lost.add('code formatting'); return n.v;
      case 'emoji': return `:${n.name}:`;
      case 'url': return n.v;
      case 'link': {
        const text = inlineToPopuli(n.c, ctx, lost);
        return text === n.href ? n.href : `${text}: ${n.href}`;
      }
      case 'img': return n.src;
      case 's': lost.add('strikethrough'); return inlineToPopuli(n.c, ctx, lost);
      case 'font': lost.add('fonts set on selected text'); return inlineToPopuli(n.c, ctx, lost);
      case 'cite': {
        const runs = ctx.resolve && ctx.cite ? ctx.cite(n.raw) : null;
        return runs ? runs.map((r) => (r.italic ? `_${r.text}_` : r.text)).join('') : `[${n.raw}]`;
      }
      case 'ncite': {
        const runs = ctx.resolve && ctx.ncite ? ctx.ncite(n.key) : null;
        return runs ? runs.map((r) => (r.italic ? `_${r.text}_` : r.text)).join('') : n.raw;
      }
      default: return POPULI_MARK[n.t] + inlineToPopuli(n.c, ctx, lost) + POPULI_MARK[n.t];
    }
  }).join('');
}

function blocksToPopuli(blocks, ctx, lost, prefix = '') {
  const out = [];
  for (const b of blocks) {
    switch (b.t) {
      case 'h': {
        lost.add('headings (kept as bold lines)');
        const only = b.c.length === 1 && b.c[0].t === 'b' ? b.c[0].c : b.c;
        out.push(prefix + '*' + inlineToPopuli(only, ctx, lost) + '*');
        break;
      }
      case 'hr': out.push(prefix + '-----'); break;
      case 'code': lost.add('code blocks'); out.push(b.v.split('\n').map((l) => prefix + l).join('\n')); break;
      case 'quote': lost.add('block quotes (kept with > marks)'); out.push(blocksToPopuli(b.blocks, ctx, lost, prefix + '> ')); break;
      case 'list': {
        lost.add('lists (kept as plain text)');
        let n = 0;
        out.push(b.items.map((it) => {
          const marker = it.ordered ? `${it.num ?? ++n}. ` : '- ';
          const box = it.task ? (it.checked ? '[x] ' : '[ ] ') : '';
          return prefix + '  '.repeat(it.level) + marker + box + inlineToPopuli(it.c, ctx, lost);
        }).join('\n'));
        break;
      }
      case 'table': {
        lost.add('tables (kept as text)');
        const row = (cells) => prefix + cells.map((c) => inlineToPopuli(c, ctx, lost)).join(' | ');
        out.push([row(b.head), ...b.rows.map(row)].join('\n'));
        break;
      }
      default: out.push(b.lines.map((l) => prefix + inlineToPopuli(l, ctx, lost)).join('\n'));
    }
  }
  return out.join(prefix ? `\n${prefix.trimEnd()}\n` : '\n\n');
}

export function markdownToPopuli(text, ctx = {}) {
  const lost = new Set();
  const out = blocksToPopuli(parseMarkdown(text), ctx, lost);
  return { text: out, lost: [...lost] };
}

export function populiToMarkdown(text, ctx = {}) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const out = lines.map((line) => {
    if (!line.trim()) return '';
    let md = inlineToMarkdown(parseInlinePopuli(line), ctx);
    // Keep Populi lines from turning into Markdown headings, quotes, or rules.
    md = md.replace(/^(\s*)(#|>)/, '$1\\$2').replace(/^(\s*)([-*_])(\s*\2){2,}\s*$/, (m) => m.replace(/([-*_])/g, '\\$1'));
    return md;
  });
  return { text: out.join('\n'), lost: [] };
}

// Plain export of a whole note (citations resolved) in either target format.
export function exportNote(body, fromFormat, toFormat, ctx = {}) {
  const c = { ...ctx, resolve: true };
  if (toFormat === 'populi') {
    if (fromFormat === 'populi') return inlineLinesToPopuli(body, c);
    return markdownToPopuli(body, c).text;
  }
  if (fromFormat === 'populi') return populiToMarkdown(body, c).text;
  return blocksToMarkdownResolved(body, c);
}

function inlineLinesToPopuli(body, ctx) {
  return String(body).split('\n').map((l) => inlineToPopuli(parseInlinePopuli(l), ctx)).join('\n');
}

function blocksToMarkdownResolved(body, ctx) {
  // Keep the author's Markdown as written; only replace citation tokens and drop font markers.
  return String(body).split('\n').map((l) => l.replace(/\[\[f:[a-z][a-z0-9-]*\]\]|\[\[\/f\]\]/g, '')).map((l) => {
    if (!/\[@|@\w/.test(l)) return l;
    return l.replace(/\[(@[\w:-]+[^\]\n]*)\]/g, (m, raw) => {
      const runs = ctx.cite ? ctx.cite(raw) : null;
      return runs ? runs.map((r) => (r.italic ? `*${r.text}*` : r.text)).join('') : m;
    }).replace(/(^|[^\p{L}\p{N}])@([A-Za-z](?:[\w-]*[A-Za-z0-9])?)/gu, (m, pre, key) => {
      const runs = ctx.ncite ? ctx.ncite(key) : null;
      return runs ? pre + runs.map((r) => (r.italic ? `*${r.text}*` : r.text)).join('') : m;
    });
  }).join('\n');
}

// ---- Runs (for papers) -------------------------------------------------
// A run: {text, b, i, u, s, sup, sub, mark}
export function inlineToRuns(nodes, ctx = {}, style = {}) {
  const out = [];
  for (const n of nodes) {
    switch (n.t) {
      case 'text': out.push({ ...style, text: n.v }); break;
      case 'code': out.push({ ...style, text: n.v, code: true }); break;
      case 'emoji': out.push({ ...style, text: EMOJI[n.name] || `:${n.name}:` }); break;
      case 'url': out.push({ ...style, text: n.v }); break;
      case 'img': out.push({ ...style, text: n.alt || n.src }); break;
      case 'link': {
        const inner = inlineToRuns(n.c, ctx, style);
        out.push(...inner);
        const label = inner.map((r) => r.text).join('');
        if (label !== n.href) out.push({ ...style, text: ` (${n.href})` });
        break;
      }
      case 'cite': {
        const runs = ctx.cite ? ctx.cite(n.raw) : null;
        if (runs) runs.forEach((r) => out.push({ ...style, text: r.text, i: style.i || r.italic }));
        else out.push({ ...style, text: `[${n.raw}]` });
        break;
      }
      case 'ncite': {
        const runs = ctx.ncite ? ctx.ncite(n.key) : null;
        if (runs) runs.forEach((r) => out.push({ ...style, text: r.text, i: style.i || r.italic }));
        else out.push({ ...style, text: n.raw });
        break;
      }
      case 'font': out.push(...inlineToRuns(n.c, ctx, { ...style, font: n.font })); break;
      default: out.push(...inlineToRuns(n.c, ctx, { ...style, [n.t]: true }));
    }
  }
  return out;
}

// ---- Editor helpers ----------------------------------------------------
export const TOOLBAR = {
  markdown: [
    { id: 'b', label: 'Bold', wrap: '**', key: 'b' },
    { id: 'i', label: 'Italic', wrap: '*', key: 'i' },
    { id: 'u', label: 'Underline', wrap: '++', key: 'u' },
    { id: 's', label: 'Strikethrough', wrap: '~~' },
    { id: 'mark', label: 'Highlight', wrap: '==' },
    { id: 'sup', label: 'Superscript', wrap: '^' },
    { id: 'sub', label: 'Subscript', wrap: '~' },
    { id: 'h', label: 'Heading', line: '## ' },
    { id: 'ul', label: 'Bulleted list', line: '- ' },
    { id: 'ol', label: 'Numbered list', line: '1. ' },
    { id: 'task', label: 'Checklist', line: '- [ ] ' },
    { id: 'outdent', label: 'Move list item out', indent: -1 },
    { id: 'indent', label: 'Move list item in', indent: 1 },
    { id: 'quote', label: 'Quote', line: '> ' },
    { id: 'code', label: 'Code', wrap: '`' },
    { id: 'link', label: 'Link', link: true },
  ],
  populi: [
    { id: 'b', label: 'Bold', wrap: '*', key: 'b' },
    { id: 'i', label: 'Italic', wrap: '_', key: 'i' },
    { id: 'u', label: 'Underline', wrap: '#', key: 'u' },
    { id: 'mark', label: 'Highlight', wrap: '+' },
    { id: 'sup', label: 'Superscript', wrap: '^' },
    { id: 'sub', label: 'Subscript', wrap: '~' },
    { id: 'ul', label: 'Bulleted list', line: '- ' },
    { id: 'ol', label: 'Numbered list', line: '1. ' },
    { id: 'outdent', label: 'Move list item out', indent: -1 },
    { id: 'indent', label: 'Move list item in', indent: 1 },
    { id: 'link', label: 'Link', link: true },
  ],
};

// ---- Lists while typing --------------------------------------------------
// A list line: indent, marker (- * + • or 1. 1)), optional [ ] checkbox.
const LINE_RE = /^([ \t]*)([-*+•]|\d+[.)])([ \t]+)(\[[ xX]\][ \t]+)?/;
const levelOf = (indent) => Math.floor(indent.replace(/\t/g, '  ').length / 2);

// Number the items of the list around line `at`: each level counts 1, 2, 3…
// (a list that opens at 3 keeps counting from 3), and a nested list restarts at 1.
export function renumber(value, at) {
  const lines = value.split('\n');
  let a = Math.min(Math.max(at, 0), lines.length - 1);
  if (!LINE_RE.test(lines[a])) return value;
  let s = a;
  while (s > 0 && LINE_RE.test(lines[s - 1])) s--;
  let e = a;
  while (e < lines.length - 1 && LINE_RE.test(lines[e + 1])) e++;
  const counters = [];
  for (let i = s; i <= e; i++) {
    const m = LINE_RE.exec(lines[i]);
    const lvl = levelOf(m[1]);
    counters.length = lvl + 1; // deeper levels start over
    if (/\d/.test(m[2])) {
      const own = parseInt(m[2], 10);
      const start = counters[lvl] === undefined ? (i === s ? own : (lvl === 0 ? own : 1)) : counters[lvl] + 1;
      counters[lvl] = start;
      lines[i] = m[1] + `${start}${m[2].slice(-1)}` + lines[i].slice(m[1].length + m[2].length);
    } else {
      counters[lvl] = undefined;
    }
  }
  return lines.join('\n');
}

// Enter inside a list: continue it (next number, same bullet, empty checkbox).
// Enter on an empty item moves it out a level, or ends the list.
// Returns {value, start, end} or null when Enter should behave normally.
export function listEnter(value, start, end) {
  if (start !== end) return null;
  const ls = value.lastIndexOf('\n', start - 1) + 1;
  let le = value.indexOf('\n', start);
  if (le < 0) le = value.length;
  const line = value.slice(ls, le);
  const m = LINE_RE.exec(line);
  if (!m || start < ls + m[0].length) return null;
  const rest = line.slice(m[0].length);
  const atEnd = start === le;
  if (!rest.trim() && atEnd) {
    const lvl = levelOf(m[1]);
    const nl = lvl > 0
      ? m[1].replace(/\t/g, '  ').slice(2) + line.slice(m[1].length)
      : '';
    let v = value.slice(0, ls) + nl + value.slice(le);
    const caret = ls + nl.length;
    v = renumber(v, v.slice(0, ls).split('\n').length - 1);
    return { value: v, start: caret + (v.length - (value.length - (le - ls) + nl.length)), end: caret + (v.length - (value.length - (le - ls) + nl.length)) };
  }
  let marker = m[2];
  if (/\d/.test(marker)) marker = `${parseInt(marker, 10) + 1}${marker.slice(-1)}`;
  const box = m[4] ? '[ ] ' : '';
  const head = m[1] + marker + m[3].replace(/\t/g, ' ') + box;
  const before = value.slice(0, start);
  const after = value.slice(start);
  const lineIdx = before.split('\n').length; // index of the new line
  let v = `${before}\n${head}${after}`;
  const caret = start + 1 + head.length;
  const v2 = /\d/.test(marker) ? renumber(v, lineIdx) : v;
  return { value: v2, start: caret, end: caret };
}

// Move the list items touched by the selection one level in (dir 1) or out (dir -1).
export function listIndent(value, start, end, dir) {
  const ls = value.lastIndexOf('\n', start - 1) + 1;
  let le = value.indexOf('\n', Math.max(end, start));
  if (le < 0) le = value.length;
  const lines = value.slice(ls, le).split('\n');
  if (!lines.some((l) => LINE_RE.test(l))) return { value, start, end };
  const firstIdx = value.slice(0, ls).split('\n').length - 1;
  const out = lines.map((l) => {
    if (!LINE_RE.test(l)) return l;
    if (dir > 0) return `  ${l}`;
    return l.replace(/^(\t| {1,2})/, '');
  });
  const block = out.join('\n');
  let v = value.slice(0, ls) + block + value.slice(le);
  v = renumber(v, firstIdx);
  const diff = v.length - value.length;
  return { value: v, start: Math.max(ls, start + (dir > 0 ? 2 : -Math.min(2, (lines[0].match(/^(\t| {1,2})/) || [''])[0].length))), end: end + diff };
}

// Returns {value, start, end} after applying a toolbar action to a textarea state.
export function applyTool(tool, value, start, end, extra = {}) {
  const sel = value.slice(start, end);
  if (tool.wrap) {
    const w = tool.wrap;
    // Toggle off when the selection is already wrapped.
    if (value.slice(start - w.length, start) === w && value.slice(end, end + w.length) === w) {
      return { value: value.slice(0, start - w.length) + sel + value.slice(end + w.length), start: start - w.length, end: end - w.length };
    }
    const text = sel || tool.label.toLowerCase();
    return { value: value.slice(0, start) + w + text + w + value.slice(end), start: start + w.length, end: start + w.length + text.length };
  }
  if (tool.indent) return listIndent(value, start, end, tool.indent);
  if (tool.line) {
    const ls = value.lastIndexOf('\n', start - 1) + 1;
    let le = value.indexOf('\n', end);
    if (le < 0) le = value.length;
    const block = value.slice(ls, le);
    const lines = block.split('\n');
    const all = lines.every((l) => l.startsWith(tool.line));
    let n = 0;
    const next = lines.map((l) => {
      if (all) return l.slice(tool.line.length);
      if (tool.id === 'ol') return `${++n}. ${l.replace(/^(\d+[.)]|[-*+])\s+/, '')}`;
      return tool.line + l.replace(/^(#{1,6}|[-*+]|\d+[.)]|>)\s+(\[[ xX]\]\s+)?/, '');
    }).join('\n');
    return { value: value.slice(0, ls) + next + value.slice(le), start: ls, end: ls + next.length };
  }
  if (tool.link) {
    const url = extra.url || 'https://';
    if (extra.format === 'populi') {
      const text = sel ? `${sel}: ${url}` : url;
      return { value: value.slice(0, start) + text + value.slice(end), start: start + text.length, end: start + text.length };
    }
    const label = sel || 'link text';
    const text = `[${label}](${url})`;
    return { value: value.slice(0, start) + text + value.slice(end), start: start + 1, end: start + 1 + label.length };
  }
  return { value, start, end };
}

// Toggle the checkbox on a given source line (for checklists in preview).
export function toggleTaskLine(body, lineIndex) {
  const lines = body.split('\n');
  const l = lines[lineIndex];
  if (l === undefined) return body;
  lines[lineIndex] = l.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/, (m, p, c) => `${p}[${c === ' ' ? 'x' : ' '}]`);
  return lines.join('\n');
}
