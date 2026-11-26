/** All money values are integer minor units (paisa). Never floats. */
export type Minor = number;
/** Calendar date as `YYYY-MM-DD` (local, no time zone). */
export type ISODate = string;
/** Month as `YYYY-MM`. */
export type Month = string;

export interface Base {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** local only: 1 = has changes not yet pushed */
  dirty?: 0 | 1;
}

export type AccountKind = 'cash' | 'bank' | 'wallet' | 'savings' | 'investment';

export interface Account extends Base {
  name: string;
  kind: AccountKind;
  opening_minor: Minor;
  icon: string | null;
  color: string | null;
  sort: number;
  archived: boolean;
}

export type CategoryType = 'income' | 'expense';

export interface Category extends Base {
  name: string;
  type: CategoryType;
  icon: string | null;
  color: string | null;
  sort: number;
}

export type TxType = 'expense' | 'income' | 'transfer' | 'adjust';

export interface Transaction extends Base {
  type: TxType;
  /** positive, except `adjust` which is signed */
  amount_minor: Minor;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  category_name: string | null;
  occurred_on: ISODate;
  note: string;
  debt_id: string | null;
  debt_event: 'open' | 'pay' | null;
}

export interface Debt extends Base {
  person: string;
  /** owe = I owe them, owed = they owe me */
  direction: 'owe' | 'owed';
  amount_minor: Minor;
  opened_on: ISODate;
  due_on: ISODate | null;
  note: string;
}

export interface Dream extends Base {
  title: string;
  icon: string | null;
  color: string | null;
  target_minor: Minor;
  target_on: ISODate | null;
  completed_at: string | null;
}

export interface DreamEntry extends Base {
  dream_id: string;
  amount_minor: Minor;
  entered_on: ISODate;
  note: string;
  transaction_id: string | null;
}

export interface Audit extends Base {
  month: Month;
  snapshot: unknown;
  reflection: string;
  next_savings_target_minor: Minor | null;
  closed_at: string | null;
}

export interface UserSettings extends Base {
  currency: string;
  symbol: string;
  monthly_savings_target_minor: Minor | null;
  theme: 'auto' | 'light' | 'dark';
  auto_sync: boolean;
  /** shown in the Home greeting; synced. Missing on rows from before v1.2.2. */
  display_name?: string | null;
}

export interface Ledger {
  accounts: Account[];
  transactions: Transaction[];
  debts: Debt[];
}
