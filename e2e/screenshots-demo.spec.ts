import { expect, test, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error plain ESM dev script
import { demoYear } from '../scripts/demo-year.mjs';

/** Screens that need a lived-in year of data (restored from the dev demo backup). SHOTS=1 to run. */
test.skip(!process.env.SHOTS, 'set SHOTS=1 to capture screenshots');

const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

async function shot(page: Page, scheme: string, name: string, fullPage = false) {
  const dialogs = page.getByRole('dialog');
  const n = await dialogs.count();
  // wait for the top sheet to finish sliding in (headless WebKit runs springs slowly on first open)
  // (a sheet that is still closing has no buttons, so this is best-effort)
  if (n) await expect(dialogs.nth(n - 1).getByRole('button').first()).toBeInViewport({ ratio: 1, timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(n ? 700 : 500);
  await page.screenshot({ path: `screenshots/${scheme}/${name}.png`, fullPage });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`demo year screens (${scheme})`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: scheme });
    const dir = mkdtempSync(join(tmpdir(), 'dreams-'));
    const file = join(dir, 'demo.json');
    writeFileSync(file, JSON.stringify(demoYear(todayIso).backup));

    await page.goto('/');
    await page.getByRole('button', { name: /Continue in the browser|Get Started/ }).first().waitFor();
    const cont = page.getByRole('button', { name: 'Continue in the browser' });
    if (await cont.isVisible()) await cont.click();
    await page.getByRole('button', { name: 'Get Started' }).waitFor();
    await shot(page, scheme, '20-welcome-restore');
    await page.getByTestId('restore-input').setInputFiles(file);
    await expect(page.getByTestId('net-worth')).toBeVisible();
    await shot(page, scheme, '21-home-demo');

    // audit for last month (ready to close)
    await page.getByRole('button', { name: /audit is ready/ }).click();
    await page.getByRole('region', { name: 'Verdict' }).waitFor();
    await shot(page, scheme, '22-audit-top');
    await shot(page, scheme, '23-audit-full', true);
    await page.getByRole('button', { name: /Food, see transactions/ }).click();
    await page.getByRole('dialog', { name: 'Category transactions' }).waitFor();
    await shot(page, scheme, '24-audit-category');
    await page.getByRole('dialog', { name: 'Category transactions' }).getByRole('button', { name: 'Done' }).click();
    await page.waitForTimeout(500);
    await page.getByLabel('Reflection').fill('Good month. Food delivery crept up again; cook more on weekdays.');
    await page.getByLabel('Reflection').blur();
    await page.getByRole('button', { name: 'Close month' }).click();
    await page.getByRole('region', { name: 'Verdict' }).getByText('Closed').waitFor();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await shot(page, scheme, '25-audit-closed');

    // the month with the corner-shop tab shows the "Other" row in the walk
    await page.evaluate(() => window.scrollTo(0, 0));
    const chips = page.getByRole('tablist', { name: 'Month' }).getByRole('tab');
    await chips.nth((await chips.count()) - 1).click(); // current month
    await page.getByRole('region', { name: 'Verdict' }).waitFor();
    await shot(page, scheme, '26-audit-current');
    await chips.nth((await chips.count()) - 2).click();

    await page.getByRole('tab', { name: 'Dreams' }).click();
    await shot(page, scheme, '27-dreams-demo');
    await page.getByRole('tab', { name: 'Money' }).click();
    await page.getByRole('tab', { name: 'Debts' }).click();
    await shot(page, scheme, '28-debts-demo');

    await page.getByRole('tab', { name: 'Home' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    const s = page.getByRole('dialog', { name: 'Settings' });
    await s.getByRole('button', { name: 'Restore from Backup' }).scrollIntoViewIfNeeded();
    await shot(page, scheme, '29-settings-backup');
  });
}
