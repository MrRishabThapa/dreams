import Dexie, { type Table } from 'dexie';
import type { Account, Audit, Category, Debt, Dream, DreamEntry, Transaction, UserSettings } from '../domain/types';

export interface Meta {
  key: string;
  value: unknown;
}

export class DreamsDB extends Dexie {
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  debts!: Table<Debt, string>;
  dreams!: Table<Dream, string>;
  dream_entries!: Table<DreamEntry, string>;
  audits!: Table<Audit, string>;
  user_settings!: Table<UserSettings, string>;
  meta!: Table<Meta, string>;

  constructor(name = 'dreams') {
    super(name);
    this.version(1).stores({
      accounts: 'id, kind, dirty, updated_at',
      categories: 'id, type, dirty, updated_at',
      transactions: 'id, occurred_on, account_id, to_account_id, debt_id, dirty, updated_at',
      debts: 'id, direction, dirty, updated_at',
      dreams: 'id, dirty, updated_at',
      dream_entries: 'id, dream_id, transaction_id, dirty, updated_at',
      audits: 'id, &month, dirty, updated_at',
      user_settings: 'id, dirty, updated_at',
      meta: 'key',
    });
  }
}

export const SYNCED_TABLES = [
  'accounts', 'categories', 'transactions', 'debts', 'dreams', 'dream_entries', 'audits', 'user_settings',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export let db = new DreamsDB();

/** Tests only: swap in a fresh database. */
export function _setDB(next: DreamsDB) {
  db = next;
}
