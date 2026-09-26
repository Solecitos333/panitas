import { escapeHtml, formatMoney, formatDate } from '../lib/format.js';
import { INVENTORY_REASONS, getInventoryReason, calculateWasteCostCents } from '../domain/inventory.js';
import { businessDateKey } from '../lib/business-time.js';
import { matchesFuzzy } from '../lib/fuzzy-search.js';
import { getClientMemory, cleanPhoneForWa, formatRelativeDate, buildClientWhatsAppUrl } from '../domain/client-memory.js';
import { getProductVariants, hasProductVariants, hasProductSides, getProductSides } from '../domain/catalog.js';

export function getProductInventoryType(p) {
  if (!p) return 'prepared';
  if (p.inventoryType) return p.inventoryType;
  if (p.isPrepared) return 'prepared';

  const cat = String(p.category || '').toLowerCase();
  const name = String(p.name || '').toLowerCase();

  // Vitrina / Pre-elaborado (Empanadas, quipes, pastelitos, frituras exhibidas)
  if (
    cat.includes('empanada') || cat.includes('vitrina') || cat.includes('quipe') || cat.includes('pastelito') ||
    name.includes('empanada') || name.includes('quipe') || name.includes('pastelito')
  ) {
    return 'preprepared';
  }

  // Nevera / Bebidas / Reventa (Cervezas, refrescos, aguas, embotellados)
  if (
    cat.includes('bebida') || cat.includes('cerveza') || cat.includes('refresco') || cat.includes('trago') ||
    cat.includes('licor') || cat.includes('nevera') || cat.includes('reventa') ||
    name.includes('presidente') || name.includes('cerveza') || name.includes('coca') || name.includes('pepsi') ||
    name.includes('refresco') || name.includes('agua ') || name.includes('dasani') || name.includes('corona') ||
    name.includes('malta') || name.includes('red bull') || name.includes('soda')
  ) {
    return 'resale';
  }

  // Por defecto en restaurante/comida rápida: platos preparados al momento en cocina
  return 'prepared';
}

export function getProductStockStatus(p) {
  const invType = getProductInventoryType(p);
  const stock = Number(p?.stock || 0);
  const minStock = Number(p?.minStock ?? 5);

  if (invType === 'prepared') {
    return {
      type: 'prepared',
      text: 'Cocina · Hecho al ordenar (Venta continua)',
      shortText: 'Cocina',
      color: '#10b981',
      isLow: false,
      isOut: false,
      badgeHtml: `<span class="badge-inventory-prepared"><i data-lucide="chef-hat" style="width:12px;height:12px;"></i> Cocina / Al Momento</span>`
    };
  }

  const isVitrina = invType === 'preprepared';
  const isOut = stock <= 0;
  const isLow = stock > 0 && stock <= minStock;
  const color = isOut ? '#f43f5e' : (isLow ? '#f59e0b' : '#10b981');
  const typeBadge = isVitrina
    ? `<span class="badge-inventory-preprepared"><i data-lucide="sandwich" style="width:12px;height:12px;"></i> Vitrina</span>`
    : `<span class="badge-inventory-resale"><i data-lucide="beer" style="width:12px;height:12px;"></i> Nevera / Bebidas</span>`;

  let text;
  let shortText;
  if (isVitrina) {
    text = isOut ? 'Vitrina vacía (0 uds)' : (isLow ? `¡Últimas ${stock} en vitrina!` : `${stock} uds en vitrina`);
    shortText = `${stock} vitrina`;
  } else {
    text = isOut ? 'Agotado (0 en nevera)' : (isLow ? `Bajo stock (${stock} de mín. ${minStock})` : `${stock} disponibles`);
    shortText = `${stock} uds`;
  }

  return {
    type: invType,
    text,
    shortText,
    color,
    isLow,
    isOut,
    badgeHtml: typeBadge
  };
}

export function renderProducts(state) {
  const products = state.products || [];
  const totalProducts = products.length;

  const categoryFilter = state.productsCategoryFilter || 'all';
  const typeFilter = state.productsTypeFilter || 'all';
  const searchQuery = String(state.productsSearch || '').trim();
  const sortOption = state.productsSort || 'name_asc';
  const viewMode = state.productsViewMode || 'grid'; // 'grid' | 'table'

  // Métricas
  const classified = products.map(p => ({
    product: p,
    invType: getProductInventoryType(p),
    stockStatus: getProductStockStatus(p)
  }));

  const preparedCount = classified.filter(c => c.invType === 'prepared').length;
  const prepreparedCount = classified.filter(c => c.invType === 'preprepared').length;
  const resaleCount = classified.filter(c => c.invType === 'resale').length;
  const lowStockCount = classified.filter(c => c.stockStatus.isLow || c.stockStatus.isOut).length;
  const inactiveCount = products.filter(p => p.active === false).length;

  const totalValuation = products.reduce((sum, p) => {
    if (p.isPrepared) return sum;
    return sum + (Number(p.costCents || p.priceCents || 0) * Number(p.stock || 0));
  }, 0);

  const today = businessDateKey(new Date());
  const movements = state.inventoryMovements || [];
  const todayMovements = movements.filter((m) => {
    const d = m.createdAt?.toDate ? m.createdAt.toDate() : new Date(m.createdAt || 0);
    return businessDateKey(d) === today;
  });
  const todayWaste = todayMovements.filter((m) => m.isWaste || m.operation === 'waste');
  const todayWasteUnits = todayWaste.reduce((sum, m) => sum + Number(m.quantity || 0), 0);
  const todayWasteCostCents = todayWaste.reduce((sum, m) => sum + Number(m.wasteCostCents || 0), 0);
  const activeTab = state.productsTab || 'catalog';

  // Categorías únicas
  const allCategories = Array.from(new Set(
    products.map(p => String(p.category || 'General').trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  // Filtrado
  const isFiltering = categoryFilter !== 'all' || typeFilter !== 'all' || Boolean(searchQuery);

  let filteredProducts = products.filter((p) => {
    const invType = getProductInventoryType(p);
    const stockStatus = getProductStockStatus(p);

    if (categoryFilter !== 'all') {
      const pCat = String(p.category || 'General').trim().toLowerCase();
      if (pCat !== categoryFilter.toLowerCase()) return false;
    }

    if (typeFilter === 'prepared' && invType !== 'prepared') return false;
    if (typeFilter === 'preprepared' && invType !== 'preprepared') return false;
    if (typeFilter === 'resale' && invType !== 'resale') return false;
    if (typeFilter === 'low_stock' && !stockStatus.isLow && !stockStatus.isOut) return false;
    if (typeFilter === 'inactive' && p.active !== false) return false;

    if (searchQuery) {
      const searchBlob = `${p.name} ${p.sku || ''} ${p.category || ''} ${invType} ${p.isPrepared ? 'cocina al momento' : ''}`.toLowerCase();
      if (!matchesFuzzy(searchQuery, searchBlob)) return false;
    }

    return true;
  });

  filteredProducts.sort((a, b) => {
    if (sortOption === 'name_asc') {
      return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
    }
    if (sortOption === 'category_asc') {
      const c = String(a.category || '').localeCompare(String(b.category || ''), 'es', { sensitivity: 'base' });
      return c !== 0 ? c : String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
    }
    if (sortOption === 'stock_asc') {
      const sa = a.isPrepared ? 9999 : Number(a.stock || 0);
      const sb = b.isPrepared ? 9999 : Number(b.stock || 0);
      return sa - sb;
    }
    if (sortOption === 'price_desc') return Number(b.priceCents || 0) - Number(a.priceCents || 0);
    if (sortOption === 'price_asc') return Number(a.priceCents || 0) - Number(b.priceCents || 0);
    if (sortOption === 'margin_desc') {
      const ma = a.priceCents ? ((a.priceCents - (a.costCents || 0)) / a.priceCents) : 0;
      const mb = b.priceCents ? ((b.priceCents - (b.costCents || 0)) / b.priceCents) : 0;
      return mb - ma;
    }
    return 0;
  });

  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Catálogo e Inventario</span>
        <h2>Gestión de Productos y Existencias</h2>
        <p>Control ágil de platos, vitrina, bebidas de nevera, costos y existencias en tiempo real.</p>
      </div>
      <div class="header-actions" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button class="button secondary" type="button" data-end-day-waste style="border-color:#f59e0b;color:#f59e0b;font-weight:700;">
          <i data-lucide="moon"></i> Cierre de Jornada: Mermas
        </button>
        ${state.capabilities.manageCatalog ? '<button class="button primary" type="button" data-product-new><i data-lucide="plus"></i> Nuevo producto</button>' : ''}
      </div>
    </section>

    <!-- Métricas Interactivas de Inventario -->
    <div class="metric-grid" style="margin-bottom:16px;">
      <article
        class="metric-card"
        style="cursor:pointer;"
        data-products-type-filter="all"
        title="Ver todos los productos"
      >
        <i data-lucide="package"></i>
        <div>
          <span>Total Catálogo</span>
          <strong>${totalProducts}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">${allCategories.length} categoría(s)</small>
        </div>
      </article>

      <article
        class="metric-card ${lowStockCount ? 'warning' : ''}"
        style="cursor:pointer;"
        data-products-type-filter="low_stock"
        title="Filtrar por productos con bajo stock o agotados"
      >
        <i data-lucide="alert-triangle"></i>
        <div>
          <span>Bajo Stock / Agotados</span>
          <strong style="${lowStockCount ? 'color:#f59e0b;' : ''}">${lowStockCount}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">${lowStockCount > 0 ? '¡Requieren reposición!' : 'Existencias al día'}</small>
        </div>
      </article>

      <article
        class="metric-card"
        style="cursor:pointer;"
        data-products-type-filter="prepared"
        title="Filtrar por platos elaborados al momento en cocina"
      >
        <i data-lucide="chef-hat" style="color:#10b981;"></i>
        <div>
          <span>Cocina / Al Momento</span>
          <strong style="color:#10b981;">${preparedCount}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">Venta continua</small>
        </div>
      </article>

      <article class="metric-card">
        <i data-lucide="circle-dollar-sign"></i>
        <div>
          <span>Valor en Inventario</span>
          <strong style="color:var(--brand-2);">${formatMoney(totalValuation)}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">Valorado al costo</small>
        </div>
      </article>

      <article class="metric-card ${todayWasteCostCents > 0 ? 'warning' : ''}">
        <i data-lucide="trash-2"></i>
        <div>
          <span>Mermas de Hoy</span>
          <strong style="${todayWasteCostCents > 0 ? 'color:#f85149;' : 'color:var(--muted);'}">${formatMoney(todayWasteCostCents)}</strong>
          <small style="font-size:0.75rem;color:var(--muted);display:block;">${todayWasteUnits} uds descartadas</small>
        </div>
      </article>
    </div>

    <!-- Pestañas de Navegación -->
    <div class="tab-strip" style="display:flex;gap:8px;margin-bottom:16px;">
      <button type="button" class="button ${activeTab === 'catalog' ? 'primary' : 'secondary'}" data-products-tab="catalog" style="padding:8px 16px;font-size:0.88rem;font-weight:700;gap:6px;">
        <i data-lucide="package"></i> Catálogo y Existencias (${totalProducts})
      </button>
      <button type="button" class="button ${activeTab === 'history' ? 'primary' : 'secondary'}" data-products-tab="history" style="padding:8px 16px;font-size:0.88rem;font-weight:700;gap:6px;">
        <i data-lucide="history"></i> Historial de Mermas y Ajustes (${movements.length})
      </button>
    </div>

    ${activeTab === 'history' ? renderInventoryHistoryView(movements) : `
    <section class="surface-card data-surface" style="overflow:visible;">
      <!-- Barra de Filtros, Búsqueda y Modos de Vista -->
      <div class="products-toolbar">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <label class="search-field" style="flex:1;min-width:280px;margin:0;">
            <i data-lucide="search"></i>
            <input
              id="directory-search"
              type="search"
              placeholder="Buscar producto por nombre, SKU, categoría, nevera, cocina..."
              value="${escapeHtml(searchQuery)}"
            >
          </label>
          ${isFiltering ? `
            <button type="button" class="button secondary compact" data-products-clear-filters style="font-size:0.8rem;gap:5px;">
              <i data-lucide="rotate-ccw"></i> Limpiar filtros
            </button>
          ` : ''}
          <div class="deliveries-view-toggle">
            <button
              type="button"
              class="deliveries-view-btn ${viewMode === 'grid' ? 'active' : ''}"
              data-products-view="grid"
              title="Vista de cuadrícula en tarjetas táctiles"
            >
              <i data-lucide="layout-dashboard"></i> Tarjetas (${filteredProducts.length})
            </button>
            <button
              type="button"
              class="deliveries-view-btn ${viewMode === 'table' ? 'active' : ''}"
              data-products-view="table"
              title="Vista en tabla detallada"
            >
              <i data-lucide="sheet"></i> Tabla
            </button>
          </div>
        </div>

        <!-- Fila de Chips de Categorías -->
        <div class="products-chips-row">
          <span style="font-size:0.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;">Categoría:</span>
          <button
            type="button"
            class="products-chip ${categoryFilter === 'all' ? 'active' : ''}"
            data-products-category-filter="all"
          >
            Todas <span class="products-chip-badge">${totalProducts}</span>
          </button>
          ${allCategories.map(cat => {
            const count = products.filter(p => String(p.category || 'General').trim().toLowerCase() === cat.toLowerCase()).length;
            return `
              <button
                type="button"
                class="products-chip ${categoryFilter.toLowerCase() === cat.toLowerCase() ? 'active' : ''}"
                data-products-category-filter="${escapeHtml(cat)}"
              >
                ${escapeHtml(cat)} <span class="products-chip-badge">${count}</span>
              </button>
            `;
          }).join('')}
        </div>

        <!-- Fila de Chips de Tipo de Inventario y Orden -->
        <div class="products-chips-row">
          <span style="font-size:0.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;">Tipo / Estado:</span>
          <button
            type="button"
            class="products-chip ${typeFilter === 'all' ? 'active' : ''}"
            data-products-type-filter="all"
          >
            Todos
          </button>
          <button
            type="button"
            class="products-chip ${typeFilter === 'prepared' ? 'active' : ''}"
            data-products-type-filter="prepared"
          >
            <i data-lucide="chef-hat" style="width:13px;height:13px;"></i> Al Momento <span class="products-chip-badge">${preparedCount}</span>
          </button>
          <button
            type="button"
            class="products-chip ${typeFilter === 'preprepared' ? 'active' : ''}"
            data-products-type-filter="preprepared"
          >
            <i data-lucide="sandwich" style="width:13px;height:13px;"></i> Vitrina <span class="products-chip-badge">${prepreparedCount}</span>
          </button>
          <button
            type="button"
            class="products-chip ${typeFilter === 'resale' ? 'active' : ''}"
            data-products-type-filter="resale"
          >
            <i data-lucide="beer" style="width:13px;height:13px;"></i> Nevera / Bebidas <span class="products-chip-badge">${resaleCount}</span>
          </button>
          ${lowStockCount > 0 ? `
            <button
              type="button"
              class="products-chip warning ${typeFilter === 'low_stock' ? 'active' : ''}"
              data-products-type-filter="low_stock"
            >
              <i data-lucide="alert-triangle" style="width:13px;height:13px;"></i> Bajo Stock / Agotados <span class="products-chip-badge">${lowStockCount}</span>
            </button>
          ` : ''}
          ${inactiveCount > 0 ? `
            <button
              type="button"
              class="products-chip ${typeFilter === 'inactive' ? 'active' : ''}"
              data-products-type-filter="inactive"
            >
              Inactivos <span class="products-chip-badge">${inactiveCount}</span>
            </button>
          ` : ''}

          <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
            <span style="font-size:0.75rem;color:var(--muted);">Ordenar:</span>
            <select id="products-sort-select" style="font-size:0.8rem;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.3);border:1px solid var(--line);color:#fff;">
              <option value="name_asc" ${sortOption === 'name_asc' ? 'selected' : ''}>Nombre (A - Z)</option>
              <option value="category_asc" ${sortOption === 'category_asc' ? 'selected' : ''}>Categoría</option>
              <option value="stock_asc" ${sortOption === 'stock_asc' ? 'selected' : ''}>Menor Existencia (Urgentes)</option>
              <option value="price_desc" ${sortOption === 'price_desc' ? 'selected' : ''}>Mayor Precio</option>
              <option value="price_asc" ${sortOption === 'price_asc' ? 'selected' : ''}>Menor Precio</option>
              <option value="margin_desc" ${sortOption === 'margin_desc' ? 'selected' : ''}>Mayor Margen %</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Contenedor de Productos (Cuadrícula o Tabla) -->
      <div style="padding:16px;">
        ${viewMode === 'grid' ? (
          filteredProducts.length ? `
            <div class="products-grid" id="directory-cards">
              ${filteredProducts.map((item) => productCard(item, state.capabilities.manageCatalog)).join('')}
            </div>
          ` : empty('package-open', isFiltering ? 'Sin productos coincidentes' : 'Catálogo vacío', isFiltering ? 'Intenta modificar la búsqueda o los filtros seleccionados.' : 'Agrega el primer producto del restaurante.')
        ) : (
          filteredProducts.length ? `
            <div class="table-scroll directory-desktop-table">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th><th>SKU</th><th>Categoría</th><th>Tipo</th><th>Precio</th><th>Costo</th><th>Margen</th><th>Existencia</th><th>Estado</th><th></th>
                  </tr>
                </thead>
                <tbody id="directory-body">
                  ${filteredProducts.map((item) => productTableRow(item, state.capabilities.manageCatalog)).join('')}
                </tbody>
              </table>
            </div>
          ` : `<div>${empty('package-open', isFiltering ? 'Sin productos coincidentes' : 'Catálogo vacío', isFiltering ? 'Intenta modificar la búsqueda o los filtros seleccionados.' : 'Agrega el primer producto del restaurante.')}</div>`
        )}
      </div>
    </section>
    `}
  `;
}

export function renderClients(state) {
  const allClients = state.clientMemory || getClientMemory(state);
  const totalClients = allClients.length;
  const registeredCount = allClients.filter(c => c.isRegisteredClient).length;
  const memoryOnlyCount = Math.max(0, totalClients - registeredCount);

  const clientsWithDebt = allClients.filter(c => c.totalDebtCents > 0);
  const fiaoDebtorsCount = allClients.filter(c => c.fiaoDebtCents > 0).length;
  const deliveryDebtorsCount = allClients.filter(c => c.deliveryDebtCents > 0).length;

  const totalDebtCents = allClients.reduce((sum, c) => sum + c.totalDebtCents, 0);
  const totalFiaoDebtCents = allClients.reduce((sum, c) => sum + c.fiaoDebtCents, 0);
  const totalDeliveryDebtCents = allClients.reduce((sum, c) => sum + c.deliveryDebtCents, 0);

  const clientsWithPhoneCount = allClients.filter(c => c.phone && c.phone.trim()).length;
  const frequentClientsCount = allClients.filter(c => c.totalOrdersCount >= 2).length;
  const deliveryClientsCount = allClients.filter(c => c.deliveryDebtCents > 0 || c.pendingDeliveryCount > 0 || (c.address && c.address.trim())).length;

  const filter = state.clientsFilter || 'all';
  const viewMode = state.clientsViewMode || 'table';
  const sortOption = state.clientsSort || 'debt_desc';

  let filteredClients = allClients.filter(c => {
    if (filter === 'debt') return c.totalDebtCents > 0;
    if (filter === 'fiao') return c.fiaoDebtCents > 0;
    if (filter === 'delivery') return c.deliveryDebtCents > 0 || c.pendingDeliveryCount > 0 || (c.address && c.address.trim());
    if (filter === 'frequent') return c.totalOrdersCount >= 2;
    if (filter === 'registered') return c.isRegisteredClient;
    return true;
  });

  filteredClients.sort((a, b) => {
    if (sortOption === 'debt_desc') {
      return (b.totalDebtCents - a.totalDebtCents) || ((b.lastSeenDate?.getTime?.() || 0) - (a.lastSeenDate?.getTime?.() || 0));
    }
    if (sortOption === 'recent') {
      return ((b.lastSeenDate?.getTime?.() || 0) - (a.lastSeenDate?.getTime?.() || 0)) || (b.totalDebtCents - a.totalDebtCents);
    }
    if (sortOption === 'name_asc') {
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    }
    if (sortOption === 'orders_desc') {
      return (b.totalOrdersCount - a.totalOrdersCount) || (b.totalDebtCents - a.totalDebtCents);
    }
    return 0;
  });

  const settings = state.settings || {};
  const isFiltering = filter !== 'all';

  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Clientes y Crédito</span>
        <h2>Directorio de Clientes y Fiaos</h2>
        <p>Memoria activa de clientes, teléfonos, direcciones de entrega, límites de crédito y cobranzas.</p>
      </div>
      <div class="header-actions" style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="button primary" data-client-new><i data-lucide="user-plus"></i> Registrar Ficha de Cliente</button>
      </div>
    </section>

    <!-- Métricas KPI de Clientes y Deudas en la Calle -->
    <div class="metric-grid" style="margin-bottom:16px;">
      <article class="metric-card">
        <i data-lucide="users"></i>
        <div>
          <span>Cartera Total de Clientes</span>
          <strong>${totalClients}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">${registeredCount} en base · ${memoryOnlyCount} en memoria activa</small>
        </div>
      </article>
      <article class="metric-card ${clientsWithDebt.length ? 'warning' : ''}">
        <i data-lucide="book-open"></i>
        <div>
          <span>Con Balance Pendiente</span>
          <strong style="${clientsWithDebt.length ? 'color:#f85149;' : ''}">${clientsWithDebt.length}</strong>
          <small style="color:var(--muted);font-size:0.75rem;"><i data-lucide="book-open" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;"></i> ${fiaoDebtorsCount} fiao local · <i data-lucide="bike" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;"></i> ${deliveryDebtorsCount} delivery</small>
        </div>
      </article>
      <article class="metric-card">
        <i data-lucide="badge-dollar-sign"></i>
        <div>
          <span>Total en la Calle por Cobrar</span>
          <strong style="color:var(--brand-2);">${formatMoney(totalDebtCents)}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">Fiao: ${formatMoney(totalFiaoDebtCents)} · Deliv: ${formatMoney(totalDeliveryDebtCents)}</small>
        </div>
      </article>
      <article class="metric-card">
        <i data-lucide="phone-call"></i>
        <div>
          <span>Contactos Disponibles</span>
          <strong>${clientsWithPhoneCount}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">Teléfonos listos para WhatsApp o llamada</small>
        </div>
      </article>
    </div>

    <section class="surface-card data-surface">
      <div style="padding:14px 16px 10px;border-bottom:1px solid rgba(255,255,255,.07);">
        <!-- Fila Superior: Buscador y Cambiador de Vista -->
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
          <label class="search-field" style="flex:1;min-width:280px;max-width:540px;margin:0;">
            <i data-lucide="search"></i>
            <input id="directory-search" type="search" placeholder="Buscar por nombre, teléfono, dirección, RNC o notas..." value="${escapeHtml(state.clientsSearch || '')}">
          </label>

          <div style="display:flex;align-items:center;gap:8px;margin-left:auto;">
            <!-- Selector de Vista (Tabla vs Tarjetas) -->
            <div class="view-toggle" style="display:flex;background:rgba(0,0,0,.25);padding:3px;border-radius:8px;border:1px solid var(--line);">
              <button
                type="button"
                class="view-toggle-btn ${viewMode === 'table' ? 'active' : ''}"
                data-clients-view="table"
                title="Vista de Tabla Detallada"
                style="padding:5px 10px;border-radius:6px;border:none;background:${viewMode === 'table' ? 'var(--brand)' : 'transparent'};color:${viewMode === 'table' ? '#000' : 'var(--muted)'};font-size:0.78rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px;"
              >
                <i data-lucide="table" style="width:14px;height:14px;"></i> Tabla
              </button>
              <button
                type="button"
                class="view-toggle-btn ${viewMode === 'cards' ? 'active' : ''}"
                data-clients-view="cards"
                title="Vista de Tarjetas de Contacto"
                style="padding:5px 10px;border-radius:6px;border:none;background:${viewMode === 'cards' ? 'var(--brand)' : 'transparent'};color:${viewMode === 'cards' ? '#000' : 'var(--muted)'};font-size:0.78rem;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px;"
              >
                <i data-lucide="layout-grid" style="width:14px;height:14px;"></i> Tarjetas
              </button>
            </div>
          </div>
        </div>

        <!-- Fila Inferior: Chips de Filtro y Orden -->
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <button
              type="button"
              class="products-chip ${filter === 'all' ? 'active' : ''}"
              data-clients-filter="all"
            >
              Todos <span class="products-chip-badge">${totalClients}</span>
            </button>
            <button
              type="button"
              class="products-chip ${clientsWithDebt.length ? 'warning' : ''} ${filter === 'debt' ? 'active' : ''}"
              data-clients-filter="debt"
            >
              <i data-lucide="alert-circle" style="width:13px;height:13px;"></i> Con Deuda <span class="products-chip-badge">${clientsWithDebt.length}</span>
            </button>
            <button
              type="button"
              class="products-chip ${filter === 'fiao' ? 'active' : ''}"
              data-clients-filter="fiao"
            >
              <i data-lucide="book-open" style="width:13px;height:13px;"></i> Fiao Local <span class="products-chip-badge">${fiaoDebtorsCount}</span>
            </button>
            <button
              type="button"
              class="products-chip ${filter === 'delivery' ? 'active' : ''}"
              data-clients-filter="delivery"
            >
              <i data-lucide="bike" style="width:13px;height:13px;"></i> Delivery <span class="products-chip-badge">${deliveryClientsCount}</span>
            </button>
            <button
              type="button"
              class="products-chip ${filter === 'frequent' ? 'active' : ''}"
              data-clients-filter="frequent"
            >
              <i data-lucide="star" style="width:13px;height:13px;"></i> Frecuentes <span class="products-chip-badge">${frequentClientsCount}</span>
            </button>
            <button
              type="button"
              class="products-chip ${filter === 'registered' ? 'active' : ''}"
              data-clients-filter="registered"
            >
              <i data-lucide="shield-check" style="width:13px;height:13px;"></i> Registrados en Base <span class="products-chip-badge">${registeredCount}</span>
            </button>
          </div>

          <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
            <span style="font-size:0.75rem;color:var(--muted);">Ordenar:</span>
            <select id="clients-sort-select" style="font-size:0.8rem;padding:4px 8px;border-radius:6px;background:rgba(0,0,0,.3);border:1px solid var(--line);color:#fff;">
              <option value="debt_desc" ${sortOption === 'debt_desc' ? 'selected' : ''}>Mayor Deuda</option>
              <option value="recent" ${sortOption === 'recent' ? 'selected' : ''}>Más Recientes</option>
              <option value="name_asc" ${sortOption === 'name_asc' ? 'selected' : ''}>Nombre (A - Z)</option>
              <option value="orders_desc" ${sortOption === 'orders_desc' ? 'selected' : ''}>Más Pedidos</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Contenedor Principal de Clientes -->
      <div style="padding:16px;">
        ${viewMode === 'table' ? `
          <div class="table-scroll directory-desktop-table">
            <table>
              <thead>
                <tr>
                  <th>Cliente / Identidad</th>
                  <th>Teléfono y Contacto</th>
                  <th>Dirección Habitual</th>
                  <th>Deuda Activa</th>
                  <th>Historial</th>
                  <th>Límite / RNC</th>
                  <th style="text-align:right;">Acciones</th>
                </tr>
              </thead>
              <tbody id="directory-body">
                ${filteredClients.length
                  ? filteredClients.map((item) => clientRow(item, settings)).join('')
                  : `<tr><td colspan="7">${empty('users', isFiltering ? 'Sin clientes coincidentes con este filtro' : 'Sin clientes', isFiltering ? 'Prueba seleccionando otro filtro de clientes.' : 'Los clientes se registrarán automáticamente cuando hagan pedidos o fiaos.')}</td></tr>`
                }
              </tbody>
            </table>
          </div>
        ` : `
          <div class="directory-mobile-cards" id="directory-cards">
            ${filteredClients.length
              ? filteredClients.map((item) => clientMobileCard(item, settings)).join('')
              : empty('users', isFiltering ? 'Sin clientes coincidentes con este filtro' : 'Sin clientes', isFiltering ? 'Prueba seleccionando otro filtro de clientes.' : 'Los clientes se registrarán automáticamente cuando hagan pedidos o fiaos.')
            }
          </div>
        `}
      </div>
    </section>
  `;
}

export function renderProductForm(product = {}) {
  const invType = getProductInventoryType(product);
  const minStock = Number(product.minStock ?? 5);
  const priceCents = Number(product.priceCents || 0);
  const costCents = Number(product.costCents || 0);
  const margin = priceCents > 0 ? Math.round(((priceCents - costCents) / priceCents) * 100) : null;
  const profitCents = priceCents > 0 ? (priceCents - costCents) : null;

  const variants = getProductVariants(product);
  const hasVariants = Boolean(product.hasVariants);
  const hasSides = Boolean(product.hasSides);
  const sidePriceCents = Number(product.sidePriceCents || 0);

  const categories = ['Piqueos', 'Chimis', 'Yaroas', 'Pechurinas', 'Bebidas', 'Vitrina', 'Postres', 'Guarniciones', 'General'];

  return modal('product-form', product.id ? 'Editar producto e inventario' : 'Nuevo producto en inventario', `
    <input type="hidden" name="id" value="${escapeHtml(product.id || '')}">
    <input type="hidden" name="isPrepared" id="product-is-prepared-hidden" value="${invType === 'prepared' ? 'on' : 'off'}">

    <label>Nombre del producto *
      <input name="name" id="product-form-name" required maxlength="160" value="${escapeHtml(product.name || '')}" placeholder="Ej. Yaroa Mixta, Chimi Especial, Cerveza Presidente...">
    </label>

    <div class="form-grid two">
      <label>SKU o Código de barras
        <input name="sku" maxlength="80" value="${escapeHtml(product.sku || '')}" placeholder="Ej. CAR-CHI-01 o código de barras">
      </label>
      <div>
        <label>Categoría
          <input name="category" id="product-form-category" maxlength="80" value="${escapeHtml(product.category || 'General')}" placeholder="Ej. Chimis, Yaroas, Bebidas">
        </label>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">
          ${categories.map(cat => `<button type="button" class="category-suggestion-chip" data-category-suggestion="${cat}">${cat}</button>`).join('')}
        </div>
      </div>
    </div>

    <!-- Tipo de Dinámica de Inventario -->
    <div style="margin:14px 0 10px;">
      <span style="font-size:0.82rem;font-weight:700;color:var(--brand-2);display:block;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">
        Dinámica de Inventario y Existencias *
      </span>
      <div class="inventory-type-selector">
        <label class="inventory-type-card ${invType === 'prepared' ? 'selected' : ''}" data-inventory-type-card="prepared">
          <input type="radio" name="inventoryType" value="prepared" ${invType === 'prepared' ? 'checked' : ''} style="display:none;">
          <div class="inventory-card-header">
            <div style="display:flex;align-items:center;gap:6px;color:#10b981;font-weight:800;font-size:0.84rem;">
              <i data-lucide="chef-hat" style="width:16px;height:16px;flex-shrink:0;"></i>
              <span>Cocina / Al Momento</span>
            </div>
            <span class="inventory-card-radio"></span>
          </div>
          <p style="margin:0;font-size:0.74rem;color:var(--muted);line-height:1.35;">
            Para chimis, yaroas, pechurinas, jugos o café. <strong>Venta continua sin stock previo</strong>.
          </p>
        </label>

        <label class="inventory-type-card ${invType === 'preprepared' ? 'selected' : ''}" data-inventory-type-card="preprepared">
          <input type="radio" name="inventoryType" value="preprepared" ${invType === 'preprepared' ? 'checked' : ''} style="display:none;">
          <div class="inventory-card-header">
            <div style="display:flex;align-items:center;gap:6px;color:#f59e0b;font-weight:800;font-size:0.84rem;">
              <i data-lucide="sandwich" style="width:16px;height:16px;flex-shrink:0;"></i>
              <span>Vitrina / Previo</span>
            </div>
            <span class="inventory-card-radio"></span>
          </div>
          <p style="margin:0;font-size:0.74rem;color:var(--muted);line-height:1.35;">
            Para empanadas, quipes y pastelitos. Conteo de vitrina y descarte de mermas al cierre.
          </p>
        </label>

        <label class="inventory-type-card ${invType === 'resale' ? 'selected' : ''}" data-inventory-type-card="resale">
          <input type="radio" name="inventoryType" value="resale" ${invType === 'resale' ? 'checked' : ''} style="display:none;">
          <div class="inventory-card-header">
            <div style="display:flex;align-items:center;gap:6px;color:#38bdf8;font-weight:800;font-size:0.84rem;">
              <i data-lucide="beer" style="width:16px;height:16px;flex-shrink:0;"></i>
              <span>Nevera / Bebidas</span>
            </div>
            <span class="inventory-card-radio"></span>
          </div>
          <p style="margin:0;font-size:0.74rem;color:var(--muted);line-height:1.35;">
            Para cervezas, refrescos, aguas y artículos envasados. Control de existencias y aviso de stock mínimo.
          </p>
        </label>
      </div>
    </div>

    <!-- Campos de Existencias y Stock Mínimo (Condicionales según tipo) -->
    <div id="product-stock-fields-row" style="display:${invType === 'prepared' ? 'none' : 'grid'};grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:12px;">
      <label>Existencia actual (Stock)
        <input name="stock" id="product-stock-input" type="text" data-touch-numpad="decimal" data-numpad-title="Stock / Existencia" value="${product.stock ?? 0}" placeholder="0" readonly inputmode="none" style="cursor:pointer;">
        <small style="display:block;font-size:0.72rem;color:var(--muted);margin-top:2px;">Unidades físicas en vitrina o nevera/almacén.</small>
      </label>
      <label>Stock Mínimo de Alerta
        <input name="minStock" id="product-min-stock-input" type="text" data-touch-numpad="decimal" data-numpad-title="Stock Mínimo" value="${minStock}" placeholder="5" readonly inputmode="none" style="cursor:pointer;">
        <small style="display:block;font-size:0.72rem;color:var(--muted);margin-top:2px;">Avisar en amarillo cuando queden estas unidades o menos.</small>
      </label>
    </div>

    <div id="product-prepared-message-box" style="display:${invType === 'prepared' ? 'block' : 'none'};margin-bottom:12px;">
      <div style="padding:10px 14px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:10px;color:#10b981;font-size:0.82rem;display:flex;align-items:center;gap:10px;">
        <i data-lucide="check-circle" style="width:20px;height:20px;flex-shrink:0;"></i>
        <div>
          <strong style="display:block;">Venta Continua de Cocina</strong>
          <span style="font-size:0.76rem;color:#cbd5e1;">Este producto se elabora bajo pedido y no requiere conteo ni descuenta stock previo.</span>
        </div>
      </div>
    </div>

    <!-- Precios, Costos y Asistente de Rentabilidad -->
    <div style="background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <span style="font-size:0.82rem;font-weight:800;color:var(--brand-2);text-transform:uppercase;letter-spacing:0.5px;display:flex;align-items:center;gap:6px;">
          <i data-lucide="calculator" style="width:16px;height:16px;"></i> Precios, Costos y Rentabilidad
        </span>
        <span style="font-size:0.72rem;color:var(--muted);">Fija el precio manual o usa los márgenes automáticos</span>
      </div>

      <div class="form-grid three" style="margin-bottom:12px;">
        <label>Costo unitario (RD$)
          <input name="cost" id="product-form-cost" type="text" data-touch-numpad="money" data-numpad-title="Costo Unitario" value="${product.costCents != null ? (product.costCents / 100).toFixed(2) : '0.00'}" placeholder="0.00" readonly inputmode="none" style="cursor:pointer;font-weight:700;">
          <small style="display:block;font-size:0.72rem;color:var(--muted);margin-top:2px;">Lo que cuesta preparar o comprar.</small>
        </label>
        <label>Precio de venta (RD$) *
          <input name="price" id="product-form-price" type="text" data-touch-numpad="money" data-numpad-title="Precio de Venta" required value="${product.priceCents != null ? (product.priceCents / 100).toFixed(2) : ''}" placeholder="0.00" readonly inputmode="none" style="cursor:pointer;font-weight:800;font-size:1.1rem;color:var(--brand-2);">
          <small style="display:block;font-size:0.72rem;color:var(--muted);margin-top:2px;">Precio cobrado al cliente (manual o automático).</small>
        </label>
        <label>ITBIS %
          <input name="taxRate" type="text" data-touch-numpad="decimal" data-numpad-title="ITBIS %" value="${product.taxRate ?? 0}" placeholder="0" readonly inputmode="none" style="cursor:pointer;">
          <small style="display:block;font-size:0.72rem;color:var(--muted);margin-top:2px;">Impuesto aplicable (0 si exento).</small>
        </label>
      </div>

      <!-- Asistente de Margen Sugerido (Botones para Fijar Precio Automático) -->
      <div style="margin-bottom:12px;padding:10px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
          <span style="font-size:0.74rem;font-weight:700;color:#cbd5e1;display:flex;align-items:center;gap:5px;">
            <i data-lucide="sparkles" style="width:14px;height:14px;color:var(--brand-2);"></i> Calcular precio sugerido según margen deseado:
          </span>
          <small style="font-size:0.7rem;color:var(--muted);">Toca para fijar precio automático</small>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;" id="margin-presets-row">
          <button type="button" class="margin-preset-btn" data-margin-target="30" title="Margen comercial de 30%">
            +30% Margen <span class="margin-preset-price" id="preset-price-30">...</span>
          </button>
          <button type="button" class="margin-preset-btn" data-margin-target="40" title="Margen estándar de 40%">
            +40% Margen <span class="margin-preset-price" id="preset-price-40">...</span>
          </button>
          <button type="button" class="margin-preset-btn highlight" data-margin-target="50" title="Margen recomendado de 50%">
            +50% Margen <span class="margin-preset-price" id="preset-price-50">...</span>
          </button>
          <button type="button" class="margin-preset-btn" data-margin-target="60" title="Margen alto de 60%">
            +60% Margen <span class="margin-preset-price" id="preset-price-60">...</span>
          </button>
          <button type="button" class="margin-preset-btn" data-margin-target="markup_100" title="Vender al doble del costo (100% sobre el costo)">
            2x Doble Costo <span class="margin-preset-price" id="preset-price-markup100">...</span>
          </button>
        </div>
      </div>

      <!-- Previsualización de Margen en Vivo y Alertas contra Pérdida -->
      <div id="product-margin-preview" style="padding:12px 16px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div id="margin-icon-box" style="width:36px;height:36px;border-radius:8px;background:rgba(56,189,248,.12);border:1px solid rgba(56,189,248,.25);display:grid;place-items:center;color:#38bdf8;">
            <i data-lucide="trending-up" style="width:18px;height:18px;"></i>
          </div>
          <div>
            <span style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;font-weight:700;">Margen Bruto de Ganancia:</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <strong id="margin-percent-display" style="font-size:1.2rem;color:#38bdf8;">${margin != null ? margin + '%' : '—'}</strong>
              <span id="margin-health-badge" style="font-size:0.72rem;padding:2px 8px;border-radius:6px;font-weight:700;background:rgba(56,189,248,.15);color:#38bdf8;">
                ${margin != null ? (margin >= 50 ? 'Margen Excelente' : (margin >= 30 ? 'Margen Aceptable' : (margin > 0 ? 'Margen Ajustado' : 'Pérdida'))) : 'Pendiente'}
              </span>
            </div>
          </div>
        </div>

        <div style="text-align:right;">
          <span style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;font-weight:700;">Ganancia Neta por Unidad:</span>
          <strong id="margin-profit-display" style="font-size:1.2rem;color:var(--brand-2);display:block;">${profitCents != null ? formatMoney(profitCents) : 'RD$ 0.00'}</strong>
          <small id="margin-multiplier-display" style="font-size:0.72rem;color:var(--muted);">Multiplicador: —</small>
        </div>
      </div>

      <!-- Alerta visual si se vende a pérdida -->
      <div id="margin-loss-alert" style="display:none;margin-top:10px;padding:10px 14px;border-radius:8px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);color:#ef4444;font-size:0.8rem;display:flex;align-items:center;gap:8px;">
        <i data-lucide="alert-triangle" style="width:18px;height:18px;flex-shrink:0;"></i>
        <span><strong>¡Atención: Venta a Pérdida!</strong> El precio de venta es menor o igual al costo unitario.</span>
      </div>
    <!-- Variantes (Tamaños, Porciones o Gramaje) -->
    <div style="background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
        <span style="font-size:0.82rem;font-weight:800;color:var(--brand-2);text-transform:uppercase;letter-spacing:0.5px;display:flex;align-items:center;gap:6px;">
          <i data-lucide="layers" style="width:16px;height:16px;"></i> Tamaños, Porciones y Opciones
        </span>
        <span style="font-size:0.72rem;color:var(--muted);">Para vasos (7/12/16 oz), porciones (P/M/G) o carnes</span>
      </div>

      <label class="check-field" style="margin-bottom:10px;font-weight:700;">
        <input type="checkbox" name="hasVariants" id="product-has-variants-checkbox" ${hasVariants ? 'checked' : ''}>
        ¿Este producto tiene diferentes tamaños o porciones con precios variables?
      </label>

      <div id="product-variants-container" style="display:${hasVariants ? 'block' : 'none'};padding-top:8px;">
        <div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">
          <span style="font-size:0.74rem;color:#cbd5e1;display:flex;align-items:center;gap:4px;">
            <i data-lucide="sparkles" style="width:13px;height:13px;color:var(--brand-2);"></i> Plantillas rápidas de 1 toque:
          </span>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="variant-preset-btn" data-variant-preset="cups" title="Cargar vasos 7 oz, 12 oz, 16 oz">
              <i data-lucide="cup-soda" style="width:12px;height:12px;"></i> Vasos (7/12/16 oz)
            </button>
            <button type="button" class="variant-preset-btn" data-variant-preset="portions" title="Cargar Pequeño, Mediano, Grande">
              <i data-lucide="utensils" style="width:12px;height:12px;"></i> Porciones (P / M / G)
            </button>
            <button type="button" class="variant-preset-btn" data-variant-preset="meats" title="Cargar 137g, 182g, 1/2 lb">
              <i data-lucide="beef" style="width:12px;height:12px;"></i> Gramaje (Carnes)
            </button>
          </div>
        </div>

        <div id="product-variants-rows" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;">
          ${variants.map((v, i) => `
            <div class="product-variant-row" data-variant-row="${i}" style="display:grid;grid-template-columns:1fr 110px 110px 36px;gap:8px;align-items:center;background:rgba(255,255,255,.03);padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.06);">
              <label style="margin:0;">
                <span style="font-size:0.7rem;color:var(--muted);display:block;margin-bottom:2px;">Tamaño / Porción</span>
                <input type="text" name="variantName[]" value="${escapeHtml(v.name || '')}" placeholder="Ej. 12 oz, Grande..." required style="padding:6px 8px;font-size:0.85rem;">
                <input type="hidden" name="variantId[]" value="${escapeHtml(v.id || `var-${i + 1}`)}">
              </label>
              <label style="margin:0;">
                <span style="font-size:0.7rem;color:var(--muted);display:block;margin-bottom:2px;">Precio (RD$)</span>
                <input type="text" name="variantPrice[]" data-touch-numpad="money" data-numpad-title="Precio Variante" value="${v.priceCents != null ? (v.priceCents / 100).toFixed(2) : ''}" placeholder="0.00" required readonly inputmode="none" style="padding:6px 8px;font-size:0.85rem;cursor:pointer;font-weight:700;color:var(--brand-2);">
              </label>
              <label style="margin:0;">
                <span style="font-size:0.7rem;color:var(--muted);display:block;margin-bottom:2px;">Costo (RD$)</span>
                <input type="text" name="variantCost[]" data-touch-numpad="money" data-numpad-title="Costo Variante" value="${v.costCents != null ? (v.costCents / 100).toFixed(2) : '0.00'}" placeholder="0.00" readonly inputmode="none" style="padding:6px 8px;font-size:0.85rem;cursor:pointer;">
              </label>
              <button type="button" class="icon-button danger" data-remove-variant-row title="Eliminar tamaño" style="margin-top:14px;width:32px;height:32px;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
            </div>
          `).join('')}
        </div>

        <button type="button" class="button secondary compact" id="btn-add-variant-row" style="font-size:0.8rem;gap:4px;">
          <i data-lucide="plus"></i> Agregar otro tamaño o porción
        </button>
      </div>

      <!-- Acompañamiento / Guarnición -->
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08);">
        <label class="check-field" style="margin-bottom:8px;font-weight:700;">
          <input type="checkbox" name="hasSides" id="product-has-sides-checkbox" ${hasSides ? 'checked' : ''}>
          ¿Admite selección de acompañamiento o guarnición (Tostones, Papas, Moro, etc.)?
        </label>
        <div id="product-sides-container" style="display:${hasSides ? 'block' : 'none'};margin-top:8px;">
          <label style="max-width:260px;">Costo adicional por guarnición (RD$)
            <input name="sidePrice" id="product-side-price-input" type="text" data-touch-numpad="money" data-numpad-title="Costo Guarnición" value="${sidePriceCents > 0 ? (sidePriceCents / 100).toFixed(2) : '0.00'}" placeholder="0.00" readonly inputmode="none" style="cursor:pointer;font-weight:700;color:var(--brand-2);">
            <small style="display:block;font-size:0.72rem;color:var(--muted);margin-top:2px;">Coloca 0.00 si el acompañamiento ya está incluido en el precio base.</small>
          </label>
        </div>
      </div>
    </div>

    <label class="check-field" style="margin-top:6px;">
      <input name="active" type="checkbox" ${product.active === false ? '' : 'checked'}> Producto activo en venta rápida (POS y Deliveries)
    </label>
  `, product.id ? 'Guardar cambios de inventario' : 'Crear producto en inventario');
}

export function renderClientForm(client = {}) {
  return modal('client-form', client.id ? 'Editar cliente' : 'Registrar cliente para fiao / crédito', `
    <input type="hidden" name="id" value="${escapeHtml(client.id || '')}">
    <label>Nombre o apodo del cliente *
      <input name="name" required maxlength="160" value="${escapeHtml(client.name || '')}" placeholder="Ej. Pedro Mecánico, Sra. Carmen...">
    </label>
    <div class="form-grid two">
      <label>Teléfono móvil (para avisar o cobrar)
        <input name="phone" type="tel" inputmode="tel" maxlength="30" value="${escapeHtml(client.phone || '')}" placeholder="809-555-1234">
      </label>
      <label>RNC o Cédula (opcional)
        <input name="rnc" maxlength="30" value="${escapeHtml(client.rnc || '')}" placeholder="Cédula / RNC fiscal">
      </label>
    </div>
    <div class="form-grid two">
      <label>Límite sugerido de Fiao (RD$)
        <input name="creditLimit" type="text" data-touch-numpad="money" data-numpad-title="Límite de Fiao" value="${client.creditLimitCents != null ? (client.creditLimitCents / 100).toFixed(2) : ''}" placeholder="0.00" readonly inputmode="none" style="cursor:pointer;">
      </label>
      <label>Correo electrónico (opcional)
        <input name="email" type="email" maxlength="160" value="${escapeHtml(client.email || '')}" placeholder="correo@ejemplo.com">
      </label>
    </div>
    <label>Observaciones de Fiao o Referencia
      <textarea name="notes" rows="2" maxlength="500" placeholder="Ej. Vecino del taller, autorizado para fiar comida, paga los días 15 y 30.">${escapeHtml(client.notes || '')}</textarea>
    </label>
    <label>Dirección física (opcional)
      <input name="address" maxlength="300" value="${escapeHtml(client.address || '')}" placeholder="Calle, sector o referencia de ubicación">
    </label>
    <label class="check-field">
      <input name="active" type="checkbox" ${client.active === false ? '' : 'checked'}> Cliente activo para ventas y fiaos
    </label>
  `, client.id ? 'Actualizar cliente' : 'Guardar y habilitar para fiao');
}

export function productCard(item, editable) {
  const stockStatus = getProductStockStatus(item);
  const margin = item.priceCents && item.costCents ? Math.round(((item.priceCents - item.costCents) / item.priceCents) * 100) : null;
  const variants = getProductVariants(item);
  const hasVariants = hasProductVariants(item);
  const hasSides = hasProductSides(item);
  let priceDisplay = formatMoney(item.priceCents);
  if (hasVariants) {
    const minPrice = Math.min(...variants.map(v => v.priceCents));
    priceDisplay = `Desde ${formatMoney(minPrice)}`;
  }
  const searchStr = `${item.name} ${item.sku || ''} ${item.category || ''} ${stockStatus.type}`.toLowerCase();

  return `
    <article
      class="product-inventory-card surface-card"
      data-directory-row
      data-product-id="${item.id}"
      data-search="${escapeHtml(searchStr)}"
    >
      <div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:8px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="font-size:0.72rem;padding:2px 8px;border-radius:6px;background:rgba(239,189,105,.15);color:var(--brand-2);font-weight:700;text-transform:uppercase;">
              ${escapeHtml(item.category || 'General')}
            </span>
            ${hasVariants ? `<span class="badge-inventory-prepared" style="color:var(--brand-2);border-color:rgba(239,189,105,.3);"><i data-lucide="layers" style="width:11px;height:11px;"></i> ${variants.length} tamaños</span>` : ''}
            ${hasSides ? `<span class="badge-inventory-prepared" style="color:#38bdf8;border-color:rgba(56,189,248,.3);"><i data-lucide="utensils" style="width:11px;height:11px;"></i> Guarnición</span>` : ''}
            ${stockStatus.badgeHtml}
          </div>
          <span class="document-status ${item.active === false ? 'status-cancelled' : 'status-paid'}" style="flex-shrink:0;">
            ${item.active === false ? 'Inactivo' : 'Activo'}
          </span>
        </div>

        <div style="margin-bottom:12px;">
          <h3
            style="margin:4px 0 2px;font-size:1.1rem;font-weight:800;color:#fff;line-height:1.3;${editable ? 'cursor:pointer;' : ''}"
            ${editable ? `data-product-edit="${item.id}" title="Editar ${escapeHtml(item.name)}"` : ''}
          >
            ${escapeHtml(item.name)}
          </h3>
          <small style="color:var(--muted);font-size:0.75rem;">SKU: ${escapeHtml(item.sku || '—')}</small>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px 12px;background:rgba(0,0,0,.3);border-radius:10px;border:1px solid rgba(255,255,255,.05);margin-bottom:12px;">
          <div>
            <span style="display:block;font-size:0.68rem;color:var(--muted);text-transform:uppercase;">Precio</span>
            <strong style="font-size:1.05rem;color:var(--brand-2);font-weight:800;">${priceDisplay}</strong>
          </div>
          <div>
            <span style="display:block;font-size:0.68rem;color:var(--muted);text-transform:uppercase;">Costo</span>
            <strong style="font-size:0.92rem;color:#cbd5e1;">${formatMoney(item.costCents || 0)}</strong>
          </div>
          <div>
            <span style="display:block;font-size:0.68rem;color:var(--muted);text-transform:uppercase;">Margen</span>
            <strong style="font-size:0.92rem;color:#38bdf8;">${margin != null ? margin + '%' : '—'}</strong>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;background:${stockStatus.color === '#10b981' ? 'rgba(16,185,129,.08)' : (stockStatus.color === '#f59e0b' ? 'rgba(245,158,11,.08)' : 'rgba(244,63,94,.08)')};border:1px solid ${stockStatus.color === '#10b981' ? 'rgba(16,185,129,.2)' : (stockStatus.color === '#f59e0b' ? 'rgba(245,158,11,.2)' : 'rgba(244,63,94,.2)')};margin-bottom:14px;font-size:0.8rem;font-weight:700;color:${stockStatus.color};">
          <span style="width:8px;height:8px;border-radius:50%;background:${stockStatus.color};display:inline-block;flex-shrink:0;"></span>
          <span style="flex:1;">${stockStatus.text}</span>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06);flex-wrap:wrap;">
        <button
          type="button"
          class="button secondary compact"
          data-stock-adjust="${item.id}"
          style="padding:6px 12px;font-size:0.8rem;border-color:rgba(239,189,105,.35);color:var(--brand-2);gap:5px;"
          title="Registrar entrada, merma o arqueo de inventario"
        >
          <i data-lucide="clipboard-pen"></i> Ajustar / Merma
        </button>
        ${editable ? `
          <button
            type="button"
            class="button secondary compact"
            data-product-edit="${item.id}"
            style="padding:6px 12px;font-size:0.8rem;gap:5px;"
            title="Editar nombre, precios, categorías y atributos"
          >
            <i data-lucide="pencil"></i> Editar
          </button>
        ` : ''}
      </div>
    </article>
  `;
}

export function productTableRow(item, editable) {
  const stockStatus = getProductStockStatus(item);
  const margin = item.priceCents && item.costCents ? Math.round(((item.priceCents - item.costCents) / item.priceCents) * 100) : null;
  const searchStr = `${item.name} ${item.sku || ''} ${item.category || ''} ${stockStatus.type}`.toLowerCase();

  return `
    <tr data-directory-row data-product-id="${item.id}" data-search="${escapeHtml(searchStr)}">
      <td>
        <strong style="${editable ? 'cursor:pointer;' : ''}" ${editable ? `data-product-edit="${item.id}" title="Editar ${escapeHtml(item.name)}"` : ''}>
          ${escapeHtml(item.name)}
        </strong>
      </td>
      <td>${escapeHtml(item.sku || '—')}</td>
      <td>
        <span style="font-size:0.75rem;padding:2px 7px;border-radius:5px;background:rgba(239,189,105,.12);color:var(--brand-2);font-weight:700;">
          ${escapeHtml(item.category || 'General')}
        </span>
      </td>
      <td>${stockStatus.badgeHtml}</td>
      <td><strong>${formatMoney(item.priceCents)}</strong></td>
      <td>${formatMoney(item.costCents || 0)}</td>
      <td style="color:#38bdf8;font-weight:700;">${margin != null ? margin + '%' : '—'}</td>
      <td>
        <span style="font-weight:700;color:${stockStatus.color};">
          ${stockStatus.shortText}
        </span>
      </td>
      <td>
        <span class="document-status ${item.active === false ? 'status-cancelled' : 'status-paid'}">
          ${item.active === false ? 'Inactivo' : 'Activo'}
        </span>
      </td>
      <td>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;">
          <button type="button" class="button secondary compact" data-stock-adjust="${item.id}" style="padding:4px 8px;font-size:0.75rem;border-color:rgba(239,189,105,.35);color:var(--brand-2);white-space:nowrap;" title="Ajustar stock o registrar merma">
            <i data-lucide="clipboard-pen"></i> Ajustar / Merma
          </button>
          ${editable ? `<button type="button" class="button secondary compact" data-product-edit="${item.id}" style="padding:4px 8px;font-size:0.75rem;white-space:nowrap;" aria-label="Editar" title="Editar producto"><i data-lucide="pencil"></i> Editar</button>` : ''}
        </div>
      </td>
    </tr>
  `;
}

export function productRow(item, editable) {
  return productTableRow(item, editable);
}

export function productMobileCard(item, editable) {
  return productCard(item, editable);
}

export function clientRow(item, settings = {}) {
  const isMap = settings instanceof Map;
  const debtCents = item.totalDebtCents != null
    ? item.totalDebtCents
    : (isMap ? (settings.get(`id:${item.id}`) || settings.get(`name:${String(item.name).trim().toLowerCase()}`) || 0) : 0);

  const phone = item.phone || '';
  const waUrl = buildClientWhatsAppUrl(item, isMap ? {} : settings);
  const cleanPhone = cleanPhoneForWa(phone);
  const searchStr = `${item.name} ${item.rnc || ''} ${phone} ${item.address || ''} ${item.notes || ''}`.toLowerCase();

  return `<tr data-directory-row data-search="${escapeHtml(searchStr)}">
    <td>
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="client-avatar" style="width:38px;height:38px;border-radius:10px;background:${debtCents > 0 ? 'rgba(248,81,73,0.18)' : 'rgba(239,189,105,0.18)'};color:${debtCents > 0 ? '#f85149' : 'var(--brand-2)'};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1rem;flex-shrink:0;">
          ${escapeHtml((item.name || '?').charAt(0).toUpperCase())}
        </div>
        <div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <strong style="font-size:0.92rem;color:#fff;">${escapeHtml(item.name)}</strong>
            ${item.isRegisteredClient
              ? '<span class="client-origin-badge registered"><i data-lucide="shield-check" style="width:11px;height:11px;"></i> Registrado</span>'
              : '<span class="client-origin-badge memory" title="Cliente activo detectado por memoria de consumos"><i data-lucide="brain" style="width:11px;height:11px;"></i> Memoria</span>'
            }
          </div>
          ${item.notes ? `<div style="font-size:0.75rem;color:var(--muted);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(item.notes)}">${escapeHtml(item.notes)}</div>` : ''}
        </div>
      </div>
    </td>
    <td>
      ${phone ? `
        <div style="display:flex;flex-direction:column;gap:4px;">
          <span style="font-weight:600;font-size:0.82rem;">${escapeHtml(phone)}</span>
          <div style="display:flex;align-items:center;gap:4px;">
            ${cleanPhone ? `
              <a href="tel:${cleanPhone}" class="button secondary compact" style="padding:2px 7px;font-size:0.72rem;height:auto;line-height:1.3;text-decoration:none;" title="Llamar a ${escapeHtml(item.name)}">
                <i data-lucide="phone" style="width:11px;height:11px;"></i> Llamar
              </a>
            ` : ''}
            ${waUrl ? `
              <a href="${waUrl}" target="_blank" rel="noopener" class="button secondary compact" style="padding:2px 7px;font-size:0.72rem;height:auto;line-height:1.3;color:#25D366;border-color:rgba(37,211,102,0.35);text-decoration:none;" title="WhatsApp a ${escapeHtml(item.name)}">
                <i data-lucide="message-square" style="width:11px;height:11px;"></i> WhatsApp
              </a>
            ` : ''}
          </div>
        </div>
      ` : '<span style="color:var(--muted);font-size:0.75rem;">Sin teléfono</span>'}
    </td>
    <td>
      ${item.address ? `
        <div style="display:flex;align-items:flex-start;gap:4px;max-width:220px;" title="${escapeHtml(item.address)}">
          <i data-lucide="map-pin" style="width:13px;height:13px;color:var(--brand-2);flex-shrink:0;margin-top:2px;"></i>
          <span style="font-size:0.76rem;line-height:1.3;color:#cbd5e1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(item.address)}</span>
        </div>
      ` : '<span style="color:var(--muted);font-size:0.75rem;">—</span>'}
    </td>
    <td>
      ${debtCents > 0 ? `
        <div>
          <strong style="color:#f85149;font-size:0.95rem;display:block;">${formatMoney(debtCents)}</strong>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:3px;">
            ${item.fiaoDebtCents > 0 ? `<span class="client-debt-badge fiao" title="Deuda fiao en local"><i data-lucide="book-open" style="width:10px;height:10px;"></i> Fiao: ${formatMoney(item.fiaoDebtCents)}</span>` : ''}
            ${item.deliveryDebtCents > 0 ? `<span class="client-debt-badge delivery" title="Deuda delivery"><i data-lucide="bike" style="width:10px;height:10px;"></i> Deliv: ${formatMoney(item.deliveryDebtCents)}</span>` : ''}
          </div>
          ${item.creditLimitCents > 0 && debtCents > item.creditLimitCents ? `
            <div style="color:#ef4444;font-size:0.7rem;font-weight:700;margin-top:2px;" title="Supera el límite de ${formatMoney(item.creditLimitCents)}">
              <i data-lucide="alert-triangle" style="width:11px;height:11px;display:inline-block;vertical-align:-1px;"></i> Límite Excedido
            </div>
          ` : ''}
        </div>
      ` : '<span class="client-paid-badge"><i data-lucide="check-circle-2" style="width:12px;height:12px;"></i> Al día</span>'}
    </td>
    <td>
      <div style="display:flex;flex-direction:column;gap:2px;">
        <span style="font-weight:700;font-size:0.8rem;color:#e2e8f0;">${item.totalOrdersCount || 0} consumo${item.totalOrdersCount === 1 ? '' : 's'}</span>
        <small style="color:var(--muted);font-size:0.72rem;">Último: ${formatRelativeDate(item.lastSeenDate)}</small>
      </div>
    </td>
    <td>
      <div style="display:flex;flex-direction:column;gap:2px;">
        <span style="font-size:0.75rem;color:${item.creditLimitCents ? 'var(--brand-2)' : 'var(--muted)'};">
          ${item.creditLimitCents ? `Límite: ${formatMoney(item.creditLimitCents)}` : 'Sin límite'}
        </span>
        <span style="font-size:0.72rem;color:var(--muted);">${item.rnc ? `RNC: ${escapeHtml(item.rnc)}` : 'Consumidor'}</span>
      </div>
    </td>
    <td>
      <div style="display:flex;align-items:center;gap:5px;justify-content:flex-end;">
        ${debtCents > 0 ? `
          <button type="button" class="button success compact" data-client-bulk-pay="${escapeHtml(item.name)}" data-client-id="${escapeHtml(item.id || '')}" style="padding:4px 8px;font-size:0.72rem;gap:4px;height:auto;line-height:1.2;" title="Abonar o saldar fiao de ${escapeHtml(item.name)}">
            <i data-lucide="badge-dollar-sign" style="width:13px;height:13px;"></i> Abonar
          </button>
        ` : ''}
        <button type="button" class="icon-button" data-client-statement="${escapeHtml(item.name)}" data-client-id="${escapeHtml(item.id || '')}" title="Ver Estado de Cuenta e historial de facturas">
          <i data-lucide="file-text" style="width:15px;height:15px;"></i>
        </button>
        <button type="button" class="icon-button" data-client-to-pos="${escapeHtml(item.name)}" data-client-id="${escapeHtml(item.id || '')}" title="Crear nueva comanda/factura en POS para este cliente">
          <i data-lucide="shopping-cart" style="width:15px;height:15px;"></i>
        </button>
        <button type="button" class="icon-button" data-client-edit="${escapeHtml(item.id || '')}" data-client-name="${escapeHtml(item.name)}" data-client-phone="${escapeHtml(item.phone || '')}" data-client-address="${escapeHtml(item.address || '')}" data-client-rnc="${escapeHtml(item.rnc || '')}" data-client-notes="${escapeHtml(item.notes || '')}" data-client-credit-limit="${item.creditLimitCents || 0}" title="${item.isRegisteredClient ? 'Editar datos del cliente' : 'Guardar y formalizar ficha del cliente'}">
          <i data-lucide="pencil" style="width:15px;height:15px;"></i>
        </button>
      </div>
    </td>
  </tr>`;
}

export function clientMobileCard(item, settings = {}) {
  const isMap = settings instanceof Map;
  const debtCents = item.totalDebtCents != null
    ? item.totalDebtCents
    : (isMap ? (settings.get(`id:${item.id}`) || settings.get(`name:${String(item.name).trim().toLowerCase()}`) || 0) : 0);

  const phone = item.phone || '';
  const waUrl = buildClientWhatsAppUrl(item, isMap ? {} : settings);
  const cleanPhone = cleanPhoneForWa(phone);
  const searchStr = `${item.name} ${item.rnc || ''} ${phone} ${item.address || ''} ${item.notes || ''}`.toLowerCase();

  return `
    <article class="mobile-dir-card surface-card" data-directory-row data-search="${escapeHtml(searchStr)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:44px;height:44px;border-radius:12px;background:${debtCents > 0 ? 'rgba(248,81,73,0.18)' : 'rgba(239,189,105,0.18)'};color:${debtCents > 0 ? '#f85149' : 'var(--brand-2)'};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.2rem;flex-shrink:0;">
            ${escapeHtml((item.name || '?').charAt(0).toUpperCase())}
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <h3 style="margin:0;font-size:1.05rem;font-weight:800;color:#fff;line-height:1.2;">
                ${escapeHtml(item.name)}
              </h3>
              ${item.isRegisteredClient
                ? '<span class="client-origin-badge registered"><i data-lucide="shield-check" style="width:10px;height:10px;"></i> Registrado</span>'
                : '<span class="client-origin-badge memory" title="Cliente activo detectado por memoria de consumos"><i data-lucide="brain" style="width:10px;height:10px;"></i> Memoria</span>'
              }
            </div>
            <span style="font-size:0.75rem;color:var(--muted);">
              ${item.rnc ? `RNC/Céd: ${escapeHtml(item.rnc)}` : 'Consumidor'} · ${item.totalOrdersCount || 0} consumo${item.totalOrdersCount === 1 ? '' : 's'} (${formatRelativeDate(item.lastSeenDate)})
            </span>
          </div>
        </div>
        <span class="document-status ${item.active === false ? 'status-cancelled' : 'status-paid'}" style="flex-shrink:0;font-size:0.7rem;padding:2px 7px;">
          ${item.active === false ? 'Inactivo' : 'Activo'}
        </span>
      </div>

      <!-- Deuda y Crédito -->
      ${debtCents > 0 ? `
        <div style="padding:10px 12px;background:rgba(248,81,73,0.12);border:1px solid rgba(248,81,73,0.35);border-radius:10px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:0.8rem;font-weight:700;color:#f85149;display:flex;align-items:center;gap:6px;">
              <i data-lucide="alert-circle" style="width:15px;height:15px;"></i> Balance Pendiente Total:
            </span>
            <strong style="font-size:1.1rem;font-weight:900;color:#f85149;">${formatMoney(debtCents)}</strong>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:0.74rem;">
            ${item.fiaoDebtCents > 0 ? `<span class="client-debt-badge fiao"><i data-lucide="book-open" style="width:11px;height:11px;"></i> Fiao Local: ${formatMoney(item.fiaoDebtCents)}</span>` : ''}
            ${item.deliveryDebtCents > 0 ? `<span class="client-debt-badge delivery"><i data-lucide="bike" style="width:11px;height:11px;"></i> Delivery: ${formatMoney(item.deliveryDebtCents)}</span>` : ''}
          </div>
          ${item.creditLimitCents > 0 && debtCents > item.creditLimitCents ? `
            <div style="margin-top:6px;font-size:0.74rem;color:#ef4444;font-weight:800;display:flex;align-items:center;gap:4px;">
              <i data-lucide="alert-triangle" style="width:13px;height:13px;"></i> Supera el límite de crédito fijado (${formatMoney(item.creditLimitCents)})
            </div>
          ` : ''}
        </div>
      ` : `
        <div style="padding:6px 10px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;font-size:0.75rem;color:#10b981;">
          <span style="display:flex;align-items:center;gap:6px;"><i data-lucide="check" style="width:13px;height:13px;"></i> Al día · Sin fiaos pendientes</span>
          ${item.creditLimitCents ? `<span style="color:var(--brand-2);font-weight:700;">Límite: ${formatMoney(item.creditLimitCents)}</span>` : ''}
        </div>
      `}

      <!-- Dirección y Notas -->
      ${item.address ? `
        <div style="font-size:0.76rem;color:#cbd5e1;background:rgba(0,0,0,0.2);padding:6px 10px;border-radius:8px;margin-bottom:8px;display:flex;align-items:flex-start;gap:6px;">
          <i data-lucide="map-pin" style="width:13px;height:13px;color:var(--brand-2);flex-shrink:0;margin-top:2px;"></i>
          <span><strong>Dirección:</strong> ${escapeHtml(item.address)}</span>
        </div>
      ` : ''}

      ${item.notes ? `
        <div style="font-size:0.74rem;color:#cbd5e1;background:rgba(0,0,0,0.15);padding:5px 10px;border-radius:8px;margin-bottom:8px;border-left:3px solid var(--brand-2);">
          <strong style="color:var(--brand-2);">Nota / Referencia:</strong> ${escapeHtml(item.notes)}
        </div>
      ` : ''}

      <!-- Acciones y Contactos -->
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);flex-wrap:wrap;">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          ${cleanPhone ? `
            <a href="tel:${cleanPhone}" class="button secondary compact" style="padding:5px 9px;font-size:0.75rem;text-decoration:none;" title="Llamar a ${escapeHtml(item.name)}">
              <i data-lucide="phone"></i> Llamar
            </a>
          ` : ''}
          ${waUrl ? `
            <a href="${waUrl}" target="_blank" rel="noopener" class="button secondary compact" style="padding:5px 9px;font-size:0.75rem;color:#25D366;border-color:rgba(37,211,102,0.3);text-decoration:none;" title="WhatsApp">
              <i data-lucide="message-square"></i> WhatsApp
            </a>
          ` : ''}
          ${!cleanPhone && !waUrl ? '<span style="font-size:0.72rem;color:var(--muted);">Sin teléfono</span>' : ''}
        </div>

        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:auto;">
          ${debtCents > 0 ? `
            <button type="button" class="button success compact" data-client-bulk-pay="${escapeHtml(item.name)}" data-client-id="${escapeHtml(item.id || '')}" style="padding:5px 10px;font-size:0.75rem;" title="Abonar a fiao">
              <i data-lucide="dollar-sign"></i> Abonar
            </button>
          ` : ''}
          <button type="button" class="button secondary compact" data-client-statement="${escapeHtml(item.name)}" data-client-id="${escapeHtml(item.id || '')}" style="padding:5px 9px;font-size:0.75rem;" title="Ver Estado de Cuenta">
            <i data-lucide="file-text"></i> Cuenta
          </button>
          <button type="button" class="button secondary compact" data-client-to-pos="${escapeHtml(item.name)}" style="padding:5px 9px;font-size:0.75rem;" title="Facturar en POS">
            <i data-lucide="shopping-cart"></i> POS
          </button>
          <button type="button" class="button secondary compact" data-client-edit="${escapeHtml(item.id || '')}" data-client-name="${escapeHtml(item.name)}" data-client-phone="${escapeHtml(item.phone || '')}" data-client-address="${escapeHtml(item.address || '')}" data-client-rnc="${escapeHtml(item.rnc || '')}" data-client-notes="${escapeHtml(item.notes || '')}" data-client-credit-limit="${item.creditLimitCents || 0}" style="padding:5px 9px;font-size:0.75rem;" title="${item.isRegisteredClient ? 'Editar' : 'Formalizar'}">
            <i data-lucide="pencil"></i> ${item.isRegisteredClient ? 'Editar' : 'Ficha'}
          </button>
        </div>
      </div>
    </article>
  `;
}

function modal(formId,title,contents,submitLabel) { return `<div class="modal-backdrop" data-modal-close><form id="${formId}" class="modal-card form-modal" data-modal-card><header><div><span class="eyebrow">Directorio</span><h2>${title}</h2></div><button class="icon-button" type="button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button></header><div class="stack-form">${contents}</div><footer class="modal-actions"><button class="button secondary" type="button" data-modal-close>Cancelar</button><button class="button primary" type="submit">${submitLabel}</button></footer></form></div>`; }
function empty(icon,title,copy) { return `<div class="empty-state"><i data-lucide="${icon}"></i><strong>${title}</strong><p>${copy}</p></div>`; }

export function renderInventoryHistoryView(movements = []) {
  const sorted = [...movements].sort((a, b) => {
    const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
    const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
    return db - da;
  });

  return `
    <section class="surface-card data-surface">
      <div class="toolbar" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <label class="search-field" style="flex:1;max-width:420px;">
          <i data-lucide="search"></i>
          <input id="directory-search" type="search" placeholder="Buscar por producto, motivo o usuario...">
        </label>
        <span style="font-size:0.85rem;color:var(--muted);">${sorted.length} movimiento(s) registrado(s)</span>
      </div>

      <div class="table-scroll directory-desktop-table">
        <table>
          <thead>
            <tr>
              <th>Fecha / Hora</th>
              <th>Producto</th>
              <th>Operación / Motivo</th>
              <th>Cantidad</th>
              <th>Existencia</th>
              <th>Pérdida (RD$)</th>
              <th>Responsable</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody id="directory-body">
            ${sorted.length ? sorted.map(historyRow).join('') : `<tr><td colspan="8">${empty('history', 'Sin movimientos', 'Los ajustes, mermas y preparaciones de inventario aparecerán aquí.')}</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="directory-mobile-cards" id="directory-cards">
        ${sorted.length ? sorted.map(historyMobileCard).join('') : empty('history', 'Sin movimientos', 'Los ajustes, mermas y preparaciones de inventario aparecerán aquí.')}
      </div>
    </section>
  `;
}

function historyRow(item) {
  const isWaste = item.isWaste || item.operation === 'waste';
  const isPrep = item.operation === 'prep';
  const isRestock = item.operation === 'restock';
  const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt || 0);
  const dateStr = formatDate(d, true);
  const searchStr = `${item.productName || ''} ${item.reason || ''} ${item.actorName || ''} ${item.notes || ''}`.toLowerCase();

  let opBadge = '';
  if (isWaste) {
    opBadge = `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(248,81,73,.15);color:#f85149;font-weight:700;font-size:0.75rem;"><i data-lucide="trash-2" style="width:12px;height:12px;"></i> ${escapeHtml(item.reason || 'Merma')}</span>`;
  } else if (isPrep) {
    opBadge = `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(63,185,80,.15);color:#3fb950;font-weight:700;font-size:0.75rem;"><i data-lucide="flame" style="width:12px;height:12px;"></i> ${escapeHtml(item.reason || 'Cocinado extra')}</span>`;
  } else if (isRestock) {
    opBadge = `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(239,189,105,.15);color:var(--brand-2);font-weight:700;font-size:0.75rem;"><i data-lucide="truck" style="width:12px;height:12px;"></i> ${escapeHtml(item.reason || 'Reabastecimiento')}</span>`;
  } else {
    opBadge = `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(56,189,248,.15);color:#38bdf8;font-weight:700;font-size:0.75rem;"><i data-lucide="clipboard-check" style="width:12px;height:12px;"></i> ${escapeHtml(item.reason || 'Conteo físico')}</span>`;
  }

  const deltaSign = item.delta > 0 ? `+${item.quantity}` : `-${item.quantity}`;
  const deltaColor = item.delta > 0 ? '#3fb950' : '#f85149';

  return `
    <tr data-directory-row data-search="${escapeHtml(searchStr)}">
      <td style="font-size:0.8rem;color:var(--muted);white-space:nowrap;">${dateStr}</td>
      <td><strong>${escapeHtml(item.productName || 'Producto')}</strong></td>
      <td>${opBadge}</td>
      <td><strong style="color:${deltaColor};">${deltaSign} uds</strong></td>
      <td style="white-space:nowrap;">${item.previousStock ?? '—'} → <strong style="color:#fff;">${item.resultingStock ?? '—'}</strong></td>
      <td>${Number(item.wasteCostCents || 0) > 0 ? `<strong style="color:#f85149;">${formatMoney(item.wasteCostCents)}</strong>` : '<span style="color:var(--muted);">—</span>'}</td>
      <td style="font-size:0.82rem;">${escapeHtml(item.actorName || 'Personal')}</td>
      <td style="font-size:0.78rem;color:var(--muted);">${escapeHtml(item.notes || '—')}</td>
    </tr>
  `;
}

function historyMobileCard(item) {
  const isWaste = item.isWaste || item.operation === 'waste';
  const isPrep = item.operation === 'prep';
  const isRestock = item.operation === 'restock';
  const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt || 0);
  const dateStr = formatDate(d, true);
  const searchStr = `${item.productName || ''} ${item.reason || ''} ${item.actorName || ''} ${item.notes || ''}`.toLowerCase();

  let opBadge = '';
  if (isWaste) {
    opBadge = `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(248,81,73,.15);color:#f85149;font-weight:700;font-size:0.75rem;"><i data-lucide="trash-2" style="width:12px;height:12px;"></i> ${escapeHtml(item.reason || 'Merma')}</span>`;
  } else if (isPrep) {
    opBadge = `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(63,185,80,.15);color:#3fb950;font-weight:700;font-size:0.75rem;"><i data-lucide="flame" style="width:12px;height:12px;"></i> ${escapeHtml(item.reason || 'Cocinado')}</span>`;
  } else if (isRestock) {
    opBadge = `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(239,189,105,.15);color:var(--brand-2);font-weight:700;font-size:0.75rem;"><i data-lucide="truck" style="width:12px;height:12px;"></i> ${escapeHtml(item.reason || 'Reabastecimiento')}</span>`;
  } else {
    opBadge = `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(56,189,248,.15);color:#38bdf8;font-weight:700;font-size:0.75rem;"><i data-lucide="clipboard-check" style="width:12px;height:12px;"></i> ${escapeHtml(item.reason || 'Conteo')}</span>`;
  }

  const deltaSign = item.delta > 0 ? `+${item.quantity}` : `-${item.quantity}`;
  const deltaColor = item.delta > 0 ? '#3fb950' : '#f85149';

  return `
    <article class="mobile-dir-card surface-card" data-directory-row data-search="${escapeHtml(searchStr)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
        <div>
          <h3 style="margin:0 0 4px;font-size:1rem;font-weight:800;color:#fff;">${escapeHtml(item.productName || 'Producto')}</h3>
          <span style="font-size:0.75rem;color:var(--muted);">${dateStr}</span>
        </div>
        ${opBadge}
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:8px 10px;background:rgba(0,0,0,.25);border-radius:8px;margin-bottom:8px;font-size:0.8rem;">
        <div>
          <span style="display:block;font-size:0.68rem;color:var(--muted);">Ajuste</span>
          <strong style="color:${deltaColor};font-size:0.95rem;">${deltaSign}</strong>
        </div>
        <div>
          <span style="display:block;font-size:0.68rem;color:var(--muted);">Existencia</span>
          <strong style="color:#fff;">${item.previousStock ?? '—'} → ${item.resultingStock ?? '—'}</strong>
        </div>
        <div>
          <span style="display:block;font-size:0.68rem;color:var(--muted);">Pérdida</span>
          <strong style="color:${Number(item.wasteCostCents || 0) > 0 ? '#f85149' : 'var(--muted)'};">${Number(item.wasteCostCents || 0) > 0 ? formatMoney(item.wasteCostCents) : '—'}</strong>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.75rem;color:var(--muted);">
        <span>Por: <b style="color:#cbd5e1;">${escapeHtml(item.actorName || 'Personal')}</b></span>
        ${item.notes ? `<span>Nota: ${escapeHtml(item.notes)}</span>` : ''}
      </div>
    </article>
  `;
}

export function renderStockAdjustModal(product = {}) {
  const stock = Number(product.stock || 0);
  const cost = Number(product.costCents || 0);
  const price = Number(product.priceCents || 0);
  const isPrepared = Boolean(product.isPrepared);
  const initialOp = 'restock';
  const initialReason = 'restock';
  const initialQty = 1;
  const initialWasteCost = 0;

  return `
    <div class="modal-backdrop" data-modal-close>
      <form id="stock-adjust-form" class="modal-card form-modal" data-modal-card style="max-width:540px;">
        <header>
          <div>
            <span class="eyebrow">Ajuste de Inventario y Existencias</span>
            <h2>${escapeHtml(product.name || 'Producto')}</h2>
          </div>
          <button class="icon-button" type="button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
        </header>

        <div class="stack-form" style="gap:14px;">
          <input type="hidden" name="productId" value="${escapeHtml(product.id || '')}">
          <input type="hidden" id="adjust-operation" name="operation" value="${initialOp}">
          <input type="hidden" id="adjust-reason-category" name="reasonCategory" value="${initialReason}">
          <input type="hidden" id="adjust-unit-cost" value="${cost}">
          <input type="hidden" id="adjust-unit-price" value="${price}">
          <input type="hidden" id="adjust-current-stock" value="${stock}">

          <!-- Resumen actual del producto -->
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:10px 14px;background:rgba(0,0,0,.3);border-radius:10px;border:1px solid rgba(255,255,255,.08);text-align:center;">
            <div>
              <span style="display:block;font-size:0.7rem;color:var(--muted);text-transform:uppercase;">Stock Actual</span>
              <strong style="font-size:1.15rem;color:${isPrepared ? '#10b981' : (stock <= 0 ? '#f43f5e' : (stock <= 5 ? '#f59e0b' : '#10b981'))};font-weight:900;">
                ${isPrepared ? 'Cocina' : stock}
              </strong>
            </div>
            <div>
              <span style="display:block;font-size:0.7rem;color:var(--muted);text-transform:uppercase;">Costo Unit.</span>
              <strong style="font-size:1rem;color:#cbd5e1;">${formatMoney(cost)}</strong>
            </div>
            <div>
              <span style="display:block;font-size:0.7rem;color:var(--muted);text-transform:uppercase;">Precio Venta</span>
              <strong style="font-size:1rem;color:var(--brand-2);">${formatMoney(price)}</strong>
            </div>
          </div>

          <!-- Selección de Operación -->
          <div>
            <label style="font-weight:700;font-size:0.85rem;color:#fff;margin-bottom:6px;display:block;">Tipo de Movimiento *</label>
            <div class="adjust-op-pills" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
              <button type="button" class="adjust-op-btn ${initialOp === 'restock' ? 'active' : ''}" data-adjust-op="restock" style="padding:10px 4px;border-radius:8px;font-weight:700;font-size:0.75rem;border:1px solid rgba(16,185,129,.4);background:${initialOp === 'restock' ? 'rgba(16,185,129,.25)' : 'rgba(255,255,255,.04)'};color:${initialOp === 'restock' ? '#10b981' : '#cbd5e1'};display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;">
                <i data-lucide="package-plus" style="width:18px;height:18px;"></i>
                <span>Entrada</span>
              </button>
              <button type="button" class="adjust-op-btn" data-adjust-op="count" style="padding:10px 4px;border-radius:8px;font-weight:700;font-size:0.75rem;border:1px solid rgba(56,189,248,.4);background:rgba(255,255,255,.04);color:#cbd5e1;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;">
                <i data-lucide="clipboard-check" style="width:18px;height:18px;"></i>
                <span>Conteo</span>
              </button>
              <button type="button" class="adjust-op-btn" data-adjust-op="waste" style="padding:10px 4px;border-radius:8px;font-weight:700;font-size:0.75rem;border:1px solid rgba(248,81,73,.4);background:rgba(255,255,255,.04);color:#cbd5e1;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;">
                <i data-lucide="trash-2" style="width:18px;height:18px;"></i>
                <span>Merma</span>
              </button>
              <button type="button" class="adjust-op-btn" data-adjust-op="prep" style="padding:10px 4px;border-radius:8px;font-weight:700;font-size:0.75rem;border:1px solid rgba(245,158,11,.4);background:rgba(255,255,255,.04);color:#cbd5e1;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;">
                <i data-lucide="flame" style="width:18px;height:18px;"></i>
                <span>Cocinado</span>
              </button>
            </div>
          </div>

          <!-- Motivos Rápidos (Chips táctiles de 1 toque) -->
          <div>
            <label style="font-weight:700;font-size:0.85rem;color:#fff;margin-bottom:6px;display:block;">Motivo del Ajuste *</label>
            <div id="adjust-reasons-container" style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="reason-chip active" data-reason-category="restock" data-reason-op="restock" style="padding:6px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;border:1px solid var(--brand-2);background:var(--brand-2);color:#000;cursor:pointer;">
                <i data-lucide="truck" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;margin-right:3px;"></i> Llegó mercancía / Suplidor
              </button>
              <button type="button" class="reason-chip" data-reason-category="audit_count" data-reason-op="count" style="padding:6px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#cbd5e1;cursor:pointer;">
                <i data-lucide="clipboard-check" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;margin-right:3px;"></i> Conteo físico en vitrina/almacén
              </button>
              <button type="button" class="reason-chip" data-reason-category="waste_damaged" data-reason-op="waste" style="padding:6px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#cbd5e1;cursor:pointer;">
                <i data-lucide="trash-2" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;margin-right:3px;"></i> Se estropeó / Botado / Dañado
              </button>
              <button type="button" class="reason-chip" data-reason-category="waste_unsold" data-reason-op="waste" style="padding:6px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#cbd5e1;cursor:pointer;">
                <i data-lucide="moon" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;margin-right:3px;"></i> Sobrante del día (No vendido)
              </button>
              <button type="button" class="reason-chip" data-reason-category="production_demand" data-reason-op="prep" style="padding:6px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#cbd5e1;cursor:pointer;">
                <i data-lucide="flame" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;margin-right:3px;"></i> Preparación extra (Demanda)
              </button>
            </div>
          </div>

          <!-- Cantidad con botones rápidos y teclado táctil -->
          <div>
            <label id="adjust-qty-label" style="font-weight:700;font-size:0.85rem;color:#fff;margin-bottom:6px;display:block;">
              Cantidad de Unidades que Entraron *
            </label>
            <div style="display:flex;align-items:center;gap:8px;">
              <input
                id="stock-adjust-qty"
                name="quantity"
                type="text"
                data-touch-numpad="decimal"
                data-numpad-title="Cantidad de Unidades"
                required
                value="${initialQty}"
                readonly
                inputmode="none"
                style="cursor:pointer;font-size:1.4rem;font-weight:900;text-align:center;padding:10px;border-radius:10px;flex:1;background:rgba(0,0,0,.4);border:2px solid rgba(239,189,105,.4);color:#fff;"
              >
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button type="button" class="button secondary compact" data-quick-adjust-qty="1" style="font-weight:800;padding:10px 10px;">+1</button>
                <button type="button" class="button secondary compact" data-quick-adjust-qty="5" style="font-weight:800;padding:10px 10px;">+5</button>
                <button type="button" class="button secondary compact" data-quick-adjust-qty="10" style="font-weight:800;padding:10px 10px;">+10</button>
                <button type="button" class="button secondary compact" data-quick-adjust-qty="20" style="font-weight:800;padding:10px 10px;border-color:#10b981;color:#10b981;">+20</button>
                <button type="button" class="button secondary compact" data-quick-adjust-qty="50" style="font-weight:800;padding:10px 10px;border-color:#10b981;color:#10b981;">+50</button>
                ${stock > 0 ? `<button type="button" class="button secondary compact" data-quick-adjust-qty="all" style="font-weight:800;padding:10px 10px;border-color:#f85149;color:#f85149;" title="Todo el stock">Todo (${stock})</button>` : ''}
              </div>
            </div>
          </div>

          <!-- Impacto en vivo -->
          <div id="adjust-impact-preview" style="padding:10px 14px;border-radius:10px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:0.82rem;font-weight:700;color:#10b981;" id="adjust-impact-title">Nuevo Stock en Inventario:</span>
            <strong style="font-size:1.15rem;font-weight:900;color:#10b981;" id="adjust-impact-value">${stock + initialQty} uds (+${initialQty})</strong>
          </div>

          <!-- Configuración de Producto Preparado -->
          <div style="background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);border-radius:10px;padding:10px 12px;">
            <label class="check-field" style="cursor:pointer;display:flex;align-items:flex-start;gap:8px;">
              <input type="checkbox" name="isPrepared" id="adjust-is-prepared" ${isPrepared ? 'checked' : ''} style="width:17px;height:17px;margin-top:2px;">
              <span>
                <strong style="color:#10b981;font-size:0.84rem;"><i data-lucide="chef-hat" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:3px;"></i>Producto preparado continuo (Cocina / Bar)</strong>
                <small style="color:var(--muted);font-size:0.75rem;display:block;margin-top:1px;">
                  Permite facturar continuamente en el POS sin agotar existencias ni bloquear la venta.
                </small>
              </span>
            </label>
          </div>

          <!-- Nota u observación -->
          <label>
            <span style="font-size:0.8rem;color:var(--muted);">Nota o justificación (ej. llegaron aguacates, compra colmado...)</span>
            <input name="notes" maxlength="300" placeholder="Ej. Llegó pedido del suplidor...">
          </label>

          <!-- PIN de Seguridad de 6 dígitos -->
          <div style="background:rgba(239,189,105,.08);border:1px solid rgba(239,189,105,.3);border-radius:12px;padding:12px 14px;">
            <label style="display:block;margin-bottom:6px;">
              <strong style="font-size:0.85rem;color:var(--brand-2);display:flex;align-items:center;gap:6px;">
                <i data-lucide="key-round" style="width:16px;height:16px;"></i> PIN de Seguridad (6 dígitos) *
              </strong>
              <span style="font-size:0.75rem;color:var(--muted);display:block;margin-top:2px;">
                Requerido para autorizar el movimiento en el sistema.
              </span>
            </label>
            <input
              name="pin"
              type="password"
              maxlength="6"
              data-touch-numpad="pin"
              data-numpad-title="PIN de Autorización"
              required
              readonly
              inputmode="none"
              style="cursor:pointer;letter-spacing:8px;font-weight:900;font-size:1.4rem;text-align:center;background:rgba(0,0,0,.5);border:2px solid var(--brand-2);border-radius:10px;padding:10px;width:100%;color:#fff;"
              placeholder="••••••"
              autocomplete="off"
            >
          </div>
        </div>

        <footer class="modal-actions" style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end;">
          <button class="button secondary" type="button" data-modal-close>Cancelar</button>
          <button class="button primary" type="submit" id="stock-adjust-submit-btn" style="padding:12px 20px;font-weight:800;font-size:0.95rem;">
            <i data-lucide="shield-check"></i> Confirmar con PIN
          </button>
        </footer>
      </form>
    </div>
  `;
}


export function renderEndDayWasteModal(products = []) {
  const activeWithStock = (products || []).filter((p) => p.active !== false && Number(p.stock || 0) > 0);

  if (!activeWithStock.length) {
    return `
      <div class="modal-backdrop" data-modal-close>
        <div class="modal-card" data-modal-card style="max-width:500px;text-align:center;padding:24px;">
          <div style="width:50px;height:50px;border-radius:50%;background:rgba(16,185,129,.15);color:#10b981;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
            <i data-lucide="check-circle-2" style="width:28px;height:28px;"></i>
          </div>
          <h2 style="margin:0 0 8px;font-size:1.2rem;">Vitrina al Día</h2>
          <p style="color:var(--muted);font-size:0.88rem;margin-bottom:18px;">
            No hay productos con existencias activas en este momento. Todos los artículos tienen stock en 0 o ya fueron ajustados.
          </p>
          <button class="button secondary" type="button" data-modal-close>Cerrar</button>
        </div>
      </div>
    `;
  }

  const initialTotalLossCents = activeWithStock.reduce((sum, p) => {
    const cost = Number(p.costCents || p.priceCents || 0);
    return sum + (cost * Number(p.stock || 0));
  }, 0);

  const initialTotalUnits = activeWithStock.reduce((sum, p) => sum + Number(p.stock || 0), 0);

  return `
    <div class="modal-backdrop" data-modal-close>
      <form id="end-day-waste-form" class="modal-card form-modal" data-modal-card style="max-width:680px;max-height:90vh;display:flex;flex-direction:column;">
        <header>
          <div>
            <span class="eyebrow">Cierre de Jornada · Cafetería</span>
            <h2>Descarte de Comida No Vendida en Vitrina</h2>
            <p style="margin:4px 0 0;font-size:0.82rem;color:var(--muted);">
              Selecciona la comida preparada que sobró hoy y pon el mostrador a 0 para el día siguiente.
            </p>
          </div>
          <button class="icon-button" type="button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
        </header>

        <div class="stack-form" style="gap:14px;overflow-y:auto;flex:1;padding-right:4px;">
          <!-- Barra de impacto acumulado y selector masivo -->
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;background:rgba(248,81,73,.12);border:1px solid rgba(248,81,73,.3);border-radius:10px;flex-wrap:wrap;">
            <div>
              <strong style="color:#f85149;font-size:0.85rem;display:block;">Pérdida Total del Descarte:</strong>
              <span id="batch-waste-total-cents" style="font-size:1.3rem;font-weight:900;color:#f85149;">${formatMoney(initialTotalLossCents)}</span>
              <small id="batch-waste-units-count" style="font-size:0.78rem;color:var(--muted);margin-left:6px;">(${initialTotalUnits} unidades)</small>
            </div>
            <div style="display:flex;gap:6px;">
              <button type="button" class="button secondary compact" id="batch-select-all" style="border-color:#f85149;color:#f85149;font-weight:700;">
                <i data-lucide="check-square"></i> Marcar Todo a 0
              </button>
              <button type="button" class="button secondary compact" id="batch-deselect-all">
                Desmarcar Todo
              </button>
            </div>
          </div>

          <!-- Motivo y notas -->
          <div class="form-grid two">
            <label>
              <span style="font-size:0.8rem;color:#fff;font-weight:700;">Motivo del Cierre *</span>
              <select name="reasonCategory" id="batch-waste-reason" style="padding:10px;border-radius:8px;background:rgba(0,0,0,.4);color:#fff;border:1px solid rgba(255,255,255,.2);cursor:pointer;">
                <option value="waste_unsold" selected>Sobrante del día (No vendido)</option>
                <option value="waste_expired">Caducó / Venció</option>
                <option value="waste_damaged">Se estropeó / Botado / Desperdicio</option>
              </select>
            </label>
            <label>
              <span style="font-size:0.8rem;color:#fff;font-weight:700;">Nota general (opcional)</span>
              <input name="notes" maxlength="300" placeholder="Ej. Cierre de jornada noche..." style="padding:10px;">
            </label>
          </div>

          <!-- Tabla de productos con stock activo -->
          <div style="border:1px solid rgba(255,255,255,.1);border-radius:10px;overflow:hidden;background:rgba(0,0,0,.2);">
            <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
              <thead>
                <tr style="background:rgba(255,255,255,.05);border-bottom:1px solid rgba(255,255,255,.1);text-align:left;">
                  <th style="padding:8px 10px;width:38px;text-align:center;">
                    <input type="checkbox" id="batch-check-header" checked style="width:16px;height:16px;cursor:pointer;">
                  </th>
                  <th style="padding:8px 10px;">Producto</th>
                  <th style="padding:8px 10px;text-align:center;">Stock Hoy</th>
                  <th style="padding:8px 10px;text-align:center;">Queda (Mañana)</th>
                  <th style="padding:8px 10px;text-align:right;">Pérdida</th>
                </tr>
              </thead>
              <tbody id="batch-waste-table-body">
                ${activeWithStock.map((p) => {
                  const stockNum = Number(p.stock || 0);
                  const cost = Number(p.costCents || p.priceCents || 0);
                  const loss = cost * stockNum;
                  return `
                    <tr data-batch-row data-product-id="${p.id}" data-cost="${cost}" data-stock="${stockNum}" style="border-bottom:1px solid rgba(255,255,255,.05);">
                      <td style="padding:8px 10px;text-align:center;">
                        <input type="checkbox" class="batch-waste-checkbox" data-product-id="${p.id}" checked style="width:16px;height:16px;cursor:pointer;">
                      </td>
                      <td style="padding:8px 10px;">
                        <strong style="display:block;color:#fff;">${escapeHtml(p.name)}</strong>
                        <small style="color:var(--muted);">${escapeHtml(p.category || 'General')}</small>
                      </td>
                      <td style="padding:8px 10px;text-align:center;">
                        <strong style="color:var(--brand-2);font-size:0.95rem;">${stockNum}</strong>
                      </td>
                      <td style="padding:8px 10px;text-align:center;">
                        <input
                          type="text"
                          class="batch-target-stock"
                          data-product-id="${p.id}"
                          data-touch-numpad="decimal"
                          data-numpad-title="Queda en Vitrina - ${escapeHtml(p.name)}"
                          value="0"
                          readonly
                          inputmode="none"
                          style="width:65px;text-align:center;font-weight:900;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.2);color:#fff;cursor:pointer;"
                        >
                      </td>
                      <td style="padding:8px 10px;text-align:right;">
                        <strong class="batch-item-loss" data-product-id="${p.id}" style="color:#f85149;">${formatMoney(loss)}</strong>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- PIN de Seguridad de 6 dígitos -->
          <div style="background:rgba(239,189,105,.08);border:1px solid rgba(239,189,105,.3);border-radius:12px;padding:12px 14px;">
            <label style="display:block;margin-bottom:6px;">
              <strong style="font-size:0.85rem;color:var(--brand-2);display:flex;align-items:center;gap:6px;">
                <i data-lucide="key-round" style="width:16px;height:16px;"></i> PIN de Seguridad (6 dígitos) *
              </strong>
              <span style="font-size:0.75rem;color:var(--muted);display:block;margin-top:2px;">
                Autoriza el descarte masivo y asienta el registro en auditoría.
              </span>
            </label>
            <input
              name="pin"
              type="password"
              maxlength="6"
              data-touch-numpad="pin"
              data-numpad-title="PIN de Autorización"
              required
              readonly
              inputmode="none"
              style="cursor:pointer;letter-spacing:8px;font-weight:900;font-size:1.4rem;text-align:center;background:rgba(0,0,0,.5);border:2px solid var(--brand-2);border-radius:10px;padding:10px;width:100%;color:#fff;"
              placeholder="••••••"
              autocomplete="off"
            >
          </div>
        </div>

        <footer class="modal-actions" style="margin-top:14px;display:flex;gap:10px;justify-content:flex-end;">
          <button class="button secondary" type="button" data-modal-close>Cancelar</button>
          <button class="button primary" type="submit" id="batch-waste-submit-btn" style="padding:12px 20px;font-weight:800;font-size:0.95rem;background:#f85149;border-color:#f85149;">
            <i data-lucide="trash-2"></i> Confirmar Cierre de Vitrina con PIN
          </button>
        </footer>
      </form>
    </div>
  `;
}
