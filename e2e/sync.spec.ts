import { expect, test, type Page } from '@playwright/test';
import { netWorthValue, onboard, typeAmount } from './helpers';
import { EMAIL, MOCK_PASSWORD, mockSupabase, pushedTx } from './supabaseMock';

/**
 * Sync UI against a mocked Supabase (no real network, no real credentials).
 * Service workers are blocked here: page.route can't intercept fetches made by a service
 * worker, and every Supabase request must hit the mock.
 */
test.use({ serviceWorkers: 'block' });

async function openSync(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: /^Sync/ }).click();
  return page.getByRole('dialog', { name: 'Sync' });
}
async function closeSheets(page: Page) {
  await page.getByRole('dialog', { name: 'Sync' }).getByRole('button', { name: 'Done' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Done' }).click();
}
async function addExpense(page: Page, amount: string) {
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await typeAmount(page, amount);
  await page.getByRole('radio', { name: 'Food' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).last().click();
  await expect(page.getByRole('dialog', { name: 'Add transaction' })).toBeHidden();
}

test('sign in, offline changes, back online → "Sync N changes?" banner → Sync / Later, auto-sync, local sign-out', async ({ page, context }) => {
  const m = await mockSupabase(page);
  await onboard(page, { balance: '10000' });
  const chip = page.locator('main').getByTestId('sync-chip');
  await expect(chip).toHaveCount(0); // not signed in: no chip

  // wrong password: plain message, nothing sent
  let sync = await openSync(page);
  await sync.getByLabel('Email').fill(EMAIL);
  await sync.getByLabel('Password').fill('wrong');
  await sync.getByRole('button', { name: 'Sign In' }).click();
  await expect(sync.getByRole('alert')).toHaveText('That email and password don’t match.');
  expect(m.upserts).toHaveLength(0);

  // right password (mocked): signs in and syncs everything made during onboarding
  await sync.getByLabel('Password').fill(MOCK_PASSWORD);
  await sync.getByRole('button', { name: 'Sign In' }).click();
  await expect(sync.getByTestId('sync-email')).toHaveText(EMAIL);
  await expect(sync.getByTestId('sync-pending')).toHaveText('0');
  expect(m.upserts.map((u) => u.table)).toEqual(expect.arrayContaining(['accounts', 'categories', 'user_settings']));
  expect(m.upserts.every((u) => u.auth?.startsWith('Bearer '))).toBe(true);
  for (const u of m.upserts) for (const r of u.rows) expect('dirty' in r).toBe(false);
  await closeSheets(page);
  await expect(chip).toHaveText('Synced');

  // offline: change something → Offline · 1 pending, nothing sent
  await context.setOffline(true);
  await expect(chip).toHaveText('Offline');
  await addExpense(page, '250');
  await expect(chip).toHaveText('Offline · 1 pending');
  expect(pushedTx(m)).toHaveLength(0);

  // back online, auto-sync off → banner asks first → Sync
  await context.setOffline(false);
  const banner = page.getByRole('status', { name: 'Sync changes' });
  await expect(banner).toContainText('You’re online. Sync 1 change?');
  await banner.getByRole('button', { name: 'Sync' }).click();
  await expect(banner).toBeHidden();
  await expect(chip).toHaveText('Synced');
  expect(pushedTx(m)).toHaveLength(1);
  expect(pushedTx(m)[0]).toMatchObject({ type: 'expense', amount_minor: 25000 });

  // a failing sync shows a plain error and keeps the change
  await addExpense(page, '40');
  m.failNextUpsert = 1;
  await banner.getByRole('button', { name: 'Sync' }).click();
  await expect(chip).toHaveText('Sync error');
  sync = await openSync(page);
  await expect(sync.getByTestId('sync-error')).toContainText('Your data is safe on this iPhone');
  await expect(sync.getByTestId('sync-pending')).toHaveText('1');
  await sync.getByRole('button', { name: 'Sync Now' }).click();
  await expect(sync.getByTestId('sync-pending')).toHaveText('0');
  await closeSheets(page);

  // Later dismisses the banner; the change stays pending
  await context.setOffline(true);
  await addExpense(page, '75');
  await context.setOffline(false);
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Later' }).click();
  await expect(banner).toBeHidden();
  await expect(chip).toHaveText('1 pending');

  // auto-sync on: the next change is pushed by itself a few seconds later
  sync = await openSync(page);
  await sync.getByRole('switch', { name: 'Auto-sync' }).click();
  await closeSheets(page);
  const before = pushedTx(m).length;
  await addExpense(page, '120');
  await expect.poll(() => pushedTx(m).length, { timeout: 10_000 }).toBeGreaterThan(before);
  await expect(chip).toHaveText('Synced');
  expect(pushedTx(m).some((r) => r.amount_minor === 12000)).toBe(true);
  expect(pushedTx(m).some((r) => r.amount_minor === 7500)).toBe(true);

  // sign out keeps every bit of local data
  const nw = await netWorthValue(page);
  sync = await openSync(page);
  await sync.getByRole('button', { name: 'Sign Out' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Sign Out' }).click();
  await expect(sync.getByRole('button', { name: 'Sign In' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Sync' }).getByRole('button', { name: 'Done' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Done' }).click();
  await expect(chip).toHaveCount(0);
  expect(await netWorthValue(page)).toBe(nw);

  expect(m.unexpected).toEqual([]);
});
