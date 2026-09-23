import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp, writeBatch, Timestamp, deleteDoc } from 'firebase/firestore';
import { DataService } from '../src/services/data-service.js';
import { startRemoteTerminals } from '../src/services/remote-terminals.js';
import release from '../release.json' with { type: 'json' };

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

test('remote integration: heartbeat, owner request, busy deferral, restart confirmation and cleanup', async () => {
  const ownerDb = environment.authenticatedContext('owner', auth('owner')).firestore();
  const cashierDb = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const intervals = new Set(), listeners = new Map(), storage = new Map();
  const host = { EloPOS: {}, navigator: { onLine: true }, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    setInterval: fn => { intervals.add(fn); return fn; }, clearInterval: fn => intervals.delete(fn), setTimeout, clearTimeout,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
  let rows = [], errors = [], now = Date.now(), busy = true, checks = 0;
  let status = { installedVersionCode: 43, installedVersionName: '1.6.3', state: 'idle' };
  const waitFor = async predicate => { for (let i = 0; i < 150; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw Error('Remote integration timed out'); };
  const manager = startRemoteTerminals({ db: ownerDb, user: { uid: 'owner', active: true, roles: ['owner'] }, host: { ...host, EloPOS: null }, onChange: value => { rows = value; }, onError: e => errors.push(e) });
  const terminal = startRemoteTerminals({ db: cashierDb, user: { uid: 'cashier', active: true, roles: ['cashier'] }, host, clock: () => now, onChange() {}, onError: e => errors.push(e),
    native: { getStatus: () => status, isBusy: () => busy, check: () => { checks++; status = { ...status, state: 'checking' }; return true; }, install: () => true } });
  try {
    await waitFor(() => rows.length === 1);
    const id = rows[0].id;
    const request = await manager.request(id, 'update');
    await waitFor(() => rows[0]?.command?.id === request);
    // A status refresh must not replace a pending update request.
    await manager.request(id, 'report');
    assert.equal((await getDocs(collection(ownerDb, 'terminals', id, 'commands'))).size, 1);
    now += 6000; intervals.forEach(fn => fn());
    await waitFor(() => rows[0]?.commandPhase === 'waiting_for_idle'); assert.equal(checks, 0);
    busy = false; now += 6000; intervals.forEach(fn => fn());
    await waitFor(() => checks === 1);
    status = { installedVersionCode: release.versionCode, installedVersionName: release.versionName, state: 'idle' };
    // Drain any preceding report before emitting the next native-version sample.
    await waitFor(() => rows[0]?.commandPhase === 'checking');
    now += 6000; intervals.forEach(fn => fn());
    await waitFor(() => rows[0]?.commandPhase === 'completed');
    assert.equal(rows[0].installedVersionCode, release.versionCode); assert.equal(rows[0].commandId, request);
    assert.deepEqual(errors, []);
  } finally { terminal.destroy(); manager.destroy(); }
  assert.equal(intervals.size, 0); assert.equal(listeners.size, 0);
});

test('remote control restricts device reports and permits only immutable owner update commands', async () => {
  const owner = environment.authenticatedContext('owner', auth('owner')).firestore();
  const cashier = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const manager = environment.authenticatedContext('manager', auth('manager')).firestore();
  const anonymous = environment.unauthenticatedContext().firestore();
  const kitchen = environment.authenticatedContext('kitchen', auth('kitchen')).firestore();
  const report = { accountUid: 'cashier', label: 'ELO', installedVersionCode: 43, installedVersionName: '1.6.3', availableVersionCode: 44, updateState: 'idle', progress: 0, message: '', errorCode: '', fullyManaged: false, busy: false, commandId: '', commandPhase: '', lastSeenAt: serverTimestamp() };
  report.sampledAtMs = Date.now();
  await assertSucceeds(setDoc(doc(cashier, 'terminals', 'elo'), report));
  await assertSucceeds(getDocs(collection(owner, 'terminals')));
  await assertFails(getDoc(doc(anonymous, 'terminals', 'elo')));
  await assertFails(getDoc(doc(manager, 'terminals', 'elo')));
  await assertFails(setDoc(doc(manager, 'terminals', 'elo'), { ...report, accountUid: 'manager' }));
  await assertFails(setDoc(doc(kitchen, 'terminals', 'kitchen'), { ...report, accountUid: 'kitchen' }));
  await assertFails(setDoc(doc(cashier, 'terminals', 'elo'), { ...report, lastSeenAt: Timestamp.fromMillis(1) }));
  const command = { action: 'update', targetVersionCode: 44, requestedBy: 'owner', createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 86400000) };
  await assertSucceeds(setDoc(doc(owner, 'terminals', 'elo', 'commands', 'request1'), command));
  await assertSucceeds(getDocs(collection(cashier, 'terminals', 'elo', 'commands')));
  await assertFails(setDoc(doc(cashier, 'terminals', 'elo', 'commands', 'request2'), { ...command, requestedBy: 'cashier' }));
  await assertFails(setDoc(doc(manager, 'terminals', 'elo', 'commands', 'request2'), { ...command, requestedBy: 'manager' }));
  await assertFails(setDoc(doc(owner, 'terminals', 'elo', 'commands', 'shell'), { ...command, action: 'shell' }));
  await assertFails(setDoc(doc(owner, 'terminals', 'elo', 'commands', 'url'), { ...command, url: 'https://example.test/unsafe.apk' }));
  await assertFails(setDoc(doc(owner, 'terminals', 'elo', 'commands', 'late'), { ...command, expiresAt: Timestamp.fromMillis(Date.now() + 172800000) }));
  await assertFails(updateDoc(doc(owner, 'terminals', 'elo', 'commands', 'request1'), { targetVersionCode: 99 }));
  await assertFails(deleteDoc(doc(owner, 'terminals', 'elo', 'commands', 'request1')));
});

test('PIN compartido: reserva única concurrente, consulta puntual activa y listado bloqueado', async () => {
  const ownerDb = environment.authenticatedContext('owner', auth('owner')).firestore();
  const cashierDb = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const owner = new DataService(ownerDb, { uid: 'owner', displayName: 'Propietario' });
  const cashier = new DataService(cashierDb, { uid: 'cashier', displayName: 'Caja' });
  const results = await Promise.allSettled([owner.saveMyDrawerPin('582401'), cashier.saveMyDrawerPin('582401')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const reservation = await assertSucceeds(getDoc(doc(ownerDb, 'pinClaims', '582401')));
  assert.ok(['owner', 'cashier'].includes(reservation.data().userId));
  await assertFails(getDocs(collection(ownerDb, 'pinClaims')));
  await assertFails(setDoc(doc(ownerDb, 'userSecrets', 'cashier'), { drawerPin: '749201', pinUnique: true, updatedBy: 'owner', updatedAt: serverTimestamp() }));
});

test('el PIN de cualquier empleado activo autoriza operaciones identificando al usuario', async () => {
  const owner = new DataService(environment.authenticatedContext('owner', auth('owner')).firestore(), { uid: 'owner' });
  const cashier = new DataService(environment.authenticatedContext('cashier', auth('cashier')).firestore(), { uid: 'cashier' });
  await owner.saveMyDrawerPin('628403');
  await cashier.saveMyDrawerPin('739502');
  const fromCashier = await cashier.verifyDrawerPin('628403');
  assert.equal(fromCashier.user.id, 'owner');
  assert.equal((await cashier.verifyDrawerPin('739502')).user.id, 'cashier');
  await assert.rejects(cashier.verifyDrawerPin('999999'), /no reconocido/);
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
  assert.equal(invoice.cashierName, 'Otra persona');
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

for (const method of ['cash', 'delivery_cod']) test(`café con tamaño y campos opcionales vacíos: ${method}`, async () => {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'products', 'coffee'), {
      name: 'Café Negro', priceCents: 2000, isPrepared: true, stock: 0, active: true
    });
  });
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const service = new DataService(db, { uid: 'cashier', displayName: 'Caja', roles: ['cashier'] });
  const input = { requestId: `sale-coffee-${method}-00001`, documentType: 'invoice',
    items: [
      { productId: 'coffee', name: 'Café Negro (12 oz)', variantId: '12oz', variantName: '12 oz',
        side: undefined, sidePriceCents: undefined, quantity: 1, unitPriceCents: 5000, taxRate: 0 },
      { productId: 'p1', name: 'Tostada', variantId: undefined, side: undefined,
        quantity: 1, unitPriceCents: 9000, taxRate: 0 }
    ],
    deliveryDriverName: method === 'delivery_cod' ? 'Repartidor prueba' : '',
    payment: { method, amountCents: method === 'cash' ? 14000 : 0,
      tenderedCents: 15000, cashSessionId: 'shift-cashier' }
  };
  const created = await service.createDirectDocument(input);
  assert.equal((await service.createDirectDocument(input)).id, created.id);
  const invoice = (await getDoc(doc(db, 'invoices', created.id))).data();
  assert.equal(invoice.totalCents, 14000);
  assert.equal(invoice.items[0].variantId, '12oz');
  assert.equal('side' in invoice.items[0], false);
  assert.equal('variantId' in invoice.items[1], false);
  assert.equal(invoice.status, method === 'cash' ? 'paid' : 'pending');
  assert.equal((await getDoc(doc(db, 'products', 'coffee'))).data().stock, 0);
  assert.equal((await getDoc(doc(db, 'products', 'p1'))).data().stock, 9);
  assert.equal((await getDoc(doc(db, 'cashSessions', 'shift-cashier'))).data().expectedCents,
    method === 'cash' ? 14500 : 500);
  assert.equal((await getDoc(doc(db, 'payments', `${created.id}-payment`))).exists(), method === 'cash');
  assert.equal('side' in input.items[0], true);
});

test('comanda nueva con opciones vacías se guarda y cobra sin valores undefined', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const service = new DataService(db, { uid: 'cashier', displayName: 'Caja', roles: ['cashier'] });
  const items = [{ productId: 'p1', name: 'Producto', quantity: 1, unitPriceCents: 10000,
    variantId: '7oz', variantName: '7 oz', side: undefined, sidePriceCents: undefined, taxRate: 0 }];
  const id = await service.createOrder({ tableId: 'mesa-1', items });
  assert.equal('side' in (await getDoc(doc(db, 'orders', id))).data().items[0], false);
  // Kitchen/service transitions are covered separately; seed the served state here.
  await environment.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'orders', id), { status: 'served' });
  });
  const invoice = await service.chargeOrder(id, { requestId: 'sale-coffee-table-00001',
    method: 'cash', amountCents: 10000, cashSessionId: 'shift-cashier' }, items);
  assert.equal((await getDoc(doc(db, 'invoices', invoice.id))).data().status, 'paid');
  assert.equal((await getDoc(doc(db, 'orders', id))).data().status, 'closed');
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

test('el pago concurrente es único y no acepta cambiar importe, caja, método o referencia al reintentar', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const service = new DataService(db, { uid: 'cashier', displayName: 'Caja' });
  const payment = { requestId: 'payment-concurrent-00001', cashSessionId: 'shift-cashier',
    amountCents: 3000, method: 'cash', tenderedCents: 5000, reference: 'Abono inicial' };
  const ids = await Promise.all([service.recordPayment('i1', payment), service.recordPayment('i1', payment)]);
  assert.equal(ids[0], ids[1]);
  assert.equal((await getDoc(doc(db, 'invoices', 'i1'))).data().paidCents, 3000);
  assert.equal((await getDoc(doc(db, 'cashSessions', 'shift-cashier'))).data().expectedCents, 3500);
  for (const change of [{ amountCents: 1000 }, { method: 'card' }, { tenderedCents: 6000 },
    { reference: 'Otro concepto' }, { cashSessionId: 'shift-different' }]) {
    await assert.rejects(service.recordPayment('i1', { ...payment, ...change }), /referencia/);
  }
  await service.closeCashSession('shift-cashier', { closingCents: 3500 });
  assert.equal(await service.recordPayment('i1', payment), payment.requestId);
  assert.equal((await getDoc(doc(db, 'invoices', 'i1'))).data().paidCents, 3000);
});

test('una cotización no admite cobros aunque tenga saldo y caja abierta', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'invoices', 'i1'), { documentType: 'quote' });
  });
  const service = new DataService(db, { uid: 'cashier' });
  await assert.rejects(service.recordPayment('i1', { requestId: 'quote-payment-000001',
    method: 'cash', amountCents: 1000, cashSessionId: 'shift-cashier' }), /Solo las facturas/);
  assert.equal((await getDoc(doc(db, 'invoices', 'i1'))).data().paidCents, 0);
});

test('cambiar un producto preparado a vitrina reactiva el descuento de existencias', async () => {
  const db = environment.authenticatedContext('owner', auth('owner')).firestore();
  const service = new DataService(db, { uid: 'owner', roles: ['owner'], active: true });
  await service.saveProduct({ id: 'p1', name: 'Empanada', priceCents: 10000,
    inventoryType: 'preprepared', isPrepared: true, stock: 10 });
  assert.equal((await getDoc(doc(db, 'products', 'p1'))).data().isPrepared, false);
  await service.createDirectDocument({ requestId: 'stock-type-change-00001',
    items: [{ productId: 'p1', name: 'Empanada', unitPriceCents: 10000, quantity: 1 }] });
  assert.equal((await getDoc(doc(db, 'products', 'p1'))).data().stock, 9);
});

test('reasignar delivery exige factura pendiente y repartidor activo sin falsear su nombre', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  const service = new DataService(db, { uid: 'cashier', roles: ['cashier'], active: true });
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'deliveryDrivers', 'driver-active'), { name: 'Repartidor real', active: true });
    await setDoc(doc(context.firestore(), 'deliveryDrivers', 'driver-disabled'), { name: 'Inactivo', active: false });
  });
  const assignment = { driverId: 'driver-active', driverName: 'Nombre manipulado' };
  await assert.rejects(service.reassignDeliveryDriver('i1', assignment), /entregas pendientes/);
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'invoices', 'i1'), { deliveryStatus: 'in_transit', paymentMethod: 'delivery_cod' });
  });
  await assert.rejects(service.reassignDeliveryDriver('i1', { driverId: 'driver-disabled', driverName: 'Inactivo' }), /no está activo/);
  await assertFails(updateDoc(doc(db, 'invoices', 'i1'), {
    deliveryDriverId: 'driver-disabled', deliveryDriverName: 'Inactivo', updatedBy: 'cashier', updatedAt: serverTimestamp()
  }));
  const result = await service.reassignDeliveryDriver('i1', assignment);
  assert.equal(result.deliveryDriverName, 'Repartidor real');
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'invoices', 'i1'), { deliveryStatus: 'settled' });
  });
  await assert.rejects(service.reassignDeliveryDriver('i1', assignment), /entregas pendientes/);
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

test('solo propietario lista usuarios; caja consulta perfiles por ID para identificar el PIN', async () => {
  const ownerDb = environment.authenticatedContext('owner', auth('owner')).firestore();
  const cashierDb = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  await assertSucceeds(getDocs(collection(ownerDb, 'users')));
  await assertFails(getDocs(collection(cashierDb, 'users')));
  await assertSucceeds(getDoc(doc(cashierDb, 'users', 'cashier')));
  await assertSucceeds(getDoc(doc(cashierDb, 'users', 'owner')));
});

test('consulta de operador bloquea anónimos, desconocidos e inactivos y no revela secretos ajenos', async () => {
  const ownerDb = environment.authenticatedContext('owner', auth('owner')).firestore();
  await new DataService(ownerDb, { uid: 'owner' }).saveMyDrawerPin('628403');
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users', 'disabled'), { active: false, roles: ['cashier'] });
  });
  const forbidden = [
    environment.unauthenticatedContext().firestore(),
    environment.authenticatedContext('unknown', auth('cashier')).firestore(),
    environment.authenticatedContext('disabled', auth('cashier')).firestore()
  ];
  for (const db of forbidden) {
    await assertFails(getDoc(doc(db, 'pinClaims', '628403')));
    await assertFails(getDoc(doc(db, 'users', 'owner')));
  }
  const cashierDb = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  await assertFails(getDocs(collection(cashierDb, 'pinClaims')));
  await assertFails(getDoc(doc(cashierDb, 'userSecrets', 'owner')));
  await assertFails(updateDoc(doc(cashierDb, 'users', 'owner'), { roles: ['cashier'] }));
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'users', 'owner'), { active: false });
  });
  await assert.rejects(new DataService(cashierDb, { uid: 'cashier' }).verifyDrawerPin('628403'), /no est.*habilitado/);
});

test('un usuario genérico no puede crear ni elevar su propio perfil', async () => {
  const db = environment.authenticatedContext('unknown-uid', { email: 'unknown@users.lospanitas.app', email_verified: false }).firestore();
  await assertFails(setDoc(doc(db, 'users', 'unknown-uid'), {
    username: 'UNKNOWN', authEmail: 'unknown@users.lospanitas.app', displayName: 'Desconocido', roles: ['owner'], active: true,
    createdAt: serverTimestamp(), createdBy: 'unknown-uid', updatedAt: serverTimestamp(), updatedBy: 'unknown-uid'
  }));
});
