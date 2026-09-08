import { access, readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const required = [
  'index.html', 'logo.png', 'manifest.webmanifest', 'sw.js',
  'downloads/update.json', 'downloads/LosPanitas-Elo-POS-APK.zip', 'downloads/SHA256SUMS.txt',
  'downloads/management.json', 'icons/app-192.png', 'icons/app-512.png', 'icons/apple-touch-icon.png'
];

for (const name of required) await access(new URL(name, dist));
const management = JSON.parse(await readFile(new URL('downloads/management.json', dist), 'utf8'));
const firebase = JSON.parse(await readFile(new URL('firebase.json', root), 'utf8'));
const redirect = firebase.hosting.redirects?.find(r => r.source === '/downloads/LosPanitas-Gestion-Android.apk');
if (!redirect || redirect.destination !== management.url || !management.url.startsWith('https://github.com/Solecitos333/panitas/releases/download/')
  || !/^[a-f0-9]{64}$/.test(management.sha256) || management.size < 1000) throw new Error('La descarga externa de gestión no está configurada.');

const distPath = fileURLToPath(dist);
const files = await walk(distPath);
const forbidden = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /github_pat_[A-Za-z0-9_]{40,}/,
  /gh[opusr]_[A-Za-z0-9]{30,}/,
  /["']type["']\s*:\s*["']service_account["']/,
  /["']private_key["']\s*:\s*["']-----BEGIN/
];

for (const file of files) {
  const info = await stat(file);
  if (info.size > 5_000_000) throw new Error(`${relative(distPath, file)} supera 5 MB.`);
  if (!/\.(?:html|js|css|json|svg|webmanifest)$/i.test(file)) continue;
  const contents = await readFile(file, 'utf8');
  for (const pattern of forbidden) if (pattern.test(contents)) throw new Error(`Posible secreto en ${relative(distPath, file)}.`);
}

const html = await readFile(new URL('index.html', dist), 'utf8');
if (!html.includes('manifest.webmanifest')) throw new Error('Falta el manifiesto PWA.');
const worker = await readFile(new URL('sw.js', dist), 'utf8');
if (worker.includes('__BUILD_ID__') || !/panitas-pos-[0-9a-f]{20}/.test(worker)) {
  throw new Error('El Service Worker no contiene la versión de contenido generada para esta entrega.');
}
console.log(`Build validado: ${files.length} archivos, sin secretos detectados.`);

async function walk(folder) {
  const result = [];
  for (const name of await readdir(folder)) {
    const path = join(folder, name);
    if ((await stat(path)).isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}
