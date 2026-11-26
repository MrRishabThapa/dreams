import type { SyncedTable } from '../db/db';

/**
 * Columns added after the first release. The server must have them before a client that
 * writes them is used (see supabase/schema.sql "Schema changes" and DEPLOY.md). Sync checks
 * them once per app start so a missing one shows as a clear status, not a generic failure.
 */
export const NEWER_COLUMNS: { table: SyncedTable; column: string; since: string }[] = [
  { table: 'user_settings', column: 'display_name', since: '1.2.2' },
];

/** The SQL that adds every newer column (idempotent), for messages and docs. */
export function schemaFixSQL(): string {
  return [...NEWER_COLUMNS.map((c) => `alter table public.${c.table} add column if not exists ${c.column} text;`), "notify pgrst, 'reload schema';"].join('\n');
}
