// Read-only smoke checks of the deployed files; never creates commercial records.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const base = 'https://los-panitas-by-nechy.web.app';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function get(path) {
  const response = await fetch(new URL(path, base), { cache: 'no-store' });
  if (!response.ok) throw Error(`Download failed: ${path} (${response.status})`);
  return response;
}
const expected = JSON.parse(await readFile(new URL('../release.json', import.meta.url), 'utf8'));
const manifest = await (await get('/downloads/update.json')).json();
if (manifest.versionCode !== expected.versionCode || manifest.versionName !== expected.versionName) throw Error('Published release is outdated.');
const terminal = Buffer.from(await (await get(manifest.artifact.url)).arrayBuffer());
if (terminal.length !== manifest.artifact.size || digest(terminal) !== manifest.artifact.sha256.toLowerCase()) throw Error('Terminal archive checksum mismatch.');
const management = await (await get('/downloads/management.json')).json();
const redirected = await get('/downloads/LosPanitas-Gestion-Android.apk');
const apk = Buffer.from(await redirected.arrayBuffer());
if (apk.length !== management.size || apk.length < 4 || apk.readUInt32LE(0) !== 0x04034b50 || digest(apk) !== management.sha256) throw Error('Management APK download invalid.');
const page = await get('/');
const html = await page.text();
if (html !== await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')) throw Error('Published HTML differs from the validated build.');
for (const [, path] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
  const live = Buffer.from(await (await get(path)).arrayBuffer());
  const built = await readFile(new URL('../dist' + path, import.meta.url));
  if (digest(live) !== digest(built)) throw Error(`Asset checksum mismatch: ${path}`);
}
console.log(JSON.stringify({ version: manifest.versionName, code: manifest.versionCode,
  terminalZipIntegrity: true, managementRedirect: redirected.redirected, managementIntegrity: true,
  managementBytes: apk.length, webMatchesBuild: true, csp: !!page.headers.get('content-security-policy') }));
