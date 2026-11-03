import test from 'node:test';
import assert from 'node:assert/strict';
import { getDailyProductsBreakdown, renderProductSalesDetailModal } from '../../src/modules/operations.js';

test('Product Buyers Modal: getDailyProductsBreakdown adjunta ventas detalladas con cliente, canal y monto', () => {
  const products = [
    { id: 'prod-desayuno', name: 'Desayuno', category: 'Desayunos', isPrepared: false }
  ];

  const invoices = [
    {
      id: 'inv-1',
      invoiceNumber: 'PAN-004154',
      clientName: 'Marisol',
      clientPhone: '809-555-1111',
      deliveryAddress: '',
      deliveryDriverName: '',
      tableName: 'Mesa 3',
      createdAt: new Date('2026-11-02T13:30:00Z'),
      paymentMethod: 'cash',
      paidCents: 20000,
      totalCents: 20000,
      status: 'paid',
      items: [
        { productId: 'prod-desayuno', name: 'Desayuno', quantity: 2, unitPriceCents: 10000, side: 'Víveres' }
      ]
    },
    {
      id: 'inv-2',
      invoiceNumber: 'PAN-004157',
      clientName: 'Col.bolivar',
      clientPhone: '809-555-2222',
      deliveryAddress: 'Calle Duarte #15',
      deliveryDriverName: 'Erick Delivery',
      tableName: '',
      createdAt: new Date('2026-11-02T14:45:00Z'),
      paymentMethod: 'delivery_cod',
      paidCents: 0,
      totalCents: 22000,
      status: 'pending',
      items: [
        { productId: 'prod-desayuno', name: 'Desayuno', quantity: 1, unitPriceCents: 10000, notes: 'Sin cebolla' }
      ]
    }
  ];

  const breakdown = getDailyProductsBreakdown(invoices, products);
  assert.equal(breakdown.length, 1);
  const desayuno = breakdown[0];

  assert.equal(desayuno.name, 'Desayuno');
  assert.equal(desayuno.quantity, 3);
  assert.equal(desayuno.totalCents, 30000);
  assert.ok(Array.isArray(desayuno.sales), 'Debe tener arreglo de sales');
  assert.equal(desayuno.sales.length, 2);

  // Venta 1 (Marisol en Mesa 3)
  assert.equal(desayuno.sales[0].clientName, 'Marisol');
  assert.equal(desayuno.sales[0].tableName, 'Mesa 3');
  assert.equal(desayuno.sales[0].quantity, 2);
  assert.equal(desayuno.sales[0].side, 'Víveres');

  // Venta 2 (Col.bolivar por Delivery Erick)
  assert.equal(desayuno.sales[1].clientName, 'Col.bolivar');
  assert.equal(desayuno.sales[1].deliveryDriverName, 'Erick Delivery');
  assert.equal(desayuno.sales[1].isDelivery, true);
  assert.equal(desayuno.sales[1].notes, 'Sin cebolla');
});

test('Product Buyers Modal: renderProductSalesDetailModal genera interfaz completa con desglose de compradores', () => {
  const mockProduct = {
    id: 'prod-desayuno',
    name: 'Desayuno',
    category: 'Desayunos',
    isPrepared: false,
    quantity: 3,
    totalCents: 30000,
    sales: [
      {
        invoiceId: 'inv-1',
        invoiceNumber: 'PAN-004154',
        clientName: 'Marisol',
        clientPhone: '809-555-1111',
        deliveryAddress: '',
        deliveryDriverName: '',
        tableName: 'Mesa 3',
        createdAt: new Date('2026-11-02T13:30:00Z'),
        quantity: 2,
        unitPriceCents: 10000,
        totalCents: 20000,
        side: 'Víveres',
        notes: '',
        paymentMethod: 'cash'
      },
      {
        invoiceId: 'inv-2',
        invoiceNumber: 'PAN-004157',
        clientName: 'Col.bolivar',
        clientPhone: '809-555-2222',
        deliveryAddress: 'Calle Duarte #15',
        deliveryDriverName: 'Erick Delivery',
        isDelivery: true,
        tableName: '',
        createdAt: new Date('2026-11-02T14:45:00Z'),
        quantity: 1,
        unitPriceCents: 10000,
        totalCents: 10000,
        side: '',
        notes: 'Sin cebolla',
        paymentMethod: 'delivery_cod'
      }
    ]
  };

  const html = renderProductSalesDetailModal(mockProduct);

  // Título y resumen
  assert.ok(html.includes('Desayuno'), 'Debe mostrar nombre del producto');
  assert.ok(html.includes('3 unidades'), 'Debe mostrar total de unidades');
  assert.ok(html.includes('Desayunos'), 'Debe mostrar categoría');
  assert.ok(html.includes('Stock'), 'Badge de tipo');

  // Comprador 1: Marisol
  assert.ok(html.includes('Marisol'), 'Muestra comprador Marisol');
  assert.ok(html.includes('Mesa 3'), 'Muestra canal Mesa 3');
  assert.ok(html.includes('Víveres'), 'Muestra guarnición');

  // Comprador 2: Col.bolivar
  assert.ok(html.includes('Col.bolivar'), 'Muestra comprador Col.bolivar');
  assert.ok(html.includes('Calle Duarte #15'), 'Muestra dirección de entrega');
  assert.ok(html.includes('Erick Delivery'), 'Muestra repartidor');
  assert.ok(html.includes('Sin cebolla'), 'Muestra nota');

  // Buscador y botones de acción
  assert.ok(html.includes('id="product-buyers-search"'), 'Campo de búsqueda de compradores');
  assert.ok(html.includes('data-invoice-view="inv-1"'), 'Botón para ver factura 1');
  assert.ok(html.includes('data-invoice-view="inv-2"'), 'Botón para ver factura 2');
});
