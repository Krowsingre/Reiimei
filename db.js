// Local storage layer (IndexedDB). Everything is saved here first, so the app
// works fully offline. Records marked dirty are pushed by sync.js later.
// When encryption is on, the private fields of each record are sealed before
// they reach IndexedDB, and opened again when read.
import { log } from './logger.js';
import * as vault from './crypto.js';

// Fields that are sealed when encryption is on. Everything else (ids, dates,
// folder links, pinned, deleted) stays readable so sync can work while locked.
export const SECRET = { notes: ['body', 'tags', 'format', 'meta'], folders: ['name'] };
const BLANK = { body: '', tags: [], format: 'markdown', meta: {}, name: '' };

const DB_NAME = 'reiimei';
const DB_VERSION = 1;
let dbPromise = null;

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Fallback for older browsers.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      log.info('db', `Upgrading database to v${DB_VERSION}`);
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('folders')) db.createObjectStore('folders', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        log.warn('db', 'Database version changed in another tab; closing');
        db.close();
      };
      resolve(db);
    };
    req.onerror = () => {
      log.error('db', 'Failed to open database', req.error);
      reject(req.error);
    };
    req.onblocked = () => log.warn('db', 'Database open blocked by another tab');
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; }).catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
  }));
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const rawGetAll = (store) => tx(store, 'readonly', (s) => reqP(s.getAll()));
const rawGet = (store, id) => tx(store, 'readonly', (s) => reqP(s.get(id)));
const rawPut = (store, value) => tx(store, 'readwrite', (s) => reqP(s.put(value)));
export const rawPutMany = (store, values) =>
  tx(store, 'readwrite', (s) => Promise.all(values.map((v) => reqP(s.put(v)))));
export const remove = (store, id) => tx(store, 'readwrite', (s) => reqP(s.delete(id)));

// Seal private fields (when encryption is on) before storing.
export async function encode(store, rec) {
  const fields = SECRET[store];
  if (!fields) return rec;
  const out = { ...rec };
  delete out.locked;
  delete out.sealed;
  if (!vault.isEnabled()) return out;
  const secret = {};
  for (const f of fields) { secret[f] = rec[f]; delete out[f]; }
  out.sealed = await vault.seal(secret);
  return out;
}

// Open sealed fields. If they cannot be opened (locked or wrong key), the
// record comes back marked locked with blank private fields.
export async function decode(store, raw) {
  if (!raw || !raw.sealed || !SECRET[store]) return raw;
  const out = { ...raw };
  delete out.sealed;
  try {
    Object.assign(out, await vault.open(raw.sealed));
  } catch (e) {
    for (const f of SECRET[store]) out[f] = BLANK[f];
    out.locked = true;
    out.sealedRaw = raw.sealed;
    if (!(e instanceof vault.LockedError)) log.warn('db', 'A record could not be opened', { id: raw.id, error: e.message });
  }
  return out;
}

export const getAll = async (store) => Promise.all((await rawGetAll(store)).map((r) => decode(store, r)));
export const get = async (store, id) => decode(store, await rawGet(store, id));
export async function put(store, value) {
  if (value?.locked) throw new Error('Refusing to overwrite a record that is still locked');
  return rawPut(store, await encode(store, value));
}
export async function putMany(store, values) {
  if (values.some((v) => v?.locked)) throw new Error('Refusing to overwrite a record that is still locked');
  return rawPutMany(store, await Promise.all(values.map((v) => encode(store, v))));
}
// How many stored records are sealed (used by diagnostics and by encryption on/off).
export async function countSealed() {
  const [n, f] = await Promise.all([rawGetAll('notes'), rawGetAll('folders')]);
  return { sealed: [...n, ...f].filter((r) => r.sealed).length, total: n.length + f.length, sample: [...n, ...f].find((r) => r.sealed)?.sealed || null };
}

// Rewrite every record and queue them all to sync. Records are read first (with
// the current key), then `between` runs (for example, switching keys), then
// everything is written back in the new mode. Used to turn encryption on or
// off and to change the passphrase.
export async function rewriteAll(between = async () => {}) {
  const data = {};
  for (const store of ['folders', 'notes']) {
    data[store] = await getAll(store);
    if (data[store].some((r) => r.locked)) throw new Error('Some notes could not be opened with the current passphrase');
  }
  await between();
  let count = 0;
  for (const store of ['folders', 'notes']) {
    await putMany(store, data[store].map((r) => ({ ...r, dirty: true })));
    count += data[store].length;
  }
  log.info('db', 'Rewrote all records', { count, encrypted: vault.isEnabled() });
  return count;
}

// Remove everything Reiimei stores on this device.
export async function eraseDevice() {
  try { (await openDb()).close(); } catch { /* not open */ }
  dbPromise = null;
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  Object.keys(localStorage).filter((k) => k.startsWith('reiimei.')).forEach((k) => localStorage.removeItem(k));
}

export async function getMeta(key, fallback = null) {
  const row = await rawGet('meta', key);
  return row ? row.value : fallback;
}
export const setMeta = (key, value) => rawPut('meta', { key, value });

const now = () => new Date().toISOString();

// One writer at a time. Every read-change-write of a record (editing, marking
// clean after upload, applying a downloaded change) runs inside this lock, so a
// background sync can never overwrite an edit made a moment earlier.
let lockTail = Promise.resolve();
export function locked(fn) {
  const run = lockTail.then(fn, fn);
  lockTail = run.catch(() => {});
  return run;
}

// ---- Notes -------------------------------------------------------------
export async function createNote({ folder_id = null, tags = [], format = 'markdown', meta = {} } = {}) {
  const note = {
    id: uuid(),
    body: '',
    format,
    meta,
    folder_id,
    tags,
    pinned: false,
    created_at: now(),
    updated_at: now(),
    deleted: false,
    dirty: true,
  };
  await put('notes', note);
  log.info('db', 'Note created', { id: note.id });
  return note;
}

// Apply changes on top of the record currently in the database (not a possibly
// stale copy held by the UI).
async function update(store, id, changes, fallback) {
  return locked(async () => {
    const current = (await get(store, id)) || fallback;
    const updated = { ...current, ...changes, updated_at: now(), dirty: true };
    await put(store, updated);
    return updated;
  });
}

export const saveNote = (note, changes) => update('notes', note.id, changes, note);

export const deleteNote = (note) => saveNote(note, { deleted: true });
export const restoreNote = (note) => saveNote(note, { deleted: false });

// Permanent delete: the note's text and tags are wiped and only a blank deleted
// stub remains, which syncs so every other device wipes its copy too. Blank
// deleted stubs are never listed in Recently Deleted (see isPurged in app.js).
export const purgeNote = (note) => saveNote(note, { deleted: true, body: '', tags: [], meta: {}, pinned: false });

// ---- Folders -----------------------------------------------------------
export async function createFolder(name) {
  const folder = { id: uuid(), name, updated_at: now(), deleted: false, dirty: true };
  await put('folders', folder);
  log.info('db', 'Folder created', { id: folder.id });
  return folder;
}

export const saveFolder = (folder, changes) => update('folders', folder.id, changes, folder);

// Deleting a folder moves its notes to "No folder" rather than losing them.
export async function deleteFolder(folder) {
  const notes = await getAll('notes');
  const moved = notes
    .filter((n) => n.folder_id === folder.id)
    .map((n) => ({ ...n, folder_id: null, updated_at: now(), dirty: true }));
  if (moved.length) await putMany('notes', moved);
  log.info('db', 'Folder deleted', { id: folder.id, notesMoved: moved.length });
  return saveFolder(folder, { deleted: true });
}
