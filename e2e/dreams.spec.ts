import { expect, test } from '@playwright/test';
import { addAccount, goOffline, netWorthValue, onboard } from './helpers';

test('offline: fund a dream with a linked transfer (balances move, net worth unchanged), then complete it', async ({ page }) => {
  await onboard(page, { name: 'Cash', balance: '100000' });
  await goOffline(page);
  await addAccount(page, 'Rainy day', 'Savings', '0');
  await page.getByRole('tab', { name: 'Home' }).click();
  const start = await netWorthValue(page);
  expect(start).toBe(10_000_000);

  // new dream
  await page.getByRole('tab', { name: 'Dreams' }).click();
  await page.getByRole('button', { name: 'New Dream', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'New dream' });
  await form.getByLabel('Dream name').fill('Japan trip');
  await form.getByLabel('Target amount').fill('120000');
  await form.getByRole('radio', { name: 'plane' }).click();
  await form.getByRole('radio', { name: 'Sky' }).click();
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(form).toBeHidden();

  // add 40,000 and also move it Cash → Rainy day
  await page.getByRole('button', { name: /^Japan trip, 0%/ }).click();
  const detail = page.getByRole('dialog', { name: 'Dream detail' });
  await detail.getByRole('button', { name: 'Add Money' }).click();
  const money = page.getByRole('dialog', { name: 'Dream money' });
  await money.getByLabel('Dream amount').fill('40000');
  await money.getByRole('switch', { name: 'Also move money' }).click();
  await expect(money.getByRole('button', { name: /^From.*Cash/ })).toBeVisible();
  await expect(money.getByRole('button', { name: /^To.*Rainy day/ })).toBeVisible();
  await money.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(money).toBeHidden();
  await expect.poll(() => detail.getByTestId('dream-saved').getAttribute('data-value')).toBe('4000000');
  await expect(detail.getByTestId('dream-percent')).toHaveText('33%');
  await expect(detail.getByText('Cash → Rainy day')).toBeVisible();
  await detail.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('tab', { name: 'Home' }).click();
  await expect.poll(() => netWorthValue(page)).toBe(start);
  await expect(page.getByRole('region', { name: 'Dreams' }).getByRole('button', { name: /Japan trip, 33%/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Money' }).click();
  await expect(page.getByRole('button', { name: /^Cash.*Rs 60,000/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Rainy day.*Rs 40,000/ })).toBeVisible();

  // fund the rest (earmark only) → completes
  await page.getByRole('tab', { name: 'Dreams' }).click();
  await page.getByRole('button', { name: /^Japan trip, 33%/ }).click();
  await detail.getByRole('button', { name: 'Add Money' }).click();
  await money.getByRole('button', { name: /^Rest/ }).click();
  await money.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Japan trip is fully funded')).toBeVisible();
  await expect(detail.getByTestId('dream-percent')).toHaveText('100%');
  await detail.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Reached', { exact: true })).toBeVisible();

  // earmarks never touch net worth; survives an offline reload
  await page.reload();
  await expect(page.getByRole('button', { name: /^Japan trip, 100%/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Home' }).click();
  await expect.poll(() => netWorthValue(page)).toBe(start);
});
