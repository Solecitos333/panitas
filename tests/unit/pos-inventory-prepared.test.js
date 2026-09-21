import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateInventoryAdjustment,
  getInventoryReason
} from '../../src/domain/inventory.js';
import { MemoryDataService } from '../../src/services/memory-service.js';
import { getDailyProductsBreakdown } from '../../src/modules/operations.js';

test('validateInventoryAdjustment valida correctamente la entrada/reabastecimiento (restock)', () => {
  // Entrada normal de 20 aguacates cuando había 5
  const restockRes = validateInventoryAdjustment({
    currentStock: 5,
    quantity: 20,
    operation: 'restock'
  });
  assert.equal(restockRes.delta, 20);
  assert.equal(restockRes.resultingStock, 25);
  assert.equal(restockRes.quantity, 20);
  assert.equal(restockRes.type, 'increase');

  // Entrada con cantidad cero o negativa lanza error
  assert.throws(() => {
    validateInventoryAdjustment({ currentStock: 10, quantity: 0, operation: 'restock' });
  }, /Indica la cantidad/);

  assert.throws(() => {
    validateInventoryAdjustment({ currentStock: 10, quantity: -5, operation: 'restock' });
  }, /Indica la cantidad/);
});

test('getInventoryReason retorna la metadata adecuada para restock', () => {
  const reason = getInventoryReason('restock');
  assert.equal(reason.id, 'restock');
  assert.equal(reason.defaultOp, 'restock');
  assert.equal(reason.isWaste, false);
});

test('MemoryDataService registra reabastecimiento (restock) con trazabilidad completa', async () => {
  const service = new MemoryDataService({
    uid: 'user-admin',
    displayName: 'Nechy Propietario',
    role: 'owner',
    active: true
  });

  // Guardar un producto de prueba
  const productId = await service.saveProduct({
    name: 'Aguacates Enteros',
    priceCents: 5000,
    costCents: 3000,
    stock: 6,
    category: 'Víveres',
    isPrepared: false,
    active: true
  });

  const product = service.data.products.find((p) => p.id === productId);
  assert.equal(product.stock, 6);
  assert.equal(product.isPrepared, false);

  // Registrar reabastecimiento rápido de 20 unidades
  const res = await service.adjustInventoryItem({
    productId: product.id,
    operation: 'restock',
    quantity: 20,
    reasonCategory: 'restock',
    reason: 'Llegó mercancía / Suplidor',
    notes: 'Llegaron 20 aguacates frescos del mercado'
  });

  assert.equal(res.operation, 'restock');
  assert.equal(res.quantity, 20);
  assert.equal(res.delta, 20);
  assert.equal(res.previousStock, 6);
  assert.equal(res.resultingStock, 26);
  assert.equal(res.wasteCostCents, 0);

  // El producto en el catálogo ahora tiene 26
  const updated = service.data.products.find((p) => p.id === product.id);
  assert.equal(updated.stock, 26);

  // Se auditó en inventoryMovements
  const movements = service.data.inventoryMovements;
  const found = movements.find((m) => m.id === res.id);
  assert.ok(found);
  assert.equal(found.productId, product.id);
  assert.equal(found.delta, 20);
});

test('saveProduct persiste correctamente el flag isPrepared', async () => {
  const service = new MemoryDataService({
    uid: 'user-admin',
    displayName: 'Nechy Propietario',
    role: 'owner',
    active: true
  });

  const dishId = await service.saveProduct({
    name: 'Pollo Parrilla 1/4',
    priceCents: 22000,
    stock: 0,
    category: 'Cocina',
    isPrepared: true,
    active: true
  });

  const dish = service.data.products.find((p) => p.id === dishId);
  assert.equal(dish.isPrepared, true);

  // Actualizar a no preparado
  await service.saveProduct({
    id: dish.id,
    name: 'Pollo Parrilla 1/4',
    priceCents: 22000,
    stock: 10,
    category: 'Cocina',
    isPrepared: false,
    active: true
  });

  const updatedDish = service.data.products.find((p) => p.id === dishId);
  assert.equal(updatedDish.isPrepared, false);
  assert.equal(updatedDish.stock, 10);
});

test('getDailyProductsBreakdown agrupa artículos vendidos, cantidades y totales facturados hoy', () => {
  const products = [
    { id: 'p1', name: 'Pollo Parrilla 1/4', category: 'Cocina', isPrepared: true },
    { id: 'p2', name: 'Nachos Medianos', category: 'Comida Rápida', isPrepared: true },
    { id: 'p3', name: 'Refresco Coca-Cola', category: 'Bebidas', isPrepared: false }
  ];

  const invoices = [
    {
      id: 'inv-1',
      invoiceNumber: 'FAC-001',
      createdAt: '2026-09-19T14:00:00Z',
      items: [
        { productId: 'p1', name: 'Pollo Parrilla 1/4', quantity: 2, unitPriceCents: 22000, totalCents: 44000 },
        { productId: 'p3', name: 'Refresco Coca-Cola', quantity: 1, unitPriceCents: 5000, totalCents: 5000 }
      ]
    },
    {
      id: 'inv-2',
      invoiceNumber: 'FAC-002',
      createdAt: '2026-09-19T14:30:00Z',
      items: [
        { productId: 'p1', name: 'Pollo Parrilla 1/4', quantity: 3, unitPriceCents: 22000, totalCents: 66000 },
        { productId: 'p2', name: 'Nachos Medianos', quantity: 1, unitPriceCents: 17000, totalCents: 17000 },
        { productId: 'p3', name: 'Refresco Coca-Cola', quantity: 4, unitPriceCents: 5000, totalCents: 20000 }
      ]
    }
  ];

  const breakdown = getDailyProductsBreakdown(invoices, products);

  assert.equal(breakdown.length, 3);
  // Ordenado por mayor cantidad vendida primero:
  // p1 (Pollo) = 5 uds (RD$ 1,100)
  // p3 (Refresco) = 5 uds (RD$ 250)
  // p2 (Nachos) = 1 ud (RD$ 170)
  assert.equal(breakdown[0].id, 'p1');
  assert.equal(breakdown[0].quantity, 5);
  assert.equal(breakdown[0].totalCents, 110000);
  assert.equal(breakdown[0].isPrepared, true);

  assert.equal(breakdown[1].id, 'p3');
  assert.equal(breakdown[1].quantity, 5);
  assert.equal(breakdown[1].totalCents, 25000);
  assert.equal(breakdown[1].isPrepared, false);

  assert.equal(breakdown[2].id, 'p2');
  assert.equal(breakdown[2].quantity, 1);
  assert.equal(breakdown[2].totalCents, 17000);
  assert.equal(breakdown[2].isPrepared, true);
});

test('createInvoice en MemoryDataService omite deducción de stock para productos preparados pero descuenta para reventa', async () => {
  const service = new MemoryDataService({
    uid: 'user-cajero',
    displayName: 'Cajero Test',
    role: 'cashier',
    active: true
  });

  const cashSessionId = await service.openCashSession({ openingCents: 10000 });

  // 1 producto preparado (Cocina, stock 0)
  const prepId = await service.saveProduct({
    name: 'Mofongo Especial',
    priceCents: 45000,
    costCents: 20000,
    stock: 0,
    category: 'Cocina',
    isPrepared: true,
    active: true
  });

  // 1 producto envasado con stock real (Bebidas, stock 10)
  const drinkId = await service.saveProduct({
    name: 'Cerveza Presidente',
    priceCents: 18000,
    costCents: 10000,
    stock: 10,
    category: 'Bebidas',
    isPrepared: false,
    active: true
  });

  // Facturar ambos productos a crédito (fiao, sin cobro inmediato para poder anular)
  const sale = await service.createDocument({
    documentType: 'invoice',
    items: [
      { productId: prepId, name: 'Mofongo Especial', quantity: 3, unitPriceCents: 45000, totalCents: 135000 },
      { productId: drinkId, name: 'Cerveza Presidente', quantity: 2, unitPriceCents: 18000, totalCents: 36000 }
    ],
    payment: {
      amountCents: 0,
      tenderedCents: 0,
      method: 'credit',
      cashSessionId
    },
    clientName: 'Juan Pérez'
  });

  assert.ok(sale.id);

  // El producto preparado sigue con stock 0 (no se resta en negativo ni se inventa)
  const prepAfter = service.data.products.find((p) => p.id === prepId);
  assert.equal(prepAfter.stock, 0);

  // El producto envasado sí se descontó de 10 a 8
  const drinkAfter = service.data.products.find((p) => p.id === drinkId);
  assert.equal(drinkAfter.stock, 8);

  // Anular la factura (sin cobros)
  await service.cancelInvoice(sale.id, 'Error de digitación');

  // El producto preparado no incrementa
  const prepAfterCancel = service.data.products.find((p) => p.id === prepId);
  assert.equal(prepAfterCancel.stock, 0);

  // El producto envasado sí recupera su existencia
  const drinkAfterCancel = service.data.products.find((p) => p.id === drinkId);
  assert.equal(drinkAfterCancel.stock, 10);
});

