// Reiimei fonts: the one list behind each note's Font menu and Settings › Writing › Interface font.
// The Ilunir fonts replaced the Lunarian fonts in v0.14.6 under the same ids, so a note or an
// interface font set to a Lunarian font now shows the matching Ilunir font.
// The faces themselves are declared in styles.css (@font-face), and every file ships with the app,
// so all of them work offline. Ilunir covers Latin-1 accented letters; characters it lacks
// (® ™ € £ § ¶ · × ÷ and anything beyond Latin-1) are drawn in Reiimei Display instead.
export const FONTS = [
  { id: 'display', name: 'Reiimei Display', group: 'Reiimei fonts' },
  { id: 'echolume', name: 'Echolume', group: 'Reiimei fonts' },
  { id: 'flow', name: 'Ilunir Flow', group: 'Reiimei fonts' },
  { id: 'flow-newmoon', name: 'Ilunir Flow New Moon', group: 'Reiimei fonts' },
  { id: 'flow-eclipse', name: 'Ilunir Flow Eclipse', group: 'Reiimei fonts' },
  { id: 'flow-codex', name: 'Ilunir Flow Codex', group: 'Reiimei fonts' },
  { id: 'flow-sigil', name: 'Ilunir Flow Sigil', group: 'Reiimei fonts' },
  { id: 'moonlit', name: 'Ilunir Moonlit Hand', group: 'Reiimei fonts' },
  { id: 'cipher', name: 'Ilunir Cipher Hand', group: 'Reiimei fonts' },
  { id: 'chancery', name: 'Ilunir Chancery', group: 'Reiimei fonts' },
  { id: 'earthshine', name: 'Ilunir Earthshine', group: 'Reiimei fonts' },
  { id: 'phaseline', name: 'Ilunir Phase Line', group: 'Reiimei fonts' },
  { id: 'codex-caps', name: 'Ilunir Codex Capitals', group: 'Reiimei fonts' },
  { id: 'serif', name: 'System serif', group: 'Device fonts' },
  { id: 'sans', name: 'System sans-serif', group: 'Device fonts' },
];
export const FONT_IDS = FONTS.map((f) => f.id);
export const DEFAULT_FONT = 'display';      // notes
export const DEFAULT_UI_FONT = 'echolume';  // the interface
export const fontId = (id) => (FONT_IDS.includes(id) ? id : DEFAULT_FONT);
export const fontName = (id) => FONTS.find((f) => f.id === fontId(id)).name;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Fill a <select> with the fonts, grouped as in the list above.
export function fillFontSelect(select) {
  const groups = [...new Set(FONTS.map((f) => f.group))];
  select.innerHTML = groups.map((g) => `<optgroup label="${esc(g)}">${FONTS.filter((f) => f.group === g).map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</optgroup>`).join('');
}

// The interface font (Settings › Writing): Echolume unless you choose another. The Reiimei name
// and the definition page always stay in Reiimei Display.
export const uiFontId = (id) => (FONT_IDS.includes(id) ? id : DEFAULT_UI_FONT);
export function applyUiFont(id) {
  document.documentElement.dataset.uiFont = uiFontId(id);
}
