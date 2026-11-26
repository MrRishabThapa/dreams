import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createAccount, seedCategories } from './repo';
import { getConfirmed, getMapping, getRules, importRows, reconcile, rememberMapping, type ImportPick } from './imports';
import { applyMapping, EMPTY_MAPPING, markDuplicates, readTable, headerSignature, suggestCategory } from '../domain/importer';
import { balance, monthStats } from '../domain/ledger';
import { walletMonth } from '../domain/wallet';

beforeEach(async () => {
  await Promise.all([db.accounts.clear(), db.transactions.clear(), db.categories.clear(), db.meta.clear()]);
  await seedCategories();
});

const CSV = `eSewa Statement
Date,Description,Debit,Credit,Balance,Reference
01/11/2026,Load from Nabil Bank,,"5,000.00","7,000.00",T100
05/11/2026,QR Payment Himalayan Java,350.00,,"6,650.00",T101
05/11/2026,QR Payment Himalayan Java,350.00,,"6,300.00",T102
10/11/2026,NEA Electricity,"1,800.25",,"4,499.75",T103
10/11/2026,Service Charge,10.00,,"4,489.75",T104
`;

async function picks(accountId: string, text = CSV): Promise<ImportPick[]> {
  const table = readTable(text);
  const m = { ...EMPTY_MAPPING, date: 0, description: 1, debit: 2, credit: 3, balance: 4, ref: 5 };
  const rules = await getRules();
  const cats = await db.categories.toArray();
  const byName = (n: string, t: string) => cats.find((c) => c.name === n && c.type === t)?.id ?? null;
  return markDuplicates(accountId, applyMapping(table.rows, m), await db.transactions.toArray()).map((c) => ({
    ...c,
    include: true,
    categoryId: suggestCategory(c.description, rules) ?? (c.type === 'income' ? byName('Other', 'income') : /nea/i.test(c.description) ? byName('Bills', 'expense') : byName('Food', 'expense')),
  }));
}

describe('statement import (repo)', () => {
  it('imports, ties out to the statement balance, and re-importing adds nothing', async () => {
    const w = await createAccount({ name: 'eSewa', kind: 'wallet', opening_minor: 200000 });
    const cats = await db.categories.toArray();
    const r1 = await importRows(w.id, await picks(w.id), cats);
    expect(r1).toMatchObject({ added: 5, skipped: 0 });
    const txs = await db.transactions.toArray();
    expect(balance(w, txs)).toBe(448975); // matches the last Balance column
    expect(txs.every((t) => t.dirty === 1)).toBe(true); // synced like any other edit
    expect(txs.find((t) => t.note.includes('T103'))).toMatchObject({ type: 'expense', amount_minor: 180025, category_name: 'Bills', note: 'NEA Electricity · Ref T103' });

    const again = await picks(w.id);
    expect(again.every((p) => p.duplicate)).toBe(true);
    const r2 = await importRows(w.id, again, cats);
    expect(r2).toMatchObject({ added: 0, skipped: 5 });
    expect(await db.transactions.count()).toBe(5);
  });

  it('learns description → category from the first import', async () => {
    const w = await createAccount({ name: 'eSewa', kind: 'wallet', opening_minor: 0 });
    const cats = await db.categories.toArray();
    const shopping = cats.find((c) => c.name === 'Shopping')!;
    const p = (await picks(w.id)).map((x) => (x.description.startsWith('QR') ? { ...x, categoryId: shopping.id } : x));
    await importRows(w.id, p, cats);
    expect(suggestCategory('QR Payment Himalayan Java', await getRules())).toBe(shopping.id);
  });

  it('skips unticked and broken rows, and never trusts a category of the wrong type', async () => {
    const w = await createAccount({ name: 'eSewa', kind: 'wallet', opening_minor: 0 });
    const cats = await db.categories.toArray();
    const salary = cats.find((c) => c.name === 'Salary')!;
    const p = await picks(w.id, CSV + 'oops,Broken,1,,,\n');
    p[1].include = false;
    p[2].categoryId = salary.id; // income category on an expense row
    const r = await importRows(w.id, p, cats);
    expect(r).toMatchObject({ added: 4, skipped: 2 });
    const t = (await db.transactions.toArray()).find((x) => x.note.endsWith('T102'))!;
    expect(t.category_id).toBeNull();
    expect(t.category_name).toBe('Other');
  });

  it('imported wallet data keeps the audit identity and the wallet view balanced', async () => {
    const w = await createAccount({ name: 'eSewa', kind: 'wallet', opening_minor: 200000 });
    await importRows(w.id, await picks(w.id), await db.categories.toArray());
    const l = { accounts: await db.accounts.toArray(), transactions: await db.transactions.toArray(), debts: [] };
    const s = monthStats(l, '2026-11');
    expect(s.income).toBe(500000);
    expect(s.expenses).toBe(35000 + 35000 + 180025 + 1000);
    expect(s.netWorthChange).toBe(s.income - s.expenses + s.corrections + s.other);
    const v = walletMonth(l, w, '2026-11', await db.categories.toArray());
    expect(v.opening + v.totalIn - v.totalOut).toBe(v.closing);
    expect(v.fees).toBe(1000);
  });

  it('remembers the column mapping per statement layout', async () => {
    const sig = headerSignature(readTable(CSV));
    expect(await getMapping(sig)).toBeNull();
    const m = { ...EMPTY_MAPPING, date: 0, debit: 2 };
    await rememberMapping(sig, m);
    expect(await getMapping(sig)).toEqual(m);
    expect(await getMapping('other')).toBeNull();
  });
});

describe('reconcile (repo)', () => {
  it('writes the difference as an adjust and records the confirmation', async () => {
    const w = await createAccount({ name: 'eSewa', kind: 'wallet', opening_minor: 165000 });
    const r = await reconcile(w.id, 165000, 160050, '2026-11-20');
    expect(r.diff).toBe(-4950);
    expect(r.tx).toMatchObject({ type: 'adjust', amount_minor: -4950, occurred_on: '2026-11-20' });
    expect(balance(w, await db.transactions.toArray())).toBe(160050);
    expect((await getConfirmed())[w.id]).toBe('2026-11-20');
  });

  it('confirming an unchanged balance writes no transaction', async () => {
    const w = await createAccount({ name: 'eSewa', kind: 'wallet', opening_minor: 5000 });
    const r = await reconcile(w.id, 5000, 5000, '2026-11-21');
    expect(r).toEqual({ diff: 0, tx: null });
    expect(await db.transactions.count()).toBe(0);
    expect((await getConfirmed())[w.id]).toBe('2026-11-21');
  });
});
