import { db, SYNCED_TABLES, type SyncedTable } from './db';
import { getMeta, setMeta } from './repo';
import { emitWrite } from './events';
import type { Account, Category, Debt, Transaction } from '../domain/types';

export const BACKUP_APP = 'dreams';
export const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof BACKUP_APP;
  version: number;
  exported_at: string;
  tables: Record<SyncedTable, Record<string, unknown>[]>;
}

/** Everything in the synced tables, including soft-deleted rows (so a later sync stays correct). */
export async function buildBackup(): Promise<Backup> {
  const tables = {} as Backup['tables'];
  for (const t of SYNCED_TABLES) {
    const rows = (await (db[t] as any).toArray()) as Record<string, unknown>[];
    tables[t] = rows.map(({ dirty: _d, ...r }) => r);
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, exported_at: new Date().toISOString(), tables };
}

const REQUIRED: Record<SyncedTable, string[]> = {
  accounts: ['id', 'name', 'kind', 'opening_minor'],
  categories: ['id', 'name', 'type'],
  transactions: ['id', 'type', 'amount_minor', 'account_id', 'occurred_on'],
  debts: ['id', 'person', 'direction', 'amount_minor', 'opened_on'],
  dreams: ['id', 'title', 'target_minor'],
  dream_entries: ['id', 'dream_id', 'amount_minor', 'entered_on'],
  audits: ['id', 'month', 'snapshot'],
  user_settings: ['id'],
};

/** Returns a human-readable problem, or null when the file is a usable Dreams backup. */
export function validateBackup(x: unknown): string | null {
  if (!x || typeof x !== 'object') return 'This file isn’t a Dreams backup.';
  const b = x as Partial<Backup>;
  if (b.app !== BACKUP_APP || !b.tables) return 'This file isn’t a Dreams backup.';
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) return 'This backup is from a newer version of Dreams. Update the app first.';
  for (const t of SYNCED_TABLES) {
    const rows = (b.tables as Record<string, unknown>)[t];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) return `The ${t} section is damaged.`;
    for (const r of rows) {
      if (!r || typeof r !== 'object') return `The ${t} section is damaged.`;
      for (const k of REQUIRED[t]) if (!(k in (r as object))) return `A ${t} row is missing “${k}”.`;
      for (const k of Object.keys(r as object)) {
        if (k.endsWith('_minor')) {
          const v = (r as Record<string, unknown>)[k];
          if (v !== null && !Number.isSafeInteger(v)) return `A ${t} row has an invalid amount.`;
        }
      }
    }
  }
  if (!(b.tables.accounts ?? []).some((a) => !(a as { deleted_at?: unknown }).deleted_at)) return 'This backup has no accounts.';
  return null;
}

/** Replaces every synced table with the backup's rows. Local-only meta (like the app lock) is kept. */
export async function restoreBackup(b: Backup): Promise<{ rows: number }> {
  const problem = validateBackup(b);
  if (problem) throw new Error(problem);
  let rows = 0;
  await db.transaction('rw', [...SYNCED_TABLES.map((t) => db[t]), db.meta], async () => {
    for (const t of SYNCED_TABLES) {
      await (db[t] as any).clear();
      const list = (b.tables[t] ?? []).map((r) => ({ deleted_at: null, ...r, dirty: 1 }));
      await (db[t] as any).bulkPut(list);
      rows += list.length;
    }
    await setMeta('onboarded', true);
    await setMeta('lastAccountId', null);
    await setMeta('lastBackupAt', new Date().toISOString());
  });
  emitWrite();
  return { rows };
}

/* ---------- CSV ---------- */

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dec = (minor: number) => {
  const neg = minor < 0;
  const a = Math.abs(minor);
  return `${neg ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
};

/** Transactions as CSV (one row each, oldest first). Amount is signed from the account's point of view. */
export function transactionsCSV(txs: Transaction[], accounts: Account[], categories: Category[], debts: Debt[]): string {
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const dbt = new Map(debts.map((d) => [d.id, d.person]));
  const head = ['date', 'type', 'amount', 'account', 'to_account', 'category', 'note', 'debt_person', 'debt_event', 'id'];
  const rows = txs
    .filter((t) => !t.deleted_at)
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.created_at.localeCompare(b.created_at))
    .map((t) => {
      const signed = t.type === 'expense' || t.type === 'transfer' ? -t.amount_minor : t.amount_minor;
      return [
        t.occurred_on, t.type, dec(signed), acc.get(t.account_id) ?? '', t.to_account_id ? acc.get(t.to_account_id) ?? '' : '',
        (t.category_id && cat.get(t.category_id)) || t.category_name || '', t.note, t.debt_id ? dbt.get(t.debt_id) ?? '' : '', t.debt_event ?? '', t.id,
      ].map(esc).join(',');
    });
  return [head.join(','), ...rows].join('\r\n') + '\r\n';
}

/* ---------- sharing ---------- */

/** iOS share sheet with the file when possible, otherwise a download. */
export async function shareOrDownload(filename: string, mime: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = typeof File !== 'undefined' ? new File([text], filename, { type: mime }) : null;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (file && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

export async function exportBackupFile(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const b = await buildBackup();
  const name = `dreams-backup-${b.exported_at.slice(0, 10)}.json`;
  const r = await shareOrDownload(name, 'application/json', JSON.stringify(b));
  if (r !== 'cancelled') await setMeta('lastBackupAt', b.exported_at);
  return r;
}

export async function lastBackupAt(): Promise<string | null> {
  return getMeta<string | null>('lastBackupAt', null);
}

export function backupNudge(last: string | null, hasData: boolean, now = Date.now()): string | null {
  if (!hasData) return null;
  if (!last) return 'You haven’t backed up yet. Your data lives only on this iPhone.';
  const days = Math.floor((now - Date.parse(last)) / 86400000);
  if (days > 7) return `Last backup was ${days} days ago. There’s no cloud copy yet, so back up now.`;
  return null;
}

