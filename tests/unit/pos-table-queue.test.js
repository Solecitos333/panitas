import test from 'node:test';
import assert from 'node:assert/strict';
import { cartLine, renderTablePickerModal, renderPos } from '../../src/modules/operations.js';
import { MemoryDataService } from '../../src/services/memory-service.js';

test('cartLine renderiza comentario personalizado cuando está presente (ej. Ricky sin cebolla)', () => {
  const itemWithNote = {
    productId: 'prod-1',
    name: 'Yaroa de Pollo',
    unitPriceCents: 25000,
    quantity: 1,
    notes: 'Ricky sin cebolla'
  };

  const html = cartLine(itemWithNote, 0);
  assert.match(html, /has-comment/);
  assert.match(html, /Ricky sin cebolla/);
  assert.match(html, /Editar/);
  assert.match(html, /data-cart-item-note="0"/);
});

test('cartLine renderiza prompt para agregar comentario cuando no tiene notas', () => {
  const itemWithoutNote = {
    productId: 'prod-2',
    name: 'Pechurina',
    unitPriceCents: 30000,
    quantity: 2,
    notes: ''
  };

  const html = cartLine(itemWithoutNote, 1);
  assert.doesNotMatch(html, /has-comment/);
  assert.match(html, /\+ Agregar comentario/);
  assert.match(html, /data-cart-item-note="1"/);
});

test('renderTablePickerModal renderiza Para Llevar y estado de mesas disponibles y ocupadas con cliente', () => {
  const tables = [
    { id: 't1', name: 'Mesa 1', active: true, currentOrderId: 'ord-1' },
    { id: 't2', name: 'Mesa 2', active: true, currentOrderId: null }
  ];
  const orders = [
    { id: 'ord-1', totalCents: 52000, status: 'open', clientName: 'Carlos Gómez' }
  ];

  const html = renderTablePickerModal(tables, 't1', orders);
  assert.match(html, /Para Llevar/);
  assert.match(html, /Mesa 1/);
  assert.match(html, /is-occupied/);
  assert.match(html, /Ocupada \(RD\$ ?520\.00\)/);
  assert.match(html, /Carlos Gómez/);
  assert.match(html, /picker-cell-client/);
  assert.match(html, /Mesa 2/);
  assert.match(html, /is-free/);
  assert.match(html, /Disponible/);
  assert.match(html, /data-pick-table-id="t1"/);
  assert.match(html, /data-pick-table-id="t2"/);
});

test('renderPos renderiza selector segmentado de destino (Para Llevar vs Salón) y campo de cliente', () => {
  const state = {
    products: [{ id: 'p1', name: 'Pollo 1/4', priceCents: 22000, category: 'Pollo', active: true }],
    categories: ['Pollo'],
    cart: [],
    posFilter: '',
    posCategory: 'all',
    posSearch: '',
    posSort: 'name',
    posDiscountState: { discount: 0, discountType: 'amount', includeLegalTip: false },
    tables: [
      { id: 't1', name: 'Mesa 1', active: true, currentOrderId: 'ord-1' },
      { id: 't2', name: 'Mesa 2', active: true, currentOrderId: null }
    ],
    orders: [
      { id: 'ord-1', tableId: 't1', tableName: 'Mesa 1', totalCents: 44000, clientName: 'María Rodríguez', items: [{ name: 'Pollo', quantity: 2 }] }
    ],
    loadedOrderId: '',
    loadedTableId: '',
    posDraft: { clientName: 'Juan Pérez' },
    hardwareStatus: { ready: true }
  };

  const html = renderPos(state);
  assert.match(html, /pos-tables-queue-bar/);
  assert.match(html, /Mesa 1/);
  assert.match(html, /María Rodríguez/);
  assert.match(html, /chip-client-name/);
  assert.match(html, /data-pos-load-table="t1"/);

  // Destino y cliente en cabecera de carrito
  assert.match(html, /pos-cart-destination-box/);
  assert.match(html, /data-pos-set-dest="takeout"/);
  assert.match(html, /data-pos-set-dest="table"/);
  assert.match(html, /id="pos-client-name"/);
  assert.match(html, /value="Juan Pérez"/);
  assert.match(html, /id="pos-table-select"/);
});

test('MemoryDataService combina pedidos al reenviar a una mesa ocupada', async () => {
  const service = new MemoryDataService({
    uid: 'cashier-1',
    displayName: 'Cajero Principal',
    role: 'cashier',
    active: true
  });

  const tableId = service.data.tables[0].id; // 'mesa-1'

  // Primer pedido para la mesa
  const orderId1 = await service.createOrder({
    tableId,
    clientName: 'Consumidor final',
    items: [{ productId: 'p1', name: 'Pollo 1/4', unitPriceCents: 22000, quantity: 1, totalCents: 22000 }]
  });

  const tableAfterFirst = service.data.tables.find((t) => t.id === tableId);
  assert.equal(tableAfterFirst.currentOrderId, orderId1);

  // Segundo pedido a la misma mesa -> debe combinarse
  const orderId2 = await service.createOrder({
    tableId,
    clientName: 'Consumidor final',
    items: [{ productId: 'p2', name: 'Nachos M', unitPriceCents: 17000, quantity: 1, totalCents: 17000, notes: 'Sin picante' }]
  });

  assert.equal(orderId2, orderId1);
  const updatedOrder = service.data.orders.find((o) => o.id === orderId1);
  assert.equal(updatedOrder.items.length, 2);
  assert.equal(updatedOrder.items[1].notes, 'Sin picante');
  assert.equal(updatedOrder.totalCents, 39000);
});

test('MemoryDataService permite cobrar directamente comanda activa sin pasar por cocina KDS', async () => {
  const service = new MemoryDataService({
    uid: 'cashier-1',
    displayName: 'Cajero Principal',
    role: 'cashier',
    active: true
  });

  const tableId = service.data.tables[1].id; // 'mesa-2'
  const cashSessionId = await service.openCashSession({ openingCents: 0, notes: 'Mesa test' });

  const orderId = await service.createOrder({
    tableId,
    clientName: 'Juan Pérez',
    items: [
      { productId: 'p1', name: 'Mofongo', unitPriceCents: 45000, quantity: 1, totalCents: 45000, notes: 'Ricky bien tostado' }
    ]
  });

  const orderBefore = service.data.orders.find((o) => o.id === orderId);
  assert.equal(orderBefore.status, 'pending');

  // Cobro directo desde el POS (sin pasar por status 'served' o 'pending_payment')
  const invoice = await service.chargeOrder(orderId, {
    method: 'cash',
    amountCents: 45000,
    tenderedCents: 50000,
    changeCents: 5000,
    cashSessionId
  });

  assert.ok(invoice?.id);
  const orderAfter = service.data.orders.find((o) => o.id === orderId);
  assert.equal(orderAfter.status, 'closed');

  const tableAfter = service.data.tables.find((t) => t.id === tableId);
  assert.equal(tableAfter.currentOrderId, null);

  const foundInvoice = service.data.invoices.find((inv) => inv.id === invoice.id);
  assert.ok(foundInvoice);
  assert.equal(foundInvoice.totalCents, 45000);
  assert.equal(foundInvoice.items[0].notes, 'Ricky bien tostado');
});

test('MemoryDataService.liberateTable cancela la comanda y deja la mesa disponible', async () => {
  const service = new MemoryDataService({
    tables: [
      { id: 'mesa-1', name: 'Mesa 1', active: true, status: 'available', currentOrderId: null }
    ],
    products: [
      { id: 'p1', name: 'Pollo 1/2', priceCents: 22000, active: true }
    ],
    orders: []
  });

  const orderId = await service.createOrder({
    tableId: 'mesa-1',
    clientName: 'Comensal Test',
    items: [{ productId: 'p1', name: 'Pollo 1/2', unitPriceCents: 22000, quantity: 1, totalCents: 22000 }]
  });

  const tableBefore = service.data.tables.find((t) => t.id === 'mesa-1');
  assert.equal(tableBefore.currentOrderId, orderId);
  assert.equal(tableBefore.status, 'occupied');

  await service.liberateTable('mesa-1', 'Liberada por cancelación de prueba');

  const tableAfter = service.data.tables.find((t) => t.id === 'mesa-1');
  assert.equal(tableAfter.currentOrderId, null);
  assert.equal(tableAfter.status, 'available');

  const orderAfter = service.data.orders.find((o) => o.id === orderId);
  assert.equal(orderAfter.status, 'cancelled');
  assert.equal(orderAfter.cancellationReason, 'Liberada por cancelación de prueba');
});

test('reintentar cobro en demo no libera una comanda nueva de la misma mesa', async () => {
  const service = new MemoryDataService({ uid: 'cashier-1', roles: ['cashier'], active: true });
  const input = { tableId: service.data.tables[0].id, items: [{ name: 'Café', quantity: 1, unitPriceCents: 10000 }] };
  const orderId = await service.createOrder(input);
  const payment = { requestId: 'retry-table-demo-0001', method: 'credit', amountCents: 0 };
  const invoice = await service.chargeOrder(orderId, payment);
  const secondOrder = await service.createOrder(input);
  assert.equal((await service.chargeOrder(orderId, payment)).id, invoice.id);
  assert.equal(service.data.tables[0].currentOrderId, secondOrder);
  await assert.rejects(service.chargeOrder(secondOrder, payment, [{ ...input.items[0], quantity: 2 }]), /cambió/);
});

test('renderPos y renderTablePickerModal renderizan botones para Liberar Mesa', () => {
  const tables = [
    { id: 't1', name: 'Mesa 1', active: true, currentOrderId: 'ord-1' },
    { id: 't2', name: 'Mesa 2', active: true, currentOrderId: null }
  ];
  const orders = [
    { id: 'ord-1', totalCents: 52000, status: 'open', clientName: 'Carlos Gómez' }
  ];

  // En modal de selección de mesas
  const pickerHtml = renderTablePickerModal(tables, 't1', orders);
  assert.match(pickerHtml, /data-pos-cancel-table="t1"/);
  assert.match(pickerHtml, /Liberar Mesa/);

  // En POS con mesa cargada
  const state = {
    products: [],
    categories: [],
    cart: [{ productId: 'p1', name: 'Mofongo', quantity: 1, unitPriceCents: 45000 }],
    tables,
    orders,
    loadedTableId: 't1',
    loadedOrderId: 'ord-1',
    posDiscountState: { discount: 0, discountType: 'amount', includeLegalTip: false },
    posDraft: {}
  };
  const posHtml = renderPos(state);
  assert.match(posHtml, /data-pos-cancel-table="t1"/);
  assert.match(posHtml, /Liberar Mesa/);
  assert.match(posHtml, /pos-loaded-table-actions/);
});
