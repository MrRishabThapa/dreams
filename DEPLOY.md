# Deploying Dreams and installing it on the iPhone

Dreams is a static PWA: one `dist/` folder, no server and no secrets. It's hosted free on
Cloudflare Pages (HTTPS is required for the service worker that makes it work offline).

## 1. Check the build locally

```bash
npm ci
npm test            # unit tests (Vitest)
npm run e2e         # WebKit iPhone X tests; on Arch run scripts/setup-webkit-arch.sh once first
npm run build       # writes dist/
npm run preview     # optional: http://localhost:4173
```

## 2. Deploy to Cloudflare Pages

Pick one of these. Both give you a `https://dreams-xxx.pages.dev` address.

### Option A: from this computer (no GitHub needed)

```bash
npx wrangler login                 # opens the browser once to sign in to Cloudflare
npm run deploy                     # builds, then uploads dist/ to the "dreams" Pages project
```

The first run asks to create the `dreams` project: accept, and choose `main` as the production branch.
Every later `npm run deploy` publishes a new version.

### Option B: from GitHub (deploys on every push)

1. Push this repo to a private GitHub repository.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Build settings:
   - Framework preset: **None**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variable: `NODE_VERSION` = `22`
4. Save and deploy.

`public/_headers` (security headers, CSP, caching) is picked up automatically in both cases.

## 3. Install on the iPhone (iOS 16)

1. Open the `https://…pages.dev` address in **Safari** (not Chrome; only Safari can install).
2. Tap **Share** → **Add to Home Screen** → name it **Dreams** → **Add**.
3. Open Dreams **from the Home Screen icon**. Add your accounts there, **not in the Safari tab**:
   Safari and the installed app keep separate storage on iOS.
4. Optional: Settings → App Lock to require a PIN.

To start from an existing backup instead, tap **Restore from a Backup** on the welcome screen and
pick the `.json` file (from Files or iCloud Drive).

## 4. Smoke test on the phone

- Turn on **Airplane Mode**, close Dreams from the app switcher, open it again: it should open
  and let you add an expense.
- Check the status bar, safe areas around the notch and home indicator, the keyboard over sheets,
  and scrolling smoothness.
- Settings → **Back Up Now** → save to Files. Keep a backup until sync arrives.

## 5. Updating

Run `npm run deploy` again (or push, with option B). Next time Dreams opens online it shows
**Update available · Reload**; tap Reload. Your data is untouched by updates.

## Later: sync (Phase 5)

Not part of v1.0. When it's added:
1. Create a Supabase project, open the SQL editor and run `supabase/schema.sql`.
2. Authentication → add your one user, then turn **off** public sign-ups.
3. Copy `.env.example` to `.env` and paste the project URL and **anon** key there yourself
   (never the service-role key, never in chat).
4. Add the project origin to `connect-src` in `public/_headers` and in the CSP `<meta>` in `index.html`.
