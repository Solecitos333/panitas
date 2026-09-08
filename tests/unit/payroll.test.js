import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYROLL_CONCEPTS,
  SALARY_FREQUENCIES,
  PAYROLL_PAYMENT_METHODS,
  calculatePayrollNetCents,
  validateEmployeeData,
  validatePayrollPayment,
  getPayrollConceptLabel,
  getPaymentMethodLabel,
  getSalaryFrequencyLabel
} from '../../src/domain/payroll.js';
import { MemoryDataService } from '../../src/services/memory-service.js';
import {
  buildPayrollReceiptEscPos,
  buildPayrollReceiptPlainText
} from '../../src/lib/hardware.js';

test('nómina rechaza valores no enteros, no finitos y negativos', () => {
  for (const baseSalaryCents of [NaN, Infinity, -1, 1.5, 100000000001]) {
    assert.throws(() => validatePayrollPayment({ employeeId: 'sample', paymentMethod: 'transfer', baseSalaryCents }), /Monto de nómina/);
  }
  assert.throws(() => validatePayrollPayment({ employeeId: 'sample', baseSalaryCents: 100 }, { id: 'closed', status: 'closed' }), /caja abierta/);
});

test('el formulario de nómina conserva el identificador y bloquea doble envío', async () => {
  const { readFile } = await import('node:fs/promises');
  const code = await readFile(new URL('../../src/ui/app.js', import.meta.url), 'utf8');
  const section = code.slice(code.indexOf('function bindPayrollPaymentModal'), code.indexOf('async function saveEmployee'));
  assert.match(section, /const payrollRequestId = createOperationId/);
  assert.match(section, /if \(payrollSubmitting\) return/);
  assert.match(section, /requestId: payrollRequestId/);
  assert.match(section, /cashSessionId: paymentMethod === 'cash'/);
});

test('Cálculo de sueldo neto y validaciones de datos de nómina', () => {
  // calculatePayrollNetCents
  assert.equal(calculatePayrollNetCents(1500000, 200000, 100000).netAmountCents, 1600000); // 15,000 + 2,000 - 1,000 = 16,000
  assert.equal(calculatePayrollNetCents(1000000, 0, 0).netAmountCents, 1000000);
  assert.equal(calculatePayrollNetCents(1000000, 0, 1500000).netAmountCents, 0); // clamp a 0 si deducciones superan total
  assert.equal(calculatePayrollNetCents('10000', '2000', '1000').netAmountCents, 11000);

  // Labels
  assert.equal(getPayrollConceptLabel('salary_regular'), 'Sueldo regular / Quincena');
  assert.equal(getPayrollConceptLabel('salary_advance'), 'Adelanto de sueldo / Vale');
  assert.equal(getPaymentMethodLabel('cash'), 'Efectivo (Gaveta de Caja)');
  assert.equal(getPaymentMethodLabel('transfer'), 'Transferencia Bancaria');
  assert.equal(getSalaryFrequencyLabel('biweekly'), 'Quincenal');
  assert.equal(getSalaryFrequencyLabel('monthly'), 'Mensual');

  // validateEmployeeData
  const validEmployee = validateEmployeeData({
    name: 'Pedro Martínez',
    roleTitle: 'Cocinero',
    baseSalaryCents: 1800000,
    frequency: 'biweekly',
    preferredMethod: 'cash'
  });
  assert.equal(validEmployee.name, 'Pedro Martínez');
  assert.equal(validEmployee.baseSalaryCents, 1800000);
  assert.equal(validEmployee.active, true);

  assert.throws(() => {
    validateEmployeeData({ name: '', roleTitle: 'Cocinero', baseSalaryCents: 10000 });
  }, /nombre del empleado/);

  assert.throws(() => {
    validateEmployeeData({ name: 'Juan', roleTitle: '', baseSalaryCents: 10000 });
  }, /cargo o función/);

  assert.throws(() => {
    validateEmployeeData({ name: 'Juan', roleTitle: 'Cajero', baseSalaryCents: -500 });
  }, /sueldo base no puede ser un valor negativo/);

  // validatePayrollPayment
  const validPayment = validatePayrollPayment({
    employeeId: 'emp_123',
    concept: 'salary_regular',
    baseSalaryCents: 1500000,
    bonusCents: 100000,
    deductionsCents: 50000,
    paymentMethod: 'cash'
  }, { id: 'cash_1' });
  assert.equal(validPayment.netAmountCents, 1550000);
  assert.equal(validPayment.concept, 'salary_regular');

  assert.throws(() => {
    validatePayrollPayment({ employeeId: '', baseSalaryCents: 10000 });
  }, /seleccionar un empleado/);

  assert.throws(() => {
    validatePayrollPayment({ employeeId: 'emp_1', concept: 'salary_regular', baseSalaryCents: 0, bonusCents: 0 });
  }, /monto neto a pagar debe ser mayor/);
});

test('MemoryDataService gestiona directorio de empleados con confidencialidad', async () => {
  const adminService = new MemoryDataService({ uid: 'admin-1', role: 'owner', displayName: 'Nechy' });

  // Crear empleado
  const empId = await adminService.saveEmployee({
    name: 'Altagracia Rosario',
    cedula: '001-1234567-8',
    phone: '809-555-4321',
    roleTitle: 'Supervisora de Cocina',
    baseSalaryCents: 2200000,
    frequency: 'biweekly',
    preferredMethod: 'cash',
    bankAccount: 'Banreservas 1234567890',
    notes: 'Turno matutino'
  });

  assert.ok(empId);
  const emp = adminService.data.employees.find((e) => e.id === empId);
  assert.equal(emp.name, 'Altagracia Rosario');
  assert.equal(emp.baseSalaryCents, 2200000);
  assert.equal(emp.active, true);

  // Actualizar empleado
  await adminService.saveEmployee({
    id: empId,
    name: 'Altagracia Rosario de Pérez',
    roleTitle: 'Jefa de Cocina',
    baseSalaryCents: 2500000,
    frequency: 'monthly',
    preferredMethod: 'transfer'
  });
  const updatedEmp = adminService.data.employees.find((e) => e.id === empId);
  assert.equal(updatedEmp.name, 'Altagracia Rosario de Pérez');
  assert.equal(updatedEmp.roleTitle, 'Jefa de Cocina');
  assert.equal(updatedEmp.baseSalaryCents, 2500000);
  assert.equal(updatedEmp.frequency, 'monthly');
  assert.equal(updatedEmp.preferredMethod, 'transfer');

  // Desactivar empleado
  await adminService.deleteEmployee(empId);
  const deactivatedEmp = adminService.data.employees.find((e) => e.id === empId);
  assert.equal(deactivatedEmp.active, false);

  // Usuario sin permisos de nómina (ej. camarero) es bloqueado
  const waiterService = new MemoryDataService({ uid: 'waiter-1', role: 'waiter', displayName: 'Mesero' });
  await assert.rejects(async () => {
    await waiterService.saveEmployee({
      name: 'Otro',
      roleTitle: 'Ayudante',
      baseSalaryCents: 100000
    });
  }, /No tienes permiso/);
});

test('Desembolso de nómina en efectivo debita la caja abierta y genera comprobante secuencial', async () => {
  const service = new MemoryDataService({ uid: 'owner-1', role: 'owner', displayName: 'Nechy' });

  // Crear empleado
  const empId = await service.saveEmployee({
    name: 'José Gómez',
    roleTitle: 'Barista',
    baseSalaryCents: 1400000,
    frequency: 'biweekly',
    preferredMethod: 'cash'
  });

  // Abrir turno de caja con RD$ 20,000.00
  const sessionId = await service.openCashSession({ openingCents: 2000000, notes: 'Turno mañana' });

  // Pagar nómina en efectivo: Base RD$ 14,000 + Bono RD$ 1,000 - Deducción RD$ 500 = Neto RD$ 14,500 (1,450,000 centavos)
  const payment = await service.createPayrollPayment({
    employeeId: empId,
    concept: 'salary_regular',
    period: '1ra Quincena Septiembre 2026',
    baseSalaryCents: 1400000,
    bonusCents: 100000,
    deductionsCents: 50000,
    paymentMethod: 'cash',
    cashSessionId: sessionId,
    notes: 'Pago completo con bono por puntualidad',
    authorizedBy: 'owner-1',
    authorizedByName: 'Nechy'
  });

  assert.ok(payment.id);
  assert.equal(payment.receiptNumber, 'NOM-000001');
  assert.equal(payment.employeeName, 'José Gómez');
  assert.equal(payment.netAmountCents, 1450000);
  assert.equal(payment.paymentMethod, 'cash');

  // Verificar que se creó automáticamente un movimiento de salida en caja
  const cashMovement = service.data.cashMovements.find((m) => m.payrollPaymentId === payment.id);
  assert.ok(cashMovement, 'Debe existir un cashMovement vinculado');
  assert.equal(cashMovement.type, 'out');
  assert.equal(cashMovement.amountCents, 1450000);
  assert.ok(cashMovement.reason.includes('Nómina: José Gómez'));
  assert.ok(cashMovement.reason.includes('Sueldo regular / Quincena'));

  // Verificar que el efectivo esperado de la caja disminuyó en RD$ 14,500.00
  // Inicial: 2,000,000 - Salida 1,450,000 = 550,000
  const session = service.data.cashSessions.find((s) => s.id === sessionId);
  assert.equal(session.expectedCents, 2000000 - 1450000);
});

test('Desembolso por transferencia bancaria no altera el efectivo de la gaveta de caja', async () => {
  const service = new MemoryDataService({ uid: 'owner-1', role: 'owner', displayName: 'Nechy' });

  const empId = await service.saveEmployee({
    name: 'Karla Santos',
    roleTitle: 'Administradora',
    baseSalaryCents: 3000000,
    frequency: 'monthly',
    preferredMethod: 'transfer'
  });

  // Abrir turno de caja
  const sessionId = await service.openCashSession({ openingCents: 1000000, notes: 'Turno tarde' });

  // Pagar por transferencia
  const payment = await service.createPayrollPayment({
    employeeId: empId,
    concept: 'salary_regular',
    period: 'Septiembre 2026',
    baseSalaryCents: 3000000,
    bonusCents: 0,
    deductionsCents: 0,
    paymentMethod: 'transfer',
    notes: 'Transferencia Banreservas cuenta 960...',
    authorizedBy: 'owner-1',
    authorizedByName: 'Nechy'
  });

  assert.equal(payment.receiptNumber, 'NOM-000001');
  assert.equal(payment.netAmountCents, 3000000);
  assert.equal(payment.paymentMethod, 'transfer');

  // No debe haber cashMovement asociado
  const movement = service.data.cashMovements.find((m) => m.payrollPaymentId === payment.id);
  assert.equal(movement, undefined, 'No debe registrarse movimiento de efectivo');

  // El saldo esperado de la caja permanece idéntico
  const session = service.data.cashSessions.find((s) => s.id === sessionId);
  assert.equal(session.expectedCents, 1000000);
});

test('Intento de pago en efectivo sin caja abierta arroja error', async () => {
  const service = new MemoryDataService({ uid: 'owner-1', role: 'owner', displayName: 'Nechy' });

  const empId = await service.saveEmployee({
    name: 'Manuel Díaz',
    roleTitle: 'Mesero',
    baseSalaryCents: 1200000
  });

  await assert.rejects(async () => {
    await service.createPayrollPayment({
      employeeId: empId,
      concept: 'salary_advance',
      baseSalaryCents: 200000,
      paymentMethod: 'cash'
      // sin cashSessionId
    });
  }, /caja abierta/);
});

test('buildPayrollReceiptEscPos y buildPayrollReceiptPlainText generan tickets con desglose y firmas oficiales', () => {
  const payment = {
    id: 'pay_test_1',
    receiptNumber: 'NOM-000045',
    createdAt: new Date('2026-09-07T14:30:00Z'),
    employeeName: 'Rosa M. Tavárez',
    employeeCedula: '001-9876543-2',
    employeeRole: 'Cajera Principal',
    concept: 'salary_regular',
    conceptLabel: 'Sueldo regular / Quincena',
    period: '1ra Quincena Septiembre 2026',
    baseSalaryCents: 1600000,
    bonusCents: 250000,
    deductionsCents: 100000,
    netAmountCents: 1750000,
    paymentMethod: 'cash',
    paymentMethodLabel: 'Efectivo (Caja)',
    authorizedByName: 'Nechy (Propietario)',
    notes: 'Bono por cuadre de caja perfecto'
  };

  const settings = { name: 'Los Panitas by Nechy' };

  // ESC/POS
  const escPosBuilder = buildPayrollReceiptEscPos(payment, settings);
  assert.ok(escPosBuilder);
  const escPosBytes = escPosBuilder.getBytes();
  assert.ok(escPosBytes.length > 50);

  // Plain Text
  const plainText = buildPayrollReceiptPlainText(payment, settings);
  assert.ok(plainText.includes('COMPROBANTE DE NÓMINA'));
  assert.ok(plainText.includes('NOM-000045'));
  assert.ok(plainText.includes('Rosa M. Tavárez'));
  assert.ok(plainText.includes('001-9876543-2'));
  assert.ok(plainText.includes('Cajera Principal'));
  assert.ok(plainText.includes('1ra Quincena Septiembre 2026'));
  assert.ok(plainText.includes('16,000.00'));
  assert.ok(plainText.includes('2,500.00'));
  assert.ok(plainText.includes('1,000.00'));
  assert.ok(plainText.includes('17,500.00'));
  assert.ok(plainText.includes('Efectivo (Caja)'));
  assert.ok(plainText.includes('Nechy (Propietario)'));
  assert.ok(plainText.includes('Firma del Empleado (Recibí Conforme)'));
  assert.ok(plainText.includes('Firma Autorizada'));
});
