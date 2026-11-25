import { db, type SyncedTable } from './db';
import type { Account, Base, Category, Debt, ISODate, Minor, Transaction, UserSettings } from '../domain/types';
import { DEFAULT_CATEGORIES, KIND_META } from '../lib/catalog';
import { today } from '../domain/dates';
import { debtRemaining } from '../domain/ledger';
import { debtTxType } from '../domain/debts';
import { formatMoney } from '../domain/money';

export const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

type RowOf<T extends SyncedTable> = Parameters<(typeof db)[T]['put']>[0];

/**
 * The single write path. Stamps created_at/updated_at and marks the row dirty
 * so the Phase 5 sync can push it.
 */
export async function save<T extends SyncedTable>(table: T, row: Partial<RowOf<T>> & { id?: string }): Promise<RowOf<T>> {
  const t = now();
  const full = {
    deleted_at: null,
    ...row,
    id: row.id ?? uuid(),
    created_at: (row as Partial<Base>).created_at ?? t,
    updated_at: t,
    dirty: 1,
  } as RowOf<T>;
  await (db[table] as any).put(full);
  return full;
}

export async function patch<T extends SyncedTable>(table: T, id: string, changes: Partial<RowOf<T>>): Promise<void> {
  await (db[table] as any).update(id, { ...changes, updated_at: now(), dirty: 1 });
}

export async function softDelete(table: SyncedTable, ids: string[]): Promise<void> {
  const t = now();
  await db.transaction('rw', db[table], async () => {
    for (const id of ids) await (db[table] as any).update(id, { deleted_at: t, updated_at: t, dirty: 1 });
  });
}

export async function restore(table: SyncedTable, ids: string[]): Promise<void> {
  const t = now();
  await db.transaction('rw', db[table], async () => {
    for (const id of ids) await (db[table] as any).update(id, { deleted_at: null, updated_at: t, dirty: 1 });
  });
}

/* ---------- Meta (local-only prefs) ---------- */

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const m = await db.meta.get(key);
  return (m?.value as T) ?? fallback;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/* ---------- Settings ---------- */

export async function getSettings(): Promise<UserSettings | undefined> {
  const all = await db.user_settings.toArray();
  return all.find((s) => !s.deleted_at);
}

export async function ensureSettings(): Promise<UserSettings> {
  const s = await getSettings();
  if (s) return s;
  return save('user_settings', {
    currency: 'NPR', symbol: 'Rs', monthly_savings_target_minor: null, theme: 'auto', auto_sync: false,
  }) as Promise<UserSettings>;
}

export async function seedCategories(): Promise<void> {
  const count = await db.categories.count();
  if (count > 0) return;
  let sort = 0;
  for (const c of DEFAULT_CATEGORIES) {
    await save('categories', { name: c.name, type: c.type, icon: c.icon, color: c.color, sort: sort++ } as Partial<Category>);
  }
}

/* ---------- Accounts ---------- */

export async function createAccount(input: { name: string; kind: Account['kind']; opening_minor: Minor }): Promise<Account> {
  const count = await db.accounts.count();
  return save('accounts', {
    ...input, icon: KIND_META[input.kind].icon, color: KIND_META[input.kind].color, sort: count, archived: false,
  }) as Promise<Account>;
}

/** Ids of every live transaction touching an account (incl. transfers into it). */
export async function accountTxIds(accountId: string): Promise<string[]> {
  const a = await db.transactions.where('account_id').equals(accountId).toArray();
  const b = await db.transactions.where('to_account_id').equals(accountId).toArray();
  return [...a, ...b].filter((t) => !t.deleted_at).map((t) => t.id);
}

/** Soft-deletes the account and all its transactions. Returns ids for undo. */
export async function deleteAccount(accountId: string): Promise<{ txIds: string[] }> {
  const txIds = await accountTxIds(accountId);
  await softDelete('transactions', txIds);
  await softDelete('accounts', [accountId]);
  return { txIds };
}

export async function undoDeleteAccount(accountId: string, txIds: string[]): Promise<void> {
  await restore('accounts', [accountId]);
  await restore('transactions', txIds);
}

/* ---------- Transactions ---------- */

export interface TxInput {
  id?: string;
  type: Transaction['type'];
  amount_minor: Minor;
  account_id: string;
  to_account_id?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  occurred_on: ISODate;
  note?: string;
  created_at?: string;
}

export async function saveTransaction(input: TxInput): Promise<Transaction> {
  if (!Number.isSafeInteger(input.amount_minor)) throw new Error('Amount must be integer paisa');
  if (input.type !== 'adjust' && input.amount_minor <= 0) throw new Error('Amount must be positive');
  if (input.type === 'transfer' && (!input.to_account_id || input.to_account_id === input.account_id)) {
    throw new Error('Pick two different accounts');
  }
  const existing = input.id ? await db.transactions.get(input.id) : undefined;
  const row = await save('transactions', {
    debt_id: null,
    debt_event: null,
    ...(existing ?? {}),
    type: input.type,
    amount_minor: input.amount_minor,
    account_id: input.account_id,
    to_account_id: input.type === 'transfer' ? input.to_account_id ?? null : null,
    category_id: input.type === 'income' || input.type === 'expense' ? input.category_id ?? null : null,
    category_name: input.type === 'income' || input.type === 'expense' ? input.category_name ?? null : null,
    occurred_on: input.occurred_on,
    note: (input.note ?? '').trim(),
    id: input.id,
    created_at: existing?.created_at ?? input.created_at,
  } as Partial<Transaction>);
  await setMeta('lastAccountId', input.account_id);
  return row as Transaction;
}

/** Correct balance: writes an `adjust` entry for the difference. Returns null if no change. */
export async function correctBalance(accountId: string, current: Minor, target: Minor, on: ISODate = today(), note = ''): Promise<Transaction | null> {
  const diff = target - current;
  if (diff === 0) return null;
  return saveTransaction({ type: 'adjust', amount_minor: diff, account_id: accountId, occurred_on: on, note });
}

/* ---------- Debts ---------- */

export interface DebtInput {
  person: string;
  direction: Debt['direction'];
  amount_minor: Minor;
  opened_on: ISODate;
  due_on?: ISODate | null;
  note?: string;
  /** record the cash movement (open event) in this account */
  cashAccountId?: string | null;
}

function checkAmount(v: Minor) {
  if (!Number.isSafeInteger(v) || v <= 0) throw new Error('Enter an amount above 0');
}

/** Creates a debt; with cashAccountId also writes the `open` transaction (borrowed = income, lent = expense). */
export async function createDebt(input: DebtInput): Promise<{ debt: Debt; tx: Transaction | null }> {
  checkAmount(input.amount_minor);
  const person = input.person.trim();
  if (!person) throw new Error('Add who this is with');
  return db.transaction('rw', db.debts, db.transactions, db.meta, async () => {
    const debt = (await save('debts', {
      person,
      direction: input.direction,
      amount_minor: input.amount_minor,
      opened_on: input.opened_on,
      due_on: input.due_on ?? null,
      note: (input.note ?? '').trim(),
    } as Partial<Debt>)) as Debt;
    let tx: Transaction | null = null;
    if (input.cashAccountId) {
      tx = (await save('transactions', {
        type: debtTxType(input.direction, 'open'),
        amount_minor: input.amount_minor,
        account_id: input.cashAccountId,
        to_account_id: null,
        category_id: null,
        category_name: null,
        occurred_on: input.opened_on,
        note: '',
        debt_id: debt.id,
        debt_event: 'open',
      } as Partial<Transaction>)) as Transaction;
      await setMeta('lastAccountId', input.cashAccountId);
    }
    return { debt, tx };
  });
}

/**
 * Edits a debt. Keeps the cash `open` transaction in step (amount, date, account),
 * adds one when cash recording is turned on, and soft-deletes it when turned off.
 */
export async function updateDebt(debt: Debt, input: DebtInput): Promise<void> {
  checkAmount(input.amount_minor);
  const person = input.person.trim();
  if (!person) throw new Error('Add who this is with');
  await db.transaction('rw', db.debts, db.transactions, db.meta, async () => {
    await patch('debts', debt.id, {
      person,
      direction: input.direction,
      amount_minor: input.amount_minor,
      opened_on: input.opened_on,
      due_on: input.due_on ?? null,
      note: (input.note ?? '').trim(),
    });
    const txs = (await db.transactions.where('debt_id').equals(debt.id).toArray()).filter((t) => !t.deleted_at);
    const open = txs.find((t) => t.debt_event === 'open');
    if (input.cashAccountId) {
      const fields = {
        type: debtTxType(input.direction, 'open'),
        amount_minor: input.amount_minor,
        account_id: input.cashAccountId,
        occurred_on: input.opened_on,
      };
      if (open) await patch('transactions', open.id, fields);
      else
        await save('transactions', {
          ...fields, to_account_id: null, category_id: null, category_name: null, note: '', debt_id: debt.id, debt_event: 'open',
        } as Partial<Transaction>);
    } else if (open) {
      await softDelete('transactions', [open.id]);
    }
    // a direction change flips the cash direction of existing payments too
    if (input.direction !== debt.direction) {
      for (const t of txs.filter((x) => x.debt_event === 'pay')) await patch('transactions', t.id, { type: debtTxType(input.direction, 'pay') });
    }
  });
}

export interface PaymentInput {
  amount_minor: Minor;
  account_id: string;
  occurred_on: ISODate;
  note?: string;
}

/** Records a repayment (I owe) or a collection (owed to me). Never more than what remains. */
export async function recordPayment(debt: Debt, input: PaymentInput): Promise<Transaction> {
  checkAmount(input.amount_minor);
  const txs = await db.transactions.where('debt_id').equals(debt.id).toArray();
  const remaining = debtRemaining(debt, txs);
  if (input.amount_minor > remaining) throw new Error(`Only ${formatMoney(remaining)} is left on this debt`);
  const tx = (await save('transactions', {
    type: debtTxType(debt.direction, 'pay'),
    amount_minor: input.amount_minor,
    account_id: input.account_id,
    to_account_id: null,
    category_id: null,
    category_name: null,
    occurred_on: input.occurred_on < debt.opened_on ? debt.opened_on : input.occurred_on,
    note: (input.note ?? '').trim(),
    debt_id: debt.id,
    debt_event: 'pay',
  } as Partial<Transaction>)) as Transaction;
  await setMeta('lastAccountId', input.account_id);
  return tx;
}

/** Soft-deletes the debt and all its transactions. Returns the transaction ids for undo. */
export async function deleteDebt(debt: Debt): Promise<string[]> {
  const ids = (await db.transactions.where('debt_id').equals(debt.id).toArray()).filter((t) => !t.deleted_at).map((t) => t.id);
  await softDelete('transactions', ids);
  await softDelete('debts', [debt.id]);
  return ids;
}

export async function undoDeleteDebt(debtId: string, txIds: string[]): Promise<void> {
  await restore('debts', [debtId]);
  await restore('transactions', txIds);
}

/* ---------- Danger ---------- */

export async function resetAll(): Promise<void> {
  await db.delete();
  await db.open();
}
