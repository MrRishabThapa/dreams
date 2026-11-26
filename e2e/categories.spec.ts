import { expect, test } from '@playwright/test';
import { netWorthValue, onboard, typeAmount } from './helpers';

test('category picker: 10 tiles + More + New, More opens the rest with search', async ({ page }) => {
  await onboard(page, { balance: '10000' });
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add transaction' });
  const radios = sheet.getByRole('radiogroup', { name: 'Category' }).getByRole('radio');
  await expect(radios).toHaveCount(10);
  await expect(sheet.getByRole('radio', { name: 'Repairs & Maintenance' })).toHaveCount(0);
  await expect(sheet.getByLabel('Search categories')).toHaveCount(0);

  await sheet.getByRole('button', { name: 'More', exact: true }).click();
  await expect(radios).toHaveCount(24);
  await sheet.getByLabel('Search categories').fill('watch');
  await expect(radios).toHaveCount(1);
  await sheet.getByRole('radio', { name: 'Watch & Accessories' }).click();
  await sheet.getByLabel('Search categories').fill('');
  await sheet.getByRole('button', { name: 'Less', exact: true }).click();
  // the picked one stays visible when folded
  await expect(radios).toHaveCount(10);
  await expect(sheet.getByRole('radio', { name: 'Watch & Accessories' })).toHaveAttribute('aria-checked', 'true');

  await typeAmount(page, '1200');
  await sheet.getByRole('button', { name: 'Save', exact: true }).last().click();
  await expect(sheet).toBeHidden();
  await expect.poll(() => netWorthValue(page)).toBe(880000);
  await expect(page.getByRole('button', { name: 'Edit Watch & Accessories' })).toBeVisible();
});

test('a new category made from the picker is selected and the entry keeps its amount', async ({ page }) => {
  await onboard(page, { balance: '10000' });
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add transaction' });
  await typeAmount(page, '1500');
  await sheet.getByRole('button', { name: 'New expense category' }).click();

  const editor = page.getByRole('dialog', { name: 'New category' });
  await editor.getByLabel('Category name').fill('Watch repair');
  await editor.getByRole('radio', { name: 'watch', exact: true }).click();
  await editor.getByRole('radio', { name: '#7C3AED' }).click();
  await editor.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(editor).toBeHidden();

  await expect(sheet.getByTestId('amount')).toContainText('1,500');
  await expect(sheet.getByRole('radio', { name: 'Watch repair' })).toHaveAttribute('aria-checked', 'true');
  await sheet.getByRole('button', { name: 'Save', exact: true }).last().click();
  await expect(sheet).toBeHidden();
  await expect.poll(() => netWorthValue(page)).toBe(850000);
  await expect(page.getByRole('button', { name: 'Edit Watch repair' })).toBeVisible();

  // it is a normal category: listed in Settings → Categories
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Categories' }).click();
  await expect(page.getByRole('dialog', { name: 'Categories' }).getByRole('button', { name: 'Watch repair', exact: true })).toBeVisible();
});

test('Settings → Patch notes shows the current version first with a Latest pill', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: /^Patch notes/ }).click();
  const notes = page.getByRole('dialog', { name: 'Patch notes' });
  await expect(notes.getByText(/You’re on version \d+\.\d+\.\d+\./)).toBeVisible();
  const headings = notes.getByRole('heading', { level: 2 });
  // the newest card is the running version (its display name, e.g. v1.2.2.1 for 1.2.3)
  const running = (await notes.getByText(/You’re on version/).locator('strong').textContent())!.replace('version ', '');
  await expect(headings.first()).toHaveText(`v${running}`);
  await expect(headings.filter({ hasText: /^v1\.(2\.1|2\.0|1\.0|0\.0)$/ })).toHaveText(['v1.2.1', 'v1.2.0', 'v1.1.0', 'v1.0.0']);
  const first = notes.getByTestId('patch-card').first();
  await expect(first.getByText('Latest', { exact: true })).toBeVisible();
  await expect(notes.getByTestId('patch-card').nth(1).getByText('Latest', { exact: true })).toHaveCount(0);
  await notes.getByRole('button', { name: 'Back to Settings' }).click();
  await expect(notes).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
});
