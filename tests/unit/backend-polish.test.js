import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDataService } from '../../src/services/memory-service.js';

const actor = { uid: 'operator', displayName: 'Operador', roles: ['owner'], active: true };

test('cambiar preparado a vitrina sincroniza isPrepared y descuenta stock al vender', async () => {
  const service = new MemoryDataService(actor);
  const id = await service.saveProduct({ name: 'Empanada', priceCents: 10000, stock: 10,
    inventoryType: 'preprepared', isPrepared: true });
  assert.equal(service.data.products[0].isPrepared, false);
  await service.createDirectDocument({ items: [{ productId: id, name: 'Empanada', unitPriceCents: 10000, quantity: 1 }] });
  assert.equal(service.data.products[0].stock, 9);
});

test('reintentar abono con datos distintos no oculta un pago diferente y un retry exacto funciona tras cerrar caja', async () => {
  const service = new MemoryDataService(actor);
  const invoice = await service.createDirectDocument({ items: [{ name: 'Venta', quantity: 1, unitPriceCents: 10000 }] });
  const cashSessionId = await service.openCashSession({ openingCents: 0 });
  const payment = { requestId: 'payment-stable-id-000001', amountCents: 3000, method: 'cash', cashSessionId, tenderedCents: 5000 };
  await service.recordPayment(invoice.id, payment);
  for (const change of [{ amountCents: 1000 }, { method: 'card' }, { reference: 'Diferente' }, { tenderedCents: 8000 }]) {
    await assert.rejects(service.recordPayment(invoice.id, { ...payment, ...change }), /referencia/);
  }
  await service.closeCashSession(cashSessionId, { closingCents: 3000 });
  await service.recordPayment(invoice.id, payment);
  assert.equal(service.data.payments.length, 1);
  assert.equal(service.data.invoices[0].paidCents, 3000);
});

test('reasignación rechaza repartidores inactivos y entregas liquidadas', async () => {
  const service = new MemoryDataService(actor);
  const invoice = await service.createDirectDocument({ items: [{ name: 'Venta', quantity: 1, unitPriceCents: 10000 }],
    payment: { method: 'delivery_cod' } });
  const driverId = await service.saveDeliveryDriver({ name: 'Repartidor', active: false });
  await assert.rejects(service.reassignDeliveryDriver(invoice.id, { driverId, driverName: 'Repartidor' }), /no está activo/);
  await service.saveDeliveryDriver({ id: driverId, name: 'Nombre real', active: true });
  const result = await service.reassignDeliveryDriver(invoice.id, { driverId, driverName: 'Nombre falso' });
  assert.equal(result.deliveryDriverName, 'Nombre real');
  service.data.invoices[0].deliveryStatus = 'settled';
  await assert.rejects(service.reassignDeliveryDriver(invoice.id, { driverId, driverName: 'Nombre real' }), /entregas pendientes/);
});
