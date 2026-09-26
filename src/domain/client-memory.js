import { matchesFuzzy } from '../lib/fuzzy-search.js';
import { formatMoney } from './billing.js';
import { businessDateKey } from '../lib/business-time.js';

// Never merge two registered people merely because they share a display name.
export function getClientIdentityKey(client = {}) {
  const id = String(client.clientId || client.id || '').trim();
  if (id) return `id:${id}`;
  const name = String(client.clientName || client.deliveryClientName || client.name || '').trim().toLowerCase();
  return `name:${name}`;
}

export function invoiceBelongsToClient(invoice = {}, client = {}) {
  return getClientIdentityKey({ clientId: invoice.clientId, name: invoice.clientName || invoice.deliveryClientName }) === getClientIdentityKey(client);
}

export function getReceivableAgeDays(value, now = new Date()) {
  const date = businessDateKey(value), today = businessDateKey(now);
  if (!date || !today) return 0;
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000));
}

export function isFiaoPayment(payment, invoice) {
  if (isDeliveryInvoice(invoice) || String(payment.requestId || '').startsWith('delivery-settle')) return false;
  return Boolean(invoice?.paymentMethod === 'credit' || invoice?.paymentMethod === 'fiao'
    || String(invoice?.notes || '').toLowerCase().includes('fiao')
    || String(payment.reference || '').toLowerCase().includes('fiao')
    || String(payment.requestId || '').startsWith('fiao-')
    || ['fiao', 'credit'].includes(payment.concept));
}

/**
 * Determina si una factura corresponde a un pedido de delivery (contra entrega o en ruta)
 * vs un fiao en el local (crédito personal).
 * @param {object} inv Factura a evaluar
 * @returns {boolean} True si es una orden despachada por delivery
 */
export function isDeliveryInvoice(inv) {
  if (!inv) return false;
  return Boolean(
    inv.deliveryDriverId ||
    inv.deliveryDriverName ||
    inv.paymentMethod === 'delivery_cod' ||
    inv.deliveryStatus ||
    inv.deliveryAddress ||
    inv.posDestination === 'delivery'
  );
}

/**
 * Motor de Memoria Activa: Unifica el directorio de clientes registrados (state.clients)
 * con todos los clientes y pedidos históricos de facturas (state.invoices).
 * Esto permite autocompletar clientes inmediatamente sin requerir altas manuales previas,
 * recordando sus teléfonos, direcciones habituales de entrega y alertando en tiempo real
 * si tienen deudas pendientes en fiao o delivery.
 * 
 * @param {object} state Estado global de la aplicación
 * @returns {Array<object>} Lista unificada de perfiles de clientes en memoria activa
 */
export function createClientMemorySelector() {
  let clients, invoices, result;
  return (state = {}) => {
    // Both services publish a new array when a collection changes. Never cache
    // across users or reuse balances after a payment, cancellation or client edit.
    if (!result || clients !== state.clients || invoices !== state.invoices) {
      result = getClientMemory(state);
      clients = state.clients;
      invoices = state.invoices;
    }
    return result;
  };
}

export function getClientMemory(state = {}) {
  const clients = state.clients || [];
  const invoices = state.invoices || [];
  const clientMap = new Map();

  // 1. Sembrar con los clientes registrados formalmente en la base de datos
  for (const c of clients) {
    const rawName = String(c.name || '').trim();
    if (!rawName || rawName.toLowerCase() === 'consumidor final') continue;
    const key = getClientIdentityKey(c);

    clientMap.set(key, {
      id: c.id || '',
      name: rawName,
      phone: c.phone || '',
      address: c.address || '',
      notes: c.notes || '',
      creditLimitCents: Math.max(0, Number(c.creditLimitCents || 0)),
      rnc: c.rnc || '',
      totalDebtCents: 0,
      fiaoDebtCents: 0,
      deliveryDebtCents: 0,
      pendingFiaoCount: 0,
      pendingDeliveryCount: 0,
      totalOrdersCount: 0,
      pendingInvoices: [],
      lastSeenDate: c.updatedAt?.toDate ? c.updatedAt.toDate() : (c.createdAt?.toDate ? c.createdAt.toDate() : (c.createdAt ? new Date(c.createdAt) : null)),
      isRegisteredClient: true,
      active: c.active !== false
    });
  }

  // 2. Procesar el historial de facturas (orden cronológico ascendente para que los datos más recientes sobrescriban)
  const sortedInvoices = invoices.map((invoice) => ({ invoice,
    date: invoice.createdAt?.toDate ? invoice.createdAt.toDate() : new Date(invoice.createdAt || 0)
  })).sort((a, b) => a.date - b.date);

  for (const { invoice: inv, date: invDate } of sortedInvoices) {
    const rawName = String(inv.clientName || inv.deliveryClientName || '').trim();
    if (!rawName || rawName.toLowerCase() === 'consumidor final') continue;
    const key = getClientIdentityKey({ clientId: inv.clientId, name: rawName });

    if (!clientMap.has(key)) {
      clientMap.set(key, {
        id: inv.clientId || '',
        name: rawName,
        phone: inv.clientPhone || inv.deliveryPhone || '',
        address: inv.deliveryAddress || inv.clientAddress || '',
        notes: inv.deliveryNotes || inv.notes || '',
        creditLimitCents: 0,
        rnc: inv.clientRnc || '',
        totalDebtCents: 0,
        fiaoDebtCents: 0,
        deliveryDebtCents: 0,
        pendingFiaoCount: 0,
        pendingDeliveryCount: 0,
        totalOrdersCount: 0,
        pendingInvoices: [],
        lastSeenDate: null,
        isRegisteredClient: false,
        active: true
      });
    }

    const entry = clientMap.get(key);
    entry.totalOrdersCount += 1;

    // Actualizar datos de contacto si la factura aporta información más reciente
    const invPhone = inv.clientPhone || inv.deliveryPhone || '';
    const invAddress = inv.deliveryAddress || inv.clientAddress || '';
    const invNotes = inv.deliveryNotes || inv.notes || '';
    if (invPhone) entry.phone = invPhone;
    if (invAddress) entry.address = invAddress;
    if (invNotes && !entry.notes) entry.notes = invNotes;
    if (inv.clientId && !entry.id) entry.id = inv.clientId;
    if (inv.clientRnc && !entry.rnc) entry.rnc = inv.clientRnc;

    if (!entry.lastSeenDate || invDate > entry.lastSeenDate) {
      entry.lastSeenDate = invDate;
    }

    // Evaluar deudas activas
    if (inv.documentType === 'invoice' && inv.status !== 'paid' && inv.status !== 'cancelled') {
      const balance = Number(inv.totalCents || 0) - Number(inv.paidCents || 0);
      if (balance > 0) {
        entry.totalDebtCents += balance;
        if (isDeliveryInvoice(inv)) {
          entry.deliveryDebtCents += balance;
          entry.pendingDeliveryCount += 1;
        } else {
          entry.fiaoDebtCents += balance;
          entry.pendingFiaoCount += 1;
        }
        entry.pendingInvoices.push({
          ...inv,
          balanceCents: balance,
          isDelivery: isDeliveryInvoice(inv)
        });
      }
    }
  }

  // Convertir a lista y ordenar por actividad reciente o deuda
  const list = Array.from(clientMap.values());
  list.sort((a, b) => {
    // Clientes con deuda pendiente primero
    if (b.totalDebtCents !== a.totalDebtCents) return b.totalDebtCents - a.totalDebtCents;
    // Luego por actividad más reciente
    const da = a.lastSeenDate ? a.lastSeenDate.getTime() : 0;
    const db = b.lastSeenDate ? b.lastSeenDate.getTime() : 0;
    return db - da;
  });

  return list;
}

/**
 * Busca clientes sugeridos en el motor de memoria activa.
 * Aplica coincidencia por prefijo prioritario y búsqueda difusa para nombres, teléfonos y direcciones.
 * 
 * @param {Array<object>} memoryList Lista obtenida de getClientMemory()
 * @param {string} query Texto tecleado por el usuario
 * @param {number} maxResults Cantidad máxima de sugerencias a devolver (por defecto 8)
 * @returns {Array<object>} Lista de clientes coincidentes ordenados por relevancia
 */
export function searchClientMemory(memoryList = [], query = '', maxResults = 8) {
  const cleanQ = String(query || '').trim();
  if (!cleanQ) return [];

  const lowerQ = cleanQ.toLowerCase();
  const scored = [];

  for (const client of memoryList) {
    const nameLower = client.name.toLowerCase();
    const phoneLower = (client.phone || '').toLowerCase();
    const addressLower = (client.address || '').toLowerCase();
    const cleanPhone = phoneLower.replace(/\D/g, '');
    const cleanQueryDigits = lowerQ.replace(/\D/g, '');

    let score = 0;

    // 1. Coincidencia exacta de nombre
    if (nameLower === lowerQ) {
      score = 100;
    }
    // 2. Prefijo exacto en el nombre (ej. "Rub" para "Rubio")
    else if (nameLower.startsWith(lowerQ)) {
      score = 80;
    }
    // 3. Prefijo en alguna palabra del nombre (ej. "Ap" en "Rubio Ap")
    else if (nameLower.split(/\s+/).some(w => w.startsWith(lowerQ))) {
      score = 70;
    }
    // 4. Coincidencia en teléfono numérico
    else if (cleanQueryDigits && cleanQueryDigits.length >= 3 && cleanPhone.includes(cleanQueryDigits)) {
      score = 65;
    }
    // 5. Nombre contiene la subcadena
    else if (nameLower.includes(lowerQ)) {
      score = 60;
    }
    // 6. Dirección contiene la subcadena
    else if (addressLower.includes(lowerQ)) {
      score = 45;
    }
    // 7. Búsqueda difusa multi-campo
    else {
      const searchBlob = `${client.name} ${client.phone} ${client.address} ${client.notes}`;
      if (matchesFuzzy(lowerQ, searchBlob)) {
        score = 30;
      }
    }

    if (score > 0) {
      // Clientes con deudas reciben un ligero realce para prevenir ventas inadvertidas sin cobrar
      const debtBonus = client.totalDebtCents > 0 ? 5 : 0;
      scored.push({ client, score: score + debtBonus });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map(s => s.client);
}

/**
 * Calcula las métricas financieras globales de Cuentas por Cobrar desglosadas por canal.
 * 
 * @param {Array<object>} invoices Lista de facturas
 * @param {Array<object>} payments Lista de pagos
 * @param {Array<object>} clients Lista de clientes
 * @returns {object} Métricas diferenciadas entre Fiaos en Local y Pedidos por Delivery
 */
export function getReceivablesMetrics(invoices = [], payments = [], clients = []) {
  const pendingInvoices = (invoices || []).filter(
    (inv) => inv.documentType === 'invoice' &&
      inv.status !== 'paid' &&
      inv.status !== 'cancelled' &&
      (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)) > 0
  );

  const fiaoInvoices = pendingInvoices.filter(inv => !isDeliveryInvoice(inv));
  const deliveryInvoices = pendingInvoices.filter(inv => isDeliveryInvoice(inv));

  const totalFiaoPendingCents = fiaoInvoices.reduce((sum, inv) => sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)), 0);
  const totalDeliveryPendingCents = deliveryInvoices.reduce((sum, inv) => sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)), 0);
  const totalPendingCents = totalFiaoPendingCents + totalDeliveryPendingCents;

  const fiaoClientsSet = new Set();
  for (const inv of fiaoInvoices) {
    fiaoClientsSet.add(getClientIdentityKey({ clientId: inv.clientId, name: inv.clientName || 'Cliente' }));
  }

  const deliveryClientsSet = new Set();
  for (const inv of deliveryInvoices) {
    deliveryClientsSet.add(getClientIdentityKey({ clientId: inv.clientId, name: inv.clientName || inv.deliveryClientName || 'Cliente' }));
  }

  const allClientsSet = new Set([...fiaoClientsSet, ...deliveryClientsSet]);

  const today = businessDateKey();
  const isToday = (d) => businessDateKey(d) === today;

  const invoiceMap = new Map();
  for (const inv of invoices) {
    invoiceMap.set(inv.id, inv);
  }

  const fiaoPayments = (payments || []).filter(p => isFiaoPayment(p, invoiceMap.get(p.invoiceId)));

  const fiaoPaymentsToday = fiaoPayments.filter(p => isToday(p.createdAt));
  const todayCollectedCents = fiaoPaymentsToday.reduce((sum, p) => sum + Number(p.amountCents || 0), 0);

  // Deuda en mora (+15 días)
  const overdueDebtCents = pendingInvoices.reduce((sum, inv) => {
    const ageDays = getReceivableAgeDays(inv.createdAt);
    return ageDays >= 15 ? sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)) : sum;
  }, 0);

  return {
    totalPendingCents,
    totalFiaoPendingCents,
    totalDeliveryPendingCents,
    allPendingCount: pendingInvoices.length,
    fiaoInvoicesCount: fiaoInvoices.length,
    deliveryInvoicesCount: deliveryInvoices.length,
    allClientsCount: allClientsSet.size,
    fiaoClientsCount: fiaoClientsSet.size,
    deliveryClientsCount: deliveryClientsSet.size,
    todayCollectedCents,
    todayCollectedCount: fiaoPaymentsToday.length,
    overdueDebtCents
  };
}

/**
 * Normaliza un número telefónico dominicano o internacional para enlaces de WhatsApp.
 * @param {string} phone Número de teléfono
 * @returns {string} Dígitos listos para https://wa.me/
 */
export function cleanPhoneForWa(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && (digits.startsWith('809') || digits.startsWith('829') || digits.startsWith('849'))) {
    return `1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits;
  }
  return digits;
}

/**
 * Formatea una fecha a una expresión legible relativa (Hoy, Ayer, Hace X días, etc.)
 * @param {Date|string|object} dateVal Fecha a evaluar
 * @returns {string} Texto relativo amigable
 */
export function formatRelativeDate(dateVal) {
  if (!dateVal) return 'Sin pedidos';
  const d = dateVal?.toDate ? dateVal.toDate() : (dateVal instanceof Date ? dateVal : new Date(dateVal));
  if (isNaN(d.getTime()) || d.getTime() === 0) return 'Sin pedidos';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 30) return `Hace ${diffDays} días`;
  const months = Math.floor(diffDays / 30);
  return `Hace ${months} mes${months > 1 ? 'es' : ''}`;
}

/**
 * Construye la URL directa de WhatsApp con un mensaje personalizado según el saldo del cliente.
 * @param {object} client Perfil del cliente
 * @param {object} settings Configuración del negocio
 * @returns {string} Enlace https://wa.me/... o cadena vacía si no tiene teléfono
 */
export function buildClientWhatsAppUrl(client, settings = {}) {
  const cleanPhone = cleanPhoneForWa(client.phone);
  if (!cleanPhone) return '';
  const businessName = settings.businessName || 'Los Panitas by Nechy';
  
  let msg = '';
  if (client.totalDebtCents > 0) {
    const debtStr = formatMoney(client.totalDebtCents);
    let breakdown = '';
    if (client.fiaoDebtCents > 0 && client.deliveryDebtCents > 0) {
      breakdown = ` (Fiao: ${formatMoney(client.fiaoDebtCents)} · Delivery: ${formatMoney(client.deliveryDebtCents)})`;
    }
    msg = `Hola ${client.name}, le saludamos cordialmente de ${businessName}. Le recordamos amablemente que presenta un balance pendiente de ${debtStr}${breakdown}. Quedamos a su orden para coordinar su pago o nuevo pedido. ¡Muchas gracias!`;
  } else {
    msg = `Hola ${client.name}, le saludamos con mucho gusto de ${businessName}. ¿En qué podemos servirle hoy? Con placer tomamos su orden.`;
  }
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
}
