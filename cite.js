// Reiimei citations: MLA 9th edition and APA 7th edition.
// Sources are stored as structured data, and every citation is generated from
// that data at display time. Switching a note between MLA and APA therefore
// never changes or loses anything that was entered.
//
// Output is an array of runs: [{text, italic}], so it can become HTML,
// Markdown, Populi markup, or a Word document.

export const STYLES = { mla: 'MLA 9', apa: 'APA 7' };

export const SOURCE_TYPES = {
  book: 'Book',
  chapter: 'Chapter in an edited book',
  article: 'Journal article',
  webpage: 'Web page',
};

const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---- Small text helpers -------------------------------------------------
const clean = (s) => String(s ?? '').trim();
const stripBraces = (s) => clean(s).replace(/[{}]/g, '');
const endsWithPunct = (s) => /[.?!]$/.test(s);
const withPeriod = (s) => (s && !endsWithPunct(s) ? `${s}.` : s);
const R = (text, italic = false) => ({ text, italic });

function joinRuns(parts) {
  // Merge adjacent runs with the same styling.
  const out = [];
  for (const p of parts.flat()) {
    if (!p || !p.text) continue;
    const last = out[out.length - 1];
    if (last && last.italic === !!p.italic) last.text += p.text;
    else out.push({ text: p.text, italic: !!p.italic });
  }
  return out;
}
export const runsToText = (runs) => runs.map((r) => r.text).join('');

const MINOR = new Set(('a an the and but or nor for so yet as at by from in into like near of off on onto out over past ' +
  'to up upon with via than per vs').split(' '));

// MLA title case: capitalize principal words; {braced} text is left exactly as typed.
export function titleCase(input, style = 'mla') {
  const s = clean(input);
  if (!s) return '';
  const tokens = s.match(/\{[^}]*\}|[^\s{}]+|\s+/g) || [];
  const words = tokens.filter((t) => !/^\s+$/.test(t));
  let wi = 0;
  let afterColon = false;
  return tokens.map((t) => {
    if (/^\s+$/.test(t)) return t;
    const idx = wi++;
    const first = idx === 0 || afterColon;
    const last = idx === words.length - 1;
    afterColon = /[:?!]$|—$/.test(t);
    if (t.startsWith('{')) return t.slice(1, -1);
    return t.split('-').map((part, pi) => {
      const m = /^([^\p{L}]*)(\p{L}[\p{L}'’]*)(.*)$/u.exec(part);
      if (!m) return part;
      const [, pre, word, post] = m;
      const lower = word.toLowerCase();
      if (/\p{Lu}/u.test(word.slice(1))) return part; // iPhone, McGraw, NASA
      // APA capitalizes every word of four or more letters; MLA lowercases all minor words.
      const minor = MINOR.has(lower) && (style !== 'apa' || lower.length <= 3);
      if (minor && !(first && pi === 0) && !last) return pre + lower + post;
      return pre + word[0].toUpperCase() + word.slice(1) + post;
    }).join('-');
  }).join('');
}

// APA sentence case: first word, first word after a colon, and {braced} text
// keep capitals; acronyms and words with inner capitals (iPhone) are kept.
export function sentenceCase(input) {
  const s = clean(input);
  if (!s) return '';
  const tokens = s.match(/\{[^}]*\}|[^\s{}]+|\s+/g) || [];
  let first = true;
  return tokens.map((t) => {
    if (/^\s+$/.test(t)) return t;
    if (t.startsWith('{')) { first = false; return t.slice(1, -1); }
    const isFirst = first;
    first = /[:?!]$|—$/.test(t) || t === '-' || t === '–';
    return t.split('-').map((part, pi) => {
      const m = /^([^\p{L}]*)(\p{L}[\p{L}'’]*)(.*)$/u.exec(part);
      if (!m) return part;
      const [, pre, word, post] = m;
      if (word === 'I' || /\p{Lu}/u.test(word.slice(1))) return part;
      if (isFirst && pi === 0) return pre + word[0].toUpperCase() + word.slice(1).toLowerCase() + post;
      return pre + word.toLowerCase() + post;
    }).join('-');
  }).join('');
}

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
}
function editionText(ed, style) {
  const e = clean(ed);
  if (!e) return '';
  if (/^\d+$/.test(e)) return `${ordinal(+e)} ed.`;
  if (/^\d+(st|nd|rd|th)$/i.test(e)) return `${e.toLowerCase()} ed.`;
  if (/\bed\.?$/i.test(e)) return e.replace(/\bed$/i, 'ed.');
  if (style === 'apa' && /^revised$/i.test(e)) return 'Rev. ed.';
  return `${e} ed.`;
}

function parsePages(p) {
  const s = clean(p).replace(/\s+/g, '');
  const m = /^([A-Za-z]?\d+)[-–—]+([A-Za-z]?\d+)$/.exec(s);
  return m ? { start: m[1], end: m[2] } : s ? { start: s, end: '' } : null;
}
// MLA: give the second number only through two digits when the hundreds match (225-50).
function mlaRange(start, end) {
  if (!end) return start;
  if (/^\d+$/.test(start) && /^\d+$/.test(end) && +start >= 100 && start.length === end.length) {
    const lead = start.length - 2;
    if (start.slice(0, lead) === end.slice(0, lead)) return `${start}-${end.slice(lead)}`;
  }
  return `${start}-${end}`;
}
function mlaPages(p) {
  const r = parsePages(p);
  if (!r) return '';
  return r.end ? `pp. ${mlaRange(r.start, r.end)}` : `p. ${r.start}`;
}
const apaRange = (p) => { const r = parsePages(p); return r ? (r.end ? `${r.start}–${r.end}` : r.start) : ''; };

function doiUrl(doi) {
  const d = clean(doi).replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return d ? `https://doi.org/${d}` : '';
}
const stripProtocol = (u) => clean(u).replace(/^https?:\/\//i, '');

// ---- People ------------------------------------------------------------
export function initials(given) {
  return clean(given).split(/\s+/).filter(Boolean).map((part) =>
    part.split('-').map((p) => {
      const letters = p.replace(/\./g, '');
      if (!letters) return '';
      // "J.M." typed together becomes "J. M."
      if (/^\p{Lu}+$/u.test(letters) && letters.length <= 3 && p.includes('.')) return letters.split('').map((c) => `${c}.`).join(' ');
      return `${letters[0].toUpperCase()}.`;
    }).join('-')).join(' ');
}

const people = (list) => (list || []).filter((p) => clean(p.family) || clean(p.given));
export const hasAuthor = (s) => !!(clean(s.org) || people(s.authors).length);

function firstAuthorFamily(s) {
  if (clean(s.org)) return stripBraces(s.org);
  const a = people(s.authors)[0];
  return a ? stripBraces(a.family || a.given) : '';
}

function mlaAuthors(s) {
  if (clean(s.org)) {
    // MLA: when the organization is also the publisher, begin with the title instead.
    if (clean(s.publisher) && clean(s.publisher).toLowerCase() === clean(s.org).toLowerCase()) return '';
    return stripBraces(s.org);
  }
  const a = people(s.authors);
  const inv = (p) => [clean(p.family), clean(p.given)].filter(Boolean).join(', ');
  const nat = (p) => [clean(p.given), clean(p.family)].filter(Boolean).join(' ');
  if (!a.length) return '';
  if (a.length === 1) return inv(a[0]);
  if (a.length === 2) return `${inv(a[0])}, and ${nat(a[1])}`;
  return `${inv(a[0])}, et al.`;
}

function apaName(p) {
  const fam = clean(p.family);
  const ini = initials(p.given);
  return fam && ini ? `${fam}, ${ini}` : fam || ini;
}
function apaAuthors(s) {
  if (clean(s.org)) return stripBraces(s.org);
  const a = people(s.authors).map(apaName);
  if (!a.length) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]}, & ${a[1]}`;
  if (a.length <= 20) return `${a.slice(0, -1).join(', ')}, & ${a[a.length - 1]}`;
  return `${a.slice(0, 19).join(', ')}, . . . ${a[a.length - 1]}`;
}

function mlaEditors(list) {
  const e = people(list).map((p) => [clean(p.given), clean(p.family)].filter(Boolean).join(' '));
  if (!e.length) return '';
  if (e.length === 1) return `edited by ${e[0]}`;
  if (e.length === 2) return `edited by ${e[0]} and ${e[1]}`;
  return `edited by ${e[0]} et al.`;
}
function apaEditors(list) {
  const e = people(list).map((p) => [initials(p.given), clean(p.family)].filter(Boolean).join(' '));
  if (!e.length) return '';
  const names = e.length === 1 ? e[0] : e.length === 2 ? `${e[0]} & ${e[1]}` : `${e.slice(0, -1).join(', ')}, & ${e[e.length - 1]}`;
  return `${names} (${e.length === 1 ? 'Ed.' : 'Eds.'})`;
}

// ---- Dates -------------------------------------------------------------
function mlaDate(s) {
  const y = clean(s.year);
  const m = +s.month;
  const d = +s.day;
  if (!y) return '';
  if (m >= 1 && m <= 12) return d ? `${d} ${MLA_MONTHS[m - 1]} ${y}` : `${MLA_MONTHS[m - 1]} ${y}`;
  return y;
}
function mlaIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso));
  return m ? `${+m[3]} ${MLA_MONTHS[+m[2] - 1]} ${m[1]}` : clean(iso);
}
function apaIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso));
  return m ? `${FULL_MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : clean(iso);
}
export const formatPaperDate = (iso, style) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(iso));
  if (!m) return clean(iso);
  return style === 'mla' ? `${+m[3]} ${FULL_MONTHS[+m[2] - 1]} ${m[1]}` : `${FULL_MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
};

// ---- MLA works-cited entries -----------------------------------------
function mlaTitleQuoted(title) {
  const t = titleCase(title);
  return endsWithPunct(t) ? `“${t}”` : `“${t}.”`;
}

function mlaEntry(s, authorOverride) {
  const author = authorOverride ?? mlaAuthors(s);
  const parts = [];
  if (author) parts.push(R(withPeriod(author) + ' '));
  const container = []; // list of run-arrays joined with ", "
  const add = (...runs) => { const r = runs.filter((x) => x && x.text); if (r.length) container.push(r); };
  const doi = doiUrl(s.doi);
  const loc = doi || stripProtocol(s.url);

  switch (s.type) {
    case 'book': {
      const t = titleCase(s.title);
      parts.push(R(t, true), R(endsWithPunct(t) ? ' ' : '. '));
      add(R(editionText(s.edition, 'mla')));
      add(R(clean(s.publisher)));
      add(R(mlaDate(s)));
      add(R(loc));
      break;
    }
    case 'chapter': {
      parts.push(R(mlaTitleQuoted(s.title) + ' '));
      add(R(titleCase(s.bookTitle), true));
      add(R(mlaEditors(s.editors)));
      add(R(editionText(s.edition, 'mla')));
      add(R(clean(s.publisher)));
      add(R(mlaDate(s)));
      add(R(mlaPages(s.pages)));
      add(R(loc));
      break;
    }
    case 'article': {
      parts.push(R(mlaTitleQuoted(s.title) + ' '));
      add(R(titleCase(s.journal), true));
      add(R(clean(s.volume) ? `vol. ${clean(s.volume)}` : ''));
      add(R(clean(s.issue) ? `no. ${clean(s.issue)}` : ''));
      add(R(mlaDate(s)));
      add(R(mlaPages(s.pages)));
      add(R(loc));
      break;
    }
    case 'webpage':
    default: {
      parts.push(R(mlaTitleQuoted(s.title) + ' '));
      const site = clean(s.site);
      if (site && site.toLowerCase() !== stripBraces(s.title).toLowerCase()) add(R(titleCase(site), true));
      if (clean(s.publisher) && clean(s.publisher).toLowerCase() !== site.toLowerCase()) add(R(clean(s.publisher)));
      add(R(mlaDate(s)));
      add(R(loc));
      break;
    }
  }
  container.forEach((c, k) => {
    parts.push(...c);
    parts.push(R(k < container.length - 1 ? ', ' : ''));
  });
  let runs = joinRuns(parts);
  // End the container with a period.
  const last = runs[runs.length - 1];
  if (last) {
    last.text = last.text.replace(/\s+$/, '');
    if (!endsWithPunct(last.text) && !/[”"]$/.test(last.text)) runs.push(R('.'));
  }
  if (s.type === 'webpage' && clean(s.accessed)) {
    runs.push(R(` Accessed ${mlaIsoDate(s.accessed)}.`));
  }
  return joinRuns(runs);
}

// ---- APA reference entries --------------------------------------------
function apaYear(s, suffix = '') {
  const y = clean(s.year);
  if (!y) return `n.d.${suffix ? `-${suffix}` : ''}`;
  return y + suffix;
}
function apaDatePart(s, suffix) {
  const y = apaYear(s, suffix);
  if (s.type === 'webpage' && clean(s.year) && +s.month >= 1) {
    return `(${y}, ${FULL_MONTHS[+s.month - 1]}${+s.day ? ` ${+s.day}` : ''}).`;
  }
  return `(${y}).`;
}

function apaEntry(s, suffix = '') {
  const author = apaAuthors(s);
  const date = apaDatePart(s, suffix);
  const doi = doiUrl(s.doi);
  const link = doi || clean(s.url);
  const parts = [];
  // A work with no author moves its title into the author position.
  const titleRuns = [];
  const ed = editionText(s.edition, 'apa');
  switch (s.type) {
    case 'book': {
      const t = sentenceCase(s.title);
      titleRuns.push(R(t, true));
      if (ed) titleRuns.push(R(` (${ed})`));
      break;
    }
    case 'webpage': titleRuns.push(R(sentenceCase(s.title), true)); break;
    default: titleRuns.push(R(sentenceCase(s.title)));
  }
  const titleEnd = () => { const t = runsToText(titleRuns); return endsWithPunct(t) ? ' ' : '. '; };

  if (author) {
    parts.push(R(withPeriod(author) + ' '), R(date + ' '), ...titleRuns, R(titleEnd()));
  } else {
    parts.push(...titleRuns, R(titleEnd()), R(date + ' '));
  }

  switch (s.type) {
    case 'book': {
      const pub = clean(s.publisher);
      if (pub && pub.toLowerCase() !== clean(s.org).toLowerCase()) parts.push(R(withPeriod(pub) + ' '));
      break;
    }
    case 'chapter': {
      const eds = apaEditors(s.editors);
      const inner = [ed, apaRange(s.pages) && `pp. ${apaRange(s.pages)}`].filter(Boolean).join(', ');
      parts.push(R(`In ${eds ? `${eds}, ` : ''}`), R(sentenceCase(s.bookTitle), true), R(inner ? ` (${inner}). ` : '. '));
      if (clean(s.publisher)) parts.push(R(withPeriod(clean(s.publisher)) + ' '));
      break;
    }
    case 'article': {
      parts.push(R(titleCase(s.journal, 'apa'), true));
      if (clean(s.volume)) parts.push(R(', '), R(clean(s.volume), true));
      if (clean(s.issue)) parts.push(R(`(${clean(s.issue)})`));
      if (apaRange(s.pages)) parts.push(R(`, ${apaRange(s.pages)}`));
      parts.push(R('. '));
      break;
    }
    case 'webpage':
    default: {
      const site = clean(s.site);
      if (site && site.toLowerCase() !== clean(s.org).toLowerCase()) parts.push(R(withPeriod(site) + ' '));
      if (!clean(s.year) && clean(s.accessed) && link) {
        parts.push(R(`Retrieved ${apaIsoDate(s.accessed)}, from ${link}`));
        return joinRuns(parts);
      }
      break;
    }
  }
  if (link) parts.push(R(link));
  const runs = joinRuns(parts);
  const last = runs[runs.length - 1];
  if (last) last.text = last.text.replace(/\s+$/, '');
  return runs;
}

// ---- Sorting, disambiguation, and the reference list -------------------
const sortKey = (str) => stripBraces(str).toLowerCase().replace(/^(a|an|the)\s+/, '').replace(/[^\p{L}\p{N} ]/gu, '');

function mlaSortKey(s) {
  return sortKey(mlaAuthors(s) || s.title) + ' ' + sortKey(s.title);
}
function apaAuthorKey(s) {
  return clean(s.org) ? stripBraces(s.org).toLowerCase() : people(s.authors).map((p) => `${clean(p.family)} ${initials(p.given)}`.toLowerCase()).join('|');
}

// APA: same author(s) and same year get a, b, c (ordered by title).
export function apaSuffixes(sources) {
  const groups = new Map();
  for (const s of sources) {
    if (!hasAuthor(s)) continue;
    const k = `${apaAuthorKey(s)}::${clean(s.year) || 'n.d.'}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const out = new Map();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => sortKey(a.title).localeCompare(sortKey(b.title)));
    list.forEach((s, k) => out.set(s.id, String.fromCharCode(97 + k)));
  }
  return out;
}

export function referenceList(sources, style) {
  const list = (sources || []).filter((s) => clean(s.title) || hasAuthor(s));
  if (style === 'mla') {
    const sorted = [...list].sort((a, b) => mlaSortKey(a).localeCompare(mlaSortKey(b)));
    let prevAuthor = null;
    return sorted.map((s) => {
      const author = mlaAuthors(s);
      // MLA: repeat authors are replaced by three hyphens.
      const same = author && author === prevAuthor;
      prevAuthor = author;
      return { id: s.id, runs: mlaEntry(s, same ? '---' : undefined) };
    });
  }
  const suffix = apaSuffixes(list);
  const sorted = [...list].sort((a, b) => {
    const ka = hasAuthor(a) ? apaAuthorKey(a) : sortKey(a.title);
    const kb = hasAuthor(b) ? apaAuthorKey(b) : sortKey(b.title);
    if (ka !== kb) return ka.localeCompare(kb);
    // Same author: no date first, then by year, then by suffix letter.
    const ya = clean(a.year) ? +a.year : -1;
    const yb = clean(b.year) ? +b.year : -1;
    if (ya !== yb) return ya - yb;
    return (suffix.get(a.id) || '').localeCompare(suffix.get(b.id) || '');
  });
  return sorted.map((s) => ({ id: s.id, runs: apaEntry(s, suffix.get(s.id) || '') }));
}

export const referenceHeading = (style) => (style === 'mla' ? 'Works Cited' : 'References');
export const formatReference = (s, style, sources = [s]) =>
  style === 'mla' ? mlaEntry(s) : apaEntry(s, apaSuffixes(sources).get(s.id) || '');

// ---- In-text citations -------------------------------------------------
// Token syntax in a note: [@key], [@key, 42], [@key, pp. 4-5], [@key, para. 3],
// several at once with ";": [@smith2020, 12; @lee2019]. Narrative: @key
export function parseCiteToken(raw) {
  return String(raw).split(';').map((part) => {
    const m = /^\s*@([\w:-]+)\s*(?:,\s*(.*))?$/.exec(part);
    return m ? { key: m[1], locator: clean(m[2]) } : null;
  }).filter(Boolean);
}

function shortTitle(s, style) {
  const t = clean(s.title).split(/[:.?!]/)[0].trim();
  const words = t.split(/\s+/);
  return titleCase(words.length > 5 ? words.slice(0, 4).join(' ') : t, style);
}
function titleRunsForInText(s, style) {
  const t = shortTitle(s, style);
  const italic = s.type === 'book' || (style === 'apa' && s.type === 'webpage');
  return italic ? [R(t, true)] : [R(`“${t}”`)];
}

function mlaLocator(loc) {
  if (!loc) return '';
  const l = loc.replace(/^pp?\.\s*/i, '');
  const para = /^(para|par|paras|pars)\.?\s*(.+)$/i.exec(l);
  if (para) return `, par. ${para[2]}`;
  const r = parsePages(l);
  if (r && /^\d/.test(r.start)) return ` ${mlaRange(r.start, r.end)}`;
  return `, ${l}`;
}
function apaLocator(loc) {
  if (!loc) return '';
  const l = loc.replace(/^pp?\.\s*/i, '');
  const para = /^(para|par|paras|pars)\.?\s*(.+)$/i.exec(l);
  if (para) return `, para. ${para[2]}`;
  const r = parsePages(l);
  if (r && /^\d/.test(r.start)) return r.end ? `, pp. ${r.start}–${r.end}` : `, p. ${r.start}`;
  return `, ${l}`;
}

function inTextAuthor(s, style, narrative) {
  if (clean(s.org)) return stripBraces(s.org);
  const a = people(s.authors).map((p) => clean(p.family) || clean(p.given));
  if (!a.length) return '';
  if (a.length === 1) return a[0];
  if (a.length === 2) return style === 'apa' && !narrative ? `${a[0]} & ${a[1]}` : `${a[0]} and ${a[1]}`;
  return `${a[0]} et al.`;
}

export function makeCiter(sources, style) {
  const byKey = new Map((sources || []).map((s) => [s.key, s]));
  const suffix = style === 'apa' ? apaSuffixes(sources || []) : new Map();
  const familyCount = new Map();
  (sources || []).forEach((s) => { const f = firstAuthorFamily(s); if (f) familyCount.set(f, (familyCount.get(f) || 0) + 1); });

  function one(item) {
    const s = byKey.get(item.key);
    if (!s) return null;
    const author = inTextAuthor(s, style, false);
    if (style === 'mla') {
      const runs = [];
      if (author) {
        runs.push(R(author));
        // Two works by the same author: add a short title.
        if (familyCount.get(firstAuthorFamily(s)) > 1) runs.push(R(', '), ...titleRunsForInText(s, style));
      } else {
        runs.push(...titleRunsForInText(s, style));
      }
      runs.push(R(mlaLocator(item.locator)));
      return { sortBy: author || s.title, runs };
    }
    const year = apaYear(s, suffix.get(s.id) || '');
    const runs = author ? [R(author)] : titleRunsForInText(s, style);
    runs.push(R(`, ${year}`), R(apaLocator(item.locator)));
    return { sortBy: author || s.title, runs };
  }

  return {
    // Parenthetical citation from a token's inner text, or null if a key is unknown.
    cite(raw) {
      const items = parseCiteToken(raw).map(one);
      if (!items.length || items.some((x) => !x)) return null;
      if (style === 'apa') items.sort((a, b) => sortKey(a.sortBy).localeCompare(sortKey(b.sortBy)));
      const runs = [R('(')];
      items.forEach((it, k) => { if (k) runs.push(R('; ')); runs.push(...it.runs); });
      runs.push(R(')'));
      return joinRuns(runs);
    },
    // Narrative citation, e.g. "Smith and Lee (2020)" in APA or "Smith and Lee" in MLA.
    ncite(key) {
      const s = byKey.get(key);
      if (!s) return null;
      const author = inTextAuthor(s, style, true);
      const base = author ? [R(author)] : titleRunsForInText(s, style);
      if (style === 'apa') return joinRuns([...base, R(` (${apaYear(s, suffix.get(s.id) || '')})`)]);
      return joinRuns(base);
    },
    has: (key) => byKey.has(key),
  };
}

// ---- Keys and validation -----------------------------------------------
export function makeKey(s, existing = []) {
  const fam = firstAuthorFamily(s) || stripBraces(s.title).split(/\s+/).find((w) => !MINOR.has(w.toLowerCase())) || 'source';
  const base = (fam.normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'source') + (clean(s.year) || 'nd');
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let c = 98; c < 123; c++) if (!taken.has(base + String.fromCharCode(c))) return base + String.fromCharCode(c);
  return base + Date.now().toString(36);
}

export function blankSource(type = 'book') {
  return {
    id: '', key: '', type,
    authors: [{ family: '', given: '' }], org: '',
    title: '', year: '', month: '', day: '',
    edition: '', publisher: '',
    editors: [], bookTitle: '', pages: '',
    journal: '', volume: '', issue: '',
    site: '', url: '', doi: '', accessed: '',
    status: '', note: '',   // Research: reading status (toread | reading | done) and your notes on the source
  };
}

// Which keys are cited anywhere in a body of text.
export function citedKeys(body) {
  const keys = new Set();
  String(body).replace(/\[(@[\w:-]+[^\]\n]*)\]/g, (m, raw) => { parseCiteToken(raw).forEach((i) => keys.add(i.key)); return m; });
  String(body).replace(/(^|[^\p{L}\p{N}])@([A-Za-z](?:[\w-]*[A-Za-z0-9])?)/gu, (m, pre, k) => { keys.add(k); return m; });
  return keys;
}
