import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocumentNumber, buildNcf, calculateDocument, canTransitionOrder,
  csvCell, paymentStatus, toCents, validateRncOrCedula
} from '../../src/domain/billing.js';

test('convierte dinero decimal a centavos sin errores binarios', () => {
  assert.equal(toCents('1000.25'), 100025);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.throws(() => toCents('texto'), /numérico/);
});

test('calcula subtotal, ITBIS y total por línea', () => {
  const result = calculateDocument([
    { quantity: 2, unitPriceCents: 10000, taxRate: 18 },
    { quantity: 1.5, unitPriceCents: 5000, taxRate: 0 }
  ]);
  assert.equal(result.subtotalCents, 27500);
  assert.equal(result.taxCents, 3600);
  assert.equal(result.totalCents, 31100);
});

test('calcula descuentos por línea y globales', () => {
  const result = calculateDocument([
    { quantity: 2, unitPriceCents: 10000, taxRate: 18, discountPercent: 10 }, // 20000 - 2000 = 18000 + 3240 = 21240
    { quantity: 1, unitPriceCents: 5000, taxRate: 0 }                          // 5000
  ], { discount: 1000, discountType: 'amount', discountInCents: true });       // -1000 global discount
  assert.equal(result.subtotalCents, 25000);
  assert.equal(result.discountCents, 3000);
  assert.equal(result.taxableSubtotalCents, 22000);
  assert.equal(result.totalCents, 22000 + result.taxCents);
});

test('calcula Propina Legal del 10% (Ley 80-92 RD)', () => {
  const result = calculateDocument([
    { quantity: 1, unitPriceCents: 100000, taxRate: 18 } // RD$ 1,000 + 18% ITBIS + 10% Propina
  ], { includeLegalTip: true });
  assert.equal(result.subtotalCents, 100000);
  assert.equal(result.taxCents, 18000);
  assert.equal(result.tipCents, 10000);
  assert.equal(result.totalCents, 128000);
});

test('valida RNC y Cédula dominicana con algoritmo oficial DGII', () => {
  // RNC ejemplo válido: 101001577 (Banco de Reservas de la República Dominicana) o 131880738
  const validRnc = validateRncOrCedula('101001577');
  assert.equal(validRnc.valid, true);
  assert.equal(validRnc.type, 'rnc');

  const invalidRnc = validateRncOrCedula('101001579');
  assert.equal(invalidRnc.valid, false);

  // Cédula ejemplo: 11 dígitos
  const invalidCedula = validateRncOrCedula('40200000000');
  assert.equal(invalidCedula.valid, false);
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
