import { describe, expect, it } from 'vitest';
import { acct, debt, tx } from './fixtures';
import { monthStats, netWorth } from './ledger';
import { addDays, addMonths, monthEnd } from './dates';
import { dailyIndex, hasChart, profitSeries, rangeStart, splitAtZero } from './profit';
import { demoYear } from '../../scripts/demo-year.mjs';
import type { Ledger } from './types';

const TODAY = '2026-11-26';

function small(): Ledger {
  const cash = acct('cash', 1_000_000);
  const bank = acct('bank', 5_000_000);
  const inv = acct('investment', 2_000_000);
  return {
    accounts: [cash, bank, inv],
    transactions: [
      tx({ type: 'income', amount_minor: 3_000_000, account_id: bank.id, occurred_on: '2026-11-20' }),
      tx({ type: 'expense', amount_minor: 400_000, account_id: cash.id, occurred_on: '2026-11-22', category_name: 'Food' }),
      // own-account moves: never profit or loss
      tx({ type: 'transfer', amount_minor: 1_000_000, account_id: bank.id, to_account_id: inv.id, occurred_on: '2026-11-23' }),
      // investment gain and a cash correction both move net worth, as in the audit
      tx({ type: 'adjust', amount_minor: 250_000, account_id: inv.id, occurred_on: '2026-11-24' }),
      tx({ type: 'adjust', amount_minor: -50_000, account_id: cash.id, occurred_on: '2026-11-24' }),
    ],
    debts: [],
  };
}

describe('profit series', () => {
  it('starts at 0 on the baseline, carries quiet days forward, one point per day', () => {
    const l = small();
    const s = profitSeries(l, '1W', TODAY);
    expect(s.start).toBe('2026-11-20');
    expect(s.points.map((p) => p.date)).toEqual(['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);
    expect(s.baseline).toBe(8_000_000);
    expect(s.points.map((p) => p.profit)).toEqual([3_000_000, 3_000_000, 2_600_000, 2_600_000, 2_800_000, 2_800_000, 2_800_000]);
    expect(s.profit).toBe(2_800_000);
    expect(s.pct).toBeCloseTo(0.35);
    // flows for the tooltip: income/spending only
    expect(s.points[0]).toMatchObject({ income: 3_000_000, expense: 0 });
    expect(s.points[2]).toMatchObject({ income: 0, expense: 400_000 });
    expect(s.points[3]).toMatchObject({ income: 0, expense: 0 });
  });

  it('every point equals the change in net worth since the day before the range', () => {
    const l = small();
    const s = profitSeries(l, '1M', TODAY);
    for (const p of s.points) expect(p.profit, p.date).toBe(netWorth(l, p.date) - s.baseline);
  });

  it('transfers between own accounts and debts opened with cash change nothing', () => {
    const cash = acct('cash', 500_000);
    const bank = acct('bank', 0);
    const d = debt({ direction: 'owe', amount_minor: 5_000_000, opened_on: '2026-11-21' });
    const l: Ledger = {
      accounts: [cash, bank],
      debts: [d],
      transactions: [
        tx({ type: 'transfer', amount_minor: 300_000, account_id: cash.id, to_account_id: bank.id, occurred_on: '2026-11-20' }),
        tx({ type: 'income', amount_minor: 5_000_000, account_id: bank.id, occurred_on: '2026-11-21', debt_id: d.id, debt_event: 'open' }),
        tx({ type: 'expense', amount_minor: 2_000_000, account_id: bank.id, occurred_on: '2026-11-25', debt_id: d.id, debt_event: 'pay' }),
      ],
    };
    const s = profitSeries(l, '1W', TODAY);
    expect(s.points.every((p) => p.profit === 0)).toBe(true);
    // debt cash moves are not income or spending in the tooltip either
    expect(s.points.every((p) => p.income === 0 && p.expense === 0)).toBe(true);
  });

  it('a debt without cash, overpaid, follows debtRemaining (floored at 0)', () => {
    const cash = acct('cash', 1_000_000);
    const d = debt({ direction: 'owed', amount_minor: 200_000, opened_on: '2026-11-21' });
    const l: Ledger = {
      accounts: [cash],
      debts: [d],
      transactions: [
        tx({ type: 'income', amount_minor: 150_000, account_id: cash.id, occurred_on: '2026-11-23', debt_id: d.id, debt_event: 'pay' }),
        tx({ type: 'income', amount_minor: 150_000, account_id: cash.id, occurred_on: '2026-11-24', debt_id: d.id, debt_event: 'pay' }),
      ],
    };
    const s = profitSeries(l, '1W', TODAY);
    for (const p of s.points) expect(p.profit, p.date).toBe(netWorth(l, p.date) - s.baseline);
  });

  it('ranges clip to the first recorded day; All starts there', () => {
    const l = small();
    expect(rangeStart('1Y', TODAY, '2026-11-20')).toBe('2026-11-20');
    expect(rangeStart('1W', TODAY, '2025-01-01')).toBe('2026-11-20');
    expect(rangeStart('1M', TODAY, '2025-01-01')).toBe(addDays(TODAY, -29));
    expect(rangeStart('3M', TODAY, '2025-01-01')).toBe(addDays(TODAY, -89));
    expect(rangeStart('1Y', TODAY, '2025-01-01')).toBe(addDays(TODAY, -364));
    expect(rangeStart('All', TODAY, '2025-01-01')).toBe('2025-01-01');
    // All: the baseline is the opening balances, so profit is everything since
    const all = profitSeries(l, 'All', TODAY);
    expect(all.baseline).toBe(8_000_000);
    expect(all.profit).toBe(netWorth(l) - 8_000_000);
  });

  it('needs two days of data to draw', () => {
    const cash = acct('cash', 1_000);
    const today = { accounts: [cash], debts: [], transactions: [tx({ type: 'income', amount_minor: 100, account_id: cash.id, occurred_on: TODAY })] };
    const idx = dailyIndex(today);
    expect(hasChart(profitSeries(today, '1M', TODAY, idx), idx)).toBe(false);
    const empty = { accounts: [cash], debts: [], transactions: [] };
    const e = dailyIndex(empty);
    expect(hasChart(profitSeries(empty, '1M', TODAY, e), e)).toBe(false);
    const l = small();
    const i = dailyIndex(l);
    expect(hasChart(profitSeries(l, '1M', TODAY, i), i)).toBe(true);
  });

  it('a whole month of the demo year ends at exactly that month’s audit net-worth change', () => {
    const { backup } = demoYear(TODAY);
    const l = { accounts: backup.tables.accounts, transactions: backup.tables.transactions, debts: backup.tables.debts } as unknown as Ledger;
    const idx = dailyIndex(l);
    // walk every day of the year against netWorth directly
    const all = profitSeries(l, 'All', TODAY, idx);
    for (const p of all.points) expect(p.profit, p.date).toBe(netWorth(l, p.date) - all.baseline);
    // and month by month against the audit
    for (let i = 1; i <= 11; i++) {
      const m = addMonths('2026-11', -i);
      const s = monthStats(l, m);
      const startIdx = all.points.findIndex((p) => p.date === monthEnd(addMonths(m, -1)));
      const endIdx = all.points.findIndex((p) => p.date === monthEnd(m));
      const before = startIdx >= 0 ? all.points[startIdx].profit : 0;
      expect(all.points[endIdx].profit - before, m).toBe(s.netWorthChange);
    }
  });
});

describe('splitAtZero', () => {
  it('keeps an all-positive or all-negative line whole', () => {
    expect(splitAtZero([{ x: 0, y: 1 }, { x: 1, y: 2 }])).toEqual([{ sign: 1, points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] }]);
    expect(splitAtZero([{ x: 0, y: -1 }, { x: 1, y: -3 }])).toHaveLength(1);
    expect(splitAtZero([])).toEqual([]);
  });

  it('splits at each crossing with an interpolated shared point', () => {
    const parts = splitAtZero([{ x: 0, y: 2 }, { x: 1, y: -2 }, { x: 2, y: -1 }, { x: 4, y: 3 }]);
    expect(parts.map((p) => p.sign)).toEqual([1, -1, 1]);
    expect(parts[0].points.at(-1)).toEqual({ x: 0.5, y: 0 });
    expect(parts[1].points[0]).toEqual({ x: 0.5, y: 0 });
    expect(parts[1].points.at(-1)).toEqual({ x: 2.5, y: 0 });
    expect(parts[2].points).toEqual([{ x: 2.5, y: 0 }, { x: 4, y: 3 }]);
  });

  it('touching zero is not a crossing (0 counts as profit)', () => {
    expect(splitAtZero([{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 2, y: 1 }])).toHaveLength(1);
  });
});
