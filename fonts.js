// Reiimei fonts: the one list behind each note's Font menu and Settings › Writing › Interface font.
// The Ilunir fonts replaced the Lunarian fonts in v0.14.6 under the same ids, so a note or an
// interface font set to a Lunarian font now shows the matching Ilunir font.
// The faces themselves are declared in styles.css (@font-face), and every file ships with the app,
// so all of them work offline. Ilunir covers Latin-1 accented letters; characters it lacks
// (® ™ € £ § ¶ · × ÷ and anything beyond Latin-1) are drawn in Reiimei Display instead.
export const FONTS = [
  { id: 'display', pack: 'reiimei', name: 'Reiimei Display', group: 'Reiimei fonts' },
  { id: 'echolume', pack: 'reiimei', name: 'Echolume', group: 'Reiimei fonts' },
  { id: 'flow', pack: 'ilunir', name: 'Ilunir Flow', group: 'Ilunir fonts' },
  { id: 'flow-newmoon', pack: 'ilunir', name: 'Ilunir Flow New Moon', group: 'Ilunir fonts' },
  { id: 'flow-eclipse', pack: 'ilunir', name: 'Ilunir Flow Eclipse', group: 'Ilunir fonts' },
  { id: 'flow-codex', pack: 'ilunir', name: 'Ilunir Flow Codex', group: 'Ilunir fonts' },
  { id: 'flow-sigil', pack: 'ilunir', name: 'Ilunir Flow Sigil', group: 'Ilunir fonts' },
  { id: 'moonlit', pack: 'ilunir', name: 'Ilunir Moonlit Hand', group: 'Ilunir fonts' },
  { id: 'cipher', pack: 'ilunir', name: 'Ilunir Cipher Hand', group: 'Ilunir fonts' },
  { id: 'chancery', pack: 'ilunir', name: 'Ilunir Chancery', group: 'Ilunir fonts' },
  { id: 'earthshine', pack: 'ilunir', name: 'Ilunir Earthshine', group: 'Ilunir fonts' },
  { id: 'phaseline', pack: 'ilunir', name: 'Ilunir Phase Line', group: 'Ilunir fonts' },
  { id: 'codex-caps', pack: 'ilunir', name: 'Ilunir Codex Capitals', group: 'Ilunir fonts' },
  { id: 'serif', pack: 'device', name: 'System serif', group: 'Device fonts' },
  { id: 'sans', pack: 'device', name: 'System sans-serif', group: 'Device fonts' },
];
export const FONT_IDS = FONTS.map((f) => f.id);
// The font packs, for Settings › Fonts & Styles › Fonts to offer.
export const PACKS = [
  { id: 'reiimei', name: 'Reiimei' },
  { id: 'ilunir', name: 'Ilunir' },
  { id: 'device', name: 'This device' },
];
export const DEFAULT_FONT = 'display';      // notes
export const DEFAULT_UI_FONT = 'echolume';  // the interface
export const fontId = (id) => (FONT_IDS.includes(id) ? id : DEFAULT_FONT);
export const fontName = (id) => FONTS.find((f) => f.id === fontId(id)).name;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Fonts left out in Settings › Fonts & Styles are not offered. The font a note or setting already
// uses always stays in its menu (marked "hidden") so it never changes by itself.
export const shownFonts = (hidden = []) => FONTS.filter((f) => !hidden.includes(f.id));
export function fillFontSelect(select, { hidden = [], current = null } = {}) {
  const list = FONTS.filter((f) => !hidden.includes(f.id) || f.id === current);
  const groups = [...new Set(list.map((f) => f.group))];
  const html = groups.map((g) => `<optgroup label="${esc(g)}">${list.filter((f) => f.group === g).map((f) => `<option value="${f.id}">${esc(f.name)}${hidden.includes(f.id) ? ' (hidden)' : ''}</option>`).join('')}</optgroup>`).join('');
  if (select.dataset.fill !== html) { select.innerHTML = html; select.dataset.fill = html; }
  if (current) select.value = current;
}

// The interface font (Settings › Writing): Echolume unless you choose another. The Reiimei name
// and the definition page always stay in Reiimei Display.
export const uiFontId = (id) => (FONT_IDS.includes(id) ? id : DEFAULT_UI_FONT);
export function applyUiFont(id) {
  document.documentElement.dataset.uiFont = uiFontId(id);
}
