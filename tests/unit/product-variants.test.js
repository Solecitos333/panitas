import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STANDARD_SIDES,
  VARIANT_TEMPLATES,
  getProductVariants,
  hasProductVariants,
  hasProductSides,
  getProductSides,
  calculateVariantLinePrice,
  formatLineName
} from '../../src/domain/catalog.js';
import { MemoryDataService } from '../../src/services/memory-service.js';
import {
  renderProductOptionPickerModal,
  cartLine,
  renderPos,
  renderKds
} from '../../src/modules/operations.js';
import { productCard, renderProductForm } from '../../src/modules/directory.js';
import {
  buildInvoiceEscPos,
  buildInvoicePlainText,
  buildKitchenEscPos,
  buildKitchenPlainText,
  buildPrebillEscPos,
  buildPrebillPlainText
} from '../../src/lib/hardware.js';

test('Dominio: getProductVariants y hasProductVariants manejan correctamente variantes', () => {
  assert.equal(hasProductVariants(null), false);
  assert.equal(hasProductVariants({}), false);
  assert.equal(hasProductVariants({ hasVariants: false }), false);

  const product = {
    id: 'prod-cafe',
    name: 'Café con Leche',
    hasVariants: true,
    variants: [
      { id: '7oz', name: '7 oz', priceCents: 2500, costCents: 1000 },
      { id: '12oz', name: '12 oz', priceCents: 5000, costCents: 2000 },
      { id: '16oz', name: '16 oz', priceCents: 7500, costCents: 3000 }
    ]
  };

  assert.equal(hasProductVariants(product), true);
  const variants = getProductVariants(product);
  assert.equal(variants.length, 3);
  assert.equal(variants[0].name, '7 oz');
  assert.equal(variants[0].priceCents, 2500);
  assert.equal(variants[1].priceCents, 5000);
  assert.equal(variants[2].priceCents, 7500);
});

test('Dominio: hasProductSides y getProductSides gestionan guarniciones estándar y personalizadas', () => {
  const simpleDish = { name: 'Chimi', hasSides: false };
  assert.equal(hasProductSides(simpleDish), false);

  const meatDish = { name: 'Pechuga a la Plancha', hasSides: true, sidePriceCents: 5000 };
  assert.equal(hasProductSides(meatDish), true);
  const sides = getProductSides(meatDish);
  assert.ok(Array.isArray(sides));
  assert.ok(sides.includes('Tostones'));
  assert.ok(sides.includes('Papas Fritas'));
  assert.ok(sides.includes('Moro de Habichuelas'));

  const customDish = {
    name: 'Plato Especial',
    hasSides: true,
    sideOptions: ['Tostones', 'Yuca al Mojo']
  };
  assert.deepEqual(getProductSides(customDish), ['Tostones', 'Yuca al Mojo']);
});

test('Dominio: calculateVariantLinePrice calcula precio base con variante y adicional de guarnición', () => {
  const product = {
    priceCents: 15000,
    hasVariants: true,
    variants: [
      { id: 'peq', name: 'Pequeño', priceCents: 10000 },
      { id: 'med', name: 'Mediano', priceCents: 15000 },
      { id: 'gra', name: 'Grande', priceCents: 20000 }
    ],
    hasSides: true,
    sidePriceCents: 2500
  };

  // Solo tamaño mediano sin guarnición
  assert.equal(calculateVariantLinePrice(product, 'med', false), 15000);

  // Tamaño pequeño con guarnición adicional (+RD$ 25.00)
  assert.equal(calculateVariantLinePrice(product, 'peq', true), 12500);

  // Tamaño grande con guarnición (+RD$ 25.00)
  assert.equal(calculateVariantLinePrice(product, 'gra', true), 22500);

  // Sin variante válida: usa precio base del producto
  assert.equal(calculateVariantLinePrice(product, 'inexistente', true), 17500);
});

test('Dominio: formatLineName combina producto y variante de forma limpia sin redundancia', () => {
  assert.equal(formatLineName('Café Negro', '12 oz'), 'Café Negro (12 oz)');
  assert.equal(formatLineName('Omelette', 'Mediano'), 'Omelette (Mediano)');
  // Si el nombre base ya incluye la variante, no lo duplica
  assert.equal(formatLineName('Café 12 oz', '12 oz'), 'Café 12 oz');
  // Si no hay variante
  assert.equal(formatLineName('Agua Dasani', null), 'Agua Dasani');
});

test('Servicio: MemoryDataService persiste y recupera hasVariants, variants y hasSides', async () => {
  const service = new MemoryDataService();
  const savedId = await service.saveProduct({
    name: 'Morir Soñando',
    category: 'Bebidas',
    priceCents: 8000,
    hasVariants: true,
    variants: [
      { id: '12oz', name: '12 oz', priceCents: 8000, costCents: 3500 },
      { id: '16oz', name: '16 oz', priceCents: 12000, costCents: 5000 }
    ],
    hasSides: false
  });

  const product = service.data.products.find((p) => p.id === savedId);
  assert.ok(product);
  assert.equal(product.hasVariants, true);
  assert.equal(product.variants.length, 2);
  assert.equal(product.variants[0].name, '12 oz');
  assert.equal(product.variants[1].priceCents, 12000);

  // Actualizar agregando guarnición
  await service.saveProduct({
    ...product,
    hasSides: true,
    sidePriceCents: 3000
  });

  const updated = service.data.products.find((p) => p.id === savedId);
  assert.equal(updated.hasSides, true);
  assert.equal(updated.sidePriceCents, 3000);
});

test('UI POS: renderProductOptionPickerModal genera modal interactivo táctil para tamaños y guarnición', () => {
  const product = {
    id: 'prod-jugo-chinola',
    name: 'Jugo Natural de Chinola',
    category: 'Bebidas',
    priceCents: 7000,
    hasVariants: true,
    variants: [
      { id: '12oz', name: '12 oz', priceCents: 7000, costCents: 3000 },
      { id: '16oz', name: '16 oz', priceCents: 10000, costCents: 4500 }
    ],
    hasSides: false
  };

  const html = renderProductOptionPickerModal(product);
  assert.ok(html.includes('id="product-options-form"'));
  assert.ok(html.includes('data-picker-variant="12oz"'));
  assert.ok(html.includes('data-picker-variant="16oz"'));
  assert.ok(html.includes('Jugo Natural de Chinola'));
  assert.ok(html.includes('Agregar al Carrito'));

  // Plato con guarnición
  const dish = {
    id: 'prod-pechuga',
    name: 'Pechuga a la Plancha',
    category: 'Pechurinas',
    priceCents: 20000,
    hasVariants: false,
    hasSides: true,
    sidePriceCents: 3000
  };
  const dishHtml = renderProductOptionPickerModal(dish);
  assert.ok(dishHtml.includes('Acompañamiento / Guarnición:'));
  assert.ok(dishHtml.includes('data-picker-side-mode="none"'));
  assert.ok(dishHtml.includes('data-picker-side-mode="side"'));
  assert.ok(dishHtml.includes('data-picker-side="Tostones"'));
  assert.ok(dishHtml.includes('data-picker-side="Papas Fritas"'));
});

test('UI POS: cartLine y kdsCard muestran guarnición y botón para cambiar opciones', () => {
  const lineItemWithOptions = {
    productId: 'prod-1',
    name: 'Omelette (Mediano)',
    quantity: 2,
    unitPriceCents: 15000,
    variantId: 'med',
    variantName: 'Mediano',
    side: 'Tostones',
    notes: 'Bien cocido'
  };

  const cartHtml = cartLine(lineItemWithOptions, 0);
  assert.ok(cartHtml.includes('Guarnición: <strong>Tostones</strong>'));
  assert.ok(cartHtml.includes('data-cart-edit-options="0"'));
  assert.ok(cartHtml.includes('Bien cocido'));

  const kdsOrder = {
    id: 'ord-1234',
    tableName: 'Mesa 3',
    status: 'pending',
    createdAt: new Date(),
    items: [lineItemWithOptions]
  };
  const kdsHtml = renderKds({ orders: [kdsOrder] });
  assert.ok(kdsHtml.includes('Guarnición: Tostones'));
  assert.ok(kdsHtml.includes('Omelette (Mediano)'));

  const posHtml = renderPos({
    products: [
      {
        id: 'p1',
        name: 'Café con Leche',
        category: 'Bebidas',
        priceCents: 2000,
        hasVariants: true,
        variants: [
          { id: '7oz', name: '7 oz', priceCents: 2000 },
          { id: '12oz', name: '12 oz', priceCents: 4000 }
        ]
      },
      {
        id: 'p2',
        name: 'Omelette',
        category: 'Platos',
        priceCents: 15000,
        hasSides: true,
        sidePriceCents: 2000
      }
    ],
    cart: [],
    posCategory: 'Todos',
    posDestination: 'takeout'
  });
  assert.ok(posHtml.includes('2 tamaños'));
  assert.ok(posHtml.includes('Guarnición'));
  assert.ok(posHtml.includes('Desde RD$20.00'));
});

test('Hardware: Comprobantes ESC/POS y Star Raster imprimen guarnición claramente', () => {
  const sampleInvoice = {
    id: 'inv-1001',
    subtotalCents: 17000,
    taxCents: 0,
    tipCents: 0,
    totalCents: 17000,
    items: [
      {
        name: 'Omelette (Mediano)',
        quantity: 1,
        unitPriceCents: 17000,
        side: 'Tostones',
        notes: 'Poco aceite'
      }
    ]
  };

  const plainTextInvoice = buildInvoicePlainText(sampleInvoice, { name: 'Los Panitas' });
  assert.ok(plainTextInvoice.includes('Guarnicion: Tostones'));

  const escposInvoice = buildInvoiceEscPos(sampleInvoice, { name: 'Los Panitas' });
  const escposInvoiceStr = new TextDecoder('latin1').decode(escposInvoice.getBytes());
  assert.ok(escposInvoiceStr.includes('GUARNICION: Tostones'));

  // Cocina
  const kitchenOrder = {
    id: 'ord-k5',
    tableName: 'Mesa 4',
    items: [
      {
        name: 'Pechuga a la Plancha',
        quantity: 1,
        side: 'Moro de Habichuelas'
      }
    ]
  };
  const plainKitchen = buildKitchenPlainText(kitchenOrder, { name: 'Los Panitas' });
  assert.ok(plainKitchen.includes('GUARNICION: Moro de Habichuelas'));

  const escposKitchen = buildKitchenEscPos(kitchenOrder, { name: 'Los Panitas' });
  const escposKitchenStr = new TextDecoder('latin1').decode(escposKitchen.getBytes());
  assert.ok(escposKitchenStr.includes('GUARNICION: Moro de Habichuelas'));

  // Pre-cuenta
  const plainPrebill = buildPrebillPlainText(sampleInvoice, { name: 'Los Panitas' });
  assert.ok(plainPrebill.includes('Guarnicion: Tostones'));

  const escposPrebill = buildPrebillEscPos(sampleInvoice, { name: 'Los Panitas' });
  const escposPrebillStr = new TextDecoder('latin1').decode(escposPrebill.getBytes());
  assert.ok(escposPrebillStr.includes('GUARNICION: Tostones'));
});

test('Directorio: renderProductForm y productCard soportan variantes y guarniciones', () => {
  const formHtml = renderProductForm({
    name: 'Café con Leche',
    hasVariants: true,
    variants: [
      { id: '7oz', name: '7 oz', priceCents: 2000 },
      { id: '12oz', name: '12 oz', priceCents: 4000 }
    ],
    hasSides: true,
    sidePriceCents: 2000
  });

  assert.ok(formHtml.includes('name="hasVariants"'));
  assert.ok(formHtml.includes('data-variant-preset="cups"'));
  assert.ok(formHtml.includes('data-variant-preset="portions"'));
  assert.ok(formHtml.includes('name="hasSides"'));
  assert.ok(formHtml.includes('name="sidePrice"'));

  const cardHtml = productCard({
    id: 'prod-test',
    name: 'Café con Leche',
    priceCents: 2000,
    hasVariants: true,
    variants: [
      { id: '7oz', name: '7 oz', priceCents: 2000 },
      { id: '12oz', name: '12 oz', priceCents: 4000 }
    ],
    hasSides: true
  }, true);

  assert.ok(cardHtml.includes('2 tamaños'));
  assert.ok(cardHtml.includes('Guarnición'));
  assert.ok(cardHtml.includes('Desde RD$20.00'));
});
