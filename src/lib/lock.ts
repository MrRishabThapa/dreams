import { getMeta, setMeta } from '../db/repo';

/**
 * App lock. The PIN is never stored: only a PBKDF2-SHA-256 hash with a random salt,
 * in local meta (never in backups or sync). Wrong attempts back off after 5 tries.
 */
export interface LockConfig {
  salt: string;
  hash: string;
  iterations: number;
  length: number;
  /** lock after the app has been in the background this long (ms); 0 = immediately */
  autoLockMs: number;
}

const KEY = 'appLock';
const FAILS = 'appLockFails';
const ITERATIONS = 150_000;
export const MAX_TRIES = 5;
export const LOCKOUT_MS = 30_000;

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return b64(bits);
}

export function validPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export async function getLock(): Promise<LockConfig | null> {
  return getMeta<LockConfig | null>(KEY, null);
}

export async function setPin(pin: string, autoLockMs?: number): Promise<void> {
  if (!validPin(pin)) throw new Error('Use 4 to 6 digits');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prev = await getLock();
  await setMeta(KEY, {
    salt: b64(salt),
    hash: await derive(pin, salt, ITERATIONS),
    iterations: ITERATIONS,
    length: pin.length,
    autoLockMs: autoLockMs ?? prev?.autoLockMs ?? 60_000,
  } satisfies LockConfig);
  await setMeta(FAILS, { count: 0, until: 0 });
}

export async function setAutoLock(ms: number): Promise<void> {
  const l = await getLock();
  if (l) await setMeta(KEY, { ...l, autoLockMs: ms });
}

export async function disableLock(): Promise<void> {
  await setMeta(KEY, null);
  await setMeta(FAILS, { count: 0, until: 0 });
}

export interface VerifyResult {
  ok: boolean;
  /** ms until another try is allowed (0 when allowed) */
  waitMs: number;
  triesLeft: number;
}

/** Constant-time-ish string compare (no early exit). */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function verifyPin(pin: string, now = Date.now()): Promise<VerifyResult> {
  const l = await getLock();
  if (!l) return { ok: true, waitMs: 0, triesLeft: MAX_TRIES };
  const fails = await getMeta<{ count: number; until: number }>(FAILS, { count: 0, until: 0 });
  if (fails.until > now) return { ok: false, waitMs: fails.until - now, triesLeft: 0 };
  const ok = same(await derive(pin, unb64(l.salt), l.iterations), l.hash);
  if (ok) {
    await setMeta(FAILS, { count: 0, until: 0 });
    return { ok: true, waitMs: 0, triesLeft: MAX_TRIES };
  }
  const count = fails.count + 1;
  const locked = count >= MAX_TRIES;
  await setMeta(FAILS, { count: locked ? 0 : count, until: locked ? now + LOCKOUT_MS : 0 });
  return { ok: false, waitMs: locked ? LOCKOUT_MS : 0, triesLeft: locked ? 0 : MAX_TRIES - count };
}
