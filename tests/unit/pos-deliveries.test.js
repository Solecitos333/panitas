import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPos } from '../../src/modules/operations.js';
import { getPendingDeliveryInvoices, formatMoney } from '../../src/domain/billing.js';

test('renderPos renderiza barra de deliveries en curso con pedidos y montos por chofer', () => {
  const state = {
    settings: { name: 'Los Panitas by Nechy' },
    capabilities: { bill: true, viewTables: true },
    cart: [],
    posDiscountState: { discount: 0, discountType: 'amount', includeLegalTip: false },
    posPaymentMethod: 'cash',
    posDestination: 'takeout',
    posDraft: {},
    products: [
      { id: 'p1', name: 'Yaroa de Pollo', priceCents: 35000, category: 'Yaroas', active: true }
    ],
    deliveryDrivers: [
      { id: 'drv-1', name: 'Juan Repartidor', phone: '809-555-1111', active: true },
      { id: 'drv-2', name: 'Carlos Express', phone: '809-555-2222', active: true }
    ],
    invoices: [
      {
        id: 'inv-1',
        invoiceNumber: 'FAC-0001',
        deliveryDriverId: 'drv-1',
        deliveryDriverName: 'Juan Repartidor',
        totalCents: 75000,
        paidCents: 0,
        status: 'pending',
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'in_transit'
      },
      {
        id: 'inv-2',
        invoiceNumber: 'FAC-0002',
        deliveryDriverId: 'drv-1',
        deliveryDriverName: 'Juan Repartidor',
        totalCents: 45000,
        paidCents: 0,
        status: 'pending',
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'in_transit'
      },
      {
        id: 'inv-3',
        invoiceNumber: 'FAC-0003',
        deliveryDriverId: 'drv-2',
        deliveryDriverName: 'Carlos Express',
        totalCents: 50000,
        paidCents: 0,
        status: 'pending',
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'in_transit'
      }
    ],
    tables: [],
    orders: []
  };

  const html = renderPos(state);

  // La barra de deliveries en curso debe estar presente en el POS
  assert.ok(html.includes('pos-deliveries-queue-bar'), 'Debe incluir pos-deliveries-queue-bar');
  assert.ok(html.includes('Deliveries en calle'), 'Debe mostrar etiqueta de Deliveries en calle');

  // Chips de choferes con pedidos y montos agrupados
  assert.ok(html.includes('data-pos-settle-driver="drv-1"'), 'Debe incluir chip para liquidar chofer 1');
  assert.ok(html.includes('Juan Repartidor'), 'Debe mostrar nombre del chofer 1');
  assert.ok(html.includes('2 ped.'), 'Debe indicar que el chofer 1 tiene 2 pedidos');
  assert.ok(html.includes(formatMoney(120000)), 'Debe sumar 750 + 450 = 1,200 del chofer 1');

  assert.ok(html.includes('data-pos-settle-driver="drv-2"'), 'Debe incluir chip para liquidar chofer 2');
  assert.ok(html.includes('Carlos Express'), 'Debe mostrar nombre del chofer 2');
  assert.ok(html.includes('1 ped.'), 'Debe indicar que el chofer 2 tiene 1 pedido');
  assert.ok(html.includes(formatMoney(50000)), 'Debe mostrar 500 del chofer 2');

  // Enlace a gestión completa de Deliveries
  assert.ok(html.includes('data-route="deliveries"'), 'Debe incluir botón data-route="deliveries" para gestión completa');
});

test('renderPos renderiza pestaña y campos de Delivery en el carrito cuando posDestination es delivery', () => {
  const state = {
    settings: { name: 'Los Panitas by Nechy' },
    capabilities: { bill: true, viewTables: true },
    cart: [{ id: 'p1', name: 'Yaroa de Pollo', unitPriceCents: 35000, quantity: 1, taxRate: 0 }],
    posDiscountState: { discount: 0, discountType: 'amount', includeLegalTip: false },
    posPaymentMethod: 'delivery_cod',
    posDestination: 'delivery',
    posDraft: {
      deliveryDriverId: 'drv-1',
      deliveryPhone: '809-555-9999',
      deliveryAddress: 'Calle Central #12, Ensanche Quisqueya',
      deliveryNotes: 'Paga con billete de 1000'
    },
    products: [],
    deliveryDrivers: [
      { id: 'drv-1', name: 'Juan Repartidor', active: true }
    ],
    invoices: [],
    tables: [],
    orders: []
  };

  const html = renderPos(state);

  // Pestaña Delivery seleccionada
  assert.ok(html.includes('data-pos-set-dest="delivery"'), 'Debe incluir botón data-pos-set-dest="delivery"');
  assert.ok(html.includes('pos-cart-delivery-fields'), 'Debe renderizar campos de entrega cuando posDestination es delivery');
  assert.ok(html.includes('pos-delivery-driver-select'), 'Debe incluir selector de chofer');
  assert.ok(html.includes('pos-delivery-phone'), 'Debe incluir input de teléfono');
  assert.ok(html.includes('pos-delivery-address'), 'Debe incluir input de dirección');
  assert.ok(html.includes('pos-delivery-notes'), 'Debe incluir input de notas de entrega');

  // Botón de cobro con etiqueta de despacho delivery
  assert.ok(html.includes(`Despachar Delivery ${formatMoney(35000)}`), 'El botón debe decir Despachar Delivery con el monto');

  // En modo delivery, el método de pago se llama "Contra Entrega" para evitar duplicidad con el destino Delivery
  assert.ok(html.includes('<span>Contra Entrega</span>'), 'El botón de pago debe decir Contra Entrega');
  assert.ok(html.includes('data-pos-method="delivery_cod"'), 'Debe existir método de pago delivery_cod');

  // La caja superior pos-cart-destination-box no debe contener los campos de entrega para no tapar los productos
  const destBoxMatch = html.match(/<div class="pos-cart-destination-box">([\s\S]*?)<\/div>\s*<div class="pos-cart-scroll-area">/);
  assert.ok(destBoxMatch, 'Debe existir pos-cart-destination-box antes de pos-cart-scroll-area');
  assert.ok(!destBoxMatch[1].includes('pos-cart-delivery-fields'), 'La cabecera superior no debe contener los campos de entrega');

  // No debe contener emojis no profesionales
  assert.ok(!html.includes('🛵'), 'No debe contener emojis');
});

test('renderPos no muestra botón de Delivery en formas de pago cuando el destino es Para Llevar o Salón', () => {
  const stateTakeout = {
    settings: { name: 'Los Panitas by Nechy' },
    capabilities: { bill: true, viewTables: true },
    cart: [{ id: 'p1', name: 'Yaroa de Pollo', unitPriceCents: 35000, quantity: 1, taxRate: 0 }],
    posDiscountState: { discount: 0, discountType: 'amount', includeLegalTip: false },
    posPaymentMethod: 'cash',
    posDestination: 'takeout',
    posDraft: {},
    products: [],
    deliveryDrivers: [],
    invoices: [],
    tables: [],
    orders: []
  };

  const htmlTakeout = renderPos(stateTakeout);
  // No debe existir botón de delivery_cod en la cuadrícula de pagos
  assert.ok(!htmlTakeout.includes('data-pos-method="delivery_cod"'), 'Para Llevar no debe tener botón de delivery en formas de pago');
  assert.ok(htmlTakeout.includes('data-pos-method="cash"'), 'Debe incluir Efectivo');
  assert.ok(htmlTakeout.includes('data-pos-method="card"'), 'Debe incluir Tarjeta');
  assert.ok(htmlTakeout.includes('data-pos-method="transfer"'), 'Debe incluir Transferencia');
  assert.ok(htmlTakeout.includes('data-pos-method="credit"'), 'Debe incluir Fiao');
  assert.ok(!htmlTakeout.includes('pos-cart-delivery-fields'), 'Para Llevar no debe renderizar campos de entrega');
});


test('getPendingDeliveryInvoices filtra únicamente facturas por cobrar y despachadas', () => {
  const invoices = [
    { id: '1', paymentMethod: 'delivery_cod', status: 'pending', deliveryStatus: 'in_transit', totalCents: 50000, paidCents: 0 },
    { id: '2', paymentMethod: 'delivery_cod', status: 'paid', deliveryStatus: 'delivered', totalCents: 30000, paidCents: 30000 },
    { id: '3', paymentMethod: 'cash', status: 'pending', deliveryStatus: '', totalCents: 20000, paidCents: 0 },
    { id: '4', paymentMethod: 'delivery_cod', status: 'cancelled', deliveryStatus: 'in_transit', totalCents: 40000, paidCents: 0 }
  ];

  const pending = getPendingDeliveryInvoices(invoices);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, '1');
});
