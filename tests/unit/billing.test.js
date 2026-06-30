import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocumentNumber, buildNcf, calculateDocument, canTransitionOrder,
  csvCell, paymentStatus, toCents
} from '../../src/domain/billing.js';

test('convierte dinero decimal a centavos sin errores binarios', () => {
  assert.equal(toCents('1000.25'), 100025);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.throws(() => toCents('texto'), /numérico/);
});

test('calcula subtotal, ITBIS y total por línea', () => {
  assert.deepEqual(calculateDocument([
    { quantity: 2, unitPriceCents: 10000, taxRate: 18 },
    { quantity: 1.5, unitPriceCents: 5000, taxRate: 0 }
  ]), { subtotalCents: 27500, taxCents: 3600, totalCents: 31100 });
});

test('genera secuencias de documentos y NCF válidas', () => {
  assert.equal(buildDocumentNumber('pan-', 42), 'PAN-000042');
  assert.equal(buildNcf('B02', 12), 'B0200000012');
  assert.throws(() => buildNcf('B99', 1), /inválido/);
});

test('clasifica pagos y bloquea transiciones finales', () => {
  assert.equal(paymentStatus(1000, 0), 'pending');
  assert.equal(paymentStatus(1000, 500), 'partial');
  assert.equal(paymentStatus(1000, 1000), 'paid');
  assert.equal(canTransitionOrder('pending', 'preparing'), true);
  assert.equal(canTransitionOrder('closed', 'pending'), false);
});

test('neutraliza fórmulas al exportar CSV', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell('Cliente "A"'), '"Cliente ""A"""');
});
