import { animate, useReducedMotion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { formatMoney, type FormatOpts } from '../domain/money';
import { useSymbol } from '../lib/app';

interface Props extends FormatOpts {
  value: number;
  className?: string;
  /** count up/down to new values (≤ 450 ms) */
  animated?: boolean;
  /** color positive green / negative red */
  tone?: 'auto' | 'income' | 'expense' | 'none';
  /** exclude from hide-balances blur */
  public?: boolean;
  'data-testid'?: string;
}

export function Money({ value, className = '', animated = false, tone = 'none', public: isPublic, 'data-testid': testId, ...opts }: Props) {
  const symbol = useSymbol();
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  const fmt = (v: number) => formatMoney(Math.round(v), { symbol, ...opts });

  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (!animated || reduce || from === value || !ref.current) {
      if (ref.current) ref.current.textContent = fmt(value);
      return;
    }
    const c = animate(from, value, {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
      // in-between frames show whole rupees only; the exact value lands on complete
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = fmt(Math.round(v / 100) * 100);
      },
      onComplete: () => {
        if (ref.current) ref.current.textContent = fmt(value);
      },
    });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, symbol, animated, reduce, opts.signed, opts.bare]);

  const color =
    tone === 'income' ? 'text-income' : tone === 'expense' ? 'text-expense' : tone === 'auto' ? (value < 0 ? 'text-expense' : value > 0 ? 'text-income' : '') : '';
  return (
    <span ref={ref} data-testid={testId} data-value={value} className={`money whitespace-nowrap ${isPublic ? '' : 'money-private'} ${color} ${className}`}>
      {fmt(value)}
    </span>
  );
}
