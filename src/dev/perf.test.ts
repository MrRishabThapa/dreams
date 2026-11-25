import { describe, expect, it } from 'vitest';
import { demoYear } from '../../scripts/demo-year.mjs';
import { balances, monthStats, netWorthParts, netWorthSeries } from '../domain/ledger';
import { buildAuditSnapshot, auditMonths, monthReadyToClose } from '../domain/audit';
import { dreamProgress } from '../domain/dreams';
import { debtStatus } from '../domain/debts';
import type { Ledger, Transaction } from '../domain/types';

/**
 * Performance budget for the pure computations each screen runs, on a heavy year
 * (5× the demo year's transactions, ≈2,400). Playwright's WebKit can't throttle CPU,
 * so this guards the work itself: an A11 is roughly 4–6× slower than this machine,
 * and a screen's compute must stay well inside one 100 ms interaction budget there.
 */
describe('performance budget (heavy year)', () => {
  const { backup } = demoYear('2026-11-25');
  const base = backup.tables.transactions as Transaction[];
  const transactions: Transaction[] = [];
  for (let k = 0; k < 5; k++) for (const t of base) transactions.push({ ...t, id: `${t.id}-${k}`, debt_id: k === 0 ? t.debt_id : null, debt_event: k === 0 ? t.debt_event : null });
  const l: Ledger = { accounts: backup.tables.accounts as never, transactions, debts: backup.tables.debts as never };
  const today = '2026-11-25';

  const time = (fn: () => void, runs = 5) => {
    fn();
    const t = performance.now();
    for (let i = 0; i < runs; i++) fn();
    return (performance.now() - t) / runs;
  };

  it('Home, Money, Dreams and Audit compute within budget', () => {
    expect(transactions.length).toBeGreaterThan(2000);
    const home = time(() => {
      netWorthParts(l);
      monthStats(l, '2026-11');
      netWorthSeries(l, '2026-11', 6, today);
      monthReadyToClose(l, [], today);
    });
    const money = time(() => {
      balances(l.accounts, l.transactions);
      for (const d of l.debts) debtStatus(d, l.transactions, today);
    });
    const dreams = time(() => {
      for (const d of backup.tables.dreams as never[]) dreamProgress(d, backup.tables.dream_entries as never, today);
    });
    const audit = time(() => {
      auditMonths(l, today);
      buildAuditSnapshot({ ledger: l, categories: backup.tables.categories as never, dreamEntries: backup.tables.dream_entries as never, month: '2026-10', savingsTarget: 2500000, symbol: 'Rs' });
    });
    console.log(`[perf] ${transactions.length} tx → home ${home.toFixed(1)} ms, money ${money.toFixed(1)} ms, dreams ${dreams.toFixed(2)} ms, audit ${audit.toFixed(1)} ms`);
    for (const [name, ms] of Object.entries({ home, money, dreams, audit })) expect(ms, name).toBeLessThan(20);
  });
});
