// Reiimei Bible: public-domain translations for reading, searching and quoting. Each translation
// (built by tests/build-bible.py from eBible.org's files, text unchanged) is fetched the first time
// it is opened on a device and kept there in a cache of its own, so it works offline afterwards
// and app updates do not fetch it again.
import { BETA } from './channel.js';

export const VERSIONS = [
  { id: 'web', short: 'WEB', name: 'World English Bible', file: 'bible-web.json' },
  { id: 'kjv', short: 'KJV', name: 'King James Version', file: 'bible-kjv.json' },
  { id: 'bsb', short: 'BSB', name: 'Berean Standard Bible', file: 'bible-bsb.json' },
  { id: 'asv', short: 'ASV', name: 'American Standard Version', file: 'bible-asv.json' },
  { id: 'ylt', short: 'YLT', name: "Young's Literal Translation", file: 'bible-ylt.json' },
];
export const DEFAULT = 'web';
export const version = (id) => VERSIONS.find((v) => v.id === id) || VERSIONS[0];
const CACHE = BETA ? 'reiimei-beta-bible' : 'reiimei-bible';

const data = new Map();     // version id -> parsed file
const byId = new Map();     // version id -> Map(book id -> book)
const loading = new Map();
const alias = new Map();    // typed name -> book id (from every translation loaded)

// Other names people type for books.
const EXTRA = {
  GEN: ['gn', 'ge'], EXO: ['ex', 'exod'], LEV: ['lv', 'lev'], NUM: ['nm', 'nb'], DEU: ['dt', 'deut'], JOS: ['josh', 'jsh'], JDG: ['judg', 'jgs'], RUT: ['ru', 'rth'],
  '1SA': ['1 sam', '1sm', '1 samuel'], '2SA': ['2 sam', '2sm', '2 samuel'], '1KI': ['1 kgs', '1 kings', '1kgs'], '2KI': ['2 kgs', '2 kings', '2kgs'],
  '1CH': ['1 chr', '1 chron', '1 chronicles'], '2CH': ['2 chr', '2 chron', '2 chronicles'], EZR: ['ezra'], NEH: ['ne'], EST: ['esth'], JOB: ['jb'],
  PSA: ['ps', 'psalm', 'pss', 'psa', 'psalms'], PRO: ['prov', 'prv', 'pr'], ECC: ['eccl', 'qoh', 'ecclesiastes'], SNG: ['song', 'song of songs', 'song of solomon', 'sos', 'canticles'],
  ISA: ['is'], JER: ['jr'], LAM: ['la'], EZK: ['ezek', 'eze'], DAN: ['dn'], HOS: ['ho'], JOL: ['joel', 'jl'], AMO: ['am'], OBA: ['ob', 'obad'], JON: ['jnh', 'jonah'],
  MIC: ['mi'], NAM: ['na', 'nahum'], HAB: ['hb'], ZEP: ['zeph', 'zp'], HAG: ['hg'], ZEC: ['zech', 'zc'], MAL: ['ml'],
  MAT: ['mt', 'matt'], MRK: ['mk', 'mar', 'mark'], LUK: ['lk', 'luke'], JHN: ['jn', 'jhn', 'john'], ACT: ['acts', 'ac'], ROM: ['ro', 'rm'],
  '1CO': ['1 cor', '1 corinthians', '1co'], '2CO': ['2 cor', '2 corinthians', '2co'], GAL: ['ga'], EPH: ['ephes'], PHP: ['phil', 'php', 'philippians'], COL: ['col'],
  '1TH': ['1 thess', '1 thes', '1 thessalonians'], '2TH': ['2 thess', '2 thes', '2 thessalonians'], '1TI': ['1 tim', '1 timothy'], '2TI': ['2 tim', '2 timothy'],
  TIT: ['ti'], PHM: ['phlm', 'philem', 'philemon', 'phm'], HEB: ['he'], JAS: ['jas', 'jm', 'james'], '1PE': ['1 pet', '1 pt', '1 peter'], '2PE': ['2 pet', '2 pt', '2 peter'],
  '1JN': ['1 jn', '1 john', '1jn'], '2JN': ['2 jn', '2 john', '2jn'], '3JN': ['3 jn', '3 john', '3jn'], JUD: ['jude', 'jd'], REV: ['rv', 'rev', 'revelation', 'revelations', 'apocalypse'],
};

// Highlight colours: the rainbow (red, orange, yellow, green, blue, indigo, violet), each in a light
// and a deep tone ("red-1", "red-2"…). The five colours of v0.18.1 become the nearest light tone.
const HUES = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'];
export const HIGHLIGHTS = [1, 2].flatMap((t) => HUES.map((h) => ({ id: `${h}-${t}`, name: `${t === 1 ? 'Light' : 'Deep'} ${h}` })));
const OLD = { yellow: 'yellow-1', green: 'green-1', blue: 'blue-1', pink: 'red-1', purple: 'violet-1' };
export const hlColor = (c) => (HIGHLIGHTS.some((x) => x.id === c) ? c : OLD[c] || 'yellow-1');
export const highlightPalette = (on, attrs = '') => HIGHLIGHTS.map((x) => `<button type="button" class="hl-dot hl-${x.id}${x.id === on ? ' on' : ''}" ${attrs}data-color="${x.id}" aria-label="${x.name}" title="${x.name}" aria-pressed="${x.id === on}"></button>`).join('');

// Every book id, in Bible order (known before any translation is loaded).
export const ORDER = Object.keys(EXTRA);

const norm = (s) => s.toLowerCase().replace(/\./g, '').replace(/^(first|1st|i)\s+/, '1 ').replace(/^(second|2nd|ii)\s+/, '2 ').replace(/^(third|3rd|iii)\s+/, '3 ').replace(/\s+/g, ' ').trim();

function index(v) {
  const d = data.get(v);
  const m = new Map();
  for (const b of d.books) {
    m.set(b.id, b);
    for (const a of [b.id, b.name, b.abbr, ...(EXTRA[b.id] || [])]) {
      if (!a) continue;
      const n = norm(a);
      if (!alias.has(n)) alias.set(n, b.id);
      if (!alias.has(n.replace(/ /g, ''))) alias.set(n.replace(/ /g, ''), b.id);
    }
  }
  byId.set(v, m);
}

export const loaded = (v = DEFAULT) => data.has(v);
export const loadedVersions = () => VERSIONS.filter((x) => data.has(x.id)).map((x) => x.id);
// On this device already (fetched before), without fetching it now.
export async function stored(v) {
  if (data.has(v)) return true;
  try { return !!(await (await caches.open(CACHE)).match(version(v).file)); } catch { return false; }
}
export async function load(v = DEFAULT) {
  if (data.has(v)) return data.get(v);
  if (loading.has(v)) return loading.get(v);
  const file = version(v).file;
  const p = (async () => {
    let res = null;
    try { const c = await caches.open(CACHE); res = await c.match(file); } catch { /* no cache storage */ }
    if (!res) {
      const fresh = await fetch(file, { cache: 'no-store' });
      if (!fresh.ok) throw new Error(`${version(v).short} could not be fetched (${fresh.status}).`);
      try { const c = await caches.open(CACHE); await c.put(file, fresh.clone()); } catch { /* kept for this visit only */ }
      res = fresh;
    }
    data.set(v, await res.json());
    index(v);
    flat.delete(v);
    return data.get(v);
  })();
  loading.set(v, p);
  try { return await p; } finally { loading.delete(v); }
}

export const books = (v = DEFAULT) => (data.get(v) || data.get(loadedVersions()[0]) || { books: [] }).books;
export const book = (id, v = DEFAULT) => (byId.get(v) || byId.get(loadedVersions()[0]))?.get(id) || null;

// A book from what was typed: an exact name or abbreviation, or the start of one name.
export function findBook(text) {
  const n = norm(text);
  if (alias.has(n)) return alias.get(n);
  if (alias.has(n.replace(/ /g, ''))) return alias.get(n.replace(/ /g, ''));
  if (n.length < 2) return null;
  const hits = books().filter((b) => norm(b.name).startsWith(n));
  return hits.length === 1 ? hits[0].id : null;
}

// "John 3:16", "Jn 3:16-18", "Romans 8", "1 Cor 13:4–7", "Gen 1:1-2:3", "Ps 23", "Jude 3".
export function parseRef(text, v = DEFAULT) {
  if (!loadedVersions().length) return null;
  const m = /^\s*((?:[123]|i{1,3}|first|second|third|1st|2nd|3rd)?\s*[a-z][a-z .]*?)\s*(\d+)(?:\s*[:.]\s*(\d+))?(?:\s*[-–—]\s*(\d+)(?:\s*[:.]\s*(\d+))?)?\s*$/i.exec(text);
  if (!m) return null;
  const id = findBook(m[1]);
  if (!id) return null;
  const b = book(id, v);
  if (!b) return null;
  // A book of one chapter (Jude, Philemon…): "Jude 3" is verse 3.
  if (b.c.length === 1 && !m[3] && (+m[2] > 1 || m[4])) { m[3] = m[2]; m[2] = '1'; }
  const c1 = +m[2];
  if (c1 < 1 || c1 > b.c.length) return null;
  let v1 = m[3] ? +m[3] : null;
  let c2 = c1;
  let v2 = v1;
  if (m[4]) {
    if (m[5]) { c2 = +m[4]; v2 = +m[5]; } else if (v1 != null) v2 = +m[4]; else { c2 = +m[4]; }
  }
  if (c2 < c1 || c2 > b.c.length) return null;
  if (v1 == null) { v1 = 1; v2 = b.c[c2 - 1].length; }
  v1 = Math.max(1, Math.min(v1, b.c[c1 - 1].length));
  v2 = Math.max(1, Math.min(v2, b.c[c2 - 1].length));
  if (c2 === c1 && v2 < v1) return null;
  return { book: id, c1, v1, c2, v2, whole: !m[3] };
}

// The verses a reference covers in one translation: [{ book, c, v, text }].
export function passage(ref, v = DEFAULT) {
  const b = book(ref.book, v);
  const out = [];
  if (!b) return out;
  for (let c = ref.c1; c <= ref.c2; c++) {
    const ch = b.c[c - 1] || [];
    const from = c === ref.c1 ? ref.v1 : 1;
    const to = c === ref.c2 ? ref.v2 : ch.length;
    for (let x = from; x <= to; x++) out.push({ book: ref.book, c, v: x, text: ch[x - 1] ? ch[x - 1][0] : '' });
  }
  return out;
}

export function label(ref, v = DEFAULT) {
  const b = book(ref.book, v);
  const name = b ? b.name : ref.book;
  if (ref.whole && ref.c1 === ref.c2) return `${name} ${ref.c1}`;
  if (ref.c1 === ref.c2) return ref.v1 === ref.v2 ? `${name} ${ref.c1}:${ref.v1}` : `${name} ${ref.c1}:${ref.v1}–${ref.v2}`;
  return `${name} ${ref.c1}:${ref.v1}–${ref.c2}:${ref.v2}`;
}

// Finding words in every translation on the device. A verse matches when it holds every word typed
// (or the exact words, typed in quotes), in any translation; each hit says which ones matched.
// When nothing matches every word, the verses holding the most of them come back, best first.
const flat = new Map();
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ');
function verses(v) {
  if (!flat.has(v)) {
    const list = [];
    for (const b of data.get(v).books) b.c.forEach((ch, ci) => ch.forEach((x, vi) => { if (x[0]) list.push([`${b.id}:${ci + 1}:${vi + 1}`, fold(x[0])]); }));
    flat.set(v, list);
  }
  return flat.get(v);
}
const STOP = new Set(['the', 'and', 'of', 'a', 'to', 'in', 'i', 'is', 'that', 'it', 'for', 'be', 'on', 'not', 'my', 'me', 'he', 'his', 'shall', 'will', 'you', 'your', 'with', 'as', 'all', 'they', 'them', 'was', 'are', 'by', 'unto', 'thee', 'thou', 'thy', 'ye', 'o', 'an', 'but', 'or', 'from', 'at', 'so']);
export function search(query, { versions = loadedVersions(), limit = 200 } = {}) {
  const q = fold(query).trim();
  if (!q || !versions.length) return { hits: [], total: 0, words: [], close: false };
  const phrase = /^".*"$/.test(q) ? q.slice(1, -1).trim() : null;
  const words = phrase ? [] : q.split(' ').filter(Boolean);
  const res = words.map((w) => new RegExp(`(^|[^\\p{L}\\p{N}'])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u'));
  const found = new Map(); // key -> Set(version)
  for (const v of versions) {
    for (const [k, low] of verses(v)) {
      if (phrase ? low.includes(phrase) : res.every((re) => re.test(low))) {
        if (!found.has(k)) found.set(k, new Set());
        found.get(k).add(v);
      }
    }
  }
  let close = false;
  let keys = [...found.keys()];
  if (!keys.length && words.length > 1) {
    // The verses that hold the most of the words (the small, common words do not count on their own).
    close = true;
    const key = words.filter((w) => !STOP.has(w));
    const need = Math.max(1, Math.ceil(key.length * 0.6));
    const keyRes = key.map((w) => new RegExp(`(^|[^\\p{L}\\p{N}'])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u'));
    const score = new Map();
    for (const v of versions) {
      for (const [k, low] of verses(v)) {
        const n = keyRes.reduce((s, re) => s + (re.test(low) ? 1 : 0), 0);
        const all = res.reduce((s, re) => s + (re.test(low) ? 1 : 0), 0);
        if (n >= need && n > 0) {
          const sc = n * 10 + all;
          if (!score.has(k) || score.get(k) < sc) score.set(k, sc);
          if (!found.has(k)) found.set(k, new Set());
          found.get(k).add(v);
        }
      }
    }
    keys = [...score.keys()].sort((a, b) => score.get(b) - score.get(a));
  }
  const order = new Map(books().map((b, i) => [b.id, i]));
  if (!close) keys.sort((a, b) => { const [ab, ac, av] = a.split(':'); const [bb, bc, bv] = b.split(':'); return order.get(ab) - order.get(bb) || ac - bc || av - bv; });
  const hits = keys.slice(0, limit).map((k) => { const [b, c, v] = k.split(':'); return { book: b, c: +c, v: +v, in: [...found.get(k)] }; });
  return { hits, total: keys.length, words: phrase ? [phrase] : words, close };
}

// ---- Concordance: every word of a translation, how often it is used, and where -------------
// Built on the device from the translation's own text (nothing more is fetched).
const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
const wordKey = (w) => w.toLowerCase().replace(/’/g, "'");
const conc = new Map(); // version -> Map(word -> [keys "book:c:v", one per use])
function concordanceOf(v) {
  if (!conc.has(v)) {
    const m = new Map();
    for (const b of data.get(v).books) b.c.forEach((ch, ci) => ch.forEach((x, vi) => {
      if (!x[0]) return;
      const k = `${b.id}:${ci + 1}:${vi + 1}`;
      for (const w of x[0].match(WORD) || []) {
        const key = wordKey(w);
        let list = m.get(key);
        if (!list) { list = []; m.set(key, list); }
        list.push(k);
      }
    }));
    conc.set(v, m);
  }
  return conc.get(v);
}
// The words starting with some letters, with how many times each is used: [[word, count]].
export function words(prefix = '', v = DEFAULT) {
  if (!data.has(v)) return [];
  const p = wordKey(prefix.trim());
  return [...concordanceOf(v).entries()].filter(([w]) => w.startsWith(p)).map(([w, l]) => [w, l.length]).sort((a, b) => a[0].localeCompare(b[0]));
}
// One word: how many times it is used, in how many verses, by book, and the verses (in Bible order).
export function concordance(word, v = DEFAULT) {
  const list = data.has(v) ? concordanceOf(v).get(wordKey(word.trim())) || [] : [];
  const verses = [...new Set(list)];
  const byBook = new Map();
  for (const k of list) { const b = k.split(':')[0]; byBook.set(b, (byBook.get(b) || 0) + 1); }
  return {
    word: wordKey(word.trim()),
    uses: list.length,
    books: [...byBook.entries()].map(([book, count]) => ({ book, count })),
    hits: verses.map((k) => { const [b, c, x] = k.split(':'); return { book: b, c: +c, v: +x }; }),
  };
}

// ---- Strong's numbers -----------------------------------------------------------------
// The KJV's words carry the number of the Hebrew or Greek word they translate (bible-kjv-strongs.json),
// and Strong's dictionary (strongs.json) says what each word means. Both are fetched the first time
// they are used and kept on the device, like the translations.
const extra = new Map();
async function fetchKept(file) {
  if (extra.has(file)) return extra.get(file);
  const p = (async () => {
    let res = null;
    try { const c = await caches.open(CACHE); res = await c.match(file); } catch { /* no cache storage */ }
    if (!res) {
      const fresh = await fetch(file, { cache: 'no-store' });
      if (!fresh.ok) throw new Error(`${file} could not be fetched (${fresh.status}).`);
      try { const c = await caches.open(CACHE); await c.put(file, fresh.clone()); } catch { /* kept for this visit only */ }
      res = fresh;
    }
    return res.json();
  })();
  extra.set(file, p);
  try { return await p; } catch (e) { extra.delete(file); throw e; }
}
let tagData = null;
let dict = null;
export const strongsReady = () => !!(tagData && dict);
export async function loadStrongs() {
  if (strongsReady()) return;
  const [t, d] = await Promise.all([fetchKept('bible-kjv-strongs.json'), fetchKept('strongs.json')]);
  tagData = t;
  dict = d;
}
const isNT = (bookId) => ORDER.indexOf(bookId) >= 39;
// The KJV words of a verse that carry numbers: [{ at, len, nums: ['G25'] }] (positions in the KJV text).
export function strongsOf(bookId, c, v) {
  const s = tagData?.b?.[bookId]?.[c - 1]?.[v - 1];
  if (!s) return [];
  const out = [];
  let cur = 0;
  const letter = isNT(bookId) ? 'G' : 'H';
  for (const part of s.split(' ')) {
    const [d, l, n] = part.split('.');
    const at = cur + +d;
    out.push({ at, len: +l, nums: n.split('+').map((x) => (/^[HG]/.test(x) ? x : letter + x)) });
    cur = at + +l;
  }
  return out;
}
// A number's dictionary entry.
export function strongsEntry(num) {
  const m = /^([HG])0*(\d+)$/.exec(num || '');
  const e = m && dict?.[m[1]]?.[m[2]];
  if (!e) return null;
  return { num: m[1] + m[2], lang: m[1] === 'H' ? 'Hebrew' : 'Greek', word: e[0], translit: e[1], pron: e[2], meaning: e[3], use: e[4] };
}
// Every KJV verse that uses a number, and the English words it is translated by (with how often).
let byNum = null;
export function strongsUses(num) {
  if (!byNum) {
    byNum = new Map();
    const kjv = data.get('kjv');
    for (const [bookId, chs] of Object.entries(tagData?.b || {})) chs.forEach((vs, ci) => vs.forEach((s, vi) => {
      if (!s) return;
      const text = kjv ? book(bookId, 'kjv')?.c[ci]?.[vi]?.[0] || '' : '';
      for (const t of strongsOf(bookId, ci + 1, vi + 1)) for (const n of t.nums) {
        let e = byNum.get(n);
        if (!e) { e = { keys: [], words: new Map() }; byNum.set(n, e); }
        const k = `${bookId}:${ci + 1}:${vi + 1}`;
        if (e.keys[e.keys.length - 1] !== k) e.keys.push(k);
        if (text) { const w = text.slice(t.at, t.at + t.len).toLowerCase(); e.words.set(w, (e.words.get(w) || 0) + 1); }
      }
    }));
  }
  const e = byNum.get(num);
  if (!e) return { verses: [], words: [] };
  return {
    verses: e.keys.map((k) => { const [b, c, v] = k.split(':'); return { book: b, c: +c, v: +v }; }),
    words: [...e.words.entries()].sort((a, b) => b[1] - a[1]),
  };
}
// The numbers behind an English word in the KJV, most used first: [[num, count]].
export function strongsForWord(word) {
  const w = wordKey(word.trim());
  const count = new Map();
  for (const [bookId, chs] of Object.entries(tagData?.b || {})) chs.forEach((vs, ci) => vs.forEach((s, vi) => {
    if (!s) return;
    const text = book(bookId, 'kjv')?.c[ci]?.[vi]?.[0] || '';
    for (const t of strongsOf(bookId, ci + 1, vi + 1)) {
      const words = (text.slice(t.at, t.at + t.len).match(WORD) || []).map(wordKey);
      if (words.includes(w)) for (const n of t.nums) count.set(n, (count.get(n) || 0) + 1);
    }
  }));
  return [...count.entries()].sort((a, b) => b[1] - a[1]);
}

// A web search for words, on the service chosen in Settings.
export const SEARCH_SITES = [
  { id: 'biblegateway', name: 'Bible Gateway', url: (q) => `https://www.biblegateway.com/quicksearch/?quicksearch=${encodeURIComponent(q)}` },
  { id: 'google', name: 'Google', url: (q) => `https://www.google.com/search?q=${encodeURIComponent(`${q} Bible verse`)}` },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: (q) => `https://duckduckgo.com/?q=${encodeURIComponent(`${q} Bible verse`)}` },
  { id: 'bing', name: 'Bing', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(`${q} Bible verse`)}` },
  { id: 'yahoo', name: 'Yahoo', url: (q) => `https://search.yahoo.com/search?p=${encodeURIComponent(`${q} Bible verse`)}` },
  { id: 'brave', name: 'Brave Search', url: (q) => `https://search.brave.com/search?q=${encodeURIComponent(`${q} Bible verse`)}` },
  { id: 'ecosia', name: 'Ecosia', url: (q) => `https://www.ecosia.org/search?q=${encodeURIComponent(`${q} Bible verse`)}` },
  { id: 'startpage', name: 'Startpage', url: (q) => `https://www.startpage.com/do/search?q=${encodeURIComponent(`${q} Bible verse`)}` },
];
export const searchSite = (id) => SEARCH_SITES.find((s) => s.id === id) || SEARCH_SITES[0];
