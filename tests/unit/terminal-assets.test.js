import test from 'node:test';
import assert from 'node:assert/strict';
import { stripRemoteFontImports } from '../../tools/lib/terminal-assets.mjs';
test('APK elimina imports de fuentes con pesos separados por punto y coma antes del hash de Vite', () => {
  for (const rule of [
    '@import"https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap";',
    "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600');",
    '@import url(https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500);'
  ]) assert.equal(stripRemoteFontImports(rule + 'body{color:red}'), 'body{color:red}');
  assert.equal(stripRemoteFontImports('@import "./local.css";'), '@import "./local.css";');
});
