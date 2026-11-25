import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { addDreamMoney, createAccount, createDream, deleteDream, deleteDreamEntry, undoDeleteDream, undoDeleteDreamEntry, updateDream } from './repo';
import { balance, monthStats, netWorth } from '../domain/ledger';
import { dreamProgress } from '../domain/dreams';
import type { Ledger } from '../domain/types';

async function ledger(): Promise<Ledger> {
  const [accounts, transactions, debts] = await Promise.all([db.accounts.toArray(), db.transactions.toArray(), db.debts.toArray()]);
  return { accounts, transactions, debts };
}

beforeEach(async () => {
  await Promise.all([db.accounts.clear(), db.transactions.clear(), db.debts.clear(), db.dreams.clear(), db.dream_entries.clear(), db.meta.clear()]);
});

describe('dreams through the repo (acceptance)', () => {
  it('funding a dream with a linked transfer moves balances and leaves net worth unchanged', async () => {
    const bank = await createAccount({ name: 'Bank', kind: 'bank', opening_minor: 10_000_000 });
    const savings = await createAccount({ name: 'Savings', kind: 'savings', opening_minor: 0 });
    const dream = await createDream({ title: 'Japan', icon: 'plane', color: 'sky', target_minor: 12_000_000 });
    const before = netWorth(await ledger());

    const { entry, completed } = await addDreamMoney(dream, {
      amount_minor: 4_000_000, mode: 'add', entered_on: '2026-11-10',
      transfer: { from_account_id: bank.id, to_account_id: savings.id },
    });
    expect(completed).toBe(false);
    expect(entry.transaction_id).toBeTruthy();
    const l = await ledger();
    expect(balance(bank, l.transactions)).toBe(6_000_000);
    expect(balance(savings, l.transactions)).toBe(4_000_000);
    expect(netWorth(l)).toBe(before);
    const s = monthStats(l, '2026-11');
    expect(s.movedToSavings).toBe(4_000_000);
    expect(s.income).toBe(0);
    expect(s.expenses).toBe(0);
    expect(s.other).toBe(0);
    const p = dreamProgress(dream, await db.dream_entries.toArray(), '2026-11-25');
    expect(p.saved).toBe(4_000_000);
  });

  it('an earmark without a transfer never changes balances or net worth', async () => {
    await createAccount({ name: 'Bank', kind: 'bank', opening_minor: 1_000_000 });
    const dream = await createDream({ title: 'Laptop', icon: 'laptop', color: 'mint', target_minor: 500_000 });
    await addDreamMoney(dream, { amount_minor: 200_000, mode: 'add', entered_on: '2026-11-10' });
    const l = await ledger();
    expect(l.transactions).toHaveLength(0);
    expect(netWorth(l)).toBe(1_000_000);
  });

  it('completes when the target is reached, un-completes when money is taken out', async () => {
    const dream = await createDream({ title: 'Bike', icon: 'bike', color: 'peach', target_minor: 100_000 });
    expect((await addDreamMoney(dream, { amount_minor: 60_000, mode: 'add', entered_on: '2026-11-01' })).completed).toBe(false);
    expect((await addDreamMoney(dream, { amount_minor: 40_000, mode: 'add', entered_on: '2026-11-02' })).completed).toBe(true);
    expect((await db.dreams.get(dream.id))?.completed_at).toBeTruthy();
    await addDreamMoney(dream, { amount_minor: 10_000, mode: 'withdraw', entered_on: '2026-11-03' });
    expect((await db.dreams.get(dream.id))?.completed_at).toBeNull();
    await expect(addDreamMoney(dream, { amount_minor: 90_001, mode: 'withdraw', entered_on: '2026-11-04' })).rejects.toThrow(/more than/);
    // raising the target also clears completion; lowering re-completes
    await updateDream(dream, { title: 'Bike', icon: 'bike', color: 'peach', target_minor: 90_000 });
    expect((await db.dreams.get(dream.id))?.completed_at).toBeTruthy();
  });

  it('deleting an entry removes its linked transfer; undo brings both back', async () => {
    const bank = await createAccount({ name: 'Bank', kind: 'bank', opening_minor: 1_000_000 });
    const sav = await createAccount({ name: 'Savings', kind: 'savings', opening_minor: 0 });
    const dream = await createDream({ title: 'Fund', icon: 'shield', color: 'sand', target_minor: 900_000 });
    const { entry } = await addDreamMoney(dream, { amount_minor: 300_000, mode: 'add', entered_on: '2026-11-01', transfer: { from_account_id: bank.id, to_account_id: sav.id } });
    const { txIds } = await deleteDreamEntry(entry);
    let l = await ledger();
    expect(balance(sav, l.transactions)).toBe(0);
    await undoDeleteDreamEntry(entry, txIds);
    l = await ledger();
    expect(balance(sav, l.transactions)).toBe(300_000);
  });

  it('deleting a dream keeps real transfers but removes earmarks; undo restores', async () => {
    const bank = await createAccount({ name: 'Bank', kind: 'bank', opening_minor: 1_000_000 });
    const sav = await createAccount({ name: 'Savings', kind: 'savings', opening_minor: 0 });
    const dream = await createDream({ title: 'Fund', icon: 'shield', color: 'sand', target_minor: 900_000 });
    await addDreamMoney(dream, { amount_minor: 300_000, mode: 'add', entered_on: '2026-11-01', transfer: { from_account_id: bank.id, to_account_id: sav.id } });
    const ids = await deleteDream(dream);
    expect((await db.dream_entries.toArray()).every((e) => e.deleted_at)).toBe(true);
    expect(balance(sav, (await ledger()).transactions)).toBe(300_000);
    await undoDeleteDream(dream.id, ids);
    expect(dreamProgress(dream, await db.dream_entries.toArray(), '2026-11-25').saved).toBe(300_000);
  });
});
