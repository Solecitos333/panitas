import { escapeHtml, formatDate, formatMoney } from '../lib/format.js';
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

export function renderCash(state) {
  const active = state.activeCash;
  const sessionPayments = active ? state.payments.filter((item) => item.cashSessionId === active.id) : [];
  const sessionMovements = active ? state.cashMovements.filter((item) => item.cashSessionId === active.id) : [];
  const cashCollected = sessionPayments.filter((item) => item.method === 'cash').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const cashIn = sessionMovements.filter((item) => item.type === 'in').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const cashOut = sessionMovements.filter((item) => item.type === 'out').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
  const expectedCash = active ? Number(active.openingCents) + cashCollected + cashIn - cashOut : 0;
  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Control de caja</span>
        <h2>${active ? 'Caja abierta' : 'Inicia tu jornada'}</h2>
        <p>Registra apertura, cobros y cierre con diferencia calculada.</p>
      </div>
      <div class="header-actions">
        ${active ? `<button class="drawer-kick-btn" type="button" data-drawer-kick><i data-lucide="wallet"></i> Abrir gaveta</button>` : ''}
        <div class="status-chip ${active ? 'online' : 'muted'}"><i data-lucide="circle-dollar-sign"></i>${active ? 'Sesión activa' : 'Sin sesión'}</div>
      </div>
    </section>
    ${active ? `
      <div class="metric-grid cash-metric-grid">
        <article class="metric-card"><i data-lucide="wallet"></i><div><span>Fondo inicial</span><strong>${formatMoney(active.openingCents)}</strong></div></article>
        <article class="metric-card positive"><i data-lucide="badge-dollar-sign"></i><div><span>Ventas en efectivo</span><strong>${formatMoney(cashCollected)}</strong></div></article>
        <article class="metric-card positive"><i data-lucide="plus"></i><div><span>Entradas</span><strong>${formatMoney(cashIn)}</strong></div></article>
        <article class="metric-card"><i data-lucide="landmark"></i><div><span>Salidas</span><strong>${formatMoney(cashOut)}</strong></div></article>
        <article class="metric-card"><i data-lucide="calculator"></i><div><span>Efectivo esperado</span><strong>${formatMoney(expectedCash)}</strong></div></article>
      </div>
      <section class="surface-card cash-movement-card">
        <div>
          <span class="eyebrow">Libro de efectivo</span>
          <h3>Registrar entrada o salida</h3>
          <p>Cada movimiento queda asociado a esta sesión y no puede editarse ni eliminarse.</p>
        </div>
        <form id="cash-movement-form" class="inline-form cash-movement-form">
          <label>Movimiento<select name="type" required><option value="in">Entrada de efectivo</option><option value="out">Salida de efectivo</option></select></label>
          <label>Monto<input name="amount" type="number" min="0.01" step="0.01" required></label>
          <label>Motivo<input name="reason" minlength="3" maxlength="300" placeholder="Compra menor, cambio, depósito…" required></label>
          <button class="button primary" type="submit">Registrar movimiento</button>
        </form>
      </section>
      <section class="surface-card cash-action">
        <div>
          <span class="eyebrow">Abierta por ${escapeHtml(active.openedByName)}</span>
          <h3>${formatDate(active.openedAt,true)}</h3>
          <p>${escapeHtml(active.notes || 'Sin notas de apertura.')}</p>
          <div style="margin-top: 14px; display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="button secondary compact" data-cash-corte-x="${active.id}"><i data-lucide="receipt"></i> Imprimir Corte X (Parcial)</button>
            <button type="button" class="button secondary compact" data-cash-report-print="${active.id}"><i data-lucide="printer"></i> Imprimir Arqueo</button>
          </div>
        </div>
        <form id="cash-close-form" class="inline-form">
          <input type="hidden" name="expected" value="${expectedCash}">
          <label>Efectivo contado<input name="closing" type="number" min="0" step="0.01" required></label>
          <label>Nota de cierre<input name="notes" maxlength="500"></label>
          <button class="button danger" type="submit"><i data-lucide="lock"></i> Cerrar caja (Corte Z)</button>
        </form>
      </section>` : `
      <section class="surface-card empty-action">
        <i data-lucide="wallet-cards"></i>
        <div>
          <h3>Abre una caja para registrar cobros</h3>
          <p>El fondo inicial formará parte del arqueo final.</p>
        </div>
        <form id="cash-open-form" class="inline-form">
          <label>Fondo inicial<input name="opening" type="number" min="0" step="0.01" value="0" required></label>
          <label>Nota<input name="notes" maxlength="500" placeholder="Turno, responsable…"></label>
          <button class="button primary" type="submit">Abrir caja</button>
        </form>
      </section>`}
    ${active ? `<section class="surface-card data-surface">
      <header><div><span class="eyebrow">Trazabilidad</span><h3>Movimientos de la sesión</h3></div><strong>${sessionMovements.length} registro(s)</strong></header>
      <div class="table-scroll"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Usuario</th><th>Monto</th></tr></thead><tbody>
        ${sessionMovements.length ? sessionMovements.map((item) => `<tr><td>${formatDate(item.createdAt,true)}</td><td><span class="document-status ${item.type === 'in' ? 'status-paid' : 'status-cancelled'}">${item.type === 'in' ? 'Entrada' : 'Salida'}</span></td><td>${escapeHtml(item.reason)}</td><td>${escapeHtml(item.createdByName || 'Usuario')}</td><td>${item.type === 'in' ? '+' : '-'}${formatMoney(item.amountCents)}</td></tr>`).join('') : '<tr><td colspan="5">Sin entradas o salidas manuales en esta sesión.</td></tr>'}
      </tbody></table></div>
    </section>` : ''}
    <section class="surface-card data-surface">
      <header><div><span class="eyebrow">Historial</span><h3>Sesiones recientes</h3></div></header>
      <div class="table-scroll">
        <table>
          <thead>
            <tr><th>Responsable</th><th>Apertura</th><th>Fondo</th><th>Cierre</th><th>Diferencia</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            ${state.cashSessions.map((item) => `<tr><td>${escapeHtml(item.openedByName || 'Usuario')}</td><td>${formatDate(item.openedAt,true)}</td><td>${formatMoney(item.openingCents)}</td><td>${item.status === 'closed' ? formatMoney(item.closingCents) : '—'}</td><td>${item.status === 'closed' ? formatMoney(item.varianceCents) : '—'}</td><td><span class="document-status ${item.status === 'open' ? 'status-paid' : ''}">${item.status === 'open' ? 'Abierta' : 'Cerrada'}</span></td><td><button class="icon-button" data-cash-report-print="${item.id}" title="Imprimir arqueo"><i data-lucide="printer"></i></button></td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
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
        <div style="display: grid; gap: 10px; margin-top: 14px;">
          <label class="check-field"><input name="autoOpenDrawer" type="checkbox" ${item.autoOpenDrawer !== false ? 'checked' : ''}> Abrir gaveta automáticamente al cobrar en efectivo</label>
          <label class="check-field"><input name="autoPrintInvoice" type="checkbox" ${item.autoPrintInvoice !== false ? 'checked' : ''}> Imprimir ticket automáticamente al completar cobro</label>
          <label class="check-field"><input name="autoPrintKitchen" type="checkbox" ${item.autoPrintKitchen !== false ? 'checked' : ''}> Imprimir comanda automáticamente al enviar a cocina</label>
          <label class="check-field"><input name="enableEloScanner" type="checkbox" ${item.enableEloScanner ? 'checked' : ''}> Activar luz de escáner láser automáticamente al entrar al POS</label>
        </div>
        <div class="hardware-test-grid">
          <button type="button" class="button secondary compact" data-test-print><i data-lucide="printer"></i> Probar ticket de prueba (80mm)</button>
          <button type="button" class="button secondary compact" data-test-drawer><i data-lucide="wallet"></i> Probar pulso de apertura de gaveta</button>
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

      <footer class="form-footer"><button class="button primary" type="submit"><i data-lucide="save"></i> Guardar configuración</button></footer>
    </form>`;
}

export function renderUsers(state) {
  const profiles = state.users || [];
  const rows = profiles.map((item) => userRow(item, item.id === state.user.uid));
  return `
    <section class="panel-heading"><div><span class="eyebrow">Equipo y permisos</span><h2>Usuarios</h2><p>Crea nombres de acceso independientes y asigna a cada persona únicamente las funciones necesarias.</p></div><button class="button primary" data-user-new><i data-lucide="user-plus"></i> Nuevo usuario</button></section>
    <div class="metric-grid"><article class="metric-card"><i data-lucide="users"></i><div><span>Usuarios activos</span><strong>${profiles.filter((item) => item.active !== false).length}</strong></div></article><article class="metric-card"><i data-lucide="shield-check"></i><div><span>Accesos desactivados</span><strong>${profiles.filter((item) => item.active === false).length}</strong></div></article></div>
    <section class="surface-card data-surface"><header><div><span class="eyebrow">Control de acceso</span><h3>Personal autorizado</h3></div></header><div class="table-scroll"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Acceso</th><th></th></tr></thead><tbody>${rows.length ? rows.join('') : '<tr><td colspan="5">No hay usuarios registrados.</td></tr>'}</tbody></table></div></section>
    <section class="surface-card access-help"><i data-lucide="shield-check"></i><div><h3>Sin correos ni contraseñas compartidas</h3><p>La contraseña solo se utiliza para autenticar y nunca se guarda en Firestore. Cada usuario puede cambiarla después desde su sesión.</p></div></section>`;
}

export function renderUserForm(item = {}) {
  const profile = Boolean(item.id);
  const currentRole = Array.isArray(item.roles) ? item.roles[0] : 'waiter';
  return `<div class="modal-backdrop" data-modal-close><form id="user-access-form" class="modal-card form-modal" data-modal-card><header><div><span class="eyebrow">Acceso protegido</span><h2>${profile ? 'Editar usuario' : 'Crear usuario'}</h2></div><button type="button" class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button></header><div class="stack-form"><input type="hidden" name="uid" value="${profile ? escapeHtml(item.id) : ''}"><label>Nombre completo<input name="displayName" required maxlength="160" autocomplete="off" value="${escapeHtml(item.displayName || '')}"></label><label>Nombre de usuario<input name="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9._-]+" autocapitalize="characters" autocomplete="off" value="${escapeHtml(item.username || '')}" ${profile ? 'readonly' : ''}></label>${profile ? '' : '<div class="form-grid two"><label>Contraseña inicial<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label>Confirmar contraseña<input name="passwordConfirm" type="password" minlength="8" autocomplete="new-password" required></label></div>'}<label>Rol<select name="role">${roleOptions(currentRole)}</select></label><label class="check-field"><input name="active" type="checkbox" ${item.active === false ? '' : 'checked'}> Acceso habilitado</label><div class="form-note"><i data-lucide="shield-check"></i><span>Cada persona crea su PIN privado de cuatro dígitos al realizar su primer cobro. El propietario no puede verlo ni cambiarlo desde esta lista.</span></div></div><footer class="modal-actions"><button type="button" class="button secondary" data-modal-close>Cancelar</button><button class="button primary" type="submit">${profile ? 'Guardar acceso' : 'Crear usuario'}</button></footer></form></div>`;
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

export function renderAuditLogs(state) {
  const logs = state.auditLogs || [];
  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Seguridad y Control</span>
        <h2>Auditoría del sistema y gaveta</h2>
        <p>Registro inmutable de aperturas de caja con PIN y eventos críticos de seguridad.</p>
      </div>
      <button class="button secondary" data-refresh><i data-lucide="refresh-cw"></i> Actualizar</button>
    </section>
    <div class="metric-grid">
      <article class="metric-card"><i data-lucide="shield-check"></i><div><span>Total registros</span><strong>${logs.length}</strong></div></article>
      <article class="metric-card positive"><i data-lucide="wallet"></i><div><span>Aperturas de gaveta</span><strong>${logs.filter(l => l.action === 'cash.drawer_opened').length}</strong></div></article>
      <article class="metric-card warning"><i data-lucide="shield-alert"></i><div><span>Intentos fallidos</span><strong>${logs.filter(l => l.action === 'cash.drawer_failed').length}</strong></div></article>
    </div>
    <section class="surface-card data-surface">
      <div class="toolbar">
        <label class="search-field">
          <i data-lucide="search"></i>
          <input id="audit-search" type="search" placeholder="Buscar por usuario, acción o motivo...">
        </label>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha y Hora</th>
              <th>Acción</th>
              <th>Responsable</th>
              <th>Detalle / Motivo</th>
            </tr>
          </thead>
          <tbody id="audit-table-body">
            ${logs.length ? logs.map(auditRow).join('') : '<tr><td colspan="4"><div class="empty-state"><i data-lucide="shield-check"></i><strong>Sin registros</strong><p>Los eventos de seguridad y apertura de caja aparecerán aquí.</p></div></td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function auditRow(item) {
  const isFailed = item.action?.includes('failed');
  const isDrawer = item.action?.includes('drawer');
  const toneClass = isFailed ? 'status-cancelled' : isDrawer ? 'status-paid' : 'status-partial';
  const actionLabel = ({
    'cash.drawer_opened': 'Apertura de gaveta (PIN)',
    'cash.drawer_failed': 'Intento fallido de PIN',
    'cash.opened': 'Apertura de turno',
    'cash.closed': 'Cierre de turno',
    'cash.movement_in': 'Entrada de efectivo',
    'cash.movement_out': 'Salida de caja / Gasto',
    'user.created': 'Usuario creado',
    'user.updated': 'Usuario modificado',
    'settings.updated': 'Configuración modificada'
  })[item.action] || item.action;

  return `<tr data-audit-row data-search="${escapeHtml(`${item.action} ${item.actorName || ''} ${item.details || ''} ${item.reason || ''}`.toLowerCase())}">
    <td><strong>${formatDate(item.createdAt, true)}</strong></td>
    <td><span class="document-status ${toneClass}">${escapeHtml(actionLabel)}</span></td>
    <td><strong>${escapeHtml(item.actorName || item.actorEmail || 'Sistema')}</strong></td>
    <td><span style="font-size:0.84rem;color:#ccc;">${escapeHtml(item.details || item.reason || '—')}</span></td>
  </tr>`;
}
