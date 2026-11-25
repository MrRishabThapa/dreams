import { expect, type Page } from '@playwright/test';

export async function onboard(page: Page, opts: { name?: string; balance?: string; target?: string } = {}) {
  await page.goto('/');
  // Wait for the first onboarding screen to render (install card in the browser, welcome when standalone).
  const first = page.getByRole('button', { name: /Continue in the browser|Get Started/ });
  await first.first().waitFor();
  const cont = page.getByRole('button', { name: 'Continue in the browser' });
  if (await cont.isVisible()) await cont.click();
  await page.getByRole('button', { name: 'Get Started' }).click();
  if (opts.name) await page.getByLabel('Account name').fill(opts.name);
  await page.getByLabel('Current balance').fill(opts.balance ?? '10000');
  await page.getByRole('button', { name: 'Continue' }).click();
  if (opts.target) await page.getByLabel('Monthly savings target').fill(opts.target);
  await page.getByRole('button', { name: 'Start Using Dreams' }).click();
  await expect(page.getByTestId('net-worth')).toBeVisible();
}

export async function typeAmount(page: Page, amount: string) {
  const pad = page.getByRole('group', { name: 'Keypad' });
  for (const ch of amount) {
    const name = ch === '.' ? 'Decimal point' : ch;
    await pad.getByRole('button', { name, exact: true }).click();
  }
}

export async function netWorthValue(page: Page): Promise<number> {
  const v = await page.getByTestId('net-worth').getAttribute('data-value');
  return Number(v);
}

export async function addAccount(page: Page, name: string, kind: string, balance: string) {
  await page.getByRole('tab', { name: 'Money' }).click();
  await page.getByRole('button', { name: 'Add account' }).click();
  const sheet = page.getByRole('dialog', { name: 'New account' });
  await sheet.getByLabel('Account name').fill(name);
  await sheet.getByRole('button', { name: kind, exact: true }).click();
  await sheet.getByLabel('Balance').fill(balance);
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet).toBeHidden();
}
