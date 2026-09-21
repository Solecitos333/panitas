import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const auth = require('firebase-tools/lib/auth');

const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error('Se requiere autenticación de Firebase CLI.');
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);

const projectId = process.env.FIREBASE_PROJECT_ID || 'los-panitas-by-nechy';
const prefix = `projects/${projectId}/databases/(default)/documents`;
const base = `https://firestore.googleapis.com/v1/${prefix}`;

const newProducts = [
  // Cafetería
  { name: 'Café Negro (7 oz)', price: 20, category: 'Bebidas', sku: 'CAF-N07' },
  { name: 'Café Negro (12 oz)', price: 60, category: 'Bebidas', sku: 'CAF-N12' },
  { name: 'Café Negro (16 oz)', price: 100, category: 'Bebidas', sku: 'CAF-N16' },
  { name: 'Café con Leche (7 oz)', price: 30, category: 'Bebidas', sku: 'CAF-L07' },
  { name: 'Café con Leche (12 oz)', price: 80, category: 'Bebidas', sku: 'CAF-L12' },
  { name: 'Café con Leche (16 oz)', price: 120, category: 'Bebidas', sku: 'CAF-L16' },
  { name: 'Botella de Agua', price: 20, category: 'Bebidas', sku: 'BEB-AGUA' },

  // Panadería / Tostadas
  { name: 'Pan Tostado', price: 25, category: 'Tostadas', sku: 'TOST-PAN' },

  // Servicio de Delivery
  { name: 'Costo de Envío (Delivery)', price: 50, category: 'Servicios', sku: 'SRV-DELIV' }
];

// Generar carnes
const meats = [
  { baseName: 'Pechuga', skuPrefix: 'PEC' },
  { baseName: 'Carne Salada', skuPrefix: 'CSL' },
  { baseName: 'Pechurinas', skuPrefix: 'PCH' },
  { baseName: 'Mero', skuPrefix: 'MER' },
  { baseName: 'Chuleta', skuPrefix: 'CHU' },
  { baseName: 'Chicharrón', skuPrefix: 'CHI' },
  { baseName: 'Costillas', skuPrefix: 'COS' },
  { baseName: 'Longaniza Casera', skuPrefix: 'LON' }
];

const presentations = [
  { type: 'Sola', label: '137g', price: 150, code: 'S137' },
  { type: 'Sola', label: '182g', price: 200, code: 'S182' },
  { type: 'Sola', label: '1/2 lb', price: 250, code: 'S050' },
  { type: 'Acompañada', label: '137g', price: 200, code: 'A137' },
  { type: 'Acompañada', label: '182g', price: 250, code: 'A182' },
  { type: 'Acompañada', label: '1/2 lb', price: 300, code: 'A050' }
];

for (const m of meats) {
  for (const p of presentations) {
    newProducts.push({
      name: `${m.baseName} ${p.type} (${p.label})`,
      price: p.price,
      category: 'Carnes',
      sku: `CAR-${m.skuPrefix}-${p.code}`
    });
  }
}

console.log(`Total de productos a insertar en este lote: ${newProducts.length}`);

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function encodeMap(object) {
  return Object.fromEntries(Object.entries(object).map(([k, v]) => [k, encodeValue(v)]));
}

function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  return { mapValue: { fields: encodeMap(value) } };
}

const now = new Date();
const insertWrites = newProducts.map((item) => {
  const docId = `prod-${slugify(item.name)}`;
  const payload = {
    name: item.name,
    sku: item.sku,
    category: item.category,
    priceCents: Math.round(item.price * 100),
    costCents: 0,
    taxRate: 0,
    stock: 0,
    active: true,
    createdAt: now,
    updatedAt: now
  };
  return {
    update: {
      name: `${prefix}/products/${docId}`,
      fields: encodeMap(payload)
    }
  };
});

console.log('Enviando commit a Firestore...');
const insRes = await fetch(`${base}:commit`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ writes: insertWrites })
});

if (!insRes.ok) throw new Error(`Error en inserción (${insRes.status}): ${await insRes.text()}`);
const insData = await insRes.json();
console.log(`✓ Confirmado: ${insData.writeResults?.length} productos creados/actualizados exitosamente en Firestore.`);
