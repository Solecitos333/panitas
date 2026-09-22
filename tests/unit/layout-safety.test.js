import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
const corrections = postcss.parse(css.slice(css.indexOf('/* Screen-only layout corrections.')));
test('visual layout corrections apply only to screens and never reorder controls', () => {
  corrections.walkRules(rule => {
    let parent = rule.parent;
    while (parent && parent.type !== 'atrule') parent = parent.parent;
    assert.equal(parent?.name, 'media');
    assert.match(parent.params, /^screen/);
    rule.walkDecls(decl => assert.ok(!['order', 'grid-template-areas', 'pointer-events'].includes(decl.prop)));
  });
});
test('narrow payment grid overrides old inline width without hiding payment methods', () => {
  const grids = [];
  corrections.walkRules('.pos-pay-method-grid', rule => rule.walkDecls('grid-template-columns', d => grids.push(d)));
  assert.ok(grids.some(d => d.value.includes('repeat(2, minmax(0, 1fr))') && d.important));
  assert.ok(grids.some(d => d.value.includes('repeat(4, minmax(0, 1fr))') && d.important));
});
test('checkout and print choices do not shrink into the scrollable cart', () => {
  const fixed = [];
  corrections.walkDecls('flex', decl => { if (decl.value === '0 0 auto') fixed.push(decl.parent.selector); });
  assert.ok(fixed.includes('.pos-print-option-row'));
  assert.ok(fixed.includes('.pos-actions-group'));
});
