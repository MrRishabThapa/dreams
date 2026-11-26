import type { Account, Category, ISODate, Ledger, Minor, Month, Transaction } from './types';
import { addDays, addMonths, monthEnd, monthStart, parseISODate } from './dates';
import { balance, inMonth, txEffect } from './ledger';

/**
 * E-wallet helpers (eSewa and friends). eSewa has no public API for a personal wallet, so
 * the app never logs in anywhere: the balance is confirmed by hand ("reconcile") and
 * history comes from a statement file the user exports and imports locally.
 */

/** The `adjust` amount that makes Dreams' balance equal the real one. 0 = already matches. */
export function reconcileDiff(current: Minor, actual: Minor): Minor {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(actual)) throw new Error('Amounts must be integer paisa');
  return actual - current;
}

/**
 * The last day the balance was confirmed: the newer of an explicit confirmation stored on
 * this device and the latest live `adjust` on the account (a reconcile that changed the
 * balance writes one, and that one syncs to other devices).
 */
export function lastConfirmed(accountId: string, txs: Transaction[], confirmedOn: ISODate | null): ISODate | null {
  let last = confirmedOn;
  for (const t of txs) {
    if (t.deleted_at || t.type !== 'adjust' || t.account_id !== accountId) continue;
    if (!last || t.occurred_on > last) last = t.occurred_on;
  }
  return last;
}

/** Whole days between two calendar dates (b − a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

export const NUDGE_DAYS = 7;

/** A gentle line for the account screen, or null when the balance was confirmed recently. */
export function confirmNudge(last: ISODate | null, today: ISODate): { text: string; stale: boolean } {
  if (!last) return { text: 'Balance not confirmed yet. Check it against the eSewa app.', stale: true };
  const d = Math.max(0, daysBetween(last, today));
  const when = d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  return { text: `Balance last confirmed ${when}.`, stale: d >= NUDGE_DAYS };
}

/* ---------- wallet audit ---------- */

const FEE_RE = /\b(fee|fees|charge|charges|commission|service charge)\b/i;

export function isFee(t: Transaction, categoryName: string | null): boolean {
  return t.type === 'expense' && (FEE_RE.test(categoryName ?? '') || FEE_RE.test(t.note));
}

export interface WalletMonth {
  accountId: string;
  name: string;
  month: Month;
  opening: Minor;
  closing: Minor;
  /** every movement into the wallet (income, transfers in, positive corrections, debt cash in) */
  totalIn: Minor;
  /** every movement out (expenses, transfers out, negative corrections, debt cash out); positive */
  totalOut: Minor;
  income: Minor;
  expenses: Minor;
  transfersIn: Minor;
  transfersOut: Minor;
  /** signed sum of corrections from reconciling */
  corrections: Minor;
  debtIn: Minor;
  debtOut: Minor;
  fees: Minor;
  topCategories: { name: string; amount: Minor }[];
  topMerchants: { name: string; amount: Minor; count: number }[];
  prev: { month: Month; totalIn: Minor; totalOut: Minor; expenses: Minor } | null;
  count: number;
}

/** A merchant name from a note: drops import refs, ids and digits so "QR Pay 8812 · Ref 99" → "qr pay". */
export function merchantKey(note: string): string {
  return note
    .replace(/·\s*Ref\s+\S+\s*$/i, '')
    .toLowerCase()
    .replace(/[0-9#:/\\._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * One month of one wallet, computed only from transactions tagged to that account.
 * closing = opening + totalIn − totalOut always holds. This is a view: it never changes how
 * the monthly audit counts income or spending (transfers bank ↔ eSewa stay out of both).
 */
export function walletMonth(l: Ledger, account: Account, month: Month, categories: Category[] = []): WalletMonth {
  const w = core(l, account, month, categories);
  const pm = addMonths(month, -1);
  const hasPrev = l.transactions.some((t) => !t.deleted_at && inMonth(t, pm) && (t.account_id === account.id || t.to_account_id === account.id));
  if (hasPrev) {
    const p = core(l, account, pm, categories);
    w.prev = { month: pm, totalIn: p.totalIn, totalOut: p.totalOut, expenses: p.expenses };
  }
  return w;
}

function core(l: Ledger, account: Account, month: Month, categories: Category[]): WalletMonth {
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const catName = (t: Transaction) => (t.category_id && cat.get(t.category_id)) || t.category_name || 'Other';
  const w: WalletMonth = {
    accountId: account.id, name: account.name, month,
    opening: balance(account, l.transactions, addDays(monthStart(month), -1)),
    closing: balance(account, l.transactions, monthEnd(month)),
    totalIn: 0, totalOut: 0, income: 0, expenses: 0, transfersIn: 0, transfersOut: 0,
    corrections: 0, debtIn: 0, debtOut: 0, fees: 0, topCategories: [], topMerchants: [], prev: null, count: 0,
  };
  const cats = new Map<string, Minor>();
  const merchants = new Map<string, { name: string; amount: Minor; count: number }>();
  for (const t of l.transactions) {
    if (t.deleted_at || !inMonth(t, month)) continue;
    if (t.account_id !== account.id && t.to_account_id !== account.id) continue;
    const e = txEffect(t, account.id);
    w.count++;
    if (e > 0) w.totalIn += e;
    else w.totalOut -= e;
    if (t.debt_id) {
      if (e > 0) w.debtIn += e;
      else w.debtOut -= e;
      continue;
    }
    switch (t.type) {
      case 'income':
        w.income += t.amount_minor;
        break;
      case 'expense': {
        w.expenses += t.amount_minor;
        const n = catName(t);
        cats.set(n, (cats.get(n) ?? 0) + t.amount_minor);
        if (isFee(t, n)) w.fees += t.amount_minor;
        const mk = merchantKey(t.note);
        if (mk) {
          const m = merchants.get(mk) ?? { name: titleCase(mk), amount: 0, count: 0 };
          m.amount += t.amount_minor;
          m.count++;
          merchants.set(mk, m);
        }
        break;
      }
      case 'adjust':
        w.corrections += t.amount_minor;
        break;
      case 'transfer':
        // a transfer from the wallet to itself is impossible (the repo forbids it)
        if (e > 0) w.transfersIn += e;
        else w.transfersOut -= e;
        break;
    }
  }
  w.topCategories = [...cats].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5);
  w.topMerchants = [...merchants.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)).slice(0, 5);
  return w;
}

/** Wallet sections for the monthly audit: every live e-wallet with activity or a balance. */
export function walletMonths(l: Ledger, month: Month, categories: Category[] = []): WalletMonth[] {
  return l.accounts
    .filter((a) => !a.deleted_at && a.kind === 'wallet')
    .sort((a, b) => a.sort - b.sort)
    .map((a) => walletMonth(l, a, month, categories))
    .filter((w) => w.count > 0 || w.opening !== 0 || w.closing !== 0);
}
