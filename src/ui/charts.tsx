import { useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Money } from './Money';

/** Calm categorical fallback (always paired with labels; color is never the only cue). */
export const SERIES = ['#7C3AED', '#FF9500', '#30B0C7', '#FF2D55', '#34C759', '#A2845E', '#5856D6', '#00C7BE', '#8E8E93'];

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Donut drawn with one circle per slice (dasharray), small gaps between slices. */
export function Donut({ slices, size = 168, stroke = 22, center, onSlice }: { slices: Slice[]; size?: number; stroke?: number; center?: ReactNode; onSlice?: (key: string) => void }) {
  const reduce = useReducedMotion();
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label="Spending by category">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={stroke} />
        {total > 0 &&
          slices.map((s) => {
            const len = (s.value / total) * c;
            const dash = Math.max(0, len - gap);
            const el = (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                onClick={() => onSlice?.(s.key)}
                style={{ transition: reduce ? 'none' : 'stroke-dasharray 450ms ease-out, stroke-dashoffset 450ms ease-out', cursor: onSlice ? 'pointer' : undefined }}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  );
}

/** Two horizontal bars on one scale (Income vs Spent). */
export function PairBars({ a, b }: { a: { label: string; value: number; color: string }; b: { label: string; value: number; color: string } }) {
  const max = Math.max(a.value, b.value, 1);
  const bar = (x: typeof a) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-subhead text-label-2">{x.label}</span>
        <Money value={x.value} className="text-headline" />
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-fill">
        <div className="h-full w-full origin-left rounded-full transition-transform duration-[450ms] ease-out motion-reduce:transition-none" style={{ transform: `scaleX(${x.value / max})`, background: x.color }} />
      </div>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      {bar(a)}
      {bar(b)}
    </div>
  );
}

/** Ranked category bars, scaled to the largest. Each row is a button when onPress is given. */
export function RankedBars({ rows, onPress }: { rows: (Slice & { sub?: ReactNode; icon?: ReactNode })[]; onPress?: (key: string) => void }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="flex flex-col">
      {rows.map((r) => (
        <button
          key={r.key}
          type="button"
          disabled={!onPress}
          onClick={() => onPress?.(r.key)}
          className="row sep flex min-h-[52px] w-full items-center gap-3 bg-surface pl-4 text-left active:bg-surface-3 disabled:active:bg-surface"
          aria-label={`${r.label}, see transactions`}
        >
          {r.icon}
          <span className="row-body flex min-w-0 flex-1 flex-col gap-1.5 py-2.5 pr-4">
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-body">{r.label}</span>
              {r.sub}
              <Money value={r.value} className="text-body" />
            </span>
            <span className="h-[6px] w-full overflow-hidden rounded-full bg-fill">
              <span className="block h-full w-full origin-left rounded-full" style={{ transform: `scaleX(${r.value / max})`, background: r.color }} />
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
