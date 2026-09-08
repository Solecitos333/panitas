import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { DataService } from '../src/services/data-service.js';

let environment;

const auth = (role) => ({ email: `${role}@example.test`, email_verified: true });

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-los-panitas-by-nechy',
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') }
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    for (const role of ['owner', 'manager', 'cashier', 'waiter', 'kitchen']) {
      await setDoc(doc(firestore, 'users', role), { active: true, roles: [role], email: `${role}@example.test` });
    }
    await setDoc(doc(firestore, 'settings', 'general'), { name: 'Los Panitas by Nechy' });
    await setDoc(doc(firestore, 'employees', 'sample-employee'), { name: 'Empleado de prueba', active: true, roleTitle: 'Cocina' });
    await setDoc(doc(firestore, 'products', 'p1'), { name: 'Producto', priceCents: 10000, costCents: 5000, stock: 10, active: true });
    await setDoc(doc(firestore, 'invoices', 'i1'), {
      documentType: 'invoice', invoiceNumber: 'PAN-001001', status: 'pending', totalCents: 10000,
      paidCents: 0, lastPaymentId: '', updatedBy: 'cashier', orderId: ''
    });
    await setDoc(doc(firestore, 'payments', 'pay1'), { amountCents: 10000, createdBy: 'cashier' });
    await setDoc(doc(firestore, 'cashSessions', 'shift-cashier'), {
      status: 'open', openedBy: 'cashier', openingCents: 500, expectedCents: 500,
      lastCashActivityId: '', lastCashActivityType: ''
    });
    await setDoc(doc(firestore, 'counters', 'cash-cashier'), { activeSessionId: 'shift-cashier', updatedBy: 'cashier' });
    await setDoc(doc(firestore, 'counters', 'billing'), {
      invoice: 1001, quote: 1001, proforma: 1001, ncfB01: 1, ncfB02: 1, ncfB14: 1, ncfB15: 1
    });
    await setDoc(doc(firestore, 'tables', 'mesa-1'), { name: 'Mesa 1', status: 'available', currentOrderId: null, active: true });
    await setDoc(doc(firestore, 'orders', 'o1'), { status: 'pending', revision: 1, updatedBy: 'waiter' });
    await setDoc(doc(firestore, 'users', 'generic'), {
      username: 'CAJA01', authEmail: 'caja01@users.lospanitas.app', displayName: 'Caja genérica', roles: ['cashier'], active: true
    });
  });
});

after(async () => environment?.cleanup());

test('dos usuarios concurrentes no pueden reservar el mismo PIN y nadie puede leer las reservas', async () => {
  const ownerDb = environment.authenticatedContext('owner', auth('owner')).firestore();
  const cashierDb = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const owner = new DataService(ownerDb, { uid: 'owner', displayName: 'Propietario' });
  const cashier = new DataService(cashierDb, { uid: 'cashier', displayName: 'Caja' });
  const results = await Promise.allSettled([owner.saveMyDrawerPin('582401'), cashier.saveMyDrawerPin('582401')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  await assertFails(getDoc(doc(ownerDb, 'pinClaims', '582401')));
  await assertFails(getDocs(collection(ownerDb, 'pinClaims')));
  await assertFails(setDoc(doc(ownerDb, 'userSecrets', 'cashier'), { drawerPin: '749201', pinUnique: true, updatedBy: 'owner', updatedAt: serverTimestamp() }));
});

test('la sesión personal nunca acepta el PIN de otra cuenta', async () => {
  const owner = new DataService(environment.authenticatedContext('owner', auth('owner')).firestore(), { uid: 'owner' });
  const cashier = new DataService(environment.authenticatedContext('cashier', auth('cashier')).firestore(), { uid: 'cashier' });
  await owner.saveMyDrawerPin('628403');
  await cashier.saveMyDrawerPin('739502');
  await assert.rejects(cashier.verifyDrawerPin('628403'), /PIN incorrecto/);
  assert.equal((await cashier.verifyDrawerPin('739502')).user.id, 'cashier');
});

test('nómina en efectivo acepta la llamada del formulario y es atómica e idempotente', async () => {
  const db = environment.authenticatedContext('owner', auth('owner')).firestore();
  const service = new DataService(db, { uid: 'owner', active: true, roles: ['owner'], displayName: 'Propietario' });
  const cashSessionId = await service.openCashSession({ openingCents: 50000 });
  const input = { requestId: 'payroll-review-000001', employeeId: 'sample-employee', baseSalaryCents: 10000, paymentMethod: 'cash', cashSessionId, period: 'Prueba' };
  const results = await Promise.all([service.createPayrollPayment(input), service.createPayrollPayment(input)]);
  assert.equal(results[0].id, results[1].id);
  assert.equal((await getDocs(collection(db, 'payrollPayments'))).size, 1);
  assert.equal((await getDocs(collection(db, 'cashMovements'))).size, 1);
  assert.equal((await getDoc(doc(db, 'cashSessions', cashSessionId))).data().expectedCents, 40000);
  const record = (await getDoc(doc(db, 'payrollPayments', input.requestId))).data();
  const movement = (await getDoc(doc(db, 'cashMovements', record.cashMovementId))).data();
  assert.equal(movement.payrollPaymentId, input.requestId);
  assert.equal(movement.amountCents, record.netAmountCents);
  await assert.rejects(service.createPayrollPayment({ ...input, baseSalaryCents: 9000 }), /otro pago/);
  await service.closeCashSession(cashSessionId, { closingCents: 40000 });
  assert.equal((await service.createPayrollPayment(input)).id, input.requestId);
});

test('fallo de nómina no deja ni pago ni salida y no usa cajas ajenas', async () => {
  const db = environment.authenticatedContext('owner', auth('owner')).firestore();
  const service = new DataService(db, { uid: 'owner', active: true, roles: ['owner'] });
  const cashSessionId = await service.openCashSession({ openingCents: 1000 });
  const input = { requestId: 'payroll-failure-000001', employeeId: 'sample-employee', baseSalaryCents: 10000, paymentMethod: 'cash', cashSessionId };
  await assert.rejects(service.createPayrollPayment(input), /supera el efectivo/);
  await assert.rejects(service.createPayrollPayment({ ...input, cashSessionId: 'shift-cashier' }), /otro usuario/);
  assert.equal((await getDocs(collection(db, 'payrollPayments'))).size, 0);
  assert.equal((await getDocs(collection(db, 'cashMovements'))).size, 0);
  assert.equal((await getDoc(doc(db, 'cashSessions', cashSessionId))).data().expectedCents, 1000);
});

test('nómina por transferencia no altera caja y exige empleado activo', async () => {
  const db = environment.authenticatedContext('owner', auth('owner')).firestore();
  const service = new DataService(db, { uid: 'owner', active: true, roles: ['owner'] });
  const input = { requestId: 'payroll-transfer-00001', employeeId: 'sample-employee', baseSalaryCents: 10000, paymentMethod: 'transfer' };
  const result = await service.createPayrollPayment(input);
  assert.equal(result.cashMovementId, null);
  assert.equal((await getDocs(collection(db, 'cashMovements'))).size, 0);
  await updateDoc(doc(db, 'employees', 'sample-employee'), { active: false });
  await assert.rejects(service.createPayrollPayment({ ...input, requestId: 'payroll-inactive-00001' }), /no disponible/);
});

test('reglas impiden separar nómina de su movimiento de efectivo', async () => {
  const db = environment.authenticatedContext('owner', auth('owner')).firestore();
  const service = new DataService(db, { uid: 'owner', active: true, roles: ['owner'] });
  const cashSessionId = await service.openCashSession({ openingCents: 50000 });
  const valid = await service.createPayrollPayment({ requestId: 'payroll-original-00001', employeeId: 'sample-employee', baseSalaryCents: 1000, paymentMethod: 'cash', cashSessionId });
  const record = (await getDoc(doc(db, 'payrollPayments', valid.id))).data();
  await assertFails(setDoc(doc(db, 'payrollPayments', 'payroll-orphan-00001'), {
    ...record, requestId: 'payroll-orphan-00001', cashMovementId: 'payroll-orphan-00001-cash', createdAt: serverTimestamp()
  }));
  const movement = (await getDoc(doc(db, 'cashMovements', record.cashMovementId))).data();
  const batch = writeBatch(db);
  batch.set(doc(db, 'cashMovements', 'orphan-cash-movement'), { ...movement, payrollPaymentId: 'missing-payroll', createdAt: serverTimestamp() });
  batch.update(doc(db, 'cashSessions', cashSessionId), { expectedCents: 48000, lastCashActivityId: 'orphan-cash-movement', updatedAt: serverTimestamp(), updatedBy: 'owner' });
  await assertFails(batch.commit());
  assert.equal((await getDoc(doc(db, 'cashSessions', cashSessionId))).data().expectedCents, 49000);
});

test('venta real, reintento y cierre mantienen saldo y cajero autenticado', async () => {
  const db = environment.authenticatedContext('owner', auth('owner')).firestore();
  const service = new DataService(db, { uid: 'owner', active: true, roles: ['owner'], displayName: 'Propietario' });
  const cashSessionId = await service.openCashSession({ openingCents: 1000 });
  const input = { requestId: 'sale-delivery-review-001', cashierId: 'cashier', cashierName: 'Otra persona',
    items: [{ productId: 'p1', name: 'Producto', unitPriceCents: 10000, taxRate: 0, quantity: 1 }],
    payment: { amountCents: 10000, method: 'cash', tenderedCents: 15000, cashSessionId } };
  const first = await service.createDirectDocument(input);
  assert.equal((await service.createDirectDocument(input)).id, first.id);
  const invoice = (await getDoc(doc(db, 'invoices', first.id))).data();
  assert.equal(invoice.cashierId, 'owner');
  assert.equal(invoice.cashierName, 'Propietario');
  assert.equal((await getDoc(doc(db, 'products', 'p1'))).data().stock, 9);
  assert.equal((await getDoc(doc(db, 'cashSessions', cashSessionId))).data().expectedCents, 11000);
  await assertFails(setDoc(doc(db, 'invoices', 'forged-author-00001'), { ...invoice,
    requestId: 'forged-author-00001', cashierId: 'cashier', documentType: 'quote', paidCents: 0,
    status: 'pending', lastPaymentId: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await service.closeCashSession(cashSessionId, { closingCents: 11000 });
});

test('cambiar PIN libera solo la reserva propia y un fallo conserva el PIN anterior', async () => {
  const ownerDb = environment.authenticatedContext('owner', auth('owner')).firestore();
  const cashierDb = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const owner = new DataService(ownerDb, { uid: 'owner', displayName: 'Propietario' });
  const cashier = new DataService(cashierDb, { uid: 'cashier', displayName: 'Caja' });
  await owner.saveMyDrawerPin('582401');
  await cashier.saveMyDrawerPin('749201');
  await assert.rejects(owner.saveMyDrawerPin('749201'), /reservar/);
  await owner.verifyDrawerPin('582401');
  await owner.saveMyDrawerPin('613801');
  await cashier.saveMyDrawerPin('582401');
  await cashier.verifyDrawerPin('582401');
  const invalid = writeBatch(ownerDb);
  invalid.set(doc(ownerDb, 'pinClaims', '926401'), { userId: 'owner' });
  await assertFails(invalid.commit());
  await assert.rejects(owner.saveMyDrawerPin('61x38'), /exactamente/);
});

test('reintentar una salida conserva un movimiento y un único descuento de caja', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const service = new DataService(db, { uid: 'cashier', displayName: 'Caja' });
  const input = { requestId: 'movement-retry-000001', cashSessionId: 'shift-cashier', type: 'out', amountCents: 100, reason: 'Compra menor' };
  const ids = await Promise.all([service.createCashMovement(input), service.createCashMovement(input)]);
  assert.equal(ids[0], ids[1]);
  assert.equal((await getDoc(doc(db, 'cashSessions', 'shift-cashier'))).data().expectedCents, 400);
  assert.equal((await getDocs(collection(db, 'cashMovements'))).size, 1);
  await assert.rejects(service.createCashMovement({ ...input, amountCents: 200 }), /otro movimiento/);
});

test('un cierre con diferencia requiere nota y registra usuario y hora de servidor', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const service = new DataService(db, { uid: 'cashier', displayName: 'Caja' });
  await assert.rejects(service.closeCashSession('shift-cashier', { closingCents: 400 }), /diferencia/);
  const result = await service.closeCashSession('shift-cashier', { closingCents: 400, notes: 'Recontado, falta revisar recibos.' });
  assert.equal(result.varianceCents, -100);
  const stored = (await getDoc(doc(db, 'cashSessions', 'shift-cashier'))).data();
  assert.equal(stored.closedBy, 'cashier');
  assert.ok(stored.closedAt.toMillis() > 0);
});

test('rechaza lecturas anónimas', async () => {
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'settings', 'general')));
});

test('cajero lee catálogo pero cocina no lee facturas', async () => {
  await assertSucceeds(getDoc(doc(environment.authenticatedContext('cashier', auth('cashier')).firestore(), 'products', 'p1')));
  await assertFails(getDoc(doc(environment.authenticatedContext('kitchen', auth('kitchen')).firestore(), 'invoices', 'i1')));
});

test('cocina puede iniciar preparación pero no cerrar la orden', async () => {
  const db = environment.authenticatedContext('kitchen', auth('kitchen')).firestore();
  await assertSucceeds(updateDoc(doc(db, 'orders', 'o1'), {
    status: 'preparing', revision: 2, updatedBy: 'kitchen', updatedAt: serverTimestamp(), statusChangedAt: serverTimestamp()
  }));
  await assertFails(updateDoc(doc(db, 'orders', 'o1'), {
    status: 'closed', revision: 3, updatedBy: 'kitchen', updatedAt: serverTimestamp(), statusChangedAt: serverTimestamp()
  }));
});

test('crear y cancelar una comanda exige actualizar su mesa en la misma transacción', async () => {
  const db = environment.authenticatedContext('waiter', auth('waiter')).firestore();
  const orderRef = doc(db, 'orders', 'linked-order');
  const tableRef = doc(db, 'tables', 'mesa-1');
  const order = {
    tableId: 'mesa-1', tableName: 'Mesa 1', clientName: 'Consumidor final', clientId: '', notes: '',
    priority: 'normal', items: [{ productId: 'p1', name: 'Producto', unitPriceCents: 10000, taxRate: 0, quantity: 1 }],
    subtotalCents: 10000, taxCents: 0, totalCents: 10000,
    status: 'pending', revision: 1, createdAt: serverTimestamp(), createdBy: 'waiter',
    updatedAt: serverTimestamp(), updatedBy: 'waiter', statusChangedAt: serverTimestamp()
  };

  await assertFails(setDoc(orderRef, order));

  const createBatch = writeBatch(db);
  createBatch.set(orderRef, order);
  createBatch.update(tableRef, { status: 'occupied', currentOrderId: 'linked-order', updatedAt: serverTimestamp() });
  await assertSucceeds(createBatch.commit());

  const cancellation = {
    status: 'cancelled', revision: 2, cancellationReason: 'Pedido duplicado',
    cancelledAt: serverTimestamp(), cancelledBy: 'waiter', updatedAt: serverTimestamp(),
    updatedBy: 'waiter', statusChangedAt: serverTimestamp()
  };
  await assertFails(updateDoc(orderRef, cancellation));

  const cancelBatch = writeBatch(db);
  cancelBatch.update(orderRef, cancellation);
  cancelBatch.update(tableRef, { status: 'available', currentOrderId: null, updatedAt: serverTimestamp() });
  await assertSucceeds(cancelBatch.commit());
});

test('caja solo cierra una comanda servida junto con su factura y liberación de mesa', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'orders', 'served-order'), {
      status: 'served', revision: 4, updatedBy: 'waiter', tableId: 'mesa-1', clientName: 'Consumidor',
      items: [{ productId: 'p1', name: 'Producto', unitPriceCents: 10000, taxRate: 0, quantity: 1 }],
      subtotalCents: 10000, discountCents: 0, taxableSubtotalCents: 10000, taxCents: 0, tipCents: 0, totalCents: 10000
    });
    await updateDoc(doc(context.firestore(), 'tables', 'mesa-1'), { status: 'occupied', currentOrderId: 'served-order' });
  });
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const orderUpdate = {
    status: 'closed', linkedInvoiceId: 'invoice-served', revision: 5,
    closedAt: serverTimestamp(), closedBy: 'cashier', updatedAt: serverTimestamp(),
    updatedBy: 'cashier', statusChangedAt: serverTimestamp()
  };
  await assertFails(updateDoc(doc(db, 'orders', 'served-order'), orderUpdate));

  const invoicePayload = {
    requestId: 'invoice-served', documentType: 'invoice', invoiceNumber: 'PAN-001001', ncf: '', ncfType: '',
    items: [{ productId: 'p1', name: 'Producto', unitPriceCents: 10000, taxRate: 0, quantity: 1 }],
    subtotalCents: 10000, discountCents: 0, taxableSubtotalCents: 10000, taxCents: 0, tipCents: 0,
    totalCents: 10000, paidCents: 0, lastPaymentId: '', status: 'pending',
    orderId: 'served-order', tableId: 'mesa-1', clientName: 'Consumidor', clientId: '', clientRnc: '', notes: '',
    cashierId: 'cashier', cashierName: 'Caja', createdAt: serverTimestamp(), createdBy: 'cashier',
    updatedAt: serverTimestamp(), updatedBy: 'cashier'
  };

  const mismatchedBatch = writeBatch(db);
  mismatchedBatch.set(doc(db, 'invoices', 'invoice-served'), {
    ...invoicePayload,
    items: [{ productId: 'p1', name: 'Producto', unitPriceCents: 10000, taxRate: 0, quantity: 2 }],
    subtotalCents: 20000, taxableSubtotalCents: 20000, totalCents: 20000
  });
  mismatchedBatch.update(doc(db, 'orders', 'served-order'), orderUpdate);
  mismatchedBatch.update(doc(db, 'tables', 'mesa-1'), { status: 'available', currentOrderId: null, updatedAt: serverTimestamp() });
  await assertFails(mismatchedBatch.commit());

  const batch = writeBatch(db);
  batch.set(doc(db, 'invoices', 'invoice-served'), invoicePayload);
  batch.update(doc(db, 'orders', 'served-order'), orderUpdate);
  batch.update(doc(db, 'tables', 'mesa-1'), { status: 'available', currentOrderId: null, updatedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
});

test('pagos y auditorías son inmutables', async () => {
  const db = environment.authenticatedContext('owner', auth('owner')).firestore();
  await assertFails(updateDoc(doc(db, 'payments', 'pay1'), { amountCents: 1 }));
});

test('las secuencias no se pueden retroceder ni saltar arbitrariamente', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  await assertFails(updateDoc(doc(db, 'counters', 'billing'), { invoice: 50, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(db, 'counters', 'billing'), { invoice: 9000, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db, 'counters', 'billing'), { invoice: 1002, updatedAt: serverTimestamp() }));
});

test('una factura con totales o estado fabricados es rechazada', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  await assertFails(setDoc(doc(db, 'invoices', 'fake-invoice-0001'), {
    requestId: 'fake-invoice-0001', documentType: 'invoice', invoiceNumber: 'PAN-001001', ncf: '', ncfType: '',
    items: [{ name: 'Producto', quantity: 1, unitPriceCents: 10000 }],
    subtotalCents: 10000, discountCents: 0, taxableSubtotalCents: 10000, taxCents: 0, tipCents: 0,
    totalCents: 1, paidCents: 1, lastPaymentId: '', status: 'paid', orderId: '', tableId: '',
    cashierId: 'cashier', createdAt: serverTimestamp(), createdBy: 'cashier', updatedAt: serverTimestamp(), updatedBy: 'cashier'
  }));
});

test('la apertura de caja crea sesión y bloqueo de usuario de forma atómica', async () => {
  const db = environment.authenticatedContext('manager', auth('manager')).firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, 'cashSessions', 'shift-manager'), {
    openingCents: 2000, expectedCents: 2000, lastCashActivityId: '', lastCashActivityType: '',
    notes: '', status: 'open', openedAt: serverTimestamp(), openedBy: 'manager', openedByName: 'Gerencia'
  });
  batch.set(doc(db, 'counters', 'cash-manager'), {
    activeSessionId: 'shift-manager', updatedAt: serverTimestamp(), updatedBy: 'manager'
  });
  await assertSucceeds(batch.commit());
});

test('una caja abierta no puede ser sustituida por otra sesión', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, 'cashSessions', 'shift-cashier-2'), {
    openingCents: 0, expectedCents: 0, lastCashActivityId: '', lastCashActivityType: '',
    notes: '', status: 'open', openedAt: serverTimestamp(), openedBy: 'cashier', openedByName: 'Caja'
  });
  batch.update(doc(db, 'counters', 'cash-cashier'), {
    activeSessionId: 'shift-cashier-2', updatedAt: serverTimestamp(), updatedBy: 'cashier'
  });
  await assertFails(batch.commit());
});

test('un cobro exige factura, actualización de saldo y caja propia en la misma transacción', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const payment = {
    invoiceId: 'i1', invoiceNumber: 'PAN-001001', amountCents: 1000,
    method: 'cash', reference: '', tenderedCents: 2000, changeCents: 1000, cashSessionId: 'shift-cashier',
    cashierId: 'cashier', cashierName: 'Caja', createdBy: 'cashier', createdAt: serverTimestamp()
  };
  await assertFails(setDoc(doc(db, 'payments', 'orphan-payment'), payment));

  const batch = writeBatch(db);
  batch.update(doc(db, 'invoices', 'i1'), {
    paidCents: 1000, status: 'partial', lastPaymentId: 'valid-payment',
    updatedAt: serverTimestamp(), updatedBy: 'cashier'
  });
  batch.set(doc(db, 'payments', 'valid-payment'), payment);
  batch.update(doc(db, 'cashSessions', 'shift-cashier'), {
    expectedCents: 1500, lastCashActivityId: 'valid-payment', lastCashActivityType: 'payment',
    updatedAt: serverTimestamp(), updatedBy: 'cashier'
  });
  await assertSucceeds(batch.commit());

  await assertFails(setDoc(doc(db, 'payments', 'missing-shift'), {
    invoiceId: 'i1', invoiceNumber: 'PAN-001001', amountCents: 1000,
    method: 'cash', reference: '', cashSessionId: '',
    createdBy: 'cashier', createdAt: serverTimestamp()
  }));
});

test('un pago de crédito no puede simular dinero cobrado', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const batch = writeBatch(db);
  batch.update(doc(db, 'invoices', 'i1'), {
    paidCents: 1000, status: 'partial', lastPaymentId: 'credit-as-payment',
    updatedAt: serverTimestamp(), updatedBy: 'cashier'
  });
  batch.set(doc(db, 'payments', 'credit-as-payment'), {
    invoiceId: 'i1', invoiceNumber: 'PAN-001001', amountCents: 1000,
    method: 'credit', reference: '', tenderedCents: 0, changeCents: 0,
    cashSessionId: 'shift-cashier', cashierId: 'cashier', cashierName: 'Caja',
    createdBy: 'cashier', createdAt: serverTimestamp()
  });
  await assertFails(batch.commit());
});

test('el servicio real completa factura, pago, inventario, contador y caja atómicamente', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const service = new DataService(db, {
    uid: 'cashier', email: 'cashier@example.test', displayName: 'Caja', username: 'CAJA', roles: ['cashier'], active: true
  });
  const created = await service.createDirectDocument({
    requestId: 'sale-rules-e2e-000001', documentType: 'invoice', clientName: 'Consumidor final', clientRnc: '',
    items: [{ productId: 'p1', name: 'Producto', unitPriceCents: 10000, taxRate: 0, quantity: 1 }],
    ncfType: '', payment: {
      amountCents: 10000, method: 'cash', tenderedCents: 12000, changeCents: 2000,
      cashSessionId: 'shift-cashier', cashierId: 'cashier', cashierName: 'Caja'
    }
  });
  assert.equal(created.id, 'sale-rules-e2e-000001');
  const invoice = (await getDoc(doc(db, 'invoices', created.id))).data();
  const session = (await getDoc(doc(db, 'cashSessions', 'shift-cashier'))).data();
  const product = (await getDoc(doc(db, 'products', 'p1'))).data();
  assert.equal(invoice.status, 'paid');
  assert.equal(invoice.lastPaymentId, 'sale-rules-e2e-000001-payment');
  assert.equal(session.expectedCents, 10500);
  assert.equal(product.stock, 9);
  await service.saveMyDrawerPin('482601');
  const authorized = await service.verifyDrawerPin('482601', 'Prueba de reglas');
  assert.equal(authorized.user.id, 'cashier');
  assert.equal((await getDoc(doc(db, 'userSecrets', 'cashier'))).data().drawerPin, '482601');
});

test('el cierre de caja usa el esperado acumulado y libera el bloqueo del usuario', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const invalidBatch = writeBatch(db);
  invalidBatch.update(doc(db, 'cashSessions', 'shift-cashier'), {
    status: 'closed', expectedCents: 600, closingCents: 450, varianceCents: -150,
    closingNotes: '', closedAt: serverTimestamp(), closedBy: 'cashier'
  });
  invalidBatch.update(doc(db, 'counters', 'cash-cashier'), {
    activeSessionId: null, updatedAt: serverTimestamp(), updatedBy: 'cashier'
  });
  await assertFails(invalidBatch.commit());

  const batch = writeBatch(db);
  batch.update(doc(db, 'cashSessions', 'shift-cashier'), {
    status: 'closed', expectedCents: 500, closingCents: 450, varianceCents: -50,
    closingNotes: 'Diferencia recontada; pendiente de revisión.', closedAt: serverTimestamp(), closedBy: 'cashier'
  });
  batch.update(doc(db, 'counters', 'cash-cashier'), {
    activeSessionId: null, updatedAt: serverTimestamp(), updatedBy: 'cashier'
  });
  await assertSucceeds(batch.commit());
});

test('los movimientos de efectivo exigen caja propia y son inmutables', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const movementRef = doc(db, 'cashMovements', 'movement-1');
  const batch = writeBatch(db);
  batch.set(movementRef, {
    cashSessionId: 'shift-cashier', type: 'in', amountCents: 5000, reason: 'Cambio adicional',
    createdAt: serverTimestamp(), createdBy: 'cashier', createdByName: 'Caja'
  });
  batch.update(doc(db, 'cashSessions', 'shift-cashier'), {
    expectedCents: 5500, lastCashActivityId: 'movement-1', lastCashActivityType: 'movement',
    updatedAt: serverTimestamp(), updatedBy: 'cashier'
  });
  await assertSucceeds(batch.commit());
  await assertFails(updateDoc(movementRef, { amountCents: 1 }));
  await assertFails(setDoc(doc(db, 'cashMovements', 'movement-invalid'), {
    cashSessionId: '', type: 'out', amountCents: 5000, reason: 'Retiro',
    createdAt: serverTimestamp(), createdBy: 'cashier', createdByName: 'Caja'
  }));
});

test('los conteos de inventario son exclusivos de gerencia y sus movimientos son inmutables', async () => {
  const managerDb = environment.authenticatedContext('manager', auth('manager')).firestore();
  const cashierDb = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const movement = {
    productId: 'p1', productName: 'Producto', type: 'decrease', operation: 'count',
    quantity: 2, delta: -2, previousStock: 10, resultingStock: 8,
    reason: 'Conteo físico', actorId: 'manager', actorName: 'Gerencia', createdAt: serverTimestamp()
  };
  const movementRef = doc(managerDb, 'inventoryMovements', 'inventory-count-1');

  const batch = writeBatch(managerDb);
  batch.update(doc(managerDb, 'products', 'p1'), { stock: 8, updatedAt: serverTimestamp(), updatedBy: 'manager' });
  batch.set(movementRef, movement);
  await assertSucceeds(batch.commit());
  await assertFails(updateDoc(movementRef, { resultingStock: 9 }));
  await assertFails(setDoc(doc(cashierDb, 'inventoryMovements', 'inventory-count-2'), {
    ...movement, actorId: 'cashier'
  }));
});

test('el PIN solo vive en el secreto privado del propio usuario', async () => {
  const db = environment.authenticatedContext('owner', auth('owner')).firestore();
  await new DataService(db, { uid: 'owner', displayName: 'Propietario' }).saveMyDrawerPin('432101');
  await assertSucceeds(getDoc(doc(db, 'userSecrets', 'owner')));
  await assertFails(getDoc(doc(db, 'userSecrets', 'cashier')));
  await assertFails(getDocs(collection(db, 'userSecrets')));
  await assertFails(updateDoc(doc(db, 'users', 'owner'), { drawerPin: '432101', updatedAt: serverTimestamp(), updatedBy: 'owner' }));
  await assertFails(updateDoc(doc(db, 'users', 'owner'), { roles: ['owner', 'manager'], active: true, updatedAt: serverTimestamp(), updatedBy: 'owner' }));
  await assertFails(setDoc(doc(db, 'userSecrets', 'owner'), { drawerPin: 'abcd', updatedAt: serverTimestamp(), updatedBy: 'owner' }));
});

test('solo el propietario puede registrar perfiles de usuarios genéricos', async () => {
  const profile = {
    username: 'NUEVO01', authEmail: 'nuevo01@users.lospanitas.app', displayName: 'Nuevo usuario', roles: ['cashier'], active: true,
    createdBy: 'owner', createdAt: serverTimestamp(), updatedBy: 'owner', updatedAt: serverTimestamp()
  };
  await assertSucceeds(setDoc(doc(environment.authenticatedContext('owner', auth('owner')).firestore(), 'users', 'new-user'), profile));
  await assertFails(setDoc(doc(environment.authenticatedContext('manager', auth('manager')).firestore(), 'users', 'other-user'), { ...profile, username: 'OTRO01', authEmail: 'otro01@users.lospanitas.app' }));
});

test('un usuario genérico activo opera sin depender de verificación por correo', async () => {
  const db = environment.authenticatedContext('generic', { email: 'caja01@users.lospanitas.app', email_verified: false }).firestore();
  await assertSucceeds(getDoc(doc(db, 'settings', 'general')));
  await assertSucceeds(getDoc(doc(db, 'users', 'generic')));
});

test('solo propietario lista usuarios; caja solo lee su propio perfil', async () => {
  const ownerDb = environment.authenticatedContext('owner', auth('owner')).firestore();
  const cashierDb = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  await assertSucceeds(getDocs(collection(ownerDb, 'users')));
  await assertFails(getDocs(collection(cashierDb, 'users')));
  await assertSucceeds(getDoc(doc(cashierDb, 'users', 'cashier')));
});

test('un usuario genérico no puede crear ni elevar su propio perfil', async () => {
  const db = environment.authenticatedContext('unknown-uid', { email: 'unknown@users.lospanitas.app', email_verified: false }).firestore();
  await assertFails(setDoc(doc(db, 'users', 'unknown-uid'), {
    username: 'UNKNOWN', authEmail: 'unknown@users.lospanitas.app', displayName: 'Desconocido', roles: ['owner'], active: true,
    createdAt: serverTimestamp(), createdBy: 'unknown-uid', updatedAt: serverTimestamp(), updatedBy: 'unknown-uid'
  }));
});
