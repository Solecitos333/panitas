import { documentItems } from './document-items.js';

const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])])
  );
  return value;
};

// Compare immutable sale details plus the INITIAL payment, not today's balance.
// Works with already-issued invoices without a data migration or extra secrets.
export function matchesSaleIntent(invoice, initialPayment, input, totals, actorUid) {
  if (invoice.createdBy !== actorUid || invoice.requestId !== input.requestId) return false;
  if (JSON.stringify(canonical(invoice.items)) !== JSON.stringify(canonical(documentItems(input.items)))) return false;
  if (Object.keys(totals).some(key => Number(invoice[key] || 0) !== totals[key])) return false;
  const type = input.documentType || 'invoice';
  const method = input.payment?.method || 'cash';
  const fields = {
    documentType: type, clientId: input.clientId || '', clientName: String(input.clientName || 'Consumidor final').slice(0, 160),
    clientRnc: String(input.clientRnc || '').slice(0, 30), clientPhone: String(input.clientPhone || '').slice(0, 30),
    clientAddress: String(input.clientAddress || '').slice(0, 300), notes: String(input.notes || '').slice(0, 500),
    orderId: input.orderId || '', tableId: input.tableId || '', paymentMethod: method,
    ncfType: type === 'invoice' ? input.ncfType || '' : '',
    deliveryDriverId: String(input.deliveryDriverId || '').slice(0, 60),
    deliveryDriverName: String(input.deliveryDriverName || '').slice(0, 160),
    deliveryAddress: String(input.deliveryAddress || input.clientAddress || '').slice(0, 300),
    deliveryPhone: String(input.deliveryPhone || input.clientPhone || '').slice(0, 30),
    deliveryNotes: String(input.deliveryNotes || '').slice(0, 300)
  };
  if (Object.entries(fields).some(([key, value]) => (invoice[key] || '') !== value)) return false;
  if (Number(invoice.deliveryChangeForCents || 0) !== Number(input.deliveryChangeForCents || 0)) return false;
  const amount = type === 'invoice' ? Math.max(0, Math.min(Number(input.payment?.amountCents || 0), totals.totalCents)) : 0;
  if (!amount) return !initialPayment;
  const tendered = method === 'cash' ? Number(input.payment?.tenderedCents || amount) : 0;
  return !!initialPayment && initialPayment.amountCents === amount && initialPayment.method === method
    && initialPayment.cashSessionId === input.payment?.cashSessionId
    && (initialPayment.reference || '') === String(input.payment?.reference || '').slice(0, 120)
    && initialPayment.tenderedCents === tendered;
}

export function isStockLine(line) {
  return Boolean(line.productId && !line.isDeliveryFee && line.productId !== 'prod-costo-de-envio-delivery');
}
