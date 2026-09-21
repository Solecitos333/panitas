import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProductInventoryType,
  getProductStockStatus,
  renderProducts,
  renderProductForm
} from '../../src/modules/directory.js';
import { MemoryDataService } from '../../src/services/memory-service.js';

test('getProductInventoryType detecta correctamente el tipo de dinámica de inventario', () => {
  // Explícito en el producto
  assert.equal(getProductInventoryType({ inventoryType: 'prepared' }), 'prepared');
  assert.equal(getProductInventoryType({ inventoryType: 'preprepared' }), 'preprepared');
  assert.equal(getProductInventoryType({ inventoryType: 'resale' }), 'resale');

  // Fallback por isPrepared
  assert.equal(getProductInventoryType({ isPrepared: true }), 'prepared');

  // Fallback heurístico por categoría de vitrina
  assert.equal(getProductInventoryType({ category: 'Empanadas' }), 'preprepared');
  assert.equal(getProductInventoryType({ category: 'Vitrina Caliente' }), 'preprepared');
  assert.equal(getProductInventoryType({ category: 'Quipes y Fritos' }), 'preprepared');
  assert.equal(getProductInventoryType({ category: 'Pastelitos' }), 'preprepared');

  // Fallback por categoría de bebidas / reventa
  assert.equal(getProductInventoryType({ category: 'Bebidas' }), 'resale');
  assert.equal(getProductInventoryType({ name: 'Cerveza Presidente' }), 'resale');
  assert.equal(getProductInventoryType({ name: 'Refresco Coca Cola' }), 'resale');

  // Fallback por defecto a cocina / al momento para comida de restaurante
  assert.equal(getProductInventoryType({ category: 'Chimis' }), 'prepared');
  assert.equal(getProductInventoryType({}), 'prepared');
});

test('getProductStockStatus calcula texto, colores y alertas según el tipo de inventario', () => {
  // Producto de cocina / al momento: sin alerta de agotado, venta continua
  const prepStatus = getProductStockStatus({
    name: 'Chimi Especial',
    inventoryType: 'prepared',
    stock: 0
  });
  assert.equal(prepStatus.type, 'prepared');
  assert.equal(prepStatus.isLow, false);
  assert.equal(prepStatus.isOut, false);
  assert.equal(prepStatus.color, '#10b981');
  assert.ok(prepStatus.badgeHtml.includes('Al Momento'));

  // Producto de vitrina con stock normal
  const vitrinaOk = getProductStockStatus({
    name: 'Empanada de Pollo',
    inventoryType: 'preprepared',
    stock: 15,
    minStock: 5
  });
  assert.equal(vitrinaOk.type, 'preprepared');
  assert.equal(vitrinaOk.isLow, false);
  assert.equal(vitrinaOk.isOut, false);
  assert.ok(vitrinaOk.text.includes('15 uds en vitrina'));
  assert.ok(vitrinaOk.badgeHtml.includes('Vitrina'));

  // Producto de vitrina con bajo stock
  const vitrinaLow = getProductStockStatus({
    name: 'Empanada de Queso',
    inventoryType: 'preprepared',
    stock: 3,
    minStock: 5
  });
  assert.equal(vitrinaLow.isLow, true);
  assert.equal(vitrinaLow.isOut, false);
  assert.equal(vitrinaLow.color, '#f59e0b');
  assert.ok(vitrinaLow.text.includes('¡Últimas 3 en vitrina!'));

  // Producto de reventa agotado (0 en almacén)
  const resaleOut = getProductStockStatus({
    name: 'Cerveza Presidente',
    inventoryType: 'resale',
    stock: 0,
    minStock: 6
  });
  assert.equal(resaleOut.type, 'resale');
  assert.equal(resaleOut.isOut, true);
  assert.equal(resaleOut.color, '#f43f5e');
  assert.ok(resaleOut.text.includes('Agotado'));
  assert.ok(resaleOut.badgeHtml.includes('Nevera / Bebidas'));
});

test('MemoryDataService guarda y persiste inventoryType, minStock y sincroniza isPrepared', async () => {
  const service = new MemoryDataService({
    uid: 'test-admin',
    displayName: 'Administrador',
    role: 'owner',
    active: true
  });

  // Guardar producto de cocina
  const chimiId = await service.saveProduct({
    name: 'Chimi de Pierna',
    priceCents: 25000,
    costCents: 12000,
    category: 'Chimis',
    inventoryType: 'prepared',
    minStock: 5,
    active: true
  });

  const chimi = service.data.products.find((p) => p.id === chimiId);
  assert.equal(chimi.inventoryType, 'prepared');
  assert.equal(chimi.isPrepared, true, 'isPrepared debe sincronizarse en true para tipo prepared');

  // Guardar producto de vitrina
  const empanadaId = await service.saveProduct({
    name: 'Empanada de Res',
    priceCents: 6000,
    costCents: 2500,
    category: 'Vitrina',
    inventoryType: 'preprepared',
    stock: 20,
    minStock: 8,
    active: true
  });

  const empanada = service.data.products.find((p) => p.id === empanadaId);
  assert.equal(empanada.inventoryType, 'preprepared');
  assert.equal(empanada.minStock, 8);
  assert.equal(empanada.isPrepared, false);
  assert.equal(empanada.stock, 20);

  // Guardar producto de nevera / reventa
  const sodaId = await service.saveProduct({
    name: 'Coca Cola 20oz',
    priceCents: 7500,
    costCents: 4500,
    category: 'Bebidas',
    inventoryType: 'resale',
    stock: 24,
    minStock: 12,
    active: true
  });

  const soda = service.data.products.find((p) => p.id === sodaId);
  assert.equal(soda.inventoryType, 'resale');
  assert.equal(soda.minStock, 12);
  assert.equal(soda.isPrepared, false);
});

test('renderProducts renderiza métricas, chips de categoría, selector de dinámica y vistas', () => {
  const mockState = {
    products: [
      { id: 'p1', name: 'Yaroa de Pollo', category: 'Yaroas', inventoryType: 'prepared', isPrepared: true, priceCents: 35000, costCents: 15000, stock: 0, active: true },
      { id: 'p2', name: 'Empanada de Queso', category: 'Vitrina', inventoryType: 'preprepared', isPrepared: false, priceCents: 6000, costCents: 2500, stock: 3, minStock: 5, active: true },
      { id: 'p3', name: 'Presidente Light', category: 'Bebidas', inventoryType: 'resale', isPrepared: false, priceCents: 18000, costCents: 11000, stock: 2, minStock: 6, active: true },
      { id: 'p4', name: 'Agua Dasani', category: 'Bebidas', inventoryType: 'resale', isPrepared: false, priceCents: 5000, costCents: 2500, stock: 30, minStock: 10, active: true }
    ],
    capabilities: { manageCatalog: true },
    inventoryMovements: [],
    productsTab: 'catalog',
    productsCategoryFilter: 'all',
    productsTypeFilter: 'all',
    productsSearch: '',
    productsSort: 'name_asc',
    productsViewMode: 'grid'
  };

  const html = renderProducts(mockState);

  // Métricas
  assert.ok(html.includes('Total Catálogo'), 'Debe mostrar tarjeta de Total Catálogo');
  assert.ok(html.includes('Bajo Stock / Agotados'), 'Debe mostrar tarjeta de Bajo Stock');
  assert.ok(html.includes('Cocina / Al Momento'), 'Debe mostrar tarjeta de Cocina');
  assert.ok(html.includes('Valor en Inventario'), 'Debe mostrar valoración monetaria de inventario');

  // Chips de categorías
  assert.ok(html.includes('data-products-category-filter="all"'));
  assert.ok(html.includes('data-products-category-filter="Yaroas"'));
  assert.ok(html.includes('data-products-category-filter="Vitrina"'));
  assert.ok(html.includes('data-products-category-filter="Bebidas"'));

  // Chips de tipos de dinámica
  assert.ok(html.includes('data-products-type-filter="all"'));
  assert.ok(html.includes('data-products-type-filter="prepared"'));
  assert.ok(html.includes('data-products-type-filter="preprepared"'));
  assert.ok(html.includes('data-products-type-filter="resale"'));
  assert.ok(html.includes('data-products-type-filter="low_stock"'));

  // Vista de tarjetas táctiles
  assert.ok(html.includes('class="products-grid"'), 'Por defecto usa cuadrícula táctil');
  assert.ok(html.includes('Yaroa de Pollo'));
  assert.ok(html.includes('Empanada de Queso'));
  assert.ok(html.includes('Presidente Light'));

  // Filtrado por categoría
  const filteredCategoryHtml = renderProducts({
    ...mockState,
    productsCategoryFilter: 'Bebidas'
  });
  assert.ok(filteredCategoryHtml.includes('Presidente Light'));
  assert.ok(filteredCategoryHtml.includes('Agua Dasani'));
  assert.ok(!filteredCategoryHtml.includes('Yaroa de Pollo'), 'No debe mostrar platos que no sean bebidas');
  assert.ok(filteredCategoryHtml.includes('data-products-clear-filters'), 'Debe mostrar botón limpiar filtros');

  // Filtrado por tipo low_stock
  const lowStockHtml = renderProducts({
    ...mockState,
    productsTypeFilter: 'low_stock'
  });
  assert.ok(lowStockHtml.includes('Empanada de Queso'));
  assert.ok(lowStockHtml.includes('Presidente Light'));
  assert.ok(!lowStockHtml.includes('Agua Dasani'), 'Dasani tiene 30 y minStock 10, no debe salir en bajo stock');
  assert.ok(!lowStockHtml.includes('Yaroa de Pollo'), 'Yaroa es de cocina, no debe salir en bajo stock');

  // Modo vista de tabla
  const tableHtml = renderProducts({
    ...mockState,
    productsViewMode: 'table'
  });
  assert.ok(tableHtml.includes('class="table-scroll directory-desktop-table"'), 'Debe renderizar contenedor de tabla');
  assert.ok(tableHtml.includes('<tbody id="directory-body">'));
});

test('renderProductForm genera selector con 3 tipos, sugerencias de categorías y calculador de margen', () => {
  const formHtml = renderProductForm({
    id: 'prod-test-1',
    name: 'Super Chimi',
    sku: 'CHI-01',
    category: 'Chimis',
    inventoryType: 'prepared',
    isPrepared: true,
    priceCents: 30000,
    costCents: 12000,
    stock: 0,
    minStock: 5,
    active: true
  });

  // Radios de dinámica de inventario
  assert.ok(formHtml.includes('data-inventory-type-card="prepared"'));
  assert.ok(formHtml.includes('data-inventory-type-card="preprepared"'));
  assert.ok(formHtml.includes('data-inventory-type-card="resale"'));
  assert.ok(formHtml.includes('class="inventory-card-radio"'));
  assert.ok(formHtml.includes('class="inventory-card-header"'));

  // Sugerencias de categorías
  assert.ok(formHtml.includes('data-category-suggestion="Piqueos"'));
  assert.ok(formHtml.includes('data-category-suggestion="Chimis"'));
  assert.ok(formHtml.includes('data-category-suggestion="Yaroas"'));

  // Calculadora y Asistente de márgenes
  assert.ok(formHtml.includes('id="product-margin-preview"'));
  assert.ok(formHtml.includes('id="margin-percent-display"'));
  assert.ok(formHtml.includes('id="margin-profit-display"'));
  assert.ok(formHtml.includes('id="margin-loss-alert"'));
  assert.ok(formHtml.includes('data-margin-target="30"'));
  assert.ok(formHtml.includes('data-margin-target="50"'));
  assert.ok(formHtml.includes('data-margin-target="markup_100"'));
  // Margen de 300 venta y 120 costo = 60%
  assert.ok(formHtml.includes('60%'));
});
