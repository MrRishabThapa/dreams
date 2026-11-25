import { expect, test, type Page } from '@playwright/test';
import { addAccount, onboard, typeAmount } from './helpers';

/**
 * Captures every Phase 0–1 screen in light and dark into screenshots/<scheme>/.
 * Run: SHOTS=1 npm run e2e -- screenshots   (skipped otherwise; it's slow)
 */
test.skip(!process.env.SHOTS, 'set SHOTS=1 to capture screenshots');

const SCHEMES = ['light', 'dark'] as const;

async function shot(page: Page, scheme: string, name: string, fullPage = false) {
  await page.waitForTimeout(450); // let springs settle
  await page.screenshot({ path: `screenshots/${scheme}/${name}.png`, fullPage });
}

async function addTx(page: Page, kind: 'Expense' | 'Income', amount: string, category: string, yesterday = false) {
  const sheet = page.getByRole('dialog', { name: 'Add transaction' });
  await sheet.getByRole('tab', { name: kind }).click();
  await typeAmount(page, amount);
  await sheet.getByRole('radio', { name: category }).click();
  if (yesterday) await sheet.getByRole('button', { name: 'Yesterday' }).click();
  await sheet.getByRole('button', { name: 'Save & add another' }).click();
}

for (const scheme of SCHEMES) {
  test(`screens (${scheme})`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: scheme });

    // onboarding
    await page.goto('/');
    await page.getByRole('button', { name: /Continue in the browser|Get Started/ }).first().waitFor();
    await shot(page, scheme, '01-onboarding-install');
    await page.getByRole('button', { name: 'Continue in the browser' }).click();
    await page.getByRole('button', { name: 'Get Started' }).waitFor();
    await shot(page, scheme, '02-onboarding-welcome');
    await page.goto('/');
    await onboard(page, { name: 'Cash', balance: '8500', target: '25000' }).catch(() => undefined);

    // seed a realistic month
    await addAccount(page, 'NIC Asia', 'Bank', '125000');
    await addAccount(page, 'eSewa', 'E-wallet', '3200');
    await addAccount(page, 'Rainy day fund', 'Savings', '40000');
    await addAccount(page, 'NEPSE portfolio', 'Investment', '200000');
    await page.getByRole('tab', { name: 'Home' }).click();
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    await addTx(page, 'Income', '85000', 'Salary', true);
    await addTx(page, 'Expense', '18000', 'Rent', true);
    await addTx(page, 'Expense', '2450', 'Bills', true);
    await addTx(page, 'Expense', '640', 'Food');
    await addTx(page, 'Expense', '180', 'Transport');
    await addTx(page, 'Expense', '1299', 'Shopping');
    // a fresh entry left on screen for the Add sheet shot
    await page.getByRole('dialog', { name: 'Add transaction' }).getByRole('tab', { name: 'Expense' }).click();
    await typeAmount(page, '250');
    await page.getByRole('button', { name: '+', exact: true }).click();
    await typeAmount(page, '120');
    await page.getByRole('radio', { name: 'Food' }).click();
    await shot(page, scheme, '05-add-sheet');
    await page.getByRole('dialog', { name: 'Add transaction' }).getByRole('button', { name: 'Save', exact: true }).last().click();
    await expect(page.getByRole('dialog', { name: 'Add transaction' })).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, 0));

    await shot(page, scheme, '03-home');
    await page.evaluate(() => window.scrollTo(0, 420));
    await shot(page, scheme, '04-home-scrolled');
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.getByRole('button', { name: 'Hide balances' }).click();
    await shot(page, scheme, '06-home-hidden-balances');
    await page.getByRole('button', { name: 'Show balances' }).click();

    await page.getByRole('tab', { name: 'Money' }).click();
    await shot(page, scheme, '07-money-accounts');
    await page.getByRole('button', { name: /^NIC Asia/ }).click();
    await shot(page, scheme, '08-account-detail');
    await page.getByRole('dialog', { name: 'Account detail' }).getByRole('button', { name: 'Correct' }).click();
    await page.getByLabel('Actual balance').fill('124500');
    await shot(page, scheme, '09-correct-balance');
    await page.getByRole('dialog', { name: 'Correct balance' }).getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('dialog', { name: 'Account detail' }).getByRole('button', { name: 'Edit' }).first().click();
    await shot(page, scheme, '10-action-sheet');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('dialog', { name: 'Account detail' }).getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Add account', exact: true }).click();
    await page.getByRole('dialog', { name: 'New account' }).getByLabel('Account name').fill('Khalti');
    await page.getByRole('dialog', { name: 'New account' }).getByLabel('Account name').blur();
    await shot(page, scheme, '11-new-account');
    await page.getByRole('dialog', { name: 'New account' }).getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('tab', { name: 'Debts' }).click();
    await shot(page, scheme, '12-money-debts');

    await page.getByRole('tab', { name: 'Dreams' }).click();
    await shot(page, scheme, '13-dreams');
    await page.getByRole('tab', { name: 'Audit' }).click();
    await shot(page, scheme, '14-audit');

    await page.getByRole('tab', { name: 'Home' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await shot(page, scheme, '15-settings');

    // design kit gallery
    await page.goto('/_kit');
    await page.getByRole('heading', { name: 'Design Kit' }).waitFor();
    await page.getByRole('tab', { name: scheme === 'dark' ? 'Dark' : 'Light' }).click();
    await shot(page, scheme, '16-kit', true);
    await page.getByRole('button', { name: 'Open sheet' }).click();
    await shot(page, scheme, '17-kit-sheet');
  });
}
