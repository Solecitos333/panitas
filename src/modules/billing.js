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
  return `<div class="modal-backdrop" data-modal-close><article class="modal-card invoice-detail" role="dialog" aria-modal="true" aria-labelledby="invoice-title" data-modal-card>
    <header><div><span class="eyebrow">${documentLabel(invoice.documentType)}</span><h2 id="invoice-title">${escapeHtml(invoice.invoiceNumber)}</h2></div><button class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button></header>
    <div id="printable-invoice" class="print-document"><div class="print-brand"><img src="/logo.png" alt="Los Panitas"><div><h2>Los Panitas by Nechy</h2><p>${escapeHtml(invoice.invoiceNumber)}${invoice.ncf ? ` · NCF ${escapeHtml(invoice.ncf)}` : ''}</p></div></div><div class="invoice-parties"><div><span>Cliente</span><strong>${escapeHtml(invoice.clientName)}</strong></div><div><span>Fecha</span><strong>${formatDate(invoice.createdAt)}</strong></div></div><table><thead><tr><th>Descripción</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead><tbody>${invoice.items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${formatMoney(item.unitPriceCents)}</td><td>${formatMoney(item.unitPriceCents * item.quantity)}</td></tr>`).join('')}</tbody></table><div class="invoice-totals"><p><span>Subtotal</span><b>${formatMoney(invoice.subtotalCents)}</b></p><p><span>ITBIS</span><b>${formatMoney(invoice.taxCents)}</b></p><p><span>Total</span><strong>${formatMoney(invoice.totalCents)}</strong></p><p><span>Pagado</span><b>${formatMoney(invoice.paidCents)}</b></p><p><span>Balance</span><strong>${formatMoney(balance)}</strong></p></div></div>
    <section class="payment-history"><h3>Cobros</h3>${related.length ? related.map((item) => `<div><span>${formatDate(item.createdAt, true)} · ${paymentLabel(item.method)}</span><b>${formatMoney(item.amountCents)}</b></div>`).join('') : '<p class="muted">Sin cobros registrados.</p>'}</section>
    <footer class="modal-actions"><button class="button secondary" data-invoice-print><i data-lucide="printer"></i> Imprimir</button>${balance > 0 && invoice.status !== 'cancelled' && invoice.documentType === 'invoice' && capabilities.bill ? '<button class="button primary" data-payment-open>Registrar cobro</button>' : ''}${invoice.status !== 'cancelled' && Number(invoice.paidCents || 0) === 0 && capabilities.cancelInvoice ? '<button class="button danger ghost" data-invoice-cancel>Anular</button>' : ''}</footer>
  </article></div>`;
}

export function renderReports(state) {
  const valid = state.invoices.filter((item) => item.status !== 'cancelled' && item.documentType === 'invoice');
  const total = valid.reduce((sum, item) => sum + Number(item.totalCents || 0), 0);
  const tax = valid.reduce((sum, item) => sum + Number(item.taxCents || 0), 0);
  return `
    <section class="panel-heading"><div><span class="eyebrow">Reportes</span><h2>Lectura financiera</h2><p>Exportaciones operativas y fiscales sin alterar los registros.</p></div></section>
    <div class="metric-grid">${metric('Ventas acumuladas', formatMoney(total), 'banknote')}${metric('ITBIS facturado', formatMoney(tax), 'landmark')}${metric('Facturas válidas', String(valid.length), 'file-check-2')}${metric('Cobros', String(state.payments.length), 'circle-dollar-sign')}</div>
    <div class="report-grid"><article class="surface-card report-card"><i data-lucide="sheet"></i><div><h3>Facturas CSV</h3><p>Detalle de documentos, NCF, impuestos, cobros y estado.</p></div><button class="button secondary" data-export="invoices">Descargar</button></article><article class="surface-card report-card"><i data-lucide="file-spreadsheet"></i><div><h3>Formato DGII 607</h3><p>Comprobantes fiscales válidos en la estructura de ventas.</p></div><button class="button secondary" data-export="607">Descargar</button></article><article class="surface-card report-card"><i data-lucide="users"></i><div><h3>Clientes CSV</h3><p>Directorio comercial para respaldo o análisis.</p></div><button class="button secondary" data-export="clients">Descargar</button></article></div>`;
}

export function exportReport(type, state) {
  const date = new Date().toISOString().slice(0, 10);
  if (type === 'invoices') {
    const header = ['Documento','Tipo','NCF','Cliente','Fecha','Subtotal','ITBIS','Total','Pagado','Estado'];
    const rows = state.invoices.map((item) => [item.invoiceNumber,item.documentType,item.ncf,item.clientName,formatDate(item.createdAt),item.subtotalCents/100,item.taxCents/100,item.totalCents/100,item.paidCents/100,item.status]);
    downloadText(`Facturas_Los_Panitas_${date}.csv`, [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n'));
    return;
  }
  if (type === 'clients') {
    const rows = state.clients.map((item) => [item.name,item.rnc,item.phone,item.email,item.address]);
    downloadText(`Clientes_Los_Panitas_${date}.csv`, [['Nombre','RNC','Teléfono','Correo','Dirección'], ...rows].map((row) => row.map(csvCell).join(',')).join('\n'));
    return;
  }
  const header = ['RNC o Cedula','Tipo Identificacion','NCF','NCF Modificado','Tipo Ingreso','Fecha Comprobante','Fecha Retencion','Monto Facturado','ITBIS Facturado','ITBIS Retenido por Terceros','ITBIS Percibido','Retencion Renta por Terceros','ISR Percibido','Impuesto Selectivo al Consumo','Otros Impuestos Tasas','Propina Legal','Monto Efectivo','Monto Cheque Transferencia Deposito','Monto Tarjeta Debito Credito','Monto Venta a Credito','Bonos o Certificados de Regalo','Permuta','Otras Formas de Venta'];
  const rows = state.invoices.filter((item) => /^B\d{10}$/.test(item.ncf || '') && item.status !== 'cancelled').map((item) => ['', '2', item.ncf, '', '01', dateCompact(item.createdAt), '', item.totalCents / 100, item.taxCents / 100, 0,0,0,0,0,0,0,0,0,0,Math.max(0,(item.totalCents-item.paidCents)/100),0,0,0]);
  downloadText(`DGII_607_Los_Panitas_${date}.csv`, [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n'));
}

function invoiceRow(item) { const balance = Number(item.totalCents) - Number(item.paidCents || 0); return `<tr data-invoice-row data-search="${escapeHtml(`${item.invoiceNumber} ${item.clientName} ${item.ncf || ''}`.toLowerCase())}" data-status="${item.status}"><td><strong>${escapeHtml(item.invoiceNumber)}</strong><small>${documentLabel(item.documentType)}${item.ncf ? ` · ${escapeHtml(item.ncf)}` : ''}</small></td><td>${escapeHtml(item.clientName)}</td><td>${formatDate(item.createdAt)}</td><td>${formatMoney(item.totalCents)}</td><td>${formatMoney(balance)}</td><td><span class="document-status status-${item.status}">${statusLabel(item.status)}</span></td><td><button class="icon-button" data-invoice-view="${item.id}" aria-label="Ver documento"><i data-lucide="eye"></i></button></td></tr>`; }
function documentLabel(type) { return ({ invoice: 'Factura', quote: 'Cotización', proforma: 'Proforma' })[type] || 'Documento'; }
function statusLabel(status) { return ({ pending:'Pendiente', partial:'Parcial', paid:'Pagada', cancelled:'Anulada', converted:'Convertida' })[status] || status; }
function paymentLabel(method) { return ({ cash:'Efectivo',card:'Tarjeta',transfer:'Transferencia',check:'Cheque',credit:'Crédito' })[method] || method; }
function empty(icon,title,copy) { return `<div class="empty-state"><i data-lucide="${icon}"></i><strong>${title}</strong><p>${copy}</p></div>`; }
function metric(label,value,icon) { return `<article class="metric-card"><i data-lucide="${icon}"></i><div><span>${label}</span><strong>${value}</strong></div></article>`; }
function dateCompact(value) { const date = value?.toDate ? value.toDate() : new Date(value || Date.now()); return `${String(date.getFullYear()).slice(-2)}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`; }
