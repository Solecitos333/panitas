import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_CATEGORIES,
  AUDIT_TIME_FILTERS,
  getAuditCategory,
  cleanAuditReason,
  enrichAuditLog,
  formatAuditDate,
  filterAuditByTime,
  calculateAuditKpis,
  buildAuditLogsCsv,
  renderAuditLogs
} from '../../src/modules/administration.js';

test('Audit Hub: cleanAuditReason extrae el motivo humano eliminando hashes y telemetría de hardware', () => {
  // Caso 1: Cadena real capturada en la terminal
  const raw1 = 'drawer - mu8umfx3 - zk41poy6kb9k6p34mtdgss - sesión ePG4jRblKyvdbgG6P57lc - Dar cambio / Sencillo';
  assert.equal(cleanAuditReason(raw1), 'Dar cambio / Sencillo');

  // Caso 2: Cadena con puntos medios y sin sesión activa
  const raw2 = 'drawer-908123 · sesión sin sesión · Apertura posterior a operación de caja';
  assert.equal(cleanAuditReason(raw2), 'Apertura posterior a operación de caja');

  // Caso 3: Intento fallido con prefijo de PIN
  const raw3 = 'PIN incorrecto: Cobro rápido en Punto de Venta';
  assert.equal(cleanAuditReason(raw3), 'Cobro rápido en Punto de Venta');

  // Caso 4: Cadena simple sin telemetría
  const raw4 = 'Acceso a nómina confidencial';
  assert.equal(cleanAuditReason(raw4), 'Acceso a nómina confidencial');

  // Caso 5: Nulo o vacío
  assert.equal(cleanAuditReason(null), 'Operación del sistema');
});

test('Audit Hub: getAuditCategory clasifica correctamente todas las familias de eventos', () => {
  // Seguridad y PINs
  assert.equal(getAuditCategory('cash.drawer_failed'), 'security');
  assert.equal(getAuditCategory('cash.pin_authorized'), 'security');
  assert.equal(getAuditCategory('user.drawer_pin.updated'), 'security');
  assert.equal(getAuditCategory('user.drawer_pin.provisioned'), 'security');

  // Caja y Gaveta
  assert.equal(getAuditCategory('cash.opened'), 'cash');
  assert.equal(getAuditCategory('cash.closed'), 'cash');
  assert.equal(getAuditCategory('cash.movement_in'), 'cash');
  assert.equal(getAuditCategory('cash.movement_out'), 'cash');
  assert.equal(getAuditCategory('cash.drawer_pulse_sent'), 'cash');
  assert.equal(getAuditCategory('cash.drawer_requested'), 'cash');

  // Ventas y Cobros
  assert.equal(getAuditCategory('payment.created'), 'billing');
  assert.equal(getAuditCategory('invoice.cancelled'), 'billing');
  assert.equal(getAuditCategory('delivery.driver_reassigned'), 'billing');

  // Inventario y Mermas
  assert.equal(getAuditCategory('inventory.counted'), 'inventory');
  assert.equal(getAuditCategory('inventory.adjusted'), 'inventory');
  assert.equal(getAuditCategory('inventory.batch_waste'), 'inventory');
  assert.equal(getAuditCategory('product.created'), 'inventory');

  // Nómina
  assert.equal(getAuditCategory('payroll.payment_issued'), 'payroll');
  assert.equal(getAuditCategory('employee.created'), 'payroll');

  // Sistema
  assert.equal(getAuditCategory('user.created'), 'system');
  assert.equal(getAuditCategory('user.updated'), 'system');
  assert.equal(getAuditCategory('settings.updated'), 'system');
});

test('Audit Hub: enrichAuditLog enriquece eventos de apertura, cierre y movimientos de caja', () => {
  const fakeState = {
    cashSessions: [
      { id: 'ses-100', openingCents: 500000, notes: 'Fondo de cambio matutino' }
    ],
    payrollPayments: [
      { id: 'pay-200', receiptNumber: 'NOM-pay-200', employeeName: 'Carlos Gómez', netAmountCents: 1500000, conceptLabel: 'Quincena' }
    ]
  };

  // 1. Apertura de caja con fondo cruzado
  const logOpened = enrichAuditLog({
    action: 'cash.opened',
    details: 'ses-100',
    actorName: 'JESPINAL',
    createdAt: new Date('2026-09-20T10:00:00')
  }, fakeState);
  assert.equal(logOpened.actionTitle, 'Apertura de turno');
  assert.equal(logOpened.category, 'cash');
  assert.ok(logOpened.cleanDetails.includes('5,000.00'));
  assert.ok(logOpened.cleanDetails.includes('Fondo de cambio matutino'));

  // 2. Cierre de caja cuadrado
  const logClosedSquare = enrichAuditLog({
    action: 'cash.closed',
    details: 'ses-100: diferencia 0 centavos. Cuadre perfecto',
    actorName: 'JESPINAL',
    createdAt: new Date('2026-09-20T22:00:00')
  }, fakeState);
  assert.equal(logClosedSquare.actionTitle, 'Cierre de turno y arqueo');
  assert.ok(logClosedSquare.cleanDetails.includes('Arqueo cuadrado exacto'));
  assert.ok(logClosedSquare.cleanDetails.includes('Diferencia:') && logClosedSquare.cleanDetails.includes('0.00'));

  // 3. Cierre de caja con faltante
  const logClosedShort = enrichAuditLog({
    action: 'cash.closed',
    details: 'ses-100: diferencia -15000 centavos. Faltó efectivo',
    actorName: 'JESPINAL',
    createdAt: new Date('2026-09-20T22:00:00')
  }, fakeState);
  assert.ok(logClosedShort.cleanDetails.includes('Faltante en caja') && logClosedShort.cleanDetails.includes('150.00'));
  assert.equal(logClosedShort.toneClass, 'status-cancelled');

  // 4. Salida de caja / gasto
  const logCashOut = enrichAuditLog({
    action: 'cash.movement_out',
    details: 'ses-100: 85000 - Compra de hielo y fundas',
    actorName: 'Nechy Peña',
    createdAt: new Date('2026-09-20T14:00:00')
  }, fakeState);
  assert.equal(logCashOut.actionTitle, 'Salida de caja / Gasto');
  assert.ok(logCashOut.cleanDetails.includes('850.00'));
  assert.ok(logCashOut.cleanDetails.includes('Compra de hielo y fundas'));

  // 5. Pulso enviado a gaveta con telemetría cruda
  const logPulse = enrichAuditLog({
    action: 'cash.drawer_pulse_sent',
    details: 'drawer - abc12345 - sesión ses-100 - Dar cambio / Sencillo',
    actorName: 'Nechy Peña',
    createdAt: new Date('2026-09-20T15:00:00')
  }, fakeState);
  assert.equal(logPulse.actionTitle, 'Pulso enviado a gaveta');
  assert.ok(logPulse.cleanDetails.includes('Dar cambio / Sencillo'));
  assert.ok(!logPulse.cleanDetails.includes('abc12345')); // ID técnico descartado

  // 6. Intento fallido de PIN
  const logFailed = enrichAuditLog({
    action: 'cash.drawer_failed',
    details: 'PIN incorrecto: Cobro rápido en Punto de Venta',
    actorName: 'Cajero Junior',
    createdAt: new Date('2026-09-20T16:00:00')
  }, fakeState);
  assert.equal(logFailed.category, 'security');
  assert.equal(logFailed.isFailed, true);
  assert.equal(logFailed.isCritical, true);
  assert.ok(logFailed.cleanDetails.includes('PIN incorrecto'));
  assert.ok(logFailed.cleanDetails.includes('Cobro rápido en Punto de Venta'));

  // 7. Pago de nómina cruzado
  const logPayroll = enrichAuditLog({
    action: 'payroll.payment_issued',
    details: 'NOM-pay-200',
    actorName: 'JESPINAL',
    createdAt: new Date('2026-09-20T17:00:00')
  }, fakeState);
  assert.equal(logPayroll.category, 'payroll');
  assert.ok(logPayroll.cleanDetails.includes('Carlos Gómez'));
  assert.ok(logPayroll.cleanDetails.includes('15,000.00'));
});

test('Audit Hub: calculateAuditKpis calcula métricas operativas y porcentaje de PINs con precisión', () => {
  const now = new Date('2026-09-20T18:00:00');
  const enriched = [
    { action: 'cash.opened', category: 'cash', createdAt: new Date('2026-09-20T09:00:00') },
    { action: 'cash.drawer_pulse_sent', category: 'cash', createdAt: new Date('2026-09-20T10:00:00') },
    { action: 'cash.drawer_pulse_sent', category: 'cash', createdAt: new Date('2026-09-20T11:00:00') },
    { action: 'cash.movement_out', category: 'cash', createdAt: new Date('2026-09-20T12:00:00') },
    { action: 'cash.pin_authorized', category: 'security', createdAt: new Date('2026-09-20T10:00:00') },
    { action: 'cash.pin_authorized', category: 'security', createdAt: new Date('2026-09-20T11:00:00') },
    { action: 'cash.pin_authorized', category: 'security', createdAt: new Date('2026-09-20T14:00:00') },
    { action: 'cash.drawer_failed', category: 'security', createdAt: new Date('2026-09-20T15:00:00') }, // 1 fallo
    // Registro de ayer
    { action: 'cash.pin_authorized', category: 'security', createdAt: new Date('2026-09-19T10:00:00') }
  ];

  const kpis = calculateAuditKpis(enriched, now);

  assert.equal(kpis.total, 9);
  assert.equal(kpis.todayCount, 8); // 8 eventos de hoy
  assert.equal(kpis.drawerPulses, 2);
  assert.equal(kpis.cashMovements, 1);
  assert.equal(kpis.totalCashOps, 3);
  assert.equal(kpis.pinAuthorized, 4);
  assert.equal(kpis.failedAttempts, 1);
  // 4 autorizados de 5 intentos totales (4 + 1) = 80%
  assert.equal(kpis.pinSuccessRate, 80);
});

test('Audit Hub: filterAuditByTime segmenta registros por Hoy, Ayer, Últimos 7 días y Todo', () => {
  const now = new Date('2026-09-20T18:00:00');
  const logs = [
    { id: '1', createdAt: new Date('2026-09-20T10:00:00') }, // Hoy
    { id: '2', createdAt: new Date('2026-09-20T15:00:00') }, // Hoy
    { id: '3', createdAt: new Date('2026-09-19T11:00:00') }, // Ayer
    { id: '4', createdAt: new Date('2026-09-16T10:00:00') }, // Hace 4 días (semana)
    { id: '5', createdAt: new Date('2026-08-01T10:00:00') }  // Hace mes y medio
  ];

  // Todo
  assert.equal(filterAuditByTime(logs, 'all', now).length, 5);

  // Hoy
  const today = filterAuditByTime(logs, 'today', now);
  assert.equal(today.length, 2);
  assert.deepEqual(today.map(l => l.id), ['1', '2']);

  // Ayer
  const yesterday = filterAuditByTime(logs, 'yesterday', now);
  assert.equal(yesterday.length, 1);
  assert.equal(yesterday[0].id, '3');

  // Últimos 7 días (Hoy, Ayer y hace 4 días = 4)
  const week = filterAuditByTime(logs, 'week', now);
  assert.equal(week.length, 4);
  assert.deepEqual(week.map(l => l.id), ['1', '2', '3', '4']);
});

test('Audit Hub: buildAuditLogsCsv exporta formato CSV compatible con Microsoft Excel', () => {
  const logs = [
    {
      id: 'aud-1',
      actionTitle: 'Pulso enviado a gaveta',
      category: 'cash',
      categoryMeta: { label: 'Caja & Gaveta' },
      actor: 'Nechy Peña',
      cleanDetails: 'Pulso ejecutado · Motivo: Dar cambio / Sencillo',
      createdAt: new Date('2026-09-20T14:30:00')
    },
    {
      id: 'aud-2',
      actionTitle: 'Intento fallido de PIN',
      category: 'security',
      categoryMeta: { label: 'Seguridad & PINs' },
      actor: 'JESPINAL',
      cleanDetails: 'PIN incorrecto · Operación: Cobro rápido',
      createdAt: new Date('2026-09-20T15:00:00')
    }
  ];

  const csv = buildAuditLogsCsv(logs);
  assert.ok(csv.startsWith('"Fecha","Hora","Categoría","Acción","Responsable","Detalle Operativo","ID Original"'));
  assert.ok(csv.includes('Caja & Gaveta'));
  assert.ok(csv.includes('Dar cambio / Sencillo'));
  assert.ok(csv.includes('Intento fallido de PIN'));
  assert.ok(csv.includes('JESPINAL'));
});

test('Audit Hub: renderAuditLogs genera interfaz completa con KPIs, filtros, tabla y exportación', () => {
  const state = {
    auditLogs: [
      {
        id: 'log-1',
        action: 'cash.drawer_pulse_sent',
        details: 'drawer - id - sesión s1 - Dar cambio / Sencillo',
        actorName: 'Nechy Peña',
        createdAt: new Date('2026-09-20T14:30:00')
      },
      {
        id: 'log-2',
        action: 'cash.drawer_failed',
        details: 'PIN incorrecto: Cobro rápido',
        actorName: 'JESPINAL',
        createdAt: new Date('2026-09-20T15:00:00')
      }
    ],
    auditCategoryFilter: 'all',
    auditTimeFilter: 'all',
    auditSearchTerm: '',
    auditDisplayLimit: 50
  };

  const html = renderAuditLogs(state);

  // Cabecera y botón de exportar
  assert.ok(html.includes('Auditoría del Sistema y Actividad Operativa'));
  assert.ok(html.includes('data-audit-export'));
  assert.ok(html.includes('Exportar CSV'));

  // 4 KPIs presentes
  assert.ok(html.includes('Actividad Registrada'));
  assert.ok(html.includes('Caja & Gaveta'));
  assert.ok(html.includes('Seguridad & PINs'));
  assert.ok(html.includes('Intentos Fallidos / Alertas'));

  // Alerta destacada para intentos fallidos
  assert.ok(html.includes('audit-kpi-alert'));

  // Selector temporal
  assert.ok(html.includes('data-audit-time="today"'));
  assert.ok(html.includes('data-audit-time="week"'));

  // Pestañas de categorías
  assert.ok(html.includes('data-audit-category="all"'));
  assert.ok(html.includes('data-audit-category="cash"'));
  assert.ok(html.includes('data-audit-category="security"'));

  // Fila enriquecida sin código técnico crudo
  assert.ok(html.includes('Dar cambio / Sencillo'));
  assert.ok(!html.includes('drawer - id - sesión s1 - '));
});
