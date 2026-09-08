import { toCents } from './billing.js';

export const PAYROLL_CONCEPTS = Object.freeze({
  salary_regular: { id: 'salary_regular', label: 'Sueldo regular / Quincena', isAdvance: false },
  salary_advance: { id: 'salary_advance', label: 'Adelanto de sueldo / Vale', isAdvance: true },
  salary_day: { id: 'salary_day', label: 'Día laborado / Jornal', isAdvance: false },
  bonus: { id: 'bonus', label: 'Bono / Gratificación', isAdvance: false },
  overtime: { id: 'overtime', label: 'Horas extras', isAdvance: false },
  settlement: { id: 'settlement', label: 'Liquidación / Prestaciones', isAdvance: false },
  deduction: { id: 'deduction', label: 'Deducción / Descuento', isAdvance: false }
});

export const SALARY_FREQUENCIES = Object.freeze({
  biweekly: { id: 'biweekly', label: 'Quincenal' },
  monthly: { id: 'monthly', label: 'Mensual' },
  daily: { id: 'daily', label: 'Por día / Jornal' },
  hourly: { id: 'hourly', label: 'Por hora' }
});

export const PAYROLL_PAYMENT_METHODS = Object.freeze({
  cash: { id: 'cash', label: 'Efectivo (Gaveta de Caja)', impactsCashDrawer: true },
  transfer: { id: 'transfer', label: 'Transferencia Bancaria', impactsCashDrawer: false },
  other: { id: 'other', label: 'Cheque / Otro', impactsCashDrawer: false }
});

export function getPayrollConceptLabel(conceptId) {
  return PAYROLL_CONCEPTS[conceptId]?.label || 'Pago a Empleado';
}

export function getPaymentMethodLabel(methodId) {
  return PAYROLL_PAYMENT_METHODS[methodId]?.label || 'Efectivo';
}

export function getSalaryFrequencyLabel(freqId) {
  return SALARY_FREQUENCIES[freqId]?.label || 'Quincenal';
}

export function calculatePayrollNetCents(inputOrBase = 0, maybeBonus = 0, maybeDeductions = 0) {
  let base, bonus, deductions;
  if (typeof inputOrBase === 'object' && inputOrBase !== null) {
    base = Math.max(0, Math.round(Number(inputOrBase.baseSalaryCents) || 0));
    bonus = Math.max(0, Math.round(Number(inputOrBase.bonusCents) || 0));
    deductions = Math.max(0, Math.round(Number(inputOrBase.deductionsCents) || 0));
  } else {
    base = Math.max(0, Math.round(Number(inputOrBase) || 0));
    bonus = Math.max(0, Math.round(Number(maybeBonus) || 0));
    deductions = Math.max(0, Math.round(Number(maybeDeductions) || 0));
  }
  const net = Math.max(0, base + bonus - deductions);
  return {
    baseSalaryCents: base,
    bonusCents: bonus,
    deductionsCents: deductions,
    netAmountCents: net,
    valueOf() { return net; },
    [Symbol.toPrimitive](hint) {
      if (hint === 'string') return String(net);
      return net;
    }
  };
}

export function validateEmployeeData(data = {}) {
  const name = String(data.name || '').trim();
  if (!name || name.length < 3) {
    throw new Error('El nombre del empleado debe tener al menos 3 caracteres.');
  }

  const roleTitle = String(data.roleTitle || '').trim();
  if (!roleTitle) {
    throw new Error('Debes indicar el cargo o función del empleado en el negocio.');
  }

  const baseSalaryCents = Math.round(toCents(data.baseSalary != null ? data.baseSalary : (Number(data.baseSalaryCents || 0) / 100)));
  if (isNaN(baseSalaryCents) || baseSalaryCents < 0) {
    throw new Error('El sueldo base no puede ser un valor negativo.');
  }

  const frequency = data.frequency || 'biweekly';
  if (!SALARY_FREQUENCIES[frequency]) {
    throw new Error(`Frecuencia de pago inválida: ${frequency}`);
  }

  const preferredMethod = data.preferredMethod || 'cash';
  if (!PAYROLL_PAYMENT_METHODS[preferredMethod]) {
    throw new Error(`Método de pago inválido: ${preferredMethod}`);
  }

  return {
    name,
    roleTitle,
    cedula: String(data.cedula || '').trim(),
    phone: String(data.phone || '').trim(),
    frequency,
    baseSalaryCents,
    preferredMethod,
    bankName: String(data.bankName || '').trim(),
    bankAccount: String(data.bankAccount || '').trim(),
    notes: String(data.notes || '').trim(),
    active: data.active !== false
  };
}

export function validatePayrollPayment(payment = {}, activeCash = null) {
  const employeeId = String(payment.employeeId || '').trim();
  if (!employeeId) {
    throw new Error('Debes seleccionar un empleado.');
  }

  const concept = String(payment.concept || 'salary_regular').trim();
  if (!PAYROLL_CONCEPTS[concept]) {
    throw new Error(`Concepto de nómina inválido: ${concept}`);
  }

  const parseCents = (centsVal, decimalVal) => {
    const value = centsVal != null && centsVal !== '' ? Number(centsVal)
      : decimalVal != null && decimalVal !== '' ? toCents(decimalVal) : 0;
    if (!Number.isSafeInteger(value) || value < 0 || value > 100000000000) throw new Error('Monto de nómina inválido.');
    return value;
  };

  const { baseSalaryCents, bonusCents, deductionsCents, netAmountCents } = calculatePayrollNetCents({
    baseSalaryCents: parseCents(payment.baseSalaryCents, payment.baseSalary),
    bonusCents: parseCents(payment.bonusCents, payment.bonus),
    deductionsCents: parseCents(payment.deductionsCents, payment.deductions)
  });

  if (!Number.isSafeInteger(netAmountCents) || netAmountCents > 100000000000) throw new Error('Monto de nómina inválido.');
  if (netAmountCents <= 0) {
    throw new Error('El monto neto a pagar debe ser mayor a RD$ 0.00.');
  }

  const method = String(payment.paymentMethod || 'cash').trim();
  if (!PAYROLL_PAYMENT_METHODS[method]) {
    throw new Error(`Método de desembolso inválido: ${method}`);
  }

  if (method === 'cash') {
    if (!activeCash?.id || (activeCash.status && activeCash.status !== 'open')) {
      throw new Error('No hay una sesión de caja abierta para dispensar efectivo. Abre caja primero o utiliza transferencia.');
    }
  }

  return {
    employeeId,
    concept,
    conceptLabel: getPayrollConceptLabel(concept),
    period: String(payment.period || '').trim().slice(0, 160) || new Date().toLocaleDateString('es-DO', { month: 'long', year: 'numeric' }),
    baseSalaryCents,
    bonusCents,
    deductionsCents,
    netAmountCents,
    paymentMethod: method,
    paymentMethodLabel: getPaymentMethodLabel(method),
    notes: String(payment.notes || '').trim().slice(0, 300)
  };
}

export function payrollFingerprint(payment, cashSessionId) {
  return JSON.stringify([payment.employeeId, payment.concept, payment.period, payment.baseSalaryCents,
    payment.bonusCents, payment.deductionsCents, payment.paymentMethod, payment.notes, cashSessionId || null]);
}
