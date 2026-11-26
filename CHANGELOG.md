# Changelog

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
