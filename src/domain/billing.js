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

  const baseSubtotalCents = Math.round(unitPriceCents * quantity);

  // Descuento por línea si existe
  let discountCents = 0;
  if (item.discountCents != null && item.discountCents > 0) {
    discountCents = Math.min(baseSubtotalCents, Math.round(Number(item.discountCents)));
  } else if (item.discountPercent != null && item.discountPercent > 0) {
    const pct = Math.min(100, Math.max(0, Number(item.discountPercent)));
    discountCents = Math.round(baseSubtotalCents * pct / 100);
  }

  const subtotalCents = Math.max(0, baseSubtotalCents - discountCents);
  const taxCents = Math.round(subtotalCents * taxRate / 100);
  return {
    quantity,
    unitPriceCents,
    taxRate,
    baseSubtotalCents,
    discountCents,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents
  };
}

export function calculateDocument(items, options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      subtotalCents: 0,
      discountCents: 0,
      taxableSubtotalCents: 0,
      taxCents: 0,
      tipCents: 0,
      totalCents: 0
    };
  }

  const lineResults = items.map(calculateLine);
  const rawSubtotalCents = lineResults.reduce((sum, l) => sum + l.baseSubtotalCents, 0);
  const lineDiscountsCents = lineResults.reduce((sum, l) => sum + l.discountCents, 0);

  // Descuento global sobre el documento
  let globalDiscountCents = 0;
  if (options.discount != null && options.discount > 0) {
    if (options.discountType === 'percent') {
      const pct = Math.min(100, Math.max(0, Number(options.discount)));
      globalDiscountCents = Math.round((rawSubtotalCents - lineDiscountsCents) * pct / 100);
    } else {
      // Monto fijo en pesos o centavos
      const discountVal = Number(options.discount);
      const isCents = options.discountInCents === true;
      const amountInCents = isCents ? discountVal : Math.round(discountVal * 100);
      globalDiscountCents = Math.min(rawSubtotalCents - lineDiscountsCents, Math.max(0, amountInCents));
    }
  }

  const totalDiscountCents = lineDiscountsCents + globalDiscountCents;
  const taxableSubtotalCents = Math.max(0, rawSubtotalCents - totalDiscountCents);

  // Cálculo de ITBIS proporcional considerando el descuento global si aplica
  let taxCents = 0;
  if (globalDiscountCents > 0 && rawSubtotalCents > 0) {
    const discountRatio = Math.max(0, 1 - (totalDiscountCents / rawSubtotalCents));
    taxCents = lineResults.reduce((sum, l) => {
      const lineTaxable = Math.round(l.baseSubtotalCents * discountRatio);
      return sum + Math.round(lineTaxable * l.taxRate / 100);
    }, 0);
  } else {
    taxCents = lineResults.reduce((sum, l) => sum + l.taxCents, 0);
  }

  // Propina Legal del 10% (Ley 80-92 de República Dominicana)
  let tipCents = 0;
  if (options.includeLegalTip === true) {
    const tipRate = Number(options.legalTipRate || 10);
    tipCents = Math.round(taxableSubtotalCents * tipRate / 100);
  } else if (options.tipCents != null && options.tipCents > 0) {
    tipCents = Math.round(Number(options.tipCents));
  }

  const totalCents = taxableSubtotalCents + taxCents + tipCents;

  return {
    subtotalCents: rawSubtotalCents,
    discountCents: totalDiscountCents,
    taxableSubtotalCents,
    taxCents,
    tipCents,
    totalCents
  };
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

/**
 * Valida formato y dígito verificador de RNC (9 dígitos) o Cédula Dominicana (11 dígitos)
 */
export function validateRncOrCedula(value) {
  const clean = String(value || '').replace(/\D/g, '');
  if (clean.length === 9) {
    // RNC: 9 dígitos
    const weights = [7, 9, 8, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      sum += parseInt(clean[i], 10) * weights[i];
    }
    const remainder = sum % 11;
    let expectedDigit = 0;
    if (remainder === 0) expectedDigit = 2;
    else if (remainder === 1) expectedDigit = 1;
    else expectedDigit = 11 - remainder;

    const isValid = parseInt(clean[8], 10) === expectedDigit;
    return { valid: isValid, type: 'rnc', clean, formatted: `${clean.slice(0,1)}-${clean.slice(1,3)}-${clean.slice(3,8)}-${clean.slice(8)}` };
  } else if (clean.length === 11) {
    // Cédula: 11 dígitos
    const weights = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      let prod = parseInt(clean[i], 10) * weights[i];
      if (prod >= 10) prod = Math.floor(prod / 10) + (prod % 10);
      sum += prod;
    }
    const expectedDigit = (10 - (sum % 10)) % 10;
    const isValid = parseInt(clean[10], 10) === expectedDigit;
    return { valid: isValid, type: 'cedula', clean, formatted: `${clean.slice(0,3)}-${clean.slice(3,10)}-${clean.slice(10)}` };
  }
  return { valid: false, type: 'unknown', clean: '', formatted: '' };
}

export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
