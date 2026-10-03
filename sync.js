// Sync with a Supabase project over its REST API (no extra libraries).
// Strategy: pull remote changes, then push local dirty records.
// If the same note was edited on two devices before syncing, the newer edit
// wins and the other is kept as a "conflicted copy" note, so nothing is lost.
import { log } from './logger.js';
import * as db from './db.js';
import * as vault from './crypto.js';

const CFG_KEY = 'reiimei.sync.config';
const SESSION_KEY = 'reiimei.sync.session';
const PAGE = 500;

let syncing = false;
let listeners = new Set();
let state = { status: 'off', message: 'Sync not set up', lastSync: null };

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => { try { fn(state); } catch (e) { log.error('sync', 'Listener failed', e); } });
}
export const onState = (fn) => { listeners.add(fn); fn(state); return () => listeners.delete(fn); };
export const getState = () => state;

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
export const getConfig = () => readJson(CFG_KEY);
export const getSession = () => readJson(SESSION_KEY);
export function saveConfig(url, anonKey) {
  const clean = { url: url.trim().replace(/\/+$/, ''), anonKey: anonKey.trim() };
  // Keep "verified" only while the URL and key stay the same.
  const prev = getConfig();
  if (prev?.verified && prev.url === clean.url && prev.anonKey === clean.anonKey) clean.verified = true;
  localStorage.setItem(CFG_KEY, JSON.stringify(clean));
  log.info('sync', 'Sync config saved', { url: clean.url, verified: !!clean.verified });
}

// Called once the server has accepted this URL and key.
export function markVerified() {
  const cfg = getConfig();
  if (!cfg || cfg.verified) return;
  localStorage.setItem(CFG_KEY, JSON.stringify({ ...cfg, verified: true }));
  log.info('sync', 'Project details confirmed');
}
function saveSession(s) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

export const isConfigured = () => !!(getConfig() && getSession());

// ---- Auth --------------------------------------------------------------
async function authRequest(path, body) {
  const cfg = getConfig();
  if (!cfg) throw new Error('Enter your Supabase URL and anon key first.');
  const res = await fetch(`${cfg.url}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error_description || json.msg || json.message || `Auth failed (${res.status})`);
  }
  return json;
}

function storeAuth(json) {
  if (!json.access_token) return null;
  const session = {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in || 3600) * 1000,
    user: { id: json.user?.id, email: json.user?.email },
  };
  saveSession(session);
  return session;
}

export async function signIn(email, password) {
  const json = await authRequest('token?grant_type=password', { email, password });
  const s = storeAuth(json);
  log.info('sync', 'Signed in', { email: s?.user?.email });
  setState({ status: 'idle', message: 'Signed in' });
  return s;
}

export async function signUp(email, password) {
  const json = await authRequest('signup', { email, password });
  const s = storeAuth(json);
  log.info('sync', 'Sign-up completed', { confirmed: !!s });
  if (!s) return { needsConfirmation: true };
  setState({ status: 'idle', message: 'Signed in' });
  return s;
}

export async function signOut() {
  saveSession(null);
  await db.setMeta('pullCursor', null);
  log.info('sync', 'Signed out');
  setState({ status: 'off', message: 'Signed out' });
}

async function validSession(force = false) {
  let s = getSession();
  if (!s) throw new Error('Not signed in');
  if (force || Date.now() > s.expires_at - 60_000) {
    log.debug('sync', 'Refreshing access token');
    const json = await authRequest('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
    s = storeAuth(json);
  }
  return s;
}

async function rest(method, path, body, retried = false) {
  const cfg = getConfig();
  const s = await validSession();
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${s.access_token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !retried) {
    await validSession(true);
    return rest(method, path, body, true);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Server ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.status === 204 || res.status === 201 ? null : res.json();
}

// ---- Sync --------------------------------------------------------------
// Send exactly the server's columns, in the same shape for every row
// (Supabase bulk upserts require all rows to have identical keys).
// When encryption is on, private fields are sent only inside `sealed`, and the
// readable columns are blanked, so the server never sees note text or names.
const COLUMNS = {
  notes: { id: null, body: '', folder_id: null, tags: [], pinned: false, created_at: null, updated_at: null, deleted: false, format: null, meta: null, sealed: null },
  folders: { id: null, name: '', updated_at: null, deleted: false, sealed: null },
};
async function toServer(table, rec) {
  let src = rec;
  if (rec.locked) {
    // Never decrypted on this device: pass the sealed value through unchanged.
    src = { ...rec, sealed: rec.sealedRaw };
  } else if (vault.isEnabled()) {
    const secret = {};
    for (const f of db.SECRET[table]) secret[f] = rec[f];
    src = { ...rec, sealed: await vault.seal(secret) };
    for (const f of db.SECRET[table]) delete src[f];
  } else {
    src = { ...rec, sealed: null };
  }
  const out = {};
  for (const [k, def] of Object.entries(COLUMNS[table])) out[k] = src[k] ?? def;
  if (table === 'notes' && !out.created_at) out.created_at = out.updated_at;
  return out;
}

export class SyncLockedError extends Error {
  constructor(sample) { super('Encrypted notes need your passphrase'); this.name = 'SyncLockedError'; this.sample = sample; }
}

async function pullTable(table, cursor) {
  // Overlap the cursor by a few seconds so slow server commits are not missed;
  // re-reading rows we already have is harmless.
  const since = cursor ? new Date(new Date(cursor).getTime() - 5000).toISOString() : '1970-01-01T00:00:00Z';
  let rows = [];
  let offset = 0;
  for (;;) {
    const page = await rest('GET',
      `${table}?select=*&server_updated_at=gte.${encodeURIComponent(since)}` +
      `&order=server_updated_at.asc&limit=${PAGE}&offset=${offset}`);
    rows = rows.concat(page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

const sameNote = (a, b) =>
  a.body === b.body && a.folder_id === b.folder_id && !!a.deleted === !!b.deleted &&
  !!a.pinned === !!b.pinned && JSON.stringify(a.tags || []) === JSON.stringify(b.tags || []) &&
  (a.format || 'markdown') === (b.format || 'markdown') && JSON.stringify(a.meta || {}) === JSON.stringify(b.meta || {});

// Turn a server row into a local record, opening sealed fields if possible.
async function fromServer(store, r) {
  const row = { ...r };
  delete row.user_id;
  if (!row.sealed) {
    delete row.sealed;
    if (store === 'notes') { row.tags = row.tags || []; row.format = row.format || 'markdown'; row.meta = row.meta || {}; }
    return row;
  }
  for (const f of db.SECRET[store]) delete row[f];
  const opened = await db.decode(store, row);
  if (opened.locked) throw new SyncLockedError(r.sealed);
  return opened;
}

// Versions this device has uploaded, per record. When the server hands one of
// them back, it is our own change coming home, never a conflict.
let pushedMap = null;
async function pushedLog() {
  if (!pushedMap) pushedMap = (await db.getMeta('pushedVersions', {})) || {};
  return pushedMap;
}
async function notePushed(id, stamp) {
  const m = await pushedLog();
  m[id] = [...(m[id] || []).filter((x) => x !== stamp), stamp].slice(-12);
  await db.setMeta('pushedVersions', m);
}
const wasPushed = (id, stamp) => !!(pushedMap?.[id] || []).includes(stamp);

async function mergeRemote(store, rows) {
  await pushedLog();
  let applied = 0;
  let conflicts = 0;
  const copies = [];
  for (const r of rows) {
    // Postgres returns timestamps as "+00:00"; store them in the same ISO form
    // the app writes so comparisons line up.
    r.updated_at = new Date(r.updated_at).toISOString();
    if (r.created_at) r.created_at = new Date(r.created_at).toISOString();
    const remote = { ...(await fromServer(store, r)), dirty: false, synced_updated_at: r.updated_at };
    await db.locked(async () => {
      const local = await db.get(store, r.id);
      if (local?.locked) return;

      if (!local || !local.dirty) {
        if (!local || local.updated_at !== r.updated_at || local.server_updated_at !== r.server_updated_at) {
          await db.put(store, remote);
          applied++;
        }
        return;
      }
      // Local has unsynced edits. If the server still holds the version we last
      // synced, or one this device uploaded, the local copy is simply newer.
      if (local.synced_updated_at === r.updated_at || wasPushed(r.id, r.updated_at)) {
        if (local.synced_updated_at !== r.updated_at) await db.put(store, { ...local, synced_updated_at: r.updated_at });
        return;
      }

      if (r.id === db.CACHE_ID) {
        // The erased-text cache is a single slot: the newest write wins, with no conflict copy.
        if (r.updated_at > local.updated_at) await db.put(store, remote);
        else await db.put(store, { ...local, synced_updated_at: r.updated_at });
        return;
      }

      if (store === 'folders' || (store === 'notes' && sameNote(local, remote))) {
        // Folders: newest rename/delete wins. Identical notes: just mark clean.
        if (store === 'notes' || r.updated_at > local.updated_at) await db.put(store, remote);
        else await db.put(store, { ...local, synced_updated_at: r.updated_at });
        return;
      }

      // True note conflict.
      conflicts++;
      if (r.deleted && !local.deleted) {
        // Deleted elsewhere, edited here: keep the edit.
        await db.put(store, { ...local, synced_updated_at: r.updated_at });
      } else if (local.deleted && !r.deleted) {
        // Deleted here, edited elsewhere: keep the edit.
        await db.put(store, remote);
      } else {
        const localWins = local.updated_at > r.updated_at;
        const winner = localWins ? { ...local, synced_updated_at: r.updated_at } : remote;
        const loser = localWins ? remote : local;
        await db.put(store, winner);
        copies.push(loser);
      }
      log.warn('sync', 'Resolved edit conflict', { id: r.id, localUpdated: local.updated_at, localSynced: local.synced_updated_at, remoteUpdated: r.updated_at });
    });
  }
  for (const loser of copies) {
    const copy = await db.createNote({ folder_id: loser.folder_id, tags: loser.tags, format: loser.format, meta: loser.meta });
    await db.saveNote(copy, { body: `${loser.body}\n\n(Conflicted copy from ${new Date(loser.updated_at).toLocaleString()})` });
  }
  return { applied, conflicts };
}

async function pushTable(store, table) {
  const dirty = (await db.getAll(store, { internal: true })).filter((r) => r.dirty);
  if (!dirty.length) return 0;
  for (let i = 0; i < dirty.length; i += PAGE) {
    const batch = dirty.slice(i, i + PAGE);
    await pushedLog();
    // Note each version before sending, so it is recognised if it comes straight back.
    for (const sent of batch) if (store === 'notes') await notePushed(sent.id, sent.updated_at);
    await rest('POST', `${table}?on_conflict=id`, await Promise.all(batch.map((r) => toServer(table, r))));
    // Mark clean only if the record was not edited again while uploading.
    for (const sent of batch) {
      await db.locked(async () => {
        const current = await db.get(store, sent.id);
        if (!current || current.locked) return;
        await db.put(store, {
          ...current,
          dirty: current.updated_at !== sent.updated_at,
          synced_updated_at: sent.updated_at,
        });
      });
    }
  }
  return dirty.length;
}

export async function syncNow(reason = 'manual') {
  if (!isConfigured()) return { skipped: 'not configured' };
  if (!navigator.onLine) {
    setState({ status: 'offline', message: 'Offline: changes saved on this device' });
    return { skipped: 'offline' };
  }
  if (syncing) return { skipped: 'already syncing' };
  syncing = true;
  setState({ status: 'syncing', message: 'Syncing…' });
  const started = performance.now();
  try {
    const cursor = await db.getMeta('pullCursor');
    const [folders, notes] = await Promise.all([pullTable('folders', cursor), pullTable('notes', cursor)]);
    const f = await mergeRemote('folders', folders);
    const n = await mergeRemote('notes', notes);
    const pushedFolders = await pushTable('folders', 'folders');
    const pushedNotes = await pushTable('notes', 'notes');

    const newest = [...folders, ...notes].map((r) => r.server_updated_at).sort().pop();
    if (newest) await db.setMeta('pullCursor', newest);

    const summary = {
      reason,
      pulled: folders.length + notes.length,
      applied: f.applied + n.applied,
      pushed: pushedFolders + pushedNotes,
      conflicts: n.conflicts,
      ms: Math.round(performance.now() - started),
    };
    log.info('sync', 'Sync complete', summary);
    setState({
      status: 'idle',
      message: summary.conflicts ? `Synced (${summary.conflicts} conflict copies made)` : 'Synced',
      lastSync: new Date().toISOString(),
    });
    return summary;
  } catch (e) {
    if (e instanceof SyncLockedError) {
      log.warn('sync', 'Sync paused: encrypted notes need the passphrase');
      setState({ status: 'locked', message: 'Encrypted notes found: enter your passphrase' });
      return { locked: true, sample: e.sample };
    }
    if (e instanceof vault.LockedError) {
      setState({ status: 'locked', message: 'Locked: unlock to sync' });
      return { locked: true };
    }
    log.error('sync', 'Sync failed', e);
    const hint = /column|sealed|format|meta/i.test(e.message) ? ' (run the latest supabase-setup.sql)' : '';
    setState({ status: 'error', message: `Sync failed: ${e.message}${hint}` });
    return { error: e.message + hint };
  } finally {
    syncing = false;
  }
}

// Quick reachability/auth check used by the diagnostics panel.
export async function testConnection() {
  await rest('GET', 'notes?select=id&limit=1');
  await rest('GET', 'folders?select=id&limit=1');
  return true;
}
