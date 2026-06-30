import { escapeHtml, formatDate, formatMoney } from '../lib/format.js';

export function renderCash(state) {
  const active = state.activeCash;
  const sessionPayments = active ? state.payments.filter((item) => item.cashSessionId === active.id) : [];
  const collected = sessionPayments.reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const cashCollected = sessionPayments.filter((item) => item.method === 'cash').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const expectedCash = active ? Number(active.openingCents) + cashCollected : 0;
  return `
    <section class="panel-heading"><div><span class="eyebrow">Control de caja</span><h2>${active ? 'Caja abierta' : 'Inicia tu jornada'}</h2><p>Registra apertura, cobros y cierre con diferencia calculada.</p></div><div class="status-chip ${active ? 'online' : 'muted'}"><i data-lucide="circle-dollar-sign"></i>${active ? 'Sesión activa' : 'Sin sesión'}</div></section>
    ${active ? `<div class="metric-grid"><article class="metric-card"><i data-lucide="wallet"></i><div><span>Fondo inicial</span><strong>${formatMoney(active.openingCents)}</strong></div></article><article class="metric-card positive"><i data-lucide="badge-dollar-sign"></i><div><span>Cobrado total</span><strong>${formatMoney(collected)}</strong></div></article><article class="metric-card"><i data-lucide="calculator"></i><div><span>Efectivo esperado</span><strong>${formatMoney(expectedCash)}</strong></div></article></div><section class="surface-card cash-action"><div><span class="eyebrow">Abierta por ${escapeHtml(active.openedByName)}</span><h3>${formatDate(active.openedAt,true)}</h3><p>${escapeHtml(active.notes || 'Sin notas de apertura.')}</p></div><form id="cash-close-form" class="inline-form"><input type="hidden" name="expected" value="${expectedCash}"><label>Efectivo contado<input name="closing" type="number" min="0" step="0.01" required></label><label>Nota<input name="notes" maxlength="500"></label><button class="button danger" type="submit">Cerrar caja</button></form></section>` : `<section class="surface-card empty-action"><i data-lucide="wallet-cards"></i><div><h3>Abre una caja para registrar cobros</h3><p>El fondo inicial formará parte del arqueo final.</p></div><form id="cash-open-form" class="inline-form"><label>Fondo inicial<input name="opening" type="number" min="0" step="0.01" value="0" required></label><label>Nota<input name="notes" maxlength="500" placeholder="Turno, responsable…"></label><button class="button primary" type="submit">Abrir caja</button></form></section>`}
    <section class="surface-card data-surface"><header><div><span class="eyebrow">Historial</span><h3>Sesiones recientes</h3></div></header><div class="table-scroll"><table><thead><tr><th>Responsable</th><th>Apertura</th><th>Fondo</th><th>Cierre</th><th>Diferencia</th><th>Estado</th></tr></thead><tbody>${state.cashSessions.map((item) => `<tr><td>${escapeHtml(item.openedByName || 'Usuario')}</td><td>${formatDate(item.openedAt,true)}</td><td>${formatMoney(item.openingCents)}</td><td>${item.status === 'closed' ? formatMoney(item.closingCents) : '—'}</td><td>${item.status === 'closed' ? formatMoney(item.varianceCents) : '—'}</td><td><span class="document-status ${item.status === 'open' ? 'status-paid' : ''}">${item.status === 'open' ? 'Abierta' : 'Cerrada'}</span></td></tr>`).join('')}</tbody></table></div></section>`;
}

export function renderSettings(state) {
  const item = state.settings || {};
  return `
    <section class="panel-heading"><div><span class="eyebrow">Configuración</span><h2>Identidad y facturación</h2><p>Solo el propietario puede modificar estos valores.</p></div></section>
    <form id="settings-form" class="surface-card settings-form stack-form"><div class="form-section"><h3>Negocio</h3><div class="form-grid two"><label>Nombre comercial<input name="name" required maxlength="160" value="${escapeHtml(item.name || '')}"></label><label>Razón social<input name="legalName" maxlength="160" value="${escapeHtml(item.legalName || '')}"></label></div><div class="form-grid three"><label>RNC<input name="rnc" maxlength="30" value="${escapeHtml(item.rnc || '')}"></label><label>Teléfono<input name="phone" maxlength="30" value="${escapeHtml(item.phone || '')}"></label><label>Correo<input name="email" type="email" maxlength="160" value="${escapeHtml(item.email || '')}"></label></div><label>Dirección<textarea name="address" maxlength="300">${escapeHtml(item.address || '')}</textarea></label></div><div class="form-section"><h3>Documentos</h3><div class="form-grid three"><label>Prefijo factura<input name="invoicePrefix" required maxlength="12" value="${escapeHtml(item.invoicePrefix || 'PAN-')}"></label><label>Prefijo cotización<input name="quotePrefix" required maxlength="12" value="${escapeHtml(item.quotePrefix || 'COT-')}"></label><label>Prefijo proforma<input name="proformaPrefix" required maxlength="12" value="${escapeHtml(item.proformaPrefix || 'PROF-')}"></label></div><div class="form-grid two"><label>ITBIS predeterminado %<input name="defaultTaxRate" type="number" min="0" max="100" step="0.01" value="${item.defaultTaxRate ?? 0}"></label><label>Pie de recibo<input name="receiptFooter" maxlength="300" value="${escapeHtml(item.receiptFooter || '')}"></label></div></div><footer class="form-footer"><button class="button primary" type="submit"><i data-lucide="save"></i> Guardar configuración</button></footer></form>`;
}

export function renderUsers(state) {
  const profiles = state.users || [];
  const activeEmails = new Set(profiles.map((item) => String(item.email || '').toLowerCase()));
  const pending = (state.userInvites || []).filter((item) => !activeEmails.has(String(item.email || '').toLowerCase()));
  const rows = [
    ...profiles.map((item) => userRow(item, 'profile', item.id === state.user.uid)),
    ...pending.map((item) => userRow(item, 'invite', false))
  ];
  return `
    <section class="panel-heading"><div><span class="eyebrow">Equipo y permisos</span><h2>Usuarios</h2><p>Invita cuentas de Google, asigna funciones y desactiva accesos sin compartir contraseñas.</p></div><button class="button primary" data-user-new><i data-lucide="user-plus"></i> Nuevo usuario</button></section>
    <div class="metric-grid"><article class="metric-card"><i data-lucide="users"></i><div><span>Usuarios activos</span><strong>${profiles.filter((item) => item.active !== false).length}</strong></div></article><article class="metric-card"><i data-lucide="clock-3"></i><div><span>Invitaciones pendientes</span><strong>${pending.filter((item) => item.active !== false).length}</strong></div></article></div>
    <section class="surface-card data-surface"><header><div><span class="eyebrow">Control de acceso</span><h3>Personal autorizado</h3></div></header><div class="table-scroll"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Acceso</th><th></th></tr></thead><tbody>${rows.length ? rows.join('') : '<tr><td colspan="5">No hay usuarios registrados.</td></tr>'}</tbody></table></div></section>
    <section class="surface-card access-help"><i data-lucide="shield-check"></i><div><h3>Activación segura con Google</h3><p>El usuario elige esta misma dirección en “Continuar con Google”. La app valida la invitación y activa exactamente el rol que asignaste.</p></div></section>`;
}

export function renderUserForm(item = {}, source = 'invite') {
  const profile = source === 'profile';
  const currentRole = Array.isArray(item.roles) ? item.roles[0] : 'waiter';
  return `<div class="modal-backdrop" data-modal-close><form id="user-access-form" class="modal-card form-modal" data-modal-card><header><div><span class="eyebrow">Acceso protegido</span><h2>${item.id ? 'Editar usuario' : 'Invitar usuario'}</h2></div><button type="button" class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button></header><div class="stack-form"><input type="hidden" name="uid" value="${profile ? escapeHtml(item.id || '') : ''}"><label>Nombre completo<input name="displayName" required maxlength="160" autocomplete="off" value="${escapeHtml(item.displayName || '')}"></label><label>Correo de Google<input name="email" type="email" required maxlength="160" autocomplete="off" value="${escapeHtml(item.email || '')}" ${profile ? 'readonly' : ''}></label><label>Rol<select name="role">${roleOptions(currentRole)}</select></label><label class="check-field"><input name="active" type="checkbox" ${item.active === false ? '' : 'checked'}> Acceso habilitado</label><div class="form-note"><i data-lucide="badge-check"></i><span>${profile ? 'Los cambios se aplican a la próxima operación del usuario.' : 'No se crea ninguna contraseña. La persona debe entrar con esta misma cuenta de Google.'}</span></div></div><footer class="modal-actions"><button type="button" class="button secondary" data-modal-close>Cancelar</button><button class="button primary" type="submit">${profile ? 'Guardar acceso' : 'Crear invitación'}</button></footer></form></div>`;
}

function userRow(item, source, self) {
  const role = Array.isArray(item.roles) ? item.roles[0] : '';
  const pending = source === 'invite';
  const enabled = item.active !== false;
  return `<tr><td><strong>${escapeHtml(item.displayName || 'Sin nombre')}</strong>${self ? '<small class="table-note">Tu cuenta</small>' : ''}</td><td>${escapeHtml(item.email || '—')}</td><td><span class="role-chip">${roleLabel(role)}</span></td><td><span class="document-status ${!enabled ? 'status-cancelled' : pending ? 'status-pending' : 'status-paid'}">${!enabled ? 'Desactivado' : pending ? 'Pendiente' : 'Activo'}</span></td><td>${self ? '<span class="protected-account"><i data-lucide="shield-check"></i> Protegida</span>' : `<button class="icon-button" data-user-edit="${escapeHtml(item.id)}" data-user-source="${source}" aria-label="Editar usuario"><i data-lucide="pencil"></i></button>`}</td></tr>`;
}

function roleOptions(selected) {
  return [['owner','Propietario · acceso completo'],['manager','Gerencia · operación y reportes'],['cashier','Caja · ventas y cobros'],['waiter','Camarero · mesas y comandas'],['kitchen','Cocina · KDS']].map(([value,label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function roleLabel(role) {
  return ({ owner:'Propietario', manager:'Gerencia', cashier:'Caja', waiter:'Camarero', kitchen:'Cocina' })[role] || 'Sin rol';
}
