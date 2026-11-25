import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { checkSyncEnv, resolveSyncEnv } from './scripts/sync-env.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * Fills %SUPABASE_ORIGIN% in the CSP (index.html <meta> and the Cloudflare _headers file)
 * from VITE_SUPABASE_URL at build time, so connect-src allows exactly that one origin.
 */
function supabaseCsp(origin: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'dreams-supabase-csp',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    transformIndexHtml: (html) => html.replace(/ ?%SUPABASE_ORIGIN%/g, origin ? ` ${origin}` : ''),
    closeBundle() {
      const f = resolve(outDir, '_headers');
      if (existsSync(f)) writeFileSync(f, readFileSync(f, 'utf8').replace(/ ?%SUPABASE_ORIGIN%/g, origin ? ` ${origin}` : ''));
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // .env* files live here; DREAMS_ENV_DIR lets the build test point at an empty folder
  const envDir = process.env.DREAMS_ENV_DIR || process.cwd();
  // loadEnv merges .env* files with VITE_* vars from the process environment (hosted builds)
  const sync = resolveSyncEnv(loadEnv(mode, envDir, 'VITE_'));
  if (command === 'build') checkSyncEnv(sync, process.env);
  const supabaseOrigin = sync.origin;
  return {
  envDir,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    supabaseCsp(supabaseOrigin),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['apple-touch-icon.png', 'favicon.png', 'logo-mark.png', 'boot.js'],
      manifest: {
        name: 'Dreams',
        short_name: 'Dreams',
        description: 'Know your money. Fund your dreams.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F2F2F7',
        theme_color: '#7C3AED',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // the 1 MB source logo is only an input to scripts/make-icons.sh
        globIgnores: ['**/logo.png'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // never cache Supabase API or auth responses: always straight to the network
        runtimeCaching: [{ urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\//, handler: 'NetworkOnly' }],
      },
      devOptions: { enabled: false },
    }),
  ],
  esbuild: { target: 'safari16' },
  optimizeDeps: { esbuildOptions: { target: 'safari16' } },
  build: { target: 'safari16', cssTarget: 'safari16', sourcemap: false },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
  },
} as any;
});
