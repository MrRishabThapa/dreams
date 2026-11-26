# Changelog

## v1.2.2.1 (package 1.2.3, 2026-11-26)

**Profit graph fix**
- Bug: the graph plotted the change in *net worth*, so a balance correction counted as profit. On the iPhone, the
  graph showed +Rs 1,623 while the month card said Saved −Rs 80: about Rs 1,703 of corrections (most likely an eSewa
  "Update balance" or a "Correct balance"), which change net worth but aren't income.
- Now: profit = income − spending + investment gain/loss over the range, by each transaction's own local date.
  Corrections, transfers, debt-linked transactions, opening balances, deleted rows and rows on deleted accounts are
  left out. A calendar month on the graph equals that month's Saved (+ investment gain/loss) in the audit.

**Header fix**
- The greeting showed twice while scrolling: Home's solid top bar let the large greeting show through under the
  compact one. The bar is blurred again, and the large title fades out as the compact "Good …, Name" fades in.

**Plain graph card**
- The Home graph card is back to the plain card style (no glass, sheen or glow). The graph itself is unchanged.

**Sync reliability**
- A server that lacks a column the app sends (e.g. `user_settings.display_name` before the v1.2.2 SQL) no longer
  stops the sync: only that table waits (its rows stay pending), everything else pushes and pulls.
- Sync checks the newer columns once per start; Settings → Sync shows **Server: Needs an update** with the exact SQL.
- `supabase/schema.sql` ends with an idempotent schema-changes block plus `notify pgrst, 'reload schema'`;
  DEPLOY.md has "Schema changes: run before deploying a client that uses new columns".
- Lock settings (PIN hash, Face ID credential id, auto-lock) are device-only and never in `user_settings` or the payload (tested).

**Version name:** shown as v1.2.2.1; package.json is 1.2.3 (npm needs semver, and 1.2.2-1 would sort before 1.2.2).

## v1.2.2 (2026-11-26)

**Profit graph**
- The main Home card switches between **Balance** and **Graph** (remembered on the device).
- Graph: profit or loss day by day for **1W · 1M · 3M · 1Y · All**. Profit is the change in net worth since the day
  before the range starts, the same figure as the monthly audit's net-worth change, so a whole month on the graph
  always equals that month in the audit. Own-account transfers change nothing; a debt opened with cash nets to zero.
  Quiet days carry the previous value. A range starts at the first recorded day if that's later.
- Stock-style: green above the dashed zero line, red below, split exactly where the line crosses zero, with a fading
  area fill. Headline with ▲/▼, +/− and the % change (en-IN grouping). Drag across to scrub: cursor, dot, and a
  tooltip with the date, profit and that day's income and spending; let go to return to today. Vertical swipes
  still scroll. Draw-in animation (none with Reduce Motion). Needs two days of data; until then a short note.
- One pass over the ledger per data change, then cheap per range.

**Personal greeting**
- "Good morning / afternoon / evening / night" by local hour (night is 21:00–05:00), with your name on its own line
  (long names truncate). Updates on resume.
- Settings → **Profile → Your name** (synced, `user_settings.display_name`). Home asks once if it's empty;
  "Not now" doesn't ask again.
- **Supabase:** run `supabase/migrations/20261126_user_settings_display_name.sql` before setting a name on a synced device.

**Frosted cards**
- The main Home card is frosted glass: translucent, blurred, inner highlight, violet-tinted shadow, a soft sheen
  behind it and a faint grain. Solid with Reduce Transparency or without `backdrop-filter`. Home's top bar is
  now solid instead of blurred, so the page keeps to two blurred surfaces (this card and the tab bar).

## v1.2.1 (2026-11-26)

**Categories**
- New category from the Add sheet: a **New** tile at the end of the category grid (expense or income) opens the
  editor (name, icon, colour). The new category is selected right away and the entry keeps its amount, date and note.
  Rename, recolour, reorder and delete (soft: past transactions keep the name) stay in Settings → Categories.
- More default categories: Repairs & Maintenance, Watch & Accessories, Hobbies, Gadgets & Electronics, Subscriptions,
  Groceries, Eating Out, Clothing, Personal Care, Internet & Mobile data, Gifts & Donations, Fees & Charges, Insurance, Taxes.
  Existing installs get only the ones they don't have (matched by name or a close alias such as Transport for
  Travel & Transport, deleted ones included). Existing categories are never changed. Default categories use the same id on every device,
  and their timestamp is older than any edit, so two devices never duplicate them and a rename on one wins.
- Picker: most-used first. Past 12 categories it folds to 10 tiles with **More**, and a search box appears when expanded.
- More icons (watch, cart, wrench, umbrella, sparkles…) and violet/purple colours.
- The audit, charts and statement import read categories from the table, so new and custom ones work there with no code change.

**Patch notes**
- Settings → About → **Patch notes**: the current version (from package.json at build time) and one card per release,
  newest first, with New / Improved / Fixed lists. Data in `src/data/patchNotes.ts`.
- The build fails if package.json's version and the newest patch-notes entry disagree.

## v1.2.0 (2026-11-26)

**eSewa and other e-wallets**
- Update balance (reconcile): type the balance from the eSewa app. The difference is saved as an
  `adjust` correction, so it's excluded from income and spending and shows under Corrections in the audit.
  Confirming an unchanged balance writes nothing. "Balance last confirmed N days ago" nudge after a week.
- Statement import: CSV file (delimiter and header detected, title lines skipped) or pasted text
  (one transaction per line). Manual column mapping (date, description, debit, credit or a signed
  amount, balance, reference, date order), remembered per layout. Preview with duplicates marked,
  rows that can't be read, a category per row, and a tie-out against the statement's closing balance.
  Dedupe by account, date, signed amount, and reference or description hash, so re-importing is safe.
  Description → category rules are learned. Everything is parsed on the device; Undo after import.
- Wallet audit on the account screen and as its own section in the monthly audit (and text export):
  opening, total in, total out, closing, transfers, corrections, fees, top categories and merchants,
  month-over-month. The net-worth identity is unchanged.
- No eSewa login or scraping; no eSewa password, MPIN, OTP or token is ever stored.

**Face ID app lock**
- Lock with Face ID via the WebAuthn platform authenticator (user verification required, rpId = host).
  The PIN is always the fallback; new PINs are 6 digits (existing 4-digit PINs keep working).
- Face ID is asked for automatically on the lock screen, with an "Unlock with Face ID" button.
- Forgot PIN: sign in with the sync account's email and password, then choose a new PIN. No local data is erased.
- Only the credential id is stored, device-local (never synced or backed up). The UI says plainly
  this is a screen lock, not encryption.
- Fix: the Forgot PIN choices appeared under the lock screen and couldn't be tapped.

## v1.1.0 (2026-11-25)
- Supabase sync (email + password, push/pull with cursors, auto-sync off by default), Cloudflare build env fix.

## v1.0.0 (2026-11-25)
- First release: accounts, transactions, debts, dreams, monthly audit, backup, app lock, PWA.
