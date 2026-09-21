import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const auth = require('firebase-tools/lib/auth');

const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error('Se requiere autenticación de Firebase CLI.');
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);

const projectId = process.env.FIREBASE_PROJECT_ID || 'los-panitas-by-nechy';
const prefix = `projects/${projectId}/databases/(default)/documents`;
const base = `https://firestore.googleapis.com/v1/${prefix}`;

const additionalProducts = [
  // Bebidas
  { name: 'Refresco Coca-Cola', price: 40, category: 'Bebidas', sku: 'BEB-06' },
  { name: 'Refresco Kola Real', price: 30, category: 'Bebidas', sku: 'BEB-07' },
  { name: 'Monster Energy', price: 130, category: 'Bebidas', sku: 'BEB-08' },
  { name: 'Enerup', price: 40, category: 'Bebidas', sku: 'BEB-09' },
  { name: 'Minute Maid', price: 30, category: 'Bebidas', sku: 'BEB-10' },
  { name: 'Generade', price: 50, category: 'Bebidas', sku: 'BEB-11' },
  { name: 'Agua Saborizada Kola Real', price: 30, category: 'Bebidas', sku: 'BEB-12' },
  { name: 'Agua Saborizada Coca-Cola', price: 40, category: 'Bebidas', sku: 'BEB-13' },
  { name: 'Soda Amarga Coca-Cola', price: 40, category: 'Bebidas', sku: 'BEB-14' },
  { name: 'Soda Amarga Kola Real', price: 30, category: 'Bebidas', sku: 'BEB-15' },
  { name: 'Agua con Gas', price: 40, category: 'Bebidas', sku: 'BEB-16' },
  { name: 'Malta', price: 40, category: 'Bebidas', sku: 'BEB-17' },
  { name: 'Frutop', price: 35, category: 'Bebidas', sku: 'BEB-18' },
  { name: 'Frutop Pulpix', price: 25, category: 'Bebidas', sku: 'BEB-19' },

  // Variedades / Frituras
  { name: 'Arepa', price: 20, category: 'Variedades', sku: 'VAR-AREP' },
  { name: 'Torrejas', price: 20, category: 'Variedades', sku: 'VAR-TORR' },

  // Extras / Porciones
  { name: 'Porción Batata', price: 10, category: 'Extras', sku: 'EXT-BAT' },
  { name: 'Porción Fritos Maduros', price: 25, category: 'Extras', sku: 'EXT-FM' },
  { name: 'Tajada de Aguacate', price: 25, category: 'Extras', sku: 'EXT-AGU' },
  { name: 'Guineo Maduro', price: 10, category: 'Extras', sku: 'EXT-GM' }
];

console.log(`Insertando ${additionalProducts.length} productos adicionales en Firestore...`);

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
const insertWrites = additionalProducts.map((item) => {
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

const insRes = await fetch(`${base}:commit`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ writes: insertWrites })
});

if (!insRes.ok) throw new Error(`Error en inserción (${insRes.status}): ${await insRes.text()}`);
const insData = await insRes.json();
console.log(`✓ Confirmado: ${insData.writeResults?.length} productos adicionales creados/actualizados.`);
