/**
 * Dominio de Catálogo, Variantes y Acompañamientos
 * Los Panitas by Nechy
 */

export const STANDARD_SIDES = Object.freeze([
  'Tostones',
  'Papas Fritas',
  'Moro de Habichuelas',
  'Arroz Blanco',
  'Yuca Hervida',
  'Batata Frita',
  'Plátano Maduro Frito',
  'Mangú',
  'Puré de Papas',
  'Guineitos Hervidos',
  'Ensalada Verde',
  'Ensalada Mixta'
]);

export const VARIANT_TEMPLATES = Object.freeze({
  cups: {
    id: 'cups',
    label: 'Vasos (Bebidas)',
    icon: 'cup-soda',
    variants: [
      { id: '7oz', name: '7 oz', description: 'Pequeño' },
      { id: '12oz', name: '12 oz', description: 'Mediano' },
      { id: '16oz', name: '16 oz', description: 'Grande' }
    ]
  },
  portions: {
    id: 'portions',
    label: 'Porciones (Platos)',
    icon: 'utensils',
    variants: [
      { id: 'peq', name: 'Pequeño', description: 'Porción pequeña' },
      { id: 'med', name: 'Mediano', description: 'Porción estándar' },
      { id: 'gra', name: 'Grande', description: 'Porción grande' }
    ]
  },
  meats: {
    id: 'meats',
    label: 'Gramaje (Carnes)',
    icon: 'beef',
    variants: [
      { id: '137g', name: '137g', description: 'Individual' },
      { id: '182g', name: '182g', description: 'Estándar' },
      { id: '050lb', name: '1/2 lb', description: 'Generoso' }
    ]
  }
});

export function getProductVariants(product) {
  if (!product) return [];
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    return product.variants.map((v, i) => ({
      id: String(v.id || `var-${i + 1}`).trim(),
      name: String(v.name || '').trim(),
      priceCents: Math.max(0, Math.round(Number(v.priceCents || product.priceCents || 0))),
      costCents: Math.max(0, Math.round(Number(v.costCents || product.costCents || 0))),
      sku: String(v.sku || '').trim()
    })).filter((v) => Boolean(v.name));
  }
  return [];
}

export function hasProductVariants(product) {
  return Boolean(product?.hasVariants && getProductVariants(product).length > 0);
}

export function hasProductSides(product) {
  return Boolean(product?.hasSides);
}

export function getProductSides(product) {
  if (Array.isArray(product?.sideOptions) && product.sideOptions.length > 0) {
    return product.sideOptions;
  }
  return [...STANDARD_SIDES];
}

export function calculateVariantLinePrice(product, variantId = null, hasSide = false) {
  const variants = getProductVariants(product);
  let baseCents = Number(product?.priceCents || 0);
  if (variantId && variants.length > 0) {
    const matched = variants.find((v) => v.id === variantId);
    if (matched) baseCents = matched.priceCents;
  }
  const sidePriceCents = hasSide ? Number(product?.sidePriceCents || 0) : 0;
  return Math.max(0, baseCents + sidePriceCents);
}

export function formatLineName(baseProductName, variantName = null) {
  const base = String(baseProductName || '').trim();
  const vName = String(variantName || '').trim();
  if (vName && !base.toLowerCase().includes(vName.toLowerCase())) {
    return `${base} (${vName})`;
  }
  return base;
}
