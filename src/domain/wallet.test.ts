import { describe, expect, it } from 'vitest';
import { acct, rng, tx } from './fixtures';
import { balance, monthStats } from './ledger';
import { confirmNudge, isFee, lastConfirmed, merchantKey, reconcileDiff, walletMonth, walletMonths } from './wallet';
import { addMonths } from './dates';
import type { Account, Ledger, Transaction } from './types';

describe('reconcile', () => {
  it('the adjustment is actual − current, signed, in paisa', () => {
    expect(reconcileDiff(165000, 160050)).toBe(-4950);
    expect(reconcileDiff(0, 125)).toBe(125);
    expect(reconcileDiff(5000, 5000)).toBe(0);
    expect(() => reconcileDiff(1.5, 2)).toThrow();
  });

  it('after the adjustment, the balance equals the typed balance', () => {
    const w = acct('wallet', 200000, { name: 'eSewa' });
    const txs: Transaction[] = [tx({ type: 'expense', amount_minor: 35000, account_id: w.id, occurred_on: '2026-11-05' })];
    const actual = 160050;
    const diff = reconcileDiff(balance(w, txs), actual);
    txs.push(tx({ type: 'adjust', amount_minor: diff, account_id: w.id, occurred_on: '2026-11-20' }));
    expect(balance(w, txs)).toBe(actual);
  });

  it('a correction is not income or spending, and the audit identity holds', () => {
    const w = acct('wallet', 200000);
    const l: Ledger = { accounts: [w], debts: [], transactions: [
      tx({ type: 'expense', amount_minor: 35000, account_id: w.id, occurred_on: '2026-11-05', category_name: 'Food' }),
      tx({ type: 'adjust', amount_minor: -4950, account_id: w.id, occurred_on: '2026-11-20' }),
    ] };
    const s = monthStats(l, '2026-11');
    expect(s.income).toBe(0);
    expect(s.expenses).toBe(35000);
    expect(s.corrections).toBe(-4950);
    expect(s.other).toBe(0);
    expect(s.netWorthChange).toBe(s.income - s.expenses + s.investmentGainLoss + s.corrections);
  });

  it('last confirmed is the newer of a local confirmation and the latest adjust', () => {
    const w = acct('wallet');
    const txs = [
      tx({ type: 'adjust', amount_minor: 10, account_id: w.id, occurred_on: '2026-11-03' }),
      tx({ type: 'adjust', amount_minor: 10, account_id: w.id, occurred_on: '2026-11-09', deleted_at: '2026-11-10T00:00:00Z' }),
      tx({ type: 'adjust', amount_minor: 10, account_id: 'other', occurred_on: '2026-11-12' }),
    ];
    expect(lastConfirmed(w.id, txs, null)).toBe('2026-11-03');
    expect(lastConfirmed(w.id, txs, '2026-11-08')).toBe('2026-11-08');
    expect(lastConfirmed(w.id, [], null)).toBeNull();
  });

  it('nudges gently once a week has passed', () => {
    expect(confirmNudge('2026-11-26', '2026-11-26')).toEqual({ text: 'Balance last confirmed today.', stale: false });
    expect(confirmNudge('2026-11-25', '2026-11-26').text).toBe('Balance last confirmed yesterday.');
    expect(confirmNudge('2026-11-19', '2026-11-26')).toEqual({ text: 'Balance last confirmed 7 days ago.', stale: true });
    expect(confirmNudge(null, '2026-11-26').stale).toBe(true);
  });
});

describe('wallet month', () => {
  const bank = acct('bank', 10_000_000, { name: 'Bank' });
  const esewa = acct('wallet', 200000, { name: 'eSewa' });
  const l: Ledger = {
    accounts: [bank, esewa],
    debts: [],
    transactions: [
      tx({ type: 'expense', amount_minor: 50000, account_id: esewa.id, occurred_on: '2026-10-10', category_name: 'Food', note: 'Himalayan Java' }),
      tx({ type: 'transfer', amount_minor: 400000, account_id: bank.id, to_account_id: esewa.id, occurred_on: '2026-11-03', note: 'Top-up' }),
      tx({ type: 'expense', amount_minor: 35000, account_id: esewa.id, occurred_on: '2026-11-05', category_name: 'Food', note: 'QR Himalayan Java 0042 · Ref A1' }),
      tx({ type: 'expense', amount_minor: 25000, account_id: esewa.id, occurred_on: '2026-11-08', category_name: 'Food', note: 'Himalayan Java' }),
      tx({ type: 'expense', amount_minor: 180000, account_id: esewa.id, occurred_on: '2026-11-10', category_name: 'Bills', note: 'NEA electricity' }),
      tx({ type: 'expense', amount_minor: 1000, account_id: esewa.id, occurred_on: '2026-11-10', category_name: 'Bills', note: 'Service charge' }),
      tx({ type: 'income', amount_minor: 2000, account_id: esewa.id, occurred_on: '2026-11-11', category_name: 'Other', note: 'Cashback' }),
      tx({ type: 'transfer', amount_minor: 100000, account_id: esewa.id, to_account_id: bank.id, occurred_on: '2026-11-15' }),
      tx({ type: 'adjust', amount_minor: -950, account_id: esewa.id, occurred_on: '2026-11-20' }),
      tx({ type: 'expense', amount_minor: 99999, account_id: bank.id, occurred_on: '2026-11-12', category_name: 'Rent' }),
      tx({ type: 'expense', amount_minor: 7000, account_id: esewa.id, occurred_on: '2026-11-13', deleted_at: '2026-11-14T00:00:00Z' }),
    ],
  };
  const w = walletMonth(l, esewa, '2026-11');

  it('opening + in − out = closing, from this account only', () => {
    expect(w.opening).toBe(150000);
    expect(w.closing).toBe(balance(esewa, l.transactions, '2026-11-30'));
    expect(w.opening + w.totalIn - w.totalOut).toBe(w.closing);
    expect(w.totalIn).toBe(400000 + 2000);
    expect(w.totalOut).toBe(35000 + 25000 + 180000 + 1000 + 100000 + 950);
    expect(w.transfersIn).toBe(400000);
    expect(w.transfersOut).toBe(100000);
    expect(w.corrections).toBe(-950);
    expect(w.count).toBe(8);
  });

  it('breaks down spending, merchants and fees', () => {
    expect(w.expenses).toBe(241000);
    expect(w.income).toBe(2000);
    expect(w.fees).toBe(1000);
    expect(w.topCategories).toEqual([{ name: 'Bills', amount: 181000 }, { name: 'Food', amount: 60000 }]);
    expect(w.topMerchants[0]).toEqual({ name: 'Nea Electricity', amount: 180000, count: 1 });
    expect(w.topMerchants).toContainEqual({ name: 'Himalayan Java', amount: 25000, count: 1 });
    expect(merchantKey('QR Himalayan Java 0042 · Ref A1')).toBe('qr himalayan java');
  });

  it('compares with the previous month', () => {
    expect(w.prev).toEqual({ month: '2026-10', totalIn: 0, totalOut: 50000, expenses: 50000 });
    expect(walletMonth(l, esewa, '2026-10').prev).toBeNull();
  });

  it('bank ↔ eSewa transfers stay out of income and spending in the monthly audit', () => {
    const s = monthStats(l, '2026-11');
    expect(s.income).toBe(2000);
    expect(s.expenses).toBe(241000 + 99999);
    expect(s.netWorthChange).toBe(s.income - s.expenses + s.corrections + s.other);
    expect(s.other).toBe(0);
  });

  it('fees come from the category or the note', () => {
    const t = tx({ type: 'expense', amount_minor: 1, account_id: 'x', occurred_on: '2026-11-01', note: 'Load commission' });
    expect(isFee(t, 'Bills')).toBe(true);
    expect(isFee({ ...t, note: 'Tea' }, 'Fees')).toBe(true);
    expect(isFee({ ...t, note: 'Coffee' }, 'Food')).toBe(false);
    expect(isFee({ ...t, type: 'income' }, 'Fees')).toBe(false);
  });

  it('lists every e-wallet with activity or a balance', () => {
    const empty = acct('wallet', 0, { name: 'Khalti' });
    const ws = walletMonths({ ...l, accounts: [...l.accounts, empty] }, '2026-11');
    expect(ws.map((x) => x.name)).toEqual(['eSewa']);
  });
});

describe('wallet month (random ledgers)', () => {
  it('opening + in − out = closing, and the sum of wallet views never changes net worth math', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
      const accounts: Account[] = [acct('bank', int(0, 9_000_000)), acct('wallet', int(0, 500_000)), acct('wallet', int(0, 500_000)), acct('cash', 0)];
      const pick = () => accounts[int(0, 3)];
      const txs: Transaction[] = [];
      for (let i = 0; i < 80; i++) {
        const m = addMonths('2026-06', int(0, 5));
        const d = `${m}-${String(int(1, 28)).padStart(2, '0')}`;
        const k = int(0, 3);
        const a = pick();
        if (k === 0) txs.push(tx({ type: 'expense', amount_minor: int(1, 90_000), account_id: a.id, occurred_on: d }));
        else if (k === 1) txs.push(tx({ type: 'income', amount_minor: int(1, 90_000), account_id: a.id, occurred_on: d }));
        else if (k === 2) {
          const b = accounts.find((x) => x !== a)!;
          txs.push(tx({ type: 'transfer', amount_minor: int(1, 90_000), account_id: a.id, to_account_id: b.id, occurred_on: d }));
        } else txs.push(tx({ type: 'adjust', amount_minor: int(-9_000, 9_000), account_id: a.id, occurred_on: d }));
      }
      const l: Ledger = { accounts, debts: [], transactions: txs };
      for (let i = 0; i < 6; i++) {
        const m = addMonths('2026-06', i);
        for (const w of walletMonths(l, m)) expect(w.opening + w.totalIn - w.totalOut).toBe(w.closing);
        const s = monthStats(l, m);
        expect(s.other).toBe(0);
      }
    }
  });
});
