import { access, readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const required = ['index.html', 'logo.png', 'manifest.webmanifest', 'sw.js'];

for (const name of required) await access(new URL(name, dist));

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
