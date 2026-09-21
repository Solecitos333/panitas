import { readFile } from 'node:fs/promises';

const res = await fetch('https://los-panitas-by-nechy.web.app/');
const html = await res.text();
console.log('Live HTTP Status:', res.status);
console.log('Live HTML Length:', html.length);

const localHtml = await readFile('dist/index.html', 'utf8');
if (html !== localHtml) {
  console.error('ALERTA: El HTML publicado difiere del local dist/index.html');
} else {
  console.log('OK: El HTML en vivo coincide exactamente con dist/index.html');
}

const match = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
if (match) {
  const bundleUrl = 'https://los-panitas-by-nechy.web.app' + match[1];
  console.log('Verificando bundle en vivo:', bundleUrl);
  const bundleRes = await fetch(bundleUrl);
  const bundleText = await bundleRes.text();
  console.log('Tamaño de bundle:', bundleText.length);
  console.log('¿Contiene modal productOptions?', bundleText.includes('productOptions'));
  console.log('¿Contiene hasVariants?', bundleText.includes('hasVariants'));
  console.log('¿Contiene Guarnición?', bundleText.includes('Guarnición'));
  console.log('¿Contiene variant-chip?', bundleText.includes('variant-chip'));
}
