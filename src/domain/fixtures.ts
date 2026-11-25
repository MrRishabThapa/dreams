import type { Account, AccountKind, Debt, Transaction } from './types';

let n = 0;
const stamp = '2026-01-01T00:00:00.000Z';
export const uid = () => `id-${++n}`;

export function acct(kind: AccountKind, opening = 0, extra: Partial<Account> = {}): Account {
  return {
    id: uid(), name: kind, kind, opening_minor: opening, icon: null, color: null, sort: 0, archived: false,
    created_at: stamp, updated_at: stamp, deleted_at: null, ...extra,
  };
}

export function tx(p: Partial<Transaction> & Pick<Transaction, 'type' | 'amount_minor' | 'account_id' | 'occurred_on'>): Transaction {
  return {
    id: uid(), to_account_id: null, category_id: null, category_name: null, note: '', debt_id: null, debt_event: null,
    created_at: stamp, updated_at: stamp, deleted_at: null, ...p,
  };
}

export function debt(p: Partial<Debt> & Pick<Debt, 'direction' | 'amount_minor' | 'opened_on'>): Debt {
  return { id: uid(), person: 'Someone', due_on: null, note: '', created_at: stamp, updated_at: stamp, deleted_at: null, ...p };
}

/** Deterministic PRNG (mulberry32) for property tests. */
export function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
