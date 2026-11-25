import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PinPad } from './PinPad';
import { useActionSheet } from './ActionSheet';
import { getLock, verifyPin, type LockConfig } from '../lib/lock';
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

function LockScreen({ lock, onUnlock }: { lock: LockConfig; onUnlock: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const ask = useActionSheet();

  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setWait((w) => Math.max(0, w - 1000)), 1000);
    return () => clearInterval(t);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (pin: string) => {
    const r = await verifyPin(pin);
    if (r.ok) return onUnlock();
    if (r.waitMs > 0) {
      setWait(r.waitMs);
      setError(`Too many tries. Wait ${Math.ceil(r.waitMs / 1000)} seconds.`);
    } else setError(`Wrong PIN. ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left.`);
  };

  const forgot = async () => {
    const a = await ask({
      title: 'Forgot your PIN?',
      message: 'The PIN can’t be recovered. You can erase this iPhone’s Dreams data and restore it from a backup file.',
      options: [{ label: 'Erase Dreams Data', value: 'erase', destructive: true }],
    });
    if (a !== 'erase') return;
    const b = await ask({ title: 'Erase everything?', message: 'Accounts, transactions, debts, dreams and audits on this iPhone are deleted.', options: [{ label: 'Erase', value: 'go', destructive: true }] });
    if (b !== 'go') return;
    await resetAll();
    location.reload();
  };

  return (
    <div className="fixed inset-0 z-[400] flex flex-col items-center justify-center bg-bg" role="dialog" aria-modal="true" aria-label="Dreams is locked" style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
      <Logo size={64} className="mb-6" />
      <PinPad
        length={lock.length}
        title="Enter PIN"
        subtitle="Dreams is locked"
        error={wait > 0 ? `Too many tries. Wait ${Math.ceil(wait / 1000)} seconds.` : error}
        disabled={wait > 0}
        onComplete={submit}
        footer={<button type="button" className="min-h-[44px] px-3 text-subhead text-accent" onClick={forgot}>Forgot PIN?</button>}
      />
    </div>
  );
}
