// Reiimei app: notes kept on the phone, in SQLite. Each note has the same shape as in the web app
// (id, body, format, meta, folder_id, tags, pinned, created_at, updated_at, deleted), so notes can
// move between the two later without being changed.
import * as SQLite from 'expo-sqlite';

let dbp = null;
function db() {
  if (!dbp) {
    dbp = (async () => {
      const d = await SQLite.openDatabaseAsync('reiimei.db');
      await d.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          format TEXT NOT NULL DEFAULT 'text',
          meta TEXT NOT NULL DEFAULT '{}',
          folder_id TEXT,
          tags TEXT NOT NULL DEFAULT '[]',
          pinned INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted INTEGER NOT NULL DEFAULT 0
        );
      `);
      return d;
    })();
  }
  return dbp;
}

// A random id in the same form as the web app's (version 4 UUID).
export function uuid() {
  const h = [];
  for (let i = 0; i < 16; i++) h.push(Math.floor(Math.random() * 256));
  h[6] = (h[6] & 0x0f) | 0x40;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const fromRow = (r) => ({
  ...r,
  meta: JSON.parse(r.meta || '{}'),
  tags: JSON.parse(r.tags || '[]'),
  pinned: !!r.pinned,
  deleted: !!r.deleted,
});

export async function allNotes() {
  const d = await db();
  return (await d.getAllAsync('SELECT * FROM notes WHERE deleted = 0 ORDER BY pinned DESC, updated_at DESC')).map(fromRow);
}

export async function createNote() {
  const d = await db();
  const at = new Date().toISOString();
  const note = { id: uuid(), body: '', format: 'text', meta: { kind: 'notes' }, folder_id: null, tags: [], pinned: false, created_at: at, updated_at: at, deleted: false };
  await d.runAsync('INSERT INTO notes (id, body, format, meta, folder_id, tags, pinned, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [note.id, note.body, note.format, JSON.stringify(note.meta), null, '[]', 0, at, at, 0]);
  return note;
}

export async function saveNote(note, changes) {
  const d = await db();
  const next = { ...note, ...changes, updated_at: new Date().toISOString() };
  await d.runAsync('UPDATE notes SET body = ?, meta = ?, tags = ?, pinned = ?, updated_at = ?, deleted = ? WHERE id = ?',
    [next.body, JSON.stringify(next.meta || {}), JSON.stringify(next.tags || []), next.pinned ? 1 : 0, next.updated_at, next.deleted ? 1 : 0, next.id]);
  return next;
}

// A note with no title and no text is dropped when you leave it, as in the web app.
export async function dropIfBlank(note) {
  if (!note || (note.body || '').trim() || String(note.meta?.title || '').trim()) return false;
  const d = await db();
  await d.runAsync('DELETE FROM notes WHERE id = ?', [note.id]);
  return true;
}
