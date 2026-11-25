import { Delete } from 'lucide-react';
import { useEffect, useState } from 'react';

/** iOS-style passcode entry: dots + round number keys. Calls onComplete when `length` digits are in. */
export function PinPad({ length, onComplete, title, subtitle, error, disabled, footer }: {
  length: number;
  onComplete: (pin: string) => void;
  title: string;
  subtitle?: string;
  error?: string | null;
  disabled?: boolean;
  footer?: React.ReactNode;
}) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(0);

  useEffect(() => {
    if (error) {
      setShake((s) => s + 1);
      setPin('');
    }
  }, [error]);

  const press = (d: string) => {
    if (disabled) return;
    if (d === 'del') return setPin((p) => p.slice(0, -1));
    const next = (pin + d).slice(0, length);
    setPin(next);
    if (next.length === length) setTimeout(() => {
      onComplete(next);
      setPin('');
    }, 90);
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <div className="chrome flex flex-col items-center">
      <div className="text-title3">{title}</div>
      <div className="mt-1 h-5 text-subhead text-label-2">{subtitle}</div>
      <div key={shake} className={`mt-6 flex gap-4 ${shake ? 'animate-[shake_.3s]' : ''}`} aria-label={`${pin.length} of ${length} digits entered`} role="status">
        {Array.from({ length }, (_, i) => (
          <span key={i} className={`h-[13px] w-[13px] rounded-full border-[1.5px] border-label ${i < pin.length ? 'bg-label' : ''}`} />
        ))}
      </div>
      <div className="mt-3 h-5 text-footnote font-medium text-expense" aria-live="assertive">{error}</div>
      <div className="mt-6 grid grid-cols-3 gap-x-6 gap-y-4" role="group" aria-label="PIN keypad">
        {keys.map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={disabled}
              aria-label={k === 'del' ? 'Delete digit' : k}
              onClick={() => press(k)}
              className={`pressable flex h-[76px] w-[76px] items-center justify-center rounded-full text-[34px] font-light disabled:opacity-40 ${k === 'del' ? 'text-label' : 'bg-fill text-label'}`}
            >
              {k === 'del' ? <Delete size={26} strokeWidth={1.6} /> : <span className="rounded-num">{k}</span>}
            </button>
          ),
        )}
      </div>
      {footer && <div className="mt-6">{footer}</div>}
    </div>
  );
}
