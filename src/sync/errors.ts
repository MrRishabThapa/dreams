export type SyncErrorKind = 'offline' | 'auth' | 'paused' | 'schema' | 'server';

export class SyncError extends Error {
  constructor(public kind: SyncErrorKind, message: string) {
    super(message);
  }
}

const MESSAGES: Record<SyncErrorKind, string> = {
  offline: 'You’re offline. Changes are saved on this iPhone and will sync later.',
  auth: 'Your sign-in has expired. Sign in again to keep syncing.',
  paused:
    'Your Supabase project is paused (free projects pause after about a week without use). Open supabase.com, restore the “dreams” project, then sync again.',
  schema:
    'Server needs an update: run the schema SQL in Supabase (see DEPLOY.md → Schema changes). Your changes are kept on this iPhone and will sync after that.',
  server: 'Sync didn’t finish. Your data is safe on this iPhone; try again in a moment.',
};

/** Turns anything thrown by fetch / supabase-js into a plain, human-readable SyncError. */
export function classify(e: unknown, status?: number): SyncError {
  if (e instanceof SyncError) return e;
  const err = (e ?? {}) as { message?: string; code?: string; status?: number; name?: string };
  const msg = `${err.message ?? ''}`.toLowerCase();
  const st = status ?? err.status;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new SyncError('offline', MESSAGES.offline);
  if (err.name === 'TypeError' || /failed to fetch|load failed|network ?error|networkerror|fetch failed/.test(msg)) return new SyncError('offline', MESSAGES.offline);
  if (st === 540 || /paus(ed|ing)/.test(msg)) return new SyncError('paused', MESSAGES.paused);
  if (st === 401 || st === 403 || err.code === 'PGRST301' || err.code === 'PGRST303' || /jwt|not authenticated|refresh token|session/.test(msg))
    return new SyncError('auth', MESSAGES.auth);
  // PostgREST: unknown column in the schema cache (PGRST204) or Postgres undefined column/table
  if (err.code === 'PGRST204' || err.code === '42703' || err.code === '42P01' || err.code === 'PGRST205' || /schema cache|column .* does not exist|could not find the .* column/.test(msg)) {
    const col = /'([a-z_]+)' column of '([a-z_]+)'/i.exec(err.message ?? '');
    return new SyncError('schema', col ? MESSAGES.schema.replace('update:', `update (${col[2]}.${col[1]} is missing):`) : MESSAGES.schema);
  }
  const detail = err.message ? ` (${err.message})` : '';
  return new SyncError('server', MESSAGES.server.replace('.', `${detail}.`));
}

export function signInMessage(e: unknown): string {
  const msg = `${(e as { message?: string })?.message ?? ''}`.toLowerCase();
  if (/invalid login|invalid credentials|invalid grant/.test(msg)) return 'That email and password don’t match.';
  if (/email not confirmed/.test(msg)) return 'This email isn’t confirmed in Supabase yet.';
  const c = classify(e);
  return c.message;
}
