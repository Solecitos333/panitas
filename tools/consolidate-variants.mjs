/**
 * Consolidación y Unificación de Catálogo con Variantes y Acompañamientos
 * Los Panitas by Nechy
 *
 * Unifica productos dispersos por tamaño (vasos, porciones) y acompañamiento
 * en productos base estructurados con hasVariants y hasSides.
 * Desactiva (active: false) los registros individuales antiguos sin romper historial.
 */

import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const auth = require('firebase-tools/lib/auth');

const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error('Se requiere autenticación de Firebase CLI.');
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);

const projectId = process.env.FIREBASE_PROJECT_ID || 'los-panitas-by-nechy';
const prefix = `projects/${projectId}/databases/(default)/documents`;
const base = `https://firestore.googleapis.com/v1/${prefix}`;

console.log('=== [1/4] Descargando y respaldando productos actuales ===');
const listRes = await fetch(`${base}/products?pageSize=300`, {
  headers: { authorization: `Bearer ${token.access_token}` }
});
if (!listRes.ok) {
  throw new Error(`Error al listar productos (${listRes.status}): ${await listRes.text()}`);
}
const listData = await listRes.json();
const existingDocs = listData.documents || [];
console.log(`Encontrados ${existingDocs.length} productos en Firestore.`);

mkdirSync('backups', { recursive: true });
const backupPath = `backups/products-backup-pre-consolidation-${Date.now()}.json`;
writeFileSync(backupPath, JSON.stringify(existingDocs, null, 2), 'utf8');
console.log(`✓ Respaldo de seguridad guardado en: ${backupPath}`);

function encodeMap(object) {
  return Object.fromEntries(Object.entries(object).map(([k, v]) => [k, encodeValue(v)]));
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  return { mapValue: { fields: encodeMap(value) } };
}

const now = new Date();

// Definición de las consolidaciones
const consolidations = [
  // 1. Vasos con Hielo
  {
    targetId: 'prod-vaso-con-hielo',
    name: 'Vaso con Hielo',
    category: 'Bebidas',
    sku: 'BEB-03',
    priceCents: 2000,
    costCents: 0,
    isPrepared: false,
    inventoryType: 'raw',
    hasVariants: true,
    variants: [
      { id: '12oz', name: '12 oz', priceCents: 2000, costCents: 0, sku: 'BEB-03' },
      { id: '16oz', name: '16 oz', priceCents: 2500, costCents: 0, sku: 'BEB-04' }
    ],
    hasSides: false,
    sidePriceCents: 0,
    deactivateIds: ['prod-vaso-con-hielo-12-oz', 'prod-vaso-con-hielo-16-oz']
  },

  // 2. Jugos Naturales
  {
    targetId: 'prod-jugo-natural',
    name: 'Jugo Natural',
    category: 'Bebidas',
    sku: 'BEB-01',
    priceCents: 6000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: 'peq', name: 'Pequeño', priceCents: 6000, costCents: 0, sku: 'BEB-01' },
      { id: 'gra', name: 'Grande / En Rama', priceCents: 8000, costCents: 0, sku: 'BEB-02' }
    ],
    hasSides: false,
    sidePriceCents: 0,
    deactivateIds: ['prod-jugo-pequeno', 'prod-jugo-en-rama-grande']
  },

  // 3. Café Negro
  {
    targetId: 'prod-cafe-negro',
    name: 'Café Negro',
    category: 'Bebidas',
    sku: 'CAF-N07',
    priceCents: 2000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: '7oz', name: '7 oz', priceCents: 2000, costCents: 0, sku: 'CAF-N07' },
      { id: '12oz', name: '12 oz', priceCents: 6000, costCents: 0, sku: 'CAF-N12' },
      { id: '16oz', name: '16 oz', priceCents: 10000, costCents: 0, sku: 'CAF-N16' }
    ],
    hasSides: false,
    sidePriceCents: 0,
    deactivateIds: ['prod-cafe-negro-7-oz', 'prod-cafe-negro-12-oz', 'prod-cafe-negro-16-oz']
  },

  // 4. Café con Leche
  {
    targetId: 'prod-cafe-con-leche',
    name: 'Café con Leche',
    category: 'Bebidas',
    sku: 'CAF-L07',
    priceCents: 3000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: '7oz', name: '7 oz', priceCents: 3000, costCents: 0, sku: 'CAF-L07' },
      { id: '12oz', name: '12 oz', priceCents: 8000, costCents: 0, sku: 'CAF-L12' },
      { id: '16oz', name: '16 oz', priceCents: 12000, costCents: 0, sku: 'CAF-L16' }
    ],
    hasSides: false,
    sidePriceCents: 0,
    deactivateIds: ['prod-cafe-con-leche-7-oz', 'prod-cafe-con-leche-12-oz', 'prod-cafe-con-leche-16-oz']
  },

  // 5. Omelette (Con selección de porción y guarnición)
  {
    targetId: 'prod-omelette',
    name: 'Omelette',
    category: 'Omelettes',
    sku: 'OME-01',
    priceCents: 10000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: 'peq', name: 'Pequeño', priceCents: 10000, costCents: 0, sku: 'OME-01' },
      { id: 'med', name: 'Mediano', priceCents: 15000, costCents: 0, sku: 'OME-02' },
      { id: 'gra', name: 'Grande', priceCents: 20000, costCents: 0, sku: 'OME-03' }
    ],
    hasSides: true,
    sidePriceCents: 2000, // +RD$20 por acompañamiento
    deactivateIds: [
      'prod-omelette-solo-pequeno',
      'prod-omelette-solo-mediano',
      'prod-omelette-solo-grande',
      'prod-omelette-acompanado-pequeno',
      'prod-omelette-acompanado-mediano',
      'prod-omelette-acompanado-grande'
    ]
  },

  // 6. Yaroa
  {
    targetId: 'prod-yaroa',
    name: 'Yaroa',
    category: 'Yaroas',
    sku: 'YAR-01',
    priceCents: 24000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: 'peq', name: 'Pequeña', priceCents: 24000, costCents: 0, sku: 'YAR-01' },
      { id: 'med', name: 'Mediana', priceCents: 32000, costCents: 0, sku: 'YAR-02' },
      { id: 'gra', name: 'Grande', priceCents: 40000, costCents: 0, sku: 'YAR-03' }
    ],
    hasSides: false,
    sidePriceCents: 0,
    deactivateIds: ['prod-yaroa-pequena', 'prod-yaroa-mediana', 'prod-yaroa-grande']
  },

  // 7. Salchipapa
  {
    targetId: 'prod-salchipapa',
    name: 'Salchipapa',
    category: 'Variedades',
    sku: 'SLP-01',
    priceCents: 18000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: 'peq', name: 'Pequeña', priceCents: 18000, costCents: 0, sku: 'SLP-01' },
      { id: 'med', name: 'Mediana', priceCents: 28000, costCents: 0, sku: 'SLP-02' },
      { id: 'gra', name: 'Grande', priceCents: 37000, costCents: 0, sku: 'SLP-03' }
    ],
    hasSides: false,
    sidePriceCents: 0,
    deactivateIds: ['prod-salchipapa-pequena', 'prod-salchipapa-mediana', 'prod-salchipapa-grande']
  },

  // 8. Salchiplátano
  {
    targetId: 'prod-salchiplatano',
    name: 'Salchiplátano',
    category: 'Variedades',
    sku: 'SLL-01',
    priceCents: 18000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: 'peq', name: 'Pequeño', priceCents: 18000, costCents: 0, sku: 'SLL-01' },
      { id: 'med', name: 'Mediano', priceCents: 28000, costCents: 0, sku: 'SLL-02' },
      { id: 'gra', name: 'Grande', priceCents: 37000, costCents: 0, sku: 'SLL-03' }
    ],
    hasSides: false,
    sidePriceCents: 0,
    deactivateIds: ['prod-salchiplatano-pequeno', 'prod-salchiplatano-mediano', 'prod-salchiplatano-grande']
  },

  // 9. Nachos
  {
    targetId: 'prod-nachos',
    name: 'Nachos',
    category: 'Variedades',
    sku: 'NCH-01',
    priceCents: 12000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: 'peq', name: 'Pequeño', priceCents: 12000, costCents: 0, sku: 'NCH-01' },
      { id: 'med', name: 'Mediano', priceCents: 17000, costCents: 0, sku: 'NCH-02' },
      { id: 'gra', name: 'Grande', priceCents: 22000, costCents: 0, sku: 'NCH-03' }
    ],
    hasSides: false,
    sidePriceCents: 0,
    deactivateIds: ['prod-nachos-pequeno', 'prod-nachos-mediano', 'prod-nachos-grande']
  },

  // 10. Ensalada César
  {
    targetId: 'prod-ensalada-cesar',
    name: 'Ensalada César',
    category: 'Ensaladas',
    sku: 'ENS-01',
    priceCents: 16000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: 'peq', name: 'Pequeña', priceCents: 16000, costCents: 0, sku: 'ENS-01' },
      { id: 'med', name: 'Mediana', priceCents: 21000, costCents: 0, sku: 'ENS-02' },
      { id: 'gra', name: 'Grande', priceCents: 27000, costCents: 0, sku: 'ENS-03' }
    ],
    hasSides: false,
    sidePriceCents: 0,
    deactivateIds: ['prod-ensalada-cesar-pequena', 'prod-ensalada-cesar-mediana', 'prod-ensalada-cesar-grande']
  },

  // 11. Pechuga a la Plancha (137g / 182g / 1/2 lb con guarnición +RD$50)
  {
    targetId: 'prod-pechuga',
    name: 'Pechuga a la Plancha',
    category: 'Carnes',
    sku: 'CAR-PEC-S137',
    priceCents: 15000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: '137g', name: '137g', priceCents: 15000, costCents: 0, sku: 'CAR-PEC-S137' },
      { id: '182g', name: '182g', priceCents: 20000, costCents: 0, sku: 'CAR-PEC-S182' },
      { id: '050lb', name: '1/2 lb', priceCents: 25000, costCents: 0, sku: 'CAR-PEC-S050' }
    ],
    hasSides: true,
    sidePriceCents: 5000,
    deactivateIds: [
      'prod-pechuga-sola-137g',
      'prod-pechuga-sola-182g',
      'prod-pechuga-sola-1-2-lb',
      'prod-pechuga-acompanada-137g',
      'prod-pechuga-acompanada-182g',
      'prod-pechuga-acompanada-1-2-lb'
    ]
  },

  // 12. Pechurinas
  {
    targetId: 'prod-pechurinas',
    name: 'Pechurinas',
    category: 'Carnes',
    sku: 'CAR-PCH-S137',
    priceCents: 15000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: '137g', name: '137g', priceCents: 15000, costCents: 0, sku: 'CAR-PCH-S137' },
      { id: '182g', name: '182g', priceCents: 20000, costCents: 0, sku: 'CAR-PCH-S182' },
      { id: '050lb', name: '1/2 lb', priceCents: 25000, costCents: 0, sku: 'CAR-PCH-S050' }
    ],
    hasSides: true,
    sidePriceCents: 5000,
    deactivateIds: [
      'prod-pechurinas-sola-137g',
      'prod-pechurinas-sola-182g',
      'prod-pechurinas-sola-1-2-lb',
      'prod-pechurinas-acompanada-137g',
      'prod-pechurinas-acompanada-182g',
      'prod-pechurinas-acompanada-1-2-lb'
    ]
  },

  // 13. Chuleta
  {
    targetId: 'prod-chuleta',
    name: 'Chuleta',
    category: 'Carnes',
    sku: 'CAR-CHU-S137',
    priceCents: 15000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: '137g', name: '137g', priceCents: 15000, costCents: 0, sku: 'CAR-CHU-S137' },
      { id: '182g', name: '182g', priceCents: 20000, costCents: 0, sku: 'CAR-CHU-S182' },
      { id: '050lb', name: '1/2 lb', priceCents: 25000, costCents: 0, sku: 'CAR-CHU-S050' }
    ],
    hasSides: true,
    sidePriceCents: 5000,
    deactivateIds: [
      'prod-chuleta-sola-137g',
      'prod-chuleta-sola-182g',
      'prod-chuleta-sola-1-2-lb',
      'prod-chuleta-acompanada-137g',
      'prod-chuleta-acompanada-182g',
      'prod-chuleta-acompanada-1-2-lb'
    ]
  },

  // 14. Costillas
  {
    targetId: 'prod-costillas',
    name: 'Costillas',
    category: 'Carnes',
    sku: 'CAR-COS-S137',
    priceCents: 15000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: '137g', name: '137g', priceCents: 15000, costCents: 0, sku: 'CAR-COS-S137' },
      { id: '182g', name: '182g', priceCents: 20000, costCents: 0, sku: 'CAR-COS-S182' },
      { id: '050lb', name: '1/2 lb', priceCents: 25000, costCents: 0, sku: 'CAR-COS-S050' }
    ],
    hasSides: true,
    sidePriceCents: 5000,
    deactivateIds: [
      'prod-costillas-sola-137g',
      'prod-costillas-sola-182g',
      'prod-costillas-sola-1-2-lb',
      'prod-costillas-acompanada-137g',
      'prod-costillas-acompanada-182g',
      'prod-costillas-acompanada-1-2-lb'
    ]
  },

  // 15. Carne Salada
  {
    targetId: 'prod-carne-salada',
    name: 'Carne Salada',
    category: 'Carnes',
    sku: 'CAR-CSL-S137',
    priceCents: 15000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: '137g', name: '137g', priceCents: 15000, costCents: 0, sku: 'CAR-CSL-S137' },
      { id: '182g', name: '182g', priceCents: 20000, costCents: 0, sku: 'CAR-CSL-S182' },
      { id: '050lb', name: '1/2 lb', priceCents: 25000, costCents: 0, sku: 'CAR-CSL-S050' }
    ],
    hasSides: true,
    sidePriceCents: 5000,
    deactivateIds: [
      'prod-carne-salada-sola-137g',
      'prod-carne-salada-sola-182g',
      'prod-carne-salada-sola-1-2-lb',
      'prod-carne-salada-acompanada-137g',
      'prod-carne-salada-acompanada-182g',
      'prod-carne-salada-acompanada-1-2-lb'
    ]
  },

  // 16. Longaniza Casera
  {
    targetId: 'prod-longaniza-casera',
    name: 'Longaniza Casera',
    category: 'Carnes',
    sku: 'CAR-LON-S137',
    priceCents: 15000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: '137g', name: '137g', priceCents: 15000, costCents: 0, sku: 'CAR-LON-S137' },
      { id: '182g', name: '182g', priceCents: 20000, costCents: 0, sku: 'CAR-LON-S182' },
      { id: '050lb', name: '1/2 lb', priceCents: 25000, costCents: 0, sku: 'CAR-LON-S050' }
    ],
    hasSides: true,
    sidePriceCents: 5000,
    deactivateIds: [
      'prod-longaniza-casera-sola-137g',
      'prod-longaniza-casera-sola-182g',
      'prod-longaniza-casera-sola-1-2-lb',
      'prod-longaniza-casera-acompanada-137g',
      'prod-longaniza-casera-acompanada-182g',
      'prod-longaniza-casera-acompanada-1-2-lb'
    ]
  },

  // 17. Mero
  {
    targetId: 'prod-mero',
    name: 'Mero',
    category: 'Carnes',
    sku: 'CAR-MER-S137',
    priceCents: 15000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: '137g', name: '137g', priceCents: 15000, costCents: 0, sku: 'CAR-MER-S137' },
      { id: '182g', name: '182g', priceCents: 20000, costCents: 0, sku: 'CAR-MER-S182' },
      { id: '050lb', name: '1/2 lb', priceCents: 25000, costCents: 0, sku: 'CAR-MER-S050' }
    ],
    hasSides: true,
    sidePriceCents: 5000,
    deactivateIds: [
      'prod-mero-sola-137g',
      'prod-mero-sola-182g',
      'prod-mero-sola-1-2-lb',
      'prod-mero-acompanada-137g',
      'prod-mero-acompanada-182g',
      'prod-mero-acompanada-1-2-lb'
    ]
  },

  // 18. Chicharrón
  {
    targetId: 'prod-chicharron',
    name: 'Chicharrón',
    category: 'Carnes',
    sku: 'CAR-CHI-S137',
    priceCents: 15000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: '137g', name: '137g', priceCents: 15000, costCents: 0, sku: 'CAR-CHI-S137' },
      { id: '182g', name: '182g', priceCents: 20000, costCents: 0, sku: 'CAR-CHI-S182' },
      { id: '050lb', name: '1/2 lb', priceCents: 25000, costCents: 0, sku: 'CAR-CHI-S050' }
    ],
    hasSides: true,
    sidePriceCents: 5000,
    deactivateIds: [
      'prod-chicharron-sola-137g',
      'prod-chicharron-sola-182g',
      'prod-chicharron-sola-1-2-lb',
      'prod-chicharron-acompanada-137g',
      'prod-chicharron-acompanada-182g',
      'prod-chicharron-acompanada-1-2-lb'
    ]
  },

  // 19. Pollo a la Parrilla (1/4 Pollo, 1/2 Pollo, Entero con guarnición dinámica)
  {
    targetId: 'prod-pollo-a-la-parrilla',
    name: 'Pollo a la Parrilla',
    category: 'Carnes',
    sku: 'CAR-PL14',
    priceCents: 12000,
    costCents: 0,
    isPrepared: true,
    inventoryType: 'prepared',
    hasVariants: true,
    variants: [
      { id: '14pl', name: '1/4 Pollo', priceCents: 12000, costCents: 0, sku: 'CAR-PL14' },
      { id: '12pl', name: '1/2 Pollo', priceCents: 22000, costCents: 0, sku: 'CAR-PL12' },
      { id: 'entpl', name: 'Pollo Entero', priceCents: 44000, costCents: 0, sku: 'CAR-PLENT' }
    ],
    hasSides: true,
    sidePriceCents: 8000,
    deactivateIds: [
      'prod-1-4-pollo-a-la-parrilla',
      'prod-1-4-pollo-a-la-parrilla-acompanado',
      'prod-1-2-pollo-a-la-parrilla',
      'prod-1-2-pollo-a-la-parrilla-acompanado',
      'prod-pollo-entero',
      'prod-pollo-entero-a-la-parrilla-acompanado'
    ]
  }
];

console.log('=== [2/4] Construyendo operaciones de inserción y desactivación ===');

const writes = [];
const deactivatedSet = new Set();

// 1. Desactivar productos obsoletos (manteniendo historial)
for (const item of consolidations) {
  for (const oldId of item.deactivateIds) {
    if (deactivatedSet.has(oldId)) continue;
    deactivatedSet.add(oldId);
    writes.push({
      update: {
        name: `${prefix}/products/${oldId}`,
        fields: {
          active: { booleanValue: false },
          updatedAt: { timestampValue: now.toISOString() }
        }
      },
      updateMask: {
        fieldPaths: ['active', 'updatedAt']
      }
    });
  }
}

// 2. Crear / actualizar los productos unificados base
for (const item of consolidations) {
  const payload = {
    name: item.name,
    category: item.category,
    sku: item.sku,
    priceCents: item.priceCents,
    costCents: item.costCents || 0,
    taxRate: 0,
    stock: 0,
    minStock: 5,
    active: true,
    isPrepared: item.isPrepared !== false,
    inventoryType: item.inventoryType || 'prepared',
    hasVariants: Boolean(item.hasVariants),
    variants: item.variants || [],
    hasSides: Boolean(item.hasSides),
    sidePriceCents: item.sidePriceCents || 0,
    updatedAt: now
  };

  writes.push({
    update: {
      name: `${prefix}/products/${item.targetId}`,
      fields: encodeMap(payload)
    }
  });
}

console.log(`Total de operaciones a enviar a Firestore: ${writes.length}`);
console.log(`- Productos a desactivar: ${deactivatedSet.size}`);
console.log(`- Productos consolidados a registrar/actualizar: ${consolidations.length}`);

console.log('=== [3/4] Enviando transacciones en lotes a Firestore ===');

// Firestore REST :commit acepta hasta 500 writes por petición.
const batchSize = 100;
for (let i = 0; i < writes.length; i += batchSize) {
  const chunk = writes.slice(i, i + batchSize);
  console.log(`Enviando lote ${Math.floor(i / batchSize) + 1} (${chunk.length} operaciones)...`);
  const commitRes = await fetch(`${base}:commit`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token.access_token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ writes: chunk })
  });
  if (!commitRes.ok) {
    throw new Error(`Error en commit (${commitRes.status}): ${await commitRes.text()}`);
  }
  const commitData = await commitRes.json();
  console.log(`✓ Lote confirmado: ${commitData.writeResults?.length} resultados.`);
}

console.log('=== [4/4] Verificando catálogo activo resultante ===');

const verifyRes = await fetch(`${base}/products?pageSize=300`, {
  headers: { authorization: `Bearer ${token.access_token}` }
});
const verifyData = await verifyRes.json();
const activeProducts = (verifyData.documents || []).map((d) => {
  const f = d.fields;
  return {
    id: d.name.split('/').pop(),
    name: f.name?.stringValue,
    category: f.category?.stringValue,
    active: f.active?.booleanValue !== false,
    hasVariants: f.hasVariants?.booleanValue === true,
    hasSides: f.hasSides?.booleanValue === true,
    variantsCount: f.variants?.arrayValue?.values?.length || 0
  };
}).filter((p) => p.active);

console.log(`\n¡Éxito! Ahora hay ${activeProducts.length} productos activos (antes 157).`);
console.log('Productos con variantes activados:');
activeProducts
  .filter((p) => p.hasVariants || p.hasSides)
  .forEach((p) => {
    console.log(`  - [${p.category}] ${p.name}: ${p.variantsCount} variantes, guarnición: ${p.hasSides ? 'Sí' : 'No'}`);
  });

console.log('\n=== CONSOLIDACIÓN DE CATÁLOGO COMPLETADA CON ÉXITO ===\n');
