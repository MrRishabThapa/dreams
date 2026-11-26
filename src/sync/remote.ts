import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncedTable } from '../db/db';
import { classify } from './errors';

import type { Cursor } from '../db/sync';
export type { Cursor };

export type RemoteRow = Record<string, unknown> & { id: string; updated_at: string; server_modified_at: string };

/** What the sync engine needs from the server (a supabase-js adapter, or a fake in tests). */
export interface Remote {
  /** Upsert rows on `id`. Throws a SyncError on failure. */
  upsert(table: SyncedTable, rows: Record<string, unknown>[]): Promise<void>;
  /** Up to `limit` rows after the cursor, ordered by (server_modified_at, id). */
  pullAfter(table: SyncedTable, cursor: Cursor | null, limit: number): Promise<RemoteRow[]>;
  /** Which of these columns the server doesn't have (`table.column`). Optional: fakes may skip it. */
  missingColumns?(cols: { table: SyncedTable; column: string }[]): Promise<string[]>;
}

/** PostgREST filter values containing . : + , need double quotes. */
const q = (v: string) => `"${v.replace(/"/g, '\\"')}"`;

export function supabaseRemote(sb: SupabaseClient): Remote {
  return {
    async upsert(table, rows) {
      let res;
      try {
        res = await sb.from(table).upsert(rows, { onConflict: 'id' });
      } catch (e) {
        throw classify(e);
      }
      if (res.error) throw classify(res.error, res.status);
    },
    async pullAfter(table, cursor, limit) {
      let query = sb.from(table).select('*').order('server_modified_at', { ascending: true }).order('id', { ascending: true }).limit(limit);
      if (cursor) query = query.or(`server_modified_at.gt.${q(cursor.ts)},and(server_modified_at.eq.${q(cursor.ts)},id.gt.${cursor.id})`);
      let res;
      try {
        res = await query;
      } catch (e) {
        throw classify(e);
      }
      if (res.error) throw classify(res.error, res.status);
      return (res.data ?? []) as RemoteRow[];
    },
    async missingColumns(cols) {
      const missing: string[] = [];
      for (const c of cols) {
        // selects nothing, but PostgREST still checks the column exists
        let res;
        try {
          res = await sb.from(c.table).select(c.column).limit(0);
        } catch (e) {
          throw classify(e);
        }
        if (res.error) {
          const err = classify(res.error, res.status);
          if (err.kind !== 'schema') throw err;
          missing.push(`${c.table}.${c.column}`);
        }
      }
      return missing;
    },
  };
}
