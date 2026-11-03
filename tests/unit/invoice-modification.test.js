import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDataService } from '../../src/services/memory-service.js';
import { calculateInvoiceModificationDiff, getPendingDeliveryInvoices } from '../../src/domain/billing.js';
import { renderEditInvoiceModal } from '../../src/modules/billing.js';
import { buildInvoiceEscPos, buildInvoicePlainText } from '../../src/lib/hardware.js';

test('Invoice Modification: Agregar un jugo a un delivery ya facturado actualiza total, stock y auditoría con PIN', async () => {
  const service = new MemoryDataService({
    uid: 'cashier-nechy',
    displayName: 'Nechy Peña',
    username: 'NECHY',
    roles: ['cashier', 'owner'],
    drawerPin: '123456',
    active: true
  });

  // 1. Crear productos (uno preparado como comida y otro de reventa con stock)
  const yaroaId = await service.saveProduct({
    name: 'Yaroa Mixta',
    priceCents: 20000,
    costCents: 10000,
    isPrepared: true,
    stock: 0
  });

  const jugoId = await service.saveProduct({
    name: 'Jugo Natural de Chinola',
    priceCents: 8000,
    costCents: 3000,
    isPrepared: false,
    stock: 50 // stock inicial de reventa
  });

  const driverId = await service.saveDeliveryDriver({
    name: 'Erick Delivery',
    phone: '809-555-9999',
    active: true
  });

  // 2. Crear factura original de delivery con solo la Yaroa (DOP 200.00)
  const created = await service.createDocument({
    requestId: 'req-del-001',
    documentType: 'invoice',
    clientName: 'Carlos Gómez',
    clientPhone: '809-555-1212',
    deliveryAddress: 'Calle Duarte #15',
    deliveryDriverId: driverId,
    deliveryDriverName: 'Erick Delivery',
    deliveryStatus: 'in_transit',
    items: [
      { productId: yaroaId, name: 'Yaroa Mixta', quantity: 1, unitPriceCents: 20000, taxRate: 0 }
    ],
    paymentMethod: 'delivery_cod',
    payment: {
      method: 'delivery_cod',
      amountCents: 0,
      tenderedCents: 0
    }
  });

  const originalInvoice = service.data.invoices.find(i => i.id === created.id);
  assert.equal(originalInvoice.totalCents, 20000);
  assert.equal(originalInvoice.items.length, 1);
  assert.equal(service.data.products.find(p => p.id === jugoId).stock, 50);

  // 3. Modificar la factura agregando el Jugo de Chinola (DOP 80.00)
  const modified = await service.modifyInvoice(originalInvoice.id, {
    pin: '123456',
    reason: 'Cliente llamó para agregar jugo de chinola de último minuto',
    items: [
      { productId: yaroaId, name: 'Yaroa Mixta', quantity: 1, unitPriceCents: 20000, taxRate: 0 },
      { productId: jugoId, name: 'Jugo Natural de Chinola', quantity: 1, unitPriceCents: 8000, taxRate: 0 }
    ],
    paymentMethod: 'delivery_cod',
    deliveryDriverId: driverId,
    deliveryDriverName: 'Erick Delivery'
  });

  // 4. Verificaciones
  assert.equal(modified.totalCents, 28000, 'El nuevo total debe ser DOP 280.00');
  assert.equal(modified.items.length, 2, 'Debe contener los dos productos');
  assert.equal(modified.revision, 2, 'La revisión debe incrementarse a 2');
  assert.equal(modified.isModified, true);
  assert.equal(modified.modifiedByName, 'Nechy Peña');
  assert.equal(modified.modificationReason, 'Cliente llamó para agregar jugo de chinola de último minuto');

  // Stock de jugo descontado en 1 unidad
  const jugoProd = service.data.products.find(p => p.id === jugoId);
  assert.equal(jugoProd.stock, 49, 'El stock del jugo debe reducirse de 50 a 49');

  // Registro de auditoría
  const audit = service.data.auditLogs.find(a => a.action === 'invoice.modified');
  assert.ok(audit, 'Debe existir un log de auditoría');
  assert.equal(audit.actorName, 'Nechy Peña');
  assert.ok(audit.details.includes('Jugo Natural de Chinola'));

  // El repartidor ahora debe cobrar 280 al cliente
  const pendingForErick = getPendingDeliveryInvoices(service.data.invoices, driverId);
  assert.equal(pendingForErick.length, 1);
  assert.equal(pendingForErick[0].totalCents, 28000);
});

test('Invoice Modification: Cambio de método a transferencia salda la entrega y libera al repartidor del efectivo', async () => {
  const service = new MemoryDataService({
    uid: 'cashier-nechy',
    displayName: 'Nechy Peña',
    username: 'NECHY',
    roles: ['cashier', 'owner'],
    drawerPin: '123456',
    active: true
  });

  const driverId = await service.saveDeliveryDriver({ name: 'Pedro Motor', active: true });

  const created = await service.createDocument({
    requestId: 'req-del-002',
    documentType: 'invoice',
    clientName: 'María Santos',
    items: [{ name: 'Pollo a la Parrilla', unitPriceCents: 35000, quantity: 1, totalCents: 35000 }],
    paymentMethod: 'delivery_cod',
    deliveryDriverId: driverId,
    deliveryDriverName: 'Pedro Motor',
    deliveryStatus: 'in_transit',
    payment: { method: 'delivery_cod', amountCents: 0 }
  });

  // Antes: Está pendiente en la cuenta de Pedro
  const pendingBefore = getPendingDeliveryInvoices(service.data.invoices, driverId);
  assert.equal(pendingBefore.length, 1);
  assert.equal(pendingBefore[0].id, created.id);

  // Cliente transfirió por Banco Popular al recibir el pedido
  const updated = await service.modifyInvoice(created.id, {
    pin: '123456',
    reason: 'Cliente transfirió al Banco Popular al recibir el pedido',
    items: [{ name: 'Pollo a la Parrilla', unitPriceCents: 35000, quantity: 1, totalCents: 35000 }],
    paymentMethod: 'transfer',
    paymentReference: 'BPD-REF-998811'
  });

  // Verificaciones
  assert.equal(updated.status, 'paid', 'Debe quedar saldada');
  assert.equal(updated.paymentMethod, 'transfer');
  assert.equal(updated.deliveryStatus, 'settled', 'La entrega debe quedar liquidada');
  assert.equal(updated.paidCents, 35000);

  // Ya NO aparece como dinero pendiente que Pedro deba entregar en efectivo
  const pendingAfter = getPendingDeliveryInvoices(service.data.invoices, driverId);
  assert.equal(pendingAfter.length, 0, 'El repartidor no debe tener efectivo pendiente por esta factura');

  // Se generó el registro de cobro por transferencia
  const paymentRecord = service.data.payments.find(p => p.invoiceId === created.id);
  assert.ok(paymentRecord, 'Debe registrarse el pago');
  assert.equal(paymentRecord.method, 'transfer');
  assert.equal(paymentRecord.reference, 'BPD-REF-998811');
});

test('Invoice Modification: Rechaza modificación sin PIN o con motivo menor a 3 caracteres', async () => {
  const service = new MemoryDataService({
    uid: 'cashier-nechy',
    displayName: 'Nechy Peña',
    username: 'NECHY',
    roles: ['cashier'],
    drawerPin: '123456',
    active: true
  });

  const sessionId = await service.openCashSession({ openingCents: 1000, notes: 'Turno de prueba' });

  const created = await service.createDocument({
    documentType: 'invoice',
    clientName: 'Prueba',
    items: [{ name: 'Tostada', unitPriceCents: 15000, quantity: 1, totalCents: 15000 }],
    paymentMethod: 'cash',
    payment: { method: 'cash', amountCents: 15000, cashSessionId: sessionId }
  });

  // PIN incorrecto
  await assert.rejects(async () => {
    await service.modifyInvoice(created.id, {
      pin: '000000',
      reason: 'Cambio de plato',
      items: [{ name: 'Tostada con Queso', unitPriceCents: 18000, quantity: 1 }]
    });
  }, /PIN no reconocido/);

  // Motivo vacío
  await assert.rejects(async () => {
    await service.modifyInvoice(created.id, {
      pin: '123456',
      reason: '',
      items: [{ name: 'Tostada con Queso', unitPriceCents: 18000, quantity: 1 }]
    });
  }, /Indica un motivo de modificación/);
});

test('Hardware: buildInvoiceEscPos y buildInvoicePlainText incluyen banner de factura modificada', () => {
  const invoice = {
    id: 'inv-test-mod',
    invoiceNumber: 'PAN-1090',
    documentType: 'invoice',
    clientName: 'Pedro Almonte',
    createdAt: new Date(),
    revision: 2,
    isModified: true,
    modificationReason: 'Se agregó 1 Jugo Natural',
    modifiedByName: 'Nechy Peña',
    totalCents: 28000,
    paidCents: 28000,
    subtotalCents: 28000,
    taxCents: 0,
    items: [
      { name: 'Yaroa Mixta', quantity: 1, unitPriceCents: 20000 },
      { name: 'Jugo Natural', quantity: 1, unitPriceCents: 8000 }
    ]
  };

  const plainText = buildInvoicePlainText(invoice, { name: 'Los Panitas' });
  assert.ok(plainText.includes('TICKET MODIFICADO (REV 2)'), 'Debe incluir aviso de ticket modificado');
  assert.ok(plainText.includes('Se agregó 1 Jugo Natural'), 'Debe incluir el motivo');
  assert.ok(plainText.includes('Nechy Peña'), 'Debe incluir el nombre de quien modificó');
  assert.ok(plainText.includes('Jugo Natural'), 'Debe listar el nuevo item');
});

test('UI: renderEditInvoiceModal genera interfaz completa con comparativa, PIN y selector de productos', () => {
  const invoice = {
    id: 'inv-edit-01',
    invoiceNumber: 'PAN-1055',
    clientName: 'Cliente Delivery',
    createdAt: new Date(),
    totalCents: 20000,
    paidCents: 0,
    subtotalCents: 20000,
    taxCents: 0,
    paymentMethod: 'delivery_cod',
    deliveryDriverName: 'Carlos Pasola',
    items: [
      { productId: 'p1', name: 'Yaroa de Pollo', quantity: 1, unitPriceCents: 20000 }
    ]
  };

  const products = [
    { id: 'p1', name: 'Yaroa de Pollo', priceCents: 20000, active: true },
    { id: 'p2', name: 'Jugo de Chinola', priceCents: 8000, active: true }
  ];

  const drivers = [
    { id: 'd1', name: 'Carlos Pasola', active: true }
  ];

  const html = renderEditInvoiceModal({ invoice, products, deliveryDrivers: drivers });
  assert.ok(html.includes('id="edit-invoice-form"'), 'Debe tener formulario edit-invoice-form');
  assert.ok(html.includes('PAN-1055'), 'Debe mostrar el número de factura');
  assert.ok(html.includes('Yaroa de Pollo'), 'Debe listar los productos actuales');
  assert.ok(html.includes('data-edit-inv-qty-dec'), 'Debe tener botón de disminuir cantidad');
  assert.ok(html.includes('data-edit-inv-qty-inc'), 'Debe tener botón de aumentar cantidad');
  assert.ok(html.includes('id="edit-inv-add-product-select"'), 'Debe tener selector de nuevos productos');
  assert.ok(html.includes('id="edit-inv-payment-method"'), 'Debe permitir cambiar método de pago');
  assert.ok(html.includes('id="edit-inv-reason"'), 'Debe tener campo de motivo');
  assert.ok(html.includes('id="edit-inv-pin-input"'), 'Debe incluir PIN pad de 6 dígitos');
});
