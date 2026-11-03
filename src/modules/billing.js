import { businessDateKey } from '../lib/business-time.js';
import { csvCell, calculateInvoiceModificationDiff } from '../domain/billing.js';
import { renderPinPadHtml } from '../lib/pin-pad.js';
import { downloadText, escapeHtml, formatDate, formatMoney } from '../lib/format.js';

export function renderInvoices(state) {
  const limit = state.invoiceDisplayLimit || 60;
  const visibleInvoices = state.invoices.slice(0, limit);
  const hasMore = state.invoices.length > limit;
  return `
    <section class="panel-heading"><div><span class="eyebrow">Facturación</span><h2>Documentos y cobros</h2><p>Historial fiscal y balance pendiente.</p></div><button class="button primary" data-route="pos"><i data-lucide="plus"></i> Nuevo documento</button></section>
    <section class="surface-card data-surface"><div class="toolbar"><label class="search-field"><i data-lucide="search"></i><input id="invoice-search" type="search" placeholder="Factura, cliente o NCF"></label><select id="invoice-status-filter"><option value="">Todos los estados</option><option value="pending">Pendientes</option><option value="partial">Parciales</option><option value="paid">Pagadas</option><option value="cancelled">Anuladas</option></select></div>
      <div class="table-scroll"><table><thead><tr><th>Documento</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Balance</th><th>Estado</th><th></th></tr></thead><tbody id="invoice-table-body">${state.invoices.length ? visibleInvoices.map(invoiceRow).join('') : `<tr><td colspan="7">${empty('receipt', 'Sin documentos', 'Las ventas y cotizaciones aparecerán aquí.')}</td></tr>`}</tbody></table></div>
      ${hasMore ? `<div style="text-align:center;padding:12px;border-top:1px solid var(--line);"><button type="button" class="button secondary compact" data-load-more-invoices style="font-size:0.85rem;"><i data-lucide="refresh-cw"></i> Ver más facturas (${visibleInvoices.length} de ${state.invoices.length})</button></div>` : ''}
    </section>`;
}

export function renderInvoiceModal(invoice, payments, capabilities = {}) {
  if (!invoice) return '';
  const related = payments.filter((item) => item.invoiceId === invoice.id);
  const balance = Number(invoice.totalCents) - Number(invoice.paidCents || 0);
  const discountCents = Number(invoice.discountCents || 0);
  const tipCents = Number(invoice.tipCents || 0);
  return `<div class="modal-backdrop" data-modal-close><article class="modal-card invoice-detail" role="dialog" aria-modal="true" aria-labelledby="invoice-title" data-modal-card>
    <header><div><span class="eyebrow">${documentLabel(invoice.documentType)}</span><h2 id="invoice-title">${escapeHtml(invoice.invoiceNumber)}</h2></div><button class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button></header>
    <div id="printable-invoice" class="print-document"><div class="print-brand"><img src="/logo.png" alt="Los Panitas"><div><h2>Los Panitas by Nechy</h2><p>${escapeHtml(invoice.invoiceNumber)}${invoice.ncf ? ` · NCF ${escapeHtml(invoice.ncf)}` : ''}</p></div></div><div class="invoice-parties"><div><span>Cliente</span><strong>${escapeHtml(invoice.clientName)}</strong>${invoice.clientRnc ? `<small style="display:block;color:#666;">RNC/Cédula: ${escapeHtml(invoice.clientRnc)}</small>` : ''}</div><div><span>Fecha</span><strong>${formatDate(invoice.createdAt)}</strong></div></div><table><thead><tr><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>${invoice.items.map((item) => `<tr><td>${escapeHtml(item.name)}${item.notes ? `<small style="display:block;color:#777;">Nota: ${escapeHtml(item.notes)}</small>` : ''}</td><td>${item.quantity}</td><td>${formatMoney(item.unitPriceCents)}</td><td>${formatMoney(item.unitPriceCents * item.quantity)}</td></tr>`).join('')}</tbody></table><div class="invoice-totals"><p><span>Subtotal</span><b>${formatMoney(invoice.subtotalCents)}</b></p>${discountCents > 0 ? `<p style="color:#d9534f;"><span>Descuento</span><b>-${formatMoney(discountCents)}</b></p>` : ''}<p><span>ITBIS</span><b>${formatMoney(invoice.taxCents)}</b></p>${tipCents > 0 ? `<p><span>Propina Legal (10%)</span><b>${formatMoney(tipCents)}</b></p>` : ''}<p><span>Total</span><strong>${formatMoney(invoice.totalCents)}</strong></p><p><span>Pagado</span><b>${formatMoney(invoice.paidCents)}</b></p><p><span>Balance</span><strong>${formatMoney(balance)}</strong></p></div></div>
    ${(invoice.deliveryDriverName || invoice.paymentMethod === 'delivery_cod' || invoice.deliveryStatus === 'in_transit') ? `
      <section class="invoice-delivery-info" style="margin:14px 0;padding:12px 16px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <span style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;font-weight:700;">Despacho Delivery</span>
          <strong style="display:flex;align-items:center;gap:6px;font-size:1.05rem;color:#f59e0b;margin-top:2px;"><i data-lucide="bike" style="width:16px;height:16px;"></i> ${escapeHtml(invoice.deliveryDriverName || 'Sin asignar')}</strong>
          ${invoice.deliveryAddress ? `<small style="display:flex;align-items:center;gap:4px;color:#cbd5e1;font-size:0.8rem;margin-top:2px;"><i data-lucide="map-pin" style="width:13px;height:13px;"></i> ${escapeHtml(invoice.deliveryAddress)}</small>` : ''}
          ${invoice.deliveryPhone ? `<small style="display:flex;align-items:center;gap:4px;color:var(--muted);font-size:0.78rem;"><i data-lucide="phone" style="width:13px;height:13px;"></i> ${escapeHtml(invoice.deliveryPhone)}</small>` : ''}
          ${invoice.deliveryNotes ? `<small style="display:block;color:var(--muted);font-size:0.75rem;font-style:italic;">Nota: ${escapeHtml(invoice.deliveryNotes)}</small>` : ''}
        </div>
        ${(invoice.deliveryStatus !== 'settled' && invoice.status !== 'cancelled') ? `
          <button type="button" class="button secondary compact" data-delivery-reassign="${escapeHtml(invoice.id)}" style="font-size:0.8rem;padding:6px 10px;gap:5px;">
            <i data-lucide="arrow-left-right"></i> Cambiar repartidor
          </button>
        ` : ''}
      </section>
    ` : ''}
    <section class="payment-history"><h3>Cobros</h3>${related.length ? related.map((item) => `<div><span>${formatDate(item.createdAt, true)} · ${paymentLabel(item.method)}</span><b>${formatMoney(item.amountCents)}</b></div>`).join('') : '<p class="muted">Sin cobros registrados.</p>'}</section>
    <footer class="modal-actions"><button class="button secondary" data-invoice-print><i data-lucide="printer"></i> Imprimir</button>${invoice.status !== 'cancelled' ? `<button type="button" class="button secondary" data-invoice-edit="${escapeHtml(invoice.id)}" style="gap:6px;"><i data-lucide="file-edit"></i> Modificar Pedido</button>` : ''}${balance > 0 && invoice.status !== 'cancelled' && invoice.documentType === 'invoice' && capabilities.bill ? '<button class="button primary" data-payment-open>Registrar cobro</button>' : ''}${invoice.status !== 'cancelled' && Number(invoice.paidCents || 0) === 0 && capabilities.cancelInvoice ? '<button class="button danger ghost" data-invoice-cancel>Anular</button>' : ''}</footer>
  </article></div>`;
}

export function renderReports(state) {
  const selectedDateStr = state.selectedReportDate || businessDateKey(new Date());

  // Facturas del día seleccionado
  const dayInvoices = (state.invoices || []).filter((inv) => {
    if (inv.status === 'cancelled' || inv.documentType !== 'invoice') return false;
    const d = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt || 0);
    const ymd = businessDateKey(d);
    return ymd === selectedDateStr;
  });

  const dayPayments = (state.payments || []).filter((p) => {
    const d = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0);
    return businessDateKey(d) === selectedDateStr;
  });

  const dayMovements = (state.cashMovements || []).filter((m) => {
    const d = m.createdAt?.toDate ? m.createdAt.toDate() : new Date(m.createdAt || 0);
    return businessDateKey(d) === selectedDateStr;
  });

  const dayTotalSales = dayInvoices.reduce((sum, item) => sum + Number(item.totalCents || 0), 0);
  const dayCashCollected = dayPayments.filter(p => p.method === 'cash').reduce((sum, p) => sum + Number(p.amountCents || 0), 0);
  const dayCardCollected = dayPayments.filter(p => p.method === 'card').reduce((sum, p) => sum + Number(p.amountCents || 0), 0);
  const dayTransferCollected = dayPayments.filter(p => p.method === 'transfer').reduce((sum, p) => sum + Number(p.amountCents || 0), 0);
  const dayFiaoIssued = dayInvoices.filter(i => i.status !== 'paid').reduce((sum, i) => sum + (Number(i.totalCents || 0) - Number(i.paidCents || 0)), 0);
  const dayCashOut = dayMovements.filter(m => m.type === 'out').reduce((sum, m) => sum + Number(m.amountCents || 0), 0);

  // Platos más vendidos del día
  const productCountMap = new Map();
  for (const inv of dayInvoices) {
    for (const item of (inv.items || [])) {
      const current = productCountMap.get(item.name) || { name: item.name, quantity: 0, totalCents: 0 };
      current.quantity += Number(item.quantity || 1);
      current.totalCents += Number(item.unitPriceCents || 0) * Number(item.quantity || 1);
      productCountMap.set(item.name, current);
    }
  }
  const topProducts = Array.from(productCountMap.values()).sort((a, b) => b.quantity - a.quantity);

  const valid = state.invoices.filter((item) => item.status !== 'cancelled' && item.documentType === 'invoice');
  const total = valid.reduce((sum, item) => sum + Number(item.totalCents || 0), 0);
  const tax = valid.reduce((sum, item) => sum + Number(item.taxCents || 0), 0);
  const tip = valid.reduce((sum, item) => sum + Number(item.tipCents || 0), 0);

  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Reportes y Rendimiento</span>
        <h2>Rendimiento Diario y Finanzas</h2>
        <p>Control por fecha de ventas, cobros por empleado, fiaos, gastos y reportes DGII.</p>
      </div>
      <div class="header-actions" style="display:flex;align-items:center;gap:10px;">
        <label style="display:flex;align-items:center;gap:8px;font-size:0.88rem;color:#fff;font-weight:600;">
          <i data-lucide="calendar"></i> Ver fecha:
          <input type="date" id="report-date-selector" value="${selectedDateStr}" style="padding:6px 10px;border-radius:8px;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.2);font-size:0.9rem;">
        </label>
      </div>
    </section>

    <!-- Resumen Diario -->
    <section class="surface-card" style="padding:20px;margin-bottom:20px;border:1px solid rgba(239,189,105,.25);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:10px;">
        <h3 style="margin:0;font-size:1.15rem;color:var(--brand-2);display:flex;align-items:center;gap:8px;">
          <i data-lucide="trending-up"></i> Resumen del Día (${selectedDateStr})
        </h3>
        <span style="font-size:0.85rem;color:var(--muted);">${dayInvoices.length} factura(s) emitida(s) hoy</span>
      </div>

      <div class="metric-grid" style="grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px;">
        <article class="metric-card">
          <i data-lucide="banknote" style="color:var(--brand-2);"></i>
          <div>
            <span>Ventas Totales</span>
            <strong style="color:var(--brand-2);">${formatMoney(dayTotalSales)}</strong>
          </div>
        </article>
        <article class="metric-card">
          <i data-lucide="wallet"></i>
          <div>
            <span>Efectivo Cobrado</span>
            <strong>${formatMoney(dayCashCollected)}</strong>
          </div>
        </article>
        <article class="metric-card">
          <i data-lucide="credit-card"></i>
          <div>
            <span>Tarjetas</span>
            <strong>${formatMoney(dayCardCollected)}</strong>
          </div>
        </article>
        <article class="metric-card">
          <i data-lucide="landmark"></i>
          <div>
            <span>Transferencias</span>
            <strong>${formatMoney(dayTransferCollected)}</strong>
          </div>
        </article>
        <article class="metric-card ${dayFiaoIssued > 0 ? 'warning' : ''}">
          <i data-lucide="book-open"></i>
          <div>
            <span>Fiao del Día</span>
            <strong>${formatMoney(dayFiaoIssued)}</strong>
          </div>
        </article>
        <article class="metric-card ${dayCashOut > 0 ? 'danger' : ''}">
          <i data-lucide="trending-down"></i>
          <div>
            <span>Gastos / Salidas</span>
            <strong>${formatMoney(dayCashOut)}</strong>
          </div>
        </article>
      </div>

      ${topProducts.length ? `
        <div style="margin-top:14px;border-top:1px solid rgba(255,255,255,.06);padding-top:12px;">
          <h4 style="margin:0 0 10px;font-size:0.92rem;color:#ccc;">Platos más vendidos este día</h4>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:8px;">
            ${topProducts.slice(0, 6).map(p => `
              <div style="display:flex;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,.03);border-radius:8px;font-size:0.85rem;">
                <span><strong>${p.quantity}x</strong> ${escapeHtml(p.name)}</span>
                <b style="color:var(--brand-2);">${formatMoney(p.totalCents)}</b>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${dayMovements.filter(m => m.type === 'out').length ? `
        <div style="margin-top:14px;border-top:1px solid rgba(255,255,255,.06);padding-top:12px;">
          <h4 style="margin:0 0 10px;font-size:0.92rem;color:#f87171;display:flex;align-items:center;gap:6px;">
            <i data-lucide="trending-down" style="width:16px;height:16px;"></i> Detalle de Salidas y Gastos de Caja (${dayMovements.filter(m => m.type === 'out').length})
          </h4>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:8px;">
            ${dayMovements.filter(m => m.type === 'out').map(m => {
              const match = (m.reason || '').match(/^\[(.*?)\]\s*(.*)$/);
              const category = match ? match[1] : 'Salida';
              const detail = match ? match[2] : (m.reason || 'Salida');
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:8px;font-size:0.85rem;">
                  <div>
                    <span style="display:inline-block;font-size:0.72rem;padding:1px 5px;border-radius:4px;background:rgba(239,68,68,.2);color:#f87171;font-weight:700;">${escapeHtml(category)}</span>
                    <strong style="display:block;margin-top:2px;font-size:0.83rem;">${escapeHtml(detail)}</strong>
                    <small style="color:var(--muted);font-size:0.72rem;">${escapeHtml(m.createdByName || 'Usuario')}</small>
                  </div>
                  <b style="color:#f87171;font-size:0.95rem;">-${formatMoney(m.amountCents)}</b>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}
    </section>

    <!-- Métricas Históricas y Exportaciones -->
    <div style="margin-bottom:12px;">
      <h3 style="margin:0 0 10px;font-size:1.05rem;color:#fff;">Exportaciones y Cumplimiento DGII</h3>
    </div>
    <div class="metric-grid">${metric('Ventas acumuladas', formatMoney(total), 'banknote')}${metric('ITBIS facturado', formatMoney(tax), 'landmark')}${metric('Propina legal', formatMoney(tip), 'circle-dollar-sign')}${metric('Facturas válidas', String(valid.length), 'file-check-2')}</div>
    <div class="report-grid">
      <article class="surface-card report-card"><i data-lucide="sheet"></i><div><h3>Facturas CSV</h3><p>Detalle de documentos, NCF, descuentos, propina legal, ITBIS y cobros.</p></div><button class="button secondary" data-export="invoices">Descargar</button></article>
      <article class="surface-card report-card"><i data-lucide="file-spreadsheet"></i><div><h3>Formato DGII 607</h3><p>Estructura oficial de ventas DGII con RNC, NCF, ITBIS y desglose de pago.</p></div><button class="button secondary" data-export="607">Descargar</button></article>
      <article class="surface-card report-card"><i data-lucide="users"></i><div><h3>Clientes CSV</h3><p>Directorio comercial con RNC/Cédula y datos de contacto.</p></div><button class="button secondary" data-export="clients">Descargar</button></article>
    </div>`;
}

export function exportReport(type, state) {
  const date = businessDateKey(new Date());
  if (type === 'invoices') {
    const header = ['Documento','Tipo','NCF','Cliente','RNC_Cedula','Fecha','Subtotal','Descuento','ITBIS','Propina_Legal','Total','Pagado','Balance','Estado'];
    const rows = state.invoices.map((item) => [
      item.invoiceNumber,
      item.documentType,
      item.ncf || '',
      item.clientName,
      item.clientRnc || '',
      formatDate(item.createdAt),
      ((item.subtotalCents || 0) / 100).toFixed(2),
      ((item.discountCents || 0) / 100).toFixed(2),
      ((item.taxCents || 0) / 100).toFixed(2),
      ((item.tipCents || 0) / 100).toFixed(2),
      ((item.totalCents || 0) / 100).toFixed(2),
      ((item.paidCents || 0) / 100).toFixed(2),
      (((item.totalCents || 0) - (item.paidCents || 0)) / 100).toFixed(2),
      item.status
    ]);
    downloadText(`Facturas_Los_Panitas_${date}.csv`, [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n'));
    return;
  }
  if (type === 'clients') {
    const rows = state.clients.map((item) => [item.name, item.rnc, item.phone, item.email, item.address]);
    downloadText(`Clientes_Los_Panitas_${date}.csv`, [['Nombre','RNC_Cedula','Telefono','Correo','Direccion'], ...rows].map((row) => row.map(csvCell).join(',')).join('\n'));
    return;
  }
  // Formato DGII 607 Oficial
  const header = [
    'RNC o Cedula',
    'Tipo Identificacion',
    'NCF',
    'NCF Modificado',
    'Tipo Ingreso',
    'Fecha Comprobante',
    'Fecha Retencion',
    'Monto Facturado',
    'ITBIS Facturado',
    'ITBIS Retenido por Terceros',
    'ITBIS Percibido',
    'Retencion Renta por Terceros',
    'ISR Percibido',
    'Impuesto Selectivo al Consumo',
    'Otros Impuestos Tasas',
    'Propina Legal',
    'Monto Efectivo',
    'Monto Cheque Transferencia Deposito',
    'Monto Tarjeta Debito Credito',
    'Monto Venta a Credito',
    'Bonos o Certificados de Regalo',
    'Permuta',
    'Otras Formas de Venta'
  ];

  const validInvoices = state.invoices.filter((item) => /^B(01|02|14|15)\d{8}$/.test(item.ncf || '') && item.status !== 'cancelled');
  const rows = validInvoices.map((inv) => buildDgii607Row(inv, state.payments || [], state.clients || []));

  downloadText(`DGII_607_Los_Panitas_${date}.csv`, [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n'));
}

export function buildDgii607Row(invoice, payments = [], clients = []) {
  const client = clients.find((c) => c.id === invoice.clientId) || {};
  const rawId = (client.rnc || invoice.clientRnc || '').replace(/\D/g, '');
  let idType = '';
  if (rawId.length === 9) idType = '1';
  else if (rawId.length === 11) idType = '2';
  else if (rawId.length > 0) idType = '3';
  else if (invoice.ncf?.startsWith('B02')) idType = '2'; // Consumidor final genérico

  const invoicePayments = payments.filter((p) => p.invoiceId === invoice.id);
  const cashPaid = invoicePayments.filter((p) => p.method === 'cash').reduce((s, p) => s + Number(p.amountCents || 0), 0);
  const cardPaid = invoicePayments.filter((p) => p.method === 'card').reduce((s, p) => s + Number(p.amountCents || 0), 0);
  const transferPaid = invoicePayments.filter((p) => ['transfer', 'check'].includes(p.method)).reduce((s, p) => s + Number(p.amountCents || 0), 0);

  const totalPaid = cashPaid + cardPaid + transferPaid;
  const creditAmount = Math.max(0, Number(invoice.totalCents || 0) - totalPaid);

  const taxableSubtotal = Math.max(0, Number(invoice.subtotalCents || 0) - Number(invoice.discountCents || 0));
  const billedAmount = (taxableSubtotal / 100).toFixed(2);
  const itbisAmount = (Number(invoice.taxCents || 0) / 100).toFixed(2);
  const tipAmount = (Number(invoice.tipCents || 0) / 100).toFixed(2);

  const dateStr = dateFullDgii(invoice.createdAt);

  return [
    rawId,
    idType,
    invoice.ncf || '',
    '', // NCF Modificado
    '01', // Ingresos por operaciones
    dateStr,
    '', // Fecha retención
    billedAmount,
    itbisAmount,
    '0.00',
    '0.00',
    '0.00',
    '0.00',
    '0.00',
    '0.00',
    tipAmount,
    (cashPaid / 100).toFixed(2),
    (transferPaid / 100).toFixed(2),
    (cardPaid / 100).toFixed(2),
    (creditAmount / 100).toFixed(2),
    '0.00',
    '0.00',
    '0.00'
  ];
}

function invoiceRow(item) { const balance = Number(item.totalCents) - Number(item.paidCents || 0); return `<tr data-invoice-row data-search="${escapeHtml(`${item.invoiceNumber} ${item.clientName} ${item.ncf || ''}`.toLowerCase())}" data-status="${item.status}"><td><strong>${escapeHtml(item.invoiceNumber)}</strong><small>${documentLabel(item.documentType)}${item.ncf ? ` · ${escapeHtml(item.ncf)}` : ''}</small></td><td>${escapeHtml(item.clientName)}</td><td>${formatDate(item.createdAt)}</td><td>${formatMoney(item.totalCents)}</td><td>${formatMoney(balance)}</td><td><span class="document-status status-${item.status}">${statusLabel(item.status)}</span></td><td><button class="icon-button" data-invoice-view="${item.id}" aria-label="Ver documento"><i data-lucide="eye"></i></button></td></tr>`; }
function documentLabel(type) { return ({ invoice: 'Factura', quote: 'Cotización', proforma: 'Proforma' })[type] || 'Documento'; }
function statusLabel(status) { return ({ pending:'Pendiente', partial:'Parcial', paid:'Pagada', cancelled:'Anulada', converted:'Convertida' })[status] || status; }
function paymentLabel(method) { return ({ cash:'Efectivo',card:'Tarjeta',transfer:'Transferencia',check:'Cheque',credit:'Crédito' })[method] || method; }
function empty(icon,title,copy) { return `<div class="empty-state"><i data-lucide="${icon}"></i><strong>${title}</strong><p>${copy}</p></div>`; }
function metric(label,value,icon) { return `<article class="metric-card"><i data-lucide="${icon}"></i><div><span>${label}</span><strong>${value}</strong></div></article>`; }
function dateFullDgii(value) {
  const date = value?.toDate ? value.toDate() : new Date(value || Date.now());
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}


export function renderEditInvoiceModal({ invoice, products = [], deliveryDrivers = [], draft = null }) {
  if (!invoice) return '';
  const currentDraft = draft || {
    items: Array.isArray(invoice.items) ? invoice.items.map(i => ({ ...i })) : [],
    paymentMethod: invoice.paymentMethod || 'cash',
    paymentReference: invoice.paymentReference || '',
    deliveryDriverId: invoice.deliveryDriverId || '',
    deliveryDriverName: invoice.deliveryDriverName || '',
    deliveryAddress: invoice.deliveryAddress || '',
    deliveryPhone: invoice.deliveryPhone || '',
    deliveryNotes: invoice.deliveryNotes || '',
    deliveryChangeForCents: invoice.deliveryChangeForCents || 0,
    reason: ''
  };

  const diff = calculateInvoiceModificationDiff(invoice, currentDraft.items, currentDraft.paymentMethod, currentDraft.deliveryDriverName);
  const totalDiff = diff.totalDiffCents;
  const isDelivery = Boolean(
    currentDraft.deliveryDriverName ||
    invoice.deliveryDriverName ||
    currentDraft.paymentMethod === 'delivery_cod' ||
    invoice.deliveryStatus === 'in_transit' ||
    currentDraft.deliveryAddress ||
    invoice.deliveryAddress
  );

  const activeDrivers = (deliveryDrivers || []).filter(d => d.active !== false);
  const activeProducts = (products || []).filter(p => p.active !== false);

  return `
    <div class="modal-backdrop" data-modal-close>
      <form id="edit-invoice-form" class="modal-card form-modal" style="max-width:740px;max-height:92vh;overflow-y:auto;" data-modal-card>
        <input type="hidden" name="invoiceId" value="${escapeHtml(invoice.id)}">
        <header style="align-items:flex-start;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
              <span class="eyebrow" style="color:var(--brand-2);"><i data-lucide="shield-alert" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;"></i> Modificación de Pedido</span>
              <span class="badge" style="font-size:0.7rem;padding:2px 6px;background:rgba(239,189,105,.15);color:var(--brand-2);border:1px solid rgba(239,189,105,.3);border-radius:6px;">Rev. ${invoice.revision || 1}</span>
            </div>
            <h2 style="font-size:1.25rem;margin:0;">Factura ${escapeHtml(invoice.invoiceNumber || invoice.id)}</h2>
            <small style="color:var(--muted);display:block;margin-top:2px;">Cliente: <strong>${escapeHtml(invoice.clientName || 'Consumidor final')}</strong> · Emitida: ${formatDate(invoice.createdAt, true)}</small>
          </div>
          <button type="button" class="icon-button" data-modal-close title="Cerrar"><i data-lucide="x"></i></button>
        </header>

        <div class="stack-form" style="gap:16px;padding-top:4px;">
          <!-- 1. Detalle de Productos -->
          <section style="background:rgba(255,255,255,.02);border:1px solid var(--line);border-radius:12px;padding:12px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <h4 style="margin:0;font-size:0.92rem;color:var(--text);display:flex;align-items:center;gap:6px;">
                <i data-lucide="utensils" style="width:15px;height:15px;color:var(--brand-2);"></i> Productos del Pedido (${currentDraft.items.length})
              </h4>
              <small style="color:var(--muted);">Ajusta cantidades o agrega nuevos platos/bebidas</small>
            </div>

            <div style="border:1px solid rgba(255,255,255,.08);border-radius:8px;overflow:hidden;margin-bottom:10px;">
              <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                <thead>
                  <tr style="background:rgba(255,255,255,.04);border-bottom:1px solid var(--line);">
                    <th style="padding:8px 10px;text-align:left;">Producto / Detalle</th>
                    <th style="padding:8px 10px;text-align:center;width:110px;">Cantidad</th>
                    <th style="padding:8px 10px;text-align:right;width:90px;">Precio</th>
                    <th style="padding:8px 10px;text-align:right;width:95px;">Total</th>
                    <th style="padding:8px 10px;text-align:center;width:40px;"></th>
                  </tr>
                </thead>
                <tbody id="edit-inv-items-body">
                  ${currentDraft.items.length ? currentDraft.items.map((item, idx) => `
                    <tr style="border-bottom:1px solid rgba(255,255,255,.04);">
                      <td style="padding:8px 10px;">
                        <strong style="display:block;color:#f8fafc;">${escapeHtml(item.name)}</strong>
                        ${item.side ? `<small style="display:block;color:var(--brand-2);">* Guarnición: ${escapeHtml(item.side)}</small>` : ''}
                        ${item.notes ? `<small style="display:block;color:var(--muted);font-style:italic;">Nota: ${escapeHtml(item.notes)}</small>` : ''}
                      </td>
                      <td style="padding:8px 10px;text-align:center;">
                        <div style="display:inline-flex;align-items:center;background:rgba(0,0,0,.35);border:1px solid var(--line);border-radius:6px;overflow:hidden;">
                          <button type="button" class="button secondary compact" data-edit-inv-qty-dec="${idx}" style="padding:2px 7px;height:26px;border:none;border-radius:0;" title="Disminuir">-</button>
                          <span style="min-width:28px;text-align:center;font-weight:700;font-size:0.85rem;">${item.quantity}</span>
                          <button type="button" class="button secondary compact" data-edit-inv-qty-inc="${idx}" style="padding:2px 7px;height:26px;border:none;border-radius:0;" title="Aumentar">+</button>
                        </div>
                      </td>
                      <td style="padding:8px 10px;text-align:right;color:var(--muted);">${formatMoney(item.unitPriceCents)}</td>
                      <td style="padding:8px 10px;text-align:right;font-weight:700;color:var(--brand-2);">${formatMoney(item.unitPriceCents * item.quantity)}</td>
                      <td style="padding:8px 6px;text-align:center;">
                        <button type="button" class="icon-button" data-edit-inv-del="${idx}" title="Eliminar producto" style="color:#f85149;padding:4px;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
                      </td>
                    </tr>
                  `).join('') : `
                    <tr>
                      <td colspan="5" style="text-align:center;padding:20px;color:#f85149;">
                        No hay productos en el pedido. Debes agregar al menos un plato o bebida.
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>

            <!-- Selector para agregar nuevo producto -->
            <div style="display:flex;gap:8px;align-items:center;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:6px 10px;">
              <select id="edit-inv-add-product-select" style="flex:1;font-size:0.85rem;padding:6px 10px;border-radius:6px;background:rgba(255,255,255,.06);border:1px solid var(--line);color:#fff;">
                <option value="">-- ➕ Seleccionar producto para agregar al pedido --</option>
                ${activeProducts.map(p => `<option value="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}" data-price="${p.priceCents || 0}">${escapeHtml(p.name)} (${formatMoney(p.priceCents || 0)})${p.category ? ' · ' + escapeHtml(p.category) : ''}</option>`).join('')}
              </select>
              <button type="button" class="button secondary compact" id="edit-inv-add-product-btn" style="font-size:0.8rem;padding:6px 12px;gap:4px;white-space:nowrap;">
                <i data-lucide="plus"></i> Agregar
              </button>
            </div>
          </section>

          <!-- 2. Forma de Pago y Despacho -->
          <div class="form-grid two" style="gap:12px;">
            <!-- Método de Pago -->
            <div style="background:rgba(255,255,255,.02);border:1px solid var(--line);border-radius:12px;padding:12px 14px;">
              <h4 style="margin:0 0 8px;font-size:0.92rem;color:var(--text);display:flex;align-items:center;gap:6px;">
                <i data-lucide="credit-card" style="width:15px;height:15px;color:var(--brand-2);"></i> Forma de Pago
              </h4>
              <label style="font-size:0.82rem;font-weight:600;margin-bottom:4px;">Método Seleccionado
                <select name="paymentMethod" id="edit-inv-payment-method" style="font-size:0.88rem;width:100%;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.35);border:1px solid var(--line);color:#fff;">
                  <option value="delivery_cod" ${currentDraft.paymentMethod === 'delivery_cod' ? 'selected' : ''}>Contra-Entrega (Efectivo a Repartidor)</option>
                  <option value="cash" ${currentDraft.paymentMethod === 'cash' ? 'selected' : ''}>Efectivo en Caja</option>
                  <option value="transfer" ${currentDraft.paymentMethod === 'transfer' ? 'selected' : ''}>Transferencia Bancaria</option>
                  <option value="card" ${currentDraft.paymentMethod === 'card' ? 'selected' : ''}>Tarjeta Débito / Crédito</option>
                  <option value="credit" ${currentDraft.paymentMethod === 'credit' ? 'selected' : ''}>Fiao / Cuenta por Cobrar</option>
                </select>
              </label>

              <div id="edit-inv-ref-container" style="margin-top:8px;${['transfer', 'card'].includes(currentDraft.paymentMethod) ? '' : 'display:none;'}">
                <label style="font-size:0.82rem;font-weight:600;">No. Referencia / Banco / Aprobación
                  <input type="text" name="paymentReference" id="edit-inv-payment-ref" value="${escapeHtml(currentDraft.paymentReference || '')}" placeholder="Ej: BPD-98124, Banco BHD, Tarjeta 4821..." maxlength="120" style="font-size:0.85rem;padding:6px 10px;">
                </label>
              </div>

              <div id="edit-inv-settle-notice" style="margin-top:8px;${currentDraft.paymentMethod === 'transfer' ? '' : 'display:none;'}background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);border-radius:8px;padding:8px 10px;font-size:0.78rem;color:#10b981;display:flex;align-items:center;gap:6px;">
                <i data-lucide="check-circle" style="width:14px;height:14px;flex-shrink:0;"></i>
                <span>Al marcar como <strong>Transferencia</strong>, el pedido se registra como cobrado directamente en el banco y no se le exige efectivo al repartidor.</span>
              </div>
            </div>

            <!-- Datos de Despacho (si es delivery) -->
            <div style="background:rgba(255,255,255,.02);border:1px solid var(--line);border-radius:12px;padding:12px 14px;">
              <h4 style="margin:0 0 8px;font-size:0.92rem;color:var(--text);display:flex;align-items:center;gap:6px;">
                <i data-lucide="bike" style="width:15px;height:15px;color:var(--brand-2);"></i> Datos de Entrega y Repartidor
              </h4>
              <label style="font-size:0.82rem;font-weight:600;margin-bottom:4px;">Repartidor Asignado
                <select name="deliveryDriverId" id="edit-inv-driver-select" style="font-size:0.88rem;width:100%;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.35);border:1px solid var(--line);color:#fff;">
                  <option value="">-- Sin asignar / Recoge en local --</option>
                  ${activeDrivers.map(d => `<option value="${escapeHtml(d.id)}" data-name="${escapeHtml(d.name)}" ${(currentDraft.deliveryDriverId === d.id || currentDraft.deliveryDriverName === d.name) ? 'selected' : ''}>${escapeHtml(d.name)}${d.phone ? ' · ' + escapeHtml(d.phone) : ''}</option>`).join('')}
                </select>
                <input type="hidden" name="deliveryDriverName" id="edit-inv-driver-name" value="${escapeHtml(currentDraft.deliveryDriverName || '')}">
              </label>

              <div class="form-grid two" style="gap:8px;margin-top:6px;">
                <label style="font-size:0.8rem;">Teléfono de entrega
                  <input type="text" name="deliveryPhone" id="edit-inv-phone" value="${escapeHtml(currentDraft.deliveryPhone || '')}" placeholder="809-000-0000" maxlength="30" style="font-size:0.85rem;padding:6px 8px;">
                </label>
                <label style="font-size:0.8rem;">Cambio para (RD$)
                  <input type="number" step="any" min="0" name="deliveryChangeFor" id="edit-inv-change-for" value="${currentDraft.deliveryChangeForCents ? (currentDraft.deliveryChangeForCents / 100).toFixed(2) : ''}" placeholder="0.00" style="font-size:0.85rem;padding:6px 8px;">
                </label>
              </div>

              <label style="font-size:0.8rem;margin-top:6px;">Dirección de entrega
                <input type="text" name="deliveryAddress" id="edit-inv-address" value="${escapeHtml(currentDraft.deliveryAddress || '')}" placeholder="Calle, número, sector..." maxlength="300" style="font-size:0.85rem;padding:6px 8px;">
              </label>
            </div>
          </div>

          <!-- 3. Comparativa y Balance Financiero -->
          <div style="background:rgba(239,189,105,.08);border:1px solid rgba(239,189,105,.25);border-radius:12px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
            <div>
              <span style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;font-weight:700;display:block;">Balance de Modificación</span>
              <div style="display:flex;align-items:center;gap:12px;margin-top:2px;">
                <span style="font-size:0.88rem;color:var(--muted);">Total Anterior: <b>${formatMoney(diff.oldTotals.totalCents)}</b></span>
                <span style="color:var(--line);">→</span>
                <span style="font-size:1.15rem;color:#f8fafc;font-weight:800;">Nuevo Total: <strong style="color:var(--brand-2);" id="edit-inv-new-total">${formatMoney(diff.newTotals.totalCents)}</strong></span>
              </div>
            </div>

            <div>
              ${totalDiff > 0 ? `
                <div style="padding:6px 12px;background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.35);border-radius:8px;text-align:right;">
                  <span style="font-size:0.72rem;color:var(--muted);display:block;">Diferencia a favor:</span>
                  <strong style="color:#f59e0b;font-size:1.05rem;">+${formatMoney(totalDiff)}</strong>
                </div>
              ` : totalDiff < 0 ? `
                <div style="padding:6px 12px;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.35);border-radius:8px;text-align:right;">
                  <span style="font-size:0.72rem;color:var(--muted);display:block;">Devolución / Descuento:</span>
                  <strong style="color:#ef4444;font-size:1.05rem;">-${formatMoney(Math.abs(totalDiff))}</strong>
                </div>
              ` : `
                <div style="padding:6px 12px;background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:8px;text-align:right;">
                  <span style="font-size:0.72rem;color:var(--muted);display:block;">Diferencia:</span>
                  <strong style="color:#cbd5e1;font-size:0.95rem;">RD$ 0.00</strong>
                </div>
              `}
            </div>
          </div>

          <!-- 4. Motivo obligatorio e Impresión -->
          <div style="background:rgba(255,255,255,.02);border:1px solid var(--line);border-radius:12px;padding:12px 14px;">
            <h4 style="margin:0 0 8px;font-size:0.92rem;color:var(--text);display:flex;align-items:center;gap:6px;">
              <i data-lucide="file-text" style="width:15px;height:15px;color:var(--brand-2);"></i> Motivo de la Modificación <strong style="color:#f85149;">*</strong>
            </h4>

            <div style="display:flex;flex-direction:column;gap:8px;">
              <select id="edit-inv-reason-preset" style="font-size:0.85rem;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.35);border:1px solid var(--line);color:#fff;">
                <option value="">-- Seleccionar motivo frecuente --</option>
                <option value="Cliente agregó productos al pedido">Cliente agregó productos al pedido</option>
                <option value="Cliente cambió de opinión / modificó un plato">Cliente cambió de opinión / modificó un plato</option>
                <option value="Cliente pagó por Transferencia Bancaria al recibir">Cliente pagó por Transferencia Bancaria al recibir</option>
                <option value="Cliente pagó con Tarjeta al recibir">Cliente pagó con Tarjeta al recibir</option>
                <option value="Cliente pagó en Efectivo al recibir">Cliente pagó en Efectivo al recibir</option>
                <option value="Corrección de cantidad o precio digitado">Corrección de cantidad o precio digitado</option>
              </select>

              <input type="text" name="reason" id="edit-inv-reason" required minlength="3" maxlength="500" placeholder="Escribe el motivo de la modificación (mínimo 3 caracteres)..." value="${escapeHtml(currentDraft.reason || '')}" style="font-size:0.9rem;padding:9px 12px;border-radius:8px;">
              <small style="color:var(--muted);font-size:0.75rem;">Este motivo quedará firmado en la auditoría con tu nombre y hora exacta.</small>
            </div>

            <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="edit-inv-print-receipt" name="printReceipt" checked style="width:18px;height:18px;accent-color:var(--brand-2);cursor:pointer;">
              <label for="edit-inv-print-receipt" style="font-size:0.85rem;font-weight:600;cursor:pointer;margin:0;">
                <i data-lucide="printer" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;color:var(--brand-2);"></i> Imprimir comprobante modificado automáticamente (Rev ${(invoice.revision || 1) + 1})
              </label>
            </div>
          </div>

          <!-- 5. Autorización por PIN -->
          <div style="background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:14px 16px;">
            <div style="text-align:center;margin-bottom:8px;">
              <span class="eyebrow" style="color:var(--brand-2);">Firma y Seguridad</span>
              <h4 style="margin:2px 0 0;font-size:1.05rem;">Autorización Requerida</h4>
              <p style="margin:4px 0 0;font-size:0.8rem;color:var(--muted);">Digita tu PIN de 6 dígitos para autorizar y firmar esta modificación.</p>
            </div>

            ${renderPinPadHtml({
              idPrefix: 'edit-inv-pin',
              label: '',
              required: true
            })}
          </div>

          <footer class="modal-actions" style="margin-top:4px;">
            <button type="button" class="button secondary" data-modal-close>Cancelar</button>
            <button class="button primary" type="submit" id="edit-inv-submit-btn" style="font-weight:700;">
              <i data-lucide="check-check"></i> Autorizar y Guardar Modificación
            </button>
          </footer>
        </div>
      </form>
    </div>
  `;
}
