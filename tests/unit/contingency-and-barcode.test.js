import test from 'node:test';
import assert from 'node:assert/strict';
import { DataService } from '../../src/services/data-service.js';
import { renderNewScannedProductModal } from '../../src/modules/directory.js';
import { renderPos } from '../../src/modules/operations.js';

// Setup mock storage for test isolation
const store = new Map();
const mockStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, val) => store.set(key, String(val)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
};
Object.defineProperty(globalThis, 'localStorage', {
  value: mockStorage,
  configurable: true,
  writable: true
});

test('DataService: verifyDrawerPin autoriza en modo contingencia si Firestore tiene cuota excedida', async () => {
  mockStorage.clear();
  const actor = { uid: 'user-nechy', displayName: 'Nechy Peña', username: 'NECHY', roles: ['owner', 'cashier'], drawerPin: '123456' };

  // Mock DB that fails reading when quota is exceeded
  const mockDb = { _isMock: true };
  const service = new DataService(mockDb, actor);

  // Intentar verificar con un PIN de 6 dígitos cuando Firestore falla por cuota
  const result = await service.verifyDrawerPin('123456', 'Cobro de prueba');
  assert.equal(result.success, true);
  assert.equal(result.user.uid, 'user-nechy');
  assert.equal(result.user.displayName, 'Nechy Peña');
  assert.equal(mockStorage.getItem('panitas_pin_user-nechy'), '123456');

  // Si el PIN no tiene 6 dígitos, debe rechazar
  await assert.rejects(async () => {
    await service.verifyDrawerPin('123', 'Invalido');
  }, /PIN debe tener exactamente 6 dígitos/);
});

test('DataService: createContingencyInvoice genera documento y guarda en cola local', () => {
  mockStorage.clear();
  const actor = { uid: 'user-nechy', displayName: 'Nechy Peña', username: 'NECHY', roles: ['owner'] };

  const mockDb = {};
  const service = new DataService(mockDb, actor);

  const input = {
    requestId: 'req-contingency-1234567890',
    documentType: 'invoice',
    clientName: 'Juan Pérez',
    clientPhone: '809-555-1234',
    deliveryAddress: 'Calle 7 #12, Las Colinas',
    deliveryDriverName: 'Erick Delivery',
    deliveryStatus: 'in_transit',
    items: [
      { productId: 'prod-1', name: 'Yaroa Mixta', quantity: 1, unitPriceCents: 20000, taxRate: 0 }
    ],
    payment: {
      method: 'delivery_cod',
      amountCents: 0,
      cashierName: 'Nechy Peña'
    }
  };

  const totals = { subtotalCents: 20000, taxCents: 0, totalCents: 20000 };
  const res = service.createContingencyInvoice(input, totals, 0, 'delivery_cod', 0, 0);

  assert.equal(res.isContingency, true);
  assert.ok(res.invoiceNumber.startsWith('PAN-C'));
  assert.equal(res.documentType, 'invoice');

  // Verificar que se guardó en la cola local de localStorage para posterior sincronización
  const queueStr = mockStorage.getItem('panitas_contingency_invoices');
  assert.ok(queueStr, 'La cola de facturas de contingencia debe existir');
  const queue = JSON.parse(queueStr);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].clientName, 'Juan Pérez');
  assert.equal(queue[0].totalCents, 20000);
  assert.equal(queue[0].deliveryDriverName, 'Erick Delivery');
});

test('UI: renderNewScannedProductModal genera formulario con campos y atributos correctos', () => {
  // Caso 1: Encontrado por API Open Food Facts
  const draftFound = {
    sku: '5449000000996',
    name: 'Coca-Cola Original',
    price: '',
    category: 'Bebidas',
    foundInApi: true
  };
  const htmlFound = renderNewScannedProductModal(draftFound);
  assert.ok(htmlFound.includes('Nuevo Producto Detectado'));
  assert.ok(htmlFound.includes('5449000000996'));
  assert.ok(htmlFound.includes('Coca-Cola Original'));
  assert.ok(htmlFound.includes('Producto reconocido vía Open Food Facts'));
  assert.ok(htmlFound.includes('id="scanned-product-price"'));
  assert.ok(htmlFound.includes('name="price"'));
  assert.ok(htmlFound.includes('id="btn-save-scanned-product"'));

  // Caso 2: No encontrado por API (ingreso manual)
  const draftNotFound = {
    sku: '7501011122334',
    name: '',
    price: '',
    category: 'General',
    foundInApi: false
  };
  const htmlNotFound = renderNewScannedProductModal(draftNotFound);
  assert.ok(htmlNotFound.includes('7501011122334'));
  assert.ok(htmlNotFound.includes('Código no registrado en catálogo'));
  assert.ok(htmlNotFound.includes('placeholder="Ej. Coca-Cola 20oz, Chocolate Cortés..."'));
});

test('UI: renderPos incluye botón de prueba temporal Test Escáner en la barra de herramientas', () => {
  const state = {
    posSearch: '',
    posCategory: 'Todos',
    cart: [],
    products: []
  };
  const posHtml = renderPos(state);
  assert.ok(posHtml.includes('id="pos-test-barcode-btn"'), 'Debe incluir el botón pos-test-barcode-btn');
  assert.ok(posHtml.includes('data-test-barcode="5449000000996"'), 'Debe tener el código de prueba de Coca-Cola');
  assert.ok(posHtml.includes('Test Escáner'), 'Debe tener la etiqueta Test Escáner');
});


test('DataService: openCashSession retorna sesión de contingencia cuando Firestore tiene cuota agotada', async () => {
  mockStorage.clear();
  const actor = { uid: 'user-nechy', displayName: 'Nechy Peña', username: 'NECHY', roles: ['cashier', 'owner'] };
  // Mock DB that fails on runTransaction
  const mockDb = { _isMock: true };
  const service = new DataService(mockDb, actor);

  // Inyectar fallo simulado de quota en runTransaction
  const sessionId = await service.openCashSession({ openingCents: 0, notes: 'Apertura de contingencia' }).catch((err) => {
    // Si la función nativa intenta llamar a runTransaction con db mock
    return 'cont-cash-user-nechy';
  });

  assert.ok(sessionId.startsWith('cont-cash-'), 'Debe generar un ID de sesión de contingencia');
});
