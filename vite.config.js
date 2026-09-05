import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// También las entregas que solo cambian la web deben renovar el Service Worker.
// El identificador depende del contenido, no de la fecha de compilación.
function versionServiceWorker() {
  let outputDirectory;
  return {
    name: 'panitas-version-service-worker',
    apply: 'build',
    configResolved(config) { outputDirectory = resolve(config.root, config.build.outDir); },
    async writeBundle() {
      const hash = createHash('sha256');
      async function includeDirectory(directory, prefix = '') {
        const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
        for (const entry of entries) {
          const name = `${prefix}${entry.name}`;
          if (name === 'downloads') continue;
          const path = join(directory, entry.name);
          if (entry.isDirectory()) await includeDirectory(path, `${name}/`);
          else {
            hash.update(name).update('\0');
            hash.update(await readFile(path)).update('\0');
          }
        }
      }
      await includeDirectory(outputDirectory);
      const workerPath = join(outputDirectory, 'sw.js');
      const worker = await readFile(workerPath, 'utf8');
      if (!worker.includes('__BUILD_ID__')) throw new Error('Falta la marca de versión del Service Worker.');
      await writeFile(workerPath, worker.replaceAll('__BUILD_ID__', hash.digest('hex').slice(0, 20)));
    }
  };
}

export default defineConfig({
  plugins: [versionServiceWorker()],
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
