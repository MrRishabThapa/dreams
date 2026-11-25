/**
 * Local sync bookkeeping (no network code here; see src/sync/ for the engine). Sync needs:
 *  - every row: uuid `id`, `created_at`, `updated_at`, `deleted_at` (soft delete), local `dirty` flag
 *    (all writes go through repo.save / patch / softDelete / restore, which stamp these);
 *  - a pull cursor per table (`server_modified_at` of the last pulled row), kept here in local meta;
 *  - a count of rows waiting to be pushed.
 */
import { db, SYNCED_TABLES, type SyncedTable } from './db';
import { getMeta, setMeta } from './repo';

const cursorKey = (t: SyncedTable) => `sync:cursor:${t}`;

/** Creates an empty cursor slot for every synced table (idempotent). */
export async function ensureSyncSlots(): Promise<void> {
  for (const t of SYNCED_TABLES) {
    if ((await db.meta.get(cursorKey(t))) === undefined) await setMeta(cursorKey(t), null);
  }
  if ((await db.meta.get('sync:lastSyncedAt')) === undefined) await setMeta('sync:lastSyncedAt', null);
}

/** Composite pull cursor: rows strictly after (server_modified_at, id). */
export interface Cursor {
  ts: string;
  id: string;
}

export async function getSyncCursor(t: SyncedTable): Promise<Cursor | null> {
  const v = await getMeta<Cursor | string | null>(cursorKey(t), null);
  return v && typeof v === 'object' ? v : null;
}

export async function setSyncCursor(t: SyncedTable, c: Cursor | null): Promise<void> {
  await setMeta(cursorKey(t), c);
}

export async function resetSyncCursors(): Promise<void> {
  for (const t of SYNCED_TABLES) await setSyncCursor(t, null);
}

/** Rows changed locally and not yet pushed, per table. */
export async function pendingChanges(): Promise<Record<SyncedTable, number>> {
  const out = {} as Record<SyncedTable, number>;
  for (const t of SYNCED_TABLES) out[t] = await (db[t] as any).where('dirty').equals(1).count();
  return out;
}
