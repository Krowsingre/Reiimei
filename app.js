// Reiimei: app controller (UI, state, startup diagnostics).
import { log } from './logger.js';
import * as db from './db.js';
import * as sync from './sync.js';
import * as vault from './crypto.js';
import * as writing from './ui-writing.js';
import * as security from './ui-security.js';
import * as shareUi from './ui-share.js';
import { noteTitle, noteSnippet, sharedFileCheck } from './share.js';

export const APP_VERSION = '0.4.0';

const $ = (id) => document.getElementById(id);
const el = {
  app: $('app'),
  smartList: $('smart-list'), folderList: $('folder-list'), tagList: $('tag-list'),
  listTitle: $('list-title'), noteList: $('note-list'), search: $('search'),
  body: $('body'), folderSel: $('note-folder'), pin: $('btn-pin'), del: $('btn-delete'),
  chips: $('chips'), tagInput: $('tag-input'), tagSuggest: $('tag-suggest'), tagRow: $('tag-row'),
  trashBar: $('trash-bar'), emptyEditor: $('empty-editor'), saveState: $('save-state'),
  syncDot: $('sync-dot'), syncText: $('sync-text'),
};

const state = {
  notes: [],
  folders: [],
  filter: { type: 'all' }, // all | none | folder | tag | trash
  query: '',
  currentId: null,
  diagnostics: [],
};

// ---- Helpers -----------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lines = (body) => body.split('\n').map((l) => l.trim()).filter(Boolean);
// Titles and snippets come from share.js so lists and shared files match.
const titleOf = (n) => noteTitle(n);
const snippetOf = (n) => noteSnippet(n);

// ---- Preferences (per device) ------------------------------------------
const PREFS_KEY = 'reiimei.prefs';
function prefs() {
  try { return { format: 'markdown', style: 'apa', ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; }
  catch { return { format: 'markdown', style: 'apa' }; }
}
function setPrefs(patch) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs(), ...patch })); } catch { /* storage blocked */ }
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
const activeNotes = () => state.notes.filter((n) => !n.deleted);
const liveFolders = () => state.folders.filter((f) => !f.deleted).sort((a, b) => a.name.localeCompare(b.name));
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
  activeNotes().forEach((n) => (n.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function filteredNotes() {
  const f = state.filter;
  let list = f.type === 'trash' ? state.notes.filter((n) => n.deleted) : activeNotes();
  if (f.type === 'folder') list = list.filter((n) => n.folder_id === f.id);
  if (f.type === 'none') list = list.filter((n) => !n.folder_id || !liveFolders().some((x) => x.id === n.folder_id));
  if (f.type === 'tag') list = list.filter((n) => (n.tags || []).includes(f.tag));
  const q = state.query.trim().toLowerCase();
  if (q) {
    const tagQ = q.replace(/^#/, '');
    list = list.filter((n) => n.body.toLowerCase().includes(q) || (n.tags || []).some((t) => t.includes(tagQ)));
  }
  return list.sort((a, b) => (b.pinned - a.pinned) || b.updated_at.localeCompare(a.updated_at));
}

function setMobileView(view) { el.app.dataset.mobileView = view; }
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
  folder: '<svg viewBox="0 0 24 24"><path d="M3 6h6l2 2h10v11H3z"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 17v5"/><path d="M9 10.8V4h6v6.8l3 3.2H6z"/></svg>',
};

function isActive(f) {
  const cur = state.filter;
  return cur.type === f.type && cur.id === f.id && cur.tag === f.tag;
}

function sideItem(filter, icon, name, count, withMore = false) {
  const li = document.createElement('li');
  li.className = 'side-item' + (isActive(filter) ? ' active' : '');
  li.innerHTML = `${ICONS[icon]}<span class="name">${esc(name)}</span>` +
    (withMore ? `<button class="icon-btn more" aria-label="Folder options">${ICONS.more}</button>` : '') +
    `<span class="count">${count}</span>`;
  li.addEventListener('click', (e) => {
    if (e.target.closest('.more')) return;
    selectFilter(filter);
  });
  return li;
}

function renderSidebar() {
  const act = activeNotes();
  const folders = liveFolders();
  const folderIds = new Set(folders.map((f) => f.id));
  el.smartList.replaceChildren(
    sideItem({ type: 'all' }, 'all', 'All Notes', act.length),
    sideItem({ type: 'none' }, 'none', 'Notes', act.filter((n) => !n.folder_id || !folderIds.has(n.folder_id)).length),
  );

  el.folderList.replaceChildren(...folders.map((f) => {
    const li = sideItem({ type: 'folder', id: f.id }, 'folder', f.name, act.filter((n) => n.folder_id === f.id).length, true);
    li.querySelector('.more').addEventListener('click', () => folderMenu(f));
    return li;
  }));
  if (!folders.length) el.folderList.innerHTML = '<li class="side-empty">No folders yet</li>';

  const tags = tagCounts();
  el.tagList.replaceChildren(...tags.map(([t, c]) => sideItem({ type: 'tag', tag: t }, 'tag', t, c)));
  if (!tags.length) el.tagList.innerHTML = '<li class="side-empty">Add tags to a note</li>';

  const trashCount = state.notes.filter((n) => n.deleted).length;
  const trash = sideItem({ type: 'trash' }, 'trash', 'Recently Deleted', trashCount);
  const wrap = document.createElement('div');
  wrap.className = 'side-section';
  wrap.appendChild(trash);
  const existing = document.getElementById('trash-section');
  if (existing) existing.remove();
  wrap.id = 'trash-section';
  el.tagList.parentElement.insertAdjacentElement('afterend', wrap);

  el.tagSuggest.innerHTML = tags.map(([t]) => `<option value="${esc(t)}">`).join('');
}

function listTitle() {
  const f = state.filter;
  if (f.type === 'folder') return liveFolders().find((x) => x.id === f.id)?.name || 'Folder';
  if (f.type === 'tag') return `#${f.tag}`;
  if (f.type === 'trash') return 'Recently Deleted';
  if (f.type === 'none') return 'Notes';
  return 'All Notes';
}

function renderList() {
  el.listTitle.textContent = listTitle();
  const notes = filteredNotes();
  if (!notes.length) {
    el.noteList.innerHTML = `<li class="list-empty">${state.query ? 'No matching notes' : state.filter.type === 'trash' ? 'Nothing deleted' : 'No notes here yet'}</li>`;
    return;
  }
  el.noteList.innerHTML = notes.map((n) => `
    <li class="note-item${n.id === state.currentId ? ' active' : ''}" data-id="${n.id}">
      <div class="title">${n.pinned ? ICONS.pin : ''}<span>${esc(titleOf(n))}</span></div>
      <div class="meta"><span class="date">${esc(formatDate(n.updated_at))}</span><span class="snippet">${esc(snippetOf(n))}</span></div>
      ${(n.tags || []).length ? `<div class="tags">${n.tags.map((t) => `<span class="mini-tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    </li>`).join('');
}

function renderEditor() {
  const n = currentNote();
  const show = !!n;
  el.emptyEditor.hidden = show;
  [el.body, el.tagRow, el.folderSel, el.pin, el.del, $('btn-share')].forEach((x) => { x.hidden = !show; });
  if (!show) { writing.renderToolbar(null); $('preview').hidden = true; }
  el.trashBar.hidden = !(n && n.deleted);
  if (!n) return;

  if (el.body.value !== n.body) {
    const focused = document.activeElement === el.body;
    const { selectionStart, selectionEnd } = el.body;
    el.body.value = n.body;
    if (focused) el.body.setSelectionRange(Math.min(selectionStart, n.body.length), Math.min(selectionEnd, n.body.length));
  }
  el.body.readOnly = n.deleted;
  el.tagInput.disabled = n.deleted;
  el.folderSel.disabled = n.deleted;

  const folders = liveFolders();
  el.folderSel.innerHTML = `<option value="">Notes (no folder)</option>` +
    folders.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  el.folderSel.value = folders.some((f) => f.id === n.folder_id) ? n.folder_id : '';

  el.pin.setAttribute('aria-pressed', String(!!n.pinned));
  el.del.title = n.deleted ? 'Already deleted' : 'Delete';
  el.del.disabled = n.deleted;

  el.chips.innerHTML = (n.tags || []).map((t) =>
    `<span class="chip">#${esc(t)}${n.deleted ? '' : `<button data-tag="${esc(t)}" aria-label="Remove tag ${esc(t)}">×</button>`}</span>`).join('');
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

async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!pending) return;
  const { id, body } = pending;
  pending = null;
  const n = state.notes.find((x) => x.id === id);
  if (!n || body === n.body) return;
  try {
    replaceNote(await db.saveNote(n, { body }));
    el.saveState.textContent = 'Saved';
    renderList();
    renderSidebar();
    scheduleSync();
  } catch (e) {
    log.error('editor', 'Save failed', e);
    el.saveState.textContent = 'Save failed!';
  }
}

async function updateCurrent(changes) {
  await flushSave();
  const n = currentNote();
  if (!n) return;
  replaceNote(await db.saveNote(n, changes));
  render();
  scheduleSync();
}

async function selectNote(id) {
  await flushSave();
  state.currentId = id;
  el.saveState.textContent = '';
  renderList();
  renderEditor();
  if (id) setMobileView('editor');
}

async function selectFilter(filter) {
  await flushSave();
  state.filter = filter;
  const visible = filteredNotes();
  if (!visible.some((n) => n.id === state.currentId)) state.currentId = isPhone() ? null : visible[0]?.id || null;
  render();
  setMobileView('list');
}

async function newNote() {
  await flushSave();
  const f = state.filter;
  if (f.type === 'trash') state.filter = { type: 'all' };
  const p = prefs();
  const note = await db.createNote({
    folder_id: f.type === 'folder' ? f.id : null,
    tags: f.type === 'tag' ? [f.tag] : [],
    format: p.format,
    meta: writing.newNoteMeta(p),
  });
  writing.resetView();
  replaceNote(note);
  state.query = '';
  el.search.value = '';
  state.currentId = note.id;
  render();
  setMobileView('editor');
  el.body.focus();
}

async function deleteCurrent() {
  const n = currentNote();
  if (!n) return;
  await flushSave();
  const list = filteredNotes();
  const idx = list.findIndex((x) => x.id === n.id);
  if (!n.body.trim() && !n.synced_updated_at) {
    // A blank note that never left this device is simply removed.
    await db.remove('notes', n.id);
    state.notes = state.notes.filter((x) => x.id !== n.id);
    log.info('editor', 'Empty note discarded', { id: n.id });
  } else {
    replaceNote(await db.deleteNote(n));
  }
  const remaining = filteredNotes();
  state.currentId = isPhone() ? null : (remaining[idx] || remaining[idx - 1] || null)?.id || null;
  render();
  setMobileView('list');
  scheduleSync();
}

async function addTag(raw) {
  const n = currentNote();
  const tag = normTag(raw);
  if (!n || !tag || (n.tags || []).includes(tag)) return;
  await updateCurrent({ tags: [...(n.tags || []), tag] });
}

async function removeTag(tag) {
  const n = currentNote();
  if (!n) return;
  await updateCurrent({ tags: (n.tags || []).filter((t) => t !== tag) });
  if (state.filter.type === 'tag' && state.filter.tag === tag && !tagCounts().some(([t]) => t === tag)) {
    state.filter = { type: 'all' };
    render();
  }
}

async function newFolder() {
  const r = await ask({ title: 'New folder', value: '', placeholder: 'Folder name', okText: 'Create' });
  if (r.action !== 'ok' || !r.value) return;
  const f = await db.createFolder(r.value.slice(0, 80));
  replaceFolder(f);
  await selectFilter({ type: 'folder', id: f.id });
  scheduleSync();
}

async function folderMenu(folder) {
  const r = await ask({ title: 'Folder', value: folder.name, okText: 'Rename', extra: 'Delete folder', extra2: 'Share folder' });
  if (r.action === 'extra2') {
    shareUi.open(activeNotes().filter((n) => n.folder_id === folder.id), { title: folder.name, single: false });
    return;
  }
  if (r.action === 'ok' && r.value && r.value !== folder.name) {
    replaceFolder(await db.saveFolder(folder, { name: r.value.slice(0, 80) }));
    render();
    scheduleSync();
  } else if (r.action === 'extra') {
    const c = await ask({ title: `Delete "${folder.name}"?`, text: 'Notes in this folder will move to Notes. They will not be deleted.', okText: 'Delete folder' });
    if (c.action !== 'ok') return;
    await db.deleteFolder(folder);
    state.notes = await db.getAll('notes');
    state.folders = await db.getAll('folders');
    if (state.filter.id === folder.id) state.filter = { type: 'all' };
    render();
    scheduleSync();
  }
}

// ---- Sync wiring -------------------------------------------------------
let syncTimer = null;
function scheduleSync(delay = 3000) {
  if (!sync.isConfigured()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}

async function runSync(reason = 'auto') {
  if (security.isLocked()) return { skipped: 'locked' };
  await flushSave();
  const r = await sync.syncNow(reason);
  if (r?.locked && r.sample) security.askForRemotePassphrase(r.sample);
  if (r && (r.pulled || r.pushed)) {
    // Reload from the database so the UI holds the post-sync records.
    state.notes = await db.getAll('notes');
    state.folders = await db.getAll('folders');
    if (state.filter.type === 'folder' && !liveFolders().some((f) => f.id === state.filter.id)) state.filter = { type: 'all' };
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
    localStorage.setItem('reiimei.diag', '1');
    localStorage.removeItem('reiimei.diag');
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

  add('Encryption support', vault.isSupported() ? 'pass' : 'fail', vault.isSupported() ? 'Web Crypto available (AES-GCM, PBKDF2)' : 'Web Crypto missing: encryption cannot be used here');
  const sec = security.status();
  if (sec.enabled) {
    const counts = await db.countSealed().catch(() => null);
    add('Encryption', 'pass', `On: ${counts ? `${counts.sealed} of ${counts.total} items sealed` : 'sealed'}; auto-lock ${sec.autoLockMin ? `after ${sec.autoLockMin} min away` : 'off'}`);
  } else {
    add('Encryption', 'warn', 'Off: notes are stored as plain text (Settings › Security)');
  }
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
  } else {
    const cfg = sync.getConfig();
    if (cfg && !$('cfg-url').value) { $('cfg-url').value = cfg.url; $('cfg-key').value = cfg.anonKey; }
  }
}

function openSettings(tab = 'sync') {
  updateSettingsSync();
  security.renderSettings();
  $('pref-format').value = prefs().format;
  $('pref-style').value = prefs().style;
  renderDiagnostics();
  $('log-view').textContent = log.exportText() || '(empty)';
  showTab(tab);
  $('settings-dialog').showModal();
}

function showTab(tab) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
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
  if (!/^https:\/\/.+/.test(url) || !key) return setMsg('sync-msg', 'Enter the project URL (https://…) and anon key.', 'error');
  if (!email || pass.length < 6) return setMsg('sync-msg', 'Enter your email and a password of at least 6 characters.', 'error');
  sync.saveConfig(url, key);
  setMsg('sync-msg', kind === 'up' ? 'Creating account…' : 'Signing in…');
  try {
    const r = kind === 'up' ? await sync.signUp(email, pass) : await sync.signIn(email, pass);
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
  $('btn-share').addEventListener('click', async () => {
    await flushSave();
    const n = currentNote();
    if (n) shareUi.open([n], { single: true });
  });
  $('btn-share-list').addEventListener('click', async () => {
    await flushSave();
    shareUi.open(filteredNotes(), { title: listTitle(), single: false });
  });
  $('pref-format').addEventListener('change', (e) => { setPrefs({ format: e.target.value }); log.info('prefs', 'Default format changed', { format: e.target.value }); });
  $('pref-style').addEventListener('change', (e) => { setPrefs({ style: e.target.value }); log.info('prefs', 'Default citation style changed', { style: e.target.value }); });
  $('btn-new-note').addEventListener('click', newNote);
  $('btn-new-folder').addEventListener('click', newFolder);
  $('btn-back-sidebar').addEventListener('click', () => setMobileView('sidebar'));
  $('btn-back-list').addEventListener('click', async () => { await flushSave(); state.currentId = null; renderList(); setMobileView('list'); });
  $('btn-settings').addEventListener('click', () => openSettings());
  $('sync-foot').addEventListener('click', () => openSettings('sync'));

  el.noteList.addEventListener('click', (e) => {
    const item = e.target.closest('.note-item');
    if (item) selectNote(item.dataset.id);
  });

  let searchTimer = null;
  el.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = el.search.value; renderList(); }, 120);
  });

  el.body.addEventListener('input', () => {
    if (!state.currentId) return;
    pending = { id: state.currentId, body: el.body.value };
    el.saveState.textContent = 'Editing…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  });
  el.body.addEventListener('blur', flushSave);

  el.folderSel.addEventListener('change', () => updateCurrent({ folder_id: el.folderSel.value || null }));
  el.pin.addEventListener('click', () => { const n = currentNote(); if (n) updateCurrent({ pinned: !n.pinned }); });
  el.del.addEventListener('click', deleteCurrent);
  $('btn-restore').addEventListener('click', async () => {
    await updateCurrent({ deleted: false });
    log.info('editor', 'Note restored', { id: state.currentId });
  });

  el.tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = el.tagInput.value;
      el.tagInput.value = '';
      addTag(v);
    } else if (e.key === 'Backspace' && !el.tagInput.value) {
      const n = currentNote();
      if (n?.tags?.length) removeTag(n.tags[n.tags.length - 1]);
    }
  });
  el.tagInput.addEventListener('change', () => {
    // Picking a suggestion from the datalist fires change.
    if (el.tagInput.value.trim()) { const v = el.tagInput.value; el.tagInput.value = ''; addTag(v); }
  });
  el.chips.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tag]');
    if (b) removeTag(b.dataset.tag);
  });

  // Settings
  $('btn-close-settings').addEventListener('click', () => $('settings-dialog').close());
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('btn-signin').addEventListener('click', () => authAction('in'));
  $('btn-signup').addEventListener('click', () => authAction('up'));
  $('btn-sync-now').addEventListener('click', async () => {
    setMsg('sync-msg', 'Syncing…');
    const r = await runSync('manual');
    setMsg('sync-msg', r.error ? r.error : r.skipped ? `Skipped: ${r.skipped}` : `Done: ${r.pushed} sent, ${r.applied} received.`, r.error ? 'error' : 'ok');
  });
  $('btn-test').addEventListener('click', async () => {
    setMsg('sync-msg', 'Testing…');
    try { await sync.testConnection(); setMsg('sync-msg', 'Connection and tables look good.', 'ok'); log.info('sync', 'Connection test passed'); }
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
        el.saveState.textContent = 'Update ready: reopen app';
      }
      hadController = true;
    });
  } catch (e) {
    log.error('sw', 'Service worker registration failed', e);
  }
}

// ---- Data loading (also used after unlocking) ----------------------------
async function loadData() {
  [state.notes, state.folders] = await Promise.all([db.getAll('notes'), db.getAll('folders')]);
  // Tidy up: brand-new empty notes left behind are discarded silently.
  for (const n of state.notes.filter((x) => !x.deleted && !x.locked && !x.body.trim() && !x.synced_updated_at && !(x.tags || []).length)) {
    await db.remove('notes', n.id);
  }
  state.notes = await db.getAll('notes');
  if (state.filter.type === 'folder' && !liveFolders().some((f) => f.id === state.filter.id)) state.filter = { type: 'all' };
  if (!state.notes.some((n) => n.id === state.currentId)) state.currentId = isPhone() ? null : filteredNotes()[0]?.id || null;
  render();
}

function clearData() {
  clearTimeout(saveTimer);
  pending = null;
  state.notes = [];
  state.folders = [];
  state.currentId = null;
  el.body.value = '';
  render();
}

function setEditorText(text) {
  pending = null;
  if (el.body.value !== text) el.body.value = text;
}

const hooks = {
  note: () => currentNote(),
  update: (changes) => updateCurrent(changes),
  flushSave: () => flushSave(),
  setEditorText,
  ask: (o) => ask(o),
  toast,
  prefs,
  reload: () => loadData(),
  clearData,
  runSync: (reason) => runSync(reason),
  syncOn: () => sync.isConfigured(),
  folders: () => state.folders,
  encrypted: () => security.isEnabled(),
};

// ---- Boot --------------------------------------------------------------
async function boot() {
  const t0 = performance.now();
  log.info('boot', `Reiimei ${APP_VERSION} starting`);
  try {
    bindEvents();
    writing.init(hooks);
    writing.setStyleDefault(() => prefs().style);
    security.init(hooks);
    shareUi.init(hooks);
    await db.openDb();
    const cfg = await security.loadConfig();
    if (cfg.enabled) {
      log.info('boot', 'Encryption is on; waiting for passphrase');
      await security.requireUnlock();
    }
    await loadData();
    setMobileView('list');
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
