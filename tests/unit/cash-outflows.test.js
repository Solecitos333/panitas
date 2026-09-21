import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDataService } from '../../src/services/memory-service.js';
import { buildCashMovementEscPos, buildCashMovementPlainText } from '../../src/lib/hardware.js';

test('Cash Outflow: registro de salida de caja debita la gaveta con exactitud', async () => {
  const service = new MemoryDataService({
    actor: { uid: 'user_nechy', displayName: 'Nechy Peña', role: 'owner' }
  });

  // Abrir sesión con fondo inicial de RD$ 3,000 (300,000 centavos)
  const cashSessionId = await service.openCashSession({ openingCents: 300000, notes: 'Turno inicial' });
  assert.ok(cashSessionId);

  const initialSession = service.data.cashSessions.find((s) => s.id === cashSessionId);
  assert.equal(initialSession.status, 'open');
  assert.equal(initialSession.expectedCents, 300000);

  // Registrar salida de RD$ 150 (15,000 centavos) por compra de hielo
  const reason = '[Compra / Insumo] Compra de hielo';
  const movementId = await service.createCashMovement({
    cashSessionId,
    type: 'out',
    amountCents: 15000,
    reason
  });

  assert.ok(movementId);
  const movements = service.data.cashMovements;
  assert.equal(movements.length, 1);
  assert.equal(movements[0].type, 'out');
  assert.equal(movements[0].amountCents, 15000);
  assert.equal(movements[0].reason, reason);

  // Verificar que el saldo esperado en la sesión sea 3,000 - 150 = 2,850 (285,000 centavos)
  const updatedSession = service.data.cashSessions.find((s) => s.id === cashSessionId);
  assert.equal(updatedSession.expectedCents, 285000);
});

test('Cash Outflow: rechaza retiro mayor al efectivo disponible en gaveta', async () => {
  const service = new MemoryDataService({
    actor: { uid: 'user_nechy', displayName: 'Nechy Peña', role: 'owner' }
  });

  const cashSessionId = await service.openCashSession({ openingCents: 50000, notes: 'Fondo RD$ 500' });
  const session = service.data.cashSessions.find((s) => s.id === cashSessionId);
  assert.equal(session.expectedCents, 50000);

  // Intento de retirar RD$ 800 cuando solo hay RD$ 500
  await assert.rejects(
    async () => {
      await service.createCashMovement({
        cashSessionId,
        type: 'out',
        amountCents: 80000,
        reason: '[Pago de Servicio] Factura de luz excesiva'
      });
    },
    /La salida supera el efectivo esperado en la caja/
  );

  // El saldo debe permanecer intacto en 50000
  const sessionCheck = service.data.cashSessions.find((s) => s.id === cashSessionId);
  assert.equal(sessionCheck.expectedCents, 50000);
});

test('Cash Outflow: buildCashMovementEscPos y PlainText generan comprobante térmico con firmas', () => {
  const movement = {
    id: 'mov_test_123',
    type: 'out',
    amountCents: 10000, // RD$ 100.00
    category: 'Pago de Servicio',
    reason: 'Pago de botellón de agua Planeta Azul',
    createdAt: new Date('2026-09-19T14:30:00Z'),
    createdByName: 'Nechy Peña'
  };

  const session = {
    id: 'cash_sess_abc',
    openedByName: 'Nechy Peña',
    expectedCents: 290000
  };

  const settings = {
    name: 'Los Panitas by Nechy'
  };

  // Plain Text
  const plainText = buildCashMovementPlainText(movement, session, settings);
  assert.match(plainText, /COMPROBANTE DE SALIDA/);
  assert.match(plainText, /Los Panitas by Nechy/);
  assert.match(plainText, /Nechy Peña/);
  assert.match(plainText, /Pago de Servicio/);
  assert.match(plainText, /Pago de botellón de agua Planeta Azul/);
  assert.match(plainText, /TOTAL SALIDA:\s*RD\$\s*100\.00/);
  assert.match(plainText, /Balance en gaveta:\s*RD\$\s*2,900\.00/);
  assert.match(plainText, /Entregado por \/ Recibido por/);

  // ESC/POS Builder
  const escpos = buildCashMovementEscPos(movement, session, settings);
  assert.ok(escpos);
  const bytes = escpos.getBytes();
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 50);
});
