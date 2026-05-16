import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@':           resolve(__dirname, 'src'),
      '@types':      resolve(__dirname, 'src/types'),
      '@lib':        resolve(__dirname, 'src/lib'),
      '@components': resolve(__dirname, 'src/components'),
      '@hooks':      resolve(__dirname, 'src/hooks'),
      '@store':      resolve(__dirname, 'src/store'),
    },
  },
  // Vite entry: index.html (legacy app saved as index.legacy.html)
  root: '.',
  build: {
    outDir:       'dist',
    sourcemap:    true,
    rollupOptions: {
      output: {
        // Manual chunking: vendor, medical-lib, app
        manualChunks(id) {
          if (id.includes('node_modules/react')) return 'vendor-react';
          if (id.includes('node_modules/zustand')) return 'vendor-state';
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas')) return 'vendor-export';
        },
      },
    },
  },
  // Vitest configuration
  test: {
    globals:     true,
    environment: 'jsdom',
    setupFiles:  ['src/tests/setup.ts'],
    // Exclude Playwright e2e tests — they run separately via `npm run test:e2e`
    exclude:     ['tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider:  'v8',
      reporter:  ['text', 'lcov'],
      include:   ['src/lib/**', 'src/store/**'],
    },
  },
});
