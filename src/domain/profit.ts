import type { ISODate, Ledger, Minor } from './types';
import { addDays } from './dates';
import { isFlow, netWorth } from './ledger';

/**
 * "Profit vs day" for the Home graph.
 *
 * profit(d) = netWorth(end of d) − netWorth(day before the range starts).
 *
 * It is the same net-worth change the monthly audit reports (income − expenses +
 * investment gain/loss + corrections + other), so for any whole month the graph's last
 * point equals that month's `netWorthChange`. Transfers between your own accounts change
 * nothing, and a borrowed or lent amount with cash nets to zero (cash and debt move together).
 */

export type ProfitRange = '1W' | '1M' | '3M' | '1Y' | 'All';
export const PROFIT_RANGES: ProfitRange[] = ['1W', '1M', '3M', '1Y', 'All'];
const RANGE_DAYS: Record<Exclude<ProfitRange, 'All'>, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365 };

export interface ProfitPoint {
  date: ISODate;
  /** cumulative net-worth change since the range baseline */
  profit: Minor;
  /** that day's income and spending (as in the audit: no transfers, adjustments or debt moves) */
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
  const seen = (d: ISODate) => {
    if (!first || d < first) first = d;
  };
  // same account set as balances(): deleted accounts don't count
  const live = new Set(l.accounts.filter((a) => !a.deleted_at).map((a) => a.id));

  for (const t of l.transactions) {
    if (t.deleted_at) continue;
    const d = t.occurred_on;
    let v = 0;
    if (t.type === 'transfer') {
      if (live.has(t.account_id)) v -= t.amount_minor;
      if (t.to_account_id && live.has(t.to_account_id)) v += t.amount_minor;
    } else if (live.has(t.account_id)) {
      v = t.type === 'expense' ? -t.amount_minor : t.amount_minor;
    }
    add(delta, d, v);
    if (isFlow(t) && live.has(t.account_id)) add(t.type === 'income' ? income : expense, d, t.amount_minor);
    seen(d);
  }

  // debts: remaining = max(0, amount − payments so far) from the day opened; payments are
  // folded in day by day so the floor at 0 matches debtRemaining exactly
  const pays = new Map<string, Map<ISODate, Minor>>();
  for (const t of l.transactions) {
    if (t.deleted_at || !t.debt_id || t.debt_event !== 'pay') continue;
    const m = pays.get(t.debt_id) ?? new Map<ISODate, Minor>();
    m.set(t.occurred_on, (m.get(t.occurred_on) ?? 0) + t.amount_minor);
    pays.set(t.debt_id, m);
  }
  for (const debt of l.debts) {
    if (debt.deleted_at) continue;
    const sign = debt.direction === 'owed' ? 1 : -1;
    const byDay = pays.get(debt.id) ?? new Map<ISODate, Minor>();
    // payments dated before the debt opened count on the day it opened
    let early = 0;
    const later: [ISODate, Minor][] = [];
    for (const [d, v] of byDay) (d <= debt.opened_on ? (early += v) : later.push([d, v]));
    later.sort((a, b) => a[0].localeCompare(b[0]));
    let remaining = Math.max(0, debt.amount_minor - early);
    add(delta, debt.opened_on, sign * remaining);
    seen(debt.opened_on);
    let paid = early;
    for (const [d, v] of later) {
      paid += v;
      const next = Math.max(0, debt.amount_minor - paid);
      add(delta, d, sign * (next - remaining));
      remaining = next;
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
