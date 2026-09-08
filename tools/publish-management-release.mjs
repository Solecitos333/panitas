// Publish only the prebuilt management APK to the project's existing repository.
// Credentials stay inside this process; no token or service key is written.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const meta = JSON.parse(await readFile(new URL('../public/downloads/management.json', import.meta.url), 'utf8'));
const bytes = await readFile(new URL('../android-management/build/release/LosPanitas-Gestion-Android.apk', import.meta.url));
if (bytes.length !== meta.size || createHash('sha256').update(bytes).digest('hex') !== meta.sha256) throw Error('Rebuild management metadata before publishing.');
if (meta.tag !== 'gestion-v1.0.0' || meta.filename !== 'LosPanitas-Gestion-Android.apk') throw Error('Unexpected release identity.');
const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Commit the validated sources first.');
const credentials = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } });
if (credentials.status !== 0) throw Error('GitHub authentication required.');
const token = credentials.stdout.split('\n').find(line => line.startsWith('password='))?.slice(9);
if (!token) throw Error('GitHub authentication required.');
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Panitas-release', 'X-GitHub-Api-Version': '2022-11-28' };
const api = 'https://api.github.com/repos/Solecitos333/panitas';
async function call(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  if (!response.ok) throw Error(`GitHub operation failed (${response.status}). No credentials logged.`);
  return response.json();
}
const response = await fetch(`${api}/releases/tags/${meta.tag}`, { headers });
if (!response.ok && response.status !== 404) throw Error(`Release lookup failed (${response.status}).`);
let release = response.ok ? await response.json() : await call(`${api}/releases`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    tag_name: meta.tag, target_commitish: commit, name: 'Panitas Gestión para Android 1.0.0', draft: true,
    body: 'Aplicación de acceso al dashboard del negocio mediante el navegador seguro del teléfono. Requiere una cuenta autorizada y conexión a Internet. No controla impresora ni gaveta. Instala LosPanitas-Gestion-Android.apk.\n\nSHA-256: ' + meta.sha256
  })
});
const previous = release.assets?.find(a => a.name === meta.filename);
if (previous) {
  if (previous.digest !== `sha256:${meta.sha256}` || previous.size !== meta.size) throw Error('Existing asset differs; publish a NEW release instead of overwriting.');
} else {
  await call(`https://uploads.github.com/repos/Solecitos333/panitas/releases/${release.id}/assets?name=${encodeURIComponent(meta.filename)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/vnd.android.package-archive' }, body: bytes
  });
}
if (release.draft) release = await call(`${api}/releases/${release.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false, make_latest: 'false' }) });
const download = await fetch(meta.url);
if (!download.ok) throw Error(`Public asset unavailable (${download.status}).`);
const received = Buffer.from(await download.arrayBuffer());
if (createHash('sha256').update(received).digest('hex') !== meta.sha256) throw Error('Public APK checksum mismatch.');
console.log(JSON.stringify({ release: release.html_url, url: meta.url, size: received.length, verified: true }));
