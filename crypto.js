// Reiimei encryption: passphrase-based, end to end.
// A key is derived from the passphrase with PBKDF2 (SHA-256, 600,000 rounds)
// and notes are sealed with AES-GCM before they are stored or synced.
// The key lives only in memory; the passphrase is never stored or logged.
//
// Sealed text format: "rk1.<salt>.<iv>.<ciphertext>" (base64url parts).
// Carrying the salt in every value lets another device find the right key.
import { log } from './logger.js';

export const ITERATIONS = 600000;
const PREFIX = 'rk1';
const enc = new TextEncoder();
const dec = new TextDecoder();

const state = {
  enabled: false,   // this device writes encrypted data
  salt: null,       // base64url salt for new data
  keys: new Map(),  // salt -> CryptoKey (current session only)
  passphrase: null, // held only while unlocked, to derive keys for other salts
};

export const isSupported = () => !!(globalThis.crypto && crypto.subtle && crypto.getRandomValues);
export const isEnabled = () => state.enabled;
export const isUnlocked = () => !state.enabled || state.keys.has(state.salt);
export const isSealed = (v) => typeof v === 'string' && v.startsWith(`${PREFIX}.`);

const b64 = (bytes) => {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64 = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function derive(passphrase, saltB64) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function keyFor(saltB64) {
  if (state.keys.has(saltB64)) return state.keys.get(saltB64);
  if (!state.passphrase) throw new LockedError();
  const t0 = performance.now();
  const key = await derive(state.passphrase, saltB64);
  state.keys.set(saltB64, key);
  log.debug('crypto', `Derived a key in ${Math.round(performance.now() - t0)} ms`);
  return key;
}

export class LockedError extends Error {
  constructor() { super('Reiimei is locked'); this.name = 'LockedError'; }
}
export class WrongPassphraseError extends Error {
  constructor() { super('That passphrase does not open these notes'); this.name = 'WrongPassphraseError'; }
}

export async function seal(obj) {
  if (!state.salt) throw new LockedError();
  const key = await keyFor(state.salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
  return `${PREFIX}.${state.salt}.${b64(iv)}.${b64(ct)}`;
}

export async function open(sealed) {
  const [p, salt, iv, ct] = String(sealed).split('.');
  if (p !== PREFIX || !salt || !iv || !ct) throw new Error('Unrecognized encrypted data');
  const key = await keyFor(salt);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
    return JSON.parse(dec.decode(plain));
  } catch {
    throw new WrongPassphraseError();
  }
}

export const saltOf = (sealed) => (isSealed(sealed) ? String(sealed).split('.')[1] : null);

// Configuration kept on this device (no secrets): {enabled, salt, check, autoLockMin}
export function configure(cfg) {
  state.enabled = !!cfg?.enabled;
  state.salt = cfg?.salt || null;
}

// Create a fresh salt (or reuse one found in synced data) and unlock with it.
// Keys already in memory are kept, so data sealed with the previous key (for
// example, older copies still on the server) can be read until it is rewritten.
export async function enable(passphrase, existingSalt = null) {
  const salt = existingSalt || b64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await derive(passphrase, salt);
  state.keys.set(salt, key);
  state.passphrase = passphrase;
  state.salt = salt;
  state.enabled = true;
  const check = await seal({ reiimei: 'check' });
  log.info('crypto', 'Encryption key created');
  return { enabled: true, salt, check };
}

// Unlock using the stored check value, which proves the passphrase is right.
export async function unlock(passphrase, cfg) {
  const key = await derive(passphrase, cfg.salt);
  const [, , iv, ct] = cfg.check.split('.');
  try {
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
  } catch {
    throw new WrongPassphraseError();
  }
  state.keys.clear();
  state.keys.set(cfg.salt, key);
  state.passphrase = passphrase;
  state.salt = cfg.salt;
  state.enabled = true;
  log.info('crypto', 'Unlocked');
}

// Try a passphrase against a sealed value from another device.
export async function canOpen(passphrase, sealed) {
  const [, salt, iv, ct] = String(sealed).split('.');
  const key = await derive(passphrase, salt);
  try {
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
    return true;
  } catch {
    return false;
  }
}

export function lock() {
  state.keys.clear();
  state.passphrase = null;
  log.info('crypto', 'Locked');
}

export function disable() {
  state.enabled = false;
  log.info('crypto', 'Encryption turned off for new writes');
}

// Lets a device that has encryption off still read sealed data it receives.
export function rememberPassphrase(passphrase) {
  state.passphrase = passphrase;
}

export async function verifyPassphrase(passphrase, cfg) {
  try {
    const key = await derive(passphrase, cfg.salt);
    const [, , iv, ct] = cfg.check.split('.');
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(ct));
    return true;
  } catch {
    return false;
  }
}

export function passphraseProblem(p) {
  if (!p || p.length < 10) return 'Use at least 10 characters. A few unrelated words works well.';
  if (/^(.)\1+$/.test(p)) return 'Avoid repeating one character.';
  return '';
}
