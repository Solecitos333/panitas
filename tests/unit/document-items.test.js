import test from 'node:test';
import assert from 'node:assert/strict';
import { documentItems } from '../../src/domain/document-items.js';

test('coffee options omit undefined fields without changing size, price or cart', () => {
  const item = { productId: 'coffee', variantId: '7oz', variantName: '7 oz',
    side: undefined, sidePriceCents: undefined, quantity: 1, unitPriceCents: 5000,
    taxRate: 0, notes: '', isCustomPrice: false };
  const [saved] = documentItems([item]);
  assert.equal('side' in saved, false);
  assert.equal('sidePriceCents' in saved, false);
  assert.equal('side' in item, true);
  assert.notEqual(saved, item);
  assert.deepEqual(saved, { productId: 'coffee', variantId: '7oz', variantName: '7 oz',
    quantity: 1, unitPriceCents: 5000, taxRate: 0, notes: '', isCustomPrice: false });
});

test('document items preserve actual sides, zero charges and invalid prices for validation', () => {
  const items = [{ side: 'Tostones', sidePriceCents: 0, unitPriceCents: NaN,
    variantId: undefined, notes: null }];
  assert.deepEqual(documentItems(items), [{ side: 'Tostones', sidePriceCents: 0,
    unitPriceCents: NaN, notes: null }]);
  assert.deepEqual(documentItems([]), []);
  assert.equal(documentItems(undefined), undefined);
});
