import { expect, test, type Page } from '@playwright/test';
import { netWorthValue, onboard } from './helpers';

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function goOffline(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByTestId('net-worth')).toBeVisible();
}

async function openDebts(page: Page) {
  await page.getByRole('tab', { name: 'Money' }).click();
  await page.getByRole('tab', { name: 'Debts' }).click();
}

test('offline: borrow 50,000 with cash, repay 20,000 → 30,000 left, net worth unchanged; overdue badge; delete + undo', async ({ page }) => {
  await onboard(page, { name: 'Cash', balance: '10000' });
  await goOffline(page);
  const start = await netWorthValue(page);
  expect(start).toBe(1_000_000);

  // borrow 50,000 from Hari, received in Cash
  await openDebts(page);
  await page.getByRole('button', { name: 'Add Debt' }).first().click();
  const form = page.getByRole('dialog', { name: 'New debt' });
  await form.getByLabel('Person').fill('Hari');
  await form.getByLabel('Amount').fill('50000');
  await expect(form.getByRole('switch', { name: 'Record the cash' })).toHaveAttribute('aria-checked', 'true');
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(form).toBeHidden();

  await page.getByRole('tab', { name: 'Home' }).click();
  await expect.poll(() => netWorthValue(page)).toBe(start); // cash in, liability in
  await expect(page.getByRole('button', { name: /I owe.*Rs 50,000/ })).toBeVisible();

  // repay 20,000 from Cash
  await page.getByRole('button', { name: /I owe/ }).click(); // chip → Money · Debts
  await page.getByRole('button', { name: 'Hari, I owe' }).click();
  const detail = page.getByRole('dialog', { name: 'Debt detail' });
  await detail.getByRole('button', { name: 'Record Repayment' }).click();
  const pay = page.getByRole('dialog', { name: 'Record payment' });
  await pay.getByLabel('Payment amount').fill('20000');
  await pay.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(pay).toBeHidden();
  await expect.poll(() => detail.getByTestId('debt-remaining').getAttribute('data-value')).toBe('3000000');
  await expect(detail.getByText('Repaid', { exact: true }).first()).toBeVisible();
  await detail.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('tab', { name: 'Home' }).click();
  await expect.poll(() => netWorthValue(page)).toBe(start); // repayment is net-worth neutral
  await expect(page.getByRole('button', { name: /I owe.*Rs 30,000/ })).toBeVisible();
  // never counted as income or spending
  await expect(page.getByRole('region', { name: 'This month' })).toContainText('Rs 0');
  // cash: 10,000 + 50,000 − 20,000
  await page.getByRole('tab', { name: 'Money' }).click();
  await page.getByRole('tab', { name: 'Accounts' }).click();
  await expect(page.getByRole('button', { name: /^Cash.*Rs 40,000/ })).toBeVisible();

  // lent 5,000 to Sita without cash, due 3 days ago → overdue
  await page.getByRole('tab', { name: 'Debts' }).click();
  await page.getByRole('button', { name: 'Add debt', exact: true }).click();
  const form2 = page.getByRole('dialog', { name: 'New debt' });
  await form2.getByRole('tab', { name: 'I lent' }).click();
  await form2.getByLabel('Person').fill('Sita');
  await form2.getByLabel('Amount').fill('5000');
  await form2.getByLabel('Start date').fill(iso(-10));
  await form2.getByLabel('Due date').fill(iso(-3));
  await form2.getByRole('switch', { name: 'Record the cash' }).click();
  await form2.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(form2).toBeHidden();
  await expect(page.getByRole('button', { name: 'Sita, owes me' })).toContainText('3 days overdue');

  // delete Hari's debt, then undo
  await page.getByRole('button', { name: 'Hari, I owe' }).click();
  await detail.getByRole('button', { name: 'Delete Debt' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete Debt' }).click();
  await expect(page.getByRole('button', { name: 'Hari, I owe' })).toBeHidden();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Hari, I owe' })).toContainText('Rs 30,000');

  // survives an offline reload
  await page.reload();
  await page.getByRole('tab', { name: 'Home' }).click();
  await expect.poll(() => netWorthValue(page)).toBe(start + 500_000);
});
