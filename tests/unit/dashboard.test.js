import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboard } from '../../src/modules/operations.js';

test('renderDashboard genera cabecera en vivo con estado de turno y fecha dominicana', () => {
  const stateOpen = {
    invoices: [],
    orders: [],
    cashSessions: [{ id: 'cs1', status: 'open', openedBy: 'user-1' }],
    cashMovements: [],
    tables: [{ id: 't1', name: 'Mesa 1', active: true }],
    products: [],
    user: { uid: 'user-1', displayName: 'Juan Pérez' },
    capabilities: { viewKds: true }
  };
  const htmlOpen = renderDashboard(stateOpen);
  assert.match(htmlOpen, /Caja abierta · Juan Pérez/);
  assert.match(htmlOpen, /Resumen operativo/);
  assert.match(htmlOpen, /Nueva venta/);

  const stateClosed = {
    ...stateOpen,
    cashSessions: [],
    user: { uid: 'user-2' }
  };
  const htmlClosed = renderDashboard(stateClosed);
  assert.match(htmlClosed, /Caja cerrada/);
});

test('renderDashboard calcula métricas de cobros, fiao, deliveries y ocupación de mesas', () => {
  const now = new Date();
  const state = {
    invoices: [
      { id: 'inv1', documentType: 'invoice', status: 'paid', totalCents: 150000, paidCents: 150000, paymentMethod: 'cash', createdAt: now },
      { id: 'inv2', documentType: 'invoice', status: 'pending', totalCents: 80000, paidCents: 0, paymentMethod: 'credit', createdAt: now },
      { id: 'inv3', documentType: 'invoice', status: 'pending', totalCents: 50000, paidCents: 0, paymentMethod: 'delivery_cod', deliveryDriverId: 'd1', deliveryDriverName: 'Carlos Chofer', deliveryStatus: 'in_transit', createdAt: now }
    ],
    orders: [
      { id: 'ord1', status: 'preparing', tableName: 'Mesa 1', totalCents: 120000, createdAt: new Date(Date.now() - 25 * 60000), items: [{ name: 'Yaroa', quantity: 2 }] },
      { id: 'ord2', status: 'ready', tableName: 'Para Llevar', totalCents: 45000, createdAt: now, items: [{ name: 'Chimi', quantity: 1 }] }
    ],
    cashSessions: [{ id: 'cs1', status: 'open', openedBy: 'u1' }],
    cashMovements: [
      { id: 'cm1', type: 'out', amountCents: 20000, reason: '[Compras] Vegetales', createdAt: now, createdByName: 'Admin' }
    ],
    tables: [
      { id: 't1', name: 'Mesa 1', active: true, currentOrderId: 'ord1' },
      { id: 't2', name: 'Mesa 2', active: true, currentOrderId: null }
    ],
    products: [],
    user: { uid: 'u1' },
    capabilities: { viewKds: true }
  };

  const html = renderDashboard(state);

  // KPIs
  assert.ok(html.includes('<span>Ventas de hoy</span><strong>RD$2,800.00</strong>'));
  assert.ok(html.includes('<span>Documentos</span><strong>3</strong>'));
  assert.ok(html.includes('<span>Comandas activas</span><strong>2</strong>'));
  assert.ok(html.includes('<span>Deliveries en calle</span><strong>1</strong>'));
  assert.ok(html.includes('<span>Mesas ocupadas</span><strong>1 / 2</strong>'));
  assert.ok(html.includes('<span>Caja</span><strong>Abierta</strong>'));

  // Quick actions ribbon
  assert.match(html, /data-route="pos"/);
  assert.match(html, /data-route="kds"/);
  assert.match(html, /data-route="deliveries"/);
  assert.match(html, /data-route="tables"/);
  assert.match(html, /data-cash-movement-open="out"/);
  assert.match(html, /data-route="receivables"/);

  // Deliveries card
  assert.match(html, /Carlos Chofer/);
  assert.match(html, />1<\/b>\s*pedido en calle/);

  // Order with delayed alert (>20 min)
  assert.match(html, /is-delayed/);
  assert.match(html, /hace 25 min/);

  // Cash outflow
  assert.match(html, /Vegetales/);
  assert.match(html, /-RD\$200\.00/);

  // Financial breakdown
  assert.match(html, /Distribución de ingresos/);
});
