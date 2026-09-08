import { escapeHtml, formatDate, formatMoney } from '../lib/format.js';
import { getPendingDeliveryInvoices } from '../domain/billing.js';

export function renderDeliveries(state) {
  const drivers = state.deliveryDrivers || [];
  const pendingInvoices = getPendingDeliveryInvoices(state.invoices);

  // Calcular totales
  const totalPendingCents = pendingInvoices.reduce((sum, inv) => {
    return sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0));
  }, 0);

  // Agrupar facturas por repartidor
  const driverMap = new Map();

  // Inicializar con repartidores registrados que tengan o no entregas
  for (const inv of pendingInvoices) {
    const driverKey = inv.deliveryDriverId || inv.deliveryDriverName || 'sin_asignar';
    if (!driverMap.has(driverKey)) {
      const regDriver = drivers.find(d => d.id === inv.deliveryDriverId || d.name.toLowerCase() === String(inv.deliveryDriverName || '').toLowerCase());
      driverMap.set(driverKey, {
        id: inv.deliveryDriverId || regDriver?.id || '',
        name: inv.deliveryDriverName || regDriver?.name || 'Repartidor No Asignado',
        phone: regDriver?.phone || inv.deliveryPhone || '',
        vehicle: regDriver?.vehicle || '',
        invoices: [],
        totalToCollectCents: 0
      });
    }
    const entry = driverMap.get(driverKey);
    const balanceCents = Number(inv.totalCents || 0) - Number(inv.paidCents || 0);
    entry.invoices.push({ ...inv, balanceCents });
    entry.totalToCollectCents += balanceCents;
  }

  const driversInRoute = Array.from(driverMap.values()).sort((a, b) => b.totalToCollectCents - a.totalToCollectCents);

  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Logística y Reparto</span>
        <h2>Control y Liquidación de Deliveries</h2>
        <p>Seguimiento de pedidos en camino, dinero en la calle y cuadre de efectivo por repartidor.</p>
      </div>
      <div class="header-actions" style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="button secondary" data-driver-new><i data-lucide="user-plus"></i> Registrar Repartidor</button>
        <button class="button primary" data-route="pos"><i data-lucide="plus"></i> Nuevo Delivery en POS</button>
      </div>
    </section>

    <div class="metric-grid">
      <article class="metric-card warning">
        <i data-lucide="bike"></i>
        <div>
          <span>Dinero en la Calle (Por Liquidar)</span>
          <strong>${formatMoney(totalPendingCents)}</strong>
        </div>
      </article>
      <article class="metric-card">
        <i data-lucide="users"></i>
        <div>
          <span>Repartidores en Ruta</span>
          <strong>${driversInRoute.length}</strong>
        </div>
      </article>
      <article class="metric-card">
        <i data-lucide="package"></i>
        <div>
          <span>Entregas en Camino</span>
          <strong>${pendingInvoices.length}</strong>
        </div>
      </article>
    </div>

    <!-- SECCIÓN: REPARTIDORES CON ENTREGAS ACTIVAS -->
    <section class="surface-card data-surface" style="margin-bottom:20px;">
      <header style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--line);">
        <div>
          <span class="eyebrow">En la calle</span>
          <h3 style="margin:2px 0 0;font-size:1.1rem;">Entregas pendientes de cobro y liquidación</h3>
        </div>
        <span class="status-chip ${driversInRoute.length ? 'online' : 'muted'}">
          ${driversInRoute.length ? `${driversInRoute.length} en reparto` : 'Todo al día'}
        </span>
      </header>

      <div style="padding:16px;">
        ${driversInRoute.length ? driversInRoute.map(driverCard).join('') : `
          <div class="empty-state" style="padding:48px 20px;text-align:center;">
            <i data-lucide="badge-check" style="width:48px;height:48px;color:#3fb950;margin:0 auto 12px;display:block;"></i>
            <h3>¡No hay entregas pendientes de liquidación!</h3>
            <p style="color:var(--muted);max-width:440px;margin:0 auto;">Todos los repartidores han entregado el dinero correspondiente a la caja registradora.</p>
          </div>
        `}
      </div>
    </section>

    <!-- SECCIÓN: DIRECTORIO DE REPARTIDORES -->
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

function cleanPhoneForWa(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return '1' + digits;
  return digits;
}

function driverCard(driver) {
  const cleanPhone = cleanPhoneForWa(driver.phone);
  const waMessage = encodeURIComponent(`Hola ${driver.name}, un saludo de Los Panitas. ¿Cómo van las entregas en ruta?`);

  return `
    <article class="driver-delivery-card surface-card" style="margin-bottom:16px;border:1px solid rgba(245,158,11,.3);background:rgba(245,158,11,.03);padding:18px;border-radius:14px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="width:48px;height:48px;border-radius:12px;background:rgba(245,158,11,.18);color:#f59e0b;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i data-lucide="bike" style="width:26px;height:26px;"></i>
          </div>
          <div>
            <h3 style="margin:0;font-size:1.2rem;font-weight:700;color:#fff;">${escapeHtml(driver.name)}</h3>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;">
              ${driver.vehicle ? `<span style="font-size:0.8rem;color:var(--muted);">${escapeHtml(driver.vehicle)}</span>` : ''}
              ${driver.phone ? `
                <a href="tel:${escapeHtml(driver.phone)}" class="button secondary compact" style="padding:2px 8px;font-size:0.78rem;color:#58a6ff;border-color:rgba(88,166,255,.3);" title="Llamar">
                  <i data-lucide="phone"></i> ${escapeHtml(driver.phone)}
                </a>
                <a href="https://wa.me/${escapeHtml(cleanPhone)}?text=${waMessage}" target="_blank" rel="noopener" class="button secondary compact" style="padding:2px 8px;font-size:0.78rem;color:#25D366;border-color:rgba(37,211,102,.3);" title="WhatsApp">
                  <i data-lucide="message-square"></i> WhatsApp
                </a>
              ` : '<span style="font-size:0.75rem;color:var(--muted);font-style:italic;">Sin teléfono registrado</span>'}
              <span style="font-size:0.8rem;color:#f59e0b;font-weight:600;">· ${driver.invoices.length} entrega(s) en camino</span>
            </div>
          </div>
        </div>
        <div style="text-align:right;">
          <span style="font-size:0.75rem;color:var(--muted);display:block;text-transform:uppercase;letter-spacing:.5px;">Efectivo en mano</span>
          <strong style="font-size:1.5rem;color:#f59e0b;font-weight:800;">${formatMoney(driver.totalToCollectCents)}</strong>
          <div style="margin-top:6px;">
            <button type="button" class="button primary" data-delivery-settle="${escapeHtml(driver.id || driver.name)}" style="padding:7px 16px;font-size:0.88rem;font-weight:700;">
              <i data-lucide="wallet-cards"></i> Liquidar entregas (${formatMoney(driver.totalToCollectCents)})
            </button>
          </div>
        </div>
      </div>

      <!-- Detalle de facturas asignadas -->
      <div style="display:flex;flex-direction:column;gap:8px;border-top:1px solid rgba(255,255,255,.08);padding-top:12px;">
        ${driver.invoices.map((inv) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(0,0,0,.25);border-radius:10px;border:1px solid rgba(255,255,255,.05);gap:12px;flex-wrap:wrap;">
            <div style="flex:1;min-width:240px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <strong style="font-size:0.9rem;color:var(--brand-2);">${escapeHtml(inv.invoiceNumber)}</strong>
                <span style="font-size:0.78rem;color:var(--muted);">${formatDate(inv.createdAt, true)}</span>
                <span class="document-status status-partial" style="font-size:0.7rem;padding:2px 6px;">En ruta</span>
              </div>
              <div style="font-size:0.88rem;color:#fff;font-weight:600;margin-top:2px;">
                ${escapeHtml(inv.clientName)} ${inv.deliveryPhone ? `· <span style="font-size:0.8rem;color:var(--muted);">${escapeHtml(inv.deliveryPhone)}</span>` : ''}
              </div>
              ${inv.deliveryAddress ? `
                <div style="font-size:0.8rem;color:#cbd5e1;margin-top:2px;display:flex;align-items:center;gap:4px;">
                  <i data-lucide="map-pin" style="width:13px;height:13px;color:#f59e0b;flex-shrink:0;"></i>
                  <span>${escapeHtml(inv.deliveryAddress)}</span>
                </div>
              ` : ''}
              ${inv.deliveryNotes ? `
                <small style="color:var(--muted);display:block;font-style:italic;margin-top:2px;">Nota: ${escapeHtml(inv.deliveryNotes)}</small>
              ` : ''}
            </div>

            <div style="display:flex;align-items:center;gap:14px;">
              <div style="text-align:right;">
                <span style="font-size:0.75rem;color:var(--muted);display:block;">A cobrar</span>
                <strong style="font-size:1.1rem;color:#fff;">${formatMoney(inv.balanceCents)}</strong>
              </div>
              <button type="button" class="button secondary compact" data-delivery-settle-single="${escapeHtml(inv.id)}" title="Liquidar solo esta entrega" style="font-size:0.8rem;padding:6px 10px;">
                <i data-lucide="circle-dollar-sign"></i> Cobrar
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </article>
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
