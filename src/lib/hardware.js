/**
 * Controlador de Hardware POS y Comandos ESC/POS para Terminales ELO / Android
 * Soporta RawBT (WebSocket / Intent), WebUSB y Fallback al diálogo de impresión 80mm.
 */

import { formatDate, formatMoney } from './format.js';
import { createOperationId } from './id.js';

function callEloNativeAsync(method, args = [], timeoutMs = 20000) {
  if (typeof window === 'undefined' || typeof window.EloPOS?.[method] !== 'function') return Promise.resolve(null);
  const requestId = createOperationId('hardware');
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener('elo-hardware-result', onResult);
      resolve(value);
    };
    const onResult = (event) => {
      if (event.detail?.requestId === requestId) finish(event.detail);
    };
    const timer = setTimeout(() => finish({ success:false, error:'NATIVE_TIMEOUT' }), timeoutMs);
    window.addEventListener('elo-hardware-result', onResult);
    try {
      window.EloPOS[method](requestId, ...args);
    } catch (error) {
      finish({ success:false, error:error?.message || 'NATIVE_BRIDGE_FAILED' });
    }
  });
}

// Ancho estándar en caracteres para impresoras térmicas de 80 mm (Font A - 12x24)
export const TICKET_WIDTH = 48;

export function resolveReceiptQrUrl(settings = {}) {
  const menuUrl = String(settings.menuUrl || '').trim();
  if (menuUrl) return menuUrl;
  const whatsapp = String(settings.whatsapp || '').replace(/\D/g, '');
  if (whatsapp) return `https://wa.me/${whatsapp}`;
  return 'https://los-panitas-by-nechy.web.app';
}

// Comandos ESC/POS estándar
export const ESC_POS = {
  INIT: [0x1B, 0x40],                     // ESC @ - Inicializar impresora
  ALIGN_LEFT: [0x1B, 0x61, 0x00],         // ESC a 0 - Alinear izquierda
  ALIGN_CENTER: [0x1B, 0x61, 0x01],       // ESC a 1 - Alinear centro
  ALIGN_RIGHT: [0x1B, 0x61, 0x02],        // ESC a 2 - Alinear derecha
  BOLD_ON: [0x1B, 0x45, 0x01],            // ESC E 1 - Negrita activada
  BOLD_OFF: [0x1B, 0x45, 0x00],           // ESC E 0 - Negrita desactivada
  DOUBLE_HEIGHT_ON: [0x1B, 0x21, 0x10],   // ESC ! 16 - Doble altura
  DOUBLE_SIZE_ON: [0x1B, 0x21, 0x30],     // ESC ! 48 - Doble ancho y alto
  NORMAL_SIZE: [0x1B, 0x21, 0x00],        // ESC ! 0 - Tamaño normal
  DRAWER_KICK_PIN2: [0x1B, 0x70, 0x00, 0x19, 0xFA], // ESC p 0 25 250 - Pulso pin 2 (50ms on / 500ms off)
  DRAWER_KICK_PIN5: [0x1B, 0x70, 0x01, 0x19, 0xFA], // ESC p 1 25 250 - Pulso pin 5
  FEED_LINES_3: [0x1B, 0x64, 0x03],       // ESC d 3 - Avanzar 3 líneas
  FEED_LINES_5: [0x1B, 0x64, 0x05],       // ESC d 5 - Avanzar 5 líneas
  PAPER_CUT_FULL: [0x1D, 0x56, 0x41, 0x00], // GS V A 0 - Corte total con avance
  PAPER_CUT_PARTIAL: [0x1D, 0x56, 0x42, 0x00] // GS V B 0 - Corte parcial
};

/**
 * Clase para construir flujos de bytes ESC/POS
 */
export class EscPosBuilder {
  constructor() {
    this.buffer = [];
    this.init();
  }

  init() {
    this.raw(ESC_POS.INIT);
    return this;
  }

  raw(bytes) {
    if (Array.isArray(bytes)) {
      this.buffer.push(...bytes);
    } else if (bytes instanceof Uint8Array) {
      this.buffer.push(...Array.from(bytes));
    }
    return this;
  }

  align(alignment) {
    if (alignment === 'center') this.raw(ESC_POS.ALIGN_CENTER);
    else if (alignment === 'right') this.raw(ESC_POS.ALIGN_RIGHT);
    else this.raw(ESC_POS.ALIGN_LEFT);
    return this;
  }

  bold(enable = true) {
    this.raw(enable ? ESC_POS.BOLD_ON : ESC_POS.BOLD_OFF);
    return this;
  }

  size(mode = 'normal') {
    if (mode === 'double') this.raw(ESC_POS.DOUBLE_SIZE_ON);
    else if (mode === 'double-height') this.raw(ESC_POS.DOUBLE_HEIGHT_ON);
    else this.raw(ESC_POS.NORMAL_SIZE);
    return this;
  }

  text(str) {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(str);
    this.raw(encoded);
    return this;
  }

  line(str = '') {
    this.text(str + '\n');
    return this;
  }

  separator(char = '-') {
    this.line(char.repeat(TICKET_WIDTH));
    return this;
  }

  doubleSeparator() {
    this.separator('=');
    return this;
  }

  /**
   * Imprime dos columnas: izquierda y derecha justificadas (ej. Descripción y Monto)
   */
  row(left, right) {
    const l = String(left || '');
    const r = String(right || '');
    const spaces = Math.max(1, TICKET_WIDTH - l.length - r.length);
    this.line(l + ' '.repeat(spaces) + r);
    return this;
  }

  /**
   * Imprime cuatro columnas: Cant, Descripción, Precio Unitario, Total
   */
  itemRow(qty, name, price, total) {
    const q = String(qty).padEnd(4, ' ');
    const t = String(total).padStart(10, ' ');
    const p = String(price).padStart(10, ' ');
    const nameMax = TICKET_WIDTH - q.length - t.length - p.length - 2;
    const n = String(name || '').slice(0, Math.max(10, nameMax)).padEnd(nameMax, ' ');
    this.line(`${q} ${n} ${p} ${t}`);
    return this;
  }

  feed(lines = 3) {
    if (lines === 5) this.raw(ESC_POS.FEED_LINES_5);
    else this.raw(ESC_POS.FEED_LINES_3);
    return this;
  }

  cut() {
    this.feed(3);
    this.raw(ESC_POS.PAPER_CUT_FULL);
    return this;
  }

  kickDrawer() {
    this.raw(ESC_POS.DRAWER_KICK_PIN2);
    return this;
  }

  getBytes() {
    return new Uint8Array(this.buffer);
  }

  getBase64() {
    const bytes = this.getBytes();
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

/**
 * Construye el ticket ESC/POS para una Factura / Venta
 */
export function buildInvoiceEscPos(invoice, settings = {}, payments = [], changeInfo = null) {
  const b = new EscPosBuilder();
  const balance = Number(invoice.totalCents) - Number(invoice.paidCents || 0);
  const relatedPayments = payments.filter((item) => item.invoiceId === invoice.id || !item.invoiceId);
  const cashPayment = relatedPayments.find((item) => item.method === 'cash' && Number(item.tenderedCents || 0) > 0);
  const resolvedChangeInfo = changeInfo || (cashPayment ? {
    receivedCents: Number(cashPayment.tenderedCents),
    changeCents: Number(cashPayment.changeCents || 0)
  } : null);

  // Encabezado
  b.align('center').bold(true).size('double-height');
  b.line(settings.name || 'Los Panitas by Nechy');
  b.bold(false).size('normal');

  if (settings.legalName && settings.legalName !== settings.name) {
    b.line(settings.legalName);
  }
  if (settings.rnc && settings.rnc !== 'N/D') {
    b.line(`RNC: ${settings.rnc}`);
  }
  if (settings.address) {
    b.line(settings.address);
  }
  if (settings.phone) {
    b.line(`Tel: ${settings.phone}`);
  }

  b.doubleSeparator();

  // Datos del documento
  b.align('left');
  const docTypeLabel = ({ invoice: 'FACTURA', quote: 'COTIZACIÓN', proforma: 'PROFORMA' })[invoice.documentType] || 'DOCUMENTO';
  b.row(`${docTypeLabel}: ${invoice.invoiceNumber}`, formatDate(invoice.createdAt, true));
  if (invoice.ncf) {
    b.bold(true).line(`NCF: ${invoice.ncf}`).bold(false);
  }
  b.line(`Cliente: ${invoice.clientName || 'Consumidor final'}`);
  if (invoice.clientRnc) {
    b.line(`RNC/Cédula: ${invoice.clientRnc}`);
  }

  b.separator('-');

  // Detalle de productos
  b.align('left');
  b.row('CANT DESCRIPCION', 'PRECIO     TOTAL');
  b.separator('-');

  for (const item of invoice.items || []) {
    const qty = `${item.quantity}x`;
    const price = formatMoney(item.unitPriceCents);
    const lineTotal = formatMoney(item.unitPriceCents * item.quantity);
    b.itemRow(qty, item.name, price, lineTotal);
    if (item.notes) {
      b.line(`   * ${item.notes}`);
    }
  }

  b.separator('-');

  // Totales
  b.align('right');
  b.row('SUBTOTAL:', formatMoney(invoice.subtotalCents));
  if (Number(invoice.discountCents) > 0) {
    b.row('DESCUENTO:', `-${formatMoney(invoice.discountCents)}`);
  }
  if (Number(invoice.taxCents) > 0) {
    b.row('ITBIS (18%):', formatMoney(invoice.taxCents));
  }
  if (Number(invoice.tipCents) > 0) {
    b.row('PROPINA LEY (10%):', formatMoney(invoice.tipCents));
  }
  b.bold(true).size('double-height');
  b.row('TOTAL:', formatMoney(invoice.totalCents));
  b.bold(false).size('normal');

  b.separator('-');

  // Pagos y Devuelta
  b.align('left');
  if (relatedPayments.length > 0) {
    b.bold(true).line('DETALLE DE PAGO:').bold(false);
    for (const p of relatedPayments) {
      const methodLabel = ({ cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', check: 'Cheque', credit: 'Crédito' })[p.method] || p.method;
      b.row(`  ${methodLabel}:`, formatMoney(p.amountCents));
      if (p.reference) b.line(`  Ref: ${String(p.reference).slice(0, 36)}`);
    }
  }
  if (resolvedChangeInfo && resolvedChangeInfo.receivedCents > 0) {
    b.row('  Efectivo recibido:', formatMoney(resolvedChangeInfo.receivedCents));
    b.row('  Devuelta / Cambio:', formatMoney(resolvedChangeInfo.changeCents));
  }
  if (balance > 0) {
    b.bold(true).row('BALANCE PENDIENTE:', formatMoney(balance)).bold(false);
  }

  b.separator('=');

  // Pie de recibo
  b.align('center');
  if (settings.receiptFooter) {
    b.line(settings.receiptFooter);
  } else {
    b.line('\u00a1Gracias por preferirnos!');
    b.line('Vuelva pronto.');
  }

  // WiFi / redes sociales del negocio si están configuradas
  if (settings.instagram) b.line(`Instagram: @${settings.instagram}`);
  if (settings.whatsapp) b.line(`WhatsApp: ${settings.whatsapp}`);

  // Código QR con URL del menú o WhatsApp del negocio
  const qrUrl = resolveReceiptQrUrl(settings);

  if (qrUrl) {
    b.feed(1);
    // ESC/POS QR Code: GS ( k
    // Guardar datos del QR
    const qrData = qrUrl;
    const qrBytes = [];
    // Model: GS ( k pL pH cn 65 n  (n=2: Model 2)
    qrBytes.push(0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // Tamaño de módulo: GS ( k pL pH cn 67 n  (n=4: módulo de 4 puntos)
    qrBytes.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06);
    // Corrección de errores: GS ( k pL pH cn 69 n  (n=49: nivel M)
    qrBytes.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);
    // Guardar datos: GS ( k pL pH cn 80 30  (+ datos)
    const dataLen = qrData.length + 3;
    const pL = dataLen & 0xFF;
    const pH = (dataLen >> 8) & 0xFF;
    qrBytes.push(0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30);
    for (let i = 0; i < qrData.length; i++) {
      qrBytes.push(qrData.charCodeAt(i) & 0xFF);
    }
    // Imprimir QR almacenado: GS ( k pL pH cn 81 30
    qrBytes.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
    b.raw(qrBytes);
    b.feed(1);
    b.line('Escanea para el men\u00fa digital');
  }

  // Cortar y abrir gaveta si es cobro en efectivo
  b.cut();
  return b;
}

/**
 * Construye el ticket formateado en texto estructurado con etiquetas gráficas
 * para renderizado nativo en alta resolución con Star Raster Mode.
 */
export function buildInvoicePlainText(invoice, settings = {}, payments = [], changeInfo = null) {
  const lines = [];
  const relatedPayments = payments.filter((item) => !invoice.id || item.invoiceId === invoice.id || !item.invoiceId);
  const cashPayment = relatedPayments.find((item) => item.method === 'cash' && Number(item.tenderedCents || 0) > 0);
  const resolvedChangeInfo = changeInfo || (cashPayment ? {
    receivedCents: Number(cashPayment.tenderedCents),
    changeCents: Number(cashPayment.changeCents || 0)
  } : null);
  lines.push('[LOGO]');
  lines.push(`[TITLE]${(settings.name || 'LOS PANITAS BY NECHY').toUpperCase()}`);
  if (settings.rnc && settings.rnc !== 'N/D') lines.push(`[C]RNC: ${settings.rnc}`);
  if (settings.phone) lines.push(`[C]Tel: ${settings.phone}`);
  if (settings.address) lines.push(`[C]${settings.address}`);
  lines.push('[SEP]');

  const docLabel = ({
    invoice: 'FACTURA DE VENTA',
    quote: 'COTIZACIÓN',
    proforma: 'PROFORMA',
    delivery: 'CONDUCE DE ENTREGA'
  })[invoice.documentType] || 'DOCUMENTO';
  lines.push(`${docLabel}: ${invoice.invoiceNumber || invoice.id || 'N/A'}`);
  if (invoice.ncf) lines.push(`NCF: ${invoice.ncf}`);
  lines.push(`Fecha: ${formatDate(invoice.createdAt || new Date(), true)}`);
  if (invoice.clientName) lines.push(`Cliente: ${invoice.clientName}`);
  if (invoice.clientRnc) lines.push(`RNC/Cédula: ${invoice.clientRnc}`);
  if (invoice.tableName) lines.push(`Mesa / Salón: ${invoice.tableName}`);
  lines.push('[SEP]');

  lines.push('CANT.  DESCRIPCIÓN                         TOTAL');
  lines.push('[SEP]');

  for (const item of (invoice.items || [])) {
    const qty = String(item.quantity || 1);
    const name = (item.name || '').substring(0, 24);
    const lineTotal = formatMoney(Math.round((item.quantity || 1) * (item.unitPriceCents || 0)));
    lines.push(`${qty.padEnd(2)} x   ${name.padEnd(24)}  ${lineTotal.padStart(11)}`);
  }

  lines.push('[SEP]');
  lines.push(`Subtotal:                               ${formatMoney(invoice.subtotalCents || 0).padStart(11)}`);
  if (Number(invoice.discountCents || 0) > 0) {
    lines.push(`Descuento:                             -${formatMoney(invoice.discountCents).padStart(11)}`);
  }
  if (Number(invoice.taxCents || 0) > 0) {
    lines.push(`ITBIS:                                  ${formatMoney(invoice.taxCents).padStart(11)}`);
  }
  if (Number(invoice.tipCents || 0) > 0) {
    lines.push(`Propina legal:                          ${formatMoney(invoice.tipCents).padStart(11)}`);
  }
  lines.push('[SEP]');
  lines.push(`[C][B]TOTAL A PAGAR: ${formatMoney(invoice.totalCents || 0)}`);
  lines.push('[SEP]');

  for (const payment of relatedPayments) {
    const methodLabel = ({ cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', check: 'Cheque', credit: 'Crédito' })[payment.method] || payment.method;
    lines.push(`Pago ${methodLabel}:                     ${formatMoney(payment.amountCents).padStart(11)}`);
    if (payment.reference) lines.push(`Referencia: ${String(payment.reference).slice(0, 36)}`);
  }
  if (resolvedChangeInfo && Number(resolvedChangeInfo.receivedCents || 0) > 0) {
    lines.push(`Efectivo Recibido:                      ${formatMoney(resolvedChangeInfo.receivedCents).padStart(11)}`);
    lines.push(`Devuelta / Cambio:                      ${formatMoney(resolvedChangeInfo.changeCents).padStart(11)}`);
    lines.push('[SEP]');
  }
  const balance = Number(invoice.totalCents || 0) - Number(invoice.paidCents || 0);
  if (balance > 0) lines.push(`[B]BALANCE PENDIENTE: ${formatMoney(balance)}`);

  lines.push(`[C]${settings.receiptFooter || '¡Gracias por su compra! Vuelva pronto.'}`);
  if (settings.instagram) lines.push(`[C]Instagram: @${settings.instagram}`);
  if (settings.whatsapp) lines.push(`[C]WhatsApp: ${settings.whatsapp}`);

  return lines.join('\n');
}


/**
 * Construye el ticket ESC/POS para una Comanda de Cocina (KDS)
 */
export function buildKitchenEscPos(order, settings = {}) {
  const b = new EscPosBuilder();

  b.align('center').bold(true).size('double');
  b.line('*** COCINA ***');
  b.size('normal');
  b.line(settings.name || 'Los Panitas by Nechy');
  b.doubleSeparator();

  b.align('left');
  b.bold(true).size('double-height');
  b.row(`MESA: ${order.tableName || 'Directa'}`, `ORDEN #${order.id ? order.id.slice(-4).toUpperCase() : '0000'}`);
  b.bold(false).size('normal');
  b.row(`Hora: ${formatDate(order.createdAt, true)}`, `Rev: ${order.revision || 1}`);
  b.line(`Cliente / Referencia: ${order.clientName || 'Consumidor'}`);

  if (order.priority && order.priority !== 'normal') {
    const pLabel = ({ urgent: 'URGENTE', high: 'ALTA' })[order.priority] || String(order.priority).toUpperCase();
    b.align('center').bold(true).line(`!!! PRIORIDAD: ${pLabel} !!!`).bold(false).align('left');
  }

  b.separator('=');

  // Artículos
  b.bold(true).size('double-height');
  for (const item of order.items || []) {
    b.line(`${item.quantity} x ${item.name}`);
    if (item.notes) {
      b.size('normal').bold(false);
      b.line(`   >> NOTA: ${item.notes}`);
      b.size('double-height').bold(true);
    }
  }
  b.bold(false).size('normal');

  if (order.notes) {
    b.separator('-');
    b.bold(true).line(`OBSERVACIONES GENERALES:`).bold(false);
    b.line(order.notes);
  }

  b.separator('=');
  b.align('center').line(`Fin de comanda - ${formatDate(new Date(), true)}`);
  b.cut();
  return b;
}

export function buildKitchenPlainText(order, settings = {}) {
  const lines = [
    '[TITLE]*** COCINA ***',
    `[C]${settings.name || 'Los Panitas by Nechy'}`,
    '[SEP]',
    `[B]MESA: ${order.tableName || 'Directa'}`,
    `Orden: ${order.id ? order.id.slice(-6).toUpperCase() : 'N/A'}    Rev: ${order.revision || 1}`,
    `Hora: ${formatDate(order.createdAt || new Date(), true)}`,
    `Cliente: ${String(order.clientName || 'Consumidor').slice(0, 34)}`
  ];
  if (order.priority && order.priority !== 'normal') {
    lines.push(`[B]PRIORIDAD: ${{ urgent: 'URGENTE', high: 'ALTA' }[order.priority] || String(order.priority).toUpperCase()}`);
  }
  lines.push('[SEP]');
  for (const item of order.items || []) {
    lines.push(`[B]${item.quantity} x ${String(item.name || '').slice(0, 34)}`);
    if (item.notes) lines.push(`  NOTA: ${String(item.notes).slice(0, 38)}`);
  }
  if (order.notes) lines.push('[SEP]', `[B]OBSERVACIONES:`, String(order.notes).slice(0, 120));
  lines.push('[SEP]', `[C]Fin de comanda · ${formatDate(new Date(), true)}`);
  return lines.join('\n');
}

/**
 * Construye el ticket ESC/POS para la Pre-cuenta / Estado de Consumo de Mesa
 */
export function buildPrebillEscPos(orderOrInvoice, settings = {}) {
  const b = new EscPosBuilder();
  const items = orderOrInvoice.items || [];
  const subtotalCents = Number(orderOrInvoice.subtotalCents || 0);
  const discountCents = Number(orderOrInvoice.discountCents || 0);
  const taxCents = Number(orderOrInvoice.taxCents || 0);
  const tipCents = Number(orderOrInvoice.tipCents || 0);
  const totalCents = Number(orderOrInvoice.totalCents || (subtotalCents - discountCents + taxCents + tipCents));

  b.align('center').bold(true).size('double-height');
  b.line(settings.name || 'Los Panitas by Nechy');
  b.bold(false).size('normal');
  b.line('ESTADO DE CONSUMO / PRE-CUENTA');
  b.line('(NO VALIDO COMO COMPROBANTE FISCAL)');
  b.doubleSeparator();

  b.align('left');
  if (orderOrInvoice.tableName) {
    b.bold(true).size('double-height').line(`MESA: ${orderOrInvoice.tableName}`).bold(false).size('normal');
  }
  b.row(`Fecha: ${formatDate(orderOrInvoice.createdAt || new Date(), true)}`, `Ref: ${(orderOrInvoice.id || '').slice(-4).toUpperCase()}`);
  if (orderOrInvoice.clientName) {
    b.line(`Cliente: ${orderOrInvoice.clientName}`);
  }

  b.separator('-');
  b.row('CANT DESCRIPCION', 'PRECIO     TOTAL');
  b.separator('-');

  for (const item of items) {
    const qty = `${item.quantity}x`;
    const price = formatMoney(item.unitPriceCents);
    const lineTotal = formatMoney(item.unitPriceCents * item.quantity);
    b.itemRow(qty, item.name, price, lineTotal);
    if (item.notes) {
      b.line(`   * ${item.notes}`);
    }
  }

  b.separator('-');
  b.align('right');
  b.row('SUBTOTAL:', formatMoney(subtotalCents));
  if (discountCents > 0) {
    b.row('DESCUENTO:', `-${formatMoney(discountCents)}`);
  }
  if (taxCents > 0) {
    b.row('ITBIS:', formatMoney(taxCents));
  }
  if (tipCents > 0) {
    b.row('PROPINA LEY (10%):', formatMoney(tipCents));
  }
  b.bold(true).size('double-height');
  b.row('TOTAL A PAGAR:', formatMoney(totalCents));
  b.bold(false).size('normal');

  b.separator('=');
  b.align('center');
  b.line('Solicita tu factura fiscal si la requieres.');
  b.line('¡Gracias por tu visita!');
  b.cut();
  return b;
}

export function buildPrebillPlainText(orderOrInvoice, settings = {}) {
  const subtotalCents = Number(orderOrInvoice.subtotalCents || 0);
  const discountCents = Number(orderOrInvoice.discountCents || 0);
  const taxCents = Number(orderOrInvoice.taxCents || 0);
  const tipCents = Number(orderOrInvoice.tipCents || 0);
  const totalCents = Number(orderOrInvoice.totalCents || (subtotalCents - discountCents + taxCents + tipCents));
  const lines = [
    '[LOGO]',
    `[TITLE]${(settings.name || 'Los Panitas by Nechy').toUpperCase()}`,
    '[C]ESTADO DE CONSUMO / PRE-CUENTA',
    '[C](NO VÁLIDO COMO COMPROBANTE FISCAL)',
    '[SEP]'
  ];
  if (orderOrInvoice.tableName) lines.push(`[B]MESA: ${orderOrInvoice.tableName}`);
  lines.push(`Fecha: ${formatDate(orderOrInvoice.createdAt || new Date(), true)}`);
  if (orderOrInvoice.clientName) lines.push(`Cliente: ${String(orderOrInvoice.clientName).slice(0, 34)}`);
  lines.push('[SEP]', 'CANT.  DESCRIPCIÓN                         TOTAL', '[SEP]');
  for (const item of orderOrInvoice.items || []) {
    const description = `${item.quantity} x ${String(item.name || '').slice(0, 25)}`;
    lines.push(`${description.padEnd(32)}  ${formatMoney(Number(item.unitPriceCents || 0) * Number(item.quantity || 0)).padStart(11)}`);
    if (item.notes) lines.push(`  * ${String(item.notes).slice(0, 38)}`);
  }
  lines.push('[SEP]', `Subtotal:                       ${formatMoney(subtotalCents).padStart(11)}`);
  if (discountCents > 0) lines.push(`Descuento:                     -${formatMoney(discountCents).padStart(11)}`);
  if (taxCents > 0) lines.push(`ITBIS:                          ${formatMoney(taxCents).padStart(11)}`);
  if (tipCents > 0) lines.push(`Propina legal:                  ${formatMoney(tipCents).padStart(11)}`);
  lines.push('[SEP]', `[C][B]TOTAL A PAGAR: ${formatMoney(totalCents)}`, '[SEP]', '[C]Solicita tu factura fiscal si la requieres.');
  return lines.join('\n');
}

/**
 * Construye el ticket ESC/POS para el Arqueo / Cierre de Turno de Caja (Corte X o Corte Z)
 */
export function buildCashReportEscPos(session, payments = [], settings = {}, movements = [], mode = 'Z') {
  const b = new EscPosBuilder();
  const sessionPayments = payments.filter((item) => item.cashSessionId === session.id);
  const sessionMovements = movements.filter((item) => item.cashSessionId === session.id);
  const totalCollected = sessionPayments.reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const cashCollected = sessionPayments.filter((item) => item.method === 'cash').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const cardCollected = sessionPayments.filter((item) => item.method === 'card').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const transferCollected = sessionPayments.filter((item) => item.method === 'transfer').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const creditCollected = sessionPayments.filter((item) => item.method === 'credit').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const cashIn = sessionMovements.filter((item) => item.type === 'in').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const cashOut = sessionMovements.filter((item) => item.type === 'out').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const expectedCash = Number(session.openingCents || 0) + cashCollected + cashIn - cashOut;
  const isCorteX = mode === 'X' || session.status === 'open';

  b.align('center').bold(true).size('double-height');
  b.line(isCorteX ? 'ARQUEO PARCIAL (CORTE X)' : 'CIERRE DE CAJA (CORTE Z)');
  b.bold(false).size('normal');
  b.line(settings.name || 'Los Panitas by Nechy');
  b.doubleSeparator();

  b.align('left');
  b.line(`Responsable: ${session.openedByName || 'Cajero'}`);
  b.line(`Apertura:    ${formatDate(session.openedAt, true)}`);
  if (session.closedAt) {
    b.line(`Cierre:      ${formatDate(session.closedAt, true)}`);
  }
  b.line(`Estado:      ${session.status === 'open' ? 'SESIÓN EN CURSO' : 'SESIÓN CERRADA'}`);

  b.separator('-');
  b.bold(true).line('DESGLOSE DE VENTAS Y COBROS:').bold(false);
  b.row('Fondo Inicial:', formatMoney(session.openingCents));
  b.row('Ventas Efectivo:', formatMoney(cashCollected));
  b.row('Ventas Tarjeta:', formatMoney(cardCollected));
  b.row('Ventas Transferencia:', formatMoney(transferCollected));
  if (creditCollected > 0) {
    b.row('Ventas a Crédito:', formatMoney(creditCollected));
  }
  b.separator('-');
  b.row('Total Facturado/Cobrado:', formatMoney(totalCollected));

  b.separator('-');
  b.bold(true).line('MOVIMIENTOS DE CAJA:').bold(false);
  b.row('Entradas (Fondo/Ingreso):', `+${formatMoney(cashIn)}`);
  b.row('Salidas (Gastos/Retiros):', `-${formatMoney(cashOut)}`);
  b.separator('-');
  b.bold(true).row('EFECTIVO ESPERADO EN CAJA:', formatMoney(expectedCash)).bold(false);

  if (session.status === 'closed') {
    b.separator('=');
    b.row('Efectivo Contado:', formatMoney(session.closingCents));
    const variance = Number(session.varianceCents || 0);
    const varianceLabel = variance === 0 ? 'CUADRADO (0.00)' : variance > 0 ? `SOBRANTE (+${formatMoney(variance)})` : `FALTANTE (${formatMoney(variance)})`;
    b.bold(true).row('DIFERENCIA:', varianceLabel).bold(false);
  }

  if (sessionMovements.length > 0) {
    b.separator('-');
    b.bold(true).line('DETALLE DE GASTOS / RETIROS:').bold(false);
    for (const movement of sessionMovements) {
      const sign = movement.type === 'in' ? '+' : '-';
      b.row(`${sign} ${String(movement.reason || 'Movimiento').slice(0, 26)}`, formatMoney(movement.amountCents));
    }
  }

  if (session.notes) {
    b.separator('-');
    b.line(`Notas de cierre: ${session.notes}`);
  }

  b.feed(2);
  b.align('center');
  b.line('___________________________     ___________________________');
  b.line('       Firma Cajero                     Firma Supervisor   ');
  b.feed(1);
  b.line(`Generado: ${formatDate(new Date(), true)}`);
  b.cut();
  return b;
}

export function buildCashReportPlainText(session, payments = [], settings = {}, movements = [], mode = 'Z') {
  const sessionPayments = payments.filter((item) => item.cashSessionId === session.id);
  const sessionMovements = movements.filter((item) => item.cashSessionId === session.id);
  const sum = (entries) => entries.reduce((total, item) => total + Number(item.amountCents || 0), 0);
  const cashCollected = sum(sessionPayments.filter((item) => item.method === 'cash'));
  const cardCollected = sum(sessionPayments.filter((item) => item.method === 'card'));
  const transferCollected = sum(sessionPayments.filter((item) => item.method === 'transfer'));
  const cashIn = sum(sessionMovements.filter((item) => item.type === 'in'));
  const cashOut = sum(sessionMovements.filter((item) => item.type === 'out'));
  const expectedCash = Number(session.expectedCents ?? (Number(session.openingCents || 0) + cashCollected + cashIn - cashOut));
  const isCorteX = mode === 'X' || session.status === 'open';
  const lines = [
    `[TITLE]${isCorteX ? 'ARQUEO PARCIAL · CORTE X' : 'CIERRE DE CAJA · CORTE Z'}`,
    `[C]${settings.name || 'Los Panitas by Nechy'}`,
    '[SEP]',
    `Responsable: ${String(session.openedByName || 'Cajero').slice(0, 30)}`,
    `Apertura: ${formatDate(session.openedAt, true)}`,
    ...(session.closedAt ? [`Cierre: ${formatDate(session.closedAt, true)}`] : []),
    '[SEP]',
    `Fondo inicial:                 ${formatMoney(session.openingCents || 0).padStart(11)}`,
    `Ventas efectivo:               ${formatMoney(cashCollected).padStart(11)}`,
    `Ventas tarjeta:                ${formatMoney(cardCollected).padStart(11)}`,
    `Transferencias:                ${formatMoney(transferCollected).padStart(11)}`,
    `Entradas de caja:              ${formatMoney(cashIn).padStart(11)}`,
    `Salidas de caja:              -${formatMoney(cashOut).padStart(11)}`,
    '[SEP]',
    `[B]EFECTIVO ESPERADO: ${formatMoney(expectedCash)}`
  ];
  if (session.status === 'closed') {
    lines.push(`Efectivo contado: ${formatMoney(session.closingCents || 0)}`,
      `[B]DIFERENCIA: ${formatMoney(session.varianceCents || 0)}`);
  }
  if (sessionMovements.length) {
    lines.push('[SEP]', '[B]MOVIMIENTOS:');
    sessionMovements.forEach((movement) => lines.push(`${movement.type === 'in' ? '+' : '-'} ${String(movement.reason || 'Movimiento').slice(0, 28)}  ${formatMoney(movement.amountCents)}`));
  }
  lines.push('[SEP]', `[C]Generado: ${formatDate(new Date(), true)}`);
  return lines.join('\n');
}

/**
 * Puerto del servidor de comandos local dentro del APK nativo ELO.
 * La variable window._ELO_PORT se inyecta por MainActivity.java al cargar la página.
 */
const ELO_LOCAL_PORT = typeof window !== 'undefined' && window._ELO_PORT ? window._ELO_PORT : 8765;

/**
 * Dispatcher para enviar bytes ESC/POS al hardware.
 * Cadena de intentos en orden de prioridad:
 *  0. Puente JavascriptInterface nativo (window.EloPOS) - sólo si el APK lo inyectó
 *  1. Servidor local de comandos del APK (ws://127.0.0.1:8765, JSON)
 *  2. RawBT WebSocket (ws://127.0.0.1:40213, base64)
 *  3. Diálogo del navegador con renderizado 80mm (fallback)
 */
export async function sendEscPosToPrinter(builder, options = {}) {
  const hasEloNativeBridge = typeof window !== 'undefined'
    && Boolean(window.EloPOS || window._ELO_PORT);
  // -1. Si se proporciona texto estructurado para Star Raster, enviar prioritariamente
  if (options.plainText) {
    if (typeof window !== 'undefined' && typeof window.EloPOS?.printTextAsync === 'function') {
      const result = await callEloNativeAsync('printTextAsync', [options.plainText, options.openDrawer === true], 30000);
      return result?.success
        ? { success:true, method:'elo-native-queued-raster' }
        : { success:false, error:result?.error || 'elo-native-print-failed' };
    }
    if (typeof window !== 'undefined' && window.EloPOS && typeof window.EloPOS.printText === 'function') {
      try {
        const res = window.EloPOS.printText(options.plainText, options.openDrawer === true);
        if (res !== false) return { success: true, method: 'elo-native-text-raster' };
        // El servidor WebSocket está respaldado por el mismo UsbPrinterManager. Reintentarlo
        // inmediatamente duplica el envío y deja la Star en un ciclo de reconexión.
        return { success: false, error: 'elo-native-print-failed' };
      } catch (e) {
        console.warn('[ELO] Fallo en printText:', e);
        return { success: false, error: 'elo-native-print-failed' };
      }
    }
    const eloPort = (typeof window !== 'undefined' && window._ELO_PORT) ? window._ELO_PORT : ELO_LOCAL_PORT;
    const eloResult = await tryLocalCommandServer(
      eloPort,
      { cmd: 'printText', text: options.plainText, openDrawer: options.openDrawer === true },
      30000
    );
    if (eloResult) return { success: true, method: 'elo-local-text-server' };
  }

  const base64 = builder.getBase64();

  // 0. Puente JavascriptInterface nativo (window.EloPOS) inyectado por MainActivity
  if (typeof window !== 'undefined' && typeof window.EloPOS?.printBase64Async === 'function') {
    const result = await callEloNativeAsync('printBase64Async', [base64], 30000);
    return result?.success
      ? { success:true, method:'elo-native-queued' }
      : { success:false, error:result?.error || 'elo-native-print-failed' };
  }
  if (typeof window !== 'undefined' && window.EloPOS && typeof window.EloPOS.printBase64 === 'function') {
    try {
      const res = window.EloPOS.printBase64(base64);
      if (res !== false) return { success: true, method: 'elo-native-bridge' };
      return { success: false, error: 'elo-native-print-failed' };
    } catch (e) {
      console.warn('[ELO] Fallo en puente JavascriptInterface:', e);
      return { success: false, error: 'elo-native-print-failed' };
    }
  }

  // 1. Servidor local del APK ELO (ws://127.0.0.1:8765, JSON)
  const eloPort = (typeof window !== 'undefined' && window._ELO_PORT) ? window._ELO_PORT : ELO_LOCAL_PORT;
  const eloResult = await tryLocalCommandServer(
    eloPort,
    { cmd: 'print', data: base64, openDrawer: options.openDrawer === true },
    30000
  );
  if (eloResult) return { success: true, method: 'elo-local-server' };

  // En la APK ELO no debemos declarar éxito ni abrir un Intent ajeno si el controlador
  // nativo rechazó el ticket: el cajero necesita saber que debe reintentar o revisar equipo.
  if (hasEloNativeBridge) return { success: false, error: 'elo-native-print-failed' };

  // 2. RawBT WebSocket (ws://127.0.0.1:40213)
  const rawbtResult = await tryWebSocket('ws://127.0.0.1:40213',
    JSON.stringify({ type: 'print', data: base64, format: 'base64' }), 800);
  if (rawbtResult) return { success: true, method: 'rawbt-websocket' };

  // 3. Intent Android rawbt: (sólo cuando RawBT está instalado pero el WS falló)
  if (isAndroidDevice()) {
    try {
      const intentUrl = `rawbt:data:base64,${base64}`;
      window.location.href = intentUrl;
      return { success: true, method: 'rawbt-intent' };
    } catch { /* continuar */ }
  }

  // 4. Fallback: diálogo del navegador con CSS 80mm
  if (options.fallbackToBrowser !== false) {
    window.print();
    return { success: true, method: 'browser-print' };
  }

  return { success: false, error: 'hardware-unavailable' };
}

/**
 * Envía un comando JSON al servidor local del APK ELO vía WebSocket.
 * @param {number} port  - Puerto del servidor (8765 por defecto)
 * @param {object} cmd   - Objeto de comando JSON
 * @param {number} [timeoutMs=600]
 * @returns {Promise<boolean>}
 */
function tryLocalCommandServer(port, cmd, timeoutMs = 600) {
  return new Promise((resolve) => {
    let settled = false;
    let ws = null;
    const finish = (ok) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try { ws?.close(); } catch {}
        resolve(ok);
      }
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}`);

      ws.onopen = () => {
        ws.send(JSON.stringify({ ...cmd, token: window._ELO_TOKEN || '' }));
        // Esperar respuesta confirmando éxito
      };
      ws.onmessage = (evt) => {
        clearTimeout(timer);
        try {
          const res = JSON.parse(evt.data);
          finish(res.ok === true);
        } catch {
          finish(false);
        }
        ws.close();
      };
      ws.onerror = () => { clearTimeout(timer); finish(false); };
      ws.onclose = () => { if (!settled) finish(false); };
    } catch {
      finish(false);
    }
  });
}

/**
 * Envía un comando JSON al servidor local y devuelve la respuesta completa.
 * @returns {Promise<object|null>}
 */
export function sendEloCommand(cmd, timeoutMs = 1000) {
  if (typeof window !== 'undefined' && typeof window.EloPOS?.commandAsync === 'function') {
    return callEloNativeAsync('commandAsync', [JSON.stringify(cmd)], Math.max(timeoutMs, 3000))
      .then((result) => result || null);
  }
  return new Promise((resolve) => {
    let settled = false;
    let ws = null;
    const finish = (val) => { if (!settled) { settled = true; clearTimeout(timer); try { ws?.close(); } catch {} resolve(val); } };
    const eloPort = (typeof window !== 'undefined' && window._ELO_PORT) ? window._ELO_PORT : ELO_LOCAL_PORT;
    const timer = setTimeout(() => finish(null), timeoutMs);

    try {
      ws = new WebSocket(`ws://127.0.0.1:${eloPort}`);

      ws.onopen = () => ws.send(JSON.stringify({ ...cmd, token: window._ELO_TOKEN || '' }));
      ws.onmessage = (evt) => {
        clearTimeout(timer);
        try { finish(JSON.parse(evt.data)); } catch { finish(null); }
        ws.close();
      };
      ws.onerror = () => { clearTimeout(timer); finish(null); };
      ws.onclose = () => { if (!settled) finish(null); };
    } catch {
      finish(null);
    }
  });
}

/**
 * Envía datos crudos a un endpoint WebSocket genérico (RawBT).
 */
function tryWebSocket(url, message, timeoutMs = 800) {
  return new Promise((resolve) => {
    let settled = false;
    let ws = null;
    const finish = (ok) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try { ws?.close(); } catch {}
        resolve(ok);
      }
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      ws = new WebSocket(url);
      ws.onopen = () => {
        ws.send(message);
        setTimeout(() => finish(true), 200);
      };
      ws.onerror = () => finish(false);
      ws.onclose = () => { if (!settled) finish(false); };
    } catch {
      finish(false);
    }
  });
}

/**
 * Abre la gaveta de dinero.
 * Prioriza el puente nativo dentro de la APK para evitar pulsos duplicados.
 */
export async function openCashDrawerHardware() {
  const eloPort = (typeof window !== 'undefined' && window._ELO_PORT) ? window._ELO_PORT : ELO_LOCAL_PORT;

  // 1. Puente JavascriptInterface nativo
  if (typeof window !== 'undefined' && typeof window.EloPOS?.openDrawerAsync === 'function') {
    const result = await callEloNativeAsync('openDrawerAsync', [], 8000);
    return result?.success
      ? { success:true, method:'elo-native-queued' }
      : { success:false, error:result?.error || 'elo-native-drawer-failed' };
  }
  if (typeof window !== 'undefined' && window.EloPOS && typeof window.EloPOS.openDrawer === 'function') {
    try {
      const opened = window.EloPOS.openDrawer();
      if (opened !== false) return { success: true, method: 'elo-native-bridge' };
      // No intentes de nuevo contra localhost: ambos caminos usan el mismo canal USB.
      return { success: false, error: 'elo-native-drawer-failed' };
    } catch (e) {
      console.warn('[ELO] Fallo en gaveta JavascriptInterface:', e);
      return { success: false, error: 'elo-native-drawer-failed' };
    }
  }

  // 2. Servidor local APK para PWA/navegador en la misma terminal
  const eloResult = await tryLocalCommandServer(eloPort, { cmd: 'openDrawer' }, 600);
  if (eloResult) return { success: true, method: 'elo-local-server' };

  // 3. ESC/POS vía RawBT / intent
  const b = new EscPosBuilder();
  b.kickDrawer();
  return sendEscPosToPrinter(b, { fallbackToBrowser: false });
}

/**
 * Determina si el dispositivo actual es Android.
 */
export function isAndroidDevice() {
  return /android/i.test(navigator.userAgent || '');
}

/**
 * Verifica si el servidor local del APK ELO está activo y responde.
 * @returns {Promise<boolean>}
 */
export async function checkEloNativeServer() {
  const result = await sendEloCommand({ cmd: 'ping' }, 800);
  return result?.ok === true || result?.success === true;
}

// ─── ESCÁNER DE CÓDIGOS DE BARRAS ───────────────────────────────────────────

/**
 * Activa el escáner de barras integrado en la terminal ELO.
 * @returns {Promise<boolean>}
 */
export async function startEloScanner() {
  const res = await sendEloCommand({ cmd: 'scannerOn' }, 800);
  return res && res.ok === true;
}

/**
 * Desactiva el escáner de barras.
 * @returns {Promise<boolean>}
 */
export async function stopEloScanner() {
  const res = await sendEloCommand({ cmd: 'scannerOff' }, 800);
  return res && res.ok === true;
}

// ─── VISOR DE CARA AL CLIENTE (VFD) ────────────────────────────────────────

/**
 * Muestra un mensaje en las dos líneas del visor del cliente.
 * @param {string} line1 - Primera línea (máx. 20 chars)
 * @param {string} line2 - Segunda línea (máx. 20 chars)
 * @returns {Promise<boolean>}
 */
export async function setVFDMessage(line1, line2 = '') {
  const res = await sendEloCommand({ cmd: 'setVFD', l1: line1, l2: line2 }, 800);
  return res && res.ok === true;
}

/**
 * Limpia el visor del cliente.
 */
export async function clearVFD() {
  await sendEloCommand({ cmd: 'clearVFD' }, 500);
}

/**
 * Muestra el mensaje de bienvenida en el VFD.
 */
export async function vfdWelcome(businessName = 'Los Panitas') {
  await sendEloCommand({ cmd: 'vfdWelcome', name: businessName }, 500);
}

// ─── AUDIO FEEDBACK ────────────────────────────────────────────────────────

/**
 * Emite un beep de audio en la terminal.
 * @param {'ok'|'error'|'warning'} type - Tipo de sonido
 */
export async function beepHardware(type = 'ok') {
  const tone = type === 'error' ? 1 : type === 'warning' ? 2 : 0;
  await sendEloCommand({ cmd: 'beep', tone }, 500);
}

// ─── ESTADO DEL HARDWARE ───────────────────────────────────────────────────

/**
 * Consulta el estado de todos los periféricos de la terminal.
 * @returns {Promise<{printerConnected, scannerActive, vfdConnected, wifiIp, model}|null>}
 */
export async function getHardwareStatus() {
  return sendEloCommand({ cmd: 'status' }, 1200);
}

/**
 * Consulta en tiempo real el sensor de papel térmico de la impresora Star / ESC-POS.
 * @returns {Promise<{ok:boolean, printerConnected:boolean, paperOut:boolean, paperLow:boolean, coverOpen:boolean, paperStatus:string}|null>}
 */
export async function checkPaperStatus() {
  return sendEloCommand({ cmd: 'checkPaper' }, 1200);
}
