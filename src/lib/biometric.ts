/**
 * Face ID unlock through WebAuthn's platform authenticator. In an iOS Home Screen app,
 * `userVerification: "required"` on the built-in authenticator is Face ID (or Touch ID).
 *
 * Honest scope: this is a screen lock, not encryption. There is no server, so the assertion
 * isn't signature-checked against a stored key; we accept it when the browser returns one
 * for our credential, for our host (rpIdHash), with the user-verified flag set. Nothing
 * secret is stored: only the credential id, in local meta (never synced or backed up).
 * The PIN always stays as the fallback.
 */

export type FaceIdResult = { ok: true } | { ok: false; reason: 'cancelled' | 'unavailable' | 'failed' };

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string): Uint8Array<ArrayBuffer> => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(p + '='.repeat((4 - (p.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

const rpId = () => location.hostname;
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** Feature detection: WebAuthn plus a user-verifying platform authenticator (Face ID). */
export async function faceIdAvailable(): Promise<boolean> {
  try {
    const PKC = (globalThis as { PublicKeyCredential?: typeof PublicKeyCredential }).PublicKeyCredential;
    if (!PKC || !navigator.credentials?.create || typeof PKC.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;
    return await PKC.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function reasonOf(e: unknown): 'cancelled' | 'failed' {
  const name = (e as { name?: string })?.name;
  return name === 'NotAllowedError' || name === 'AbortError' ? 'cancelled' : 'failed';
}

/** Registers a Face ID credential for this app on this device. Call from a tap. Returns its id. */
export async function registerFaceId(): Promise<{ ok: true; credId: string } | { ok: false; reason: 'cancelled' | 'unavailable' | 'failed' }> {
  if (!(await faceIdAvailable())) return { ok: false, reason: 'unavailable' };
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: random(32),
        rp: { name: 'Dreams', id: rpId() },
        user: { id: random(16), name: 'Dreams app lock', displayName: 'Dreams app lock' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged', requireResidentKey: false },
        attestation: 'none',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return { ok: false, reason: 'failed' };
    return { ok: true, credId: b64url(cred.rawId) };
  } catch (e) {
    return { ok: false, reason: reasonOf(e) };
  }
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

/** Asks for Face ID. Resolves ok only for our credential, our host, with user verification. */
export async function verifyFaceId(credId: string): Promise<FaceIdResult> {
  if (!(await faceIdAvailable())) return { ok: false, reason: 'unavailable' };
  try {
    const id = unb64url(credId);
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        rpId: rpId(),
        allowCredentials: [{ type: 'public-key', id, transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred || b64url(cred.rawId) !== credId) return { ok: false, reason: 'failed' };
    const auth = new Uint8Array((cred.response as AuthenticatorAssertionResponse).authenticatorData);
    if (auth.length < 37) return { ok: false, reason: 'failed' };
    const expected = await sha256(rpId());
    for (let i = 0; i < 32; i++) if (auth[i] !== expected[i]) return { ok: false, reason: 'failed' };
    const flags = auth[32];
    const userPresent = (flags & 0x01) !== 0;
    const userVerified = (flags & 0x04) !== 0;
    return userPresent && userVerified ? { ok: true } : { ok: false, reason: 'failed' };
  } catch (e) {
    return { ok: false, reason: reasonOf(e) };
  }
}
