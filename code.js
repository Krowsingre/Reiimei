// Reiimei code support: syntax coloring for Python, HTML5 (with embedded CSS
// and JavaScript), and XML, plus editing helpers and tidying.
// Output is HTML with <span class="tk-…"> tokens; all text is escaped.

export const LANGS = {
  python: { label: 'Python', ext: 'py', comment: ['# ', ''], indent: '    ', mime: 'text/x-python' },
  html: { label: 'HTML5', ext: 'html', comment: ['<!-- ', ' -->'], indent: '  ', mime: 'text/html' },
  xml: { label: 'XML', ext: 'xml', comment: ['<!-- ', ' -->'], indent: '  ', mime: 'application/xml' },
};
export const isCode = (format) => Object.prototype.hasOwnProperty.call(LANGS, format);
const ALIASES = { py: 'python', python3: 'python', htm: 'html', html5: 'html', xhtml: 'xml', svg: 'xml', js: 'javascript', javascript: 'javascript', css: 'css' };
export const langFromFence = (s) => { const k = String(s || '').trim().toLowerCase(); return LANGS[k] ? k : ALIASES[k] || null; };

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (cls, text) => (text ? (cls ? `<span class="tk-${cls}">${esc(text)}</span>` : esc(text)) : '');

// Generic scanner: rules are [className | fn, sticky regex].
function scan(src, rules, classify) {
  let out = '';
  let i = 0;
  let prev = '';
  while (i < src.length) {
    let hit = false;
    for (const [cls, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (m && m[0].length) {
        const text = m[0];
        const c = typeof cls === 'function' ? cls(text, prev) : cls;
        out += span(c, text);
        if (c !== null && !/^\s+$/.test(text)) prev = text;
        i += text.length;
        hit = true;
        break;
      }
    }
    if (!hit) { out += esc(src[i]); if (!/\s/.test(src[i])) prev = src[i]; i++; }
  }
  return out;
}

// ---- Python --------------------------------------------------------------
const PY_KW = new Set(('False None True and as assert async await break class continue def del elif else except finally for from ' +
  'global if import in is lambda nonlocal not or pass raise return try while with yield match case').split(' '));
const PY_BI = new Set(('abs all any ascii bin bool breakpoint bytearray bytes callable chr classmethod compile complex delattr dict dir ' +
  'divmod enumerate eval exec filter float format frozenset getattr globals hasattr hash help hex id input int isinstance ' +
  'issubclass iter len list locals map max memoryview min next object oct open ord pow print property range repr reversed ' +
  'round set setattr slice sorted staticmethod str sum super tuple type vars zip __import__ ' +
  'Exception ValueError TypeError KeyError IndexError AttributeError RuntimeError StopIteration NameError ImportError ' +
  'OSError FileNotFoundError ZeroDivisionError NotImplementedError').split(' '));
const PY_RULES = [
  ['com', /#[^\n]*/y],
  ['str', /[rRbBuUfF]{0,2}("""|''')[\s\S]*?(?:\1|$)/y],
  ['str', /[rRbBuUfF]{0,2}(["'])(?:\\.|(?!\1)[^\\\n])*\1?/y],
  ['dec', /@[A-Za-z_][\w.]*/y],
  ['num', /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?[jJ]?)(?![\w])/y],
  [(w, prev) => {
    if (prev === 'def') return 'fn';
    if (prev === 'class') return 'cls';
    if (PY_KW.has(w)) return 'kw';
    if (w === 'self' || w === 'cls') return 'self';
    if (PY_BI.has(w)) return 'bi';
    return '';
  }, /[A-Za-z_]\w*/y],
  ['op', /[+\-*/%=<>!&|^~]+/y],
  ['', /\s+/y],
];
export const highlightPython = (src) => scan(src, PY_RULES);

// ---- JavaScript (inside HTML) --------------------------------------------
const JS_KW = new Set(('break case catch class const continue debugger default delete do else export extends finally for function if ' +
  'import in instanceof let new return super switch this throw try typeof var void while with yield async await of static get set ' +
  'true false null undefined NaN Infinity').split(' '));
const JS_RULES = [
  ['com', /\/\/[^\n]*/y],
  ['com', /\/\*[\s\S]*?(?:\*\/|$)/y],
  ['str', /`(?:\\[\s\S]|[^\\`])*`?/y],
  ['str', /(["'])(?:\\.|(?!\1)[^\\\n])*\1?/y],
  ['num', /(?:0[xX][\da-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?)(?![\w])/y],
  [(w, prev) => (JS_KW.has(w) ? 'kw' : prev === 'function' || prev === 'class' ? 'fn' : ''), /[A-Za-z_$][\w$]*/y],
  ['', /\s+/y],
];
export const highlightJs = (src) => scan(src, JS_RULES);

// ---- CSS (inside HTML) -----------------------------------------------------
export function highlightCss(src) {
  let out = '';
  let depth = 0;
  let i = 0;
  const rules = () => (depth > 0 ? [
    ['com', /\/\*[\s\S]*?(?:\*\/|$)/y],
    ['str', /(["'])(?:\\.|(?!\1)[^\\\n])*\1?/y],
    ['prop', /[\w-]+(?=\s*:)/y],
    ['num', /#[\da-fA-F]{3,8}\b|-?\d*\.?\d+(?:%|[a-zA-Z]+)?/y],
    ['kw', /!important/y],
    ['', /[^;{}:"'/#\d\s-]+|\s+/y],
  ] : [
    ['com', /\/\*[\s\S]*?(?:\*\/|$)/y],
    ['kw', /@[\w-]+/y],
    ['str', /(["'])(?:\\.|(?!\1)[^\\\n])*\1?/y],
    ['sel', /[^{}/"'@\s][^{}/"'@\n]*?(?=\s*\{|\s*,|\n|$)/y],
    ['', /\s+/y],
  ]);
  while (i < src.length) {
    const ch = src[i];
    if (ch === '{') { depth++; out += '{'; i++; continue; }
    if (ch === '}') { depth = Math.max(0, depth - 1); out += '}'; i++; continue; }
    let hit = false;
    for (const [cls, re] of rules()) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (m && m[0].length) { out += span(cls, m[0]); i += m[0].length; hit = true; break; }
    }
    if (!hit) { out += esc(ch); i++; }
  }
  return out;
}

// ---- XML and HTML -------------------------------------------------------------
function highlightMarkup(src, html) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    if (src.startsWith('<!--', i)) {
      const e = src.indexOf('-->', i + 4);
      const end = e < 0 ? n : e + 3;
      out += span('com', src.slice(i, end)); i = end; continue;
    }
    if (src.startsWith('<![CDATA[', i)) {
      const e = src.indexOf(']]>', i);
      const end = e < 0 ? n : e + 3;
      out += span('cdata', src.slice(i, end)); i = end; continue;
    }
    if (src.startsWith('<?', i)) {
      const e = src.indexOf('?>', i);
      const end = e < 0 ? n : e + 2;
      out += span('pi', src.slice(i, end)); i = end; continue;
    }
    if (/^<!/.test(src.slice(i, i + 2))) {
      const e = src.indexOf('>', i);
      const end = e < 0 ? n : e + 1;
      out += span('doc', src.slice(i, end)); i = end; continue;
    }
    const tm = /^<\/?([A-Za-z_][\w:.-]*)/.exec(src.slice(i, i + 200));
    if (tm) {
      const closing = src[i + 1] === '/';
      const name = tm[1].toLowerCase();
      out += span('punct', closing ? '</' : '<') + span('tag', tm[1]);
      i += tm[0].length;
      // Attributes until > or />
      while (i < n && src[i] !== '>' && !src.startsWith('/>', i)) {
        const rest = src.slice(i, i + 4000);
        let m;
        if ((m = /^\s+/.exec(rest))) { out += esc(m[0]); i += m[0].length; continue; }
        if ((m = /^[^\s=>/"']+/.exec(rest))) { out += span('attr', m[0]); i += m[0].length; continue; }
        if ((m = /^=\s*/.exec(rest))) { out += span('punct', m[0]); i += m[0].length; continue; }
        if ((m = /^("[^"]*"?|'[^']*'?)/.exec(rest))) { out += span('val', m[0]); i += m[0].length; continue; }
        out += esc(src[i]); i++;
      }
      if (src.startsWith('/>', i)) { out += span('punct', '/>'); i += 2; continue; }
      if (src[i] === '>') { out += span('punct', '>'); i++; }
      // HTML: color the contents of <script> and <style> as JavaScript and CSS.
      if (html && !closing && (name === 'script' || name === 'style')) {
        const close = src.toLowerCase().indexOf(`</${name}`, i);
        const end = close < 0 ? n : close;
        const inner = src.slice(i, end);
        out += name === 'script' ? highlightJs(inner) : highlightCss(inner);
        i = end;
      }
      continue;
    }
    const em = /^&(?:#\d+|#x[\da-fA-F]+|[A-Za-z][\w]*);/.exec(src.slice(i, i + 40));
    if (em) { out += span('ent', em[0]); i += em[0].length; continue; }
    const next = src.slice(i).search(/[<&]/);
    const end = next <= 0 ? (next === 0 ? i + 1 : n) : i + next;
    out += esc(src.slice(i, end));
    i = end;
  }
  return out;
}
export const highlightHtml = (src) => highlightMarkup(src, true);
export const highlightXml = (src) => highlightMarkup(src, false);

export function highlight(src, lang) {
  switch (lang) {
    case 'python': return highlightPython(src);
    case 'html': return highlightHtml(src);
    case 'xml': return highlightXml(src);
    case 'javascript': return highlightJs(src);
    case 'css': return highlightCss(src);
    default: return esc(src);
  }
}

// ---- Titles ---------------------------------------------------------------------
export function codeTitle(src, lang) {
  const s = String(src || '');
  if (lang === 'html') {
    const dec = (x) => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
    const t = /<title[^>]*>([^<]*)<\/title>/i.exec(s);
    if (t && t[1].trim()) return dec(t[1]);
    const h = /<h1[^>]*>([^<]*)<\/h1>/i.exec(s);
    if (h && h[1].trim()) return dec(h[1]);
  }
  const first = s.split('\n').map((l) => l.trim()).find(Boolean) || '';
  if (lang === 'python') return first.replace(/^#+\s*/, '').replace(/^("""|''')/, '').replace(/("""|''')$/, '').trim() || 'Python';
  if (lang === 'xml') {
    const c = /<!--\s*([\s\S]*?)\s*-->/.exec(s);
    if (c && c[1] && s.indexOf(c[0]) < (s.search(/<[A-Za-z]/) + 1 || Infinity)) return c[1].split('\n')[0].trim();
    const root = /<([A-Za-z_][\w:.-]*)/.exec(s.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, ''));
    return root ? `<${root[1]}>` : 'XML';
  }
  return first.replace(/<!--|-->/g, '').trim() || LANGS[lang]?.label || 'Code';
}

// ---- Editing helpers ---------------------------------------------------------------
// Each returns {value, start, end}.
function lineBounds(value, start, end) {
  const ls = value.lastIndexOf('\n', start - 1) + 1;
  let le = value.indexOf('\n', end > start && value[end - 1] === '\n' ? end - 1 : end);
  if (le < 0) le = value.length;
  return [ls, le];
}

export function indentLines(value, start, end, unit, outdent = false) {
  if (!outdent && start === end) {
    return { value: value.slice(0, start) + unit + value.slice(end), start: start + unit.length, end: start + unit.length };
  }
  const [ls, le] = lineBounds(value, start, end);
  const lines = value.slice(ls, le).split('\n');
  let firstDelta = 0;
  let total = 0;
  const next = lines.map((l, k) => {
    if (!outdent) { if (k === 0) firstDelta = unit.length; total += unit.length; return unit + l; }
    const m = new RegExp(`^( {1,${unit.length}}|\\t)`).exec(l);
    const cut = m ? m[0].length : 0;
    if (k === 0) firstDelta = -cut;
    total -= cut;
    return l.slice(cut);
  }).join('\n');
  return {
    value: value.slice(0, ls) + next + value.slice(le),
    start: Math.max(ls, start + firstDelta),
    end: Math.max(ls, end + total),
  };
}

export function toggleComment(value, start, end, lang) {
  const [open, close] = LANGS[lang].comment;
  const [ls, le] = lineBounds(value, start, end);
  const block = value.slice(ls, le);
  if (lang === 'python') {
    const lines = block.split('\n');
    const all = lines.filter((l) => l.trim()).every((l) => /^\s*#/.test(l));
    const next = lines.map((l) => {
      if (!l.trim()) return l;
      if (all) return l.replace(/^(\s*)#\s?/, '$1');
      const ind = /^\s*/.exec(l)[0];
      return ind + open + l.slice(ind.length);
    }).join('\n');
    return { value: value.slice(0, ls) + next + value.slice(le), start: ls, end: ls + next.length };
  }
  const trimmed = block.trim();
  let next;
  if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) {
    next = block.replace(/<!--\s?/, '').replace(/\s?-->(?![\s\S]*-->)/, '');
  } else {
    const ind = /^\s*/.exec(block)[0];
    next = ind + open + block.slice(ind.length) + close;
  }
  return { value: value.slice(0, ls) + next + value.slice(le), start: ls, end: ls + next.length };
}

const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));

// Indentation to use after pressing Enter at `pos`.
export function newlineIndent(value, pos, lang) {
  const ls = value.lastIndexOf('\n', pos - 1) + 1;
  const line = value.slice(ls, pos);
  let ind = /^[ \t]*/.exec(line)[0];
  const unit = LANGS[lang]?.indent || '  ';
  const t = line.trimEnd();
  if (lang === 'python') {
    if (/:\s*(#.*)?$/.test(t)) ind += unit;
    else if (/^\s*(return|pass|break|continue|raise)\b/.test(t)) ind = ind.slice(0, Math.max(0, ind.length - unit.length));
  } else if (lang === 'html' || lang === 'xml') {
    const open = /<([A-Za-z][\w:.-]*)[^<>]*>[^<]*$/.exec(t);
    if (open && !/\/>$/.test(t) && !(lang === 'html' && VOID.has(open[1].toLowerCase())) && !new RegExp(`</${open[1]}>\\s*$`).test(t)) ind += unit;
  }
  return ind;
}

// ---- Tidy -------------------------------------------------------------------------
// Python: tabs to spaces, no trailing spaces, one final newline.
export function tidyPython(src) {
  return src.replace(/\r\n?/g, '\n').split('\n')
    .map((l) => l.replace(/^\t+/, (m) => '    '.repeat(m.length)).replace(/[ \t]+$/, ''))
    .join('\n').replace(/\n{3,}(?=\S)/g, '\n\n\n').replace(/\s*$/, '\n');
}

// HTML and XML: re-indent each line by tag nesting. Line breaks and text are
// left where they are, and <pre>, <script>, <style> and <textarea> bodies are untouched.
export function tidyMarkup(src, lang) {
  const unit = LANGS[lang].indent;
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let depth = 0;
  let raw = null; // inside <pre>/<script>/<style>/<textarea>/CDATA/comment
  const out = [];
  for (const original of lines) {
    const line = original.trim();
    if (raw) {
      out.push(original.replace(/[ \t]+$/, ''));
      if (raw.close.test(line)) {
        depth = raw.depth;
        raw = null;
      }
      continue;
    }
    if (!line) { out.push(''); continue; }
    // Closing tags at the start of the line pull this line out a level.
    const leadingClose = (/^(<\/[^>]+>\s*)+/.exec(line)?.[0].match(/<\//g) || []).length;
    out.push(unit.repeat(Math.max(0, depth - leadingClose)) + line);
    // Net nesting change for the rest of the line.
    const cleaned = line.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/"[^"]*"|'[^']*'/g, '""');
    const tags = cleaned.match(/<\/?[A-Za-z][\w:.-]*[^<>]*?\/?>/g) || [];
    for (const t of tags) {
      const name = /<\/?([A-Za-z][\w:.-]*)/.exec(t)[1].toLowerCase();
      if (t.startsWith('</')) depth = Math.max(0, depth - 1);
      else if (!t.endsWith('/>') && !(lang === 'html' && VOID.has(name))) depth++;
    }
    for (const name of ['pre', 'script', 'style', 'textarea']) {
      if (lang === 'html' && new RegExp(`<${name}[\\s>]`, 'i').test(line) && !new RegExp(`</${name}>`, 'i').test(line)) {
        raw = { close: new RegExp(`</${name}>`, 'i'), depth: depth - 1 };
      }
    }
    if (/<!--/.test(line) && !/-->/.test(line)) raw = { close: /-->/, depth };
    if (/<!\[CDATA\[/.test(line) && !/\]\]>/.test(line)) raw = { close: /\]\]>/, depth };
  }
  return out.join('\n').replace(/\s*$/, '\n');
}

export function tidy(src, lang) {
  if (lang === 'python') return tidyPython(src);
  return tidyMarkup(src, lang);
}

// ---- XML checking and tree ----------------------------------------------------------
// Uses the browser's XML parser. Returns {ok, error, line, doc}.
export function checkXml(src) {
  const doc = new DOMParser().parseFromString(src, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (!err) return { ok: true, doc };
  const text = err.textContent || 'This XML is not well formed.';
  const m = /line\s*(?:number\s*)?(\d+)/i.exec(text);
  return { ok: false, error: text.replace(/\s+/g, ' ').replace(/^This page contains the following errors:\s*/i, '').replace(/Below is a rendering.*$/i, '').trim(), line: m ? +m[1] : null };
}

export function xmlTreeHtml(node, depth = 0) {
  if (node.nodeType === 3) { // text
    const t = node.nodeValue.trim();
    return t ? `<div class="xt-text">${esc(t)}</div>` : '';
  }
  if (node.nodeType === 8) return `<div class="xt-com">${span('com', `<!--${node.nodeValue}-->`)}</div>`;
  if (node.nodeType === 4) return `<div class="xt-text">${span('cdata', `<![CDATA[${node.nodeValue}]]>`)}</div>`;
  if (node.nodeType === 7) return `<div>${span('pi', `<?${node.target} ${node.data}?>`)}</div>`;
  if (node.nodeType === 9) return [...node.childNodes].map((c) => xmlTreeHtml(c, depth)).join('');
  if (node.nodeType !== 1) return '';
  const attrs = [...node.attributes].map((a) => ` ${span('attr', a.name)}${span('punct', '=')}${span('val', `"${a.value}"`)}`).join('');
  const kids = [...node.childNodes].map((c) => xmlTreeHtml(c, depth + 1)).join('');
  const open = `${span('punct', '<')}${span('tag', node.nodeName)}${attrs}${span('punct', kids ? '>' : ' />')}`;
  if (!kids) return `<div class="xt-leaf">${open}</div>`;
  const onlyText = node.childNodes.length === 1 && node.firstChild.nodeType === 3;
  if (onlyText) return `<div class="xt-leaf">${open}${esc(node.firstChild.nodeValue.trim())}${span('punct', '</')}${span('tag', node.nodeName)}${span('punct', '>')}</div>`;
  const count = node.children.length;
  return `<details class="xt" ${depth < 3 ? 'open' : ''}><summary>${open}${count ? ` <span class="xt-count">${count} ${count === 1 ? 'child' : 'children'}</span>` : ''}</summary><div class="xt-kids">${kids}</div><div class="xt-close">${span('punct', '</')}${span('tag', node.nodeName)}${span('punct', '>')}</div></details>`;
}
