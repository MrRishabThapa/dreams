import { db } from './db';
import { correctBalance, getMeta, save, setMeta } from './repo';
import { emitWrite } from './events';
import type { Category, ISODate, Minor, Transaction } from '../domain/types';
import { noteFor, ruleKey, type Candidate, type Mapping, type Rules } from '../domain/importer';
import { reconcileDiff } from '../domain/wallet';
import { today } from '../domain/dates';

/*
 * Local-only (meta, never synced or backed up): the remembered column mappings, the
 * description → category rules, and the day each wallet's balance was last confirmed.
 * Nothing here talks to eSewa; there is no login and no password, MPIN, OTP or token.
 */

const MAPPINGS = 'import:mappings';
const RULES = 'import:rules';
const CONFIRMED = 'wallet:confirmed';

export async function getMapping(signature: string): Promise<Mapping | null> {
  return (await getMeta<Record<string, Mapping>>(MAPPINGS, {}))[signature] ?? null;
}

export async function rememberMapping(signature: string, m: Mapping): Promise<void> {
  const all = await getMeta<Record<string, Mapping>>(MAPPINGS, {});
  await setMeta(MAPPINGS, { ...all, [signature]: m });
}

export async function getRules(): Promise<Rules> {
  return getMeta<Rules>(RULES, {});
}

export async function getConfirmed(): Promise<Record<string, ISODate>> {
  return getMeta<Record<string, ISODate>>(CONFIRMED, {});
}

/**
 * "Update balance": the user types what the eSewa app shows. The difference is written as an
 * `adjust` (a correction, never income or spending). Confirming an unchanged balance writes
 * nothing but still resets the nudge.
 */
export async function reconcile(accountId: string, current: Minor, actual: Minor, on: ISODate = today(), note = 'Balance checked'): Promise<{ diff: Minor; tx: Transaction | null }> {
  const diff = reconcileDiff(current, actual);
  const tx = await correctBalance(accountId, current, actual, on, note);
  const all = await getConfirmed();
  if (!all[accountId] || all[accountId] < on) await setMeta(CONFIRMED, { ...all, [accountId]: on });
  emitWrite();
  return { diff, tx };
}

export interface ImportPick extends Candidate {
  include: boolean;
  categoryId: string | null;
}

export interface ImportResult {
  added: number;
  skipped: number;
  ids: string[];
}

/**
 * Writes the chosen rows as ordinary transactions on the account (they sync like any
 * other), skipping duplicates and rows with errors, and learns description → category.
 * All or nothing: one database transaction.
 */
export async function importRows(accountId: string, rows: ImportPick[], categories: Category[]): Promise<ImportResult> {
  const cats = new Map(categories.map((c) => [c.id, c]));
  const rules = { ...(await getRules()) };
  const ids: string[] = [];
  let skipped = 0;
  await db.transaction('rw', db.transactions, db.meta, async () => {
    for (const r of rows) {
      if (!r.include || r.duplicate || r.error || !r.date || r.amount_minor <= 0) {
        skipped++;
        continue;
      }
      if (!Number.isSafeInteger(r.amount_minor)) throw new Error('Amount must be integer paisa');
      const cat = r.categoryId ? cats.get(r.categoryId) : undefined;
      const ok = cat && !cat.deleted_at && cat.type === r.type;
      const t = (await save('transactions', {
        type: r.type,
        amount_minor: r.amount_minor,
        account_id: accountId,
        to_account_id: null,
        category_id: ok ? cat.id : null,
        category_name: ok ? cat.name : 'Other',
        occurred_on: r.date,
        note: noteFor(r.description, r.ref).slice(0, 200),
        debt_id: null,
        debt_event: null,
      } as Partial<Transaction>)) as Transaction;
      ids.push(t.id);
      const k = ruleKey(r.description);
      if (ok && k) rules[k] = cat.id;
    }
    await setMeta(RULES, rules);
  });
  return { added: ids.length, skipped, ids };
}
