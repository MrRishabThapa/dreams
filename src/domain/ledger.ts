import type { Account, Debt, ISODate, Ledger, Minor, Month, Transaction } from './types';
import { addDays, monthEnd, monthStart } from './dates';

const live = <T extends { deleted_at: string | null }>(r: T) => !r.deleted_at;

/** Effect of one transaction on one account's balance. */
export function txEffect(tx: Transaction, accountId: string): Minor {
  switch (tx.type) {
    case 'income':
      return tx.account_id === accountId ? tx.amount_minor : 0;
    case 'expense':
      return tx.account_id === accountId ? -tx.amount_minor : 0;
    case 'adjust':
      return tx.account_id === accountId ? tx.amount_minor : 0;
    case 'transfer': {
      let e = 0;
      if (tx.account_id === accountId) e -= tx.amount_minor;
      if (tx.to_account_id === accountId) e += tx.amount_minor;
      return e;
    }
  }
}

/**
 * balance(account, asOf) = opening + Σincome − Σexpense − Σtransfer-out + Σtransfer-in + Σadjust,
 * over non-deleted transactions with occurred_on ≤ asOf (no asOf = all).
 */
export function balance(account: Account, txs: Transaction[], asOf?: ISODate): Minor {
  let b = account.opening_minor;
  for (const t of txs) {
    if (t.deleted_at) continue;
    if (asOf && t.occurred_on > asOf) continue;
    b += txEffect(t, account.id);
  }
  return b;
}

/** All balances in one pass. */
export function balances(accounts: Account[], txs: Transaction[], asOf?: ISODate): Map<string, Minor> {
  const map = new Map<string, Minor>();
  for (const a of accounts) if (live(a)) map.set(a.id, a.opening_minor);
  for (const t of txs) {
    if (t.deleted_at) continue;
    if (asOf && t.occurred_on > asOf) continue;
    const from = map.get(t.account_id);
    if (t.type === 'transfer') {
      if (from !== undefined) map.set(t.account_id, from - t.amount_minor);
      const to = t.to_account_id ? map.get(t.to_account_id) : undefined;
      if (to !== undefined) map.set(t.to_account_id!, to + t.amount_minor);
    } else if (from !== undefined) {
      map.set(t.account_id, from + (t.type === 'expense' ? -t.amount_minor : t.amount_minor));
    }
  }
  return map;
}

/** Σ payments recorded against a debt up to asOf. */
export function debtPaid(debt: Debt, txs: Transaction[], asOf?: ISODate): Minor {
  let paid = 0;
  for (const t of txs) {
    if (t.deleted_at || t.debt_id !== debt.id || t.debt_event !== 'pay') continue;
    if (asOf && t.occurred_on > asOf) continue;
    paid += t.amount_minor;
  }
  return paid;
}

/** debtRemaining = 0 if opened after asOf, else amount − Σpayments ≤ asOf, floored at 0. */
export function debtRemaining(debt: Debt, txs: Transaction[], asOf?: ISODate): Minor {
  if (debt.deleted_at) return 0;
  if (asOf && debt.opened_on > asOf) return 0;
  return Math.max(0, debt.amount_minor - debtPaid(debt, txs, asOf));
}

export interface NetWorthParts {
  assets: Minor;
  owedToMe: Minor;
  iOwe: Minor;
  netWorth: Minor;
}

/**
 * netWorth = Σ balances + Σ remaining(owed to me) − Σ remaining(I owe).
 * Archived accounts are included: the app only allows archiving an account whose
 * balance is zero, so this matches "non-archived" today while keeping history stable.
 */
export function netWorthParts(l: Ledger, asOf?: ISODate): NetWorthParts {
  let assets = 0;
  for (const v of balances(l.accounts, l.transactions, asOf).values()) assets += v;
  let owedToMe = 0;
  let iOwe = 0;
  for (const d of l.debts) {
    const r = debtRemaining(d, l.transactions, asOf);
    if (d.direction === 'owed') owedToMe += r;
    else iOwe += r;
  }
  return { assets, owedToMe, iOwe, netWorth: assets + owedToMe - iOwe };
}

export function netWorth(l: Ledger, asOf?: ISODate): Minor {
  return netWorthParts(l, asOf).netWorth;
}

export interface MonthStats {
  month: Month;
  income: Minor;
  expenses: Minor;
  saved: Minor;
  /** saved / income; null when income is 0 */
  savingsRate: number | null;
  movedToSavings: Minor;
  movedToInvestments: Minor;
  investmentGainLoss: Minor;
  corrections: Minor;
  borrowed: Minor;
  lent: Minor;
  repaid: Minor;
  collected: Minor;
  netWorthStart: Minor;
  netWorthEnd: Minor;
  netWorthChange: Minor;
  /** netWorthChange − (income − expenses + investmentGainLoss + corrections) */
  other: Minor;
  byCategory: { name: string; categoryId: string | null; amount: Minor }[];
}

export function inMonth(t: Transaction, m: Month): boolean {
  return t.occurred_on.slice(0, 7) === m;
}

/** True for transactions that count as income/expense in stats. */
export function isFlow(t: Transaction): boolean {
  return !t.deleted_at && !t.debt_id && (t.type === 'income' || t.type === 'expense');
}

export function monthStats(l: Ledger, m: Month): MonthStats {
  const kind = new Map(l.accounts.map((a) => [a.id, a.kind] as const));
  const s: MonthStats = {
    month: m, income: 0, expenses: 0, saved: 0, savingsRate: null,
    movedToSavings: 0, movedToInvestments: 0, investmentGainLoss: 0, corrections: 0,
    borrowed: 0, lent: 0, repaid: 0, collected: 0,
    netWorthStart: 0, netWorthEnd: 0, netWorthChange: 0, other: 0, byCategory: [],
  };
  const cats = new Map<string, { name: string; categoryId: string | null; amount: Minor }>();
  const liveIds = new Set(l.accounts.filter(live).map((a) => a.id));
  const liveAccount = (id: string | null) => !!id && liveIds.has(id);

  for (const t of l.transactions) {
    if (t.deleted_at || !inMonth(t, m)) continue;
    if (!liveAccount(t.account_id)) continue;
    if (t.debt_id) {
      if (t.debt_event === 'open') {
        if (t.type === 'income') s.borrowed += t.amount_minor;
        else if (t.type === 'expense') s.lent += t.amount_minor;
      } else if (t.debt_event === 'pay') {
        if (t.type === 'expense') s.repaid += t.amount_minor;
        else if (t.type === 'income') s.collected += t.amount_minor;
      }
      continue;
    }
    switch (t.type) {
      case 'income':
        s.income += t.amount_minor;
        break;
      case 'expense': {
        s.expenses += t.amount_minor;
        const key = t.category_id ?? 'name:' + (t.category_name ?? 'Other');
        const c = cats.get(key) ?? { name: t.category_name ?? 'Other', categoryId: t.category_id, amount: 0 };
        c.amount += t.amount_minor;
        cats.set(key, c);
        break;
      }
      case 'adjust':
        if (kind.get(t.account_id) === 'investment') s.investmentGainLoss += t.amount_minor;
        else s.corrections += t.amount_minor;
        break;
      case 'transfer': {
        const fromK = kind.get(t.account_id);
        const toK = t.to_account_id && liveAccount(t.to_account_id) ? kind.get(t.to_account_id) : undefined;
        if (toK === 'savings') s.movedToSavings += t.amount_minor;
        if (fromK === 'savings') s.movedToSavings -= t.amount_minor;
        if (toK === 'investment') s.movedToInvestments += t.amount_minor;
        if (fromK === 'investment') s.movedToInvestments -= t.amount_minor;
        break;
      }
    }
  }
  s.saved = s.income - s.expenses;
  s.savingsRate = s.income === 0 ? null : s.saved / s.income;
  s.netWorthStart = netWorth(l, addDays(monthStart(m), -1));
  s.netWorthEnd = netWorth(l, monthEnd(m));
  s.netWorthChange = s.netWorthEnd - s.netWorthStart;
  s.other = s.netWorthChange - (s.income - s.expenses + s.investmentGainLoss + s.corrections);
  s.byCategory = [...cats.values()].sort((a, b) => b.amount - a.amount);
  return s;
}

/** Net worth at the end of each of the last `n` months ending at `m` (oldest first). */
export function netWorthSeries(l: Ledger, endMonth: Month, n: number, asOfToday?: ISODate): Minor[] {
  const out: Minor[] = [];
  const [y, mo] = endMonth.split('-').map(Number);
  for (let i = n - 1; i >= 0; i--) {
    const idx = y * 12 + (mo - 1) - i;
    const mm = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
    let asOf = monthEnd(mm);
    if (asOfToday && asOf > asOfToday) asOf = asOfToday;
    out.push(netWorth(l, asOf));
  }
  return out;
}
