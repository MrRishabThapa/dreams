import { describe, expect, it } from 'vitest';
import { acct, debt, tx } from './fixtures';
import { monthStats, netWorth } from './ledger';
import { addDays, addMonths, monthEnd } from './dates';
import { dailyIndex, hasChart, profitSeries, rangeStart, splitAtZero } from './profit';
import { demoYear } from '../../scripts/demo-year.mjs';
import type { Ledger } from './types';

const TODAY = '2026-11-26';

describe('profit series', () => {
  it('the iPhone case: income 235, spent 315, plus an eSewa balance update and an opening balance → −80, a loss', () => {
    const cash = acct('cash', 170_000); // opening balance ~Rs 1,700: never profit
    const esewa = acct('wallet', 50_000);
    const l: Ledger = {
      accounts: [cash, esewa],
      debts: [],
      transactions: [
        tx({ type: 'income', amount_minor: 23_500, account_id: cash.id, occurred_on: '2026-11-25' }),
        tx({ type: 'expense', amount_minor: 31_500, account_id: cash.id, occurred_on: '2026-11-26', category_name: 'Food' }),
        // "Update balance" on eSewa: a +Rs 1,703 correction, not income
        tx({ type: 'adjust', amount_minor: 170_300, account_id: esewa.id, occurred_on: '2026-11-25', note: 'Balance checked' }),
      ],
    };
    const s = profitSeries(l, '1W', TODAY);
    expect(s.start).toBe('2026-11-25');
    expect(s.points.map((p) => p.profit)).toEqual([23_500, -8_000]);
    expect(s.profit).toBe(-8_000);
    expect(s.profit < 0).toBe(true); // drawn red with ▼ and −Rs
    // net worth did go up by Rs 1,623: that was the old, wrong headline
    expect(netWorth(l, TODAY) - netWorth(l, '2026-11-24')).toBe(162_300);
    // and it matches the month card's Saved
    expect(monthStats(l, '2026-11').saved).toBe(-8_000);
  });

  it('carries quiet days forward, one point per day; investment gains count, corrections and transfers don’t', () => {
    const cash = acct('cash', 1_000_000);
    const bank = acct('bank', 5_000_000);
    const inv = acct('investment', 2_000_000);
    const l: Ledger = {
      accounts: [cash, bank, inv],
      debts: [],
      transactions: [
        tx({ type: 'income', amount_minor: 3_000_000, account_id: bank.id, occurred_on: '2026-11-20' }),
        tx({ type: 'expense', amount_minor: 400_000, account_id: cash.id, occurred_on: '2026-11-22', category_name: 'Food' }),
        tx({ type: 'transfer', amount_minor: 1_000_000, account_id: bank.id, to_account_id: inv.id, occurred_on: '2026-11-23' }),
        tx({ type: 'adjust', amount_minor: 250_000, account_id: inv.id, occurred_on: '2026-11-24' }),
        tx({ type: 'adjust', amount_minor: -50_000, account_id: cash.id, occurred_on: '2026-11-24' }),
      ],
    };
    const s = profitSeries(l, '1W', TODAY);
    expect(s.points.map((p) => p.date)).toEqual(['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);
    expect(s.points.map((p) => p.profit)).toEqual([3_000_000, 3_000_000, 2_600_000, 2_600_000, 2_850_000, 2_850_000, 2_850_000]);
    expect(s.baseline).toBe(8_000_000);
    expect(s.pct).toBeCloseTo(2_850_000 / 8_000_000);
    expect(s.points[0]).toMatchObject({ income: 3_000_000, expense: 0 });
    expect(s.points[2]).toMatchObject({ income: 0, expense: 400_000 });
  });

  it('debts (with or without cash), deleted rows and rows on deleted accounts never count', () => {
    const cash = acct('cash', 500_000);
    const gone = acct('bank', 0, { deleted_at: '2026-11-25T00:00:00.000Z' });
    const owe = debt({ direction: 'owe', amount_minor: 5_000_000, opened_on: '2026-11-21' });
    const owed = debt({ direction: 'owed', amount_minor: 200_000, opened_on: '2026-11-21' });
    const l: Ledger = {
      accounts: [cash, gone],
      debts: [owe, owed],
      transactions: [
        tx({ type: 'income', amount_minor: 5_000_000, account_id: cash.id, occurred_on: '2026-11-21', debt_id: owe.id, debt_event: 'open' }),
        tx({ type: 'expense', amount_minor: 2_000_000, account_id: cash.id, occurred_on: '2026-11-25', debt_id: owe.id, debt_event: 'pay' }),
        tx({ type: 'income', amount_minor: 150_000, account_id: cash.id, occurred_on: '2026-11-23', debt_id: owed.id, debt_event: 'pay' }),
        tx({ type: 'expense', amount_minor: 99_900, account_id: cash.id, occurred_on: '2026-11-22', deleted_at: '2026-11-23T00:00:00.000Z' }),
        tx({ type: 'income', amount_minor: 77_700, account_id: gone.id, occurred_on: '2026-11-22' }),
        tx({ type: 'income', amount_minor: 10_000, account_id: cash.id, occurred_on: '2026-11-24' }),
      ],
    };
    const s = profitSeries(l, '1W', TODAY);
    expect(s.profit).toBe(10_000);
    expect(s.points.every((p) => p.income <= 10_000 && p.expense === 0)).toBe(true);
  });

  it('ranges clip to the first recorded day; All starts there; opening balances are the baseline, not profit', () => {
    expect(rangeStart('1Y', TODAY, '2026-11-20')).toBe('2026-11-20');
    expect(rangeStart('1W', TODAY, '2025-01-01')).toBe('2026-11-20');
    expect(rangeStart('1M', TODAY, '2025-01-01')).toBe(addDays(TODAY, -29));
    expect(rangeStart('3M', TODAY, '2025-01-01')).toBe(addDays(TODAY, -89));
    expect(rangeStart('1Y', TODAY, '2025-01-01')).toBe(addDays(TODAY, -364));
    expect(rangeStart('All', TODAY, '2025-01-01')).toBe('2025-01-01');
    const cash = acct('cash', 9_999_900);
    const l: Ledger = { accounts: [cash], debts: [], transactions: [tx({ type: 'expense', amount_minor: 100, account_id: cash.id, occurred_on: '2026-11-25' })] };
    const all = profitSeries(l, 'All', TODAY);
    expect(all.baseline).toBe(9_999_900);
    expect(all.profit).toBe(-100);
  });

  it('needs two days of data to draw', () => {
    const cash = acct('cash', 1_000);
    const one = { accounts: [cash], debts: [], transactions: [tx({ type: 'income', amount_minor: 100, account_id: cash.id, occurred_on: TODAY })] };
    const idx = dailyIndex(one);
    expect(hasChart(profitSeries(one, '1M', TODAY, idx), idx)).toBe(false);
    const empty = { accounts: [cash], debts: [], transactions: [] };
    const e = dailyIndex(empty);
    expect(hasChart(profitSeries(empty, '1M', TODAY, e), e)).toBe(false);
    const two = { accounts: [cash], debts: [], transactions: [tx({ type: 'income', amount_minor: 100, account_id: cash.id, occurred_on: '2026-11-25' })] };
    const i2 = dailyIndex(two);
    expect(hasChart(profitSeries(two, '1M', TODAY, i2), i2)).toBe(true);
  });

  it('the 1M total equals the month card’s Saved when the 30 days are all in one month', () => {
    const cash = acct('cash', 1_000_000);
    const esewa = acct('wallet', 0);
    const l: Ledger = {
      accounts: [cash, esewa],
      debts: [],
      transactions: [
        tx({ type: 'income', amount_minor: 23_500, account_id: cash.id, occurred_on: '2026-11-03' }),
        tx({ type: 'expense', amount_minor: 31_500, account_id: cash.id, occurred_on: '2026-11-18', category_name: 'Food' }),
        tx({ type: 'adjust', amount_minor: 170_300, account_id: esewa.id, occurred_on: '2026-11-10' }),
        tx({ type: 'transfer', amount_minor: 5_000, account_id: cash.id, to_account_id: esewa.id, occurred_on: '2026-11-12' }),
      ],
    };
    // 30 days ending 30 Nov = 1–30 Nov
    expect(profitSeries(l, '1M', '2026-11-30').profit).toBe(monthStats(l, '2026-11').saved);
  });

  it('every month of the demo year: graph total = Saved + investment gain/loss = audit net change − corrections − other', () => {
    const { backup } = demoYear(TODAY);
    const l = { accounts: backup.tables.accounts, transactions: backup.tables.transactions, debts: backup.tables.debts } as unknown as Ledger;
    const idx = dailyIndex(l);
    const all = profitSeries(l, 'All', TODAY, idx);
    const at = new Map(all.points.map((p) => [p.date, p.profit]));
    for (let i = 0; i <= 11; i++) {
      const m = addMonths('2026-11', -i);
      const s = monthStats(l, m);
      const end = at.get(m === '2026-11' ? TODAY : monthEnd(m));
      if (end === undefined) continue; // before the first recorded day
      const before = at.get(monthEnd(addMonths(m, -1))) ?? 0;
      const graph = end - before;
      expect(graph, m).toBe(s.saved + s.investmentGainLoss);
      expect(graph, m).toBe(s.netWorthChange - s.corrections - s.other);
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
