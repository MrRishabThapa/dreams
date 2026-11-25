import { describe, expect, it } from 'vitest';
import { acct, debt, rng, tx } from './fixtures';
import { balance, debtRemaining, monthStats, netWorth, netWorthParts } from './ledger';
import type { Account, Debt, Ledger, Transaction } from './types';
import { addMonths } from './dates';

describe('balance', () => {
  const cash = acct('cash', 100000);
  const bank = acct('bank', 0);
  const txs: Transaction[] = [
    tx({ type: 'income', amount_minor: 50000, account_id: cash.id, occurred_on: '2026-11-01' }),
    tx({ type: 'expense', amount_minor: 2000, account_id: cash.id, occurred_on: '2026-11-02' }),
    tx({ type: 'transfer', amount_minor: 30000, account_id: cash.id, to_account_id: bank.id, occurred_on: '2026-11-03' }),
    tx({ type: 'adjust', amount_minor: -500, account_id: cash.id, occurred_on: '2026-11-04' }),
    tx({ type: 'expense', amount_minor: 99999, account_id: cash.id, occurred_on: '2026-11-04', deleted_at: 'x' }),
  ];
  it('applies the formula', () => {
    expect(balance(cash, txs)).toBe(100000 + 50000 - 2000 - 30000 - 500);
    expect(balance(bank, txs)).toBe(30000);
  });
  it('respects asOf', () => {
    expect(balance(cash, txs, '2026-11-02')).toBe(148000);
    expect(balance(cash, txs, '2026-10-31')).toBe(100000);
  });
});

describe('debts', () => {
  it('borrow 50,000 with cash, repay 20,000: 30,000 remains and net worth unchanged by repayment', () => {
    const cash = acct('cash', 0);
    const d = debt({ direction: 'owe', amount_minor: 5000000, opened_on: '2026-11-01' });
    const open = tx({ type: 'income', amount_minor: 5000000, account_id: cash.id, occurred_on: '2026-11-01', debt_id: d.id, debt_event: 'open' });
    const l: Ledger = { accounts: [cash], transactions: [open], debts: [d] };
    const before = netWorth(l);
    expect(before).toBe(0);
    l.transactions.push(tx({ type: 'expense', amount_minor: 2000000, account_id: cash.id, occurred_on: '2026-11-10', debt_id: d.id, debt_event: 'pay' }));
    expect(debtRemaining(d, l.transactions)).toBe(3000000);
    expect(netWorth(l)).toBe(before);
    const s = monthStats(l, '2026-11');
    expect(s.income).toBe(0);
    expect(s.expenses).toBe(0);
    expect(s.borrowed).toBe(5000000);
    expect(s.repaid).toBe(2000000);
    expect(s.other).toBe(0);
  });
  it('remaining is 0 before opening and floors at 0', () => {
    const d = debt({ direction: 'owed', amount_minor: 1000, opened_on: '2026-11-05' });
    const c = acct('cash');
    const pays = [tx({ type: 'income', amount_minor: 1500, account_id: c.id, occurred_on: '2026-11-06', debt_id: d.id, debt_event: 'pay' })];
    expect(debtRemaining(d, pays, '2026-11-04')).toBe(0);
    expect(debtRemaining(d, pays, '2026-11-05')).toBe(1000);
    expect(debtRemaining(d, pays)).toBe(0);
  });
  it('debt without cash shows up as "other"', () => {
    const d = debt({ direction: 'owe', amount_minor: 1000, opened_on: '2026-11-05' });
    const s = monthStats({ accounts: [acct('cash')], transactions: [], debts: [d] }, '2026-11');
    expect(s.netWorthChange).toBe(-1000);
    expect(s.other).toBe(-1000);
  });
});

describe('monthStats', () => {
  it('excludes transfers, adjustments and debt movements from income/expenses', () => {
    const cash = acct('cash', 100000);
    const sav = acct('savings', 0);
    const inv = acct('investment', 0);
    const l: Ledger = {
      accounts: [cash, sav, inv],
      debts: [],
      transactions: [
        tx({ type: 'income', amount_minor: 80000, account_id: cash.id, occurred_on: '2026-11-01' }),
        tx({ type: 'expense', amount_minor: 30000, account_id: cash.id, occurred_on: '2026-11-02', category_name: 'Food' }),
        tx({ type: 'transfer', amount_minor: 20000, account_id: cash.id, to_account_id: sav.id, occurred_on: '2026-11-03' }),
        tx({ type: 'transfer', amount_minor: 10000, account_id: cash.id, to_account_id: inv.id, occurred_on: '2026-11-03' }),
        tx({ type: 'adjust', amount_minor: 1500, account_id: inv.id, occurred_on: '2026-11-20' }),
        tx({ type: 'adjust', amount_minor: -200, account_id: cash.id, occurred_on: '2026-11-21' }),
        tx({ type: 'income', amount_minor: 999, account_id: cash.id, occurred_on: '2026-10-31' }),
      ],
    };
    const s = monthStats(l, '2026-11');
    expect(s.income).toBe(80000);
    expect(s.expenses).toBe(30000);
    expect(s.saved).toBe(50000);
    expect(s.savingsRate).toBeCloseTo(0.625);
    expect(s.movedToSavings).toBe(20000);
    expect(s.movedToInvestments).toBe(10000);
    expect(s.investmentGainLoss).toBe(1500);
    expect(s.corrections).toBe(-200);
    expect(s.netWorthChange).toBe(80000 - 30000 + 1500 - 200);
    expect(s.other).toBe(0);
    expect(s.byCategory).toEqual([{ name: 'Food', categoryId: null, amount: 30000 }]);
  });
  it('savingsRate is null with no income', () => {
    expect(monthStats({ accounts: [], transactions: [], debts: [] }, '2026-11').savingsRate).toBeNull();
  });
});

/** Random ledger with every kind of cash-backed movement. "other" must always be 0. */
function randomLedger(seed: number): { l: Ledger; months: string[] } {
  const r = rng(seed);
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const kinds = ['cash', 'bank', 'wallet', 'savings', 'investment'] as const;
  const accounts: Account[] = Array.from({ length: int(1, 5) }, () => acct(kinds[int(0, 4)], int(0, 5_000_000)));
  const pick = () => accounts[int(0, accounts.length - 1)];
  const months = Array.from({ length: 6 }, (_, i) => addMonths('2026-01', i));
  const day = () => `${months[int(0, 5)]}-${String(int(1, 28)).padStart(2, '0')}`;
  const transactions: Transaction[] = [];
  const debts: Debt[] = [];
  for (let i = 0; i < int(20, 120); i++) {
    const k = int(0, 9);
    const a = pick();
    const amt = int(1, 2_000_000);
    if (k <= 2) transactions.push(tx({ type: 'expense', amount_minor: amt, account_id: a.id, occurred_on: day(), category_name: ['Food', 'Rent', 'Bills'][int(0, 2)] }));
    else if (k <= 4) transactions.push(tx({ type: 'income', amount_minor: amt, account_id: a.id, occurred_on: day() }));
    else if (k <= 6) transactions.push(tx({ type: 'transfer', amount_minor: amt, account_id: a.id, to_account_id: pick().id, occurred_on: day() }));
    else if (k === 7) transactions.push(tx({ type: 'adjust', amount_minor: int(-500000, 500000), account_id: a.id, occurred_on: day() }));
    else {
      const opened = day();
      const d = debt({ direction: r() < 0.5 ? 'owe' : 'owed', amount_minor: amt, opened_on: opened });
      debts.push(d);
      transactions.push(tx({ type: d.direction === 'owe' ? 'income' : 'expense', amount_minor: amt, account_id: a.id, occurred_on: opened, debt_id: d.id, debt_event: 'open' }));
      const pay = int(0, amt);
      const payDay = opened.slice(0, 7) === months[5] ? opened : `${months[5]}-${String(int(1, 28)).padStart(2, '0')}`;
      if (pay > 0) transactions.push(tx({ type: d.direction === 'owe' ? 'expense' : 'income', amount_minor: pay, account_id: pick().id, occurred_on: payDay < opened ? opened : payDay, debt_id: d.id, debt_event: 'pay' }));
    }
    if (r() < 0.05 && transactions.length) transactions[transactions.length - 1].deleted_at = '2026-06-01T00:00:00Z';
  }
  return { l: { accounts, transactions, debts }, months };
}

describe('reconciliation identity (property)', () => {
  it('netWorthChange = income − expenses + gain/loss + corrections (other = 0) on 300 random ledgers', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { l, months } = randomLedger(seed);
      let chained = netWorth(l, '2025-12-31');
      for (const m of months) {
        const s = monthStats(l, m);
        expect(s.other, `seed ${seed} month ${m}`).toBe(0);
        expect(s.netWorthChange).toBe(s.income - s.expenses + s.investmentGainLoss + s.corrections);
        expect(s.netWorthStart).toBe(chained);
        chained = s.netWorthEnd;
        expect(Number.isInteger(s.netWorthEnd)).toBe(true);
      }
      const p = netWorthParts(l);
      expect(p.netWorth).toBe(p.assets + p.owedToMe - p.iOwe);
    }
  });
});
