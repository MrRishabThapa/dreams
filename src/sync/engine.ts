/**
 * Sync engine (§7). Local IndexedDB is the source of truth for the UI.
 *  - push: dirty rows, in batches, upsert on id; `dirty` is cleared only after the batch
 *    succeeded and only if the row wasn't edited again meanwhile.
 *  - pull: per table, rows after the stored (server_modified_at, id) cursor, 1000 at a time;
 *    a remote row is applied when it is newer than the local one or the local row isn't dirty.
 *  - conflicts: last write wins by updated_at; the server trigger also ignores stale updates.
 *  - soft deletes are just edits (deleted_at), so they sync the same way.
 */
import { db, SYNCED_TABLES, type SyncedTable } from '../db/db';
import { setMeta } from '../db/repo';
import type { Remote, RemoteRow } from './remote';
import { getSyncCursor as getCursor, setSyncCursor as setCursor, type Cursor } from '../db/sync';
import { classify, SyncError } from './errors';

export const PUSH_BATCH = 500;
export const PULL_BATCH = 1000;
const TS_FIELDS = ['created_at', 'updated_at', 'deleted_at', 'closed_at', 'completed_at'];
/** Local row → server row (drops the local-only flag). */
export function toRemote(row: Record<string, unknown>): Record<string, unknown> {
  const { dirty: _d, ...rest } = row;
  return rest;
}

/** Server row → local row: drops server-only columns, normalizes timestamps to ISO-8601 (ms, Z). */
export function toLocal(r: RemoteRow): Record<string, unknown> {
  const { user_id: _u, server_modified_at: _s, ...rest } = r;
  for (const f of TS_FIELDS) {
    const v = rest[f];
    if (typeof v === 'string' && v) {
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) rest[f] = d.toISOString();
    }
  }
  return rest;
}

export async function pushTable(remote: Remote, table: SyncedTable, batch = PUSH_BATCH): Promise<number> {
  const dirty = (await (db[table] as any).where('dirty').equals(1).toArray()) as Record<string, unknown>[];
  let pushed = 0;
  for (let i = 0; i < dirty.length; i += batch) {
    const chunk = dirty.slice(i, i + batch);
    await remote.upsert(table, chunk.map(toRemote)); // throws → this chunk and later ones stay dirty
    await db.transaction('rw', db[table], async () => {
      for (const r of chunk) {
        const cur = (await (db[table] as any).get(r.id)) as Record<string, unknown> | undefined;
        // only clear if nobody edited the row while it was uploading
        if (cur && cur.dirty === 1 && cur.updated_at === r.updated_at) await (db[table] as any).update(r.id, { dirty: 0 });
      }
    });
    pushed += chunk.length;
  }
  return pushed;
}

export async function pullTable(remote: Remote, table: SyncedTable, batch = PULL_BATCH): Promise<number> {
  let cursor: Cursor | null = await getCursor(table);
  let applied = 0;
  for (;;) {
    const rows = await remote.pullAfter(table, cursor, batch);
    if (!rows.length) break;
    await db.transaction('rw', db[table], db.meta, async () => {
      for (const r of rows) {
        const incoming = toLocal(r);
        const local = (await (db[table] as any).get(r.id)) as Record<string, unknown> | undefined;
        const newer = !local || String(incoming.updated_at) > String(local.updated_at);
        if (!local || local.dirty !== 1 || newer) {
          await (db[table] as any).put({ ...incoming, dirty: 0 });
          applied++;
        }
      }
      const last = rows[rows.length - 1];
      cursor = { ts: last.server_modified_at, id: last.id };
      await setCursor(table, cursor);
    });
    if (rows.length < batch) break;
  }
  return applied;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  error: SyncError | null;
}

/**
 * Push every table, then pull every table. Stops at the first error (offline, auth, paused,
 * server); nothing is lost. A schema error (the server lacks a column the app sends) only
 * skips pushing that table: its rows stay dirty for the next sync, every other table still
 * pushes and pulls, and the schema error is reported at the end.
 */
export async function syncAll(remote: Remote): Promise<SyncResult> {
  let pushed = 0;
  let pulled = 0;
  let schemaError: SyncError | null = null;
  try {
    for (const t of SYNCED_TABLES) {
      try {
        pushed += await pushTable(remote, t);
      } catch (e) {
        const err = classify(e);
        if (err.kind !== 'schema') throw err;
        schemaError ??= err;
      }
    }
    for (const t of SYNCED_TABLES) pulled += await pullTable(remote, t);
    if (!schemaError) await setMeta('sync:lastSyncedAt', new Date().toISOString());
    return { pushed, pulled, error: schemaError };
  } catch (e) {
    return { pushed, pulled, error: classify(e) };
  }
}

export async function pendingCount(): Promise<number> {
  let n = 0;
  for (const t of SYNCED_TABLES) n += await (db[t] as any).where('dirty').equals(1).count();
  return n;
}
