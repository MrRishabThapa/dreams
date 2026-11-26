import { expect, test, type Page } from '@playwright/test';
import { addAccount, onboard, typeAmount } from './helpers';

/**
 * Captures every Phase 0–1 screen in light and dark into screenshots/<scheme>/.
 * Run: SHOTS=1 npm run e2e -- screenshots   (skipped otherwise; it's slow)
 */
test.skip(!process.env.SHOTS, 'set SHOTS=1 to capture screenshots');

const SCHEMES = ['light', 'dark'] as const;

async function shot(page: Page, scheme: string, name: string, fullPage = false) {
  // let springs settle; sheets take longer on headless WebKit's first open
  const dialogs = page.getByRole('dialog');
  const n = await dialogs.count();
  // wait for the top sheet to finish sliding in (headless WebKit runs springs slowly on first open)
  // (a sheet that is still closing has no buttons, so this is best-effort)
  if (n) await expect(dialogs.nth(n - 1).getByRole('button').first()).toBeInViewport({ ratio: 1, timeout: 4000 }).catch(() => undefined);
  await page.waitForTimeout(n ? 700 : 500);
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
    // v1.2.2: name prompt, then the greeting and the graph's empty state
    await shot(page, scheme, '02b-name-prompt');
    await page.getByRole('region', { name: 'Your name' }).getByPlaceholder('Your name').fill('Rishab');
    await page.getByRole('region', { name: 'Your name' }).getByRole('button', { name: 'Save' }).click();
    await page.getByRole('tab', { name: 'Graph' }).click();
    await shot(page, scheme, '02c-graph-empty');
    await page.getByRole('tab', { name: 'Balance' }).click();

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
    // v1.2.2: profit graph (green), then scrubbing
    await page.getByRole('tab', { name: 'Graph' }).click();
    await page.getByRole('button', { name: '1W' }).click();
    await page.waitForTimeout(800); // let the line finish drawing in
    await shot(page, scheme, '03b-graph-profit');
    const chart = page.getByTestId('profit-chart');
    const cb = (await chart.boundingBox())!;
    await page.mouse.move(cb.x + cb.width * 0.2, cb.y + cb.height / 2);
    await page.mouse.down();
    await page.mouse.move(cb.x + cb.width * 0.55, cb.y + cb.height / 2, { steps: 3 });
    await shot(page, scheme, '03c-graph-scrub');
    await page.mouse.up();
    await page.getByRole('tab', { name: 'Balance' }).click();
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
    await shot(page, scheme, '12-money-debts-empty');

    // debts: borrowed with cash + partly repaid, lent without cash and overdue, one due soon, one settled
    const addDebt = async (o: { lent?: boolean; person: string; amount: string; start?: string; due?: string; cash?: boolean; shotForm?: boolean }) => {
      await page.getByRole('button', { name: 'Add debt', exact: true }).click();
      const f = page.getByRole('dialog', { name: 'New debt' });
      if (o.lent) await f.getByRole('tab', { name: 'I lent' }).click();
      await f.getByLabel('Person').fill(o.person);
      await f.getByLabel('Amount').fill(o.amount);
      if (o.start) await f.getByLabel('Start date').fill(o.start);
      if (o.due) await f.getByLabel('Due date').fill(o.due);
      if (o.cash === false) await f.getByRole('switch', { name: 'Record the cash' }).click();
      if (o.shotForm) {
        await f.getByLabel('Amount').blur();
        await shot(page, scheme, '12b-new-debt');
      }
      await f.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(f).toBeHidden();
    };
    const pay = async (label: string, amount: string, shotIt = false) => {
      await page.getByRole('button', { name: label }).click();
      const d = page.getByRole('dialog', { name: 'Debt detail' });
      await d.getByRole('button', { name: /Record (Repayment|Collection)/ }).click();
      const p = page.getByRole('dialog', { name: 'Record payment' });
      await p.getByLabel('Payment amount').fill(amount);
      if (shotIt) {
        await p.getByLabel('Payment amount').blur();
        await shot(page, scheme, '12d-record-payment');
      }
      await p.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(p).toBeHidden();
      if (shotIt) await shot(page, scheme, '12c-debt-detail');
      await d.getByRole('button', { name: 'Close' }).click();
    };
    const dayOffset = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    await addDebt({ person: 'Hari Dai', amount: '50000', due: dayOffset(40), shotForm: true });
    await pay('Hari Dai, I owe', '20000', true);
    await addDebt({ lent: true, person: 'Sita', amount: '5000', start: dayOffset(-20), due: dayOffset(-3), cash: false });
    await addDebt({ person: 'Kirana Pasal', amount: '2350', due: dayOffset(4), cash: false });
    await addDebt({ lent: true, person: 'Bikash', amount: '1500' });
    await pay('Bikash, owes me', '1500');
    await shot(page, scheme, '12-money-debts');

    await page.getByRole('tab', { name: 'Dreams' }).click();
    await shot(page, scheme, '13-dreams-empty');
    const newDream = async (title: string, target: string, icon: string, color: string, shotForm = false) => {
      await page.getByRole('button', { name: 'New dream', exact: true }).click();
      const f = page.getByRole('dialog', { name: 'New dream' });
      await f.getByLabel('Dream name').fill(title);
      await f.getByLabel('Target amount').fill(target);
      await f.getByRole('radio', { name: icon }).click();
      await f.getByRole('radio', { name: color }).click();
      if (shotForm) {
        await f.getByLabel('Target amount').blur();
        await shot(page, scheme, '13c-new-dream');
      }
      await f.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(f).toBeHidden();
    };
    const fund = async (title: RegExp, amount: string, move = false, shotIt = false) => {
      await page.getByRole('button', { name: title }).first().click();
      const d = page.getByRole('dialog', { name: 'Dream detail' });
      await d.getByRole('button', { name: 'Add Money' }).click();
      const m = page.getByRole('dialog', { name: 'Dream money' });
      await m.getByLabel('Dream amount').fill(amount);
      if (move) await m.getByRole('switch', { name: 'Also move money' }).click();
      if (shotIt) {
        await m.getByLabel('Dream amount').blur();
        await shot(page, scheme, '13d-dream-add-money');
      }
      await m.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(m).toBeHidden();
      if (shotIt) await shot(page, scheme, '13b-dream-detail');
      await d.getByRole('button', { name: 'Close' }).click();
      await page.waitForTimeout(400);
    };
    await newDream('Japan trip', '250000', 'plane', 'Sky', true);
    await fund(/^Japan trip/, '40000', true, true);
    await newDream('New laptop', '160000', 'laptop', 'Lilac');
    await fund(/^New laptop/, '95000');
    await newDream('Emergency fund', '100000', 'shield', 'Mint');
    await fund(/^Emergency fund/, '100000');
    await newDream('Pokhara weekend', '30000', 'tree-palm', 'Peach');
    await shot(page, scheme, '13-dreams');
    await page.getByRole('tab', { name: 'Home' }).click();
    await page.evaluate(() => window.scrollTo(0, 560));
    await shot(page, scheme, '13e-home-dreams');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('tab', { name: 'Audit' }).click();
    await shot(page, scheme, '14-audit');

    await page.getByRole('tab', { name: 'Home' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await shot(page, scheme, '15-settings');
    // v1.2.1: patch notes
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('button', { name: /^Patch notes/ }).scrollIntoViewIfNeeded();
    await shot(page, scheme, '15b-settings-about');
    await settings.getByRole('button', { name: /^Patch notes/ }).click();
    await shot(page, scheme, '15c-patch-notes');
    await page.getByRole('dialog', { name: 'Patch notes' }).getByRole('button', { name: 'Back to Settings' }).click();
    await settings.getByRole('button', { name: 'Done' }).click();

    // v1.2.1: category picker (folded, More + search) and a new category from the picker
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    const add = page.getByRole('dialog', { name: 'Add transaction' });
    await typeAmount(page, '1500');
    await shot(page, scheme, '15d-picker');
    await add.getByRole('button', { name: 'More', exact: true }).click();
    await shot(page, scheme, '15e-picker-more');
    await add.getByLabel('Search categories').fill('rep');
    await shot(page, scheme, '15f-picker-search');
    await add.getByLabel('Search categories').fill('');
    await add.getByRole('button', { name: 'New expense category' }).click();
    const editor = page.getByRole('dialog', { name: 'New category' });
    await editor.getByLabel('Category name').fill('Watch repair');
    await editor.getByRole('radio', { name: 'watch', exact: true }).click();
    await editor.getByRole('radio', { name: '#7C3AED' }).click();
    await editor.getByLabel('Category name').blur();
    await shot(page, scheme, '15g-new-category');
    await editor.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(editor).toBeHidden();
    await add.getByRole('button', { name: 'Less', exact: true }).click();
    await shot(page, scheme, '15h-picker-new-selected');
    await add.getByRole('button', { name: 'Cancel' }).click();

    // design kit gallery
    await page.goto('/_kit');
    await page.getByRole('heading', { name: 'Design Kit' }).waitFor();
    await page.getByRole('tab', { name: scheme === 'dark' ? 'Dark' : 'Light' }).click();
    await shot(page, scheme, '16-kit', true);
    await page.getByRole('button', { name: 'Open sheet' }).click();
    await shot(page, scheme, '17-kit-sheet');
  });
}

for (const scheme of SCHEMES) {
  test(`home graph in a loss (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await onboard(page, { name: 'Cash', balance: '20000' });
    await page.getByRole('region', { name: 'Your name' }).getByPlaceholder('Your name').fill('Rishab');
    await page.getByRole('region', { name: 'Your name' }).getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    // up for a few days, then a big spend today: the line crosses zero from green to red
    const day = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const sheet = page.getByRole('dialog', { name: 'Add transaction' });
    for (const [n, kind, amt, cat] of [[4, 'Income', '3000', 'Salary'], [3, 'Expense', '800', 'Food'], [2, 'Income', '1200', 'Gift'], [1, 'Expense', '1500', 'Transport']] as const) {
      await sheet.getByRole('tab', { name: kind }).click();
      await typeAmount(page, amt);
      await sheet.getByRole('radio', { name: cat }).click();
      await sheet.getByLabel('Pick date').fill(day(n));
      await sheet.getByRole('button', { name: 'Save & add another' }).click();
    }
    await addTx(page, 'Expense', '6400', 'Shopping');
    await page.getByRole('dialog', { name: 'Add transaction' }).getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('tab', { name: 'Graph' }).click();
    await page.waitForTimeout(800); // let the line finish drawing in
    await shot(page, scheme, '03d-graph-loss');
  });
}
