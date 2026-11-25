/** Supabase project settings come from VITE_ env vars at build time (never hardcoded). */
export const SUPABASE_URL: string = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
export const SUPABASE_KEY: string = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
export const syncConfigured = (): boolean => /^https:\/\//.test(SUPABASE_URL) && SUPABASE_KEY.length > 20;
/** localStorage key where supabase-js keeps the session; its presence means "probably signed in". */
export const AUTH_STORAGE_KEY = 'dreams-auth';
