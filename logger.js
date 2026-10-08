// Reiimei logger: writes to the console and keeps a rolling log in localStorage
// so problems on the iPhone can be exported and inspected later.
import { KEY } from './channel.js';

const LOG_KEY = `${KEY}log`;
const MAX_ENTRIES = 1000;

let buffer = [];
try {
  buffer = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
  if (!Array.isArray(buffer)) buffer = [];
} catch {
  buffer = [];
}

let flushTimer = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(buffer.slice(-MAX_ENTRIES)));
    } catch {
      // Storage full or blocked: keep logging to the console only.
    }
  }, 500);
}

function write(level, area, message, data) {
  const entry = {
    t: new Date().toISOString(),
    level,
    area,
    message,
  };
  if (data !== undefined) {
    try {
      entry.data = data instanceof Error
        ? { name: data.name, message: data.message, stack: data.stack }
        : JSON.parse(JSON.stringify(data));
    } catch {
      entry.data = String(data);
    }
  }
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer = buffer.slice(-MAX_ENTRIES);
  scheduleFlush();
  const line = `[${entry.t}] ${level.toUpperCase()} ${area}: ${message}`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  data !== undefined ? fn(line, data) : fn(line);
}

export const log = {
  debug: (area, msg, data) => write('debug', area, msg, data),
  info: (area, msg, data) => write('info', area, msg, data),
  warn: (area, msg, data) => write('warn', area, msg, data),
  error: (area, msg, data) => write('error', area, msg, data),
  entries: () => buffer.slice(),
  clear: () => {
    buffer = [];
    try { localStorage.removeItem(LOG_KEY); } catch { /* ignore */ }
  },
  exportText: () =>
    buffer
      .map((e) => `${e.t} ${e.level.toUpperCase().padEnd(5)} ${e.area}: ${e.message}` +
        (e.data !== undefined ? ` ${JSON.stringify(e.data)}` : ''))
      .join('\n'),
};

// Capture anything that slips through.
window.addEventListener('error', (e) => {
  log.error('window', e.message || 'Uncaught error', e.error || { file: e.filename, line: e.lineno });
});
window.addEventListener('unhandledrejection', (e) => {
  log.error('window', 'Unhandled promise rejection', e.reason);
});
