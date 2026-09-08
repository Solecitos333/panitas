import { DEFAULT_SETTINGS } from "./data-service.js";
import {
  calculateDocument,
  canTransitionOrder,
  paymentStatus,
} from "../domain/billing.js";
import { createOperationId } from "../lib/id.js";
import { calculateWasteCostCents, getInventoryReason, validateInventoryAdjustment } from "../domain/inventory.js";
import { validateEmployeeData, validatePayrollPayment, payrollFingerprint } from "../domain/payroll.js";
import { can } from "../domain/roles.js";

export class MemoryDataService {
  constructor(actor = {}) {
    this.actor = { ...actor, active: actor.active !== false };
    this.data = {
      products: [],
      clients: [],
      deliveryDrivers: [],
      invoices: [],
      payments: [],
      cashSessions: [],
      cashMovements: [],
      inventoryMovements: [],
      employees: [],
      payrollPayments: [],
      auditLogs: [],
      orders: [],
      users: [
        {
          id: actor.uid,
          username: actor.username,
          displayName: actor.displayName,
          roles: actor.roles || ["owner"],
          active: true,
          drawerPin: actor.drawerPin || "",
        },
      ],
      tables: Array.from({ length: 12 }, (_, index) => ({
        id: `mesa-${index + 1}`,
        name: `Mesa ${index + 1}`,
        sortOrder: index + 1,
        zone: "Salón",
        active: true,
        status: "available",
        currentOrderId: null,
      })),
    };
    this.listeners = {};
    this.settings = { ...DEFAULT_SETTINGS };
  }
  destroy() {}
  async loadSettings() {
    return this.settings;
  }
  watchAll(callbacks) {
    this.listeners = callbacks;
    Object.keys(callbacks).forEach((key) =>
      callbacks[key](this.data[key] || []),
    );
  }
  emit(key) {
    this.listeners[key]?.([...this.data[key]]);
  }
  async saveSettings(values) {
    this.settings = { ...this.settings, ...values };
  }
  async saveUserAccess(item) {
    const id = item.uid || createOperationId("user");
    const current = this.data.users.find((entry) => entry.id === id) || {};
    const payload = {
      ...current,
      id,
      username: item.username.toUpperCase(),
      displayName: item.displayName,
      roles: [item.role],
      active: item.active !== false,
      createdAt: current.createdAt || new Date(),
      updatedAt: new Date(),
    };
    this.data.users = [
      ...this.data.users.filter((entry) => entry.id !== id),
      payload,
    ];
    this.emit("users");
    return id;
  }
  async hasMyDrawerPin() {
    const current = this.data.users.find(
      (entry) => entry.id === this.actor.uid && entry.active !== false,
    );
    return /^\d{6}$/.test(String(current?.drawerPin || ""));
  }
  async saveMyDrawerPin(pin) {
    const drawerPin = String(pin || "").trim();
    if (!/^\d{6}$/.test(drawerPin))
      throw new Error("El PIN debe tener exactamente 6 dígitos.");
    const current = this.data.users.find(
      (entry) => entry.id === this.actor.uid,
    );
    if (!current) throw new Error("Usuario no encontrado.");
    if (this.data.users.some((user) => user.id !== this.actor.uid && user.drawerPin === drawerPin)) {
      throw new Error('Ese PIN ya está asignado a otra persona. Elige otro.');
    }
    current.drawerPin = drawerPin;
    current.updatedAt = new Date();
    this.emit("users");
  }
  async verifyDrawerPin(pin, reason = "Apertura manual") {
    const cleanPin = String(pin || "").trim();
    if (!/^\d{6}$/.test(cleanPin))
      throw new Error("El PIN debe tener exactamente 6 dígitos.");

    // Match production: only the authenticated person's PIN can authorize.
    const match = this.data.users.find(
      (entry) => entry.id === this.actor.uid && entry.drawerPin === cleanPin && entry.active !== false,
    );
    if (match) {
      return {
        success: true,
        user: {
          id: match.id, uid: match.id,
          displayName: match.displayName || match.username || "Usuario",
          username: match.username || "",
          roles: match.roles || [],
        },
      };
    }

    // 2. Si el usuario actual no tiene PIN configurado
    const current = this.data.users.find(
      (entry) => entry.id === this.actor.uid && entry.active !== false,
    );
    if (!/^\d{6}$/.test(String(current?.drawerPin || "")))
      throw new Error("Configura primero tu PIN de 6 dígitos.");

    throw new Error("PIN incorrecto.");
  }
  async saveProduct(item) {
    const id = item.id || createOperationId("product");
    const payload = { ...item, id, createdAt: new Date() };
    this.data.products = [
      ...this.data.products.filter((entry) => entry.id !== id),
      payload,
    ].sort((a, b) => a.name.localeCompare(b.name));
    this.emit("products");
    return id;
  }
  async registerInventoryCount(input) {
    const product = this.data.products.find(
      (item) => item.id === input.productId && item.active !== false,
    );
    const targetStock = Math.round(Number(input.targetStock) * 1000) / 1000;
    if (!product || !Number.isFinite(targetStock) || targetStock < 0)
      throw new Error("El conteo de inventario no es válido.");
    const previousStock = Math.round(Number(product.stock || 0) * 1000) / 1000;
    const delta = Math.round((targetStock - previousStock) * 1000) / 1000;
    if (delta === 0)
      throw new Error(
        "El conteo coincide con la existencia actual; no hay cambios que registrar.",
      );
    product.stock = targetStock;
    product.updatedAt = new Date();
    this.data.inventoryMovements.unshift({
      id: createOperationId("inventory"),
      productId: product.id,
      productName: product.name,
      type: delta > 0 ? "increase" : "decrease",
      operation: "count",
      quantity: Math.abs(delta),
      delta,
      previousStock,
      resultingStock: targetStock,
      reason:
        String(input.reason || "")
          .trim()
          .slice(0, 300) || "Conteo físico desde el panel móvil",
      actorId: this.actor.uid,
      actorName: this.actor.displayName || this.actor.username || "",
      createdAt: new Date(),
    });
    this.emit("products");
    this.emit("inventoryMovements");
    return this.data.inventoryMovements[0];
  }

  async adjustInventoryItem(input) {
    if (!can(this.actor, 'catalog:*') && !can(this.actor, 'inventory:*')) {
      throw new Error("No tienes permiso para modificar el inventario.");
    }
    const product = this.data.products.find(
      (item) => item.id === input.productId && item.active !== false,
    );
    if (!product) throw new Error("El producto ya no está disponible.");

    const previousStock = Math.round(Number(product.stock || 0) * 1000) / 1000;
    const op = String(input.operation || "count");

    const { delta, resultingStock, quantity, type } = validateInventoryAdjustment({
      currentStock: previousStock,
      targetStock: input.targetStock,
      quantity: input.quantity,
      operation: op,
    });

    const reasonMeta = getInventoryReason(input.reasonCategory);
    const reasonText = String(input.reason || reasonMeta.label).trim().slice(0, 300);
    const notes = String(input.notes || "").trim().slice(0, 300);
    const wasteCostCents = (op === "waste" || reasonMeta.isWaste)
      ? calculateWasteCostCents(product.costCents, product.priceCents, quantity)
      : 0;

    product.stock = resultingStock;
    product.updatedAt = new Date();

    const movement = {
      id: createOperationId("inventory"),
      productId: product.id,
      productName: product.name,
      type,
      operation: op,
      quantity,
      delta,
      previousStock,
      resultingStock,
      reason: reasonText,
      reasonCategory: input.reasonCategory || (op === "waste" ? "waste_damaged" : "audit_count"),
      wasteCostCents,
      notes,
      actorId: this.actor.uid,
      actorName: this.actor.displayName || this.actor.username || "",
      createdAt: new Date(),
    };

    this.data.inventoryMovements.unshift(movement);
    this.emit("products");
    this.emit("inventoryMovements");
    return movement;
  }

  async batchWasteAdjustment({ items = [], reasonCategory = "waste_unsold", reason = "Sobrante no vendido - Cierre de jornada", notes = "" }) {
    if (!can(this.actor, 'catalog:*') && !can(this.actor, 'inventory:*')) {
      throw new Error("No tienes permiso para modificar el inventario.");
    }
    if (!Array.isArray(items) || !items.length) {
      throw new Error("No hay productos seleccionados para ajustar.");
    }

    const results = [];
    const reasonMeta = getInventoryReason(reasonCategory);
    const reasonText = String(reason || reasonMeta.label).trim().slice(0, 300);

    for (const item of items) {
      const product = this.data.products.find((p) => p.id === item.productId);
      if (!product) continue;

      const prev = Math.max(0, Math.round(Number(product.stock || 0) * 1000) / 1000);
      const target = Math.max(0, Math.round(Number(item.targetStock || 0) * 1000) / 1000);
      const delta = Math.round((target - prev) * 1000) / 1000;
      if (delta === 0) continue;

      const qty = Math.abs(delta);
      const wasteCostCents = calculateWasteCostCents(product.costCents, product.priceCents, qty);

      product.stock = target;
      product.updatedAt = new Date();

      const movement = {
        id: createOperationId("inventory"),
        productId: product.id,
        productName: product.name,
        type: delta < 0 ? "decrease" : "increase",
        operation: "waste",
        quantity: qty,
        delta,
        previousStock: prev,
        resultingStock: target,
        reason: reasonText,
        reasonCategory,
        wasteCostCents,
        notes: String(notes || "").trim().slice(0, 300),
        actorId: this.actor.uid,
        actorName: this.actor.displayName || this.actor.username || "",
        createdAt: new Date(),
      };

      this.data.inventoryMovements.unshift(movement);
      results.push(movement);
    }

    this.emit("products");
    this.emit("inventoryMovements");
    return results;
  }
  async saveClient(item) {
    const id = item.id || createOperationId("client");
    const payload = { ...item, id, createdAt: new Date() };
    this.data.clients = [
      ...this.data.clients.filter((entry) => entry.id !== id),
      payload,
    ].sort((a, b) => a.name.localeCompare(b.name));
    this.emit("clients");
    return id;
  }
  async saveDeliveryDriver(driver) {
    const id = driver.id || createOperationId("driver");
    const existingIndex = this.data.deliveryDrivers.findIndex((item) => item.id === id);
    const item = {
      id,
      name: String(driver.name || "").trim(),
      phone: String(driver.phone || "").trim(),
      vehicle: String(driver.vehicle || "").trim(),
      notes: String(driver.notes || "").trim(),
      active: driver.active !== false,
      updatedAt: new Date(),
      createdAt: driver.createdAt || new Date(),
    };
    if (existingIndex >= 0) this.data.deliveryDrivers[existingIndex] = item;
    else this.data.deliveryDrivers.unshift(item);
    this.emit("deliveryDrivers");
    return id;
  }
  async deleteDeliveryDriver(id) {
    const item = this.data.deliveryDrivers.find((d) => d.id === id);
    if (item) {
      item.active = false;
      this.emit("deliveryDrivers");
    }
  }
  async saveEmployee(employee) {
    if (!can(this.actor, 'payroll:*') && !can(this.actor, 'payroll:view')) {
      throw new Error('No tienes permisos para gestionar empleados.');
    }
    const validated = validateEmployeeData(employee);
    const id = employee.id || createOperationId('emp');
    const existingIndex = this.data.employees.findIndex((item) => item.id === id);
    const item = {
      id,
      ...validated,
      updatedAt: new Date(),
      createdAt: employee.createdAt || new Date(),
    };
    if (existingIndex >= 0) this.data.employees[existingIndex] = item;
    else this.data.employees.unshift(item);
    this.emit('employees');
    return id;
  }
  async deleteEmployee(id) {
    if (!can(this.actor, 'payroll:*')) {
      throw new Error('No tienes permisos para eliminar empleados.');
    }
    const item = this.data.employees.find((e) => e.id === id);
    if (item) {
      item.active = false;
      this.emit('employees');
    }
  }
  async createPayrollPayment(input, activeCash = null) {
    if (!can(this.actor, 'payroll:*')) {
      throw new Error('No tienes permisos para emitir pagos de nómina.');
    }
    const sessionId = input.cashSessionId || activeCash?.id;
    const currentSession = this.data.cashSessions.find(s => sessionId ? s.id === sessionId : (s.status === 'open' && s.openedBy === this.actor.uid));
    const validated = validatePayrollPayment(input, currentSession);
    const employee = this.data.employees.find((e) => e.id === validated.employeeId);
    if (!employee || employee.active === false) throw new Error('Empleado no disponible.');

    const id = input.requestId || createOperationId('payroll');
    const fingerprint = payrollFingerprint(validated, validated.paymentMethod === 'cash' ? currentSession?.id : null);
    const previous = this.data.payrollPayments.find(p => p.id === id);
    if (previous) {
      if (previous.fingerprint !== fingerprint || previous.authorizedByUid !== this.actor.uid) throw new Error('Este identificador ya corresponde a otro pago de nómina.');
      return previous;
    }
    const seqNum = (this.data.payrollPayments.length + 1).toString().padStart(6, '0');
    const receiptNumber = `NOM-${seqNum}`;

    let cashMovementId = null;
    if (validated.paymentMethod === 'cash') {
      cashMovementId = await this.createCashMovement({
        requestId: `${id}-cash`,
        cashSessionId: currentSession.id,
        type: 'out',
        amountCents: validated.netAmountCents,
        reason: `Nómina: ${employee.name} (${validated.conceptLabel})`,
        payrollPaymentId: id
      });
    }

    const paymentRecord = {
      id, requestId: id, fingerprint,
      receiptNumber,
      employeeId: employee.id,
      employeeName: employee.name,
      employeeRole: employee.roleTitle,
      employeeCedula: employee.cedula || '',
      period: validated.period,
      concept: validated.concept,
      conceptLabel: validated.conceptLabel,
      baseSalaryCents: validated.baseSalaryCents,
      bonusCents: validated.bonusCents,
      deductionsCents: validated.deductionsCents,
      netAmountCents: validated.netAmountCents,
      paymentMethod: validated.paymentMethod,
      paymentMethodLabel: validated.paymentMethodLabel,
      cashSessionId: validated.paymentMethod === 'cash' ? currentSession.id : null,
      cashMovementId,
      notes: validated.notes,
      authorizedByUid: this.actor.uid,
      authorizedByName: this.actor.displayName || this.actor.username || 'Administrador',
      createdAt: new Date()
    };

    this.data.payrollPayments.unshift(paymentRecord);
    this.emit('payrollPayments');

    this.data.auditLogs.unshift({
      id: createOperationId('audit'),
      action: 'payroll.payment_issued',
      actorId: this.actor.uid,
      actorName: this.actor.displayName || this.actor.username,
      details: `Pago de nómina ${receiptNumber} emitido a ${employee.name}: RD$ ${(validated.netAmountCents / 100).toFixed(2)} (${validated.paymentMethodLabel})`,
      createdAt: new Date()
    });
    this.emit('auditLogs');

    return paymentRecord;
  }
  async createOrder(input) {
    const table = this.data.tables.find((item) => item.id === input.tableId);
    if (!table || table.currentOrderId) throw new Error("Mesa no disponible.");
    const totals = calculateDocument(input.items);
    const id = createOperationId("order");
    this.data.orders.unshift({
      id,
      ...input,
      tableName: table.name,
      status: "pending",
      revision: 1,
      ...totals,
      createdAt: new Date(),
      createdBy: this.actor.uid,
    });
    table.currentOrderId = id;
    table.status = "occupied";
    this.emit("orders");
    this.emit("tables");
    return id;
  }
  async transitionOrder(
    id,
    nextStatus,
    action = "status_changed",
    reason = "",
  ) {
    const order = this.data.orders.find((item) => item.id === id);
    if (!order || !canTransitionOrder(order.status, nextStatus))
      throw new Error("Transición de comanda inválida.");
    order.status = nextStatus;
    order.revision += 1;
    order.lastAction = action;
    if (nextStatus === "cancelled") {
      order.cancellationReason = String(reason || "").trim();
      const table = this.data.tables.find((item) => item.id === order.tableId);
      table.currentOrderId = null;
      table.status = "available";
      this.emit("tables");
    }
    this.emit("orders");
  }
  async createDirectDocument(input) {
    return this.createDocument(input);
  }
  async chargeOrder(id, payment) {
    const order = this.data.orders.find((item) => item.id === id);
    if (!order) throw new Error("La comanda no existe.");
    if (!["served", "pending_payment"].includes(order.status))
      throw new Error("La comanda todavía no está lista para cobro.");
    const created = await this.createDocument({
      requestId: payment.requestId,
      documentType: "invoice",
      clientName: order.clientName,
      clientRnc: payment.clientRnc || order.clientRnc || "",
      ncfType: payment.ncfType || "",
      items: order.items,
      discountCents: order.discountCents || 0,
      tipCents: order.tipCents || 0,
      payment,
      orderId: id,
      tableId: order.tableId,
    });
    order.status = "closed";
    order.linkedInvoiceId = created.id;
    const table = this.data.tables.find((item) => item.id === order.tableId);
    table.currentOrderId = null;
    table.status = "available";
    this.emit("orders");
    this.emit("tables");
    return created;
  }
  async createDocument(input) {
    const requestId = String(input.requestId || "").trim();
    const existing = requestId
      ? this.data.invoices.find((item) => item.requestId === requestId)
      : null;
    if (existing)
      return {
        id: existing.id,
        invoiceNumber: existing.invoiceNumber,
        ncf: existing.ncf,
        ncfType: existing.ncfType || "",
        documentType: existing.documentType,
      };
    const totals = calculateDocument(input.items, {
      discount: input.discount || input.discountCents,
      discountType: input.discountType || (input.discountCents ? "amount" : "percent"),
      discountInCents: Boolean(input.discountCents),
      includeLegalTip: input.includeLegalTip === true,
      tipCents: input.tipCents,
    });
    const id = requestId || createOperationId("document");
    const documentType = input.documentType || "invoice";
    const amount =
      documentType === "invoice"
        ? Math.min(Number(input.payment?.amountCents || 0), totals.totalCents)
        : 0;
    if (amount && !input.payment?.cashSessionId)
      throw new Error("Abre una caja antes de registrar el cobro.");
    const cashSession = amount
      ? this.data.cashSessions.find((item) => item.id === input.payment.cashSessionId
        && item.status === "open" && item.openedBy === this.actor.uid)
      : null;
    if (amount && !cashSession)
      throw new Error("La caja seleccionada ya no está disponible o está cerrada.");
    const method = input.payment?.method || "";
    const tenderedCents =
      method === "cash" && amount
        ? Number(input.payment?.tenderedCents || amount)
        : 0;
    const changeCents =
      method === "cash" && amount ? tenderedCents - amount : 0;
    if (method === "cash" && amount && tenderedCents < amount)
      throw new Error("El efectivo recibido no cubre el total de la venta.");
    const prefix =
      documentType === "quote"
        ? "COT-"
        : documentType === "proforma"
          ? "PROF-"
          : "PAN-";
    const paymentId = amount
      ? (requestId ? `${requestId}-payment` : createOperationId("payment"))
      : "";
    const invoice = {
      id,
      ...(requestId ? { requestId } : {}),
      documentType,
      invoiceNumber: `${prefix}${String(this.data.invoices.length + 1001).padStart(6, "0")}`,
      ncf: "",
      clientId: input.clientId || "",
      clientName: input.clientName || "Consumidor final",
      clientRnc: input.clientRnc || "",
      clientPhone: input.clientPhone || "",
      clientAddress: input.clientAddress || "",
      notes: input.notes || "",
      items: input.items,
      ...totals,
      paidCents: amount,
      lastPaymentId: paymentId,
      status:
        documentType === "invoice"
          ? paymentStatus(totals.totalCents, amount)
          : "pending",
      paymentMethod: method || "cash",
      deliveryDriverId: input.deliveryDriverId || "",
      deliveryDriverName: input.deliveryDriverName || "",
      deliveryAddress: input.deliveryAddress || input.clientAddress || "",
      deliveryPhone: input.deliveryPhone || input.clientPhone || "",
      deliveryNotes: input.deliveryNotes || "",
      deliveryChangeForCents: Number(input.deliveryChangeForCents || 0),
      deliveryStatus: (input.deliveryDriverName || method === "delivery_cod") ? (input.deliveryStatus || "in_transit") : "",
      createdAt: new Date(),
      createdBy: this.actor.uid,
    };
    this.data.invoices.unshift(invoice);
    if (amount) {
      this.data.payments.unshift({
        id: paymentId,
        ...(requestId ? { requestId } : {}),
        invoiceId: id,
        invoiceNumber: invoice.invoiceNumber,
        amountCents: amount,
        method,
        reference: input.payment.reference || "",
        tenderedCents,
        changeCents,
        cashSessionId: input.payment.cashSessionId,
        createdAt: new Date(),
      });
      if (method === "cash") {
        cashSession.expectedCents = Number(cashSession.expectedCents ?? cashSession.openingCents ?? 0) + amount;
        cashSession.lastCashActivityId = paymentId;
        cashSession.lastCashActivityType = "payment";
      }
      this.emit("payments");
    }
    if (documentType === "invoice")
      input.items.forEach((line) => {
        const product = this.data.products.find(
          (item) => item.id === line.productId,
        );
        if (product) product.stock -= line.quantity;
      });
    this.emit("products");
    this.emit("invoices");
    return {
      id,
      invoiceNumber: invoice.invoiceNumber,
      ncf: invoice.ncf,
      ncfType: "",
      documentType,
    };
  }
  async recordPayment(invoiceId, payment) {
    if (!payment.cashSessionId)
      throw new Error("Abre una caja antes de registrar el cobro.");
    const session = this.data.cashSessions.find(
      (item) =>
        item.id === payment.cashSessionId &&
        item.status === "open" &&
        item.openedBy === this.actor.uid,
    );
    if (!session)
      throw new Error("La caja seleccionada ya no está disponible o está cerrada.");
    const invoice = this.data.invoices.find((item) => item.id === invoiceId);
    if (!invoice) throw new Error("La factura no existe.");
    const requestId = String(payment.requestId || "").trim();
    const existing = requestId
      ? this.data.payments.find((item) => item.requestId === requestId)
      : null;
    if (existing) return existing.id;
    if (["paid", "cancelled"].includes(invoice.status))
      throw new Error("La factura no admite cobros.");
    const amountCents = Number(payment.amountCents);
    const balanceCents = Number(invoice.totalCents) - Number(invoice.paidCents || 0);
    if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > balanceCents)
      throw new Error("Monto de pago inválido.");
    const tenderedCents =
      payment.method === "cash" ? Number(payment.tenderedCents || amountCents) : 0;
    if (
      payment.method === "cash" &&
      (!Number.isInteger(tenderedCents) || tenderedCents < amountCents)
    )
      throw new Error("Efectivo recibido inválido.");
    const paymentId = requestId || createOperationId("payment");
    invoice.paidCents += amountCents;
    invoice.status = paymentStatus(invoice.totalCents, invoice.paidCents);
    invoice.lastPaymentId = paymentId;
    if ((invoice.deliveryDriverName || invoice.paymentMethod === 'delivery_cod') && invoice.paidCents >= Number(invoice.totalCents)) {
      invoice.deliveryStatus = 'settled';
    }
    this.data.payments.unshift({
      id: paymentId,
      ...(requestId ? { requestId } : {}),
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      ...payment,
      amountCents,
      tenderedCents,
      changeCents: payment.method === "cash" ? tenderedCents - amountCents : 0,
      cashierId: this.actor.uid,
      cashierName: this.actor.displayName || this.actor.username || "",
      createdAt: new Date(),
    });
    if (payment.method === "cash") {
      session.expectedCents = Number(session.expectedCents ?? session.openingCents ?? 0) + amountCents;
      session.lastCashActivityId = paymentId;
      session.lastCashActivityType = "payment";
    }
    this.emit("invoices");
    this.emit("payments");
    return paymentId;
  }
  async cancelInvoice(id, reason) {
    const invoice = this.data.invoices.find((item) => item.id === id);
    if (!invoice) throw new Error("La factura no existe.");
    if (Number(invoice.paidCents || 0) > 0)
      throw new Error("No se puede anular una factura con cobros.");
    if (invoice.status === "cancelled") throw new Error("La factura ya está anulada.");
    if (invoice.documentType === "invoice") {
      for (const line of invoice.items || []) {
        const product = this.data.products.find((item) => item.id === line.productId);
        if (product) product.stock += Number(line.quantity || 0);
      }
      this.emit("products");
    }
    invoice.status = "cancelled";
    invoice.cancellationReason = String(reason || "").trim();
    this.emit("invoices");
  }
  async ensureDailyCashSession(defaultOpeningCents = 0) {
    const openSession = this.data.cashSessions.find((s) => s.status === "open" && s.openedBy === this.actor.uid);
    if (openSession) return openSession.id;
    return this.openCashSession({
      openingCents: defaultOpeningCents || 0,
      notes: "Apertura automática de caja al iniciar sesión",
    });
  }
  async openCashSession(input) {
    const id = createOperationId("cash-session");
    const openingCents = Number(input.openingCents || 0);
    if (!Number.isInteger(openingCents) || openingCents < 0)
      throw new Error("Fondo inicial inválido.");
    this.data.cashSessions.unshift({
      id,
      ...input,
      openingCents,
      expectedCents: openingCents,
      lastCashActivityId: "",
      lastCashActivityType: "",
      status: "open",
      openedAt: new Date(),
      openedBy: this.actor.uid,
      openedByName: this.actor.displayName,
    });
    this.emit("cashSessions");
    return id;
  }
  async closeCashSession(id, input) {
    const session = this.data.cashSessions.find((item) => item.id === id);
    if (!session || session.status !== "open")
      throw new Error("La caja ya no está abierta.");
    if (session.openedBy !== this.actor.uid) throw new Error('No puedes cerrar la caja de otro usuario.');
    const closingCents = Number(input.closingCents);
    const expectedCents = Number(session.expectedCents ?? session.openingCents ?? 0);
    if (
      !Number.isInteger(closingCents) ||
      closingCents < 0 ||
      !Number.isInteger(expectedCents) ||
      expectedCents < 0
    )
      throw new Error("Arqueo de caja inválido.");
    if (closingCents !== expectedCents && String(input.notes || '').trim().length < 3) {
      throw new Error('Hay una diferencia de caja. Recuenta el efectivo y escribe una nota antes de cerrar.');
    }
    Object.assign(session, {
      status: "closed",
      expectedCents,
      closingCents,
      varianceCents: closingCents - expectedCents,
      closingNotes: String(input.notes || ""),
      closedAt: new Date(),
      closedBy: this.actor.uid,
    });
    this.emit("cashSessions");
    return { ...session };
  }
  async createCashMovement(input) {
    const amountCents = Number(input.amountCents);
    const reason = String(input.reason || "").trim();
    if (!["in", "out"].includes(input.type))
      throw new Error("Tipo de movimiento inválido.");
    if (!Number.isInteger(amountCents) || amountCents <= 0)
      throw new Error("Monto de movimiento inválido.");
    if (reason.length < 3)
      throw new Error("Indica un motivo de al menos 3 caracteres.");
    const previous = input.requestId && this.data.cashMovements.find((item) => item.id === input.requestId);
    if (previous) {
      if (previous.createdBy !== this.actor.uid || previous.cashSessionId !== input.cashSessionId || previous.type !== input.type || previous.amountCents !== amountCents || previous.reason !== reason) {
        throw new Error('Este identificador ya corresponde a otro movimiento.');
      }
      return previous.id;
    }
    const session = this.data.cashSessions.find(
      (item) =>
        item.id === input.cashSessionId &&
        item.status === "open" &&
        item.openedBy === this.actor.uid,
    );
    if (!session) throw new Error("La caja seleccionada ya no está abierta.");
    const id = input.requestId || createOperationId("cash-movement");
    const expectedCents = Number(session.expectedCents ?? session.openingCents ?? 0)
      + (input.type === "in" ? amountCents : -amountCents);
    if (!Number.isInteger(expectedCents) || expectedCents < 0)
      throw new Error("La salida supera el efectivo esperado en la caja.");
    this.data.cashMovements.unshift({
      id,
      ...input,
      amountCents,
      reason,
      createdAt: new Date(),
      createdBy: this.actor.uid,
      createdByName: this.actor.displayName,
    });
    session.expectedCents = expectedCents;
    session.lastCashActivityId = id;
    session.lastCashActivityType = "movement";
    this.emit("cashMovements");
    return id;
  }
  async audit(action, details) {
    this.data.auditLogs.unshift({ id: createOperationId('audit'), action, details, actorId: this.actor.uid, actorName: this.actor.displayName, createdAt: new Date() });
    this.emit('auditLogs');
  }
  watchWhatsAppBot(callback) {
    callback(this.data.whatsappBot || null);
    this.listeners.whatsappBot = callback;
    return () => {};
  }
  async sendWhatsAppBotCommand(command, payload = {}) {
    this.data.whatsappBotCommand = { command, payload, createdAt: new Date() };
  }
  async seedFoundation() {}
}
