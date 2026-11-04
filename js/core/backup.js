// Backup codes: the whole save as one copyable line ("BT1." + base64url JSON), so progress survives Safari clearing
// website data, or moves to a new phone. The "seen questions" lists are left out (they only steer repeats).
import { migrate } from './progress.js';

const PREFIX = 'BT1.';   // a different prefix from the sibling game, so the two can never read each other's codes
export const BACKUP_NUDGE_DAYS = 14;

const toB64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (b64) => {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

export function makeCode(save) {
  const { seen, ...rest } = save;
  return PREFIX + toB64(JSON.stringify(rest));
}

/** @returns {object} a complete save @throws {Error} with a friendly message if the code is not a backup */
export function readCode(code) {
  const c = String(code || '').replace(/\s+/g, '');
  if (!c.startsWith(PREFIX)) throw new Error("That doesn't look like a Byte's AI 101 backup code.");
  let data;
  try { data = JSON.parse(fromB64(c.slice(PREFIX.length))); } catch { throw new Error('That code seems cut short. Try copying all of it.'); }
  if (!data || typeof data !== 'object' || !data.stats || !data.cats) throw new Error("That code doesn't contain a save.");
  return migrate(data);
}

/** Days since the last backup (Infinity if never). */
export const daysSinceBackup = (save, now = Date.now()) => (save.lastBackup ? (now - save.lastBackup) / 86400000 : Infinity);
