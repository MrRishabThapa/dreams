import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * Fills %SUPABASE_ORIGIN% in the CSP (index.html <meta> and the Cloudflare _headers file)
 * from VITE_SUPABASE_URL at build time, so connect-src allows exactly that one origin.
 */
function supabaseCsp(origin: string): Plugin {
  return {
    name: 'dreams-supabase-csp',
    transformIndexHtml: (html) => html.replace(/ ?%SUPABASE_ORIGIN%/g, origin ? ` ${origin}` : ''),
    closeBundle() {
      const f = new URL('./dist/_headers', import.meta.url);
      if (existsSync(f)) writeFileSync(f, readFileSync(f, 'utf8').replace(/ ?%SUPABASE_ORIGIN%/g, origin ? ` ${origin}` : ''));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  let supabaseOrigin = '';
  try {
    supabaseOrigin = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : '';
  } catch {
    supabaseOrigin = '';
  }
  return {
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
