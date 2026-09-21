import { escapeHtml, formatDate, formatMoney } from '../lib/format.js';
import { businessDateKey, BUSINESS_TIME_ZONE } from '../lib/business-time.js';
import { matchesFuzzy } from '../lib/fuzzy-search.js';
import { getPendingDeliveryInvoices } from '../domain/billing.js';
import { renderPinPadHtml } from '../lib/pin-pad.js';
import releaseInfo from '../../release.json' with { type: 'json' };

export function renderTerminalDiag() {
  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Gestión de Terminal</span>
        <h2>Diagnóstico y control de terminal</h2>
        <p>Verifica la conexión local de impresora, gaveta, escáner y visor antes de operar.</p>
      </div>
      <button class="button secondary" data-refresh><i data-lucide="refresh-cw"></i> Actualizar</button>
    </section>

    <div id="terminal-diag-grid" class="metric-grid">
      <article class="metric-card" id="diag-status-printer">
        <i data-lucide="printer"></i>
        <div><span>Impresora térmica</span><strong id="diag-printer-val">Verificando…</strong></div>
      </article>
      <article class="metric-card" id="diag-status-paper">
        <i data-lucide="scroll"></i>
        <div><span>Sensor de Papel (80mm)</span><strong id="diag-paper-val">Verificando…</strong></div>
      </article>
      <article class="metric-card" id="diag-status-drawer">
        <i data-lucide="wallet"></i>
        <div><span>Gaveta de efectivo</span><strong id="diag-drawer-val">Verificando…</strong></div>
      </article>
      <article class="metric-card" id="diag-status-scanner">
        <i data-lucide="scan-barcode"></i>
        <div><span>Escáner / lector</span><strong id="diag-scanner-val">Verificando…</strong></div>
      </article>
      <article class="metric-card" id="diag-status-vfd">
        <i data-lucide="monitor"></i>
        <div><span>Visor Cliente VFD</span><strong id="diag-vfd-val">Verificando…</strong></div>
      </article>
      <article class="metric-card" id="diag-status-msr">
        <i data-lucide="credit-card"></i>
        <div><span>Lector de tarjetas MSR</span><strong id="diag-msr-val">Verificando…</strong></div>
      </article>
      <article class="metric-card" id="diag-status-server">
        <i data-lucide="wifi"></i>
        <div><span>Puente local de hardware</span><strong id="diag-server-val">Verificando…</strong></div>
      </article>
      <article class="metric-card">
        <i data-lucide="cpu"></i>
        <div><span>Modelo / Android</span><strong id="diag-model-val">—</strong></div>
      </article>
      <article class="metric-card">
        <i data-lucide="globe"></i>
        <div><span>IP reportada por la terminal</span><strong id="diag-ip-val">—</strong></div>
      </article>
    </div>

    <div class="surface-card" style="margin-top:16px; padding: 20px;">
      <h3 style="margin: 0 0 16px; font-size: .9rem; color: #f5f5f5;">Pruebas de Hardware en Vivo</h3>
      <div style="display:flex; flex-wrap:wrap; gap:10px;">
        <button class="button primary compact" data-test-print><i data-lucide="printer"></i> Imprimir ticket 80mm con Logo y QR</button>
        <button class="button secondary compact" data-diag-action="checkPaper"><i data-lucide="scroll"></i> Consultar Sensor de Papel</button>
        <button class="button secondary compact" data-diag-action="openDrawer"><i data-lucide="wallet"></i> Abrir gaveta</button>
        <button class="button secondary compact" data-diag-action="testVfd"><i data-lucide="monitor"></i> Probar Visor Cliente</button>
        <button class="button secondary compact" data-diag-action="vfdWelcome"><i data-lucide="message-square-warning"></i> Visor: Bienvenida</button>
        <button class="button secondary compact" data-diag-action="vfdThanks"><i data-lucide="badge-check"></i> Visor: Gracias</button>
        <button class="button secondary compact" data-diag-action="clearVfd"><i data-lucide="monitor"></i> Apagar visor</button>
        <button class="button secondary compact" data-diag-action="scannerOn"><i data-lucide="scan-barcode"></i> Activar escáner</button>
        <button class="button secondary compact" data-diag-action="scannerOff"><i data-lucide="barcode"></i> Apagar escáner</button>
        <button class="button secondary compact" data-diag-action="beepOk"><i data-lucide="volume-2"></i> Beep Éxito</button>
        <button class="button secondary compact" data-diag-action="beepError"><i data-lucide="volume-2"></i> Beep Error</button>
        <button class="button secondary compact" data-diag-action="reconnectPrinter"><i data-lucide="refresh-cw"></i> Reconectar Impresora</button>
      </div>
    </div>

    <div class="surface-card" style="margin-top:16px; padding: 20px;">
      <h3 style="margin: 0 0 16px; font-size: .9rem; color: #f5f5f5;">Dispositivos USB Detectados en el Sistema</h3>
      <div id="diag-usb-list" style="font-size:.78rem; color: var(--muted);">Cargando periféricos…</div>
    </div>

    <div class="surface-card" style="margin-top:16px; padding: 20px;">
      <h3 style="margin: 0 0 10px; font-size: .9rem; color: #f5f5f5;">Soporte técnico por ADB</h3>
      <p style="margin: 0 0 14px; font-size:.78rem; color:var(--muted); line-height:1.5;">
        No es necesario para vender. Úsalo solo si el técnico habilitó ADB en la terminal y necesitas mantenimiento avanzado:
      </p>
      <code id="diag-adb-command" style="display:block; background:#0d1117; padding:12px; border-radius:8px; font-size:.75rem; color:#7ee787; word-break:break-all; white-space:pre-wrap;">Esperando IP reportada por la terminal…</code>
    </div>`;
}

export const CASH_MOVEMENT_CATEGORIES = {
  out: [
    { id: 'insumos', label: 'Insumos y Compras', icon: 'shopping-basket', color: '#f59e0b', hint: 'Hielo, pan, carnes, salsas, vegetales, envases...' },
    { id: 'servicios', label: 'Servicios y Operación', icon: 'zap', color: '#38bdf8', hint: 'Gas, agua, luz, recargas, internet...' },
    { id: 'mantenimiento', label: 'Mantenimiento / Taller', icon: 'wrench', color: '#a855f7', hint: 'Reparaciones, piezas, limpieza, plomería...' },
    { id: 'delivery', label: 'Delivery y Choferes', icon: 'bike', color: '#ec4899', hint: 'Pago o viáticos a choferes, gasolina...' },
    { id: 'personal', label: 'Personal / Adelantos', icon: 'users', color: '#6366f1', hint: 'Adelantos de sueldo, vales, propinas...' },
    { id: 'retiro', label: 'Retiro del Propietario', icon: 'landmark', color: '#f43f5e', hint: 'Retiro de fondos por el dueño del negocio...' },
    { id: 'otros_gastos', label: 'Otros Gastos Menores', icon: 'minus', color: '#94a3b8', hint: 'Cualquier otro desembolso menor de caja...' }
  ],
  in: [
    { id: 'sencillo', label: 'Sencillo / Cambio', icon: 'banknote', color: '#10b981', hint: 'Monedas o menudo traído para dar cambio...' },
    { id: 'aporte', label: 'Aporte de Capital / Dueño', icon: 'wallet', color: '#06b6d4', hint: 'Inyección de dinero extra para operar...' },
    { id: 'cobro_extra', label: 'Cobro Extraordinario', icon: 'badge-dollar-sign', color: '#84cc16', hint: 'Ingreso o cobro no vinculado a factura...' },
    { id: 'devolucion', label: 'Devolución / Reembolso', icon: 'rotate-ccw', color: '#eab308', hint: 'Reembolso de proveedor o compra devuelta...' },
    { id: 'otra_entrada', label: 'Otra Entrada', icon: 'plus', color: '#64748b', hint: 'Cualquier otro ingreso manual de efectivo...' }
  ]
};

export function getCashMovementCategoryMeta(type = 'out', raw = '') {
  const list = type === 'in' ? CASH_MOVEMENT_CATEGORIES.in : CASH_MOVEMENT_CATEGORIES.out;
  const match = String(raw || '').match(/^\[(.*?)\]\s*(.*)$/);
  const tag = match ? match[1].trim() : '';
  const cleanReason = match ? match[2].trim() : String(raw || '').trim();
  const candidate = (tag || cleanReason).toLowerCase();

  for (const cat of list) {
    if (candidate.includes(cat.id) || candidate.includes(cat.label.toLowerCase())) {
      return { ...cat, cleanReason };
    }
  }

  let selected = list[list.length - 1];
  if (type === 'out') {
    if (/insumo|compra|hielo|\bpan\b|carne|pollo|queso|vegetal|alimento|refresco|cerveza|envase|funda/i.test(candidate)) selected = list[0];
    else if (/servicio|luz|\bgas\b|agua|internet|recarga|factura|edesur|edeeste|coraasan/i.test(candidate)) selected = list[1];
    else if (/reparaci|mantenimiento|taller|limpieza|plomer|pintura|pieza/i.test(candidate)) selected = list[2];
    else if (/delivery|repartidor|chofer|gasolina|motor|pasaje/i.test(candidate)) selected = list[3];
    else if (/personal|n[oó]mina|sueldo|adelanto|vale|empleado|salario/i.test(candidate)) selected = list[4];
    else if (/retiro|dueño|propietario|ganancia|personal dueño/i.test(candidate)) selected = list[5];
    else selected = list[6];
  } else {
    if (/cambio|sencillo|menudo|moneda/i.test(candidate)) selected = list[0];
    else if (/aporte|capital|fondo|inyecci/i.test(candidate)) selected = list[1];
    else if (/cobro|extraordinario|ingreso|otro ingreso/i.test(candidate)) selected = list[2];
    else if (/devoluci|reembolso|retorno/i.test(candidate)) selected = list[3];
    else selected = list[4];
  }
  return { ...selected, cleanReason };
}

export function calculateCashSessionFinancials(session, state = {}) {
  if (!session) {
    return {
      active: false,
      openingCents: 0,
      cashCollected: 0,
      cashCollectedCents: 0,
      cardCollected: 0,
      cardCollectedCents: 0,
      transferCollected: 0,
      creditCollected: 0,
      totalCollected: 0,
      totalSalesCents: 0,
      netSalesCents: 0,
      invoicedTotalCents: 0,
      cogsCents: 0,
      grossMarginCents: 0,
      grossMarginPct: 0,
      cashIn: 0,
      cashInCents: 0,
      cashOut: 0,
      cashOutCents: 0,
      expectedCash: 0,
      expectedDrawerCents: 0,
      wasteLossCents: 0,
      wasteCents: 0,
      netProfitCents: 0,
      netProfitPct: 0,
      healthStatus: 'warning',
      categoriesBreakdown: {},
      pendingDeliveriesCount: 0,
      deliveryPendingCents: 0,
      receivablesCents: 0
    };
  }

  const payments = state.payments || [];
  const movements = state.cashMovements || [];
  const invoices = state.invoices || [];
  const products = state.products || [];
  const inventoryMovements = state.inventoryMovements || [];

  const sessionPayments = payments.filter((p) => p.cashSessionId === session.id);
  const sessionMovements = movements.filter((m) => m.cashSessionId === session.id);

  const cashCollected = sessionPayments.filter((p) => p.method === 'cash').reduce((sum, p) => sum + Number(p.amountCents || 0), 0);
  const cardCollected = sessionPayments.filter((p) => p.method === 'card').reduce((sum, p) => sum + Number(p.amountCents || 0), 0);
  const transferCollected = sessionPayments.filter((p) => p.method === 'transfer').reduce((sum, p) => sum + Number(p.amountCents || 0), 0);
  const creditCollected = sessionPayments.filter((p) => p.method === 'credit').reduce((sum, p) => sum + Number(p.amountCents || 0), 0);
  const totalCollected = sessionPayments.reduce((sum, p) => sum + Number(p.amountCents || 0), 0);

  const cashIn = sessionMovements.filter((m) => m.type === 'in').reduce((sum, m) => sum + Number(m.amountCents || 0), 0);
  const cashOut = sessionMovements.filter((m) => m.type === 'out').reduce((sum, m) => sum + Number(m.amountCents || 0), 0);
  const expectedCash = Number(session.openingCents || 0) + cashCollected + cashIn - cashOut;

  const sessionStartTime = session.openedAt ? new Date(session.openedAt).getTime() : 0;
  const sessionEndTime = session.closedAt ? new Date(session.closedAt).getTime() : Infinity;

  const sessionInvoices = invoices.filter((inv) => {
    if (inv.status === 'cancelled') return false;
    if (inv.cashSessionId === session.id) return true;
    if (inv.createdAt) {
      const t = new Date(inv.createdAt).getTime();
      return t >= sessionStartTime && t <= sessionEndTime;
    }
    return false;
  });

  const pendingDeliveries = getPendingDeliveryInvoices(sessionInvoices.length ? sessionInvoices : invoices);
  const deliveryPendingCents = pendingDeliveries.reduce((sum, inv) => sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)), 0);
  const receivablesCents = sessionInvoices
    .filter((inv) => inv.status === 'pending' || inv.status === 'credit' || inv.paymentMethod === 'fiao')
    .reduce((sum, inv) => sum + Math.max(0, Number(inv.totalCents || 0) - Number(inv.paidCents || 0)), 0);

  const invoicedTotalCents = sessionInvoices.reduce((sum, inv) => sum + Number(inv.totalCents || 0), 0);
  const totalSalesCents = Math.max(invoicedTotalCents, totalCollected);

  const productCostMap = new Map();
  for (const prod of products) {
    if (prod.id) {
      const cCents = prod.costCents != null ? Number(prod.costCents) : (prod.cost != null ? Math.round(Number(prod.cost) * 100) : 0);
      productCostMap.set(prod.id, cCents);
    }
  }

  let cogsCents = 0;
  for (const inv of sessionInvoices) {
    const lines = inv.items || inv.lines || [];
    for (const line of lines) {
      const qty = Number(line.quantity ?? line.qty ?? 1);
      const unitCost = line.costCents != null
        ? Number(line.costCents)
        : (line.cost != null ? Math.round(Number(line.cost) * 100) : (productCostMap.get(line.productId) || 0));
      cogsCents += Math.round(unitCost * qty);
    }
  }

  const grossMarginCents = totalSalesCents - cogsCents;
  const grossMarginPct = totalSalesCents > 0 ? Math.round((grossMarginCents / totalSalesCents) * 100) : 0;

  const sessionWaste = inventoryMovements.filter((item) => {
    if (!item.isWaste && item.operation !== 'waste' && item.type !== 'waste') return false;
    if (item.createdAt) {
      const t = new Date(item.createdAt).getTime();
      return t >= sessionStartTime && t <= sessionEndTime;
    }
    return true;
  });
  const wasteLossCents = sessionWaste.reduce((sum, item) => sum + Number(item.wasteCostCents || item.totalCostCents || item.amountCents || 0), 0);

  const netProfitCents = grossMarginCents - cashOut - wasteLossCents;
  const netProfitPct = totalSalesCents > 0 ? Math.round((netProfitCents / totalSalesCents) * 100) : 0;
  const healthStatus = netProfitPct >= 15 ? 'healthy' : (netProfitPct > 0 ? 'warning' : 'critical');

  const categoriesBreakdown = {};
  for (const cat of CASH_MOVEMENT_CATEGORIES.out) {
    categoriesBreakdown[cat.id] = { label: cat.label, icon: cat.icon, color: cat.color, amountCents: 0 };
  }
  for (const mov of sessionMovements) {
    if (mov.type !== 'out') continue;
    const meta = getCashMovementCategoryMeta('out', mov.category || mov.reason);
    if (!categoriesBreakdown[meta.id]) {
      categoriesBreakdown[meta.id] = { label: meta.label, icon: meta.icon, color: meta.color, amountCents: 0 };
    }
    categoriesBreakdown[meta.id].amountCents += Number(mov.amountCents || 0);
  }

  return {
    active: true,
    sessionId: session.id,
    openedAt: session.openedAt,
    openedByName: session.openedByName || 'Cajero',
    openingCents: Number(session.openingCents || 0),
    cashCollected,
    cashCollectedCents: cashCollected,
    cardCollected,
    cardCollectedCents: cardCollected,
    transferCollected,
    creditCollected,
    totalCollected,
    totalSalesCents,
    netSalesCents: totalSalesCents,
    invoicedTotalCents,
    cogsCents,
    grossMarginCents,
    grossMarginPct,
    cashIn,
    cashInCents: cashIn,
    cashOut,
    cashOutCents: cashOut,
    expectedCash,
    expectedDrawerCents: expectedCash,
    wasteLossCents,
    wasteCents: wasteLossCents,
    netProfitCents,
    netProfitPct,
    healthStatus,
    categoriesBreakdown,
    pendingDeliveriesCount: pendingDeliveries.length,
    deliveryPendingCents,
    receivablesCents: receivablesCents || deliveryPendingCents
  };
}

export function renderCash(state) {
  const active = state.activeCash;
  const currentTab = state.cashTab || 'overview';
  const movementsFilter = state.cashMovementTypeFilter || 'all';
  const movementsSearch = (state.cashMovementSearch || '').toLowerCase().trim();

  // Movimientos de la sesión activa o de todo el historial si no hay activa
  const sessionMovements = active
    ? (state.cashMovements || []).filter((item) => item.cashSessionId === active.id)
    : (state.cashMovements || []);

  const fin = calculateCashSessionFinancials(active, state);

  // Filtrado de movimientos para el Libro
  const filteredMovements = sessionMovements.filter((item) => {
    if (movementsFilter === 'out' && item.type !== 'out') return false;
    if (movementsFilter === 'in' && item.type !== 'in') return false;
    if (movementsSearch) {
      const match = (item.reason || '').match(/^\[(.*?)\]\s*(.*)$/);
      const cat = (match ? match[1] : (item.category || '')).toLowerCase();
      const reason = (match ? match[2] : (item.reason || '')).toLowerCase();
      const user = (item.createdByName || '').toLowerCase();
      const amountStr = (Number(item.amountCents || 0) / 100).toFixed(2);
      return cat.includes(movementsSearch) || reason.includes(movementsSearch) || user.includes(movementsSearch) || amountStr.includes(movementsSearch);
    }
    return true;
  });

  const outMovements = sessionMovements.filter(m => m.type === 'out');
  const inMovements = sessionMovements.filter(m => m.type === 'in');

  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Control de Tesorería y Caja</span>
        <h2>${active ? 'Caja abierta' : 'Inicia tu jornada'}</h2>
        <p>Control de efectivo en gaveta, registro de entradas y salidas, y balance de rentabilidad (P&L).</p>
      </div>
      <div class="header-actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${active ? `
          <button class="drawer-kick-btn" type="button" data-drawer-kick="open_only" title="Abrir físicamente la gaveta con pulso de hardware">
            <i data-lucide="wallet"></i> Abrir gaveta
          </button>
          <button class="button secondary compact" type="button" data-cash-movement-open="in" style="font-weight:700;color:#10b981;border-color:rgba(16,185,129,.35);background:rgba(16,185,129,.08);">
            <i data-lucide="plus"></i> Entrada
          </button>
          <button class="button secondary compact" type="button" data-cash-movement-open="out" style="font-weight:700;color:#f87171;border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.08);">
            <i data-lucide="minus"></i> Salida / Gasto
          </button>
          <button class="button danger compact" type="button" data-cash-close-open style="font-weight:700;">
            <i data-lucide="lock"></i> Cerrar (Corte Z)
          </button>
        ` : `
          <button class="button primary compact" type="button" data-quick-open-cash style="font-weight:700;">
            <i data-lucide="wallet"></i> Abrir caja
          </button>
        `}
        <div class="status-chip ${active ? 'online' : 'muted'}">
          <i data-lucide="circle-dollar-sign"></i>${active ? 'Sesión activa' : 'Sin sesión'}
        </div>
      </div>
    </section>

    <!-- Barra de Pestañas Táctiles de Caja -->
    <div class="cash-tabs-bar" role="tablist">
      <button type="button" class="cash-tab-btn ${currentTab === 'overview' ? 'active' : ''}" data-cash-tab="overview">
        <i data-lucide="layout-dashboard"></i>
        <span>Turno Activo & Rentabilidad</span>
      </button>
      <button type="button" class="cash-tab-btn ${currentTab === 'movements' ? 'active' : ''}" data-cash-tab="movements">
        <i data-lucide="book-open"></i>
        <span>Libro de Entradas y Salidas</span>
        <span class="cash-tab-badge">${sessionMovements.length}</span>
      </button>
      <button type="button" class="cash-tab-btn ${currentTab === 'history' ? 'active' : ''}" data-cash-tab="history">
        <i data-lucide="history"></i>
        <span>Historial de Sesiones</span>
        <span class="cash-tab-badge">${(state.cashSessions || []).length}</span>
      </button>
    </div>

    <!-- PESTAÑA 1: TURNO ACTIVO Y RENTABILIDAD (P&L) -->
    ${currentTab === 'overview' ? `
      ${active ? `
        <!-- Métricas Táctiles Principales -->
        <div class="metric-grid cash-metric-grid">
          <article class="metric-card">
            <i data-lucide="wallet"></i>
            <div><span>Fondo inicial</span><strong>${formatMoney(fin.openingCents)}</strong></div>
          </article>
          <article class="metric-card positive">
            <i data-lucide="badge-dollar-sign"></i>
            <div><span>Ventas en efectivo</span><strong>${formatMoney(fin.cashCollected)}</strong></div>
          </article>
          <article class="metric-card positive">
            <i data-lucide="credit-card"></i>
            <div><span>Tarjetas y Bancos</span><strong>${formatMoney(fin.cardCollected + fin.transferCollected)}</strong></div>
          </article>
          <article class="metric-card positive">
            <i data-lucide="plus"></i>
            <div><span>Entradas manuales</span><strong style="color:#10b981;">+${formatMoney(fin.cashIn)}</strong></div>
          </article>
          <article class="metric-card negative">
            <i data-lucide="landmark"></i>
            <div><span>Salidas / Gastos</span><strong style="color:#f87171;">-${formatMoney(fin.cashOut)}</strong></div>
          </article>
          <article class="metric-card cash-highlight-card">
            <i data-lucide="calculator" style="color:var(--brand-2);"></i>
            <div>
              <span style="color:var(--brand-2);font-weight:700;">Efectivo en gaveta</span>
              <strong style="font-size:1.35rem;color:var(--brand-2);">${formatMoney(fin.expectedCash)}</strong>
            </div>
          </article>
        </div>

        ${fin.deliveryPendingCents > 0 ? `
          <div style="margin:12px 0 16px;padding:12px 16px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;color:#f59e0b;">
            <div style="display:flex;align-items:center;gap:10px;">
              <i data-lucide="bike" style="width:22px;height:22px;flex-shrink:0;"></i>
              <div>
                <strong>${formatMoney(fin.deliveryPendingCents)} en la calle</strong>
                <span style="display:block;font-size:0.78rem;color:#cbd5e1;">${fin.pendingDeliveriesCount} pedido(s) despachados pendientes de cobro o liquidación por chofer.</span>
              </div>
            </div>
            <button type="button" class="button secondary compact" data-route="deliveries" style="font-size:0.8rem;padding:6px 14px;border-color:rgba(245,158,11,.4);color:#f59e0b;">
              Ver Deliveries
            </button>
          </div>
        ` : ''}

        <!-- ASISTENTE DE RENTABILIDAD / GANANCIAS Y PÉRDIDAS (P&L DEL TURNO) -->
        <section class="surface-card cash-pnl-card" style="padding:22px;margin-bottom:18px;border-radius:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
            <div>
              <span class="eyebrow" style="color:var(--brand-2);font-weight:800;">Motor Financiero del Negocio</span>
              <h3 style="margin:2px 0 4px;font-size:1.18rem;display:flex;align-items:center;gap:8px;">
                <i data-lucide="chart-no-axes-combined" style="color:var(--brand-2);width:20px;height:20px;"></i>
                Balance de Ganancias y Pérdidas del Turno (P&L)
              </h3>
              <p style="margin:0;color:var(--muted);font-size:0.82rem;">
                Rentabilidad operativa real calculada a partir de ventas, costo de materia prima (COGS), mermas y salidas de caja.
              </p>
            </div>
            <div class="pnl-health-badge ${fin.netProfitCents >= 0 ? 'health-good' : 'health-danger'}">
              ${fin.netProfitCents >= 0 ? `<i data-lucide="trending-up" style="width:13px;height:13px;display:inline-block;vertical-align:-1px;margin-right:4px;"></i>Rentabilidad Positiva (+${fin.netProfitPct}%)` : `<i data-lucide="alert-triangle" style="width:13px;height:13px;display:inline-block;vertical-align:-1px;margin-right:4px;"></i>Déficit Operativo (${fin.netProfitPct}%)`}
            </div>
          </div>

          <!-- Cuadrícula de 3 columnas: Ingresos, Costos y Margen Bruto -->
          <div class="cash-pnl-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:14px;">
            <div class="cash-pnl-stat-box">
              <span class="pnl-stat-title"><i data-lucide="badge-dollar-sign"></i> Ventas Netas Totales</span>
              <strong class="pnl-stat-val" style="color:#38bdf8;">${formatMoney(fin.totalSalesCents)}</strong>
              <div class="pnl-stat-sub">
                <span>Efectivo: ${formatMoney(fin.cashCollected)}</span> • 
                <span>Bancos: ${formatMoney(fin.cardCollected + fin.transferCollected)}</span>
              </div>
            </div>

            <div class="cash-pnl-stat-box">
              <span class="pnl-stat-title"><i data-lucide="shopping-cart"></i> Costo de Mercancía (COGS)</span>
              <strong class="pnl-stat-val" style="color:#cbd5e1;">-${formatMoney(fin.cogsCents)}</strong>
              <div class="pnl-stat-sub">
                ${fin.totalSalesCents > 0 ? `${Math.round((fin.cogsCents / fin.totalSalesCents) * 100)}% del ingreso bruto` : 'Sin ventas registradas'}
              </div>
            </div>

            <div class="cash-pnl-stat-box highlight">
              <span class="pnl-stat-title"><i data-lucide="trending-up"></i> Margen Bruto Comercial</span>
              <strong class="pnl-stat-val" style="color:#10b981;">+${formatMoney(fin.grossMarginCents)}</strong>
              <div class="pnl-stat-sub" style="color:#10b981;font-weight:700;">
                ${fin.grossMarginPct}% de margen comercial
              </div>
            </div>
          </div>

          <!-- Deducciones de caja y resultado neto -->
          <div style="background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:14px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;">
            <div style="display:flex;gap:20px;flex-wrap:wrap;">
              <div>
                <span style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;font-weight:700;display:block;">Gastos y Salidas de Caja:</span>
                <strong style="font-size:1.05rem;color:#f87171;">-${formatMoney(fin.cashOut)}</strong>
              </div>
              <div>
                <span style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;font-weight:700;display:block;">Mermas de Inventario:</span>
                <strong style="font-size:1.05rem;color:#f59e0b;">-${formatMoney(fin.wasteLossCents)}</strong>
              </div>
            </div>

            <div style="text-align:right;">
              <span style="font-size:0.76rem;color:var(--muted);text-transform:uppercase;font-weight:800;display:block;letter-spacing:0.5px;">
                Resultado Neto Operativo (Ganancia o Pérdida):
              </span>
              <strong style="font-size:1.45rem;font-weight:900;color:${fin.netProfitCents >= 0 ? '#10b981' : '#f87171'};">
                ${fin.netProfitCents >= 0 ? '+' : ''}${formatMoney(fin.netProfitCents)}
              </strong>
            </div>
          </div>

          <!-- Barra de Proporción Financiera -->
          ${fin.totalSalesCents > 0 ? `
            <div style="margin-top:10px;">
              <div style="display:flex;justify-content:space-between;font-size:0.74rem;color:var(--muted);margin-bottom:5px;">
                <span>Distribución del Peso Facturado:</span>
                <span>Margen Neto: <strong>${fin.netProfitPct}%</strong></span>
              </div>
              <div style="height:10px;border-radius:6px;overflow:hidden;background:rgba(255,255,255,.05);display:flex;">
                <div style="width:${Math.min(100, Math.max(0, Math.round((fin.cogsCents / fin.totalSalesCents) * 100)))}%;background:#94a3b8;" title="Costo Mercancía (${Math.round((fin.cogsCents / fin.totalSalesCents) * 100)}%)"></div>
                <div style="width:${Math.min(100, Math.max(0, Math.round((fin.cashOut / fin.totalSalesCents) * 100)))}%;background:#f87171;" title="Gastos de Caja (${Math.round((fin.cashOut / fin.totalSalesCents) * 100)}%)"></div>
                <div style="width:${Math.min(100, Math.max(0, Math.round((fin.netProfitCents / fin.totalSalesCents) * 100)))}%;background:#10b981;" title="Ganancia Neta (${fin.netProfitPct}%)"></div>
              </div>
              <div style="display:flex;gap:14px;font-size:0.72rem;margin-top:6px;flex-wrap:wrap;">
                <span style="display:flex;align-items:center;gap:5px;"><span style="width:8px;height:8px;border-radius:2px;background:#94a3b8;"></span> Costo Producto (${Math.round((fin.cogsCents / fin.totalSalesCents) * 100)}%)</span>
                <span style="display:flex;align-items:center;gap:5px;"><span style="width:8px;height:8px;border-radius:2px;background:#f87171;"></span> Gastos Caja (${Math.round((fin.cashOut / fin.totalSalesCents) * 100)}%)</span>
                <span style="display:flex;align-items:center;gap:5px;"><span style="width:8px;height:8px;border-radius:2px;background:#10b981;"></span> Ganancia Neta (${fin.netProfitPct}%)</span>
              </div>
            </div>
          ` : ''}
        </section>

        <!-- Acciones Operativas y Arqueo -->
        <section class="surface-card" style="padding:18px 22px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;">
          <div>
            <span class="eyebrow">Turno abierto por ${escapeHtml(active.openedByName)}</span>
            <h3 style="margin:2px 0 4px;font-size:1.05rem;">Iniciado el ${formatDate(active.openedAt, true)}</h3>
            <p style="margin:0;color:var(--muted);font-size:0.82rem;">${escapeHtml(active.notes || 'Sin observaciones de apertura.')}</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="button secondary compact" data-cash-corte-x="${active.id}">
              <i data-lucide="receipt"></i> Imprimir Corte X (Parcial)
            </button>
            <button type="button" class="button secondary compact" data-cash-report-print="${active.id}">
              <i data-lucide="printer"></i> Imprimir Arqueo Completo
            </button>
            <button type="button" class="button danger compact" data-cash-close-open style="font-weight:700;">
              <i data-lucide="lock"></i> Cerrar Turno (Corte Z)
            </button>
          </div>
        </section>
      ` : `
        <section class="surface-card empty-action" style="padding:40px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:14px;">
          <div style="width:68px;height:68px;border-radius:50%;background:rgba(245,158,11,0.14);color:var(--brand-2);display:flex;align-items:center;justify-content:center;">
            <i data-lucide="wallet-cards" style="width:36px;height:36px;"></i>
          </div>
          <div>
            <h3 style="margin:0 0 6px;font-size:1.3rem;">Caja Cerrada · Inicia un nuevo turno</h3>
            <p style="color:var(--muted);max-width:480px;margin:0 auto;font-size:0.88rem;">
              Registra el fondo inicial en efectivo y autoriza con tu PIN táctil para habilitar cobros, comandas y arqueo de jornada.
            </p>
          </div>
          <button type="button" class="button primary" data-quick-open-cash style="font-size:1rem;padding:12px 28px;font-weight:700;margin-top:6px;">
            <i data-lucide="wallet"></i> Abrir caja (Iniciar turno)
          </button>
        </section>
      `}
    ` : ''}

    <!-- PESTAÑA 2: LIBRO DE ENTRADAS Y SALIDAS -->
    ${currentTab === 'movements' ? `
      <section class="surface-card" style="padding:18px 22px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
          <div>
            <span class="eyebrow">Libro de Efectivo</span>
            <h3 style="margin:2px 0 2px;font-size:1.15rem;">Entradas y Salidas de Caja</h3>
            <p style="margin:0;color:var(--muted);font-size:0.8rem;">
              Auditoría cronológica de retiros, compras menores, pagos a choferes e inyecciones de fondos.
            </p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${active ? `
              <button type="button" class="button secondary compact" data-cash-movement-open="in" style="color:#10b981;border-color:rgba(16,185,129,.35);background:rgba(16,185,129,.08);font-weight:700;">
                <i data-lucide="plus"></i> + Registrar Entrada
              </button>
              <button type="button" class="button secondary compact" data-cash-movement-open="out" style="color:#f87171;border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.08);font-weight:700;">
                <i data-lucide="minus"></i> - Registrar Salida / Gasto
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Filtros y Buscador Rápido -->
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="cash-filter-chip ${movementsFilter === 'all' ? 'active' : ''}" data-cash-movement-type-filter="all">
              Todos (${sessionMovements.length})
            </button>
            <button type="button" class="cash-filter-chip ${movementsFilter === 'out' ? 'active' : ''}" data-cash-movement-type-filter="out" style="${movementsFilter === 'out' ? 'background:rgba(239,68,68,.18);border-color:#f87171;color:#f87171;' : ''}">
              Salidas / Gastos (${outMovements.length} · -${formatMoney(fin.cashOut)})
            </button>
            <button type="button" class="cash-filter-chip ${movementsFilter === 'in' ? 'active' : ''}" data-cash-movement-type-filter="in" style="${movementsFilter === 'in' ? 'background:rgba(16,185,129,.18);border-color:#10b981;color:#10b981;' : ''}">
              Entradas (${inMovements.length} · +${formatMoney(fin.cashIn)})
            </button>
          </div>

          <div style="position:relative;width:100%;max-width:320px;">
            <i data-lucide="search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:var(--muted);"></i>
            <input id="cash-movements-search-input" data-cash-movement-search type="text" placeholder="Buscar por motivo, categoría o usuario..." value="${escapeHtml(state.cashMovementSearch || '')}" style="padding-left:34px;width:100%;font-size:0.82rem;">
          </div>
        </div>

        <!-- Distribución de Gastos por Categoría (Mini-Cards) -->
        ${outMovements.length > 0 ? `
          <div style="margin-bottom:16px;">
            <span style="font-size:0.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:8px;letter-spacing:0.5px;">
              Distribución de Salidas por Rubro:
            </span>
            <div class="cash-categories-summary-grid">
              ${Object.values(fin.categoriesBreakdown || {}).filter(cat => cat.amountCents > 0).map(cat => `
                <div class="cash-cat-summary-card">
                  <div style="display:flex;align-items:center;gap:6px;font-size:0.78rem;font-weight:700;color:${cat.color};">
                    <i data-lucide="${cat.icon}" style="width:14px;height:14px;"></i>
                    <span>${escapeHtml(cat.label)}</span>
                  </div>
                  <strong style="font-size:1rem;color:#f87171;margin-top:2px;display:block;">
                    -${formatMoney(cat.amountCents)}
                  </strong>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Tabla / Lista de Movimientos -->
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha y Hora</th>
                <th>Tipo</th>
                <th>Categoría</th>
                <th>Motivo / Justificación</th>
                <th>Usuario</th>
                <th style="text-align:right;">Monto</th>
                <th style="text-align:center;">Comprobante</th>
              </tr>
            </thead>
            <tbody>
              ${filteredMovements.length ? filteredMovements.map((item) => {
                const match = (item.reason || '').match(/^\[(.*?)\]\s*(.*)$/);
                const categoryLabel = match ? match[1] : (item.category || '');
                const reasonText = match ? match[2] : item.reason;
                const meta = getCashMovementCategoryMeta(item.type, categoryLabel || reasonText);
                const isOut = item.type === 'out';

                return `
                  <tr>
                    <td style="white-space:nowrap;font-size:0.8rem;color:var(--muted);">
                      ${formatDate(item.createdAt, true)}
                    </td>
                    <td>
                      <span class="document-status ${isOut ? 'status-cancelled' : 'status-paid'}" style="font-weight:800;">
                        ${isOut ? '- Salida' : '+ Entrada'}
                      </span>
                    </td>
                    <td>
                      <span class="cash-cat-chip" style="background:${isOut ? 'rgba(239,68,68,.12)' : 'rgba(16,185,129,.12)'};color:${meta.color};border:1px solid ${meta.color}40;">
                        <i data-lucide="${meta.icon}" style="width:12px;height:12px;"></i>
                        <span>${escapeHtml(meta.label)}</span>
                      </span>
                    </td>
                    <td style="font-size:0.84rem;max-width:280px;">
                      <strong style="color:#eee;">${escapeHtml(reasonText || item.reason || 'Sin motivo')}</strong>
                    </td>
                    <td style="font-size:0.82rem;color:var(--muted);white-space:nowrap;">
                      <i data-lucide="key-round" style="width:12px;height:12px;vertical-align:-1px;"></i> ${escapeHtml(item.createdByName || 'Usuario')}
                    </td>
                    <td style="text-align:right;font-weight:800;font-size:0.95rem;color:${isOut ? '#f87171' : '#10b981'};white-space:nowrap;">
                      ${isOut ? '-' : '+'}${formatMoney(item.amountCents)}
                    </td>
                    <td style="text-align:center;white-space:nowrap;">
                      <button type="button" class="icon-button" data-cash-movement-print="${item.id}" title="Imprimir Comprobante Térmico (80mm)" style="color:var(--brand-2);">
                        <i data-lucide="printer"></i>
                      </button>
                    </td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="7" style="text-align:center;padding:24px;color:var(--muted);">
                    ${movementsSearch ? 'No se encontraron movimientos que coincidan con la búsqueda.' : 'Sin movimientos registrados en este período.'}
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </section>
    ` : ''}

    <!-- PESTAÑA 3: HISTORIAL DE SESIONES Y CIERRES -->
    ${currentTab === 'history' ? `
      <section class="surface-card data-surface" style="padding:18px 22px;">
        <header style="margin-bottom:14px;">
          <div>
            <span class="eyebrow">Bitácora de Cierres</span>
            <h3 style="margin:2px 0 2px;font-size:1.15rem;">Historial de Turnos y Arqueos (Corte Z)</h3>
            <p style="margin:0;color:var(--muted);font-size:0.8rem;">
              Auditoría histórica de aperturas, fondos, ventas, diferencias de caja y comprobantes definitivos.
            </p>
          </div>
          <strong>${(state.cashSessions || []).length} turno(s)</strong>
        </header>

        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Responsable</th>
                <th>Apertura</th>
                <th>Fondo Inicial</th>
                <th>Cierre Efectivo</th>
                <th>Diferencia Arqueo</th>
                <th>Estado</th>
                <th style="text-align:center;">Acción</th>
              </tr>
            </thead>
            <tbody>
              ${(state.cashSessions || []).length ? (state.cashSessions || []).map((item) => {
                const variance = Number(item.varianceCents || 0);
                const isClosed = item.status === 'closed';
                const varianceText = !isClosed ? '—' : variance === 0 ? 'Cuadrado (0.00)' : variance > 0 ? `+${formatMoney(variance)}` : formatMoney(variance);
                const varianceClass = !isClosed ? '' : variance === 0 ? 'color:#10b981;font-weight:700;' : variance > 0 ? 'color:#38bdf8;font-weight:700;' : 'color:#f87171;font-weight:700;';

                return `
                  <tr>
                    <td>
                      <strong style="color:#eee;">${escapeHtml(item.openedByName || 'Usuario')}</strong>
                      ${item.closingNotes ? `<small style="display:block;font-size:0.72rem;color:var(--muted);">${escapeHtml(item.closingNotes)}</small>` : ''}
                    </td>
                    <td style="font-size:0.8rem;color:var(--muted);white-space:nowrap;">
                      ${formatDate(item.openedAt, true)}
                    </td>
                    <td style="font-weight:700;white-space:nowrap;">
                      ${formatMoney(item.openingCents)}
                    </td>
                    <td style="font-weight:700;white-space:nowrap;">
                      ${isClosed ? formatMoney(item.closingCents) : '<span style="color:var(--muted);">En curso</span>'}
                    </td>
                    <td style="white-space:nowrap;${varianceClass}">
                      ${varianceText}
                    </td>
                    <td>
                      <span class="document-status ${item.status === 'open' ? 'status-paid' : ''}">
                        ${item.status === 'open' ? 'Abierta' : 'Cerrada'}
                      </span>
                    </td>
                    <td style="text-align:center;white-space:nowrap;">
                      <button class="button secondary compact" data-cash-report-print="${item.id}" title="Imprimir arqueo térmico completo" style="font-size:0.78rem;padding:4px 10px;">
                        <i data-lucide="printer"></i> Arqueo
                      </button>
                    </td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="7" style="text-align:center;padding:24px;color:var(--muted);">
                    No hay sesiones registradas en el historial.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </section>
    ` : ''}
  `;
}

export function renderSettings(state) {
  const item = state.settings || {};
  const update = state.updateStatus || {};
  const eloNative = update.supported === true || (typeof window !== 'undefined' && window._ELO_NATIVE === true);
  const legacyNative = eloNative && update.supported !== true;
  const installedName = update.installedVersionName || (typeof window !== 'undefined' && window._ELO_APP_VERSION) || '';
  const installedCode = Number(update.installedVersionCode || (typeof window !== 'undefined' && window._ELO_APP_VERSION_CODE) || 0);
  const updateState = update.state || (eloNative ? 'idle' : 'unsupported');
  const stateLabels = {
    idle: 'Preparado', checking: 'Buscando…', up_to_date: 'Al día', available: 'Nueva versión',
    downloading: 'Descargando…', verifying: 'Verificando…', ready: 'Lista para instalar',
    waiting_for_idle: 'Esperando fin de venta', permission_required: 'Permiso requerido',
    installing: 'Instalando…', awaiting_confirmation: 'Confirmación de Android', installed: 'Instalada',
    error: 'Requiere atención', unsupported: legacyNative ? 'Instalación inicial requerida' : 'Solo navegador'
  };
  const updateBusy = ['checking', 'downloading', 'verifying', 'installing', 'awaiting_confirmation'].includes(updateState);
  const updateProgress = Number(update.progressPercent || 0);
  return `
    <section class="panel-heading"><div><span class="eyebrow">Configuración</span><h2>Identidad, facturación y terminal ELO</h2><p>Solo el propietario puede modificar estos valores.</p></div></section>
    <form id="settings-form" class="surface-card settings-form stack-form">
      <div class="form-section">
        <h3>Negocio</h3>
        <div class="form-grid two"><label>Nombre comercial<input name="name" required maxlength="160" value="${escapeHtml(item.name || '')}"></label><label>Razón social<input name="legalName" maxlength="160" value="${escapeHtml(item.legalName || '')}"></label></div>
        <div class="form-grid three"><label>RNC<input name="rnc" maxlength="30" value="${escapeHtml(item.rnc || '')}"></label><label>Teléfono<input name="phone" maxlength="30" value="${escapeHtml(item.phone || '')}"></label><label>Correo<input name="email" type="email" maxlength="160" value="${escapeHtml(item.email || '')}"></label></div>
        <label>Dirección<textarea name="address" maxlength="300">${escapeHtml(item.address || '')}</textarea></label>
      </div>

      <div class="form-section">
        <h3>Documentos fiscales</h3>
        <div class="form-grid three"><label>Prefijo factura<input name="invoicePrefix" required maxlength="12" value="${escapeHtml(item.invoicePrefix || 'PAN-')}"></label><label>Prefijo cotización<input name="quotePrefix" required maxlength="12" value="${escapeHtml(item.quotePrefix || 'COT-')}"></label><label>Prefijo proforma<input name="proformaPrefix" required maxlength="12" value="${escapeHtml(item.proformaPrefix || 'PROF-')}"></label></div>
        <div class="form-grid two"><label>ITBIS predeterminado %<input name="defaultTaxRate" type="number" min="0" max="100" step="0.01" value="${item.defaultTaxRate ?? 0}"></label><label>Pie de recibo térmico<input name="receiptFooter" maxlength="300" value="${escapeHtml(item.receiptFooter || '')}"></label></div>
      </div>

      <div class="form-section">
        <h3>Terminal ELO PayPoint y Hardware POS</h3>
        <div class="form-grid two">
          <label>Controlador de Impresora Térmica
            <select name="printerDriver">
              <option value="auto" ${item.printerDriver === 'auto' || !item.printerDriver ? 'selected' : ''}>Automático (RawBT ESC/POS / Android)</option>
              <option value="browser" ${item.printerDriver === 'browser' ? 'selected' : ''}>Diálogo del Sistema (Rollo 80mm)</option>
            </select>
          </label>
          <label>Ancho de Papel
            <select name="paperWidth">
              <option value="80mm" selected>80 mm / 3 pulgadas (Estándar ELO PayPoint)</option>
              <option value="58mm" ${item.paperWidth === '58mm' ? 'selected' : ''}>58 mm / 2 pulgadas</option>
            </select>
          </label>
        </div>
        <div class="form-grid two" style="margin-top: 10px;">
          <label>Modo Reposo / Apagado automático de pantalla
            <select name="screenSleepTimeout">
              <option value="60" ${Number(item.screenSleepTimeout) === 60 ? 'selected' : ''}>1 minuto de inactividad</option>
              <option value="120" ${Number(item.screenSleepTimeout) === 120 ? 'selected' : ''}>2 minutos de inactividad</option>
              <option value="180" ${Number(item.screenSleepTimeout) === 180 || item.screenSleepTimeout == null ? 'selected' : ''}>3 minutos de inactividad (Recomendado)</option>
              <option value="300" ${Number(item.screenSleepTimeout) === 300 ? 'selected' : ''}>5 minutos de inactividad</option>
              <option value="600" ${Number(item.screenSleepTimeout) === 600 ? 'selected' : ''}>10 minutos de inactividad</option>
              <option value="0" ${Number(item.screenSleepTimeout) === 0 ? 'selected' : ''}>Desactivado (Pantalla siempre activa)</option>
            </select>
          </label>
          <div style="display: flex; align-items: flex-end; padding-bottom: 2px;">
            <p style="font-size: 0.8rem; color: var(--muted); margin: 0; line-height: 1.35;">
              <i data-lucide="moon" style="width: 14px; height: 14px; vertical-align: middle; color: var(--brand-2);"></i>
              Al no detectar uso, la pantalla se apaga para ahorrar energía y calor. Tocar cualquier punto la despierta de inmediato.
            </p>
          </div>
        </div>
        <div style="display: grid; gap: 10px; margin-top: 14px;">
          <label class="check-field"><input name="autoOpenDrawer" type="checkbox" ${item.autoOpenDrawer !== false ? 'checked' : ''}> Abrir gaveta automáticamente al cobrar en efectivo</label>
          <label class="check-field"><input name="autoPrintInvoice" type="checkbox" ${item.autoPrintInvoice !== false ? 'checked' : ''}> Imprimir ticket automáticamente al completar cobro</label>
          <label class="check-field"><input name="autoPrintKitchen" type="checkbox" ${item.autoPrintKitchen !== false ? 'checked' : ''}> Imprimir comanda automáticamente al enviar a cocina</label>
          <label class="check-field"><input name="enableEloScanner" type="checkbox" ${item.enableEloScanner ? 'checked' : ''}> Activar luz de escáner láser automáticamente al entrar al POS</label>
        </div>
        <div class="hardware-test-grid">
          <button type="button" class="button secondary compact" data-test-print><i data-lucide="printer"></i> Probar ticket de prueba (80mm)</button>
          <button type="button" class="button secondary compact" data-test-drawer><i data-lucide="wallet"></i> Probar pulso de apertura de gaveta</button>
          <button type="button" class="button secondary compact" data-test-sleep><i data-lucide="moon"></i> Probar modo reposo (apagar pantalla)</button>
        </div>

        <section class="elo-update-card" data-update-state="${escapeHtml(updateState)}">
          <header>
            <div class="elo-update-title">
              <i data-lucide="refresh-cw"></i>
              <div><span class="eyebrow">Actualizaciones seguras</span><h4>Aplicación nativa ELO</h4></div>
            </div>
            <span class="elo-update-badge">${escapeHtml(stateLabels[updateState] || 'Preparado')}</span>
          </header>
          <div class="elo-update-version">
            <div><span>Versión instalada</span><strong>${eloNative ? (installedName && installedCode ? `v${escapeHtml(installedName)} · código ${installedCode}` : 'Versión anterior sin actualizador') : 'App nativa no detectada'}</strong></div>
            ${Number(update.availableVersionCode || 0) > installedCode ? `<div><span>Versión disponible</span><strong>v${escapeHtml(update.availableVersionName || '')} · código ${Number(update.availableVersionCode)}</strong></div>` : ''}
          </div>
          <p class="elo-update-message">${escapeHtml(legacyNative ? 'Instala una vez el paquete disponible en Recuperación e instalación manual para habilitar las próximas actualizaciones automáticas.' : update.message || (eloNative
            ? 'La terminal buscará versiones nuevas al iniciar y cada seis horas.'
            : 'La interfaz web se actualiza sola. Instala la app nativa para controlar impresora, gaveta y actualizaciones APK.'))}</p>
          ${['downloading', 'verifying', 'ready'].includes(updateState) ? `<div class="elo-update-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${updateProgress}"><span style="width:${Math.max(2, Math.min(100, updateProgress))}%"></span></div>` : ''}
          ${Array.isArray(update.releaseNotes) && update.releaseNotes.length ? `<ul class="elo-update-notes">${update.releaseNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : ''}
          <div class="elo-update-actions">
            ${update.supported === true && updateState !== 'error' ? `<button type="button" class="button secondary compact" data-update-check ${updateBusy ? 'disabled' : ''}><i data-lucide="refresh-cw"></i> Buscar actualización</button>` : ''}
            ${['ready', 'waiting_for_idle'].includes(updateState) ? '<button type="button" class="button primary compact" data-update-install><i data-lucide="download"></i> Instalar ahora</button>' : ''}
            ${updateState === 'permission_required' ? '<button type="button" class="button primary compact" data-update-permission><i data-lucide="shield-check"></i> Permitir instalación</button>' : ''}
            ${updateState === 'error' ? '<button type="button" class="button primary compact" data-update-check><i data-lucide="refresh-cw"></i> Reintentar</button>' : ''}
          </div>
          ${eloNative && !update.fullyManaged ? '<small>Android puede solicitar una confirmación. En una ELO aprovisionada como dispositivo empresarial, la instalación se completa de forma silenciosa.</small>' : ''}
        </section>

        <details class="elo-manual-package">
          <summary>Recuperación e instalación manual</summary>
          <p>Paquete de respaldo <strong>v${escapeHtml(releaseInfo.versionName)} (código ${releaseInfo.versionCode})</strong> para Elo PayPoint Plus 15" con Android 8.1.</p>
          <div class="elo-update-actions">
            <a href="/downloads/LosPanitas-Elo-POS-APK.zip" download class="button secondary compact"><i data-lucide="download"></i> Descargar APK (.zip)</a>
            <a href="/downloads/Paquete-Recursos-Terminal-ELO.zip" download class="button secondary compact"><i data-lucide="sheet"></i> Paquete completo</a>
            <a href="/downloads/SHA256SUMS.txt" download class="button secondary compact"><i data-lucide="file-check-2"></i> SHA-256</a>
          </div>
        </details>

        <div class="form-note" style="margin-top: 14px;">
          <i data-lucide="badge-check"></i>
          <span><strong>Modo Kiosco / App Nativa ELO:</strong> La APK integra un puente directo para la gaveta y la impresora térmica. Confirma ambos periféricos con las pruebas de diagnóstico después de cada instalación o actualización.</span>
        </div>
      </div>

      <div class="form-section">
        <h3>Gestión de Personal y Nómina (Confidencial)</h3>
        <p style="font-size:0.84rem;color:var(--muted);margin:0 0 12px;line-height:1.4;">
          El control salarial, contratos y desembolsos están protegidos por PIN para resguardar la confidencialidad de los empleados.
        </p>
        <button type="button" class="button secondary" data-route="payroll">
          <i data-lucide="lock"></i> Abrir Nómina y Personal (Requiere PIN)
        </button>
      </div>

      <footer class="form-footer"><button class="button primary" type="submit"><i data-lucide="save"></i> Guardar configuración</button></footer>
    </form>`;
}

export function renderUsersLockScreen(state = {}, user = {}) {
  const userName = user.displayName || user.username || 'Usuario';
  return `
    <div class="users-lock-screen surface-card" style="max-width:440px; margin:40px auto; padding:32px 24px; text-align:center; border:1px solid rgba(245,158,11,0.25); box-shadow: 0 12px 32px rgba(0,0,0,0.35);">
      <div style="width:68px; height:68px; margin:0 auto 16px; border-radius:50%; background:rgba(245,158,11,0.12); display:flex; align-items:center; justify-content:center; color:var(--brand-2);">
        <i data-lucide="lock" style="width:34px; height:34px;"></i>
      </div>
      <span class="eyebrow" style="color:var(--brand-2);">Área Confidencial Protegida</span>
      <h2 style="margin:6px 0 8px; font-size:1.35rem; font-weight:700;">Control de Acceso y Usuarios</h2>
      <p style="margin:0 0 18px; font-size:0.86rem; color:var(--muted); line-height:1.45;">
        Esta sección permite modificar roles, contraseñas y privilegios del personal. Digita el PIN personal de <strong>${escapeHtml(userName)}</strong> para acceder.
      </p>
      <form id="users-unlock-form" class="stack-form">
        ${renderPinPadHtml({
          idPrefix: 'users-unlock',
          label: 'Digita tu PIN de 6 dígitos',
          sublabel: 'Autoriza el desbloqueo temporal de la gestión de usuarios'
        })}
        <div style="display:flex; gap:10px; margin-top:14px;">
          <button type="button" class="button secondary" style="flex:1; font-weight:600;" data-route="dashboard">
            <i data-lucide="arrow-left"></i> Volver a Resumen
          </button>
          <button type="submit" class="button primary" id="users-unlock-submit" style="flex:1; font-weight:700;">
            <i data-lucide="unlock"></i> Desbloquear
          </button>
        </div>
      </form>
    </div>
  `;
}

export function renderUsers(state) {
  const profiles = state.users || [];
  const rows = profiles.map((item) => userRow(item, item.id === state.user.uid));
  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Equipo y permisos</span>
        <h2>Usuarios</h2>
        <p>Crea nombres de acceso independientes y asigna a cada persona únicamente las funciones necesarias.</p>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button type="button" class="button secondary compact" data-users-lock style="font-weight:600;">
          <i data-lucide="lock"></i> Bloquear acceso
        </button>
        <button class="button primary" data-user-new><i data-lucide="user-plus"></i> Nuevo usuario</button>
      </div>
    </section>
    <div class="metric-grid"><article class="metric-card"><i data-lucide="users"></i><div><span>Usuarios activos</span><strong>${profiles.filter((item) => item.active !== false).length}</strong></div></article><article class="metric-card"><i data-lucide="shield-check"></i><div><span>Accesos desactivados</span><strong>${profiles.filter((item) => item.active === false).length}</strong></div></article></div>
    <section class="surface-card data-surface"><header><div><span class="eyebrow">Control de acceso</span><h3>Personal autorizado</h3></div></header><div class="table-scroll"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Acceso</th><th></th></tr></thead><tbody>${rows.length ? rows.join('') : '<tr><td colspan="5">No hay usuarios registrados.</td></tr>'}</tbody></table></div></section>
    <section class="surface-card access-help"><i data-lucide="shield-check"></i><div><h3>Sin correos ni contraseñas compartidas</h3><p>La contraseña solo se utiliza para autenticar y nunca se guarda en Firestore. Cada usuario puede cambiarla después desde su sesión.</p></div></section>`;
}

export function renderUserForm(item = {}) {
  const profile = Boolean(item.id);
  const currentRole = Array.isArray(item.roles) ? item.roles[0] : 'waiter';
  return `<div class="modal-backdrop" data-modal-close><form id="user-access-form" class="modal-card form-modal" data-modal-card><header><div><span class="eyebrow">Acceso protegido</span><h2>${profile ? 'Editar usuario' : 'Crear usuario'}</h2></div><button type="button" class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button></header><div class="stack-form"><input type="hidden" name="uid" value="${profile ? escapeHtml(item.id) : ''}"><label>Nombre completo<input name="displayName" required maxlength="160" autocomplete="off" value="${escapeHtml(item.displayName || '')}"></label><label>Nombre de usuario<input name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" autocapitalize="characters" autocomplete="off" value="${escapeHtml(item.username || '')}" ${profile ? 'readonly' : ''}></label>${profile ? '' : '<div class="form-grid two"><label>Contraseña inicial<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label>Confirmar contraseña<input name="passwordConfirm" type="password" minlength="8" autocomplete="new-password" required></label></div>'}<label>Rol<select name="role">${roleOptions(currentRole)}</select></label><label class="check-field"><input name="active" type="checkbox" ${item.active === false ? '' : 'checked'}> Acceso habilitado</label><div class="form-note"><i data-lucide="shield-check"></i><span>Cada persona crea su PIN privado de seis dígitos al realizar su primer cobro. El propietario no puede verlo ni cambiarlo desde esta lista.</span></div></div><footer class="modal-actions"><button type="button" class="button secondary" data-modal-close>Cancelar</button><button class="button primary" type="submit">${profile ? 'Guardar acceso' : 'Crear usuario'}</button></footer></form></div>`;
}

function userRow(item, self) {
  const role = Array.isArray(item.roles) ? item.roles[0] : '';
  const enabled = item.active !== false;
  return `<tr><td><strong>${escapeHtml(item.displayName || 'Sin nombre')}</strong>${self ? '<small class="table-note">Tu cuenta</small>' : ''}</td><td><strong>${escapeHtml(item.username || '—')}</strong></td><td><span class="role-chip">${roleLabel(role)}</span></td><td><span class="document-status ${enabled ? 'status-paid' : 'status-cancelled'}">${enabled ? 'Activo' : 'Desactivado'}</span></td><td>${self ? '<span class="protected-account"><i data-lucide="shield-check"></i> Protegida</span>' : `<button class="icon-button" data-user-edit="${escapeHtml(item.id)}" aria-label="Editar usuario"><i data-lucide="pencil"></i></button>`}</td></tr>`;
}

function roleOptions(selected) {
  return [['owner','Propietario · acceso completo'],['manager','Gerencia · operación y reportes'],['cashier','Caja · ventas y cobros'],['waiter','Camarero · mesas y comandas'],['kitchen','Cocina · KDS']].map(([value,label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function roleLabel(role) {
  return ({ owner:'Propietario', manager:'Gerencia', cashier:'Caja', waiter:'Camarero', kitchen:'Cocina' })[role] || 'Sin rol';
}

export const AUDIT_CATEGORIES = {
  all: { id: 'all', label: 'Todos', icon: 'layers', badgeClass: 'badge-all' },
  cash: { id: 'cash', label: 'Caja & Gaveta', icon: 'wallet', badgeClass: 'badge-cash' },
  billing: { id: 'billing', label: 'Ventas & Cobros', icon: 'receipt', badgeClass: 'badge-billing' },
  security: { id: 'security', label: 'Seguridad & PINs', icon: 'shield-check', badgeClass: 'badge-security' },
  inventory: { id: 'inventory', label: 'Inventario & Mermas', icon: 'package', badgeClass: 'badge-inventory' },
  payroll: { id: 'payroll', label: 'Nómina', icon: 'users', badgeClass: 'badge-payroll' },
  system: { id: 'system', label: 'Sistema & Config', icon: 'settings', badgeClass: 'badge-system' }
};

export const AUDIT_TIME_FILTERS = [
  { id: 'all', label: 'Todo el historial' },
  { id: 'today', label: 'Hoy' },
  { id: 'yesterday', label: 'Ayer' },
  { id: 'week', label: 'Últimos 7 días' }
];

export function getAuditCategory(action = '') {
  if (action === 'cash.drawer_failed' || action === 'cash.pin_authorized' || action.startsWith('user.drawer_pin')) {
    return 'security';
  }
  if (action.startsWith('cash.')) {
    return 'cash';
  }
  if (action.startsWith('payment.') || action.startsWith('invoice.') || action.startsWith('delivery.') || action.startsWith('delivery_driver.')) {
    return 'billing';
  }
  if (action.startsWith('inventory.') || action.startsWith('product.')) {
    return 'inventory';
  }
  if (action.startsWith('payroll.') || action.startsWith('employee.')) {
    return 'payroll';
  }
  if (action.startsWith('user.') || action.startsWith('settings.')) {
    return 'system';
  }
  return 'system';
}

export function cleanAuditReason(raw) {
  if (!raw) return 'Operación del sistema';
  const str = String(raw).trim();

  // Match sesión ... - motivo or sesión ... · motivo
  const sessionMatch = str.match(/sesi[óo]n\s+(?:sin\s+sesi[óo]n|[^\s·-]+)(?:\s*[-·]\s*|\s+)(.+)$/i);
  if (sessionMatch && sessionMatch[1]?.trim()) {
    return sessionMatch[1].trim();
  }

  // If starts with drawer[- ]...
  if (/^drawer[\s·-]/i.test(str)) {
    const parts = str.split(/\s*[-·]\s*/);
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i].trim();
      if (part && !/^(?:drawer|[a-zA-Z0-9_-]{12,}|sesi[óo]n)$/i.test(part)) {
        return part;
      }
    }
  }

  if (/^PIN incorrecto:\s*/i.test(str)) {
    return str.replace(/^PIN incorrecto:\s*/i, '');
  }

  return str;
}

export function enrichAuditLog(item, state = {}) {
  const action = item.action || '';
  const category = getAuditCategory(action);
  const categoryMeta = AUDIT_CATEGORIES[category] || AUDIT_CATEGORIES.system;
  const isFailed = action.includes('failed');
  const isCritical = action === 'cash.drawer_failed' || action.includes('hardware_failed') || action === 'invoice.cancelled';
  const actor = item.actorName || item.actorEmail || 'Sistema';

  let actionTitle = action;
  let icon = 'activity';
  let toneClass = 'status-partial';
  let cleanDetails = item.details || item.reason || '—';

  switch (action) {
    case 'cash.opened': {
      actionTitle = 'Apertura de turno';
      icon = 'wallet';
      toneClass = 'status-paid';
      const session = (state.cashSessions || []).find(s => s.id === item.details);
      if (session) {
        cleanDetails = `Turno abierto con fondo de ${formatMoney(session.openingCents || 0)}${session.notes ? ` · "${session.notes}"` : ''}`;
      } else {
        cleanDetails = 'Apertura de turno de caja (Fondo base registrado)';
      }
      break;
    }
    case 'cash.closed': {
      actionTitle = 'Cierre de turno y arqueo';
      icon = 'lock';
      toneClass = 'status-paid';
      const m = String(item.details || '').match(/(?:[a-zA-Z0-9_-]+:\s*)?diferencia\s+(-?\d+)\s+centavos(?:\.\s*(.*))?/i);
      if (m) {
        const diff = Number(m[1]);
        const notes = (m[2] || '').trim();
        if (diff === 0) {
          cleanDetails = `Arqueo cuadrado exacto (Diferencia: ${formatMoney(0)})${notes ? ` · Notas: "${notes}"` : ''}`;
        } else if (diff > 0) {
          cleanDetails = `Sobrante en caja de +${formatMoney(diff)}${notes ? ` · Notas: "${notes}"` : ''}`;
          toneClass = 'status-partial';
        } else {
          cleanDetails = `Faltante en caja de -${formatMoney(Math.abs(diff))}${notes ? ` · Notas: "${notes}"` : ''}`;
          toneClass = 'status-cancelled';
        }
      } else {
        cleanDetails = 'Cierre de turno y arqueo final de caja registrado';
      }
      break;
    }
    case 'cash.movement_in': {
      actionTitle = 'Entrada de efectivo';
      icon = 'arrow-down-left';
      toneClass = 'status-paid';
      const m = String(item.details || '').match(/(?:[a-zA-Z0-9_-]+:\s*)?(\d+)\s*-\s*(.*)/);
      if (m) {
        const amt = Number(m[1]);
        cleanDetails = `+${formatMoney(amt)} · Motivo: ${m[2]}`;
      } else {
        cleanDetails = item.details || 'Entrada de efectivo a gaveta';
      }
      break;
    }
    case 'cash.movement_out': {
      actionTitle = 'Salida de caja / Gasto';
      icon = 'arrow-up-right';
      toneClass = 'status-partial';
      const m = String(item.details || '').match(/(?:[a-zA-Z0-9_-]+:\s*)?(\d+)\s*-\s*(.*)/);
      if (m) {
        const amt = Number(m[1]);
        cleanDetails = `-${formatMoney(amt)} · Motivo: ${m[2]}`;
      } else {
        cleanDetails = item.details || 'Salida de efectivo de gaveta';
      }
      break;
    }
    case 'cash.drawer_opened': {
      actionTitle = 'Apertura de gaveta (PIN)';
      icon = 'key-round';
      toneClass = 'status-paid';
      cleanDetails = `Apertura autorizada · Motivo: ${cleanAuditReason(item.details || item.reason)}`;
      break;
    }
    case 'cash.drawer_requested': {
      actionTitle = 'Apertura solicitada';
      icon = 'wallet';
      toneClass = 'status-partial';
      cleanDetails = `Solicitud de gaveta · Motivo: ${cleanAuditReason(item.details || item.reason)}`;
      break;
    }
    case 'cash.drawer_pulse_sent': {
      actionTitle = 'Pulso enviado a gaveta';
      icon = 'zap';
      toneClass = 'status-paid';
      cleanDetails = `Pulso ejecutado en impresora · Motivo: ${cleanAuditReason(item.details || item.reason)}`;
      break;
    }
    case 'cash.drawer_hardware_failed': {
      actionTitle = 'Fallo en pulso de gaveta';
      icon = 'alert-triangle';
      toneClass = 'status-cancelled';
      cleanDetails = `Error al enviar pulso a terminal · Motivo: ${cleanAuditReason(item.details || item.reason)}`;
      break;
    }
    case 'cash.pin_authorized': {
      actionTitle = 'PIN autorizado';
      icon = 'shield-check';
      toneClass = 'status-paid';
      cleanDetails = `PIN validado · ${cleanAuditReason(item.details || item.reason || 'Acceso concedido')}`;
      break;
    }
    case 'cash.drawer_failed': {
      actionTitle = 'Intento fallido de PIN';
      icon = 'shield-alert';
      toneClass = 'status-cancelled';
      const r = cleanAuditReason(item.details || item.reason || '');
      cleanDetails = `PIN incorrecto ingresado · Operación: ${r}`;
      break;
    }
    case 'user.drawer_pin.updated': {
      actionTitle = 'PIN personal actualizado';
      icon = 'lock';
      toneClass = 'status-paid';
      cleanDetails = 'PIN personal de 6 dígitos modificado y reservado exclusivamente';
      break;
    }
    case 'user.drawer_pin.provisioned': {
      actionTitle = 'PIN asignado por administración';
      icon = 'key';
      toneClass = 'status-paid';
      cleanDetails = item.details || 'PIN de seguridad asignado por administrador';
      break;
    }
    case 'payment.created': {
      actionTitle = 'Cobro registrado';
      icon = 'receipt';
      toneClass = 'status-paid';
      const m = String(item.details || '').match(/^([A-Z0-9_-]+):\s*(\d+)(?:\s*\((.*)\))?/i);
      if (m) {
        const invNum = m[1];
        const amt = Number(m[2]);
        const cashier = m[3] ? ` · Cajero: ${m[3]}` : '';
        cleanDetails = `Cobro de factura ${invNum} por ${formatMoney(amt)}${cashier}`;
      } else {
        cleanDetails = item.details || 'Cobro registrado';
      }
      break;
    }
    case 'invoice.cancelled': {
      actionTitle = 'Factura anulada';
      icon = 'file-x-2';
      toneClass = 'status-cancelled';
      cleanDetails = `Factura anulada: ${item.details || 'Sin detalles'}`;
      break;
    }
    case 'delivery.driver_reassigned': {
      actionTitle = 'Repartidor reasignado';
      icon = 'bike';
      toneClass = 'status-partial';
      cleanDetails = item.details || 'Reasignación de envío';
      break;
    }
    case 'payroll.payment_issued': {
      actionTitle = 'Pago de nómina emitido';
      icon = 'badge-dollar-sign';
      toneClass = 'status-paid';
      const payment = (state.payrollPayments || []).find(p => p.receiptNumber === item.details || p.id === item.details);
      if (payment) {
        cleanDetails = `Pago emitido a ${payment.employeeName} por ${formatMoney(payment.netAmountCents || 0)} (${payment.conceptLabel || 'Sueldo'}) · Comprobante: ${payment.receiptNumber || item.details}`;
      } else {
        cleanDetails = `Comprobante de nómina ${item.details || ''} emitido`;
      }
      break;
    }
    case 'employee.created': {
      actionTitle = 'Empleado registrado';
      icon = 'user-plus';
      toneClass = 'status-paid';
      cleanDetails = `Nuevo empleado: ${item.details || ''}`;
      break;
    }
    case 'employee.updated': {
      actionTitle = 'Empleado actualizado';
      icon = 'user-check';
      toneClass = 'status-partial';
      cleanDetails = `Datos de empleado actualizados: ${item.details || ''}`;
      break;
    }
    case 'employee.deactivated': {
      actionTitle = 'Empleado desactivado';
      icon = 'user-x';
      toneClass = 'status-cancelled';
      cleanDetails = item.details || 'Empleado dado de baja';
      break;
    }
    case 'inventory.counted': {
      actionTitle = 'Conteo de inventario';
      icon = 'clipboard-check';
      toneClass = 'status-paid';
      cleanDetails = item.details || 'Conteo físico de existencias';
      break;
    }
    case 'inventory.adjusted': {
      actionTitle = 'Ajuste de inventario';
      icon = 'package-minus';
      toneClass = 'status-partial';
      cleanDetails = item.details || 'Ajuste manual de stock';
      break;
    }
    case 'inventory.batch_waste': {
      actionTitle = 'Cierre de jornada (Mermas)';
      icon = 'trash-2';
      toneClass = 'status-cancelled';
      cleanDetails = item.details || 'Mermas y desperdicios de cierre';
      break;
    }
    case 'product.created': {
      actionTitle = 'Producto creado';
      icon = 'package-plus';
      toneClass = 'status-paid';
      cleanDetails = `Artículo añadido al catálogo: ${item.details || ''}`;
      break;
    }
    case 'product.updated': {
      actionTitle = 'Producto modificado';
      icon = 'package';
      toneClass = 'status-partial';
      cleanDetails = `Artículo actualizado: ${item.details || ''}`;
      break;
    }
    case 'user.created': {
      actionTitle = 'Usuario creado';
      icon = 'user-plus';
      toneClass = 'status-paid';
      cleanDetails = `Nuevo acceso de usuario: ${item.details || ''}`;
      break;
    }
    case 'user.updated': {
      actionTitle = 'Usuario modificado';
      icon = 'user-cog';
      toneClass = 'status-partial';
      cleanDetails = `Permisos/datos de usuario modificados: ${item.details || ''}`;
      break;
    }
    case 'settings.updated': {
      actionTitle = 'Configuración modificada';
      icon = 'sliders';
      toneClass = 'status-paid';
      cleanDetails = item.details || 'Ajustes del sistema actualizados';
      break;
    }
    default: {
      actionTitle = action || 'Evento del sistema';
      icon = isFailed ? 'alert-triangle' : 'activity';
      toneClass = isFailed ? 'status-cancelled' : 'status-partial';
      cleanDetails = item.details || item.reason || '—';
    }
  }

  return {
    id: item.id || '',
    action,
    actionTitle,
    category,
    categoryMeta,
    actor,
    actorName: item.actorName || '',
    actorEmail: item.actorEmail || '',
    cleanDetails,
    rawDetails: item.details || '',
    reason: item.reason || '',
    icon,
    toneClass,
    isFailed,
    isCritical,
    createdAt: item.createdAt,
    searchBlob: `${action} ${actionTitle} ${categoryMeta.label} ${actor} ${cleanDetails}`.toLowerCase()
  };
}

export function formatAuditDate(value, now = new Date()) {
  if (!value) return { text: 'Pendiente', relative: '', full: 'Pendiente' };
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return { text: 'Pendiente', relative: '', full: 'Pendiente' };

  const todayKey = businessDateKey(now);
  const itemKey = businessDateKey(date);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = businessDateKey(yesterday);

  const timeStr = new Intl.DateTimeFormat('es-DO', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date);

  const fullStr = formatDate(date, true);

  if (itemKey === todayKey) {
    return { text: timeStr, relative: 'Hoy', full: fullStr };
  }
  if (itemKey === yesterdayKey) {
    return { text: timeStr, relative: 'Ayer', full: fullStr };
  }
  return { text: `${formatDate(date, false)}, ${timeStr}`, relative: '', full: fullStr };
}

export function filterAuditByTime(logs = [], filter = 'all', now = new Date()) {
  if (filter === 'all') return logs;
  const todayKey = businessDateKey(now);

  if (filter === 'today') {
    return logs.filter(l => businessDateKey(l.createdAt) === todayKey);
  }
  if (filter === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yKey = businessDateKey(y);
    return logs.filter(l => businessDateKey(l.createdAt) === yKey);
  }
  if (filter === 'week') {
    const d7 = new Date(now);
    d7.setDate(d7.getDate() - 6);
    const d7Key = businessDateKey(d7);
    return logs.filter(l => {
      const k = businessDateKey(l.createdAt);
      return k >= d7Key && k <= todayKey;
    });
  }
  return logs;
}

export function calculateAuditKpis(enrichedLogs = [], now = new Date()) {
  const todayKey = businessDateKey(now);
  const total = enrichedLogs.length;
  const todayCount = enrichedLogs.filter(l => businessDateKey(l.createdAt) === todayKey).length;

  const drawerPulses = enrichedLogs.filter(l => l.action === 'cash.drawer_pulse_sent').length;
  const cashMovements = enrichedLogs.filter(l => l.action.startsWith('cash.movement')).length;
  const totalCashOps = drawerPulses + cashMovements;

  const pinAuthorized = enrichedLogs.filter(l => l.action === 'cash.pin_authorized').length;
  const failedAttempts = enrichedLogs.filter(l => l.action === 'cash.drawer_failed' || l.action.includes('failed') || l.action.includes('hardware_failed')).length;
  const totalPinAttempts = pinAuthorized + failedAttempts;
  const pinSuccessRate = totalPinAttempts > 0 ? Math.round((pinAuthorized / totalPinAttempts) * 100) : 100;

  return {
    total,
    todayCount,
    totalCashOps,
    drawerPulses,
    cashMovements,
    pinAuthorized,
    failedAttempts,
    pinSuccessRate
  };
}

export function buildAuditLogsCsv(logs = []) {
  const headers = ['Fecha', 'Hora', 'Categoría', 'Acción', 'Responsable', 'Detalle Operativo', 'ID Original'];
  const headerRow = headers.map(h => `"${h}"`).join(',');
  const rows = logs.map(l => {
    const dateInfo = formatAuditDate(l.createdAt);
    const dateStr = l.createdAt ? formatDate(l.createdAt, false) : '';
    const timeStr = dateInfo.text || '';
    return [
      dateStr,
      timeStr,
      l.categoryMeta?.label || l.category,
      l.actionTitle,
      l.actor,
      l.cleanDetails,
      l.id
    ].map(val => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',');
  });

  return [headerRow, ...rows].join('\r\n');
}

export function renderAuditLogs(state) {
  const rawLogs = state.auditLogs || [];
  const activeCategory = state.auditCategoryFilter || 'all';
  const activeTime = state.auditTimeFilter || 'all';
  const searchQuery = (state.auditSearchTerm || '').trim().toLowerCase();
  const limit = state.auditDisplayLimit || 50;

  // 1. Enrich all logs
  const enriched = rawLogs.map(l => enrichAuditLog(l, state));

  // 2. Global KPIs
  const kpis = calculateAuditKpis(enriched);

  // 3. Filter by time
  const timeFiltered = filterAuditByTime(enriched, activeTime);

  // 4. Calculate category counts within the selected time window
  const catCounts = { all: timeFiltered.length };
  Object.keys(AUDIT_CATEGORIES).forEach(k => {
    if (k !== 'all') {
      catCounts[k] = timeFiltered.filter(l => l.category === k).length;
    }
  });

  // 5. Filter by category
  const categoryFiltered = activeCategory === 'all'
    ? timeFiltered
    : timeFiltered.filter(l => l.category === activeCategory);

  // 6. Filter by search query if present
  const searchFiltered = searchQuery
    ? categoryFiltered.filter(l => matchesFuzzy(searchQuery, l.searchBlob))
    : categoryFiltered;

  // 7. Paginate
  const visibleLogs = searchFiltered.slice(0, limit);
  const hasMore = searchFiltered.length > limit;

  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Seguridad, Control y Trazabilidad</span>
        <h2>Auditoría del Sistema y Actividad Operativa</h2>
        <p>Monitoreo inmutable de aperturas de caja, autorizaciones PIN, ventas, nómina y eventos críticos.</p>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <button type="button" class="button secondary" data-audit-export title="Descargar bitácora en formato CSV para Excel">
          <i data-lucide="download"></i> Exportar CSV
        </button>
        <button class="button secondary" data-refresh><i data-lucide="refresh-cw"></i> Actualizar</button>
      </div>
    </section>

    <!-- 4 TARJETAS KPI OPERATIVAS -->
    <div class="metric-grid audit-metric-grid">
      <article class="metric-card">
        <i data-lucide="activity"></i>
        <div>
          <span>Actividad Registrada</span>
          <strong>${kpis.total}</strong>
          <small style="color:var(--brand-2);font-size:0.75rem;display:block;margin-top:2px;">
            <i data-lucide="calendar" style="width:12px;height:12px;display:inline;vertical-align:-1px;"></i> ${kpis.todayCount} hoy
          </small>
        </div>
      </article>

      <article class="metric-card positive">
        <i data-lucide="wallet"></i>
        <div>
          <span>Caja & Gaveta</span>
          <strong>${kpis.totalCashOps}</strong>
          <small style="color:var(--muted);font-size:0.75rem;display:block;margin-top:2px;">
            ${kpis.drawerPulses} pulsos · ${kpis.cashMovements} movimientos
          </small>
        </div>
      </article>

      <article class="metric-card ${kpis.pinSuccessRate < 80 ? 'warning' : 'positive'}">
        <i data-lucide="shield-check"></i>
        <div>
          <span>Seguridad & PINs</span>
          <strong>${kpis.pinSuccessRate}%</strong>
          <small style="color:var(--muted);font-size:0.75rem;display:block;margin-top:2px;">
            ${kpis.pinAuthorized} autorizados con PIN
          </small>
        </div>
      </article>

      <article class="metric-card ${kpis.failedAttempts > 0 ? 'danger audit-kpi-alert' : 'positive'}">
        <i data-lucide="${kpis.failedAttempts > 0 ? 'shield-alert' : 'shield-check'}"></i>
        <div>
          <span>Intentos Fallidos / Alertas</span>
          <strong style="${kpis.failedAttempts > 0 ? 'color:#f87171;' : ''}">${kpis.failedAttempts}</strong>
          <small style="${kpis.failedAttempts > 0 ? 'color:#fca5a5;' : 'color:var(--muted);'}font-size:0.75rem;display:block;margin-top:2px;">
            ${kpis.failedAttempts === 0 ? 'Sin alertas de seguridad' : `${kpis.failedAttempts} intento(s) bloqueado(s)`}
          </small>
        </div>
      </article>
    </div>

    <!-- BARRA DE FILTROS TEMPORALES -->
    <div class="audit-time-bar" role="tablist">
      <span class="audit-bar-label"><i data-lucide="clock"></i> Período:</span>
      ${AUDIT_TIME_FILTERS.map(t => `
        <button type="button" class="audit-time-btn ${activeTime === t.id ? 'active' : ''}" data-audit-time="${t.id}">
          ${escapeHtml(t.label)}
        </button>
      `).join('')}
    </div>

    <!-- BARRA DE PESTAÑAS / CATEGORÍAS -->
    <div class="audit-filter-bar" role="tablist">
      ${Object.values(AUDIT_CATEGORIES).map(cat => {
        const count = catCounts[cat.id] ?? 0;
        const isActive = activeCategory === cat.id;
        return `
          <button type="button" class="audit-tab-btn ${isActive ? 'active' : ''}" data-audit-category="${cat.id}">
            <i data-lucide="${cat.icon}"></i>
            <span>${escapeHtml(cat.label)}</span>
            <span class="audit-tab-count">${count}</span>
          </button>
        `;
      }).join('')}
    </div>

    <!-- TABLA Y BUSCADOR -->
    <section class="surface-card data-surface">
      <div class="toolbar audit-toolbar">
        <label class="search-field" style="flex:1;">
          <i data-lucide="search"></i>
          <input id="audit-search" type="search" placeholder="Buscar por usuario, acción, detalle o monto..." value="${escapeHtml(searchQuery)}">
        </label>
        <span class="audit-result-summary" style="font-size:0.82rem;color:var(--muted);padding-right:8px;">
          Mostrando ${visibleLogs.length} de ${searchFiltered.length} eventos
        </span>
      </div>

      <div class="table-scroll">
        <table class="audit-table">
          <thead>
            <tr>
              <th style="width:170px;">Fecha y Hora</th>
              <th style="width:280px;">Categoría & Acción</th>
              <th style="width:160px;">Responsable</th>
              <th>Detalle Operativo</th>
            </tr>
          </thead>
          <tbody id="audit-table-body">
            ${searchFiltered.length ? visibleLogs.map(auditRow).join('') : `
              <tr>
                <td colspan="4">
                  <div class="empty-state">
                    <i data-lucide="shield-check"></i>
                    <strong>Sin registros para los filtros seleccionados</strong>
                    <p>Prueba seleccionando "Todo el historial" o cambiando la categoría.</p>
                  </div>
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>

      ${hasMore ? `
        <div style="text-align:center;padding:14px;border-top:1px solid var(--line);">
          <button type="button" class="button secondary compact" data-load-more-audit style="font-size:0.88rem;padding:8px 20px;">
            <i data-lucide="refresh-cw"></i> Ver más registros (${visibleLogs.length} de ${searchFiltered.length})
          </button>
        </div>
      ` : ''}
    </section>
  `;
}

function auditRow(item) {
  const dateInfo = formatAuditDate(item.createdAt);
  const initials = (item.actor || 'S').trim().slice(0, 2).toUpperCase();

  return `
    <tr data-audit-row data-search="${escapeHtml(item.searchBlob)}" data-category="${escapeHtml(item.category)}">
      <td>
        <div class="audit-date-cell">
          ${dateInfo.relative ? `<span class="audit-relative-pill ${dateInfo.relative === 'Hoy' ? 'is-today' : 'is-yesterday'}">${dateInfo.relative}</span>` : ''}
          <strong title="${escapeHtml(dateInfo.full)}">${escapeHtml(dateInfo.text)}</strong>
        </div>
      </td>
      <td>
        <div class="audit-action-cell">
          <span class="audit-cat-tag ${escapeHtml(item.categoryMeta.badgeClass)}">
            <i data-lucide="${escapeHtml(item.categoryMeta.icon)}"></i>
            ${escapeHtml(item.categoryMeta.label)}
          </span>
          <span class="document-status ${escapeHtml(item.toneClass)}">
            <i data-lucide="${escapeHtml(item.icon)}"></i>
            ${escapeHtml(item.actionTitle)}
          </span>
        </div>
      </td>
      <td>
        <div class="audit-actor-cell">
          <span class="audit-avatar">${escapeHtml(initials)}</span>
          <strong>${escapeHtml(item.actor)}</strong>
        </div>
      </td>
      <td>
        <div class="audit-detail-cell">
          <span>${escapeHtml(item.cleanDetails)}</span>
        </div>
      </td>
    </tr>
  `;
}
