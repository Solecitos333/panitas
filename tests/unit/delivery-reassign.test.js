import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDataService } from '../../src/services/memory-service.js';
import { getPendingDeliveryInvoices } from '../../src/domain/billing.js';
import { renderReassignDeliveryModal } from '../../src/modules/deliveries.js';
import { renderInvoiceModal } from '../../src/modules/billing.js';

test('MemoryDataService reasigna correctamente el repartidor de una factura en ruta', async () => {
  const service = new MemoryDataService({
    uid: 'cashier-1',
    displayName: 'Cajera Turno',
    role: 'cashier',
    active: true
  });

  const d1 = await service.saveDeliveryDriver({ name: 'Pedro Motor', phone: '809-555-0001', active: true });
  const d2 = await service.saveDeliveryDriver({ name: 'Carlos Pasola', phone: '809-555-0002', active: true });

  const created = await service.createDocument({
    requestId: 'test-delivery-inv-001',
    documentType: 'invoice',
    clientName: 'Juan Rodríguez',
    items: [{ name: 'Yaroa de Pollo', unitPriceCents: 25000, quantity: 1, totalCents: 25000 }],
    paymentMethod: 'delivery_cod',
    deliveryDriverId: d1,
    deliveryDriverName: 'Pedro Motor',
    deliveryAddress: 'Av. Circunvalación #40',
    deliveryPhone: '809-777-8888',
    deliveryStatus: 'in_transit',
    payment: {
      method: 'delivery_cod',
      amountCents: 0,
      tenderedCents: 0
    }
  });

  const invoice = service.data.invoices.find((i) => i.id === created.id);
  // Verificar que inicialmente está asignado a Pedro
  assert.equal(invoice.deliveryDriverId, d1);
  assert.equal(invoice.deliveryDriverName, 'Pedro Motor');

  const pendingBeforePedro = getPendingDeliveryInvoices(service.data.invoices, d1);
  const pendingBeforeCarlos = getPendingDeliveryInvoices(service.data.invoices, d2);
  assert.equal(pendingBeforePedro.length, 1);
  assert.equal(pendingBeforeCarlos.length, 0);

  // Reasignar entrega a Carlos porque Pedro no está disponible
  const updated = await service.reassignDeliveryDriver(invoice.id, {
    driverId: d2,
    driverName: 'Carlos Pasola',
    notes: 'Entregar en el portón negro'
  });

  assert.equal(updated.deliveryDriverId, d2);
  assert.equal(updated.deliveryDriverName, 'Carlos Pasola');
  assert.equal(updated.deliveryNotes, 'Entregar en el portón negro');

  // Verificar que la consulta de entregas pendientes se transfirió a Carlos
  const pendingAfterPedro = getPendingDeliveryInvoices(service.data.invoices, d1);
  const pendingAfterCarlos = getPendingDeliveryInvoices(service.data.invoices, d2);
  assert.equal(pendingAfterPedro.length, 0);
  assert.equal(pendingAfterCarlos.length, 1);
  assert.equal(pendingAfterCarlos[0].id, invoice.id);

  // Verificar auditoría
  const audit = service.data.auditLogs.find(a => a.action === 'delivery.driver_reassigned');
  assert.ok(audit);
  assert.match(audit.details, /Pedro Motor/);
  assert.match(audit.details, /Carlos Pasola/);
});

test('reassignDeliveryDriver rechaza reasignación si falta el nombre del nuevo repartidor', async () => {
  const service = new MemoryDataService({
    uid: 'cashier-1',
    displayName: 'Cajera Turno',
    role: 'cashier',
    active: true
  });

  const invoice = await service.createDocument({
    requestId: 'test-delivery-inv-002',
    documentType: 'invoice',
    clientName: 'Ana Gomez',
    items: [{ name: 'Pollo 1/4', unitPriceCents: 22000, quantity: 1, totalCents: 22000 }],
    paymentMethod: 'delivery_cod',
    deliveryDriverName: 'Pedro Motor',
    deliveryStatus: 'in_transit'
  });

  await assert.rejects(
    () => service.reassignDeliveryDriver(invoice.id, { driverId: '', driverName: '' }),
    /Debes indicar el nombre/
  );
});

test('renderReassignDeliveryModal renderiza información del cliente, repartidor actual y selector', () => {
  const invoice = {
    id: 'inv-123',
    invoiceNumber: 'FAC-000088',
    clientName: 'Ramón Valdez',
    clientPhone: '809-555-4433',
    deliveryAddress: 'Calle Las Flores #12',
    deliveryDriverId: 'd1',
    deliveryDriverName: 'Pedro Motor',
    totalCents: 35000,
    deliveryNotes: 'Dejar con el portero'
  };

  const drivers = [
    { id: 'd1', name: 'Pedro Motor', active: true },
    { id: 'd2', name: 'Carlos Pasola', phone: '809-555-9988', active: true }
  ];

  const html = renderReassignDeliveryModal(invoice, drivers);
  assert.match(html, /FAC-000088/);
  assert.match(html, /Ramón Valdez/);
  assert.match(html, /Calle Las Flores #12/);
  assert.match(html, /Pedro Motor/);
  assert.match(html, /Carlos Pasola/);
  assert.match(html, /Dejar con el portero/);
  assert.match(html, /reassign-delivery-form/);
  assert.match(html, /reassign-new-driver-select/);
});

test('renderInvoiceModal muestra sección de delivery y botón de reasignar cuando está en ruta', () => {
  const invoice = {
    id: 'inv-456',
    invoiceNumber: 'FAC-000089',
    documentType: 'invoice',
    clientName: 'Carmen Ortiz',
    items: [{ name: 'Mofongo', unitPriceCents: 45000, quantity: 1, totalCents: 45000 }],
    subtotalCents: 45000,
    taxCents: 0,
    totalCents: 45000,
    paidCents: 0,
    paymentMethod: 'delivery_cod',
    deliveryDriverId: 'd1',
    deliveryDriverName: 'Pedro Motor',
    deliveryAddress: 'Calle del Sol #5',
    deliveryStatus: 'in_transit',
    createdAt: new Date()
  };

  const html = renderInvoiceModal(invoice, [], { bill: true });
  assert.match(html, /Despacho Delivery/);
  assert.match(html, /Pedro Motor/);
  assert.match(html, /Calle del Sol #5/);
  assert.match(html, /data-delivery-reassign="inv-456"/);
});
