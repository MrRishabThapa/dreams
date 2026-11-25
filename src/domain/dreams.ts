import type { Dream, DreamEntry, ISODate, Minor, Month } from './types';
import { addMonths, monthOf } from './dates';

/** Soft two-stop gradients for dream cards (calm, no neon). */
export const DREAM_COLORS: Record<string, { label: string; from: string; to: string; ink: string }> = {
  sky: { label: 'Sky', from: '#BFE3FF', to: '#7DB9F2', ink: '#0B3B66' },
  mint: { label: 'Mint', from: '#C7F2DF', to: '#7FD3B0', ink: '#0C4A35' },
  peach: { label: 'Peach', from: '#FFE0CC', to: '#FFB28A', ink: '#6B2D0C' },
  lilac: { label: 'Lilac', from: '#E6DCFF', to: '#B9A3F5', ink: '#35206E' },
  sand: { label: 'Sand', from: '#F6EBCF', to: '#E2C98E', ink: '#5A4314' },
  rose: { label: 'Rose', from: '#FFD9E2', to: '#F4A0B6', ink: '#6E1A33' },
};
export const DREAM_COLOR_KEYS = Object.keys(DREAM_COLORS);

export const DREAM_ICONS = ['plane', 'house', 'car', 'laptop', 'graduation-cap', 'heart', 'gift', 'bike', 'camera', 'smartphone', 'gem', 'tree-palm', 'shield', 'baby', 'music', 'star'];

export function dreamColor(key: string | null | undefined) {
  return DREAM_COLORS[key ?? ''] ?? DREAM_COLORS.lilac;
}

export function liveEntries(dream: Dream, entries: DreamEntry[]): DreamEntry[] {
  return entries.filter((e) => !e.deleted_at && e.dream_id === dream.id);
}

/** Σ entries (earmarks). Never below 0. */
export function dreamSaved(dream: Dream, entries: DreamEntry[]): Minor {
  return Math.max(0, liveEntries(dream, entries).reduce((s, e) => s + e.amount_minor, 0));
}

/**
 * Average monthly contribution over the last 3 calendar months including the current one
 * (Σ entries in that window ÷ 3).
 */
export function avgMonthlyContribution(dream: Dream, entries: DreamEntry[], today: ISODate): number {
  const end = monthOf(today);
  const start = addMonths(end, -2);
  const sum = liveEntries(dream, entries)
    .filter((e) => {
      const m = monthOf(e.entered_on);
      return m >= start && m <= end;
    })
    .reduce((s, e) => s + e.amount_minor, 0);
  return sum / 3;
}

export interface DreamProgress {
  saved: Minor;
  target: Minor;
  remaining: Minor;
  /** 0..1 */
  progress: number;
  done: boolean;
  avgMonthly: number;
  /** months until done at the current pace; null when the pace is ≤ 0 or done */
  etaMonths: number | null;
  etaMonth: Month | null;
  /** monthly amount needed to reach the target by target_on (null without a date or when done) */
  neededMonthly: Minor | null;
  /** at the current pace the target date will be missed */
  behind: boolean;
}

export function dreamProgress(dream: Dream, entries: DreamEntry[], today: ISODate): DreamProgress {
  const saved = dreamSaved(dream, entries);
  const remaining = Math.max(0, dream.target_minor - saved);
  const done = remaining === 0;
  const avg = avgMonthlyContribution(dream, entries, today);
  const etaMonths = !done && avg > 0 ? Math.ceil(remaining / avg) : null;
  const etaMonth = etaMonths !== null ? addMonths(monthOf(today), etaMonths) : null;
  let neededMonthly: Minor | null = null;
  if (!done && dream.target_on) {
    const monthsLeft = Math.max(1, monthIndex(monthOf(dream.target_on)) - monthIndex(monthOf(today)) + 1);
    neededMonthly = Math.ceil(remaining / monthsLeft);
  }
  const behind = !done && !!dream.target_on && (etaMonth === null || etaMonth > monthOf(dream.target_on));
  return {
    saved,
    target: dream.target_minor,
    remaining,
    progress: dream.target_minor > 0 ? Math.min(1, saved / dream.target_minor) : 0,
    done,
    avgMonthly: avg,
    etaMonths,
    etaMonth,
    neededMonthly,
    behind,
  };
}

function monthIndex(m: Month): number {
  const [y, mo] = m.split('-').map(Number);
  return y * 12 + mo - 1;
}

/** Σ positive dream entries in a month (for the audit's "dreams funded"). */
export function dreamsFundedIn(entries: DreamEntry[], m: Month): Minor {
  return entries.filter((e) => !e.deleted_at && monthOf(e.entered_on) === m).reduce((s, e) => s + e.amount_minor, 0);
}
