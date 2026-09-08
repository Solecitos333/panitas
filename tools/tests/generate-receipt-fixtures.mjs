// Local, synthetic integration fixtures. Never calls services, Firebase or hardware.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildInvoicePlainText, buildPrebillPlainText,
  buildKitchenPlainText, buildCashReportPlainText,
} from '../../src/lib/hardware.js';

const root = fileURLToPath(new URL('../../test-results/receipt-review/', import.meta.url));
const output = resolve(process.argv[2] || root);
const relativeOutput = relative(root, output);
if (relativeOutput.startsWith('..') || isAbsolute(relativeOutput)) {
  throw new Error('Generated evidence must stay inside test-results/receipt-review');
}
await mkdir(output, { recursive: true });
const date = '2026-09-06T14:30:00Z';
const settings = {
  name: 'Los Panitas by Nechy', phone: '000-000-0000',
  address: 'Dirección sintética para probar el formato, sin datos comerciales',
  receiptFooter: 'PRUEBA DE RENDER · NO ES UNA VENTA',
};
const invoice = {
  id: 'render-test-invoice', invoiceNumber: 'RENDER-001', documentType: 'invoice',
  createdAt: date, clientName: 'CLIENTE SINTÉTICO DE MAQUETACIÓN',
  items: [{ quantity: 1, name: 'Hamburguesa clásica con queso', unitPriceCents: 35000 }],
  subtotalCents: 35000, totalCents: 35000, paidCents: 35000,
};
const payment = {
  invoiceId: invoice.id, cashSessionId: 'render-test-session', method: 'cash',
  amountCents: 35000, tenderedCents: 50000, changeCents: 15000,
};
const longInvoice = {
  ...invoice, invoiceNumber: 'RENDER-LONG-001',
  clientName: 'Cliente de prueba con nombre completo especialmente largo para verificar ajuste sin pérdida de información',
  items: Array.from({ length: 18 }, (_, index) => ({
    quantity: index % 3 + 1,
    name: `Producto de prueba ${index + 1}: hamburguesa especial con vegetales adicionales, queso y papas fritas`,
    unitPriceCents: 123456,
  })),
  subtotalCents: 4444416, totalCents: 4444416, paidCents: 4444416,
};
const order = { ...invoice, tableName: 'Mesa de prueba', priority: 'high', notes: 'Sin cebolla. Solo prueba de maquetación.' };
const session = {
  id: 'render-test-session', status: 'closed', openedAt: date, closedAt: date,
  openedByName: 'CAJERO SINTÉTICO', openingCents: 10000, closingCents: 45000,
  expectedCents: 45000, varianceCents: 0,
};
const fixtures = {
  'generated-invoice': buildInvoicePlainText(invoice, settings, [payment]),
  'generated-invoice-long': buildInvoicePlainText(longInvoice, settings),
  'generated-prebill': buildPrebillPlainText(order, settings),
  'generated-kitchen': buildKitchenPlainText(order, settings),
  'generated-cash-close': buildCashReportPlainText(session, [payment], settings),
};
await Promise.all(Object.entries(fixtures).map(([name, content]) => writeFile(resolve(output, `${name}.txt`), content, 'utf8')));
console.log(`Generated ${Object.keys(fixtures).length} synthetic fixtures from production builders`);
