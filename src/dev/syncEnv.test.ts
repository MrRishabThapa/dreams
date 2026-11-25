import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkSyncEnv, resolveSyncEnv } from '../../scripts/sync-env.mjs';

const URL_ = 'https://example-project.supabase.co';
const KEY = 'sb_publishable_TESTONLY_not_a_real_key_0123456789';

describe('sync build settings', () => {
  it('resolves the origin only when both values are present', () => {
    expect(resolveSyncEnv({ VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: KEY })).toEqual({ url: URL_, origin: URL_, configured: true });
    expect(resolveSyncEnv({ VITE_SUPABASE_URL: URL_ }).configured).toBe(false);
    expect(resolveSyncEnv({}).origin).toBe('');
    expect(resolveSyncEnv({ VITE_SUPABASE_URL: 'not a url', VITE_SUPABASE_ANON_KEY: KEY }).configured).toBe(false);
  });

  it('logs one line without the key; fails a Cloudflare build that has no sync settings', () => {
    const lines: string[] = [];
    checkSyncEnv(resolveSyncEnv({ VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: KEY }), { CF_PAGES: '1' }, (l) => lines.push(l));
    expect(lines).toEqual([`[dreams] sync configured: yes (${URL_})`]);
    expect(lines.join()).not.toContain(KEY);
    expect(() => checkSyncEnv(resolveSyncEnv({}), { CF_PAGES: '1' }, () => {})).toThrow(/missing from this Cloudflare Pages build/);
    expect(() => checkSyncEnv(resolveSyncEnv({}), { CF_PAGES: '1', DREAMS_ALLOW_NO_SYNC: '1' }, () => {})).not.toThrow();
    expect(() => checkSyncEnv(resolveSyncEnv({}), {}, () => {})).not.toThrow(); // local builds may skip sync
  });
});

/** A real `vite build` with the values ONLY in process.env (like Cloudflare Pages) and no .env files. */
describe('hosted build reads VITE_* from the process environment', () => {
  const run = (extraEnv: Record<string, string>) => {
    const out = mkdtempSync(join(tmpdir(), 'dreams-build-'));
    const emptyEnvDir = mkdtempSync(join(tmpdir(), 'dreams-env-'));
    const env: Record<string, string> = { ...(process.env as Record<string, string>), DREAMS_ENV_DIR: emptyEnvDir, CF_PAGES: '1', ...extraEnv };
    delete env.VITE_SUPABASE_URL;
    delete env.VITE_SUPABASE_ANON_KEY;
    Object.assign(env, extraEnv);
    const r = spawnSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'warn'], { env, encoding: 'utf8', timeout: 180_000 });
    return { out, code: r.status, log: `${r.stdout}\n${r.stderr}` };
  };

  it('puts the project origin in both CSPs and the URL in the bundle', () => {
    const { out, code, log } = run({ VITE_SUPABASE_URL: URL_, VITE_SUPABASE_ANON_KEY: KEY });
    expect(code, log).toBe(0);
    expect(log).toContain(`[dreams] sync configured: yes (${URL_})`);
    expect(log).not.toContain(KEY);
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toContain(`connect-src 'self' ${URL_};`);
    expect(readFileSync(join(out, '_headers'), 'utf8')).toContain(`connect-src 'self' ${URL_};`);
    const js = readdirSync(join(out, 'assets')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(out, 'assets', f), 'utf8'));
    expect(js.some((c) => c.includes(URL_))).toBe(true);
  }, 200_000);

  it('fails loudly on Cloudflare when the values are missing, without printing secrets', () => {
    const { code, log } = run({});
    expect(code).not.toBe(0);
    expect(log).toContain('[dreams] sync configured: no');
    expect(log).toContain('missing from this Cloudflare Pages build');
  }, 200_000);
});
