import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDataService } from '../../src/services/memory-service.js';

const actor = { uid: 'owner-local', email: 'owner@local.test', displayName: 'Owner local' };

test('cotización no cobra ni descuenta inventario', async () => {
  const service = new MemoryDataService(actor);
  const productId = await service.saveProduct({ name: 'Producto', priceCents: 10000, costCents: 5000, taxRate: 0, stock: 5, active: true });
  await service.createDirectDocument({
    documentType: 'quote',
    items: [{ productId, name: 'Producto', unitPriceCents: 10000, taxRate: 0, quantity: 1 }],
    payment: { amountCents: 10000, method: 'cash', cashSessionId: '' }
  });
  assert.equal(service.data.products[0].stock, 5);
  assert.equal(service.data.payments.length, 0);
  assert.equal(service.data.invoices[0].paidCents, 0);
});

test('factura cobrada exige caja y descuenta una sola vez', async () => {
  const service = new MemoryDataService(actor);
  const productId = await service.saveProduct({ name: 'Producto', priceCents: 10000, costCents: 5000, taxRate: 0, stock: 5, active: true });
  const input = {
    documentType: 'invoice',
    items: [{ productId, name: 'Producto', unitPriceCents: 10000, taxRate: 0, quantity: 1 }],
    payment: { amountCents: 10000, method: 'cash', cashSessionId: '' }
  };
  await assert.rejects(() => service.createDirectDocument(input), /Abre una caja/);
  const cashSessionId = await service.openCashSession({ openingCents: 0, notes: '' });
  await service.createDirectDocument({ ...input, payment: { ...input.payment, cashSessionId } });
  assert.equal(service.data.products[0].stock, 4);
  assert.equal(service.data.payments.length, 1);
});
