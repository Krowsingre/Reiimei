// Reiimei read aloud: the note (or the selected words) read by the device's own voice, at a speed
// in words a minute. 150 is an average speaking pace; the same speed gives the speaking time shown
// in the word count. Nothing leaves the device: it uses the browser's speech (Web Speech API).
export const WPM_DEFAULT = 150;
export const WPM_CHOICES = [100, 120, 130, 150, 170, 190, 220];
export const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
// The browser's normal rate (1) is close to an average speaking pace.
const rateOf = (wpm) => Math.max(0.5, Math.min(2, wpm / WPM_DEFAULT));

// Speaking time for a number of words: "under a minute", "8 min", "1 h 5 min".
export function speakingTime(words, wpm = WPM_DEFAULT) {
  const min = words / Math.max(60, wpm);
  if (min < 1) return words ? 'under a minute' : '';
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

// Short pieces, sentence by sentence (some phones stop a long piece part way).
export function chunks(text) {
  const out = [];
  for (const para of String(text).split(/\n+/)) {
    const p = para.replace(/\s+/g, ' ').trim();
    if (!p) continue;
    const sentences = p.match(/[^.!?…]+[.!?…]+["'”’)\]]*\s*|[^.!?…]+$/g) || [p];
    let cur = '';
    for (const s of sentences) {
      if ((cur + s).length > 220 && cur) { out.push(cur.trim()); cur = ''; }
      cur += s;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

let queue = [];
let at = 0;
let wpm = WPM_DEFAULT;
let state = 'idle'; // idle | speaking | paused
let onChange = () => {};
const words = (s) => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length;
export const status = () => ({ state, at, total: queue.length, left: queue.slice(at).reduce((n, c) => n + words(c), 0), wpm });

function sayFrom(i) {
  speechSynthesis.cancel();
  at = i;
  if (at >= queue.length) { state = 'idle'; onChange(status()); return; }
  const u = new SpeechSynthesisUtterance(queue[at]);
  u.rate = rateOf(wpm);
  u.lang = document.documentElement.lang || 'en-US';
  u.onend = () => { if (state === 'speaking' && queue[at] === u.text) sayFrom(at + 1); };
  u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') { state = 'idle'; onChange(status()); } };
  state = 'speaking';
  speechSynthesis.speak(u);
  onChange(status());
}
export function start(text, { speed = WPM_DEFAULT, changed = () => {} } = {}) {
  if (!supported()) return false;
  onChange = changed;
  queue = chunks(text);
  wpm = speed;
  if (!queue.length) return false;
  sayFrom(0);
  return true;
}
export function pause() {
  if (state !== 'speaking') return;
  state = 'paused';
  speechSynthesis.pause();
  onChange(status());
}
export function resume() {
  if (state !== 'paused') return;
  state = 'speaking';
  // Some browsers do not resume after a pause: start the piece again.
  if (speechSynthesis.paused) speechSynthesis.resume(); else sayFrom(at);
  onChange(status());
}
export function stop() {
  state = 'idle';
  queue = [];
  at = 0;
  if (supported()) speechSynthesis.cancel();
  onChange(status());
}
// A new speed takes effect from the piece being read.
export function setSpeed(speed) {
  wpm = speed;
  if (state === 'speaking') sayFrom(at);
  else onChange(status());
}
