import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { faceIdAvailable, registerFaceId, verifyFaceId } from './biometric';
import { db } from '../db/db';
import { getLock, setFaceId, setPin, verifyPin } from './lock';

const HOST = 'dreams.example.dev';
const RAW = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const RAW_ID = 'AQIDBAUGBwg';

async function authData(host: string, flags: number) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(host)));
  const a = new Uint8Array(37);
  a.set(h, 0);
  a[32] = flags;
  return a.buffer;
}

let create: ReturnType<typeof vi.fn>;
let get: ReturnType<typeof vi.fn>;
let available = true;

beforeEach(async () => {
  available = true;
  create = vi.fn(async () => ({ rawId: RAW.buffer }));
  get = vi.fn(async () => ({ rawId: RAW.buffer, response: { authenticatorData: await authData(HOST, 0x05) } }));
  vi.stubGlobal('location', { hostname: HOST });
  vi.stubGlobal('navigator', { credentials: { create, get } });
  vi.stubGlobal('PublicKeyCredential', { isUserVerifyingPlatformAuthenticatorAvailable: async () => available });
  await db.meta.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('Face ID (WebAuthn platform authenticator, mocked)', () => {
  it('is unavailable without WebAuthn or without a platform authenticator', async () => {
    expect(await faceIdAvailable()).toBe(true);
    available = false;
    expect(await faceIdAvailable()).toBe(false);
    expect(await registerFaceId()).toEqual({ ok: false, reason: 'unavailable' });
    vi.stubGlobal('PublicKeyCredential', undefined);
    expect(await faceIdAvailable()).toBe(false);
  });

  it('registers a platform credential that requires user verification, for this host', async () => {
    expect(await registerFaceId()).toEqual({ ok: true, credId: RAW_ID });
    const pk = create.mock.calls[0][0].publicKey;
    expect(pk.rp.id).toBe(HOST);
    expect(pk.authenticatorSelection).toMatchObject({ authenticatorAttachment: 'platform', userVerification: 'required' });
    expect(pk.attestation).toBe('none');
  });

  it('unlocks only with our credential, our host and the user-verified flag', async () => {
    expect(await verifyFaceId(RAW_ID)).toEqual({ ok: true });
    const pk = get.mock.calls[0][0].publicKey;
    expect(pk.userVerification).toBe('required');
    expect(pk.rpId).toBe(HOST);
    expect(Array.from(pk.allowCredentials[0].id)).toEqual(Array.from(RAW));

    get.mockResolvedValueOnce({ rawId: RAW.buffer, response: { authenticatorData: await authData(HOST, 0x01) } }); // present, not verified
    expect((await verifyFaceId(RAW_ID)).ok).toBe(false);
    get.mockResolvedValueOnce({ rawId: RAW.buffer, response: { authenticatorData: await authData('evil.example', 0x05) } });
    expect((await verifyFaceId(RAW_ID)).ok).toBe(false);
    get.mockResolvedValueOnce({ rawId: new Uint8Array([9]).buffer, response: { authenticatorData: await authData(HOST, 0x05) } });
    expect((await verifyFaceId(RAW_ID)).ok).toBe(false);
  });

  it('a cancelled prompt is reported, never thrown', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    expect(await verifyFaceId(RAW_ID)).toEqual({ ok: false, reason: 'cancelled' });
    get.mockRejectedValueOnce(new Error('boom'));
    expect(await verifyFaceId(RAW_ID)).toEqual({ ok: false, reason: 'failed' });
  });

  it('keeps only the credential id, needs a PIN first, and survives a PIN change', async () => {
    await expect(setFaceId(RAW_ID)).rejects.toThrow('Set a PIN first');
    await setPin('123456');
    await setFaceId(RAW_ID);
    expect((await getLock())!.faceId).toEqual({ credId: RAW_ID });
    await setPin('654321');
    expect((await getLock())!.faceId).toEqual({ credId: RAW_ID });
    expect((await verifyPin('654321')).ok).toBe(true);
    await setFaceId(null);
    expect((await getLock())!.faceId).toBeNull();
  });
});
