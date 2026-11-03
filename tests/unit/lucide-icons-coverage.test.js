import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.html')) {
      results.push(fullPath);
    }
  });
  return results;
}

test('Lucide Icons Coverage: todos los iconos data-lucide utilizados en src están registrados en app.js', () => {
  const rootDir = path.resolve('src');
  const files = getFiles(rootDir);
  const usedIcons = new Set();
  const regex = /data-lucide=["']([^"']+)["']/g;

  files.forEach((f) => {
    const content = fs.readFileSync(f, 'utf8');
    let match;
    while ((match = regex.exec(content)) !== null) {
      const icon = match[1];
      if (!icon.includes('$') && !icon.includes('{')) {
        usedIcons.add(icon);
      }
    }
  });

  const appJsPath = path.resolve('src/ui/app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const iconsMatch = appJs.match(/const icons = {([\s\S]*?)};/);
  assert.ok(iconsMatch, 'app.js debe definir el objeto icons');

  const registered = new Set(
    iconsMatch[1].split(/[\s,]+/).filter(Boolean)
  );

  const missing = [];
  usedIcons.forEach((icon) => {
    const key = icon.replace(/(^|[-_\s]+)(\w)/g, (_, separator, letter) => letter.toUpperCase());
    if (!registered.has(key)) {
      missing.push({ icon, key });
    }
  });

  assert.deepEqual(missing, [], `Existen iconos data-lucide sin registrar en app.js: ${JSON.stringify(missing)}`);
});
