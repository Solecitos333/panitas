import {
  collection, doc, addDoc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp,
  setDoc, runTransaction, writeBatch, deleteField
} from 'firebase/firestore';
import {
  buildDocumentNumber, buildNcf, calculateDocument, canTransitionOrder, paymentStatus, PAYMENT_METHODS,
  validateRncOrCedula
} from '../domain/billing.js';
import { can, ROLES } from '../domain/roles.js';
import { createUsernameIdentity } from './firebase.js';
import { isValidUsername, normalizeUsername, usernameToEmail } from '../lib/identity.js';

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
  printerDriver: 'auto',
  paperWidth: '80mm',
  autoOpenDrawer: true,
  autoPrintInvoice: true,
  autoPrintKitchen: true,
  enableEloScanner: false,
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
    this.watchAllowed('cash:*', 'cashMovements', 'createdAt', callbacks.cashMovements);
    this.watchAllowed('users:manage', 'users', 'displayName', callbacks.users, 'asc');
    if (callbacks.auditLogs) {
      this.watchAllowed('users:manage', 'auditLogs', 'createdAt', callbacks.auditLogs, 'desc');
    }
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
    const username = normalizeUsername(user.username);
    const displayName = String(user.displayName || '').trim().slice(0, 160);
    const roles = [...new Set([String(user.role || '')].filter((role) => ROLES.includes(role)))];
    if (!isValidUsername(username) || !displayName || !roles.length) throw new Error('Completa un usuario válido, nombre y rol.');
    const payload = {
      username,
      authEmail: usernameToEmail(username),
      displayName,
      roles,
      active: user.active !== false,
      updatedAt: serverTimestamp(),
      updatedBy: this.actor.uid
    };
    if (user.uid) {
      if (user.uid === this.actor.uid) throw new Error('Tu propia cuenta se protege contra cambios desde la app.');
      await setDoc(doc(this.db, 'users', user.uid), payload, { merge: true });
      await this.audit('user.updated', `${username} (${roles.join(', ')})`);
      return user.uid;
    }
    if (String(user.password || '').length < 8) throw new Error('La contraseña inicial debe tener al menos 8 caracteres.');
    const identity = await createUsernameIdentity({ username, password: user.password, displayName });
    const ref = doc(this.db, 'users', identity.uid);
    await setDoc(ref, {
      ...payload,
      authEmail: identity.authEmail,
      createdAt: serverTimestamp(),
      createdBy: this.actor.uid
    });
    await this.audit('user.created', `${username} (${roles.join(', ')})`);
    return ref.id;
  }

  async hasMyDrawerPin() {
    const [secretSnapshot, profileSnapshot] = await Promise.all([
      getDoc(doc(this.db, 'userSecrets', this.actor.uid)),
      getDoc(doc(this.db, 'users', this.actor.uid))
    ]);
    return /^\d{4}$/.test(String(secretSnapshot.data()?.drawerPin || profileSnapshot.data()?.drawerPin || ''));
  }

  async verifyDrawerPin(pin, reason = 'Apertura manual') {
    const cleanPin = String(pin || '').trim().replace(/\D/g, '');
    if (!/^\d{4}$/.test(cleanPin)) throw new Error('El PIN debe tener exactamente 4 dígitos.');
    const [secretSnapshot, profileSnapshot] = await Promise.all([
      getDoc(doc(this.db, 'userSecrets', this.actor.uid)),
      getDoc(doc(this.db, 'users', this.actor.uid))
    ]);
    const account = profileSnapshot.exists() ? profileSnapshot.data() : null;
    const storedPin = String(secretSnapshot.data()?.drawerPin || account?.drawerPin || '');
    if (!account?.active) throw new Error('Tu usuario no está habilitado.');
    if (!/^\d{4}$/.test(storedPin)) {
      throw new Error('Configura primero tu PIN de 4 dígitos.');
    }
    if (storedPin !== cleanPin) {
      await this.audit('cash.drawer_failed', `PIN incorrecto: ${String(reason).slice(0, 120)}`);
      throw new Error('PIN incorrecto.');
    }
    if (!secretSnapshot.exists() && /^\d{4}$/.test(String(account.drawerPin || ''))) {
      const batch = writeBatch(this.db);
      batch.set(doc(this.db, 'userSecrets', this.actor.uid), {
        drawerPin: storedPin, updatedAt: serverTimestamp(), updatedBy: this.actor.uid
      });
      batch.set(doc(this.db, 'users', this.actor.uid), {
        drawerPin: deleteField(), updatedAt: serverTimestamp(), updatedBy: this.actor.uid
      }, { merge: true });
      await batch.commit();
    }
    await this.audit('cash.pin_authorized', String(reason).slice(0, 300));
    return {
      success: true,
      user: { id: this.actor.uid, displayName: account.displayName || this.actor.displayName, username: account.username || '' }
    };
  }

  async saveMyDrawerPin(pin) {
    const drawerPin = String(pin || '').trim().replace(/\D/g, '');
    if (!/^\d{4}$/.test(drawerPin)) throw new Error('El PIN debe tener exactamente 4 dígitos.');
    const profileRef = doc(this.db, 'users', this.actor.uid);
    const profileSnapshot = await getDoc(profileRef);
    const batch = writeBatch(this.db);
    batch.set(doc(this.db, 'userSecrets', this.actor.uid), {
      drawerPin, updatedAt: serverTimestamp(), updatedBy: this.actor.uid
    }, { merge: true });
    if (profileSnapshot.exists() && 'drawerPin' in profileSnapshot.data()) {
      batch.set(profileRef, {
        drawerPin: deleteField(), updatedAt: serverTimestamp(), updatedBy: this.actor.uid
      }, { merge: true });
    }
    await batch.commit();
    await this.audit('user.drawer_pin.updated', 'El usuario actualizó su PIN de gaveta.');
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

  async registerInventoryCount(input) {
    if (!can(this.actor, 'catalog:*')) throw new Error('No tienes permiso para modificar el inventario.');
    const productId = String(input.productId || '').trim();
    const rawTarget = Number(input.targetStock);
    if (!productId || !Number.isFinite(rawTarget) || rawTarget < 0) throw new Error('El conteo de inventario no es válido.');
    const targetStock = Math.round(rawTarget * 1000) / 1000;
    const productRef = doc(this.db, 'products', productId);
    const movementRef = doc(collection(this.db, 'inventoryMovements'));
    let movement = null;

    await runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(productRef);
      if (!snapshot.exists() || snapshot.data().active === false) throw new Error('El producto ya no está disponible.');
      const product = snapshot.data();
      const previousStock = Math.round(Number(product.stock || 0) * 1000) / 1000;
      const delta = Math.round((targetStock - previousStock) * 1000) / 1000;
      if (delta === 0) throw new Error('El conteo coincide con la existencia actual; no hay cambios que registrar.');
      const reason = String(input.reason || '').trim().slice(0, 300) || 'Conteo físico desde el panel móvil';
      movement = {
        productId, productName: String(product.name || '').slice(0, 160),
        type: delta > 0 ? 'increase' : 'decrease', operation: 'count',
        quantity: Math.abs(delta), delta, previousStock, resultingStock: targetStock,
        reason, actorId: this.actor.uid, actorName: this.actor.displayName || this.actor.username || '',
        createdAt: serverTimestamp()
      };
      transaction.update(productRef, { stock: targetStock, updatedAt: serverTimestamp(), updatedBy: this.actor.uid });
      transaction.set(movementRef, movement);
    });
    await this.audit('inventory.counted', `${movement.productName}: ${movement.previousStock} → ${movement.resultingStock}. ${movement.reason}`);
    return { id: movementRef.id, ...movement };
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
    const totals = calculateDocument(input.items, {
      discount: input.discount,
      discountType: input.discountType,
      includeLegalTip: input.includeLegalTip === true,
      tipCents: input.tipCents
    });
    await runTransaction(this.db, async (transaction) => {
      const tableSnapshot = await transaction.get(tableRef);
      if (!tableSnapshot.exists() || tableSnapshot.data().active === false) throw new Error('La mesa no está disponible.');
      if (tableSnapshot.data().currentOrderId) throw new Error('La mesa ya tiene una comanda activa.');
      const payload = {
        tableId: input.tableId,
        tableName: tableSnapshot.data().name,
        clientName: String(input.clientName || 'Consumidor final').trim().slice(0, 160),
        clientRnc: String(input.clientRnc || '').trim().slice(0, 30),
        items: input.items,
        notes: String(input.notes || '').trim().slice(0, 500),
        priority: ['normal', 'high', 'urgent'].includes(input.priority) ? input.priority : 'normal',
        status: 'pending',
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents || 0,
        taxableSubtotalCents: totals.taxableSubtotalCents || totals.subtotalCents,
        taxCents: totals.taxCents,
        tipCents: totals.tipCents || 0,
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

  async transitionOrder(orderId, nextStatus, action = 'status_changed', reason = '') {
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
        ...(nextStatus === 'cancelled' ? { cancelledAt: serverTimestamp(), cancelledBy: this.actor.uid, cancellationReason: String(reason || '').trim().slice(0, 500) } : {})
      });
      transaction.set(eventRef, { ...this.orderEvent(orderId, order.status, nextStatus, action, revision), ...(reason ? { reason: String(reason).trim().slice(0, 500) } : {}) });
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
      requestId: payment.requestId,
      documentType: 'invoice', clientName: order.clientName, clientId: '', clientRnc: payment.clientRnc || order.clientRnc || '', items: order.items,
      discountCents: order.discountCents || 0,
      tipCents: order.tipCents || 0,
      ncfType: payment.ncfType || '', payment, orderId: order.id, tableId: order.tableId
    });
  }

  async createInvoiceTransaction(input) {
    const requestId = String(input.requestId || '').trim();
    const hasRequestId = /^[a-zA-Z0-9_-]{16,100}$/.test(requestId);
    const invoiceRef = hasRequestId ? doc(this.db, 'invoices', requestId) : doc(collection(this.db, 'invoices'));
    const paymentRef = hasRequestId ? doc(this.db, 'payments', `${requestId}-payment`) : doc(collection(this.db, 'payments'));
    const auditRef = doc(collection(this.db, 'auditLogs'));
    const settingsRef = doc(this.db, 'settings', 'general');
    const countersRef = doc(this.db, 'counters', 'billing');
    const orderRef = input.orderId ? doc(this.db, 'orders', input.orderId) : null;
    const tableRef = input.tableId ? doc(this.db, 'tables', input.tableId) : null;
    const orderEventRef = orderRef ? doc(collection(orderRef, 'events')) : null;
    const totals = calculateDocument(input.items, {
      discount: input.discount || input.discountCents,
      discountType: input.discountType || (input.discountCents ? 'amount' : 'percent'),
      discountInCents: Boolean(input.discountCents),
      includeLegalTip: input.includeLegalTip === true,
      tipCents: input.tipCents
    });
    const documentType = input.documentType || 'invoice';
    if (!['invoice', 'quote', 'proforma'].includes(documentType)) throw new Error('Tipo de documento inválido.');

    if (documentType === 'invoice' && input.ncfType === 'B01') {
      const clientRnc = String(input.clientRnc || '').trim();
      const rncCheck = validateRncOrCedula(clientRnc);
      if (!rncCheck.valid) {
        throw new Error('Para comprobantes de Crédito Fiscal (B01) debes indicar un RNC (9 dígitos) o Cédula (11 dígitos) válido.');
      }
    }

    const amountCents = documentType === 'invoice'
      ? Math.max(0, Math.min(Number(input.payment?.amountCents || 0), totals.totalCents))
      : 0;
    const paymentMethod = input.payment?.method || '';
    const tenderedCents = paymentMethod === 'cash' && amountCents > 0
      ? Number(input.payment?.tenderedCents || amountCents)
      : 0;
    const changeCents = paymentMethod === 'cash' && amountCents > 0
      ? tenderedCents - amountCents
      : 0;
    if (paymentMethod === 'cash' && amountCents > 0
      && (!Number.isInteger(tenderedCents) || tenderedCents < amountCents)) {
      throw new Error('El efectivo recibido no cubre el total de la venta.');
    }
    const cashSessionRef = amountCents > 0 && input.payment?.cashSessionId
      ? doc(this.db, 'cashSessions', input.payment.cashSessionId)
      : null;
    if (amountCents > 0 && !cashSessionRef) throw new Error('Abre una caja antes de registrar el cobro.');
    if (amountCents > 0 && !PAYMENT_METHODS.includes(input.payment?.method)) throw new Error('Forma de pago inválida.');
    const inventoryLines = new Map();
    if (documentType === 'invoice') {
      for (const line of input.items) {
        const quantity = Number(line.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999) throw new Error('Una cantidad de producto no es válida.');
        if (!line.productId) continue;
        const current = inventoryLines.get(line.productId) || { quantity: 0, line };
        current.quantity = Math.round((current.quantity + quantity) * 1000) / 1000;
        inventoryLines.set(line.productId, current);
      }
    }
    let createdDocument = null;
    await runTransaction(this.db, async (transaction) => {
      const [existingInvoiceSnapshot, settingsSnapshot, countersSnapshot, orderSnapshot, cashSessionSnapshot] = await Promise.all([
        transaction.get(invoiceRef), transaction.get(settingsRef), transaction.get(countersRef), orderRef ? transaction.get(orderRef) : Promise.resolve(null),
        cashSessionRef ? transaction.get(cashSessionRef) : Promise.resolve(null)
      ]);
      if (existingInvoiceSnapshot.exists()) {
        const existing = existingInvoiceSnapshot.data();
        if (!hasRequestId || existing.requestId !== requestId || existing.createdBy !== this.actor.uid) {
          throw new Error('La referencia de esta venta ya está en uso.');
        }
        createdDocument = {
          id: invoiceRef.id, invoiceNumber: existing.invoiceNumber, ncf: existing.ncf || '',
          ncfType: existing.ncfType || '', documentType: existing.documentType || 'invoice',
          cashierName: existing.cashierName || ''
        };
        return;
      }
      const settings = { ...DEFAULT_SETTINGS, ...(settingsSnapshot.exists() ? settingsSnapshot.data() : {}) };
      const counters = { ...DEFAULT_COUNTERS, ...(countersSnapshot.exists() ? countersSnapshot.data() : {}) };
      if (cashSessionSnapshot && (!cashSessionSnapshot.exists() || cashSessionSnapshot.data().status !== 'open')) {
        throw new Error('La caja seleccionada ya no está disponible o está cerrada.');
      }
      if (cashSessionSnapshot && cashSessionSnapshot.data().openedBy !== this.actor.uid) {
        throw new Error('No puedes registrar cobros en la caja de otro usuario.');
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
      const productSnapshots = await Promise.all([...inventoryLines.entries()].map(async ([productId, entry]) => {
        const ref = doc(this.db, 'products', productId);
        return { ref, snapshot: await transaction.get(ref), ...entry };
      }));
      productSnapshots.forEach(({ ref, snapshot, quantity, line }) => {
        if (!snapshot.exists()) throw new Error('Uno de los productos ya no existe.');
        const product = snapshot.data();
        if (!orderRef && product.active === false) throw new Error(`${product.name} ya no está disponible para venta.`);
        if (!orderRef && (Number(line.unitPriceCents) !== Number(product.priceCents) || Number(line.taxRate || 0) !== Number(product.taxRate || 0))) {
          throw new Error(`El precio de ${product.name} cambió. Regresa al catálogo y agrégalo de nuevo.`);
        }
        const stock = Number(product.stock || 0);
        if (stock < quantity) throw new Error(`Inventario insuficiente para ${product.name}.`);
        transaction.update(ref, { stock: Math.round((stock - quantity) * 1000) / 1000, updatedAt: serverTimestamp(), updatedBy: this.actor.uid });
      });
      const cashierName = String(input.cashierName || input.payment?.cashierName || this.actor.displayName || this.actor.username || 'Cajero').trim();
      transaction.set(invoiceRef, {
        ...(hasRequestId ? { requestId } : {}),
        documentType, invoiceNumber, ncf, ncfType,
        clientId: input.clientId || '', clientName: String(input.clientName || 'Consumidor final').slice(0, 160),
        clientRnc: String(input.clientRnc || '').slice(0, 30),
        notes: String(input.notes || '').slice(0, 500),
        items: input.items, ...totals, paidCents: amountCents,
        lastPaymentId: amountCents > 0 ? paymentRef.id : '',
        status: documentType === 'invoice' ? paymentStatus(totals.totalCents, amountCents) : 'pending',
        orderId: input.orderId || '', tableId: input.tableId || '',
        cashierId: input.cashierId || input.payment?.cashierId || this.actor.uid,
        cashierName,
        createdAt: serverTimestamp(), createdBy: this.actor.uid, updatedAt: serverTimestamp(), updatedBy: this.actor.uid
      });
      transaction.set(countersRef, {
        ...counters, [documentType]: sequence + 1,
        ...(ncfKey ? { [ncfKey]: Number(counters[ncfKey]) + 1 } : {}), updatedAt: serverTimestamp()
      }, { merge: true });
      if (amountCents > 0) transaction.set(paymentRef, {
        ...(hasRequestId ? { requestId } : {}),
        invoiceId: invoiceRef.id, invoiceNumber, amountCents,
        method: paymentMethod, reference: String(input.payment.reference || '').slice(0, 120),
        tenderedCents, changeCents,
        cashierId: input.cashierId || input.payment?.cashierId || this.actor.uid,
        cashierName,
        cashSessionId: input.payment.cashSessionId || '', createdAt: serverTimestamp(), createdBy: this.actor.uid
      });
      if (amountCents > 0 && paymentMethod === 'cash') {
        const expectedCents = Number(cashSessionSnapshot.data().expectedCents
          ?? cashSessionSnapshot.data().openingCents ?? 0) + amountCents;
        transaction.update(cashSessionRef, {
          expectedCents,
          lastCashActivityId: paymentRef.id,
          lastCashActivityType: 'payment',
          updatedAt: serverTimestamp(),
          updatedBy: this.actor.uid
        });
      }
      transaction.set(auditRef, {
        action: 'document.created', details: `${invoiceNumber} (${documentType}) - Cobrado por: ${cashierName}`,
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
      createdDocument = { id: invoiceRef.id, invoiceNumber, ncf, ncfType, documentType, cashierName };
    });
    return createdDocument;
  }

  async recordPayment(invoiceId, payment) {
    const invoiceRef = doc(this.db, 'invoices', invoiceId);
    const requestId = String(payment.requestId || '').trim();
    const hasRequestId = /^[a-zA-Z0-9_-]{16,100}$/.test(requestId);
    const paymentRef = hasRequestId ? doc(this.db, 'payments', requestId) : doc(collection(this.db, 'payments'));
    const auditRef = doc(collection(this.db, 'auditLogs'));
    if (!payment.cashSessionId) throw new Error('Abre una caja antes de registrar el cobro.');
    if (!PAYMENT_METHODS.includes(payment.method)) throw new Error('Forma de pago inválida.');
    const cashSessionRef = doc(this.db, 'cashSessions', payment.cashSessionId);
    await runTransaction(this.db, async (transaction) => {
      const [snapshot, cashSessionSnapshot, existingPaymentSnapshot] = await Promise.all([
        transaction.get(invoiceRef), transaction.get(cashSessionRef), transaction.get(paymentRef)
      ]);
      if (existingPaymentSnapshot.exists()) {
        const existing = existingPaymentSnapshot.data();
        if (hasRequestId && existing.requestId === requestId && existing.createdBy === this.actor.uid && existing.invoiceId === invoiceId) return;
        throw new Error('La referencia de este pago ya está en uso.');
      }
      if (!snapshot.exists()) throw new Error('La factura no existe.');
      if (!cashSessionSnapshot.exists() || cashSessionSnapshot.data().status !== 'open') {
        throw new Error('La caja seleccionada ya no está disponible o está cerrada.');
      }
      if (cashSessionSnapshot.data().openedBy !== this.actor.uid) {
        throw new Error('No puedes registrar cobros en la caja de otro usuario.');
      }
      const invoice = snapshot.data();
      if (['paid', 'cancelled'].includes(invoice.status)) throw new Error('La factura no admite cobros.');
      const amountCents = Number(payment.amountCents);
      const balance = Number(invoice.totalCents) - Number(invoice.paidCents || 0);
      if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > balance) throw new Error('Monto de pago inválido.');
      const paidCents = Number(invoice.paidCents || 0) + amountCents;
      const tenderedCents = payment.method === 'cash' ? Number(payment.tenderedCents || amountCents) : 0;
      const changeCents = payment.method === 'cash' ? tenderedCents - amountCents : 0;
      if (payment.method === 'cash' && (!Number.isInteger(tenderedCents) || tenderedCents < amountCents)) throw new Error('Efectivo recibido inválido.');
      transaction.update(invoiceRef, {
        paidCents, status: paymentStatus(invoice.totalCents, paidCents), lastPaymentId: paymentRef.id,
        updatedAt: serverTimestamp(), updatedBy: this.actor.uid
      });
      transaction.set(paymentRef, {
        ...(hasRequestId ? { requestId } : {}),
        invoiceId, invoiceNumber: invoice.invoiceNumber, amountCents, method: payment.method,
        reference: String(payment.reference || '').slice(0, 120), tenderedCents, changeCents,
        cashierId: this.actor.uid,
        cashierName: this.actor.displayName || this.actor.username || '',
        cashSessionId: payment.cashSessionId || '',
        createdAt: serverTimestamp(), createdBy: this.actor.uid
      });
      if (payment.method === 'cash') {
        const expectedCents = Number(cashSessionSnapshot.data().expectedCents
          ?? cashSessionSnapshot.data().openingCents ?? 0) + amountCents;
        transaction.update(cashSessionRef, {
          expectedCents,
          lastCashActivityId: paymentRef.id,
          lastCashActivityType: 'payment',
          updatedAt: serverTimestamp(),
          updatedBy: this.actor.uid
        });
      }
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
      const quantities = new Map();
      if (invoice.documentType === 'invoice') for (const line of invoice.items || []) {
        if (!line.productId) continue;
        quantities.set(line.productId, Math.round((Number(quantities.get(line.productId) || 0) + Number(line.quantity || 0)) * 1000) / 1000);
      }
      const products = await Promise.all([...quantities.entries()].map(async ([productId, quantity]) => {
        const ref = doc(this.db, 'products', productId);
        return { ref, quantity, snapshot: await transaction.get(ref) };
      }));
      products.forEach(({ ref, quantity, snapshot: productSnapshot }) => {
        if (!productSnapshot.exists()) return;
        const restoredStock = Math.round((Number(productSnapshot.data().stock || 0) + quantity) * 1000) / 1000;
        transaction.update(ref, { stock: restoredStock, updatedAt: serverTimestamp(), updatedBy: this.actor.uid });
      });
      transaction.update(invoiceRef, {
        status: 'cancelled', cancellationReason: String(reason || '').trim().slice(0, 500),
        cancelledAt: serverTimestamp(), cancelledBy: this.actor.uid, updatedAt: serverTimestamp(), updatedBy: this.actor.uid
      });
    });
    await this.audit('invoice.cancelled', `${invoiceId}: ${reason}`);
  }

  async ensureDailyCashSession(defaultOpeningCents = 0) {
    try {
      const sessionsSnap = await getDocs(collection(this.db, 'cashSessions'));
      const openSession = sessionsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .find(s => s.status === 'open' && s.openedBy === this.actor.uid);
      if (openSession) return openSession.id;
      return await this.openCashSession({
        openingCents: defaultOpeningCents || 0,
        notes: 'Apertura automática de caja al iniciar sesión'
      });
    } catch {
      return null;
    }
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
        lastCashActivityId: '', lastCashActivityType: '',
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
    if (!Number.isInteger(closingCents) || closingCents < 0) throw new Error('Arqueo de caja inválido.');
    const sessionRef = doc(this.db, 'cashSessions', sessionId);
    const lockRef = doc(this.db, 'counters', `cash-${this.actor.uid}`);
    let closedSession;
    await runTransaction(this.db, async (transaction) => {
      const [sessionSnapshot, lockSnapshot] = await Promise.all([transaction.get(sessionRef), transaction.get(lockRef)]);
      if (!sessionSnapshot.exists() || sessionSnapshot.data().status !== 'open') throw new Error('La caja ya no está abierta.');
      if (sessionSnapshot.data().openedBy !== this.actor.uid) throw new Error('No puedes cerrar la caja de otro usuario.');
      const expectedCents = Number(sessionSnapshot.data().expectedCents
        ?? sessionSnapshot.data().openingCents ?? 0);
      if (!Number.isInteger(expectedCents) || expectedCents < 0) throw new Error('El saldo esperado de la caja no es válido.');
      closedSession = {
        id: sessionId,
        ...sessionSnapshot.data(),
        status: 'closed',
        expectedCents,
        closingCents,
        varianceCents: closingCents - expectedCents,
        closingNotes: String(input.notes || '').slice(0, 500),
        closedBy: this.actor.uid
      };
      transaction.update(sessionRef, {
        status: 'closed', expectedCents, closingCents, varianceCents: closingCents - expectedCents,
        closingNotes: String(input.notes || '').slice(0, 500), closedAt: serverTimestamp(), closedBy: this.actor.uid
      });
      if (lockSnapshot.exists() && lockSnapshot.data().activeSessionId === sessionId) {
        transaction.set(lockRef, { activeSessionId: null, updatedAt: serverTimestamp(), updatedBy: this.actor.uid }, { merge: true });
      }
    });
    await this.audit('cash.closed', sessionId);
    return closedSession;
  }

  async createCashMovement(input) {
    const amountCents = Number(input.amountCents);
    const type = String(input.type || '');
    const reason = String(input.reason || '').trim().slice(0, 300);
    if (!['in', 'out'].includes(type)) throw new Error('Tipo de movimiento inválido.');
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('Monto de movimiento inválido.');
    if (reason.length < 3) throw new Error('Indica un motivo de al menos 3 caracteres.');
    if (!input.cashSessionId) throw new Error('Abre una caja antes de registrar movimientos.');

    const sessionRef = doc(this.db, 'cashSessions', input.cashSessionId);
    const movementRef = doc(collection(this.db, 'cashMovements'));
    const auditRef = doc(collection(this.db, 'auditLogs'));
    await runTransaction(this.db, async (transaction) => {
      const sessionSnapshot = await transaction.get(sessionRef);
      if (!sessionSnapshot.exists() || sessionSnapshot.data().status !== 'open') {
        throw new Error('La caja seleccionada ya no está abierta.');
      }
      if (sessionSnapshot.data().openedBy !== this.actor.uid) {
        throw new Error('No puedes registrar movimientos en la caja de otro usuario.');
      }
      transaction.set(movementRef, {
        cashSessionId: input.cashSessionId,
        type,
        amountCents,
        reason,
        createdAt: serverTimestamp(),
        createdBy: this.actor.uid,
        createdByName: this.actor.displayName || this.actor.email
      });
      const previousExpected = Number(sessionSnapshot.data().expectedCents
        ?? sessionSnapshot.data().openingCents ?? 0);
      const expectedCents = previousExpected + (type === 'in' ? amountCents : -amountCents);
      if (!Number.isInteger(expectedCents) || expectedCents < 0) {
        throw new Error('La salida supera el efectivo esperado en la caja.');
      }
      transaction.update(sessionRef, {
        expectedCents,
        lastCashActivityId: movementRef.id,
        lastCashActivityType: 'movement',
        updatedAt: serverTimestamp(),
        updatedBy: this.actor.uid
      });
      transaction.set(auditRef, {
        action: type === 'in' ? 'cash.movement_in' : 'cash.movement_out',
        details: `${input.cashSessionId}: ${amountCents} - ${reason}`,
        actorId: this.actor.uid,
        actorEmail: this.actor.email || '',
        createdAt: serverTimestamp()
      });
    });
    return movementRef.id;
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
