// Reiimei capitals: the Aa button. If the text is not properly capitalized, it is fixed: the first
// letter of every line and every sentence becomes a capital, and so does the word "I" (I'm, I'll…).
// Nothing else changes. If it already is properly capitalized, all of it becomes lowercase.
// Bracket labels ([Chorus]), citations ([@smith2020]), links, web addresses, font marks and code
// are left exactly as they are, and so is a word with a capital inside it (iPhone).

const isLetter = (c) => /\p{L}/u.test(c);
// Characters that may come before the first word of a sentence without taking its place.
const OPENERS = /["'“‘(¿¡*_~=+^\-–—•\s]/u;

// Parts of the text that are never changed, as [start, end, kind]. A "word" part (a citation, a
// link, a web address, code) counts as the first word of its sentence; a "mark" part (a [label],
// a font mark, a list mark) does not, so the words after it still begin the line.
export function untouchable(text, { markdown = false } = {}) {
  const out = [];
  const add = (re, kind) => { re.lastIndex = 0; let m; while ((m = re.exec(text))) out.push([m.index, m.index + m[0].length, kind]); };
  add(/\[(?!@)[^\[\]\n]{1,80}\](?!\()/g, 'mark');     // [labels] and [ ] boxes
  add(/\[(?=@)[^\[\]\n]{1,80}\]/g, 'word');           // [@citations]
  add(/\[[^\[\]\n]{1,80}\](?=\()/g, 'word');          // [link text](…)
  add(/https?:\/\/\S+|mailto:\S+/g, 'word');          // web addresses
  add(/@[A-Za-z][\w-]*/g, 'word');                    // @smith2020
  if (markdown) {
    add(/\]\([^)\n]*\)/g, 'word');                    // the address of a [link](…)
    add(/\[\[\/?f(?::[a-z][a-z0-9-]*)?\]\]/g, 'mark'); // font marks
    add(/`[^`\n]*`/g, 'word');                        // `code`
    add(/\\./g, 'mark');                              // escaped characters
    add(/^[ \t]*(#{1,6}[ \t]+|>[ \t]*|[-*+][ \t]+(\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)+/gm, 'mark'); // list and heading marks
    add(/&nbsp;/g, 'mark');
  }
  return out;
}

// 1 = part of a word part, 2 = part of a mark part (see above).
function maskOf(len, ranges) {
  const m = new Uint8Array(len);
  for (const [a, b, kind] of ranges) for (let i = a; i < b && i < len; i++) m[i] = m[i] === 1 || kind === 'word' ? 1 : 2;
  return m;
}

// Where capitals belong: the first letter of each line and of each sentence, and the word I.
export function capitalPlaces(text, skip) {
  const places = new Set();
  let start = true;      // waiting for the first letter of a line or sentence
  let ended = false;     // just passed . ! ? or …
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') { start = true; ended = false; continue; }
    if (skip[i]) { if (skip[i] === 1 && isLetter(c)) { start = false; ended = false; } continue; }
    if (ended) {
      if (/\s/.test(c)) { start = true; ended = false; continue; }
      if (/["'”’)\]]/.test(c)) continue;
      ended = false;
    }
    if (/[.!?…]/.test(c)) { ended = true; start = false; continue; }
    if (!start) continue;
    if (isLetter(c)) {
      // A word with a capital inside it (iPhone, eBay) keeps its own spelling.
      const word = /^[\p{L}'’]+/u.exec(text.slice(i))[0];
      if (!/\p{Lu}/u.test(word.slice(1))) places.add(i);
      start = false;
      continue;
    }
    if (!OPENERS.test(c)) start = false; // a number or another mark begins it
  }
  const re = /(^|[^\p{L}\p{N}'’])(i)(?=$|[^\p{L}\p{N}'’]|['’](?:m|ll|ve|d|s)(?!\p{L}))/gu;
  let m;
  while ((m = re.exec(text))) { const at = m.index + m[1].length; if (!skip[at]) places.add(at); }
  return places;
}

const upper = (c) => { const u = c.toUpperCase(); return u.length === 1 ? u : c; };
const lower = (c) => { const l = c.toLowerCase(); return l.length === 1 ? l : c; };

// pieces: [{ text, editable?: (i) => bool, markdown? }] judged together, so one decision covers
// them all. Returns the new texts (same lengths) and what was done: 'capitalize', 'lowercase' or
// null when there was nothing to change.
export function recase(pieces) {
  const prepared = pieces.map((p) => {
    const skip = maskOf(p.text.length, untouchable(p.text, { markdown: p.markdown }));
    return { ...p, skip, places: capitalPlaces(p.text, skip) };
  });
  const editable = (p, i) => !p.skip[i] && (!p.editable || p.editable(i));
  const needsCaps = prepared.some((p) => [...p.places].some((i) => editable(p, i) && p.text[i] !== upper(p.text[i])));
  if (needsCaps) {
    return { mode: 'capitalize', texts: prepared.map((p) => [...p.text].map((c, i) => (p.places.has(i) && editable(p, i) ? upper(c) : c)).join('')) };
  }
  const anyUpper = prepared.some((p) => [...p.text].some((c, i) => editable(p, i) && isLetter(c) && c !== lower(c)));
  if (!anyUpper) return { mode: null, texts: pieces.map((p) => p.text) };
  return { mode: 'lowercase', texts: prepared.map((p) => [...p.text].map((c, i) => (editable(p, i) ? lower(c) : c)).join('')) };
}
