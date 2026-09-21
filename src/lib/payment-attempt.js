import { createOperationId } from './id.js';
import { formatMoney } from './format.js';

// A consolidated collection is a sequence of individually atomic invoice payments.
// Retain its allocations and IDs until it finishes, including an uncertain response.
export function preparePaymentAttempt(previous, { entries, amountCents, payment, prefix = 'payment', tenderedCents }) {
  const fingerprint = JSON.stringify({ ids: entries.map(e => e.invoiceId), amountCents, payment, tenderedCents });
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new Error('Hay un cobro pendiente de confirmar. Reintenta sin cambiar las facturas, el monto ni el método.');
    return previous;
  }
  if (!entries.length || new Set(entries.map(e => e.invoiceId)).size !== entries.length) throw new Error('Selecciona facturas distintas para cobrar.');
  if (entries.some(e => !e.invoiceId || !Number.isSafeInteger(e.balanceCents) || e.balanceCents <= 0)) throw new Error('Actualiza las facturas antes de cobrar: hay un saldo inválido.');
  const balance = entries.reduce((sum, e) => sum + e.balanceCents, 0);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > balance) throw new Error('El monto debe ser mayor que cero y no superar el saldo seleccionado.');
  if (payment.method === 'cash' && (!Number.isSafeInteger(tenderedCents) || tenderedCents < amountCents)) throw new Error('El efectivo recibido es insuficiente.');
  let remaining = amountCents;
  const lines = [];
  for (const entry of entries) {
    if (!remaining) break;
    const appliedCents = Math.min(remaining, entry.balanceCents);
    remaining -= appliedCents;
    // Record the consolidated change once, not once per invoice.
    const change = lines.length === 0 && payment.method === 'cash' ? tenderedCents - amountCents : 0;
    lines.push({ ...entry, appliedCents, confirmed: false, payment: {
      ...payment, requestId: createOperationId(prefix), amountCents: appliedCents,
      tenderedCents: payment.method === 'cash' ? appliedCents + change : 0
    } });
  }
  return { fingerprint, amountCents, lines, running: false };
}

export async function executePaymentAttempt(attempt, recordPayment) {
  if (attempt.running) throw new Error('Este cobro ya se está procesando.');
  attempt.running = true;
  try {
    for (const line of attempt.lines) {
      if (line.confirmed) continue;
      await recordPayment(line.invoiceId, line.payment);
      line.confirmed = true;
    }
    return attempt.lines;
  } catch (cause) {
    const confirmedCents = attempt.lines.filter(l => l.confirmed).reduce((sum, l) => sum + l.appliedCents, 0);
    const error = new Error(`Cobro sin completar. Confirmado: ${formatMoney(confirmedCents)}. Reintenta con los mismos datos para confirmar lo pendiente sin duplicarlo. ${cause.message || ''}`);
    error.confirmedCents = confirmedCents;
    throw error;
  } finally {
    attempt.running = false;
  }
}
