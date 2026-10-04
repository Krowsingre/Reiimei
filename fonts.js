// Reiimei fonts: the one list behind each note's Font menu and Settings › Writing › Interface font.
// The faces themselves are declared in styles.css (@font-face), and every file ships with the app,
// so all of them work offline. Lunarian covers Latin-1 accented letters; characters it lacks
// (® ™ € £ § ¶ · × ÷ and anything beyond Latin-1) are drawn in Reiimei Display instead.
export const FONTS = [
  { id: 'display', name: 'Reiimei Display', group: 'Reiimei fonts' },
  { id: 'echolume', name: 'Echolume', group: 'Reiimei fonts' },
  { id: 'flow', name: 'Lunarian Flow', group: 'Reiimei fonts' },
  { id: 'flow-newmoon', name: 'Lunarian Flow New Moon', group: 'Reiimei fonts' },
  { id: 'flow-eclipse', name: 'Lunarian Flow Eclipse', group: 'Reiimei fonts' },
  { id: 'flow-codex', name: 'Lunarian Flow Codex', group: 'Reiimei fonts' },
  { id: 'flow-sigil', name: 'Lunarian Flow Sigil', group: 'Reiimei fonts' },
  { id: 'moonlit', name: 'Lunarian Moonlit Hand', group: 'Reiimei fonts' },
  { id: 'cipher', name: 'Lunarian Cipher Hand', group: 'Reiimei fonts' },
  { id: 'chancery', name: 'Lunarian Chancery', group: 'Reiimei fonts' },
  { id: 'earthshine', name: 'Lunarian Earthshine', group: 'Reiimei fonts' },
  { id: 'phaseline', name: 'Lunarian Phase Line', group: 'Reiimei fonts' },
  { id: 'codex-caps', name: 'Lunarian Codex Capitals', group: 'Reiimei fonts' },
  { id: 'serif', name: 'System serif', group: 'Device fonts' },
  { id: 'sans', name: 'System sans-serif', group: 'Device fonts' },
];
export const FONT_IDS = FONTS.map((f) => f.id);
export const DEFAULT_FONT = 'display';
export const fontId = (id) => (FONT_IDS.includes(id) ? id : DEFAULT_FONT);
export const fontName = (id) => FONTS.find((f) => f.id === fontId(id)).name;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Fill a <select> with the fonts, grouped as in the list above.
export function fillFontSelect(select) {
  const groups = [...new Set(FONTS.map((f) => f.group))];
  select.innerHTML = groups.map((g) => `<optgroup label="${esc(g)}">${FONTS.filter((f) => f.group === g).map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</optgroup>`).join('');
}

// The interface font (Settings › Writing). Reiimei Display unless you choose another.
export function applyUiFont(id) {
  const root = document.documentElement;
  if (fontId(id) === DEFAULT_FONT) delete root.dataset.uiFont; else root.dataset.uiFont = fontId(id);
}
