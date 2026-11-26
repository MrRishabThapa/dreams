# Deploying Dreams and installing it on your phone

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

Sync needs the Supabase URL and publishable key **at build time**. Locally they come from
`.env.local` (gitignored; copy `.env.example` and fill it in if it's missing):

```
VITE_SUPABASE_URL=https://cshqseusqlbwhgpfynyf.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_…   # the publishable key, never the secret/service-role key
```

```bash
npx wrangler login                 # opens the browser once to sign in to Cloudflare
npm run deploy                     # builds (reading .env.local), then uploads dist/ to the "dreams" Pages project
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
   - Environment variables (Production **and** Preview; they're read at build time, so set them
     before the first build and redeploy after changing them):
     - `NODE_VERSION` = `22`
     - `VITE_SUPABASE_URL` = `https://cshqseusqlbwhgpfynyf.supabase.co`
     - `VITE_SUPABASE_ANON_KEY` = the **publishable** key (`sb_publishable_…`). Both are public by
       design and ship in the app; never put the secret/service-role key or the database password here.
     - Add them as plain **Text** variables, not encrypted secrets: they are needed by `npm run build`.
4. Save and deploy.

Check the build log for one line: **`[dreams] sync configured: yes (https://…supabase.co)`**. On Cloudflare a
build without the two variables now **fails** with a message saying what to add (set
`DREAMS_ALLOW_NO_SYNC=1` only if you really want a build without sync). The key is never printed.

**Don't add a `wrangler.toml` to this repo.** When a Pages project has one, Cloudflare treats it as the
source of truth and the dashboard variables above are not applied to the build. That's exactly
what broke the first v1.1 deploy: the dashboard listed the variables but the build never saw them.
`npm run deploy` passes `--project-name dreams` itself, so no Wrangler file is needed.

`public/_headers` (security headers, CSP, caching) is picked up automatically in both cases. The build
fills the Supabase origin into the CSP's `connect-src`, so the app can talk to that one project only.
If a build has no Supabase variables, Dreams still works fully; Settings → Sync just says it isn't set up.

## 3. Install on the phone

### iPhone (iOS 16+)

1. Open the `https://…pages.dev` address in **Safari** (not Chrome; only Safari can install on iOS).
2. Tap **Share** → **Add to Home Screen** → name it **Dreams** → **Add**.
3. Open Dreams **from the Home Screen icon**. Add your accounts there, **not in the Safari tab**:
   Safari and the installed app keep separate storage on iOS.

### Android (Chrome)

1. Open the same address in **Chrome**.
2. Tap **⋮** → **Install app** (or **Add to Home screen**), or accept Chrome's install prompt.
3. Open **Dreams** from the app drawer. On Android the installed app and the Chrome tab share the
   same storage for the site.

Optional on both: Settings → App Lock to require a PIN.

To start from an existing backup instead, tap **Restore from a Backup** on the welcome screen and
pick the `.json` file (Files or iCloud Drive on iPhone; Files or Drive on Android).

## 4. Smoke test on the phone

- Turn on **Airplane Mode**, close Dreams from the app switcher, open it again: it should open
  and let you add an expense.
- Check the status bar, safe areas around the notch and home indicator, the keyboard over sheets,
  and scrolling smoothness.
- Settings → **Back Up Now** → save to Files. Keep a backup until sync arrives.
- **Face ID (v1.2):** open Dreams **from the Home Screen icon**, Settings → App Lock → set a PIN →
  turn on **Lock with Face ID** (Face ID asks once to confirm). Close Dreams from the app switcher
  and reopen: Face ID should unlock. If the toggle says it isn't available or Face ID never appears
  (WebAuthn in iOS 16 Home Screen apps has been unreliable), keep PIN only: it is fully supported.
- **Build check:** the Cloudflare build log should still show
  `[dreams] sync configured: yes (https://cshqseusqlbwhgpfynyf.supabase.co)`.

## 5. Updating

Run `npm run deploy` again (or push, with option B). Next time Dreams opens online it shows
**Update available · Reload**; tap Reload. Your data is untouched by updates.

**Database changes:** some releases add a column to Supabase. Run the matching file from
[`supabase/migrations/`](supabase/migrations/) in the Supabase SQL editor **before** using the new
feature on a synced device (a fresh project just runs `supabase/schema.sql`, which already has it).

| Release | Run | Needed for |
|---|---|---|
| v1.2.2 | `20261126_user_settings_display_name.sql` (adds `user_settings.display_name`) | the name in the Home greeting. Until it's run, setting a name makes sync show an error: other changes still upload, but nothing downloads from your other devices. Nothing is lost; it all syncs once the column exists. |

## Sync (v1.1): the first real sync

Supabase is already set up (schema run, one user, sign-ups off). On the iPhone:

1. Open Dreams (from the Home Screen icon) while online.
2. **Settings → Sync → Email + Password** of the Supabase user → **Sign In**. There's no sign-up
   and no email link: the password is typed in the app. Dreams uploads everything right away.
   The status reads **Synced** with **0** changes to send.
3. Optional: turn on **Auto-sync** (off by default). Off: when you come back online with
   changes, Dreams asks "You're online. Sync N changes?". On: it syncs on open, when you come
   back online, and a few seconds after each change.
4. Check it reached Supabase: dashboard → Table Editor → `transactions` shows your rows.

**Second device** (or after reinstalling): on the welcome screen tap **Sign In to Sync** *before*
setting anything up. Dreams pulls everything and opens straight into your data.

**Good to know**
- Everything still works offline; changes wait on the phone and sync later. Nothing is lost if a
  sync fails halfway: the next sync finishes it.
- Edits on two devices: the most recent edit wins (by edit time). An older offline edit never
  overwrites a newer one.
- **Sign Out** only stops syncing on that device. It never deletes local data.
- Free Supabase projects pause after about a week without use. Dreams then says the project is
  paused: open supabase.com → the `dreams` project → **Restore**, then Sync again.
- Keep the occasional JSON backup too (Settings → Back Up Now); it's independent of Supabase.
