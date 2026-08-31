import { escapeHtml, formatDate, formatMoney } from '../lib/format.js';

export function renderReceivables(state) {
  const pendingInvoices = (state.invoices || []).filter(
    (inv) => inv.documentType === 'invoice' &&
      inv.status !== 'paid' &&
      inv.status !== 'cancelled' &&
      (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)) > 0
  );

  const totalPendingCents = pendingInvoices.reduce((sum, inv) => {
    return sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0));
  }, 0);

  // Agrupar por cliente
  const clientMap = new Map();
  for (const inv of pendingInvoices) {
    const clientKey = String(inv.clientName || 'Cliente').trim();
    if (!clientMap.has(clientKey)) {
      clientMap.set(clientKey, {
        name: clientKey,
        clientId: inv.clientId || '',
        invoices: [],
        totalDebtCents: 0
      });
    }
    const entry = clientMap.get(clientKey);
    const balanceCents = Number(inv.totalCents || 0) - Number(inv.paidCents || 0);
    entry.invoices.push({ ...inv, balanceCents });
    entry.totalDebtCents += balanceCents;
  }

  const clientsWithDebt = Array.from(clientMap.values()).sort((a, b) => b.totalDebtCents - a.totalDebtCents);

  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Crédito y Cobranzas</span>
        <h2>Fiao y Cuentas por Cobrar</h2>
        <p>Control de consumos pendientes de pago y cobro directo de clientes fiados.</p>
      </div>
      <div class="header-actions">
        <button class="button primary" data-route="pos"><i data-lucide="plus"></i> Nuevo Fiao en POS</button>
      </div>
    </section>

    <div class="metric-grid">
      <article class="metric-card warning">
        <i data-lucide="book-open"></i>
        <div>
          <span>Total en Fiao Pendiente</span>
          <strong>${formatMoney(totalPendingCents)}</strong>
        </div>
      </article>
      <article class="metric-card">
        <i data-lucide="users"></i>
        <div>
          <span>Clientes con Deuda</span>
          <strong>${clientsWithDebt.length}</strong>
        </div>
      </article>
      <article class="metric-card">
        <i data-lucide="receipt"></i>
        <div>
          <span>Consumos / Cuentas</span>
          <strong>${pendingInvoices.length}</strong>
        </div>
      </article>
    </div>

    <section class="surface-card data-surface">
      <div class="toolbar">
        <label class="search-field">
          <i data-lucide="search"></i>
          <input id="fiao-search" type="search" placeholder="Buscar por nombre del cliente fiado...">
        </label>
      </div>

      <div class="fiao-list" id="fiao-list-container">
        ${clientsWithDebt.length ? clientsWithDebt.map(debtCard).join('') : `
          <div class="empty-state" style="padding:48px 20px;text-align:center;">
            <i data-lucide="badge-check" style="width:48px;height:48px;color:#3fb950;margin:0 auto 12px;display:block;"></i>
            <h3>¡Al día con los Fiaos!</h3>
            <p style="color:var(--muted);max-width:400px;margin:0 auto;">No hay cuentas de comida fiada pendientes por cobrar en este momento.</p>
          </div>
        `}
      </div>
    </section>
  `;
}

function debtCard(client) {
  return `
    <article class="fiao-debt-card surface-card" data-fiao-card data-search="${escapeHtml(client.name.toLowerCase())}" style="margin-bottom:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);padding:18px;border-radius:14px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:44px;height:44px;border-radius:10px;background:rgba(239,189,105,.15);color:var(--brand-2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.2rem;">
            ${escapeHtml(client.name.charAt(0).toUpperCase())}
          </div>
          <div>
            <h3 style="margin:0;font-size:1.15rem;font-weight:700;color:#fff;">${escapeHtml(client.name)}</h3>
            <span style="font-size:0.8rem;color:var(--muted);">${client.invoices.length} consumo(s) registrado(s)</span>
          </div>
        </div>
        <div style="text-align:right;">
          <span style="font-size:0.75rem;color:var(--muted);display:block;text-transform:uppercase;letter-spacing:.5px;">Deuda Total</span>
          <strong style="font-size:1.4rem;color:#f85149;font-weight:800;">${formatMoney(client.totalDebtCents)}</strong>
        </div>
      </div>

      <div class="fiao-invoices-scroll" style="display:flex;flex-direction:column;gap:8px;border-top:1px solid rgba(255,255,255,.06);padding-top:12px;">
        ${client.invoices.map((inv) => `
          <div class="fiao-item-row" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(0,0,0,.2);border-radius:8px;border:1px solid rgba(255,255,255,.04);gap:8px;flex-wrap:wrap;">
            <div>
              <div style="display:flex;align-items:center;gap:8px;">
                <strong style="font-size:0.88rem;color:var(--brand-2);">${escapeHtml(inv.invoiceNumber)}</strong>
                <span style="font-size:0.75rem;color:var(--muted);">${formatDate(inv.createdAt, true)}</span>
              </div>
              <div style="font-size:0.8rem;color:#ccc;margin-top:2px;">
                ${(inv.items || []).map(i => `${i.quantity}x ${escapeHtml(i.name)}`).join(' · ')}
              </div>
              ${inv.notes ? `<small style="color:var(--muted);display:block;font-style:italic;">Nota: ${escapeHtml(inv.notes)}</small>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:12px;">
              <strong style="font-size:1rem;color:#fff;">${formatMoney(inv.balanceCents)}</strong>
              <button type="button" class="button primary compact" data-fiao-pay="${escapeHtml(inv.id)}" style="font-size:0.8rem;padding:6px 14px;">
                <i data-lucide="circle-dollar-sign"></i> Cobrar este fiao
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
            <input name="amount" id="fiao-pay-amount" type="number" min="1" max="${(balanceCents / 100).toFixed(2)}" step="0.01" value="${(balanceCents / 100).toFixed(2)}" required style="font-size:1.2rem;font-weight:700;">
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

          <label>PIN personal de 4 dígitos
            <input
              name="pin"
              id="fiao-pay-pin"
              type="password"
              inputmode="numeric"
              autocomplete="off"
              pattern="[0-9]{4}"
              minlength="4"
              maxlength="4"
              placeholder="• • • •"
              required
              style="font-size:1.35rem;font-weight:800;letter-spacing:.45rem;text-align:center;"
            >
            <small>Usa el mismo PIN con el que autorizas la caja.</small>
          </label>

          <div id="fiao-cash-calculator" class="quick-cash-container" style="margin-top:4px;">
            <label>Efectivo entregado por el cliente</label>
            <input id="fiao-cash-received" type="number" step="0.01" min="0" inputmode="decimal" placeholder="Monto recibido">
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
        </div>
        <footer class="modal-actions" style="margin-top:12px;">
          <button type="button" class="button secondary" data-modal-close>Cancelar</button>
          <button class="button primary" type="submit"><i data-lucide="key-round"></i> Autorizar con PIN y Cobrar</button>
        </footer>
      </form>
    </div>
  `;
}
