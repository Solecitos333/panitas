import { formatMoney, escapeHtml, formatDate } from '../lib/format.js';
import { calculateDocument } from '../domain/billing.js';
import { businessDateKey, inBusinessPeriod } from '../lib/business-time.js';

const STATUS_LABELS = {
  pending: 'Pendiente', preparing: 'Preparando', ready: 'Lista', served: 'Servida',
  pending_payment: 'Por cobrar', closed: 'Cerrada', cancelled: 'Cancelada'
};

export function renderDashboard(state) {
  const today = businessDateKey(new Date());
  const todayInvoices = state.invoices.filter((item) => businessDateKey(item.createdAt) === today && item.status !== 'cancelled' && item.documentType === 'invoice');
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
  return inBusinessPeriod(value, period);
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
    <header class="pos-topbar">
      <div class="pos-topbar-left">
        <div class="pos-topbar-title">
          <span class="pos-badge-live">VENTA RÁPIDA</span>
          <h2>Punto de Venta</h2>
        </div>
        ${selectedTableId ? `<span class="pos-table-indicator"><i data-lucide="utensils"></i> Mesa asignada</span>` : ''}
      </div>
      <div class="pos-topbar-right">
        <span class="hw-chip ${hardware.printerConnected ? 'online' : 'warning'}"><i data-lucide="printer"></i> ${hardware.printerConnected ? 'Impresora lista' : 'Impresora sin confirmar'}</span>
        ${state.activeCash
          ? `<div class="status-chip online"><i data-lucide="wallet"></i>Caja lista</div>`
          : `<div class="status-chip warning"><i data-lucide="key-round"></i>El PIN iniciará la caja</div>`
        }
      </div>
    </header>

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
        <div class="toolbar pos-toolbar">
          <label class="search-field pos-search-field">
            <i data-lucide="search"></i>
            <input id="product-search" type="search" value="${escapeHtml(state.posSearch || '')}" placeholder="Buscar por nombre o escanear SKU/código..." autocomplete="off">
          </label>
        </div>
        <div class="pos-category-bar">
          ${categories.map((cat) => {
            const meta = getCategoryMeta(cat);
            const isAct = cat === selectedCategory;
            return `
              <button type="button" class="category-pill ${isAct ? 'active' : ''}" data-cat-filter="${escapeHtml(cat)}" style="${isAct ? '' : `border-color:${meta.border};`}">
                <i data-lucide="${meta.icon}"></i>
                <span>${escapeHtml(cat)}</span>
              </button>
            `;
          }).join('')}
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

        <div class="pos-cart-scroll-area">
        <div class="cart-lines">${renderCartLines(state.cart)}</div>

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
              <button type="button" class="pos-bill-btn clear" data-cash-val="clear" style="color:#f85149;">Borrar</button>
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
                <strong>Fiao — Registro de Cuenta por Cobrar</strong>
              </div>

              <!-- Selector de cliente frecuente -->
              <div style="margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                  <span style="font-size:0.75rem;color:var(--muted);font-weight:600;">Cliente frecuente registrado:</span>
                  <button type="button" class="button secondary compact" data-client-new style="font-size:0.72rem;padding:2px 7px;height:auto;line-height:1.2;gap:3px;">
                    <i data-lucide="user-plus" style="width:12px;height:12px;"></i> + Registrar
                  </button>
                </div>
                <select id="pos-fiao-client-select" style="font-size:0.85rem;width:100%;">
                  <option value="">-- Seleccionar de la lista --</option>
                  ${clients.filter(c => c.active !== false).map(c => `<option value="${escapeHtml(c.id)}" data-name="${escapeHtml(c.name)}" data-phone="${escapeHtml(c.phone || '')}" data-notes="${escapeHtml(c.notes || '')}" data-limit="${c.creditLimitCents || 0}">${escapeHtml(c.name)}${c.phone ? ' · ' + escapeHtml(c.phone) : ''}</option>`).join('')}
                </select>
              </div>

              <input type="hidden" name="fiaoClientId" id="pos-fiao-client-id" value="${escapeHtml(draft.fiaoClientId || '')}">

              <!-- Nombre o apodo obligatorio -->
              <label style="font-size:0.82rem;font-weight:600;">Nombre o apodo del deudor <strong style="color:#f85149;">*</strong>
                <input name="fiaoClientName" id="pos-fiao-name" value="${escapeHtml(draft.fiaoClientName || '')}" placeholder="Ej: Pedro Mecánico, Doña Carmen..." maxlength="160" required>
              </label>

              <!-- Teléfono / WhatsApp de contacto -->
              <label style="font-size:0.82rem;font-weight:600;margin-top:6px;">Teléfono móvil / WhatsApp (para llamar o cobrar)
                <div style="position:relative;display:flex;align-items:center;">
                  <i data-lucide="phone" style="position:absolute;left:10px;width:15px;height:15px;color:var(--muted);pointer-events:none;"></i>
                  <input name="fiaoClientPhone" id="pos-fiao-phone" type="tel" inputmode="tel" value="${escapeHtml(draft.fiaoClientPhone || '')}" placeholder="Ej: 809-555-1234 o 829..." maxlength="30" style="padding-left:32px;">
                </div>
              </label>

              <!-- Referencia / promesa de pago -->
              <label style="font-size:0.82rem;font-weight:600;margin-top:6px;">Referencia / Promesa de pago (opcional)
                <input name="fiaoNotes" id="pos-fiao-notes" value="${escapeHtml(draft.fiaoNotes || '')}" placeholder="Ej: Taller del lado, pasa a pagar el viernes..." maxlength="200">
              </label>

              <!-- Casilla guardar en clientes habituales -->
              <label class="check-field" style="font-size:0.78rem;margin-top:8px;color:var(--muted);display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="fiaoSaveAsClient" id="pos-fiao-save-client" ${draft.fiaoSaveAsClient === false ? '' : 'checked'}>
                Guardar o actualizar en lista de clientes
              </label>

              <!-- Alerta reactiva de deuda previa -->
              <div id="pos-fiao-debt-info" style="display:none;margin-top:8px;padding:8px 10px;border-radius:8px;background:rgba(248,81,73,.15);border:1px solid rgba(248,81,73,.35);font-size:0.8rem;color:#f85149;line-height:1.3;">
                <i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;"></i>
                <span id="pos-fiao-debt-text"></span>
              </div>
            </div>
          </div>
          </div>
          </div>

          <!-- El cobro queda fijo al fondo del formulario para que nunca tape
               productos, métodos de pago ni campos de la venta. -->
          <button
            class="pos-cobrar-btn"
            type="submit"
            id="pos-submit-btn"
            ${cart.length ? '' : 'disabled'}
          >
            <i data-lucide="key-round"></i>
            <span id="pos-submit-label">Cobrar ${formatMoney(totals.totalCents)}</span>
          </button>
        </form>
      </aside>
    </div>`;
}

export function formatElapsedMinutes(value) {
  if (!value) return '';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const mins = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

export function renderTables(state) {
  const tables = state.tables || [];
  const activeOrders = state.orders || [];

  let countAvailable = 0;
  let countOccupied = 0;
  let countPendingPayment = 0;

  const enrichedTables = tables.map((table) => {
    const order = activeOrders.find((item) => item.id === table.currentOrderId);
    const status = order?.status || 'available';
    if (status === 'available') {
      countAvailable++;
    } else if (status === 'pending_payment') {
      countPendingPayment++;
      countOccupied++;
    } else {
      countOccupied++;
    }
    return { table, order, status };
  });

  return `
    <div class="tables-view-header">
      <div class="tables-title-block">
        <span class="eyebrow">Gestión de Salón</span>
        <h2>Mapa de Mesas</h2>
      </div>
      <div class="tables-stats-strip">
        <span class="table-stat-chip available">
          <span class="stat-dot green"></span> <b>${countAvailable}</b> Libres
        </span>
        <span class="table-stat-chip occupied">
          <span class="stat-dot amber"></span> <b>${countOccupied}</b> Ocupadas
        </span>
        ${countPendingPayment > 0 ? `
          <span class="table-stat-chip payment">
            <span class="stat-dot purple"></span> <b>${countPendingPayment}</b> Por Cobrar
          </span>
        ` : ''}
      </div>
      <button class="button primary" data-route="pos" style="margin-left:auto;">
        <i data-lucide="plus"></i> Nueva comanda
      </button>
    </div>

    <div class="table-map">
      ${enrichedTables.map(({ table, order, status }) => {
        const elapsed = order ? formatElapsedMinutes(order.createdAt) : '';
        const itemsCount = order?.items ? order.items.reduce((s, i) => s + (i.quantity || 1), 0) : 0;
        const statusText = order ? (STATUS_LABELS[status] || status) : 'Disponible';

        return `<button type="button" class="restaurant-table restaurant-table-card status-${status}" ${order ? `data-order-open="${order.id}"` : `data-table-start="${table.id}"`}>
          <div class="table-card-top">
            <div class="table-number-pill">
              <i data-lucide="utensils" style="width:14px;height:14px;"></i>
              <strong>${escapeHtml(table.name)}</strong>
            </div>
            <span class="table-status-pill status-${status}">
              <span class="status-indicator-dot"></span>
              ${statusText}
            </span>
          </div>

          <div class="table-card-center">
            ${order ? `
              <div class="table-order-info">
                <span class="table-client-name" title="${escapeHtml(order.clientName || 'Cliente')}">
                  <i data-lucide="users" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;"></i>
                  ${escapeHtml(order.clientName || 'Sin cliente')}
                </span>
                <div class="table-order-meta-line">
                  <span class="table-items-count">${itemsCount} ${itemsCount === 1 ? 'artículo' : 'artículos'}</span>
                  ${elapsed ? `<span class="table-elapsed-badge"><i data-lucide="clock-3" style="width:11px;height:11px;"></i> ${elapsed}</span>` : ''}
                </div>
              </div>
            ` : `
              <div class="table-empty-prompt">
                <div class="table-empty-icon"><i data-lucide="plus"></i></div>
                <span>Tocar para abrir comanda</span>
              </div>
            `}
          </div>

          <div class="table-card-footer">
            ${order ? `
              <span class="table-total-label">Consumo</span>
              <strong class="table-total-amount">${formatMoney(order.totalCents)}</strong>
            ` : `
              <span class="table-free-badge"><i data-lucide="badge-check" style="width:13px;height:13px;"></i> Lista para servicio</span>
            `}
          </div>
        </button>`;
      }).join('')}
    </div>`;
}

export function renderKds(state) {
  const orders = (state.orders || []).filter((item) => ['pending', 'preparing', 'ready'].includes(item.status));
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const preparingCount = orders.filter((o) => o.status === 'preparing').length;
  const readyCount = orders.filter((o) => o.status === 'ready').length;

  return `
    <div class="kds-view-header">
      <div class="kds-title-block">
        <span class="eyebrow">Kitchen Display System</span>
        <h2>Cocina en Vivo</h2>
      </div>
      <div class="kds-summary-counters">
        <span class="kds-counter-chip pending">
          <b>${pendingCount}</b> Pendientes
        </span>
        <span class="kds-counter-chip preparing">
          <b>${preparingCount}</b> En Preparación
        </span>
        <span class="kds-counter-chip ready">
          <b>${readyCount}</b> Listas
        </span>
      </div>
      <div class="kds-live-indicator" style="margin-left:auto;">
        <span class="live-pulse-dot"></span> Sincronización activa
      </div>
    </div>
    <div class="kds-grid">${orders.length ? orders.map(kdsCard).join('') : empty('badge-check', 'Cocina al día', 'No hay comandas activas en este momento.')}</div>`;
}

export function renderOrderDrawer(order, capabilities = {}) {
  if (!order) return '';
  return `<div class="modal-backdrop" data-modal-close><article class="modal-card order-detail" role="dialog" aria-modal="true" aria-labelledby="order-title" data-modal-card>
    <header>
      <div>
        <span class="eyebrow">${escapeHtml(order.tableName || 'Mesa')}</span>
        <h2 id="order-title">${escapeHtml(order.clientName || 'Comanda')}</h2>
      </div>
      <button class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
    </header>
    <div class="order-meta">
      <span class="order-status status-${order.status}">${STATUS_LABELS[order.status] || order.status}</span>
      <span><i data-lucide="clock-3" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;"></i> ${formatDate(order.createdAt, true)}</span>
      <span>Rev. ${order.revision || 1}</span>
    </div>
    <ul class="order-items">${order.items.map((item) => `<li>
      <div>
        <strong>${item.quantity} × ${escapeHtml(item.name)}</strong>
        ${item.notes ? `<small style="display:block;color:var(--brand-2);">↳ ${escapeHtml(item.notes)}</small>` : ''}
      </div>
      <b style="color:var(--text);font-family:'Manrope',sans-serif;">${formatMoney(item.unitPriceCents * item.quantity)}</b>
    </li>`).join('')}</ul>
    ${order.notes ? `<div class="notice warning" style="margin:16px 23px 0;"><i data-lucide="message-square-warning"></i>${escapeHtml(order.notes)}</div>` : ''}
    <div class="total-row">
      <span>Total a Pagar</span>
      <strong style="color:var(--brand-2);font-family:'Manrope',sans-serif;font-size:1.6rem;">${formatMoney(order.totalCents)}</strong>
    </div>
    <footer class="modal-actions">
      <button class="button secondary" data-order-prebill="${order.id}"><i data-lucide="receipt"></i> Pre-cuenta</button>
      <button class="button secondary" data-order-print="${order.id}"><i data-lucide="printer"></i> Imprimir comanda</button>
      ${order.status === 'ready' && (capabilities.serveOrder || capabilities.updateOrder) ? '<button class="button secondary" data-order-transition="served"><i data-lucide="check"></i> Marcar servida</button>' : ''}
      ${order.status === 'served' && (capabilities.serveOrder || capabilities.updateOrder) ? '<button class="button secondary" data-order-transition="pending_payment"><i data-lucide="send"></i> Enviar a cobro</button>' : ''}
      ${['served','pending_payment'].includes(order.status) && capabilities.chargeOrder ? '<button class="button primary" data-order-charge><i data-lucide="credit-card"></i> Cobrar y cerrar</button>' : ''}
      ${!['closed','cancelled'].includes(order.status) && capabilities.updateOrder ? '<button class="button danger ghost" data-order-cancel>Cancelar</button>' : ''}
    </footer>
  </article></div>`;
}

function metric(label, value, icon, tone = '') { return `<article class="metric-card ${tone}"><i data-lucide="${icon}"></i><div><span>${label}</span><strong>${value}</strong></div></article>`; }
function empty(icon, title, copy) { return `<div class="empty-state"><i data-lucide="${icon}"></i><strong>${title}</strong><p>${copy}</p></div>`; }
export function getCategoryMeta(category = '') {
  const norm = String(category).toLowerCase().trim();
  if (norm === 'todos') return { icon: 'sparkles', color: '#f59e0b', bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.3)' };
  if (norm.includes('tostada')) {
    return { icon: 'coffee', color: '#f59e0b', bg: 'rgba(245,158,11,.12)', border: 'rgba(245,158,11,.3)' };
  }
  if (norm.includes('rikitaki')) {
    return { icon: 'flame', color: '#ea580c', bg: 'rgba(234,88,12,.12)', border: 'rgba(234,88,12,.3)' };
  }
  if (norm.includes('variedad') || norm.includes('empanada') || norm.includes('nacho') || norm.includes('omelet')) {
    return { icon: 'sparkles', color: '#10b981', bg: 'rgba(16,185,129,.12)', border: 'rgba(16,185,129,.3)' };
  }
  if (norm.includes('yaroa')) {
    return { icon: 'layers', color: '#eab308', bg: 'rgba(234,179,8,.12)', border: 'rgba(234,179,8,.3)' };
  }
  if (norm.includes('hot dog') || norm.includes('hotdog')) {
    return { icon: 'flame', color: '#ef4444', bg: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.3)' };
  }
  if (norm.includes('taco') || norm.includes('burrito') || norm.includes('quesadilla') || norm.includes('wrap')) {
    return { icon: 'utensils', color: '#84cc16', bg: 'rgba(132,204,22,.12)', border: 'rgba(132,204,22,.3)' };
  }
  if (norm.includes('burger') || norm.includes('hamburg') || norm.includes('sandwich')) {
    return { icon: 'sandwich', color: '#f97316', bg: 'rgba(249,115,22,.12)', border: 'rgba(249,115,22,.3)' };
  }
  if (norm.includes('carne') || norm.includes('cerdo') || norm.includes('res') || norm.includes('pollo')) {
    return { icon: 'flame', color: '#ef4444', bg: 'rgba(239,68,68,.12)', border: 'rgba(239,68,68,.3)' };
  }
  if (norm.includes('guarni') || norm.includes('fritur') || norm.includes('papa') || norm.includes('yuca') || norm.includes('batata') || norm.includes('arepa')) {
    return { icon: 'layers', color: '#eab308', bg: 'rgba(234,179,8,.12)', border: 'rgba(234,179,8,.3)' };
  }
  if (norm.includes('arroz')) {
    return { icon: 'wheat', color: '#d97706', bg: 'rgba(217,119,6,.12)', border: 'rgba(217,119,6,.3)' };
  }
  if (norm.includes('ensalada') || norm.includes('vegetal') || norm.includes('aguacate')) {
    return { icon: 'salad', color: '#84cc16', bg: 'rgba(132,204,22,.12)', border: 'rgba(132,204,22,.3)' };
  }
  if (norm.includes('bebida') || norm.includes('jugo') || norm.includes('refresco') || norm.includes('cerveza') || norm.includes('agua') || norm.includes('batida')) {
    return { icon: 'beer', color: '#0ea5e9', bg: 'rgba(14,165,233,.12)', border: 'rgba(14,165,233,.3)' };
  }
  if (norm.includes('postre') || norm.includes('dulce') || norm.includes('helado')) {
    return { icon: 'cake', color: '#ec4899', bg: 'rgba(236,72,153,.12)', border: 'rgba(236,72,153,.3)' };
  }
  if (norm.includes('plato') || norm.includes('especial') || norm.includes('dia')) {
    return { icon: 'star', color: '#a855f7', bg: 'rgba(168,85,247,.12)', border: 'rgba(168,85,247,.3)' };
  }
  return { icon: 'utensils', color: '#10b981', bg: 'rgba(16,185,129,.12)', border: 'rgba(16,185,129,.3)' };
}

function productCard(item) {
  const meta = getCategoryMeta(item.category);
  const stock = Number(item.stock ?? 0);
  const isOutOfStock = stock <= 0;
  const isLowStock = stock > 0 && stock <= 10;
  const stockClass = isOutOfStock ? 'stock-out' : isLowStock ? 'stock-low' : 'stock-ok';
  const stockLabel = isOutOfStock ? 'Agotado' : isLowStock ? `Últimas ${stock}` : `Stock: ${stock}`;

  return `<button class="product-card pos-product-tile ${stockClass}" data-product-add="${item.id}" data-category="${escapeHtml(item.category || 'General')}" data-search="${escapeHtml(`${item.name} ${item.sku || ''} ${item.category || ''}`.toLowerCase())}" style="--cat-accent:${meta.color};">
    <div class="product-tile-header">
      <span class="product-category-badge" style="color:${meta.color};background:${meta.bg};border-color:${meta.border};">
        <i data-lucide="${meta.icon}" style="width:12px;height:12px;"></i>
        ${escapeHtml(item.category || 'General')}
      </span>
      ${item.sku ? `<span class="product-sku"><i data-lucide="barcode" style="width:10px;height:10px;display:inline-block;vertical-align:-1px;"></i> ${escapeHtml(item.sku)}</span>` : ''}
    </div>
    <div class="product-tile-body">
      <div class="product-tile-icon" style="color:${meta.color};background:${meta.bg};">
        <i data-lucide="${meta.icon}"></i>
      </div>
      <strong class="product-tile-name">${escapeHtml(item.name)}</strong>
    </div>
    <div class="product-tile-footer">
      <span class="product-stock-badge ${stockClass}">
        <span class="stock-dot"></span>
        ${stockLabel}
      </span>
      <b class="product-tile-price">${formatMoney(item.priceCents)}</b>
    </div>
  </button>`;
}

export function cartLine(item, index) {
  return `<div class="cart-line pos-cart-line" data-cart-row="${index}">
    <div class="cart-line-info" style="flex:1;min-width:0;">
      <strong class="cart-line-name" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.name)}</strong>
      <div class="cart-line-meta" style="display:flex;align-items:center;gap:6px;margin-top:2px;">
        <span class="cart-unit-price">${formatMoney(item.unitPriceCents)} c/u</span>
        ${item.notes ? `<span class="cart-line-note" style="display:inline-flex;align-items:center;gap:3px;font-size:0.7rem;color:var(--brand-2);background:rgba(245,158,11,.1);padding:1px 5px;border-radius:4px;"><i data-lucide="message-square-plus" style="width:11px;height:11px;"></i> ${escapeHtml(item.notes)}</span>` : ''}
      </div>
    </div>
    <div class="quantity-control pos-qty-control">
      <button type="button" class="qty-btn" data-cart-qty="${index}" data-delta="-1" aria-label="Restar una unidad">−</button>
      <span class="qty-display" data-cart-set-qty="${index}" style="cursor:pointer;" title="Tocar para editar">${item.quantity}</span>
      <button type="button" class="qty-btn" data-cart-qty="${index}" data-delta="1" aria-label="Sumar una unidad">+</button>
      <button type="button" class="qty-note-btn" data-cart-item-note="${index}" title="Agregar nota al plato" aria-label="Agregar nota">
        <i data-lucide="message-square-plus"></i>
      </button>
    </div>
    <b class="cart-line-total">${formatMoney(item.unitPriceCents * item.quantity)}</b>
  </div>`;
}

export function renderCartLines(items) {
  return items && items.length ? items.map(cartLine).join('') : empty('shopping-basket', 'Cuenta vacía', 'Toca un producto del menú para agregarlo.');
}

export function renderCartTotals(items, discountState = { discount: 0, discountType: 'amount', includeLegalTip: false }) {
  if (!items || !items.length) {
    return `<div class="cart-totals"><div><span>Subtotal</span><b>RD$ 0.00</b></div><div class="grand-total"><span>Total</span><strong>RD$ 0.00</strong></div></div>`;
  }
  const res = calculateDocument(items, discountState || {});
  return `<div class="cart-totals">
    <div class="cart-total-row"><span>Subtotal</span><b>${formatMoney(res.subtotalCents)}</b></div>
    ${res.discountCents > 0 ? `<div class="cart-total-row discount" style="color:#ef4444;"><span>Descuento</span><b>-${formatMoney(res.discountCents)}</b></div>` : ''}
    <div class="cart-total-row"><span>ITBIS (18%)</span><b>${formatMoney(res.taxCents)}</b></div>
    ${res.tipCents > 0 ? `<div class="cart-total-row tip" style="color:var(--brand-2);"><span>Propina Ley (10%)</span><b>${formatMoney(res.tipCents)}</b></div>` : ''}
    <div class="grand-total"><span>Total a Pagar</span><strong>${formatMoney(res.totalCents)}</strong></div>
  </div>`;
}

function kdsCard(order) {
  const action = order.status === 'pending'
    ? ['preparing', '🔥 Iniciar Preparación', 'kds-btn-prepare']
    : order.status === 'preparing'
    ? ['ready', '✅ Marcar Lista para Servir', 'kds-btn-ready']
    : null;

  const date = order.createdAt ? (typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : new Date(order.createdAt)) : null;
  const elapsedMins = date && !Number.isNaN(date.getTime()) ? Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000)) : 0;
  const timeUrgency = elapsedMins >= 20 ? 'time-urgent' : elapsedMins >= 10 ? 'time-warning' : 'time-normal';
  const elapsedLabel = formatElapsedMinutes(order.createdAt);

  return `<article class="kds-card priority-${order.priority} status-${order.status} ${timeUrgency}">
    <header class="kds-card-header">
      <div class="kds-header-main">
        <div class="kds-table-badge">
          <i data-lucide="utensils" style="width:13px;height:13px;"></i>
          ${escapeHtml(order.tableName || 'Para Llevar')}
        </div>
        <div class="kds-client-sub">${escapeHtml(order.clientName || 'Cliente')}</div>
      </div>
      <div class="kds-status-col">
        <span class="order-status status-${order.status}">${STATUS_LABELS[order.status] || order.status}</span>
        ${order.priority !== 'normal' ? `<span class="kds-priority-tag ${order.priority}">${order.priority === 'urgent' ? '🚨 URGENTE' : '⚡ PRIORIDAD'}</span>` : ''}
      </div>
    </header>

    <div class="kds-timer-bar ${timeUrgency}">
      <span class="kds-timer-clock"><i data-lucide="clock-3" style="width:13px;height:13px;"></i> ${formatDate(order.createdAt, true)}</span>
      <span class="kds-elapsed-pill ${timeUrgency}"><i data-lucide="flame" style="width:12px;height:12px;"></i> ${elapsedLabel ? `hace ${elapsedLabel}` : 'recién'}</span>
    </div>

    <ul class="kds-items-list">
      ${order.items.map((item) => `
        <li class="kds-item-row">
          <span class="kds-item-qty">${item.quantity}×</span>
          <div class="kds-item-details">
            <strong class="kds-item-name">${escapeHtml(item.name)}</strong>
            ${item.notes ? `<div class="kds-item-note"><i data-lucide="message-square-warning" style="width:12px;height:12px;"></i> ${escapeHtml(item.notes)}</div>` : ''}
          </div>
        </li>
      `).join('')}
    </ul>

    ${order.notes ? `
      <div class="kds-order-notes-box">
        <i data-lucide="message-square-warning" style="width:15px;height:15px;flex-shrink:0;"></i>
        <span><strong>Nota comanda:</strong> ${escapeHtml(order.notes)}</span>
      </div>
    ` : ''}

    <div class="kds-card-actions">
      ${action ? `
        <button class="button primary full kds-action-btn ${action[2]}" data-kds-order="${order.id}" data-next-status="${action[0]}">
          ${action[1]}
        </button>
      ` : `
        <div class="kds-ready-banner">
          <i data-lucide="bell" style="width:16px;height:16px;"></i>
          <span>Lista en el pase para retirar</span>
        </div>
      `}
    </div>
  </article>`;
}
function renderOrderMiniList(items) { return items.length ? `<div class="mini-list">${items.map((item) => `<button data-order-open="${item.id}"><span class="dot status-${item.status}"></span><div><strong>${escapeHtml(item.tableName)}</strong><small>${STATUS_LABELS[item.status]} · ${formatDate(item.createdAt, true)}</small></div><b>${formatMoney(item.totalCents)}</b></button>`).join('')}</div>` : empty('badge-check', 'Sin pendientes', 'Todo está bajo control.'); }
function renderInvoiceMiniList(items) { return items.length ? `<div class="mini-list">${items.map((item) => `<button data-invoice-view="${item.id}"><i data-lucide="receipt"></i><div><strong>${escapeHtml(item.invoiceNumber)}</strong><small>${escapeHtml(item.clientName)} · ${formatDate(item.createdAt)}</small></div><b>${formatMoney(item.totalCents)}</b></button>`).join('')}</div>` : empty('receipt', 'Sin documentos', 'Las ventas aparecerán aquí.'); }
