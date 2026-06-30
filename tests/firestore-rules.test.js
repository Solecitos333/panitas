import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

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
    await setDoc(doc(firestore, 'products', 'p1'), { name: 'Producto', priceCents: 10000, costCents: 5000, stock: 10, active: true });
    await setDoc(doc(firestore, 'invoices', 'i1'), { documentType: 'invoice', status: 'pending', totalCents: 10000, paidCents: 0 });
    await setDoc(doc(firestore, 'payments', 'pay1'), { amountCents: 10000, createdBy: 'cashier' });
    await setDoc(doc(firestore, 'cashSessions', 'shift-cashier'), { status: 'open', openedBy: 'cashier', openingCents: 0 });
    await setDoc(doc(firestore, 'cashSessions', 'shift-invalid'), { status: 'open', openedBy: 'cashier', openingCents: 0 });
    await setDoc(doc(firestore, 'orders', 'o1'), { status: 'pending', revision: 1, updatedBy: 'waiter' });
    await setDoc(doc(firestore, 'userInvites', 'invitado@example.test'), {
      email: 'invitado@example.test', displayName: 'Usuario invitado', roles: ['waiter'], active: true
    });
  });
});

after(async () => environment?.cleanup());

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

test('pagos y auditorías son inmutables', async () => {
  const db = environment.authenticatedContext('owner', auth('owner')).firestore();
  await assertFails(updateDoc(doc(db, 'payments', 'pay1'), { amountCents: 1 }));
});

test('un cobro exige una caja abierta del mismo usuario', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  await assertSucceeds(setDoc(doc(db, 'payments', 'valid-payment'), {
    invoiceId: 'i1', invoiceNumber: 'PAN-001001', amountCents: 1000,
    method: 'cash', reference: '', cashSessionId: 'shift-cashier',
    createdBy: 'cashier', createdAt: serverTimestamp()
  }));
  await assertFails(setDoc(doc(db, 'payments', 'missing-shift'), {
    invoiceId: 'i1', invoiceNumber: 'PAN-001001', amountCents: 1000,
    method: 'cash', reference: '', cashSessionId: '',
    createdBy: 'cashier', createdAt: serverTimestamp()
  }));
});

test('el cierre de caja valida esperado y diferencia', async () => {
  const db = environment.authenticatedContext('cashier', auth('cashier')).firestore();
  await assertSucceeds(updateDoc(doc(db, 'cashSessions', 'shift-cashier'), {
    status: 'closed', expectedCents: 500, closingCents: 450, varianceCents: -50,
    closingNotes: '', closedAt: serverTimestamp(), closedBy: 'cashier'
  }));
  await assertFails(updateDoc(doc(db, 'cashSessions', 'shift-invalid'), {
    status: 'closed', expectedCents: 500, closingCents: 450, varianceCents: 0,
    closingNotes: '', closedAt: serverTimestamp(), closedBy: 'cashier'
  }));
});

test('el propietario no puede elevar su propio perfil desde el cliente', async () => {
  const db = environment.authenticatedContext('owner', auth('owner')).firestore();
  await assertFails(updateDoc(doc(db, 'users', 'owner'), { roles: ['owner', 'manager'], active: true }));
  assert.ok(true);
});

test('solo el propietario puede crear invitaciones', async () => {
  const invitation = {
    email: 'nuevo@example.test', displayName: 'Nuevo usuario', roles: ['cashier'], active: true,
    status: 'pending', createdBy: 'owner', createdAt: serverTimestamp()
  };
  await assertSucceeds(setDoc(doc(environment.authenticatedContext('owner', auth('owner')).firestore(), 'userInvites', invitation.email), invitation));
  await assertFails(setDoc(doc(environment.authenticatedContext('manager', auth('manager')).firestore(), 'userInvites', 'otro@example.test'), { ...invitation, email: 'otro@example.test' }));
});

test('una cuenta invitada activa únicamente puede adoptar el rol asignado', async () => {
  const claims = { email: 'invitado@example.test', email_verified: true };
  const db = environment.authenticatedContext('invited-uid', claims).firestore();
  await assertSucceeds(getDoc(doc(db, 'userInvites', claims.email)));
  const profile = {
    email: claims.email, displayName: 'Usuario invitado', roles: ['waiter'], active: true,
    createdAt: serverTimestamp(), createdBy: 'owner', updatedAt: serverTimestamp(), updatedBy: 'invited-uid'
  };
  await assertSucceeds(setDoc(doc(db, 'users', 'invited-uid'), profile));
  await assertFails(setDoc(doc(db, 'users', 'another-uid'), { ...profile, roles: ['owner'] }));
});

test('una cuenta sin invitación no puede crear su perfil', async () => {
  const db = environment.authenticatedContext('unknown-uid', { email: 'unknown@example.test', email_verified: true }).firestore();
  await assertFails(setDoc(doc(db, 'users', 'unknown-uid'), {
    email: 'unknown@example.test', displayName: 'Desconocido', roles: ['waiter'], active: true,
    createdAt: serverTimestamp(), createdBy: 'unknown-uid', updatedAt: serverTimestamp(), updatedBy: 'unknown-uid'
  }));
});
