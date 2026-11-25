# Dreams

Rishab's private, offline-first money app for iPhone, installed as a PWA.
**Know your money. Fund your dreams.**

- Accounts, transactions (expense, income, transfer, adjustment) with a custom keypad
- Debts (I owe / owed to me) with payments and due dates
- Dreams: savings goals with progress, pace and ETA
- A monthly audit with a reconciled net-worth walk, insights, reflection and Close month
- Backup / restore (JSON), CSV and text export, app lock with PIN
- Optional Supabase sync (email + password, last-write-wins, offline-first)
- Works fully offline. All money is integer paisa.

## Develop

```bash
npm ci
npm run dev            # http://localhost:5173 (design kit at /_kit)
npm test               # Vitest: domain rules, repo, backup, demo year, reconciliation properties
npm run e2e            # Playwright WebKit, iPhone X emulation (incl. offline)
SHOTS=1 npm run e2e -- e2e/screenshots.spec.ts e2e/screenshots-demo.spec.ts   # light/dark screenshots
npm run demo           # dev-only: writes demo-backup.json (a realistic year to restore)
```

On Arch Linux, run `scripts/setup-webkit-arch.sh` once so Playwright's WebKit can start.

## Layout

- `src/domain/`: pure rules (ledger, debts, dreams, audit). Unit-tested.
- `src/db/`: Dexie database, the single write path (`repo.ts`), backup, sync bookkeeping.
- `src/sync/`: Supabase sync (engine, lazy supabase-js adapter, controller). Needs `.env.local` (see `.env.example`).
- `src/ui/`, `src/sheets/`, `src/screens/`: the iOS-style interface.
- `supabase/schema.sql`: the Supabase database (tables, RLS, stale-write trigger).

Deploying and installing: see [DEPLOY.md](DEPLOY.md).
