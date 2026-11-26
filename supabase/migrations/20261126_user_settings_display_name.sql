-- v1.2.2: the name used in the Home greeting (Settings → Profile).
-- Run once in the Supabase SQL editor before setting a name on a synced device.
alter table public.user_settings add column if not exists display_name text;
