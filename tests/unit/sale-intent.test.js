import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDataService } from '../../src/services/memory-service.js';
import { matchesSaleIntent, isStockLine } from '../../src/domain/sale-intent.js';

test('retry exacto sigue válido después de un abono posterior; cambios de cliente o líneas no', async () => {
  const service = new MemoryDataService({ uid: 'owner', roles: ['owner'], active: true });
  const input = { requestId: 'sale-intent-test-001', items: [{ name: 'Café', quantity: 1, unitPriceCents: 10000 }], payment: { method: 'credit' } };
  const invoice = await service.createDirectDocument(input);
  const session = await service.openCashSession({ openingCents: 0 });
  await service.recordPayment(invoice.id, { requestId: 'later-payment-test-001', method: 'cash', amountCents: 3000, cashSessionId: session });
  assert.equal((await service.createDirectDocument(input)).id, invoice.id);
  await assert.rejects(service.createDirectDocument({ ...input, clientName: 'Otro cliente' }), /referencia/);
  await assert.rejects(service.createDirectDocument({ ...input, items: [{ ...input.items[0], quantity: 2 }] }), /referencia/);
  assert.equal(service.data.invoices.length, 1);
});

test('comparación canónica admite claves en otro orden pero detecta precio y cambio de medio', () => {
  const totals = { subtotalCents: 10000, discountCents: 0, taxableSubtotalCents: 10000, taxCents: 0, tipCents: 0, totalCents: 10000 };
  const input = { requestId: 'r', items: [{ quantity: 1, unitPriceCents: 10000, side: undefined }] };
  const stored = { ...totals, requestId: 'r', createdBy: 'u', documentType: 'invoice', clientName: 'Consumidor final',
    paymentMethod: 'cash', items: [{ unitPriceCents: 10000, quantity: 1 }] };
  assert.equal(matchesSaleIntent(stored, null, input, totals, 'u'), true);
  assert.equal(matchesSaleIntent(stored, null, { ...input, payment: { method: 'credit' } }, totals, 'u'), false);
  assert.equal(matchesSaleIntent(stored, null, input, totals, 'other'), false);
});

test('líneas de envío nunca descuentan ni devuelven existencias', () => {
  assert.equal(isStockLine({ productId: 'p1' }), true);
  assert.equal(isStockLine({ productId: 'p1', isDeliveryFee: true }), false);
  assert.equal(isStockLine({ productId: 'prod-costo-de-envio-delivery' }), false);
  assert.equal(isStockLine({}), false);
});

test('reintento compara campos de entrega con los mismos límites del documento guardado', () => {
  const input = { requestId: 'retry-delivery-limits', items: [], deliveryAddress: 'a'.repeat(301),
    deliveryPhone: '1'.repeat(31), deliveryNotes: 'n'.repeat(301), deliveryDriverName: 'r'.repeat(161) };
  const stored = { ...input, createdBy: 'u', documentType: 'invoice', clientName: 'Consumidor final',
    paymentMethod: 'cash', deliveryAddress: input.deliveryAddress.slice(0, 300),
    deliveryPhone: input.deliveryPhone.slice(0, 30), deliveryNotes: input.deliveryNotes.slice(0, 300),
    deliveryDriverName: input.deliveryDriverName.slice(0, 160) };
  assert.equal(matchesSaleIntent(stored, null, input, {}, 'u'), true);
});
