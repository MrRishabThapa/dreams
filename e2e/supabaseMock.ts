import type { Page, Route } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** A mocked Supabase for E2E: auth with a fake session, REST upserts recorded, nothing reaches the network. */
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const ORIGIN = new URL(env.VITE_SUPABASE_URL).origin;

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const EMAIL = 'tester@example.com';
/** the only password the mock accepts (not a real one) */
export const MOCK_PASSWORD = 'correct horse';
const USER = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: EMAIL, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-11-25T00:00:00Z' };
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: USER.id, email: EMAIL, role: 'authenticated', aud: 'authenticated', exp, iat: exp - 3600 })}.c2ln`;
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'fake-refresh', user: USER };
}

export interface Mock {
  upserts: { table: string; rows: Record<string, unknown>[]; auth: string | null }[];
  unexpected: string[];
  failNextUpsert: number | null;
}

export async function mockSupabase(page: Page): Promise<Mock> {
  const m: Mock = { upserts: [], unexpected: [], failNextUpsert: null };
  await page.route(`${ORIGIN}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      const body = req.postDataJSON() as { email: string; password: string };
      if (body.password !== MOCK_PASSWORD) return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      return json(200, session());
    }
    if (url.pathname === '/auth/v1/user') return json(200, USER);
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    const rest = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (rest && req.method() === 'POST') {
      if (m.failNextUpsert) {
        m.failNextUpsert = null;
        return json(503, { message: 'Service unavailable' });
      }
      m.upserts.push({ table: rest[1], rows: req.postDataJSON(), auth: req.headers()['authorization'] ?? null });
      return route.fulfill({ status: 201, body: '' });
    }
    if (rest && req.method() === 'GET') return json(200, []);
    m.unexpected.push(`${req.method()} ${url.pathname}`);
    return route.abort();
  });
  return m;
}

export const pushedTx = (m: Mock) => m.upserts.filter((u) => u.table === 'transactions').flatMap((u) => u.rows);

