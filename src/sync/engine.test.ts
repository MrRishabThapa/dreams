import { beforeEach, describe, expect, it } from 'vitest';
import { db, SYNCED_TABLES, type SyncedTable } from '../db/db';
import { createAccount, ensureSettings, patch, saveTransaction, seedCategories, softDelete } from '../db/repo';
import { pendingCount, pullTable, pushTable, syncAll, toLocal, PUSH_BATCH } from './engine';
import { classify, SyncError } from './errors';
import { supabaseRemote, type Remote, type RemoteRow, type Cursor } from './remote';
import type { Transaction } from '../domain/types';

/* ---------- a fake Supabase that behaves like schema.sql ---------- */

/** Postgres-style timestamptz text: microseconds and +00:00. */
const pgTs = (iso: string) => iso.replace('Z', '000+00:00');

class FakeServer implements Remote {
  tables = new Map<SyncedTable, Map<string, RemoteRow>>();
  private tick = 0;
  upserts = 0;
  /** throw on the n-th upsert call (1-based) */
  failOnUpsert: number | null = null;
  /** runs before an upsert resolves (to simulate a local edit during upload) */
  beforeResolve: (() => Promise<void>) | null = null;

  private now() {
    // one timestamp per statement, like now() in a transaction
    return pgTs(new Date(Date.UTC(2026, 10, 25, 10, 0, 0) + ++this.tick).toISOString());
  }
  t(table: SyncedTable) {
    if (!this.tables.has(table)) this.tables.set(table, new Map());
    return this.tables.get(table)!;
  }
  async upsert(table: SyncedTable, rows: Record<string, unknown>[]) {
    this.upserts++;
    if (this.failOnUpsert === this.upserts) throw new SyncError('server', 'boom');
    const ts = this.now();
    for (const r of rows) {
      const cur = this.t(table).get(r.id as string);
      // touch_row(): an UPDATE with an older updated_at is ignored (returns OLD)
      if (cur && Date.parse(String(r.updated_at)) < Date.parse(String(cur.updated_at))) continue;
      this.t(table).set(r.id as string, {
        ...(r as RemoteRow),
        user_id: 'user-1',
        updated_at: pgTs(String(r.updated_at)),
        created_at: pgTs(String(r.created_at)),
        deleted_at: r.deleted_at ? pgTs(String(r.deleted_at)) : null,
        server_modified_at: ts,
      });
    }
    if (this.beforeResolve) await this.beforeResolve();
  }
  async pullAfter(table: SyncedTable, cursor: Cursor | null, limit: number) {
    return [...this.t(table).values()]
      .sort((a, b) => (a.server_modified_at === b.server_modified_at ? a.id.localeCompare(b.id) : a.server_modified_at.localeCompare(b.server_modified_at)))
      .filter((r) => !cursor || r.server_modified_at > cursor.ts || (r.server_modified_at === cursor.ts && r.id > cursor.id))
      .slice(0, limit);
  }
}

/* ---------- two "devices" by swapping the local database ---------- */

type Snapshot = Record<string, unknown[]>;
const devices = new Map<string, Snapshot>();
let current = 'A';

async function snapshot(): Promise<Snapshot> {
  const s: Snapshot = {};
  for (const t of [...SYNCED_TABLES, 'meta'] as const) s[t] = await (db[t] as any).toArray();
  return s;
}
async function load(s: Snapshot | undefined) {
  for (const t of [...SYNCED_TABLES, 'meta'] as const) {
    await (db[t] as any).clear();
    if (s?.[t]) await (db[t] as any).bulkPut(s[t]);
  }
}
async function useDevice(name: string) {
  devices.set(current, await snapshot());
  current = name;
  await load(devices.get(name));
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let server: FakeServer;
beforeEach(async () => {
  server = new FakeServer();
  devices.clear();
  current = 'A';
  await load(undefined);
});

async function setupA() {
  await ensureSettings();
  await seedCategories();
  const cash = await createAccount({ name: 'Cash', kind: 'cash', opening_minor: 100_000 });
  const tx = await saveTransaction({ type: 'expense', amount_minor: 2_500, account_id: cash.id, occurred_on: '2026-11-20', category_name: 'Food' });
  return { cash, tx };
}

describe('sync engine (mocked Supabase)', () => {
  it('device A pushes everything; a new device B pulls an identical copy with normalized timestamps', async () => {
    const { tx } = await setupA();
    expect(await pendingCount()).toBeGreaterThan(10);
    const r = await syncAll(server);
    expect(r.error).toBeNull();
    expect(await pendingCount()).toBe(0);

    await useDevice('B');
    expect(await db.transactions.count()).toBe(0);
    const rb = await syncAll(server);
    expect(rb.error).toBeNull();
    const got = (await db.transactions.get(tx.id))!;
    expect(got.amount_minor).toBe(2_500);
    expect(got.updated_at).toBe(tx.updated_at); // '…Z', not '…+00:00'
    expect(got.dirty).toBe(0);
    expect('user_id' in got).toBe(false);
    expect('server_modified_at' in got).toBe(false);
    expect(await db.categories.count()).toBe(15);
  });

  it('a stale offline edit never overwrites a newer one', async () => {
    const { tx } = await setupA();
    await syncAll(server);
    await useDevice('B');
    await syncAll(server);

    // A edits first while offline (older)…
    await useDevice('A');
    await patch('transactions', tx.id, { note: 'A, offline (older)' });
    await sleep(5);
    // …B edits later and syncs (newer)
    await useDevice('B');
    await patch('transactions', tx.id, { note: 'B, newer' });
    await syncAll(server);

    // A comes back online: its push is ignored by the server, and the pull brings B's edit
    await useDevice('A');
    expect((await db.transactions.get(tx.id))!.note).toBe('A, offline (older)');
    const r = await syncAll(server);
    expect(r.error).toBeNull();
    expect((await db.transactions.get(tx.id))!.note).toBe('B, newer');
    expect(server.t('transactions').get(tx.id)!.note).toBe('B, newer');
    expect(await pendingCount()).toBe(0);
  });

  it('a local edit newer than the server copy survives a pull and is pushed next', async () => {
    const { tx } = await setupA();
    await syncAll(server);
    await useDevice('B');
    await syncAll(server);
    await patch('transactions', tx.id, { note: 'B older' });
    await pushTable(server, 'transactions');
    await useDevice('A');
    await sleep(5);
    await patch('transactions', tx.id, { note: 'A newest' });
    await pullTable(server, 'transactions'); // remote is older → keep local, still dirty
    expect((await db.transactions.get(tx.id))!).toMatchObject({ note: 'A newest', dirty: 1 });
    await syncAll(server);
    expect(server.t('transactions').get(tx.id)!.note).toBe('A newest');
  });

  it('no data is lost when a batch fails midway; the next sync finishes the job', async () => {
    const { cash } = await setupA();
    await syncAll(server);
    const rows: Transaction[] = [];
    for (let i = 0; i < 1200; i++) rows.push(await saveTransaction({ type: 'expense', amount_minor: i + 1, account_id: cash.id, occurred_on: '2026-11-21' }));
    server.failOnUpsert = server.upserts + 2; // second batch of transactions fails
    const r = await syncAll(server);
    expect(r.error?.kind).toBe('server');
    expect(server.t('transactions').size).toBe(1 + PUSH_BATCH); // first batch landed
    expect(await db.transactions.where('dirty').equals(1).count()).toBe(1200 - PUSH_BATCH); // the rest still dirty
    server.failOnUpsert = null;
    const r2 = await syncAll(server);
    expect(r2.error).toBeNull();
    expect(server.t('transactions').size).toBe(1201);
    expect(await pendingCount()).toBe(0);
    for (const t of rows) expect(server.t('transactions').get(t.id)!.amount_minor).toBe(t.amount_minor);
  });

  it('a row edited while its batch was uploading stays dirty and is sent again', async () => {
    const { tx } = await setupA();
    let edited = false;
    server.beforeResolve = async () => {
      if (edited) return;
      edited = true;
      await sleep(2);
      await patch('transactions', tx.id, { note: 'edited during upload' });
    };
    await pushTable(server, 'transactions');
    expect((await db.transactions.get(tx.id))!.dirty).toBe(1);
    server.beforeResolve = null;
    await pushTable(server, 'transactions');
    expect(server.t('transactions').get(tx.id)!.note).toBe('edited during upload');
    expect((await db.transactions.get(tx.id))!.dirty).toBe(0);
  });

  it('soft deletes round-trip like edits', async () => {
    const { tx } = await setupA();
    await syncAll(server);
    await useDevice('B');
    await syncAll(server);
    await softDelete('transactions', [tx.id]);
    await syncAll(server);
    await useDevice('A');
    await syncAll(server);
    const a = (await db.transactions.get(tx.id))!;
    expect(a.deleted_at).toBeTruthy();
    expect(a.dirty).toBe(0);
  });

  it('pulls every row even when 1,500 rows share one server timestamp across page boundaries', async () => {
    const { cash } = await setupA();
    for (let i = 0; i < 1499; i++) await saveTransaction({ type: 'income', amount_minor: 1, account_id: cash.id, occurred_on: '2026-11-22' });
    await pushTable(server, 'transactions', 5000); // one statement → one timestamp
    await useDevice('B');
    const n = await pullTable(server, 'transactions', 1000);
    expect(n).toBe(1500);
    expect(await db.transactions.count()).toBe(1500);
    expect(await pullTable(server, 'transactions', 1000)).toBe(0); // cursor at the end
  });

  it('toLocal normalizes every timestamp column', () => {
    const r = toLocal({ id: 'x', updated_at: '2026-11-25T10:00:00.123456+00:00', created_at: '2026-11-25T10:00:00+00:00', deleted_at: null, closed_at: '2026-11-25T15:45:00+05:45', server_modified_at: 'x', user_id: 'u' });
    expect(r).toEqual({ id: 'x', updated_at: '2026-11-25T10:00:00.123Z', created_at: '2026-11-25T10:00:00.000Z', deleted_at: null, closed_at: '2026-11-25T10:00:00.000Z' });
  });
});

describe('sync errors are human-readable', () => {
  it('classifies offline, paused, expired sign-in and server errors', () => {
    expect(classify(new TypeError('Load failed')).kind).toBe('offline');
    expect(classify({ message: 'Project paused' }).kind).toBe('paused');
    expect(classify({ message: 'x' }, 540).message).toMatch(/paused/);
    expect(classify({ message: 'JWT expired', code: 'PGRST301' }, 401).kind).toBe('auth');
    const s = classify({ message: 'duplicate key value' }, 409);
    expect(s.kind).toBe('server');
    expect(s.message).toMatch(/safe on this iPhone/);
  });
});

describe('supabase-js adapter', () => {
  it('upserts on id and pulls with a quoted keyset cursor', async () => {
    const calls: unknown[][] = [];
    const builder: any = {
      upsert: (...a: unknown[]) => (calls.push(['upsert', ...a]), Promise.resolve({ error: null, status: 201 })),
      select: (...a: unknown[]) => (calls.push(['select', ...a]), builder),
      order: (...a: unknown[]) => (calls.push(['order', ...a]), builder),
      limit: (...a: unknown[]) => (calls.push(['limit', ...a]), builder),
      or: (...a: unknown[]) => (calls.push(['or', ...a]), builder),
      then: (res: (v: unknown) => void) => res({ data: [{ id: 'b' }], error: null, status: 200 }),
    };
    const remote = supabaseRemote({ from: (t: string) => (calls.push(['from', t]), builder) } as never);
    await remote.upsert('accounts', [{ id: 'a' }]);
    expect(calls).toContainEqual(['upsert', [{ id: 'a' }], { onConflict: 'id' }]);
    const rows = await remote.pullAfter('accounts', { ts: '2026-11-25T10:00:00.123456+00:00', id: 'a1' }, 1000);
    expect(rows).toEqual([{ id: 'b' }]);
    expect(calls).toContainEqual(['or', 'server_modified_at.gt."2026-11-25T10:00:00.123456+00:00",and(server_modified_at.eq."2026-11-25T10:00:00.123456+00:00",id.gt.a1)']);
    expect(calls).toContainEqual(['limit', 1000]);
  });

  it('turns a failed response into a SyncError', async () => {
    const builder: any = { upsert: () => Promise.resolve({ error: { message: 'Project paused' }, status: 540 }) };
    const remote = supabaseRemote({ from: () => builder } as never);
    await expect(remote.upsert('accounts', [])).rejects.toMatchObject({ kind: 'paused' });
  });
});
