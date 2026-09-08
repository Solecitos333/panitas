import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const base = resolve(root, 'android-elo-kiosk/build_temp');
const output = resolve(process.argv[2] || '');
if (output !== join(base, 'assets', 'www')) throw new Error('Destino de assets no permitido.');
await mkdir(output, { recursive: true });
const source = join(base, 'web-dist');
async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const src = join(from, entry.name), dest = join(to, entry.name);
    if (entry.isDirectory()) await copyTree(src, dest);
    else if (entry.isFile()) await copyFile(src, dest);
    else throw new Error('No se permiten enlaces en la interfaz empaquetada.');
  }
}
await copyTree(source, output);
await copyTree(join(root, 'public', 'icons'), join(output, 'icons'));
for (const name of ['compat.js', 'logo.png', 'receipt_logo.png', 'manifest.webmanifest']) {
  await copyFile(join(root, 'public', name), join(output, name));
}
// No web fonts to download before painting the local interface.
for (const entry of await readdir(join(output, 'assets'))) {
  if (!entry.endsWith('.css')) continue;
  const path = join(output, 'assets', entry);
  const css = await readFile(path, 'utf8');
  if (css.includes('fonts.googleapis.com')) throw new Error('La interfaz local todavía contiene fuentes remotas.');
}
const index = await readFile(join(output, 'index.html'), 'utf8');
if (!index.includes('/assets/') || !index.includes('/compat.js')) throw new Error('Interfaz local incompleta.');
await writeFile(join(output, 'shell-version.json'), await readFile(join(root, 'release.json')));
console.log('Interfaz compilada empaquetada; sin instaladores, fuentes remotas ni service worker.');
