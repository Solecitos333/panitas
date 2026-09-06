import test from 'node:test';
import assert from 'node:assert/strict';
import { businessDateKey, inBusinessPeriod } from '../../src/lib/business-time.js';
import { renderDashboard } from '../../src/modules/operations.js';
test('el día del negocio no cambia a las 8pm cuando cambia UTC', () => {
  assert.equal(businessDateKey('2026-09-06T02:30:00Z'), '2026-09-05');
  assert.equal(businessDateKey('2026-09-06T04:00:00Z'), '2026-09-06');
  assert.equal(businessDateKey('invalid'), '');
  assert.equal(businessDateKey(null), '');
});
test('semana, mes y año usan calendario dominicano y descartan futuro', () => {
  const now = new Date('2026-09-07T03:00:00Z'); // domingo 23:00 en RD
  assert.equal(inBusinessPeriod('2026-08-31T04:00:00Z', 'week', now), true);
  assert.equal(inBusinessPeriod('2026-08-31T03:59:59Z', 'week', now), false);
  assert.equal(inBusinessPeriod('2026-09-01T03:59:59Z', 'month', now), false);
  assert.equal(inBusinessPeriod('2026-01-01T04:00:00Z', 'year', now), true);
  assert.equal(inBusinessPeriod('2026-09-07T03:01:00Z', 'day', now), false);
});
test('el resumen no cuenta cotizaciones ni proformas como ventas', () => {
  const html = renderDashboard({ invoices: [{ documentType:'quote', status:'pending', totalCents:99999, createdAt:new Date() }], orders:[], cashSessions:[], payments:[], products:[], user:{uid:'test'}, capabilities:{} });
  assert.ok(html.includes('<span>Ventas de hoy</span><strong>RD$0.00</strong>'));
  assert.ok(html.includes('<span>Documentos</span><strong>0</strong>'));
});
