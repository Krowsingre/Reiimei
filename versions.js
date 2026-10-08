// Reiimei versions: earlier copies of each note, kept on this device, so a change can be undone
// long after Undo has forgotten it (or after a sync replaced the text). A copy is kept at most
// every few minutes while you write, when you leave a note, before a sync replaces its text and
// before an older version is restored. The newest 30 copies of each note are kept. They are
// sealed like the notes when encryption is on, and they are not synced.
import * as db from './db.js';

export const KEEP = 30;
const EVERY_MS = 3 * 60 * 1000;

const copyOf = (note, reason, at) => ({ at, reason, body: note.body || '', title: note.meta?.title || '', format: note.format || 'markdown' });

// Keep a copy of the note as it is now. Without force, only when the last copy is a few
// minutes old. Nothing is kept for an empty note or one that has not changed.
// One at a time: two copies kept at the same moment must not overwrite each other's list.
let queue = Promise.resolve();
export function keep(note, opts = {}) {
  const run = queue.then(() => keepNow(note, opts));
  queue = run.catch(() => {});
  return run;
}
async function keepNow(note, { reason = 'editing', force = false, now = Date.now() } = {}) {
  if (!note || note.locked || note.deleted || !(note.body || '').trim()) return false;
  const list = await db.getVersions(note.id);
  if (list === null) return false; // sealed and not opened yet
  const last = list[list.length - 1];
  if (last && last.body === note.body && last.title === (note.meta?.title || '')) return false;
  if (!force && last && now - last.at < EVERY_MS) return false;
  list.push(copyOf(note, reason, now));
  while (list.length > KEEP) list.shift();
  await db.setVersions(note.id, list);
  return true;
}

// Newest first.
export async function list(id) { await queue; return [...((await db.getVersions(id)) || [])].reverse(); }
export const forget = (id) => db.removeVersions(id);
