import { escapeHtml, formatMoney } from '../lib/format.js';

export function renderProducts(state) {
  const products = state.products || [];
  const totalProducts = products.length;
  const lowStockCount = products.filter((p) => Number(p.stock || 0) <= 5).length;
  const totalValuation = products.reduce((sum, p) => sum + (Number(p.costCents || p.priceCents || 0) * Number(p.stock || 0)), 0);

  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Catálogo e Inventario</span>
        <h2>Gestión de Productos y Existencias</h2>
        <p>Control de productos, costos, precios de venta y existencias en tiempo real.</p>
      </div>
      ${state.capabilities.manageCatalog ? '<button class="button primary" data-product-new><i data-lucide="plus"></i> Nuevo producto</button>' : ''}
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
    </div>

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
        <input name="price" type="number" min="0" step="0.01" inputmode="decimal" required value="${product.priceCents != null ? product.priceCents / 100 : ''}" placeholder="0.00">
      </label>
      <label>Costo unitario (RD$)
        <input name="cost" type="number" min="0" step="0.01" inputmode="decimal" value="${product.costCents != null ? product.costCents / 100 : 0}" placeholder="0.00">
      </label>
      <label>ITBIS %
        <input name="taxRate" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${product.taxRate ?? 0}" placeholder="0">
      </label>
    </div>
    <div class="form-grid two">
      <label>Existencia actual (Stock)
        <input name="stock" type="number" min="0" step="0.001" inputmode="decimal" value="${product.stock ?? 0}" placeholder="0">
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
        <input name="creditLimit" type="number" min="0" step="100" inputmode="decimal" value="${client.creditLimitCents != null ? client.creditLimitCents / 100 : ''}" placeholder="Ej. 2500 (0 = sin límite)">
      </label>
      <label>Correo electrónico (opcional)
        <input name="email" type="email" maxlength="160" value="${escapeHtml(client.email || '')}" placeholder="correo@gmail.com">
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
    <td>${editable ? `<button class="icon-button" data-product-edit="${item.id}" aria-label="Editar"><i data-lucide="pencil"></i></button>` : ''}</td>
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

      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding-top:6px;border-top:1px solid rgba(255,255,255,.06);">
        <div style="display:flex;align-items:center;gap:6px;font-size:0.82rem;font-weight:700;color:${stockColor};">
          <span style="width:8px;height:8px;border-radius:50%;background:${stockColor};display:inline-block;"></span>
          <span>Stock: ${stockText}</span>
        </div>
        ${editable ? `
          <button type="button" class="button secondary compact" data-product-edit="${item.id}" style="padding:6px 14px;font-size:0.8rem;">
            <i data-lucide="pencil"></i> Editar
          </button>
        ` : ''}
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
