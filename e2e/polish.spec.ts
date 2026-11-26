import { expect, test, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { goOffline, onboard, typeAmount } from './helpers';
// @ts-expect-error plain ESM dev script
import { demoYear } from '../scripts/demo-year.mjs';

async function setVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

async function pin(page: Page, digits: string) {
  const pad = page.getByRole('group', { name: 'PIN keypad' }).last();
  for (const d of digits) await pad.getByRole('button', { name: d, exact: true }).click();
}

test('app lock: set PIN, privacy cover in background, lock on return, wrong/right PIN, locked on relaunch, turn off', async ({ page }) => {
  await onboard(page);
  await goOffline(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /^App Lock/ }).click();
  const sheet = page.getByRole('dialog', { name: 'App Lock' });
  await sheet.getByRole('button', { name: 'Turn On App Lock' }).click();
  await pin(page, '135790');
  await expect(sheet.getByText('Enter it again')).toBeVisible();
  await pin(page, '135790');
  await expect(page.getByText('App Lock is on')).toBeVisible();
  await sheet.getByRole('button', { name: 'Immediately' }).click();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Done' }).click();

  // background → cover; back → locked
  await setVisibility(page, 'hidden');
  await expect(page.getByTestId('privacy-cover')).toBeVisible();
  await setVisibility(page, 'visible');
  const lock = page.getByRole('dialog', { name: 'Dreams is locked' });
  await expect(lock).toBeVisible();
  await expect(page.getByTestId('net-worth')).toHaveCount(0); // app not rendered while locked
  await pin(page, '000000');
  await expect(lock.getByText('Wrong PIN. 4 tries left.')).toBeVisible();
  await pin(page, '135790');
  await expect(lock).toBeHidden();
  await expect(page.getByTestId('net-worth')).toBeVisible();

  // relaunch → locked (offline)
  await page.reload();
  await expect(lock).toBeVisible();
  await pin(page, '135790');
  await expect(page.getByTestId('net-worth')).toBeVisible();

  // turning it off needs the PIN
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /^App Lock/ }).click();
  await sheet.getByRole('switch', { name: 'App Lock' }).click();
  await pin(page, '135790');
  await expect(page.getByText('App Lock is off')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('net-worth')).toBeVisible();
});

test('category editor: add, rename (history follows), and use in the Add sheet', async ({ page }) => {
  await onboard(page, { balance: '5000' });
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await typeAmount(page, '300');
  await page.getByRole('radio', { name: 'Food' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).last().click();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Categories' }).click();
  const list = page.getByRole('dialog', { name: 'Categories' });
  await list.getByRole('button', { name: 'Add Category' }).click();
  const form = page.getByRole('dialog', { name: 'New category' });
  await form.getByLabel('Category name').fill('Coffee');
  await form.getByRole('radio', { name: 'coffee' }).click();
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(list.getByRole('button', { name: 'Coffee' }).first()).toBeVisible();

  await list.getByRole('button', { name: 'Food', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit category' });
  await edit.getByLabel('Category name').fill('Food & dining');
  await edit.getByRole('button', { name: 'Save' }).click();
  await list.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Edit Food & dining' })).toBeVisible();

  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Coffee' })).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`quality tour (${scheme}, reduced motion): every screen, no console errors, responsive`, async ({ page }) => {
    test.setTimeout(120_000);
    const problems: string[] = [];
    page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
    page.on('pageerror', (e) => problems.push(e.message));
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });

    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const dir = mkdtempSync(join(tmpdir(), 'dreams-'));
    const file = join(dir, 'demo.json');
    writeFileSync(file, JSON.stringify(demoYear(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`).backup));
    await page.goto('/');
    await page.getByRole('button', { name: /Continue in the browser|Get Started/ }).first().waitFor();
    const cont = page.getByRole('button', { name: 'Continue in the browser' });
    if (await cont.isVisible()) await cont.click();
    await page.getByRole('button', { name: 'Get Started' }).waitFor();
    const t0 = Date.now();
    await page.getByTestId('restore-input').setInputFiles(file);
    await expect(page.getByTestId('net-worth')).toBeVisible();
    const restoreMs = Date.now() - t0;

    // measure the app, not the one-time service-worker precache download on first visit
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForTimeout(500);
    const timed = async (fn: () => Promise<void>) => {
      const s = Date.now();
      await fn();
      return Date.now() - s;
    };
    const tabs: Record<string, number> = {};
    tabs.money = await timed(async () => {
      await page.getByRole('tab', { name: 'Money' }).click();
      await page.getByText('Total in accounts').waitFor();
    });
    await page.getByRole('tab', { name: 'Debts' }).click();
    await page.getByRole('button', { name: /Kirana Pasal/ }).click();
    await page.getByRole('dialog', { name: 'Debt detail' }).getByRole('button', { name: 'Close' }).click();
    tabs.dreams = await timed(async () => {
      await page.getByRole('tab', { name: 'Dreams' }).click();
      await page.getByRole('button', { name: /^Japan trip/ }).waitFor();
    });
    await page.getByRole('button', { name: /^Japan trip/ }).click();
    await page.getByRole('dialog', { name: 'Dream detail' }).getByRole('button', { name: 'Close' }).click();
    tabs.audit = await timed(async () => {
      await page.getByRole('tab', { name: 'Audit' }).click();
      await page.getByRole('region', { name: 'Verdict' }).waitFor();
    });
    tabs.home = await timed(async () => {
      await page.getByRole('tab', { name: 'Home' }).click();
      await page.getByTestId('net-worth').waitFor();
    });
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    await page.getByRole('dialog', { name: 'Add transaction' }).getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Categories' }).click();
    await page.getByRole('dialog', { name: 'Categories' }).getByRole('button', { name: 'Done' }).click();

    // no horizontal overflow at 375pt on any tab
    for (const t of ['Home', 'Money', 'Dreams', 'Audit']) {
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: t }).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${t} overflows`).toBeLessThanOrEqual(0);
    }
    // 44pt minimum tap targets in the tab bar
    const sizes = await page.getByRole('tablist', { name: 'Tabs' }).getByRole('tab').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    for (const h of sizes) expect(h).toBeGreaterThanOrEqual(44);

    console.log(`[perf ${scheme}] restore ${restoreMs}ms, tabs`, JSON.stringify(tabs));
    expect(Math.max(...Object.values(tabs)), 'tab switch with a year of data').toBeLessThan(1500);
    expect(problems, problems.join('\n')).toEqual([]);
  });
}
