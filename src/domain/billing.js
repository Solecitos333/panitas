export const ORDER_STATUSES = Object.freeze([
  'pending', 'preparing', 'ready', 'served', 'pending_payment', 'closed', 'cancelled'
]);

export const ORDER_TRANSITIONS = Object.freeze({
  pending: ['preparing', 'cancelled'],
  preparing: ['pending', 'ready', 'cancelled'],
  ready: ['preparing', 'served', 'cancelled'],
  served: ['pending_payment', 'cancelled'],
  pending_payment: ['closed', 'cancelled'],
  closed: [],
  cancelled: []
});

export const DOCUMENT_TYPES = Object.freeze(['invoice', 'quote', 'proforma']);
export const PAYMENT_METHODS = Object.freeze(['cash', 'card', 'transfer', 'check', 'credit']);

export function toCents(value) {
  const amount = typeof value === 'string' ? Number(value.replace(/,/g, '').trim()) : Number(value);
  if (!Number.isFinite(amount)) throw new TypeError('El monto debe ser numérico.');
  return Math.round((amount + Number.EPSILON) * 100);
}
export function fromCents(value) {
  return Number(value || 0) / 100;
}

export function formatMoney(value, currency = 'DOP') {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency }).format(fromCents(value));
}

export function normalizeQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999) throw new RangeError('Cantidad inválida.');
  return Math.round(quantity * 1000) / 1000;
}

export function calculateLine(item) {
  const quantity = normalizeQuantity(item.quantity);
  const unitPriceCents = Number(item.unitPriceCents);
  const taxRate = Number(item.taxRate || 0);
  if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) throw new RangeError('Precio inválido.');
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new RangeError('Impuesto inválido.');
  const subtotalCents = Math.round(unitPriceCents * quantity);
  const taxCents = Math.round(subtotalCents * taxRate / 100);
  return { quantity, unitPriceCents, taxRate, subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

export function calculateDocument(items) {
  if (!Array.isArray(items) || items.length === 0) throw new RangeError('Agrega al menos un producto.');
  return items.reduce((totals, item) => {
    const line = calculateLine(item);
    totals.subtotalCents += line.subtotalCents;
    totals.taxCents += line.taxCents;
    totals.totalCents += line.totalCents;
    return totals;
  }, { subtotalCents: 0, taxCents: 0, totalCents: 0 });
}

export function paymentStatus(totalCents, paidCents) {
  if (paidCents <= 0) return 'pending';
  if (paidCents < totalCents) return 'partial';
  return 'paid';
}

export function canTransitionOrder(from, to) {
  return Boolean(ORDER_TRANSITIONS[from]?.includes(to));
}

export function nextOrderAction(status, role) {
  if (role === 'kitchen') return status === 'pending' ? 'preparing' : status === 'preparing' ? 'ready' : null;
  if (role === 'waiter') return status === 'ready' ? 'served' : status === 'served' ? 'pending_payment' : null;
  return null;
}

export function buildDocumentNumber(prefix, sequence) {
  const cleanPrefix = String(prefix || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
  if (!cleanPrefix) throw new Error('Prefijo de documento inválido.');
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('Secuencia inválida.');
  return `${cleanPrefix}${String(sequence).padStart(6, '0')}`;
}

export function buildNcf(type, sequence) {
  if (!type) return '';
  if (!/^B(01|02|14|15)$/.test(type)) throw new Error('Tipo NCF inválido.');
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 99999999) throw new Error('Secuencia NCF fuera de rango.');
  return `${type}${String(sequence).padStart(8, '0')}`;
}

export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
