import { expect, test, type Page } from '@playwright/test';
import { onboard, typeAmount } from './helpers';
import { EMAIL, MOCK_PASSWORD, mockSupabase } from './supabaseMock';

/** Sync screens against the mocked Supabase. SHOTS=1 to run. */
test.skip(!process.env.SHOTS, 'set SHOTS=1 to capture screenshots');
test.use({ serviceWorkers: 'block' });

async function shot(page: Page, scheme: string, name: string) {
  const dialogs = page.getByRole('dialog');
  const n = await dialogs.count();
  if (n) await expect(dialogs.nth(n - 1).getByRole('button').first()).toBeInViewport({ ratio: 1, timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(n ? 700 : 500);
  await page.screenshot({ path: `screenshots/${scheme}/${name}.png` });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`sync screens (${scheme})`, async ({ page, context }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    await mockSupabase(page);
    await onboard(page, { name: 'Cash', balance: '25000' });
    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('button', { name: /^Sync/ }).click();
    const sync = page.getByRole('dialog', { name: 'Sync' });
    await sync.getByLabel('Email').fill(EMAIL);
    await sync.getByLabel('Password').fill(MOCK_PASSWORD);
    await shot(page, scheme, '50-sync-sign-in');
    await sync.getByRole('button', { name: 'Sign In' }).click();
    await expect(sync.getByTestId('sync-email')).toHaveText(EMAIL);
    await expect(sync.getByTestId('sync-pending')).toHaveText('0');
    await shot(page, scheme, '51-sync-signed-in');
    await sync.getByRole('button', { name: 'Done' }).click();
    await settings.getByRole('button', { name: /^Sync/ }).scrollIntoViewIfNeeded();
    await shot(page, scheme, '52-settings-sync-row');
    await settings.getByRole('button', { name: 'Done' }).click();

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    await typeAmount(page, '480');
    await page.getByRole('radio', { name: 'Food' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).last().click();
    await expect(page.locator('main').getByTestId('sync-chip')).toHaveText('Offline · 1 pending');
    await shot(page, scheme, '53-home-offline-pending');
    await context.setOffline(false);
    await expect(page.getByRole('status', { name: 'Sync changes' })).toBeVisible();
    await shot(page, scheme, '54-sync-banner');
    await page.getByRole('status', { name: 'Sync changes' }).getByRole('button', { name: 'Sync' }).click();
    await expect(page.locator('main').getByTestId('sync-chip')).toHaveText('Synced');
    await shot(page, scheme, '55-home-synced');
  });
}
