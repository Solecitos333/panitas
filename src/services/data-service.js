import {
  collection, doc, addDoc, getDoc, onSnapshot, orderBy, query, serverTimestamp,
  setDoc, runTransaction, writeBatch
} from 'firebase/firestore';
import {
  buildDocumentNumber, buildNcf, calculateDocument, canTransitionOrder, paymentStatus, PAYMENT_METHODS
} from '../domain/billing.js';
import { can, ROLES } from '../domain/roles.js';

const DEFAULT_SETTINGS = Object.freeze({
  name: 'Los Panitas by Nechy',
  legalName: 'Los Panitas by Nechy',
  rnc: 'N/D',
  phone: '829-459-7437',
  email: '',
  address: "C/7, detrás Bomba Texaco, al lado McDonald's, Las Colinas, Santiago",
  currency: 'DOP',
  defaultTaxRate: 0,
  invoicePrefix: 'PAN-',
  quotePrefix: 'COT-',
  proformaPrefix: 'PROF-',
  receiptFooter: 'Gracias por preferirnos.',
  active: true
});

const DEFAULT_COUNTERS = Object.freeze({
  invoice: 1001, quote: 1001, proforma: 1001,
  ncfB01: 1, ncfB02: 1, ncfB14: 1, ncfB15: 1
});

export class DataService {
  constructor(db, actor) {
    this.db = db;
    this.actor = actor;
    this.unsubscribers = [];
  }

  destroy() {
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  }

  watch(name, sortField, callback, direction = 'desc') {
    const ref = sortField ? query(collection(this.db, name), orderBy(sortField, direction)) : collection(this.db, name);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, (error) => callback([], error));
    this.unsubscribers.push(unsubscribe);
    return unsubscribe;
  }

  watchAll(callbacks) {
    this.watchAllowed('catalog:view', 'products', 'name', callbacks.products, 'asc');
    this.watchAllowed('clients:*', 'clients', 'name', callbacks.clients, 'asc');
    this.watchAllowed('tables:view', 'tables', 'sortOrder', callbacks.tables, 'asc');
    this.watchAllowed('orders:view', 'orders', 'createdAt', callbacks.orders);
    this.watchAllowed('billing:view', 'invoices', 'createdAt', callbacks.invoices);
    this.watchAllowed('billing:view', 'payments', 'createdAt', callbacks.payments);
    this.watchAllowed('cash:*', 'cashSessions', 'openedAt', callbacks.cashSessions);
    this.watchAllowed('users:manage', 'users', 'displayName', callbacks.users, 'asc');
    this.watchAllowed('users:manage', 'userInvites', 'createdAt', callbacks.userInvites);
  }

  watchAllowed(permission, name, sortField, callback, direction) {
    if (can(this.actor, permission)) this.watch(name, sortField, callback, direction);
    else callback([]);
  }

  async loadSettings() {
    const snapshot = await getDoc(doc(this.db, 'settings', 'general'));
    return snapshot.exists() ? { ...DEFAULT_SETTINGS, ...snapshot.data() } : { ...DEFAULT_SETTINGS };
  }

  async saveSettings(values) {
    await setDoc(doc(this.db, 'settings', 'general'), {
      ...values,
      updatedAt: serverTimestamp(),
      updatedBy: this.actor.uid
    }, { merge: true });
    await this.audit('settings.updated', 'Configuración comercial actualizada.');
  }

  async saveUserAccess(user) {
    if (!can(this.actor, 'users:manage')) throw new Error('No tienes permiso para administrar usuarios.');
    const email = String(user.email || '').trim().toLowerCase().slice(0, 160);
    const displayName = String(user.displayName || '').trim().slice(0, 160);
    const roles = [...new Set([String(user.role || '')].filter((role) => ROLES.includes(role)))];
    if (!email || !email.includes('@') || !displayName || !roles.length) throw new Error('Completa nombre, correo y rol.');
    const payload = {
      email,
      displayName,
      roles,
      active: user.active !== false,
      updatedAt: serverTimestamp(),
      updatedBy: this.actor.uid
    };
    if (user.uid) {
      if (user.uid === this.actor.uid) throw new Error('Tu propia cuenta se protege contra cambios desde la app.');
      await setDoc(doc(this.db, 'users', user.uid), payload, { merge: true });
      await this.audit('user.updated', `${email} (${roles.join(', ')})`);
      return user.uid;
    }
    const ref = doc(this.db, 'userInvites', email);
    await setDoc(ref, {
      ...payload,
      status: 'pending',
      createdAt: serverTimestamp(),
      createdBy: this.actor.uid
    }, { merge: true });
    await this.audit('user.invited', `${email} (${roles.join(', ')})`);
    return ref.id;
  }

  async saveProduct(product) {
    const payload = {
      sku: String(product.sku || '').trim().slice(0, 80),
      name: String(product.name || '').trim().slice(0, 160),
      category: String(product.category || 'General').trim().slice(0, 80),
      priceCents: Number(product.priceCents),
      costCents: Number(product.costCents || 0),
      taxRate: Number(product.taxRate || 0),
      stock: Number(product.stock || 0),
      active: product.active !== false,
      updatedAt: serverTimestamp(),
      updatedBy: this.actor.uid
    };
    if (!payload.name || !Number.isInteger(payload.priceCents) || payload.priceCents < 0) throw new Error('Producto inválido.');
    const ref = product.id ? doc(this.db, 'products', product.id) : doc(collection(this.db, 'products'));
    await setDoc(ref, { ...payload, ...(product.id ? {} : { createdAt: serverTimestamp(), createdBy: this.actor.uid }) }, { merge: true });
    await this.audit(product.id ? 'product.updated' : 'product.created', `${payload.name} (${ref.id})`);
    return ref.id;
  }

  async saveClient(client) {
    const payload = {
      name: String(client.name || '').trim().slice(0, 160),
      rnc: String(client.rnc || '').trim().slice(0, 30),
      phone: String(client.phone || '').trim().slice(0, 30),
      email: String(client.email || '').trim().slice(0, 160),
      address: String(client.address || '').trim().slice(0, 300),
      active: client.active !== false,
      updatedAt: serverTimestamp(),
      updatedBy: this.actor.uid
    };
    if (!payload.name) throw new Error('El nombre del cliente es obligatorio.');
    const ref = client.id ? doc(this.db, 'clients', client.id) : doc(collection(this.db, 'clients'));
    await setDoc(ref, { ...payload, ...(client.id ? {} : { createdAt: serverTimestamp(), createdBy: this.actor.uid }) }, { merge: true });
    await this.audit(client.id ? 'client.updated' : 'client.created', `${payload.name} (${ref.id})`);
    return ref.id;
  }

  async createOrder(input) {
    const orderRef = doc(collection(this.db, 'orders'));
    const tableRef = doc(this.db, 'tables', input.tableId);
    const eventRef = doc(collection(orderRef, 'events'));
    const totals = calculateDocument(input.items);
    await runTransaction(this.db, async (transaction) => {
      const tableSnapshot = await transaction.get(tableRef);
      if (!tableSnapshot.exists() || tableSnapshot.data().active === false) throw new Error('La mesa no está disponible.');
      if (tableSnapshot.data().currentOrderId) throw new Error('La mesa ya tiene una comanda activa.');
      const payload = {
        tableId: input.tableId,
        tableName: tableSnapshot.data().name,
        clientName: String(input.clientName || 'Consumidor final').trim().slice(0, 160),
        items: input.items,
        notes: String(input.notes || '').trim().slice(0, 500),
        priority: ['normal', 'high', 'urgent'].includes(input.priority) ? input.priority : 'normal',
        status: 'pending',
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        revision: 1,
        createdAt: serverTimestamp(),
        createdBy: this.actor.uid,
        createdByName: this.actor.displayName || this.actor.email,
        updatedAt: serverTimestamp(),
        updatedBy: this.actor.uid,
        statusChangedAt: serverTimestamp()
      };
      transaction.set(orderRef, payload);
      transaction.update(tableRef, { currentOrderId: orderRef.id, status: 'occupied', updatedAt: serverTimestamp() });
      transaction.set(eventRef, this.orderEvent(orderRef.id, '', 'pending', 'created', 1));
    });
    return orderRef.id;
  }

  async transitionOrder(orderId, nextStatus, action = 'status_changed') {
    const orderRef = doc(this.db, 'orders', orderId);
    const eventRef = doc(collection(orderRef, 'events'));
    await runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(orderRef);
      if (!snapshot.exists()) throw new Error('La comanda ya no existe.');
      const order = snapshot.data();
      if (!canTransitionOrder(order.status, nextStatus)) throw new Error(`La comanda cambió a ${order.status}. Actualiza la vista.`);
      const revision = Number(order.revision || 0) + 1;
      transaction.update(orderRef, {
        status: nextStatus, revision, updatedAt: serverTimestamp(), updatedBy: this.actor.uid,
        statusChangedAt: serverTimestamp(),
        ...(nextStatus === 'cancelled' ? { cancelledAt: serverTimestamp(), cancelledBy: this.actor.uid } : {})
      });
      transaction.set(eventRef, this.orderEvent(orderId, order.status, nextStatus, action, revision));
      if (nextStatus === 'cancelled') {
        transaction.update(doc(this.db, 'tables', order.tableId), {
          currentOrderId: null, status: 'available', updatedAt: serverTimestamp()
        });
      }
    });
  }

  async createDirectDocument(input) {
    return this.createInvoiceTransaction({ ...input, orderId: null, tableId: null });
  }

  async chargeOrder(orderId, payment) {
    const orderSnapshot = await getDoc(doc(this.db, 'orders', orderId));
    if (!orderSnapshot.exists()) throw new Error('La comanda no existe.');
    const order = { id: orderSnapshot.id, ...orderSnapshot.data() };
    if (!['served', 'pending_payment'].includes(order.status)) throw new Error('La comanda todavía no está lista para cobro.');
    return this.createInvoiceTransaction({
      documentType: 'invoice', clientName: order.clientName, clientId: '', items: order.items,
      ncfType: payment.ncfType || '', payment, orderId: order.id, tableId: order.tableId
    });
  }

  async createInvoiceTransaction(input) {
    const invoiceRef = doc(collection(this.db, 'invoices'));
    const paymentRef = doc(collection(this.db, 'payments'));
    const auditRef = doc(collection(this.db, 'auditLogs'));
    const settingsRef = doc(this.db, 'settings', 'general');
    const countersRef = doc(this.db, 'counters', 'billing');
    const orderRef = input.orderId ? doc(this.db, 'orders', input.orderId) : null;
    const tableRef = input.tableId ? doc(this.db, 'tables', input.tableId) : null;
    const orderEventRef = orderRef ? doc(collection(orderRef, 'events')) : null;
    const totals = calculateDocument(input.items);
    const documentType = input.documentType || 'invoice';
    if (!['invoice', 'quote', 'proforma'].includes(documentType)) throw new Error('Tipo de documento inválido.');
    const amountCents = documentType === 'invoice'
      ? Math.max(0, Math.min(Number(input.payment?.amountCents || 0), totals.totalCents))
      : 0;
    const cashSessionRef = amountCents > 0 && input.payment?.cashSessionId
      ? doc(this.db, 'cashSessions', input.payment.cashSessionId)
      : null;
    if (amountCents > 0 && !cashSessionRef) throw new Error('Abre una caja antes de registrar el cobro.');
    if (amountCents > 0 && !PAYMENT_METHODS.includes(input.payment?.method)) throw new Error('Forma de pago inválida.');
    await runTransaction(this.db, async (transaction) => {
      const [settingsSnapshot, countersSnapshot, orderSnapshot, cashSessionSnapshot] = await Promise.all([
        transaction.get(settingsRef), transaction.get(countersRef), orderRef ? transaction.get(orderRef) : Promise.resolve(null),
        cashSessionRef ? transaction.get(cashSessionRef) : Promise.resolve(null)
      ]);
      const settings = { ...DEFAULT_SETTINGS, ...(settingsSnapshot.exists() ? settingsSnapshot.data() : {}) };
      const counters = { ...DEFAULT_COUNTERS, ...(countersSnapshot.exists() ? countersSnapshot.data() : {}) };
      if (cashSessionSnapshot && (!cashSessionSnapshot.exists() || cashSessionSnapshot.data().status !== 'open' || cashSessionSnapshot.data().openedBy !== this.actor.uid)) {
        throw new Error('La caja seleccionada ya no está disponible.');
      }
      const prefix = documentType === 'quote' ? settings.quotePrefix : documentType === 'proforma' ? settings.proformaPrefix : settings.invoicePrefix;
      const sequence = Number(counters[documentType]);
      const invoiceNumber = buildDocumentNumber(prefix, sequence);
      let ncf = '';
      const ncfType = documentType === 'invoice' ? input.ncfType || '' : '';
      const ncfKey = ncfType ? `ncf${ncfType}` : '';
      if (ncfType) ncf = buildNcf(ncfType, Number(counters[ncfKey]));
      if (orderSnapshot) {
        if (!orderSnapshot.exists()) throw new Error('La comanda fue eliminada.');
        const order = orderSnapshot.data();
        if (!['served', 'pending_payment'].includes(order.status)) throw new Error('La comanda cambió antes del cobro.');
        if (JSON.stringify(order.items) !== JSON.stringify(input.items)) throw new Error('Los productos de la comanda cambiaron.');
      }
      const productSnapshots = [];
      if (documentType === 'invoice') for (const item of input.items) {
        if (!item.productId) continue;
        const productRef = doc(this.db, 'products', item.productId);
        productSnapshots.push({ ref: productRef, snapshot: await transaction.get(productRef), quantity: Number(item.quantity) });
      }
      productSnapshots.forEach(({ ref, snapshot, quantity }) => {
        if (!snapshot.exists()) throw new Error('Uno de los productos ya no existe.');
        const stock = Number(snapshot.data().stock || 0);
        if (stock < quantity) throw new Error(`Inventario insuficiente para ${snapshot.data().name}.`);
        transaction.update(ref, { stock: stock - quantity, updatedAt: serverTimestamp(), updatedBy: this.actor.uid });
      });
      transaction.set(invoiceRef, {
        documentType, invoiceNumber, ncf, ncfType,
        clientId: input.clientId || '', clientName: String(input.clientName || 'Consumidor final').slice(0, 160),
        items: input.items, ...totals, paidCents: amountCents,
        status: documentType === 'invoice' ? paymentStatus(totals.totalCents, amountCents) : 'pending',
        orderId: input.orderId || '', tableId: input.tableId || '',
        createdAt: serverTimestamp(), createdBy: this.actor.uid, updatedAt: serverTimestamp(), updatedBy: this.actor.uid
      });
      transaction.set(countersRef, {
        ...counters, [documentType]: sequence + 1,
        ...(ncfKey ? { [ncfKey]: Number(counters[ncfKey]) + 1 } : {}), updatedAt: serverTimestamp()
      }, { merge: true });
      if (amountCents > 0) transaction.set(paymentRef, {
        invoiceId: invoiceRef.id, invoiceNumber, amountCents,
        method: input.payment.method, reference: String(input.payment.reference || '').slice(0, 120),
        cashSessionId: input.payment.cashSessionId || '', createdAt: serverTimestamp(), createdBy: this.actor.uid
      });
      transaction.set(auditRef, {
        action: 'document.created', details: `${invoiceNumber} (${documentType})`,
        actorId: this.actor.uid, actorEmail: this.actor.email || '', createdAt: serverTimestamp()
      });
      if (orderRef) {
        const order = orderSnapshot.data();
        const revision = Number(order.revision || 0) + 1;
        transaction.update(orderRef, {
          status: 'closed', linkedInvoiceId: invoiceRef.id, revision,
          closedAt: serverTimestamp(), closedBy: this.actor.uid,
          updatedAt: serverTimestamp(), updatedBy: this.actor.uid, statusChangedAt: serverTimestamp()
        });
        transaction.update(tableRef, { currentOrderId: null, status: 'available', updatedAt: serverTimestamp() });
        transaction.set(orderEventRef, this.orderEvent(orderRef.id, order.status, 'closed', 'invoiced_and_closed', revision));
      }
    });
    return invoiceRef.id;
  }

  async recordPayment(invoiceId, payment) {
    const invoiceRef = doc(this.db, 'invoices', invoiceId);
    const paymentRef = doc(collection(this.db, 'payments'));
    const auditRef = doc(collection(this.db, 'auditLogs'));
    if (!payment.cashSessionId) throw new Error('Abre una caja antes de registrar el cobro.');
    if (!PAYMENT_METHODS.includes(payment.method)) throw new Error('Forma de pago inválida.');
    const cashSessionRef = doc(this.db, 'cashSessions', payment.cashSessionId);
    await runTransaction(this.db, async (transaction) => {
      const [snapshot, cashSessionSnapshot] = await Promise.all([
        transaction.get(invoiceRef), transaction.get(cashSessionRef)
      ]);
      if (!snapshot.exists()) throw new Error('La factura no existe.');
      if (!cashSessionSnapshot.exists() || cashSessionSnapshot.data().status !== 'open' || cashSessionSnapshot.data().openedBy !== this.actor.uid) {
        throw new Error('La caja seleccionada ya no está disponible.');
      }
      const invoice = snapshot.data();
      if (['paid', 'cancelled'].includes(invoice.status)) throw new Error('La factura no admite cobros.');
      const amountCents = Number(payment.amountCents);
      const balance = Number(invoice.totalCents) - Number(invoice.paidCents || 0);
      if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > balance) throw new Error('Monto de pago inválido.');
      const paidCents = Number(invoice.paidCents || 0) + amountCents;
      transaction.update(invoiceRef, { paidCents, status: paymentStatus(invoice.totalCents, paidCents), updatedAt: serverTimestamp(), updatedBy: this.actor.uid });
      transaction.set(paymentRef, {
        invoiceId, invoiceNumber: invoice.invoiceNumber, amountCents, method: payment.method,
        reference: String(payment.reference || '').slice(0, 120), cashSessionId: payment.cashSessionId || '',
        createdAt: serverTimestamp(), createdBy: this.actor.uid
      });
      transaction.set(auditRef, {
        action: 'payment.created', details: `${invoice.invoiceNumber}: ${amountCents}`,
        actorId: this.actor.uid, actorEmail: this.actor.email || '', createdAt: serverTimestamp()
      });
    });
  }

  async cancelInvoice(invoiceId, reason) {
    const invoiceRef = doc(this.db, 'invoices', invoiceId);
    await runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(invoiceRef);
      if (!snapshot.exists()) throw new Error('La factura no existe.');
      const invoice = snapshot.data();
      if (invoice.status === 'cancelled') throw new Error('La factura ya está anulada.');
      if (Number(invoice.paidCents || 0) > 0) throw new Error('No se puede anular una factura con cobros.');
      transaction.update(invoiceRef, {
        status: 'cancelled', cancellationReason: String(reason || '').trim().slice(0, 500),
        cancelledAt: serverTimestamp(), cancelledBy: this.actor.uid, updatedAt: serverTimestamp(), updatedBy: this.actor.uid
      });
    });
    await this.audit('invoice.cancelled', `${invoiceId}: ${reason}`);
  }

  async openCashSession(input) {
    const openingCents = Number(input.openingCents || 0);
    if (!Number.isInteger(openingCents) || openingCents < 0) throw new Error('Fondo inicial inválido.');
    const ref = doc(collection(this.db, 'cashSessions'));
    const lockRef = doc(this.db, 'counters', `cash-${this.actor.uid}`);
    await runTransaction(this.db, async (transaction) => {
      const lockSnapshot = await transaction.get(lockRef);
      const activeSessionId = lockSnapshot.exists() ? lockSnapshot.data().activeSessionId : '';
      if (activeSessionId) {
        const activeSnapshot = await transaction.get(doc(this.db, 'cashSessions', activeSessionId));
        if (activeSnapshot.exists() && activeSnapshot.data().status === 'open') throw new Error('Ya tienes una caja abierta.');
      }
      transaction.set(ref, {
        openingCents, expectedCents: openingCents,
        notes: String(input.notes || '').slice(0, 500), status: 'open',
        openedAt: serverTimestamp(), openedBy: this.actor.uid, openedByName: this.actor.displayName || this.actor.email
      });
      transaction.set(lockRef, { activeSessionId: ref.id, updatedAt: serverTimestamp(), updatedBy: this.actor.uid }, { merge: true });
    });
    await this.audit('cash.opened', ref.id);
    return ref.id;
  }

  async closeCashSession(sessionId, input) {
    const closingCents = Number(input.closingCents);
    const expectedCents = Number(input.expectedCents || 0);
    if (!Number.isInteger(closingCents) || closingCents < 0 || !Number.isInteger(expectedCents) || expectedCents < 0) throw new Error('Arqueo de caja inválido.');
    const sessionRef = doc(this.db, 'cashSessions', sessionId);
    const lockRef = doc(this.db, 'counters', `cash-${this.actor.uid}`);
    await runTransaction(this.db, async (transaction) => {
      const [sessionSnapshot, lockSnapshot] = await Promise.all([transaction.get(sessionRef), transaction.get(lockRef)]);
      if (!sessionSnapshot.exists() || sessionSnapshot.data().status !== 'open') throw new Error('La caja ya no está abierta.');
      if (sessionSnapshot.data().openedBy !== this.actor.uid) throw new Error('No puedes cerrar la caja de otro usuario.');
      transaction.update(sessionRef, {
        status: 'closed', expectedCents, closingCents, varianceCents: closingCents - expectedCents,
        closingNotes: String(input.notes || '').slice(0, 500), closedAt: serverTimestamp(), closedBy: this.actor.uid
      });
      if (lockSnapshot.exists() && lockSnapshot.data().activeSessionId === sessionId) {
        transaction.set(lockRef, { activeSessionId: null, updatedAt: serverTimestamp(), updatedBy: this.actor.uid }, { merge: true });
      }
    });
    await this.audit('cash.closed', sessionId);
  }

  async seedFoundation() {
    const batch = writeBatch(this.db);
    batch.set(doc(this.db, 'settings', 'general'), { ...DEFAULT_SETTINGS, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    batch.set(doc(this.db, 'counters', 'billing'), { ...DEFAULT_COUNTERS, updatedAt: serverTimestamp() }, { merge: true });
    for (let index = 1; index <= 12; index += 1) {
      batch.set(doc(this.db, 'tables', `mesa-${index}`), {
        name: `Mesa ${index}`, zone: 'Salón', sortOrder: index, active: true,
        status: 'available', currentOrderId: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
  }

  orderEvent(orderId, fromStatus, toStatus, action, revision) {
    return {
      orderId, fromStatus, toStatus, action, revision,
      actorId: this.actor.uid, actorName: this.actor.displayName || this.actor.email,
      createdAt: serverTimestamp()
    };
  }

  async audit(action, details) {
    await addDoc(collection(this.db, 'auditLogs'), {
      action, details: String(details || '').slice(0, 1000),
      actorId: this.actor.uid, actorEmail: this.actor.email || '', createdAt: serverTimestamp()
    });
  }
}

export { DEFAULT_SETTINGS, DEFAULT_COUNTERS };
