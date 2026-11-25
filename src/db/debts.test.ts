import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createAccount, createDebt, deleteDebt, recordPayment, undoDeleteDebt, updateDebt } from './repo';
import { balance, monthStats, netWorth, netWorthParts } from '../domain/ledger';
import { debtStatus } from '../domain/debts';
import type { Ledger } from '../domain/types';

async function ledger(): Promise<Ledger> {
  const [accounts, transactions, debts] = await Promise.all([db.accounts.toArray(), db.transactions.toArray(), db.debts.toArray()]);
  return { accounts, transactions, debts };
}

beforeEach(async () => {
  await Promise.all([db.accounts.clear(), db.transactions.clear(), db.debts.clear(), db.meta.clear()]);
});

describe('debts through the repo (acceptance)', () => {
  it('borrow 50,000 with cash, repay 20,000: 30,000 remains, net worth unchanged by the repayment', async () => {
    const cash = await createAccount({ name: 'Cash', kind: 'cash', opening_minor: 1_000_000 }); // Rs 10,000
    const before = netWorth(await ledger());

    const { debt, tx } = await createDebt({ person: 'Hari', direction: 'owe', amount_minor: 5_000_000, opened_on: '2026-11-01', cashAccountId: cash.id });
    expect(tx?.type).toBe('income');
    expect(tx?.debt_event).toBe('open');
    let l = await ledger();
    expect(balance(cash, l.transactions)).toBe(6_000_000);
    expect(netWorth(l)).toBe(before); // borrowing with cash: +cash, +liability
    const afterBorrow = netWorth(l);

    const pay = await recordPayment(debt, { amount_minor: 2_000_000, account_id: cash.id, occurred_on: '2026-11-10' });
    expect(pay.type).toBe('expense');
    l = await ledger();
    const st = debtStatus(debt, l.transactions, '2026-11-10');
    expect(st.remaining).toBe(3_000_000);
    expect(st.paid).toBe(2_000_000);
    expect(st.progress).toBeCloseTo(0.4);
    expect(netWorth(l)).toBe(afterBorrow); // repayment is net-worth neutral
    expect(netWorthParts(l).iOwe).toBe(3_000_000);
    expect(balance(cash, l.transactions)).toBe(4_000_000);

    // never counted as income or spending
    const s = monthStats(l, '2026-11');
    expect(s.income).toBe(0);
    expect(s.expenses).toBe(0);
    expect(s.borrowed).toBe(5_000_000);
    expect(s.repaid).toBe(2_000_000);
    expect(s.other).toBe(0);
  });

  it('lending with cash and collecting mirrors it', async () => {
    const bank = await createAccount({ name: 'Bank', kind: 'bank', opening_minor: 10_000_000 });
    const { debt, tx } = await createDebt({ person: 'Sita', direction: 'owed', amount_minor: 1_500_000, opened_on: '2026-11-02', cashAccountId: bank.id });
    expect(tx?.type).toBe('expense');
    await recordPayment(debt, { amount_minor: 500_000, account_id: bank.id, occurred_on: '2026-11-20' });
    const l = await ledger();
    expect(netWorthParts(l).owedToMe).toBe(1_000_000);
    expect(netWorth(l)).toBe(10_000_000);
    expect(monthStats(l, '2026-11')).toMatchObject({ lent: 1_500_000, collected: 500_000, income: 0, expenses: 0, other: 0 });
  });

  it('a debt without cash changes net worth and shows as "other"', async () => {
    await createAccount({ name: 'Cash', kind: 'cash', opening_minor: 0 });
    await createDebt({ person: 'Shop', direction: 'owe', amount_minor: 120_000, opened_on: '2026-11-05' });
    const l = await ledger();
    expect(netWorth(l)).toBe(-120_000);
    expect(monthStats(l, '2026-11').other).toBe(-120_000);
  });

  it('refuses payments above what remains', async () => {
    const cash = await createAccount({ name: 'Cash', kind: 'cash', opening_minor: 0 });
    const { debt } = await createDebt({ person: 'Ram', direction: 'owe', amount_minor: 100_000, opened_on: '2026-11-01', cashAccountId: cash.id });
    await expect(recordPayment(debt, { amount_minor: 100_001, account_id: cash.id, occurred_on: '2026-11-02' })).rejects.toThrow(/left/);
    await recordPayment(debt, { amount_minor: 100_000, account_id: cash.id, occurred_on: '2026-11-02' });
    expect(debtStatus(debt, (await ledger()).transactions, '2026-11-02').settled).toBe(true);
  });

  it('editing keeps the cash transaction in step, and turning cash off removes it', async () => {
    const cash = await createAccount({ name: 'Cash', kind: 'cash', opening_minor: 0 });
    const { debt } = await createDebt({ person: 'Hari', direction: 'owe', amount_minor: 5_000_000, opened_on: '2026-11-01', cashAccountId: cash.id });
    await updateDebt(debt, { person: 'Hari Dai', direction: 'owe', amount_minor: 6_000_000, opened_on: '2026-11-01', cashAccountId: cash.id });
    let l = await ledger();
    expect(balance(cash, l.transactions)).toBe(6_000_000);
    expect(netWorth(l)).toBe(0);
    await updateDebt({ ...debt, amount_minor: 6_000_000 }, { person: 'Hari Dai', direction: 'owe', amount_minor: 6_000_000, opened_on: '2026-11-01', cashAccountId: null });
    l = await ledger();
    expect(balance(cash, l.transactions)).toBe(0);
    expect(netWorth(l)).toBe(-6_000_000);
  });

  it('deleting a debt soft-deletes its transactions; undo restores them', async () => {
    const cash = await createAccount({ name: 'Cash', kind: 'cash', opening_minor: 0 });
    const { debt } = await createDebt({ person: 'Hari', direction: 'owe', amount_minor: 5_000_000, opened_on: '2026-11-01', cashAccountId: cash.id });
    await recordPayment(debt, { amount_minor: 2_000_000, account_id: cash.id, occurred_on: '2026-11-10' });
    const ids = await deleteDebt(debt);
    expect(ids).toHaveLength(2);
    let l = await ledger();
    expect(l.transactions.every((t) => t.deleted_at)).toBe(true);
    expect(netWorth(l)).toBe(0);
    expect(balance(cash, l.transactions)).toBe(0);
    await undoDeleteDebt(debt.id, ids);
    l = await ledger();
    expect(netWorthParts(l).iOwe).toBe(3_000_000);
    expect(balance(cash, l.transactions)).toBe(3_000_000);
  });

  it('due status: overdue and due soon', async () => {
    const { debt } = await createDebt({ person: 'X', direction: 'owed', amount_minor: 1000, opened_on: '2026-11-01', due_on: '2026-11-20' });
    const txs = (await ledger()).transactions;
    expect(debtStatus(debt, txs, '2026-11-25')).toMatchObject({ overdue: true, dueSoon: false, daysToDue: -5 });
    expect(debtStatus(debt, txs, '2026-11-15')).toMatchObject({ overdue: false, dueSoon: true, daysToDue: 5 });
    expect(debtStatus(debt, txs, '2026-11-01')).toMatchObject({ overdue: false, dueSoon: false });
  });
});
