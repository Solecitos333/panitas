import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INVENTORY_REASONS,
  getInventoryReason,
  calculateWasteCostCents,
  validateInventoryAdjustment
} from '../../src/domain/inventory.js';
import { MemoryDataService } from '../../src/services/memory-service.js';
import { buildCashReportEscPos, buildCashReportPlainText } from '../../src/lib/hardware.js';

test('calculateWasteCostCents calcula el costo financiero de la merma con costo o precio', () => {
  // Con costo unitario explícito
  assert.equal(calculateWasteCostCents(8000, 15000, 3), 24000); // 3 * RD$ 80 = RD$ 240
  // Sin costo, usa precio de venta de referencia
  assert.equal(calculateWasteCostCents(0, 15000, 2), 30000); // 2 * RD$ 150 = RD$ 300
  // Cantidad cero
  assert.equal(calculateWasteCostCents(5000, 10000, 0), 0);
  // Decimales en cantidad
  assert.equal(calculateWasteCostCents(10000, 20000, 1.5), 15000);
});

test('validateInventoryAdjustment valida correctamente mermas, preparaciones y conteos', () => {
  // Merma válida
  const wasteRes = validateInventoryAdjustment({
    currentStock: 10,
    quantity: 4,
    operation: 'waste'
  });
  assert.equal(wasteRes.delta, -4);
  assert.equal(wasteRes.resultingStock, 6);
  assert.equal(wasteRes.type, 'decrease');

  // Merma que supera el stock
  assert.throws(() => {
    validateInventoryAdjustment({ currentStock: 3, quantity: 5, operation: 'waste' });
  }, /No puedes descartar 5 unidades porque la existencia actual es de 3/);

  // Merma con cantidad 0 o negativa
  assert.throws(() => {
    validateInventoryAdjustment({ currentStock: 10, quantity: 0, operation: 'waste' });
  }, /Indica la cantidad/);

  // Preparación extra válida (+ demanda)
  const prepRes = validateInventoryAdjustment({
    currentStock: 5,
    quantity: 15,
    operation: 'prep'
  });
  assert.equal(prepRes.delta, 15);
  assert.equal(prepRes.resultingStock, 20);
  assert.equal(prepRes.type, 'increase');

  // Conteo físico a la baja
  const countLow = validateInventoryAdjustment({
    currentStock: 12,
    targetStock: 8,
    operation: 'count'
  });
  assert.equal(countLow.delta, -4);
  assert.equal(countLow.resultingStock, 8);

  // Conteo físico a la alza
  const countHigh = validateInventoryAdjustment({
    currentStock: 10,
    targetStock: 14,
    operation: 'count'
  });
  assert.equal(countHigh.delta, 4);
  assert.equal(countHigh.resultingStock, 14);

  // Conteo idéntico
  assert.throws(() => {
    validateInventoryAdjustment({ currentStock: 10, targetStock: 10, operation: 'count' });
  }, /coincide exactamente/);
});

test('getInventoryReason retorna la metadata adecuada de motivos de inventario', () => {
  const unsold = getInventoryReason('waste_unsold');
  assert.equal(unsold.isWaste, true);
  assert.ok(unsold.label.includes('Sobrante'));

  const prep = getInventoryReason('production_demand');
  assert.equal(prep.isWaste, false);
  assert.ok(prep.label.includes('Preparación extra'));

  const unknown = getInventoryReason('unknown_reason');
  assert.equal(unknown.id, 'unknown_reason');
  assert.equal(unknown.isWaste, false);
});

test('MemoryDataService registra ajustes individuales (merma, prep, conteo) con trazabilidad', async () => {
  const service = new MemoryDataService({ uid: 'cashier-1', role: 'cashier', displayName: 'Pedro Cajero', active: true });

  // Crear producto para prueba
  const productId = await service.saveProduct({
    name: 'Empanada de Pollo',
    sku: 'EMP-POL-01',
    category: 'Empanadas',
    priceCents: 10000,
    costCents: 4500,
    stock: 20,
    active: true
  });

  // 1. Registrar merma por caducidad (-4 unidades)
  const wasteMove = await service.adjustInventoryItem({
    productId,
    operation: 'waste',
    quantity: 4,
    reasonCategory: 'waste_expired',
    notes: 'Vencieron en vitrina'
  });

  assert.equal(wasteMove.previousStock, 20);
  assert.equal(wasteMove.resultingStock, 16);
  assert.equal(wasteMove.quantity, 4);
  assert.equal(wasteMove.delta, -4);
  assert.equal(wasteMove.wasteCostCents, 4 * 4500); // RD$ 180.00
  assert.equal(wasteMove.actorId, 'cashier-1');

  const prodAfterWaste = service.data.products.find(p => p.id === productId);
  assert.equal(prodAfterWaste.stock, 16);

  // 2. Registrar lote recién cocinado por alta demanda (+10 unidades)
  const prepMove = await service.adjustInventoryItem({
    productId,
    operation: 'prep',
    quantity: 10,
    reasonCategory: 'production_demand',
    notes: 'Lote nuevo cocinado a las 11:30 am'
  });

  assert.equal(prepMove.previousStock, 16);
  assert.equal(prepMove.resultingStock, 26);
  assert.equal(prepMove.quantity, 10);
  assert.equal(prepMove.delta, 10);
  assert.equal(prepMove.wasteCostCents, 0); // No es merma, no genera costo de pérdida

  const prodAfterPrep = service.data.products.find(p => p.id === productId);
  assert.equal(prodAfterPrep.stock, 26);

  // 3. Conteo físico de vitrina (ajustar a 24)
  const countMove = await service.adjustInventoryItem({
    productId,
    operation: 'count',
    targetStock: 24,
    reasonCategory: 'audit_count',
    notes: 'Cuadre físico de bandeja'
  });

  assert.equal(countMove.previousStock, 26);
  assert.equal(countMove.resultingStock, 24);
  assert.equal(countMove.delta, -2);
});

test('MemoryDataService realiza descarte masivo de vitrina al cierre de jornada (batchWasteAdjustment)', async () => {
  const service = new MemoryDataService({ uid: 'owner-1', role: 'owner', displayName: 'Nechy', active: true });

  const p1Id = await service.saveProduct({ name: 'Arepitas de Yuca', priceCents: 5000, costCents: 2000, stock: 8, active: true });
  const p2Id = await service.saveProduct({ name: 'Jugo de Chinola', priceCents: 8000, costCents: 3500, stock: 5, active: true });

  const itemsToAdjust = [
    { productId: p1Id, productName: 'Arepitas de Yuca', previousStock: 8, targetStock: 0, costCents: 2000, priceCents: 5000 },
    { productId: p2Id, productName: 'Jugo de Chinola', previousStock: 5, targetStock: 0, costCents: 3500, priceCents: 8000 }
  ];

  const results = await service.batchWasteAdjustment({
    items: itemsToAdjust,
    reasonCategory: 'waste_unsold',
    notes: 'Cierre de turno nocturno'
  });

  assert.equal(results.length, 2);

  const p1 = service.data.products.find(p => p.id === p1Id);
  const p2 = service.data.products.find(p => p.id === p2Id);
  assert.equal(p1.stock, 0);
  assert.equal(p2.stock, 0);

  const movements = service.data.inventoryMovements;
  const p1Move = movements.find(m => m.productId === p1Id && m.reasonCategory === 'waste_unsold');
  assert.ok(p1Move);
  assert.equal(p1Move.quantity, 8);
  assert.equal(p1Move.wasteCostCents, 8 * 2000); // RD$ 160.00

  const p2Move = movements.find(m => m.productId === p2Id && m.reasonCategory === 'waste_unsold');
  assert.ok(p2Move);
  assert.equal(p2Move.quantity, 5);
  assert.equal(p2Move.wasteCostCents, 5 * 3500); // RD$ 175.00
});

test('Usuarios sin permisos de inventario son bloqueados de ajustar existencias', async () => {
  const waiterService = new MemoryDataService({ uid: 'waiter-1', role: 'waiter', displayName: 'Juan Camarero', active: true });

  await assert.rejects(async () => {
    await waiterService.adjustInventoryItem({
      productId: 'any-product',
      operation: 'waste',
      quantity: 2
    });
  }, /No tienes permiso para modificar el inventario/);

  await assert.rejects(async () => {
    await waiterService.batchWasteAdjustment({
      items: [{ productId: 'any', previousStock: 5, targetStock: 0 }]
    });
  }, /No tienes permiso para modificar el inventario/);
});

test('buildCashReportEscPos y buildCashReportPlainText incluyen el bloque de mermas cuando hay movimientos', () => {
  const session = {
    id: 'cs1',
    openedAt: new Date('2026-09-07T08:00:00Z'),
    closedAt: new Date('2026-09-07T20:00:00Z'),
    openedByName: 'Nechy',
    openingCents: 300000,
    status: 'closed',
    closingCents: 500000,
    varianceCents: 0
  };

  const inventoryMovements = [
    { id: 'm1', isWaste: true, operation: 'waste', quantity: 6, wasteCostCents: 27000 },
    { id: 'm2', isWaste: true, operation: 'waste', quantity: 4, wasteCostCents: 16000 }
  ];

  // ESC/POS
  const builder = buildCashReportEscPos(session, [], { name: 'Los Panitas' }, [], 'Z', inventoryMovements);
  const escText = new TextDecoder().decode(builder.getBytes());
  assert.ok(escText.includes('MERMAS Y DESPERDICIOS DEL TURNO'));
  assert.ok(escText.includes('10 uds'));

  // Plain text
  const plain = buildCashReportPlainText(session, [], { name: 'Los Panitas' }, [], 'Z', inventoryMovements);
  assert.ok(plain.includes('MERMAS Y DESPERDICIOS DEL TURNO'));
  assert.ok(plain.includes('10 uds'));
});
