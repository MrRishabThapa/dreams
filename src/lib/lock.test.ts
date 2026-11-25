import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { disableLock, getLock, setPin, verifyPin, MAX_TRIES, LOCKOUT_MS, validPin } from './lock';

beforeEach(async () => {
  await db.meta.clear();
});

describe('app lock', () => {
  it('stores only a salted PBKDF2 hash and verifies the PIN', async () => {
    await setPin('2580');
    const l = (await getLock())!;
    expect(JSON.stringify(l)).not.toContain('2580');
    expect(l.iterations).toBeGreaterThanOrEqual(100_000);
    expect(l.length).toBe(4);
    expect((await verifyPin('2580')).ok).toBe(true);
    expect((await verifyPin('0000')).ok).toBe(false);
  });

  it('same PIN, different salt, different hash', async () => {
    await setPin('123456');
    const a = (await getLock())!.hash;
    await setPin('123456');
    expect((await getLock())!.hash).not.toBe(a);
  });

  it('backs off for 30 s after 5 wrong tries', async () => {
    await setPin('1111');
    const t0 = 1_000_000;
    for (let i = 1; i < MAX_TRIES; i++) expect((await verifyPin('9999', t0)).triesLeft).toBe(MAX_TRIES - i);
    const last = await verifyPin('9999', t0);
    expect(last.waitMs).toBe(LOCKOUT_MS);
    expect((await verifyPin('1111', t0 + 1000)).ok).toBe(false); // still waiting, even with the right PIN
    expect((await verifyPin('1111', t0 + LOCKOUT_MS + 1)).ok).toBe(true);
  });

  it('validates PIN format and can be turned off', async () => {
    expect(validPin('123')).toBe(false);
    expect(validPin('1234567')).toBe(false);
    expect(validPin('12a4')).toBe(false);
    await expect(setPin('12')).rejects.toThrow();
    await setPin('4321');
    await disableLock();
    expect(await getLock()).toBeNull();
    expect((await verifyPin('anything')).ok).toBe(true);
  });
});
