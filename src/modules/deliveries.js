import { escapeHtml, formatDate, formatMoney } from '../lib/format.js';
import { getPendingDeliveryInvoices } from '../domain/billing.js';
import { matchesFuzzy } from '../lib/fuzzy-search.js';
import { inBusinessPeriod } from '../lib/business-time.js';

export function cleanPhoneForWa(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return '1' + digits;
  return digits;
}

export function getDeliverySettlementDate(invoice, payments = []) {
  if (invoice.deliverySettledAt) return invoice.deliverySettledAt;
  const payment = invoice.lastPaymentId && payments.find(p => p.id === invoice.lastPaymentId && p.invoiceId === invoice.id);
  // Initial fully paid deliveries have no later settlement event.
  return payment?.createdAt || invoice.createdAt;
}

export function renderDeliveries(state) {
  const drivers = state.deliveryDrivers || [];
  const activeTab = state.deliveriesTab || 'active'; // 'active' | 'settled' | 'drivers'
  const viewMode = state.deliveriesViewMode || 'drivers'; // 'drivers' | 'orders'
  const driverFilter = state.deliveriesDriverFilter || 'all'; // 'all' | 'unassigned' | driverId / driverName
  const searchQuery = String(state.deliveriesSearch || '').trim();
  const sortOption = state.deliveriesSort || 'time_asc'; // 'time_asc' | 'time_desc' | 'amount_desc' | 'amount_asc' | 'client_asc'

  // 1. Enriquecer todas las facturas de delivery pendientes
  const allPendingInvoices = getPendingDeliveryInvoices(state.invoices).map((inv) => {
    const balanceCents = Number(inv.totalCents || 0) - Number(inv.paidCents || 0);
    const invDate = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt || 0);
    const ageMinutes = Math.max(0, Math.floor((Date.now() - invDate.getTime()) / (1000 * 60)));
    const isDelayed = ageMinutes >= 30;
    const isUnassigned = !inv.deliveryDriverId && !inv.deliveryDriverName;
    const itemsText = (inv.items || []).map(i => `${i.quantity}x ${i.name}`).join(' ');
    const searchBlob = `${inv.invoiceNumber} ${inv.clientName} ${inv.deliveryPhone || inv.clientPhone || ''} ${inv.deliveryAddress || ''} ${inv.deliveryNotes || ''} ${inv.deliveryDriverName || ''} ${itemsText}`.toLowerCase();
    return {
      ...inv,
      balanceCents,
      invDate,
      ageMinutes,
      isDelayed,
      isUnassigned,
      searchBlob
    };
  });

  // 2. Facturas de delivery liquidadas hoy
  const settledTodayInvoices = (state.invoices || []).filter((inv) => {
    const isDelivery = Boolean(
      inv.deliveryDriverId ||
      inv.deliveryDriverName ||
      inv.paymentMethod === 'delivery_cod' ||
      inv.deliveryStatus === 'settled' ||
      inv.deliveryAddress
    );
    if (!isDelivery) return false;
    if (inv.documentType && inv.documentType !== 'invoice') return false;
    if (inv.status === 'cancelled') return false;
    const balance = Number(inv.totalCents || 0) - Number(inv.paidCents || 0);
    if (balance > 0) return false;
    return inBusinessPeriod(getDeliverySettlementDate(inv, state.payments), 'day');
  }).sort((a, b) => {
    const dateA = getDeliverySettlementDate(a, state.payments);
    const dateB = getDeliverySettlementDate(b, state.payments);
    const da = dateA?.toDate ? dateA.toDate() : new Date(dateA || 0);
    const db = dateB?.toDate ? dateB.toDate() : new Date(dateB || 0);
    return db - da;
  });

  const settledTodayCents = settledTodayInvoices.reduce((sum, inv) => sum + Number(inv.totalCents || 0), 0);

  // 3. Totales globales
  const totalPendingCents = allPendingInvoices.reduce((sum, inv) => sum + inv.balanceCents, 0);
  const unassignedCount = allPendingInvoices.filter(i => i.isUnassigned).length;

  // 4. Agrupar entregas por repartidor
  const driverGroupsMap = new Map();
  for (const inv of allPendingInvoices) {
    const key = inv.isUnassigned ? '__unassigned__' : (inv.deliveryDriverId || inv.deliveryDriverName);
    if (!driverGroupsMap.has(key)) {
      const regDriver = drivers.find(d =>
        (inv.deliveryDriverId && d.id === inv.deliveryDriverId) ||
        (d.name && d.name.toLowerCase() === String(inv.deliveryDriverName || '').toLowerCase())
      );
      driverGroupsMap.set(key, {
        id: inv.isUnassigned ? '__unassigned__' : (inv.deliveryDriverId || regDriver?.id || key),
        name: inv.isUnassigned ? 'Sin Repartidor Asignado' : (inv.deliveryDriverName || regDriver?.name || 'Mensajero'),
        phone: regDriver?.phone || (inv.isUnassigned ? '' : (inv.deliveryPhone || '')) || '',
        vehicle: regDriver?.vehicle || '',
        isUnassigned: inv.isUnassigned,
        invoices: [],
        totalToCollectCents: 0
      });
    }
    const group = driverGroupsMap.get(key);
    group.invoices.push(inv);
    group.totalToCollectCents += inv.balanceCents;
  }

  const activeDriversList = Array.from(driverGroupsMap.values()).filter(d => !d.isUnassigned);

  // 5. Filtrar facturas individuales para el modo activo
  let filteredInvoices = allPendingInvoices.filter((inv) => {
    if (driverFilter === 'unassigned' && !inv.isUnassigned) return false;
    if (driverFilter !== 'all' && driverFilter !== 'unassigned') {
      const matchesId = inv.deliveryDriverId === driverFilter;
      const matchesName = String(inv.deliveryDriverName || '').toLowerCase() === driverFilter.toLowerCase();
      if (!matchesId && !matchesName) return false;
    }
    if (searchQuery && !matchesFuzzy(searchQuery, inv.searchBlob)) {
      return false;
    }
    return true;
  });

  filteredInvoices.sort((a, b) => {
    if (sortOption === 'time_desc') return b.invDate - a.invDate;
    if (sortOption === 'time_asc') return a.invDate - b.invDate;
    if (sortOption === 'amount_desc') return b.balanceCents - a.balanceCents;
    if (sortOption === 'amount_asc') return a.balanceCents - b.balanceCents;
    if (sortOption === 'client_asc') return String(a.clientName || '').localeCompare(String(b.clientName || ''), 'es', { sensitivity: 'base' });
    return a.invDate - b.invDate;
  });

  // 6. Filtrar grupos de repartidores para la vista agrupada
  const filteredDriverGroups = [];
  for (const group of driverGroupsMap.values()) {
    if (driverFilter === 'unassigned' && !group.isUnassigned) continue;
    if (driverFilter !== 'all' && driverFilter !== 'unassigned') {
      const matchesId = group.id === driverFilter;
      const matchesName = group.name.toLowerCase() === driverFilter.toLowerCase();
      if (!matchesId && !matchesName) continue;
    }

    const matchingInvoices = group.invoices.filter((inv) => {
      if (searchQuery && !matchesFuzzy(searchQuery, inv.searchBlob)) return false;
      return true;
    }).sort((a, b) => {
      if (sortOption === 'time_desc') return b.invDate - a.invDate;
      if (sortOption === 'time_asc') return a.invDate - b.invDate;
      if (sortOption === 'amount_desc') return b.balanceCents - a.balanceCents;
      if (sortOption === 'amount_asc') return a.balanceCents - b.balanceCents;
      if (sortOption === 'client_asc') return String(a.clientName || '').localeCompare(String(b.clientName || ''), 'es', { sensitivity: 'base' });
      return a.invDate - b.invDate;
    });

    if (matchingInvoices.length > 0) {
      filteredDriverGroups.push({
        ...group,
        invoices: matchingInvoices,
        totalToCollectCents: matchingInvoices.reduce((s, i) => s + i.balanceCents, 0)
      });
    }
  }

  filteredDriverGroups.sort((a, b) => {
    if (a.isUnassigned) return -1;
    if (b.isUnassigned) return 1;
    return b.totalToCollectCents - a.totalToCollectCents;
  });

  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Logística y Reparto</span>
        <h2>Control y Liquidación de Deliveries</h2>
        <p>Seguimiento detallado de pedidos en camino, platos solicitados y cuadre de efectivo por repartidor.</p>
      </div>
      <div class="header-actions" style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="button secondary" data-driver-new><i data-lucide="user-plus"></i> Registrar Repartidor</button>
        <button class="button primary" data-route="pos"><i data-lucide="plus"></i> Nuevo Delivery en POS</button>
      </div>
    </section>

    <!-- Métricas en Cabecera -->
    <div class="metric-grid">
      <article class="metric-card warning">
        <i data-lucide="bike"></i>
        <div>
          <span>Dinero en la Calle (Por Liquidar)</span>
          <strong>${formatMoney(totalPendingCents)}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">${allPendingInvoices.length} entrega(s) en camino</small>
        </div>
      </article>
      <article class="metric-card">
        <i data-lucide="users"></i>
        <div>
          <span>Repartidores en Ruta</span>
          <strong>${activeDriversList.length}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">${drivers.length} repartidor(es) registrados</small>
        </div>
      </article>
      <article class="metric-card ${unassignedCount > 0 ? 'danger' : ''}">
        <i data-lucide="alert-triangle"></i>
        <div>
          <span>Sin Asignar</span>
          <strong style="color:${unassignedCount > 0 ? '#f85149' : '#fff'};">${unassignedCount}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">${unassignedCount > 0 ? '¡Requiere asignación!' : 'Todos con chofer'}</small>
        </div>
      </article>
      <article class="metric-card positive">
        <i data-lucide="badge-check"></i>
        <div>
          <span>Liquidados Hoy</span>
          <strong>${formatMoney(settledTodayCents)}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">${settledTodayInvoices.length} entrega(s) completadas</small>
        </div>
      </article>
    </div>

    <!-- Pestañas de Navegación -->
    <div class="deliveries-tabs">
      <button
        type="button"
        class="button ${activeTab === 'active' ? 'primary' : 'secondary'} compact"
        data-deliveries-tab="active"
        style="font-size:0.88rem;gap:6px;"
      >
        <i data-lucide="bike"></i> En Camino / Por Liquidar (${allPendingInvoices.length})
      </button>
      <button
        type="button"
        class="button ${activeTab === 'settled' ? 'primary' : 'secondary'} compact"
        data-deliveries-tab="settled"
        style="font-size:0.88rem;gap:6px;"
      >
        <i data-lucide="badge-check"></i> Liquidadas Hoy (${settledTodayInvoices.length})
      </button>
      <button
        type="button"
        class="button ${activeTab === 'drivers' ? 'primary' : 'secondary'} compact"
        data-deliveries-tab="drivers"
        style="font-size:0.88rem;gap:6px;"
      >
        <i data-lucide="users"></i> Directorio de Repartidores (${drivers.length})
      </button>
    </div>

    ${activeTab === 'active' ? renderActiveDeliveriesTab({
      filteredDriverGroups,
      filteredInvoices,
      allPendingCount: allPendingInvoices.length,
      activeDriversList,
      unassignedCount,
      driverFilter,
      viewMode,
      searchQuery,
      sortOption,
      expandedDrivers: state.deliveriesExpandedDrivers || {},
      allExpanded: state.deliveriesAllExpanded
    }) : activeTab === 'settled' ? renderSettledDeliveriesTab(settledTodayInvoices, settledTodayCents) : renderDriversDirectoryTab(drivers)}
  `;
}

function renderDriverSummaryDeck({ activeDriversList, unassignedCount, driverFilter, allPendingCount }) {
  if (activeDriversList.length + (unassignedCount > 0 ? 1 : 0) < 2) {
    return '';
  }

  return `
    <div class="driver-summary-deck">
      ${unassignedCount > 0 ? `
        <button
          type="button"
          class="driver-deck-tile warning ${driverFilter === 'unassigned' ? 'active' : ''}"
          data-deliveries-driver-filter="unassigned"
          title="Filtrar pedidos sin repartidor asignado"
        >
          <div class="driver-deck-icon">
            <i data-lucide="alert-triangle" style="width:20px;height:20px;"></i>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
              <strong style="font-size:0.92rem;color:#f85149;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Sin Asignar</strong>
              <span style="font-size:0.75rem;padding:1px 6px;border-radius:10px;background:rgba(239,68,68,.25);color:#f85149;font-weight:700;">${unassignedCount}</span>
            </div>
            <span style="font-size:0.75rem;color:var(--muted);display:block;margin-top:2px;">Por despachar</span>
          </div>
        </button>
      ` : ''}
      ${activeDriversList.map((d) => {
        const isActive = driverFilter === d.id || driverFilter === d.name;
        return `
          <button
            type="button"
            class="driver-deck-tile ${isActive ? 'active' : ''}"
            data-deliveries-driver-filter="${escapeHtml(d.id || d.name)}"
            title="Ver sólo los pedidos de ${escapeHtml(d.name)}"
          >
            <div class="driver-deck-icon">
              <i data-lucide="bike" style="width:20px;height:20px;"></i>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                <strong style="font-size:0.92rem;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(d.name)}</strong>
                <span style="font-size:0.75rem;padding:1px 6px;border-radius:10px;background:rgba(245,158,11,.2);color:#f59e0b;font-weight:700;">${d.invoices.length}</span>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
                <span style="font-size:0.75rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px;">${escapeHtml(d.vehicle || 'En ruta')}</span>
                <strong style="font-size:0.82rem;color:#f59e0b;font-weight:700;">${formatMoney(d.totalToCollectCents)}</strong>
              </div>
            </div>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderActiveDeliveriesTab({
  filteredDriverGroups,
  filteredInvoices,
  allPendingCount,
  activeDriversList,
  unassignedCount,
  driverFilter,
  viewMode,
  searchQuery,
  sortOption,
  expandedDrivers = {},
  allExpanded = null
}) {
  const isFiltering = driverFilter !== 'all' || Boolean(searchQuery);

  return `
    <section class="surface-card data-surface" style="overflow:visible;margin-bottom:20px;">
      <!-- Barra de Búsqueda y Filtros de Repartidor -->
      <div class="deliveries-filter-bar">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <label class="search-field" style="flex:1;min-width:280px;margin:0;">
            <i data-lucide="search"></i>
            <input
              id="delivery-search"
              type="search"
              placeholder="Buscar por cliente, dirección, teléfono, factura (FAC-...) o comida (yaroa, chimi...)"
              value="${escapeHtml(searchQuery)}"
            >
          </label>
          ${isFiltering ? `
            <button type="button" class="button secondary compact" data-deliveries-clear-filters style="font-size:0.8rem;gap:5px;">
              <i data-lucide="rotate-ccw"></i> Limpiar filtros
            </button>
          ` : ''}
          <div class="deliveries-view-toggle">
            <button
              type="button"
              class="deliveries-view-btn ${viewMode === 'drivers' ? 'active' : ''}"
              data-deliveries-view="drivers"
              title="Agrupar pedidos por repartidor"
            >
              <i data-lucide="bike"></i> Por Repartidor
            </button>
            <button
              type="button"
              class="deliveries-view-btn ${viewMode === 'orders' ? 'active' : ''}"
              data-deliveries-view="orders"
              title="Ver listado cronológico de pedidos individuales"
            >
              <i data-lucide="package"></i> Lista de Pedidos (${filteredInvoices.length})
            </button>
          </div>
        </div>

        <!-- Fila de Chips de Repartidores -->
        <div class="deliveries-filter-row">
          <span style="font-size:0.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;">Repartidor:</span>
          <button
            type="button"
            class="deliveries-chip ${driverFilter === 'all' ? 'active' : ''}"
            data-deliveries-driver-filter="all"
          >
            Todos (${allPendingCount})
          </button>
          ${unassignedCount > 0 ? `
            <button
              type="button"
              class="deliveries-chip warning ${driverFilter === 'unassigned' ? 'active' : ''}"
              data-deliveries-driver-filter="unassigned"
            >
              <i data-lucide="alert-triangle" style="width:13px;height:13px;"></i> Sin Asignar (${unassignedCount})
            </button>
          ` : ''}
          ${activeDriversList.map((d) => `
            <button
              type="button"
              class="deliveries-chip ${(driverFilter === d.id || driverFilter === d.name) ? 'active' : ''}"
              data-deliveries-driver-filter="${escapeHtml(d.id || d.name)}"
            >
              <i data-lucide="bike" style="width:13px;height:13px;"></i> ${escapeHtml(d.name)} (${d.invoices.length})
            </button>
          `).join('')}

          <div style="display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap;">
            ${viewMode === 'drivers' && filteredDriverGroups.length >= 2 ? `
              <button
                type="button"
                class="button secondary compact"
                data-deliveries-toggle-all
                style="font-size:0.78rem;padding:4px 10px;gap:5px;white-space:nowrap;"
                title="${allExpanded === true ? 'Colapsar todas las listas de pedidos' : 'Expandir todas las listas de pedidos'}"
              >
                <i data-lucide="${allExpanded === true ? 'chevron-up' : 'chevron-down'}"></i>
                ${allExpanded === true ? 'Colapsar todos' : 'Expandir todos'}
              </button>
            ` : ''}
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:0.75rem;color:var(--muted);">Ordenar:</span>
              <select id="delivery-sort-select" style="font-size:0.8rem;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.3);border:1px solid var(--line);color:#fff;">
                <option value="time_asc" ${sortOption === 'time_asc' ? 'selected' : ''}>Más antiguos (urgente)</option>
                <option value="time_desc" ${sortOption === 'time_desc' ? 'selected' : ''}>Más recientes</option>
                <option value="amount_desc" ${sortOption === 'amount_desc' ? 'selected' : ''}>Mayor monto a cobrar</option>
                <option value="amount_asc" ${sortOption === 'amount_asc' ? 'selected' : ''}>Menor monto a cobrar</option>
                <option value="client_asc" ${sortOption === 'client_asc' ? 'selected' : ''}>Cliente (A - Z)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Resumen Rápido de Repartidores (Quick Driver Deck) -->
      ${viewMode === 'drivers' ? renderDriverSummaryDeck({ activeDriversList, unassignedCount, driverFilter, allPendingCount }) : ''}

      <!-- Banner de Alerta para Pedidos Sin Repartidor Asignado -->
      ${unassignedCount > 0 && driverFilter !== 'unassigned' ? `
        <div style="padding:12px 20px 0;">
          <div class="delivery-alert-banner" style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35);border-radius:12px;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <i data-lucide="alert-triangle" style="width:24px;height:24px;color:#f85149;flex-shrink:0;"></i>
              <div>
                <strong style="color:#f85149;font-size:0.95rem;display:block;">${unassignedCount} entrega(s) en camino sin repartidor asignado</strong>
                <span style="font-size:0.8rem;color:#cbd5e1;">Asigna un mensajero para que el efectivo y el despacho queden formalmente registrados.</span>
              </div>
            </div>
            <button type="button" class="button secondary compact" data-deliveries-driver-filter="unassigned" style="font-size:0.8rem;padding:6px 12px;gap:5px;border-color:rgba(239,68,68,.4);color:#f85149;">
              <i data-lucide="eye"></i> Ver entregas sin asignar
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Contenedor Principal de Entregas -->
      <div style="padding:16px;">
        ${viewMode === 'drivers' ? (
          filteredDriverGroups.length ? filteredDriverGroups.map((group) => {
            const isSingleDriver = filteredDriverGroups.length <= 1;
            let isExpanded;
            if (driverFilter !== 'all' || isSingleDriver) {
              isExpanded = true;
            } else if (allExpanded === true) {
              isExpanded = true;
            } else if (allExpanded === false) {
              isExpanded = false;
            } else {
              isExpanded = Boolean(expandedDrivers[group.id] || expandedDrivers[group.name]);
            }
            return driverCard(group, isExpanded);
          }).join('') : renderEmptyState(isFiltering)
        ) : (
          filteredInvoices.length ? `
            <div class="delivery-orders-flat-list">
              ${filteredInvoices.map((inv) => orderCard(inv, 'orders')).join('')}
            </div>
          ` : renderEmptyState(isFiltering)
        )}
      </div>
    </section>
  `;
}

function renderEmptyState(isFiltering) {
  return `
    <div class="empty-state" style="padding:48px 20px;text-align:center;">
      <i data-lucide="${isFiltering ? 'filter-x' : 'badge-check'}" style="width:48px;height:48px;color:${isFiltering ? 'var(--muted)' : '#3fb950'};margin:0 auto 12px;display:block;"></i>
      <h3>${isFiltering ? 'Sin pedidos coincidentes con los filtros' : '¡No hay entregas pendientes de liquidación!'}</h3>
      <p style="color:var(--muted);max-width:440px;margin:0 auto;">
        ${isFiltering ? 'Intenta modificar la búsqueda o el filtro de repartidor para ver más pedidos.' : 'Todos los repartidores han entregado el dinero correspondiente a la caja registradora.'}
      </p>
    </div>
  `;
}

function driverCard(driver, isExpanded = true) {
  const cleanPhone = cleanPhoneForWa(driver.phone);
  const waMessage = encodeURIComponent(`Hola ${driver.name}, un saludo de Los Panitas. ¿Cómo van las entregas en ruta?`);
  const isUnassigned = driver.isUnassigned;

  return `
    <article
      class="driver-delivery-card surface-card"
      data-delivery-card
      data-driver-id="${escapeHtml(driver.id)}"
      data-search="${escapeHtml(`${driver.name} ${driver.phone || ''} ${driver.vehicle || ''} ${driver.invoices.map(i => i.searchBlob).join(' ')}`)}"
      style="margin-bottom:16px;border:1px solid ${isUnassigned ? 'rgba(239,68,68,.35)' : 'rgba(245,158,11,.3)'};background:${isUnassigned ? 'rgba(239,68,68,.03)' : 'rgba(245,158,11,.03)'};padding:18px;border-radius:14px;"
    >
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:48px;height:48px;border-radius:12px;background:${isUnassigned ? 'rgba(239,68,68,.18)' : 'rgba(245,158,11,.18)'};color:${isUnassigned ? '#f85149' : '#f59e0b'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i data-lucide="${isUnassigned ? 'alert-triangle' : 'bike'}" style="width:26px;height:26px;"></i>
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <h3 style="margin:0;font-size:1.2rem;font-weight:700;color:#fff;">${escapeHtml(driver.name)}</h3>
              ${isUnassigned ? `
                <span style="font-size:0.75rem;padding:2px 8px;border-radius:6px;background:rgba(239,68,68,.2);color:#f85149;font-weight:700;">
                  Requiere Chofer
                </span>
              ` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;">
              ${driver.vehicle ? `<span style="font-size:0.8rem;color:var(--muted);">${escapeHtml(driver.vehicle)}</span>` : ''}
              ${driver.phone ? `
                <a href="tel:${escapeHtml(driver.phone)}" class="button secondary compact" style="padding:2px 8px;font-size:0.78rem;color:#58a6ff;border-color:rgba(88,166,255,.3);" title="Llamar al repartidor">
                  <i data-lucide="phone"></i> ${escapeHtml(driver.phone)}
                </a>
                <a href="https://wa.me/${escapeHtml(cleanPhone)}?text=${waMessage}" target="_blank" rel="noopener" class="button secondary compact" style="padding:2px 8px;font-size:0.78rem;color:#25D366;border-color:rgba(37,211,102,.3);" title="Escribir al repartidor por WhatsApp">
                  <i data-lucide="message-square"></i> WhatsApp
                </a>
              ` : (isUnassigned ? '' : '<span style="font-size:0.75rem;color:var(--muted);font-style:italic;">Sin teléfono</span>')}
              <span style="font-size:0.8rem;color:${isUnassigned ? '#f85149' : '#f59e0b'};font-weight:600;">
                · ${driver.invoices.length} entrega(s) asignadas
              </span>
            </div>
          </div>
        </div>

        <div style="text-align:right;">
          <span style="font-size:0.75rem;color:var(--muted);display:block;text-transform:uppercase;letter-spacing:.5px;">Efectivo en mano</span>
          <strong style="font-size:1.5rem;color:${isUnassigned ? '#f85149' : '#f59e0b'};font-weight:800;">${formatMoney(driver.totalToCollectCents)}</strong>
          <div style="margin-top:6px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
            <button
              type="button"
              class="button secondary"
              data-toggle-driver-card="${escapeHtml(driver.id)}"
              data-count="${driver.invoices.length}"
              style="padding:7px 12px;font-size:0.85rem;gap:5px;"
              title="${isExpanded ? 'Ocultar pedidos' : 'Ver pedidos'}"
            >
              <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}"></i>
              ${isExpanded ? 'Ocultar pedidos' : `Ver ${driver.invoices.length} pedidos`}
            </button>
            ${!isUnassigned ? `
              <button type="button" class="button primary" data-delivery-settle="${escapeHtml(driver.id || driver.name)}" style="padding:7px 16px;font-size:0.88rem;font-weight:700;">
                <i data-lucide="wallet-cards"></i> Liquidar entregas (${formatMoney(driver.totalToCollectCents)})
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Detalle de facturas asignadas -->
      <div
        class="driver-invoices-container"
        style="display:${isExpanded ? 'flex' : 'none'};flex-direction:column;gap:10px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px;margin-top:12px;"
      >
        ${driver.invoices.map(inv => orderCard(inv, 'drivers')).join('')}
      </div>
    </article>
  `;
}

function orderCard(inv, viewMode) {
  const cleanPhone = cleanPhoneForWa(inv.deliveryPhone || inv.clientPhone);
  const waMessage = encodeURIComponent(
    `Hola ${inv.clientName}, un cordial saludo de Los Panitas. Su pedido (${inv.invoiceNumber}) va en camino con el repartidor. Total a pagar: ${formatMoney(inv.balanceCents)}. ¡Buen provecho!`
  );

  return `
    <div
      class="delivery-order-card"
      data-delivery-order-item
      data-search="${escapeHtml(inv.searchBlob)}"
      style="padding:12px 14px;background:rgba(0,0,0,.25);border-radius:10px;border:1px solid rgba(255,255,255,.06);"
    >
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div style="flex:1;min-width:240px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <strong style="font-size:0.92rem;color:var(--brand-2);">${escapeHtml(inv.invoiceNumber)}</strong>
            <span style="font-size:0.78rem;color:var(--muted);">${formatDate(inv.createdAt, true)}</span>
            <span class="document-status ${inv.isDelayed ? 'status-cancelled' : 'status-partial'}" style="font-size:0.72rem;padding:2px 7px;">
              ${inv.isDelayed ? `<i data-lucide="clock-alert" style="width:12px;height:12px;"></i> Demorado (+${inv.ageMinutes}m)` : `En ruta (${inv.ageMinutes}m)`}
            </span>
            ${viewMode === 'orders' ? (
              inv.isUnassigned ? `
                <span style="font-size:0.72rem;padding:2px 7px;border-radius:4px;background:rgba(239,68,68,.2);color:#f85149;font-weight:700;display:inline-flex;align-items:center;gap:4px;">
                  <i data-lucide="alert-triangle" style="width:12px;height:12px;"></i> Sin Repartidor
                </span>
              ` : `
                <span style="font-size:0.75rem;color:#f59e0b;display:inline-flex;align-items:center;gap:4px;background:rgba(245,158,11,.1);padding:2px 7px;border-radius:6px;">
                  <i data-lucide="bike" style="width:12px;height:12px;"></i> ${escapeHtml(inv.deliveryDriverName || 'Asignado')}
                </span>
              `
            ) : ''}
          </div>

          <div style="font-size:0.95rem;color:#fff;font-weight:700;margin-top:3px;">
            ${escapeHtml(inv.clientName)}
          </div>

          ${inv.deliveryAddress ? `
            <div style="font-size:0.82rem;color:#cbd5e1;margin-top:3px;display:flex;align-items:center;gap:5px;">
              <i data-lucide="map-pin" style="width:14px;height:14px;color:#f59e0b;flex-shrink:0;"></i>
              <span>${escapeHtml(inv.deliveryAddress)}</span>
            </div>
          ` : ''}

          <div style="display:flex;align-items:center;gap:8px;margin-top:5px;flex-wrap:wrap;">
            ${(inv.deliveryPhone || inv.clientPhone) ? `
              <a href="tel:${escapeHtml(inv.deliveryPhone || inv.clientPhone)}" class="button secondary compact" style="padding:2px 8px;font-size:0.75rem;color:#58a6ff;border-color:rgba(88,166,255,.3);" title="Llamar al cliente">
                <i data-lucide="phone"></i> ${escapeHtml(inv.deliveryPhone || inv.clientPhone)}
              </a>
              <a href="https://wa.me/${escapeHtml(cleanPhone)}?text=${waMessage}" target="_blank" rel="noopener" class="button secondary compact" style="padding:2px 8px;font-size:0.75rem;color:#25D366;border-color:rgba(37,211,102,.3);" title="Avisar al cliente por WhatsApp">
                <i data-lucide="message-square"></i> WhatsApp
              </a>
            ` : '<span style="font-size:0.72rem;color:var(--muted);font-style:italic;">Sin teléfono registrado</span>'}
          </div>
        </div>

        <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;">
          <span style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;">Por cobrar al cliente</span>
          <strong style="font-size:1.3rem;color:#f59e0b;font-weight:800;display:block;">${formatMoney(inv.balanceCents)}</strong>
          ${Number(inv.totalCents) !== Number(inv.balanceCents) ? `
            <small style="color:var(--muted);font-size:0.72rem;">Total: ${formatMoney(inv.totalCents)} (Abonado: ${formatMoney(inv.paidCents)})</small>
          ` : ''}
          <span style="font-size:0.72rem;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,.05);color:var(--muted);margin-top:2px;">
            ${inv.paymentMethod === 'delivery_cod' ? 'Efectivo contra entrega' : (inv.paymentMethod || 'Por liquidar')}
          </span>
        </div>
      </div>

      <!-- DESGLOSE DE PRODUCTOS DEL PEDIDO -->
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06);">
        <span style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;font-weight:700;display:block;margin-bottom:4px;letter-spacing:.5px;">Contenido del Pedido:</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          ${(inv.items || []).map(it => `
            <span class="delivery-item-pill">
              <strong>${it.quantity}x</strong> ${escapeHtml(it.name)}
              ${it.notes ? `<small style="color:var(--brand-2);font-style:italic;">(${escapeHtml(it.notes)})</small>` : ''}
            </span>
          `).join('')}
        </div>
        ${inv.deliveryNotes ? `
          <div style="margin-top:6px;font-size:0.78rem;color:#cbd5e1;background:rgba(255,255,255,.03);padding:4px 8px;border-radius:6px;border-left:3px solid var(--brand-2);">
            <strong>Nota de entrega:</strong> ${escapeHtml(inv.deliveryNotes)}
          </div>
        ` : ''}
      </div>

      <!-- BOTONES DE ACCIÓN -->
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap;">
        <button
          type="button"
          class="button secondary compact"
          data-delivery-invoice-view="${escapeHtml(inv.id)}"
          title="Ver factura completa y comprobante"
          style="font-size:0.8rem;padding:6px 10px;gap:5px;"
        >
          <i data-lucide="eye"></i> Ver Factura
        </button>
        <button
          type="button"
          class="button secondary compact"
          data-delivery-reassign="${escapeHtml(inv.id)}"
          title="Cambiar o reasignar repartidor"
          style="font-size:0.8rem;padding:6px 10px;gap:5px;"
        >
          <i data-lucide="arrow-left-right"></i> ${inv.isUnassigned ? 'Asignar Chofer' : 'Reasignar'}
        </button>
        <button
          type="button"
          class="button primary compact"
          data-delivery-settle-single="${escapeHtml(inv.id)}"
          title="Liquidar solo esta entrega"
          style="font-size:0.8rem;padding:6px 12px;gap:5px;"
        >
          <i data-lucide="circle-dollar-sign"></i> Cobrar Entrega
        </button>
      </div>
    </div>
  `;
}

function renderSettledDeliveriesTab(settledInvoices, settledTotalCents) {
  return `
    <section class="surface-card data-surface" style="margin-bottom:20px;">
      <header style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--line);flex-wrap:wrap;gap:10px;">
        <div>
          <span class="eyebrow">Cobros de Hoy</span>
          <h3 style="margin:2px 0 0;font-size:1.1rem;">Entregas Liquidadas e Ingresadas a Caja</h3>
        </div>
        <div style="text-align:right;">
          <span style="font-size:0.75rem;color:var(--muted);display:block;">Total cobrado hoy:</span>
          <strong style="color:#3fb950;font-size:1.2rem;">${formatMoney(settledTotalCents)}</strong>
        </div>
      </header>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Documento</th>
              <th>Cliente y Dirección</th>
              <th>Productos Entregados</th>
              <th>Repartidor</th>
              <th>Cobrado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            ${settledInvoices.length ? settledInvoices.map((inv) => `
              <tr>
                <td>
                  <strong style="color:var(--brand-2);font-size:0.88rem;">${escapeHtml(inv.invoiceNumber)}</strong>
                  <small style="display:block;color:var(--muted);">${formatDate(inv.createdAt, true)}</small>
                </td>
                <td>
                  <strong>${escapeHtml(inv.clientName)}</strong>
                  ${inv.deliveryAddress ? `<small style="display:block;color:#cbd5e1;">${escapeHtml(inv.deliveryAddress)}</small>` : ''}
                </td>
                <td style="max-width:240px;">
                  <span style="font-size:0.8rem;color:#ddd;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${(inv.items || []).map(i => `${i.quantity}x ${i.name}`).join(' · ')}
                  </span>
                </td>
                <td>
                  <span style="display:inline-flex;align-items:center;gap:5px;color:#f59e0b;font-weight:600;font-size:0.85rem;">
                    <i data-lucide="bike" style="width:14px;height:14px;"></i> ${escapeHtml(inv.deliveryDriverName || 'Asignado')}
                  </span>
                </td>
                <td>
                  <strong style="color:#3fb950;font-size:0.95rem;">${formatMoney(inv.totalCents)}</strong>
                </td>
                <td>
                  <button
                    type="button"
                    class="button secondary compact"
                    data-delivery-invoice-view="${escapeHtml(inv.id)}"
                    title="Ver factura completa"
                    style="font-size:0.75rem;padding:4px 8px;gap:4px;"
                  >
                    <i data-lucide="eye"></i> Ver
                  </button>
                </td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="6" style="padding:48px 20px;text-align:center;color:var(--muted);">
                  Aún no se han liquidado entregas de delivery durante la jornada de hoy.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDriversDirectoryTab(drivers) {
  return `
    <section class="surface-card data-surface">
      <header style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--line);">
        <div>
          <span class="eyebrow">Personal de Mensajería</span>
          <h3 style="margin:2px 0 0;font-size:1.1rem;">Directorio de Repartidores Registrados</h3>
        </div>
        <button class="button secondary compact" data-driver-new><i data-lucide="plus"></i> Agregar</button>
      </header>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Repartidor</th>
              <th>Teléfono</th>
              <th>Vehículo / Nota</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${drivers.length ? drivers.map(driverRow).join('') : `
              <tr>
                <td colspan="5" style="text-align:center;padding:24px;color:var(--muted);">
                  No hay repartidores registrados todavía. Haz clic en «Registrar Repartidor» para agregar al primer mensajero.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function driverRow(driver) {
  const active = driver.active !== false;
  return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:32px;height:32px;border-radius:8px;background:rgba(245,158,11,.15);color:#f59e0b;display:flex;align-items:center;justify-content:center;font-weight:700;">
            ${escapeHtml(driver.name.charAt(0).toUpperCase())}
          </div>
          <div>
            <strong>${escapeHtml(driver.name)}</strong>
            ${driver.notes ? `<small style="display:block;color:var(--muted);font-size:0.75rem;">${escapeHtml(driver.notes)}</small>` : ''}
          </div>
        </div>
      </td>
      <td>${escapeHtml(driver.phone || '—')}</td>
      <td>${escapeHtml(driver.vehicle || '—')}</td>
      <td>
        <span class="document-status ${active ? 'status-paid' : 'status-cancelled'}">
          ${active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td>
        <button type="button" class="icon-button" data-driver-edit="${escapeHtml(driver.id)}" title="Editar repartidor">
          <i data-lucide="pencil"></i>
        </button>
      </td>
    </tr>
  `;
}

export function renderDriverFormModal(driver = {}) {
  const d = driver || {};
  const isEditing = Boolean(d.id);
  return `
    <div class="modal-backdrop" data-modal-close>
      <form id="driver-form" class="modal-card form-modal" style="max-width:440px;" data-modal-card>
        <input type="hidden" name="id" value="${escapeHtml(d.id || '')}">
        <header>
          <div>
            <span class="eyebrow">Equipo de Mensajería</span>
            <h2>${isEditing ? 'Editar Repartidor' : 'Nuevo Repartidor'}</h2>
          </div>
          <button type="button" class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
        </header>

        <div class="stack-form" style="padding-top:8px;">
          <label>Nombre o Apodo del Repartidor <strong style="color:#f85149;">*</strong>
            <input name="name" required maxlength="160" placeholder="Ej: Pedro Motor, Carlos Delivery..." value="${escapeHtml(d.name || '')}" autofocus>
          </label>

          <label>Teléfono móvil / WhatsApp (para llamadas y avisos)
            <input name="phone" type="tel" inputmode="tel" maxlength="30" placeholder="Ej: 809-555-0123" value="${escapeHtml(d.phone || '')}">
          </label>

          <label>Vehículo / Modelo / Placa (opcional)
            <input name="vehicle" maxlength="80" placeholder="Ej: Motor Honda C90 Rojo, Pasola..." value="${escapeHtml(d.vehicle || '')}">
          </label>

          <label>Notas adicionales (opcional)
            <input name="notes" maxlength="300" placeholder="Ej: Turno nocturno, zona sur..." value="${escapeHtml(d.notes || '')}">
          </label>

          <label class="check-field" style="margin-top:6px;">
            <input type="checkbox" name="active" ${d.active !== false ? 'checked' : ''}>
            <span>Repartidor activo (disponible para despachos)</span>
          </label>
        </div>

        <footer class="modal-actions" style="margin-top:16px;">
          <button type="button" class="button secondary" data-modal-close>Cancelar</button>
          <button class="button primary" type="submit"><i data-lucide="save"></i> ${isEditing ? 'Guardar Cambios' : 'Registrar Repartidor'}</button>
        </footer>
      </form>
    </div>
  `;
}

export function renderDeliverySettleModal(driver, invoices = [], activeCash = null) {
  const d = driver || {};
  const invs = invoices || [];
  if (!invs.length) return '';
  const totalCents = invs.reduce((sum, inv) => sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)), 0);

  return `
    <div class="modal-backdrop" data-modal-close>
      <form id="delivery-settle-form" class="modal-card form-modal" style="max-width:500px;" data-modal-card>
        <input type="hidden" name="driverId" value="${escapeHtml(d.id || '')}">
        <input type="hidden" name="driverName" value="${escapeHtml(d.name || 'Mensajero')}">
        <input type="hidden" name="driverPhone" value="${escapeHtml(d.phone || '')}">

        <header>
          <div>
            <span class="eyebrow">Cuadre de Efectivo</span>
            <h2>Liquidar: ${escapeHtml(d.name || 'Mensajero')}</h2>
            <span style="font-size:0.82rem;color:#f59e0b;display:block;margin-top:2px;">
              ${invs.length} entrega(s) pendiente(s) de entregar a caja
            </span>
          </div>
          <button type="button" class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
        </header>

        <div class="stack-form" style="padding-top:8px;">
          <!-- Tarjeta de Total a Entregar -->
          <div style="padding:14px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35);border-radius:12px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span style="font-size:0.75rem;color:var(--muted);display:block;text-transform:uppercase;">Efectivo a Entregar a Caja</span>
              <strong style="font-size:0.9rem;color:#fff;">${invoices.length} factura(s) seleccionada(s)</strong>
            </div>
            <div style="text-align:right;">
              <span style="font-size:0.75rem;color:var(--muted);display:block;">Total a Ingresar</span>
              <strong id="settle-total-display" style="font-size:1.4rem;color:#f59e0b;font-weight:800;">${formatMoney(totalCents)}</strong>
            </div>
          </div>

          <!-- Selección de facturas a liquidar -->
          <label style="font-size:0.82rem;font-weight:600;margin-top:4px;">Facturas a liquidar:</label>
          <div class="settle-invoices-list" style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto;border:1px solid var(--line);border-radius:10px;padding:8px;background:rgba(0,0,0,.2);">
            ${invoices.map((inv) => {
              const balance = Number(inv.totalCents || 0) - Number(inv.paidCents || 0);
              return `
                <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;margin:0;background:rgba(255,255,255,.02);">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" name="invoiceIds" value="${escapeHtml(inv.id)}" data-balance-cents="${balance}" checked style="width:16px;height:16px;accent-color:var(--brand-2);">
                    <div>
                      <strong style="font-size:0.85rem;color:var(--brand-2);">${escapeHtml(inv.invoiceNumber)}</strong>
                      <span style="font-size:0.8rem;color:#ddd;">· ${escapeHtml(inv.clientName)}</span>
                    </div>
                  </div>
                  <strong style="font-size:0.88rem;color:#fff;">${formatMoney(balance)}</strong>
                </label>
              `;
            }).join('')}
          </div>

          <!-- Forma de pago recibida -->
          <div class="form-grid two" style="margin-top:4px;">
            <label>Dinero recibido en
              <select name="method" id="settle-payment-method">
                <option value="cash" selected>Efectivo (Entra a Gaveta)</option>
                <option value="transfer">Transferencia bancaria</option>
                <option value="card">Tarjeta / Enlace de pago</option>
              </select>
            </label>
            <label>Referencia (opcional)
              <input name="reference" placeholder="No. ref, banco...">
            </label>
          </div>

          <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:#ddd;cursor:pointer;user-select:none;margin:4px 0 2px;">
            <input type="checkbox" name="printSettlement" id="settle-print-receipt" checked style="width:18px;height:18px;accent-color:var(--brand-2);cursor:pointer;">
            <i data-lucide="printer" style="width:16px;height:16px;color:var(--brand-2);"></i>
            <span>Imprimir comprobante de liquidación</span>
          </label>

          <!-- PIN Pad de Autorización del Cajero -->
          <div class="settle-pin-section" style="margin-top:6px;">
            <label style="display:block;margin-bottom:4px;font-size:0.85rem;font-weight:600;color:var(--muted);text-align:center;">
              Digita tu PIN de 6 dígitos para autorizar el ingreso a caja
            </label>
            <input id="settle-pay-pin" name="pin" type="password" inputmode="none" pattern="[0-9]{6}" maxlength="6" placeholder="" required readonly tabindex="-1" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;">
            <div class="pin-slots-container" id="settle-pin-slots">
              <span class="pin-slot" data-slot="0"></span>
              <span class="pin-slot" data-slot="1"></span>
              <span class="pin-slot" data-slot="2"></span>
              <span class="pin-slot" data-slot="3"></span>
              <span class="pin-slot" data-slot="4"></span>
              <span class="pin-slot" data-slot="5"></span>
            </div>
            <div class="pin-pad" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin:6px 0 8px;">
              ${[1,2,3,4,5,6,7,8,9].map((n) => `<button type="button" class="button secondary pin-num-btn" data-settle-pin="${n}" data-pin-num="${n}" style="font-size:1.3rem;font-weight:700;padding:11px 0;">${n}</button>`).join('')}
              <button type="button" class="button secondary pin-clear-btn" id="settle-pin-clear" style="font-size:.85rem;font-weight:600;padding:11px 0;color:#f85149;">Borrar</button>
              <button type="button" class="button secondary pin-num-btn" data-settle-pin="0" data-pin-num="0" style="font-size:1.3rem;font-weight:700;padding:11px 0;">0</button>
              <button type="button" class="button secondary pin-del-btn" id="settle-pin-del" style="font-size:1.2rem;font-weight:700;padding:11px 0;">⌫</button>
            </div>
            <div id="settle-pin-error" style="color:#f85149;font-size:0.82rem;min-height:18px;margin-bottom:4px;text-align:center;font-weight:600;"></div>
          </div>
        </div>

        <footer class="modal-actions" style="margin-top:6px;">
          <button type="button" class="button secondary" data-modal-close>Cancelar</button>
          <button class="button primary" type="submit" id="settle-submit-btn" style="font-weight:700;">
            <i data-lucide="key-round"></i> Autorizar e Ingresar a Caja
          </button>
        </footer>
      </form>
    </div>
  `;
}

export function renderReassignDeliveryModal(invoice, deliveryDrivers = []) {
  if (!invoice) return '';
  const currentDriverId = invoice.deliveryDriverId || '';
  const currentDriverName = invoice.deliveryDriverName || 'Sin asignar';
  const activeDrivers = (deliveryDrivers || []).filter((d) => d.active !== false);

  return `
    <div class="modal-backdrop" data-modal-close>
      <form id="reassign-delivery-form" class="modal-card form-modal" style="max-width:480px;" data-modal-card>
        <input type="hidden" name="invoiceId" value="${escapeHtml(invoice.id)}">
        <header>
          <div>
            <span class="eyebrow">Despacho Delivery · ${escapeHtml(invoice.invoiceNumber || 'Factura')}</span>
            <h2>Cambiar Repartidor</h2>
          </div>
          <button type="button" class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
        </header>

        <div class="stack-form" style="padding-top:8px;">
          <!-- Información del pedido -->
          <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px 14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-size:0.75rem;color:var(--muted);text-transform:uppercase;font-weight:700;">Cliente Receptor</span>
              <strong style="font-size:0.95rem;color:var(--brand-2);">${formatMoney(invoice.totalCents || 0)}</strong>
            </div>
            <strong style="font-size:1.05rem;color:#fff;display:block;">${escapeHtml(invoice.clientName || 'Consumidor final')}</strong>
            ${invoice.deliveryPhone || invoice.clientPhone ? `<small style="display:flex;align-items:center;gap:4px;color:var(--muted);margin-top:2px;"><i data-lucide="phone" style="width:13px;height:13px;"></i> ${escapeHtml(invoice.deliveryPhone || invoice.clientPhone)}</small>` : ''}
            ${invoice.deliveryAddress ? `<small style="display:flex;align-items:center;gap:4px;color:#cbd5e1;margin-top:4px;"><i data-lucide="map-pin" style="width:13px;height:13px;"></i> ${escapeHtml(invoice.deliveryAddress)}</small>` : ''}
          </div>

          <!-- Repartidor actual -->
          <div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;">
            <i data-lucide="bike" style="width:24px;height:24px;color:#f59e0b;flex-shrink:0;"></i>
            <div>
              <span style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:700;">Repartidor Asignado Actual:</span>
              <strong style="display:block;font-size:1.1rem;color:#f59e0b;">${escapeHtml(currentDriverName)}</strong>
            </div>
          </div>

          <!-- Selector de nuevo repartidor -->
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <label for="reassign-new-driver-select" style="font-size:0.85rem;font-weight:700;margin:0;">
                Seleccionar Nuevo Repartidor <strong style="color:#f85149;">*</strong>
              </label>
              <button type="button" class="button secondary compact" data-driver-new style="font-size:0.72rem;padding:2px 7px;height:auto;gap:3px;">
                <i data-lucide="user-plus" style="width:12px;height:12px;"></i> + Registrar
              </button>
            </div>
            <select name="newDriverId" id="reassign-new-driver-select" required style="font-size:0.92rem;width:100%;padding:10px 12px;border-radius:8px;background:rgba(0,0,0,.4);border:1px solid var(--line);color:#fff;">
              <option value="">-- Elige quién llevará este pedido --</option>
              ${activeDrivers.map((d) => {
                const isCurrent = (d.id === currentDriverId || d.name.toLowerCase() === currentDriverName.toLowerCase());
                return `<option value="${escapeHtml(d.id)}" data-name="${escapeHtml(d.name)}" ${isCurrent ? 'disabled' : ''}>${escapeHtml(d.name)}${isCurrent ? ' (Actual)' : ''}${d.phone ? ' · ' + escapeHtml(d.phone) : ''}${d.vehicle ? ' (' + escapeHtml(d.vehicle) + ')' : ''}</option>`;
              }).join('')}
            </select>
            <input type="hidden" name="newDriverName" id="reassign-new-driver-name" value="">
          </div>

          <!-- Notas opcionales -->
          <label style="font-size:0.85rem;font-weight:600;">Instrucciones / Notas de entrega
            <input name="deliveryNotes" maxlength="300" placeholder="Ej: Llamar al llegar, entregar en el segundo piso..." value="${escapeHtml(invoice.deliveryNotes || '')}">
          </label>
        </div>

        <footer class="modal-actions" style="margin-top:16px;">
          <button type="button" class="button secondary" data-modal-close>Cancelar</button>
          <button class="button primary" type="submit" style="font-weight:700;">
            <i data-lucide="arrow-left-right"></i> Confirmar Reasignación
          </button>
        </footer>
      </form>
    </div>
  `;
}
