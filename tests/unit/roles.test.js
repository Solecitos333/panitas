import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedNavigation, can, normalizeRoles } from '../../src/domain/roles.js';

const user = (role) => ({ active: true, roles: [role] });

test('normaliza y descarta roles desconocidos', () => {
  assert.deepEqual(normalizeRoles({ roles: ['cashier', 'cashier', 'admin'] }), ['cashier']);
});

test('propietario posee todos los permisos', () => {
  assert.equal(can(user('owner'), 'settings:dangerous'), true);
});

test('cocina no accede a información financiera', () => {
  assert.equal(can(user('kitchen'), 'orders:kitchen'), true);
  assert.equal(can(user('kitchen'), 'billing:view'), false);
  assert.deepEqual(allowedNavigation(user('kitchen')), ['kds']);
});

test('camarero opera mesas sin facturación', () => {
  assert.equal(can(user('waiter'), 'orders:create'), true);
  assert.equal(can(user('waiter'), 'billing:create'), false);
  assert.deepEqual(allowedNavigation(user('waiter')), ['pos', 'tables', 'products']);
});

test('caja y gerencia pueden abrir el diagnóstico de terminal y fiaos/cuentas por cobrar', () => {
  assert.equal(can(user('cashier'), 'terminal:view'), true);
  assert.equal(can(user('manager'), 'terminal:view'), true);
  assert.equal(can(user('cashier'), 'receivables:view'), true);
  assert.equal(allowedNavigation(user('cashier')).includes('receivables'), true);
  assert.equal(allowedNavigation(user('cashier')).includes('terminal'), true);
});

test('un usuario inactivo no conserva permisos', () => {
  assert.equal(can({ active: false, roles: ['owner'] }, 'billing:view'), false);
});
