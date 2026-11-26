import { expect, test, type Page } from '@playwright/test';
import { onboard, typeAmount } from './helpers';

async function addTx(page: Page, kind: 'Expense' | 'Income', amount: string, category: string, yesterday: boolean) {
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Add transaction' });
  await sheet.getByRole('tab', { name: kind }).click();
  await typeAmount(page, amount);
  await sheet.getByRole('radio', { name: category }).click();
  if (yesterday) await sheet.getByRole('button', { name: 'Yesterday' }).click();
  await sheet.getByRole('button', { name: 'Save', exact: true }).last().click();
  await expect(sheet).toBeHidden();
}

const showGraph = (page: Page) => page.getByRole('region', { name: /Net worth|Profit graph/ }).getByRole('tab', { name: 'Graph' }).click();

test('greeting: asks for a name once, then greets by name; Settings → Profile changes it', async ({ page }) => {
  await onboard(page);
  await expect(page.getByTestId('greeting')).toHaveText(/^Good (morning|afternoon|evening|night)$/);
  const prompt = page.getByRole('region', { name: 'Your name' });
  await expect(prompt).toBeVisible();
  await prompt.getByPlaceholder('Your name').fill('  Rishab ');
  await prompt.getByRole('button', { name: 'Save' }).click();
  await expect(prompt).toBeHidden();
  await expect(page.getByTestId('greeting')).toHaveText(/^Good (morning|afternoon|evening|night),Rishab$/);

  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings.getByLabel('Your name')).toHaveValue('Rishab');
  await settings.getByLabel('Your name').fill('A really very long name that keeps going on');
  await settings.getByLabel('Your name').press('Enter');
  await settings.getByRole('button', { name: 'Done' }).click();
  // long names truncate on one line instead of pushing the layout
  const nameLine = page.getByTestId('greeting').locator('span').nth(1);
  await expect(nameLine).toHaveText('A really very long name that keeps going');
  const box = await nameLine.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(375);
  expect(box!.height).toBeLessThan(50);

  // reload: the prompt stays away
  await page.reload();
  await expect(page.getByTestId('greeting')).toContainText('A really very long');
  await expect(page.getByRole('region', { name: 'Your name' })).toHaveCount(0);
});

test('"Not now" never asks again', async ({ page }) => {
  await onboard(page);
  await page.getByRole('region', { name: 'Your name' }).getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('region', { name: 'Your name' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('net-worth')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your name' })).toHaveCount(0);
});

test('graph: empty state first, then profit in green with ▲, remembered after reload', async ({ page }) => {
  await onboard(page, { balance: '10000' });
  await showGraph(page);
  await expect(page.getByTestId('profit-empty')).toBeVisible();

  await addTx(page, 'Income', '5000', 'Salary', true);
  await addTx(page, 'Expense', '1200', 'Food', false);
  await expect(page.getByTestId('profit-chart')).toBeVisible();
  const value = page.getByTestId('profit-value');
  await expect(value).toHaveAttribute('data-value', '380000');
  await expect(value).toContainText('▲');
  await expect(value).toContainText('+Rs 3,800');
  await expect(value).toHaveClass(/text-gain/);
  await expect(page.getByTestId('profit-pct')).toHaveText('+38%');

  await page.reload();
  await expect(page.getByTestId('profit-chart')).toBeVisible();
  await expect(page.getByRole('button', { name: '1M', pressed: true })).toBeVisible();
  await page.getByRole('button', { name: '1W' }).click();
  await expect(page.getByRole('button', { name: '1W', pressed: true })).toBeVisible();
  await expect(value).toHaveAttribute('data-value', '380000');
});

test('graph: a loss is red with ▼; scrubbing shows the day, then returns to the latest', async ({ page }) => {
  await onboard(page, { balance: '10000' });
  await page.getByRole('region', { name: 'Your name' }).getByRole('button', { name: 'Not now' }).click();
  await addTx(page, 'Expense', '2500', 'Shopping', true);
  await addTx(page, 'Income', '500', 'Gift', false);
  await showGraph(page);
  const value = page.getByTestId('profit-value');
  await expect(value).toHaveAttribute('data-value', '-200000');
  await expect(value).toContainText('▼');
  await expect(value).toContainText('−Rs 2,000');
  await expect(value).toHaveClass(/text-loss/);

  const chart = page.getByTestId('profit-chart');
  const b = (await chart.boundingBox())!;
  await page.mouse.move(b.x + 4, b.y + b.height / 2);
  await page.mouse.down();
  const tip = page.getByTestId('profit-tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Out Rs 2,500');
  await expect(value).toHaveAttribute('data-value', '-250000');
  await page.mouse.move(b.x + b.width - 4, b.y + b.height / 2, { steps: 4 });
  await expect(tip).toContainText('In Rs 500');
  await page.mouse.up();
  await expect(tip).toBeHidden();
  await expect(value).toHaveAttribute('data-value', '-200000');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`header (${scheme}): the greeting shows once, at the top and after scrolling`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await onboard(page);
    const prompt = page.getByRole('region', { name: 'Your name' });
    await prompt.getByPlaceholder('Your name').fill('Rishab');
    await prompt.getByRole('button', { name: 'Save' }).click();
    const opacity = (sel: string) => page.locator(sel).first().evaluate((el) => Number(getComputedStyle(el).opacity));
    // top: the large greeting only
    await expect.poll(() => opacity('h1')).toBe(1);
    await expect.poll(() => opacity('[data-testid="bar-title"]')).toBe(0);
    // scrolled: the compact "Good …, Rishab" only
    await page.evaluate(() => window.scrollTo(0, 300));
    await expect.poll(() => opacity('h1')).toBe(0);
    await expect.poll(() => opacity('[data-testid="bar-title"]')).toBe(1);
    await expect(page.getByTestId('bar-title')).toHaveText(/^Good (morning|afternoon|evening|night), Rishab$/);
    // halfway: never both fully visible
    for (const y of [10, 20, 26, 30, 36]) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(50);
      const [a, b] = [await opacity('h1'), await opacity('[data-testid="bar-title"]')];
      expect(a + b, `scrollY ${y}`).toBeLessThanOrEqual(1.01);
    }
  });
}
