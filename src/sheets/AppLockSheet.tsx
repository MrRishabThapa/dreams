import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button, NavButton } from '../ui/Button';
import { Group, Row } from '../ui/List';
import { Toggle } from '../ui/bits';
import { PinPad } from '../ui/PinPad';
import { useToast } from '../ui/Toast';
import { disableLock, getLock, setAutoLock, setPin, verifyPin, type LockConfig } from '../lib/lock';
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
  const [len, setLen] = useState(4);
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reload = () => getLock().then(setLock);
  useEffect(() => {
    void reload();
  }, []);

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
              <button type="button" className="min-h-[44px] px-3 text-subhead text-accent" onClick={() => setLen(len === 4 ? 6 : 4)}>
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
          <h2 className="mt-4 text-title3">Lock Dreams with a PIN</h2>
          <p className="mt-2 text-subhead text-label-2">
            Ask for a 4 or 6-digit PIN when you open Dreams, and hide your balances in the app switcher. The PIN stays on this iPhone and isn’t in backups. If you forget it, the only way back is to erase and restore a backup.
          </p>
          <Button className="mt-6" block onClick={() => go('new')}>Turn On App Lock</Button>
        </div>
      )}
    </Sheet>
  );
}
