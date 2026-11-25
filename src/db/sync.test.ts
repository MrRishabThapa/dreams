import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, SYNCED_TABLES } from './db';
import { ensureSyncSlots, getSyncCursor, pendingChanges, setSyncCursor } from './sync';
import { addDreamMoney, createAccount, createDebt, createDream, ensureSettings, saveTransaction, seedCategories, softDelete } from './repo';
import { restoreBackup, buildBackup } from './backup';
import { demoYear } from '../../scripts/demo-year.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sql = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');

/** Column names per table, parsed from supabase/schema.sql. */
function schemaColumns(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of sql.matchAll(/create table public\.(\w+) \(([\s\S]*?)\n\);/g)) {
    out[m[1]] = m[2]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('unique'))
      .flatMap((l) => l.replace(/,$/, '').split(/,\s*(?=[a-z_]+ (?:text|uuid))/))
      .map((l) => l.split(/\s+/)[0]);
  }
  return out;
}

beforeEach(async () => {
  await Promise.all([...SYNCED_TABLES.map((t) => (db[t] as any).clear()), db.meta.clear()]);
});

describe('sync readiness (no network)', () => {
  it('schema.sql has a table for every synced table, with RLS, the touch trigger and soft delete', () => {
    const cols = schemaColumns();
    expect(Object.keys(cols).sort()).toEqual([...SYNCED_TABLES].sort());
    for (const t of SYNCED_TABLES) {
      for (const c of ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'server_modified_at']) expect(cols[t], `${t}.${c}`).toContain(c);
    }
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('new.updated_at < old.updated_at');
    expect(sql).not.toMatch(/service_role/);
  });

  it('every field the app stores has a column in schema.sql (except the local dirty flag)', async () => {
    await restoreBackup(demoYear('2026-11-25').backup);
    const cols = schemaColumns();
    const b = await buildBackup();
    for (const t of SYNCED_TABLES) {
      for (const row of b.tables[t]) for (const k of Object.keys(row)) expect(cols[t], `${t}.${k} missing in schema.sql`).toContain(k);
    }
  });

  it('every write stamps a uuid, timestamps and the dirty flag; soft delete syncs like an edit', async () => {
    await ensureSettings();
    await seedCategories();
    const a = await createAccount({ name: 'Cash', kind: 'cash', opening_minor: 100 });
    const t = await saveTransaction({ type: 'expense', amount_minor: 50, account_id: a.id, occurred_on: '2026-11-01' });
    await createDebt({ person: 'X', direction: 'owe', amount_minor: 10, opened_on: '2026-11-01', cashAccountId: a.id });
    const d = await createDream({ title: 'D', icon: 'star', color: 'sky', target_minor: 100 });
    await addDreamMoney(d, { amount_minor: 10, mode: 'add', entered_on: '2026-11-01' });
    for (const tb of SYNCED_TABLES) {
      for (const r of (await (db[tb] as any).toArray()) as Record<string, unknown>[]) {
        expect(r.id, tb).toMatch(UUID);
        expect(typeof r.created_at).toBe('string');
        expect(typeof r.updated_at).toBe('string');
        expect(r.deleted_at).toBeNull();
        expect(r.dirty).toBe(1);
      }
    }
    await db.transactions.update(t.id, { dirty: 0 });
    const before = (await db.transactions.get(t.id))!.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    await softDelete('transactions', [t.id]);
    const after = (await db.transactions.get(t.id))!;
    expect(after.deleted_at).toBeTruthy();
    expect(after.dirty).toBe(1);
    expect(after.updated_at > before).toBe(true);
    expect((await pendingChanges()).transactions).toBeGreaterThan(0);
  });

  it('keeps a cursor slot per table in local meta', async () => {
    await ensureSyncSlots();
    for (const t of SYNCED_TABLES) expect(await getSyncCursor(t)).toBeNull();
    await setSyncCursor('transactions', { ts: '2026-11-25T10:00:00.123456+00:00', id: 'abc' });
    await ensureSyncSlots(); // idempotent
    expect(await getSyncCursor('transactions')).toEqual({ ts: '2026-11-25T10:00:00.123456+00:00', id: 'abc' });
  });
});
