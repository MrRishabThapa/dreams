// Resolves the Supabase build settings for vite.config.ts. Values come from Vite's loadEnv,
// which merges .env* files with VITE_* variables already in the process environment
// (that's how hosted builds such as Cloudflare Pages pass them).
// Never logs the key itself.

/**
 * @param {Record<string, string | undefined>} env  VITE_* values (from loadEnv)
 * @returns {{ url: string, origin: string, configured: boolean }}
 */
export function resolveSyncEnv(env) {
  const url = (env.VITE_SUPABASE_URL ?? '').trim();
  const key = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  let origin = '';
  try {
    origin = url ? new URL(url).origin : '';
  } catch {
    origin = '';
  }
  const configured = origin.startsWith('https://') && key.length > 20;
  return { url, origin: configured ? origin : '', configured };
}

/**
 * One clear line in the build log. On a hosted build (Cloudflare Pages sets CF_PAGES=1)
 * a build without sync settings fails, unless DREAMS_ALLOW_NO_SYNC=1 says that's intended.
 * @param {{ origin: string, configured: boolean }} sync
 * @param {Record<string, string | undefined>} processEnv
 * @param {(line: string) => void} log
 */
export function checkSyncEnv(sync, processEnv, log = console.log) {
  log(`[dreams] sync configured: ${sync.configured ? `yes (${sync.origin})` : 'no'}`);
  const hosted = processEnv.CF_PAGES === '1';
  if (hosted && !sync.configured && processEnv.DREAMS_ALLOW_NO_SYNC !== '1') {
    throw new Error(
      '[dreams] VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing from this Cloudflare Pages build. ' +
        'Add them under Settings → Variables and Secrets (Production and Preview) as plain build variables, ' +
        'make sure the repo has no wrangler.toml (it would replace the dashboard settings), then redeploy. ' +
        'Set DREAMS_ALLOW_NO_SYNC=1 to build without sync on purpose.',
    );
  }
}
