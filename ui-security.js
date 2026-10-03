// Reiimei security UI: lock screen, auto-lock, and encryption settings.
import { log } from './logger.js';
import * as db from './db.js';
import * as vault from './crypto.js';

const $ = (id) => document.getElementById(id);
const CFG_KEY = 'crypto';
let app = null;
let cfg = { enabled: false, salt: null, check: null, autoLockMin: 15 };
let locked = false;
let hiddenAt = 0;
let lockMode = 'unlock'; // 'unlock' | 'remote'
let remoteSample = null;
let resolveUnlock = null;

export const isLocked = () => locked;
export const isEnabled = () => !!cfg.enabled;
export const status = () => ({ enabled: !!cfg.enabled, locked, autoLockMin: cfg.autoLockMin, supported: vault.isSupported() });

export async function loadConfig() {
  cfg = { ...cfg, ...((await db.getMeta(CFG_KEY)) || {}) };
  vault.configure(cfg);
  return cfg;
}
async function saveConfig(next) {
  cfg = { ...cfg, ...next };
  await db.setMeta(CFG_KEY, cfg);
}

// ---- Lock screen ---------------------------------------------------------
function showLock(mode, text) {
  lockMode = mode;
  $('lock-text').textContent = text;
  $('lock-msg').textContent = '';
  $('lock-pass').value = '';
  $('lock-erase-confirm').value = '';
  $('lock').querySelector('.lock-help').hidden = mode !== 'unlock';
  let later = $('lock-later');
  if (mode === 'remote' && !later) {
    later = document.createElement('button');
    later.type = 'button';
    later.id = 'lock-later';
    later.className = 'btn';
    later.textContent = 'Not now';
    later.addEventListener('click', () => { $('lock').hidden = true; });
    $('lock-btn').after(later);
  }
  if (later) later.hidden = mode !== 'remote';
  $('lock').hidden = false;
  $('app').inert = mode === 'unlock';
  setTimeout(() => $('lock-pass').focus(), 50);
}

function hideLock() {
  $('lock').hidden = true;
  $('app').inert = false;
}

// Called at startup when encryption is on. Resolves once unlocked.
export function requireUnlock() {
  locked = true;
  showLock('unlock', 'Enter your passphrase to open your notes.');
  return new Promise((resolve) => { resolveUnlock = resolve; });
}

export async function lockNow(reason = 'manual') {
  if (!cfg.enabled || locked) return;
  await app.flushSave();
  locked = true;
  vault.lock();
  app.clearData();
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  $('paper-view').hidden = true;
  log.info('security', 'Locked', { reason });
  await requireUnlock();
  await app.reload();
  app.runSync('unlocked');
}

// A synced note was sealed with a passphrase this device does not have yet.
export function askForRemotePassphrase(sample) {
  if (!$('lock').hidden) return;
  remoteSample = sample;
  showLock('remote', cfg.enabled
    ? 'Your passphrase was changed on another device. Enter the new passphrase to keep syncing.'
    : 'Your notes are encrypted on another device. Enter your passphrase to read and sync them here.');
}

async function onLockSubmit(e) {
  e.preventDefault();
  const pass = $('lock-pass').value;
  if (!pass) return;
  $('lock-btn').disabled = true;
  $('lock-msg').textContent = '';
  $('lock-text').dataset.prev = $('lock-text').textContent;
  $('lock-btn').textContent = 'Opening…';
  try {
    if (lockMode === 'unlock') {
      await vault.unlock(pass, cfg);
      locked = false;
      hideLock();
      const done = resolveUnlock;
      resolveUnlock = null;
      done?.();
    } else {
      if (!(await vault.canOpen(pass, remoteSample))) throw new vault.WrongPassphraseError();
      // Adopt the synced key: rewrite local notes sealed with it, then sync.
      await db.rewriteAll(async () => {
        const next = await vault.enable(pass, vault.saltOf(remoteSample));
        await saveConfig({ ...next, autoLockMin: cfg.autoLockMin ?? 15 });
      });
      log.info('security', 'Adopted encryption from another device');
      hideLock();
      await app.reload();
      app.runSync('passphrase-entered');
    }
  } catch (err) {
    $('lock-msg').textContent = err instanceof vault.WrongPassphraseError ? 'That passphrase is not right. Check capitals and spaces.' : err.message;
    log.warn('security', 'Unlock failed', { reason: err.name });
  } finally {
    $('lock-btn').disabled = false;
    $('lock-btn').textContent = 'Unlock';
  }
}

async function onErase() {
  if ($('lock-erase-confirm').value.trim() !== 'ERASE') {
    $('lock-msg').textContent = 'Type ERASE in the box to confirm.';
    return;
  }
  log.warn('security', 'Device erased from the lock screen');
  await db.eraseDevice();
  location.reload();
}

// ---- Settings panel --------------------------------------------------------
function msg(text, kind = '') {
  $('sec-msg').textContent = text;
  $('sec-msg').className = `msg${kind ? ` ${kind}` : ''}`;
}

export function renderSettings() {
  $('sec-off').hidden = !!cfg.enabled;
  $('sec-on').hidden = !cfg.enabled;
  $('sec-autolock').value = String(cfg.autoLockMin ?? 15);
  if (!vault.isSupported()) msg('This browser cannot encrypt. Open Reiimei over HTTPS in Safari, Edge, or Chrome.', 'error');
}

function clearInputs(...ids) { ids.forEach((id) => { $(id).value = ''; }); }

async function turnOn() {
  const p1 = $('sec-new').value;
  const p2 = $('sec-new2').value;
  const problem = vault.passphraseProblem(p1);
  if (problem) return msg(problem, 'error');
  if (p1 !== p2) return msg('The two passphrases do not match.', 'error');
  if (!$('sec-ack').checked) return msg('Check the box to confirm you understand the passphrase cannot be recovered.', 'error');
  msg('Encrypting your notes…');
  try {
    await app.flushSave();
    // If synced notes are already sealed elsewhere, reuse that salt.
    const sample = (await db.countSealed()).sample;
    const count = await db.rewriteAll(async () => {
      const next = await vault.enable(p1, sample ? vault.saltOf(sample) : null);
      await saveConfig({ ...next, autoLockMin: cfg.autoLockMin ?? 15 });
    });
    clearInputs('sec-new', 'sec-new2');
    $('sec-ack').checked = false;
    log.info('security', 'Encryption turned on', { records: count });
    msg(`Encryption is on. ${count} items were sealed${app.syncOn() ? ' and will sync sealed' : ''}.`, 'ok');
    renderSettings();
    await app.reload();
    app.runSync('encryption-on');
  } catch (e) {
    log.error('security', 'Turning on encryption failed', e);
    msg(`Could not turn on encryption: ${e.message}`, 'error');
  }
}

async function turnOff() {
  const pass = $('sec-off-pass').value;
  if (!(await vault.verifyPassphrase(pass, cfg))) return msg('That passphrase is not right.', 'error');
  msg('Decrypting your notes…');
  try {
    await app.flushSave();
    const count = await db.rewriteAll(async () => {
      vault.disable();
      await saveConfig({ enabled: false, check: null });
    });
    clearInputs('sec-off-pass');
    log.info('security', 'Encryption turned off', { records: count });
    msg('Encryption is off. Notes are stored and synced as plain text.', 'ok');
    renderSettings();
    await app.reload();
    app.runSync('encryption-off');
  } catch (e) {
    log.error('security', 'Turning off encryption failed', e);
    msg(`Could not turn off encryption: ${e.message}`, 'error');
  }
}

async function changePassphrase() {
  const cur = $('sec-cur').value;
  const p1 = $('sec-chg').value;
  const p2 = $('sec-chg2').value;
  if (!(await vault.verifyPassphrase(cur, cfg))) return msg('The current passphrase is not right.', 'error');
  const problem = vault.passphraseProblem(p1);
  if (problem) return msg(problem, 'error');
  if (p1 !== p2) return msg('The two new passphrases do not match.', 'error');
  msg('Re-sealing your notes…');
  try {
    await app.flushSave();
    const count = await db.rewriteAll(async () => {
      const next = await vault.enable(p1);
      await saveConfig(next);
    });
    clearInputs('sec-cur', 'sec-chg', 'sec-chg2');
    log.info('security', 'Passphrase changed', { records: count });
    msg('Passphrase changed. Other devices will ask for the new one when they next sync.', 'ok');
    await app.reload();
    app.runSync('passphrase-changed');
  } catch (e) {
    log.error('security', 'Changing passphrase failed', e);
    msg(`Could not change the passphrase: ${e.message}`, 'error');
  }
}

// ---- Wiring --------------------------------------------------------------
export function init(hooks) {
  app = hooks;
  $('lock-form').addEventListener('submit', onLockSubmit);
  $('lock-erase').addEventListener('click', onErase);
  $('btn-enc-on').addEventListener('click', turnOn);
  $('btn-enc-off').addEventListener('click', turnOff);
  $('btn-enc-change').addEventListener('click', changePassphrase);
  $('btn-lock-now').addEventListener('click', () => { app.closeSettings?.(); lockNow('button'); });
  $('sec-autolock').addEventListener('change', async (e) => {
    await saveConfig({ autoLockMin: +e.target.value });
    log.info('security', 'Auto-lock changed', { minutes: +e.target.value });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    const min = cfg.autoLockMin ?? 15;
    if (cfg.enabled && !locked && min > 0 && hiddenAt && Date.now() - hiddenAt > min * 60000) lockNow('auto');
  });
}
