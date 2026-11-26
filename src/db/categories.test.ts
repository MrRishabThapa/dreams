import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createAccount, migrateCategories, patch, save, saveTransaction, seedCategories, softDelete, stableCategoryId } from './repo';
import { getRules, importRows } from './imports';
import { ruleKey } from '../domain/importer';
import { buildAuditSnapshot } from '../domain/audit';
import { monthStats } from '../domain/ledger';
import { DEFAULT_CATEGORIES } from '../lib/catalog';
import type { Category } from '../domain/types';

const OLD = ['Food', 'Transport', 'Bills', 'Rent', 'Shopping', 'Health', 'Education', 'Family', 'Entertainment', 'Other'];

async function oldInstall() {
  for (const [i, n] of OLD.entries()) await save('categories', { name: n, type: 'expense', icon: 'utensils', color: null, sort: i } as Partial<Category>);
  for (const [i, n] of ['Salary', 'Business', 'Gift', 'Interest', 'Other'].entries()) await save('categories', { name: n, type: 'income', icon: null, color: null, sort: i } as Partial<Category>);
}
const live = async (type: 'income' | 'expense') =>
  (await db.categories.toArray()).filter((c) => !c.deleted_at && c.type === type).sort((a, b) => a.sort - b.sort);

beforeEach(async () => {
  await Promise.all([db.accounts.clear(), db.transactions.clear(), db.categories.clear(), db.meta.clear()]);
});

describe('default categories', () => {
  it('stable ids are UUID-shaped and the same for the same type + name', async () => {
    const a = await stableCategoryId('expense', 'Repairs & Maintenance');
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await stableCategoryId('expense', '  repairs &  maintenance ')).toBe(a);
    expect(await stableCategoryId('income', 'Other')).not.toBe(await stableCategoryId('expense', 'Other'));
  });

  it('a new install gets the full list, Other last, names unique per type', async () => {
    await seedCategories();
    const ex = await live('expense');
    expect(ex.map((c) => c.name)).toContain('Repairs & Maintenance');
    expect(ex.at(-1)!.name).toBe('Other');
    expect(new Set(ex.map((c) => c.name)).size).toBe(ex.length);
    expect(ex.every((c) => c.name.length <= 24)).toBe(true);
    expect(ex.every((c) => c.dirty === 1)).toBe(true);
    expect(await migrateCategories()).toEqual([]);
  });

  it('migration adds only the missing ones, after the existing list, and is idempotent', async () => {
    await oldInstall();
    const before = await db.categories.toArray();
    const added = await migrateCategories();
    const names = added.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['Repairs & Maintenance', 'Watch & Accessories', 'Fees & Charges', 'Subscriptions']));
    // already there by name or alias: nothing like Travel & Transport next to Transport
    for (const n of ['Food', 'Transport', 'Health', 'Education', 'Rent', 'Other', 'Entertainment']) expect(names).not.toContain(n);
    expect(added.every((c) => c.type === 'expense')).toBe(true);
    expect(added.every((c) => c.sort >= OLD.length)).toBe(true);
    // existing rows untouched
    for (const b of before) expect(await db.categories.get(b.id)).toEqual(b);
    const count = await db.categories.count();
    expect(await migrateCategories()).toEqual([]);
    expect(await db.categories.count()).toBe(count);
    expect(count).toBe(DEFAULT_CATEGORIES.length);
  });

  it('never brings back one he deleted or duplicates one he renamed', async () => {
    await oldInstall();
    const added = await migrateCategories();
    const fees = added.find((c) => c.name === 'Fees & Charges')!;
    const watch = added.find((c) => c.name === 'Watch & Accessories')!;
    await softDelete('categories', [fees.id]);
    await patch('categories', watch.id, { name: 'Watches' });
    expect(await migrateCategories()).toEqual([]);
    const names = (await live('expense')).map((c) => c.name);
    expect(names).toContain('Watches');
    expect(names).not.toContain('Fees & Charges');
    expect(names).not.toContain('Watch & Accessories');
  });

  it('matches names case-insensitively and by alias, including deleted ones', async () => {
    await save('categories', { name: 'repairs', type: 'expense', icon: null, color: null, sort: 0 } as Partial<Category>);
    const clothes = await save('categories', { name: 'Clothes', type: 'expense', icon: null, color: null, sort: 1 } as Partial<Category>);
    await softDelete('categories', [clothes.id]);
    const names = (await migrateCategories()).map((c) => c.name);
    expect(names).not.toContain('Repairs & Maintenance');
    expect(names).not.toContain('Clothing');
  });

  it('does nothing before onboarding (no categories yet)', async () => {
    expect(await migrateCategories()).toEqual([]);
    expect(await db.categories.count()).toBe(0);
  });
});

describe('custom and new categories flow through the audit and import with no code change', () => {
  it('a custom category and a migrated one show up in the audit totals', async () => {
    await oldInstall();
    await migrateCategories();
    const cash = await createAccount({ name: 'Cash', kind: 'cash', opening_minor: 1_000_000 });
    const repairs = (await live('expense')).find((c) => c.name === 'Repairs & Maintenance')!;
    const custom = await save('categories', { name: 'Watch repair', type: 'expense', icon: 'watch', color: '#7C3AED', sort: 99 } as Partial<Category>);
    await saveTransaction({ type: 'expense', amount_minor: 150_000, account_id: cash.id, occurred_on: '2026-11-20', category_id: repairs.id, category_name: repairs.name });
    await saveTransaction({ type: 'expense', amount_minor: 85_050, account_id: cash.id, occurred_on: '2026-11-21', category_id: custom.id, category_name: custom.name });
    const [accounts, transactions, categories] = await Promise.all([db.accounts.toArray(), db.transactions.toArray(), db.categories.toArray()]);
    const ledger = { accounts, transactions, debts: [] };
    const snap = buildAuditSnapshot({ ledger, categories, dreamEntries: [], month: '2026-11', savingsTarget: null, symbol: 'Rs' });
    const byName = new Map(snap.categories.map((c) => [c.name, c]));
    expect(byName.get('Repairs & Maintenance')!.amount).toBe(150_000);
    expect(byName.get('Watch repair')).toMatchObject({ amount: 85_050, icon: 'watch', color: '#7C3AED' });
    expect(snap.categories.reduce((a, c) => a + c.amount, 0)).toBe(monthStats(ledger, '2026-11').expenses);
  });

  it('a statement import row can target a custom category and learns the rule', async () => {
    await oldInstall();
    const wallet = await createAccount({ name: 'eSewa', kind: 'wallet', opening_minor: 0 });
    const custom = await save('categories', { name: 'Watch repair', type: 'expense', icon: 'watch', color: null, sort: 99 } as Partial<Category>);
    const r = await importRows(
      wallet.id,
      [{ key: 'k1', date: '2026-11-22', description: 'Time Care Service', type: 'expense', amount_minor: 120_000, ref: 'R1', include: true, categoryId: custom.id } as never],
      await db.categories.toArray(),
    );
    expect(r.added).toBe(1);
    const t = (await db.transactions.toArray()).find((x) => x.account_id === wallet.id)!;
    expect(t).toMatchObject({ category_id: custom.id, category_name: 'Watch repair' });
    expect((await getRules())[ruleKey('Time Care Service')]).toBe(custom.id);
  });
});
