import { escapeHtml, formatDate, formatMoney } from '../lib/format.js';
import { matchesFuzzy } from '../lib/fuzzy-search.js';
import { isDeliveryInvoice, getClientIdentityKey, invoiceBelongsToClient, getReceivableAgeDays, isFiaoPayment } from '../domain/client-memory.js';
import { businessDateKey } from '../lib/business-time.js';

export { isDeliveryInvoice };

export function renderReceivables(state) {
  const activeTab = state.receivablesTab || 'debts';
  const channelFilter = state.receivablesChannelFilter || 'all';
  const ageFilter = state.receivablesAgeFilter || 'all';
  const amountFilter = state.receivablesAmountFilter || 'all';
  const contactFilter = state.receivablesContactFilter || 'all';
  const sortOption = state.receivablesSort || 'debt_desc';
  const viewMode = state.receivablesViewMode || 'clients';
  const searchQuery = String(state.receivablesSearch || '').trim();

  // 1. Facturas pendientes activas y clasificación por canal
  const allPendingInvoices = (state.invoices || []).filter(
    (inv) => inv.documentType === 'invoice' &&
      inv.status !== 'paid' &&
      inv.status !== 'cancelled' &&
      (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)) > 0
  ).map(inv => ({
    ...inv,
    isDelivery: isDeliveryInvoice(inv)
  }));

  const totalPendingCents = allPendingInvoices.reduce((sum, inv) => {
    return sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0));
  }, 0);

  const fiaoInvoices = allPendingInvoices.filter(i => !i.isDelivery);
  const deliveryInvoices = allPendingInvoices.filter(i => i.isDelivery);

  const totalFiaoPendingCents = fiaoInvoices.reduce((sum, inv) => sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)), 0);
  const totalDeliveryPendingCents = deliveryInvoices.reduce((sum, inv) => sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)), 0);

  // 2. Agrupar por cliente con desglose de fiao vs delivery
  const clientMap = new Map();
  for (const inv of allPendingInvoices) {
    const clientName = String(inv.clientName || inv.deliveryClientName || 'Cliente').trim();
    const clientKey = getClientIdentityKey({ clientId: inv.clientId, name: clientName });
    if (!clientMap.has(clientKey)) {
      const regClient = (state.clients || []).find(c => invoiceBelongsToClient(inv, c));
      clientMap.set(clientKey, {
        name: regClient?.name || clientName,
        clientId: inv.clientId || regClient?.id || '',
        phone: inv.clientPhone || regClient?.phone || '',
        address: inv.deliveryAddress || inv.clientAddress || regClient?.address || '',
        notes: regClient?.notes || '',
        creditLimitCents: Math.max(0, Number(regClient?.creditLimitCents || 0)),
        invoices: [],
        totalDebtCents: 0,
        fiaoDebtCents: 0,
        deliveryDebtCents: 0,
        fiaoCount: 0,
        deliveryCount: 0,
        maxAgeDays: 0,
        oldestInvoiceDate: null
      });
    }
    const entry = clientMap.get(clientKey);
    if (!entry.phone && inv.clientPhone) entry.phone = inv.clientPhone;
    if (!entry.address && (inv.deliveryAddress || inv.clientAddress)) entry.address = inv.deliveryAddress || inv.clientAddress;
    if (!entry.creditLimitCents && inv.clientId) {
      const reg = (state.clients || []).find(c => c.id === inv.clientId);
      if (reg?.creditLimitCents) entry.creditLimitCents = Math.max(0, Number(reg.creditLimitCents));
    }

    const balanceCents = Number(inv.totalCents || 0) - Number(inv.paidCents || 0);
    const invDate = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt || 0);
    const ageDays = getReceivableAgeDays(inv.createdAt);
    if (ageDays > entry.maxAgeDays) entry.maxAgeDays = ageDays;
    if (!entry.oldestInvoiceDate || invDate < entry.oldestInvoiceDate) entry.oldestInvoiceDate = invDate;

    entry.invoices.push({ ...inv, balanceCents, ageDays });
    entry.totalDebtCents += balanceCents;
    if (inv.isDelivery) {
      entry.deliveryDebtCents += balanceCents;
      entry.deliveryCount += 1;
    } else {
      entry.fiaoDebtCents += balanceCents;
      entry.fiaoCount += 1;
    }
  }

  // Ordenar consumos dentro de cada cliente: más antiguos primero (FIFO)
  for (const client of clientMap.values()) {
    client.invoices.sort((a, b) => {
      const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
      const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
      return da - db;
    });
  }

  const allClientsWithDebt = Array.from(clientMap.values());
  const fiaoClientsCount = allClientsWithDebt.filter(c => c.fiaoCount > 0).length;
  const deliveryClientsCount = allClientsWithDebt.filter(c => c.deliveryCount > 0).length;

  // 3. Filtrar clientes según el canal seleccionado
  let channelScopedClients = allClientsWithDebt;
  if (channelFilter === 'fiao') {
    channelScopedClients = allClientsWithDebt.filter(c => c.fiaoCount > 0).map(c => ({
      ...c,
      invoices: c.invoices.filter(i => !i.isDelivery),
      totalDebtCents: c.fiaoDebtCents
    }));
  } else if (channelFilter === 'delivery') {
    channelScopedClients = allClientsWithDebt.filter(c => c.deliveryCount > 0).map(c => ({
      ...c,
      invoices: c.invoices.filter(i => i.isDelivery),
      totalDebtCents: c.deliveryDebtCents
    }));
  }
  // Age and ordering must describe the selected channel, not an unrelated older debt.
  if (channelFilter !== 'all') {
    channelScopedClients = channelScopedClients.map(c => ({
      ...c,
      maxAgeDays: Math.max(0, ...c.invoices.map(i => i.ageDays)),
      oldestInvoiceDate: c.invoices[0]?.createdAt?.toDate
        ? c.invoices[0].createdAt.toDate()
        : new Date(c.invoices[0]?.createdAt || 0)
    }));
  }

  // Métricas para la cabecera activa
  const activeTotalPendingCents = channelFilter === 'fiao'
    ? totalFiaoPendingCents
    : channelFilter === 'delivery'
    ? totalDeliveryPendingCents
    : totalPendingCents;

  const activePendingInvoices = channelFilter === 'fiao'
    ? fiaoInvoices
    : channelFilter === 'delivery'
    ? deliveryInvoices
    : allPendingInvoices;

  const activeClientsCount = channelFilter === 'fiao'
    ? fiaoClientsCount
    : channelFilter === 'delivery'
    ? deliveryClientsCount
    : allClientsWithDebt.length;

  // 4. Métricas Financieras de Mora y Cobros
  const overdueDebtCents = activePendingInvoices.reduce((sum, inv) => {
    const ageDays = getReceivableAgeDays(inv.createdAt);
    return ageDays >= 15 ? sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)) : sum;
  }, 0);

  const overdueClientsCount = channelScopedClients.filter(c => c.maxAgeDays >= 15).length;

  // Cobros realizados hoy
  const today = businessDateKey();
  const isToday = (d) => businessDateKey(d) === today;

  const creditInvoiceMap = new Map();
  for (const inv of (state.invoices || [])) {
    creditInvoiceMap.set(inv.id, inv);
  }

  const fiaoPayments = (state.payments || []).filter(p => isFiaoPayment(p, creditInvoiceMap.get(p.invoiceId))).sort((a, b) => {
    const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
    const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
    return db - da;
  });

  const fiaoPaymentsToday = fiaoPayments.filter(p => isToday(p.createdAt));
  const todayCollectedCents = fiaoPaymentsToday.reduce((sum, p) => sum + Number(p.amountCents || 0), 0);

  // 5. Filtrado de clientes (búsqueda, monto, antigüedad)
  let filteredClients = channelScopedClients.filter((client) => {
    // Filtro de antigüedad
    if (ageFilter === 'today' && client.maxAgeDays !== 0) return false;
    if (ageFilter === 'week' && client.maxAgeDays > 7) return false;
    if (ageFilter === 'over15' && client.maxAgeDays < 15) return false;
    if (ageFilter === 'over30' && client.maxAgeDays < 30) return false;

    // Filtro de monto
    if (amountFilter === 'under500' && client.totalDebtCents > 50000) return false;
    if (amountFilter === '500to1500' && (client.totalDebtCents <= 50000 || client.totalDebtCents > 150000)) return false;
    if (amountFilter === 'over1500' && client.totalDebtCents <= 150000) return false;

    // Filtro de contacto y límites
    if (contactFilter === 'withPhone' && !client.phone) return false;
    if (contactFilter === 'withoutPhone' && Boolean(client.phone)) return false;
    if (contactFilter === 'overLimit' && (client.creditLimitCents === 0 || client.totalDebtCents < client.creditLimitCents)) return false;

    // Buscador difuso multi-campo
    if (searchQuery) {
      const searchBlob = [
        client.name,
        client.phone || '',
        client.address || '',
        client.notes || '',
        ...client.invoices.map(i => `${i.invoiceNumber} ${(i.items || []).map(it => it.name).join(' ')} ${i.notes || ''}`)
      ].join(' ');
      if (!matchesFuzzy(searchQuery, searchBlob)) return false;
    }

    return true;
  });

  // Ordenamiento de clientes
  filteredClients.sort((a, b) => {
    if (sortOption === 'debt_desc') return b.totalDebtCents - a.totalDebtCents;
    if (sortOption === 'debt_asc') return a.totalDebtCents - b.totalDebtCents;
    if (sortOption === 'name_asc') return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    if (sortOption === 'date_desc') {
      const da = a.oldestInvoiceDate || 0;
      const db = b.oldestInvoiceDate || 0;
      return db - da;
    }
    if (sortOption === 'date_asc') {
      const da = a.oldestInvoiceDate || 0;
      const db = b.oldestInvoiceDate || 0;
      return da - db;
    }
    return b.totalDebtCents - a.totalDebtCents;
  });

  // 6. Filtrado de facturas individuales para el modo "invoices"
  const allFlattenedInvoices = [];
  for (const client of channelScopedClients) {
    for (const inv of client.invoices) {
      allFlattenedInvoices.push({
        ...inv,
        clientName: client.name,
        clientPhone: client.phone || inv.clientPhone,
        clientAddress: client.address || inv.deliveryAddress || inv.clientAddress
      });
    }
  }

  let filteredInvoices = allFlattenedInvoices.filter((inv) => {
    if (ageFilter === 'today' && inv.ageDays !== 0) return false;
    if (ageFilter === 'week' && inv.ageDays > 7) return false;
    if (ageFilter === 'over15' && inv.ageDays < 15) return false;
    if (ageFilter === 'over30' && inv.ageDays < 30) return false;

    if (amountFilter === 'under500' && inv.balanceCents > 50000) return false;
    if (amountFilter === '500to1500' && (inv.balanceCents <= 50000 || inv.balanceCents > 150000)) return false;
    if (amountFilter === 'over1500' && inv.balanceCents <= 150000) return false;

    if (contactFilter === 'withPhone' && !inv.clientPhone) return false;
    if (contactFilter === 'withoutPhone' && Boolean(inv.clientPhone)) return false;

    if (searchQuery) {
      const searchBlob = `${inv.clientName} ${inv.clientPhone || ''} ${inv.invoiceNumber} ${(inv.items || []).map(it => it.name).join(' ')} ${inv.notes || ''}`;
      if (!matchesFuzzy(searchQuery, searchBlob)) return false;
    }
    return true;
  });

  filteredInvoices.sort((a, b) => {
    if (sortOption === 'debt_desc') return b.balanceCents - a.balanceCents;
    if (sortOption === 'debt_asc') return a.balanceCents - b.balanceCents;
    if (sortOption === 'name_asc') return a.clientName.localeCompare(b.clientName, 'es', { sensitivity: 'base' });
    const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
    const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
    if (sortOption === 'date_desc') return db - da;
    if (sortOption === 'date_asc') return da - db;
    return b.balanceCents - a.balanceCents;
  });

  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Crédito y Cobranzas</span>
        <h2>Fiao y Cuentas por Cobrar</h2>
        <p>Control integral de fiaos en local y pedidos por delivery con cobro global y estados de cuenta.</p>
      </div>
      <div class="header-actions" style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="button secondary" data-receivables-print-report title="Imprimir arqueo de fiaos en impresora térmica">
          <i data-lucide="printer"></i> Imprimir Reporte
        </button>
        <button class="button secondary" data-client-new>
          <i data-lucide="user-plus"></i> Registrar Cliente para Fiao
        </button>
        <button class="button primary" data-route="pos">
          <i data-lucide="plus"></i> Nuevo Fiao en POS
        </button>
      </div>
    </section>

    <!-- Métricas Financieras Diferenciadas -->
    <div class="metric-grid">
      <article class="metric-card warning">
        <i data-lucide="${channelFilter === 'delivery' ? 'bike' : 'book-open'}"></i>
        <div>
          <span>${channelFilter === 'fiao' ? 'Total Fiaos en Local' : channelFilter === 'delivery' ? 'Total Deliveries Pendientes' : 'Total en Fiao Pendiente'}</span>
          <strong>${formatMoney(activeTotalPendingCents)}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">
            ${channelFilter === 'all'
              ? `<i data-lucide="book-open" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;"></i> Fiao: ${formatMoney(totalFiaoPendingCents)} · <i data-lucide="bike" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;"></i> Deliv: ${formatMoney(totalDeliveryPendingCents)}`
              : `${activePendingInvoices.length} consumo(s) activos`}
          </small>
        </div>
      </article>
      <article class="metric-card">
        <i data-lucide="users"></i>
        <div>
          <span>Clientes con Deuda</span>
          <strong>${activeClientsCount}</strong>
          <small style="color:${overdueClientsCount > 0 ? '#f59e0b' : 'var(--muted)'};font-size:0.75rem;">
            ${channelFilter === 'all'
              ? `${fiaoClientsCount} en Fiao · ${deliveryClientsCount} en Delivery`
              : (overdueClientsCount > 0 ? `${overdueClientsCount} en mora (+15 días)` : 'Todos al día')}
          </small>
        </div>
      </article>
      <article class="metric-card">
        <i data-lucide="badge-dollar-sign"></i>
        <div>
          <span>Cobrado Hoy en Fiaos</span>
          <strong style="color:var(--brand-2);">${formatMoney(todayCollectedCents)}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">${fiaoPaymentsToday.length} cobro(s) recibidos hoy</small>
        </div>
      </article>
      <article class="metric-card ${overdueDebtCents > 0 ? 'warning' : ''}">
        <i data-lucide="alert-triangle"></i>
        <div>
          <span>Deuda en Mora (+15 días)</span>
          <strong style="${overdueDebtCents > 0 ? 'color:#f85149;' : ''}">${formatMoney(overdueDebtCents)}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">Requiere gestión de cobro</small>
        </div>
      </article>
    </div>

    <!-- Segmentador de Canales: Fiaos en Local vs Pedidos por Delivery -->
    <section class="surface-card data-surface">
      <div class="receivables-channel-selector">
        <button
          type="button"
          class="receivables-channel-btn ${channelFilter === 'all' ? 'active' : ''}"
          data-receivables-channel="all"
          title="Ver todas las cuentas por cobrar sin distinción de canal"
        >
          <i data-lucide="layers"></i>
          <span>Todos los Pendientes</span>
          <span class="channel-pill neutral">${activeClientsCount} · ${formatMoney(activeTotalPendingCents)}</span>
        </button>
        <button
          type="button"
          class="receivables-channel-btn channel-fiao ${channelFilter === 'fiao' ? 'active' : ''}"
          data-receivables-channel="fiao"
          title="Filtrar únicamente personas que cogen fiao en el local"
        >
          <i data-lucide="book-open"></i>
          <span>Fiaos en Local</span>
          <span class="channel-pill warning">${fiaoClientsCount} · ${formatMoney(totalFiaoPendingCents)}</span>
        </button>
        <button
          type="button"
          class="receivables-channel-btn channel-delivery ${channelFilter === 'delivery' ? 'active' : ''}"
          data-receivables-channel="delivery"
          title="Filtrar únicamente órdenes despachadas por delivery pendientes de cobro"
        >
          <i data-lucide="bike"></i>
          <span>Pedidos por Delivery</span>
          <span class="channel-pill info">${deliveryClientsCount} · ${formatMoney(totalDeliveryPendingCents)}</span>
        </button>
      </div>
    </section>

    <!-- Pestañas Principales -->
    <div class="receivables-tabs">
      <button
        type="button"
        class="button ${activeTab === 'debts' ? 'primary' : 'secondary'} compact"
        data-receivables-tab="debts"
        style="font-size:0.88rem;gap:6px;"
      >
        <i data-lucide="book-open"></i> Deudas Pendientes (${channelScopedClients.length})
      </button>
      <button
        type="button"
        class="button ${activeTab === 'history' ? 'primary' : 'secondary'} compact"
        data-receivables-tab="history"
        style="font-size:0.88rem;gap:6px;"
      >
        <i data-lucide="history"></i> Historial de Cobros (${fiaoPayments.length})
      </button>
    </div>

    ${activeTab === 'debts' ? renderDebtsTab({
      clients: filteredClients,
      invoices: filteredInvoices,
      allCount: channelScopedClients.length,
      channelFilter,
      fiaoClientsCount,
      deliveryClientsCount,
      totalFiaoPendingCents,
      totalDeliveryPendingCents,
      ageFilter,
      amountFilter,
      contactFilter,
      sortOption,
      viewMode,
      searchQuery
    }) : renderHistoryTab(fiaoPayments, creditInvoiceMap)}
  `;
}

function renderDebtsTab({ clients, invoices, allCount, channelFilter, fiaoClientsCount, deliveryClientsCount, totalFiaoPendingCents, totalDeliveryPendingCents, ageFilter, amountFilter, contactFilter, sortOption, viewMode, searchQuery }) {
  const isFiltering = channelFilter !== 'all' || ageFilter !== 'all' || amountFilter !== 'all' || contactFilter !== 'all' || Boolean(searchQuery);

  return `
    <section class="surface-card data-surface" style="overflow:visible;">
      <!-- Selector de Canal Táctil: Fiaos vs Deliveries -->
      <div class="receivables-channel-bar" style="padding:14px 16px 0 16px;">
        <button
          type="button"
          class="receivables-channel-btn ${channelFilter === 'all' ? 'active' : ''}"
          data-receivables-channel="all"
          title="Ver todos los clientes con cobros pendientes"
        >
          <i data-lucide="layers"></i>
          <span>Todos los Pendientes</span>
          <span class="channel-pill">${allCount}</span>
        </button>
        <button
          type="button"
          class="receivables-channel-btn channel-fiao ${channelFilter === 'fiao' ? 'active' : ''}"
          data-receivables-channel="fiao"
          title="Filtrar únicamente personas que cogen fiao en el local"
        >
          <i data-lucide="book-open"></i>
          <span>Fiaos en Local</span>
          <span class="channel-pill warning">${fiaoClientsCount} · ${formatMoney(totalFiaoPendingCents)}</span>
        </button>
        <button
          type="button"
          class="receivables-channel-btn channel-delivery ${channelFilter === 'delivery' ? 'active' : ''}"
          data-receivables-channel="delivery"
          title="Filtrar únicamente órdenes despachadas por delivery pendientes de cobro"
        >
          <i data-lucide="bike"></i>
          <span>Pedidos por Delivery</span>
          <span class="channel-pill info">${deliveryClientsCount} · ${formatMoney(totalDeliveryPendingCents)}</span>
        </button>
      </div>

      <!-- Barra de Herramientas y Filtros Avanzados -->
      <div class="receivables-filter-bar">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <label class="search-field" style="flex:1;min-width:280px;margin:0;">
            <i data-lucide="search"></i>
            <input
              id="fiao-search"
              type="search"
              placeholder="Buscar por cliente, teléfono, factura (FAC-...) o comida (yaroa, chimi...)"
              value="${escapeHtml(searchQuery)}"
            >
          </label>
          ${isFiltering ? `
            <button type="button" class="button secondary compact" data-receivables-clear-filters style="font-size:0.8rem;gap:5px;">
              <i data-lucide="rotate-ccw"></i> Limpiar filtros
            </button>
          ` : ''}
          <div class="receivables-view-toggle">
            <button
              type="button"
              class="receivables-view-btn ${viewMode === 'clients' ? 'active' : ''}"
              data-receivables-view="clients"
              title="Ver agrupado por clientes"
            >
              <i data-lucide="users"></i> Clientes (${clients.length})
            </button>
            <button
              type="button"
              class="receivables-view-btn ${viewMode === 'invoices' ? 'active' : ''}"
              data-receivables-view="invoices"
              title="Ver consumos individuales"
            >
              <i data-lucide="receipt"></i> Facturas (${invoices.length})
            </button>
          </div>
        </div>

        <!-- Fila de Chips de Antigüedad -->
        <div class="receivables-filter-row">
          <span style="font-size:0.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;">Antigüedad:</span>
          <button type="button" class="receivables-chip ${ageFilter === 'all' ? 'active' : ''}" data-receivables-age="all">
            Todas
          </button>
          <button type="button" class="receivables-chip ${ageFilter === 'today' ? 'active' : ''}" data-receivables-age="today">
            De Hoy
          </button>
          <button type="button" class="receivables-chip ${ageFilter === 'week' ? 'active' : ''}" data-receivables-age="week">
            1 - 7 días
          </button>
          <button type="button" class="receivables-chip warning ${ageFilter === 'over15' ? 'active' : ''}" data-receivables-age="over15">
            +15 días (Mora)
          </button>
          <button type="button" class="receivables-chip danger ${ageFilter === 'over30' ? 'active' : ''}" data-receivables-age="over30">
            +30 días (Crítica)
          </button>
        </div>

        <!-- Fila de Filtros Secundarios (Monto, Contacto, Orden) -->
        <div class="receivables-filter-row" style="padding-top:4px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:0.75rem;color:var(--muted);">Monto:</span>
            <select id="fiao-amount-filter" style="font-size:0.8rem;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.3);border:1px solid var(--line);color:#fff;">
              <option value="all" ${amountFilter === 'all' ? 'selected' : ''}>Cualquier monto</option>
              <option value="under500" ${amountFilter === 'under500' ? 'selected' : ''}>Hasta RD$ 500</option>
              <option value="500to1500" ${amountFilter === '500to1500' ? 'selected' : ''}>RD$ 500 - 1,500</option>
              <option value="over1500" ${amountFilter === 'over1500' ? 'selected' : ''}>Más de RD$ 1,500</option>
            </select>
          </div>

          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:0.75rem;color:var(--muted);">Contacto:</span>
            <select id="fiao-contact-filter" style="font-size:0.8rem;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.3);border:1px solid var(--line);color:#fff;">
              <option value="all" ${contactFilter === 'all' ? 'selected' : ''}>Todos</option>
              <option value="withPhone" ${contactFilter === 'withPhone' ? 'selected' : ''}>Con teléfono</option>
              <option value="withoutPhone" ${contactFilter === 'withoutPhone' ? 'selected' : ''}>Sin teléfono</option>
              <option value="overLimit" ${contactFilter === 'overLimit' ? 'selected' : ''}>Límite excedido</option>
            </select>
          </div>

          <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
            <span style="font-size:0.75rem;color:var(--muted);">Ordenar:</span>
            <select id="fiao-sort-select" style="font-size:0.8rem;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.3);border:1px solid var(--line);color:#fff;">
              <option value="debt_desc" ${sortOption === 'debt_desc' ? 'selected' : ''}>Mayor deuda</option>
              <option value="debt_asc" ${sortOption === 'debt_asc' ? 'selected' : ''}>Menor deuda</option>
              <option value="name_asc" ${sortOption === 'name_asc' ? 'selected' : ''}>Cliente (A - Z)</option>
              <option value="date_desc" ${sortOption === 'date_desc' ? 'selected' : ''}>Más reciente</option>
              <option value="date_asc" ${sortOption === 'date_asc' ? 'selected' : ''}>Más antigua (urgente)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Contenido de la Vista -->
      ${viewMode === 'clients' ? `
        <div class="fiao-list" id="fiao-list-container" style="padding:14px 16px;">
          ${clients.length ? clients.map(client => debtCard({ ...client, channel: channelFilter })).join('') : `
            <div class="empty-state" style="padding:48px 20px;text-align:center;">
              <i data-lucide="${isFiltering ? 'filter-x' : 'badge-check'}" style="width:48px;height:48px;color:${isFiltering ? 'var(--muted)' : '#3fb950'};margin:0 auto 12px;display:block;"></i>
              <h3>${isFiltering ? 'Sin resultados con los filtros actuales' : '¡Al día con los Fiaos!'}</h3>
              <p style="color:var(--muted);max-width:400px;margin:0 auto;">
                ${isFiltering ? 'Intenta modificar la búsqueda o los filtros seleccionados para ver más clientes.' : 'No hay cuentas de comida fiada pendientes por cobrar en este momento.'}
              </p>
            </div>
          `}
        </div>
      ` : `
        <div class="table-scroll" style="padding:0;">
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid var(--line);background:rgba(0,0,0,.2);">
                <th style="padding:10px 14px;text-align:left;font-size:0.8rem;color:var(--muted);">Documento</th>
                <th style="padding:10px 14px;text-align:left;font-size:0.8rem;color:var(--muted);">Cliente</th>
                <th style="padding:10px 14px;text-align:left;font-size:0.8rem;color:var(--muted);">Fecha / Antigüedad</th>
                <th style="padding:10px 14px;text-align:left;font-size:0.8rem;color:var(--muted);">Productos Consumidos</th>
                <th style="padding:10px 14px;text-align:right;font-size:0.8rem;color:var(--muted);">Pendiente</th>
                <th style="padding:10px 14px;text-align:center;font-size:0.8rem;color:var(--muted);">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${invoices.length ? invoices.map((inv) => `
                <tr data-fiao-row data-search="${escapeHtml(`${inv.invoiceNumber} ${inv.clientName} ${inv.clientPhone || ''} ${(inv.items || []).map(i => i.name).join(' ')} ${inv.notes || ''}`.toLowerCase())}" style="border-bottom:1px solid rgba(255,255,255,.05);">
                  <td style="padding:12px 14px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                      <strong style="color:var(--brand-2);font-size:0.88rem;">${escapeHtml(inv.invoiceNumber)}</strong>
                      ${inv.isDelivery ? `
                        <span class="badge-channel-delivery" style="font-size:0.68rem;padding:2px 6px;">
                          <i data-lucide="bike" style="width:11px;height:11px;"></i> Delivery
                        </span>
                      ` : `
                        <span class="badge-channel-fiao" style="font-size:0.68rem;padding:2px 6px;">
                          <i data-lucide="book-open" style="width:11px;height:11px;"></i> Fiao
                        </span>
                      `}
                    </div>
                  </td>
                  <td style="padding:12px 14px;">
                    <strong style="color:#fff;display:block;font-size:0.9rem;">${escapeHtml(inv.clientName)}</strong>
                    ${inv.clientPhone ? `<span style="font-size:0.75rem;color:var(--muted);">${escapeHtml(inv.clientPhone)}</span>` : ''}
                    ${inv.isDelivery && (inv.deliveryDriverName || inv.deliveryAddress) ? `
                      <span style="font-size:0.72rem;color:#38bdf8;display:block;margin-top:2px;">
                        ${inv.deliveryDriverName ? `Chofer: ${escapeHtml(inv.deliveryDriverName)} ` : ''}
                        ${inv.deliveryAddress ? `· <i data-lucide="map-pin" style="width:11px;height:11px;display:inline-block;vertical-align:-1px;"></i> ${escapeHtml(inv.deliveryAddress)}` : ''}
                      </span>
                    ` : ''}
                  </td>
                  <td style="padding:12px 14px;">
                    <span style="font-size:0.8rem;color:#ddd;display:block;">${formatDate(inv.createdAt)}</span>
                    <span style="font-size:0.72rem;color:${inv.ageDays >= 15 ? '#f85149' : 'var(--muted)'};font-weight:${inv.ageDays >= 15 ? '700' : '400'};">
                      ${inv.ageDays === 0 ? 'Hoy' : `Hace ${inv.ageDays} día(s)`}
                    </span>
                  </td>
                  <td style="padding:12px 14px;max-width:260px;">
                    <span style="font-size:0.8rem;color:#ccc;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      ${(inv.items || []).map(i => `${i.quantity}x ${i.name}`).join(' · ')}
                    </span>
                    ${inv.notes ? `<small style="color:var(--muted);display:block;font-style:italic;">Nota: ${escapeHtml(inv.notes)}</small>` : ''}
                  </td>
                  <td style="padding:12px 14px;text-align:right;">
                    <strong style="font-size:1rem;color:#f85149;">${formatMoney(inv.balanceCents)}</strong>
                  </td>
                  <td style="padding:12px 14px;text-align:center;">
                    <div style="display:inline-flex;gap:6px;align-items:center;">
                      <button type="button" class="button secondary compact" data-fiao-invoice-view="${escapeHtml(inv.id)}" title="Ver factura completa" style="font-size:0.75rem;padding:4px 8px;">
                        <i data-lucide="eye"></i>
                      </button>
                      <button type="button" class="button primary compact" data-fiao-pay="${escapeHtml(inv.id)}" style="font-size:0.75rem;padding:4px 10px;">
                        <i data-lucide="circle-dollar-sign"></i> Cobrar
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="6" style="padding:36px;text-align:center;color:var(--muted);">
                    Sin facturas coincidentes.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      `}
    </section>
  `;
}

function renderHistoryTab(payments, invoiceMap) {
  return `
    <section class="surface-card data-surface">
      <div style="padding:14px 16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <h3 style="margin:0;font-size:1.05rem;color:#fff;">Historial de Cobros y Abonos a Fiao</h3>
          <p style="margin:2px 0 0;font-size:0.82rem;color:var(--muted);">Registro cronológico de pagos recibidos sobre compras a crédito.</p>
        </div>
        <span style="font-size:0.85rem;color:var(--brand-2);font-weight:700;">${payments.length} cobro(s) registrado(s)</span>
      </div>

      <div class="table-scroll">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid var(--line);background:rgba(0,0,0,.2);">
              <th style="padding:10px 14px;text-align:left;font-size:0.8rem;color:var(--muted);">Fecha / Hora</th>
              <th style="padding:10px 14px;text-align:left;font-size:0.8rem;color:var(--muted);">Cliente</th>
              <th style="padding:10px 14px;text-align:left;font-size:0.8rem;color:var(--muted);">Factura</th>
              <th style="padding:10px 14px;text-align:left;font-size:0.8rem;color:var(--muted);">Forma de Pago</th>
              <th style="padding:10px 14px;text-align:left;font-size:0.8rem;color:var(--muted);">Cajero</th>
              <th style="padding:10px 14px;text-align:right;font-size:0.8rem;color:var(--muted);">Monto Cobrado</th>
              <th style="padding:10px 14px;text-align:center;font-size:0.8rem;color:var(--muted);">Comprobante</th>
            </tr>
          </thead>
          <tbody>
            ${payments.length ? payments.map((p) => {
              const inv = invoiceMap.get(p.invoiceId) || {};
              const clientName = inv.clientName || 'Cliente';
              const methodLabel = ({ cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia' })[p.method] || p.method;
              return `
                <tr style="border-bottom:1px solid rgba(255,255,255,.05);">
                  <td style="padding:12px 14px;font-size:0.85rem;color:#ccc;">
                    ${formatDate(p.createdAt, true)}
                  </td>
                  <td style="padding:12px 14px;">
                    <strong style="color:#fff;font-size:0.88rem;">${escapeHtml(clientName)}</strong>
                  </td>
                  <td style="padding:12px 14px;">
                    <span style="color:var(--brand-2);font-size:0.85rem;font-weight:600;">${escapeHtml(p.invoiceNumber || inv.invoiceNumber || 'FACTURA')}</span>
                  </td>
                  <td style="padding:12px 14px;font-size:0.85rem;">
                    <span style="display:inline-block;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,.06);color:#ddd;font-size:0.78rem;">
                      ${methodLabel}
                    </span>
                    ${p.reference ? `<small style="display:block;color:var(--muted);font-size:0.72rem;">Ref: ${escapeHtml(p.reference)}</small>` : ''}
                  </td>
                  <td style="padding:12px 14px;font-size:0.85rem;color:var(--muted);">
                    ${escapeHtml(p.cashierName || 'Caja')}
                  </td>
                  <td style="padding:12px 14px;text-align:right;">
                    <strong style="font-size:1rem;color:#3fb950;">+${formatMoney(p.amountCents)}</strong>
                  </td>
                  <td style="padding:12px 14px;text-align:center;">
                    <button
                      type="button"
                      class="button secondary compact"
                      data-print-fiao-invoice="${escapeHtml(p.invoiceId)}"
                      title="Reimprimir comprobante de venta y cobro"
                      style="font-size:0.75rem;padding:4px 8px;gap:4px;"
                    >
                      <i data-lucide="printer"></i> Ticket
                    </button>
                  </td>
                </tr>
              `;
            }).join('') : `
              <tr>
                <td colspan="7" style="padding:48px 20px;text-align:center;color:var(--muted);">
                  No hay cobros de fiao registrados recientemente.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function cleanPhoneForWa(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return '1' + digits;
  return digits;
}

function debtCard(client) {
  const cleanPhone = cleanPhoneForWa(client.phone);
  const waMessage = encodeURIComponent(
    `Hola ${client.name}, un cordial saludo de Los Panitas. Le informamos que su balance pendiente es de ${formatMoney(client.totalDebtCents)} (${client.invoices.length} consumo${client.invoices.length > 1 ? 's' : ''}). Agradecemos su puntual pago en caja. ¡Muchas gracias!`
  );

  const searchIndex = `${client.name} ${client.phone || ''} ${client.address || ''} ${client.invoices.map(i => `${i.invoiceNumber} ${(i.items || []).map(it => it.name).join(' ')}`).join(' ')}`.toLowerCase();

  // Cálculo de límite de crédito
  const hasLimit = client.creditLimitCents > 0;
  const isOverLimit = hasLimit && client.totalDebtCents >= client.creditLimitCents;
  const limitPct = hasLimit ? Math.min(100, Math.round((client.totalDebtCents / client.creditLimitCents) * 100)) : 0;

  return `
    <article
      class="fiao-debt-card surface-card"
      data-fiao-card
      data-search="${escapeHtml(searchIndex)}"
      style="margin-bottom:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);padding:18px;border-radius:14px;"
    >
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <div style="width:44px;height:44px;border-radius:10px;background:rgba(239,189,105,.15);color:var(--brand-2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.2rem;flex-shrink:0;">
            ${escapeHtml(client.name.charAt(0).toUpperCase())}
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <h3 style="margin:0;font-size:1.15rem;font-weight:700;color:#fff;">${escapeHtml(client.name)}</h3>
              ${client.fiaoDebtCents > 0 && client.deliveryDebtCents > 0 ? `
                <span class="receivables-badge warning" style="font-size:0.72rem;padding:2px 6px;"><i data-lucide="book-open"></i> Fiao: ${formatMoney(client.fiaoDebtCents)}</span>
                <span class="receivables-badge info" style="font-size:0.72rem;padding:2px 6px;background:rgba(56,189,248,.15);color:#38bdf8;border:1px solid rgba(56,189,248,.3);"><i data-lucide="bike"></i> Delivery: ${formatMoney(client.deliveryDebtCents)}</span>
              ` : client.deliveryDebtCents > 0 ? `
                <span class="receivables-badge info" style="font-size:0.72rem;padding:2px 6px;background:rgba(56,189,248,.15);color:#38bdf8;border:1px solid rgba(56,189,248,.3);"><i data-lucide="bike"></i> Pedidos Delivery</span>
              ` : `
                <span class="receivables-badge warning" style="font-size:0.72rem;padding:2px 6px;"><i data-lucide="book-open"></i> Fiao en Local</span>
              `}
              ${client.maxAgeDays >= 30 ? `
                <span class="receivables-badge danger"><i data-lucide="alert-triangle"></i> Mora +30d</span>
              ` : client.maxAgeDays >= 15 ? `
                <span class="receivables-badge warning"><i data-lucide="clock"></i> Mora +15d</span>
              ` : client.maxAgeDays === 0 ? `
                <span class="receivables-badge success">Hoy</span>
              ` : ''}
              ${isOverLimit ? `
                <span class="receivables-badge danger"><i data-lucide="shield-alert"></i> Límite excedido</span>
              ` : ''}
            </div>

            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;">
              ${client.phone ? `
                <a href="tel:${escapeHtml(client.phone)}" class="button secondary compact" style="padding:3px 8px;font-size:0.8rem;text-decoration:none;color:#58a6ff;border-color:rgba(88,166,255,.3);" title="Llamar a ${escapeHtml(client.name)}">
                  <i data-lucide="phone"></i> ${escapeHtml(client.phone)}
                </a>
                <a href="https://wa.me/${escapeHtml(cleanPhone)}?text=${waMessage}" target="_blank" rel="noopener" class="button secondary compact" style="padding:3px 8px;font-size:0.8rem;text-decoration:none;color:#25D366;border-color:rgba(37,211,102,.3);" title="Enviar mensaje de cobro por WhatsApp">
                  <i data-lucide="message-square"></i> WhatsApp
                </a>
              ` : `
                <span style="font-size:0.75rem;color:var(--muted);font-style:italic;">Sin teléfono registrado</span>
                <button type="button" class="button secondary compact" data-client-edit="${escapeHtml(client.clientId || '')}" data-client-name="${escapeHtml(client.name)}" style="font-size:0.72rem;padding:2px 7px;height:auto;line-height:1.2;">
                  <i data-lucide="user-plus" style="width:12px;height:12px;"></i> Agregar Teléfono
                </button>
              `}
              ${client.address ? `<span style="font-size:0.75rem;color:var(--muted);">· ${escapeHtml(client.address)}</span>` : ''}
            </div>

            <div style="display:flex;align-items:center;gap:12px;margin-top:4px;flex-wrap:wrap;">
              <span style="font-size:0.75rem;color:var(--muted);">${client.invoices.length} consumo(s) registrado(s)</span>
              ${hasLimit ? `
                <span style="font-size:0.75rem;color:${isOverLimit ? '#f85149' : 'var(--brand-2)'};">
                  Límite: ${formatMoney(client.creditLimitCents)} (${limitPct}% usado)
                </span>
              ` : ''}
            </div>
          </div>
        </div>

        <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div>
            <span style="font-size:0.75rem;color:var(--muted);display:block;text-transform:uppercase;letter-spacing:.5px;">Deuda Total</span>
            <strong style="font-size:1.4rem;color:#f85149;font-weight:800;">${formatMoney(client.totalDebtCents)}</strong>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
            <button
              type="button"
              class="button secondary compact"
              data-client-statement="${escapeHtml(client.name)}"
              data-client-id="${escapeHtml(client.clientId || '')}"
              data-client-channel="${escapeHtml(client.channel || 'all')}"
              style="font-size:0.8rem;padding:6px 10px;gap:5px;"
              title="Ver estado de cuenta e imprimir ticket"
            >
              <i data-lucide="file-text"></i> Estado de Cuenta
            </button>
            <button
              type="button"
              class="button primary compact"
              data-client-bulk-pay="${escapeHtml(client.name)}"
              data-client-id="${escapeHtml(client.clientId || '')}"
              data-client-channel="${escapeHtml(client.channel || 'all')}"
              style="font-size:0.8rem;padding:6px 12px;gap:5px;"
              title="Abonar a la deuda global o saldar todo con un solo PIN"
            >
              <i data-lucide="badge-dollar-sign"></i> Abonar / Saldar Cuenta
            </button>
          </div>
        </div>
      </div>

      <!-- Desglose de Consumos Individuales -->
      <div class="fiao-invoices-scroll" style="display:flex;flex-direction:column;gap:8px;border-top:1px solid rgba(255,255,255,.06);padding-top:12px;">
        ${client.invoices.map((inv) => `
          <div class="fiao-item-row" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(0,0,0,.2);border-radius:8px;border:1px solid rgba(255,255,255,.04);gap:8px;flex-wrap:wrap;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <strong style="font-size:0.88rem;color:var(--brand-2);">${escapeHtml(inv.invoiceNumber)}</strong>
                ${inv.isDelivery ? `
                  <span class="badge-channel-delivery" style="font-size:0.7rem;padding:2px 6px;">
                    <i data-lucide="bike" style="width:11px;height:11px;"></i> Delivery${inv.deliveryDriverName ? ` · Chofer: ${escapeHtml(inv.deliveryDriverName)}` : ''}
                  </span>
                ` : `
                  <span class="badge-channel-fiao" style="font-size:0.7rem;padding:2px 6px;">
                    <i data-lucide="book-open" style="width:11px;height:11px;"></i> Fiao en Local
                  </span>
                `}
                <span style="font-size:0.75rem;color:var(--muted);">${formatDate(inv.createdAt, true)}</span>
                <span style="font-size:0.7rem;padding:1px 5px;border-radius:4px;background:rgba(255,255,255,.06);color:${inv.ageDays >= 15 ? '#f85149' : 'var(--muted)'};">
                  ${inv.ageDays === 0 ? 'Hoy' : `Hace ${inv.ageDays}d`}
                </span>
              </div>
              <div style="font-size:0.8rem;color:#ccc;margin-top:2px;">
                ${(inv.items || []).map(i => `${i.quantity}x ${escapeHtml(i.name)}`).join(' · ')}
              </div>
              ${inv.deliveryAddress ? `<small style="color:#38bdf8;display:block;margin-top:1px;"><i data-lucide="map-pin" style="width:10px;height:10px;display:inline-block;vertical-align:middle;"></i> Entrega: ${escapeHtml(inv.deliveryAddress)}</small>` : ''}
              ${inv.clientPhone || inv.notes ? `<small style="color:var(--muted);display:block;font-style:italic;">${inv.clientPhone ? `Tel: ${escapeHtml(inv.clientPhone)} ` : ''}${inv.notes ? `· Nota: ${escapeHtml(inv.notes)}` : ''}</small>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <strong style="font-size:1rem;color:#fff;">${formatMoney(inv.balanceCents)}</strong>
              <button
                type="button"
                class="button secondary compact"
                data-fiao-invoice-view="${escapeHtml(inv.id)}"
                title="Ver factura completa"
                style="font-size:0.75rem;padding:6px 8px;"
              >
                <i data-lucide="eye"></i>
              </button>
              <button
                type="button"
                class="button primary compact"
                data-fiao-pay="${escapeHtml(inv.id)}"
                style="font-size:0.8rem;padding:6px 12px;"
              >
                <i data-lucide="circle-dollar-sign"></i> ${inv.isDelivery ? 'Cobrar delivery' : 'Cobrar fiao'}
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </article>
  `;
}

export function renderFiaoPayModal(invoice, activeCash) {
  if (!invoice) return '';
  const balanceCents = Number(invoice.totalCents) - Number(invoice.paidCents || 0);
  return `
    <div class="modal-backdrop" data-modal-close>
      <form id="fiao-pay-form" class="modal-card form-modal" style="max-width:460px;" data-modal-card>
        <input type="hidden" name="invoiceId" value="${escapeHtml(invoice.id)}">
        <header>
          <div>
            <span class="eyebrow">Saldar Cuenta Pendiente</span>
            <h2>Cobrar Fiao: ${escapeHtml(invoice.clientName)}</h2>
            ${invoice.clientPhone ? `<span style="font-size:0.82rem;color:var(--brand-2);display:inline-flex;align-items:center;gap:4px;margin-top:2px;"><i data-lucide="phone" style="width:13px;height:13px;"></i> ${escapeHtml(invoice.clientPhone)}</span>` : ''}
          </div>
          <button type="button" class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
        </header>
        <div class="stack-form" style="padding-top:8px;">
          <div style="padding:14px;background:rgba(239,189,105,.1);border:1px solid rgba(239,189,105,.3);border-radius:12px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span style="font-size:0.75rem;color:var(--muted);display:block;text-transform:uppercase;">Factura ${escapeHtml(invoice.invoiceNumber)}</span>
              <strong style="font-size:0.9rem;color:#fff;">${(invoice.items || []).map(i => `${i.quantity}x ${i.name}`).join(', ')}</strong>
            </div>
            <div style="text-align:right;">
              <span style="font-size:0.75rem;color:var(--muted);display:block;">Monto Pendiente</span>
              <strong style="font-size:1.3rem;color:var(--brand-2);">${formatMoney(balanceCents)}</strong>
            </div>
          </div>

          <label>Monto a abonar o saldar (DOP)
            <input name="amount" id="fiao-pay-amount" type="text" data-touch-numpad="money" data-numpad-title="Monto a Abonar (Fiao)" min="1" max="${(balanceCents / 100).toFixed(2)}" value="${(balanceCents / 100).toFixed(2)}" required readonly inputmode="none" style="font-size:1.25rem;font-weight:700;color:var(--brand-2);cursor:pointer;">
          </label>

          <div class="form-grid two">
            <label>Forma de pago
              <select name="method" id="fiao-pay-method">
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="transfer">Transferencia</option>
              </select>
            </label>
            <label>Referencia (opcional)
              <input name="reference" placeholder="Autorización, ref...">
            </label>
          </div>

          <div id="fiao-cash-calculator" class="quick-cash-container" style="margin-top:4px;">
            <label>Efectivo entregado por el cliente</label>
            <input id="fiao-cash-received" type="text" data-touch-numpad="money" data-numpad-title="Efectivo Entregado" placeholder="Toca para ingresar efectivo" readonly inputmode="none" style="cursor:pointer;">
            <div class="quick-cash-grid">
              <button type="button" class="quick-cash-btn exact" data-fiao-cash-val="exact">Exacto</button>
              <button type="button" class="quick-cash-btn" data-fiao-cash-val="100">RD$ 100</button>
              <button type="button" class="quick-cash-btn" data-fiao-cash-val="200">RD$ 200</button>
              <button type="button" class="quick-cash-btn" data-fiao-cash-val="500">RD$ 500</button>
              <button type="button" class="quick-cash-btn" data-fiao-cash-val="1000">RD$ 1,000</button>
              <button type="button" class="quick-cash-btn" data-fiao-cash-val="2000">RD$ 2,000</button>
            </div>
            <div id="fiao-change-display" class="cash-change-display">
              <span>Cambio / Devuelta:</span>
              <strong id="fiao-change-amount">RD$ 0.00</strong>
            </div>
          </div>

          <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:#ddd;cursor:pointer;user-select:none;margin:6px 0 2px;">
            <input type="checkbox" name="printInvoice" id="fiao-print-receipt" checked style="width:18px;height:18px;accent-color:var(--brand-2);cursor:pointer;">
            <i data-lucide="printer" style="width:16px;height:16px;color:var(--brand-2);"></i>
            <span>Imprimir comprobante de cobro</span>
          </label>

          <div class="fiao-pin-section" style="margin-top:8px;">
            <label style="display:block;margin-bottom:4px;font-size:0.85rem;font-weight:600;color:var(--muted);text-align:center;">
              Digita tu PIN de 6 dígitos para autorizar
            </label>
            <input id="fiao-pay-pin" name="pin" type="password" inputmode="none" pattern="[0-9]{6}" maxlength="6" placeholder="" required readonly tabindex="-1" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;">
            <div class="pin-slots-container" id="fiao-pin-slots">
              <span class="pin-slot" data-slot="0"></span>
              <span class="pin-slot" data-slot="1"></span>
              <span class="pin-slot" data-slot="2"></span>
              <span class="pin-slot" data-slot="3"></span>
              <span class="pin-slot" data-slot="4"></span>
              <span class="pin-slot" data-slot="5"></span>
            </div>
            <div class="pin-pad" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin:6px 0 10px;">
              ${[1,2,3,4,5,6,7,8,9].map((n) => `<button type="button" class="button secondary pin-num-btn" data-fiao-pin="${n}" data-pin-num="${n}" style="font-size:1.3rem;font-weight:700;padding:11px 0;">${n}</button>`).join('')}
              <button type="button" class="button secondary pin-clear-btn" id="fiao-pin-clear" style="font-size:.85rem;font-weight:600;padding:11px 0;color:#f85149;">Borrar</button>
              <button type="button" class="button secondary pin-num-btn" data-fiao-pin="0" data-pin-num="0" style="font-size:1.3rem;font-weight:700;padding:11px 0;">0</button>
              <button type="button" class="button secondary pin-del-btn" id="fiao-pin-del" style="font-size:1.2rem;font-weight:700;padding:11px 0;">⌫</button>
            </div>
            <div id="fiao-pin-error" style="color:#f85149;font-size:0.82rem;min-height:18px;margin-bottom:4px;text-align:center;font-weight:600;"></div>
          </div>
        </div>
        <footer class="modal-actions" style="margin-top:8px;">
          <button type="button" class="button secondary" data-modal-close>Cancelar</button>
          <button class="button primary" type="submit" id="fiao-pay-submit"><i data-lucide="key-round"></i> Autorizar y Cobrar</button>
        </footer>
      </form>
    </div>
  `;
}

/**
 * Modal para Saldar Toda la Cuenta o Abonar a la Deuda Global del Cliente
 */
export function renderClientBulkPayModal(client, activeCash) {
  if (!client) return '';
  const totalDebtCents = client.totalDebtCents || 0;
  const invoices = client.invoices || [];

  return `
    <div class="modal-backdrop" data-modal-close>
      <form id="client-bulk-pay-form" class="modal-card form-modal" style="max-width:520px;" data-modal-card>
        <input type="hidden" name="clientName" value="${escapeHtml(client.name)}">
        <input type="hidden" name="clientPhone" value="${escapeHtml(client.phone || '')}">
        <header>
          <div>
            <span class="eyebrow">Cobro Consolidado de Fiaos</span>
            <h2>Abonar / Saldar: ${escapeHtml(client.name)}</h2>
            ${client.phone ? `<span style="font-size:0.82rem;color:var(--brand-2);display:inline-flex;align-items:center;gap:4px;margin-top:2px;"><i data-lucide="phone" style="width:13px;height:13px;"></i> ${escapeHtml(client.phone)}</span>` : ''}
          </div>
          <button type="button" class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
        </header>

        <div class="stack-form" style="padding-top:8px;">
          <!-- Tarjeta de Resumen de Deuda -->
          <div style="padding:14px 16px;background:rgba(239,189,105,.1);border:1px solid rgba(239,189,105,.3);border-radius:12px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span style="font-size:0.75rem;color:var(--muted);display:block;text-transform:uppercase;">Deuda Global Pendiente</span>
              <strong style="font-size:0.95rem;color:#fff;">${invoices.length} consumo(s) acumulado(s)</strong>
            </div>
            <div style="text-align:right;">
              <span style="font-size:0.75rem;color:var(--muted);display:block;">Total a Cobrar</span>
              <strong style="font-size:1.4rem;color:#f85149;font-weight:800;" id="bulk-total-display">${formatMoney(totalDebtCents)}</strong>
            </div>
          </div>

          <!-- Selector de Facturas a Liquidar -->
          <div>
            <label style="font-size:0.82rem;color:var(--muted);font-weight:700;text-transform:uppercase;margin-bottom:6px;display:block;">
              Consumos incluidos en este cobro:
            </label>
            <div style="max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:4px 0;">
              ${invoices.map((inv, idx) => `
                <label style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.06);border-radius:8px;font-size:0.85rem;cursor:pointer;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <input
                      type="checkbox"
                      name="invoiceIds"
                      value="${escapeHtml(inv.id)}"
                      data-balance-cents="${inv.balanceCents}"
                      data-invoice-number="${escapeHtml(inv.invoiceNumber)}"
                      checked
                      style="width:16px;height:16px;accent-color:var(--brand-2);cursor:pointer;"
                    >
                    <div>
                      <strong style="color:var(--brand-2);font-size:0.85rem;">${escapeHtml(inv.invoiceNumber)}</strong>
                      <small style="color:var(--muted);display:block;font-size:0.72rem;">${formatDate(inv.createdAt)} (${inv.ageDays === 0 ? 'Hoy' : `Hace ${inv.ageDays}d`})</small>
                    </div>
                  </div>
                  <strong style="color:#fff;">${formatMoney(inv.balanceCents)}</strong>
                </label>
              `).join('')}
            </div>
          </div>

          <!-- Monto a Abonar -->
          <label>Monto total a cobrar (DOP)
            <input
              name="amount"
              id="bulk-pay-amount"
              type="text"
              data-touch-numpad="money"
              data-numpad-title="Monto a Cobrar"
              min="1"
              max="${(totalDebtCents / 100).toFixed(2)}"
              value="${(totalDebtCents / 100).toFixed(2)}"
              required
              readonly
              inputmode="none"
              style="font-size:1.3rem;font-weight:700;color:var(--brand-2);cursor:pointer;"
            >
          </label>

          <div class="form-grid two">
            <label>Forma de pago
              <select name="method" id="bulk-pay-method">
                <option value="cash">Efectivo</option>
                <option value="card">Tarjeta</option>
                <option value="transfer">Transferencia</option>
              </select>
            </label>
            <label>Referencia (opcional)
              <input name="reference" placeholder="Autorización, ref...">
            </label>
          </div>

          <!-- Calculadora de Efectivo -->
          <div id="bulk-cash-calculator" class="quick-cash-container" style="margin-top:4px;">
            <label>Efectivo entregado por el cliente</label>
            <input id="bulk-cash-received" type="text" data-touch-numpad="money" data-numpad-title="Efectivo Entregado" placeholder="Toca para ingresar efectivo" readonly inputmode="none" style="cursor:pointer;">
            <div class="quick-cash-grid">
              <button type="button" class="quick-cash-btn exact" data-bulk-cash-val="exact">Exacto</button>
              <button type="button" class="quick-cash-btn" data-bulk-cash-val="100">RD$ 100</button>
              <button type="button" class="quick-cash-btn" data-bulk-cash-val="200">RD$ 200</button>
              <button type="button" class="quick-cash-btn" data-bulk-cash-val="500">RD$ 500</button>
              <button type="button" class="quick-cash-btn" data-bulk-cash-val="1000">RD$ 1,000</button>
              <button type="button" class="quick-cash-btn" data-bulk-cash-val="2000">RD$ 2,000</button>
            </div>
            <div id="bulk-change-display" class="cash-change-display">
              <span>Cambio / Devuelta:</span>
              <strong id="bulk-change-amount">RD$ 0.00</strong>
            </div>
          </div>

          <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:#ddd;cursor:pointer;user-select:none;margin:6px 0 2px;">
            <input type="checkbox" name="printSettlement" id="bulk-print-receipt" checked style="width:18px;height:18px;accent-color:var(--brand-2);cursor:pointer;">
            <i data-lucide="printer" style="width:16px;height:16px;color:var(--brand-2);"></i>
            <span>Imprimir comprobante consolidado de cobro</span>
          </label>

          <!-- Sección de PIN -->
          <div class="fiao-pin-section" style="margin-top:8px;">
            <label style="display:block;margin-bottom:4px;font-size:0.85rem;font-weight:600;color:var(--muted);text-align:center;">
              Digita tu PIN de 6 dígitos para autorizar
            </label>
            <input id="bulk-pay-pin" name="pin" type="password" inputmode="none" pattern="[0-9]{6}" maxlength="6" required readonly tabindex="-1" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;">
            <div class="pin-slots-container" id="bulk-pin-slots">
              <span class="pin-slot" data-slot="0"></span>
              <span class="pin-slot" data-slot="1"></span>
              <span class="pin-slot" data-slot="2"></span>
              <span class="pin-slot" data-slot="3"></span>
              <span class="pin-slot" data-slot="4"></span>
              <span class="pin-slot" data-slot="5"></span>
            </div>
            <div class="pin-pad" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin:6px 0 10px;">
              ${[1,2,3,4,5,6,7,8,9].map((n) => `<button type="button" class="button secondary pin-num-btn" data-pin-num="${n}" style="font-size:1.3rem;font-weight:700;padding:11px 0;">${n}</button>`).join('')}
              <button type="button" class="button secondary pin-clear-btn" id="bulk-pin-clear" style="font-size:.85rem;font-weight:600;padding:11px 0;color:#f85149;">Borrar</button>
              <button type="button" class="button secondary pin-num-btn" data-pin-num="0" style="font-size:1.3rem;font-weight:700;padding:11px 0;">0</button>
              <button type="button" class="button secondary pin-del-btn" id="bulk-pin-del" style="font-size:1.2rem;font-weight:700;padding:11px 0;">⌫</button>
            </div>
            <div id="bulk-pin-error" style="color:#f85149;font-size:0.82rem;min-height:18px;margin-bottom:4px;text-align:center;font-weight:600;"></div>
          </div>
        </div>

        <footer class="modal-actions" style="margin-top:8px;">
          <button type="button" class="button secondary" data-modal-close>Cancelar</button>
          <button class="button primary" type="submit" id="bulk-pay-submit"><i data-lucide="key-round"></i> Autorizar y Cobrar</button>
        </footer>
      </form>
    </div>
  `;
}

/**
 * Modal para Ver Estado de Cuenta del Cliente Fiado e Imprimir Ticket Térmico
 */
export function renderClientStatementModal(client, settings = {}) {
  if (!client) return '';
  const cleanPhone = cleanPhoneForWa(client.phone);
  const waLines = [
    `*ESTADO DE CUENTA - LOS PANITAS*`,
    `Cliente: ${client.name}`,
    `Fecha: ${formatDate(new Date(), true)}`,
    `--------------------------------`,
    ...client.invoices.map(i => `• ${i.invoiceNumber}: ${formatMoney(i.balanceCents)} (${(i.items || []).map(it => `${it.quantity}x ${it.name}`).join(', ')})`),
    `--------------------------------`,
    `*TOTAL A PAGAR: ${formatMoney(client.totalDebtCents)}*`,
    `Agradecemos su pago en caja.`
  ];
  const waMessage = encodeURIComponent(waLines.join('\n'));

  return `
    <div class="modal-backdrop" data-modal-close>
      <article class="modal-card invoice-detail" style="max-width:540px;" data-modal-card>
        <header>
          <div>
            <span class="eyebrow">Estado de Cuenta</span>
            <h2>${escapeHtml(client.name)}</h2>
            ${client.phone ? `<span style="font-size:0.82rem;color:var(--brand-2);display:inline-flex;align-items:center;gap:4px;margin-top:2px;"><i data-lucide="phone" style="width:13px;height:13px;"></i> ${escapeHtml(client.phone)}</span>` : ''}
          </div>
          <button type="button" class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
        </header>

        <div style="padding:16px;background:rgba(255,255,255,.02);border-radius:12px;margin-top:12px;border:1px solid rgba(255,255,255,.06);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid var(--line);padding-bottom:10px;">
            <div>
              <span style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;">Cliente Fiado</span>
              <strong style="display:block;font-size:1.1rem;color:#fff;">${escapeHtml(client.name)}</strong>
              ${client.address ? `<small style="color:var(--muted);">${escapeHtml(client.address)}</small>` : ''}
            </div>
            <div style="text-align:right;">
              <span style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;">Deuda Total</span>
              <strong style="display:block;font-size:1.4rem;color:#f85149;font-weight:800;">${formatMoney(client.totalDebtCents)}</strong>
              ${client.creditLimitCents > 0 ? `<small style="color:var(--brand-2);">Límite: ${formatMoney(client.creditLimitCents)}</small>` : ''}
            </div>
          </div>

          <h4 style="margin:0 0 8px;font-size:0.85rem;color:var(--muted);text-transform:uppercase;">Detalle de Consumos Pendientes</h4>
          <div style="display:flex;flex-direction:column;gap:8px;max-height:240px;overflow-y:auto;">
            ${client.invoices.map((inv) => `
              <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 10px;background:rgba(0,0,0,.2);border-radius:6px;border:1px solid rgba(255,255,255,.04);font-size:0.85rem;">
                <div>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <strong style="color:var(--brand-2);">${escapeHtml(inv.invoiceNumber)}</strong>
                    <span style="color:var(--muted);font-size:0.75rem;">${formatDate(inv.createdAt)}</span>
                  </div>
                  <div style="color:#ccc;font-size:0.78rem;margin-top:2px;">
                    ${(inv.items || []).map(i => `${i.quantity}x ${escapeHtml(i.name)}`).join(', ')}
                  </div>
                </div>
                <strong style="color:#fff;margin-left:10px;">${formatMoney(inv.balanceCents)}</strong>
              </div>
            `).join('')}
          </div>
        </div>

        <footer class="modal-actions" style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          ${client.phone ? `
            <a
              href="https://wa.me/${escapeHtml(cleanPhone)}?text=${waMessage}"
              target="_blank"
              rel="noopener"
              class="button secondary"
              style="color:#25D366;border-color:rgba(37,211,102,.3);text-decoration:none;gap:6px;"
            >
              <i data-lucide="message-square"></i> Enviar por WhatsApp
            </a>
          ` : '<div></div>'}
          <div style="display:flex;gap:8px;">
            <button type="button" class="button secondary" data-modal-close>Cerrar</button>
            <button
              type="button"
              class="button primary"
              data-print-client-statement-btn="${escapeHtml(client.name)}"
              style="gap:6px;"
            >
              <i data-lucide="printer"></i> Imprimir en Térmica
            </button>
          </div>
        </footer>
      </article>
    </div>
  `;
}
