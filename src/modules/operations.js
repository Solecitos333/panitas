import { formatMoney, escapeHtml, formatDate } from '../lib/format.js';
import { calculateDocument, getPendingDeliveryInvoices } from '../domain/billing.js';
import { businessDateKey, inBusinessPeriod } from '../lib/business-time.js';
import { can } from '../domain/roles.js';
import { getProductVariants, hasProductVariants, hasProductSides, getProductSides, calculateVariantLinePrice, formatLineName } from '../domain/catalog.js';

const STATUS_LABELS = {
  pending: 'Pendiente', preparing: 'Preparando', ready: 'Lista', served: 'Servida',
  pending_payment: 'Por cobrar', closed: 'Cerrada', cancelled: 'Cancelada'
};

export function renderDashboard(state) {
  const invoices = Array.isArray(state?.invoices) ? state.invoices : [];
  const orders = Array.isArray(state?.orders) ? state.orders : [];
  const cashSessions = Array.isArray(state?.cashSessions) ? state.cashSessions : [];
  const cashMovements = Array.isArray(state?.cashMovements) ? state.cashMovements : [];
  const tables = Array.isArray(state?.tables) ? state.tables : [];
  const products = Array.isArray(state?.products) ? state.products : [];
  const user = state?.user || {};
  const capabilities = state?.capabilities || {};

  const today = businessDateKey(new Date());
  const todayInvoices = invoices.filter((item) => businessDateKey(item.createdAt) === today && item.status !== 'cancelled' && item.documentType === 'invoice');
  const todaySales = todayInvoices.reduce((sum, item) => sum + Number(item.totalCents || 0), 0);
  const todayPaidCents = todayInvoices.reduce((sum, item) => sum + (item.status === 'paid' ? Number(item.totalCents || 0) : Number(item.paidCents || 0)), 0);
  const todayPendingCents = Math.max(0, todaySales - todayPaidCents);
  const avgTicketCents = todayInvoices.length ? Math.round(todaySales / todayInvoices.length) : 0;

  // Use actual collections, including debts issued on earlier days and mixed payments.
  let todayPayments = [];
  try {
    todayPayments = (Array.isArray(state?.payments) ? state.payments : []).filter(p => inBusinessPeriod(p.createdAt, 'day'));
  } catch (_) {
    todayPayments = [];
  }
  const collectedByMethod = (method) => todayPayments.filter(p => p.method === method)
    .reduce((sum, p) => sum + Number(p.amountCents || 0), 0);
  const todayCashIn = collectedByMethod('cash');
  const todayCardIn = collectedByMethod('card');
  const todayTransferIn = collectedByMethod('transfer');

  const pending = orders.filter((item) => !['closed', 'cancelled'].includes(item.status));
  const ordersInPrep = pending.filter((o) => o.status === 'preparing');
  const ordersReady = pending.filter((o) => o.status === 'ready');

  const openCash = cashSessions.find((item) => item.status === 'open' && item.openedBy === user.uid);

  const todayMovements = cashMovements.filter((item) => {
    const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt || 0);
    return businessDateKey(d) === today;
  });
  const todayOutflows = todayMovements.filter((m) => m.type === 'out');
  const todayCashOut = todayOutflows.reduce((sum, m) => sum + Number(m.amountCents || 0), 0);

  const activeTables = tables.filter((t) => t.active !== false);
  const occupiedTables = activeTables.filter((t) => t.currentOrderId);
  const occupiedPct = activeTables.length ? Math.round((occupiedTables.length / activeTables.length) * 100) : 0;

  const pendingDeliveries = getPendingDeliveryInvoices(invoices);
  const driverDeliveriesMap = new Map();
  pendingDeliveries.forEach((inv) => {
    const key = inv.deliveryDriverId || inv.deliveryDriverName || 'unassigned';
    const name = inv.deliveryDriverName || (key === 'unassigned' ? 'Sin chofer' : 'Mensajero');
    const cur = driverDeliveriesMap.get(key) || { id: inv.deliveryDriverId || '', name, count: 0, totalCents: 0 };
    cur.count += 1;
    cur.totalCents += (Number(inv.totalCents || 0) - Number(inv.paidCents || 0));
    driverDeliveriesMap.set(key, cur);
  });
  const activeDeliveriesList = Array.from(driverDeliveriesMap.values());
  const totalDeliveryPending = pendingDeliveries.reduce((sum, inv) => sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)), 0);

  const todayProductsBreakdown = getDailyProductsBreakdown(todayInvoices, products);
  const dominicanDate = formatDate(new Date(), false);

  const kpiSalesSub = `<span class="sub-pill success" title="Cobrado de las ventas emitidas hoy"><i data-lucide="check-circle-2"></i> ${formatMoney(todayPaidCents)}</span>${todayPendingCents > 0 ? `<span class="sub-pill warning" title="Saldo pendiente de las ventas emitidas hoy"><i data-lucide="clock"></i> ${formatMoney(todayPendingCents)} pendiente</span>` : ''}`;
  const kpiDocsSub = `<span class="sub-pill neutral" title="Ticket promedio"><i data-lucide="calculator"></i> Prom: ${formatMoney(avgTicketCents)}</span>`;
  const kpiOrdersSub = `<span class="sub-pill ${ordersInPrep.length ? 'warning' : 'neutral'}"><i data-lucide="flame"></i> ${ordersInPrep.length} prep</span><span class="sub-pill ${ordersReady.length ? 'success' : 'neutral'}"><i data-lucide="bell"></i> ${ordersReady.length} listas</span>`;
  const kpiDeliverySub = `<span class="sub-pill ${totalDeliveryPending > 0 ? 'warning' : 'neutral'}" title="Saldo en calle a liquidar"><i data-lucide="badge-dollar-sign"></i> ${formatMoney(totalDeliveryPending)}</span>`;
  const kpiTablesSub = `<span class="sub-pill ${occupiedPct > 70 ? 'warning' : 'neutral'}">${occupiedPct}% ocupación</span>`;
  const kpiCashSub = `<span class="sub-pill ${todayCashOut > 0 ? 'danger' : 'neutral'}" title="Salidas de hoy"><i data-lucide="trending-down"></i> -${formatMoney(todayCashOut)}</span>`;

  return `
    <div class="dashboard-desktop">
      <section class="panel-heading dashboard-header">
        <div class="dash-header-main">
          <div class="dash-header-eyebrow">
            <span class="live-dot-pulse"></span>
            <span class="eyebrow">Resumen operativo</span>
            <span class="dash-clock-badge"><i data-lucide="calendar"></i> ${dominicanDate}</span>
          </div>
          <h2>Así marcha el restaurante</h2>
          <p>Ventas, comandas, entregas y arqueo de caja en una sola lectura ejecutiva.</p>
        </div>
        <div class="dash-header-actions">
          <div class="dash-status-pill ${openCash ? 'status-open' : 'status-closed'}">
            <i data-lucide="${openCash ? 'check-circle-2' : 'alert-triangle'}"></i>
            <span>${openCash ? `Caja abierta · ${escapeHtml(user.displayName || user.username || 'Turno')}` : 'Caja cerrada'}</span>
          </div>
          <button type="button" class="button primary" data-route="pos" title="Ir al Punto de Venta">
            <i data-lucide="plus"></i> Nueva venta
          </button>
          <button type="button" class="button secondary" data-refresh title="Refrescar métricas">
            <i data-lucide="refresh-cw"></i> Actualizar
          </button>
        </div>
      </section>

      <div class="metric-grid dashboard-kpi-grid">
        ${metric('Ventas de hoy', formatMoney(todaySales), 'trending-up', 'positive', kpiSalesSub)}
        ${metric('Documentos', String(todayInvoices.length), 'receipt-text', '', kpiDocsSub)}
        ${metric('Comandas activas', String(pending.length), 'chef-hat', pending.length ? 'warning' : 'positive', kpiOrdersSub)}
        ${metric('Deliveries en calle', String(pendingDeliveries.length), 'bike', pendingDeliveries.length ? 'delivery' : '', kpiDeliverySub)}
        ${metric('Mesas ocupadas', `${occupiedTables.length} / ${activeTables.length}`, 'utensils', occupiedTables.length ? 'tables' : '', kpiTablesSub)}
        ${metric('Caja', openCash ? 'Abierta' : 'Cerrada', 'wallet-cards', openCash ? 'positive' : 'muted', kpiCashSub)}
      </div>

      <nav class="dashboard-quick-actions" aria-label="Accesos rápidos operativos">
        <button type="button" class="dash-quick-btn primary" data-route="pos" title="Ir al Punto de Venta">
          <i data-lucide="calculator"></i>
          <span>Punto de Venta</span>
        </button>
        ${capabilities.viewKds ? `<button type="button" class="dash-quick-btn" data-route="kds" title="Abrir Monitor de Cocina KDS">
          <i data-lucide="flame"></i>
          <span>Monitor Cocina ${pending.length ? `<b class="dash-counter">${pending.length}</b>` : ''}</span>
        </button>` : ''}
        <button type="button" class="dash-quick-btn" data-route="deliveries" title="Control de Envíos y Choferes">
          <i data-lucide="bike"></i>
          <span>Deliveries ${pendingDeliveries.length ? `<b class="dash-counter warning">${pendingDeliveries.length}</b>` : ''}</span>
        </button>
        <button type="button" class="dash-quick-btn" data-route="tables" title="Plano y Estado de Mesas">
          <i data-lucide="layout-grid"></i>
          <span>Mesas (${occupiedTables.length}/${activeTables.length})</span>
        </button>
        <button type="button" class="dash-quick-btn" data-cash-movement-open="out" title="Registrar una salida o gasto de caja">
          <i data-lucide="trending-down"></i>
          <span>Registrar Gasto</span>
        </button>
        <button type="button" class="dash-quick-btn" data-route="receivables" title="Gestionar Cuentas por Cobrar y Fiao">
          <i data-lucide="book-open"></i>
          <span>Cuentas por Cobrar</span>
        </button>
      </nav>

      <div class="dashboard-grid">
        <article class="surface-card">
          <header>
            <div>
              <span class="eyebrow">Rendimiento de Ventas · ${todayProductsBreakdown.length} producto(s)</span>
              <h3>Platos y artículos vendidos hoy</h3>
            </div>
            <button type="button" class="text-button" data-route="invoices"><i data-lucide="arrow-up-right"></i> Ver facturas</button>
          </header>
          ${renderDailyProductsList(todayProductsBreakdown.slice(0, 8))}
        </article>

        <article class="surface-card">
          <header>
            <div>
              <span class="eyebrow">Cocina · ${pending.length} activa(s)</span>
              <h3>Comandas que requieren atención</h3>
            </div>
            ${capabilities.viewKds ? '<button type="button" class="text-button" data-route="kds"><i data-lucide="flame"></i> Abrir KDS</button>' : ''}
          </header>
          ${renderDashboardOrderList(pending.slice(0, 6))}
        </article>

        <article class="surface-card">
          <header>
            <div>
              <span class="eyebrow">Despacho · ${pendingDeliveries.length} pedido(s)</span>
              <h3>Deliveries en ruta y cobros</h3>
            </div>
            <button type="button" class="text-button" data-route="deliveries"><i data-lucide="truck"></i> Ver envíos</button>
          </header>
          ${renderDashboardDeliveriesList(activeDeliveriesList, pendingDeliveries)}
        </article>

        <article class="surface-card">
          <header>
            <div>
              <span class="eyebrow">Control de Caja · ${todayOutflows.length} registro(s)</span>
              <h3>Salidas y gastos de hoy</h3>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <button type="button" class="text-button" data-cash-movement-open="out"><i data-lucide="minus"></i> Gasto</button>
              <button type="button" class="text-button" data-route="cash">Ver caja</button>
            </div>
          </header>
          ${renderOutflowMiniList(todayOutflows.slice(0, 6))}
        </article>

        <article class="surface-card">
          <header>
            <div>
              <span class="eyebrow">Cobros registrados hoy</span>
              <h3>Métodos de pago recibidos</h3>
            </div>
            ${can(user, 'reports:view') ? '<button type="button" class="text-button" data-route="reports"><i data-lucide="chart-no-axes-combined"></i> Reportes</button>' : ''}
          </header>
          ${renderFinancialBreakdown(todayCashIn, todayCardIn, todayTransferIn)}
        </article>

        <article class="surface-card">
          <header>
            <div>
              <span class="eyebrow">Facturación · Recientes</span>
              <h3>Movimientos recientes</h3>
            </div>
            <button type="button" class="text-button" data-route="invoices">Ver todos</button>
          </header>
          ${renderDashboardInvoiceList(invoices.slice(0, 6))}
        </article>
      </div>

      <details class="surface-card dashboard-mobile-helper" style="padding:14px 18px;margin-top:24px;border-radius:14px;background:rgba(255,255,255,.015);border:1px solid rgba(255,255,255,.06);">
        <summary style="cursor:pointer;font-weight:700;display:flex;align-items:center;gap:8px;color:var(--muted);font-size:0.86rem;">
          <i data-lucide="smartphone" style="width:16px;height:16px;color:var(--brand-2);"></i>
          <span>Acceso personal & descarga de app de gestión</span>
        </summary>
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06);font-size:0.84rem;color:var(--muted);line-height:1.5;">
          <p style="margin:0 0 10px;">Este panel muestra la información permitida para tu usuario. Para cambiar tu código de caja, abre «Mi PIN y contraseña».</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
            <button type="button" class="button secondary compact" data-personal-settings><i data-lucide="key-round"></i> Mi PIN y contraseña</button>
            <a class="button secondary compact" href="/downloads/LosPanitas-Gestion-Android.apk" download><i data-lucide="download"></i> Descargar APK de gestión</a>
          </div>
          <p style="margin:0;font-size:0.75rem;"><strong>iPhone:</strong> Safari → Compartir → Añadir a pantalla de inicio. | <strong>Android:</strong> menú de Chrome → Instalar app.</p>
        </div>
      </details>
    </div>
    ${state.terminalMode ? '' : renderMobileManagement(state)}`;
}

function renderMobileManagement(state) {
  const period = ['day', 'week', 'month', 'year'].includes(state.mobileReportPeriod) ? state.mobileReportPeriod : 'day';
  const labels = { day: 'Hoy', week: 'Semana', month: 'Mes', year: 'Año' };
  const sales = state.invoices.filter((invoice) => isSaleInPeriod(invoice, period));
  const totalCents = sales.reduce((sum, invoice) => sum + Number(invoice.totalCents || 0), 0);
  const paidCents = (state.payments || []).filter((payment) => isDateInPeriod(payment.createdAt, period)).reduce((sum, payment) => sum + Number(payment.amountCents || 0), 0);
  const outflowCents = (state.cashMovements || []).filter((m) => m.type === 'out' && isDateInPeriod(m.createdAt, period)).reduce((sum, m) => sum + Number(m.amountCents || 0), 0);
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
        ${mobileMetric('Gastos/Salidas', formatMoney(outflowCents), 'trending-down')}
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
  const orders = Array.isArray(state.orders) ? state.orders : [];
  const clients = Array.isArray(state.clients) ? state.clients : [];
  const cart = Array.isArray(state.cart) ? state.cart : [];
  const activeProducts = products.filter((item) =>
    item.active !== false &&
    item.id !== 'prod-costo-de-envio-delivery' &&
    item.sku !== 'SRV-DELIV' &&
    !item.isDeliveryFee
  );
  const occupiedTables = tables.filter((item) => item.active !== false && item.currentOrderId);
  const loadedTable = state.loadedTableId ? tables.find((t) => t.id === state.loadedTableId) : null;
  const loadedOrder = state.loadedOrderId ? orders.find((o) => o.id === state.loadedOrderId) : null;
  const categories = ['Todos', ...new Set(activeProducts.map((p) => p.category || 'General').filter(Boolean))];
  const hardware = state.hardwareStatus || {};
  const draft = state.posDraft || {};
  const selectedTableId = draft.tableId ?? state.loadedTableId ?? state.preselectedTableId ?? '';
  const currentTable = tables.find((t) => t.id === selectedTableId);
  const selectedCategory = categories.includes(state.posCategory) ? state.posCategory : 'Todos';
  const totals = calculateDocument(cart, state.posDiscountState || {});
  const pendingDeliveries = getPendingDeliveryInvoices(state.invoices || []);
  const driverDeliveriesMap = new Map();
  pendingDeliveries.forEach((inv) => {
    const key = inv.deliveryDriverId || inv.deliveryDriverName || 'unassigned';
    const name = inv.deliveryDriverName || (key === 'unassigned' ? 'Sin chofer' : 'Mensajero');
    const cur = driverDeliveriesMap.get(key) || { id: inv.deliveryDriverId || '', name, count: 0, totalCents: 0 };
    cur.count += 1;
    cur.totalCents += (Number(inv.totalCents || 0) - Number(inv.paidCents || 0));
    driverDeliveriesMap.set(key, cur);
  });
  const activeDeliveriesList = Array.from(driverDeliveriesMap.values());
  const posDestination = state.posDestination || (selectedTableId ? 'table' : 'takeout');
  const mobileAction = loadedTable
    ? `Cobrar ${loadedTable.name} ${formatMoney(totals.totalCents)}`
    : posDestination === 'table'
      ? 'Enviar comanda a mesa'
      : posDestination === 'delivery'
        ? `Despachar Delivery ${formatMoney(totals.totalCents)}`
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
        ${loadedTable ? `<span class="pos-table-indicator active"><i data-lucide="utensils"></i> Atendiendo ${escapeHtml(loadedTable.name)}</span>` : selectedTableId ? `<span class="pos-table-indicator"><i data-lucide="utensils"></i> Mesa seleccionada</span>` : ''}
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

    <!-- COLA DE MESAS CON PEDIDO ABIERTO -->
    <div class="pos-tables-queue-bar" aria-label="Cola de mesas con comanda activa">
      <div class="pos-queue-title">
        <i data-lucide="utensils" style="width:16px;height:16px;color:var(--brand-2);"></i>
        <span>Mesas con pedido</span>
        ${occupiedTables.length ? `<span class="pos-queue-badge">${occupiedTables.length}</span>` : ''}
      </div>
      <div class="pos-queue-list">
        ${occupiedTables.length ? occupiedTables.map((t) => {
          const ord = orders.find((o) => o.id === t.currentOrderId);
          const isLoaded = state.loadedOrderId === t.currentOrderId;
          const itemCount = ord?.items ? ord.items.reduce((s, i) => s + Number(i.quantity || 0), 0) : 0;
          const ordTotal = ord?.totalCents || (ord?.items ? calculateDocument(ord.items).totalCents : 0);
          const hasClient = ord?.clientName && ord.clientName !== 'Consumidor final';
          return `
            <button type="button" class="pos-table-queue-chip ${isLoaded ? 'is-loaded' : ''}" data-pos-load-table="${t.id}" title="Tocar para cobrar o modificar ${escapeHtml(t.name)}">
              <div class="chip-title">
                <strong>${escapeHtml(t.name)}</strong>
                ${hasClient ? `<span class="chip-client-name" title="Cliente: ${escapeHtml(ord.clientName)}"><i data-lucide="user" style="width:11px;height:11px;display:inline-block;vertical-align:-1px;margin-right:2px;"></i>${escapeHtml(ord.clientName)}</span>` : ''}
                ${isLoaded ? '<span class="chip-status-tag loaded">Cargada</span>' : '<span class="chip-status-tag">En espera</span>'}
              </div>
              <div class="chip-meta">
                <span>${itemCount} art.</span>
                <b>${formatMoney(ordTotal)}</b>
              </div>
            </button>
          `;
        }).join('') : `
          <div class="pos-queue-empty">
            <i data-lucide="badge-check" style="width:14px;height:14px;color:#3fb950;"></i>
            <span>Todas las mesas libres</span>
          </div>
        `}
      </div>
      <button type="button" class="button secondary compact pos-queue-pick-btn" data-pos-pick-table title="Ver salón y seleccionar mesa">
        <i data-lucide="layout-grid"></i> Mesas
      </button>
    </div>

    <!-- COLA DE DELIVERIES EN CURSO -->
    <div class="pos-deliveries-queue-bar" aria-label="Cola de pedidos delivery en calle">
      <div class="pos-queue-title">
        <i data-lucide="bike" style="width:16px;height:16px;color:#38bdf8;"></i>
        <span>Deliveries en calle</span>
        ${pendingDeliveries.length ? `<span class="pos-queue-badge delivery">${pendingDeliveries.length}</span>` : ''}
      </div>
      <div class="pos-queue-list">
        ${activeDeliveriesList.length ? activeDeliveriesList.map((d) => `
          <button type="button" class="pos-delivery-queue-chip" data-pos-settle-driver="${escapeHtml(d.id || d.name)}" title="Tocar para ver o liquidar entregas de ${escapeHtml(d.name)}">
            <div class="chip-title">
              <i data-lucide="bike" style="width:12px;height:12px;color:#38bdf8;"></i>
              <strong>${escapeHtml(d.name)}</strong>
              <span class="chip-status-tag delivery">${d.count} ped.</span>
            </div>
            <div class="chip-meta">
              <span>Por cobrar</span>
              <b>${formatMoney(d.totalCents)}</b>
            </div>
          </button>
        `).join('') : `
          <div class="pos-queue-empty">
            <i data-lucide="badge-check" style="width:14px;height:14px;color:#3fb950;"></i>
            <span>Sin entregas pendientes en calle</span>
          </div>
        `}
      </div>
      <button type="button" class="button secondary compact pos-queue-pick-btn" data-route="deliveries" title="Ir a Gestión completa de Deliveries">
        <i data-lucide="bike"></i> Deliveries
      </button>
    </div>

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
        <div id="pos-products" class="product-grid">
          ${activeProducts.length ? activeProducts.map(productCard).join('') : empty('package-open', 'Catálogo vacío', 'Agrega el primer producto para comenzar a vender.')}
          <div id="pos-no-matches" class="empty-state" hidden style="grid-column: 1 / -1; padding: 48px 20px; text-align: center; color: var(--muted);">
            <i data-lucide="search-x" style="width: 44px; height: 44px; stroke-width: 1.5; opacity: 0.6; margin: 0 auto 12px; display:block;"></i>
            <strong style="display:block; color: #eee; font-size: 1.05rem; margin-bottom: 4px;">No se encontraron productos</strong>
            <p style="margin: 0; font-size: 0.85rem;">Prueba con otro término o selecciona la categoría «Todos».</p>
          </div>
        </div>
      </section>
      <aside class="surface-card cart-panel pos-fast-cart">
        <form id="pos-checkout-form" class="pos-checkout-form-inner">
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

        ${loadedTable ? `
          <div class="pos-loaded-table-banner">
            <div class="pos-loaded-table-meta">
              <span class="pos-loaded-table-pill"><i data-lucide="utensils"></i> ${escapeHtml(loadedTable.name)}</span>
              <span class="pos-loaded-table-subtitle">
                ${loadedOrder?.clientName && loadedOrder.clientName !== 'Consumidor final' ? `<i data-lucide="user" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;margin-right:3px;"></i>${escapeHtml(loadedOrder.clientName)} · ` : ''}Comanda activa #${escapeHtml(loadedOrder?.orderNumber || loadedOrder?.id?.slice(0, 6) || '')}
              </span>
            </div>
            <div class="pos-loaded-table-actions">
              <button type="button" class="button secondary compact pos-release-cart-btn" data-pos-release-cart title="Dejar mesa en espera y volver a venta libre">
                <i data-lucide="log-out"></i> Soltar
              </button>
              <button type="button" class="button danger compact pos-cancel-table-btn" data-pos-cancel-table="${loadedTable.id}" title="Anular comanda y liberar ${escapeHtml(loadedTable.name)}">
                <i data-lucide="trash-2"></i> Liberar Mesa
              </button>
            </div>
          </div>
        ` : ''}

        <!-- DESTINO Y CLIENTE DEL PEDIDO -->
        <div class="pos-cart-destination-box">
          <div class="pos-dest-tabs">
            <button
              type="button"
              class="pos-dest-pill ${posDestination === 'takeout' ? 'active' : ''}"
              data-pos-set-dest="takeout"
              title="Pedido para llevar / mostrador"
            >
              <i data-lucide="shopping-bag"></i>
              <span>Para Llevar</span>
            </button>
            <button
              type="button"
              class="pos-dest-pill ${posDestination === 'table' ? 'active' : ''}"
              data-pos-set-dest="table"
              title="${currentTable ? `Mesa: ${escapeHtml(currentTable.name)}. Toca para cambiar.` : 'Elegir mesa de salón'}"
            >
              <i data-lucide="utensils"></i>
              <span>${currentTable ? escapeHtml(currentTable.name) : 'Salón (Mesa)'}</span>
              <i data-lucide="chevron-down" style="width:12px;height:12px;opacity:0.7;margin-left:2px;"></i>
            </button>
            <button
              type="button"
              class="pos-dest-pill ${posDestination === 'delivery' ? 'active' : ''}"
              data-pos-set-dest="delivery"
              title="Pedido para enviar a domicilio"
            >
              <i data-lucide="bike"></i>
              <span>Delivery</span>
            </button>
          </div>

          <input type="hidden" name="tableId" id="pos-table-select" value="${escapeHtml(selectedTableId)}">
          <input type="hidden" name="posDestination" id="pos-dest-select" value="${escapeHtml(posDestination)}">

          <div class="pos-cart-client-field" style="position:relative;">
            <i data-lucide="user" class="pos-cart-client-icon"></i>
            <input
              type="text"
              name="clientName"
              id="pos-client-name"
              value="${escapeHtml(draft.clientName || (loadedOrder?.clientName && loadedOrder.clientName !== 'Consumidor final' ? loadedOrder.clientName : ''))}"
              placeholder="${posDestination === 'table' ? 'Cliente en mesa (ej. Juan, Familia Pérez)' : posDestination === 'delivery' ? 'Nombre del cliente para entrega' : 'Nombre del cliente (opcional)'}"
              maxlength="100"
              autocomplete="off"
            >
            ${(draft.clientName || (loadedOrder?.clientName && loadedOrder.clientName !== 'Consumidor final')) ? `<button type="button" class="pos-client-clear-btn" data-pos-clear-client title="Borrar nombre">&times;</button>` : ''}
            <div id="pos-client-autocomplete-list" class="client-autocomplete-dropdown hidden"></div>
          </div>
          <div id="pos-client-debt-warning" class="pos-client-debt-alert hidden"></div>
        </div>

        <div class="pos-cart-scroll-area">
        <div class="cart-lines">${renderCartLines(state.cart)}</div>

        <div class="cart-totals-block">
          ${renderCartTotals(state.cart, state.posDiscountState)}
        </div>

        <!-- Opciones opcionales: NCF, Descuento, Propina -->
        <details class="pos-advanced-toggle" id="pos-advanced-details" ${draft.advancedOpen ? 'open' : ''}>
          <summary>
            <i data-lucide="sliders-horizontal"></i>
            <span>NCF · Descuento · Propina</span>
            <i data-lucide="chevron-down" class="chevron-icon"></i>
          </summary>
          <div class="pos-advanced-body">
            <div class="form-grid full">
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
                  <input name="posDiscountValue" id="pos-discount-value" type="text" min="0" placeholder="0" value="${state.posDiscountState?.discount || ''}" data-touch-numpad="decimal" data-numpad-title="Descuento" readonly inputmode="none" style="cursor:pointer;">
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

        <!-- DATOS DE DESPACHO DELIVERY (Si destino es Delivery) -->
        ${posDestination === 'delivery' ? `
          <div class="pos-cart-delivery-fields">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <span style="font-size:0.8rem;font-weight:800;color:#f59e0b;display:flex;align-items:center;gap:6px;">
                <i data-lucide="bike" style="width:15px;height:15px;"></i> Datos de Despacho Delivery
              </span>
              <button type="button" class="button secondary compact" data-driver-quick-new style="font-size:0.7rem;padding:2px 7px;height:auto;line-height:1.2;gap:3px;">
                <i data-lucide="user-plus" style="width:11px;height:11px;"></i> + Chofer
              </button>
            </div>

            <!-- Fila 1: Chofer y Teléfono -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:4px;">
              <div>
                <label style="font-size:0.7rem;color:var(--muted);font-weight:600;display:block;margin-bottom:2px;">Chofer asignado <strong style="color:#f59e0b;">*</strong></label>
                <select name="deliveryDriverId" id="pos-delivery-driver-select" style="font-size:0.8rem;padding:5px 7px;border-radius:8px;background:#1e293b;color:#f8fafc;border:1px solid #334155;width:100%;height:36px;">
                  <option value="">-- Seleccionar Chofer --</option>
                  ${(state.deliveryDrivers || []).filter(d => d.active !== false).map(d => `
                    <option value="${escapeHtml(d.id)}" data-name="${escapeHtml(d.name)}" ${draft.deliveryDriverId === d.id ? 'selected' : ''}>${escapeHtml(d.name)}${d.vehicle ? ' (' + escapeHtml(d.vehicle) + ')' : ''}</option>
                  `).join('')}
                </select>
                <input type="hidden" name="deliveryDriverName" id="pos-delivery-driver-name" value="${escapeHtml(draft.deliveryDriverName || '')}">
              </div>
              <div>
                <label style="font-size:0.7rem;color:var(--muted);font-weight:600;display:block;margin-bottom:2px;">Teléfono móvil</label>
                <input
                  type="tel"
                  name="deliveryPhone"
                  id="pos-delivery-phone"
                  value="${escapeHtml(draft.deliveryPhone || '')}"
                  placeholder="809-xxx-xxxx"
                  style="font-size:0.8rem;padding:5px 7px;border-radius:8px;background:#1e293b;color:#f8fafc;border:1px solid #334155;width:100%;height:36px;"
                >
              </div>
            </div>

            <!-- Fila 2: Dirección de entrega -->
            <div style="margin-bottom:4px;">
              <label style="font-size:0.7rem;color:var(--muted);font-weight:600;display:block;margin-bottom:2px;">Dirección de entrega <strong style="color:#f59e0b;">*</strong></label>
              <input
                type="text"
                name="deliveryAddress"
                id="pos-delivery-address"
                value="${escapeHtml(draft.deliveryAddress || '')}"
                placeholder="Calle, número, sector, punto de referencia..."
                style="width:100%;font-size:0.8rem;padding:5px 8px;border-radius:8px;background:#1e293b;color:#f8fafc;border:1px solid #334155;height:36px;"
              >
            </div>

            <!-- Fila 3: Costo de Envío / Delivery y Notas -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;align-items:start;">
              <div style="background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:4px 6px;">
                <span style="font-size:0.7rem;font-weight:700;color:#f59e0b;display:block;margin-bottom:3px;">Costo Envío (RD$):</span>
                <div style="display:flex;gap:4px;align-items:center;">
                  <input
                    name="deliveryFee"
                    id="pos-delivery-fee"
                    type="text"
                    data-touch-numpad="money"
                    data-numpad-title="Costo de Envío (Delivery)"
                    placeholder="0.00"
                    value="${draft.deliveryFee || ''}"
                    readonly
                    inputmode="none"
                    style="cursor:pointer;font-weight:800;color:var(--brand-2);font-size:0.85rem;padding:3px 5px;width:64px;border-radius:6px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.2);text-align:right;height:28px;"
                  >
                  <div style="display:flex;gap:3px;flex-wrap:wrap;flex:1;">
                    <button type="button" class="button secondary compact" data-quick-delivery-fee="0" style="font-size:0.68rem;padding:2px 4px;color:#ef4444;height:28px;line-height:1;">$0</button>
                    <button type="button" class="button secondary compact" data-quick-delivery-fee="50" style="font-size:0.68rem;padding:2px 4px;font-weight:700;height:28px;line-height:1;">+50</button>
                    <button type="button" class="button secondary compact" data-quick-delivery-fee="75" style="font-size:0.68rem;padding:2px 4px;font-weight:700;height:28px;line-height:1;">+75</button>
                    <button type="button" class="button secondary compact" data-quick-delivery-fee="100" style="font-size:0.68rem;padding:2px 4px;font-weight:700;height:28px;line-height:1;">+100</button>
                  </div>
                </div>
              </div>
              <div>
                <label style="font-size:0.7rem;color:var(--muted);font-weight:600;display:block;margin-bottom:2px;">Nota / Cambio chofer</label>
                <input
                  type="text"
                  name="deliveryNotes"
                  id="pos-delivery-notes"
                  value="${escapeHtml(draft.deliveryNotes || '')}"
                  placeholder="Ej: Paga con 1000..."
                  style="width:100%;font-size:0.8rem;padding:5px 8px;border-radius:8px;background:#1e293b;color:#f8fafc;border:1px solid #334155;height:36px;"
                >
              </div>
            </div>
          </div>
        ` : ''}

        <!-- PASO 2: FORMA DE PAGO -->
        <div id="pos-payment-options">
          <input type="hidden" name="paymentMethod" id="pos-payment-method" value="${escapeHtml(state.posPaymentMethod || (posDestination === 'delivery' ? 'delivery_cod' : 'cash'))}">
          <div class="pos-step-label">
            <span class="pos-step-badge">2</span>
            <span>${posDestination === 'delivery' ? '¿Cómo paga el cliente?' : '¿Cómo paga?'}</span>
          </div>
          <div class="pos-pay-method-grid" style="grid-template-columns: repeat(4, 1fr);">
            ${posDestination === 'delivery' ? `
              <button type="button" class="pos-pay-btn delivery ${(state.posPaymentMethod || 'delivery_cod') === 'delivery_cod' ? 'active' : ''}" data-pos-method="delivery_cod" title="El chofer cobra al entregar">
                <i data-lucide="hand-coins"></i>
                <span>Contra Entrega</span>
              </button>
              <button type="button" class="pos-pay-btn ${state.posPaymentMethod === 'transfer' ? 'active' : ''}" data-pos-method="transfer" title="Transferencia bancaria previa">
                <i data-lucide="landmark"></i>
                <span>Transferencia</span>
              </button>
              <button type="button" class="pos-pay-btn fiao ${state.posPaymentMethod === 'credit' ? 'active' : ''}" data-pos-method="credit" title="Anotar en cuenta por cobrar (Fiao)">
                <i data-lucide="book-open"></i>
                <span>Fiao</span>
              </button>
              <button type="button" class="pos-pay-btn ${state.posPaymentMethod === 'card' ? 'active' : ''}" data-pos-method="card" title="Tarjeta / Enlace">
                <i data-lucide="credit-card"></i>
                <span>Tarjeta</span>
              </button>
            ` : `
              <button type="button" class="pos-pay-btn ${(state.posPaymentMethod || 'cash') === 'cash' ? 'active' : ''}" data-pos-method="cash">
                <i data-lucide="banknote"></i>
                <span>Efectivo</span>
              </button>
              <button type="button" class="pos-pay-btn ${state.posPaymentMethod === 'card' ? 'active' : ''}" data-pos-method="card">
                <i data-lucide="credit-card"></i>
                <span>Tarjeta</span>
              </button>
              <button type="button" class="pos-pay-btn ${state.posPaymentMethod === 'transfer' ? 'active' : ''}" data-pos-method="transfer">
                <i data-lucide="landmark"></i>
                <span>Transferencia</span>
              </button>
              <button type="button" class="pos-pay-btn fiao ${state.posPaymentMethod === 'credit' ? 'active' : ''}" data-pos-method="credit">
                <i data-lucide="book-open"></i>
                <span>Fiao</span>
              </button>
            `}
          </div>

          <!-- Panel Efectivo -->
          <div id="pos-cash-panel" class="pos-method-panel ${(state.posPaymentMethod || 'cash') === 'cash' ? 'visible' : ''}">
            <details class="pos-cash-optional" ${draft.cashOpen ? 'open' : ''}>
            <summary>¿Necesitas calcular la devuelta?</summary>
            <div class="pos-cash-optional-body">
            <div class="pos-step-label">
              <span>Monto entregado (DOP)</span>
            </div>
            <input id="pos-cash-received" type="text"
              value="${escapeHtml(draft.cashReceived || '')}" placeholder="0.00" autocomplete="off" inputmode="none" readonly
              data-touch-numpad="money" data-numpad-title="Efectivo Entregado"
              class="pos-cash-input" style="cursor:pointer;">
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

          <!-- Panel Tarjeta -->
          <div id="pos-card-panel" class="pos-method-panel ${state.posPaymentMethod === 'card' ? 'visible' : ''}">
            <div class="pos-method-detail-card" style="border-color:rgba(84,201,141,.4);background:rgba(84,201,141,.07);">
              <div class="pos-method-detail-title">
                <i data-lucide="credit-card"></i>
                <strong>Cobro con Tarjeta (Terminal / Verifone)</strong>
              </div>
              <p class="pos-method-detail-hint">Cobra primero en la terminal o verifone de tarjeta, luego presiona Cobrar aquí para registrar e imprimir la factura.</p>
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

              <!-- Nombre o apodo obligatorio al fiar -->
              <label style="font-size:0.82rem;font-weight:600;position:relative;">Nombre o apodo del deudor <strong style="color:#f85149;">*</strong>
                <input name="fiaoClientName" id="pos-fiao-name" value="${escapeHtml(draft.fiaoClientName || '')}" placeholder="Ej: Pedro Mecánico, Doña Carmen..." maxlength="160" autocomplete="off">
                <div id="pos-fiao-autocomplete-list" class="client-autocomplete-dropdown hidden"></div>
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

          <!-- Panel Delivery (Contra Entrega) -->
          <div id="pos-delivery-panel" class="pos-method-panel ${state.posPaymentMethod === 'delivery_cod' ? 'visible' : ''}">
            <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:10px;padding:10px 14px;font-size:0.78rem;color:#f59e0b;display:flex;align-items:center;gap:8px;">
              <i data-lucide="hand-coins" style="width:16px;height:16px;flex-shrink:0;"></i>
              <span>El chofer cobrará al entregar el pedido. El dinero ingresará a caja cuando el chofer liquide su turno.</span>
            </div>
          </div>
          </div>
          </div>

          <!-- Opción de comprobante impreso -->
          <div class="pos-print-option-row" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:10px;margin-bottom:8px;">
            <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:#ddd;cursor:pointer;user-select:none;margin:0;">
              <input type="checkbox" name="printReceipt" id="pos-print-receipt" ${draft.printReceipt !== false ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--brand-2);cursor:pointer;">
              <i data-lucide="printer" style="width:16px;height:16px;color:var(--brand-2);"></i>
              <span>Imprimir factura al cobrar</span>
            </label>
            <span id="pos-print-status-badge" style="font-size:0.75rem;font-weight:700;padding:2px 8px;border-radius:6px;background:${draft.printReceipt !== false ? 'rgba(63,185,80,.18)' : 'rgba(255,255,255,.08)'};color:${draft.printReceipt !== false ? '#3fb950' : 'var(--muted)'};">
              ${draft.printReceipt !== false ? 'Con ticket' : 'Sin ticket'}
            </span>
          </div>

          <!-- Acciones del Carrito: Mandar a mesa y Cobrar -->
          <div class="pos-actions-group">
            <button
              class="pos-send-table-btn"
              type="button"
              data-pos-send-table
              ${cart.length ? '' : 'disabled'}
              title="Enviar comanda a la mesa o cocina"
              style="${posDestination !== 'table' ? 'display:none;' : ''}"
            >
              <i data-lucide="utensils"></i>
              <span>Mandar a mesa</span>
            </button>
            <button
              class="pos-cobrar-btn"
              type="submit"
              id="pos-submit-btn"
              ${cart.length ? '' : 'disabled'}
              style="${posDestination !== 'table' ? 'grid-column: 1 / -1; width: 100%;' : ''}"
            >
              <i data-lucide="key-round"></i>
              <span id="pos-submit-label">${loadedTable ? `Cobrar ${escapeHtml(loadedTable.name)} ${formatMoney(totals.totalCents)}` : posDestination === 'delivery' ? `Despachar Delivery ${formatMoney(totals.totalCents)}` : `Cobrar ${formatMoney(totals.totalCents)}`}</span>
            </button>
          </div>
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

function metric(label, value, icon, tone = '', sub = '') { return `<article class="metric-card ${tone}"><i data-lucide="${icon}"></i><div><span>${label}</span><strong>${value}</strong>${sub ? `<div class="metric-sub-tags">${sub}</div>` : ''}</div></article>`; }
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
  const isPrepared = Boolean(item.isPrepared);
  const stock = Number(item.stock ?? 0);
  const isOutOfStock = !isPrepared && stock <= 0;
  const isLowStock = !isPrepared && stock > 0 && stock <= 10;
  const stockClass = isPrepared ? 'stock-prepared' : isOutOfStock ? 'stock-out' : isLowStock ? 'stock-low' : 'stock-ok';
  const stockLabel = isPrepared ? 'Hecho al momento' : isOutOfStock ? 'Agotado' : isLowStock ? `Últimas ${stock}` : `Stock: ${stock}`;

  const variants = getProductVariants(item);
  const hasVariants = variants.length > 0;
  const hasSides = hasProductSides(item);
  let priceDisplay = formatMoney(item.priceCents);
  if (hasVariants) {
    const minPrice = Math.min(...variants.map(v => v.priceCents));
    priceDisplay = `Desde ${formatMoney(minPrice)}`;
  }

  return `<button class="product-card pos-product-tile ${stockClass}" data-product-add="${item.id}" data-category="${escapeHtml(item.category || 'General')}" data-search="${escapeHtml(`${item.name} ${item.sku || ''} ${item.category || ''}`.toLowerCase())}" style="--cat-accent:${meta.color};">
    <div class="product-tile-header">
      <span class="product-category-badge" style="color:${meta.color};background:${meta.bg};border-color:${meta.border};">
        <i data-lucide="${meta.icon}" style="width:12px;height:12px;"></i>
        ${escapeHtml(item.category || 'General')}
      </span>
      ${hasVariants ? `<span class="product-options-badge" style="font-size:0.68rem;padding:2px 6px;border-radius:4px;background:rgba(215,154,60,.18);color:var(--brand-2);font-weight:700;display:inline-flex;align-items:center;gap:3px;"><i data-lucide="layers" style="width:10px;height:10px;"></i> ${variants.length} tamaños</span>` : ''}
      ${hasSides && !hasVariants ? `<span class="product-options-badge" style="font-size:0.68rem;padding:2px 6px;border-radius:4px;background:rgba(56,189,248,.18);color:#38bdf8;font-weight:700;display:inline-flex;align-items:center;gap:3px;"><i data-lucide="utensils" style="width:10px;height:10px;"></i> Guarnición</span>` : ''}
      ${item.sku && !hasVariants ? `<span class="product-sku"><i data-lucide="barcode" style="width:10px;height:10px;display:inline-block;vertical-align:-1px;"></i> ${escapeHtml(item.sku)}</span>` : ''}
    </div>
    <div class="product-tile-body">
      <div class="product-tile-icon" style="color:${meta.color};background:${meta.bg};">
        <i data-lucide="${meta.icon}"></i>
      </div>
      <strong class="product-tile-name">${escapeHtml(item.name)}</strong>
    </div>
    <div class="product-tile-footer">
      <span class="product-stock-badge ${stockClass} clickable" data-stock-adjust="${item.id}" role="button" tabindex="0" title="Toca para variar inventario o registrar entrada (+)">
        <span class="stock-dot"></span>
        <span class="stock-badge-text">${stockLabel}</span>
        <span class="stock-quick-plus" title="Entrada / Ajuste"><i data-lucide="plus"></i></span>
      </span>
      <b class="product-tile-price">${priceDisplay}</b>
    </div>
  </button>`;
}

export function cartLine(item, index) {
  const isCustom = Boolean(item.isCustomPrice);
  const hasNotes = Boolean(item.notes && item.notes.trim());
  const hasVariant = Boolean(item.variantName);
  const hasSide = Boolean(item.side);
  const hasOptions = hasVariant || hasSide || Boolean(item.hasVariants || item.hasSides);

  return `<div class="cart-line pos-cart-line" data-cart-row="${index}">
    <div class="cart-line-header">
      <div style="flex:1;min-width:0;">
        <strong class="cart-line-name" ${hasOptions ? `data-cart-edit-options="${index}" style="cursor:pointer;" title="Tocar para cambiar tamaño o guarnición"` : ''}>${escapeHtml(item.name)}</strong>
        ${hasSide ? `
          <div class="cart-line-side-badge" style="display:inline-flex;align-items:center;gap:3px;font-size:0.74rem;color:var(--brand-2);background:rgba(245,158,11,.12);padding:1px 6px;border-radius:4px;margin-top:2px;">
            <i data-lucide="utensils" style="width:11px;height:11px;"></i>
            <span>Guarnición: <strong>${escapeHtml(item.side)}</strong></span>
          </div>
        ` : ''}
      </div>
      <b class="cart-line-total">${formatMoney(item.unitPriceCents * item.quantity)}</b>
    </div>
    <div class="cart-line-sub">
      <div class="cart-line-meta" style="display:flex;gap:6px;align-items:center;">
        <button type="button" class="cart-unit-price-btn ${isCustom ? 'is-adjusted' : ''}" data-cart-set-price="${index}" title="Tocar para cambiar precio manual (RD$)">
          <i data-lucide="circle-dollar-sign" style="width:12px;height:12px;"></i>
          <span>${formatMoney(item.unitPriceCents)} c/u</span>
          ${isCustom ? '<span class="badge-custom-price">Ajustado</span>' : ''}
        </button>
        ${hasOptions ? `
          <button type="button" class="cart-edit-options-btn" data-cart-edit-options="${index}" style="display:inline-flex;align-items:center;gap:4px;font-size:0.72rem;padding:3px 8px;border-radius:6px;background:rgba(255,255,255,.05);border:1px solid var(--line);color:#cbd5e1;cursor:pointer;" title="Cambiar tamaño o guarnición">
            <i data-lucide="sliders-horizontal" style="width:11px;height:11px;color:var(--brand-2);"></i> Opciones
          </button>
        ` : ''}
      </div>
      <div class="quantity-control pos-qty-control">
        <button type="button" class="qty-btn" data-cart-qty="${index}" data-delta="-1" aria-label="Restar una unidad">−</button>
        <span class="qty-display" data-cart-set-qty="${index}" style="cursor:pointer;" title="Tocar para editar cantidad">${item.quantity}</span>
        <button type="button" class="qty-btn" data-cart-qty="${index}" data-delta="1" aria-label="Sumar una unidad">+</button>
      </div>
    </div>
    <div class="cart-line-comment-row">
      <button type="button" class="cart-item-comment-btn ${hasNotes ? 'has-comment' : ''}" data-cart-item-note="${index}" title="Comentario para este artículo (ej. Ricky sin cebolla)">
        <i data-lucide="${hasNotes ? 'message-square' : 'message-square-plus'}" style="width:13px;height:13px;flex-shrink:0;"></i>
        <span class="cart-comment-text">${hasNotes ? escapeHtml(item.notes) : '+ Agregar comentario (ej: Ricky sin cebolla...)'}</span>
        ${hasNotes ? '<span class="cart-comment-edit-hint">Editar</span>' : ''}
      </button>
    </div>
  </div>`;
}

export function renderCartLines(items) {
  if (!items || !items.length) {
    return `<div class="pos-cart-empty">
      <i data-lucide="shopping-basket"></i>
      <div class="pos-cart-empty-text">
        <strong>Cuenta vacía</strong>
        <span>Toca cualquier producto del menú para agregarlo</span>
      </div>
    </div>`;
  }
  return items.map(cartLine).join('');
}

export function renderCartTotals(items, discountState = { discount: 0, discountType: 'amount', includeLegalTip: false }) {
  if (!items || !items.length) {
    return `<div class="cart-totals"><div><span>Subtotal</span><b>RD$ 0.00</b></div><div class="grand-total"><span>Total</span><strong>RD$ 0.00</strong></div></div>`;
  }
  const res = calculateDocument(items, discountState || {});
  return `<div class="cart-totals">
    <div class="cart-total-row"><span>Subtotal</span><b>${formatMoney(res.subtotalCents)}</b></div>
    ${res.discountCents > 0 ? `<div class="cart-total-row discount" style="color:#ef4444;"><span>Descuento</span><b>-${formatMoney(res.discountCents)}</b></div>` : ''}
    <div class="cart-total-row"><span>ITBIS</span><b>${formatMoney(res.taxCents)}</b></div>
    ${res.tipCents > 0 ? `<div class="cart-total-row tip" style="color:var(--brand-2);"><span>Propina Ley (10%)</span><b>${formatMoney(res.tipCents)}</b></div>` : ''}
    <div class="grand-total"><span>Total a Pagar</span><strong>${formatMoney(res.totalCents)}</strong></div>
  </div>`;
}

function kdsCard(order) {
  const action = order.status === 'pending'
    ? ['preparing', '<i data-lucide="flame" style="width:15px;height:15px;display:inline-block;vertical-align:-2px;margin-right:4px;"></i> Iniciar Preparación', 'kds-btn-prepare']
    : order.status === 'preparing'
    ? ['ready', '<i data-lucide="check-circle-2" style="width:15px;height:15px;display:inline-block;vertical-align:-2px;margin-right:4px;"></i> Marcar Lista para Servir', 'kds-btn-ready']
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
        ${order.priority !== 'normal' ? `<span class="kds-priority-tag ${order.priority}"><i data-lucide="${order.priority === 'urgent' ? 'alert-triangle' : 'zap'}" style="width:11px;height:11px;display:inline-block;vertical-align:-1px;margin-right:3px;"></i>${order.priority === 'urgent' ? 'URGENTE' : 'PRIORIDAD'}</span>` : ''}
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
            ${item.side ? `<div class="kds-item-side" style="display:flex;align-items:center;gap:4px;color:var(--brand-2);font-size:0.78rem;font-weight:700;margin-top:2px;"><i data-lucide="utensils" style="width:12px;height:12px;"></i> Guarnición: ${escapeHtml(item.side)}</div>` : ''}
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
function renderOutflowMiniList(items) {
  return items.length ? `<div class="mini-list">${items.map((item) => {
    const match = (item.reason || '').match(/^\[(.*?)\]\s*(.*)$/);
    const category = match ? match[1] : 'Salida';
    const detail = match ? match[2] : (item.reason || 'Salida de efectivo');
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;gap:12px;"><div style="display:flex;align-items:center;gap:10px;"><i data-lucide="trending-down" style="color:#f87171;width:18px;height:18px;flex-shrink:0;"></i><div><strong style="display:block;font-size:0.86rem;color:#f0f6fc;">${escapeHtml(detail)}</strong><small style="color:var(--muted);font-size:0.75rem;"><span style="color:#f87171;font-weight:600;">[${escapeHtml(category)}]</span> · ${escapeHtml(item.createdByName || 'Usuario')} · ${formatDate(item.createdAt, true)}</small></div></div><b style="color:#f87171;font-size:0.95rem;white-space:nowrap;">-${formatMoney(item.amountCents)}</b></div>`;
  }).join('')}</div>` : empty('wallet-cards', 'Sin salidas hoy', 'Los gastos o pagos de caja menor aparecerán aquí.');
}

function renderDashboardOrderList(items = []) {
  if (!items.length) {
    return empty('badge-check', 'Sin comandas pendientes', 'La cocina está totalmente al día.');
  }
  return `
    <div class="dash-orders-list">
      ${items.map((item) => {
        const d = typeof item.createdAt?.toDate === 'function' ? item.createdAt.toDate() : new Date(item.createdAt || Date.now());
        const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
        const isDelayed = mins > 20 && !['ready', 'served'].includes(item.status);
        const itemsBrief = Array.isArray(item.items)
          ? item.items.slice(0, 3).map((i) => `${i.quantity}x ${escapeHtml(i.name || '')}`).join(', ') + (item.items.length > 3 ? ` +${item.items.length - 3}` : '')
          : '';
        const statusLabel = STATUS_LABELS[item.status] || item.status;
        return `
          <button type="button" class="dash-order-card status-${item.status} ${isDelayed ? 'is-delayed' : ''}" data-order-open="${item.id}" title="Tocar para ver comanda de ${escapeHtml(item.tableName || 'Mesa')}">
            <div class="dash-order-header">
              <div class="dash-order-title">
                <span class="dot status-${item.status}"></span>
                <strong>${escapeHtml(item.tableName || 'Comanda')}</strong>
                ${item.clientName && item.clientName !== 'Consumidor final' ? `<small class="dash-order-client"><i data-lucide="user"></i> ${escapeHtml(item.clientName)}</small>` : ''}
              </div>
              <span class="dash-order-badge status-${item.status}">${statusLabel}</span>
            </div>
            ${itemsBrief ? `<div class="dash-order-items"><i data-lucide="utensils"></i> <span>${itemsBrief}</span></div>` : ''}
            <div class="dash-order-footer">
              <span class="dash-order-time ${isDelayed ? 'late' : ''}"><i data-lucide="${isDelayed ? 'alert-triangle' : 'clock'}"></i> hace ${mins} min</span>
              <span class="dash-order-total">${formatMoney(item.totalCents)}</span>
            </div>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderDashboardDeliveriesList(driverList = [], pendingDeliveries = []) {
  if (!pendingDeliveries.length) {
    return empty('bike', 'Sin entregas en ruta', 'Todos los pedidos a domicilio han sido entregados y liquidados.');
  }
  return `
    <div class="dash-deliveries-list">
      ${driverList.map((d) => `
        <div class="dash-driver-card">
          <div class="dash-driver-main">
            <div class="dash-driver-avatar">
              <i data-lucide="bike"></i>
            </div>
            <div class="dash-driver-info">
              <strong>${escapeHtml(d.name)}</strong>
              <small><b class="dash-counter-text">${d.count}</b> ${d.count === 1 ? 'pedido en calle' : 'pedidos en calle'}</small>
            </div>
          </div>
          <div class="dash-driver-meta">
            <span class="dash-driver-lbl">Por liquidar</span>
            <b class="dash-driver-amt">${formatMoney(d.totalCents)}</b>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderFinancialBreakdown(cashIn = 0, cardIn = 0, transferIn = 0) {
  const total = (cashIn + cardIn + transferIn) || 1;
  const cashPct = Math.round((cashIn / total) * 100);
  const cardPct = Math.round((cardIn / total) * 100);
  const transPct = Math.round((transferIn / total) * 100);
  return `
    <div class="dash-financial-box">
      <div class="dash-fin-bar" role="progressbar" aria-label="Distribución de ingresos">
        ${cashPct > 0 ? `<div class="dash-fin-seg cash" style="width:${cashPct}%;" title="Efectivo: ${formatMoney(cashIn)} (${cashPct}%)"></div>` : ''}
        ${cardPct > 0 ? `<div class="dash-fin-seg card" style="width:${cardPct}%;" title="Tarjeta: ${formatMoney(cardIn)} (${cardPct}%)"></div>` : ''}
        ${transPct > 0 ? `<div class="dash-fin-seg trans" style="width:${transPct}%;" title="Transferencia: ${formatMoney(transferIn)} (${transPct}%)"></div>` : ''}
      </div>
      <div class="dash-fin-legend">
        <div class="dash-fin-item cash">
          <span class="dash-fin-dot"></span>
          <div class="dash-fin-info">
            <span class="dash-fin-name">Efectivo</span>
            <strong class="dash-fin-val">${formatMoney(cashIn)}</strong>
          </div>
          <small class="dash-fin-pct">${cashPct}%</small>
        </div>
        <div class="dash-fin-item card">
          <span class="dash-fin-dot"></span>
          <div class="dash-fin-info">
            <span class="dash-fin-name">Tarjeta</span>
            <strong class="dash-fin-val">${formatMoney(cardIn)}</strong>
          </div>
          <small class="dash-fin-pct">${cardPct}%</small>
        </div>
        <div class="dash-fin-item trans">
          <span class="dash-fin-dot"></span>
          <div class="dash-fin-info">
            <span class="dash-fin-name">Transferencia</span>
            <strong class="dash-fin-val">${formatMoney(transferIn)}</strong>
          </div>
          <small class="dash-fin-pct">${transPct}%</small>
        </div>
      </div>
    </div>
  `;
}

function renderDashboardInvoiceList(items = []) {
  if (!items.length) {
    return empty('receipt', 'Sin documentos hoy', 'Las facturas y comprobantes aparecerán aquí.');
  }
  const METHOD_ICONS = {
    cash: 'banknote', card: 'credit-card', transfer: 'arrow-left-right', credit: 'clock', delivery_cod: 'bike'
  };
  return `
    <div class="dash-invoices-list">
      ${items.map((item) => {
        const method = item.paymentMethod || 'cash';
        const isPaid = item.status === 'paid';
        const methodIcon = METHOD_ICONS[method] || 'receipt';
        return `
          <button type="button" class="dash-invoice-row" data-invoice-view="${item.id}" title="Ver factura ${escapeHtml(item.invoiceNumber)}">
            <div class="dash-inv-icon"><i data-lucide="${methodIcon}"></i></div>
            <div class="dash-inv-info">
              <strong>${escapeHtml(item.invoiceNumber || 'Factura')}</strong>
              <small>${escapeHtml(item.clientName || 'Consumidor final')} · ${formatDate(item.createdAt, true)}</small>
            </div>
            <div class="dash-inv-meta">
              <span class="dash-inv-tag ${isPaid ? 'paid' : 'pending'}">${isPaid ? 'Cobrada' : 'Por cobrar'}</span>
              <b>${formatMoney(item.totalCents)}</b>
            </div>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

export function getDailyProductsBreakdown(invoices = [], products = []) {
  const prodMap = new Map((products || []).map((p) => [p.id, p]));
  const map = new Map();

  invoices.forEach((inv) => {
    (inv.items || []).forEach((line) => {
      const key = String(line.productId || line.name || 'item');
      const catalogProduct = line.productId ? prodMap.get(line.productId) : null;
      const isPrepared = catalogProduct ? Boolean(catalogProduct.isPrepared) : Boolean(line.isPrepared);
      const category = catalogProduct?.category || line.category || 'General';

      const existing = map.get(key) || {
        id: line.productId || key,
        name: line.name || catalogProduct?.name || 'Producto',
        category,
        isPrepared,
        quantity: 0,
        totalCents: 0
      };

      const qty = Number(line.quantity || 0);
      existing.quantity += qty;
      existing.totalCents += Number(line.totalCents ?? (Number(line.unitPriceCents || 0) * qty));
      map.set(key, existing);
    });
  });

  return [...map.values()].sort((a, b) => b.quantity - a.quantity || b.totalCents - a.totalCents);
}

function renderDailyProductsList(items = []) {
  if (!items.length) {
    return `<div class="empty-mini-list" style="padding:32px 16px;text-align:center;color:var(--muted);font-size:0.85rem;">
      <i data-lucide="utensils" style="width:28px;height:28px;margin:0 auto 10px;display:block;opacity:0.4;color:var(--brand-2);"></i>
      Sin artículos vendidos hoy. Los platos y productos facturados aparecerán aquí.
    </div>`;
  }

  const maxQty = items.length ? Math.max(...items.map((i) => i.quantity || 1)) : 1;
  return `<div class="daily-products-mini-list" style="display:flex;flex-direction:column;gap:10px;padding:4px 0;">
    ${items.map((item, index) => {
      const pct = Math.max(8, Math.min(100, Math.round(((item.quantity || 0) / maxQty) * 100)));
      return `
      <div class="daily-product-row" style="position:relative;overflow:hidden;padding:10px 14px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:12px;">
        <div style="position:absolute;left:0;top:0;bottom:0;width:${pct}%;background:linear-gradient(90deg, rgba(245,158,11,0.09), rgba(245,158,11,0.01));pointer-events:none;z-index:0;"></div>
        <div style="position:relative;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:12px;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
            <span style="display:grid;place-items:center;width:24px;height:24px;border-radius:6px;background:rgba(255,255,255,.06);color:var(--brand-2);font-size:0.75rem;font-weight:800;flex-shrink:0;">${index + 1}</span>
            <span style="font-size:0.68rem;padding:2px 7px;border-radius:6px;font-weight:750;${item.isPrepared ? 'background:rgba(16,185,129,.16);color:#34d399;border:1px solid rgba(16,185,129,.3);' : 'background:rgba(56,189,248,.15);color:#38bdf8;border:1px solid rgba(56,189,248,.3);'}flex-shrink:0;">
              ${item.isPrepared ? 'Cocina' : 'Stock'}
            </span>
            <div style="min-width:0;">
              <strong style="display:block;font-size:0.88rem;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.name)}</strong>
              <small style="font-size:0.72rem;color:var(--muted);">${escapeHtml(item.category)}</small>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <strong style="font-size:0.95rem;color:var(--brand-2);">${item.quantity} ${item.quantity === 1 ? 'ud' : 'uds'}</strong>
            <small style="display:block;font-size:0.75rem;color:#cbd5e1;font-weight:600;">${formatMoney(item.totalCents)}</small>
          </div>
        </div>
      </div>
    `;
    }).join('')}
  </div>`;
}

export function renderTablePickerModal(tables = [], selectedTableId = '', orders = []) {
  const activeTables = (tables || []).filter((t) => t.active !== false);
  return `
    <div class="modal-backdrop" data-modal-close>
      <article class="modal-card form-modal" style="max-width:540px;" data-modal-card>
        <header>
          <div>
            <span class="eyebrow">Mesas de Salón</span>
            <h2>Seleccionar Mesa</h2>
          </div>
          <button type="button" class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
        </header>
        <p style="font-size:0.82rem;color:var(--muted);margin:4px 0 12px;">
          Toca una mesa para asignarla a la venta actual o para cargar una comanda pendiente a la cuenta.
        </p>
        <div class="table-picker-grid">
          <button type="button" class="table-picker-cell ${!selectedTableId ? 'is-current' : ''}" data-pick-table-id="">
            <i data-lucide="shopping-bag" style="width:26px;height:26px;color:var(--brand-2);"></i>
            <strong>Para Llevar</strong>
            <small>Mostrador / Venta rápida</small>
          </button>
          ${activeTables.map((t) => {
            const order = (orders || []).find((o) => o.id === t.currentOrderId);
            const isOccupied = Boolean(t.currentOrderId && order);
            const isCurrent = (t.id === selectedTableId);
            const total = order?.totalCents || 0;
            const hasClient = order?.clientName && order.clientName !== 'Consumidor final';
            if (isOccupied) {
              return `
                <div class="table-picker-cell is-occupied ${isCurrent ? 'is-current' : ''}">
                  <button type="button" class="table-picker-cell-btn" data-pick-table-id="${t.id}" data-has-order="1" title="Toca para cargar la comanda de ${escapeHtml(t.name)}">
                    <i data-lucide="utensils" style="width:24px;height:24px;color:#f59e0b;"></i>
                    <strong>${escapeHtml(t.name)}</strong>
                    ${hasClient ? `<span class="picker-cell-client" title="Cliente: ${escapeHtml(order.clientName)}"><i data-lucide="user" style="width:11px;height:11px;display:inline-block;vertical-align:-1px;"></i> ${escapeHtml(order.clientName)}</span>` : ''}
                    <span class="picker-cell-badge occupied">Ocupada (${formatMoney(total)})</span>
                  </button>
                  <button type="button" class="table-picker-liberate-btn" data-pos-cancel-table="${t.id}" title="Anular comanda y liberar ${escapeHtml(t.name)}">
                    <i data-lucide="trash-2" style="width:11px;height:11px;"></i> Liberar Mesa
                  </button>
                </div>
              `;
            }
            return `
              <button type="button" class="table-picker-cell is-free ${isCurrent ? 'is-current' : ''}" data-pick-table-id="${t.id}" data-has-order="0" title="Seleccionar ${escapeHtml(t.name)}">
                <i data-lucide="utensils" style="width:26px;height:26px;color:#10b981;"></i>
                <strong>${escapeHtml(t.name)}</strong>
                <span class="picker-cell-badge free">Disponible</span>
              </button>
            `;
          }).join('')}
        </div>
        <footer class="modal-actions" style="margin-top:14px;">
          <button type="button" class="button secondary" data-modal-close>Cerrar</button>
        </footer>
      </article>
    </div>
  `;
}

export function renderProductOptionPickerModal(product, existingCartItem = null, cartIndex = null) {
  if (!product) return '';
  const meta = getCategoryMeta(product.category);
  const variants = getProductVariants(product);
  const hasVariants = variants.length > 0;
  const hasSides = hasProductSides(product);
  const availableSides = getProductSides(product);
  const sidePriceCents = Number(product.sidePriceCents || 0);

  const currentVariantId = existingCartItem?.variantId || (hasVariants ? variants[0]?.id : null);
  const currentSide = existingCartItem?.side || '';
  const currentHasSide = Boolean(existingCartItem ? existingCartItem.side : false);
  const currentNotes = existingCartItem?.notes || '';
  const isEditing = cartIndex != null && existingCartItem != null;

  const currentVariant = variants.find((v) => v.id === currentVariantId) || variants[0];
  const basePriceCents = currentVariant ? currentVariant.priceCents : Number(product.priceCents || 0);
  const initialTotalCents = basePriceCents + (currentHasSide ? sidePriceCents : 0);

  return `
    <div class="modal-backdrop" data-modal-close>
      <form id="product-options-form" class="modal-card form-modal" style="max-width:540px;" data-modal-card>
        <input type="hidden" name="productId" value="${escapeHtml(product.id || '')}">
        <input type="hidden" name="cartIndex" value="${cartIndex != null ? cartIndex : ''}">
        <input type="hidden" name="basePriceCents" id="picker-base-price" value="${basePriceCents}">
        <input type="hidden" name="sidePriceCents" id="picker-side-price" value="${sidePriceCents}">
        <input type="hidden" name="selectedVariantId" id="picker-variant-id" value="${escapeHtml(currentVariantId || '')}">
        <input type="hidden" name="selectedVariantName" id="picker-variant-name" value="${escapeHtml(currentVariant?.name || '')}">
        <input type="hidden" name="selectedSide" id="picker-selected-side" value="${escapeHtml(currentSide || '')}">
        <input type="hidden" name="hasSide" id="picker-has-side" value="${currentHasSide ? 'yes' : 'no'}">

        <header style="border-bottom:1px solid var(--line);padding-bottom:12px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:38px;height:38px;border-radius:10px;display:grid;place-items:center;color:${meta.color};background:${meta.bg};border:1px solid ${meta.border};flex-shrink:0;">
              <i data-lucide="${meta.icon}" style="width:20px;height:20px;"></i>
            </div>
            <div style="min-width:0;">
              <span class="eyebrow" style="color:var(--brand-2);">${escapeHtml(product.category || 'General')} · ${isEditing ? 'Modificar en Carrito' : 'Elegir Opciones'}</span>
              <h2 style="font-size:1.25rem;margin:2px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff;">${escapeHtml(product.name)}</h2>
            </div>
          </div>
          <button type="button" class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
        </header>

        <div class="stack-form" style="padding-top:12px;gap:16px;">

          <!-- SELECCIÓN DE TAMAÑO / PORCIÓN -->
          ${hasVariants ? `
            <div class="picker-section">
              <label style="font-size:0.82rem;font-weight:800;color:var(--brand-2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                <i data-lucide="layers" style="width:14px;height:14px;"></i> Selecciona el Tamaño o Porción:
              </label>
              <div class="variant-chips-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:8px;">
                ${variants.map((v) => {
                  const isSelected = v.id === currentVariantId;
                  return `
                    <button type="button" class="variant-chip ${isSelected ? 'active' : ''}" data-picker-variant="${escapeHtml(v.id)}" data-variant-price="${v.priceCents}" data-variant-name="${escapeHtml(v.name)}" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px 8px;border-radius:10px;border:2px solid ${isSelected ? 'var(--brand-2)' : 'var(--line)'};background:${isSelected ? 'rgba(215,154,60,.18)' : 'rgba(255,255,255,.04)'};color:${isSelected ? 'var(--brand-2)' : '#e6edf3'};cursor:pointer;transition:all 0.15s ease;">
                      <strong style="font-size:1rem;display:block;margin-bottom:3px;">${escapeHtml(v.name)}</strong>
                      <b style="font-size:0.92rem;color:${isSelected ? 'var(--brand-2)' : '#cbd5e1'};">${formatMoney(v.priceCents)}</b>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <!-- SELECCIÓN DE ACOMPAÑAMIENTO / GUARNICIÓN -->
          ${hasSides ? `
            <div class="picker-section" style="border-top:1px solid rgba(255,255,255,.06);padding-top:12px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <label style="font-size:0.82rem;font-weight:800;color:var(--brand-2);text-transform:uppercase;letter-spacing:0.5px;margin:0;display:flex;align-items:center;gap:6px;">
                  <i data-lucide="utensils" style="width:14px;height:14px;"></i> Acompañamiento / Guarnición:
                </label>
                ${sidePriceCents > 0 ? `<span style="font-size:0.75rem;padding:2px 8px;border-radius:6px;background:rgba(215,154,60,.12);color:var(--brand-2);font-weight:700;">+${formatMoney(sidePriceCents)}</span>` : '<span style="font-size:0.75rem;color:#10b981;font-weight:700;">Incluida</span>'}
              </div>

              <!-- Switch Solo vs Acompañado -->
              <div class="side-mode-selector" style="display:grid;grid-template-columns:repeat(2, 1fr);gap:8px;margin-bottom:10px;">
                <button type="button" class="side-mode-btn ${!currentHasSide ? 'active' : ''}" data-picker-side-mode="none" style="padding:10px 12px;border-radius:8px;border:1px solid ${!currentHasSide ? 'var(--brand-2)' : 'var(--line)'};background:${!currentHasSide ? 'rgba(215,154,60,.18)' : 'rgba(255,255,255,.03)'};color:${!currentHasSide ? 'var(--brand-2)' : '#94a3b8'};font-weight:700;font-size:0.88rem;cursor:pointer;">
                  Solo (Sin Acompañamiento)
                </button>
                <button type="button" class="side-mode-btn ${currentHasSide ? 'active' : ''}" data-picker-side-mode="side" style="padding:10px 12px;border-radius:8px;border:1px solid ${currentHasSide ? 'var(--brand-2)' : 'var(--line)'};background:${currentHasSide ? 'rgba(215,154,60,.18)' : 'rgba(255,255,255,.03)'};color:${currentHasSide ? 'var(--brand-2)' : '#94a3b8'};font-weight:700;font-size:0.88rem;cursor:pointer;">
                  Acompañado ${sidePriceCents > 0 ? `(+${formatMoney(sidePriceCents)})` : ''}
                </button>
              </div>

              <!-- Lista de Guarniciones -->
              <div id="picker-sides-container" style="display:${currentHasSide ? 'grid' : 'none'};grid-template-columns:repeat(auto-fit, minmax(110px, 1fr));gap:6px;max-height:160px;overflow-y:auto;padding:6px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(0,0,0,.25);">
                ${availableSides.map((sideName) => {
                  const isSideActive = currentSide === sideName;
                  return `
                    <button type="button" class="picker-side-chip ${isSideActive ? 'active' : ''}" data-picker-side="${escapeHtml(sideName)}" style="padding:8px 6px;border-radius:6px;border:1px solid ${isSideActive ? 'var(--brand-2)' : 'rgba(255,255,255,.1)'};background:${isSideActive ? 'rgba(215,154,60,.28)' : 'rgba(255,255,255,.03)'};color:${isSideActive ? '#fff' : '#cbd5e1'};font-size:0.82rem;font-weight:700;cursor:pointer;text-align:center;">
                      ${escapeHtml(sideName)}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
          ` : ''}

          <!-- NOTAS / COMENTARIOS EXTRA -->
          <div class="picker-section" style="border-top:1px solid rgba(255,255,255,.06);padding-top:10px;">
            <label style="font-size:0.8rem;color:var(--muted);display:block;margin-bottom:4px;">
              Comentario especial o instrucciones para cocina:
              <input type="text" name="notes" id="picker-notes-input" maxlength="200" value="${escapeHtml(currentNotes)}" placeholder="Ej: Sin cebolla, poco hielo, bien cocido..." style="margin-top:4px;width:100%;font-size:0.85rem;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.04);border:1px solid var(--line);color:#fff;">
            </label>
          </div>

          <!-- RESUMEN DE TOTAL Y ACCIÓN -->
          <div style="background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:4px;">
            <div>
              <span style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;font-weight:700;display:block;">Precio del artículo:</span>
              <strong id="picker-total-display" style="font-size:1.45rem;color:var(--brand-2);">${formatMoney(initialTotalCents)}</strong>
            </div>
            <button type="submit" class="button primary" style="padding:10px 20px;font-size:0.95rem;font-weight:800;">
              <i data-lucide="${isEditing ? 'check' : 'plus'}"></i>
              <span>${isEditing ? 'Actualizar Artículo' : 'Agregar al Carrito'}</span>
            </button>
          </div>

        </div>
      </form>
    </div>
  `;
}
