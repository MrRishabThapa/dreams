import { expect, test } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { goOffline, netWorthValue, onboard, typeAmount } from './helpers';
// @ts-expect-error plain ESM dev script
import { demoYear } from '../scripts/demo-year.mjs';

const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 10);
const prevIso = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-10`;
const prevName = prev.toLocaleString('en-US', { month: 'long' });

test('offline: month-ready banner → audit report → reflection → close → reopen → close again', async ({ page }) => {
  await onboard(page, { name: 'Cash', balance: '50000' });
  await goOffline(page);

  // last month: salary 20,000 and food 1,500
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add transaction' });
  await sheet.getByRole('tab', { name: 'Income' }).click();
  await typeAmount(page, '20000');
  await sheet.getByRole('radio', { name: 'Salary' }).click();
  await sheet.getByLabel('Pick date').fill(prevIso);
  await sheet.getByRole('button', { name: 'Save & add another' }).click();
  await sheet.getByRole('tab', { name: 'Expense' }).click();
  await typeAmount(page, '1500');
  await sheet.getByRole('radio', { name: 'Food' }).click();
  await sheet.getByRole('button', { name: 'Save & add another' }).click();
  await sheet.getByRole('button', { name: 'Cancel' }).click();

  const banner = page.getByRole('button', { name: new RegExp(`Your ${prevName} audit is ready`) });
  await expect(banner).toBeVisible();
  await banner.click();

  await expect(page.getByRole('tab', { name: new RegExp(prevName.slice(0, 3)) , selected: true })).toBeVisible();
  await expect.poll(() => page.getByTestId('audit-nw-change').getAttribute('data-value')).toBe('1850000');
  const walk = page.getByRole('region', { name: 'Net worth walk' });
  await expect(walk).toContainText('Rs 50,000');
  await expect(walk).toContainText('Rs 68,500');
  await expect(walk).not.toContainText('Other');
  await expect(page.getByRole('region', { name: 'Insights' })).toContainText('Food was 100% of spending');

  await page.getByLabel('Reflection').fill('Cooked at home more.');
  await page.getByLabel('Reflection').blur();
  await page.getByRole('button', { name: 'Close month' }).click();
  await expect(page.getByText(`${prevName} closed`)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Verdict' }).getByText('Closed')).toBeVisible();
  await expect(page.getByLabel('Reflection')).toHaveValue('Cooked at home more.');

  // a closed month keeps its snapshot even if data changes later
  await page.getByRole('button', { name: 'Reopen Month' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Reopen Month' }).click();
  await expect(page.getByRole('button', { name: 'Close month' })).toBeVisible();
  await page.getByRole('button', { name: 'Close month' }).click();
  await expect(page.getByRole('region', { name: 'Verdict' }).getByText('Closed')).toBeVisible();

  // banner gone; survives an offline reload
  await page.reload();
  await page.getByRole('tab', { name: 'Home' }).click();
  await expect(page.getByTestId('net-worth')).toBeVisible();
  await expect(banner).toBeHidden();
  await page.getByRole('tab', { name: 'Audit' }).click();
  await expect(page.getByRole('region', { name: 'Verdict' }).getByText('Closed')).toBeVisible();
});

test('backup → erase → restore round-trip with a demo year, offline', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'dreams-'));
  const demoFile = join(dir, 'demo.json');
  writeFileSync(demoFile, JSON.stringify(demoYear(todayIso).backup));

  // fresh app: restore the demo year from the welcome screen
  await page.goto('/');
  await page.getByRole('button', { name: /Continue in the browser|Get Started/ }).first().waitFor();
  const cont = page.getByRole('button', { name: 'Continue in the browser' });
  if (await cont.isVisible()) await cont.click();
  await page.getByTestId('restore-input').setInputFiles(demoFile);
  await expect(page.getByTestId('net-worth')).toBeVisible();
  await goOffline(page);
  const nw = await netWorthValue(page);
  expect(nw).toBeGreaterThan(0);

  // back up now (download fallback in this browser)
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const dl = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Back Up Now' }).click();
  const backupPath = join(dir, 'backup.json');
  await (await dl).saveAs(backupPath);
  await expect(settings.getByTestId('last-backup')).not.toHaveText('Never');

  // erase everything
  await settings.getByRole('button', { name: 'Erase all data' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Erase All Data' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Yes, Erase Everything' }).click();
  await page.getByRole('button', { name: /Continue in the browser|Get Started/ }).first().waitFor();

  // restore the backup we just made (still offline)
  if (await cont.isVisible()) await cont.click();
  await page.getByTestId('restore-input').setInputFiles(backupPath);
  await expect(page.getByTestId('net-worth')).toBeVisible();
  await expect.poll(() => netWorthValue(page)).toBe(nw);
  await page.getByRole('tab', { name: 'Dreams' }).click();
  await expect(page.getByRole('button', { name: /^Japan trip/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Money' }).click();
  await page.getByRole('tab', { name: 'Debts' }).click();
  await expect(page.getByRole('button', { name: 'Kirana Pasal, I owe' })).toBeVisible();
});
