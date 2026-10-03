// Reiimei modes: Notes, Research, Coding, Storyboard.
// A mode is a view of your notes plus the tools that mode needs. Every note carries a
// kind (meta.kind). Notes written before modes existed have none, so their kind is worked
// out here: code formats are Coding, notes with sources are Research, the rest are Notes.
import { isCode } from './code.js';

export const MODES = [
  { id: 'notes', name: 'Notes', key: '1' },
  { id: 'research', name: 'Research', key: '2' },
  { id: 'coding', name: 'Coding', key: '3' },
  { id: 'storyboard', name: 'Storyboard', key: '4' },
];
export const MODE_IDS = MODES.map((m) => m.id);
export const modeName = (id) => (MODES.find((m) => m.id === id) || MODES[0]).name;

export function kindOf(note) {
  const k = note?.meta?.kind;
  if (MODE_IDS.includes(k)) return k;
  if (note && isCode(note.format)) return 'coding';
  if (note?.meta?.sources?.length) return 'research';
  return 'notes';
}

// ---- Research projects -------------------------------------------------------
// A project is a folder that belongs to Research. Folders sync with only a name, so a
// project is a folder whose name starts with this mark. (A device on an older version simply
// shows the mark as part of the name.) Every Research note lives in exactly one project.
export const PROJECT_MARK = '[Project] ';
export const UNSORTED = 'Unsorted';
export const isProject = (f) => !!f && typeof f.name === 'string' && f.name.startsWith(PROJECT_MARK);
export const projectName = (f) => (isProject(f) ? f.name.slice(PROJECT_MARK.length) : f?.name || '');
export const projectStored = (name) => PROJECT_MARK + String(name).trim().slice(0, 80);
// The tag a project gives its notes (the same shape as every tag).
export const slugTag = (name) => String(name).trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 40);
