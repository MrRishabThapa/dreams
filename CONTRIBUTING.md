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
3. Add the same release to `CHANGELOG.md`.
4. Tag it: `git tag -a vX.Y.Z -m "Dreams vX.Y.Z"`.

If `package.json` and the newest patch-notes entry disagree, both `npm test` (`src/data/patchNotes.test.ts`)
and `npm run build` fail, so a release can't ship without its notes.
