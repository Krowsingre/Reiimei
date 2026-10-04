// Reiimei Storyboard screens: scene-card board, registers and dossiers, continuity check.
import { log } from './logger.js';
import * as F from './format.js';
import * as modes from './modes.js';
import * as K from './storyboard.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => F.escapeHtml(String(t ?? ''));
let app = null;
let boardOn = true;      // scene cards instead of text (remembered per device)
let dragFrom = -1;

export const isStoryNote = (note) => !!note && !note.deleted && modes.kindOf(note) === 'storyboard';
const boardShown = (note, code, previewOn) => isStoryNote(note) && !code && boardOn && !previewOn;

// ---- Toolbar and board -------------------------------------------------------------
export function renderToolbar(note, code = false, previewOn = false) {
  const on = isStoryNote(note) && !code;
  ['btn-board', 'btn-registers', 'btn-continuity'].forEach((id) => { $(id).hidden = !on; });
  $('btn-board').setAttribute('aria-pressed', String(boardOn));
  const show = !!note && boardShown(note, code, previewOn);
  $('board').hidden = !show;
  if (show) {
    $('body').hidden = true;
    $('btn-preview').hidden = true;
    $('tool-buttons').querySelectorAll('.tool').forEach((b) => { b.disabled = true; });
    renderBoard();
  } else if (note && !previewOn && !code) {
    // Back to text: the textarea is shown again by the normal editor.
    $('body').hidden = false;
  }
}

function currentDoc() { return K.parseScenes($('body').value); }

function commit(doc) {
  const ta = $('body');
  ta.value = K.serializeScenes(doc);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  renderBoard();
}

const titleOf = (pre) => (String(pre || '').split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean) || '');
function withTitle(pre, title) {
  const lines = String(pre || '').split('\n');
  const i = lines.findIndex((l) => l.trim());
  const t = title.trim();
  if (i < 0) return t ? `# ${t}` : '';
  lines[i] = t ? `# ${t}` : '';
  return lines.join('\n');
}

const STATUS_CLASS = { idea: 'st-idea', drafted: 'st-drafted', final: 'st-final', '': 'st-none' };

export function renderBoard() {
  const box = $('board');
  const note = app.note();
  if (!note || box.hidden) return;
  const doc = currentDoc();
  const p = K.progress(doc);
  const ro = !!note.deleted;
  const prog = p.total
    ? `${p.final} of ${p.total} final · ${p.drafted} drafted · ${p.idea + p.none} ${p.idea + p.none === 1 ? 'idea' : 'ideas'}`
    : 'No scenes yet';
  const bar = p.total ? `<div class="bd-bar" aria-hidden="true"><span class="f" style="width:${(p.final / p.total) * 100}%"></span><span class="d" style="width:${(p.drafted / p.total) * 100}%"></span></div>` : '';
  box.innerHTML = `<div class="bd-head">
      <input class="bd-title" id="bd-title" aria-label="Storyboard title" placeholder="Storyboard title" value="${esc(titleOf(doc.pre))}"${ro ? ' disabled' : ''}>
      <div class="bd-actions">
        <button class="btn small primary" id="bd-add"${ro ? ' disabled' : ''}>Add scene</button>
        <button class="btn small" id="bd-script">Copy script</button>
      </div>
    </div>
    <p class="bd-progress">${esc(prog)}</p>${bar}
    <div class="bd-cards" id="bd-cards">${doc.scenes.map((s, i) => `
      <article class="card" draggable="${ro ? 'false' : 'true'}" data-i="${i}">
        <header><span class="no">${i + 1}</span><h4>${esc(s.title || 'Untitled scene')}</h4>
          <button class="chip-btn ${STATUS_CLASS[s.status || '']}" data-act="status" title="Change status"${ro ? ' disabled' : ''}>${esc(K.STATUS[s.status] || 'No status')}</button></header>
        <p class="cd-meta">${[s.location, s.time].filter(Boolean).map(esc).join(' · ')}</p>
        ${s.characters ? `<p class="cd-chars">${esc(s.characters)}</p>` : ''}
        <p class="cd-text">${esc(s.text)}</p>
        <footer>
          <button class="mv" data-act="left" aria-label="Move scene earlier" title="Move earlier"${ro || i === 0 ? ' disabled' : ''}>←</button>
          <button class="mv" data-act="right" aria-label="Move scene later" title="Move later"${ro || i === doc.scenes.length - 1 ? ' disabled' : ''}>→</button>
          <span class="spacer"></span>
          <button class="btn small" data-act="edit"${ro ? ' disabled' : ''}>Edit</button>
        </footer>
      </article>`).join('')}${doc.scenes.length ? '' : '<p class="bd-empty">Add a scene to begin. Each scene is a card with a place, a time, who is in it, and what happens.</p>'}</div>`;
}

// ---- Scene editor ---------------------------------------------------------------------
let editing = -1;
function registeredNames(type) {
  const reg = app.registry(app.note().folder_id);
  return reg.registers.filter((r) => r.type === type).flatMap((r) => r.agents.map((a) => a.name));
}

function openScene(i) {
  const doc = currentDoc();
  const s = i >= 0 ? doc.scenes[i] : K.blankScene(doc.scenes.length + 1);
  editing = i;
  $('scene-dialog-title').textContent = i >= 0 ? 'Edit scene' : 'Add scene';
  $('sc-title').value = s.title; $('sc-location').value = s.location; $('sc-time').value = s.time;
  $('sc-characters').value = s.characters; $('sc-status').value = s.status || 'idea'; $('sc-text').value = s.text;
  $('sc-delete').hidden = i < 0;
  $('sc-locations').innerHTML = registeredNames('location').map((n) => `<option value="${esc(n)}">`).join('');
  $('sc-chars').innerHTML = registeredNames('character').map((n) => `<option value="${esc(n)}">`).join('');
  $('scene-dialog').showModal();
}

function saveScene() {
  const doc = currentDoc();
  const s = {
    title: $('sc-title').value.trim() || `Scene ${doc.scenes.length + 1}`, location: $('sc-location').value.trim(), time: $('sc-time').value.trim(),
    characters: $('sc-characters').value.trim(), status: K.normStatus($('sc-status').value) || 'idea', text: $('sc-text').value.replace(/^\n+|\n+$/g, ''),
  };
  // A line of the text that looks like a detail would be read as one next time; keep text safe.
  if (editing >= 0) doc.scenes[editing] = s; else doc.scenes.push(s);
  commit(doc);
  log.info('storyboard', editing >= 0 ? 'Scene edited' : 'Scene added');
}

async function boardClick(e) {
  const note = app.note();
  if (!note || note.deleted) { if (e.target.id === 'bd-script') copyScript(); return; }
  if (e.target.id === 'bd-add') { openScene(-1); return; }
  if (e.target.id === 'bd-script') { copyScript(); return; }
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const i = +btn.closest('.card').dataset.i;
  const doc = currentDoc();
  if (btn.dataset.act === 'edit') openScene(i);
  else if (btn.dataset.act === 'left' || btn.dataset.act === 'right') {
    if (K.moveScene(doc, i, btn.dataset.act === 'left' ? -1 : 1)) { commit(doc); log.info('storyboard', 'Scene moved'); }
  } else if (btn.dataset.act === 'status') {
    const cur = K.STATUS_ORDER.indexOf(doc.scenes[i].status);
    doc.scenes[i].status = K.STATUS_ORDER[(cur + 1) % K.STATUS_ORDER.length];
    commit(doc);
  }
}

async function copyScript() {
  const text = K.scenesToScript($('body').value);
  try { await navigator.clipboard.writeText(text); app.toast('Script copied'); } catch { app.toast('Copying was blocked. Try again.'); }
  log.info('storyboard', 'Script copied');
}

// ---- Registers ----------------------------------------------------------------------------
let reg = null;          // working copy of the project's registers
let regFolder = null;
let rv = { view: 'list', regId: null, agentId: null };
let saveT = null;

function persist(now = false) {
  clearTimeout(saveT);
  const go = () => app.saveRegistry(regFolder, reg).catch((e) => log.error('registers', 'Save failed', e));
  if (now) return go();
  saveT = setTimeout(go, 500);
  return null;
}

const regOf = (id) => reg.registers.find((r) => r.id === id);
const projectLabel = () => app.projects('storyboard').find((p) => p.id === regFolder)?.name || 'this project';

function renderRegisters() {
  $('reg-title').textContent = `Registers · ${projectLabel()}`;
  const box = $('reg-body');
  if (rv.view === 'list') {
    box.innerHTML = `<p class="hint">A register lists one kind of thing in your story: characters, places, items. Only what is in a register is checked for continuity.</p>
      <ul class="source-list">${reg.registers.map((r) => `<li data-id="${r.id}"><p class="ref-text"><strong>${esc(r.name)}</strong> <span class="badge">${esc(K.REGISTER_TYPES[r.type])}</span></p>
        <p class="src-note">${r.agents.length} ${r.agents.length === 1 ? 'entry' : 'entries'}${r.sections.length ? ` · ${r.sections.length} ${r.sections.length === 1 ? 'section' : 'sections'}` : ''}</p>
        <div class="src-actions"><button class="btn small" data-act="open-reg">Open</button></div></li>`).join('') || '<li class="src-empty">No registers yet.</li>'}</ul>
      <div class="row">
        <select id="rg-type" aria-label="Register type">${Object.entries(K.REGISTER_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <input id="rg-name" placeholder="Name (needed for Custom)" autocomplete="off">
        <button class="btn primary" data-act="add-reg">New register</button>
      </div><p class="msg" id="rg-msg" role="status"></p>`;
  } else if (rv.view === 'register') {
    const r = regOf(rv.regId);
    const groups = [{ id: '', name: 'No section' }, ...r.sections];
    box.innerHTML = `<div class="row"><button class="btn small" data-act="back">← Registers</button><input id="rg-rename" value="${esc(r.name)}" aria-label="Register name"><button class="btn small danger" data-act="del-reg">Delete register</button></div>
      <h4>Sections</h4>
      <div class="rg-chips">${r.sections.map((s) => `<span class="chip" data-sec="${s.id}">${esc(s.name)}<button data-act="del-sec" aria-label="Remove section ${esc(s.name)}">×</button></span>`).join('') || '<span class="hint tiny">No sections. Use them for groups such as Family or Crew.</span>'}</div>
      <div class="row"><input id="rg-sec" placeholder="New section" autocomplete="off"><button class="btn small" data-act="add-sec">Add section</button></div>
      <h4>Entries</h4>
      ${groups.map((g) => { const items = r.agents.filter((a) => (a.section || '') === g.id); if (!items.length && g.id) return `<p class="rg-sec">${esc(g.name)}</p><p class="hint tiny">Empty</p>`; if (!items.length) return ''; return `<p class="rg-sec">${esc(g.name)}</p><ul class="source-list">${items.map((a) => `<li data-id="${a.id}"><p class="ref-text">${esc(a.name)}${a.aliases.length ? ` <span class="src-note">also ${esc(a.aliases.join(', '))}</span>` : ''}</p><div class="src-actions"><span class="src-key">${a.facts.length} ${a.facts.length === 1 ? 'fact' : 'facts'}</span><button class="btn small" data-act="open-agent">Dossier</button></div></li>`).join('')}</ul>`; }).join('')}
      ${r.agents.length ? '' : '<p class="hint">Nothing here yet.</p>'}
      <div class="row"><input id="rg-agent" placeholder="Name" autocomplete="off"><select id="rg-agent-sec" aria-label="Section"><option value="">No section</option>${r.sections.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><button class="btn primary" data-act="add-agent">Add</button></div>`;
  } else {
    const r = regOf(rv.regId); const a = r.agents.find((x) => x.id === rv.agentId);
    $('reg-fact-labels').innerHTML = K.SUGGESTED_FACTS[r.type].map((l) => `<option value="${esc(l)}">`).join('');
    box.innerHTML = `<div class="row"><button class="btn small" data-act="back-reg">← ${esc(r.name)}</button><button class="btn small danger" data-act="del-agent">Delete entry</button></div>
      <label>Name<input id="ag-name" value="${esc(a.name)}" autocomplete="off"></label>
      <label>Also called (separate with commas)<input id="ag-aliases" value="${esc(a.aliases.join(', '))}" autocomplete="off"></label>
      <label>Section<select id="ag-section"><option value="">No section</option>${r.sections.map((s) => `<option value="${s.id}"${a.section === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <h4>Facts</h4><p class="hint tiny">Facts are what the continuity check compares against. Try Home, Eyes, Hair, Age, Occupation, or your own.</p>
      <div id="ag-facts">${a.facts.map((f) => `<div class="fact" data-id="${f.id}"><input data-f="label" list="reg-fact-labels" value="${esc(f.label)}" placeholder="Label" aria-label="Fact label" autocomplete="off"><input data-f="value" value="${esc(f.value)}" placeholder="Value" aria-label="Fact value" autocomplete="off"><button class="icon-btn" data-act="del-fact" aria-label="Remove fact"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>`).join('')}</div>
      <button class="btn small" data-act="add-fact">Add fact</button>
      <label>Dossier notes<textarea id="ag-notes" rows="8" placeholder="Everything else you know: history, habits, secrets">${esc(a.notes)}</textarea></label>`;
  }
}

async function regClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  const li = btn.closest('li');
  if (act === 'open-reg') { rv = { view: 'register', regId: li.dataset.id }; }
  else if (act === 'add-reg') {
    const type = $('rg-type').value; const name = $('rg-name').value.trim();
    if (type === 'custom' && !name) { $('rg-msg').textContent = 'Give a custom register a name.'; return; }
    const r = K.newRegister(type, name || K.REGISTER_TYPES[type]);
    reg.registers.push(r); persist(); rv = { view: 'register', regId: r.id };
  } else if (act === 'back') { rv = { view: 'list' }; }
  else if (act === 'del-reg') {
    const r = regOf(rv.regId);
    const c = await app.ask({ title: `Delete "${r.name}"?`, text: `Its ${r.agents.length} entries and their dossiers will be deleted.`, okText: 'Delete register' });
    if (c.action !== 'ok') { renderRegisters(); return; }
    reg.registers = reg.registers.filter((x) => x.id !== r.id); persist(); rv = { view: 'list' };
  } else if (act === 'add-sec') {
    const v = $('rg-sec').value.trim(); if (!v) return;
    regOf(rv.regId).sections.push({ id: K.newId(), name: v.slice(0, 60) }); persist();
  } else if (act === 'del-sec') {
    const r = regOf(rv.regId); const id = btn.closest('[data-sec]').dataset.sec;
    r.sections = r.sections.filter((s) => s.id !== id); r.agents.forEach((a) => { if (a.section === id) a.section = ''; }); persist();
  } else if (act === 'add-agent') {
    const v = $('rg-agent').value.trim(); if (!v) return;
    const a = K.newAgent(v, $('rg-agent-sec').value); regOf(rv.regId).agents.push(a); persist(); rv = { view: 'agent', regId: rv.regId, agentId: a.id };
  } else if (act === 'open-agent') { rv = { view: 'agent', regId: rv.regId, agentId: li.dataset.id }; }
  else if (act === 'back-reg') { rv = { view: 'register', regId: rv.regId }; }
  else if (act === 'del-agent') {
    const r = regOf(rv.regId); const a = r.agents.find((x) => x.id === rv.agentId);
    const c = await app.ask({ title: `Delete "${a.name}"?`, text: 'The entry and its dossier will be deleted.', okText: 'Delete entry' });
    if (c.action !== 'ok') { renderRegisters(); return; }
    r.agents = r.agents.filter((x) => x.id !== a.id); persist(); rv = { view: 'register', regId: r.id };
  } else if (act === 'add-fact') {
    const r = regOf(rv.regId); const a = r.agents.find((x) => x.id === rv.agentId);
    a.facts.push(K.newFact()); persist(); renderRegisters(); const rows = document.querySelectorAll('#ag-facts .fact'); rows[rows.length - 1]?.querySelector('input').focus(); return;
  } else if (act === 'del-fact') {
    const r = regOf(rv.regId); const a = r.agents.find((x) => x.id === rv.agentId);
    a.facts = a.facts.filter((f) => f.id !== btn.closest('.fact').dataset.id); persist();
  }
  renderRegisters();
}

function regInput(e) {
  const t = e.target;
  if (rv.view === 'register' && t.id === 'rg-rename') { const r = regOf(rv.regId); r.name = t.value.slice(0, 60) || r.name; persist(); $('reg-title').textContent = `Registers · ${projectLabel()}`; return; }
  if (rv.view !== 'agent') return;
  const r = regOf(rv.regId); const a = r.agents.find((x) => x.id === rv.agentId);
  if (t.id === 'ag-name') a.name = t.value.slice(0, 80);
  else if (t.id === 'ag-aliases') a.aliases = t.value.split(',').map((x) => x.trim()).filter(Boolean);
  else if (t.id === 'ag-section') a.section = t.value;
  else if (t.id === 'ag-notes') a.notes = t.value;
  else if (t.dataset.f) { const f = a.facts.find((x) => x.id === t.closest('.fact').dataset.id); if (f) f[t.dataset.f] = t.value; }
  else return;
  persist();
}

async function openRegisters() {
  const note = app.note();
  if (!isStoryNote(note)) return;
  await app.flush();
  regFolder = note.folder_id;
  reg = JSON.parse(JSON.stringify(app.registry(regFolder)));
  rv = { view: 'list' };
  renderRegisters();
  $('registers-dialog').showModal();
}

async function closeRegisters() {
  await persist(true);
  $('registers-dialog').close();
  if (!$('board').hidden) renderBoard();
}

// ---- Continuity check ------------------------------------------------------------------------
let scope = 'note';
let results = [];
let contReg = null;

const mark = (f) => {
  const s = f.sentence; const at = s.toLowerCase().indexOf(f.found.toLowerCase());
  return at < 0 ? esc(s) : `${esc(s.slice(0, at))}<mark>${esc(s.slice(at, at + f.found.length))}</mark>${esc(s.slice(at + f.found.length))}`;
};

function renderFindings() {
  $('cont-list').innerHTML = results.map((f, i) => `<li data-i="${i}">
      <p class="ref-text"><strong>${esc(f.agent)}</strong> · ${esc(f.label)}: the register says <em>${esc(f.dossier)}</em>, the note says <em>${esc(f.found)}</em></p>
      <p class="src-note">${esc(f.noteTitle)}: “${mark(f)}”</p>
      <div class="src-actions"><button class="btn small" data-act="go">Go to it</button><button class="btn small" data-act="accept">Update the register</button><button class="btn small" data-act="dismiss">It is intended</button></div></li>`).join('');
}

async function runContinuity() {
  const note = app.note();
  await app.flush();
  contReg = JSON.parse(JSON.stringify(app.registry(note.folder_id)));
  const notes = (scope === 'note' ? [app.note()] : app.notesIn(note.folder_id)).map((n) => ({ id: n.id, title: String(n.meta?.title || '').trim() || (n.id === note.id ? $('body').value : n.body).split('\n')[0].replace(/^#+\s*/, '') || 'Untitled', body: n.id === note.id ? $('body').value : n.body }));
  const r = K.checkContinuity(contReg, notes);
  results = r.findings;
  const regs = contReg.registers.reduce((s, x) => s + x.agents.length, 0);
  $('cont-msg').textContent = !regs
    ? 'There is nothing in the registers to check against yet. Add entries with facts in Registers.'
    : r.findings.length
      ? `${r.findings.length} possible ${r.findings.length === 1 ? 'discrepancy' : 'discrepancies'} in ${r.notesChecked} ${r.notesChecked === 1 ? 'note' : 'notes'}.`
      : `No discrepancies found. Checked ${r.notesChecked} ${r.notesChecked === 1 ? 'note' : 'notes'} against ${r.agentsChecked} registered ${r.agentsChecked === 1 ? 'entry' : 'entries'} that have facts.`;
  log.info('continuity', 'Check run', { scope, notes: r.notesChecked, agents: r.agentsChecked, found: r.findings.length });
  renderFindings();
}

function locate(body, f) {
  if (body.slice(f.foundAt, f.foundAt + f.foundLen) === f.found) return f.foundAt;
  const s = body.indexOf(f.sentence);
  if (s >= 0) { const k = f.sentence.toLowerCase().indexOf(f.found.toLowerCase()); return s + Math.max(0, k); }
  return -1;
}

async function contClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const i = +btn.closest('li').dataset.i;
  const f = results[i];
  if (!f) return;
  if (btn.dataset.act === 'go') {
    $('continuity-dialog').close();
    await app.openNote(f.noteId);
    boardOn = false; app.setPrefs({ board: false });
    renderToolbar(app.note(), false, false);
    const ta = $('body');
    const at = locate(ta.value, f);
    ta.hidden = false; ta.focus();
    if (at >= 0) ta.setSelectionRange(at, at + f.foundLen);
    // Bring the selection into view.
    const blur = ta.value.slice(0, at);
    ta.scrollTop = Math.max(0, (blur.split('\n').length - 3) * 24);
    if (at < 0) app.toast('That sentence has changed. Run the check again.');
    return;
  }
  const folder = app.note().folder_id;
  const data = JSON.parse(JSON.stringify(app.registry(folder)));
  if (btn.dataset.act === 'dismiss') {
    data.dismissed = [...new Set([...(data.dismissed || []), f.key])];
  } else if (btn.dataset.act === 'accept') {
    const fact = data.registers.flatMap((r) => r.agents).find((a) => a.id === f.agentId)?.facts.find((x) => x.id === f.factId);
    if (fact) fact.value = f.found;
  }
  await app.saveRegistry(folder, data);
  log.info('continuity', btn.dataset.act === 'dismiss' ? 'Finding dismissed' : 'Register updated from a note');
  results = results.filter((_, k) => k !== i);
  renderFindings();
  $('cont-msg').textContent = results.length ? `${results.length} left.` : 'All reviewed.';
}

// ---- Wiring ---------------------------------------------------------------------------------------
export function init(hooks) {
  app = hooks;
  boardOn = app.prefs().board !== false;
  $('btn-board').addEventListener('click', () => {
    boardOn = !boardOn;
    app.setPrefs({ board: boardOn });
    const n = app.note();
    renderToolbar(n, false, false);
    if (!boardOn) $('body').hidden = false;
  });
  $('board').addEventListener('click', boardClick);
  $('board').addEventListener('input', (e) => {
    if (e.target.id !== 'bd-title') return;
    const doc = currentDoc();
    doc.pre = withTitle(doc.pre, e.target.value);
    const ta = $('body');
    ta.value = K.serializeScenes(doc);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Drag and drop (mouse); the arrow buttons do the same on a phone.
  $('board').addEventListener('dragstart', (e) => { const c = e.target.closest('.card'); if (!c) return; dragFrom = +c.dataset.i; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(dragFrom)); } catch { /* ignore */ } c.classList.add('dragging'); });
  $('board').addEventListener('dragover', (e) => { if (dragFrom >= 0 && e.target.closest('.card')) e.preventDefault(); });
  $('board').addEventListener('dragend', () => { dragFrom = -1; $('board').querySelectorAll('.dragging').forEach((c) => c.classList.remove('dragging')); });
  $('board').addEventListener('drop', (e) => {
    const c = e.target.closest('.card');
    if (!c || dragFrom < 0) return;
    e.preventDefault();
    const doc = currentDoc();
    if (K.reorderScene(doc, dragFrom, +c.dataset.i)) { commit(doc); log.info('storyboard', 'Scene dragged'); }
    dragFrom = -1;
  });
  $('scene-form').addEventListener('submit', (e) => { if (e.submitter?.value === 'save') saveScene(); });
  $('sc-delete').addEventListener('click', async () => {
    const doc = currentDoc();
    const s = doc.scenes[editing];
    $('scene-dialog').close();
    const c = await app.ask({ title: `Delete "${s?.title || 'this scene'}"?`, text: 'The scene card and its text will be removed from the note.', okText: 'Delete scene' });
    if (c.action !== 'ok') return;
    doc.scenes.splice(editing, 1);
    commit(doc);
    log.info('storyboard', 'Scene deleted');
  });
  $('btn-registers').addEventListener('click', openRegisters);
  $('btn-close-registers').addEventListener('click', closeRegisters);
  $('registers-dialog').addEventListener('cancel', () => { persist(true); });
  $('reg-body').addEventListener('click', regClick);
  $('reg-body').addEventListener('input', regInput);
  $('reg-body').addEventListener('change', regInput);
  $('btn-continuity').addEventListener('click', () => {
    if (!isStoryNote(app.note())) return;
    results = []; $('cont-list').innerHTML = ''; $('cont-msg').textContent = '';
    $('continuity-dialog').showModal();
  });
  $('btn-close-continuity').addEventListener('click', () => $('continuity-dialog').close());
  $('continuity-dialog').querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    scope = b.dataset.scope;
    $('continuity-dialog').querySelectorAll('.seg-btn').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  }));
  $('btn-run-continuity').addEventListener('click', runContinuity);
  $('cont-list').addEventListener('click', contClick);
}
