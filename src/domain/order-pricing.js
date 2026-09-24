import { calculateDocument } from './billing.js';

// Older orders store the combined discount, including discounts on each line.
// Only the remaining global discount may be applied a second time at checkout.
export function orderPricing(order = {}) {
  const lineDiscount = calculateDocument(order.items || []).discountCents;
  return {
    discount: order.discount ?? Math.max(0, Number(order.discountCents || 0) - lineDiscount) / 100,
    discountType: order.discountType || 'amount',
    includeLegalTip: order.includeLegalTip === true,
    tipCents: Number(order.tipCents || 0)
  };
}

export function assertOrderRevision(order, input) {
  if (!input.replaceItems) return;
  if (input.expectedOrderId !== order.id || !Number.isInteger(input.expectedRevision)
    || input.expectedRevision !== order.revision) {
    throw new Error('La comanda cambió. Actualiza y vuelve a cargar la mesa antes de reemplazar sus productos.');
  }
}

// Preserve legacy fixed tips; turning off a calculated tip must not freeze its
// last amount as a new fixed tip. Empty/zero form values are intentional edits.
export function editedOrderPricing(previous = {}, edits = {}) {
  return {
    discount: edits.discount ?? previous.discount ?? 0,
    discountType: edits.discountType ?? previous.discountType ?? 'amount',
    includeLegalTip: edits.includeLegalTip ?? previous.includeLegalTip ?? false,
    tipCents: previous.includeLegalTip ? 0 : Number(previous.tipCents || 0)
  };
}
