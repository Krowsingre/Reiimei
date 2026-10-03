// Local storage layer (IndexedDB). Everything is saved here first, so the app
// works fully offline. Records marked dirty are pushed by sync.js later.
import { log } from './logger.js';

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

export const getAll = (store) => tx(store, 'readonly', (s) => reqP(s.getAll()));
export const get = (store, id) => tx(store, 'readonly', (s) => reqP(s.get(id)));
export const put = (store, value) => tx(store, 'readwrite', (s) => reqP(s.put(value)));
export const remove = (store, id) => tx(store, 'readwrite', (s) => reqP(s.delete(id)));
export const putMany = (store, values) =>
  tx(store, 'readwrite', (s) => Promise.all(values.map((v) => reqP(s.put(v)))));

export async function getMeta(key, fallback = null) {
  const row = await get('meta', key);
  return row ? row.value : fallback;
}
export const setMeta = (key, value) => put('meta', { key, value });

const now = () => new Date().toISOString();

// ---- Notes -------------------------------------------------------------
export async function createNote({ folder_id = null, tags = [] } = {}) {
  const note = {
    id: uuid(),
    body: '',
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
// stale copy held by the UI), inside a single transaction.
function update(store, id, changes, fallback) {
  return tx(store, 'readwrite', async (s) => {
    const current = (await reqP(s.get(id))) || fallback;
    const updated = { ...current, ...changes, updated_at: now(), dirty: true };
    await reqP(s.put(updated));
    return updated;
  });
}

export const saveNote = (note, changes) => update('notes', note.id, changes, note);

export const deleteNote = (note) => saveNote(note, { deleted: true });

// ---- Folders -----------------------------------------------------------
export async function createFolder(name) {
  const folder = { id: uuid(), name, updated_at: now(), deleted: false, dirty: true };
  await put('folders', folder);
  log.info('db', 'Folder created', { id: folder.id, name });
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
