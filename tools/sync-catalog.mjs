import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const auth = require('firebase-tools/lib/auth');

const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error('Se requiere autenticación de Firebase CLI.');
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);

const projectId = process.env.FIREBASE_PROJECT_ID || 'los-panitas-by-nechy';
const prefix = `projects/${projectId}/databases/(default)/documents`;
const base = `https://firestore.googleapis.com/v1/${prefix}`;

console.log('=== [1/4] Descargando y respaldando catálogo existente ===');
const listRes = await fetch(`${base}/products?pageSize=300`, {
  headers: { authorization: `Bearer ${token.access_token}` }
});
if (!listRes.ok) {
  throw new Error(`Error al listar productos (${listRes.status}): ${await listRes.text()}`);
}
const listData = await listRes.json();
const existingDocs = listData.documents || [];
console.log(`Encontrados ${existingDocs.length} productos previos.`);

// Guardar respaldo JSON
const backupPath = 'backups/products-backup-2026-09-17.json';
writeFileSync(backupPath, JSON.stringify(existingDocs, null, 2), 'utf8');
console.log(`✓ Respaldo completado en: ${backupPath}`);

console.log('=== [2/4] Preparando eliminación de productos antiguos ===');
const deleteWrites = existingDocs.map((doc) => ({
  delete: doc.name
}));

console.log('=== [3/4] Preparando nuevo catálogo de productos ===');
const now = new Date();

const newCatalog = [
  // 1. Platos del Día y A la Carta
  { name: 'Plato del Día', price: 220, category: 'Platos del Día', sku: 'PD-01' },
  { name: 'Plato a la Carta', price: 260, category: 'A la Carta', sku: 'ALC-01' },
  { name: 'Desayuno', price: 120, category: 'Desayunos', sku: 'DES-01' },
  { name: 'Servicio de Carne', price: 250, category: 'Carnes', sku: 'CAR-01' },

  // 2. Guarniciones y Servicios ($80 / $50)
  { name: 'Servicio: Mangú / Maduro Verde', price: 80, category: 'Guarniciones', sku: 'SRV-01' },
  { name: 'Servicio: Fritos Verdes o Maduros', price: 80, category: 'Guarniciones', sku: 'SRV-02' },
  { name: 'Servicio: Yuca Entera o Puré', price: 80, category: 'Guarniciones', sku: 'SRV-03' },
  { name: 'Servicio: Guineos Hervidos o Puré', price: 80, category: 'Guarniciones', sku: 'SRV-04' },
  { name: 'Servicio: Batatas Fritas', price: 80, category: 'Guarniciones', sku: 'SRV-05' },
  { name: 'Servicio: Puré de Papas', price: 80, category: 'Guarniciones', sku: 'SRV-06' },
  { name: 'Servicio: Papas Fritas', price: 80, category: 'Guarniciones', sku: 'SRV-07' },
  { name: 'Servicio: Arroz', price: 80, category: 'Guarniciones', sku: 'SRV-08' },
  { name: 'Habichuelas', price: 50, category: 'Guarniciones', sku: 'HAB-01' },

  // 3. Sandwiches, Tostadas y Rikitakis
  { name: 'Club Sandwich', price: 320, category: 'Sandwiches', sku: 'SW-01' },
  { name: 'Sandwich de Jamón y Queso', price: 120, category: 'Sandwiches', sku: 'SW-02' },
  { name: 'Sandwich de Carne', price: 180, category: 'Sandwiches', sku: 'SW-03' },
  { name: 'Sandwich de Atún', price: 200, category: 'Sandwiches', sku: 'SW-04' },
  { name: 'Cubanito', price: 150, category: 'Sandwiches', sku: 'SW-05' },
  { name: 'Tostada Jamón y Queso', price: 60, category: 'Tostadas', sku: 'TOST-01' },
  { name: 'Tostada de Carne', price: 90, category: 'Tostadas', sku: 'TOST-02' },
  { name: 'Tostada Dominicana', price: 120, category: 'Tostadas', sku: 'TOST-03' },
  { name: 'Rikitaki', price: 110, category: 'Rikitakis', sku: 'RIK-01' },

  // 4. Omelettes
  { name: 'Omelette Solo (Pequeño)', price: 100, category: 'Omelettes', sku: 'OME-01' },
  { name: 'Omelette Solo (Mediano)', price: 150, category: 'Omelettes', sku: 'OME-02' },
  { name: 'Omelette Solo (Grande)', price: 200, category: 'Omelettes', sku: 'OME-03' },
  { name: 'Omelette Acompañado (Pequeño)', price: 120, category: 'Omelettes', sku: 'OME-04' },
  { name: 'Omelette Acompañado (Mediano)', price: 160, category: 'Omelettes', sku: 'OME-05' },
  { name: 'Omelette Acompañado (Grande)', price: 220, category: 'Omelettes', sku: 'OME-06' },

  // 5. Yaroas y Salchipapas / Salchiplátanos
  { name: 'Yaroa Pequeña', price: 240, category: 'Yaroas', sku: 'YAR-01' },
  { name: 'Yaroa Mediana', price: 320, category: 'Yaroas', sku: 'YAR-02' },
  { name: 'Yaroa Grande', price: 400, category: 'Yaroas', sku: 'YAR-03' },
  { name: 'Salchipapa Pequeña', price: 180, category: 'Variedades', sku: 'SLP-01' },
  { name: 'Salchipapa Mediana', price: 280, category: 'Variedades', sku: 'SLP-02' },
  { name: 'Salchipapa Grande', price: 370, category: 'Variedades', sku: 'SLP-03' },
  { name: 'Salchiplátano Pequeño', price: 180, category: 'Variedades', sku: 'SLL-01' },
  { name: 'Salchiplátano Mediano', price: 280, category: 'Variedades', sku: 'SLL-02' },
  { name: 'Salchiplátano Grande', price: 370, category: 'Variedades', sku: 'SLL-03' },

  // 6. Variedades (Tacos, Burritos, Quesadillas, etc.)
  { name: 'Patacón', price: 230, category: 'Variedades', sku: 'PAT-01' },
  { name: 'Chimichanga', price: 320, category: 'Variedades', sku: 'CHI-01' },
  { name: 'Empanada', price: 40, category: 'Variedades', sku: 'EMP-01' },
  { name: 'Tacos de Carne', price: 110, category: 'Variedades', sku: 'TAC-01' },
  { name: 'Tacos de Vegetales', price: 80, category: 'Variedades', sku: 'TAC-02' },
  { name: 'Burrito de Carne', price: 230, category: 'Variedades', sku: 'BUR-01' },
  { name: 'Burrito de Vegetales', price: 170, category: 'Variedades', sku: 'BUR-02' },
  { name: 'Quesadilla de Carne', price: 240, category: 'Variedades', sku: 'QUE-01' },
  { name: 'Quesadilla de Vegetales', price: 180, category: 'Variedades', sku: 'QUE-02' },
  { name: 'Wrap', price: 230, category: 'Variedades', sku: 'WRP-01' },
  { name: 'Hot Dog', price: 110, category: 'Variedades', sku: 'HDG-01' },
  { name: 'Hamburguesa', price: 150, category: 'Variedades', sku: 'HAM-01' },
  { name: 'Seguidilla', price: 150, category: 'Variedades', sku: 'SEG-01' },
  { name: 'Paracaídas', price: 150, category: 'Variedades', sku: 'PAR-01' },

  // 7. Ensaladas
  { name: 'Ensalada César Pequeña', price: 160, category: 'Ensaladas', sku: 'ENS-01' },
  { name: 'Ensalada César Mediana', price: 210, category: 'Ensaladas', sku: 'ENS-02' },
  { name: 'Ensalada César Grande', price: 270, category: 'Ensaladas', sku: 'ENS-03' },

  // 8. Extras / Agregados
  { name: 'Extra Queso', price: 20, category: 'Extras', sku: 'EXT-01' },
  { name: 'Extra Salami', price: 25, category: 'Extras', sku: 'EXT-02' },
  { name: 'Extra Jamoneta', price: 25, category: 'Extras', sku: 'EXT-03' },
  { name: 'Extra Huevo', price: 20, category: 'Extras', sku: 'EXT-04' },

  // 9. Bebidas y Sopas
  { name: 'Jugo Pequeño', price: 60, category: 'Bebidas', sku: 'BEB-01' },
  { name: 'Jugo en Rama / Grande', price: 80, category: 'Bebidas', sku: 'BEB-02' },
  { name: 'Vaso con Hielo (12 oz)', price: 20, category: 'Bebidas', sku: 'BEB-03' },
  { name: 'Vaso con Hielo (16 oz)', price: 25, category: 'Bebidas', sku: 'BEB-04' },
  { name: 'Sopa de Vaso', price: 80, category: 'Bebidas', sku: 'BEB-05' },

  // 10. Postres
  { name: 'Dulces', price: 10, category: 'Postres', sku: 'POS-01' },
  { name: 'Tortas', price: 15, category: 'Postres', sku: 'POS-02' },
  { name: 'Muffins', price: 80, category: 'Postres', sku: 'POS-03' }
];

console.log(`Total de nuevos productos a registrar: ${newCatalog.length}`);

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

const insertWrites = newCatalog.map((item) => {
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

console.log('=== [4/4] Aplicando cambios en Firestore ===');

// Ejecutar eliminaciones
if (deleteWrites.length > 0) {
  console.log(`Eliminando ${deleteWrites.length} productos antiguos...`);
  const delRes = await fetch(`${base}:commit`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ writes: deleteWrites })
  });
  if (!delRes.ok) throw new Error(`Error en eliminación (${delRes.status}): ${await delRes.text()}`);
  console.log('✓ Eliminación completada.');
}

// Ejecutar inserciones
console.log(`Insertando ${insertWrites.length} nuevos productos...`);
const insRes = await fetch(`${base}:commit`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ writes: insertWrites })
});
if (!insRes.ok) throw new Error(`Error en inserción (${insRes.status}): ${await insRes.text()}`);
const insData = await insRes.json();
console.log(`✓ Inserción confirmada: ${insData.writeResults?.length} productos creados.`);

console.log('\n=== ¡CATÁLOGO ACTUALIZADO CON ÉXITO! ===\n');
