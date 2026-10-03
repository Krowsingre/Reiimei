// Sync with a Supabase project over its REST API (no extra libraries).
// Strategy: pull remote changes, then push local dirty records.
// If the same note was edited on two devices before syncing, the newer edit
// wins and the other is kept as a "conflicted copy" note, so nothing is lost.
import { log } from './logger.js';
import * as db from './db.js';

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
  localStorage.setItem(CFG_KEY, JSON.stringify(clean));
  log.info('sync', 'Sync config saved', { url: clean.url });
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
const COLUMNS = {
  notes: { id: null, body: '', folder_id: null, tags: [], pinned: false, created_at: null, updated_at: null, deleted: false },
  folders: { id: null, name: '', updated_at: null, deleted: false },
};
const toServer = (table, rec) => {
  const out = {};
  for (const [k, def] of Object.entries(COLUMNS[table])) out[k] = rec[k] ?? def;
  if (table === 'notes' && !out.created_at) out.created_at = out.updated_at;
  return out;
};

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
  !!a.pinned === !!b.pinned && JSON.stringify(a.tags || []) === JSON.stringify(b.tags || []);

async function mergeRemote(store, rows) {
  let applied = 0;
  let conflicts = 0;
  for (const r of rows) {
    // Postgres returns timestamps as "+00:00"; store them in the same ISO form
    // the app writes so comparisons line up.
    r.updated_at = new Date(r.updated_at).toISOString();
    if (r.created_at) r.created_at = new Date(r.created_at).toISOString();
    const remote = { ...r, dirty: false, synced_updated_at: r.updated_at };
    if (store === 'notes') remote.tags = r.tags || [];
    delete remote.user_id;
    const local = await db.get(store, r.id);

    if (!local || !local.dirty) {
      if (!local || local.updated_at !== r.updated_at || local.server_updated_at !== r.server_updated_at) {
        await db.put(store, remote);
        applied++;
      }
      continue;
    }
    // Local has unsynced edits. If the server still holds the version we last
    // synced, the local copy is simply newer: keep it and push it.
    if (local.synced_updated_at === r.updated_at) continue;

    if (store === 'folders' || (store === 'notes' && sameNote(local, remote))) {
      // Folders: newest rename/delete wins. Identical notes: just mark clean.
      if (store === 'notes' || r.updated_at > local.updated_at) await db.put(store, remote);
      else await db.put(store, { ...local, synced_updated_at: r.updated_at });
      continue;
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
      const copy = await db.createNote({ folder_id: loser.folder_id, tags: loser.tags });
      await db.saveNote(copy, { body: `${loser.body}\n\n(Conflicted copy from ${new Date(loser.updated_at).toLocaleString()})` });
    }
    log.warn('sync', 'Resolved edit conflict', { id: r.id, localUpdated: local.updated_at, localSynced: local.synced_updated_at, remoteUpdated: r.updated_at });
  }
  return { applied, conflicts };
}

async function pushTable(store, table) {
  const dirty = (await db.getAll(store)).filter((r) => r.dirty);
  if (!dirty.length) return 0;
  for (let i = 0; i < dirty.length; i += PAGE) {
    const batch = dirty.slice(i, i + PAGE);
    await rest('POST', `${table}?on_conflict=id`, batch.map((r) => toServer(table, r)));
    // Mark clean only if the record was not edited again while uploading.
    for (const sent of batch) {
      const current = await db.get(store, sent.id);
      if (!current) continue;
      await db.put(store, {
        ...current,
        dirty: current.updated_at !== sent.updated_at,
        synced_updated_at: sent.updated_at,
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
    log.error('sync', 'Sync failed', e);
    setState({ status: 'error', message: `Sync failed: ${e.message}` });
    return { error: e.message };
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
