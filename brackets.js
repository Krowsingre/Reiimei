// Reiimei Brackets: with Brackets on, [section labels] such as [Verse 1], [Chorus] or [Bridge] are
// drawn as notes in the background (muted, on a soft tint). They stay ordinary text: you type in
// them as usual. Sharing and exports keep the brackets; copying does too unless "Copy [ ]" is unticked.
// Not labels: citations [@smith2020, 42], Markdown links [text](https://…) and images,
// checklist boxes [ ] and [x], font marks [[f:…]], and escaped \[ brackets.

const MAX = 80; // a label is short and on one line

// Labels in rendered text (a Text note's page, a Preview): any [text] that is not a citation.
const SHOWN = new RegExp(`\\[(?!@)[^\\[\\]\\n]{1,${MAX}}\\]`, 'g');
// Labels in Markdown as typed.
const TYPED = new RegExp(`(?<![\\\\\\[!])\\[(?![@\\[/]|[ xX]\\])[^\\[\\]\\n]{1,${MAX}}\\](?![(\\[\\]])`, 'g');

export function labelsIn(text, { markdown = false } = {}) {
  const re = markdown ? TYPED : SHOWN;
  re.lastIndex = 0;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    // In Markdown, a task box at the start of a list line is not a label.
    if (markdown && /^\s*([-*+]|\d+[.)])\s+$/.test(text.slice(text.lastIndexOf('\n', m.index - 1) + 1, m.index)) && /^\[[ xX]\]$/.test(m[0])) continue;
    out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

const supported = () => typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight !== 'undefined';

// Draw labels on a page of rendered text (the Text note editor, or a Preview), without changing
// it: CSS highlights paint over ranges of the text as it is.
export function paint(name, root, on) {
  if (!supported()) return false;
  if (!on || !root) { CSS.highlights.delete(name); return true; }
  const ranges = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('code, pre, a, .raw-block') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  while (walk.nextNode()) {
    const t = walk.currentNode;
    for (const [a, b] of labelsIn(t.nodeValue)) {
      const r = new Range();
      r.setStart(t, a);
      r.setEnd(t, b);
      ranges.push(r);
    }
  }
  CSS.highlights.set(name, new Highlight(...ranges));
  return true;
}

// A Markdown note is typed in a plain text box, which cannot style part of its text. A copy of the
// text sits behind it, invisible except for a tint under each label, kept in step as you type
// and scroll.
export function paintBehind(layer, ta, on) {
  if (!on) { layer.hidden = true; layer.textContent = ''; ta.classList.remove('with-brackets'); return; }
  const text = ta.value;
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  let html = '';
  let at = 0;
  for (const [a, b] of labelsIn(text, { markdown: true })) { html += esc(text.slice(at, a)) + `<mark>${esc(text.slice(a, b))}</mark>`; at = b; }
  html += esc(text.slice(at)) + '\n';
  ta.classList.add('with-brackets');
  // Lay the copy out exactly like the text box, so each tint sits under its label.
  const cs = getComputedStyle(ta);
  for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'wordSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'tabSize', 'fontVariantCaps', 'textTransform']) layer.style[k] = cs[k];
  layer.innerHTML = html;
  layer.hidden = false;
  layer.scrollTop = ta.scrollTop;
}

// ---- Copying and pasting without the labels ------------------------------------------------
// With Brackets on and "Copy [ ]" off, labels are left out of what you copy, cut or paste. A line
// that held only a label goes with it; blank lines you typed stay.
const dropIn = (text, markdown) => {
  let out = '';
  let at = 0;
  for (const [a, b] of labelsIn(text, { markdown })) {
    let start = a;
    let end = b;
    if (text[end] === ' ') end++; else if (start > 0 && text[start - 1] === ' ') start--;
    out += text.slice(at, start);
    at = end;
  }
  return out + text.slice(at);
};
export function stripLabels(text, { markdown = false } = {}) {
  return String(text).split('\n').flatMap((line) => {
    if (!line.trim()) return [line];
    const kept = dropIn(line, markdown);
    return kept.trim() ? [kept] : [];
  }).join('\n');
}
// The same, on a piece of a page (a copied selection or pasted HTML).
export function stripFragment(root) {
  const blocks = 'p,div,li,h1,h2,h3,h4,h5,h6,blockquote';
  const hadText = new Set([...root.querySelectorAll(blocks)].filter((b) => b.textContent.trim()));
  const doc = root.ownerDocument || document;
  const walk = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walk.nextNode()) texts.push(walk.currentNode);
  for (const t of texts) if (labelsIn(t.nodeValue).length) t.nodeValue = dropIn(t.nodeValue, false);
  for (const b of [...root.querySelectorAll(blocks)].reverse()) if (hadText.has(b) && !b.textContent.trim()) b.remove();
}
