import test from 'node:test';
import assert from 'node:assert/strict';
import { getClientMemory, getReceivablesMetrics, invoiceBelongsToClient, getReceivableAgeDays, isFiaoPayment } from '../../src/domain/client-memory.js';
import { renderReceivables } from '../../src/modules/receivables.js';
import { renderClients } from '../../src/modules/directory.js';
import { renderDashboard } from '../../src/modules/operations.js';
import { renderDeliveries, getDeliverySettlementDate } from '../../src/modules/deliveries.js';
import { calculateCashSessionFinancials } from '../../src/modules/administration.js';
import { affectsCurrentView } from '../../src/lib/live-view.js';

const invoice = (id, overrides = {}) => ({ id, documentType: 'invoice', status: 'partial', clientName: 'Ana Pérez', totalCents: 10000, paidCents: 2000, createdAt: new Date(), items: [], ...overrides });
const timestamp = (iso) => ({ toDate: () => new Date(iso) });

test('client identity keeps homonyms and unnamed-ID legacy invoices separate', () => {
  const clients = [{ id: 'a', name: 'Ana Pérez' }, { id: 'b', name: 'Ana Pérez' }];
  const invoices = [invoice('ia', { clientId: 'a' }), invoice('ib', { clientId: 'b', totalCents: 20000 }), invoice('legacy')];
  const profiles = getClientMemory({ clients, invoices });
  assert.equal(profiles.length, 3);
  assert.equal(profiles.find(c => c.id === 'a').totalDebtCents, 8000);
  assert.equal(profiles.find(c => c.id === 'b').totalDebtCents, 18000);
  assert.equal(profiles.find(c => !c.id).totalDebtCents, 8000);
  assert.equal(getReceivablesMetrics(invoices).allClientsCount, 3);
  assert.equal(invoiceBelongsToClient(invoices[0], { id: 'b', name: 'Ana Pérez' }), false);
  assert.equal(invoiceBelongsToClient(invoices[2], clients[0]), false);
  assert.equal(invoiceBelongsToClient(invoices[0], { id: 'a', name: 'Ana renombrada' }), true);
});

test('receivable and directory buttons retain the exact client ID', () => {
  const state = {
    clients: [{ id: 'a', name: 'Ana Pérez' }, { id: 'b', name: 'Ana Pérez' }],
    invoices: [invoice('ia', { clientId: 'a' }), invoice('ib', { clientId: 'b' })], payments: [], capabilities: {}
  };
  for (const html of [renderReceivables(state), renderClients(state)]) {
    assert.match(html, /data-client-bulk-pay="Ana Pérez"\s+data-client-id="a"/);
    assert.match(html, /data-client-bulk-pay="Ana Pérez"\s+data-client-id="b"/);
    assert.match(html, /data-client-statement="Ana Pérez"\s+data-client-id="b"/);
  }
});

test('receivables channel age does not inherit old debts from the other channel', () => {
  const html = renderReceivables({
    invoices: [invoice('new-fiao'), invoice('old-delivery', { deliveryDriverId: 'driver', createdAt: new Date(Date.now() - 40 * 86400000) })],
    clients: [], payments: [], receivablesChannelFilter: 'fiao', receivablesAgeFilter: 'today'
  });
  assert.match(html, /data-client-bulk-pay="Ana Pérez"/);
  assert.match(html, /data-client-channel="fiao"/);
  assert.doesNotMatch(html, /data-fiao-pay="old-delivery"/);
});

test('receivables age uses Dominican calendar instead of elapsed 24-hour blocks', () => {
  const now = new Date('2026-09-21T04:05:00Z');
  assert.equal(getReceivableAgeDays('2026-09-21T03:55:00Z', now), 1);
  assert.equal(getReceivableAgeDays('2026-09-21T04:01:00Z', now), 0);
  assert.equal(getReceivableAgeDays(null, now), 0);
  assert.equal(getReceivableAgeDays('invalid', now), 0);
});

test('fiao payments accept explicit concepts without request IDs and exclude delivery collections', () => {
  assert.equal(isFiaoPayment({ concept: 'fiao' }), true);
  assert.equal(isFiaoPayment({ reference: 'Abono Fiao' }, { deliveryDriverId: 'driver', paymentMethod: 'credit' }), false);
  assert.equal(isFiaoPayment({ concept: 'credit', requestId: 'delivery-settle-1' }), false);
  assert.equal(isFiaoPayment({}, { paymentMethod: 'credit' }), true);
});

test('cash profitability excludes other shifts, quotations and collections from old debts', () => {
  const session = { id: 's', openedBy: 'u', openingCents: 1000, openedAt: timestamp('2026-09-21T12:00:00Z') };
  const during = timestamp('2026-09-21T13:00:00Z');
  const fin = calculateCashSessionFinancials(session, {
    invoices: [
      invoice('own', { cashSessionId: 's', createdAt: during }),
      invoice('other', { cashSessionId: 's2', createdBy: 'u', createdAt: during, totalCents: 999000 }),
      invoice('quote', { cashSessionId: 's', documentType: 'quote', createdAt: during, totalCents: 999000 }),
      invoice('legacy', { createdBy: 'u', createdAt: during }),
      invoice('other-legacy', { createdBy: 'someone', createdAt: during, totalCents: 999000 })
    ],
    payments: [{ cashSessionId: 's', invoiceId: 'old-debt', method: 'cash', amountCents: 50000 }],
    inventoryMovements: [
      { operation: 'waste', createdBy: 'u', createdAt: during, totalCostCents: 100 },
      { operation: 'waste', createdBy: 'other', createdAt: during, totalCostCents: 500 },
      { operation: 'waste', cashSessionId: 's2', createdBy: 'u', createdAt: during, totalCostCents: 500 }
    ]
  });
  assert.equal(fin.netSalesCents, 20000);
  assert.equal(fin.cashCollectedCents, 50000);
  assert.equal(fin.expectedDrawerCents, 51000);
  assert.equal(fin.receivablesCents, 16000);
  assert.equal(fin.wasteCents, 100);
});

test('empty cash shift does not adopt deliveries belonging to another shift', () => {
  const fin = calculateCashSessionFinancials({ id: 'empty', openingCents: 0 }, {
    invoices: [invoice('other', { cashSessionId: 'other', paymentMethod: 'delivery_cod', deliveryStatus: 'in_transit' })]
  });
  assert.equal(fin.pendingDeliveriesCount, 0);
  assert.equal(fin.deliveryPendingCents, 0);
});

test('dashboard collections use payments by date and method, including previous-day credit', () => {
  const now = new Date();
  const html = renderDashboard({
    terminalMode: true, user: { uid: 'u', roles: ['cashier'], active: true }, capabilities: { viewKds: false },
    invoices: [invoice('today', { totalCents: 90000, paidCents: 90000, paymentMethod: 'credit' })],
    payments: [
      { invoiceId: 'yesterday-credit', method: 'cash', amountCents: 10000, createdAt: now },
      { invoiceId: 'today', method: 'card', amountCents: 20000, createdAt: now },
      { invoiceId: 'today', method: 'transfer', amountCents: 30000, createdAt: now }
    ]
  });
  assert.match(html, /Efectivo: RD\$100\.00/);
  assert.match(html, /Tarjeta: RD\$200\.00/);
  assert.match(html, /Transferencia: RD\$300\.00/);
  assert.doesNotMatch(html, /data-route="(?:billing|kds|reports)"/);
  assert.match(html, /data-route="invoices"/);
});

test('empty dashboard does not claim that all income is fiao', () => {
  const html = renderDashboard({ terminalMode: true, user: {}, capabilities: {} });
  assert.doesNotMatch(html, /width:100%;[^>]*title="Fiao/);
});

test('settled deliveries use settlement date, not sale creation date', () => {
  const now = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const paid = invoice('paid', { status: 'paid', totalCents: 10000, paidCents: 10000, paymentMethod: 'delivery_cod', deliveryStatus: 'settled', createdAt: yesterday, deliverySettledAt: now });
  const html = renderDeliveries({ invoices: [paid], deliveriesTab: 'settled' });
  assert.match(html, /Liquidadas Hoy \(1\)/);
  assert.equal(getDeliverySettlementDate(paid), now);
  const previous = { ...paid, deliverySettledAt: yesterday, createdAt: now };
  assert.match(renderDeliveries({ invoices: [previous] }), /Liquidadas Hoy \(0\)/);
  assert.equal(getDeliverySettlementDate({ ...paid, deliverySettledAt: null, lastPaymentId: 'p' }, [{ id: 'p', invoiceId: 'paid', createdAt: now }]), now);
});

test('live views refresh all the data now displayed without making POS listen to history', () => {
  for (const key of ['payments', 'cashMovements', 'tables', 'products']) assert.equal(affectsCurrentView('dashboard', key), true);
  for (const key of ['invoices', 'inventoryMovements', 'products']) assert.equal(affectsCurrentView('cash', key), true);
  assert.equal(affectsCurrentView('clients', 'invoices'), true);
  assert.equal(affectsCurrentView('deliveries', 'payments'), true);
  assert.equal(affectsCurrentView('pos', 'payments'), false);
});
