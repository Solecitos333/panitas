const projectId = process.env.FIREBASE_PROJECT_ID || 'los-panitas-by-nechy';
const accessToken = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;

if (!accessToken) throw new Error('Define GOOGLE_OAUTH_ACCESS_TOKEN únicamente para esta ejecución.');

const now = new Date();
const settings = {
  name: 'Los Panitas by Nechy',
  legalName: 'Los Panitas by Nechy',
  rnc: 'N/D',
  phone: '829-459-7437',
  email: '',
  address: "C/7, detrás Bomba Texaco, al lado McDonald's, Las Colinas, Santiago",
  currency: 'DOP',
  defaultTaxRate: 0,
  invoicePrefix: 'PAN-',
  quotePrefix: 'COT-',
  proformaPrefix: 'PROF-',
  receiptFooter: 'Gracias por preferirnos.',
  active: true,
  createdAt: now,
  updatedAt: now
};
const counters = {
  invoice: 1001,
  quote: 1001,
  proforma: 1001,
  ncfB01: 1,
  ncfB02: 1,
  ncfB14: 1,
  ncfB15: 1,
  updatedAt: now
};

const documents = [
  ['settings/general', settings],
  ['counters/billing', counters],
  ...Array.from({ length: 12 }, (_, index) => [`tables/mesa-${index + 1}`, {
    name: `Mesa ${index + 1}`,
    zone: 'Salón',
    sortOrder: index + 1,
    active: true,
    status: 'available',
    currentOrderId: null,
    createdAt: now,
    updatedAt: now
  }])
];

const prefix = `projects/${projectId}/databases/(default)/documents`;
const body = {
  writes: documents.map(([path, data]) => ({
    update: { name: `${prefix}/${path}`, fields: encodeMap(data) }
  }))
};

const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, {
  method: 'POST',
  headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

if (!response.ok) throw new Error(`No se pudo sembrar Firestore (${response.status}): ${await response.text()}`);
const result = await response.json();
if (result.writeResults?.length !== documents.length) throw new Error('Firestore no confirmó todos los documentos.');
console.log(`Base inicial creada: ${result.writeResults.length} documentos, sin datos operativos ficticios.`);

function encodeMap(object) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, encodeValue(value)]));
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
