import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderReceivables,
  renderClientBulkPayModal,
  renderClientStatementModal,
  cleanPhoneForWa
} from '../../src/modules/receivables.js';
import {
  buildReceivablesReportEscPos,
  buildReceivablesReportPlainText,
  buildClientStatementEscPos,
  buildClientStatementPlainText,
  buildClientSettlementEscPos,
  buildClientSettlementPlainText
} from '../../src/lib/hardware.js';

test('cleanPhoneForWa normaliza números dominicanos para enlace de WhatsApp', () => {
  assert.equal(cleanPhoneForWa('809-555-1234'), '18095551234');
  assert.equal(cleanPhoneForWa('18295554321'), '18295554321');
  assert.equal(cleanPhoneForWa(''), '');
});

test('renderReceivables calcula métricas de deuda, mora y cobros del día correctamente', () => {
  const now = new Date();
  const daysAgo20 = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
  const daysAgo2 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const state = {
    receivablesTab: 'debts',
    invoices: [
      {
        id: 'inv_1',
        documentType: 'invoice',
        invoiceNumber: 'FAC-001',
        clientName: 'Juan Perez',
        totalCents: 50000, // RD$ 500.00
        paidCents: 0,
        createdAt: daysAgo20,
        items: [{ name: 'Yaroa de Pollo', quantity: 1, unitPriceCents: 50000 }]
      },
      {
        id: 'inv_2',
        documentType: 'invoice',
        invoiceNumber: 'FAC-002',
        clientName: 'Juan Perez',
        totalCents: 30000, // RD$ 300.00
        paidCents: 0,
        createdAt: daysAgo2,
        items: [{ name: 'Coca Cola 2L', quantity: 1, unitPriceCents: 30000 }]
      },
      {
        id: 'inv_3',
        documentType: 'invoice',
        invoiceNumber: 'FAC-003',
        clientName: 'Maria Rodriguez',
        clientPhone: '809-555-9999',
        totalCents: 40000, // RD$ 400.00
        paidCents: 10000,  // Balance RD$ 300.00
        createdAt: now,
        items: [{ name: 'Sándwich Especial', quantity: 1, unitPriceCents: 40000 }]
      }
    ],
    payments: [
      {
        id: 'pay_today',
        invoiceId: 'inv_3',
        amountCents: 10000,
        concept: 'fiao',
        method: 'cash',
        createdAt: now
      }
    ],
    clients: [
      { id: 'c_juan', name: 'Juan Perez', phone: '809-555-1111', creditLimitCents: 60000 }
    ]
  };

  const html = renderReceivables(state);

  // Verificación de totales:
  // Total pendiente: 500 + 300 + 300 = RD$ 1,100.00
  assert.ok(html.includes('1,100.00'), 'Debe mostrar el total en fiao pendiente de RD$ 1,100.00');
  // Clientes con deuda: 2 (Juan Perez y Maria Rodriguez)
  assert.ok(html.includes('Clientes con Deuda'), 'Debe mostrar la métrica de clientes con deuda');
  // Cobrado hoy de fiaos: RD$ 100.00
  assert.ok(html.includes('100.00'), 'Debe mostrar el cobro de hoy de RD$ 100.00');
  // En mora (+15 días): Juan Perez tiene una factura de hace 20 días por RD$ 500.00
  assert.ok(html.includes('500.00'), 'Debe mostrar la deuda en mora de RD$ 500.00');
  // Límite excedido para Juan Perez (debe 800 y su límite es 600)
  assert.ok(html.includes('Límite excedido'), 'Debe señalar alerta de límite excedido');
});

test('renderReceivables filtra por antigüedad de deuda (+15 días)', () => {
  const now = new Date();
  const daysAgo20 = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

  const state = {
    receivablesTab: 'debts',
    receivablesAgeFilter: 'over15',
    invoices: [
      {
        id: 'inv_old',
        documentType: 'invoice',
        invoiceNumber: 'FAC-OLD',
        clientName: 'Cliente Antiguo',
        totalCents: 100000,
        paidCents: 0,
        createdAt: daysAgo20,
        items: [{ name: 'Plato del Día', quantity: 1 }]
      },
      {
        id: 'inv_recent',
        documentType: 'invoice',
        invoiceNumber: 'FAC-NEW',
        clientName: 'Cliente Reciente',
        totalCents: 50000,
        paidCents: 0,
        createdAt: now,
        items: [{ name: 'Jugo de Fresa', quantity: 1 }]
      }
    ]
  };

  const html = renderReceivables(state);
  assert.ok(html.includes('Cliente Antiguo'), 'Debe mostrar al cliente en mora');
  assert.equal(html.includes('Cliente Reciente'), false, 'No debe mostrar al cliente reciente con filtro over15');
});

test('renderReceivables filtra por producto y factura con buscador inteligente difuso', () => {
  const state = {
    receivablesTab: 'debts',
    receivablesSearch: 'yarooa', // Búsqueda con error ortográfico
    invoices: [
      {
        id: 'inv_yaroa',
        documentType: 'invoice',
        invoiceNumber: 'FAC-00088',
        clientName: 'Carlos M.',
        totalCents: 35000,
        paidCents: 0,
        createdAt: new Date(),
        items: [{ name: 'Yaroa de Res', quantity: 1, unitPriceCents: 35000 }]
      },
      {
        id: 'inv_otro',
        documentType: 'invoice',
        invoiceNumber: 'FAC-00099',
        clientName: 'Ramon G.',
        totalCents: 20000,
        paidCents: 0,
        createdAt: new Date(),
        items: [{ name: 'Pechurina Clásica', quantity: 1, unitPriceCents: 20000 }]
      }
    ]
  };

  const html = renderReceivables(state);
  assert.ok(html.includes('Carlos M.'), 'Debe encontrar a Carlos M. por la búsqueda difusa de yarooa');
  assert.equal(html.includes('Ramon G.'), false, 'No debe coincidir Ramon G. con yarooa');
});

test('renderClientBulkPayModal genera formulario de cobro global con desglose y PIN de 6 dígitos', () => {
  const client = {
    name: 'Roberto Gómez',
    phone: '809-555-3333',
    totalDebtCents: 150000,
    invoices: [
      { id: 'inv_a', invoiceNumber: 'FAC-101', balanceCents: 75000, createdAt: new Date() },
      { id: 'inv_b', invoiceNumber: 'FAC-102', balanceCents: 75000, createdAt: new Date() }
    ]
  };

  const html = renderClientBulkPayModal(client, { id: 'session_1', status: 'open' });
  assert.ok(html.includes('Abonar / Saldar: Roberto Gómez'));
  assert.ok(html.includes('FAC-101'));
  assert.ok(html.includes('FAC-102'));
  assert.ok(html.includes('data-touch-numpad="money"'));
  assert.ok(html.includes('data-slot="5"'), 'Debe incluir 6 slots de PIN');
  assert.ok(html.includes('id="bulk-pay-submit"'));
});

test('renderClientStatementModal genera estado de cuenta con enlaces y consumos', () => {
  const client = {
    name: 'Ana Lucía',
    phone: '809-555-7777',
    totalDebtCents: 85000,
    creditLimitCents: 100000,
    invoices: [
      {
        id: 'inv_10',
        invoiceNumber: 'FAC-501',
        balanceCents: 85000,
        createdAt: new Date(),
        items: [{ name: 'Hamburguesa Doble', quantity: 2 }]
      }
    ]
  };

  const html = renderClientStatementModal(client, { name: 'Los Panitas by Nechy' });
  assert.ok(html.includes('Estado de Cuenta'));
  assert.ok(html.includes('Ana Lucía'));
  assert.ok(html.includes('FAC-501'));
  assert.ok(html.includes('Hamburguesa Doble'));
  assert.ok(html.includes('850.00'));
  assert.ok(html.includes('data-print-client-statement-btn'));
});

test('buildReceivablesReport genera tickets ESC/POS y Star Raster para la impresora', () => {
  const reportData = {
    date: new Date(),
    totalDebtCents: 250000,
    clientsCount: 2,
    invoicesCount: 3,
    overdueDebtCents: 100000,
    clients: [
      { name: 'Juan Perez', phone: '809-555-1111', totalDebtCents: 150000, maxAgeDays: 18 },
      { name: 'Pedro Mecanico', phone: '809-555-2222', totalDebtCents: 100000, maxAgeDays: 5 }
    ]
  };

  // 1. ESC/POS
  const escBuilder = buildReceivablesReportEscPos(reportData, { name: 'LOS PANITAS' });
  const escText = new TextDecoder().decode(escBuilder.getBytes());
  assert.ok(escText.includes('REPORTE DE CUENTAS POR COBRAR'));
  assert.ok(escText.includes('2,500.00'));
  assert.ok(escText.includes('Juan Perez'));
  assert.ok(escText.includes('1,500.00'));

  // 2. Star Raster / Texto Plano
  const raster = buildReceivablesReportPlainText(reportData, { name: 'Los Panitas' });
  assert.ok(raster.includes('[TITLE]REPORTE CUENTAS POR COBRAR'));
  assert.ok(raster.includes('2,500.00'));
  assert.ok(raster.includes('Juan Perez'));
});

test('buildClientStatement y buildClientSettlement generan comprobantes completos', () => {
  const client = {
    name: 'Pedro Mecánico',
    phone: '809-555-4444',
    creditLimitCents: 200000,
    totalDebtCents: 120000,
    invoices: [
      {
        invoiceNumber: 'FAC-007',
        balanceCents: 120000,
        createdAt: new Date(),
        items: [{ name: 'Super Yaroa', quantity: 2 }]
      }
    ]
  };

  const statementEsc = buildClientStatementEscPos(client, { name: 'LOS PANITAS' });
  const statementText = new TextDecoder().decode(statementEsc.getBytes());
  assert.ok(statementText.includes('ESTADO DE CUENTA - CLIENTE'));
  assert.ok(statementText.includes('Pedro Mec'));
  assert.ok(statementText.includes('Super Yaroa'));
  assert.ok(statementText.includes('1,200.00'));

  const settlement = {
    createdAt: new Date(),
    clientName: 'Pedro Mecánico',
    clientPhone: '809-555-4444',
    cashierName: 'Junior',
    method: 'cash',
    totalPaidCents: 120000,
    tenderedCents: 150000,
    changeCents: 30000,
    remainingDebtCents: 0,
    invoices: [{ invoiceNumber: 'FAC-007', appliedCents: 120000 }]
  };

  const settlementEsc = buildClientSettlementEscPos(settlement, { name: 'LOS PANITAS' });
  const settlementText = new TextDecoder().decode(settlementEsc.getBytes());
  assert.ok(settlementText.includes('COMPROBANTE DE COBRO DE FIAO'));
  assert.ok(settlementText.includes('Junior'));
  assert.ok(settlementText.includes('CUENTA TOTALMENTE AL DIA'));
});

test('renderReceivables renderiza botones data-fiao-invoice-view y filas data-fiao-row buscables en ambas vistas', () => {
  const state = {
    receivablesTab: 'debts',
    receivablesViewMode: 'clients',
    invoices: [
      {
        id: 'inv_eye_test',
        documentType: 'invoice',
        invoiceNumber: 'FAC-EYE-1',
        clientName: 'Cliente Ojo',
        clientPhone: '809-555-8888',
        totalCents: 50000,
        paidCents: 0,
        createdAt: new Date(),
        items: [{ name: 'Chimi de Pierna', quantity: 1 }]
      }
    ]
  };

  // 1. Vista por clientes: debe incluir data-fiao-invoice-view en el botón del consumo
  const htmlClients = renderReceivables(state);
  assert.ok(htmlClients.includes('data-fiao-invoice-view="inv_eye_test"'), 'La vista de cliente debe incluir data-fiao-invoice-view para ver la factura');

  // 2. Vista por facturas: debe incluir data-fiao-row, data-search y data-fiao-invoice-view
  state.receivablesViewMode = 'invoices';
  const htmlInvoices = renderReceivables(state);
  assert.ok(htmlInvoices.includes('data-fiao-row'), 'La vista de tabla debe tener data-fiao-row');
  assert.ok(htmlInvoices.includes('data-search="fac-eye-1 cliente ojo'), 'La vista de tabla debe tener data-search con número y cliente');
  assert.ok(htmlInvoices.includes('data-fiao-invoice-view="inv_eye_test"'), 'La vista de tabla debe incluir el botón data-fiao-invoice-view');
});

