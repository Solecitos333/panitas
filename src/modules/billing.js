import { csvCell } from '../domain/billing.js';
import { downloadText, escapeHtml, formatDate, formatMoney } from '../lib/format.js';

export function renderInvoices(state) {
  return `
    <section class="panel-heading"><div><span class="eyebrow">Facturación</span><h2>Documentos y cobros</h2><p>Historial fiscal y balance pendiente.</p></div><button class="button primary" data-route="pos"><i data-lucide="plus"></i> Nuevo documento</button></section>
    <section class="surface-card data-surface"><div class="toolbar"><label class="search-field"><i data-lucide="search"></i><input id="invoice-search" type="search" placeholder="Factura, cliente o NCF"></label><select id="invoice-status-filter"><option value="">Todos los estados</option><option value="pending">Pendientes</option><option value="partial">Parciales</option><option value="paid">Pagadas</option><option value="cancelled">Anuladas</option></select></div>
      <div class="table-scroll"><table><thead><tr><th>Documento</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Balance</th><th>Estado</th><th></th></tr></thead><tbody id="invoice-table-body">${state.invoices.length ? state.invoices.map(invoiceRow).join('') : `<tr><td colspan="7">${empty('receipt', 'Sin documentos', 'Las ventas y cotizaciones aparecerán aquí.')}</td></tr>`}</tbody></table></div>
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
    <section class="payment-history"><h3>Cobros</h3>${related.length ? related.map((item) => `<div><span>${formatDate(item.createdAt, true)} · ${paymentLabel(item.method)}</span><b>${formatMoney(item.amountCents)}</b></div>`).join('') : '<p class="muted">Sin cobros registrados.</p>'}</section>
    <footer class="modal-actions"><button class="button secondary" data-invoice-print><i data-lucide="printer"></i> Imprimir</button>${balance > 0 && invoice.status !== 'cancelled' && invoice.documentType === 'invoice' && capabilities.bill ? '<button class="button primary" data-payment-open>Registrar cobro</button>' : ''}${invoice.status !== 'cancelled' && Number(invoice.paidCents || 0) === 0 && capabilities.cancelInvoice ? '<button class="button danger ghost" data-invoice-cancel>Anular</button>' : ''}</footer>
  </article></div>`;
}

export function renderReports(state) {
  const selectedDateStr = state.selectedReportDate || new Date().toISOString().slice(0, 10);

  // Facturas del día seleccionado
  const dayInvoices = (state.invoices || []).filter((inv) => {
    if (inv.status === 'cancelled' || inv.documentType !== 'invoice') return false;
    const d = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt || 0);
    const ymd = d.toISOString().slice(0, 10);
    return ymd === selectedDateStr;
  });

  const dayPayments = (state.payments || []).filter((p) => {
    const d = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0);
    return d.toISOString().slice(0, 10) === selectedDateStr;
  });

  const dayMovements = (state.cashMovements || []).filter((m) => {
    const d = m.createdAt?.toDate ? m.createdAt.toDate() : new Date(m.createdAt || 0);
    return d.toISOString().slice(0, 10) === selectedDateStr;
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
  const date = new Date().toISOString().slice(0, 10);
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
