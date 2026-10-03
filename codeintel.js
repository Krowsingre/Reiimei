// Reiimei code intelligence (no screens here, so it can be tested on its own):
//   defined names, a gentle name check, autocomplete candidates, outline, find and replace,
//   and the merge of a project's snippet library.
// Names in comments and strings are ignored. Nothing here changes a note; it only reports.
import { PY_KW, PY_BI, JS_KW, SQL_KW, SQL_FN } from './code.js';

const words = (s) => new Set(s.split(/\s+/).filter(Boolean));

// ---- Built-in names per language -------------------------------------------------------
const PY_EXTRA = words('self cls __init__ __name__ __main__ __file__ __doc__ __str__ __repr__ append extend insert remove pop sort reverse index count keys values items get update ' +
  'join split strip lower upper replace startswith endswith read write close readlines readline encode decode copy clear add discard ' +
  'os sys re json math random datetime time pathlib collections itertools functools typing dataclass argparse logging csv sqlite3 subprocess ' +
  'path exists loads dumps load dump now sqrt floor ceil pi randint choice shuffle');
const JS_EXTRA = words('console log error warn info Math JSON Object Array String Number Boolean Date Promise Map Set Symbol RegExp Error parseInt parseFloat isNaN ' +
  'setTimeout setInterval clearTimeout clearInterval fetch document window localStorage navigator require module exports process addEventListener ' +
  'querySelector querySelectorAll getElementById getElementsByClassName createElement appendChild removeChild classList innerHTML textContent style ' +
  'push pop shift unshift slice splice map filter reduce forEach find findIndex includes indexOf join split replace trim toString keys values entries ' +
  'assign freeze then resolve reject all stringify parse floor ceil round random max min abs length prototype constructor arguments');
const SQL_TYPES = words('integer int text varchar char real float double boolean date timestamp blob numeric decimal serial bigint smallint');
const CSS_PROPS = words('align-items align-content align-self animation background background-color background-image background-position background-repeat background-size border ' +
  'border-bottom border-collapse border-color border-left border-radius border-right border-style border-top border-width bottom box-shadow box-sizing color column-gap content cursor ' +
  'display filter flex flex-basis flex-direction flex-flow flex-grow flex-shrink flex-wrap float font font-family font-size font-style font-weight gap grid grid-area grid-column grid-row ' +
  'grid-template-areas grid-template-columns grid-template-rows height justify-content justify-items left letter-spacing line-height list-style margin margin-bottom margin-left margin-right ' +
  'margin-top max-height max-width min-height min-width object-fit opacity order outline overflow overflow-x overflow-y padding padding-bottom padding-left padding-right padding-top ' +
  'pointer-events position resize right row-gap text-align text-decoration text-overflow text-transform top transform transition user-select vertical-align visibility white-space width word-break z-index');
const CSS_VALUES = words('inherit initial unset auto none block inline inline-block flex grid absolute relative fixed sticky center left right bold normal italic solid dashed dotted ' +
  'hidden visible scroll pointer transparent nowrap wrap column row space-between space-around flex-start flex-end stretch cover contain no-repeat');
const HTML_TAGS = words('a abbr article aside audio b blockquote body br button canvas caption code col colgroup details div dl dt dd em fieldset figure footer form h1 h2 h3 h4 h5 h6 head header hr html i iframe ' +
  'img input label legend li link main mark meta nav ol optgroup option p pre script section select small source span strong style sub summary sup svg table tbody td template textarea tfoot th thead title tr ul video rect path circle line g defs text tspan polygon polyline ellipse use');

export const BUILTINS = {
  python: new Set([...PY_KW, ...PY_BI, ...PY_EXTRA]),
  javascript: new Set([...JS_KW, ...JS_EXTRA]),
  sql: new Set([...SQL_KW, ...SQL_FN, ...SQL_TYPES]),
  css: new Set([...CSS_PROPS, ...CSS_VALUES]),
  html: new Set([...HTML_TAGS, ...JS_KW, ...JS_EXTRA]),
  xml: new Set(),
  json: new Set(),
};
// Languages whose names are checked. XML and JSON have no code to misspell.
export const CHECKED = new Set(['python', 'javascript', 'css', 'html', 'sql']);
export const completes = (lang) => lang !== 'json' && !!BUILTINS[lang];
export const HTML_TAG_LIST = [...HTML_TAGS];

// ---- Masking comments and strings ------------------------------------------------------
const MASKS = {
  python: [/#[^\n]*/y, /[rRbBuUfF]{0,2}("""|''')[\s\S]*?(?:\1|$)/y, /[rRbBuUfF]{0,2}(["'])(?:\\.|(?!\1)[^\\\n])*\1?/y],
  javascript: [/\/\/[^\n]*/y, /\/\*[\s\S]*?(?:\*\/|$)/y, /`(?:\\[\s\S]|[^\\`])*`?/y, /(["'])(?:\\.|(?!\1)[^\\\n])*\1?/y],
  sql: [/--[^\n]*/y, /\/\*[\s\S]*?(?:\*\/|$)/y, /'(?:''|[^'])*'?/y, /"(?:""|[^"])*"?/y],
  css: [/\/\*[\s\S]*?(?:\*\/|$)/y, /(["'])(?:\\.|(?!\1)[^\\\n])*\1?/y],
  html: [/<!--[\s\S]*?(?:-->|$)/y],
  xml: [/<!--[\s\S]*?(?:-->|$)/y],
};
const STARTS = { python: /[#"'rRbBuUfF]/, javascript: /[/"'`]/, sql: /[-/'"]/, css: /[/"']/, html: /</, xml: /</ };
const blank = (t) => t.replace(/[^\n]/g, ' ');
export function mask(src, lang) {
  const rules = MASKS[lang];
  if (!rules) return src;
  const st = STARTS[lang];
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (!st.test(src[i])) { out += src[i++]; continue; }
    let hit = false;
    for (const re of rules) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (m && m[0].length) { out += blank(m[0]); i += m[0].length; hit = true; break; }
    }
    if (!hit) out += src[i++];
  }
  return out;
}

// HTML holds JavaScript and CSS. Each segment is the whole text with everything outside it blanked,
// so positions stay the same in every segment.
export function segments(src, lang) {
  if (lang !== 'html') return [{ lang, text: mask(src, lang) }];
  const out = [];
  let markup = src;
  const re = /<(script|style)\b[^>]*>([\s\S]*?)(?=<\/\1|$)/gi;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].length - m[2].length;
    const inner = src.slice(start, start + m[2].length);
    const isJs = m[1].toLowerCase() === 'script';
    const text = ' '.repeat(start).replace(/[^\n]/g, ' ') + mask(inner, isJs ? 'javascript' : 'css');
    out.push({ lang: isJs ? 'javascript' : 'css', text: blankOutside(src, start, start + inner.length, text) });
    markup = markup.slice(0, start) + blank(inner) + markup.slice(start + inner.length);
  }
  out.unshift({ lang: 'html', text: mask(markup, 'html') });
  return out;
}
function blankOutside(src, a, b, partial) {
  // `partial` already has `a` blank characters followed by the masked inner text.
  let before = '';
  for (let k = 0; k < a; k++) before += src[k] === '\n' ? '\n' : ' ';
  return before + partial.slice(a) + src.slice(b).replace(/[^\n]/g, ' ');
}

// ---- Defined names ---------------------------------------------------------------------
const ID = '[A-Za-z_$][\\w$]*';
const idList = (s) => (String(s).match(/[A-Za-z_$][\w$]*/g) || []);
function paramNames(list) {
  const out = [];
  for (const part of String(list).split(',')) {
    const t = part.replace(/=.*$/, '').replace(/:.*$/, '').replace(/^[\s*&.]+/, '').trim();
    if (/^[A-Za-z_$][\w$]*$/.test(t)) out.push(t);
  }
  return out;
}
const NOT_METHOD = words('if for while switch catch function return else do with');

function defsPython(t, add) {
  let m;
  const re = (rx) => new RegExp(rx.source, rx.flags);
  for (const r of [/\bdef\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g]) { const x = re(r); while ((m = x.exec(t))) { add(m[1], 'function'); paramNames(m[2]).forEach((p) => add(p, 'parameter')); } }
  let x = /\bclass\s+([A-Za-z_]\w*)/g; while ((m = x.exec(t))) add(m[1], 'class');
  x = /^[ \t]*([A-Za-z_]\w*(?:[ \t]*,[ \t]*[A-Za-z_]\w*)*)[ \t]*(?::[^=\n]+)?(?:[-+*/%|&^]|\/\/|\*\*|>>|<<)?=(?!=)/gm; while ((m = x.exec(t))) idList(m[1]).forEach((n) => add(n, 'variable'));
  x = /\bself\.([A-Za-z_]\w*)\s*(?::[^=\n]+)?=(?!=)/g; while ((m = x.exec(t))) add(m[1], 'attribute');
  x = /\bfor\s+([A-Za-z_(][\w\s,()]*?)\s+in\b/g; while ((m = x.exec(t))) idList(m[1]).forEach((n) => add(n, 'variable'));
  x = /\bas\s+([A-Za-z_]\w*)/g; while ((m = x.exec(t))) add(m[1], 'variable');
  x = /^[ \t]*import[ \t]+([\w.,\s]+?)$/gm; while ((m = x.exec(t))) m[1].split(',').forEach((p) => { const n = p.trim().split(/\s+as\s+/)[0].split('.')[0]; if (n) add(n, 'import'); });
  x = /^[ \t]*from[ \t]+[\w.]+[ \t]+import[ \t]+(\([^)]*\)|[^\n]+)/gm; while ((m = x.exec(t))) idList(m[1].replace(/\bas\b/g, ' ')).forEach((n) => add(n, 'import'));
  x = /\blambda\s+([^:]*):/g; while ((m = x.exec(t))) paramNames(m[1]).forEach((n) => add(n, 'parameter'));
}

function defsJs(t, add) {
  let m;
  let x = /\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g; while ((m = x.exec(t))) { if (m[1]) add(m[1], 'function'); paramNames(m[2]).forEach((p) => add(p, 'parameter')); }
  x = /\bclass\s+([A-Za-z_$][\w$]*)/g; while ((m = x.exec(t))) add(m[1], 'class');
  x = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g; while ((m = x.exec(t))) add(m[1], 'variable');
  x = /\b(?:const|let|var)\s+([{[][^=;]*?[}\]])\s*=/g; while ((m = x.exec(t))) idList(m[1].replace(/[A-Za-z_$][\w$]*\s*:/g, ' ')).forEach((n) => add(n, 'variable'));
  x = /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?:=[^,;\n]*?,\s*([A-Za-z_$][\w$]*)\s*=)/g; while ((m = x.exec(t))) add(m[1], 'variable');
  x = /([A-Za-z_$][\w$]*)\s*=>/g; while ((m = x.exec(t))) add(m[1], 'parameter');
  x = /\(([^()]*)\)\s*=>/g; while ((m = x.exec(t))) paramNames(m[1]).forEach((p) => add(p, 'parameter'));
  x = /^[ \t]*(?:static[ \t]+|async[ \t]+|get[ \t]+|set[ \t]+)*([A-Za-z_$][\w$]*)[ \t]*\(([^)]*)\)[ \t]*\{/gm;
  while ((m = x.exec(t))) { if (NOT_METHOD.has(m[1])) continue; add(m[1], 'method'); paramNames(m[2]).forEach((p) => add(p, 'parameter')); }
  x = /\bthis\.([A-Za-z_$][\w$]*)\s*=(?!=)/g; while ((m = x.exec(t))) add(m[1], 'attribute');
  x = /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g; while ((m = x.exec(t))) add(m[1], 'variable');
  x = /\bimport\s+([^;]*?)\s+from\b/g; while ((m = x.exec(t))) idList(m[1].replace(/\bas\b/g, ' ')).forEach((n) => add(n, 'import'));
  x = /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:function|\()/g; void x;
}

function defsSql(t, add) {
  let m;
  let x = /\bcreate\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?(?:table|view|index|function|procedure|trigger|schema|database)\s+(?:if\s+not\s+exists\s+)?([\w.]+)/gi;
  while ((m = x.exec(t))) m[1].split('.').forEach((n) => add(n, 'table'));
  x = /\bcreate\s+(?:temp(?:orary)?\s+)?table\s+(?:if\s+not\s+exists\s+)?[\w.]+\s*\(/gi;
  while ((m = x.exec(t))) {
    let depth = 1; let i = m.index + m[0].length; const start = i; let seg = ''; const parts = [];
    for (; i < t.length && depth > 0; i++) {
      const c = t[i];
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) break; }
      if (c === ',' && depth === 1) { parts.push(seg); seg = ''; } else seg += c;
    }
    parts.push(seg); void start;
    for (const p of parts) {
      const w = /^\s*([A-Za-z_]\w*)/.exec(p);
      if (w && !/^(primary|foreign|unique|constraint|check|key|index)$/i.test(w[1])) add(w[1], 'column');
    }
  }
  x = /\bas\s+([A-Za-z_]\w*)/gi; while ((m = x.exec(t))) add(m[1], 'alias');
  x = /\balter\s+table\s+[\w.]+\s+add\s+(?:column\s+)?([A-Za-z_]\w*)/gi; while ((m = x.exec(t))) add(m[1], 'column');
}

function defsCss(t, add) {
  let m;
  let depth = 0;
  let sel = '';
  for (const c of t) {
    if (c === '{') { if (depth === 0 || /@media|@supports/.test(sel)) { const mm = sel.match(/[.#][A-Za-z_-][\w-]*/g) || []; mm.forEach((s) => add(s.slice(1), s[0] === '.' ? 'class' : 'id')); } depth++; sel = ''; }
    else if (c === '}') { depth = Math.max(0, depth - 1); sel = ''; }
    else if (depth === 0) sel += c;
  }
  let x = /--([\w-]+)\s*:/g; while ((m = x.exec(t))) add(`--${m[1]}`, 'variable');
  x = /@keyframes\s+([\w-]+)/g; while ((m = x.exec(t))) add(m[1], 'animation');
}

function defsHtml(t, add) {
  let m;
  let x = /\bid\s*=\s*["']([^"']+)["']/gi; while ((m = x.exec(t))) add(m[1].trim(), 'id');
  x = /\bclass\s*=\s*["']([^"']+)["']/gi; while ((m = x.exec(t))) m[1].split(/\s+/).filter(Boolean).forEach((c) => add(c, 'class'));
  x = /\bname\s*=\s*["']([^"']+)["']/gi; while ((m = x.exec(t))) add(m[1].trim(), 'name');
}

function defsJsonXml(src, lang, add) {
  let m;
  if (lang === 'json') { const x = /"((?:\\.|[^"\\\n])+)"\s*:/g; while ((m = x.exec(src))) add(m[1], 'key'); }
  else { const x = /<([A-Za-z_][\w:.-]*)/g; while ((m = x.exec(src))) add(m[1], 'tag'); }
}

// definedNames(src, lang) -> [{name, kind, index}] (first place each name is defined)
export function definedNames(src, lang) {
  const seen = new Map();
  const add = (name, kind) => { if (name && !seen.has(name)) seen.set(name, { name, kind }); };
  if (lang === 'json' || lang === 'xml') { defsJsonXml(src, lang, add); return [...seen.values()]; }
  for (const seg of segments(src, lang)) {
    if (seg.lang === 'python') defsPython(seg.text, add);
    else if (seg.lang === 'javascript') defsJs(seg.text, add);
    else if (seg.lang === 'sql') defsSql(seg.text, add);
    else if (seg.lang === 'css') defsCss(seg.text, add);
    else if (seg.lang === 'html') defsHtml(seg.text, add);
  }
  return [...seen.values()];
}

// ---- Name check -------------------------------------------------------------------------
// Optimal string alignment distance (a swap of two letters counts as one change), stopping early.
export function distance(a, b, max = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}

const maxFor = (w) => (w.length >= 9 ? 2 : 1);
// A close name that is probably a different thing on purpose is not offered: names that differ
// only by digits or letter case, or where one is the other plus extra letters at an end.
function plausiblyDifferent(w, c) {
  if (w.toLowerCase() === c.toLowerCase()) return true;
  if (w.replace(/\d+/g, '') === c.replace(/\d+/g, '')) return true;
  const a = w.toLowerCase().replace(/[_-]/g, '');
  const b = c.toLowerCase().replace(/[_-]/g, '');
  if (a === b) return false;                                   // only the underscore differs: still worth a look
  // One name is the other with more at an end ("item" and "items", "item" and "item_list"): a
  // different name on purpose. A single extra letter other than "s" is more likely a slip ("totall").
  const [long, short] = a.length >= b.length ? [a, b] : [b, a];
  const extra = long.startsWith(short) ? long.slice(short.length) : long.endsWith(short) ? long.slice(0, long.length - short.length) : null;
  if (extra !== null) return extra.length >= 2 || extra === 's';
  return false;
}

// Best close match for `word` among `candidates` (an array in priority order), or null.
export function closest(word, candidates, minLen = 4) {
  if (word.length < minLen) return null;
  const max = minLen < 4 ? 1 : maxFor(word);
  let best = null;
  for (const c of candidates) {
    if (c === word || c.length < minLen || Math.abs(c.length - word.length) > max) continue;
    const d = distance(word, c, max);
    if (d < 1 || d > max || plausiblyDifferent(word, c)) continue;
    if (!best || d < best.distance) best = { name: c, distance: d };
  }
  return best;
}

const TOKEN = { python: /[A-Za-z_]\w*/g, javascript: /[A-Za-z_$][\w$]*/g, sql: /[A-Za-z_]\w*/g };

function usesIn(seg) {
  const out = [];
  const t = seg.text;
  if (seg.lang === 'css') {
    let depth = 0; let m;
    const re = /[{}]|(?:^|[;{\s])([a-z-]+)(?=\s*:)|var\(\s*(--[\w-]+)/gm;
    while ((m = re.exec(t))) {
      if (m[0] === '{') depth++;
      else if (m[0] === '}') depth = Math.max(0, depth - 1);
      else if (m[2]) out.push({ word: m[2], start: m.index + m[0].indexOf('--'), kind: 'var' });
      else if (m[1] && depth > 0 && !m[1].startsWith('--')) out.push({ word: m[1], start: m.index + m[0].lastIndexOf(m[1]), kind: 'prop' });
    }
    return out;
  }
  if (seg.lang === 'html') {
    const re = /<\/?([A-Za-z][A-Za-z0-9]*)/g; let m;
    while ((m = re.exec(t))) out.push({ word: m[1], start: m.index + m[0].length - m[1].length, kind: 'tag' });
    return out;
  }
  const re = new RegExp(TOKEN[seg.lang].source, 'g'); let m;
  while ((m = re.exec(t))) {
    const before = t.slice(Math.max(0, m.index - 6), m.index);
    let kind = 'name';
    if (/\.\s*$/.test(before) && !/\b(?:self|this)\.\s*$/.test(before)) kind = 'member';
    if (/\d$/.test(t[m.index - 1] || '')) continue;
    out.push({ word: m[0], start: m.index, kind });
  }
  return out;
}

// checkNames(src, lang, ctx) -> [{start, end, word, suggest, distance}]
// ctx: { project: [names defined in other code notes of the project], keep: [spellings you chose to keep], caret }
export function checkNames(src, lang, ctx = {}) {
  if (!CHECKED.has(lang)) return [];
  const mine = definedNames(src, lang).map((d) => d.name);
  const project = ctx.project || [];
  const builtins = BUILTINS[lang];
  const defined = new Set([...mine, ...project]);
  const keep = new Set(ctx.keep || []);
  const userList = [...new Set([...mine, ...project])];
  const fullList = [...userList, ...builtins];
  const flags = [];
  for (const seg of segments(src, lang)) {
    const nameList = seg.lang === lang ? fullList : [...userList, ...BUILTINS[seg.lang]];
    const ci = seg.lang === 'sql'; // SQL ignores letter case
    const norm = (w) => (ci ? w.toLowerCase() : w);
    const definedN = ci ? new Set([...defined].map(norm)) : defined;
    const known = (w) => definedN.has(norm(w)) || keep.has(w) || BUILTINS[seg.lang].has(norm(w)) || BUILTINS[lang].has(norm(w));
    for (const u of usesIn(seg)) {
      const end = u.start + u.word.length;
      if (known(u.word)) continue;
      if (ctx.caret != null && ctx.caret >= u.start && ctx.caret <= end) continue; // still being typed
      let list = nameList;
      if (u.kind === 'prop') list = [...CSS_PROPS];
      if (u.kind === 'var') list = userList.filter((n) => n.startsWith('--'));
      if (u.kind === 'tag') list = [...HTML_TAGS];
      if (u.kind === 'tag' && /^h[1-6]$|^[a-z]$/i.test(u.word)) continue;
      const w = u.kind === 'tag' || ci ? u.word.toLowerCase() : u.word;
      const hit = closest(w, ci ? list.map(norm) : list, u.kind === 'tag' ? 3 : 4);
      if (hit) {
        const sug = ci && u.word === u.word.toUpperCase() ? hit.name.toUpperCase() : hit.name;
        flags.push({ start: u.start, end, word: u.word, suggest: sug, distance: hit.distance });
      }
    }
  }
  return flags.sort((a, b) => a.start - b.start);
}

// ---- Autocomplete ------------------------------------------------------------------------
// Names that start with `prefix`: first the ones in this note, then the project's, then built-ins.
export function suggestNames(prefix, lang, mine, project = [], limit = 6, useBuiltins = true, builtinLang = lang) {
  if (!completes(lang) || prefix.length < 2) return [];
  const p = prefix.toLowerCase();
  const out = [];
  const seen = new Set();
  const push = (n) => { if (n !== prefix && !seen.has(n) && n.toLowerCase().startsWith(p)) { seen.add(n); out.push(n); } };
  for (const n of mine) push(n);
  for (const n of project) push(n);
  if (useBuiltins) for (const n of BUILTINS[builtinLang] || []) push(n);
  return out.slice(0, limit);
}

// Is `pos` inside a comment or string? (looked up on the masked text, so it is exact for this note)
export function inCommentOrString(src, pos, lang) {
  if (!MASKS[lang] || pos <= 0) return false;
  const a = Math.max(0, src.lastIndexOf('\n', pos - 1) - 0);
  void a;
  const masked = mask(src.slice(0, pos), lang);
  const c = src[pos - 1];
  return c !== undefined && c !== '\n' && masked[pos - 1] === ' ' && c !== ' ' && c !== '\t';
}

// ---- Outline ---------------------------------------------------------------------------
export function outline(src, lang) {
  const out = [];
  const lines = src.split('\n');
  const t = mask(src, lang).split('\n');
  if (lang === 'python') {
    const stack = [];
    t.forEach((l, i) => {
      const m = /^([ \t]*)(?:async\s+)?(def|class)\s+([A-Za-z_]\w*)/.exec(l);
      if (!m) return;
      const ind = m[1].replace(/\t/g, '    ').length;
      while (stack.length && stack[stack.length - 1] >= ind) stack.pop();
      out.push({ title: `${m[2] === 'class' ? 'class' : 'def'} ${m[3]}`, line: i + 1, level: stack.length + 1, kind: m[2] === 'class' ? 'class' : 'function' });
      stack.push(ind);
    });
  } else if (lang === 'javascript' || (lang === 'html')) {
    t.forEach((l, i) => {
      let m = /^([ \t]*)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(l);
      if (m) return out.push({ title: `function ${m[2]}`, line: i + 1, level: 1 + Math.min(2, Math.floor(m[1].length / 2)), kind: 'function' });
      m = /^([ \t]*)(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(l);
      if (m) return out.push({ title: `class ${m[2]}`, line: i + 1, level: 1, kind: 'class' });
      m = /^([ \t]*)(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.exec(l);
      if (m) return out.push({ title: `${m[2]}()`, line: i + 1, level: 1 + Math.min(2, Math.floor(m[1].length / 2)), kind: 'function' });
      m = /^([ \t]+)(?:static\s+|async\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/.exec(l);
      if (m && !NOT_METHOD.has(m[2]) && lang === 'javascript') out.push({ title: `${m[2]}()`, line: i + 1, level: 2, kind: 'method' });
    });
    if (lang === 'html') {
      const hs = [];
      lines.forEach((l, i) => {
        if (/<!--/.test(l)) return;
        let m;
        const hr = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
        while ((m = hr.exec(l))) hs.push({ title: m[2].replace(/<[^>]+>/g, '').trim() || `h${m[1]}`, line: i + 1, level: +m[1], kind: 'heading' });
        const ir = /<(?!h[1-6]\b)([a-z][\w-]*)\b[^>]*\sid\s*=\s*["']([^"']+)["']/gi;
        while ((m = ir.exec(l))) hs.push({ title: `${m[1]}#${m[2]}`, line: i + 1, level: 3, kind: 'id' });
        if (/<script\b/i.test(l)) hs.push({ title: 'script', line: i + 1, level: 2, kind: 'script' });
        if (/<style\b/i.test(l)) hs.push({ title: 'style', line: i + 1, level: 2, kind: 'style' });
      });
      return [...hs, ...out.map((o) => ({ ...o, level: Math.max(o.level, 3) }))].sort((a, b) => a.line - b.line);
    }
  } else if (lang === 'css') {
    let depth = 0;
    let sel = '';
    let selLine = 0;
    const text = mask(src, 'css');
    let line = 1;
    for (const c of text) {
      if (c === '\n') line++;
      if (c === '{') { if (depth === 0 && sel.trim()) out.push({ title: sel.trim().replace(/\s+/g, ' ').slice(0, 60), line: selLine, level: 1, kind: sel.trim().startsWith('@') ? 'at' : 'rule' }); depth++; sel = ''; }
      else if (c === '}') { depth = Math.max(0, depth - 1); sel = ''; }
      else if (depth === 0) { if (!sel.trim() && c.trim()) selLine = line; sel += c; }
    }
  } else if (lang === 'sql') {
    const text = mask(src, 'sql');
    const re = /(?:^|;)\s*((?:create|alter|drop|insert|update|delete|select|with|truncate)\b[^;\n]*)/gi;
    let m;
    while ((m = re.exec(text))) {
      const at = m.index + m[0].indexOf(m[1]);
      const line = text.slice(0, at).split('\n').length;
      out.push({ title: m[1].replace(/\s+/g, ' ').trim().slice(0, 70), line, level: 1, kind: 'statement' });
    }
  } else if (lang === 'json') {
    let depth = 0; let line = 1; const text = src; let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === '\n') line++;
      if (c === '"') {
        let j = i + 1;
        while (j < text.length && text[j] !== '"' && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
        const key = text.slice(i + 1, j);
        if (/^\s*:/.test(text.slice(j + 1, j + 40)) && depth <= 2) out.push({ title: key, line, level: Math.max(1, depth), kind: 'key' });
        i = j + 1; continue;
      }
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') depth = Math.max(0, depth - 1);
      i++;
    }
  } else if (lang === 'xml') {
    const re = /<([A-Za-z_][\w:.-]*)([^<>]*?)(\/?)>|<\/([A-Za-z_][\w:.-]*)\s*>/g; let m; let depth = 0;
    const text = mask(src, 'xml');
    while ((m = re.exec(text))) {
      if (m[4]) { depth = Math.max(0, depth - 1); continue; }
      const line = text.slice(0, m.index).split('\n').length;
      if (depth < 3) { const id = /\b(?:id|name)\s*=\s*"([^"]*)"/.exec(m[2]); out.push({ title: id ? `${m[1]} (${id[1]})` : m[1], line, level: depth + 1, kind: 'tag' }); }
      if (!m[3]) depth++;
    }
  }
  return out;
}

// ---- Find and replace --------------------------------------------------------------------
function finder(query, { matchCase = false, wholeWord = false } = {}) {
  if (!query) return null;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const src = wholeWord ? `(?<![\\w$])${esc}(?![\\w$])` : esc;
  return new RegExp(src, matchCase ? 'g' : 'gi');
}
export function findAll(text, query, opts) {
  const re = finder(query, opts);
  if (!re) return [];
  const out = [];
  let m;
  while ((m = re.exec(text))) { out.push(m.index); if (m[0].length === 0) re.lastIndex++; }
  return out;
}
export function replaceAll(text, query, repl, opts) {
  const hits = findAll(text, query, opts);
  if (!hits.length) return { value: text, count: 0 };
  let out = '';
  let at = 0;
  for (const h of hits) { out += text.slice(at, h) + repl; at = h + query.length; }
  return { value: out + text.slice(at), count: hits.length };
}
export function replaceAt(text, index, length, repl) {
  return text.slice(0, index) + repl + text.slice(index + length);
}

// ---- Project data (snippets and kept spellings) --------------------------------------------
// Copies made by two devices at the same time are folded together: the newer version of a snippet
// wins, a deleted snippet stays deleted, and the result does not depend on the order of the copies.
export function mergeProjectData(list) {
  const gone = new Set();
  const keep = new Set();
  const snips = new Map();
  for (const m of list || []) {
    for (const g of m?.gone || []) gone.add(g);
    for (const k of m?.keep || []) keep.add(k);
    for (const s of m?.snippets || []) {
      const t = snips.get(s.id);
      const newer = !t || (s.at || '') > (t.at || '') || ((s.at || '') === (t.at || '') && JSON.stringify(s) > JSON.stringify(t));
      if (newer) snips.set(s.id, s);
    }
  }
  const snippets = [...snips.values()].filter((s) => !gone.has(s.id)).sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id)));
  return { snippets, gone: [...gone].sort().slice(-500), keep: [...keep].sort().slice(0, 500) };
}
