import { describe, expect, it } from 'vitest';
import { acct, debt, rng, tx } from './fixtures';
import { monthStats, netWorth } from './ledger';
import { buildAuditSnapshot } from './audit';
import { addMonths, addDays } from './dates';
import type { Account, Debt, DreamEntry, Ledger, Transaction } from './types';

/**
 * Random ledgers mixing every movement: flows, transfers, adjustments, debts with and
 * without cash (with payments), and dream earmarks with linked transfers. The identity
 * must hold every month, and "other" must equal exactly the no-cash debt effect.
 */
function world(seed: number) {
  const r = rng(seed);
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const kinds = ['cash', 'bank', 'wallet', 'savings', 'investment'] as const;
  const accounts: Account[] = Array.from({ length: int(2, 5) }, () => acct(kinds[int(0, 4)], int(0, 5_000_000)));
  const pick = () => accounts[int(0, accounts.length - 1)];
  const months = Array.from({ length: 6 }, (_, i) => addMonths('2026-01', i));
  const day = (m = months[int(0, 5)]) => `${m}-${String(int(1, 28)).padStart(2, '0')}`;
  const transactions: Transaction[] = [];
  const debts: Debt[] = [];
  const entries: DreamEntry[] = [];
  const other: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]));
  for (let i = 0; i < int(30, 140); i++) {
    const k = int(0, 11);
    const amt = int(1, 2_000_000);
    if (k <= 2) transactions.push(tx({ type: 'expense', amount_minor: amt, account_id: pick().id, occurred_on: day(), category_name: 'Food' }));
    else if (k <= 4) transactions.push(tx({ type: 'income', amount_minor: amt, account_id: pick().id, occurred_on: day() }));
    else if (k <= 5) transactions.push(tx({ type: 'transfer', amount_minor: amt, account_id: pick().id, to_account_id: pick().id, occurred_on: day() }));
    else if (k === 6) transactions.push(tx({ type: 'adjust', amount_minor: int(-300_000, 300_000), account_id: pick().id, occurred_on: day() }));
    else if (k <= 9) {
      const opened = day();
      const withCash = r() < 0.6;
      const d = debt({ direction: r() < 0.5 ? 'owe' : 'owed', amount_minor: amt, opened_on: opened });
      debts.push(d);
      if (withCash) transactions.push(tx({ type: d.direction === 'owe' ? 'income' : 'expense', amount_minor: amt, account_id: pick().id, occurred_on: opened, debt_id: d.id, debt_event: 'open' }));
      else other[opened.slice(0, 7)] += d.direction === 'owe' ? -amt : amt;
      // payments never exceed what remains; may land in a later month
      let left = amt;
      for (let p = 0; p < int(0, 3) && left > 0; p++) {
        const pay = int(1, left);
        left -= pay;
        const later = months.filter((m) => m >= opened.slice(0, 7));
        const pm = later[int(0, later.length - 1)];
        let pd = day(pm);
        if (pd < opened) pd = opened;
        transactions.push(tx({ type: d.direction === 'owe' ? 'expense' : 'income', amount_minor: pay, account_id: pick().id, occurred_on: pd, debt_id: d.id, debt_event: 'pay' }));
      }
    } else {
      // dream earmark, sometimes with a linked transfer
      const on = day();
      let tid: string | null = null;
      if (r() < 0.5) {
        const t = tx({ type: 'transfer', amount_minor: amt, account_id: pick().id, to_account_id: pick().id, occurred_on: on });
        transactions.push(t);
        tid = t.id;
      }
      entries.push({ id: `e${seed}-${i}`, dream_id: 'd', amount_minor: r() < 0.8 ? amt : -amt, entered_on: on, note: '', transaction_id: tid, created_at: on, updated_at: on, deleted_at: null });
    }
  }
  return { ledger: { accounts, transactions, debts } as Ledger, entries, months, other };
}

describe('reconciliation across debts, dreams and audits (property)', () => {
  it('holds on 300 random worlds; "other" equals the no-cash debt effect; snapshots agree with stats', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { ledger, entries, months, other } = world(seed);
      let chained = netWorth(ledger, addDays(`${months[0]}-01`, -1));
      for (const m of months) {
        const s = monthStats(ledger, m);
        expect(s.netWorthChange).toBe(s.income - s.expenses + s.investmentGainLoss + s.corrections + s.other);
        expect(s.other, `seed ${seed} ${m}`).toBe(other[m]);
        expect(s.netWorthStart).toBe(chained);
        chained = s.netWorthEnd;
        if (seed % 25 === 0) {
          const snap = buildAuditSnapshot({ ledger, categories: [], dreamEntries: entries, month: m, savingsTarget: null, symbol: 'Rs' });
          expect(snap.stats.netWorthChange).toBe(s.netWorthChange);
          expect(snap.stats.other).toBe(s.other);
          expect(snap.categories.reduce((a, c) => a + c.amount, 0)).toBe(s.expenses);
        }
      }
    }
  });
});
