import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

test('el cambio de delivery es informativo y nunca genera una salida automática tras el despacho', () => {
  const code = readFileSync(new URL('../../src/ui/app.js', import.meta.url), 'utf8');
  const sale = code.slice(code.indexOf('async function completeDirectSale'), code.indexOf('function checkoutPinModal'));
  assert.doesNotMatch(sale, /createCashMovement|deliveryNeedsChange/);
  assert.match(code, /data\.deliveryChangeForCents - data\.totalCents/);
  assert.match(code, /printSaleReceipt\(receiptToPrint/);
});
import { getPendingDeliveryInvoices } from '../../src/domain/billing.js';
import { MemoryDataService } from '../../src/services/memory-service.js';
import {
  buildDeliverySettlementEscPos,
  buildDeliverySettlementPlainText,
  buildInvoiceEscPos,
  buildInvoicePlainText
} from '../../src/lib/hardware.js';

test('getPendingDeliveryInvoices filtra correctamente las facturas pendientes de delivery', () => {
  const invoices = [
    { id: '1', invoiceNumber: 'B02-1', totalCents: 50000, paidCents: 0, status: 'pending', deliveryDriverId: 'd1', deliveryStatus: 'in_transit' },
    { id: '2', invoiceNumber: 'B02-2', totalCents: 30000, paidCents: 30000, status: 'paid', deliveryDriverId: 'd1', deliveryStatus: 'settled' },
    { id: '3', invoiceNumber: 'B02-3', totalCents: 45000, paidCents: 0, status: 'pending', paymentMethod: 'delivery_cod', deliveryStatus: 'in_transit' },
    { id: '4', invoiceNumber: 'B02-4', totalCents: 20000, paidCents: 0, status: 'cancelled', deliveryDriverId: 'd2' },
    { id: '5', invoiceNumber: 'B02-5', totalCents: 15000, paidCents: 15000, status: 'paid', paymentMethod: 'cash' }
  ];

  const allPending = getPendingDeliveryInvoices(invoices);
  assert.equal(allPending.length, 2);
  assert.deepEqual(allPending.map(i => i.id), ['1', '3']);

  const driver1Pending = getPendingDeliveryInvoices(invoices, 'd1');
  assert.equal(driver1Pending.length, 1);
  assert.equal(driver1Pending[0].id, '1');
});

test('MemoryDataService gestiona catálogo de repartidores', async () => {
  const service = new MemoryDataService({ uid: 'test-user', role: 'owner', displayName: 'Nechy' });

  const driverId = await service.saveDeliveryDriver({
    name: 'Carlos Moto',
    phone: '809-555-9988',
    vehicle: 'Honda C90 Rojo',
    notes: 'Turno tarde'
  });

  assert.ok(driverId);
  const driver = service.data.deliveryDrivers.find(d => d.id === driverId);
  assert.equal(driver.name, 'Carlos Moto');
  assert.equal(driver.active, true);

  // Actualizar
  await service.saveDeliveryDriver({
    id: driverId,
    name: 'Carlos Moto (Actualizado)',
    phone: '809-555-9988',
    vehicle: 'Yamaha 125',
    active: false
  });
  const updated = service.data.deliveryDrivers.find(d => d.id === driverId);
  assert.equal(updated.name, 'Carlos Moto (Actualizado)');
  assert.equal(updated.active, false);

  // Desactivar / Eliminar
  await service.deleteDeliveryDriver(driverId);
  const deleted = service.data.deliveryDrivers.find(d => d.id === driverId);
  assert.equal(deleted.active, false);
});

test('Venta contra entrega no afecta gaveta hasta su liquidación', async () => {
  const service = new MemoryDataService({ uid: 'test-user', role: 'owner', displayName: 'Nechy' });
  const sessionId = await service.openCashSession({ openingCents: 100000 }); // RD$ 1,000.00
  const product = await service.saveProduct({
    name: 'Sándwich Especial',
    priceCents: 50000,
    costCents: 20000,
    taxRate: 0.18,
    stock: 100,
    active: true
  });

  // Despachar venta Delivery COD
  const sale = await service.createDirectDocument({
    documentType: 'invoice',
    items: [{ productId: product.id, name: product.name, quantity: 1, unitPriceCents: 50000, taxRate: 0.18 }],
    paymentMethod: 'delivery_cod',
    deliveryDriverId: 'd1',
    deliveryDriverName: 'Pedro Delivery',
    deliveryAddress: 'Calle Las Palmas #12',
    deliveryPhone: '809-555-1122',
    deliveryChangeForCents: 100000,
    deliveryStatus: 'in_transit',
    payment: {
      method: 'delivery_cod',
      amountCents: 0,
      tenderedCents: 0,
      cashSessionId: sessionId,
      cashierId: 'cashier-1',
      cashierName: 'Nechy'
    }
  });

  const invoice = service.data.invoices.find(i => i.id === sale.id);
  assert.ok(invoice);
  assert.equal(invoice.paidCents, 0);
  assert.equal(invoice.status, 'pending');
  assert.equal(invoice.deliveryStatus, 'in_transit');
  assert.equal(invoice.deliveryDriverName, 'Pedro Delivery');

  // Comprobar que la caja NO ha aumentado porque el dinero sigue en la calle
  const cashBeforeSettle = service.data.cashSessions.find(s => s.id === sessionId);
  assert.equal(cashBeforeSettle.expectedCents, 100000);

  // Liquidar entrega cuando el repartidor regresa
  await service.recordPayment(invoice.id, {
    amountCents: invoice.totalCents,
    method: 'cash',
    tenderedCents: invoice.totalCents,
    cashSessionId: sessionId,
    cashierId: 'cashier-1',
    cashierName: 'Nechy'
  });

  const invoiceAfterSettle = service.data.invoices.find(i => i.id === sale.id);
  assert.equal(invoiceAfterSettle.paidCents, invoice.totalCents);
  assert.equal(invoiceAfterSettle.status, 'paid');
  assert.equal(invoiceAfterSettle.deliveryStatus, 'settled');

  // Comprobar que AHORA SÍ el dinero entró formalmente a la caja
  const cashAfterSettle = service.data.cashSessions.find(s => s.id === sessionId);
  assert.equal(cashAfterSettle.expectedCents, 100000 + invoice.totalCents);
});

test('buildDeliverySettlement genera tickets térmicos válidos en ESC/POS y texto plano', () => {
  const settlement = {
    driverName: 'Juan Mensajero',
    driverPhone: '809-555-4433',
    cashierName: 'Nechy',
    createdAt: new Date('2026-09-07T12:00:00'),
    invoices: [
      { invoiceNumber: 'B0200000001', clientName: 'Carlos López', paidAmountCents: 59000, totalCents: 59000 },
      { invoiceNumber: 'B0200000002', clientName: 'María Pérez', paidAmountCents: 35000, totalCents: 35000 }
    ],
    totalCents: 94000,
    method: 'cash'
  };

  const escPosBuilder = buildDeliverySettlementEscPos(settlement, { name: 'Los Panitas' });
  const rawBytes = escPosBuilder.getBytes();
  assert.ok(rawBytes instanceof Uint8Array);
  assert.ok(rawBytes.length > 50);

  const plainText = buildDeliverySettlementPlainText(settlement, { name: 'Los Panitas' });
  assert.ok(plainText.includes('LIQUIDACIÓN DE REPARTIDOR'));
  assert.ok(plainText.includes('REPARTIDOR: Juan Mensajero'));
  assert.ok(plainText.includes('Teléfono: 809-555-4433'));
  assert.ok(plainText.includes('B0200000001'));
  assert.ok(plainText.includes('RD$940.00'));
});

test('Ticket de factura imprime bloque de delivery cuando corresponde', () => {
  const invoice = {
    invoiceNumber: 'B0200000010',
    documentType: 'invoice',
    clientName: 'Roberto Gómez',
    paymentMethod: 'delivery_cod',
    deliveryDriverName: 'Pedro Motor',
    deliveryAddress: 'Av. Winston Churchill #45, Apto 3B',
    deliveryPhone: '809-888-7766',
    deliveryChangeForCents: 150000,
    deliveryNotes: 'Tocar el timbre dos veces',
    subtotalCents: 100000,
    taxCents: 18000,
    totalCents: 118000,
    paidCents: 0,
    items: [{ name: 'Sándwich Especial', quantity: 1, unitPriceCents: 100000, totalCents: 100000 }]
  };

  const plainText = buildInvoicePlainText(invoice, { name: 'Los Panitas' }, []);
  assert.ok(plainText.includes('PAGO CONTRA ENTREGA (DELIVERY)'));
  assert.ok(plainText.includes('Pedro Motor'));
  assert.ok(plainText.includes('Av. Winston Churchill #45, Apto 3B'));
  assert.ok(plainText.includes('809-888-7766'));
  assert.ok(plainText.includes('LLEVAR CAMBIO PARA: RD$1,500.00'));
  assert.ok(plainText.includes('Tocar el timbre dos veces'));
  assert.ok(plainText.includes('TOTAL A PAGAR:'));
  assert.ok(plainText.includes('BALANCE PENDIENTE:'));
});
