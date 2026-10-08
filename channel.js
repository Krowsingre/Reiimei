// Reiimei channel: the live app, or a beta copy for trying a new version first.
// A beta copy is one served from a folder whose name has "beta" in it, such as
// https://yourname.github.io/reiimei-beta/. Pages from the same site share one browser storage,
// so a beta copy keeps everything under its own names (its own database, settings, sign-in and
// offline copy) and never touches the live app's notes on that device. Notes still meet through
// sync when both copies sign in to the same account.

const first = (location.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
export const BETA = /beta/.test(first) && !/\.[a-z0-9]+$/.test(first);
export const KEY = BETA ? 'reiimei-beta.' : 'reiimei.';       // prefix of every saved setting
export const DB_NAME = BETA ? 'reiimei-beta' : 'reiimei';     // the notes database
export const NAME = BETA ? 'Reiimei Beta' : 'Reiimei';
