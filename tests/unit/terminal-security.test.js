import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('la APK de producción no expone el puente de caja mediante depuración WebView', () => {
  const source = readFileSync(new URL('../../android-elo-kiosk/app/src/main/java/com/panitas/pos/MainActivity.java', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /setWebContentsDebuggingEnabled\(\s*true\s*\)/);
  assert.match(source, /setWebContentsDebuggingEnabled\(\s*\(getApplicationInfo\(\)\.flags\s*&\s*ApplicationInfo\.FLAG_DEBUGGABLE\)\s*!=\s*0\s*\)/);
});
