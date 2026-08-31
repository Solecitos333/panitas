import { DEFAULT_SETTINGS } from "./data-service.js";
import {
  calculateDocument,
  canTransitionOrder,
  paymentStatus,
} from "../domain/billing.js";
import { createOperationId } from "../lib/id.js";

export class MemoryDataService {
  constructor(actor) {
    this.actor = actor;
    this.data = {
      products: [],
      clients: [],
      invoices: [],
      payments: [],
      cashSessions: [],
      cashMovements: [],
      inventoryMovements: [],
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
    return /^\d{4}$/.test(String(current?.drawerPin || ""));
  }
  async saveMyDrawerPin(pin) {
    const drawerPin = String(pin || "").replace(/\D/g, "");
    if (!/^\d{4}$/.test(drawerPin))
      throw new Error("El PIN debe tener exactamente 4 dígitos.");
    const current = this.data.users.find(
      (entry) => entry.id === this.actor.uid,
    );
    if (!current) throw new Error("Usuario no encontrado.");
    current.drawerPin = drawerPin;
    current.updatedAt = new Date();
    this.emit("users");
  }
  async verifyDrawerPin(pin) {
    const cleanPin = String(pin || "").replace(/\D/g, "");
    const current = this.data.users.find(
      (entry) => entry.id === this.actor.uid && entry.active !== false,
    );
    if (!/^\d{4}$/.test(String(current?.drawerPin || "")))
      throw new Error("Configura primero tu PIN de 4 dígitos.");
    if (current.drawerPin !== cleanPin) throw new Error("PIN incorrecto.");
    return {
      success: true,
      user: {
        id: current.id,
        displayName: current.displayName,
        username: current.username,
        roles: current.roles || [],
      },
    };
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
    return this.data.inventoryMovements[0];
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
      clientName: input.clientName || "Consumidor final",
      clientRnc: input.clientRnc || "",
      notes: input.notes || "",
      items: input.items,
      ...totals,
      paidCents: amount,
      lastPaymentId: paymentId,
      status:
        documentType === "invoice"
          ? paymentStatus(totals.totalCents, amount)
          : "pending",
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
    const closingCents = Number(input.closingCents);
    const expectedCents = Number(session.expectedCents ?? session.openingCents ?? 0);
    if (
      !Number.isInteger(closingCents) ||
      closingCents < 0 ||
      !Number.isInteger(expectedCents) ||
      expectedCents < 0
    )
      throw new Error("Arqueo de caja inválido.");
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
    const session = this.data.cashSessions.find(
      (item) =>
        item.id === input.cashSessionId &&
        item.status === "open" &&
        item.openedBy === this.actor.uid,
    );
    if (!session) throw new Error("La caja seleccionada ya no está abierta.");
    const id = createOperationId("cash-movement");
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
  async seedFoundation() {}
}
