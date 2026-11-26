/**
 * Patch notes shown in Settings → Patch notes, newest first.
 * Every release adds an entry here and bumps package.json; the build fails if the top
 * entry's version doesn't match package.json (see vite.config.ts and patchNotes.test.ts).
 */
export interface PatchItem {
  /** shown bold, before the colon */
  keyword: string;
  text: string;
}

export interface PatchNote {
  /** semver, same as package.json, e.g. "1.2.1" */
  version: string;
  /** what people see when it differs from the semver, e.g. "1.2.2.1" for 1.2.3 */
  label?: string;
  /** release day, YYYY-MM-DD */
  date: string;
  groups: { new?: PatchItem[]; improved?: PatchItem[]; fixed?: PatchItem[] };
}

/** The name shown for a release: its label, else its version. */
export const versionName = (n: Pick<PatchNote, 'version' | 'label'>) => n.label ?? n.version;

/** The running build's version name (package.json's version, or that release's label). */
export function appVersionName(pkgVersion: string = __APP_VERSION__): string {
  const n = PATCH_NOTES.find((x) => x.version === pkgVersion);
  return n ? versionName(n) : pkgVersion;
}

export const PATCH_NOTES: PatchNote[] = [
  {
    version: '1.2.3',
    label: '1.2.2.1',
    date: '2026-11-26',
    groups: {
      fixed: [
        { keyword: 'Profit graph fix', text: 'the graph now shows what you earned minus what you spent (plus investment gains), like Saved on the month card. Balance corrections such as an eSewa “Update balance” no longer count as profit.' },
        { keyword: 'Header fix', text: 'the greeting no longer shows twice or overlaps the top bar while scrolling.' },
        { keyword: 'Sync reliability', text: 'if the server is missing a new column, only that change waits; everything else keeps syncing, and Settings → Sync shows the exact SQL to run.' },
      ],
      improved: [{ keyword: 'Plain graph card', text: 'the Home graph card is back to the same solid style as the other cards.' }],
    },
  },
  {
    version: '1.2.2',
    date: '2026-11-26',
    groups: {
      new: [
        { keyword: 'Profit graph', text: 'switch the main card on Home to Graph to see your profit or loss day by day for 1W, 1M, 3M, 1Y or All. Green above zero, red below, and it always agrees with the monthly audit. Drag across it to see any day.' },
        { keyword: 'Personal greeting', text: 'Home says good morning, afternoon, evening or night with your name. Set it once when asked, or any time in Settings → Profile.' },
      ],
      improved: [
        { keyword: 'Frosted cards', text: 'the main Home card is now frosted glass, with a solid look when Reduce Transparency is on.' },
      ],
    },
  },
  {
    version: '1.2.1',
    date: '2026-11-26',
    groups: {
      new: [
        { keyword: 'Custom categories', text: 'tap New at the end of the category grid when adding an expense or income. Pick a name, icon and colour, and it’s selected right away without losing what you typed.' },
        { keyword: 'More default categories', text: 'Repairs & Maintenance (watch, phone, gadgets, vehicle), Watch & Accessories, Hobbies, Gadgets & Electronics, Subscriptions, Groceries, Eating Out, Clothing, Personal Care, Internet & Mobile data, Gifts & Donations, Fees & Charges, Insurance and Taxes. Only the ones you didn’t already have are added, and your own edits are kept.' },
        { keyword: 'Patch notes', text: 'this page. It shows what changed in each release, newest first.' },
      ],
      improved: [
        { keyword: 'Category picker', text: 'most-used first. A long list folds behind More, and a search box appears when it’s open.' },
        { keyword: 'More icons and colours', text: 'watch, cart, wrench, umbrella, sparkles and more, plus violet and purple.' },
      ],
    },
  },
  {
    version: '1.2.0',
    date: '2026-11-26',
    groups: {
      new: [
        { keyword: 'eSewa balance check', text: 'type the balance from the eSewa app and Dreams records the difference as a correction, never as income or spending. A nudge appears when it hasn’t been confirmed for a week.' },
        { keyword: 'Statement import', text: 'import a CSV file or pasted text into an e-wallet. You map the columns once, preview every row, pick categories, and re-importing the same file adds nothing.' },
        { keyword: 'Wallet audit', text: 'opening, in, out, closing, fees, top categories and merchants for each e-wallet, on the account screen and as its own section in the monthly audit.' },
        { keyword: 'Face ID lock', text: 'unlock with Face ID, with your PIN always there as a fallback. It’s a screen lock: it hides Dreams, it doesn’t encrypt the data.' },
      ],
      improved: [
        { keyword: '6-digit PINs', text: 'new PINs are 6 digits. Existing 4-digit PINs keep working.' },
        { keyword: 'Forgot PIN', text: 'sign in with your sync account to set a new PIN without erasing anything.' },
      ],
      fixed: [{ keyword: 'Forgot PIN choices', text: 'they appeared under the lock screen and couldn’t be tapped.' }],
    },
  },
  {
    version: '1.1.0',
    date: '2026-11-25',
    groups: {
      new: [
        { keyword: 'Sync', text: 'sign in with your email and password to keep your iPhones in step through your own Supabase project. Auto-sync is off until you turn it on.' },
        { keyword: 'Sign In to Sync', text: 'a new iPhone can pull everything from the welcome screen before setting anything up.' },
      ],
      fixed: [{ keyword: 'Hosted builds', text: 'sync settings now reach builds made on Cloudflare Pages.' }],
    },
  },
  {
    version: '1.0.0',
    date: '2026-11-25',
    groups: {
      new: [
        { keyword: 'Accounts and transactions', text: 'cash, bank, e-wallet, savings and investments, with a quick keypad for expenses, income and transfers.' },
        { keyword: 'Debts', text: 'track what you owe and what you’re owed, with payments and due dates.' },
        { keyword: 'Dreams', text: 'save towards goals with a pace and an expected finish date.' },
        { keyword: 'Monthly audit', text: 'where the month’s money went, close the month and write a reflection.' },
        { keyword: 'Backup and export', text: 'one backup file you can restore, and a CSV of every transaction.' },
        { keyword: 'App lock', text: 'a PIN with auto-lock and a privacy cover in the app switcher.' },
        { keyword: 'Works offline', text: 'install it on the Home Screen; everything stays on your iPhone.' },
      ],
    },
  },
];
