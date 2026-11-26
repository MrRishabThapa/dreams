import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button, NavButton } from '../ui/Button';
import { Group, Row } from '../ui/List';
import { Toggle } from '../ui/bits';
import { PinPad } from '../ui/PinPad';
import { useToast } from '../ui/Toast';
import { disableLock, getLock, setAutoLock, setFaceId, setPin, verifyPin, type LockConfig } from '../lib/lock';
import { faceIdAvailable, registerFaceId, verifyFaceId } from '../lib/biometric';
import { Logo } from '../ui/Logo';

const DELAYS: { ms: number; label: string }[] = [
  { ms: 0, label: 'Immediately' },
  { ms: 60_000, label: 'After 1 minute' },
  { ms: 5 * 60_000, label: 'After 5 minutes' },
  { ms: 15 * 60_000, label: 'After 15 minutes' },
];

type Step = 'menu' | 'verify-off' | 'verify-change' | 'new' | 'confirm';

const changed = () => window.dispatchEvent(new Event('dreams:lockchange'));

export function AppLockSheet({ open, onClose, z }: { open: boolean; onClose: () => void; z: number }) {
  const toast = useToast();
  const [lock, setLock] = useState<LockConfig | null | undefined>(undefined);
  const [step, setStep] = useState<Step>('menu');
  const [len, setLen] = useState(6);
  const [faceOk, setFaceOk] = useState<boolean | null>(null);
  const [faceBusy, setFaceBusy] = useState(false);
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reload = () => getLock().then(setLock);
  useEffect(() => {
    void reload();
    void faceIdAvailable().then(setFaceOk);
  }, []);

  const toggleFace = async (on: boolean) => {
    if (faceBusy) return;
    setFaceBusy(true);
    try {
      if (!on) {
        await setFaceId(null);
        toast({ message: 'Face ID is off. Dreams asks for your PIN.' });
      } else {
        const r = await registerFaceId();
        if (!r.ok) {
          toast({ message: r.reason === 'cancelled' ? 'Face ID wasn’t turned on' : 'Face ID isn’t available here. Your PIN still works.', tone: 'error' });
          return;
        }
        // prove it works once before relying on it
        const v = await verifyFaceId(r.credId);
        if (!v.ok) {
          toast({ message: 'Face ID didn’t confirm. Your PIN still works.', tone: 'error' });
          return;
        }
        await setFaceId(r.credId);
        toast({ message: 'Face ID is on' });
      }
      changed();
      await reload();
    } finally {
      setFaceBusy(false);
    }
  };

  const go = (s: Step) => {
    setError(null);
    setStep(s);
  };

  const verify = async (pin: string) => {
    const r = await verifyPin(pin);
    if (!r.ok) return setError(r.waitMs ? `Too many tries. Wait ${Math.ceil(r.waitMs / 1000)} seconds.` : 'Wrong PIN');
    if (step === 'verify-off') {
      await disableLock();
      changed();
      await reload();
      toast({ message: 'App Lock is off' });
      go('menu');
    } else go('new');
  };

  const pad = (() => {
    switch (step) {
      case 'verify-off':
      case 'verify-change':
        return <PinPad key={step} length={lock?.length ?? 4} title="Enter current PIN" error={error} onComplete={verify} />;
      case 'new':
        return (
          <PinPad
            key={`new-${len}`}
            length={len}
            title={lock ? 'Enter a new PIN' : 'Choose a PIN'}
            subtitle={`${len} digits`}
            error={error}
            onComplete={(p) => {
              setFirst(p);
              go('confirm');
            }}
            footer={
              <button type="button" className="min-h-[44px] px-3 text-subhead text-accent" onClick={() => setLen(len === 6 ? 4 : 6)}>
                Use a {len === 4 ? 6 : 4}-digit PIN
              </button>
            }
          />
        );
      case 'confirm':
        return (
          <PinPad
            key="confirm"
            length={len}
            title="Enter it again"
            error={error}
            onComplete={async (p) => {
              if (p !== first) {
                setError('PINs didn’t match. Try again.');
                setFirst('');
                setTimeout(() => go('new'), 600);
                return;
              }
              await setPin(p);
              changed();
              await reload();
              toast({ message: lock ? 'PIN changed' : 'App Lock is on' });
              go('menu');
            }}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <Sheet
      open={open}
      onClose={onClose}
      z={z}
      title="App Lock"
      label="App Lock"
      left={step !== 'menu' ? <NavButton onClick={() => go('menu')}>Back</NavButton> : undefined}
      right={<NavButton bold onClick={onClose}>Done</NavButton>}
    >
      {step !== 'menu' ? (
        <div className="pt-6">{pad}</div>
      ) : lock === undefined ? null : lock ? (
        <>
          <Group className="mt-2" footer="Dreams asks for your PIN when you come back to it. While it’s in the background, a cover hides your balances from the app switcher.">
            <Row title="App Lock">
              <Toggle checked onChange={() => go('verify-off')} label="App Lock" />
            </Row>
            <Row title="Change PIN" accent onPress={() => go('verify-change')} />
          </Group>
          <Group
            className="mt-6"
            footer={
              faceOk === false
                ? 'Face ID isn’t available in this browser. Open Dreams from the Home Screen icon on an iPhone with Face ID.'
                : 'Unlock with Face ID; your PIN always works as the fallback. Only a credential id is kept on this iPhone, never your face or a secret.'
            }
          >
            <Row title="Lock with Face ID" subtitle={faceOk === false ? 'Not available' : undefined}>
              <Toggle checked={!!lock.faceId} onChange={(v) => void toggleFace(v)} label="Lock with Face ID" />
            </Row>
          </Group>
          <Group header="Lock" className="mt-6">
            {DELAYS.map((d) => (
              <Row
                key={d.ms}
                title={d.label}
                onPress={async () => {
                  await setAutoLock(d.ms);
                  changed();
                  await reload();
                }}
              >
                {lock.autoLockMs === d.ms && <Check size={20} className="text-accent" strokeWidth={2.6} />}
              </Row>
            ))}
          </Group>
        </>
      ) : (
        <div className="flex flex-col items-center px-8 pt-8 text-center">
          <Logo size={64} />
          <h2 className="mt-4 text-title3">Lock Dreams</h2>
          <p className="mt-2 text-subhead text-label-2">
            Ask for Face ID or a PIN when you open Dreams, and hide your balances in the app switcher. The PIN stays on this iPhone and isn’t in backups. If you forget it, reset it by signing in to your sync account, or erase and restore a backup.
          </p>
          <p className="mt-3 text-footnote text-label-2">This is a screen lock. It doesn’t encrypt the data stored on this iPhone.</p>
          <Button className="mt-6" block onClick={() => go('new')}>Turn On App Lock</Button>
        </div>
      )}
    </Sheet>
  );
}
