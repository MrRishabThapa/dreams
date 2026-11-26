import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PinPad } from './PinPad';
import { useActionSheet } from './ActionSheet';
import { ScanFace } from 'lucide-react';
import { clearFails, getLock, setPin, verifyPin, type LockConfig } from '../lib/lock';
import { verifyFaceId } from '../lib/biometric';
import { reauthenticate, storedEmail } from '../sync/controller';
import { syncConfigured } from '../sync/config';
import { resetAll } from '../db/repo';
import { Logo } from './Logo';

/**
 * Wraps the app. While locked, only the lock screen renders. Whenever the app goes to the
 * background a privacy cover is shown at once (so the app switcher never shows balances),
 * and the app locks when it comes back after the auto-lock delay.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const [lock, setLock] = useState<LockConfig | null | undefined>(undefined);
  const [locked, setLocked] = useState(false);
  const [cover, setCover] = useState(false);
  const hiddenAt = useRef<number | null>(null);

  // load lock config; re-read when settings change it
  useEffect(() => {
    let alive = true;
    const load = (first: boolean) =>
      getLock().then((l) => {
        if (!alive) return;
        setLock(l);
        if (first && l) setLocked(true);
      });
    void load(true);
    const h = () => void load(false);
    window.addEventListener('dreams:lockchange', h);
    return () => {
      alive = false;
      window.removeEventListener('dreams:lockchange', h);
    };
  }, []);

  useEffect(() => {
    if (!lock) return;
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        setCover(true);
      } else {
        const away = hiddenAt.current === null ? 0 : Date.now() - hiddenAt.current;
        if (away >= lock.autoLockMs) setLocked(true);
        setCover(false);
        hiddenAt.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onVis);
    };
  }, [lock]);

  if (lock === undefined) return null; // never flash the app before we know
  return (
    <>
      {locked && lock ? <LockScreen lock={lock} onUnlock={() => setLocked(false)} /> : children}
      {cover && <PrivacyCover />}
    </>
  );
}

function PrivacyCover() {
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-bg" aria-hidden data-testid="privacy-cover">
      <Logo size={80} />
    </div>
  );
}

type LockStep = 'pin' | 'reauth' | 'new' | 'confirm';

function LockScreen({ lock, onUnlock }: { lock: LockConfig; onUnlock: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [step, setStep] = useState<LockStep>('pin');
  const [faceMsg, setFaceMsg] = useState<string | null>(null);
  const [first, setFirst] = useState('');
  const [email, setEmail] = useState(() => storedEmail() ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const ask = useActionSheet();
  const tried = useRef(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1000)), 1000);
    return () => clearInterval(t);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const faceId = async (auto = false) => {
    if (!lock.faceId) return;
    setFaceMsg(null);
    const r = await verifyFaceId(lock.faceId.credId);
    if (r.ok) {
      await clearFails();
      return onUnlock();
    }
    // an automatic prompt iOS refuses without a tap stays quiet; the button is right there
    if (!auto) setFaceMsg(r.reason === 'cancelled' ? 'Face ID was cancelled. Use your PIN or try again.' : r.reason === 'unavailable' ? 'Face ID isn’t available. Use your PIN.' : 'Face ID didn’t work. Use your PIN.');
  };

  // ask for Face ID straight away when the lock screen appears
  useEffect(() => {
    if (lock.faceId && !tried.current) {
      tried.current = true;
      void faceId(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (pin: string) => {
    const r = await verifyPin(pin);
    if (r.ok) return onUnlock();
    if (r.waitMs > 0) {
      setWait(r.waitMs);
      setError(`Too many tries. Wait ${Math.ceil(r.waitMs / 1000)} seconds.`);
    } else setError(`Wrong PIN. ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left.`);
  };

  const erase = async () => {
    const b = await ask({ title: 'Erase everything?', message: 'Accounts, transactions, debts, dreams and audits on this iPhone are deleted.', options: [{ label: 'Erase', value: 'go', destructive: true }] });
    if (b !== 'go') return;
    await resetAll();
    location.reload();
  };

  const forgot = async () => {
    const canSync = syncConfigured();
    const a = await ask({
      title: 'Forgot your PIN?',
      message: canSync
        ? 'Sign in with your sync account’s email and password to choose a new PIN. Your data stays as it is.'
        : 'The PIN can’t be recovered. You can erase this iPhone’s Dreams data and restore it from a backup file.',
      options: [
        ...(canSync ? [{ label: 'Reset PIN with Sync Account', value: 'reauth' }] : []),
        { label: 'Erase Dreams Data', value: 'erase', destructive: true },
      ],
    });
    if (a === 'reauth') {
      setError(null);
      setStep('reauth');
    }
    if (a === 'erase') await erase();
  };

  const reauth = async () => {
    setBusy(true);
    setError(null);
    const msg = await reauthenticate(email, password);
    setBusy(false);
    setPassword('');
    if (msg) return setError(msg);
    setStep('new');
  };

  const shell = (body: ReactNode) => (
    <div className="fixed inset-0 z-[400] flex flex-col items-center justify-center bg-bg" role="dialog" aria-modal="true" aria-label="Dreams is locked" style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
      <Logo size={64} className="mb-6" />
      {body}
    </div>
  );

  if (step === 'reauth') {
    return shell(
      <form className="w-full max-w-[340px] px-6" onSubmit={(e) => { e.preventDefault(); void reauth(); }}>
        <h2 className="text-center text-title3">Reset your PIN</h2>
        <p className="mt-1 text-center text-subhead text-label-2">Sign in to your sync account. Nothing on this iPhone is erased.</p>
        <div className="card mt-5 overflow-hidden">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" inputMode="email" autoCapitalize="none" placeholder="Email" aria-label="Email" className="sep h-11 w-full bg-surface px-4 text-[17px] outline-none placeholder:text-label-3" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="Password" aria-label="Password" className="h-11 w-full border-t-[0.5px] border-separator bg-surface px-4 text-[17px] outline-none placeholder:text-label-3" />
        </div>
        {error && <p className="mt-3 text-center text-footnote font-medium text-expense" role="alert">{error}</p>}
        <button type="submit" disabled={busy || !email.trim() || !password} className="pressable mt-5 h-[50px] w-full rounded-xl bg-accent text-headline text-on-accent disabled:opacity-40">
          {busy ? 'Checking…' : 'Continue'}
        </button>
        <button type="button" className="mt-2 min-h-[44px] w-full text-subhead text-accent" onClick={() => { setError(null); setStep('pin'); }}>Back</button>
      </form>,
    );
  }

  if (step === 'new' || step === 'confirm') {
    return shell(
      step === 'new' ? (
        <PinPad key="new" length={6} title="Choose a new PIN" subtitle="6 digits" error={error} onComplete={(p) => { setFirst(p); setError(null); setStep('confirm'); }} />
      ) : (
        <PinPad
          key="confirm"
          length={6}
          title="Enter it again"
          error={error}
          onComplete={async (p) => {
            if (p !== first) {
              setError('PINs didn’t match. Try again.');
              setStep('new');
              return;
            }
            await setPin(p);
            window.dispatchEvent(new Event('dreams:lockchange'));
            onUnlock();
          }}
        />
      ),
    );
  }

  return shell(
    <>
      {lock.faceId && (
        <div className="mb-4 flex flex-col items-center">
          <button type="button" onClick={() => void faceId()} className="pressable flex min-h-[44px] items-center gap-2 rounded-full bg-fill px-5 text-headline text-accent">
            <ScanFace size={22} /> Unlock with Face ID
          </button>
          {faceMsg && <p className="mt-2 max-w-[300px] text-center text-footnote text-label-2" role="status">{faceMsg}</p>}
        </div>
      )}
      <PinPad
        length={lock.length}
        title="Enter PIN"
        subtitle="Dreams is locked"
        error={wait > 0 ? `Too many tries. Wait ${Math.ceil(wait / 1000)} seconds.` : error}
        disabled={wait > 0}
        onComplete={submit}
        footer={<button type="button" className="min-h-[44px] px-3 text-subhead text-accent" onClick={forgot}>Forgot PIN?</button>}
      />
    </>,
  );
}
