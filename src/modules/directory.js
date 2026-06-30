import { escapeHtml, formatMoney } from '../lib/format.js';

export function renderProducts(state) {
  return `
    <section class="panel-heading"><div><span class="eyebrow">Catálogo propio</span><h2>Productos y existencias</h2><p>Este inventario pertenece únicamente a Los Panitas.</p></div>${state.capabilities.manageCatalog ? '<button class="button primary" data-product-new><i data-lucide="plus"></i> Nuevo producto</button>' : ''}</section>
    <section class="surface-card data-surface"><div class="toolbar"><label class="search-field"><i data-lucide="search"></i><input id="directory-search" type="search" placeholder="Nombre, SKU o categoría"></label></div><div class="table-scroll"><table><thead><tr><th>Producto</th><th>SKU</th><th>Categoría</th><th>Precio</th><th>Existencia</th><th>Estado</th><th></th></tr></thead><tbody id="directory-body">${state.products.length ? state.products.map((item) => productRow(item, state.capabilities.manageCatalog)).join('') : `<tr><td colspan="7">${empty('package-open','Catálogo vacío','Agrega el primer producto real del restaurante.')}</td></tr>`}</tbody></table></div></section>`;
}

export function renderClients(state) {
  return `
    <section class="panel-heading"><div><span class="eyebrow">Clientes</span><h2>Directorio comercial</h2><p>Datos de facturación y contacto.</p></div><button class="button primary" data-client-new><i data-lucide="user-plus"></i> Nuevo cliente</button></section>
    <section class="surface-card data-surface"><div class="toolbar"><label class="search-field"><i data-lucide="search"></i><input id="directory-search" type="search" placeholder="Nombre, RNC o teléfono"></label></div><div class="table-scroll"><table><thead><tr><th>Nombre</th><th>RNC/Cédula</th><th>Teléfono</th><th>Correo</th><th>Estado</th><th></th></tr></thead><tbody id="directory-body">${state.clients.length ? state.clients.map(clientRow).join('') : `<tr><td colspan="6">${empty('users','Sin clientes','Puedes facturar a consumidor final o registrar clientes.')}</td></tr>`}</tbody></table></div></section>`;
}

export function renderProductForm(product = {}) {
  return modal('product-form', product.id ? 'Editar producto' : 'Nuevo producto', `
    <input type="hidden" name="id" value="${escapeHtml(product.id || '')}">
    <label>Nombre *<input name="name" required maxlength="160" value="${escapeHtml(product.name || '')}"></label>
    <div class="form-grid two"><label>SKU<input name="sku" maxlength="80" value="${escapeHtml(product.sku || '')}"></label><label>Categoría<input name="category" maxlength="80" value="${escapeHtml(product.category || 'General')}"></label></div>
    <div class="form-grid three"><label>Precio *<input name="price" type="number" min="0" step="0.01" required value="${product.priceCents != null ? product.priceCents / 100 : ''}"></label><label>Costo<input name="cost" type="number" min="0" step="0.01" value="${product.costCents != null ? product.costCents / 100 : 0}"></label><label>ITBIS %<input name="taxRate" type="number" min="0" max="100" step="0.01" value="${product.taxRate ?? 0}"></label></div>
    <div class="form-grid two"><label>Existencia<input name="stock" type="number" min="0" step="0.001" value="${product.stock ?? 0}"></label><label class="check-field"><input name="active" type="checkbox" ${product.active === false ? '' : 'checked'}> Producto activo</label></div>`, 'Guardar producto');
}

export function renderClientForm(client = {}) {
  return modal('client-form', client.id ? 'Editar cliente' : 'Nuevo cliente', `
    <input type="hidden" name="id" value="${escapeHtml(client.id || '')}"><label>Nombre *<input name="name" required maxlength="160" value="${escapeHtml(client.name || '')}"></label><div class="form-grid two"><label>RNC/Cédula<input name="rnc" maxlength="30" value="${escapeHtml(client.rnc || '')}"></label><label>Teléfono<input name="phone" maxlength="30" value="${escapeHtml(client.phone || '')}"></label></div><label>Correo<input name="email" type="email" maxlength="160" value="${escapeHtml(client.email || '')}"></label><label>Dirección<textarea name="address" maxlength="300">${escapeHtml(client.address || '')}</textarea></label><label class="check-field"><input name="active" type="checkbox" ${client.active === false ? '' : 'checked'}> Cliente activo</label>`, 'Guardar cliente');
}

function productRow(item, editable) { return `<tr data-directory-row data-search="${escapeHtml(`${item.name} ${item.sku} ${item.category}`.toLowerCase())}"><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.sku || '—')}</td><td>${escapeHtml(item.category || 'General')}</td><td>${formatMoney(item.priceCents)}</td><td>${item.stock}</td><td><span class="document-status ${item.active === false ? 'status-cancelled' : 'status-paid'}">${item.active === false ? 'Inactivo' : 'Activo'}</span></td><td>${editable ? `<button class="icon-button" data-product-edit="${item.id}" aria-label="Editar"><i data-lucide="pencil"></i></button>` : ''}</td></tr>`; }
function clientRow(item) { return `<tr data-directory-row data-search="${escapeHtml(`${item.name} ${item.rnc} ${item.phone}`.toLowerCase())}"><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.rnc || '—')}</td><td>${escapeHtml(item.phone || '—')}</td><td>${escapeHtml(item.email || '—')}</td><td><span class="document-status ${item.active === false ? 'status-cancelled' : 'status-paid'}">${item.active === false ? 'Inactivo' : 'Activo'}</span></td><td><button class="icon-button" data-client-edit="${item.id}" aria-label="Editar"><i data-lucide="pencil"></i></button></td></tr>`; }
function modal(formId,title,contents,submitLabel) { return `<div class="modal-backdrop" data-modal-close><form id="${formId}" class="modal-card form-modal" data-modal-card><header><div><span class="eyebrow">Directorio</span><h2>${title}</h2></div><button class="icon-button" type="button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button></header><div class="stack-form">${contents}</div><footer class="modal-actions"><button class="button secondary" type="button" data-modal-close>Cancelar</button><button class="button primary" type="submit">${submitLabel}</button></footer></form></div>`; }
function empty(icon,title,copy) { return `<div class="empty-state"><i data-lucide="${icon}"></i><strong>${title}</strong><p>${copy}</p></div>`; }
