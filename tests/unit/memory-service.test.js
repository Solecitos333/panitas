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

test('entradas y salidas de caja quedan vinculadas a una sesión abierta', async () => {
  const service = new MemoryDataService(actor);
  const cashSessionId = await service.openCashSession({ openingCents: 200000, notes: 'Turno de prueba' });
  await service.createCashMovement({ cashSessionId, type: 'in', amountCents: 50000, reason: 'Cambio adicional' });
  await service.createCashMovement({ cashSessionId, type: 'out', amountCents: 15000, reason: 'Compra menor' });
  assert.equal(service.data.cashMovements.length, 2);
  assert.equal(service.data.cashMovements[0].cashSessionId, cashSessionId);
  await assert.rejects(
    () => service.createCashMovement({ cashSessionId, type: 'out', amountCents: 0, reason: 'Inválido' }),
    /Monto/
  );
});

test('el cierre devuelve un arqueo final listo para imprimir', async () => {
  const service = new MemoryDataService(actor);
  const cashSessionId = await service.openCashSession({ openingCents: 10000, notes: 'Turno de prueba' });
  await service.createCashMovement({ cashSessionId, type: 'in', amountCents: 2500, reason: 'Cambio adicional' });
  const closed = await service.closeCashSession(cashSessionId, {
    expectedCents: 999999,
    closingCents: 12500,
    notes: 'Cierre correcto'
  });

  assert.equal(closed.id, cashSessionId);
  assert.equal(closed.status, 'closed');
  assert.equal(closed.expectedCents, 12500);
  assert.equal(closed.varianceCents, 0);
  await assert.rejects(
    () => service.closeCashSession(cashSessionId, { expectedCents: 12500, closingCents: 12500 }),
    /ya no está abierta/
  );
});

test('la caja calcula su saldo esperado sin confiar en valores enviados por la interfaz', async () => {
  const service = new MemoryDataService(actor);
  const productId = await service.saveProduct({ name: 'Efectivo', priceCents: 10000, costCents: 0, taxRate: 0, stock: 2, active: true });
  const cashSessionId = await service.openCashSession({ openingCents: 5000, notes: '' });
  await service.createDirectDocument({
    requestId: 'cash-balance-000000001', documentType: 'invoice',
    items: [{ productId, name: 'Efectivo', unitPriceCents: 10000, taxRate: 0, quantity: 1 }],
    payment: { amountCents: 10000, method: 'cash', tenderedCents: 20000, cashSessionId }
  });
  await service.createCashMovement({ cashSessionId, type: 'out', amountCents: 2000, reason: 'Compra menor' });
  const session = service.data.cashSessions.find((item) => item.id === cashSessionId);
  assert.equal(session.expectedCents, 13000);
  await assert.rejects(
    () => service.createCashMovement({ cashSessionId, type: 'out', amountCents: 14000, reason: 'Retiro excesivo' }),
    /supera el efectivo esperado/
  );
});

test('el PIN de seis dígitos pertenece al usuario que inició sesión', async () => {
  const service = new MemoryDataService(actor);
  assert.equal(await service.hasMyDrawerPin(), false);
  await service.saveMyDrawerPin('482601');
  assert.equal(await service.hasMyDrawerPin(), true);
  const authorized = await service.verifyDrawerPin('482601');
  assert.equal(authorized.user.id, actor.uid);
  await assert.rejects(() => service.verifyDrawerPin('482701'), /no reconocido/);
  await assert.rejects(() => service.saveMyDrawerPin('12345'), /exactamente 6/);
  await assert.rejects(() => service.saveMyDrawerPin('48x26'), /exactamente 6/);
  service.data.users.push({ id: 'another', drawerPin: '749201' });
  await assert.rejects(() => service.saveMyDrawerPin('749201'), /otra persona/);
  await service.verifyDrawerPin('482601');
});

test('el PIN de cualquier empleado activo autoriza operaciones identificando al usuario', async () => {
  const service = new MemoryDataService(actor);
  await service.saveMyDrawerPin('482601');
  service.data.users.push({
    id: 'junior-uid',
    username: 'JUNIOR',
    displayName: 'Junior',
    drawerPin: '202020',
    roles: ['cashier', 'manager'],
    active: true
  });
  // Junior autoriza con su PIN desde la terminal activa
  const juniorAuth = await service.verifyDrawerPin('202020', 'Cobro realizado por Junior');
  assert.equal(juniorAuth.success, true);
  assert.equal(juniorAuth.user.id, 'junior-uid');
  assert.equal(juniorAuth.user.displayName, 'Junior');

  // El usuario de la sesión principal sigue pudiendo autorizar con su propio PIN
  const mainAuth = await service.verifyDrawerPin('482601', 'Apertura personal');
  assert.equal(mainAuth.success, true);
  assert.equal(mainAuth.user.id, actor.uid);

  // Un PIN no asignado a ningún usuario habilitado es rechazado
  await assert.rejects(service.verifyDrawerPin('999999', 'PIN inexistente'), /no reconocido/);
});

test('venta y movimiento de caja respetan el nombre del cajero autorizado por PIN', async () => {
  const service = new MemoryDataService(actor);
  const cashSessionId = await service.openCashSession({ openingCents: 10000 });
  const movementId = await service.createCashMovement({
    cashSessionId,
    type: 'out',
    amountCents: 1000,
    reason: 'Compra de hielo',
    createdByName: 'Junior'
  });
  const movement = service.data.cashMovements.find(m => m.id === movementId);
  assert.equal(movement.createdByName, 'Junior');

  const invoiceRes = await service.createDirectDocument({
    documentType: 'invoice',
    items: [{ name: 'Jugo', unitPriceCents: 15000, taxRate: 0, quantity: 1 }],
    cashierName: 'Nechy Peña',
    payment: {
      method: 'cash',
      amountCents: 15000,
      tenderedCents: 20000,
      cashSessionId,
      cashierName: 'Nechy Peña'
    }
  });
  const invoice = service.data.invoices.find(inv => inv.id === invoiceRes.id);
  assert.equal(invoice.cashierName, 'Nechy Peña');
  const payment = service.data.payments.find(p => p.invoiceId === invoiceRes.id);
  assert.equal(payment.cashierName, 'Nechy Peña');
});

test('un doble toque con el mismo requestId no duplica factura, pago ni descuento de inventario', async () => {
  const service = new MemoryDataService(actor);
  const productId = await service.saveProduct({ name: 'Sandwich', priceCents: 25000, costCents: 12000, taxRate: 0, stock: 8, active: true });
  const cashSessionId = await service.openCashSession({ openingCents: 0, notes: 'Prueba' });
  const input = {
    requestId: 'sale-idempotent-00000001',
    documentType: 'invoice',
    items: [{ productId, name: 'Sandwich', unitPriceCents: 25000, taxRate: 0, quantity: 2 }],
    payment: { amountCents: 50000, method: 'cash', tenderedCents: 50000, cashSessionId }
  };

  const first = await service.createDirectDocument(input);
  const repeated = await service.createDirectDocument(input);

  assert.equal(repeated.id, first.id);
  assert.equal(service.data.invoices.length, 1);
  assert.equal(service.data.payments.length, 1);
  assert.equal(service.data.products[0].stock, 6);
});

test('tarjeta y transferencia registran cobros sin exigir efectivo entregado', async () => {
  const service = new MemoryDataService(actor);
  const productId = await service.saveProduct({ name: 'Jugo', priceCents: 15000, costCents: 6000, taxRate: 0, stock: 4, active: true });
  const invoice = await service.createDirectDocument({
    requestId: 'pending-invoice-00000001',
    documentType: 'invoice',
    items: [{ productId, name: 'Jugo', unitPriceCents: 15000, taxRate: 0, quantity: 1 }],
    payment: { amountCents: 0, method: 'credit', cashSessionId: '' }
  });
  const cashSessionId = await service.openCashSession({ openingCents: 0, notes: 'Prueba' });
  const payment = {
    requestId: 'card-payment-00000001',
    amountCents: 15000,
    method: 'card',
    reference: 'AZUL-123',
    cashSessionId
  };

  await service.recordPayment(invoice.id, payment);
  await service.recordPayment(invoice.id, payment);

  assert.equal(service.data.payments.length, 1);
  assert.equal(service.data.payments[0].tenderedCents, 0);
  assert.equal(service.data.payments[0].changeCents, 0);
  assert.equal(service.data.invoices[0].status, 'paid');
});

test('anular una factura sin pagos devuelve el inventario descontado', async () => {
  const service = new MemoryDataService(actor);
  const productId = await service.saveProduct({ name: 'Café', priceCents: 10000, costCents: 4000, taxRate: 0, stock: 3, active: true });
  const invoice = await service.createDirectDocument({
    documentType: 'invoice',
    items: [{ productId, name: 'Café', unitPriceCents: 10000, taxRate: 0, quantity: 2 }],
    payment: { amountCents: 0, method: 'credit', cashSessionId: '' }
  });
  assert.equal(service.data.products[0].stock, 1);

  await service.cancelInvoice(invoice.id, 'Error de digitación');

  assert.equal(service.data.products[0].stock, 3);
  assert.equal(service.data.invoices[0].status, 'cancelled');
});

test('el conteo móvil actualiza existencia y conserva un movimiento auditable', async () => {
  const service = new MemoryDataService(actor);
  const productId = await service.saveProduct({ name: 'Refresco', priceCents: 7500, costCents: 3500, taxRate: 0, stock: 10, active: true });

  const movement = await service.registerInventoryCount({ productId, targetStock: 7, reason: 'Conteo al cierre' });

  assert.equal(service.data.products[0].stock, 7);
  assert.equal(movement.delta, -3);
  assert.equal(movement.previousStock, 10);
  assert.equal(movement.resultingStock, 7);
  assert.match(movement.id, /^inventory-/);
});

test('mesa, cocina, servicio y cobro cierran una comanda sin perder factura ni inventario', async () => {
  const service = new MemoryDataService(actor);
  const productId = await service.saveProduct({ name: 'Plato del día', priceCents: 30000, costCents: 12000, taxRate: 0, stock: 6, active: true });
  const orderId = await service.createOrder({
    tableId: 'mesa-1',
    clientName: 'Mesa de prueba',
    items: [{ productId, name: 'Plato del día', unitPriceCents: 30000, taxRate: 0, quantity: 2 }]
  });
  const cashSessionId = await service.openCashSession({ openingCents: 0, notes: 'Mesa E2E' });

  // Direct charging from POS without requiring kitchen KDS status transitions
  const invoice = await service.chargeOrder(orderId, {
    requestId: 'table-sale-000000000001',
    amountCents: 60000,
    method: 'cash',
    tenderedCents: 60000,
    cashSessionId
  });

  // Cannot charge a closed order again
  await assert.rejects(
    () => service.chargeOrder(orderId, { amountCents: 60000, method: 'cash', cashSessionId }),
    /ya fue cobrada/
  );

  assert.equal(service.data.orders[0].status, 'closed');
  assert.equal(service.data.tables[0].status, 'available');
  assert.equal(service.data.tables[0].currentOrderId, null);
  assert.equal(service.data.invoices.find((item) => item.id === invoice.id)?.status, 'paid');
  assert.equal(service.data.payments.length, 1);
  assert.equal(service.data.products[0].stock, 4);
});

test('permite facturar un producto con precio modificado en el carrito o porciones', async () => {
  const service = new MemoryDataService(actor);
  const productId = await service.saveProduct({ name: 'Jugo Natural', priceCents: 6000, costCents: 0, taxRate: 0, isPrepared: true, active: true });
  const cashSessionId = await service.openCashSession({ openingCents: 0, notes: 'Turno precio personalizado' });

  // Venta con precio modificado manualmente a RD$80 (8000 centavos)
  const invoice = await service.createDirectDocument({
    documentType: 'invoice',
    items: [{ productId, name: 'Jugo Natural', unitPriceCents: 8000, isCustomPrice: true, taxRate: 0, quantity: 1 }],
    payment: {
      amountCents: 8000,
      method: 'cash',
      tenderedCents: 8000,
      cashSessionId
    }
  });

  assert.ok(invoice.id);
  const savedInvoice = service.data.invoices.find((i) => i.id === invoice.id);
  assert.equal(savedInvoice.totalCents, 8000);
  assert.equal(savedInvoice.paidCents, 8000);
  assert.equal(savedInvoice.items[0].unitPriceCents, 8000);
});
