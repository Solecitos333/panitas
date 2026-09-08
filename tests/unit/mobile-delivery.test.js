import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
test('la instalación móvil abre el dashboard y ofrece iconos de tamaños reales', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.start_url, '/?mode=management#dashboard');
  assert.equal(manifest.display, 'standalone');
  for (const size of [192, 512]) {
    const item = manifest.icons.find(i => i.sizes === `${size}x${size}`);
    assert.ok(item);
    const png = readFileSync(new URL('../../public' + item.src, import.meta.url));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  assert.match(read('index.html'), /apple-touch-icon/);
});
test('la APK personal no solicita privilegios de terminal ni recibe direcciones arbitrarias', () => {
  const manifest = read('android-management/AndroidManifest.xml');
  assert.doesNotMatch(manifest, /uses-permission|device_admin|usb|receiver|service/i);
  const activity = read('android-management/src/com/panitas/management/MainActivity.java');
  assert.match(activity, /https:\/\/los-panitas-by-nechy\.web\.app\/\?mode=management#dashboard/);
  assert.doesNotMatch(activity, /getIntent\(\)|new WebView|import android\.webkit|addJavascriptInterface\(/);
});
test('Google dispone de frames y popup, y el service worker no almacena el intercambio de acceso', () => {
  const config = JSON.parse(read('firebase.json'));
  const headers = config.hosting.headers.find(h => h.source === '**').headers;
  assert.match(headers.find(h => h.key === 'Content-Security-Policy').value, /frame-src.*los-panitas-by-nechy\.firebaseapp\.com/);
  assert.equal(headers.find(h => h.key === 'Cross-Origin-Opener-Policy').value, 'same-origin-allow-popups');
  assert.match(read('public/sw.js'), /startsWith\('\/__\/auth\/'\)/);
});

test('la descarga Android se redirige al repositorio y compilar ELO no borra otros APKs', () => {
  const config = JSON.parse(read('firebase.json'));
  const redirect = config.hosting.redirects.find(r => r.source === '/downloads/LosPanitas-Gestion-Android.apk');
  assert.equal(redirect.type, 302);
  assert.equal(redirect.destination, 'https://github.com/Solecitos333/panitas/releases/download/gestion-v1.0.0/LosPanitas-Gestion-Android.apk');
  assert.doesNotMatch(read('tools/build-apk.ps1'), /Get-ChildItem[^\r\n]*apk[^\r\n]*\|\s*Remove-Item/);
  assert.match(read('tools/build-management-apk.ps1'), /build\\release/);
});
