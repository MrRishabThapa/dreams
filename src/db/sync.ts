/**
 * Phase 5 groundwork (local only, no network code). The future Supabase sync needs:
 *  - every row: uuid `id`, `created_at`, `updated_at`, `deleted_at` (soft delete), local `dirty` flag
 *    (all writes go through repo.save / patch / softDelete / restore, which stamp these);
 *  - a pull cursor per table (`server_modified_at` of the last pulled row), kept here in local meta;
 *  - a count of rows waiting to be pushed.
 * Supabase JS, auth and push/pull will be added in Phase 5 on top of these.
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

export async function getSyncCursor(t: SyncedTable): Promise<string | null> {
  return getMeta<string | null>(cursorKey(t), null);
}

export async function setSyncCursor(t: SyncedTable, serverModifiedAt: string | null): Promise<void> {
  await setMeta(cursorKey(t), serverModifiedAt);
}

/** Rows changed locally and not yet pushed, per table. */
export async function pendingChanges(): Promise<Record<SyncedTable, number>> {
  const out = {} as Record<SyncedTable, number>;
  for (const t of SYNCED_TABLES) out[t] = await (db[t] as any).where('dirty').equals(1).count();
  return out;
}
