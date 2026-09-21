import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCashSessionFinancials,
  getCashMovementCategoryMeta,
  renderCash,
  CASH_MOVEMENT_CATEGORIES
} from '../../src/modules/administration.js';

test('Cash Management: calculateCashSessionFinancials calcula con precisión ventas, costos (COGS), márgenes y P&L', () => {
  const session = {
    id: 'session_1',
    status: 'open',
    openingCents: 300000, // RD$ 3,000 fondo inicial
    openedAt: new Date('2026-09-20T08:00:00Z'),
    openedByName: 'Nechy'
  };

  const state = {
    activeCash: session,
    cashTab: 'overview',
    products: [
      { id: 'prod_burger', name: 'Hamburguesa Especial', price: 350, cost: 150 },
      { id: 'prod_yaroa', name: 'Yaroa de Pollo', price: 450, cost: 200 },
      { id: 'prod_jugo', name: 'Jugo Natural', price: 120, cost: 50 }
    ],
    invoices: [
      {
        id: 'inv_1',
        cashSessionId: 'session_1',
        status: 'paid',
        paymentMethod: 'cash',
        totalCents: 70000, // 2x Hamburguesas = RD$ 700
        items: [{ productId: 'prod_burger', qty: 2, price: 350, cost: 150 }]
      },
      {
        id: 'inv_2',
        cashSessionId: 'session_1',
        status: 'paid',
        paymentMethod: 'card',
        totalCents: 45000, // 1x Yaroa = RD$ 450
        items: [{ productId: 'prod_yaroa', qty: 1, price: 450, cost: 200 }]
      },
      {
        id: 'inv_3',
        cashSessionId: 'session_1',
        status: 'pending', // Fiao / Por cobrar
        paymentMethod: 'fiao',
        totalCents: 12000, // 1x Jugo = RD$ 120
        items: [{ productId: 'prod_jugo', qty: 1, price: 120, cost: 50 }]
      }
    ],
    payments: [
      { id: 'pay_1', cashSessionId: 'session_1', method: 'cash', amountCents: 70000 },
      { id: 'pay_2', cashSessionId: 'session_1', method: 'card', amountCents: 45000 }
    ],
    cashMovements: [
      {
        id: 'mov_in_1',
        cashSessionId: 'session_1',
        type: 'in',
        amountCents: 50000, // RD$ 500
        reason: '[Sencillo / Cambio] Monedas para la gaveta'
      },
      {
        id: 'mov_out_1',
        cashSessionId: 'session_1',
        type: 'out',
        amountCents: 25000, // RD$ 250
        reason: '[Compra de Insumos] Tomates y lechuga fresca'
      },
      {
        id: 'mov_out_2',
        cashSessionId: 'session_1',
        type: 'out',
        amountCents: 15000, // RD$ 150
        reason: '[Pago a Repartidor / Delivery] Propina y tarifa chofer'
      }
    ],
    inventoryMovements: [
      {
        id: 'inv_mov_waste',
        type: 'waste',
        totalCostCents: 10000, // RD$ 100 de pan vencido/dañado
        createdAt: new Date('2026-09-20T10:00:00Z')
      }
    ]
  };

  const fin = calculateCashSessionFinancials(session, state);

  // 1. Desglose de Ventas
  assert.equal(fin.netSalesCents, 127000, 'Ventas netas totales = 700 + 450 + 120 = 1,270');
  assert.equal(fin.cashCollectedCents, 70000, 'Efectivo cobrado = 700');
  assert.equal(fin.cardCollectedCents, 45000, 'Tarjeta cobrado = 450');
  assert.equal(fin.receivablesCents, 12000, 'Cuentas por cobrar = 120');

  // 2. Costo de Mercancía Vendida (COGS)
  // 2 burger @ 150 (300) + 1 yaroa @ 200 (200) + 1 jugo @ 50 (50) = RD$ 550 = 55,000 centavos
  assert.equal(fin.cogsCents, 55000, 'COGS = 55,000');

  // 3. Margen Bruto
  // Margen Bruto = 127,000 - 55,000 = 72,000 centavos (RD$ 720)
  assert.equal(fin.grossMarginCents, 72000, 'Margen bruto = 72,000 centavos');
  assert.equal(fin.grossMarginPct, 57, 'Margen bruto % redondeado = 57%');

  // 4. Entradas y Salidas de Caja
  assert.equal(fin.cashInCents, 50000, 'Entradas de efectivo = 50,000 centavos (RD$ 500)');
  assert.equal(fin.cashOutCents, 40000, 'Salidas de efectivo = 40,000 centavos (RD$ 400)');
  assert.equal(fin.wasteCents, 10000, 'Pérdida por mermas = 10,000 centavos (RD$ 100)');

  // 5. Rentabilidad Neta Operativa (P&L)
  // Beneficio Neto = Margen Bruto (72,000) - Salidas Operativas (40,000) - Mermas (10,000) = 22,000 (RD$ 220)
  assert.equal(fin.netProfitCents, 22000, 'Beneficio neto = 22,000 centavos (RD$ 220)');
  assert.equal(fin.netProfitPct, 17, 'Margen neto % redondeado = 17%');
  assert.equal(fin.healthStatus, 'healthy', 'Con 17.3% el estado financiero es saludable');

  // 6. Efectivo Físico Esperado en Gaveta (Cash flow reconciliation)
  // Fondo (300,000) + Ventas Efectivo (70,000) + Entradas (50,000) - Salidas (40,000) = 380,000 centavos (RD$ 3,800)
  assert.equal(fin.expectedDrawerCents, 380000, 'Efectivo en gaveta = 380,000 centavos (RD$ 3,800)');
});

test('Cash Management: getCashMovementCategoryMeta clasifica por etiquetas y heurísticas inteligentes', () => {
  // Caso 1: Categoría entre corchetes explícita
  const meta1 = getCashMovementCategoryMeta('out', '[Compra de Insumos] 5 fundas de hielo y servilletas');
  assert.equal(meta1.label, 'Insumos y Compras');
  assert.equal(meta1.cleanReason, '5 fundas de hielo y servilletas');
  assert.equal(meta1.icon, 'shopping-basket');

  // Caso 2: Categoría entrada entre corchetes
  const meta2 = getCashMovementCategoryMeta('in', '[Sencillo / Cambio] Monedas de 10 y 25');
  assert.equal(meta2.label, 'Sencillo / Cambio');
  assert.equal(meta2.cleanReason, 'Monedas de 10 y 25');

  // Caso 3: Heurística sin corchetes para delivery
  const meta3 = getCashMovementCategoryMeta('out', 'Pago de gasolina al motorista de delivery');
  assert.equal(meta3.label, 'Delivery y Choferes');
  assert.equal(meta3.cleanReason, 'Pago de gasolina al motorista de delivery');

  // Caso 4: Heurística para servicio
  const meta4 = getCashMovementCategoryMeta('out', 'Factura de energía de la distribuidora edeeste');
  assert.equal(meta4.label, 'Servicios y Operación');

  // Caso 5: Fallback genérico sin coincidencias
  const meta5 = getCashMovementCategoryMeta('out', 'Gastito no identificado');
  assert.equal(meta5.label, 'Otros Gastos Menores');
  assert.equal(meta5.cleanReason, 'Gastito no identificado');
});

test('Cash Management: renderCash genera la interfaz con pestañas, P&L, libro de movimientos y botones de voucher', () => {
  const session = {
    id: 'session_1',
    status: 'open',
    openingCents: 200000,
    openedAt: new Date(),
    openedByName: 'Nechy'
  };

  const stateOverview = {
    activeCash: session,
    cashTab: 'overview',
    cashMovementTypeFilter: 'all',
    cashMovementSearch: '',
    invoices: [],
    payments: [],
    cashMovements: [
      {
        id: 'mov_1',
        cashSessionId: 'session_1',
        type: 'out',
        amountCents: 15000,
        reason: '[Insumos y Compras] Limones y menta',
        createdAt: new Date(),
        createdByName: 'Nechy'
      }
    ],
    cashSessions: [session],
    inventoryMovements: [],
    products: []
  };

  // 1. Render vista Overview
  const htmlOverview = renderCash(stateOverview);
  assert.ok(htmlOverview.includes('data-cash-tab="overview"'), 'Contiene pestaña Turno Activo');
  assert.ok(htmlOverview.includes('data-cash-tab="movements"'), 'Contiene pestaña Libro de Entradas y Salidas');
  assert.ok(htmlOverview.includes('data-cash-tab="history"'), 'Contiene pestaña Historial');
  assert.ok(htmlOverview.includes('cash-pnl-card'), 'Contiene tarjeta de Rentabilidad Operativa (P&L)');
  assert.ok(htmlOverview.includes('Margen Bruto Comercial'), 'Muestra Margen Bruto Comercial');
  assert.ok(htmlOverview.includes('Resultado Neto Operativo'), 'Muestra Resultado Neto Operativo');
  assert.ok(htmlOverview.includes('data-cash-movement-open="in"'), 'Botón rápida entrada');
  assert.ok(htmlOverview.includes('data-cash-movement-open="out"'), 'Botón rápida salida');

  // 2. Render vista Libro de Movimientos
  const stateMovements = {
    ...stateOverview,
    cashTab: 'movements'
  };
  const htmlMovements = renderCash(stateMovements);
  assert.ok(htmlMovements.includes('data-cash-movement-search'), 'Contiene barra de búsqueda difusa');
  assert.ok(htmlMovements.includes('data-cash-movement-type-filter="all"'), 'Contiene filtro Todos');
  assert.ok(htmlMovements.includes('data-cash-movement-type-filter="out"'), 'Contiene filtro Salidas');
  assert.ok(htmlMovements.includes('data-cash-movement-type-filter="in"'), 'Contiene filtro Entradas');
  assert.ok(htmlMovements.includes('data-cash-movement-print="mov_1"'), 'Contiene botón de impresión térmica de comprobante');
  assert.ok(htmlMovements.includes('Insumos y Compras'), 'Contiene badge con la categoría detectada');

  // 3. Render vista Historial
  const stateHistory = {
    ...stateOverview,
    cashTab: 'history'
  };
  const htmlHistory = renderCash(stateHistory);
  assert.ok(htmlHistory.includes('Historial de Turnos y Arqueos'), 'Contiene sección de historial');
  assert.ok(htmlHistory.includes('data-cash-report-print'), 'Permite reimprimir arqueos históricos');
});
