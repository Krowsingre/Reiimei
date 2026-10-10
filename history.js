// Reiimei history: one Undo and Redo for everything that changes a note in the editor (typing,
// pasting, cutting, the formatting buttons, Aa, fonts, spacing and brackets), whichever way it was
// changed. Each open note keeps its own list of states for as long as the app is open.
//
// A state is { body, look, caret, kind, at }: the note's text, how it looks (font, spacing,
// brackets), where the caret was, what made the change ('typing', 'look', 'open' or 'edit') and
// when. Typing without a pause is one step, as in a word processor; everything else is a step of
// its own.

export const LOOK_KEYS = ['font', 'size', 'lh', 'ls', 'ws', 'brackets'];
export const lookOf = (note) => Object.fromEntries(LOOK_KEYS.map((k) => [k, note?.meta?.[k] ?? null]));
export const sameLook = (a, b) => LOOK_KEYS.every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));

const MERGE_MS = 1500; // a pause longer than this starts a new step
const LIMIT = 300;     // steps kept per note

export function createHistory() {
  const notes = new Map(); // note id -> { list, at }

  const top = (h) => h.list[h.at];

  return {
    // Start (or keep) the history of a note shown in the editor. A note whose text changed
    // elsewhere (a sync, a conversion) starts again from what it is now.
    open(id, state, now = Date.now()) {
      const h = notes.get(id);
      if (h && top(h).body === state.body && sameLook(top(h).look, state.look)) return false;
      notes.set(id, { list: [{ ...state, kind: 'open', at: now }], at: 0 });
      return true;
    },
    // Record a change. Returns true when a new step was made, false when it joined the last one.
    record(id, state, now = Date.now()) {
      let h = notes.get(id);
      if (!h) { notes.set(id, { list: [{ ...state, at: now }], at: 0 }); return true; }
      const last = top(h);
      if (last.body === state.body && sameLook(last.look, state.look)) { last.caret = state.caret; return false; }
      h.list.length = h.at + 1; // a change after Undo drops the steps that were undone
      // A look change joins the last step only when it changes the same thing again (dragging the
      // line spacing, say); brackets, then a font, are two steps.
      const changed = state.kind === 'look' ? LOOK_KEYS.filter((k) => (last.look?.[k] ?? null) !== (state.look?.[k] ?? null)).join() : '';
      const join = h.at > 0 && state.kind === last.kind && (state.kind === 'typing' || (state.kind === 'look' && changed === last.changed)) && now - last.at < MERGE_MS;
      if (join) { h.list[h.at] = { ...state, changed: last.changed, caretBefore: last.caretBefore ?? state.caretBefore, at: now }; return false; }
      h.list.push({ ...state, changed, at: now });
      if (h.list.length > LIMIT) h.list.splice(1, h.list.length - LIMIT); // the opening state stays
      h.at = h.list.length - 1;
      return true;
    },
    undo(id) {
      const h = notes.get(id);
      if (!h || h.at === 0) return null;
      // The caret goes back to where the undone change was made.
      const undone = top(h);
      h.at--;
      return { ...top(h), caret: undone.caretBefore ?? top(h).caret };
    },
    redo(id) {
      const h = notes.get(id);
      if (!h || h.at >= h.list.length - 1) return null;
      h.at++;
      return { ...top(h) };
    },
    canUndo: (id) => !!notes.get(id) && notes.get(id).at > 0,
    canRedo: (id) => !!notes.get(id) && notes.get(id).at < notes.get(id).list.length - 1,
    forget(id) { notes.delete(id); },
    steps: (id) => notes.get(id)?.list.length ?? 0,
  };
}
