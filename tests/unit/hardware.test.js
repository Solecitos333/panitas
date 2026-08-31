import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EscPosBuilder,
  ESC_POS,
  TICKET_WIDTH,
  buildInvoiceEscPos,
  buildInvoicePlainText,
  buildKitchenEscPos,
  buildKitchenPlainText,
  buildCashReportEscPos,
  buildCashReportPlainText,
  buildPrebillEscPos,
  buildPrebillPlainText,
  resolveReceiptQrUrl
} from '../../src/lib/hardware.js';

test('EscPosBuilder inicializa con comando ESC @', () => {
  const b = new EscPosBuilder();
  const bytes = b.getBytes();
  assert.equal(bytes[0], 0x1B);
  assert.equal(bytes[1], 0x40);
});

test('EscPosBuilder genera pulso de gaveta de dinero correctamente', () => {
  const b = new EscPosBuilder();
  b.kickDrawer();
  const bytes = b.getBytes();
  // Contiene la secuencia ESC p 0 25 250
  const kickIdx = bytes.findIndex((byte, idx) =>
    byte === 0x1B &&
    bytes[idx + 1] === 0x70 &&
    bytes[idx + 2] === 0x00 &&
    bytes[idx + 3] === 0x19 &&
    bytes[idx + 4] === 0xFA
  );
  assert.ok(kickIdx >= 0, 'Debe contener la secuencia de pulso de gaveta');
});

test('EscPosBuilder formatea filas respetando el ancho de 48 caracteres', () => {
  const b = new EscPosBuilder();
  b.row('SUBTOTAL:', '$1,500.00');
  const text = new TextDecoder().decode(b.getBytes());
  const lines = text.split('\n').filter(Boolean);
  const rowLine = lines.find((l) => l.includes('SUBTOTAL:'));
  assert.ok(rowLine, 'Debe existir la línea con SUBTOTAL:');
  // Eliminamos los 2 primeros bytes de init (\x1B\x40) si están presentes al inicio
  const cleanLine = rowLine.replace(/^\x1B@/, '');
  assert.equal(cleanLine.length, TICKET_WIDTH);
});

test('buildInvoiceEscPos genera ticket completo con NCF y corte', () => {
  const invoice = {
    id: 'inv_123',
    invoiceNumber: 'PAN-000105',
    documentType: 'invoice',
    ncf: 'B0200000045',
    clientName: 'Juan Perez',
    subtotalCents: 50000,
    discountCents: 5000,
    taxCents: 8100,
    tipCents: 4500,
    totalCents: 57600,
    paidCents: 57600,
    createdAt: new Date(),
    items: [
      { name: 'Sandwich Especial', quantity: 2, unitPriceCents: 25000 }
    ]
  };
  const settings = {
    name: 'Los Panitas by Nechy',
    rnc: '131-12345-6',
    phone: '829-459-7437'
  };
  const payments = [
    { invoiceId: 'inv_123', method: 'cash', amountCents: 57600 }
  ];

  const builder = buildInvoiceEscPos(invoice, settings, payments, { receivedCents: 100000, changeCents: 42400 });
  const bytes = builder.getBytes();
  const text = new TextDecoder().decode(bytes);

  assert.ok(text.includes('Los Panitas by Nechy'));
  assert.ok(text.includes('PAN-000105'));
  assert.ok(text.includes('B0200000045'));
  assert.ok(text.includes('Sandwich Especial'));
  assert.ok(text.includes('DESCUENTO:'));
  assert.ok(text.includes('PROPINA LEY (10%):'));
  assert.ok(text.includes('Efectivo recibido'));
  assert.ok(text.includes('Devuelta / Cambio'));
  assert.ok(bytes.includes(0x1D), 'Debe contener comando de corte');
  assert.ok(buildInvoicePlainText(invoice, settings, payments).startsWith('[LOGO]\n'));
});

test('el ticket raster omite RNC sin configurar e incluye datos fiscales y balance', () => {
  const text = buildInvoicePlainText({
    id: 'inv_credit', invoiceNumber: 'PAN-000106', documentType: 'invoice',
    clientName: 'Negocio Ejemplo', clientRnc: '131123456', subtotalCents: 10000,
    taxCents: 1800, tipCents: 1000, totalCents: 12800, paidCents: 0,
    createdAt: new Date(), items: [{ name: 'Producto', quantity: 1, unitPriceCents: 10000 }]
  }, { name: 'Los Panitas', rnc: 'N/D' });

  assert.equal(text.includes('RNC: N/D'), false);
  assert.ok(text.includes('RNC/Cédula: 131123456'));
  assert.ok(text.includes('Propina legal:'));
  assert.ok(text.includes('BALANCE PENDIENTE:'));
});

test('el QR prioriza menú, luego WhatsApp y finalmente el sitio oficial', () => {
  assert.equal(resolveReceiptQrUrl({ menuUrl: 'https://menu.example/panitas', whatsapp: '8095550000' }), 'https://menu.example/panitas');
  assert.equal(resolveReceiptQrUrl({ whatsapp: '+1 (809) 555-0000' }), 'https://wa.me/18095550000');
  assert.equal(resolveReceiptQrUrl({}), 'https://los-panitas-by-nechy.web.app');
});

test('buildPrebillEscPos genera ticket de pre-cuenta con aviso de no fiscal', () => {
  const order = {
    id: 'ord_table2',
    tableName: 'Mesa Terraza 2',
    clientName: 'Carlos Martinez',
    subtotalCents: 80000,
    taxCents: 14400,
    tipCents: 8000,
    totalCents: 102400,
    createdAt: new Date(),
    items: [
      { name: 'Mofongo Especial', quantity: 2, unitPriceCents: 40000, notes: 'Bien crujiente' }
    ]
  };
  const builder = buildPrebillEscPos(order, { name: 'Los Panitas by Nechy' });
  const text = new TextDecoder().decode(builder.getBytes());

  assert.ok(text.includes('ESTADO DE CONSUMO / PRE-CUENTA'));
  assert.ok(text.includes('(NO VALIDO COMO COMPROBANTE FISCAL)'));
  assert.ok(text.includes('MESA: Mesa Terraza 2'));
  assert.ok(text.includes('Mofongo Especial'));
  assert.ok(text.includes('TOTAL A PAGAR:'));
  const rasterText = buildPrebillPlainText(order, { name: 'Los Panitas by Nechy' });
  assert.ok(rasterText.includes('[LOGO]'));
  assert.ok(rasterText.includes('NO VÁLIDO COMO COMPROBANTE FISCAL'));
  assert.ok(rasterText.includes('Mofongo Especial'));
});

test('buildKitchenEscPos genera comanda para cocina con mesa y notas', () => {
  const order = {
    id: 'ord_9999',
    tableName: 'Mesa 4',
    clientName: 'Familia Gomez',
    priority: 'urgent',
    revision: 1,
    createdAt: new Date(),
    items: [
      { name: 'Jugo de Chinola', quantity: 2, notes: 'Sin azúcar' },
      { name: 'Empanada de Pollo', quantity: 3 }
    ],
    notes: 'Entregar primero los jugos'
  };

  const builder = buildKitchenEscPos(order, { name: 'Los Panitas' });
  const text = new TextDecoder().decode(builder.getBytes());

  assert.ok(text.includes('*** COCINA ***'));
  assert.ok(text.includes('MESA: Mesa 4'));
  assert.ok(text.includes('URGENTE'));
  assert.ok(text.includes('Sin azúcar'));
  assert.ok(text.includes('Entregar primero los jugos'));
  const rasterText = buildKitchenPlainText(order, { name: 'Los Panitas' });
  assert.ok(rasterText.includes('[TITLE]*** COCINA ***'));
  assert.ok(rasterText.includes('[B]MESA: Mesa 4'));
  assert.ok(rasterText.includes('Sin azúcar'));
});

test('buildCashReportEscPos genera reporte de arqueo Corte X y Corte Z con desglose', () => {
  const session = {
    id: 'cash_1',
    openedByName: 'Cajero 1',
    openedAt: new Date(),
    closedAt: new Date(),
    status: 'closed',
    openingCents: 500000,
    closingCents: 1500000,
    varianceCents: 0
  };
  const payments = [
    { cashSessionId: 'cash_1', method: 'cash', amountCents: 1000000 },
    { cashSessionId: 'cash_1', method: 'card', amountCents: 300000 }
  ];

  const movements = [
    { cashSessionId: 'cash_1', type: 'in', amountCents: 20000, reason: 'Cambio adicional' },
    { cashSessionId: 'cash_1', type: 'out', amountCents: 5000, reason: 'Compra menor de hielo' }
  ];
  const builderZ = buildCashReportEscPos(session, payments, { name: 'Los Panitas' }, movements, 'Z');
  const textZ = new TextDecoder().decode(builderZ.getBytes());

  assert.ok(textZ.includes('CIERRE DE CAJA (CORTE Z)'));
  assert.ok(textZ.includes('Fondo Inicial:'));
  assert.ok(textZ.includes('Ventas Efectivo:'));
  assert.ok(textZ.includes('Ventas Tarjeta:'));
  assert.ok(textZ.includes('Entradas (Fondo/Ingreso):'));
  assert.ok(textZ.includes('Salidas (Gastos/Retiros):'));
  assert.ok(textZ.includes('Compra menor de hielo'));
  assert.ok(textZ.includes('CUADRADO'));
  assert.ok(textZ.includes('Firma Cajero'));
  assert.ok(textZ.includes('Firma Supervisor'));

  const builderX = buildCashReportEscPos({ ...session, status: 'open' }, payments, { name: 'Los Panitas' }, movements, 'X');
  const textX = new TextDecoder().decode(builderX.getBytes());
  assert.ok(textX.includes('ARQUEO PARCIAL (CORTE X)'));
  const rasterText = buildCashReportPlainText({ ...session, expectedCents: 1515000 }, payments, { name: 'Los Panitas' }, movements, 'Z');
  assert.ok(rasterText.includes('[TITLE]CIERRE DE CAJA · CORTE Z'));
  assert.ok(rasterText.includes('EFECTIVO ESPERADO:'));
  assert.ok(rasterText.includes('Compra menor de hielo'));
});
