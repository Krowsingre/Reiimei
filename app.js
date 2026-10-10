// Reiimei: app controller (UI, state, startup diagnostics).
import { log } from './logger.js';
import * as db from './db.js';
import * as sync from './sync.js';
import * as vault from './crypto.js';
import * as writing from './ui-writing.js';
import * as security from './ui-security.js';
import * as shareUi from './ui-share.js';
import * as modes from './modes.js';
import * as story from './storyboard.js';
import * as codeIntel from './codeintel.js';
import { isCode } from './code.js';
import * as fonts from './fonts.js';
import * as rich from './ui-rich.js';
import * as versions from './versions.js';
import { BETA, KEY, NAME } from './channel.js';
import { noteToHtml } from './format.js';
import { createHistory, lookOf, sameLook, LOOK_KEYS } from './history.js';
import * as typingCheck from './typingcheck.js';
import * as bibleUi from './ui-bible.js';
import * as bible from './bible.js';
import { noteTitle, noteSnippet, ownTitle, fallbackTitle, sharedFileCheck, plainText } from './share.js';

export const APP_VERSION = '0.18.4';
// boot.js compares this with the page's version to catch a launch that mixes two releases.
window.__reiimeiVersion = APP_VERSION;
export const BUILD_DATE = '2026-10-04';

const $ = (id) => document.getElementById(id);
const el = {
  app: $('app'),
  smartList: $('smart-list'), folderList: $('folder-list'), tagList: $('tag-list'),
  listTitle: $('list-title'), noteList: $('note-list'), search: $('search'),
  body: $('body'), title: $('note-title'), titleRow: $('title-row'), folderBtn: $('note-folder'), noteMenu: $('btn-note-menu'),
  chips: $('chips'), tagInput: $('tag-input'), tagSuggest: $('tag-suggest'), tagRow: $('tag-row'),
  trashBar: $('trash-bar'), emptyEditor: $('empty-editor'), saveState: $('save-state'),
  syncDot: $('sync-dot'), syncText: $('sync-text'),
};

const state = {
  mode: 'notes',
  showAll: false, // true: list notes from every mode
  notes: [],
  folders: [],
  filter: { type: 'all' }, // all | none | folder | tag | trash
  query: '',
  currentId: null,
  selecting: false,
  settingsOpen: false,
  cache: null, // { text, from, offeredTo }: the single erased-text slot
  prevMobileView: 'list',
  selected: new Set(),
  diagnostics: [],
};

// ---- Helpers -----------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lines = (body) => body.split('\n').map((l) => l.trim()).filter(Boolean);
// Titles and snippets come from share.js so lists and shared files match.
const titleOf = (n) => noteTitle(n);
const snippetOf = (n) => noteSnippet(n);

// ---- Preferences (per device) ------------------------------------------
const PREFS_KEY = `${KEY}prefs`;
const VIEW_DEFAULT = { sort: 'updated', dir: 'desc', hidden: [] };
const PREF_DEFAULTS = { mode: 'notes', lastProject: '', codeLang: 'python', format: 'text', style: 'apa', view: VIEW_DEFAULT };
function prefs() {
  try {
    const p = { ...PREF_DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
    // v0.14.1: Text is the default for new notes. Devices that were on Markdown (the old default)
    // switch once; a different choice made later in Settings › Writing is kept.
    if (!p.textDefault) { if (p.format === 'markdown') p.format = 'text'; p.textDefault = true; localStorage.setItem(PREFS_KEY, JSON.stringify(p)); }
    return p;
  } catch { return { ...PREF_DEFAULTS }; }
}

// Fonts: interface text and new notes use Reiimei Display. Each note can pick its own font from the
// Font menu in the toolbar (meta.font); the editor shows it through #editor[data-font].
const fontOf = (n) => fonts.fontId(n?.meta?.font);
function setPrefs(patch) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs(), ...patch })); } catch { /* storage blocked */ }
}

const view = () => ({ ...VIEW_DEFAULT, ...(prefs().view || {}) });

// ---- This device ---------------------------------------------------------
// Each note remembers where it was written (meta.origin = { id, name }).
const DEVICE_KEY = `${KEY}device`;
function guessDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android phone';
  if (/Windows/.test(ua)) return 'Windows laptop';
  if (/Mac/.test(ua)) return 'Mac';
  return 'This browser';
}
function device() {
  try {
    const d = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null');
    if (d?.id) return d;
  } catch { /* fall through */ }
  const d = { id: db.uuid(), name: guessDeviceName() };
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(d)); } catch { /* storage blocked */ }
  return d;
}
const originOf = (n) => (n.meta && n.meta.origin && n.meta.origin.id ? n.meta.origin : null);
const UNKNOWN = { id: 'unknown', name: 'Unknown device' };
const deviceOf = (n) => originOf(n) || UNKNOWN;
// Every device that has written a note, with note counts (this device is always listed).
function knownDevices() {
  const me = device();
  const map = new Map([[me.id, { id: me.id, name: me.name, count: 0, mine: true }]]);
  for (const n of activeNotes()) {
    const o = deviceOf(n);
    if (!map.has(o.id)) map.set(o.id, { id: o.id, name: o.name || 'Device', count: 0, mine: false });
    map.get(o.id).count++;
  }
  const list = [...map.values()];
  return list.sort((a, b) => (b.mine - a.mine) || a.name.localeCompare(b.name));
}

// ---- Toast ---------------------------------------------------------------
let toastTimer = null;
function toast(text, actionLabel = null, action = null) {
  const t = $('toast');
  $('toast-text').textContent = text;
  const btn = $('toast-action');
  btn.hidden = !actionLabel;
  btn.textContent = actionLabel || '';
  btn.onclick = action ? () => { t.hidden = true; action(); } : null;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, actionLabel ? 8000 : 3000);
}
// Storyboard registers are kept in a hidden note per project; it never shows in a list.
const isRegistry = (n) => !!(n.meta && n.meta.registry);
// A Bible highlight is a hidden record too (one per verse, meta.highlight); it is listed only under Bible › Highlights.
const isHighlight = (n) => !!(n.meta && n.meta.highlight);
// A Bible bookmark is one too (meta.bookmark); bookmarks are listed on the Bible page.
const isBookmark = (n) => !!(n.meta && n.meta.bookmark);
const isHidden = (n) => isRegistry(n) || isHighlight(n) || isBookmark(n);
const activeNotes = () => state.notes.filter((n) => !n.deleted && !isHidden(n));
// A permanently deleted note is a blank deleted stub (kept only so other devices wipe it too).
const isPurged = (n) => n.deleted && !n.locked && !(n.body || '').trim() && !ownTitle(n) && !(n.tags || []).length;
// A note with no text and no title is blank; blank notes are discarded when you leave them.
const isBlank = (n) => !(n.body || '').trim() && !ownTitle(n);
const trashNotes = () => state.notes.filter((n) => n.deleted && !isPurged(n) && !isHidden(n));
const anyFolders = () => state.folders.filter((f) => !f.deleted);
const liveFolders = () => anyFolders().filter((f) => !modes.isProject(f)).sort((a, b) => modes.projectName(a).localeCompare(modes.projectName(b)));
// Subfolders (Notes mode, one level). A folder's parent counts only while it is a live top-level folder.
function parentOf(f) {
  const p = folderById(modes.parentIdOf(f));
  return p && !modes.isProject(p) && !modes.parentIdOf(p) ? p : null;
}
const childrenOf = (f) => liveFolders().filter((c) => parentOf(c)?.id === f.id);
// Top-level folders, each followed by its subfolders.
function folderTree() {
  const out = [];
  for (const f of liveFolders().filter((x) => !parentOf(x))) {
    const kids = childrenOf(f);
    out.push({ f, depth: 0, kids: kids.length });
    kids.forEach((k) => out.push({ f: k, depth: 1, kids: 0 }));
  }
  return out;
}
const closedFolders = () => (Array.isArray(prefs().closedFolders) ? prefs().closedFolders : []);
const liveProjects = (mode = state.mode) => anyFolders().filter((f) => modes.isProject(f, mode)).sort((a, b) => modes.projectName(a).localeCompare(modes.projectName(b)));
const folderById = (id) => anyFolders().find((f) => f.id === id);
// A Research note's project gives it a tag automatically. It is worked out, not stored, so
// renaming the project renames the tag, and it cannot be removed from the note.
function projectTagOf(n) {
  if (!n || n.deleted || !modes.hasProjects(modes.kindOf(n))) return null;
  const f = folderById(n.folder_id);
  return f && modes.isProject(f, modes.kindOf(n)) ? modes.slugTag(modes.projectName(f)) || null : null;
}
function tagsOf(n) {
  const pt = projectTagOf(n);
  const t = n.tags || [];
  return pt && !t.includes(pt) ? [...t, pt] : t;
}
const projectTagSet = () => new Set(anyFolders().filter((f) => modes.isProject(f)).map((f) => modes.slugTag(modes.projectName(f))));
const currentNote = () => state.notes.find((n) => n.id === state.currentId) || null;
const normTag = (t) => t.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 40);

function formatDate(iso) {
  const d = new Date(iso);
  const nowD = new Date();
  const days = (nowD - d) / 86400000;
  if (d.toDateString() === nowD.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days < 6) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' });
}

// The editor is one text box shared by every note.
function setBody(text) {
  el.body.value = text;
}

// ---- Instant backup ------------------------------------------------------
// Every change to the open note is also written straight away to this device's quick storage, which
// is kept even if the app is closed or reloaded before the note is saved (a save waits a moment
// for you to stop typing). On the next start the text is put back. When encryption is on it is
// sealed first.
const DRAFT_KEY = `${KEY}draft`;
let draftSeq = 0;
function writeDraft(id, body) {
  const at = Date.now();
  const seq = ++draftSeq;
  const put = (v) => { if (seq !== draftSeq) return; try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ id, at, ...v })); } catch { /* storage full or blocked */ } };
  if (!vault.isEnabled()) put({ body });
  else if (vault.isUnlocked()) vault.seal({ body }).then((sealed) => put({ sealed })).catch(() => {});
}
function readDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } }
function clearDraft(id, body) {
  const d = readDraft();
  if (!d || d.id !== id) return;
  if (body === undefined || d.body === undefined || d.body === body) { draftSeq++; try { localStorage.removeItem(DRAFT_KEY); } catch { /* blocked */ } }
}
async function recoverDraft() {
  const d = readDraft();
  if (!d || !d.id) return;
  let body = d.body;
  if (body === undefined && d.sealed) {
    if (!vault.isUnlocked()) return; // wait until the passphrase is entered
    try { body = (await vault.open(d.sealed)).body; } catch { return; }
  }
  const n = state.notes.find((x) => x.id === d.id);
  const drop = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* blocked */ } };
  if (typeof body !== 'string' || !n || n.locked || n.deleted || n.body === body || d.at <= Date.parse(n.updated_at)) { drop(); return; }
  await versions.keep(n, { reason: 'before-recovery', force: true }).catch(() => {});
  const before = n.body;
  replaceNote(await db.saveNote(n, { body }));
  drop();
  log.info('editor', 'Unsaved text recovered', { id: n.id, chars: body.length });
  scheduleSync();
  setTimeout(() => toast(`Text you had not saved yet in “${noteTitle(currentNote()?.id === n.id ? currentNote() : n)}” was put back.`, 'Undo', async () => {
    const x = state.notes.find((y) => y.id === n.id);
    if (!x) return;
    replaceNote(await db.saveNote(x, { body: before }));
    render();
  }), 300);
}

// ---- Versions ------------------------------------------------------------
async function keepVersion(id, reason) {
  const n = state.notes.find((x) => x.id === id);
  try { await versions.keep(n, { reason, force: true }); } catch (e) { log.warn('versions', 'Could not keep a version', { error: e.message }); }
}
const VERSION_REASON = { editing: 'While editing', left: 'When you left the note', 'before-sync': 'Before a sync replaced it', 'before-restore': 'Before restoring an older version', 'before-recovery': 'Before unsaved text was put back' };
let versionsShown = [];
let versionPicked = -1;
async function openVersions() {
  await flushSave();
  const n = currentNote();
  if (!n) return;
  versionsShown = await versions.list(n.id);
  versionPicked = -1;
  const ul = $('versions-list');
  ul.innerHTML = versionsShown.length
    ? versionsShown.map((v, i) => {
      const words = (v.body.match(/\S+/g) || []).length;
      return `<li><button type="button" class="version-item" role="option" aria-selected="false" data-i="${i}"><span class="v-when">${esc(new Date(v.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</span><span class="v-what">${esc(VERSION_REASON[v.reason] || '')} · ${words} ${words === 1 ? 'word' : 'words'}</span></button></li>`;
    }).join('')
    : '<li class="side-empty">No earlier versions yet. Reiimei keeps one every few minutes while you write, and when you leave the note.</li>';
  $('versions-preview').innerHTML = versionsShown.length ? '<p class="hint">Choose a version to see it here.</p>' : '';
  $('btn-versions-restore').disabled = true;
  $('versions-dialog').showModal();
}
function showVersion(i) {
  const v = versionsShown[i];
  if (!v) return;
  versionPicked = i;
  $('versions-list').querySelectorAll('.version-item').forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.i === i)));
  const pv = $('versions-preview');
  if (isCode(v.format)) { pv.innerHTML = ''; const pre = document.createElement('pre'); pre.textContent = v.body; pv.append(pre); }
  else pv.innerHTML = `${v.title ? `<p class="v-title">${esc(v.title)}</p>` : ''}${noteToHtml(v.body, v.format === 'populi' ? 'populi' : 'markdown')}`;
  $('btn-versions-restore').disabled = false;
}
async function restoreVersion() {
  const v = versionsShown[versionPicked];
  const n = currentNote();
  if (!v || !n) return;
  $('versions-dialog').close();
  await flushSave();
  await keepVersion(n.id, 'before-restore');
  if ((v.format || 'markdown') !== (n.format || 'markdown')) {
    await updateCurrent({ body: v.body, format: v.format });
  } else {
    // Put back as an ordinary change, so Undo takes it back.
    boundary = true;
    el.body.value = v.body;
    el.body.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if ((n.meta?.title || '') !== v.title) await updateCurrent({ meta: { ...(currentNote().meta || {}), title: v.title } });
  render();
  toast('Version restored', 'Undo', () => stepHistory(-1));
  log.info('versions', 'Version restored', { id: n.id, from: new Date(v.at).toISOString() });
}

// ---- Undo and Redo (history.js) ----------------------------------------
// Every change to the open note, whichever way it was made, is a step in that note's history:
// Ctrl+Z / Ctrl+Y (Cmd on a Mac), Undo and Redo in the toolbar, and the phone's own Undo (shake,
// or three fingers) all walk through it.
const history = createHistory();
const TYPING = new Set(['insertText', 'insertCompositionText', 'insertReplacementText', 'deleteContentBackward', 'deleteContentForward', 'deleteWordBackward', 'deleteWordForward']);
let restoring = false;    // Undo or Redo is putting a state back: it is not a new step
let lastInput = null;     // { type, at } of the last thing typed
let boundary = false;     // the next change is a step of its own (a button, a paste, a cut)
let caretMark = null;     // where the caret was just before the change
function caretNow() {
  if (rich.active()) { const c = rich.caretOffsets(); return c ? { rich: true, a: c[0], b: c[1] } : null; }
  return { rich: false, a: el.body.selectionStart, b: el.body.selectionEnd };
}
const stateNow = (kind) => ({ body: el.body.value, look: lookOf(currentNote()), caret: caretNow(), caretBefore: caretMark, kind });
function recordChange(kind) {
  const n = currentNote();
  if (!n || restoring) return;
  if (!kind) kind = !boundary && lastInput && Date.now() - lastInput.at < 250 && TYPING.has(lastInput.type) ? 'typing' : 'edit';
  history.record(n.id, stateNow(kind));
  boundary = false;
  lastInput = null;
  caretMark = null;
  renderUndoButtons();
}
function markChange(e) {
  caretMark = caretNow();
  if (e?.inputType) lastInput = { type: e.inputType, at: Date.now() };
  else boundary = true;
}
// Written only when something changed: the page is left alone while you type (an iPhone's
// keyboard reads the text around the caret, and a busy page can confuse it).
function setDisabled(el, v) { if (el && el.disabled !== v) el.disabled = v; }
function renderUndoButtons() {
  const n = currentNote();
  const off = !n || n.deleted || n.locked;
  const u = off || !history.canUndo(n.id);
  const r = off || !history.canRedo(n.id);
  for (const id of ['btn-undo', 'btn-undo-sheet']) setDisabled($(id), u);
  for (const id of ['btn-redo', 'btn-redo-sheet']) setDisabled($(id), r);
  setDisabled(document.querySelector('#phone-bar [data-pb="undo"]'), u);
  setDisabled(document.querySelector('#phone-bar [data-pb="redo"]'), r);
}
function placeCaret(c) {
  if (!c) return;
  if (c.rich && rich.active()) { rich.setCaretOffsets([c.a, c.b]); return; }
  if (!c.rich && !rich.active() && !el.body.hidden) {
    el.body.focus({ preventScroll: true });
    const len = el.body.value.length;
    el.body.setSelectionRange(Math.min(c.a, len), Math.min(c.b, len));
  }
}
async function stepHistory(dir) {
  const n = currentNote();
  if (!n || n.deleted || n.locked || restoring) return;
  const s = dir < 0 ? history.undo(n.id) : history.redo(n.id);
  if (!s) return;
  restoring = true;
  try {
    if (el.body.value !== s.body) {
      el.body.value = s.body;
      el.body.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (!sameLook(lookOf(currentNote()), s.look)) {
      const meta = { ...(currentNote().meta || {}) };
      for (const k of LOOK_KEYS) { if (s.look[k] == null) delete meta[k]; else meta[k] = s.look[k]; }
      await updateCurrent({ meta });
    }
    placeCaret(s.caret);
    log.info('editor', dir < 0 ? 'Undo' : 'Redo', { id: n.id });
  } finally {
    restoring = false;
  }
  renderUndoButtons();
}

function replaceNote(updated) {
  const i = state.notes.findIndex((n) => n.id === updated.id);
  if (i >= 0) state.notes[i] = updated; else state.notes.push(updated);
}
function replaceFolder(updated) {
  const i = state.folders.findIndex((f) => f.id === updated.id);
  if (i >= 0) state.folders[i] = updated; else state.folders.push(updated);
}

function tagCounts() {
  const counts = new Map();
  activeNotes().forEach((n) => tagsOf(n).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// A mode filters folders and the main lists. Tags, search and Recently Deleted always span every mode.
function inMode(n) {
  const f = state.filter;
  if (state.showAll || f.type === 'tag' || f.type === 'trash' || f.type === 'bible' || state.query.trim()) return true;
  return modes.kindOf(n) === state.mode;
}

function filteredNotes() {
  const f = state.filter;
  let list = f.type === 'trash' ? trashNotes() : activeNotes();
  list = list.filter(inMode);
  const v = view();
  if (f.type === 'folder') list = list.filter((n) => n.folder_id === f.id);
  if (f.type === 'bible') list = list.filter((n) => modes.kindOf(n) === modes.BIBLE);
  if (f.type === 'device') list = list.filter((n) => originOf(n)?.id === device().id);
  // Several tags narrow the list: a note must carry every chosen tag (in any mode or folder).
  if (f.type === 'tag') list = list.filter((n) => f.tags.every((t) => tagsOf(n).includes(t)));
  if (f.type === 'all' && v.hidden.length) list = list.filter((n) => !v.hidden.includes(deviceOf(n).id));
  const q = state.query.trim().toLowerCase();
  if (q) {
    const tagQ = q.replace(/^#/, '');
    list = list.filter((n) => n.body.toLowerCase().includes(q) || ownTitle(n).toLowerCase().includes(q) || tagsOf(n).some((t) => t.includes(tagQ)));
  }
  return sortNotes(list, v);
}

const firstTag = (n) => [...tagsOf(n)].sort((a, b) => a.localeCompare(b))[0] || '';
// In search results, the line where the words were found, with the words marked.
function matchSnippet(n, q) {
  let text;
  try { text = isCode(n.format) ? n.body : plainText({ ...n, meta: n.meta || {} }, {}); } catch { text = n.body; }
  const low = text.toLowerCase();
  const at = low.indexOf(q.toLowerCase());
  if (at < 0) return esc(snippetOf(n));
  const ls = text.lastIndexOf('\n', at - 1) + 1;
  let le = text.indexOf('\n', at);
  if (le < 0) le = text.length;
  const from = Math.max(ls, at - 30);
  const to = Math.min(le, at + q.length + 70);
  return `${from > ls ? '…' : ''}${esc(text.slice(from, at))}<mark>${esc(text.slice(at, at + q.length))}</mark>${esc(text.slice(at + q.length, to))}${to < le ? '…' : ''}`;
}
function sortKey(n, sort) {
  if (sort === 'tag') return firstTag(n);
  if (sort === 'device') return deviceOf(n).name || '';
  return '';
}
function sortNotes(list, v = view()) {
  const sort = v.sort === 'device' && state.filter.type !== 'all' ? 'updated' : v.sort;
  const sign = v.dir === 'asc' ? 1 : -1;
  const when = (n) => (sort === 'created' ? (n.created_at || n.updated_at) : n.updated_at);
  return [...list].sort((a, b) => {
    if (sort === 'tag' || sort === 'device') {
      const ka = sortKey(a, sort), kb = sortKey(b, sort);
      // Notes with no tag go last whichever way the list runs.
      if (sort === 'tag' && (!ka || !kb) && ka !== kb) return ka ? -1 : 1;
      const c = ka.localeCompare(kb) * (v.dir === 'desc' ? -1 : 1);
      return c || b.updated_at.localeCompare(a.updated_at);
    }
    return (b.pinned - a.pinned) || sign * when(a).localeCompare(when(b));
  });
}
// Section headings shown while sorting by tag or by where a note was written.
function groupLabel(n) {
  const sort = view().sort;
  if (sort === 'tag') return firstTag(n) ? `#${firstTag(n)}` : 'No tag';
  if (sort === 'device' && state.filter.type === 'all') return deviceOf(n).name;
  return null;
}

// ---- Focus mode and the width of the note list (computer) -----------------------------
// Focus: the open note fills the whole window (the sidebar and the list step aside, and come back
// exactly as they were). It always starts off. The list's width can be dragged from its right
// edge, from its full width down to about an inch; each device remembers it.
const focusOn = () => el.app.dataset.focus === 'on';
function setFocus(on) {
  on = !!on && !!currentNote() && !isPhone();
  if (on === focusOn()) return;
  el.app.dataset.focus = on ? 'on' : 'off';
  const b = $('btn-focus');
  b.setAttribute('aria-pressed', String(on));
  b.title = on ? 'Leave focus (Esc or Ctrl+Shift+F)' : 'Focus: the note fills the window (Ctrl+Shift+F)';
  b.setAttribute('aria-label', on ? 'Leave focus' : 'Focus on this note');
  log.debug('focus', on ? 'On' : 'Off');
  writing.fitToolbar();
}
const LIST_MIN = 108; // just over an inch
const listMax = () => (window.matchMedia('(max-width: 1000px)').matches ? 270 : 320);
function applyListWidth(w = prefs().listW) {
  const max = listMax();
  const width = Math.round(Math.max(LIST_MIN, Math.min(max, Number(w) || max)));
  el.app.style.setProperty('--list-w', `${width}px`);
  el.app.dataset.listNarrow = width < 230 ? 'on' : 'off';
  const r = $('list-resizer');
  r.setAttribute('aria-valuemin', String(LIST_MIN));
  r.setAttribute('aria-valuemax', String(max));
  r.setAttribute('aria-valuenow', String(width));
  writing.fitToolbar();
  return width;
}
function bindFocusAndWidth() {
  const b = $('btn-focus');
  b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the caret where it is
  b.addEventListener('click', () => setFocus(!focusOn()));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f' && !document.querySelector('dialog[open]')) { e.preventDefault(); setFocus(!focusOn()); }
  });
  const r = $('list-resizer');
  let drag = null;
  r.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, w: $('note-list').closest('.list').getBoundingClientRect().width };
    r.setPointerCapture(e.pointerId);
    el.app.dataset.resizing = 'on';
    e.preventDefault();
  });
  r.addEventListener('pointermove', (e) => { if (drag) applyListWidth(drag.w + e.clientX - drag.x); });
  const end = () => { if (!drag) return; drag = null; el.app.dataset.resizing = 'off'; setPrefs({ listW: applyListWidth(parseFloat(getComputedStyle(el.app).getPropertyValue('--list-w'))) }); };
  r.addEventListener('pointerup', end);
  r.addEventListener('pointercancel', end);
  r.addEventListener('dblclick', () => { setPrefs({ listW: null }); applyListWidth(); });
  r.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 48 : 16;
    const now = parseFloat(getComputedStyle(el.app).getPropertyValue('--list-w')) || listMax();
    let next = null;
    if (e.key === 'ArrowLeft') next = now - step;
    else if (e.key === 'ArrowRight') next = now + step;
    else if (e.key === 'Home') next = LIST_MIN;
    else if (e.key === 'End') next = listMax();
    if (next === null) return;
    e.preventDefault();
    setPrefs({ listW: applyListWidth(next) });
  });
  window.addEventListener('resize', () => applyListWidth());
  // When the list is narrow, Sort and show, Select and Share move into one ⋯ menu.
  $('btn-list-more').addEventListener('click', (e) => openMenu(e.currentTarget, listTitle(), [
    { label: 'Sort and show…', run: () => $('btn-view').click() },
    { label: state.selecting ? 'Done selecting' : 'Select several notes', run: () => $('btn-select').click() },
    { label: 'Share notes in this list…', run: () => $('btn-share-list').click() },
  ]));
  applyListWidth();
}

function applyRail() {
  const on = !!prefs().rail;
  el.app.dataset.rail = on ? 'on' : 'off';
  const b = $('btn-rail');
  b.setAttribute('aria-pressed', String(on));
  b.title = on ? 'Show the sidebar' : 'Fold the sidebar to icons';
  b.setAttribute('aria-label', b.title);
  writing.fitToolbar();
}

function setMobileView(view) {
  el.app.dataset.mobileView = view;
  if (view === 'editor') fitTitle();
}
const isPhone = () => window.matchMedia('(max-width: 760px)').matches;

// ---- Dialog ------------------------------------------------------------
function ask({ title, text = '', value = null, placeholder = '', okText = 'OK', extra = null, extra2 = null }) {
  const dlg = $('ask-dialog');
  $('ask-title').textContent = title;
  $('ask-text').textContent = text;
  $('ask-text').hidden = !text;
  const input = $('ask-input');
  input.hidden = value === null;
  input.value = value ?? '';
  input.placeholder = placeholder;
  $('ask-ok').textContent = okText;
  const extraBtn = $('ask-extra');
  extraBtn.hidden = !extra;
  extraBtn.textContent = extra || '';
  const extra2Btn = $('ask-extra2');
  extra2Btn.hidden = !extra2;
  extra2Btn.textContent = extra2 || '';
  return new Promise((resolve) => {
    const onKey = (e) => {
      // Handle Enter ourselves so it never triggers the extra (delete) button.
      if (e.key === 'Enter') { e.preventDefault(); dlg.close('ok'); }
    };
    input.addEventListener('keydown', onKey);
    dlg.addEventListener('close', () => {
      input.removeEventListener('keydown', onKey);
      resolve({ action: dlg.returnValue || 'cancel', value: input.value.trim() });
    }, { once: true });
    dlg.returnValue = '';
    dlg.showModal();
    if (value !== null) setTimeout(() => { input.focus(); input.select(); }, 30);
  });
}

// ---- Rendering ---------------------------------------------------------
const ICONS = {
  all: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
  none: '<svg viewBox="0 0 24 24"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/></svg>',
  device: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M2 20h20"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M3 6h6l2 2h10v11H3z"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 17v5"/><path d="M9 10.8V4h6v6.8l3 3.2H6z"/></svg>',
  bnote: '<svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z"/><path d="M12 8v8M9 11h6"/></svg>',
  highlight: '<svg viewBox="0 0 24 24"><path d="M14 4l6 6-8 8H6v-6z"/><path d="M4 21h9"/></svg>',
};

const MAX_TAGS = 5;
async function toggleTagFilter(tag) {
  closeSettings();
  await flushSave();
  const cur = state.filter.type === 'tag' ? state.filter.tags : [];
  if (cur.includes(tag)) {
    const left = cur.filter((t) => t !== tag);
    state.filter = left.length ? { type: 'tag', tags: left } : { type: 'all' };
  } else if (!projectTagSet().has(tag) && cur.filter((t) => !projectTagSet().has(t)).length >= MAX_TAGS) {
    toast(`Five tags is the most. Remove one to add another.`);
    return;
  } else {
    state.filter = { type: 'tag', tags: [...cur, tag] };
  }
  state.selecting = false;
  state.selected.clear();
  const before = state.currentId;
  let visible = filteredNotes();
  if (!visible.some((n) => n.id === state.currentId)) state.currentId = isPhone() ? null : visible[0]?.id || null;
  if (before && before !== state.currentId) await discardIfBlank(before);
  render();
  setMobileView('list');
}

function renderTagFilter() {
  const box = $('tag-filter');
  const f = state.filter;
  if (f.type !== 'tag') { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = f.tags.map((t) => `<span class="tf-chip">#${esc(t)}<button data-untag="${esc(t)}" aria-label="Remove tag ${esc(t)} from the filter">×</button></span>`).join('') +
    `<span class="tf-note">${f.tags.length > 1 ? 'Notes with all of these tags. ' : ''}${(() => { const left = MAX_TAGS - f.tags.filter((t) => !projectTagSet().has(t)).length; return left > 0 ? `Pick up to ${left} more in Tags.` : 'Five tags is the most.'; })()}</span>`;
}

function isActive(f) {
  const cur = state.filter;
  return cur.type === f.type && cur.id === f.id && (f.type !== 'tag' || cur.tags.join() === f.tags.join());
}

function sideItem(filter, icon, name, count, withMore = false) {
  const li = document.createElement('li');
  li.className = 'side-item' + (isActive(filter) ? ' active' : '');
  li.innerHTML = `${ICONS[icon]}<span class="name">${esc(name)}</span>` +
    (withMore ? `<button class="icon-btn more" aria-label="Folder options">${ICONS.more}</button>` : '') +
    `<span class="count">${count}</span>`;
  li.title = name;
  li.addEventListener('click', (e) => {
    if (e.target.closest('.more, .sub-toggle')) return;
    selectFilter(filter);
  });
  return li;
}

// What the top list item is called: the mode's own notes, or every note when all modes are shown.
const MODE_NOTES = { notes: 'Notes', research: 'Research notes', coding: 'Coding notes', storyboard: 'Storyboard notes' };
const allLabel = () => (state.showAll ? 'All notes' : MODE_NOTES[state.mode] || 'Notes');

function renderSidebar() {
  const act = activeNotes().filter((n) => state.showAll || modes.kindOf(n) === state.mode);
  const research = modes.hasProjects(state.mode);
  const folders = research ? liveProjects() : liveFolders();
  renderModeSwitch();
  $('folders-label').textContent = research ? 'Projects' : 'Folders';
  $('btn-new-folder').title = research ? 'New project' : 'New folder';
  $('btn-new-folder').setAttribute('aria-label', research ? 'New project' : 'New folder');
  const folderIds = new Set(folders.map((f) => f.id));
  el.smartList.replaceChildren(
    sideItem({ type: 'all' }, 'all', allLabel(), act.length),
    sideItem({ type: 'device' }, 'device', 'This device', act.filter((n) => originOf(n)?.id === device().id).length),
  );

  const closed = closedFolders();
  const rows = research ? folders.map((f) => ({ f, depth: 0, kids: 0 })) : folderTree();
  el.folderList.replaceChildren(...rows.filter(({ f, depth }) => !(depth && closed.includes(parentOf(f).id))).map(({ f, depth, kids }) => {
    const li = sideItem({ type: 'folder', id: f.id }, 'folder', modes.projectName(f), act.filter((n) => n.folder_id === f.id).length, true);
    if (depth) li.classList.add('sub');
    if (kids) {
      const open = !closed.includes(f.id);
      const t = document.createElement('button');
      t.className = 'sub-toggle';
      t.setAttribute('aria-expanded', String(open));
      t.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} the subfolders of ${modes.projectName(f)}`);
      t.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
      t.addEventListener('click', () => { setPrefs({ closedFolders: open ? [...closed, f.id] : closed.filter((x) => x !== f.id) }); renderSidebar(); });
      li.prepend(t);
      li.classList.add('has-sub');
    }
    li.querySelector('.more').addEventListener('click', (e) => folderMenu(f, e.currentTarget));
    return li;
  }));
  if (!folders.length) el.folderList.innerHTML = `<li class="side-empty">${research ? 'No projects yet' : 'No folders yet'}</li>`;
  const foldersOpen = prefs().foldersOpen !== false;
  for (const id of ['btn-folders-toggle', 'btn-folders-chevron']) $(id).setAttribute('aria-expanded', String(foldersOpen));
  el.folderList.hidden = !foldersOpen;

  const tags = tagCounts();
  el.tagList.replaceChildren(...tags.map(([t, c]) => {
    const li = sideItem({ type: 'tag', tags: [t] }, 'tag', t, c);
    li.classList.toggle('tag-on', state.filter.type === 'tag' && state.filter.tags.includes(t));
    li.classList.toggle('active', false);
    const fresh = li.cloneNode(true); // drop the default click, tags toggle instead
    fresh.addEventListener('click', () => toggleTagFilter(t));
    return fresh;
  }));
  // The Bible: its heading goes to the Bible page (in every mode).
  $('bible-section').classList.toggle('active', state.filter.type === 'bible');
  for (const id of ['btn-tags-toggle', 'btn-tags-chevron']) $(id).setAttribute('aria-expanded', String(prefs().tagsOpen !== false));
  el.tagList.hidden = prefs().tagsOpen === false;
  if (!tags.length) el.tagList.innerHTML = '<li class="side-empty">Add tags to a note</li>';

  const trashCount = trashNotes().length;
  const trash = sideItem({ type: 'trash' }, 'trash', 'Recently Deleted', trashCount);
  const wrap = document.createElement('div');
  wrap.className = 'side-section';
  wrap.appendChild(trash);
  const existing = document.getElementById('trash-section');
  if (existing) existing.remove();
  wrap.id = 'trash-section';
  $('bible-section').insertAdjacentElement('beforebegin', wrap); // Recently Deleted stays with the folders


}

// ---- Modes -----------------------------------------------------------------
function renderModeSwitch() {
  const box = $('mode-switch');
  const act = activeNotes();
  box.innerHTML = modes.MODES.map((m) => {
    const on = m.id === state.mode;
    const c = act.filter((n) => modes.kindOf(n) === m.id).length;
    return `<button class="mode-btn${on ? ' on' : ''}" role="tab" aria-selected="${on}" data-mode="${m.id}" data-short="${esc(m.name[0])}" title="${m.name} (Ctrl+${m.key}) · ${c} ${c === 1 ? 'note' : 'notes'}">${esc(m.name)}</button>`;
  }).join('');
  // The computer's drop-down: the four modes, then All modes (in place of "Show all modes").
  const sel = $('mode-select');
  sel.innerHTML = modes.MODES.map((m) => `<option value="${m.id}">${esc(m.name)} (${act.filter((n) => modes.kindOf(n) === m.id).length})</option>`).join('')
    + `<option value="all">All modes (${act.length})</option>`;
  sel.value = state.showAll ? 'all' : state.mode;
}

function renderModeAll() {
  const b = $('mode-all');
  const f = state.filter;
  const relevant = f.type !== 'tag' && f.type !== 'trash' && f.type !== 'bible' && !state.query.trim();
  b.hidden = !relevant;
  if (!relevant) return;
  b.textContent = state.showAll ? `Showing all modes · back to ${modes.modeName(state.mode)}` : 'Show all modes';
  b.setAttribute('aria-pressed', String(state.showAll));
}

async function afterListChange(before) {
  let visible = filteredNotes();
  if (!visible.some((n) => n.id === state.currentId)) state.currentId = isPhone() ? null : visible[0]?.id || null;
  if (before && before !== state.currentId) await discardIfBlank(before);
  visible = filteredNotes();
  if (!visible.some((n) => n.id === state.currentId)) state.currentId = isPhone() ? null : visible[0]?.id || null;
}

async function setMode(id) {
  if (!modes.MODE_IDS.includes(id)) return;
  closeSettings();
  await flushSave();
  state.selecting = false;
  state.selected.clear();
  state.mode = id;
  state.showAll = false;
  if (['tag', 'trash', 'folder', 'bible'].includes(state.filter.type)) state.filter = { type: 'all' };
  setPrefs({ mode: id });
  await afterListChange(state.currentId);
  log.info('modes', 'Mode changed', { mode: id });
  render();
  setMobileView('list');
}

async function toggleShowAll() {
  await flushSave();
  state.showAll = !state.showAll;
  await afterListChange(state.currentId);
  render();
}

async function moveToMode(id) {
  const n = currentNote();
  if (!n || n.deleted || !modes.MODE_IDS.includes(id) || modes.kindOf(n) === id) return;
  const changes = { meta: { ...(n.meta || {}), kind: id } };
  const here = folderById(n.folder_id);
  if (modes.hasProjects(id)) { if (!modes.isProject(here, id)) changes.folder_id = (await projectForNew(id)).id; } // these notes live in a project of their own mode
  else if (modes.isProject(here)) changes.folder_id = null;                                                          // other modes have no projects
  await updateCurrent(changes);
  log.info('modes', 'Note moved to mode', { id: n.id, mode: id });
  toast(`Moved to ${modes.modeName(id)}`);
  if (!state.showAll && id !== state.mode) {
    state.currentId = isPhone() ? null : filteredNotes()[0]?.id || null;
    render();
    if (isPhone()) setMobileView('list');
  }
}

function listTitle() {
  const f = state.filter;
  if (f.type === 'folder') { const x = folderById(f.id); return x ? modes.projectName(x) : 'Folder'; }
  if (f.type === 'tag') return f.tags.map((t) => `#${t}`).join(' + ');
  if (f.type === 'trash') return 'Recently Deleted';
  if (f.type === 'device') return 'This device';
  if (f.type === 'none') return 'Notes';
  if (f.type === 'bible') return 'Bible';
  return allLabel();
}

function renderList() {
  swipeOpen = null;
  el.listTitle.textContent = listTitle();
  const notes = filteredNotes();
  renderSelectBar(notes);
  renderTagFilter();
  renderModeAll();
  if (state.filter.type === 'bible') { renderBibleHome(notes); return; }
  if (!notes.length) {
    const hiddenNote = state.filter.type === 'all' && view().hidden.length && !state.query;
    el.noteList.innerHTML = `<li class="list-empty">${state.query ? 'No matching notes' : state.filter.type === 'trash' ? 'Nothing deleted' : hiddenNote ? 'Some devices are hidden. Use the sort icon to show them.' : 'No notes here yet'}</li>`;
    $('view-dot').hidden = !(view().sort !== 'updated' || view().dir !== 'desc' || view().hidden.length);
    return;
  }
  const multi = knownDevices().length > 1 && state.filter.type !== 'device';
  let lastGroup = null;
  el.noteList.innerHTML = notes.map((n) => {
    const g = groupLabel(n);
    const head = g !== null && g !== lastGroup ? `<li class="list-group">${esc(g)}</li>` : '';
    lastGroup = g;
    return head + noteRow(n, multi);
  }).join('');
  const v = view();
  $('view-dot').hidden = !(v.sort !== 'updated' || v.dir !== 'desc' || v.hidden.length);
}

function noteRow(n, multi) {
  return `
    <li class="note-item${n.id === state.currentId && !state.selecting ? ' active' : ''}${state.selected.has(n.id) ? ' selected' : ''}" data-id="${n.id}" role="option" aria-selected="${state.selected.has(n.id)}">
      <div class="title">${n.pinned ? ICONS.pin : ''}<span>${esc(titleOf(n))}</span></div>
      <div class="meta"><span class="date">${esc(formatDate(view().sort === 'created' ? (n.created_at || n.updated_at) : n.updated_at))}</span>${multi ? `<span class="dev">${esc(deviceOf(n).name)}</span>` : ''}${state.showAll ? `<span class="kind">${esc(modes.modeName(modes.kindOf(n)))}</span>` : ''}${modes.kindOf(n) === modes.BIBLE && state.filter.type !== 'bible' && !state.showAll ? '<span class="kind">Bible</span>' : ''}<span class="snippet">${state.query.trim() ? matchSnippet(n, state.query.trim()) : esc(snippetOf(n))}</span></div>
      ${tagsOf(n).length ? `<div class="tags">${tagsOf(n).map((t) => `<span class="mini-tag">#${esc(t)}</span>`).join('')}</div>` : ''}
      ${state.filter.type === 'trash'
        ? '<div class="swipe-actions left" aria-hidden="true"><button type="button" data-swipe="restore" tabindex="-1">Restore</button></div><div class="swipe-actions right" aria-hidden="true"><button type="button" class="danger" data-swipe="purge" tabindex="-1">Delete</button></div>'
        : `<div class="swipe-actions left" aria-hidden="true"><button type="button" class="pin" data-swipe="pin" tabindex="-1">${n.pinned ? 'Unpin' : 'Pin'}</button><button type="button" data-swipe="share" tabindex="-1">Share</button></div><div class="swipe-actions right" aria-hidden="true"><button type="button" class="danger" data-swipe="delete" tabindex="-1">Delete</button></div>`}
    </li>`;
}

function renderEditor() {
  const n = currentNote();
  const show = !!n;
  el.emptyEditor.hidden = show;
  [el.body, el.titleRow, el.tagRow, el.folderBtn, el.noteMenu, $('btn-close-note')].forEach((x) => { x.hidden = !show; });
  if (!show) { writing.renderToolbar(null); $('preview').hidden = true; }
  el.trashBar.hidden = !(n && n.deleted);
  $('erased-bar').hidden = !(n && !n.deleted && !n.body.trim() && state.cache && state.cache.offeredTo === n.id);
  if (!n) return;

  if (el.body.value !== n.body && !(pending && pending.id === n.id)) {
    const focused = document.activeElement === el.body;
    const { selectionStart, selectionEnd } = el.body;
    setBody(n.body);
    if (focused) el.body.setSelectionRange(Math.min(selectionStart, n.body.length), Math.min(selectionEnd, n.body.length));
  }
  if (!restoring) history.open(n.id, { body: el.body.value, look: lookOf(n), caret: null });
  renderUndoButtons();
  el.body.readOnly = n.deleted;
  el.tagInput.disabled = n.deleted;
  el.title.readOnly = n.deleted;
  // The title box shows the saved title, or (greyed) the first line that stands in for it.
  if (document.activeElement !== el.title && !(titlePending && titlePending.id === n.id)) el.title.value = ownTitle(n);
  el.title.placeholder = fallbackTitle(n) || 'Title';
  fitTitle();

  const isResearch = modes.hasProjects(modes.kindOf(n));
  const where = isResearch ? 'Project' : 'Folder';
  $('note-folder-name').textContent = folderLabel(n);
  el.folderBtn.disabled = n.deleted;
  el.folderBtn.title = n.deleted ? where : `${where}: change where this note is kept`;
  el.folderBtn.setAttribute('aria-label', `${where}: ${folderLabel(n)}`);
  $('editor').dataset.kind = modes.kindOf(n);
  const pass = modes.kindOf(n) === modes.BIBLE ? n.meta?.passage : null;
  $('passage-bar').hidden = !pass;
  if (pass) $('btn-passage').textContent = `${pass.label || 'Passage'}${pass.version ? ` (${bible.version(pass.version).short})` : ''}`;
  $('editor').dataset.font = fontOf(n);
  $('pin-dot').hidden = !n.pinned;

  const pt = projectTagOf(n);
  el.chips.innerHTML = tagsOf(n).map((t) => t === pt
    ? `<span class="chip project" title="Added by the project. It follows the project name.">#${esc(t)}</span>`
    : `<span class="chip">#${esc(t)}${n.deleted ? '' : `<button data-tag="${esc(t)}" aria-label="Remove tag ${esc(t)}">×</button>`}</span>`).join('');
  writing.renderToolbar(n);
}

function render() {
  renderSidebar();
  renderList();
  renderEditor();
}

// ---- Actions -----------------------------------------------------------
let saveTimer = null;
let pending = null; // { id, body }: unsaved text, tied to the note it was typed into

// ---- Empty notes and the erased-text cache -------------------------------------
// A note left with no text is deleted for good the moment it is closed. If its text
// was just erased, that text waits in one shared slot (see db.js) so it can be pasted
// into the first new note you start.
async function refreshCache() {
  try { state.cache = await db.getCache(); } catch (e) { log.warn('cache', 'Could not read the erased-text cache', { error: e.message }); state.cache = null; }
}

async function discardIfBlank(id) {
  const n = state.notes.find((x) => x.id === id);
  if (!n || n.deleted || n.locked || !isBlank(n)) return false;
  if (!n.synced_updated_at) {
    await db.locked(() => db.remove('notes', id));
    state.notes = state.notes.filter((x) => x.id !== id);
  } else {
    replaceNote(await db.purgeNote(n));
  }
  log.info('editor', 'Empty note deleted', { id });
  scheduleSync();
  return true;
}

// Saves run one after another: a second caller (closing a note while the save started by the
// text box losing focus is still running) waits for the first, and never sees the note as it was.
let saveChain = Promise.resolve();
function flushSave() {
  const run = saveChain.then(saveNow);
  saveChain = run.catch(() => {});
  return run;
}

async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  await flushTitle();
  if (!pending) return;
  const { id, body } = pending;
  pending = null;
  const n = state.notes.find((x) => x.id === id);
  if (!n || body === n.body) return;
  try {
    replaceNote(await db.saveNote(n, { body }));
    if (!pending || pending.id !== id) clearDraft(id, body);
    versions.keep(state.notes.find((x) => x.id === id)).catch((e) => log.warn('versions', 'Could not keep a version', { error: e.message }));
    if (id === state.currentId) el.title.placeholder = fallbackTitle(currentNote()) || 'Title';
    if (!body.trim() && n.body.trim()) {
      // Everything was erased: keep the text in the cache (one slot, shared by all devices).
      await db.setCache(n.body, id);
      await refreshCache();
      log.info('cache', 'Erased text cached', { from: id, chars: n.body.length });
    }
    setSaveState(titlePending ? 'unsaved' : '');
    renderList();
    renderSidebar();
    scheduleSync();
  } catch (e) {
    log.error('editor', 'Save failed', e);
    setSaveState('failed');
  }
}

// The save indicator shows only while something is unsaved, or when saving failed.
function setSaveState(kind) {
  const s = el.saveState;
  if (s.dataset.state === 'update' && !kind) return; // keep "Update ready" until a save needs the space
  if (s.dataset.state === kind) return; // unchanged: leave the page alone while typing
  s.dataset.state = kind;
  s.textContent = kind === 'unsaved' ? 'Unsaved' : kind === 'failed' ? 'Save failed' : kind === 'update' ? 'Update ready: reopen app' : '';
  s.title = kind === 'failed' ? 'Your last change was not saved on this device. Keep this note open and try again; Settings › Log has details.' : '';
}

// ---- Title -----------------------------------------------------------------------
// What is typed in the title box is the note's title (meta.title, synced and sealed like the
// rest of meta). An empty box means the first line of the text is the title, as before.
let titleTimer = null;
let titlePending = null; // { id, title }
// The title box grows to show a long title in full. It can only be measured while it is on
// screen (a phone shows one pane at a time), so it is measured again when the editor appears.
function fitTitle() {
  el.title.style.height = '';
  if (!el.title.offsetParent) return;
  el.title.style.height = `${el.title.scrollHeight}px`;
}
async function flushTitle() {
  clearTimeout(titleTimer);
  titleTimer = null;
  if (!titlePending) return;
  const { id, title } = titlePending;
  titlePending = null;
  const n = state.notes.find((x) => x.id === id);
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!n || n.deleted || clean === ownTitle(n)) { if (!pending) setSaveState(''); return; }
  try {
    const meta = { ...(n.meta || {}) };
    if (clean) meta.title = clean; else delete meta.title;
    replaceNote(await db.saveNote(n, { meta }));
    if (!pending) setSaveState('');
    renderList();
    scheduleSync();
  } catch (e) {
    log.error('editor', 'Title save failed', e);
    setSaveState('failed');
  }
}

async function pasteErased() {
  const n = currentNote();
  const c = state.cache;
  if (!n || !c || n.body.trim()) return;
  await flushSave();
  replaceNote(await db.saveNote(currentNote(), { body: c.text }));
  setBody(c.text);
  await db.clearCache();
  state.cache = null;
  log.info('cache', 'Erased text pasted', { into: n.id, chars: c.text.length });
  render();
  scheduleSync();
  toast('Pasted the erased text');
}

async function updateCurrent(changes) {
  await flushSave();
  const n = currentNote();
  if (!n) return;
  replaceNote(await db.saveNote(n, changes));
  if (!restoring) {
    if ('body' in changes || 'format' in changes) { history.forget(n.id); history.open(n.id, { body: currentNote().body, look: lookOf(currentNote()), caret: null }); }
    else if (changes.meta) recordChange('look');
  }
  render();
  renderUndoButtons();
  scheduleSync();
}

async function selectNote(id) {
  await flushSave();
  const prev = state.currentId;
  if (prev && prev !== id) keepVersion(prev, 'left'); // in the background: opening the next note does not wait
  if (prev !== id) writing.closeTextFind({ focus: false });
  if (prev && prev !== id) await discardIfBlank(prev);
  state.currentId = id;
  setSaveState('');
  closeSplash();
  renderList();
  renderEditor();
  if (id) setMobileView('editor');
  // Opened from a search: the words found are highlighted in the note.
  if (id && state.query.trim()) writing.showSearch(state.query.trim());
}

async function selectFilter(filter) {
  closeSettings();
  await flushSave();
  state.selecting = false;
  state.selected.clear();
  state.filter = filter;
  const before = state.currentId;
  let visible = filteredNotes();
  if (!visible.some((n) => n.id === state.currentId)) state.currentId = isPhone() ? null : visible[0]?.id || null;
  if (before && before !== state.currentId) { await discardIfBlank(before); visible = filteredNotes(); if (!visible.some((n) => n.id === state.currentId)) state.currentId = isPhone() ? null : visible[0]?.id || null; }
  render();
  setMobileView('list');
}

async function newNote() {
  closeSplash();
  await flushSave();
  if (state.currentId) await discardIfBlank(state.currentId);
  const f = state.filter;
  if (f.type === 'trash') state.filter = { type: 'all' };
  const p = prefs();
  // Under Bible, a new note is a Bible note (not of any mode).
  const forBible = f.type === 'bible';
  const note = await db.createNote(forBible
    ? { format: isCode(p.format) ? 'markdown' : p.format, meta: { ...writing.newNoteMeta(p), kind: modes.BIBLE, origin: { id: device().id, name: device().name } } }
    : {
      folder_id: modes.hasProjects(state.mode) ? (await projectForNew(state.mode)).id : f.type === 'folder' && !modes.isProject(folderById(f.id)) ? f.id : null,
      tags: f.type === 'tag' ? [...f.tags] : [],
      format: state.mode === 'coding' && !isCode(p.format) ? (isCode(p.codeLang) ? p.codeLang : 'python') : p.format,
      meta: { ...writing.newNoteMeta(p), kind: state.mode, origin: { id: device().id, name: device().name } },
    });
  writing.resetView();
  if (view().hidden.includes(device().id)) setPrefs({ view: { ...view(), hidden: view().hidden.filter((x) => x !== device().id) } });
  replaceNote(note);
  // The first new note after an erasure is offered the erased text; a second, separate new note drops it.
  if (state.cache) {
    if (state.cache.offeredTo && state.cache.offeredTo !== note.id) {
      await db.clearCache();
      state.cache = null;
      log.info('cache', 'Erased-text cache cleared by a separate new note');
    } else if (!state.cache.offeredTo) {
      await db.offerCache(note.id);
      await refreshCache();
    }
    scheduleSync();
  }
  state.query = '';
  el.search.value = '';
  state.currentId = note.id;
  render();
  setMobileView('editor');
  writing.focusText();
}

async function deleteCurrent() {
  const n = currentNote();
  if (!n) return;
  await flushSave();
  const list = filteredNotes();
  const idx = list.findIndex((x) => x.id === n.id);
  await trashNote(n);
  const remaining = filteredNotes();
  state.currentId = isPhone() ? null : (remaining[idx] || remaining[idx - 1] || null)?.id || null;
  render();
  setMobileView('list');
  scheduleSync();
}

// ---- Trash, selection, closing -------------------------------------------
// Move one note to Recently Deleted (a blank note that never synced is simply dropped).
async function trashNote(n) {
  if (isBlank(n)) {
    await discardIfBlank(n.id);
  } else {
    replaceNote(await db.deleteNote(n));
  }
}

const selectedNotes = () => state.notes.filter((n) => state.selected.has(n.id));

function renderSelectBar(notes = filteredNotes()) {
  const trash = state.filter.type === 'trash';
  const ids = new Set(notes.map((n) => n.id));
  for (const id of [...state.selected]) if (!ids.has(id)) state.selected.delete(id);
  el.app.dataset.select = state.selecting ? 'on' : 'off';
  $('select-bar').hidden = !state.selecting;
  $('btn-select').textContent = state.selecting ? 'Done' : 'Select';
  $('btn-select').hidden = !notes.length && !state.selecting;
  $('btn-empty-trash').hidden = !(trash && notes.length) || state.selecting;
  $('btn-share-list').hidden = state.selecting;
  const count = state.selected.size;
  $('sel-count').textContent = count ? `${count} selected` : 'Tap notes to select';
  $('sel-all').textContent = count && count === notes.length ? 'None' : 'All';
  $('sel-restore').hidden = !trash;
  $('sel-delete').title = trash ? 'Delete forever' : 'Delete';
  $('sel-delete').setAttribute('aria-label', $('sel-delete').title);
  for (const id of ['sel-share', 'sel-restore', 'sel-delete', 'sel-duplicate']) $(id).disabled = !count;
  $('sel-duplicate').hidden = trash;
}

function setSelecting(on) {
  state.selecting = on;
  if (!on) state.selected.clear();
  if (on) { flushSave(); }
  renderList();
}

function toggleSelected(id) {
  if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
  renderList();
}

async function afterBulkChange() {
  state.selected.clear();
  state.selecting = false;
  if (!filteredNotes().some((n) => n.id === state.currentId)) state.currentId = null;
  render();
  if (isPhone()) setMobileView('list');
  scheduleSync();
}

async function deleteSelected() {
  const notes = selectedNotes();
  if (!notes.length) return;
  await flushSave();
  const trash = state.filter.type === 'trash';
  const c = await ask(trash
    ? { title: `Delete ${notes.length === 1 ? 'this note' : `${notes.length} notes`} forever?`, text: 'This cannot be undone.', okText: 'Delete forever' }
    : { title: `Delete ${notes.length === 1 ? 'this note' : `${notes.length} notes`}?`, text: 'They move to Recently Deleted, where you can restore them.', okText: 'Delete' });
  if (c.action !== 'ok') return;
  for (const n of notes) { if (trash) replaceNote(await db.purgeNote(n)); else await trashNote(n); }
  log.info('editor', trash ? 'Notes deleted permanently' : 'Notes moved to Recently Deleted', { count: notes.length });
  await afterBulkChange();
  toast(trash ? `Deleted ${notes.length} forever` : `${notes.length} moved to Recently Deleted`);
}

// Copies of notes, each marked "(copy)" and kept with the note it came from. Several at once are
// confirmed first.
async function duplicateNotes(notes) {
  notes = notes.filter((n) => n && !n.locked && !n.deleted);
  if (!notes.length) return [];
  if (notes.length > 1) {
    const c = await ask({ title: `Duplicate ${notes.length} notes?`, text: 'Each copy is marked “(copy)” and kept in the same folder.', okText: 'Duplicate' });
    if (c.action !== 'ok') return [];
  }
  await flushSave();
  const made = [];
  for (const n of notes) {
    const meta = { ...(n.meta || {}), title: `${ownTitle(n) || noteTitle(n)} (copy)`, duplicateOf: n.id };
    const copy = await db.createNote({ folder_id: n.folder_id, tags: [...(n.tags || [])], format: n.format, meta });
    const saved = await db.saveNote(copy, { body: n.body });
    replaceNote(saved);
    made.push(saved);
  }
  log.info('editor', 'Notes duplicated', { count: made.length });
  scheduleSync();
  render();
  toast(made.length === 1 ? 'Duplicated' : `Duplicated ${made.length} notes`);
  return made;
}

async function restoreSelected() {
  const notes = selectedNotes();
  if (!notes.length) return;
  for (const n of notes) replaceNote(await db.restoreNote(n));
  log.info('editor', 'Notes restored', { count: notes.length });
  await afterBulkChange();
  toast(`Restored ${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`);
}

async function purgeCurrent() {
  const n = currentNote();
  if (!n || !n.deleted) return;
  const c = await ask({ title: 'Delete this note forever?', text: 'This cannot be undone.', okText: 'Delete forever' });
  if (c.action !== 'ok') return;
  const idx = filteredNotes().findIndex((x) => x.id === n.id);
  replaceNote(await db.purgeNote(n));
  const remaining = filteredNotes();
  state.currentId = isPhone() ? null : (remaining[idx] || remaining[idx - 1] || null)?.id || null;
  log.info('editor', 'Note deleted permanently', { id: n.id });
  render();
  if (isPhone()) setMobileView('list');
  scheduleSync();
}

async function emptyTrash() {
  const notes = trashNotes();
  if (!notes.length) return;
  const c = await ask({ title: `Delete ${notes.length === 1 ? '1 note' : `all ${notes.length} notes`} forever?`, text: 'Everything in Recently Deleted will be removed. This cannot be undone.', okText: 'Empty Recently Deleted' });
  if (c.action !== 'ok') return;
  for (const n of notes) replaceNote(await db.purgeNote(n));
  state.currentId = null;
  log.info('editor', 'Recently Deleted emptied', { count: notes.length });
  render();
  if (isPhone()) setMobileView('list');
  scheduleSync();
}

// Close the open note and show the Reiimei page.
async function closeNote() {
  setFocus(false);
  await flushSave();
  if (state.currentId) keepVersion(state.currentId, 'left');
  if (state.currentId) await discardIfBlank(state.currentId);
  state.currentId = null;
  setSaveState('');
  writing.resetView();
  render();
  if (isPhone()) setMobileView('list');
  log.debug('editor', 'Note closed');
}

// ---- Sort and show dialog ------------------------------------------------
function renderViewDialog() {
  const v = view();
  const all = state.filter.type === 'all';
  $('view-sort-device').hidden = !all;
  $('view-sort-device').disabled = !all;
  const sort = v.sort === 'device' && !all ? 'updated' : v.sort;
  $('view-sort').value = sort;
  const byName = sort === 'tag' || sort === 'device';
  $('view-dir').innerHTML = byName
    ? '<option value="asc">A to Z</option><option value="desc">Z to A</option>'
    : '<option value="desc">Newest first</option><option value="asc">Oldest first</option>';
  $('view-dir').value = v.dir;
  $('view-devices-wrap').hidden = !all;
  const devs = knownDevices();
  if (state.notes.some((n) => !n.deleted && !isHidden(n) && !originOf(n)) && !devs.some((d) => d.id === UNKNOWN.id)) {
    devs.push({ ...UNKNOWN, count: activeNotes().filter((n) => !originOf(n)).length, mine: false });
  }
  $('view-devices').innerHTML = devs.map((d) =>
    `<li><label><input type="checkbox" data-dev="${esc(d.id)}" ${v.hidden.includes(d.id) ? '' : 'checked'}> ${esc(d.name)}${d.mine ? ' (this device)' : ''}<span class="n">${d.count}</span></label></li>`).join('');
  $('view-devices-hint').textContent = devs.length < 2 ? 'Notes written on your other devices will appear here once they sync.' : '';
  $('device-name').value = device().name;
  const unlabeled = activeNotes().filter((n) => !originOf(n) && !n.locked).length;
  $('btn-mark-mine').hidden = !unlabeled;
  $('btn-mark-mine').textContent = `Mark ${unlabeled} unlabeled ${unlabeled === 1 ? 'note' : 'notes'} as written here`;
}

function setView(patch) {
  setPrefs({ view: { ...view(), ...patch } });
  renderList();
}

async function markUnlabeledMine() {
  const me = device();
  const todo = state.notes.filter((n) => !originOf(n) && !n.locked);
  for (const n of todo) replaceNote(await db.saveNote(n, { meta: { ...(n.meta || {}), origin: { id: me.id, name: me.name } } }, { touch: false }));
  log.info('device', 'Notes marked as written on this device', { count: todo.length, device: me.name });
  scheduleSync();
  return todo.length;
}

async function renameDevice(name) {
  const me = device();
  const clean = name.trim().slice(0, 40);
  if (!clean || clean === me.name) return;
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify({ ...me, name: clean })); } catch { /* storage blocked */ }
  for (const n of state.notes.filter((x) => originOf(x)?.id === me.id && !x.locked)) {
    replaceNote(await db.saveNote(n, { meta: { ...n.meta, origin: { id: me.id, name: clean } } }, { touch: false }));
  }
  log.info('device', 'Device renamed', { name: clean });
  render();
  scheduleSync();
}

// First launch after upgrading: name this device and say whether existing notes were written here.
async function offerDeviceSetup() {
  const key = `${KEY}deviceAsked`;
  try { if (localStorage.getItem(key)) return; } catch { return; }
  const n = state.notes.filter((x) => !x.deleted && !x.locked && !isHidden(x) && !originOf(x)).length;
  if (!n) return;
  const me = device();
  const r = await ask({
    title: 'Name this device',
    text: `Notes now remember where they were written. Were your ${n} existing ${n === 1 ? 'note' : 'notes'} written on this device? Choose that only on the device where you wrote them; on your other devices choose Not sure.`,
    value: me.name, okText: 'Not sure', extra: 'Yes, written here',
  });
  try { localStorage.setItem(key, '1'); } catch { /* storage blocked */ }
  if (r.action === 'cancel') return;
  if (r.value) await renameDevice(r.value);
  if (r.action === 'extra') await markUnlabeledMine();
  render();
}

// Notes that sync once left as "Conflicted copy" go to Recently Deleted, still restorable.
async function findConflictedCopies() {
  await flushSave();
  const copies = activeNotes().filter((n) => /\(Conflicted copy from [^)]*\)\s*$/.test(n.body));
  if (!copies.length) { setMsg('data-msg', 'No conflicted copies found.', 'ok'); return; }
  const c = await ask({ title: `Move ${copies.length} conflicted ${copies.length === 1 ? 'copy' : 'copies'} to Recently Deleted?`, text: 'Your original notes are not touched. You can restore any of these from Recently Deleted.', okText: 'Move them' });
  if (c.action !== 'ok') return;
  for (const n of copies) replaceNote(await db.deleteNote(n));
  state.currentId = filteredNotes().some((n) => n.id === state.currentId) ? state.currentId : null;
  render();
  scheduleSync();
  log.info('editor', 'Conflicted copies moved to Recently Deleted', { count: copies.length });
  setMsg('data-msg', `Moved ${copies.length} conflicted ${copies.length === 1 ? 'copy' : 'copies'} to Recently Deleted.`, 'ok');
}

// The note's format (Text, Markdown, Populi, a code language), from the phone's ⋯.
function openFormatMenu() {
  const sel = $('note-format');
  const items = [];
  for (const g of sel.querySelectorAll('optgroup')) {
    items.push({ heading: g.label });
    for (const o of g.querySelectorAll('option')) items.push({ label: o.textContent, checked: o.value === sel.value, run: () => { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); } });
  }
  openMenu(el.noteMenu, 'Note format', items);
}
// Preview (Markdown), Outline (Research) and the scene board (Storyboard), for the phone's ⋯.
function phoneViews(n) {
  const out = [];
  for (const [id, label] of [['btn-preview', null], ['btn-outline', 'Outline'], ['btn-board', null]]) {
    const b = $(id);
    if (!b || b.hidden || n.deleted) continue;
    const on = b.getAttribute('aria-pressed') === 'true';
    const name = id === 'btn-preview' ? (on ? 'Back to editing' : 'Preview') : id === 'btn-board' ? (on ? 'Show the text' : 'Show the scene board') : (on ? 'Hide the outline' : label);
    out.push({ label: name, run: () => b.click() });
  }
  return out;
}

function openTagsSheet() {
  const n = currentNote();
  if (!n) return;
  $('tags-slot').append($('tag-row'));
  $('tags-dialog').showModal();
  el.tagInput.focus();
}

async function addTag(raw) {
  const n = currentNote();
  const tag = normTag(raw);
  if (!n || !tag || tagsOf(n).includes(tag)) return;
  await updateCurrent({ tags: [...(n.tags || []), tag] });
}

async function removeTag(tag) {
  const n = currentNote();
  if (!n) return;
  await updateCurrent({ tags: (n.tags || []).filter((t) => t !== tag) });
  if (state.filter.type === 'tag' && state.filter.tags.includes(tag) && !tagCounts().some(([t]) => t === tag)) {
    const left = state.filter.tags.filter((t) => t !== tag);
    state.filter = left.length ? { type: 'tag', tags: left } : { type: 'all' };
    render();
  }
}

async function newFolder(parentId = null) {
  const research = modes.hasProjects(state.mode);
  const parent = research || typeof parentId !== 'string' ? null : folderById(parentId);
  const r = await ask({ title: research ? 'New project' : parent ? `New subfolder in ${modes.projectName(parent)}` : 'New folder', value: '', placeholder: research ? 'Project name' : 'Folder name', okText: 'Create' });
  if (r.action !== 'ok' || !r.value.trim()) return;
  if (research && liveProjects(state.mode).some((p) => modes.projectName(p).toLowerCase() === r.value.trim().toLowerCase())) { toast('A project with that name already exists.'); return; }
  const f = await db.createFolder(research ? modes.projectStored(r.value, state.mode) : modes.folderStored(r.value, parent?.id || null));
  if (parent) setPrefs({ closedFolders: closedFolders().filter((x) => x !== parent.id) });
  replaceFolder(f);
  if (research) setPrefs({ [lastProjectKey(state.mode)]: f.id });
  await selectFilter({ type: 'folder', id: f.id });
  scheduleSync();
}

// ---- Storyboard registers --------------------------------------------------
// Each Storyboard project keeps its registers in one hidden note (meta.registry). If two devices
// edit at once, sync leaves extra copies; they are merged here and the extras removed.
const registryNotes = (folderId) => state.notes.filter((n) => !n.deleted && !n.locked && isRegistry(n) && n.folder_id === folderId)
  .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));

const isCodingFolder = (folderId) => modes.isProject(folderById(folderId), 'coding');
function registryOf(folderId) {
  const list = registryNotes(folderId).map((n) => n.meta);
  return isCodingFolder(folderId) ? codeIntel.mergeProjectData(list) : story.mergeRegistries(list);
}

// ---- Bible: highlights and Bible notes --------------------------------------------
// A highlight is one hidden record per verse (meta.highlight = {book, c, v, version, color}) that
// syncs like a note; its text is a copy of the verse, kept so the Highlights list can show it. The
// scripture itself is never edited. Verses highlighted in a row with the same colour are listed
// together, and a highlight shows in every translation.
const hlKey = (h) => `${h.book}:${h.c}:${h.v}`;
const liveHighlights = () => state.notes.filter((n) => !n.deleted && !n.locked && isHighlight(n));
function highlightMap() {
  const m = new Map();
  for (const n of liveHighlights()) {
    const k = hlKey(n.meta.highlight);
    const had = m.get(k);
    if (!had || had.note.updated_at < n.updated_at) m.set(k, { color: bible.hlColor(n.meta.highlight.color), note: n });
  }
  return m;
}
function highlightGroups() {
  const order = (b) => { const i = bible.ORDER.indexOf(b); return i < 0 ? 999 : i; };
  const list = [...highlightMap().values()].map((x) => x.note)
    .sort((a, b) => { const x = a.meta.highlight; const y = b.meta.highlight; return order(x.book) - order(y.book) || x.c - y.c || x.v - y.v; });
  const out = [];
  for (const n of list) {
    const h = n.meta.highlight;
    const last = out[out.length - 1];
    const lh = last && last.notes[last.notes.length - 1].meta.highlight;
    if (lh && lh.book === h.book && lh.c === h.c && lh.v + 1 === h.v && bible.hlColor(lh.color) === bible.hlColor(h.color)) last.notes.push(n);
    else out.push({ notes: [n] });
  }
  return out;
}
// verses: [{book, c, v, version, text, label}]. color: a colour name, or null to remove.
async function setHighlight(verses, color) {
  const have = highlightMap();
  for (const x of verses) {
    const k = hlKey(x);
    const old = have.get(k)?.note;
    // Every copy of this verse's highlight (two devices may have made one each).
    const copies = liveHighlights().filter((n) => hlKey(n.meta.highlight) === k);
    if (!color) { for (const n of copies) await dropNote(n); continue; }
    if (old) {
      if (old.meta.highlight.color !== color) replaceNote(await db.saveNote(old, { meta: { ...old.meta, highlight: { ...old.meta.highlight, color } } }));
      for (const n of copies.filter((c) => c.id !== old.id)) await dropNote(n);
      continue;
    }
    replaceNote(await db.createNote({ body: x.text || x.label, meta: { highlight: { book: x.book, c: x.c, v: x.v, version: x.version, color, label: x.label }, origin: { id: device().id, name: device().name } } }));
  }
  log.info('bible', color ? 'Verses highlighted' : 'Highlights removed', { verses: verses.length, color });
  renderSidebar();
  if (state.filter.type === 'bible') renderList();
  scheduleSync();
}
function highlightCards(groups) {
  if (!groups.length) return '<li class="list-empty">No highlights yet. While reading, pick verses and choose a colour.</li>';
  return groups.map((g) => {
    const first = g.notes[0].meta.highlight;
    const last = g.notes[g.notes.length - 1].meta.highlight;
    const name = (first.label || '').replace(/\s+\d+:\d+.*$/, '') || first.book;
    const ref = first.v === last.v ? `${name} ${first.c}:${first.v}` : `${name} ${first.c}:${first.v}–${last.v}`;
    const ids = g.notes.map((n) => n.id).join(',');
    const text = g.notes.map((n) => n.body).join(' ');
    const color = bible.hlColor(first.color);
    return `<li class="hl-item hl-${color}" data-ids="${ids}" data-ref="${esc(first.book)}:${first.c}:${first.v}:${last.v}" data-version="${esc(first.version || '')}">
      <div class="hl-head"><button type="button" class="hl-ref" data-hl="open">${esc(ref)}</button><span class="hl-ver">${esc(bible.version(first.version).short)}</span><span class="spacer"></span>
      <button type="button" class="icon-btn hl-remove" data-hl="remove" aria-label="Remove this highlight" title="Remove this highlight"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
      <p class="hl-text">${esc(text)}</p>
      <div class="hl-palette" role="group" aria-label="Colour">${bible.highlightPalette(color, 'data-hl="color" ')}</div>
    </li>`;
  }).join('');
}
async function highlightAction(e) {
  const item = e.target.closest('.hl-item');
  if (!item) return false;
  const act = e.target.closest('[data-hl]')?.dataset.hl || 'open';
  const notes = item.dataset.ids.split(',').map((id) => state.notes.find((n) => n.id === id)).filter(Boolean);
  const verses = notes.map((n) => n.meta.highlight);
  if (act === 'remove') await setHighlight(verses, null);
  else if (act === 'color') await setHighlight(verses, e.target.closest('[data-color]').dataset.color);
  else {
    const [book, c, v1, v2] = item.dataset.ref.split(':');
    await bibleUi.open({ version: item.dataset.version || null, at: { book, c1: +c, v1: +v1, c2: +c, v2: +v2 } });
  }
  return true;
}

// ---- The Bible page: the Bible and its bookmarks (the last place read first), then the Bible
// notes, then the highlights. The Bible heading in the sidebar opens it, in any mode.
const liveBookmarks = () => state.notes.filter((n) => !n.deleted && !n.locked && isBookmark(n)).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
const passageText = (p) => `${p.label || p.book}${p.version ? ` (${bible.version(p.version).short})` : ''}`;
function renderBibleHome(notes) {
  const last = prefs().bibleAt;
  const lastLabel = last ? `${last.label || `${last.book} ${last.c}`}${last.v > 1 ? `:${last.v}` : ''} (${bible.version(last.version).short})` : '';
  const marks = liveBookmarks();
  const groups = highlightGroups();
  const multi = knownDevices().length > 1;
  const x = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  el.noteList.innerHTML = `
    <li class="bh-sec" id="bh-bible">
      <div class="bh-read"><button type="button" class="btn primary" id="bh-open">${last ? 'Continue reading' : 'Open the Bible'}</button><button type="button" class="btn" id="bh-books">Books</button><button type="button" class="btn" id="bh-conc">Concordance</button></div>
      <div class="bh-versions" role="group" aria-label="Translations">${bible.VERSIONS.map((v) => `<button type="button" class="bh-ver" data-bible="${v.id}" title="${esc(v.name)}">${esc(v.short)}</button>`).join('')}</div>
      <h3 class="bh-title">Bookmarks</h3>
      <ul class="bm-list" id="bm-list">
        ${last ? `<li class="bm-item bm-last" data-bm="last"><button type="button" class="bm-open"><span class="bm-kind">Last read</span><span class="bm-ref">${esc(lastLabel)}</span></button></li>` : ''}
        ${marks.map((n) => `<li class="bm-item" data-bm="${n.id}"><button type="button" class="bm-open"><span class="bm-ref">${esc(passageText(n.meta.bookmark))}</span></button><button type="button" class="icon-btn bm-remove" aria-label="Remove this bookmark" title="Remove this bookmark">${x}</button></li>`).join('')}
        ${!last && !marks.length ? '<li class="side-empty">No bookmarks yet. While reading, tap Bookmark.</li>' : ''}
      </ul>
    </li>
    <li class="list-group bh-sub" id="bh-notes"><span>Notes</span><span class="bh-count">${notes.length}</span></li>
    ${notes.length ? notes.map((n) => noteRow(n, multi)).join('') : '<li class="list-empty">No Bible notes yet. While reading, pick verses and choose Take notes.</li>'}
    <li class="list-group bh-sub" id="bh-highlights"><span>Highlights</span><span class="bh-count">${groups.length}</span></li>
    ${highlightCards(groups)}`;
  $('view-dot').hidden = true;
}
async function bibleHomeAction(e) {
  const t = e.target;
  if (t.closest('#bh-open')) return bibleUi.open({});
  if (t.closest('#bh-books')) return bibleUi.open({ books: true });
  if (t.closest('#bh-conc')) return bibleUi.open({ conc: '' });
  const v = t.closest('[data-bible]');
  if (v) return bibleUi.open({ version: v.dataset.bible });
  const bm = t.closest('.bm-item');
  if (!bm) return;
  if (bm.dataset.bm === 'last') return bibleUi.open({});
  const n = state.notes.find((x) => x.id === bm.dataset.bm);
  if (!n) return;
  if (t.closest('.bm-remove')) {
    await dropNote(n);
    log.info('bible', 'Bookmark removed');
    renderList();
    scheduleSync();
    toast('Bookmark removed');
    return;
  }
  const p = n.meta.bookmark;
  return bibleUi.open({ version: p.version || null, at: p });
}
async function addBookmark(p) {
  const same = liveBookmarks().find((n) => { const b = n.meta.bookmark; return b.book === p.book && b.c1 === p.c1 && b.v1 === p.v1 && b.c2 === p.c2 && b.v2 === p.v2; });
  if (same) { toast(`${p.label} is already bookmarked`); return; }
  replaceNote(await db.createNote({ body: p.label, meta: { bookmark: p, origin: { id: device().id, name: device().name } } }));
  log.info('bible', 'Bookmarked', { passage: p.label });
  if (state.filter.type === 'bible') renderList();
  scheduleSync();
  toast(`Bookmarked ${p.label}`);
}
// A Bible note for a passage, opened beside the reader on a computer (alone on a phone).
async function takeBibleNotes(passage, title) {
  await flushSave();
  if (state.currentId) await discardIfBlank(state.currentId);
  const p = prefs();
  const note = await db.createNote({ format: isCode(p.format) ? 'markdown' : p.format, meta: { ...writing.newNoteMeta(p), kind: modes.BIBLE, title, passage, origin: { id: device().id, name: device().name } } });
  replaceNote(note);
  writing.resetView();
  state.query = '';
  el.search.value = '';
  state.filter = { type: 'bible' };
  state.currentId = note.id;
  log.info('bible', 'Bible note started', { passage: passage.label });
  render();
  setMobileView('editor');
  scheduleSync();
  return note;
}
async function openPassage() {
  const pass = currentNote()?.meta?.passage;
  if (!pass) return;
  await flushSave();
  await bibleUi.open({ version: pass.version || null, at: pass, side: !isPhone() });
}

async function dropNote(n) {
  if (!n.synced_updated_at) {
    await db.locked(() => db.remove('notes', n.id));
    state.notes = state.notes.filter((x) => x.id !== n.id);
  } else {
    replaceNote(await db.purgeNote(n));
  }
}

async function saveRegistry(folderId, data) {
  const list = registryNotes(folderId);
  const origin = { id: device().id, name: device().name };
  const meta = isCodingFolder(folderId)
    ? { registry: true, kind: 'coding', origin, snippets: data.snippets || [], gone: data.gone || [], keep: data.keep || [] }
    : { registry: true, kind: 'storyboard', origin, registers: data.registers || [], dismissed: data.dismissed || [] };
  let note = list[0];
  if (!note) {
    note = await db.createNote({ folder_id: folderId, format: 'markdown', meta });
    note = await db.saveNote(note, { body: isCodingFolder(folderId) ? '[Project data (snippets). Kept by Reiimei, not shown in lists.]' : '[Registers. Kept by Reiimei, not shown in lists.]' });
    replaceNote(note);
    log.info('registers', 'Registry created', { folder: folderId });
  } else {
    replaceNote(await db.saveNote(note, { meta }));
  }
  for (const extra of list.slice(1)) await dropNote(extra);
  scheduleSync();
}

// Two devices that edited registers at the same time leave extra copies; fold them into one.
async function tidyRegistries() {
  const byFolder = new Map();
  for (const n of state.notes) if (!n.deleted && !n.locked && isRegistry(n)) byFolder.set(n.folder_id, (byFolder.get(n.folder_id) || 0) + 1);
  for (const [folderId, count] of byFolder) {
    if (count < 2) continue;
    await saveRegistry(folderId, registryOf(folderId));
    log.info('registers', 'Duplicate registry copies merged', { folder: folderId, copies: count });
  }
}

async function dropRegistry(folderId) {
  for (const n of registryNotes(folderId)) await dropNote(n);
}

// ---- Research projects -------------------------------------------------------
async function ensureUnsorted(mode = 'research') {
  const found = liveProjects(mode).find((p) => modes.projectName(p) === modes.UNSORTED);
  if (found) return found;
  const f = await db.createFolder(modes.projectStored(modes.UNSORTED, mode));
  replaceFolder(f);
  log.info('projects', 'Unsorted project created', { mode });
  return f;
}

// The project a new Research note goes into: the one you are looking at, else the last
// one you used, else Unsorted.
const lastProjectKey = (mode) => (mode === 'research' ? 'lastProject' : `lastProject_${mode}`);
async function projectForNew(mode = state.mode) {
  const f = state.filter;
  if (f.type === 'folder' && modes.isProject(folderById(f.id), mode)) return folderById(f.id);
  const last = folderById(prefs()[lastProjectKey(mode)]);
  if (last && modes.isProject(last, mode)) return last;
  return ensureUnsorted(mode);
}

// Every Research note must be in a project. Older notes that were sorted into Research
// without one are put in Unsorted. Runs at start-up and after each sync.
async function fixResearchNotes() {
  for (const mode of Object.keys(modes.PROJECT_MARKS)) {
    const stray = activeNotes().filter((n) => !n.locked && modes.kindOf(n) === mode && !modes.isProject(folderById(n.folder_id), mode));
    if (!stray.length) continue;
    const dest = await ensureUnsorted(mode);
    for (const n of stray) replaceNote(await db.saveNote(n, { folder_id: dest.id }));
    log.info('projects', 'Notes placed in a project', { mode, count: stray.length });
    scheduleSync();
  }
}

async function folderMenu(folder, anchor) {
  const proj = modes.isProject(folder);
  const label = modes.projectName(folder);
  const kids = proj ? [] : childrenOf(folder);
  const parent = proj ? null : parentOf(folder);
  const notesIn = (ids) => activeNotes().filter((n) => ids.includes(n.folder_id));
  const items = [
    { label: 'Rename…', run: () => renameFolder(folder) },
  ];
  // Folders in Notes go one level deep: a folder at the top can hold subfolders.
  if (!proj && !parent) items.push({ label: 'New subfolder…', run: () => newFolder(folder.id) });
  if (!proj) {
    items.push(kids.length
      ? { label: 'Move to…', hint: 'Has subfolders', disabled: true }
      : { label: 'Move to…', run: () => moveFolderMenu(folder, anchor) });
  }
  items.push({ label: proj ? 'Share project' : 'Share folder', run: () => shareUi.open(notesIn([folder.id, ...kids.map((k) => k.id)]), { title: label, single: false }) });
  items.push({ label: proj ? 'Delete project' : 'Delete folder', danger: true, run: () => deleteFolderAsk(folder) });
  openMenu(anchor, proj ? 'Project' : parent ? `Subfolder of ${modes.projectName(parent)}` : 'Folder', items);
}

async function renameFolder(folder) {
  const proj = modes.isProject(folder);
  const label = modes.projectName(folder);
  const r = await ask({ title: proj ? 'Rename project' : 'Rename folder', value: label, okText: 'Rename' });
  if (r.action !== 'ok' || !r.value || r.value === label) return;
  if (proj && liveProjects(modes.projectKind(folder)).some((p) => p.id !== folder.id && modes.projectName(p).toLowerCase() === r.value.trim().toLowerCase())) { toast('A project with that name already exists.'); return; }
  replaceFolder(await db.saveFolder(folder, { name: proj ? modes.projectStored(r.value, modes.projectKind(folder)) : modes.folderStored(r.value, parentOf(folder)?.id || null) }));
  render();
  scheduleSync();
}

// Put a folder inside another top-level folder, or back at the top.
function moveFolderMenu(folder, anchor) {
  const here = parentOf(folder)?.id || null;
  const items = [{ label: 'Top level', hint: 'Not inside a folder', checked: !here, run: () => moveFolder(folder, null) }];
  for (const f of liveFolders().filter((x) => !parentOf(x) && x.id !== folder.id)) items.push({ label: modes.projectName(f), checked: here === f.id, run: () => moveFolder(folder, f.id) });
  openMenu(anchor, `Move "${modes.projectName(folder)}" to`, items);
}
async function moveFolder(folder, parentId) {
  if ((parentOf(folder)?.id || null) === parentId) return;
  replaceFolder(await db.saveFolder(folder, { name: modes.folderStored(modes.projectName(folder), parentId) }));
  if (parentId) setPrefs({ closedFolders: closedFolders().filter((x) => x !== parentId) });
  log.info('folders', 'Folder moved', { into: parentId ? 'folder' : 'top level' });
  render();
  scheduleSync();
}

// Deleting never loses a note. A project's notes go to its Unsorted project. A folder's notes go
// to Notes, and its subfolders move up to the top level with their notes. A subfolder's notes go
// to the folder it was in.
async function deleteFolderAsk(folder) {
  const proj = modes.isProject(folder);
  const label = modes.projectName(folder);
  const inside = activeNotes().filter((n) => n.folder_id === folder.id);
  if (proj && label === modes.UNSORTED && inside.length) { toast('Move the notes in Unsorted to other projects first.'); return; }
  const kids = proj ? [] : childrenOf(folder);
  const parent = proj ? null : parentOf(folder);
  const text = proj
    ? `Its notes will move to the Unsorted project. They will not be deleted.${modes.projectKind(folder) === 'storyboard' ? ' Its registers (characters, locations and so on) will be deleted.' : modes.projectKind(folder) === 'coding' ? ' Its snippets will be deleted.' : ''}`
    : parent
      ? `Its notes will move to "${modes.projectName(parent)}". They will not be deleted.`
      : `Notes in this folder will move to Notes. They will not be deleted.${kids.length ? ` Its ${kids.length === 1 ? 'subfolder moves' : `${kids.length} subfolders move`} to the top level, with ${kids.length === 1 ? 'its' : 'their'} notes.` : ''}`;
  const c = await ask({ title: `Delete "${label}"?`, text, okText: proj ? 'Delete project' : 'Delete folder' });
  if (c.action !== 'ok') return;
  if (proj && inside.length) {
    const dest = await ensureUnsorted(modes.projectKind(folder));
    for (const n of inside) replaceNote(await db.saveNote(n, { folder_id: dest.id }));
  }
  if (parent) for (const n of inside) replaceNote(await db.saveNote(n, { folder_id: parent.id }));
  for (const k of kids) replaceFolder(await db.saveFolder(k, { name: modes.folderStored(modes.projectName(k), null) }));
  if (proj) await dropRegistry(folder.id);
  await db.deleteFolder(folder);
  state.notes = await db.getAll('notes');
  state.folders = await db.getAll('folders');
  log.info('folders', 'Folder deleted', { subfolders: kids.length, notes: inside.length });
  if (state.filter.id === folder.id) state.filter = parent ? { type: 'folder', id: parent.id } : { type: 'all' };
  render();
  scheduleSync();
}

// ---- Note header: folder label and the ⋯ menu ---------------------------------------
function folderLabel(n) {
  const f = folderById(n.folder_id);
  if (modes.hasProjects(modes.kindOf(n))) return f ? modes.projectName(f) : modes.UNSORTED;
  if (!f || modes.isProject(f)) return 'Notes';
  const p = parentOf(f);
  return p ? `${modes.projectName(p)} › ${modes.projectName(f)}` : modes.projectName(f);
}

// One menu for both: a list under its button on a wide screen, a sheet from the bottom on a
// phone. items: [{ label, hint, checked, danger, disabled, run }] or { heading }.
let menuItems = [];
function openMenu(anchor, title, items) {
  const dlg = $('menu-sheet');
  menuItems = items;
  $('menu-title').textContent = title;
  $('menu-items').innerHTML = items.map((it, i) => (it.heading
    ? `<p class="ms-head">${esc(it.heading)}</p>`
    : `<button type="button" class="ms-item${it.danger ? ' danger' : ''}${it.indent ? ' sub' : ''}" role="${it.checked !== undefined ? 'menuitemradio' : 'menuitem'}"${it.checked !== undefined ? ` aria-checked="${!!it.checked}"` : ''} data-i="${i}"${it.disabled ? ' disabled' : ''}><span class="ms-label">${esc(it.label)}</span>${it.hint ? `<span class="ms-hint">${esc(it.hint)}</span>` : ''}</button>`)).join('');
  dlg.style.top = '';
  dlg.style.left = '';
  dlg.showModal();
  if (!isPhone()) {
    const r = anchor.getBoundingClientRect();
    dlg.style.top = `${Math.round(Math.max(8, Math.min(r.bottom + 4, window.innerHeight - dlg.offsetHeight - 8)))}px`;
    dlg.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - dlg.offsetWidth - 8)))}px`;
  }
  (dlg.querySelector('.ms-item[aria-checked="true"]') || dlg.querySelector('.ms-item:not([disabled])'))?.focus();
}
function bindMenuSheet() {
  const dlg = $('menu-sheet');
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('.ms-item');
    if (b) { const it = menuItems[+b.dataset.i]; dlg.close(); it?.run?.(); return; }
    // A click on the backdrop (outside the menu) closes it.
    const r = dlg.getBoundingClientRect();
    if (e.target === dlg && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dlg.close();
  });
}

async function moveToFolder(id) {
  const pf = folderById(id);
  if (modes.isProject(pf)) setPrefs({ [lastProjectKey(modes.projectKind(pf))]: id });
  await updateCurrent({ folder_id: id || null });
}

function openFolderMenu() {
  const n = currentNote();
  if (!n || n.deleted) return;
  const kind = modes.kindOf(n);
  const proj = modes.hasProjects(kind);
  const folders = proj ? liveProjects(kind) : liveFolders();
  const items = [];
  if (!proj) items.push({ label: 'Notes', hint: 'No folder', checked: !folders.some((f) => f.id === n.folder_id), run: () => moveToFolder(null) });
  for (const { f, depth } of proj ? folders.map((f) => ({ f, depth: 0 })) : folderTree()) items.push({ label: modes.projectName(f), indent: depth > 0, checked: f.id === n.folder_id, run: () => moveToFolder(f.id) });
  // Moving a note to another mode lives here now that the mode menu has left the note header.
  items.push({ heading: 'Move to another mode' });
  for (const m of modes.MODES.filter((x) => x.id !== kind)) items.push({ label: m.name, run: () => moveToMode(m.id) });
  openMenu(el.folderBtn, proj ? 'Project' : 'Folder', items);
}

function openNoteMenu() {
  const n = currentNote();
  if (!n) return;
  if (isPhone()) {
    openMenu(el.noteMenu, 'Note', [
      { label: 'Share…', run: async () => { await flushSave(); const x = currentNote(); if (x) shareUi.open([x], { single: true }); } },
      { label: 'Tags…', disabled: n.deleted || n.locked, run: openTagsSheet },
      { label: n.pinned ? 'Unpin' : 'Pin to top', disabled: n.deleted, run: () => { const x = currentNote(); if (x) updateCurrent({ pinned: !x.pinned }); } },
      { label: 'Folder…', disabled: n.deleted, run: () => $('note-folder').click() },
      { label: 'Copy…', disabled: n.deleted || n.locked, run: () => $('btn-copy').click() },
      { label: 'Find…', disabled: n.deleted || n.locked, run: () => (isCode(n.format) ? $('btn-find').click() : writing.openTextFind()) },
      { label: 'Scripture…', disabled: n.deleted || n.locked || isCode(n.format), run: () => bibleUi.open({ insert: true }) },
      { label: 'Look up in the Bible…', disabled: n.deleted || n.locked || isCode(n.format), run: () => bibleUi.open({ insert: true, query: writing.selectedWords() }) },
      { label: 'Search online…', disabled: n.deleted || n.locked || isCode(n.format), run: () => { const q = writing.selectedWords(); if (q) bibleUi.searchOnline(q); else toast('Select some words first'); } },
      { label: 'Note format…', disabled: n.deleted || n.locked, run: () => openFormatMenu() },
      ...phoneViews(n),
      { label: 'Duplicate', disabled: n.deleted || n.locked, run: async () => { const made = await duplicateNotes([currentNote()]); if (made[0]) await selectNote(made[0].id); } },
      { label: 'Versions…', disabled: n.deleted || n.locked, run: openVersions },
      { label: n.deleted ? 'In Recently Deleted' : 'Delete', danger: !n.deleted, disabled: n.deleted, run: deleteCurrent },
    ]);
    return;
  }
  openMenu(el.noteMenu, 'Note', [
    { label: 'Share…', run: async () => { await flushSave(); const x = currentNote(); if (x) shareUi.open([x], { single: true }); } },
    { label: n.pinned ? 'Unpin' : 'Pin to top', disabled: n.deleted, run: () => { const x = currentNote(); if (x) updateCurrent({ pinned: !x.pinned }); } },
    { label: 'Versions…', disabled: n.deleted || n.locked, run: openVersions },
    { label: n.deleted ? 'In Recently Deleted' : 'Delete', danger: !n.deleted, disabled: n.deleted, run: deleteCurrent },
  ]);
}

// ---- Splash: the Reiimei page --------------------------------------------------------
// The definition, covering the whole app. A phone opens on it ("Click here to get started."),
// and tapping it goes to the home page with every folder and tag. On a computer it is shown
// only when the Reiimei name is clicked, as the definition alone, and clicking it goes back to
// where you were. (The empty note area on a computer is a separate copy that starts a new note.)
const splashOpen = () => !$('splash').hidden;
function setSplash(open) {
  $('splash').hidden = !open;
  $('btn-brand').setAttribute('aria-expanded', String(open));
  el.app.dataset.splash = open ? 'on' : 'off';
}
function closeSplash() { if (splashOpen()) setSplash(false); }
function bindSplash() {
  const splash = $('splash');
  const def = el.emptyEditor.querySelector('.definition').cloneNode(true);
  const hint = def.querySelector('.hint-line');
  hint.textContent = 'Click here to get started.';
  splash.append(def);
  $('btn-brand').addEventListener('click', () => {
    const open = !splashOpen();
    if (open) closeSettings();
    setSplash(open);
    log.debug('splash', open ? 'Shown' : 'Hidden');
  });
  const start = (e) => {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (e.currentTarget === splash) { closeSplash(); if (isPhone()) setMobileView('sidebar'); return; }
    newNote();
  };
  for (const box of [splash, el.emptyEditor]) { box.addEventListener('click', start); box.addEventListener('keydown', start); }
}

// ---- Swipes (phone) ------------------------------------------------------------------
// In the note list, swipe a note left to show Delete (swipe all the way to delete it, with Undo),
// or right to show Pin and Share (all the way pins it). In Recently Deleted, left is Delete
// forever and right is Restore. Swipe back, or tap the note, to hide the buttons.
// Swiping in from the left edge goes back a screen, except on a note in the list, where a swipe
// to the right is the note's own.
const SWIPE_L = () => (state.filter.type === 'trash' ? 100 : 150); // buttons on the left (swipe right)
const SWIPE_R = 100;                                               // button on the right (swipe left)
let swipeOpen = null;
let swipedAt = 0;
function setSwipe(item, x, moving) {
  item.style.setProperty('--sx', `${x}px`);
  item.classList.toggle('swiping', moving);
  item.classList.toggle('swiped-left', x < 0);
  item.classList.toggle('swiped-right', x > 0);
}
function closeSwipe() { if (swipeOpen) { setSwipe(swipeOpen, 0, false); swipeOpen = null; } }

function goBack() {
  const v = el.app.dataset.mobileView;
  if (splashOpen() || document.querySelector('dialog[open]')) return;
  if (v === 'editor') $('btn-back-list').click();
  else if (v === 'list') setMobileView('sidebar');
  else if (v === 'settings-detail') setMobileView('settings-list');
  else if (v === 'settings-list') closeSettings();
  else return;
  log.debug('swipe', 'Back', { from: v });
}

async function swipeAction(act, id) {
  const n = state.notes.find((x) => x.id === id);
  closeSwipe();
  if (!n) return;
  log.info('swipe', 'Note action', { act });
  if (act === 'pin') { replaceNote(await db.saveNote(n, { pinned: !n.pinned })); render(); scheduleSync(); toast(n.pinned ? 'Unpinned' : 'Pinned'); return; }
  if (act === 'share') { await flushSave(); shareUi.open([state.notes.find((x) => x.id === id)], { single: true }); return; }
  if (act === 'restore') { replaceNote(await db.restoreNote(n)); render(); scheduleSync(); toast('Restored'); return; }
  if (act === 'purge') {
    const c = await ask({ title: 'Delete this note forever?', text: 'This cannot be undone.', okText: 'Delete forever' });
    if (c.action !== 'ok') return;
    replaceNote(await db.purgeNote(n));
    if (state.currentId === id) state.currentId = null;
    render(); scheduleSync();
    return;
  }
  if (act === 'delete') {
    await flushSave();
    await trashNote(state.notes.find((x) => x.id === id));
    if (state.currentId === id) state.currentId = null;
    render(); scheduleSync();
    toast('Moved to Recently Deleted', 'Undo', async () => {
      const x = state.notes.find((y) => y.id === id);
      if (x?.deleted) { replaceNote(await db.restoreNote(x)); render(); scheduleSync(); }
    });
  }
}

// A tap that ends a swipe is not a tap on the note; a tap on a shown button runs it.
function swipeClick(e, item) {
  if (Date.now() - swipedAt < 250) return true;
  const btn = e.target.closest('[data-swipe]');
  if (btn) { swipeAction(btn.dataset.swipe, item.dataset.id); return true; }
  if (swipeOpen) { closeSwipe(); return true; }
  return false;
}

function bindSwipes(cancelPress) {
  let edge = null;
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    const onNote = !!e.target.closest?.('#note-list .note-item');
    edge = isPhone() && e.touches.length === 1 && t.clientX <= 24 && !onNote ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!edge) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - edge.x;
    const dy = Math.abs(t.clientY - edge.y);
    edge = null;
    if (dx > 70 && dy < 60) goBack();
  }, { passive: true });

  let sw = null;
  el.noteList.addEventListener('touchstart', (e) => {
    const item = e.target.closest('.note-item');
    if (swipeOpen && swipeOpen !== item) closeSwipe();
    if (!item || state.selecting || e.touches.length !== 1 || e.target.closest('[data-swipe]')) { sw = null; return; }
    const cur = parseFloat(item.style.getPropertyValue('--sx')) || 0;
    sw = { item, x0: e.touches[0].clientX, y0: e.touches[0].clientY, base: item === swipeOpen ? cur : 0, dir: null, dx: 0, w: item.offsetWidth };
  }, { passive: true });
  el.noteList.addEventListener('touchmove', (e) => {
    if (!sw) return;
    const t = e.touches[0];
    const dx = t.clientX - sw.x0;
    const dy = t.clientY - sw.y0;
    if (!sw.dir) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) sw.dir = 'h';
      else if (Math.abs(dy) > 8) { sw = null; return; }
      else return;
    }
    e.preventDefault();
    cancelPress();
    sw.dx = dx;
    setSwipe(sw.item, Math.max(-sw.w, Math.min(sw.w, sw.base + dx)), true);
  }, { passive: false });
  const end = () => {
    if (!sw) return;
    const { item, dir, base, dx, w } = sw;
    sw = null;
    if (dir !== 'h') return;
    swipedAt = Date.now();
    const x = base + dx;
    const trash = state.filter.type === 'trash';
    // All the way across: do the main thing straight away.
    if (x < -w * 0.55) { setSwipe(item, -w, false); swipeAction(trash ? 'purge' : 'delete', item.dataset.id); return; }
    if (x > w * 0.55) { setSwipe(item, 0, false); swipeAction(trash ? 'restore' : 'pin', item.dataset.id); return; }
    // Part of the way: show the buttons on that side.
    if (x < -SWIPE_R / 2) { setSwipe(item, -SWIPE_R, false); swipeOpen = item; }
    else if (x > SWIPE_L() / 2) { setSwipe(item, SWIPE_L(), false); swipeOpen = item; }
    else { setSwipe(item, 0, false); if (swipeOpen === item) swipeOpen = null; }
  };
  el.noteList.addEventListener('touchend', end);
  el.noteList.addEventListener('touchcancel', end);
}

// ---- Phone keyboard ----------------------------------------------------------------
// The on-screen keyboard covers the bottom of the page. On a phone the app is sized to the part
// that is still visible, so the ribbon at the foot of the editor sits just above the keyboard.
function trackViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  // While a finger is on the screen (placing the caret, dragging the selection handles) the app is
  // not moved: moving it under the finger put the caret in the wrong place and made selections run
  // away. It catches up as soon as the finger lifts.
  let touching = false;
  let waiting = false;
  const set = (k, v) => { if (root.style.getPropertyValue(k) !== v) root.style.setProperty(k, v); };
  const update = () => {
    if (!isPhone()) { root.style.removeProperty('--vvh'); root.style.removeProperty('--vvt'); delete root.dataset.kb; return; }
    if (touching) { waiting = true; return; }
    waiting = false;
    typingCheck.trace('move-app', { h: Math.round(vv.height), top: Math.round(vv.offsetTop) });
    set('--vvh', `${Math.round(vv.height)}px`);
    set('--vvt', `${Math.round(vv.offsetTop)}px`);
    const kb = window.innerHeight - vv.height > 120 ? 'open' : 'closed';
    if (root.dataset.kb !== kb) root.dataset.kb = kb;
  };
  document.addEventListener('touchstart', () => { touching = true; }, { passive: true, capture: true });
  const lift = (e) => { if (e.touches.length) return; touching = false; if (waiting) requestAnimationFrame(update); };
  document.addEventListener('touchend', lift, { passive: true, capture: true });
  document.addEventListener('touchcancel', lift, { passive: true, capture: true });
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  update();
}

// ---- Sync wiring -------------------------------------------------------
let syncTimer = null;
function scheduleSync(delay = 3000) {
  if (!sync.isConfigured()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}

// Reload records after a sync without ever replacing something newer that the
// screen already holds (an edit saved while the sync was running).
async function reloadFromDb() {
  const [notes, folders] = await Promise.all([db.getAll('notes'), db.getAll('folders')]);
  const held = new Map(state.notes.map((n) => [n.id, n]));
  state.notes = notes.map((n) => { const h = held.get(n.id); return h && !h.locked && h.updated_at > n.updated_at ? h : n; });
  state.folders = folders;
}

async function runSync(reason = 'auto') {
  if (security.isLocked()) return { skipped: 'locked' };
  await flushSave();
  const r = await sync.syncNow(reason);
  if (r?.locked && r.sample) security.askForRemotePassphrase(r.sample);
  if (r && (r.pulled || r.pushed)) {
    // Reload from the database so the UI holds the post-sync records.
    await reloadFromDb();
    await refreshCache();
    await fixResearchNotes();
    await tidyRegistries();
    if (state.filter.type === 'folder' && !folderById(state.filter.id)) state.filter = { type: 'all' };
    render();
  }
  return r;
}

sync.onState((s) => {
  el.syncDot.dataset.status = s.status;
  el.syncText.textContent = s.status === 'idle' && s.lastSync
    ? `Synced ${formatDate(s.lastSync)}`
    : s.message;
  updateSettingsSync();
});

// ---- Startup diagnostics ----------------------------------------------
async function runDiagnostics() {
  const results = [];
  const add = (name, status, detail) => results.push({ name, status, detail });

  add('App version', 'pass', APP_VERSION);
  add('Browser', 'pass', navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  add('Installed app mode', standalone ? 'pass' : 'warn', standalone ? 'Running as installed app' : 'Running in a browser tab (install for best offline use)');
  add('Network', navigator.onLine ? 'pass' : 'warn', navigator.onLine ? 'Online' : 'Offline');
  add('Secure context', window.isSecureContext ? 'pass' : 'fail', window.isSecureContext ? 'HTTPS or localhost' : 'Not secure: offline mode and install will not work');

  try {
    localStorage.setItem(`${KEY}diag`, '1');
    localStorage.removeItem(`${KEY}diag`);
    add('Local storage', 'pass', 'Readable and writable');
  } catch (e) {
    add('Local storage', 'fail', e.message);
  }

  try {
    await db.openDb();
    const [n, f] = await Promise.all([db.getAll('notes'), db.getAll('folders')]);
    add('Note database', 'pass', `${n.filter((x) => !x.deleted).length} notes, ${f.filter((x) => !x.deleted).length} folders, ${n.filter((x) => x.dirty).length + f.filter((x) => x.dirty).length} waiting to sync`);
  } catch (e) {
    add('Note database', 'fail', `IndexedDB unavailable: ${e.message}`);
  }

  if (navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate();
      add('Storage space', 'pass', `${(est.usage / 1048576).toFixed(1)} MB used of ${(est.quota / 1048576).toFixed(0)} MB`);
    } catch (e) { add('Storage space', 'warn', e.message); }
  }
  if (navigator.storage?.persist) {
    try {
      const persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
      add('Persistent storage', persisted ? 'pass' : 'warn', persisted ? 'Granted: the browser will not clear notes to save space' : 'Not granted: keep sync on, or install the app, to protect notes');
    } catch (e) { add('Persistent storage', 'warn', e.message); }
  } else {
    add('Persistent storage', 'warn', 'Not supported by this browser');
  }

  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
    add('Offline support', reg ? 'pass' : 'warn', reg ? `Service worker ${reg.active ? 'active' : 'installing'}` : 'Service worker not registered yet');
  } else {
    add('Offline support', 'fail', 'Service workers not supported');
  }

  add('This device', 'pass', `Named “${device().name}”; ${activeNotes().filter((n) => originOf(n)?.id === device().id).length} notes written here, ${activeNotes().filter((n) => !originOf(n)).length} unlabeled`);
  add('Erased-text cache', 'pass', state.cache ? `Holding ${state.cache.text.length} characters` : 'Empty');
  add('Encryption support', vault.isSupported() ? 'pass' : 'fail', vault.isSupported() ? 'Web Crypto available (AES-GCM, PBKDF2)' : 'Web Crypto missing: encryption cannot be used here');
  const sec = security.status();
  if (sec.enabled) {
    const counts = await db.countSealed().catch(() => null);
    add('Encryption', 'pass', `On: ${counts ? `${counts.sealed} of ${counts.total} items sealed` : 'sealed'}; auto-lock ${sec.autoLockMin ? `after ${sec.autoLockMin} min away` : 'off'}`);
  } else {
    add('Encryption', 'warn', 'Off: notes are stored as plain text (Settings › Security)');
  }
  try {
    const loaded = await Promise.all(['Reiimei Display', 'Echolume'].map((f) => document.fonts.load(`16px "${f}"`).then((r) => r.length > 0)));
    add('Fonts', loaded.every(Boolean) ? 'pass' : 'warn', `Interface and new notes: Reiimei Display${loaded.every(Boolean) ? '' : ' (a bundled font did not load)'}`);
  } catch (e) { add('Fonts', 'warn', e.message); }
  const sh = sharedFileCheck();
  add('Sharing', sh.text ? 'pass' : 'warn', `${sh.text ? 'Share sheet available' : 'No share sheet: use Email, Copy, or Download'}${sh.files ? '; files can be shared' : '; files are downloaded'}`);
  const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  add('Content security policy', csp ? 'pass' : 'warn', csp ? 'Active: scripts load only from this site' : 'Missing');

  const cfg = sync.getConfig();
  const sess = sync.getSession();
  add('Sync', sess ? 'pass' : 'warn', sess ? `Signed in as ${sess.user?.email || 'unknown'} (${cfg?.url})` : 'Not set up: notes stay on this device only');

  state.diagnostics = results;
  results.forEach((r) => log[r.status === 'fail' ? 'error' : r.status === 'warn' ? 'warn' : 'info']('diag', `${r.name}: ${r.detail}`));
  renderDiagnostics();
  return results;
}

function renderDiagnostics() {
  const mark = { pass: '✓', warn: '!', fail: '✕' };
  $('diag-table').innerHTML = state.diagnostics.map((r) =>
    `<tr><td class="${r.status}">${mark[r.status]}</td><td>${esc(r.name)}</td><td>${esc(r.detail)}</td></tr>`).join('');
}

// ---- Settings › Fonts & Styles -----------------------------------------------
function renderSpacingSettings() {
  const d = writing.SPACING_DEFAULT;
  const v = { lh: prefs().lh ?? d.lh, ls: prefs().ls ?? d.ls, ws: prefs().ws ?? d.ws };
  for (const k of ['lh', 'ls', 'ws']) { $(`pref-${k}`).value = String(v[k]); $(`pref-${k}-v`).textContent = k === 'lh' ? String(Math.round(Number(v[k]) * 100) / 100) : `${Number(v[k]).toFixed(2)} em`; }
}
const hiddenFonts = () => (Array.isArray(prefs().hiddenFonts) ? prefs().hiddenFonts.filter((x) => fonts.FONT_IDS.includes(x)) : []);
function renderFontSettings() {
  const hidden = hiddenFonts();
  fonts.fillFontSelect($('pref-ui-font'), { current: fonts.uiFontId(prefs().uiFont) }); // the whole library
  fonts.fillFontSelect($('pref-note-font'), { hidden, current: fonts.fontId(prefs().noteFont) });
  // Every bundled font is always listed here, whatever was saved before.
  $('font-packs').innerHTML = fonts.PACKS.map((p) => {
    const list = fonts.FONTS.filter((f) => f.pack === p.id);
    const on = list.filter((f) => !hidden.includes(f.id)).length;
    return `<div class="font-pack" role="group" aria-label="${esc(p.name)} fonts">
      <div class="font-pack-head"><span class="font-pack-name">${esc(p.name)}</span><span class="font-pack-n">${on} of ${list.length}</span><span class="spacer"></span>
        <button type="button" class="text-btn" data-pack="${p.id}" data-pack-all="all">All</button><button type="button" class="text-btn" data-pack="${p.id}" data-pack-all="none">None</button></div>
      <div class="font-picks">${list.map((f) => `<label class="font-pick"><input type="checkbox" data-font="${f.id}"${hidden.includes(f.id) ? '' : ' checked'}><span class="f-run" data-font="${f.id}">${esc(f.name.replace(/^Ilunir /, ''))}</span></label>`).join('')}</div></div>`;
  }).join('');
}
// Show or leave out fonts. At least one font always stays on offer.
function setFontShown(ids, show) {
  let hidden = new Set(hiddenFonts());
  ids.forEach((id) => (show ? hidden.delete(id) : hidden.add(id)));
  let msg = '';
  if (hidden.size >= fonts.FONT_IDS.length) {
    hidden.delete(ids.includes(fonts.DEFAULT_FONT) ? fonts.DEFAULT_FONT : ids[0]);
    msg = 'At least one font stays ticked.';
  }
  // The default for new notes is always a ticked font.
  const def = fonts.fontId(prefs().noteFont);
  if (hidden.has(def)) {
    const next = fonts.FONTS.find((f) => !hidden.has(f.id)).id;
    setPrefs({ noteFont: next });
    msg = `${msg ? `${msg} ` : ''}New notes now start in ${fonts.fontName(next)}.`;
  }
  setMsg('fonts-msg', msg, msg ? 'ok' : '');
  setPrefs({ hiddenFonts: [...hidden] });
  log.info('prefs', 'Fonts on offer changed', { hidden: hidden.size });
  renderFontSettings();
  writing.renderToolbar(currentNote());
}

// ---- Settings ----------------------------------------------------------
function setMsg(id, text, kind = '') {
  const m = $(id);
  m.textContent = text;
  m.className = 'msg' + (kind ? ` ${kind}` : '');
}

function updateSettingsSync() {
  const sess = sync.getSession();
  $('sync-signed-out').hidden = !!sess;
  $('sync-signed-in').hidden = !sess;
  if (sess) {
    $('sync-email').textContent = sess.user?.email || '';
    const s = sync.getState();
    $('sync-detail').textContent = `${s.message}${s.lastSync ? ` · last sync ${new Date(s.lastSync).toLocaleString()}` : ''}`;
    $('sync-project').textContent = projectHost(sync.getConfig()?.url);
  } else {
    const cfg = sync.getConfig();
    if (cfg && !$('cfg-url').value) { $('cfg-url').value = cfg.url; $('cfg-key').value = cfg.anonKey; }
    $('cfg-summary').textContent = cfg?.url ? projectHost(cfg.url) : 'Not set up';
  }
}

// A function declaration (hoisted), because the sync listener can call this during startup.
function projectHost(url) { try { return new URL(url).host; } catch { return url || ''; } }

// Project URL and key stay folded away once they have worked; open them to change.
function setProjectDetailsOpen(open) {
  $('cfg-details').open = open;
  log.debug('sync', `Project details ${open ? 'shown' : 'collapsed'}`);
}
function collapseProjectDetailsIfVerified() {
  const cfg = sync.getConfig();
  setProjectDetailsOpen(!(cfg?.verified && cfg.url && cfg.anonKey));
}

function openSettings(tab = 'sync', explicitTab = tab !== 'sync') {
  updateSettingsSync();
  collapseProjectDetailsIfVerified();
  security.renderSettings();
  $('pref-format').value = prefs().format;
  $('pref-style').value = prefs().style;
  renderFontSettings();
  renderSpacingSettings();
  $('pref-counter').checked = prefs().counter !== false;
  $('pref-search-site').value = bible.searchSite(prefs().searchSite).id;
  $('pref-brackets').checked = !!prefs().brackets;
  renderDiagnostics();
  $('log-view').textContent = log.exportText() || '(empty)';
  showTab(tab);
  state.settingsOpen = true;
  setFocus(false);
  el.app.dataset.settings = 'on';
  state.prevMobileView = el.app.dataset.mobileView === 'settings-list' || el.app.dataset.mobileView === 'settings-detail' ? state.prevMobileView : el.app.dataset.mobileView;
  flushSave();
  document.querySelector('.list').hidden = true;
  document.querySelector('.editor').hidden = true;
  $('settings-list').hidden = false;
  $('settings-main').hidden = false;
  $('btn-settings').setAttribute('aria-pressed', 'true');
  // On a phone, the gear shows the list of sections; picking a section (or the Aa
  // and sync shortcuts) goes straight to its options.
  setMobileView(explicitTab ? 'settings-detail' : 'settings-list');
}

function closeSettings() {
  if (!state.settingsOpen) return;
  state.settingsOpen = false;
  el.app.dataset.settings = 'off';
  document.querySelector('.list').hidden = false;
  document.querySelector('.editor').hidden = false;
  $('settings-list').hidden = true;
  $('settings-main').hidden = true;
  $('btn-settings').setAttribute('aria-pressed', 'false');
  setMobileView(state.prevMobileView && !state.prevMobileView.startsWith('settings') ? state.prevMobileView : 'list');
}

function showTab(tab) {
  document.querySelectorAll('.tab').forEach((b) => { b.classList.toggle('active', b.dataset.tab === tab); if (b.dataset.tab === tab) $('settings-title').textContent = b.textContent; });
  $('settings-main').querySelector('.settings-body').scrollTop = 0;
  document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  if (tab === 'fonts') renderFontSettings();
  if (tab === 'about') {
    $('about-version').textContent = APP_VERSION;
    $('about-date').textContent = BUILD_DATE;
    $('about-mode').textContent = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'Installed app' : 'Browser tab';
    $('about-device').textContent = device().name || 'Not named yet';
  }
  if (tab === 'log') {
    const v = $('log-view');
    v.textContent = log.exportText() || '(empty)';
    v.scrollTop = v.scrollHeight;
  }
}

async function authAction(kind) {
  const url = $('cfg-url').value.trim();
  const key = $('cfg-key').value.trim();
  const email = $('cfg-email').value.trim();
  const pass = $('cfg-pass').value;
  if (!/^https:\/\/.+/.test(url) || !key) {
    setProjectDetailsOpen(true);
    return setMsg('sync-msg', 'Enter the project URL (https://…) and publishable key.', 'error');
  }
  if (!email || pass.length < 6) return setMsg('sync-msg', 'Enter your email and a password of at least 6 characters.', 'error');
  sync.saveConfig(url, key);
  setMsg('sync-msg', kind === 'up' ? 'Creating account…' : 'Signing in…');
  try {
    const r = kind === 'up' ? await sync.signUp(email, pass) : await sync.signIn(email, pass);
    // The server accepted the URL and key, so fold them away.
    sync.markVerified();
    updateSettingsSync();
    collapseProjectDetailsIfVerified();
    $('cfg-pass').value = '';
    if (r.needsConfirmation) {
      setMsg('sync-msg', 'Account created. Check your email for a confirmation link, then come back and sign in.', 'ok');
      return;
    }
    setMsg('sync-msg', 'Signed in. Syncing…', 'ok');
    updateSettingsSync();
    const s = await runSync('sign-in');
    setMsg('sync-msg', s.error ? s.error : 'Sync is on.', s.error ? 'error' : 'ok');
    runDiagnostics();
  } catch (e) {
    log.error('sync', `${kind === 'up' ? 'Sign-up' : 'Sign-in'} failed`, e);
    // Show the project details when the problem looks like the URL or key.
    if (/fetch|network|load failed|api ?key|apikey|not found|\(40[14]\)|invalid url|cors/i.test(e.message)) {
      setProjectDetailsOpen(true);
      setMsg('sync-msg', `${e.message}. Check the project URL and key.`, 'error');
      return;
    }
    setMsg('sync-msg', e.message, 'error');
  }
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function exportBackup() {
  await flushSave();
  const data = { app: 'reiimei', version: APP_VERSION, exported_at: new Date().toISOString(), notes: await db.getAll('notes'), folders: await db.getAll('folders') };
  download(`reiimei-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
  log.info('backup', 'Backup exported', { notes: data.notes.length, folders: data.folders.length });
  setMsg('data-msg', `Exported ${data.notes.length} notes and ${data.folders.length} folders.${security.isEnabled() ? ' This backup file is not encrypted, so keep it somewhere private.' : ''}`, 'ok');
}

async function importBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!['reiimei', 'inkwell'].includes(data.app) || !Array.isArray(data.notes) || !Array.isArray(data.folders)) throw new Error('This is not a Reiimei backup file.');
    const keepNewer = async (store, rows) => {
      let count = 0;
      for (const r of rows) {
        if (!r.id || typeof r.updated_at !== 'string') continue;
        const local = await db.get(store, r.id);
        if (!local || r.updated_at > local.updated_at) {
          await db.put(store, { ...r, tags: store === 'notes' ? (r.tags || []) : undefined, dirty: true, synced_updated_at: local?.synced_updated_at });
          count++;
        }
      }
      return count;
    };
    const f = await keepNewer('folders', data.folders);
    const n = await keepNewer('notes', data.notes);
    state.notes = await db.getAll('notes');
    state.folders = await db.getAll('folders');
    render();
    scheduleSync(500);
    log.info('backup', 'Backup imported', { notes: n, folders: f });
    setMsg('data-msg', `Imported ${n} notes and ${f} folders.`, 'ok');
  } catch (e) {
    log.error('backup', 'Import failed', e);
    setMsg('data-msg', e.message, 'error');
  }
}

// ---- Events ------------------------------------------------------------
function bindEvents() {
  el.noteMenu.addEventListener('click', openNoteMenu);
  el.folderBtn.addEventListener('click', openFolderMenu);
  bindMenuSheet();
  bindSplash();
  el.title.addEventListener('input', () => {
    if (!state.currentId) return;
    if (/\n/.test(el.title.value)) el.title.value = el.title.value.replace(/\n+/g, ' ');
    fitTitle();
    titlePending = { id: state.currentId, title: el.title.value };
    setSaveState('unsaved');
    clearTimeout(titleTimer);
    titleTimer = setTimeout(flushSave, 400);
  });
  el.title.addEventListener('keydown', (e) => {
    // Enter (or the down arrow at the end) moves on to the text.
    const atEnd = el.title.selectionStart === el.title.value.length;
    if ((e.key === 'Enter' && !e.isComposing) || (e.key === 'ArrowDown' && atEnd)) {
      e.preventDefault();
      writing.focusText(true);
    }
  });
  el.title.addEventListener('blur', async () => {
    await flushSave();
    const n = currentNote();
    if (n && document.activeElement !== el.title) { el.title.value = ownTitle(n); fitTitle(); }
  });
  $('btn-share-list').addEventListener('click', async () => {
    await flushSave();
    shareUi.open(filteredNotes(), { title: listTitle(), single: false });
  });
  $('pref-format').addEventListener('change', (e) => { setPrefs({ format: e.target.value }); log.info('prefs', 'Default format changed', { format: e.target.value }); });
  $('pref-style').addEventListener('change', (e) => { setPrefs({ style: e.target.value }); log.info('prefs', 'Default citation style changed', { style: e.target.value }); });
  for (const k of ['lh', 'ls', 'ws']) $(`pref-${k}`).addEventListener('input', (e) => { setPrefs({ [k]: Number(e.target.value) }); renderSpacingSettings(); writing.applySpacing(currentNote()); });
  $('pref-spacing-reset').addEventListener('click', () => { setPrefs({ lh: null, ls: null, ws: null }); renderSpacingSettings(); writing.applySpacing(currentNote()); });
  $('pref-brackets').addEventListener('change', (e) => setPrefs({ brackets: e.target.checked }));
  $('pref-counter').addEventListener('change', (e) => { setPrefs({ counter: e.target.checked }); writing.renderCount(); });
  $('pref-note-font').addEventListener('change', (e) => { setPrefs({ noteFont: e.target.value }); log.info('prefs', 'Font for new notes changed', { font: e.target.value }); });
  $('font-packs').addEventListener('change', (e) => { const id = e.target.dataset?.font; if (id) setFontShown([id], e.target.checked); });
  $('font-packs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pack-all]');
    if (b) setFontShown(fonts.FONTS.filter((f) => f.pack === b.dataset.pack).map((f) => f.id), b.dataset.packAll === 'all');
  });
  $('pref-ui-font').addEventListener('change', (e) => {
    setPrefs({ uiFont: e.target.value });
    fonts.applyUiFont(e.target.value);
    writing.fitToolbar();
    log.info('prefs', 'Interface font changed', { font: e.target.value });
  });
  $('btn-new-note').addEventListener('click', newNote);
  $('btn-new-folder').addEventListener('click', () => newFolder());
  for (const id of ['btn-folders-toggle', 'btn-folders-chevron']) $(id).addEventListener('click', () => { setPrefs({ foldersOpen: prefs().foldersOpen === false }); renderSidebar(); });
  bindFocusAndWidth();
  // The sidebar folds to a narrow rail of icons on a computer (remembered on this device).
  $('btn-rail').addEventListener('click', () => { setPrefs({ rail: !prefs().rail }); applyRail(); });
  $('btn-back-sidebar').addEventListener('click', () => setMobileView('sidebar'));
  $('btn-back-list').addEventListener('click', async () => { await flushSave(); if (state.currentId) await discardIfBlank(state.currentId); state.currentId = null; render(); setMobileView('list'); });
  $('btn-copy-version').addEventListener('click', async () => {
    const text = `Reiimei ${APP_VERSION} (${BUILD_DATE}), ${device().name || 'unnamed device'}`;
    try { await navigator.clipboard.writeText(text); toast('Version info copied'); } catch { toast(text); }
  });
  $('btn-settings').addEventListener('click', () => { closeSplash(); if (state.settingsOpen) closeSettings(); else openSettings('sync', false); });
  $('btn-settings-back').addEventListener('click', closeSettings);
  $('btn-settings-tabs').addEventListener('click', () => setMobileView('settings-list'));
  $('sync-foot').addEventListener('click', () => openSettings('sync'));

  let longPressed = false;
  el.noteList.addEventListener('click', (e) => {
    if (e.target.closest('.hl-item')) { highlightAction(e); return; }
    if (e.target.closest('.bh-sec')) { bibleHomeAction(e); return; }
    const item = e.target.closest('.note-item');
    if (!item) return;
    if (swipeClick(e, item)) return;
    if (longPressed) { longPressed = false; return; }
    if (state.selecting) toggleSelected(item.dataset.id);
    else if (e.ctrlKey || e.metaKey || e.shiftKey) { state.selecting = true; flushSave(); toggleSelected(item.dataset.id); }
    else selectNote(item.dataset.id);
  });
  bindSwipes(() => clearTimeout(pressTimer));
  // Press and hold a note (phone) to start selecting.
  let pressTimer = null;
  el.noteList.addEventListener('pointerdown', (e) => {
    const item = e.target.closest('.note-item');
    if (!item || state.selecting || e.pointerType === 'mouse') return;
    pressTimer = setTimeout(() => { longPressed = true; state.selecting = true; flushSave(); toggleSelected(item.dataset.id); }, 550);
  });
  for (const t of ['pointerup', 'pointercancel', 'pointermove', 'pointerleave']) el.noteList.addEventListener(t, () => clearTimeout(pressTimer));
  $('tag-filter').addEventListener('click', (e) => { const b = e.target.closest('[data-untag]'); if (b) toggleTagFilter(b.dataset.untag); });
  for (const id of ['btn-tags-toggle', 'btn-tags-chevron']) $(id).addEventListener('click', () => { setPrefs({ tagsOpen: prefs().tagsOpen === false }); renderSidebar(); });
  for (const id of ['btn-bible-toggle', 'btn-bible-chevron']) $(id).addEventListener('click', () => { closeSplash(); selectFilter({ type: 'bible' }); });
  $('btn-passage').addEventListener('click', openPassage);
  // Settings › Formatting › Search online with
  $('pref-search-site').innerHTML = bible.SEARCH_SITES.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  $('pref-search-site').addEventListener('change', (e) => setPrefs({ searchSite: e.target.value }));
  $('btn-select').addEventListener('click', () => setSelecting(!state.selecting));
  $('sel-all').addEventListener('click', () => {
    const notes = filteredNotes();
    if (state.selected.size === notes.length) state.selected.clear(); else notes.forEach((n) => state.selected.add(n.id));
    renderList();
  });
  $('sel-share').addEventListener('click', async () => {
    const notes = selectedNotes();
    if (!notes.length) return;
    await flushSave();
    shareUi.open(selectedNotes(), { title: '', single: notes.length === 1 });
  });
  $('sel-delete').addEventListener('click', deleteSelected);
  $('sel-duplicate').addEventListener('click', async () => { const made = await duplicateNotes(selectedNotes()); if (made.length) { state.selected.clear(); state.selecting = false; render(); } });
  // The Tags sheet (phone): the note's tag row, shown on its own.
  $('btn-tags-done').addEventListener('click', () => $('tags-dialog').close());
  $('tags-dialog').addEventListener('close', () => { const row = $('tag-row'); const top = $('ed-top'); if (row.parentElement !== top) top.insertBefore(row, $('toolbar')); });
  // The phone's top row: back, the title, Undo and Redo, ⋯ (the title moves up beside them).
  const placeTitle = () => {
    const row = $('title-row');
    const head = document.querySelector('.editor-head');
    if (isPhone()) { if (row.parentElement !== head) head.insertBefore(row, head.querySelector('.spacer')); }
    else if (row.parentElement !== $('ed-top')) $('ed-top').insertBefore(row, $('ed-top').firstChild);
  };
  window.matchMedia('(max-width: 760px)').addEventListener('change', placeTitle);
  placeTitle();
  // Settings › Log › Typing check.
  $('btn-typing-check').addEventListener('click', () => {
    if (!typingCheck.recording()) {
      typingCheck.start();
      $('btn-typing-check').textContent = 'Stop and save the check';
      $('typing-check-state').textContent = 'Recording…';
      el.app.dataset.typingCheck = 'on';
      toast('Typing check started. Try the steps in a practice note, then come back here.');
      return;
    }
    const text = typingCheck.stop();
    $('btn-typing-check').textContent = 'Start typing check';
    $('typing-check-state').textContent = '';
    delete el.app.dataset.typingCheck;
    download(`reiimei-typing-check-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`, text, 'text/plain');
    log.info('diag', 'Typing check saved', { lines: text.split('\n').length });
  });
  $('sel-restore').addEventListener('click', restoreSelected);
  $('btn-empty-trash').addEventListener('click', emptyTrash);
  $('btn-purge').addEventListener('click', purgeCurrent);
  $('btn-close-note').addEventListener('click', closeNote);
  $('btn-find-copies').addEventListener('click', findConflictedCopies);
  $('btn-view').addEventListener('click', () => { renderViewDialog(); $('view-msg').textContent = ''; $('view-dialog').showModal(); });
  for (const id of ['view-close', 'view-done']) $(id).addEventListener('click', () => $('view-dialog').close());
  $('view-sort').addEventListener('change', (e) => {
    const sort = e.target.value;
    const byName = sort === 'tag' || sort === 'device';
    setView({ sort, dir: byName ? 'asc' : 'desc' });
    renderViewDialog();
  });
  $('view-dir').addEventListener('change', (e) => setView({ dir: e.target.value }));
  $('view-devices').addEventListener('change', (e) => {
    const id = e.target.dataset.dev;
    if (!id) return;
    const hidden = new Set(view().hidden);
    if (e.target.checked) hidden.delete(id); else hidden.add(id);
    setView({ hidden: [...hidden] });
  });
  $('device-name').addEventListener('change', async (e) => { await renameDevice(e.target.value); renderViewDialog(); $('view-msg').textContent = 'Saved.'; });
  $('btn-mark-mine').addEventListener('click', async () => { const c = await markUnlabeledMine(); render(); renderViewDialog(); $('view-msg').textContent = `Marked ${c} ${c === 1 ? 'note' : 'notes'} as written on this device.`; });
  $('view-reset').addEventListener('click', () => { setPrefs({ view: VIEW_DEFAULT }); renderViewDialog(); renderList(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (splashOpen()) { closeSplash(); return; }
    if (focusOn()) { setFocus(false); return; }
    if (state.settingsOpen) { if (!['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName)) closeSettings(); return; }
    if (state.selecting) { setSelecting(false); return; }
    if (state.currentId && !['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) closeNote();
  });

  let searchTimer = null;
  el.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = el.search.value; renderList(); }, 120);
  });

  // Undo and Redo: the browser's own (the phone's shake, a menu) is turned into the note's.
  for (const box of [el.body, $('rich')]) {
    box.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') { e.preventDefault(); stepHistory(e.inputType === 'historyUndo' ? -1 : 1); return; }
      markChange(e);
    });
    for (const t of ['paste', 'cut', 'drop']) box.addEventListener(t, () => markChange(), true);
    box.addEventListener('keydown', (e) => { if (e.key === 'Enter') markChange(); }, true);
  }
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    if (document.activeElement !== el.body && document.activeElement !== $('rich')) return;
    e.preventDefault();
    stepHistory(k === 'z' && !e.shiftKey ? -1 : 1);
  }, true);
  // A button or menu in the toolbar makes a step of its own.
  $('toolbar').addEventListener('pointerdown', (e) => { if (!e.target.closest('#btn-undo-sheet, #btn-redo-sheet, [data-pb="undo"], [data-pb="redo"], [data-pb="more"]')) markChange(); }, true);
  // Undo and Redo leave the caret (and a phone's keyboard) where they are.
  for (const id of ['btn-undo', 'btn-redo']) for (const t of ['mousedown', 'pointerdown']) $(id).addEventListener(t, (e) => { if (document.activeElement === $('rich') || document.activeElement === el.body) e.preventDefault(); });
  $('btn-undo-sheet').addEventListener('click', () => stepHistory(-1));
  $('btn-redo-sheet').addEventListener('click', () => stepHistory(1));
  $('btn-undo').addEventListener('click', () => stepHistory(-1));
  $('versions-list').addEventListener('click', (e) => { const b = e.target.closest('.version-item'); if (b) showVersion(+b.dataset.i); });
  $('btn-versions-close').addEventListener('click', () => $('versions-dialog').close());
  $('btn-versions-restore').addEventListener('click', restoreVersion);
  if (BETA) {
    $('beta-badge').hidden = false;
    $('about-channel-row').hidden = false;
    document.documentElement.dataset.channel = 'beta';
    document.title = NAME;
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', NAME);
  }
  $('btn-redo').addEventListener('click', () => stepHistory(1));
  el.body.addEventListener('input', () => {
    if (!state.currentId) return;
    recordChange();
    writeDraft(state.currentId, el.body.value);
    pending = { id: state.currentId, body: el.body.value };
    setSaveState('unsaved');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  });
  el.body.addEventListener('blur', flushSave);

  $('mode-switch').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  $('mode-all').addEventListener('click', toggleShowAll);
  $('mode-select').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'all') { if (!state.showAll) toggleShowAll(); } else setMode(v);
  });
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || document.querySelector('dialog[open]')) return;
    const m = modes.MODES.find((x) => x.key === e.key);
    if (m) { e.preventDefault(); setMode(m.id); }
  });
  $('btn-paste-erased').addEventListener('click', pasteErased);
  $('btn-restore').addEventListener('click', async () => {
    await updateCurrent({ deleted: false });
    log.info('editor', 'Note restored', { id: state.currentId });
  });

  // Tags you have used, offered as soon as you click into the box, narrowing as you type; a tag the
  // note already has is not offered, and the list goes when nothing matches.
  let tagPick = -1;
  const tagChoices = () => {
    const n = currentNote();
    if (!n || n.deleted) return [];
    const q = normTag(el.tagInput.value);
    const have = tagsOf(n);
    const all = tagCounts().map(([t]) => t).filter((t) => !have.includes(t));
    if (!q) return all;
    return [...all.filter((t) => t.startsWith(q)), ...all.filter((t) => !t.startsWith(q) && t.includes(q))];
  };
  const hideTags = () => { el.tagSuggest.hidden = true; el.tagInput.setAttribute('aria-expanded', 'false'); tagPick = -1; };
  const showTags = () => {
    const list = tagChoices().slice(0, 12);
    if (!list.length || document.activeElement !== el.tagInput) { hideTags(); return; }
    tagPick = Math.min(tagPick, list.length - 1);
    el.tagSuggest.innerHTML = list.map((t, i) => `<li role="option" class="tag-opt" data-tag="${esc(t)}" aria-selected="${i === tagPick}">#${esc(t)}</li>`).join('');
    el.tagSuggest.hidden = false;
    el.tagInput.setAttribute('aria-expanded', 'true');
  };
  el.tagInput.addEventListener('focus', () => { tagPick = -1; showTags(); });
  el.tagInput.addEventListener('input', () => { tagPick = -1; showTags(); });
  el.tagInput.addEventListener('blur', () => setTimeout(hideTags, 120));
  el.tagSuggest.addEventListener('mousedown', (e) => e.preventDefault());
  el.tagSuggest.addEventListener('click', async (e) => {
    const li = e.target.closest('.tag-opt');
    if (!li) return;
    el.tagInput.value = '';
    await addTag(li.dataset.tag);
    el.tagInput.focus();
    showTags();
  });
  el.tagInput.addEventListener('keydown', (e) => {
    const open = !el.tagSuggest.hidden;
    const opts = [...el.tagSuggest.querySelectorAll('.tag-opt')];
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      if (e.key === 'ArrowDown') tagPick = tagPick + 1 >= opts.length ? -1 : tagPick + 1;
      else tagPick = tagPick - 1 < -1 ? opts.length - 1 : tagPick - 1;
      opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === tagPick)));
      return;
    }
    if (e.key === 'Escape' && open) { e.preventDefault(); hideTags(); return; }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = open && tagPick >= 0 && opts[tagPick] ? opts[tagPick].dataset.tag : el.tagInput.value;
      el.tagInput.value = '';
      addTag(v).then(showTags);
    } else if (e.key === 'Backspace' && !el.tagInput.value) {
      const n = currentNote();
      if (n?.tags?.length) removeTag(n.tags[n.tags.length - 1]);  // own tags only; the project tag is not in n.tags
    }
  });
  el.tagInput.addEventListener('change', () => {
    // A tag typed and left (tapping elsewhere) is added.
    if (el.tagInput.value.trim()) { const v = el.tagInput.value; el.tagInput.value = ''; addTag(v); }
  });
  el.chips.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tag]');
    if (b) removeTag(b.dataset.tag);
  });

  // Settings
  $('btn-close-settings').addEventListener('click', closeSettings);
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { showTab(b.dataset.tab); setMobileView('settings-detail'); }));
  $('btn-signin').addEventListener('click', () => authAction('in'));
  $('btn-signup').addEventListener('click', () => authAction('up'));
  $('btn-sync-now').addEventListener('click', async () => {
    setMsg('sync-msg', 'Syncing…');
    const r = await runSync('manual');
    setMsg('sync-msg', r.error ? r.error : r.skipped ? `Skipped: ${r.skipped}` : `Done: ${r.pushed} sent, ${r.applied} received.`, r.error ? 'error' : 'ok');
  });
  $('btn-test').addEventListener('click', async () => {
    setMsg('sync-msg', 'Testing…');
    try { await sync.testConnection(); sync.markVerified(); setMsg('sync-msg', 'Connection and tables look good.', 'ok'); log.info('sync', 'Connection test passed'); }
    catch (e) { log.error('sync', 'Connection test failed', e); setMsg('sync-msg', `${e.message}. If it mentions a missing table, run supabase-setup.sql.`, 'error'); }
  });
  $('btn-signout').addEventListener('click', async () => {
    const c = await ask({ title: 'Sign out?', text: 'Notes stay on this device. Unsynced changes will upload next time you sign in.', okText: 'Sign out' });
    if (c.action !== 'ok') return;
    await sync.signOut();
    updateSettingsSync();
    setMsg('sync-msg', 'Signed out.');
  });
  $('btn-rerun-diag').addEventListener('click', runDiagnostics);
  $('btn-copy-log').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(log.exportText()); $('btn-copy-log').textContent = 'Copied'; }
    catch { $('btn-copy-log').textContent = 'Copy failed'; }
    setTimeout(() => { $('btn-copy-log').textContent = 'Copy'; }, 1500);
  });
  $('btn-download-log').addEventListener('click', () => download(`reiimei-log-${Date.now()}.txt`, log.exportText(), 'text/plain'));
  $('btn-clear-log').addEventListener('click', () => { log.clear(); $('log-view').textContent = '(empty)'; });
  $('btn-export').addEventListener('click', exportBackup);
  $('import-file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importBackup(f); e.target.value = ''; });

  // Save and sync at the right moments.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
    else scheduleSync(500);
  });
  window.addEventListener('pagehide', flushSave);
  window.addEventListener('resize', fitTitle);
  window.addEventListener('online', () => { log.info('net', 'Back online'); scheduleSync(500); });
  window.addEventListener('offline', () => { log.info('net', 'Went offline'); sync.syncNow('offline-check'); });
  setInterval(() => { if (document.visibilityState === 'visible') scheduleSync(0); }, 60_000);
}

// ---- Service worker ----------------------------------------------------
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    log.warn('sw', 'Service worker not available; offline reload will not work');
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    log.info('sw', 'Service worker registered', { scope: reg.scope });
    reg.addEventListener('updatefound', () => log.info('sw', 'App update downloading'));
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) {
        log.info('sw', 'App updated; new version applies on next launch');
        setSaveState('update');
      }
      hadController = true;
    });
  } catch (e) {
    log.error('sw', 'Service worker registration failed', e);
  }
}

// ---- Data loading (also used after unlocking) ----------------------------
async function loadData() {
  if (modes.MODE_IDS.includes(prefs().mode)) state.mode = prefs().mode;
  [state.notes, state.folders] = await Promise.all([db.getAll('notes'), db.getAll('folders')]);
  // Tidy up: brand-new empty notes left behind are discarded silently.
  for (const n of state.notes.filter((x) => !x.deleted && !x.locked && isBlank(x))) await discardIfBlank(n.id);
  state.notes = await db.getAll('notes');
  await refreshCache();
  await fixResearchNotes();
  await tidyRegistries();
  if (state.filter.type === 'folder' && !folderById(state.filter.id)) state.filter = { type: 'all' };
  if (!state.notes.some((n) => n.id === state.currentId)) state.currentId = isPhone() ? null : filteredNotes()[0]?.id || null;
  await recoverDraft();
  render();
}

function clearData() {
  clearTimeout(saveTimer);
  pending = null;
  state.notes = [];
  state.folders = [];
  state.currentId = null;
  setBody('');
  render();
}

function setEditorText(text) {
  pending = null;
  if (el.body.value !== text) setBody(text);
}

const hooks = {
  note: () => currentNote(),
  update: (changes) => updateCurrent(changes),
  openBible: (o) => bibleUi.open(o),
  searchOnline: (q) => bibleUi.searchOnline(q),
  onBible: () => { renderSidebar(); if (state.filter.type === 'bible') renderList(); },
  addBookmark: (p) => addBookmark(p),
  insertBlocks: (md) => writing.insertBlocks(md),
  menu: (anchor, title, items) => openMenu(anchor, title, items),
  flushSave: () => flushSave(),
  setEditorText,
  ask: (o) => ask(o),
  toast,
  prefs,
  setPrefs: (p) => setPrefs(p),
  flush: () => flushSave(),
  reload: () => loadData(),
  clearData,
  closeSettings: () => closeSettings(),
  runSync: (reason) => runSync(reason),
  syncOn: () => sync.isConfigured(),
  registry: (folderId) => registryOf(folderId),
  inCodingProject: (folderId) => isCodingFolder(folderId),
  projectLabel: (folderId) => { const f = folderById(folderId); return f ? modes.projectName(f) : 'this project'; },
  saveRegistry: (folderId, data) => saveRegistry(folderId, data),
  notesIn: (folderId, mode = 'storyboard') => activeNotes().filter((n) => n.folder_id === folderId && !n.locked && modes.kindOf(n) === mode),
  openNote: async (id) => {
    const n = state.notes.find((x) => x.id === id);
    if (n && !filteredNotes().some((x) => x.id === id)) { state.filter = modes.kindOf(n) === modes.BIBLE ? { type: 'bible' } : { type: 'folder', id: n.folder_id }; state.query = ''; el.search.value = ''; }
    await selectNote(id);
  },
  phone: () => isPhone(),
  highlights: () => highlightMap(),
  setHighlight: (verses, color) => setHighlight(verses, color),
  takeNotes: (passage, title) => takeBibleNotes(passage, title),
  sideBySide: () => renderList(),
  projects: (mode = 'research') => liveProjects(mode).map((f) => ({ id: f.id, name: modes.projectName(f) })),
  projectNotes: (folderId, mode = 'research') => activeNotes().filter((n) => n.folder_id === folderId && !n.locked && modes.kindOf(n) === mode),
  updateNote: async (n, changes) => { replaceNote(await db.saveNote(n, changes)); render(); scheduleSync(); },
  // For sharing: display names, with a subfolder as "Parent / Child" (and a folder inside a folder in archives).
  folders: () => state.folders.map((f) => {
    const p = modes.isProject(f) ? null : parentOf(f);
    const name = modes.projectName(f);
    return { ...f, name: p ? `${modes.projectName(p)} / ${name}` : name, path: p ? [modes.projectName(p), name] : [name] };
  }),
  encrypted: () => security.isEnabled(),
};

// ---- Refresh or new window ------------------------------------------------------------
// The browser says whether a page was reloaded or opened afresh, and each tab or window keeps its
// own session storage. A reload comes back to the same place (the list, the note, the screen,
// the Bible); a new tab or window, or opening the app again, starts on the home screen.
const PLACE_KEY = `${KEY}place`;
function keepPlace() {
  try {
    sessionStorage.setItem(PLACE_KEY, JSON.stringify({
      filter: state.filter, showAll: state.showAll, mode: state.mode, currentId: state.currentId, view: el.app.dataset.mobileView,
      bible: bibleUi.isOpen() ? { side: bibleUi.isSide() } : null,
    }));
  } catch { /* storage not available */ }
}
const reloaded = () => { try { return performance.getEntriesByType('navigation')[0]?.type === 'reload'; } catch { return false; } };
async function resumePlace() {
  let p = null;
  try { p = JSON.parse(sessionStorage.getItem(PLACE_KEY) || 'null'); } catch { p = null; }
  if (!p || !reloaded()) return false;
  if (modes.MODE_IDS.includes(p.mode)) state.mode = p.mode;
  state.showAll = !!p.showAll;
  const f = p.filter || { type: 'all' };
  state.filter = f.type === 'folder' && !folderById(f.id) ? { type: 'all' } : f;
  if (p.currentId && activeNotes().some((n) => n.id === p.currentId)) state.currentId = p.currentId;
  else if (!filteredNotes().some((n) => n.id === state.currentId)) state.currentId = isPhone() ? null : filteredNotes()[0]?.id || null;
  render();
  setMobileView(p.view === 'editor' && !state.currentId ? 'list' : p.view || 'list');
  if (p.bible) await bibleUi.open({ side: p.bible.side });
  log.info('boot', 'Reloaded: back where you were', { filter: state.filter.type, view: p.view });
  return true;
}

// ---- Boot --------------------------------------------------------------
async function boot() {
  const t0 = performance.now();
  log.info('boot', `Reiimei ${APP_VERSION} starting`);
  try {
    fonts.applyUiFont(prefs().uiFont);
    applyRail();
    bindEvents();
    trackViewport();
    writing.init(hooks);
  bibleUi.init(hooks);
    writing.setStyleDefault(() => prefs().style);
    security.init(hooks);
    shareUi.init(hooks);
    await db.openDb();
    // Devices already signed in before v0.4.1 have working project details.
    if (sync.getSession() && sync.getConfig()) sync.markVerified();
    const cfg = await security.loadConfig();
    if (cfg.enabled) {
      log.info('boot', 'Encryption is on; waiting for passphrase');
      await security.requireUnlock();
    }
    await loadData();
    if (!(await resumePlace())) {
      setMobileView('list');
      if (isPhone()) setSplash(true); // a phone opens on the Reiimei page
    }
    window.addEventListener('pagehide', keepPlace);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') keepPlace(); });
    offerDeviceSetup();
    log.info('boot', `UI ready in ${Math.round(performance.now() - t0)} ms`, { notes: state.notes.length, folders: state.folders.length });
  } catch (e) {
    log.error('boot', 'Startup failed', e);
    const banner = document.createElement('div');
    banner.className = 'boot-error';
    banner.textContent = `Reiimei could not start: ${e.message}. Open Settings › Log for details.`;
    document.body.prepend(banner);
  }
  await registerServiceWorker();
  await runDiagnostics();
  if (sync.isConfigured()) runSync('startup');
}

boot();
