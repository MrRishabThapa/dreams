# Contributing

## Every change
- Work on `main`. One file per commit, with a message that says what changed in that file.
- Money is integer paisa, deletes are soft (`deleted_at`), and every write goes through `src/db/repo.ts`
  so `updated_at` and the sync `dirty` flag are set.
- `npm run typecheck`, `npm test` and `npm run e2e` pass before a release.

## Every release
1. Add an entry at the **top** of `src/data/patchNotes.ts`: the version, the date, and short
   New / Improved / Fixed items (`keyword` in a few words, then a plain sentence). This is what
   people see in Settings → Patch notes.
2. Bump `version` in `package.json` (`npm version X.Y.Z --no-git-tag-version`) to the same version.
   For a release named outside semver (e.g. "v1.2.2.1"), use the next semver in package.json (1.2.3) and set
   `label: '1.2.2.1'` on the entry: the app shows the label, ordering uses the semver.
3. Add the same release to `CHANGELOG.md`.
4. Tag it: `git tag -a vX.Y.Z -m "Dreams vX.Y.Z"` (or `vX.Y.Z.W` for a labelled release).
5. If a synced table gets a new column: add it to its `create table` in `supabase/schema.sql`, to the
   idempotent "Schema changes" block at the end, to `NEWER_COLUMNS` in `src/sync/schema.ts`, and to the
   DEPLOY.md table. Rishab runs the SQL **before** the release is deployed.

If `package.json` and the newest patch-notes entry disagree, both `npm test` (`src/data/patchNotes.test.ts`)
and `npm run build` fail, so a release can't ship without its notes.
