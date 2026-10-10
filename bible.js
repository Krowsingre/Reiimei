// Reiimei Bible: the World English Bible (WEB, public domain), for reading, searching and quoting.
// The text (bible-web.json, built by tests/build-bible.py from eBible.org's files) is fetched the
// first time the Bible is opened and kept on the device in a cache of its own, so it works offline
// afterwards and app updates do not fetch it again.
import { BETA } from './channel.js';

const FILE = 'bible-web.json';
const CACHE = BETA ? 'reiimei-beta-bible' : 'reiimei-bible';
let data = null;
let loading = null;
const byId = new Map();
const alias = new Map();

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

const norm = (s) => s.toLowerCase().replace(/\./g, '').replace(/^(first|1st|i)\s+/, '1 ').replace(/^(second|2nd|ii)\s+/, '2 ').replace(/^(third|3rd|iii)\s+/, '3 ').replace(/\s+/g, ' ').trim();

function index() {
  byId.clear();
  alias.clear();
  for (const b of data.books) {
    byId.set(b.id, b);
    for (const a of [b.id, b.name, b.abbr, ...(EXTRA[b.id] || [])]) {
      const n = norm(a);
      alias.set(n, b.id);
      alias.set(n.replace(/ /g, ''), b.id);
    }
  }
}

export const loaded = () => !!data;
export async function load() {
  if (data) return data;
  if (loading) return loading;
  loading = (async () => {
    let res = null;
    try { const c = await caches.open(CACHE); res = await c.match(FILE); } catch { /* no cache storage */ }
    if (!res) {
      const fresh = await fetch(FILE, { cache: 'no-store' });
      if (!fresh.ok) throw new Error(`The Bible could not be fetched (${fresh.status}).`);
      try { const c = await caches.open(CACHE); await c.put(FILE, fresh.clone()); } catch { /* kept for this visit only */ }
      res = fresh;
    }
    data = await res.json();
    index();
    return data;
  })();
  try { return await loading; } finally { loading = null; }
}

export const books = () => (data ? data.books : []);
export const book = (id) => byId.get(id) || null;
export const NAME = 'World English Bible';
export const SHORT = 'WEB';

// A book from what was typed: an exact name or abbreviation, or the start of one name.
export function findBook(text) {
  const n = norm(text);
  if (alias.has(n)) return alias.get(n);
  if (alias.has(n.replace(/ /g, ''))) return alias.get(n.replace(/ /g, ''));
  if (n.length < 2) return null;
  const hits = data.books.filter((b) => norm(b.name).startsWith(n));
  return hits.length === 1 ? hits[0].id : null;
}

// "John 3:16", "Jn 3:16-18", "Romans 8", "1 Cor 13:4–7", "Gen 1:1-2:3", "Ps 23".
export function parseRef(text) {
  if (!data) return null;
  const m = /^\s*((?:[123]|i{1,3}|first|second|third|1st|2nd|3rd)?\s*[a-z][a-z .]*?)\s*(\d+)(?:\s*[:.]\s*(\d+))?(?:\s*[-–—]\s*(\d+)(?:\s*[:.]\s*(\d+))?)?\s*$/i.exec(text);
  if (!m) return null;
  const id = findBook(m[1]);
  if (!id) return null;
  const b = byId.get(id);
  // A book of one chapter (Jude, Philemon…): "Jude 3" is verse 3.
  if (b.c.length === 1 && !m[3] && (+m[2] > 1 || m[4])) { m[3] = m[2]; m[2] = '1'; if (m[4] && !m[5]) { /* Jude 3-5 */ } }
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

// The verses a reference covers: [{ book, c, v, text }].
export function passage(ref) {
  const b = byId.get(ref.book);
  const out = [];
  for (let c = ref.c1; c <= ref.c2; c++) {
    const ch = b.c[c - 1];
    const from = c === ref.c1 ? ref.v1 : 1;
    const to = c === ref.c2 ? ref.v2 : ch.length;
    for (let v = from; v <= to; v++) out.push({ book: ref.book, c, v, text: ch[v - 1][0] });
  }
  return out;
}

export function label(ref) {
  const b = byId.get(ref.book);
  const name = b ? b.name : ref.book;
  if (ref.whole && ref.c1 === ref.c2) return `${name} ${ref.c1}`;
  if (ref.c1 === ref.c2) return ref.v1 === ref.v2 ? `${name} ${ref.c1}:${ref.v1}` : `${name} ${ref.c1}:${ref.v1}–${ref.v2}`;
  return `${name} ${ref.c1}:${ref.v1}–${ref.c2}:${ref.v2}`;
}

// The verses (in order) that hold every word typed, or the exact words when typed in quotes.
let flat = null;
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘]/g, "'");
export function search(query, limit = 200) {
  if (!data) return { hits: [], total: 0 };
  if (!flat) {
    flat = [];
    for (const b of data.books) b.c.forEach((ch, ci) => ch.forEach((v, vi) => flat.push({ book: b.id, c: ci + 1, v: vi + 1, text: v[0], low: fold(v[0]).replace(/\s+/g, ' ') })));
  }
  const q = fold(query).trim();
  if (!q) return { hits: [], total: 0 };
  const phrase = /^".*"$/.test(q) ? q.slice(1, -1).trim() : null;
  const words = phrase ? [] : q.split(/\s+/).filter(Boolean);
  const wordRe = words.map((w) => new RegExp(`(^|[^\\p{L}\\p{N}'])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u'));
  const hits = [];
  let total = 0;
  for (const x of flat) {
    const ok = phrase ? x.low.includes(phrase) : wordRe.every((re) => re.test(x.low));
    if (!ok) continue;
    total++;
    if (hits.length < limit) hits.push(x);
  }
  return { hits, total, words: phrase ? [phrase] : words };
}
