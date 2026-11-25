import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from './db';
import type { Account, Category, Debt, Ledger, Transaction } from '../domain/types';
import { balances, netWorthParts } from '../domain/ledger';

export interface Data extends Ledger {
  categories: Category[];
}

/** Whole local dataset (personal scale: thousands of rows), reactive. */
export function useData(): Data | undefined {
  return useLiveQuery(async () => {
    const [accounts, transactions, debts, categories] = await Promise.all([
      db.accounts.toArray(),
      db.transactions.toArray(),
      db.debts.toArray(),
      db.categories.toArray(),
    ]);
    return { accounts, transactions, debts, categories };
  }, []);
}

export function liveAccounts(d: Data | undefined, includeArchived = false): Account[] {
  return (d?.accounts ?? []).filter((a) => !a.deleted_at && (includeArchived || !a.archived)).sort((a, b) => a.sort - b.sort);
}

export function liveTxs(d: Data | undefined): Transaction[] {
  return (d?.transactions ?? []).filter((t) => !t.deleted_at);
}

export function liveDebts(d: Data | undefined): Debt[] {
  return (d?.debts ?? []).filter((x) => !x.deleted_at);
}

export function liveCategories(d: Data | undefined, type?: 'income' | 'expense'): Category[] {
  return (d?.categories ?? []).filter((c) => !c.deleted_at && (!type || c.type === type)).sort((a, b) => a.sort - b.sort);
}

export function useBalances(d: Data | undefined) {
  return useMemo(() => (d ? balances(d.accounts, d.transactions) : new Map<string, number>()), [d]);
}

export function useNetWorth(d: Data | undefined) {
  return useMemo(() => (d ? netWorthParts(d) : { assets: 0, owedToMe: 0, iOwe: 0, netWorth: 0 }), [d]);
}
