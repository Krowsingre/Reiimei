// Reiimei share dialog: one note as text or a file; several notes (a folder,
// a tag, a list, or any notes you check) as one combined document or a .zip.
import { log } from './logger.js';
import * as S from './share.js';
import { isCode, LANGS } from './code.js';

const $ = (id) => document.getElementById(id);
let app = null;
let current = { notes: [], single: false, title: '' };
let mode = 'combined'; // 'combined' | 'archive'

const isApple = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const canShareFiles = () => {
  try { return !!navigator.canShare?.({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] }); } catch { return false; }
};

function msg(text, kind = '') {
  $('share-msg').textContent = text;
  $('share-msg').className = `msg${kind ? ` ${kind}` : ''}`;
}

function chosenNotes() {
  if (current.single) return current.notes;
  const ids = new Set([...$('share-list').querySelectorAll('input:checked')].map((c) => c.value));
  return current.notes.filter((n) => ids.has(n.id));
}

function renderPicker() {
  const list = $('share-list');
  list.innerHTML = current.notes.map((n) => `<li><label class="check"><input type="checkbox" value="${n.id}" checked> <span>${S.noteTitle(n).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</span><span class="share-kind">${isCode(n.format) ? LANGS[n.format].label : n.format === 'populi' ? 'Populi' : ''}</span></label></li>`).join('');
  updateCount();
}

function updateCount() {
  const n = chosenNotes().length;
  $('share-count').textContent = current.single ? '' : `${n} of ${current.notes.length} selected`;
  ['btn-share-file', 'btn-share-download'].forEach((id) => { $(id).disabled = n === 0; });
}

function renderMode() {
  $('share-dialog').querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  $('share-combined-wrap').hidden = mode !== 'combined';
  $('share-archive-hint').hidden = mode !== 'archive';
}

// Open the dialog. notes: array of notes. opts: {title}
export function open(notes, opts = {}) {
  const live = notes.filter((n) => !n.deleted && !n.locked);
  if (!live.length) { app.toast('There are no notes to share here.'); return; }
  current = { notes: live, single: live.length === 1 && opts.single !== false, title: opts.title || '' };
  const one = current.single ? live[0] : null;
  $('share-title').textContent = one ? `Share “${S.noteTitle(one)}”` : `Share ${opts.title ? `notes in ${opts.title}` : 'notes'}`;
  $('share-text-wrap').hidden = !one;
  $('share-pick-wrap').hidden = !!one;
  $('share-mode').hidden = !!one;
  // Text options
  const code = one && isCode(one.format);
  $('share-text-style-wrap').hidden = !!code;
  if (one) $('share-text-style').value = one.format === 'populi' ? 'populi' : 'plain';
  $('btn-share-text').hidden = !navigator.share;
  // File options
  const sel = $('share-format');
  const opt = (v, label) => `<option value="${v}">${label}</option>`;
  sel.innerHTML = (code ? opt('source', `${LANGS[one.format].label} file (.${LANGS[one.format].ext})`) : '') +
    Object.entries(S.COMBINED).map(([k, v]) => opt(k, v.label)).join('');
  sel.value = code ? 'source' : 'docx';
  mode = 'combined';
  renderMode();
  if (!one) renderPicker();
  $('btn-share-file').hidden = !canShareFiles();
  $('share-file-hint').textContent = canShareFiles()
    ? 'Share file opens your share sheet, where you can choose Mail, Messages, or Save to Files.'
    : 'To email the file, download it, then attach it to a message.';
  $('share-enc-hint').hidden = !app.encrypted();
  updateCount();
  msg('');
  $('share-dialog').showModal();
  log.info('share', 'Share dialog opened', { notes: live.length, single: current.single });
}

// ---- Text ---------------------------------------------------------------------------
function textOfOne() {
  const note = current.notes[0];
  return S.noteText(note, isCode(note.format) ? 'plain' : $('share-text-style').value);
}

async function shareText() {
  const note = current.notes[0];
  try {
    await navigator.share({ title: S.noteTitle(note), text: textOfOne() });
    log.info('share', 'Shared note as text');
    msg('Shared.', 'ok');
  } catch (e) {
    if (e?.name !== 'AbortError') { log.warn('share', 'Text share failed', e); msg('Sharing was not available. Try Copy instead.', 'error'); }
  }
}

function launch(href) {
  const a = document.createElement('a');
  a.href = href;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function email() {
  const note = current.notes[0];
  const text = textOfOne();
  launch(`mailto:?subject=${encodeURIComponent(S.noteTitle(note))}&body=${encodeURIComponent(text)}`);
  log.info('share', 'Opened email', { chars: text.length });
  msg(text.length > 1800 ? 'Opened your email app. Some email apps cut off long messages; if yours does, use Share or Copy.' : 'Opened your email app.', text.length > 1800 ? '' : 'ok');
}

function textMessage() {
  const text = textOfOne();
  launch(`${isApple() ? 'sms:&body=' : 'sms:?body='}${encodeURIComponent(text)}`);
  log.info('share', 'Opened messages', { chars: text.length });
  msg('Opened your messages app.', 'ok');
}

async function copyText() {
  try {
    await navigator.clipboard.writeText(textOfOne());
    msg('Copied.', 'ok');
    log.info('share', 'Copied note text');
  } catch (e) {
    log.warn('share', 'Copy failed', e);
    msg('Copying was blocked. Try again.', 'error');
  }
}

// ---- Files ---------------------------------------------------------------------------
function buildFile() {
  const notes = chosenNotes();
  const folders = app.folders();
  if (current.single && $('share-format').value === 'source') {
    const n = notes[0];
    const f = S.nativeFile(n);
    return { name: `${S.safeName(S.noteTitle(n))}.${f.ext}`, type: f.type, data: f.data };
  }
  if (!current.single && mode === 'archive') return S.buildArchive(notes, folders, current.title || 'Reiimei notes');
  const title = current.single ? S.noteTitle(notes[0]) : current.title || 'Reiimei notes';
  return S.buildCombined(notes, folders, $('share-format').value, title);
}

async function shareFile() {
  try {
    const f = buildFile();
    const file = new File([f.data], f.name, { type: f.type });
    if (!navigator.canShare?.({ files: [file] })) { download(); return; }
    await navigator.share({ files: [file], title: f.name });
    log.info('share', 'Shared file', { kind: f.name.split('.').pop(), notes: chosenNotes().length });
    msg(`Shared ${f.name}.`, 'ok');
  } catch (e) {
    if (e?.name === 'AbortError') return;
    log.warn('share', 'File share failed; downloading instead', e);
    download();
  }
}

function download() {
  const f = buildFile();
  const blob = new Blob([f.data], { type: f.type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  log.info('share', 'Downloaded file', { kind: f.name.split('.').pop(), notes: chosenNotes().length, bytes: blob.size });
  msg(`Saved ${f.name}.`, 'ok');
}

export function init(hooks) {
  app = hooks;
  $('btn-close-share').addEventListener('click', () => $('share-dialog').close());
  $('btn-share-text').addEventListener('click', shareText);
  $('btn-share-email').addEventListener('click', email);
  $('btn-share-sms').addEventListener('click', textMessage);
  $('btn-share-copy').addEventListener('click', copyText);
  $('btn-share-file').addEventListener('click', shareFile);
  $('btn-share-download').addEventListener('click', download);
  $('share-list').addEventListener('change', updateCount);
  $('btn-share-all').addEventListener('click', () => { $('share-list').querySelectorAll('input').forEach((c) => { c.checked = true; }); updateCount(); });
  $('btn-share-none').addEventListener('click', () => { $('share-list').querySelectorAll('input').forEach((c) => { c.checked = false; }); updateCount(); });
  $('share-dialog').querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; renderMode(); }));
}
