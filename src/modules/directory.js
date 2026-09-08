import { escapeHtml, formatMoney, formatDate } from '../lib/format.js';
import { INVENTORY_REASONS, getInventoryReason, calculateWasteCostCents } from '../domain/inventory.js';
import { businessDateKey } from '../lib/business-time.js';

export function renderProducts(state) {
  const products = state.products || [];
  const totalProducts = products.length;
  const lowStockCount = products.filter((p) => Number(p.stock || 0) <= 5).length;
  const totalValuation = products.reduce((sum, p) => sum + (Number(p.costCents || p.priceCents || 0) * Number(p.stock || 0)), 0);

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

  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Catálogo e Inventario</span>
        <h2>Gestión de Productos y Existencias</h2>
        <p>Control de productos, costos, precios de venta, mermas de vitrina y existencias en tiempo real.</p>
      </div>
      <div class="header-actions" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <button class="button secondary" type="button" data-end-day-waste style="border-color:#f59e0b;color:#f59e0b;font-weight:700;">
          <i data-lucide="moon"></i> Cierre de Jornada: Mermas
        </button>
        ${state.capabilities.manageCatalog ? '<button class="button primary" type="button" data-product-new><i data-lucide="plus"></i> Nuevo producto</button>' : ''}
      </div>
    </section>

    <div class="metric-grid" style="margin-bottom:16px;">
      <article class="metric-card">
        <i data-lucide="package"></i>
        <div><span>Total Productos</span><strong>${totalProducts}</strong></div>
      </article>
      <article class="metric-card ${lowStockCount ? 'warning' : ''}">
        <i data-lucide="alert-triangle"></i>
        <div><span>Bajo Stock / Agotados</span><strong style="${lowStockCount ? 'color:#f59e0b;' : ''}">${lowStockCount}</strong></div>
      </article>
      <article class="metric-card">
        <i data-lucide="circle-dollar-sign"></i>
        <div><span>Valor en Inventario</span><strong style="color:var(--brand-2);">${formatMoney(totalValuation)}</strong></div>
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

    <div class="tab-strip" style="display:flex;gap:8px;margin-bottom:16px;">
      <button type="button" class="button ${activeTab === 'catalog' ? 'primary' : 'secondary'}" data-products-tab="catalog" style="padding:8px 16px;font-size:0.88rem;font-weight:700;">
        <i data-lucide="package"></i> Catálogo de Productos (${totalProducts})
      </button>
      <button type="button" class="button ${activeTab === 'history' ? 'primary' : 'secondary'}" data-products-tab="history" style="padding:8px 16px;font-size:0.88rem;font-weight:700;">
        <i data-lucide="history"></i> Historial de Mermas y Ajustes (${movements.length})
      </button>
    </div>

    ${activeTab === 'history' ? renderInventoryHistoryView(movements) : `
    <section class="surface-card data-surface">
      <div class="toolbar">
        <label class="search-field">
          <i data-lucide="search"></i>
          <input id="directory-search" type="search" placeholder="Buscar por nombre, SKU o categoría...">
        </label>
      </div>

      <!-- Vista para pantalla de terminal / PC -->
      <div class="table-scroll directory-desktop-table">
        <table>
          <thead>
            <tr>
              <th>Producto</th><th>SKU</th><th>Categoría</th><th>Precio</th><th>Costo</th><th>Existencia</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody id="directory-body">
            ${products.length ? products.map((item) => productRow(item, state.capabilities.manageCatalog)).join('') : `<tr><td colspan="8">${empty('package-open','Catálogo vacío','Agrega el primer producto del restaurante.')}</td></tr>`}
          </tbody>
        </table>
      </div>

      <!-- Vista móvil en tarjetas táctiles para celular -->
      <div class="directory-mobile-cards" id="directory-cards">
        ${products.length ? products.map((item) => productMobileCard(item, state.capabilities.manageCatalog)).join('') : empty('package-open','Catálogo vacío','Agrega el primer producto del restaurante.')}
      </div>
    </section>
    `}
  `;
}

export function renderClients(state) {
  const clients = state.clients || [];
  const clientDebtMap = new Map();

  for (const inv of (state.invoices || [])) {
    if (inv.documentType === 'invoice' && inv.status !== 'paid' && inv.status !== 'cancelled') {
      const balance = Number(inv.totalCents || 0) - Number(inv.paidCents || 0);
      if (balance > 0) {
        if (inv.clientId) clientDebtMap.set(`id:${inv.clientId}`, (clientDebtMap.get(`id:${inv.clientId}`) || 0) + balance);
        if (inv.clientName) {
          const k = `name:${String(inv.clientName).trim().toLowerCase()}`;
          clientDebtMap.set(k, (clientDebtMap.get(k) || 0) + balance);
        }
      }
    }
  }

  const clientsWithDebt = clients.filter((c) => {
    return (clientDebtMap.get(`id:${c.id}`) || clientDebtMap.get(`name:${String(c.name).trim().toLowerCase()}`) || 0) > 0;
  });

  const totalDebt = (state.invoices || [])
    .filter((inv) => inv.documentType === 'invoice' && inv.status !== 'paid' && inv.status !== 'cancelled')
    .reduce((sum, inv) => sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)), 0);

  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Clientes y Crédito</span>
        <h2>Directorio de Clientes y Fiaos</h2>
        <p>Registro de clientes, límites de fiaos, contacto directo y cobranzas.</p>
      </div>
      <div class="header-actions" style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="button primary" data-client-new><i data-lucide="user-plus"></i> Registrar Cliente para Fiao</button>
      </div>
    </section>

    <div class="metric-grid" style="margin-bottom:16px;">
      <article class="metric-card">
        <i data-lucide="users"></i>
        <div><span>Clientes Registrados</span><strong>${clients.length}</strong></div>
      </article>
      <article class="metric-card ${clientsWithDebt.length ? 'warning' : ''}">
        <i data-lucide="book-open"></i>
        <div><span>Con Fiao Activo</span><strong style="${clientsWithDebt.length ? 'color:#f85149;' : ''}">${clientsWithDebt.length}</strong></div>
      </article>
      <article class="metric-card">
        <i data-lucide="badge-dollar-sign"></i>
        <div><span>Total Fiaos en la Calle</span><strong style="color:var(--brand-2);">${formatMoney(totalDebt)}</strong></div>
      </article>
    </div>

    <section class="surface-card data-surface">
      <div class="toolbar">
        <label class="search-field">
          <i data-lucide="search"></i>
          <input id="directory-search" type="search" placeholder="Buscar por nombre, RNC/Cédula, teléfono o notas...">
        </label>
      </div>

      <!-- Vista para pantalla de terminal / PC -->
      <div class="table-scroll directory-desktop-table">
        <table>
          <thead>
            <tr>
              <th>Nombre</th><th>RNC/Cédula</th><th>Teléfono</th><th>Deuda Fiao</th><th>Notas / Límite</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody id="directory-body">
            ${clients.length ? clients.map((item) => clientRow(item, clientDebtMap)).join('') : `<tr><td colspan="7">${empty('users','Sin clientes','Registra clientes para poder fiarles y gestionar su crédito.')}</td></tr>`}
          </tbody>
        </table>
      </div>

      <!-- Vista móvil en tarjetas táctiles para celular -->
      <div class="directory-mobile-cards" id="directory-cards">
        ${clients.length ? clients.map((item) => clientMobileCard(item, clientDebtMap)).join('') : empty('users','Sin clientes','Registra clientes para poder fiarles y gestionar su crédito.')}
      </div>
    </section>
  `;
}

export function renderProductForm(product = {}) {
  return modal('product-form', product.id ? 'Editar producto e inventario' : 'Nuevo producto en inventario', `
    <input type="hidden" name="id" value="${escapeHtml(product.id || '')}">
    <label>Nombre del producto *
      <input name="name" required maxlength="160" value="${escapeHtml(product.name || '')}" placeholder="Ej. Chivo Guisado, Pechuga a la Plancha...">
    </label>
    <div class="form-grid two">
      <label>SKU o Código de barras
        <input name="sku" maxlength="80" value="${escapeHtml(product.sku || '')}" placeholder="Ej. CAR-CHI-01">
      </label>
      <label>Categoría
        <input name="category" maxlength="80" value="${escapeHtml(product.category || 'General')}" placeholder="Ej. Carnes, Arroces, Bebidas">
      </label>
    </div>
    <div class="form-grid three">
      <label>Precio de venta (RD$) *
        <input name="price" type="text" data-touch-numpad="money" data-numpad-title="Precio de Venta" required value="${product.priceCents != null ? (product.priceCents / 100).toFixed(2) : ''}" placeholder="0.00" readonly inputmode="none" style="cursor:pointer;">
      </label>
      <label>Costo unitario (RD$)
        <input name="cost" type="text" data-touch-numpad="money" data-numpad-title="Costo Unitario" value="${product.costCents != null ? (product.costCents / 100).toFixed(2) : '0.00'}" placeholder="0.00" readonly inputmode="none" style="cursor:pointer;">
      </label>
      <label>ITBIS %
        <input name="taxRate" type="text" data-touch-numpad="decimal" data-numpad-title="ITBIS %" value="${product.taxRate ?? 0}" placeholder="0" readonly inputmode="none" style="cursor:pointer;">
      </label>
    </div>
    <div class="form-grid two">
      <label>Existencia actual (Stock)
        <input name="stock" type="text" data-touch-numpad="decimal" data-numpad-title="Stock / Existencia" value="${product.stock ?? 0}" placeholder="0" readonly inputmode="none" style="cursor:pointer;">
      </label>
      <label class="check-field">
        <input name="active" type="checkbox" ${product.active === false ? '' : 'checked'}> Producto activo en venta rápida (POS)
      </label>
    </div>
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

function productRow(item, editable) {
  const searchStr = `${item.name} ${item.sku} ${item.category}`.toLowerCase();
  return `<tr data-directory-row data-search="${escapeHtml(searchStr)}">
    <td><strong>${escapeHtml(item.name)}</strong></td>
    <td>${escapeHtml(item.sku || '—')}</td>
    <td>${escapeHtml(item.category || 'General')}</td>
    <td><strong>${formatMoney(item.priceCents)}</strong></td>
    <td>${formatMoney(item.costCents || 0)}</td>
    <td><span style="font-weight:700;color:${Number(item.stock || 0) <= 0 ? '#f43f5e' : (Number(item.stock || 0) <= 5 ? '#f59e0b' : '#10b981')}">${item.stock}</span></td>
    <td><span class="document-status ${item.active === false ? 'status-cancelled' : 'status-paid'}">${item.active === false ? 'Inactivo' : 'Activo'}</span></td>
    <td>
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;">
        <button type="button" class="button secondary compact" data-stock-adjust="${item.id}" style="padding:4px 8px;font-size:0.75rem;border-color:rgba(239,189,105,.35);color:var(--brand-2);white-space:nowrap;" title="Ajustar stock o registrar merma">
          <i data-lucide="clipboard-pen"></i> Ajustar / Merma
        </button>
        ${editable ? `<button class="icon-button" data-product-edit="${item.id}" aria-label="Editar"><i data-lucide="pencil"></i></button>` : ''}
      </div>
    </td>
  </tr>`;
}

function productMobileCard(item, editable) {
  const stock = Number(item.stock || 0);
  const isLow = stock <= 5 && stock > 0;
  const isOut = stock <= 0;
  const stockColor = isOut ? '#f43f5e' : (isLow ? '#f59e0b' : '#10b981');
  const stockText = isOut ? 'Agotado (0)' : (isLow ? `Bajo (${stock})` : `${stock} disponibles`);
  const margin = item.priceCents && item.costCents ? Math.round(((item.priceCents - item.costCents) / item.priceCents) * 100) : null;
  const searchStr = `${item.name} ${item.sku} ${item.category}`.toLowerCase();

  return `
    <article class="mobile-dir-card surface-card" data-directory-row data-search="${escapeHtml(searchStr)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;">
        <div>
          <span style="font-size:0.68rem;padding:2px 8px;border-radius:6px;background:rgba(239,189,105,.15);color:var(--brand-2);font-weight:700;text-transform:uppercase;">
            ${escapeHtml(item.category || 'General')}
          </span>
          <h3 style="margin:6px 0 2px;font-size:1.05rem;font-weight:800;color:#fff;line-height:1.25;">
            ${escapeHtml(item.name)}
          </h3>
          <small style="color:var(--muted);font-size:0.75rem;">SKU: ${escapeHtml(item.sku || '—')}</small>
        </div>
        <span class="document-status ${item.active === false ? 'status-cancelled' : 'status-paid'}" style="flex-shrink:0;">
          ${item.active === false ? 'Inactivo' : 'Activo'}
        </span>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px 12px;background:rgba(0,0,0,.25);border-radius:10px;border:1px solid rgba(255,255,255,.05);margin-bottom:12px;">
        <div>
          <span style="display:block;font-size:0.68rem;color:var(--muted);text-transform:uppercase;">Precio</span>
          <strong style="font-size:1.05rem;color:var(--brand-2);font-weight:800;">${formatMoney(item.priceCents)}</strong>
        </div>
        <div>
          <span style="display:block;font-size:0.68rem;color:var(--muted);text-transform:uppercase;">Costo</span>
          <strong style="font-size:0.95rem;color:#cbd5e1;">${formatMoney(item.costCents || 0)}</strong>
        </div>
        <div>
          <span style="display:block;font-size:0.68rem;color:var(--muted);text-transform:uppercase;">Margen</span>
          <strong style="font-size:0.95rem;color:#38bdf8;">${margin != null ? margin + '%' : '—'}</strong>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding-top:6px;border-top:1px solid rgba(255,255,255,.06);flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:6px;font-size:0.82rem;font-weight:700;color:${stockColor};">
          <span style="width:8px;height:8px;border-radius:50%;background:${stockColor};display:inline-block;"></span>
          <span>Stock: ${stockText}</span>
        </div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="button secondary compact" data-stock-adjust="${item.id}" style="padding:6px 10px;font-size:0.8rem;border-color:rgba(239,189,105,.35);color:var(--brand-2);">
            <i data-lucide="clipboard-pen"></i> Ajustar / Merma
          </button>
          ${editable ? `
            <button type="button" class="button secondary compact" data-product-edit="${item.id}" style="padding:6px 12px;font-size:0.8rem;">
              <i data-lucide="pencil"></i> Editar
            </button>
          ` : ''}
        </div>
      </div>
    </article>
  `;
}

function clientRow(item, clientDebtMap) {
  const debtCents = clientDebtMap.get(`id:${item.id}`) || clientDebtMap.get(`name:${String(item.name).trim().toLowerCase()}`) || 0;
  const searchStr = `${item.name} ${item.rnc} ${item.phone} ${item.notes || ''}`.toLowerCase();

  return `<tr data-directory-row data-search="${escapeHtml(searchStr)}">
    <td>
      <strong>${escapeHtml(item.name)}</strong>
      ${item.notes ? `<small style="color:var(--muted);">${escapeHtml(item.notes)}</small>` : ''}
    </td>
    <td>${escapeHtml(item.rnc || '—')}</td>
    <td>${escapeHtml(item.phone || '—')}</td>
    <td>
      ${debtCents > 0 ? `<strong style="color:#f85149;">${formatMoney(debtCents)}</strong>` : '<span style="color:#10b981;font-size:0.75rem;">Al día</span>'}
    </td>
    <td>
      ${item.creditLimitCents ? `<span style="font-size:0.75rem;color:var(--brand-2);">Límite: ${formatMoney(item.creditLimitCents)}</span>` : '<span style="color:var(--muted);font-size:0.75rem;">Sin límite</span>'}
    </td>
    <td><span class="document-status ${item.active === false ? 'status-cancelled' : 'status-paid'}">${item.active === false ? 'Inactivo' : 'Activo'}</span></td>
    <td><button class="icon-button" data-client-edit="${item.id}" aria-label="Editar"><i data-lucide="pencil"></i></button></td>
  </tr>`;
}

function clientMobileCard(item, clientDebtMap) {
  const debtCents = clientDebtMap.get(`id:${item.id}`) || clientDebtMap.get(`name:${String(item.name).trim().toLowerCase()}`) || 0;
  const cleanPhone = String(item.phone || '').replace(/\D/g, '');
  const searchStr = `${item.name} ${item.rnc} ${item.phone} ${item.notes || ''}`.toLowerCase();

  return `
    <article class="mobile-dir-card surface-card" data-directory-row data-search="${escapeHtml(searchStr)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:42px;height:42px;border-radius:12px;background:rgba(239,189,105,.18);color:var(--brand-2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.15rem;flex-shrink:0;">
            ${escapeHtml((item.name || '?').charAt(0).toUpperCase())}
          </div>
          <div>
            <h3 style="margin:0;font-size:1.05rem;font-weight:800;color:#fff;line-height:1.2;">
              ${escapeHtml(item.name)}
            </h3>
            <span style="font-size:0.75rem;color:var(--muted);">${item.rnc ? `RNC/Céd: ${escapeHtml(item.rnc)}` : 'Consumidor / Sin RNC'}</span>
          </div>
        </div>
        <span class="document-status ${item.active === false ? 'status-cancelled' : 'status-paid'}" style="flex-shrink:0;">
          ${item.active === false ? 'Inactivo' : 'Activo'}
        </span>
      </div>

      ${debtCents > 0 ? `
        <div style="padding:10px 14px;background:rgba(248,81,73,.12);border:1px solid rgba(248,81,73,.35);border-radius:10px;display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <i data-lucide="book-open" style="width:16px;height:16px;color:#f85149;"></i>
            <span style="font-size:0.8rem;font-weight:700;color:#f85149;">Deuda Fiao Pendiente:</span>
          </div>
          <strong style="font-size:1.05rem;font-weight:900;color:#f85149;">${formatMoney(debtCents)}</strong>
        </div>
      ` : `
        <div style="padding:6px 10px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);border-radius:8px;display:flex;align-items:center;gap:6px;margin-bottom:10px;font-size:0.75rem;color:#10b981;">
          <i data-lucide="check" style="width:13px;height:13px;"></i> Al día · Sin fiaos pendientes
        </div>
      `}

      ${item.creditLimitCents ? `
        <div style="font-size:0.75rem;color:var(--brand-2);margin-bottom:6px;font-weight:700;">
          <i data-lucide="shield-check" style="width:12px;height:12px;display:inline-block;vertical-align:-1px;"></i> Límite de Fiao: ${formatMoney(item.creditLimitCents)}
        </div>
      ` : ''}

      ${item.notes ? `
        <div style="font-size:0.76rem;color:#cbd5e1;background:rgba(0,0,0,.2);padding:6px 10px;border-radius:8px;margin-bottom:10px;border-left:3px solid var(--brand-2);">
          <strong style="color:var(--brand-2);">Nota Fiao:</strong> ${escapeHtml(item.notes)}
        </div>
      ` : ''}

      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06);flex-wrap:wrap;">
        <div style="display:flex;gap:6px;">
          ${cleanPhone ? `
            <a href="tel:${cleanPhone}" class="button secondary compact" style="padding:6px 10px;font-size:0.75rem;text-decoration:none;" title="Llamar">
              <i data-lucide="phone"></i> Llamar
            </a>
            <a href="https://wa.me/1${cleanPhone}" target="_blank" rel="noopener" class="button secondary compact" style="padding:6px 10px;font-size:0.75rem;color:#25D366;border-color:rgba(37,211,102,.3);text-decoration:none;" title="WhatsApp">
              <i data-lucide="message-square"></i> WhatsApp
            </a>
          ` : '<span style="font-size:0.75rem;color:var(--muted);">Sin teléfono</span>'}
        </div>
        <button type="button" class="button secondary compact" data-client-edit="${item.id}" style="padding:6px 14px;font-size:0.8rem;">
          <i data-lucide="pencil"></i> Editar
        </button>
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
  const initialOp = stock > 0 ? 'waste' : 'prep';
  const initialReason = stock > 0 ? 'waste_unsold' : 'production_demand';
  const initialQty = stock > 0 ? (stock <= 5 ? stock : 1) : 10;
  const initialWasteCost = (initialOp === 'waste') ? calculateWasteCostCents(cost, price, initialQty) : 0;

  return `
    <div class="modal-backdrop" data-modal-close>
      <form id="stock-adjust-form" class="modal-card form-modal" data-modal-card style="max-width:540px;">
        <header>
          <div>
            <span class="eyebrow">Ajuste de Cafetería y Mermas</span>
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
              <strong style="font-size:1.15rem;color:${stock <= 0 ? '#f43f5e' : (stock <= 5 ? '#f59e0b' : '#10b981')};font-weight:900;">${stock}</strong>
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
            <div class="adjust-op-pills" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">
              <button type="button" class="adjust-op-btn ${initialOp === 'waste' ? 'active' : ''}" data-adjust-op="waste" style="padding:10px 6px;border-radius:8px;font-weight:700;font-size:0.8rem;border:1px solid rgba(248,81,73,.4);background:${initialOp === 'waste' ? 'rgba(248,81,73,.25)' : 'rgba(255,255,255,.04)'};color:${initialOp === 'waste' ? '#f85149' : '#cbd5e1'};display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;">
                <i data-lucide="trash-2" style="width:18px;height:18px;"></i>
                <span>Merma / Descarte</span>
              </button>
              <button type="button" class="adjust-op-btn ${initialOp === 'prep' ? 'active' : ''}" data-adjust-op="prep" style="padding:10px 6px;border-radius:8px;font-weight:700;font-size:0.8rem;border:1px solid rgba(63,185,80,.4);background:${initialOp === 'prep' ? 'rgba(63,185,80,.25)' : 'rgba(255,255,255,.04)'};color:${initialOp === 'prep' ? '#3fb950' : '#cbd5e1'};display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;">
                <i data-lucide="flame" style="width:18px;height:18px;"></i>
                <span>Cocinado Extra</span>
              </button>
              <button type="button" class="adjust-op-btn" data-adjust-op="count" style="padding:10px 6px;border-radius:8px;font-weight:700;font-size:0.8rem;border:1px solid rgba(56,189,248,.4);background:rgba(255,255,255,.04);color:#cbd5e1;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;">
                <i data-lucide="clipboard-check" style="width:18px;height:18px;"></i>
                <span>Conteo Físico</span>
              </button>
            </div>
          </div>

          <!-- Motivos Rápidos (Chips táctiles de 1 toque) -->
          <div>
            <label style="font-weight:700;font-size:0.85rem;color:#fff;margin-bottom:6px;display:block;">Motivo del Ajuste *</label>
            <div id="adjust-reasons-container" style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="reason-chip ${initialReason === 'waste_unsold' ? 'active' : ''}" data-reason-category="waste_unsold" data-reason-op="waste" style="padding:6px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;border:1px solid var(--brand-2);background:${initialReason === 'waste_unsold' ? 'var(--brand-2)' : 'rgba(239,189,105,.1)'};color:${initialReason === 'waste_unsold' ? '#000' : 'var(--brand-2)'};cursor:pointer;">
                <i data-lucide="moon" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;margin-right:3px;"></i> Sobrante del día (No vendido)
              </button>
              <button type="button" class="reason-chip" data-reason-category="waste_expired" data-reason-op="waste" style="padding:6px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#cbd5e1;cursor:pointer;">
                <i data-lucide="calendar-x" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;margin-right:3px;"></i> Caducó / Venció
              </button>
              <button type="button" class="reason-chip" data-reason-category="waste_damaged" data-reason-op="waste" style="padding:6px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#cbd5e1;cursor:pointer;">
                <i data-lucide="trash-2" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;margin-right:3px;"></i> Se estropeó / Botado
              </button>
              <button type="button" class="reason-chip" data-reason-category="production_demand" data-reason-op="prep" style="padding:6px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#cbd5e1;cursor:pointer;">
                <i data-lucide="flame" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;margin-right:3px;"></i> Preparación extra (Alta demanda)
              </button>
              <button type="button" class="reason-chip" data-reason-category="restock" data-reason-op="restock" style="padding:6px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#cbd5e1;cursor:pointer;">
                <i data-lucide="truck" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;margin-right:3px;"></i> Compra / Surtido
              </button>
              <button type="button" class="reason-chip" data-reason-category="audit_count" data-reason-op="count" style="padding:6px 12px;border-radius:20px;font-size:0.78rem;font-weight:700;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#cbd5e1;cursor:pointer;">
                <i data-lucide="clipboard-check" style="width:13px;height:13px;display:inline-block;vertical-align:-2px;margin-right:3px;"></i> Conteo físico de vitrina
              </button>
            </div>
          </div>

          <!-- Cantidad con botones rápidos y teclado táctil -->
          <div>
            <label id="adjust-qty-label" style="font-weight:700;font-size:0.85rem;color:#fff;margin-bottom:6px;display:block;">
              ${initialOp === 'count' ? 'Existencia Real Contada en Vitrina *' : (initialOp === 'waste' ? 'Cantidad de Unidades a Descartar *' : 'Cantidad de Unidades Preparadas / Entrantes *')}
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
              <div style="display:flex;gap:4px;">
                <button type="button" class="button secondary compact" data-quick-adjust-qty="1" style="font-weight:800;padding:10px 12px;">+1</button>
                <button type="button" class="button secondary compact" data-quick-adjust-qty="5" style="font-weight:800;padding:10px 12px;">+5</button>
                <button type="button" class="button secondary compact" data-quick-adjust-qty="10" style="font-weight:800;padding:10px 12px;">+10</button>
                ${stock > 0 ? `<button type="button" class="button secondary compact" data-quick-adjust-qty="all" style="font-weight:800;padding:10px 10px;border-color:#f85149;color:#f85149;" title="Todo el stock">Todo (${stock})</button>` : ''}
              </div>
            </div>
          </div>

          <!-- Impacto en vivo -->
          <div id="adjust-impact-preview" style="padding:10px 14px;border-radius:10px;background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:0.82rem;font-weight:700;color:#f85149;" id="adjust-impact-title">Pérdida Financiera Estimada:</span>
            <strong style="font-size:1.15rem;font-weight:900;color:#f85149;" id="adjust-impact-value">${formatMoney(initialWasteCost)}</strong>
          </div>

          <!-- Nota u observación -->
          <label>
            <span style="font-size:0.8rem;color:var(--muted);">Nota u observación (opcional)</span>
            <input name="notes" maxlength="300" placeholder="Ej. Lote cocinado a las 12:00 m para el almuerzo...">
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
            <i data-lucide="shield-check"></i> Confirmar Ajuste con PIN
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
