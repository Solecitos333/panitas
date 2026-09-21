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
  // Pollo a la Parrilla Acompañado
  {
    name: '1/4 Pollo a la Parrilla Acompañado',
    price: 220,
    category: 'Carnes',
    sku: 'CAR-PL14-ACOMP'
  },
  {
    name: '1/2 Pollo a la Parrilla Acompañado',
    price: 300,
    category: 'Carnes',
    sku: 'CAR-PL12-ACOMP'
  },
  {
    name: 'Pollo Entero a la Parrilla Acompañado',
    price: 600,
    category: 'Carnes',
    sku: 'CAR-PLENT-ACOMP'
  },

  // Nachos
  {
    name: 'Nachos Pequeño',
    price: 120,
    category: 'Variedades',
    sku: 'NCH-01'
  },
  {
    name: 'Nachos Mediano',
    price: 170,
    category: 'Variedades',
    sku: 'NCH-02'
  },
  {
    name: 'Nachos Grande',
    price: 220,
    category: 'Variedades',
    sku: 'NCH-03'
  }
];

console.log(`Insertando ${newProducts.length} productos en Firestore...`);

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
    stock: 100,
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
console.log(`✓ Confirmado: ${insData.writeResults?.length} productos creados/actualizados exitosamente en Firestore.`);
