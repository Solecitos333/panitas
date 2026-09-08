import { escapeHtml, formatDate, formatMoney } from '../lib/format.js';
import { PAYROLL_CONCEPTS, PAYROLL_PAYMENT_METHODS, SALARY_FREQUENCIES, getPayrollConceptLabel, getPaymentMethodLabel, getSalaryFrequencyLabel, calculatePayrollNetCents } from '../domain/payroll.js';

export function renderPayroll(state) {
  const activeTab = state.payrollTab || 'payments';
  const employees = (state.employees || []).filter((e) => e);
  const activeEmployees = employees.filter((e) => e.active !== false);
  const payments = (state.payrollPayments || []).filter((p) => p);

  // Metrics calculation
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const thisMonthPayments = payments.filter((p) => {
    const d = p.createdAt?.toDate ? p.createdAt.toDate() : new Date(p.createdAt || 0);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const totalMonthCents = thisMonthPayments.reduce((sum, p) => sum + Number(p.netAmountCents || 0), 0);
  const cashDisbursedCents = thisMonthPayments
    .filter((p) => p.paymentMethod === 'cash')
    .reduce((sum, p) => sum + Number(p.netAmountCents || 0), 0);
  const transferDisbursedCents = thisMonthPayments
    .filter((p) => p.paymentMethod === 'transfer')
    .reduce((sum, p) => sum + Number(p.netAmountCents || 0), 0);

  return `
    <section class="panel-heading">
      <div>
        <span class="eyebrow">Finanzas y Recursos Humanos</span>
        <h2>Gestión de Nómina y Pagos a Empleados</h2>
        <p>Control confidencial de costes de personal, desembolsos en efectivo o transferencia y comprobantes oficiales.</p>
      </div>
      <div class="header-actions">
        <button class="button secondary" type="button" data-employee-new>
          <i data-lucide="user-plus"></i> Registrar Empleado
        </button>
        <button class="button primary" type="button" data-payroll-pay-new>
          <i data-lucide="badge-dollar-sign"></i> Pagar Nómina / Adelanto
        </button>
      </div>
    </section>

    <!-- Métricas Generales de Salud Financiera -->
    <div class="metric-grid">
      <article class="metric-card">
        <i data-lucide="wallet-cards"></i>
        <div>
          <span>Nómina del Mes</span>
          <strong>${formatMoney(totalMonthCents)}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">${thisMonthPayments.length} pago(s) registrados</small>
        </div>
      </article>
      <article class="metric-card positive">
        <i data-lucide="wallet"></i>
        <div>
          <span>Dispensado en Efectivo</span>
          <strong>${formatMoney(cashDisbursedCents)}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">Salidas registradas en caja</small>
        </div>
      </article>
      <article class="metric-card">
        <i data-lucide="landmark"></i>
        <div>
          <span>Por Transferencia</span>
          <strong>${formatMoney(transferDisbursedCents)}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">Banca / Sin descuadre de gaveta</small>
        </div>
      </article>
      <article class="metric-card">
        <i data-lucide="users"></i>
        <div>
          <span>Empleados Activos</span>
          <strong>${activeEmployees.length}</strong>
          <small style="color:var(--muted);font-size:0.75rem;">${employees.length - activeEmployees.length} inactivo(s)</small>
        </div>
      </article>
    </div>

    <!-- Pestañas de Navegación -->
    <div style="display:flex;gap:10px;margin-bottom:16px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:10px;">
      <button
        type="button"
        class="button ${activeTab === 'payments' ? 'primary' : 'secondary'} compact"
        data-payroll-tab="payments"
        style="font-weight:700;font-size:0.85rem;"
      >
        <i data-lucide="receipt"></i> Historial de Pagos y Recibos (${payments.length})
      </button>
      <button
        type="button"
        class="button ${activeTab === 'employees' ? 'primary' : 'secondary'} compact"
        data-payroll-tab="employees"
        style="font-weight:700;font-size:0.85rem;"
      >
        <i data-lucide="users"></i> Directorio de Empleados (${employees.length})
      </button>
    </div>

    ${activeTab === 'payments' ? renderPaymentsTab(payments) : renderEmployeesTab(employees)}
  `;
}

function renderPaymentsTab(payments = []) {
  return `
    <section class="surface-card data-surface">
      <header style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <span class="eyebrow">Trazabilidad de Desembolsos</span>
          <h3>Comprobantes y Nóminas Emitidas</h3>
        </div>
        <div class="toolbar" style="margin:0;">
          <label class="search-field" style="max-width:320px;">
            <i data-lucide="search"></i>
            <input id="payroll-payments-search" type="search" placeholder="Buscar por empleado, comprobante o fecha...">
          </label>
        </div>
      </header>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha y Hora</th>
              <th>Comprobante</th>
              <th>Empleado</th>
              <th>Cargo</th>
              <th>Concepto</th>
              <th>Método</th>
              <th>Neto Pagado</th>
              <th>Autorizado por</th>
              <th>Notas</th>
              <th style="text-align:right;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${payments.length ? payments.map(paymentRow).join('') : `
              <tr>
                <td colspan="10">
                  <div class="empty-state" style="padding:30px 10px;text-align:center;">
                    <i data-lucide="badge-dollar-sign" style="width:36px;height:36px;color:var(--muted);margin:0 auto 10px;display:block;"></i>
                    <strong style="font-size:1.05rem;">Sin pagos de nómina registrados</strong>
                    <p style="color:var(--muted);font-size:0.85rem;max-width:400px;margin:4px auto 14px;">
                      Presiona "Pagar Nómina / Adelanto" para registrar el primer desembolso de sueldo o vale.
                    </p>
                  </div>
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function paymentRow(item) {
  const d = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt || 0);
  const dateStr = formatDate(d, true);
  const isCash = item.paymentMethod === 'cash';
  const methodBadge = isCash
    ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(63,185,80,.15);color:#3fb950;font-weight:700;font-size:0.75rem;"><i data-lucide="wallet" style="width:12px;height:12px;"></i> Efectivo</span>`
    : `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(56,189,248,.15);color:#38bdf8;font-weight:700;font-size:0.75rem;"><i data-lucide="landmark" style="width:12px;height:12px;"></i> Transferencia</span>`;

  const searchStr = `${item.receiptNumber || ''} ${item.employeeName || ''} ${item.employeeRole || ''} ${item.conceptLabel || ''} ${item.notes || ''}`.toLowerCase();

  return `
    <tr data-payroll-row data-search="${escapeHtml(searchStr)}">
      <td style="font-size:0.8rem;color:var(--muted);white-space:nowrap;">${dateStr}</td>
      <td><strong>${escapeHtml(item.receiptNumber || 'NOM-000000')}</strong></td>
      <td><strong>${escapeHtml(item.employeeName || 'Empleado')}</strong></td>
      <td style="font-size:0.82rem;color:var(--muted);">${escapeHtml(item.employeeRole || '—')}</td>
      <td><span class="role-chip" style="font-size:0.75rem;">${escapeHtml(item.conceptLabel || item.concept || 'Pago')}</span></td>
      <td>${methodBadge}</td>
      <td><strong style="color:var(--brand-2);font-size:0.95rem;">${formatMoney(item.netAmountCents || 0)}</strong></td>
      <td style="font-size:0.8rem;">${escapeHtml(item.authorizedByName || 'Administrador')}</td>
      <td style="font-size:0.78rem;color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(item.notes || '—')}</td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="icon-button" type="button" data-payroll-print="${escapeHtml(item.id)}" title="Imprimir Comprobante Térmico (80mm)">
          <i data-lucide="printer"></i>
        </button>
      </td>
    </tr>
  `;
}

function renderEmployeesTab(employees = []) {
  return `
    <section class="surface-card data-surface">
      <header style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <span class="eyebrow">Personal Registrado</span>
          <h3>Costes Salariales y Frecuencia de Pago</h3>
        </div>
        <div class="toolbar" style="margin:0;">
          <label class="search-field" style="max-width:320px;">
            <i data-lucide="search"></i>
            <input id="payroll-employees-search" type="search" placeholder="Buscar empleado por nombre, cédula o cargo...">
          </label>
        </div>
      </header>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Cédula / Doc.</th>
              <th>Teléfono</th>
              <th>Cargo / Puesto</th>
              <th>Salario Base (Confidencial)</th>
              <th>Frecuencia</th>
              <th>Método Habitual</th>
              <th>Estado</th>
              <th style="text-align:right;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${employees.length ? employees.map(employeeRow).join('') : `
              <tr>
                <td colspan="9">
                  <div class="empty-state" style="padding:30px 10px;text-align:center;">
                    <i data-lucide="users" style="width:36px;height:36px;color:var(--muted);margin:0 auto 10px;display:block;"></i>
                    <strong style="font-size:1.05rem;">Sin empleados registrados</strong>
                    <p style="color:var(--muted);font-size:0.85rem;max-width:400px;margin:4px auto 14px;">
                      Registra a los colaboradores del negocio para asignarles su costo salarial y poder emitir pagos oficiales.
                    </p>
                  </div>
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function employeeRow(item) {
  const enabled = item.active !== false;
  const searchStr = `${item.name || ''} ${item.cedula || ''} ${item.phone || ''} ${item.roleTitle || ''}`.toLowerCase();
  const freqLabel = getSalaryFrequencyLabel(item.frequency);
  const methodLabel = getPaymentMethodLabel(item.preferredMethod);

  return `
    <tr data-employee-row data-search="${escapeHtml(searchStr)}">
      <td><strong>${escapeHtml(item.name || 'Sin nombre')}</strong></td>
      <td style="font-size:0.82rem;color:var(--muted);">${escapeHtml(item.cedula || '—')}</td>
      <td style="font-size:0.82rem;">${item.phone ? `<a href="tel:${escapeHtml(item.phone)}" style="color:var(--brand-2);">${escapeHtml(item.phone)}</a>` : '—'}</td>
      <td><span class="role-chip" style="font-size:0.75rem;">${escapeHtml(item.roleTitle || 'Personal')}</span></td>
      <td><strong style="color:#fff;font-size:0.95rem;">${formatMoney(item.baseSalaryCents || 0)}</strong></td>
      <td style="font-size:0.82rem;color:var(--muted);">${escapeHtml(freqLabel)}</td>
      <td style="font-size:0.82rem;">${escapeHtml(methodLabel)}</td>
      <td>
        <span class="document-status ${enabled ? 'status-paid' : 'status-cancelled'}" style="font-size:0.75rem;">
          ${enabled ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td style="text-align:right;white-space:nowrap;">
        <button class="button secondary compact" type="button" data-payroll-pay-emp="${escapeHtml(item.id)}" title="Pagar nómina a este empleado" style="padding:4px 10px;font-size:0.8rem;margin-right:6px;">
          <i data-lucide="badge-dollar-sign"></i> Pagar
        </button>
        <button class="icon-button" type="button" data-employee-edit="${escapeHtml(item.id)}" title="Editar Empleado">
          <i data-lucide="pencil"></i>
        </button>
      </td>
    </tr>
  `;
}

export function renderEmployeeFormModal(employee = {}) {
  const isEdit = Boolean(employee.id);
  const baseSalary = employee.baseSalaryCents != null ? (employee.baseSalaryCents / 100).toFixed(2) : '';

  return `
    <div class="modal-backdrop" data-modal-close>
      <form id="employee-form" class="modal-card form-modal" data-modal-card style="max-width:560px;">
        <header>
          <div>
            <span class="eyebrow">Personal y Recursos Humanos</span>
            <h2>${isEdit ? 'Editar Empleado' : 'Registrar Nuevo Empleado'}</h2>
          </div>
          <button class="icon-button" type="button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
        </header>

        <div class="stack-form" style="gap:12px;">
          <input type="hidden" name="id" value="${escapeHtml(employee.id || '')}">

          <label>
            <span style="font-size:0.85rem;color:#fff;font-weight:700;">Nombre Completo *</span>
            <input name="name" required maxlength="160" placeholder="Ej. Juan Pérez Santana" value="${escapeHtml(employee.name || '')}">
          </label>

          <div class="form-grid two">
            <label>
              <span style="font-size:0.85rem;color:#fff;font-weight:700;">Cédula o Documento</span>
              <input name="cedula" maxlength="30" placeholder="001-0000000-0" value="${escapeHtml(employee.cedula || '')}">
            </label>
            <label>
              <span style="font-size:0.85rem;color:#fff;font-weight:700;">Teléfono Móvil</span>
              <input name="phone" maxlength="30" placeholder="809-555-0000" value="${escapeHtml(employee.phone || '')}">
            </label>
          </div>

          <div class="form-grid two">
            <label>
              <span style="font-size:0.85rem;color:#fff;font-weight:700;">Cargo o Función en Cafetería *</span>
              <input name="roleTitle" required maxlength="80" placeholder="Ej. Cocinero, Camarero, Cajera, Limpieza" value="${escapeHtml(employee.roleTitle || '')}">
            </label>
            <label>
              <span style="font-size:0.85rem;color:#fff;font-weight:700;">Frecuencia de Cobro</span>
              <select name="frequency" style="padding:10px;border-radius:8px;background:rgba(0,0,0,.4);color:#fff;border:1px solid rgba(255,255,255,.2);cursor:pointer;">
                <option value="biweekly" ${employee.frequency === 'biweekly' || !employee.frequency ? 'selected' : ''}>Quincenal</option>
                <option value="monthly" ${employee.frequency === 'monthly' ? 'selected' : ''}>Mensual</option>
                <option value="daily" ${employee.frequency === 'daily' ? 'selected' : ''}>Por día / Jornal</option>
                <option value="hourly" ${employee.frequency === 'hourly' ? 'selected' : ''}>Por hora</option>
              </select>
            </label>
          </div>

          <!-- Coste Salarial Confidencial -->
          <div style="background:rgba(239,189,105,.08);border:1px solid rgba(239,189,105,.3);border-radius:10px;padding:12px 14px;">
            <label style="display:block;margin-bottom:6px;">
              <strong style="color:var(--brand-2);font-size:0.9rem;display:flex;align-items:center;gap:6px;">
                <i data-lucide="lock" style="width:15px;height:15px;"></i> Salario Base o Costo Fijo (Confidencial) *
              </strong>
              <span style="font-size:0.75rem;color:var(--muted);display:block;">
                Este valor solo es visible para administración y no se comparte con otros roles.
              </span>
            </label>
            <input
              name="baseSalary"
              type="text"
              data-touch-numpad="money"
              data-numpad-title="Salario Base del Empleado"
              placeholder="0.00"
              required
              readonly
              inputmode="none"
              value="${baseSalary}"
              style="font-size:1.35rem;font-weight:900;text-align:center;padding:10px;border-radius:8px;background:rgba(0,0,0,.5);border:2px solid var(--brand-2);color:#fff;width:100%;cursor:pointer;"
            >
          </div>

          <!-- Método de pago preferido y datos bancarios -->
          <div class="form-grid two">
            <label>
              <span style="font-size:0.85rem;color:#fff;font-weight:700;">Método de Pago Preferido</span>
              <select name="preferredMethod" style="padding:10px;border-radius:8px;background:rgba(0,0,0,.4);color:#fff;border:1px solid rgba(255,255,255,.2);cursor:pointer;">
                <option value="cash" ${employee.preferredMethod === 'cash' || !employee.preferredMethod ? 'selected' : ''}>Efectivo (Caja)</option>
                <option value="transfer" ${employee.preferredMethod === 'transfer' ? 'selected' : ''}>Transferencia Bancaria</option>
                <option value="other" ${employee.preferredMethod === 'other' ? 'selected' : ''}>Cheque / Otro</option>
              </select>
            </label>
            <label>
              <span style="font-size:0.85rem;color:#fff;font-weight:700;">Banco / Cuenta</span>
              <input name="bankAccount" maxlength="120" placeholder="Ej. Banreservas #960..." value="${escapeHtml(employee.bankAccount || '')}">
            </label>
          </div>

          <label>
            <span style="font-size:0.85rem;color:var(--muted);">Notas u observaciones (opcional)</span>
            <input name="notes" maxlength="300" placeholder="Horario habitual, fecha de ingreso..." value="${escapeHtml(employee.notes || '')}">
          </label>

          <label class="check-field" style="margin-top:4px;">
            <input name="active" type="checkbox" ${employee.active !== false ? 'checked' : ''}>
            <span>Empleado activo en el negocio</span>
          </label>
        </div>

        <footer class="modal-actions" style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end;">
          <button class="button secondary" type="button" data-modal-close>Cancelar</button>
          <button class="button primary" type="submit">
            <i data-lucide="save"></i> ${isEdit ? 'Guardar Cambios' : 'Registrar Empleado'}
          </button>
        </footer>
      </form>
    </div>
  `;
}

export function renderPayrollPaymentModal({ employees = [], selectedEmployeeId = null, activeCash = null } = {}) {
  const activeEmployees = employees.filter((e) => e.active !== false);
  const preselected = activeEmployees.find((e) => e.id === selectedEmployeeId) || activeEmployees[0] || {};
  const suggestedBaseCents = Number(preselected.baseSalaryCents || 0);
  const suggestedMethod = preselected.preferredMethod || 'cash';

  const defaultPeriod = new Date().toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });

  return `
    <div class="modal-backdrop" data-modal-close>
      <form id="payroll-payment-form" class="modal-card form-modal" data-modal-card style="max-width:580px;">
        <header>
          <div>
            <span class="eyebrow">Desembolso y Comprobante Oficial</span>
            <h2>Pago de Nómina / Adelanto</h2>
          </div>
          <button class="icon-button" type="button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
        </header>

        <div class="stack-form" style="gap:12px;">
          <!-- Selector de Empleado -->
          <div>
            <label style="font-size:0.85rem;color:#fff;font-weight:700;display:block;margin-bottom:6px;">Empleado Receptor *</label>
            <select name="employeeId" id="payroll-emp-select" required style="padding:12px;border-radius:8px;background:rgba(0,0,0,.4);color:#fff;border:1px solid rgba(255,255,255,.2);width:100%;font-size:1rem;font-weight:700;cursor:pointer;">
              ${activeEmployees.map((e) => `
                <option value="${escapeHtml(e.id)}" data-base-cents="${e.baseSalaryCents || 0}" data-method="${e.preferredMethod || 'cash'}" data-role="${escapeHtml(e.roleTitle || '')}" ${e.id === preselected.id ? 'selected' : ''}>
                  ${escapeHtml(e.name)} · ${escapeHtml(e.roleTitle || 'Personal')} (${formatMoney(e.baseSalaryCents || 0)})
                </option>
              `).join('')}
            </select>
          </div>

          <div class="form-grid two">
            <label>
              <span style="font-size:0.85rem;color:#fff;font-weight:700;">Concepto del Pago *</span>
              <select name="concept" id="payroll-concept-select" style="padding:10px;border-radius:8px;background:rgba(0,0,0,.4);color:#fff;border:1px solid rgba(255,255,255,.2);cursor:pointer;">
                <option value="salary_regular" selected>Sueldo regular / Quincena</option>
                <option value="salary_advance">Adelanto de sueldo / Vale</option>
                <option value="salary_day">Día laborado / Jornal</option>
                <option value="bonus">Bono / Gratificación</option>
                <option value="overtime">Horas extras</option>
                <option value="settlement">Liquidación / Prestaciones</option>
                <option value="deduction">Ajuste / Deducción</option>
              </select>
            </label>
            <label>
              <span style="font-size:0.85rem;color:#fff;font-weight:700;">Período Liquidado</span>
              <input name="period" maxlength="80" placeholder="Ej. 1ra Quincena Septiembre 2026" value="${escapeHtml(defaultPeriod)}">
            </label>
          </div>

          <!-- Desglose de Montos: Base, Bonos, Deducciones -->
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
            <label>
              <span style="font-size:0.75rem;color:var(--muted);font-weight:700;">Monto Base (DOP)</span>
              <input
                name="baseSalary"
                id="payroll-base-amount"
                type="text"
                data-touch-numpad="money"
                data-numpad-title="Monto Base de Nómina"
                placeholder="0.00"
                value="${(suggestedBaseCents / 100).toFixed(2)}"
                required
                readonly
                inputmode="none"
                style="font-size:1.15rem;font-weight:800;text-align:center;padding:10px;border-radius:8px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.2);color:#fff;cursor:pointer;"
              >
            </label>
            <label>
              <span style="font-size:0.75rem;color:#3fb950;font-weight:700;">+ Bonos / Extras</span>
              <input
                name="bonus"
                id="payroll-bonus-amount"
                type="text"
                data-touch-numpad="money"
                data-numpad-title="Bonos o Adicionales"
                placeholder="0.00"
                value="0.00"
                readonly
                inputmode="none"
                style="font-size:1.15rem;font-weight:800;text-align:center;padding:10px;border-radius:8px;background:rgba(0,0,0,.4);border:1px solid rgba(63,185,80,.4);color:#3fb950;cursor:pointer;"
              >
            </label>
            <label>
              <span style="font-size:0.75rem;color:#f85149;font-weight:700;">- Deducciones</span>
              <input
                name="deductions"
                id="payroll-deductions-amount"
                type="text"
                data-touch-numpad="money"
                data-numpad-title="Deducciones o Descuentos"
                placeholder="0.00"
                value="0.00"
                readonly
                inputmode="none"
                style="font-size:1.15rem;font-weight:800;text-align:center;padding:10px;border-radius:8px;background:rgba(0,0,0,.4);border:1px solid rgba(248,81,73,.4);color:#f85149;cursor:pointer;"
              >
            </label>
          </div>

          <!-- Total Neto Dinámico en vivo -->
          <div style="background:rgba(239,189,105,.12);border:2px solid var(--brand-2);border-radius:12px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span style="display:block;font-size:0.8rem;text-transform:uppercase;color:var(--brand-2);font-weight:800;letter-spacing:0.5px;">Monto Neto a Desembolsar</span>
              <strong id="payroll-net-display" style="font-size:1.6rem;font-weight:900;color:#fff;">${formatMoney(suggestedBaseCents)}</strong>
            </div>
            <div style="text-align:right;">
              <span class="badge" style="background:rgba(239,189,105,.2);color:var(--brand-2);font-weight:800;">DOP Neto</span>
            </div>
          </div>

          <!-- Método de Dispensación / Forma de Pago -->
          <div>
            <label style="font-size:0.85rem;color:#fff;font-weight:700;display:block;margin-bottom:6px;">Forma de Dispensación *</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
              <label style="cursor:pointer;border:1px solid rgba(63,185,80,.4);background:rgba(63,185,80,.1);border-radius:10px;padding:12px;display:flex;align-items:flex-start;gap:10px;">
                <input type="radio" name="paymentMethod" value="cash" ${suggestedMethod === 'cash' ? 'checked' : ''} style="margin-top:3px;">
                <div>
                  <strong style="display:block;color:#3fb950;font-size:0.92rem;"><i data-lucide="wallet" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;"></i> Efectivo (Gaveta de Caja)</strong>
                  <small style="color:var(--muted);font-size:0.75rem;display:block;margin-top:2px;">
                    Se descontará de la caja abierta y abrirá la gaveta física automáticamente.
                  </small>
                </div>
              </label>
              <label style="cursor:pointer;border:1px solid rgba(56,189,248,.4);background:rgba(56,189,248,.1);border-radius:10px;padding:12px;display:flex;align-items:flex-start;gap:10px;">
                <input type="radio" name="paymentMethod" value="transfer" ${suggestedMethod === 'transfer' ? 'checked' : ''} style="margin-top:3px;">
                <div>
                  <strong style="display:block;color:#38bdf8;font-size:0.92rem;"><i data-lucide="landmark" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;"></i> Transferencia Bancaria</strong>
                  <small style="color:var(--muted);font-size:0.75rem;display:block;margin-top:2px;">
                    Registra el gasto financiero sin alterar el efectivo físico de la caja.
                  </small>
                </div>
              </label>
            </div>
          </div>

          <!-- Alerta de estado de caja si es efectivo -->
          <div id="payroll-cash-warning" style="${suggestedMethod === 'cash' ? '' : 'display:none;'}padding:8px 12px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:8px;font-size:0.8rem;color:#f59e0b;">
            <i data-lucide="info" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;"></i>
            ${activeCash
              ? `Caja abierta a cargo de <strong>${escapeHtml(activeCash.openedByName)}</strong>. La salida de dinero quedará asentada en el turno.`
              : `<strong>Atención:</strong> No hay caja abierta. Si pagas en efectivo, debes abrir turno de caja primero.`
            }
          </div>

          <label>
            <span style="font-size:0.85rem;color:var(--muted);">Observaciones o detalle (opcional)</span>
            <input name="notes" maxlength="300" placeholder="Ej. Pago correspondiente a 15 días laborados...">
          </label>

          <label class="check-field" style="margin-top:2px;">
            <input name="printReceipt" type="checkbox" checked>
            <span><i data-lucide="printer" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;"></i> Imprimir comprobante térmico oficial (con firmas)</span>
          </label>

          <!-- PIN de Seguridad de 6 dígitos -->
          <div style="background:rgba(239,189,105,.08);border:1px solid rgba(239,189,105,.3);border-radius:12px;padding:12px 14px;margin-top:4px;">
            <label style="display:block;margin-bottom:6px;">
              <strong style="font-size:0.85rem;color:var(--brand-2);display:flex;align-items:center;gap:6px;">
                <i data-lucide="key-round" style="width:16px;height:16px;"></i> PIN de Seguridad (6 dígitos) *
              </strong>
              <span style="font-size:0.75rem;color:var(--muted);display:block;margin-top:2px;">
                Requerido para autorizar el desembolso financiero y registrar al responsable.
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
          <button class="button primary" type="submit" id="payroll-submit-btn" style="padding:12px 20px;font-weight:800;font-size:0.95rem;">
            <i data-lucide="check-circle-2"></i> Autorizar y Desembolsar
          </button>
        </footer>
      </form>
    </div>
  `;
}
