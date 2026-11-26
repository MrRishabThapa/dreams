import type { ISODate, Ledger, Minor } from './types';
import { addDays } from './dates';
import { isFlow, netWorth } from './ledger';


/**
 * "Profit vs day" for the Home graph.
 *
 * profit(d) = Σ income − Σ expenses + Σ investment gain/loss, from the range start to d.
 *
 * Same rules as the monthly audit's Income / Spent / Saved and its investment gain/loss:
 * transfers, balance corrections (adjust on a non-investment account, e.g. an eSewa
 * "Update balance"), debt-linked transactions, opening balances, deleted rows and rows on
 * deleted accounts are all left out. So for a calendar month the graph's total equals that
 * month's Saved + investment gain/loss (= Saved when there were no investment updates).
 * Days are the transaction's own local date (occurred_on); no time zones involved.
 */

export type ProfitRange = '1W' | '1M' | '3M' | '1Y' | 'All';
export const PROFIT_RANGES: ProfitRange[] = ['1W', '1M', '3M', '1Y', 'All'];
const RANGE_DAYS: Record<Exclude<ProfitRange, 'All'>, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365 };

export interface ProfitPoint {
  date: ISODate;
  /** income − spending + investment gain/loss since the range start, cumulative */
  profit: Minor;
  /** that day's income and spending (as in the audit: no transfers, corrections or debt moves) */
  income: Minor;
  expense: Minor;
}

export interface ProfitSeries {
  range: ProfitRange;
  /** first day shown (later than the nominal range start when data starts later) */
  start: ISODate;
  end: ISODate;
  /** net worth at the end of the day before `start` */
  baseline: Minor;
  points: ProfitPoint[];
  /** last profit */
  profit: Minor;
  /** profit / |baseline|; null when the baseline is 0 */
  pct: number | null;
}

/** Day-by-day net-worth deltas and flows, one pass over the ledger. */
export interface DailyIndex {
  delta: Map<ISODate, Minor>;
  income: Map<ISODate, Minor>;
  expense: Map<ISODate, Minor>;
  /** earliest day anything happened (transaction or debt), or null */
  first: ISODate | null;
}

const add = (m: Map<ISODate, Minor>, d: ISODate, v: Minor) => v && m.set(d, (m.get(d) ?? 0) + v);

export function dailyIndex(l: Ledger): DailyIndex {
  const delta = new Map<ISODate, Minor>();
  const income = new Map<ISODate, Minor>();
  const expense = new Map<ISODate, Minor>();
  let first: ISODate | null = null;
  const kind = new Map(l.accounts.filter((a) => !a.deleted_at).map((a) => [a.id, a.kind] as const));

  for (const t of l.transactions) {
    if (t.deleted_at || !kind.has(t.account_id)) continue;
    const d = t.occurred_on;
    if (!first || d < first) first = d;
    if (isFlow(t)) {
      const v = t.type === 'income' ? t.amount_minor : -t.amount_minor;
      add(delta, d, v);
      add(t.type === 'income' ? income : expense, d, t.amount_minor);
    } else if (t.type === 'adjust' && !t.debt_id && kind.get(t.account_id) === 'investment') {
      add(delta, d, t.amount_minor); // an investment's value went up or down
    }
  }
  return { delta, income, expense, first };
}

export function rangeStart(range: ProfitRange, today: ISODate, first: ISODate | null): ISODate {
  if (range === 'All') return first && first < today ? first : today;
  const nominal = addDays(today, -(RANGE_DAYS[range] - 1));
  // don't draw a flat line for days before anything was recorded
  return first && first > nominal ? (first < today ? first : today) : nominal;
}

/**
 * The series from the range start to `today`, one point per day; days with no activity
 * carry the previous value forward. `index` can be reused across ranges (see dailyIndex).
 */
export function profitSeries(l: Ledger, range: ProfitRange, today: ISODate, index: DailyIndex = dailyIndex(l)): ProfitSeries {
  const start = rangeStart(range, today, index.first);
  const baseline = netWorth(l, addDays(start, -1));
  const points: ProfitPoint[] = [];
  let profit = 0;
  for (let d = start; d <= today; d = addDays(d, 1)) {
    profit += index.delta.get(d) ?? 0;
    points.push({ date: d, profit, income: index.income.get(d) ?? 0, expense: index.expense.get(d) ?? 0 });
  }
  return { range, start, end: today, baseline, points, profit, pct: baseline === 0 ? null : profit / Math.abs(baseline) };
}

/** Enough to draw: at least two days in the range and something recorded. */
export function hasChart(s: ProfitSeries, index: DailyIndex): boolean {
  return s.points.length >= 2 && index.first !== null;
}

/* ---------- geometry ---------- */

export interface XY {
  x: number;
  y: number;
}

/**
 * Splits a polyline at its zero crossings (y in data units, crossing at y = 0), so each
 * part can be drawn green (≥ 0) or red (< 0). Crossing points are interpolated and shared
 * by the two parts on either side.
 */
export function splitAtZero(pts: XY[]): { sign: 1 | -1; points: XY[] }[] {
  const out: { sign: 1 | -1; points: XY[] }[] = [];
  if (!pts.length) return out;
  const signOf = (y: number): 1 | -1 => (y < 0 ? -1 : 1);
  let cur = { sign: signOf(pts[0].y), points: [pts[0]] };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const s = signOf(b.y);
    if (s !== cur.sign) {
      // a strict crossing: interpolate where the line meets 0 (a point exactly at 0 counts as ≥ 0)
      const t = a.y === b.y ? 0 : (0 - a.y) / (b.y - a.y);
      const z = { x: a.x + (b.x - a.x) * t, y: 0 };
      cur.points.push(z);
      out.push(cur);
      cur = { sign: s, points: [z, b] };
    } else cur.points.push(b);
  }
  out.push(cur);
  return out;
}
