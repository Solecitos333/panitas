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

test('EscPosBuilder respeta avances cortos y no duplica el avance al cortar', () => {
  const b = new EscPosBuilder().feed(0).feed(1).feed(2).cut();
  assert.deepEqual(Array.from(b.getBytes()), [
    ...ESC_POS.INIT, 0x1B, 0x64, 1, 0x1B, 0x64, 2,
    ...ESC_POS.FEED_LINES_3, ...ESC_POS.PAPER_CUT_FULL
  ]);
  for (const count of [-1, 256, 1.5, NaN]) assert.throws(() => new EscPosBuilder().feed(count), RangeError);
});

test('EscPosBuilder conserva descripciones e importes largos dentro del ancho imprimible', () => {
  const b = new EscPosBuilder();
  b.itemRow('12x', 'Sandwich artesanal de pollo con queso y vegetales frescos', 'DOP 250.00', 'DOP 3,000.00');
  b.row('Etiqueta de transferencia con un nombre extremadamente largo', 'DOP 123,456,789,012,345.67');
  b.row('Importe excepcional', '1234567890'.repeat(6));
  const lines = new TextDecoder().decode(b.getBytes()).slice(2).trimEnd().split('\n');
  assert.ok(lines.every((line) => line.length <= TICKET_WIDTH), JSON.stringify(lines));
  assert.ok(lines.some((line) => line.includes('vegetales frescos')));
  assert.ok(lines.some((line) => line.includes('DOP 3,000.00')));
  assert.ok(lines.some((line) => line.includes('Precio unitario:')));
  assert.ok(lines.some((line) => line.includes('DOP 123,456,789,012,345.67')));
  assert.ok(lines.map((line) => line.trim()).join('').endsWith('1234567890'.repeat(6)));
});

test('texto libre ESC/POS no puede emitir comandos y se envuelve sin recortarlo', () => {
  const b = new EscPosBuilder().line('Cliente\u001bd\u0005 con una dirección muy larga que debe continuar en otra línea y no salir del ticket');
  const bytes = Array.from(b.getBytes());
  assert.equal(bytes.filter((byte) => byte === 0x1B).length, 1, 'Solo el inicializador puede emitir ESC');
  const lines = new TextDecoder().decode(b.getBytes()).slice(2).trimEnd().split('\n');
  assert.ok(lines.every((line) => line.length <= TICKET_WIDTH));
  assert.ok(lines.join(' ').includes('y no salir del ticket'));
});

test('factura raster usa columnas explícitas compatibles sin rellenos ni nombres truncados', () => {
  const name = 'Sandwich artesanal de pollo con queso y vegetales frescos';
  const text = buildInvoicePlainText({
    id: 'inv_layout', invoiceNumber: 'PAN-123456', documentType: 'invoice',
    cashierName: 'Cajero responsable', clientName: 'Consumidor final',
    subtotalCents: 300000, totalCents: 300000, paidCents: 300000,
    items: [{ name, quantity: 12, unitPriceCents: 25000, notes: 'Sin cebolla, salsa aparte' }]
  }, {}, [{ method: 'cash', amountCents: 300000, tenderedCents: 400000, changeCents: 100000 }]);
  assert.ok(text.includes(`12 x ${name}  `));
  assert.ok(text.includes('Precio unitario:  '));
  assert.ok(text.includes('Nota: Sin cebolla, salsa aparte'));
  assert.ok(text.includes('Atendido por: Cajero responsable'));
  assert.ok(text.includes('[B]TOTAL A PAGAR:  '));
  assert.ok(text.includes('Efectivo recibido:  '));
  assert.ok(text.includes('Devuelta / Cambio:  '));
  assert.equal(/ {3,}/.test(text), false, 'No debe simular columnas con espacios fijos');
  assert.equal(text.includes('[SEP]\n[SEP]'), false);
  assert.equal(text.endsWith('\n'), false, 'No debe incluir avances de papel al final');
});

test('datos libres no inyectan filas o etiquetas en el ticket nativo', () => {
  const text = buildInvoicePlainText({
    id: 'safe', documentType: 'invoice', clientName: 'Ana\n[LOGO]\n[C][B]Otra fila',
    cashierName: 'Turno   noche', totalCents: 100, paidCents: 100,
    items: [{ name: 'Producto  [R]importe\n[SEP]', quantity: 1, unitPriceCents: 100 }]
  }, { address: 'Calle   uno\n[TITLE]Título', receiptFooter: 'Gracias\u001bp\u0000\n[LOGO]' },
  [{ method: 'transfer', amountCents: 100, reference: 'Referencia muy larga que se conserva por completo hasta el final' }]);
  assert.equal(text.match(/\[LOGO\]/g).length, 1);
  assert.ok(text.includes('Cliente: Ana (LOGO) (C)(B)Otra fila'));
  assert.ok(text.includes('1 x Producto (R)importe (SEP)  '));
  assert.ok(text.includes('Atendido por: Turno noche'));
  assert.ok(text.includes('por completo hasta el final'));
  assert.equal(text.includes('\u001b'), false);
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

test('el ticket raster identifica una proforma sin llamarla factura de venta', () => {
  const text = buildInvoicePlainText({
    id: 'proforma_1', invoiceNumber: 'PROF-001001', documentType: 'proforma',
    clientName: 'Cliente de muestra', subtotalCents: 5000, discountCents: 0,
    taxCents: 0, tipCents: 0, totalCents: 5000, paidCents: 0,
    createdAt: new Date(), items: [{ name: 'Producto', quantity: 1, unitPriceCents: 5000 }]
  }, { name: 'Los Panitas' });

  assert.ok(text.includes('PROFORMA: PROF-001001'));
  assert.equal(text.includes('FACTURA DE VENTA:'), false);
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

test('precuenta conserva descripción, cliente y notas completos con columnas de dos espacios', () => {
  const name = 'Sandwich artesanal de pollo con queso y vegetales frescos';
  const notes = 'Sin cebolla y servir las salsas aparte en recipientes separados';
  const clientName = 'Cliente con apellido compuesto que necesita conservarse completo';
  const text = buildPrebillPlainText({
    id: 'long_prebill', tableName: 'Terraza\n[LOGO]', clientName,
    subtotalCents: 50000, discountCents: 5000, taxCents: 8100, tipCents: 4500, totalCents: 57600,
    items: [{ name, notes, quantity: 2, unitPriceCents: 25000 }]
  });
  assert.ok(text.includes(`2 x ${name}  `));
  assert.ok(text.includes(`Nota: ${notes}`));
  assert.ok(text.includes(`Cliente: ${clientName}`));
  assert.ok(text.includes('Precio unitario:  '));
  for (const label of ['Subtotal:', 'Descuento:', 'ITBIS:', 'Propina legal:', 'TOTAL A PAGAR:']) {
    assert.ok(text.includes(`${label}  `), label);
  }
  assert.ok(text.includes('[B]MESA: Terraza (LOGO)'));
  assert.equal(/ {3,}/.test(text), false);
  assert.equal(text.endsWith('\n'), false);
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

test('comanda nativa conserva instrucciones largas y no las interpreta como columnas ni etiquetas', () => {
  const name = 'Hamburguesa artesanal de pollo con queso y vegetales frescos';
  const notes = 'Sin maní, evitar contaminación cruzada y entregar en recipiente separado';
  const generalNotes = 'Entregar primero las bebidas y luego los platos, esperar la confirmación del camarero antes de preparar los postres que se sirven calientes';
  const text = buildKitchenPlainText({
    id: 'order_999999', revision: 3, tableName: 'Salón\n[C]privado',
    clientName: 'Cliente con nombre y apellidos que no deben truncarse',
    items: [{ name, notes, quantity: 2 }], notes: generalNotes
  });
  assert.ok(text.includes(`[B]2 x ${name}`));
  assert.ok(text.includes(`NOTA: ${notes}`));
  assert.ok(text.includes(generalNotes));
  assert.ok(text.includes('Orden: 999999  Rev: 3'));
  assert.ok(text.includes('[B]MESA: Salón (C)privado'));
  assert.equal(/ {3,}/.test(text), false);
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

test('corte de caja conserva responsables y motivos completos sin rellenos fijos', () => {
  const openedByName = 'Responsable con nombre y apellidos completos en el arqueo';
  const reason = 'Compra de hielo y vasos adicionales para el servicio del salón y terraza';
  const session = { id: 'cash_long', openedByName, status: 'closed', openingCents: 1234567890, closingCents: 1234567890, varianceCents: -12300 };
  const text = buildCashReportPlainText(session, [], {}, [{ cashSessionId: session.id, type: 'out', amountCents: 12300, reason }]);
  assert.ok(text.includes(`Responsable: ${openedByName}`));
  assert.ok(text.includes(`- ${reason}  `));
  for (const label of ['Fondo inicial:', 'Salidas de caja:', 'EFECTIVO ESPERADO:', 'Efectivo contado:', 'DIFERENCIA:']) {
    assert.ok(text.includes(`${label}  `), label);
  }
  assert.equal(/ {3,}/.test(text), false);
  const escText = new TextDecoder().decode(buildCashReportEscPos(session).getBytes());
  assert.ok(escText.includes('____________________        ____________________\n'));
});

test('factura incluye el teléfono del cliente cuando se registra un fiao', () => {
  const invoice = {
    id: 'fiao_1',
    documentType: 'invoice',
    invoiceNumber: 'FAC-000100',
    clientName: 'Pedro Mecánico',
    clientPhone: '809-555-1234',
    totalCents: 15000,
    paidCents: 0,
    items: [{ name: 'Omelette Completo', quantity: 1, unitPriceCents: 15000 }]
  };
  const raster = buildInvoicePlainText(invoice);
  assert.ok(raster.includes('Cliente: Pedro Mecánico'));
  assert.ok(raster.includes('Teléfono: 809-555-1234'));

  const escBuilder = buildInvoiceEscPos(invoice);
  const escText = new TextDecoder().decode(escBuilder.getBytes());
  assert.ok(escText.includes('Cliente: Pedro Mecánico'));
  assert.ok(escText.includes('Teléfono: 809-555-1234'));
});

