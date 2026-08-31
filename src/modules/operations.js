import { formatMoney, escapeHtml, formatDate } from '../lib/format.js';
import { calculateDocument } from '../domain/billing.js';

const STATUS_LABELS = {
  pending: 'Pendiente', preparing: 'Preparando', ready: 'Lista', served: 'Servida',
  pending_payment: 'Por cobrar', closed: 'Cerrada', cancelled: 'Cancelada'
};

export function renderDashboard(state) {
  const today = dateKey(new Date());
  const todayInvoices = state.invoices.filter((item) => dateKey(item.createdAt) === today && item.status !== 'cancelled');
  const todaySales = todayInvoices.reduce((sum, item) => sum + Number(item.totalCents || 0), 0);
  const pending = state.orders.filter((item) => !['closed', 'cancelled'].includes(item.status));
  const openCash = state.cashSessions.find((item) => item.status === 'open' && item.openedBy === state.user.uid);
  return `
    <div class="dashboard-desktop">
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
    </div>
    </div>
    ${renderMobileManagement(state)}`;
}

function renderMobileManagement(state) {
  const period = ['day', 'week', 'month', 'year'].includes(state.mobileReportPeriod) ? state.mobileReportPeriod : 'day';
  const labels = { day: 'Hoy', week: 'Semana', month: 'Mes', year: 'Año' };
  const sales = state.invoices.filter((invoice) => isSaleInPeriod(invoice, period));
  const totalCents = sales.reduce((sum, invoice) => sum + Number(invoice.totalCents || 0), 0);
  const paidCents = (state.payments || []).filter((payment) => isDateInPeriod(payment.createdAt, period)).reduce((sum, payment) => sum + Number(payment.amountCents || 0), 0);
  const topProducts = topSellingProducts(sales).slice(0, 5);
  const products = [...(state.products || [])].filter((item) => item.active !== false).sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return `
    <section class="mobile-management" aria-label="Panel móvil de gestión">
      <div class="mobile-management-heading">
        <div><span class="eyebrow">Panel móvil</span><h2>Negocio en tu mano</h2><p>Consulta el rendimiento y registra conteos de inventario desde el teléfono.</p></div>
        <span class="live-indicator"><span></span> En vivo</span>
      </div>
      <div class="mobile-period-tabs" role="tablist" aria-label="Período del reporte">
        ${Object.entries(labels).map(([id, label]) => `<button type="button" class="${period === id ? 'active' : ''}" data-mobile-period="${id}" aria-pressed="${period === id}">${label}</button>`).join('')}
      </div>
      <div class="mobile-performance-grid">
        ${mobileMetric('Facturado', formatMoney(totalCents), 'receipt-text')}
        ${mobileMetric('Cobrado', formatMoney(paidCents), 'circle-dollar-sign')}
        ${mobileMetric('Ventas', String(sales.length), 'shopping-cart')}
        ${mobileMetric('Ticket promedio', sales.length ? formatMoney(Math.round(totalCents / sales.length)) : formatMoney(0), 'chart-no-axes-combined')}
      </div>
      <article class="surface-card mobile-top-products">
        <header><div><span class="eyebrow">Más vendidos · ${labels[period]}</span><h3>Productos que mueven el negocio</h3></div></header>
        ${topProducts.length ? `<ol>${topProducts.map((item, index) => `<li><span class="top-product-rank">${index + 1}</span><div><strong>${escapeHtml(item.name)}</strong><small>${formatQuantity(item.quantity)} vendidos · ${formatMoney(item.totalCents)}</small></div><b>${formatQuantity(item.quantity)}</b></li>`).join('')}</ol>` : empty('chart-no-axes-combined', 'Aún no hay ventas', 'Los artículos más vendidos aparecerán al registrar facturas.')}
      </article>
      ${state.capabilities.manageCatalog ? `
        <article class="surface-card mobile-inventory">
          <header><div><span class="eyebrow">Inventario móvil</span><h3>Registrar conteo físico</h3><p>Escribe la existencia real y guarda. Cada cambio queda registrado.</p></div></header>
          <div class="mobile-inventory-list">
            ${products.length ? products.map((product) => mobileInventoryRow(product)).join('') : empty('package-open', 'No hay productos', 'Crea productos desde el catálogo para poder contar existencias.')}
          </div>
        </article>` : ''}
    </section>`;
}

function mobileMetric(label, value, icon) {
  return `<article class="mobile-performance-card"><i data-lucide="${icon}"></i><span>${label}</span><strong>${value}</strong></article>`;
}

function mobileInventoryRow(product) {
  const stock = Number(product.stock || 0);
  return `<form class="mobile-inventory-row" data-mobile-inventory-form data-product-id="${escapeHtml(product.id)}">
    <div class="mobile-inventory-product"><i data-lucide="package"></i><div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category || 'General')} · actual: ${formatQuantity(stock)}</small></div></div>
    <div class="mobile-stock-editor">
      <button type="button" data-mobile-inventory-step="-1" aria-label="Restar una unidad a ${escapeHtml(product.name)}"><i data-lucide="minus"></i></button>
      <label><span>Conteo real</span><input name="targetStock" data-mobile-stock-input type="number" min="0" step="0.001" inputmode="decimal" value="${stock}"></label>
      <button type="button" data-mobile-inventory-step="1" aria-label="Sumar una unidad a ${escapeHtml(product.name)}"><i data-lucide="plus"></i></button>
    </div>
    <label class="mobile-inventory-note"><span>Nota (opcional)</span><input name="reason" maxlength="300" placeholder="Ej. Llegó mercancía"></label>
    <button class="button secondary compact" type="submit"><i data-lucide="save"></i> Guardar conteo</button>
  </form>`;
}

function isSaleInPeriod(invoice, period) {
  if (invoice?.documentType !== 'invoice' || invoice.status === 'cancelled') return false;
  return isDateInPeriod(invoice.createdAt, period);
}

function isDateInPeriod(value, period) {
  const date = asDate(value);
  if (!date) return false;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'week') {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
  } else if (period === 'month') {
    start.setDate(1);
  } else if (period === 'year') {
    start.setMonth(0, 1);
  }
  return date >= start && date <= now;
}

function topSellingProducts(invoices) {
  const products = new Map();
  invoices.forEach((invoice) => (invoice.items || []).forEach((line) => {
    const key = String(line.productId || line.name || 'producto');
    const item = products.get(key) || { name: String(line.name || 'Producto'), quantity: 0, totalCents: 0 };
    const quantity = Number(line.quantity || 0);
    item.quantity += quantity;
    item.totalCents += Number(line.totalCents ?? (Number(line.unitPriceCents || 0) * quantity));
    products.set(key, item);
  }));
  return [...products.values()].sort((a, b) => b.quantity - a.quantity || b.totalCents - a.totalCents);
}

function asDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatQuantity(value) {
  return new Intl.NumberFormat('es-DO', { maximumFractionDigits: 3 }).format(Number(value || 0));
}

export function renderPos(state) {
  const products = Array.isArray(state.products) ? state.products : [];
  const tables = Array.isArray(state.tables) ? state.tables : [];
  const clients = Array.isArray(state.clients) ? state.clients : [];
  const cart = Array.isArray(state.cart) ? state.cart : [];
  const activeProducts = products.filter((item) => item.active !== false);
  const availableTables = tables.filter((item) => item.active !== false && !item.currentOrderId);
  const categories = ['Todos', ...new Set(activeProducts.map((p) => p.category || 'General').filter(Boolean))];
  const hardware = state.hardwareStatus || {};
  const draft = state.posDraft || {};
  const selectedTableId = draft.tableId ?? state.preselectedTableId ?? '';
  const selectedCategory = categories.includes(state.posCategory) ? state.posCategory : 'Todos';
  const totals = calculateDocument(cart, state.posDiscountState || {});
  const mobileAction = selectedTableId
    ? 'Enviar comanda'
    : state.posPaymentMethod === 'credit'
      ? `Registrar fiao ${formatMoney(totals.totalCents)}`
      : `Cobrar ${formatMoney(totals.totalCents)}`;
  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Venta rápida</span>
        <h2>1. Elige los productos</h2>
        <p>Al terminar, toca Cobrar y confirma con tu PIN de cuatro dígitos.</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <span class="hw-chip ${hardware.printerConnected ? 'online' : 'warning'}"><i data-lucide="printer"></i> ${hardware.printerConnected ? 'Impresora lista' : 'Impresora sin confirmar'}</span>
        ${state.activeCash
          ? `<div class="status-chip online"><i data-lucide="wallet"></i>Caja lista</div>`
          : `<div class="status-chip warning"><i data-lucide="key-round"></i>El PIN iniciará la caja</div>`
        }
      </div>
    </section>

    ${hardware.paperOut ? `
      <div style="background:rgba(248,81,73,.16);border:2px solid #f85149;border-radius:12px;padding:12px 18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#fff;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:36px;height:36px;border-radius:50%;background:#f85149;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.1rem;flex-shrink:0;">
            <i data-lucide="alert-triangle" style="width:20px;height:20px;"></i>
          </div>
          <div>
            <strong style="font-size:0.95rem;color:#f85149;display:block;">¡LA IMPRESORA TÉRMICA SE QUEDÓ SIN PAPEL!</strong>
            <span style="font-size:0.82rem;color:#e6edf3;">Se ha agotado el rollo en la impresora Star integrada. Abre la tapa superior y reemplázalo por un rollo térmico nuevo de 80mm.</span>
          </div>
        </div>
        <button type="button" class="button secondary compact" data-check-paper style="border-color:#f85149;color:#fff;background:rgba(248,81,73,.25);white-space:nowrap;font-weight:700;">
          <i data-lucide="refresh-cw"></i> Ya cambié el rollo
        </button>
      </div>
    ` : hardware.paperLow ? `
      <div style="background:rgba(215,154,60,.12);border:1px solid rgba(215,154,60,.4);border-radius:10px;padding:8px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;color:#e6edf3;font-size:0.82rem;">
        <i data-lucide="alert-circle" style="color:var(--brand-2);width:18px;height:18px;flex-shrink:0;"></i>
        <span><strong>Aviso de papel:</strong> El rollo de la impresora térmica está por terminarse (sensor near-end). Ten listo un rollo nuevo de 80mm.</span>
      </div>
    ` : ''}

    <button class="mobile-pos-charge" type="submit" form="pos-checkout-form" ${cart.length ? '' : 'disabled'}>
      <i data-lucide="key-round"></i><span>${mobileAction}</span>
    </button>
    <div class="pos-layout">
      <section class="surface-card product-browser">
        <div class="toolbar">
          <label class="search-field">
            <i data-lucide="search"></i>
            <input id="product-search" type="search" value="${escapeHtml(state.posSearch || '')}" placeholder="Buscar por nombre o escanear SKU/código..." autocomplete="off">
          </label>
        </div>
        <div class="pos-category-bar" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;margin:8px 0 12px;-webkit-overflow-scrolling:touch;">
          ${categories.map((cat) => `
            <button type="button" class="category-pill ${cat === selectedCategory ? 'active' : ''}" data-cat-filter="${escapeHtml(cat)}" style="padding:7px 14px;border-radius:999px;font-size:0.8rem;font-weight:600;white-space:nowrap;border:1px solid ${cat === selectedCategory ? 'var(--brand-2)' : 'var(--line)'};background:${cat === selectedCategory ? 'rgba(215,154,60,.15)' : 'rgba(255,255,255,.04)'};color:${cat === selectedCategory ? 'var(--brand-2)' : '#ccc'};cursor:pointer;">
              ${escapeHtml(cat)}
            </button>
          `).join('')}
        </div>
        <div id="pos-products" class="product-grid">${activeProducts.length ? activeProducts.map(productCard).join('') : empty('package-open', 'Catálogo vacío', 'Agrega el primer producto para comenzar a vender.')}</div>
      </section>
      <aside class="surface-card cart-panel pos-fast-cart">
        <form id="pos-checkout-form" class="pos-checkout-form-inner">
          <input type="hidden" name="paymentMethod" id="pos-payment-method" value="${state.posPaymentMethod || 'cash'}">
        <!-- PASO 1: LO QUE PIDIÓ EL CLIENTE -->
        <header class="pos-cart-header">
          <div>
            <span class="eyebrow">Cuenta actual</span>
            <h3 id="pos-cart-heading">${state.cart.length ? `${state.cart.length} producto${state.cart.length === 1 ? '' : 's'}` : 'Vacía'}</h3>
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <button type="button" class="button secondary compact" data-cart-clear aria-label="Nueva venta" title="Limpiar y comenzar venta nueva">
              <i data-lucide="trash-2"></i> Limpiar
            </button>
          </div>
        </header>

        <div class="cart-lines">${state.cart.length ? state.cart.map(cartLine).join('') : empty('shopping-basket', 'Cuenta vacía', 'Toca un producto del menú para agregarlo.')}</div>

        <div class="cart-totals-block">
          ${renderCartTotals(state.cart, state.posDiscountState)}
        </div>

        <!-- Opciones opcionales: Mesa, NCF, Descuento -->
        <details class="pos-advanced-toggle" id="pos-advanced-details" ${draft.advancedOpen ? 'open' : ''}>
          <summary>
            <i data-lucide="sliders-horizontal"></i>
            <span>Mesa · NCF · Descuento</span>
            <i data-lucide="chevron-down" class="chevron-icon"></i>
          </summary>
          <div class="pos-advanced-body">
            <div class="form-grid two">
              <label>Mesa de salón
                <select name="tableId" id="pos-table-select">
                  <option value="">Mostrador / para llevar</option>
                  ${availableTables.map((table) => `<option value="${table.id}" ${selectedTableId === table.id ? 'selected' : ''}>${escapeHtml(table.name)}</option>`).join('')}
                </select>
              </label>
              <label>Comprobante NCF
                <select name="ncfType" id="pos-ncf-type">
                  <option value="" ${!draft.ncfType ? 'selected' : ''}>Sin NCF</option>
                  <option value="B02" ${draft.ncfType === 'B02' ? 'selected' : ''}>Consumidor B02</option>
                  <option value="B01" ${draft.ncfType === 'B01' ? 'selected' : ''}>Crédito Fiscal B01</option>
                  <option value="B14" ${draft.ncfType === 'B14' ? 'selected' : ''}>Régimen Especial B14</option>
                  <option value="B15" ${draft.ncfType === 'B15' ? 'selected' : ''}>Gubernamental B15</option>
                </select>
              </label>
            </div>
            <div id="pos-rnc-container" ${draft.ncfType === 'B01' ? '' : 'hidden'}>
              <label>RNC / Cédula (Crédito Fiscal B01)
                <input name="posClientRnc" id="pos-client-rnc" maxlength="14" value="${escapeHtml(draft.clientRnc || '')}" placeholder="9 u 11 dígitos sin guiones">
              </label>
            </div>
            <div class="form-grid two">
              <label>Descuento
                <div style="display:flex;gap:4px;">
                  <input name="posDiscountValue" id="pos-discount-value" type="number" min="0" step="1" placeholder="0" value="${state.posDiscountState?.discount || ''}">
                  <select name="posDiscountType" id="pos-discount-type" style="width:72px;padding:6px;">
                    <option value="amount" ${state.posDiscountState?.discountType === 'amount' ? 'selected' : ''}>RD$</option>
                    <option value="percent" ${state.posDiscountState?.discountType === 'percent' ? 'selected' : ''}>%</option>
                  </select>
                </div>
              </label>
              <label style="display:flex;align-items:center;gap:8px;padding-top:20px;cursor:pointer;">
                <input name="posIncludeLegalTip" id="pos-legal-tip" type="checkbox" style="width:18px;height:18px;accent-color:var(--brand-2);" ${state.posDiscountState?.includeLegalTip ? 'checked' : ''}>
                <span style="font-size:0.82rem;font-weight:600;">Propina 10% (Ley)</span>
              </label>
            </div>
            <label>Nota de la orden
              <input name="notes" maxlength="500" value="${escapeHtml(draft.notes || '')}" placeholder="Sin picante, entregar rápido...">
            </label>
            ${state.cart.length ? `<button type="button" class="button secondary compact" data-print-cart-prebill><i data-lucide="receipt"></i> Imprimir pre-cuenta</button>` : ''}
          </div>
        </details>

        <!-- PASO 2: FORMA DE PAGO -->
          <div id="pos-payment-options">
          <div class="pos-step-label">
            <span class="pos-step-badge">2</span>
            <span>¿Cómo paga?</span>
          </div>
          <div class="pos-pay-method-grid">
            <button type="button" class="pos-pay-btn ${(state.posPaymentMethod || 'cash') === 'cash' ? 'active' : ''}" data-pos-method="cash">
              <i data-lucide="banknote"></i>
              <span>Efectivo</span>
            </button>
            <button type="button" class="pos-pay-btn ${state.posPaymentMethod === 'card' ? 'active' : ''}" data-pos-method="card">
              <i data-lucide="credit-card"></i>
              <span>Tarjeta Azul</span>
            </button>
            <button type="button" class="pos-pay-btn ${state.posPaymentMethod === 'transfer' ? 'active' : ''}" data-pos-method="transfer">
              <i data-lucide="landmark"></i>
              <span>Transferencia</span>
            </button>
            <button type="button" class="pos-pay-btn fiao ${state.posPaymentMethod === 'credit' ? 'active' : ''}" data-pos-method="credit">
              <i data-lucide="book-open"></i>
              <span>Fiao</span>
            </button>
          </div>

          <!-- Panel Efectivo -->
          <div id="pos-cash-panel" class="pos-method-panel ${(state.posPaymentMethod || 'cash') === 'cash' ? 'visible' : ''}">
            <details class="pos-cash-optional" ${draft.cashOpen ? 'open' : ''}>
            <summary>¿Necesitas calcular la devuelta?</summary>
            <div class="pos-cash-optional-body">
            <div class="pos-step-label">
              <span>Monto entregado (DOP)</span>
            </div>
            <input id="pos-cash-received" type="number" step="0.01" min="0"
              value="${escapeHtml(draft.cashReceived || '')}" placeholder="0.00" autocomplete="off" inputmode="decimal"
              class="pos-cash-input">
            <div class="pos-bill-grid">
              <button type="button" class="pos-bill-btn exact" data-cash-val="exact">Exacto</button>
              <button type="button" class="pos-bill-btn" data-cash-val="100">$100</button>
              <button type="button" class="pos-bill-btn" data-cash-val="200">$200</button>
              <button type="button" class="pos-bill-btn" data-cash-val="500">$500</button>
              <button type="button" class="pos-bill-btn" data-cash-val="1000">$1,000</button>
              <button type="button" class="pos-bill-btn" data-cash-val="2000">$2,000</button>
            </div>
            <div id="pos-change-display" class="pos-change-display">
              <span>Devuelta / Cambio:</span>
              <strong id="pos-change-amount">RD$ 0.00</strong>
            </div>
            </div>
            </details>
          </div>

          <!-- Panel Tarjeta Azul -->
          <div id="pos-card-panel" class="pos-method-panel ${state.posPaymentMethod === 'card' ? 'visible' : ''}">
            <div class="pos-method-detail-card" style="border-color:rgba(84,201,141,.4);background:rgba(84,201,141,.07);">
              <div class="pos-method-detail-title">
                <i data-lucide="credit-card"></i>
                <strong>Terminal Azul (Verifone)</strong>
              </div>
              <p class="pos-method-detail-hint">Cobra primero en la maquinita de Azul, luego presiona Cobrar aquí para registrar e imprimir la factura.</p>
              <label>No. de Aprobación (Opcional)
                <input name="cardReference" id="pos-card-reference" value="${escapeHtml(draft.cardReference || '')}" placeholder="Ej: 123456" maxlength="60" inputmode="numeric">
              </label>
            </div>
          </div>

          <!-- Panel Transferencia -->
          <div id="pos-transfer-panel" class="pos-method-panel ${state.posPaymentMethod === 'transfer' ? 'visible' : ''}">
            <div class="pos-method-detail-card" style="border-color:rgba(115,168,239,.4);background:rgba(115,168,239,.07);">
              <div class="pos-method-detail-title">
                <i data-lucide="landmark"></i>
                <strong>Transferencia Bancaria</strong>
              </div>
              <label>No. de Confirmación (Opcional)
                <input name="transferReference" id="pos-transfer-reference" value="${escapeHtml(draft.transferReference || '')}" placeholder="Ej: BHD 987654" maxlength="60">
              </label>
            </div>
          </div>

          <!-- Panel Fiao -->
          <div id="pos-fiao-panel" class="pos-method-panel ${state.posPaymentMethod === 'credit' ? 'visible' : ''}">
            <div class="pos-method-detail-card" style="border-color:rgba(248,81,73,.4);background:rgba(248,81,73,.07);">
              <div class="pos-method-detail-title">
                <i data-lucide="book-open"></i>
                <strong>Fiao — Fiado</strong>
              </div>
              <label>Nombre de quien se lleva el fiao <strong style="color:#f85149;">*</strong>
                <input name="fiaoClientName" id="pos-fiao-name" value="${escapeHtml(draft.fiaoClientName || '')}" placeholder="Ej: Pedro Mecánico, Sra. López..." maxlength="160">
              </label>
              <div style="margin-top:6px;">
                <span style="font-size:0.75rem;color:var(--muted);">O selecciona un cliente registrado:</span>
                <select id="pos-fiao-client-select" style="margin-top:4px;font-size:0.85rem;">
                  <option value="">Seleccionar cliente registrado...</option>
                  ${clients.filter(c => c.active !== false).map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
          </div>

        </form>
        <!-- El cobro queda fuera del área desplazable para que nunca tape
             productos, métodos de pago ni campos de la venta. -->
        <button
          class="pos-cobrar-btn"
          type="submit"
          form="pos-checkout-form"
          id="pos-submit-btn"
          ${cart.length ? '' : 'disabled'}
        >
          <i data-lucide="key-round"></i>
          <span id="pos-submit-label">Cobrar ${formatMoney(totals.totalCents)}</span>
        </button>
      </aside>
    </div>`;
}

export function renderTables(state) {
  return `
    <section class="panel-heading"><div><span class="eyebrow">Salón</span><h2>Mapa de mesas</h2><p>Disponibilidad y estado de cada comanda en tiempo real.</p></div><button class="button primary" data-route="pos"><i data-lucide="plus"></i> Nueva comanda</button></section>
    <div class="table-map">${state.tables.map((table) => {
      const order = state.orders.find((item) => item.id === table.currentOrderId);
      const status = order?.status || 'available';
      return `<button type="button" class="restaurant-table status-${status}" ${order ? `data-order-open="${order.id}"` : `data-table-start="${table.id}"`}><div class="table-icon"><i data-lucide="utensils"></i></div><strong>${escapeHtml(table.name)}</strong><span>${order ? STATUS_LABELS[status] : 'Disponible'}</span>${order ? `<small>${formatMoney(order.totalCents)} · ${formatDate(order.createdAt, true)}</small>` : '<small>Toca para iniciar una comanda</small>'}</button>`;
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
    <ul class="order-items">${order.items.map((item) => `<li><div><strong>${item.quantity} × ${escapeHtml(item.name)}</strong>${item.notes ? `<small style="display:block;color:var(--brand-2);">↳ ${escapeHtml(item.notes)}</small>` : ''}</div><span>${formatMoney(item.unitPriceCents * item.quantity)}</span></li>`).join('')}</ul>
    ${order.notes ? `<p class="notice warning"><i data-lucide="message-square-warning"></i>${escapeHtml(order.notes)}</p>` : ''}
    <div class="total-row"><span>Total</span><strong>${formatMoney(order.totalCents)}</strong></div>
    <footer class="modal-actions">
      <button class="button secondary" data-order-prebill="${order.id}"><i data-lucide="receipt"></i> Pre-cuenta</button>
      <button class="button secondary" data-order-print="${order.id}"><i data-lucide="printer"></i> Imprimir comanda</button>
      ${order.status === 'ready' && (capabilities.serveOrder || capabilities.updateOrder) ? '<button class="button secondary" data-order-transition="served">Marcar servida</button>' : ''}
      ${order.status === 'served' && (capabilities.serveOrder || capabilities.updateOrder) ? '<button class="button secondary" data-order-transition="pending_payment">Enviar a cobro</button>' : ''}
      ${['served','pending_payment'].includes(order.status) && capabilities.chargeOrder ? '<button class="button primary" data-order-charge>Cobrar y cerrar</button>' : ''}
      ${!['closed','cancelled'].includes(order.status) && capabilities.updateOrder ? '<button class="button danger ghost" data-order-cancel>Cancelar</button>' : ''}
    </footer>
  </article></div>`;
}

function metric(label, value, icon, tone = '') { return `<article class="metric-card ${tone}"><i data-lucide="${icon}"></i><div><span>${label}</span><strong>${value}</strong></div></article>`; }
function empty(icon, title, copy) { return `<div class="empty-state"><i data-lucide="${icon}"></i><strong>${title}</strong><p>${copy}</p></div>`; }
function dateKey(value) {
  const date = value?.toDate ? value.toDate() : new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function productCard(item) {
  return `<button class="product-card" data-product-add="${item.id}" data-category="${escapeHtml(item.category || 'General')}" data-search="${escapeHtml(`${item.name} ${item.sku || ''} ${item.category || ''}`.toLowerCase())}">
    <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
      <span class="product-category">${escapeHtml(item.category || 'General')}</span>
      ${item.sku ? `<span style="font-size:.65rem;background:rgba(215,154,60,.12);color:var(--brand-2);padding:2px 6px;border-radius:4px;font-family:monospace;"><i data-lucide="barcode" style="width:10px;height:10px;display:inline-block;vertical-align:-1px;"></i> ${escapeHtml(item.sku)}</span>` : ''}
    </div>
    <i data-lucide="utensils"></i>
    <strong>${escapeHtml(item.name)}</strong>
    <small>Existencia: ${item.stock}</small>
    <b>${formatMoney(item.priceCents)}</b>
  </button>`;
}
function cartLine(item, index) {
  return `<div class="cart-line">
    <div style="flex:1;">
      <strong>${escapeHtml(item.name)}</strong>
      <small>${formatMoney(item.unitPriceCents)} c/u</small>
      ${item.notes ? `<div style="font-size:0.72rem;color:var(--brand-2);margin-top:2px;">↳ ${escapeHtml(item.notes)}</div>` : ''}
    </div>
    <div class="quantity-control">
      <button type="button" data-cart-qty="${index}" data-delta="-1">−</button>
      <span data-cart-set-qty="${index}" style="cursor:pointer;font-weight:700;" title="Tocar para editar">${item.quantity}</span>
      <button type="button" data-cart-qty="${index}" data-delta="1">+</button>
      <button type="button" class="icon-button" data-cart-item-note="${index}" style="padding:4px;width:26px;height:26px;" title="Agregar nota al plato"><i data-lucide="message-square-plus" style="width:14px;height:14px;"></i></button>
    </div>
    <b>${formatMoney(item.unitPriceCents * item.quantity)}</b>
  </div>`;
}

export function renderCartTotals(items, discountState = { discount: 0, discountType: 'amount', includeLegalTip: false }) {
  if (!items || !items.length) {
    return `<div class="cart-totals"><div><span>Subtotal</span><b>RD$ 0.00</b></div><div class="grand-total"><span>Total</span><strong>RD$ 0.00</strong></div></div>`;
  }
  const res = calculateDocument(items, discountState || {});
  return `<div class="cart-totals">
    <div><span>Subtotal</span><b>${formatMoney(res.subtotalCents)}</b></div>
    ${res.discountCents > 0 ? `<div style="color:#d9534f;"><span>Descuento</span><b>-${formatMoney(res.discountCents)}</b></div>` : ''}
    <div><span>ITBIS</span><b>${formatMoney(res.taxCents)}</b></div>
    ${res.tipCents > 0 ? `<div style="color:var(--brand-2);"><span>Propina Ley (10%)</span><b>${formatMoney(res.tipCents)}</b></div>` : ''}
    <div class="grand-total"><span>Total</span><strong>${formatMoney(res.totalCents)}</strong></div>
  </div>`;
}

function kdsCard(order) { const action = order.status === 'pending' ? ['preparing','Comenzar preparación'] : order.status === 'preparing' ? ['ready','Marcar lista'] : null; return `<article class="kds-card priority-${order.priority} status-${order.status}"><header><div><span>${escapeHtml(order.tableName)}</span><h3>${escapeHtml(order.clientName)}</h3></div><span class="order-status status-${order.status}">${STATUS_LABELS[order.status]}</span></header><div class="kds-time"><i data-lucide="clock-3"></i>${formatDate(order.createdAt, true)}${order.priority !== 'normal' ? `<b>${order.priority === 'urgent' ? 'URGENTE' : 'PRIORIDAD'}</b>` : ''}</div><ul>${order.items.map((item) => `<li><strong>${item.quantity}×</strong><span>${escapeHtml(item.name)}</span>${item.notes ? `<small style="display:block;color:var(--brand-2);">↳ ${escapeHtml(item.notes)}</small>` : ''}</li>`).join('')}</ul>${order.notes ? `<p>${escapeHtml(order.notes)}</p>` : ''}${action ? `<button class="button primary full" data-kds-order="${order.id}" data-next-status="${action[0]}">${action[1]}</button>` : '<span class="notice success">Lista para retirar</span>'}</article>`; }
function renderOrderMiniList(items) { return items.length ? `<div class="mini-list">${items.map((item) => `<button data-order-open="${item.id}"><span class="dot status-${item.status}"></span><div><strong>${escapeHtml(item.tableName)}</strong><small>${STATUS_LABELS[item.status]} · ${formatDate(item.createdAt, true)}</small></div><b>${formatMoney(item.totalCents)}</b></button>`).join('')}</div>` : empty('badge-check', 'Sin pendientes', 'Todo está bajo control.'); }
function renderInvoiceMiniList(items) { return items.length ? `<div class="mini-list">${items.map((item) => `<button data-invoice-view="${item.id}"><i data-lucide="receipt"></i><div><strong>${escapeHtml(item.invoiceNumber)}</strong><small>${escapeHtml(item.clientName)} · ${formatDate(item.createdAt)}</small></div><b>${formatMoney(item.totalCents)}</b></button>`).join('')}</div>` : empty('receipt', 'Sin documentos', 'Las ventas aparecerán aquí.'); }
