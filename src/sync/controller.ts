/**
 * Sync controller: session, triggers and status. supabase-js is imported lazily, only when
 * someone is (or is signing) in, so the first load stays small and a never-synced app
 * never touches the network.
 *
 * Triggers (§7): on app open when online, on the `online` event, and ~3 s after local
 * writes when auto-sync is on. With auto-sync off, the UI shows "You're online. Sync N changes?".
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { onWrite } from '../db/events';
import { getMeta, getSettings } from '../db/repo';
import { resetSyncCursors } from '../db/sync';
import { AUTH_STORAGE_KEY, SUPABASE_KEY, SUPABASE_URL, syncConfigured } from './config';
import { classify, signInMessage, type SyncError } from './errors';
import { pendingCount, syncAll } from './engine';
import { supabaseRemote } from './remote';

export interface SyncState {
  configured: boolean;
  /** null while we don't know yet */
  signedIn: boolean | null;
  email: string | null;
  syncing: boolean;
  lastSyncedAt: string | null;
  error: SyncError | null;
  online: boolean;
  /** the "Sync N changes?" banner was dismissed with Later (until the next online event or open) */
  dismissed: boolean;
}

let state: SyncState = {
  configured: syncConfigured(),
  signedIn: null,
  email: null,
  syncing: false,
  lastSyncedAt: null,
  error: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  dismissed: false,
};
const subs = new Set<() => void>();
const set = (p: Partial<SyncState>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
export const getSyncState = () => state;
export const subscribeSync = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

/* ---------- client ---------- */

let clientP: Promise<SupabaseClient> | null = null;
function client(): Promise<SupabaseClient> {
  if (!clientP) {
    clientP = import('@supabase/supabase-js').then(({ createClient }) => {
      const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { storageKey: AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
      sb.auth.onAuthStateChange((_e, session) => set({ signedIn: !!session, email: session?.user?.email ?? null }));
      return sb;
    });
  }
  return clientP;
}

const hasStoredSession = () => {
  try {
    return !!localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return false;
  }
};

async function autoSyncOn(): Promise<boolean> {
  return !!(await getSettings())?.auto_sync;
}

/* ---------- sync ---------- */

let running: Promise<void> | null = null;

/** Runs one sync (push then pull). Never throws; errors land in state.error. */
export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    if (!state.configured || !state.signedIn) return;
    if (!navigator.onLine) {
      set({ online: false });
      return;
    }
    set({ syncing: true, error: null });
    try {
      const sb = await client();
      const r = await syncAll(supabaseRemote(sb));
      set({ error: r.error, lastSyncedAt: r.error ? state.lastSyncedAt : new Date().toISOString() });
      if (r.error?.kind === 'offline') set({ online: false });
    } catch (e) {
      set({ error: classify(e) });
    } finally {
      set({ syncing: false });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

let debounce: ReturnType<typeof setTimeout> | undefined;
function scheduleAfterWrite() {
  clearTimeout(debounce);
  debounce = setTimeout(async () => {
    if (state.signedIn && navigator.onLine && (await autoSyncOn())) void syncNow();
  }, 3000);
}

/* ---------- lifecycle ---------- */

let started = false;
export async function initSync(): Promise<void> {
  if (started || !state.configured) return;
  started = true;
  set({ lastSyncedAt: await getMeta<string | null>('sync:lastSyncedAt', null) });

  window.addEventListener('online', async () => {
    set({ online: true, dismissed: false, error: state.error?.kind === 'offline' ? null : state.error });
    if (state.signedIn && (await autoSyncOn())) void syncNow();
  });
  window.addEventListener('offline', () => set({ online: false }));
  onWrite(scheduleAfterWrite);

  if (!hasStoredSession()) {
    set({ signedIn: false });
    return;
  }
  try {
    const sb = await client();
    const { data } = await sb.auth.getSession();
    set({ signedIn: !!data.session, email: data.session?.user?.email ?? null });
    if (data.session && navigator.onLine && (await autoSyncOn())) void syncNow();
  } catch {
    set({ signedIn: false });
  }
}

/** Email + password only (no sign-up, no magic links). Syncs right after signing in. */
export async function signIn(email: string, password: string): Promise<string | null> {
  if (!navigator.onLine) return 'You’re offline. Connect to the internet to sign in.';
  try {
    const sb = await client();
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session) return signInMessage(error ?? { message: 'Sign-in failed' });
    set({ signedIn: true, email: data.session.user.email ?? email.trim(), error: null, dismissed: false });
    await syncNow();
    return null;
  } catch (e) {
    return signInMessage(e);
  }
}

/** Signs out on this device only. Local data is never deleted. */
export async function signOut(): Promise<void> {
  try {
    const sb = await client();
    await sb.auth.signOut({ scope: 'local' });
  } catch {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  await resetSyncCursors(); // a later sign-in does a full pull
  set({ signedIn: false, email: null, error: null, syncing: false });
}

export function dismissSyncBanner() {
  set({ dismissed: true });
}

export { pendingCount };
