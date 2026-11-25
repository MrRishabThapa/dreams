import { beforeEach, describe, expect, it } from 'vitest';
import { demoYear } from '../../scripts/demo-year.mjs';
import { db } from '../db/db';
import { restoreBackup, validateBackup, buildBackup } from '../db/backup';
import { closeMonth, reopenMonth } from '../db/repo';
import { monthStats, netWorth } from '../domain/ledger';
import { buildAuditSnapshot, comparable, monthReadyToClose, auditMonths } from '../domain/audit';
import { addMonths, addDays } from '../domain/dates';
import type { Audit, Category, DreamEntry, Ledger } from '../domain/types';

const TODAY = '2026-11-25';

async function load() {
  const [accounts, transactions, debts, categories, dream_entries, audits] = await Promise.all([
    db.accounts.toArray(), db.transactions.toArray(), db.debts.toArray(), db.categories.toArray(), db.dream_entries.toArray(), db.audits.toArray(),
  ]);
  return { ledger: { accounts, transactions, debts } as Ledger, categories: categories as Category[], entries: dream_entries as DreamEntry[], audits: audits as Audit[] };
}

describe('demo year (dev seed)', () => {
  const { backup, expectedOther } = demoYear(TODAY);

  beforeEach(async () => {
    await restoreBackup(backup);
  });

  it('is a valid backup that restores fully', async () => {
    expect(validateBackup(backup)).toBeNull();
    expect(await db.transactions.count()).toBe(backup.tables.transactions.length);
    expect((await buildBackup()).tables.transactions).toHaveLength(backup.tables.transactions.length);
  });

  it('the reconciliation identity holds for every month; "other" is only the no-cash corner-shop tab', async () => {
    const { ledger } = await load();
    const months = auditMonths(ledger, TODAY);
    expect(months).toHaveLength(12);
    let chained = netWorth(ledger, addDays(`${months[0]}-01`, -1));
    for (const m of months) {
      const s = monthStats(ledger, m);
      expect(s.netWorthChange, m).toBe(s.income - s.expenses + s.investmentGainLoss + s.corrections + s.other);
      expect(s.other, `other in ${m}`).toBe(expectedOther[m] ?? 0);
      expect(s.netWorthStart, m).toBe(chained);
      chained = s.netWorthEnd;
      for (const v of Object.values(s)) if (typeof v === 'number' && v !== s.savingsRate) expect(Number.isInteger(v)).toBe(true);
    }
    expect(chained).toBe(netWorth(ledger, TODAY));
  });

  it('closing then reopening every month matches the stored snapshot', async () => {
    const { ledger, categories, entries } = await load();
    for (const m of auditMonths(ledger, TODAY).slice(0, -1)) {
      const snap = buildAuditSnapshot({ ledger, categories, dreamEntries: entries, month: m, savingsTarget: 2500000, symbol: 'Rs' });
      expect(snap.insights.length).toBeGreaterThanOrEqual(3);
      expect(snap.insights.length).toBeLessThanOrEqual(5);
      expect(snap.topExpenses.length).toBeLessThanOrEqual(5);
      await closeMonth(m, snap, `Notes for ${m}`, null);
      const stored = (await db.audits.where('month').equals(m).first())!;
      expect(stored.closed_at).toBeTruthy();
      expect(comparable(stored.snapshot as never)).toBe(comparable(snap));
      await reopenMonth(m);
      const reopened = (await db.audits.where('month').equals(m).first())!;
      expect(reopened.closed_at).toBeNull();
      expect(reopened.reflection).toBe(`Notes for ${m}`);
      const fresh = buildAuditSnapshot({ ledger: (await load()).ledger, categories, dreamEntries: entries, month: m, savingsTarget: 2500000, symbol: 'Rs' });
      expect(comparable(fresh)).toBe(comparable(stored.snapshot as never));
    }
  });

  it('the previous month is ready to close until it is closed', async () => {
    const { ledger, categories, entries } = await load();
    const prev = addMonths(TODAY.slice(0, 7), -1);
    expect(monthReadyToClose(ledger, [], TODAY)).toBe(prev);
    const snap = buildAuditSnapshot({ ledger, categories, dreamEntries: entries, month: prev, savingsTarget: 2500000, symbol: 'Rs' });
    await closeMonth(prev, snap, '', 3000000);
    expect(monthReadyToClose(ledger, (await load()).audits, TODAY)).toBeNull();
    // next-month target from the latest close becomes the app's target
    expect((await db.user_settings.toArray())[0].monthly_savings_target_minor).toBe(3000000);
  });

  it('CSV and text exports cover the month', async () => {
    const { transactionsCSV } = await import('../db/backup');
    const { auditText } = await import('../domain/audit');
    const { ledger, categories, entries } = await load();
    const csv = transactionsCSV(ledger.transactions, ledger.accounts, categories, ledger.debts);
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(ledger.transactions.filter((t) => !t.deleted_at).length + 1);
    expect(csv.startsWith('date,type,amount,account')).toBe(true);
    const snap = buildAuditSnapshot({ ledger, categories, dreamEntries: entries, month: '2026-10', savingsTarget: 2500000, symbol: 'Rs' });
    const text = auditText(snap, 'Rs', 'Good month.');
    expect(text).toContain('October 2026 audit');
    expect(text).toContain('Net worth walk');
    expect(text).toContain('Good month.');
  });
});
