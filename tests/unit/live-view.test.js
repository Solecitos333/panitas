import test from 'node:test';
import assert from 'node:assert/strict';
import { affectsCurrentView } from '../../src/lib/live-view.js';
test('caja no reconstruye el catálogo por auditorías, usuarios o pagos de fondo', () => {
  for (const key of ['auditLogs', 'users', 'payments', 'invoices', 'orders']) assert.equal(affectsCurrentView('pos', key), false);
  for (const key of ['products', 'clients', 'tables', 'cashSessions']) assert.equal(affectsCurrentView('pos', key), true);
});
test('reportes, vistas nuevas y modales conservan actualizaciones completas', () => {
  assert.equal(affectsCurrentView('reports', 'payments'), true);
  assert.equal(affectsCurrentView('dashboard', 'invoices'), true);
  assert.equal(affectsCurrentView('new-route', 'orders'), true);
  assert.equal(affectsCurrentView('pos', 'invoices', 'invoice'), true);
});
