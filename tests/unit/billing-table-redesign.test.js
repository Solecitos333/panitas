import test from 'node:test';
import assert from 'node:assert/strict';
import { renderInvoices } from '../../src/modules/billing.js';
import { formatTime, formatDate } from '../../src/lib/format.js';

test('Billing Table Redesign: formatTime devuelve la hora dominicana en formato 12h con AM/PM', () => {
  // 2026-11-02 20:30:00 UTC -> 16:30:00 America/Santo_Domingo (UTC-4) -> 4:30 p. m.
  const d = new Date('2026-11-02T20:30:00Z');
  const time = formatTime(d);
  assert.match(time, /\d{1,2}:\d{2}\s*(p\.\s*m\.|a\.\s*m\.|PM|AM)/i);
});

test('Billing Table Redesign: renderInvoices incluye encabezados enriquecidos y filtro de canal', () => {
  const html = renderInvoices({ invoices: [] });

  // Encabezados
  assert.ok(html.includes('Documento y Canal'), 'Debe incluir encabezado Documento y Canal');
  assert.ok(html.includes('Cliente / Destino'), 'Debe incluir encabezado Cliente / Destino');
  assert.ok(html.includes('Fecha y Hora'), 'Debe incluir encabezado Fecha y Hora');
  assert.ok(html.includes('Productos'), 'Debe incluir encabezado Productos');
  assert.ok(html.includes('Total y Pago'), 'Debe incluir encabezado Total y Pago');
  assert.ok(html.includes('Estado'), 'Debe incluir encabezado Estado');
  assert.ok(html.includes('Acciones'), 'Debe incluir encabezado Acciones');

  // Filtros de barra de herramientas
  assert.ok(html.includes('id="invoice-channel-filter"'), 'Debe incluir selector de canal');
  assert.ok(html.includes('value="delivery"'), 'Debe incluir opción Delivery');
  assert.ok(html.includes('value="table"'), 'Debe incluir opción Salón / Mesas');
  assert.ok(html.includes('value="takeout"'), 'Debe incluir opción Para llevar');
  assert.ok(html.includes('id="invoice-status-filter"'), 'Debe incluir filtro de estado');
});

test('Billing Table Redesign: cada fila muestra hora, canal, productos, método de pago y acciones rápidas', () => {
  const mockInvoice = {
    id: 'inv-test-101',
    invoiceNumber: 'PAN-004157',
    documentType: 'invoice',
    ncf: 'B0200000123',
    clientName: 'Col.bolivar',
    deliveryAddress: 'Calle Duarte #15',
    deliveryPhone: '809-555-1234',
    deliveryDriverName: 'Erick Delivery',
    createdAt: new Date('2026-11-02T19:45:00Z'),
    items: [
      { name: 'Yaroa Mixta Pollo y Res', quantity: 1, unitPriceCents: 22000 },
      { name: 'Jugo de Chinola', quantity: 2, unitPriceCents: 8000 }
    ],
    totalCents: 38000,
    paidCents: 0,
    status: 'pending',
    paymentMethod: 'delivery_cod',
    cashierName: 'Nechy Peña',
    revision: 2
  };

  const html = renderInvoices({ invoices: [mockInvoice] });

  // 1. Documento, canal y revisión
  assert.ok(html.includes('PAN-004157'), 'Muestra número de factura');
  assert.ok(html.includes('Rev. 2'), 'Muestra badge de revisión');
  assert.ok(html.includes('Delivery · Erick Delivery'), 'Muestra canal Delivery y repartidor');
  assert.ok(html.includes('data-channel="delivery"'), 'Atributo de canal en la fila');

  // 2. Cliente y destino
  assert.ok(html.includes('Col.bolivar'), 'Muestra nombre del cliente');
  assert.ok(html.includes('Calle Duarte #15'), 'Muestra dirección de entrega');
  assert.ok(html.includes('809-555-1234'), 'Muestra teléfono de contacto');

  // 3. Fecha y Hora
  assert.ok(html.includes('data-lucide="clock"'), 'Muestra icono de reloj para la hora');
  const expectedTime = formatTime(mockInvoice.createdAt);
  assert.ok(html.includes(expectedTime), `Muestra la hora exacta del pedido (${expectedTime})`);

  // 4. Resumen de productos
  assert.ok(html.includes('1x</b>'), 'Muestra cantidad del producto 1');
  assert.ok(html.includes('Yaroa Mixta Pollo y Res'), 'Muestra nombre del producto 1');
  assert.ok(html.includes('2x</b>'), 'Muestra cantidad del producto 2');
  assert.ok(html.includes('Jugo de Chinola'), 'Muestra nombre del producto 2');

  // 5. Total y Pago
  assert.ok(html.includes('Contra-entrega'), 'Muestra método de pago contra-entrega');
  assert.ok(html.includes('Debe:'), 'Muestra advertencia de balance pendiente');
  assert.ok(html.includes('Nechy Peña'), 'Muestra nombre del cajero/usuario que emitió');

  // 6. Acciones directas
  assert.ok(html.includes('data-invoice-view="inv-test-101"'), 'Botón ver detalle');
  assert.ok(html.includes('data-invoice-edit="inv-test-101"'), 'Botón modificar pedido');
  assert.ok(html.includes('data-invoice-quick-print="inv-test-101"'), 'Botón reimprimir ticket');
});
