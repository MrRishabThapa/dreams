-- v1.2.2: the name used in the Home greeting (Settings → Profile).
-- Run once in the Supabase SQL editor before deploying a client that uses it. Idempotent.
alter table public.user_settings add column if not exists display_name text;
notify pgrst, 'reload schema';
