import { formatMoney, escapeHtml, formatDate } from '../lib/format.js';

const STATUS_LABELS = {
  pending: 'Pendiente', preparing: 'Preparando', ready: 'Lista', served: 'Servida',
  pending_payment: 'Por cobrar', closed: 'Cerrada', cancelled: 'Cancelada'
};

export function renderDashboard(state) {
  const today = new Date().toISOString().slice(0, 10);
  const todayInvoices = state.invoices.filter((item) => dateKey(item.createdAt) === today && item.status !== 'cancelled');
  const todaySales = todayInvoices.reduce((sum, item) => sum + Number(item.totalCents || 0), 0);
  const pending = state.orders.filter((item) => !['closed', 'cancelled'].includes(item.status));
  const openCash = state.cashSessions.find((item) => item.status === 'open' && item.openedBy === state.user.uid);
  return `
    <section class="panel-heading"><div><span class="eyebrow">Resumen operativo</span><h2>Así marcha el restaurante</h2><p>Ventas, cocina y caja en una sola lectura.</p></div><button class="button secondary" data-refresh><i data-lucide="refresh-cw"></i> Actualizar</button></section>
    <div class="metric-grid">
      ${metric('Ventas de hoy', formatMoney(todaySales), 'trending-up', 'positive')}
      ${metric('Documentos', String(todayInvoices.length), 'receipt-text')}
      ${metric('Comandas activas', String(pending.length), 'chef-hat', pending.length ? 'warning' : 'positive')}
      ${metric('Caja', openCash ? 'Abierta' : 'Cerrada', 'wallet-cards', openCash ? 'positive' : 'muted')}
    </div>
    <div class="dashboard-grid">
      <article class="surface-card"><header><div><span class="eyebrow">Cocina</span><h3>Comandas que requieren atención</h3></div>${state.capabilities.viewKds ? '<button class="text-button" data-route="kds">Abrir KDS</button>' : ''}</header>${renderOrderMiniList(pending.slice(0, 6))}</article>
      <article class="surface-card"><header><div><span class="eyebrow">Facturación</span><h3>Movimientos recientes</h3></div><button class="text-button" data-route="invoices">Ver todos</button></header>${renderInvoiceMiniList(state.invoices.slice(0, 6))}</article>
    </div>`;
}

export function renderPos(state) {
  const activeProducts = state.products.filter((item) => item.active !== false);
  const availableTables = state.tables.filter((item) => item.active !== false && !item.currentOrderId);
  return `
    <section class="panel-heading"><div><span class="eyebrow">Punto de venta</span><h2>Nueva venta o comanda</h2><p>Selecciona productos, mesa y destino del documento.</p></div><div class="status-chip ${state.activeCash ? 'online' : 'warning'}"><i data-lucide="wallet"></i>${state.activeCash ? 'Caja abierta' : 'Caja cerrada'}</div></section>
    <div class="pos-layout">
      <section class="surface-card product-browser">
        <div class="toolbar"><label class="search-field"><i data-lucide="search"></i><input id="product-search" type="search" placeholder="Buscar producto o SKU" autocomplete="off"></label>${state.capabilities.manageCatalog ? '<button class="button secondary compact" data-route="products"><i data-lucide="plus"></i> Producto</button>' : ''}</div>
        <div id="pos-products" class="product-grid">${activeProducts.length ? activeProducts.map(productCard).join('') : empty('package-open', 'Catálogo vacío', 'Agrega el primer producto para comenzar a vender.')}</div>
      </section>
      <aside class="surface-card cart-panel">
        <header><div><span class="eyebrow">Cuenta actual</span><h3>${state.cart.length} producto${state.cart.length === 1 ? '' : 's'}</h3></div><button class="icon-button" data-cart-clear aria-label="Vaciar cuenta"><i data-lucide="trash-2"></i></button></header>
        <div class="cart-lines">${state.cart.length ? state.cart.map(cartLine).join('') : empty('shopping-basket', 'Cuenta vacía', 'Toca un producto para agregarlo.')}</div>
        ${cartTotals(state.cart)}
        <form id="pos-checkout-form" class="stack-form">
          <div class="form-grid two"><label>Mesa<select name="tableId"><option value="">${state.capabilities.bill ? 'Venta directa' : 'Selecciona una mesa'}</option>${availableTables.map((table) => `<option value="${table.id}">${escapeHtml(table.name)}</option>`).join('')}</select></label>${state.capabilities.bill ? '<label class="document-type-field">Tipo<select name="documentType"><option value="invoice">Factura</option><option value="quote">Cotización</option><option value="proforma">Proforma</option></select></label>' : ''}</div>
          ${state.capabilities.manageClients ? `<label>Cliente<select name="clientId"><option value="">Consumidor final</option>${state.clients.filter((item) => item.active !== false).map((client) => `<option value="${client.id}">${escapeHtml(client.name)}</option>`).join('')}</select></label>` : ''}
          <div class="form-grid two restaurant-fields"><label>Prioridad<select name="priority"><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label><label>Nombre en mesa<input name="clientName" maxlength="160" placeholder="Consumidor final"></label></div>
          <label>Notas<input name="notes" maxlength="500" placeholder="Sin cebolla, alergias, entregar junto…"></label>
          ${state.capabilities.bill ? '<div class="form-grid two direct-payment-fields"><label>Forma de pago<select name="paymentMethod"><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="credit">Crédito</option></select></label><label>NCF<select name="ncfType"><option value="">Sin NCF</option><option value="B02">Consumidor B02</option><option value="B01">Crédito fiscal B01</option><option value="B14">Régimen especial B14</option><option value="B15">Gubernamental B15</option></select></label></div>' : ''}
          <button class="button primary full" type="submit" ${state.cart.length ? '' : 'disabled'}><i data-lucide="send"></i> Procesar cuenta</button>
        </form>
      </aside>
    </div>`;
}

export function renderTables(state) {
  return `
    <section class="panel-heading"><div><span class="eyebrow">Salón</span><h2>Mapa de mesas</h2><p>Disponibilidad y estado de cada comanda en tiempo real.</p></div><button class="button primary" data-route="pos"><i data-lucide="plus"></i> Nueva comanda</button></section>
    <div class="table-map">${state.tables.map((table) => {
      const order = state.orders.find((item) => item.id === table.currentOrderId);
      const status = order?.status || 'available';
      return `<article class="restaurant-table status-${status}" data-order-open="${order?.id || ''}"><div class="table-icon"><i data-lucide="utensils"></i></div><strong>${escapeHtml(table.name)}</strong><span>${order ? STATUS_LABELS[status] : 'Disponible'}</span>${order ? `<small>${formatMoney(order.totalCents)} · ${formatDate(order.createdAt, true)}</small>` : '<small>Lista para recibir clientes</small>'}</article>`;
    }).join('')}</div>`;
}

export function renderKds(state) {
  const orders = state.orders.filter((item) => ['pending', 'preparing', 'ready'].includes(item.status));
  return `
    <section class="panel-heading"><div><span class="eyebrow">Kitchen Display System</span><h2>Cocina en vivo</h2><p>Ordenadas por prioridad y antigüedad.</p></div><div class="live-indicator"><span></span> Sincronización activa</div></section>
    <div class="kds-grid">${orders.length ? orders.map(kdsCard).join('') : empty('badge-check', 'Cocina al día', 'No hay comandas activas en este momento.')}</div>`;
}

export function renderOrderDrawer(order, capabilities = {}) {
  if (!order) return '';
  return `<div class="modal-backdrop" data-modal-close><article class="modal-card order-detail" role="dialog" aria-modal="true" aria-labelledby="order-title" data-modal-card>
    <header><div><span class="eyebrow">${escapeHtml(order.tableName)}</span><h2 id="order-title">${escapeHtml(order.clientName)}</h2></div><button class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button></header>
    <div class="order-meta"><span class="order-status status-${order.status}">${STATUS_LABELS[order.status]}</span><span>${formatDate(order.createdAt, true)}</span><span>Rev. ${order.revision}</span></div>
    <ul class="order-items">${order.items.map((item) => `<li><div><strong>${item.quantity} × ${escapeHtml(item.name)}</strong>${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ''}</div><span>${formatMoney(item.unitPriceCents * item.quantity)}</span></li>`).join('')}</ul>
    ${order.notes ? `<p class="notice warning"><i data-lucide="message-square-warning"></i>${escapeHtml(order.notes)}</p>` : ''}
    <div class="total-row"><span>Total</span><strong>${formatMoney(order.totalCents)}</strong></div>
    <footer class="modal-actions">${order.status === 'ready' && (capabilities.serveOrder || capabilities.updateOrder) ? '<button class="button secondary" data-order-transition="served">Marcar servida</button>' : ''}${order.status === 'served' && (capabilities.serveOrder || capabilities.updateOrder) ? '<button class="button secondary" data-order-transition="pending_payment">Enviar a cobro</button>' : ''}${['served','pending_payment'].includes(order.status) && capabilities.chargeOrder ? '<button class="button primary" data-order-charge>Cobrar y cerrar</button>' : ''}${!['closed','cancelled'].includes(order.status) && capabilities.updateOrder ? '<button class="button danger ghost" data-order-cancel>Cancelar</button>' : ''}</footer>
  </article></div>`;
}

function metric(label, value, icon, tone = '') { return `<article class="metric-card ${tone}"><i data-lucide="${icon}"></i><div><span>${label}</span><strong>${value}</strong></div></article>`; }
function empty(icon, title, copy) { return `<div class="empty-state"><i data-lucide="${icon}"></i><strong>${title}</strong><p>${copy}</p></div>`; }
function dateKey(value) { const date = value?.toDate ? value.toDate() : new Date(value || 0); return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10); }
function productCard(item) { return `<button class="product-card" data-product-add="${item.id}" data-search="${escapeHtml(`${item.name} ${item.sku}`.toLowerCase())}"><span class="product-category">${escapeHtml(item.category || 'General')}</span><i data-lucide="utensils"></i><strong>${escapeHtml(item.name)}</strong><small>Existencia: ${item.stock}</small><b>${formatMoney(item.priceCents)}</b></button>`; }
function cartLine(item, index) { return `<div class="cart-line"><div><strong>${escapeHtml(item.name)}</strong><small>${formatMoney(item.unitPriceCents)} c/u</small></div><div class="quantity-control"><button type="button" data-cart-qty="${index}" data-delta="-1">−</button><span>${item.quantity}</span><button type="button" data-cart-qty="${index}" data-delta="1">+</button></div><b>${formatMoney(item.unitPriceCents * item.quantity)}</b></div>`; }
function cartTotals(items) { const subtotal = items.reduce((sum, item) => sum + Math.round(item.unitPriceCents * item.quantity), 0); const tax = items.reduce((sum, item) => sum + Math.round(item.unitPriceCents * item.quantity * (item.taxRate || 0) / 100), 0); return `<div class="cart-totals"><div><span>Subtotal</span><b>${formatMoney(subtotal)}</b></div><div><span>ITBIS</span><b>${formatMoney(tax)}</b></div><div class="grand-total"><span>Total</span><strong>${formatMoney(subtotal + tax)}</strong></div></div>`; }
function kdsCard(order) { const action = order.status === 'pending' ? ['preparing','Comenzar preparación'] : order.status === 'preparing' ? ['ready','Marcar lista'] : null; return `<article class="kds-card priority-${order.priority} status-${order.status}"><header><div><span>${escapeHtml(order.tableName)}</span><h3>${escapeHtml(order.clientName)}</h3></div><span class="order-status status-${order.status}">${STATUS_LABELS[order.status]}</span></header><div class="kds-time"><i data-lucide="clock-3"></i>${formatDate(order.createdAt, true)}${order.priority !== 'normal' ? `<b>${order.priority === 'urgent' ? 'URGENTE' : 'PRIORIDAD'}</b>` : ''}</div><ul>${order.items.map((item) => `<li><strong>${item.quantity}×</strong><span>${escapeHtml(item.name)}</span>${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ''}</li>`).join('')}</ul>${order.notes ? `<p>${escapeHtml(order.notes)}</p>` : ''}${action ? `<button class="button primary full" data-kds-order="${order.id}" data-next-status="${action[0]}">${action[1]}</button>` : '<span class="notice success">Lista para retirar</span>'}</article>`; }
function renderOrderMiniList(items) { return items.length ? `<div class="mini-list">${items.map((item) => `<button data-order-open="${item.id}"><span class="dot status-${item.status}"></span><div><strong>${escapeHtml(item.tableName)}</strong><small>${STATUS_LABELS[item.status]} · ${formatDate(item.createdAt, true)}</small></div><b>${formatMoney(item.totalCents)}</b></button>`).join('')}</div>` : empty('badge-check', 'Sin pendientes', 'Todo está bajo control.'); }
function renderInvoiceMiniList(items) { return items.length ? `<div class="mini-list">${items.map((item) => `<button data-invoice-view="${item.id}"><i data-lucide="receipt"></i><div><strong>${escapeHtml(item.invoiceNumber)}</strong><small>${escapeHtml(item.clientName)} · ${formatDate(item.createdAt)}</small></div><b>${formatMoney(item.totalCents)}</b></button>`).join('')}</div>` : empty('receipt', 'Sin documentos', 'Las ventas aparecerán aquí.'); }
