import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDocument } from '../../src/domain/billing.js';
import { orderPricing, assertOrderRevision, editedOrderPricing } from '../../src/domain/order-pricing.js';

test('comanda antigua separa descuentos de artículo y global sin duplicarlos', () => {
  const items = [{ quantity: 2, unitPriceCents: 10000, discountPercent: 10 }];
  const oldOrder = { items, discountCents: 3000, tipCents: 1700 };
  const pricing = orderPricing(oldOrder);
  assert.equal(pricing.discount, 10);
  assert.equal(calculateDocument(items, pricing).totalCents, 18700);
  assert.equal(orderPricing({ items, discountCents: 2000 }).discount, 0);
});

test('comanda nueva mantiene porcentaje para nuevos artículos y el cero explícito', () => {
  const order = { discount: 10, discountType: 'percent', includeLegalTip: true };
  const totals = calculateDocument([{ quantity: 2, unitPriceCents: 10000 }], orderPricing(order));
  assert.equal(totals.discountCents, 2000);
  assert.equal(totals.tipCents, 1800);
  assert.equal(orderPricing({ discount: 0, discountCents: 10000 }).discount, 0);
});

test('reemplazo exige ID y revisión exacta; agregar no sobrescribe el contenido anterior', () => {
  const order = { id: 'mesa-order', revision: 2 };
  assert.doesNotThrow(() => assertOrderRevision(order, { replaceItems: false }));
  assert.doesNotThrow(() => assertOrderRevision(order, { replaceItems: true, expectedOrderId: order.id, expectedRevision: 2 }));
  for (const input of [{}, { expectedOrderId: order.id, expectedRevision: 1 }, { expectedOrderId: 'other', expectedRevision: 2 }]) {
    assert.throws(() => assertOrderRevision(order, { ...input, replaceItems: true }), /cambió/);
  }
});

test('editar formulario conserva propina fija y permite quitar descuento y propina calculada', () => {
  const previous = { discount: 10, discountType: 'amount', includeLegalTip: false, tipCents: 1700 };
  const edited = editedOrderPricing(previous, { discount: 0, includeLegalTip: false });
  assert.equal(edited.discount, 0);
  assert.equal(edited.tipCents, 1700);
  assert.equal(editedOrderPricing({ ...previous, includeLegalTip: true }, { includeLegalTip: false }).tipCents, 0);
  assert.deepEqual(editedOrderPricing(previous), previous);
});
