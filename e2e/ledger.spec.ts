import { expect, test } from '@playwright/test';
import { addAccount, netWorthValue, onboard, typeAmount } from './helpers';

test('onboarding lands on Home with the opening balance as net worth', async ({ page }) => {
  await onboard(page, { balance: '12,500.50' });
  await expect.poll(() => netWorthValue(page)).toBe(1250050);
  await expect(page.getByTestId('net-worth')).toHaveText('Rs 12,500.50');
});

test('add an expense in 3 taps (plus digits)', async ({ page }) => {
  await onboard(page, { balance: '1000' });
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click(); // tap 1
  await typeAmount(page, '250');
  await page.getByRole('radio', { name: 'Food' }).click(); // tap 2
  await page.getByRole('dialog', { name: 'Add transaction' }).getByRole('button', { name: 'Save', exact: true }).last().click(); // tap 3
  await expect(page.getByRole('dialog', { name: 'Add transaction' })).toBeHidden();
  await expect.poll(() => netWorthValue(page)).toBe(75000);
  await expect(page.getByRole('button', { name: 'Edit Food' })).toBeVisible();
});

test('keypad math: 250+120×2 = 490', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await typeAmount(page, '250');
  await page.getByRole('button', { name: '+', exact: true }).click();
  await typeAmount(page, '120');
  await page.getByRole('button', { name: '×', exact: true }).click();
  await typeAmount(page, '2');
  await expect(page.getByTestId('amount')).toContainText('490');
});

test('edit, then delete with undo', async ({ page }) => {
  await onboard(page, { balance: '1000' });
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await typeAmount(page, '100');
  await page.getByRole('radio', { name: 'Transport' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).last().click();
  await expect.poll(() => netWorthValue(page)).toBe(90000);

  // edit amount to 40
  await page.getByRole('button', { name: 'Edit Transport' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add transaction' });
  await sheet.getByRole('button', { name: 'Delete', exact: true }).click({ clickCount: 3 });
  await typeAmount(page, '40');
  await sheet.getByRole('button', { name: 'Save', exact: true }).last().click();
  await expect.poll(() => netWorthValue(page)).toBe(96000);

  // delete via edit sheet, confirm in action sheet, then undo
  await page.getByRole('button', { name: 'Edit Transport' }).click();
  await page.getByRole('button', { name: 'Delete transaction' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete Transaction' }).click();
  await expect.poll(() => netWorthValue(page)).toBe(100000);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => netWorthValue(page)).toBe(96000);
});

test('3 accounts + 20 transactions fully offline; balances and net worth correct; survives offline reload', async ({ page, context }) => {
  await onboard(page, { name: 'Wallet cash', balance: '5000' });
  // let the service worker install and take control
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('net-worth')).toBeVisible();
  await expect(page.getByText('Offline · saved on this iPhone')).toBeVisible();

  await addAccount(page, 'NIC Asia', 'Bank', '50000');
  await addAccount(page, 'Rainy day', 'Savings', '0');
  await page.getByRole('tab', { name: 'Home' }).click();

  // 20 transactions: 14 expenses of 100, 4 incomes of 1000, 2 transfers of 2000 (bank → savings)
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add transaction' });
  for (let i = 0; i < 14; i++) {
    await typeAmount(page, '100');
    await page.getByRole('radio', { name: i % 2 ? 'Food' : 'Bills' }).click();
    await sheet.getByRole('button', { name: 'Save & add another' }).click();
  }
  await sheet.getByRole('tab', { name: 'Income' }).click();
  for (let i = 0; i < 4; i++) {
    await typeAmount(page, '1000');
    await page.getByRole('radio', { name: 'Salary' }).click();
    await sheet.getByRole('button', { name: 'Save & add another' }).click();
  }
  await sheet.getByRole('tab', { name: 'Transfer' }).click();
  await sheet.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('dialog', { name: 'Pick From' }).getByRole('button', { name: /NIC Asia/ }).click();
  await sheet.getByRole('button', { name: 'To account' }).click();
  await page.getByRole('dialog', { name: 'Pick To' }).getByRole('button', { name: /Rainy day/ }).click();
  for (let i = 0; i < 2; i++) {
    await typeAmount(page, '2000');
    await sheet.getByRole('button', { name: 'Save & add another' }).click();
  }
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toBeHidden();

  const count = await page.evaluate(async () => {
    const req = indexedDB.open('dreams');
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    return new Promise<number>((r) => {
      const c = db.transaction('transactions').objectStore('transactions').count();
      c.onsuccess = () => r(c.result);
    });
  });
  expect(count).toBe(20);

  // Opening 5000 + 50000 + 0; expenses −1400 on last-used account; incomes +4000; transfers net-worth neutral.
  await expect.poll(() => netWorthValue(page)).toBe((5000 + 50000 - 1400 + 4000) * 100);

  // balances per account
  await page.getByRole('tab', { name: 'Money' }).click();
  await expect(page.getByRole('button', { name: /Rainy day.*Rs 4,000/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /NIC Asia.*Rs 46,000/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Wallet cash.*Rs 7,600/ })).toBeVisible();

  // still works after another offline reload
  await page.reload();
  await page.getByRole('tab', { name: 'Home' }).click();
  await expect.poll(() => netWorthValue(page)).toBe(5760000);
});

test('hide balances blurs amounts', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Hide balances' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-hide-balances', 'true');
  const filter = await page.getByTestId('net-worth').evaluate((el) => getComputedStyle(el).filter);
  expect(filter).toContain('blur');
});

test('correct balance writes an adjustment, not income', async ({ page }) => {
  await onboard(page, { name: 'Cash', balance: '1000' });
  await page.getByRole('tab', { name: 'Money' }).click();
  await page.getByRole('button', { name: /^Cash/ }).click();
  await page.getByRole('dialog', { name: 'Account detail' }).getByRole('button', { name: 'Correct' }).click();
  await page.getByLabel('Actual balance').fill('950');
  await page.getByRole('dialog', { name: 'Correct balance' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Balance correction').first()).toBeVisible();
  await page.getByRole('dialog', { name: 'Account detail' }).getByRole('button', { name: 'Close' }).click();
  await page.getByRole('tab', { name: 'Home' }).click();
  await expect.poll(() => netWorthValue(page)).toBe(95000);
  await expect(page.getByRole('region', { name: 'This month' })).toContainText('Rs 0');
});
