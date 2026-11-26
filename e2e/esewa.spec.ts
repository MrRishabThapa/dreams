import { expect, test, type Page } from '@playwright/test';
import { addAccount, onboard } from './helpers';

const CSV = `eSewa Statement
Date,Description,Debit,Credit,Balance,Reference
01/11/2026,Load from Nabil Bank,,"5,000.00","7,000.00",T100
05/11/2026,QR Payment Himalayan Java,350.00,,"6,650.00",T101
10/11/2026,NEA Electricity,"1,800.25",,"4,849.75",T103
10/11/2026,Service Charge,10.00,,"4,839.75",T104
`;

async function openWallet(page: Page) {
  await page.getByRole('tab', { name: 'Money' }).click();
  await page.getByRole('button', { name: /^eSewa/ }).click();
  return page.getByRole('dialog', { name: 'Account detail' });
}

async function importCsv(page: Page) {
  const detail = page.getByRole('dialog', { name: 'Account detail' });
  await detail.getByRole('button', { name: 'Import statement' }).click();
  const sheet = page.getByRole('dialog', { name: 'Import statement' });
  await sheet.getByTestId('import-file').setInputFiles({ name: 'esewa-nov.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
  return sheet;
}

test('eSewa: update balance (reconcile), import a CSV statement, re-import is safe, wallet audit', async ({ page }) => {
  await onboard(page, { balance: '50000' });
  await addAccount(page, 'eSewa', 'E-wallet', '2000');
  const detail = await openWallet(page);
  await expect(detail.getByTestId('confirm-nudge')).toHaveText(/not confirmed yet/);

  // 1. confirm an unchanged balance: no transaction, nudge resets
  await detail.getByRole('button', { name: 'Update balance' }).click();
  let upd = page.getByRole('dialog', { name: 'Update balance' });
  await upd.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Balance confirmed')).toBeVisible();
  await expect(detail.getByTestId('confirm-nudge')).toHaveText('Balance last confirmed today.');

  // 2. import: map columns, preview, import
  let sheet = await importCsv(page);
  await expect(sheet.getByText(/esewa-nov\.csv · 4 rows/)).toBeVisible();
  await sheet.getByLabel('Date', { exact: true }).selectOption({ label: 'Date' });
  await sheet.getByLabel('Description').selectOption({ label: 'Description' });
  await sheet.getByLabel('Money out (debit)').selectOption({ label: 'Debit' });
  await sheet.getByLabel('Money in (credit)').selectOption({ label: 'Credit' });
  await sheet.getByLabel('Balance').selectOption({ label: 'Balance' });
  await sheet.getByLabel('Reference / transaction id').selectOption({ label: 'Reference' });
  await sheet.getByRole('button', { name: 'Next' }).click();
  await expect(sheet.getByTestId('import-row')).toHaveCount(4);
  await expect(sheet.getByText('This matches the statement’s closing balance.')).toBeVisible();
  await sheet.getByLabel('Category for NEA Electricity').selectOption({ label: 'Bills' });
  await sheet.getByRole('button', { name: 'Import 4 Transactions' }).click();
  await expect(page.getByText('Imported 4 transactions')).toBeVisible();
  await expect(detail.getByText('Rs 4,839.75').first()).toBeVisible();

  // 3. re-import the same file: mapping remembered, everything already in
  sheet = await importCsv(page);
  await expect(sheet.getByLabel('Money out (debit)')).toHaveValue('2');
  await sheet.getByRole('button', { name: 'Next' }).click();
  await expect(sheet.getByText('Already imported')).toHaveCount(4);
  await expect(sheet.getByRole('button', { name: 'Import 0 Transactions' })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Back' }).click();
  await sheet.getByRole('button', { name: 'Back' }).click();
  await sheet.getByRole('button', { name: 'Cancel' }).click();

  // 4. reconcile with a difference: written as a correction
  await detail.getByRole('button', { name: 'Update balance' }).click();
  upd = page.getByRole('dialog', { name: 'Update balance' });
  await upd.getByLabel('Balance in the app').fill('4800');
  await expect(upd.getByText('−Rs 39.75')).toBeVisible();
  await upd.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Balance updated (−Rs 39.75)')).toBeVisible();

  // 5. wallet audit on the account screen
  const card = detail.getByRole('region', { name: 'eSewa audit' });
  await expect(card).toBeVisible();
  await expect(card.getByText('Fees and charges (in spending)')).toBeVisible();
  await expect(card.getByText('Corrections')).toBeVisible();
});

test('eSewa: paste mode imports one transaction per line', async ({ page }) => {
  await onboard(page, { balance: '50000' });
  await addAccount(page, 'eSewa', 'E-wallet', '1000');
  const detail = await openWallet(page);
  await detail.getByRole('button', { name: 'Import statement' }).click();
  const sheet = page.getByRole('dialog', { name: 'Import statement' });
  await sheet.getByRole('button', { name: 'Paste Text' }).click();
  await sheet.getByLabel('Pasted transactions').fill('2026-11-12 Himalayan Java 350\n2026-11-13 Cashback +20\nnot a line');
  await sheet.getByRole('button', { name: 'Next' }).click();
  await expect(sheet.getByText('Start the line with a date')).toBeVisible();
  await sheet.getByRole('button', { name: 'Import 2 Transactions' }).click();
  await expect(page.getByText('Imported 2 transactions')).toBeVisible();
  await expect(detail.getByText('Rs 670').first()).toBeVisible();
});
