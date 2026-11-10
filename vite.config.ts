import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // Vite loads .env/.env.local from `envDir` and bakes the result into `import.meta.env` at transform
  // time — Vitest's own `test.env` (process.env injection) runs too late to affect that. Point envDir at
  // `tests/` (which never has .env files) specifically for Vitest runs (it sets process.env.VITEST),
  // so tests/cloud.optionality.test.ts always sees the true "no Firebase configured" default regardless
  // of a developer's own .env.local (real Firebase dev config, or FIREBASE_SETUP.md's emulator dummy
  // values) sitting in the project root. `npm run dev` / `npm run build` are unaffected.
  envDir: process.env.VITEST ? fileURLToPath(new URL('./tests', import.meta.url)) : undefined,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Smart Family Frame',
        short_name: 'Family Frame',
        description: 'A smart digital family photo frame with clock, calendar, notes, reminders and scheduling. Works fully offline.',
        theme_color: '#1a1512',
        background_color: '#0e0c0b',
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Fixed, DISTINCTIVE ports so the URLs in README/RECOVERY are always right and no other Vite project on this Mac
  // (which would default to 5173/4173) can share the frame's browser origin, service worker or IndexedDB data.
  // If a port is busy, Vite stops with a clear error instead of silently picking another port (which would change
  // the browser origin and make the frame's data look missing).
  server: { port: 5400, strictPort: true },   // development:  http://localhost:5400
  preview: { port: 4400, strictPort: true },  // daily frame:  http://localhost:4400
  build: { target: 'es2020', sourcemap: false },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
