import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Android 8.1 de la ELO puede conservar un WebView anterior a Chromium 85.
    // Esbuild transpila optional chaining/nullish coalescing para Chromium 61.
    target: 'chrome61',
    sourcemap: false,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@firebase') || id.includes('node_modules/firebase')) return 'firebase';
          if (id.includes('node_modules/lucide')) return 'icons';
        }
      }
    }
  },
  server: {
    port: 4173,
    strictPort: true
  },
  preview: {
    port: 4174,
    strictPort: true
  }
});
