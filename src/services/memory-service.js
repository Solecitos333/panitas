import { DEFAULT_SETTINGS } from './data-service.js';
import { calculateDocument, canTransitionOrder, paymentStatus } from '../domain/billing.js';

export class MemoryDataService {
  constructor(actor) {
    this.actor = actor;
    this.data = {
      products: [], clients: [], invoices: [], payments: [], cashSessions: [], orders: [],
      tables: Array.from({ length: 12 }, (_, index) => ({ id: `mesa-${index + 1}`, name: `Mesa ${index + 1}`, sortOrder: index + 1, zone: 'Salón', active: true, status: 'available', currentOrderId: null }))
    };
    this.listeners = {};
    this.settings = { ...DEFAULT_SETTINGS };
  }
  destroy() {}
  async loadSettings() { return this.settings; }
  watchAll(callbacks) { this.listeners = callbacks; Object.keys(callbacks).forEach((key) => callbacks[key](this.data[key] || [])); }
  emit(key) { this.listeners[key]?.([...this.data[key]]); }
  async saveSettings(values) { this.settings = { ...this.settings, ...values }; }
  async saveProduct(item) { const id = item.id || crypto.randomUUID(); const payload = { ...item, id, createdAt: new Date() }; this.data.products = [...this.data.products.filter((entry) => entry.id !== id), payload].sort((a,b)=>a.name.localeCompare(b.name)); this.emit('products'); return id; }
  async saveClient(item) { const id = item.id || crypto.randomUUID(); const payload = { ...item, id, createdAt: new Date() }; this.data.clients = [...this.data.clients.filter((entry) => entry.id !== id), payload].sort((a,b)=>a.name.localeCompare(b.name)); this.emit('clients'); return id; }
  async createOrder(input) { const table = this.data.tables.find((item) => item.id === input.tableId); if (!table || table.currentOrderId) throw new Error('Mesa no disponible.'); const totals = calculateDocument(input.items); const id = crypto.randomUUID(); this.data.orders.unshift({ id, ...input, tableName: table.name, status:'pending', revision:1, ...totals, createdAt:new Date(), createdBy:this.actor.uid }); table.currentOrderId=id; table.status='occupied'; this.emit('orders'); this.emit('tables'); return id; }
  async transitionOrder(id,nextStatus) { const order=this.data.orders.find((item)=>item.id===id); if(!order||!canTransitionOrder(order.status,nextStatus))throw new Error('Transición de comanda inválida.'); order.status=nextStatus; order.revision+=1; if(nextStatus==='cancelled'){ const table=this.data.tables.find((item)=>item.id===order.tableId); table.currentOrderId=null; table.status='available'; this.emit('tables'); } this.emit('orders'); }
  async createDirectDocument(input) { return this.createDocument(input); }
  async chargeOrder(id,payment) { const order=this.data.orders.find((item)=>item.id===id); const invoiceId=await this.createDocument({ documentType:'invoice', clientName:order.clientName, items:order.items, payment, orderId:id, tableId:order.tableId }); order.status='closed'; order.linkedInvoiceId=invoiceId; const table=this.data.tables.find((item)=>item.id===order.tableId); table.currentOrderId=null; table.status='available'; this.emit('orders'); this.emit('tables'); return invoiceId; }
  async createDocument(input){ const totals=calculateDocument(input.items); const id=crypto.randomUUID(); const documentType=input.documentType||'invoice'; const amount=documentType==='invoice'?Math.min(Number(input.payment?.amountCents||0),totals.totalCents):0; if(amount&&!input.payment?.cashSessionId)throw new Error('Abre una caja antes de registrar el cobro.'); const prefix=documentType==='quote'?'COT-':documentType==='proforma'?'PROF-':'PAN-'; const invoice={id,documentType,invoiceNumber:`${prefix}${String(this.data.invoices.length+1001).padStart(6,'0')}`,ncf:'',clientName:input.clientName||'Consumidor final',items:input.items,...totals,paidCents:amount,status:documentType==='invoice'?paymentStatus(totals.totalCents,amount):'pending',createdAt:new Date(),createdBy:this.actor.uid}; this.data.invoices.unshift(invoice); if(amount){this.data.payments.unshift({id:crypto.randomUUID(),invoiceId:id,invoiceNumber:invoice.invoiceNumber,amountCents:amount,method:input.payment.method,cashSessionId:input.payment.cashSessionId,createdAt:new Date()});this.emit('payments');} if(documentType==='invoice')input.items.forEach((line)=>{const product=this.data.products.find((item)=>item.id===line.productId);if(product)product.stock-=line.quantity;});this.emit('products');this.emit('invoices');return id; }
  async recordPayment(invoiceId,payment){if(!payment.cashSessionId)throw new Error('Abre una caja antes de registrar el cobro.');const invoice=this.data.invoices.find((item)=>item.id===invoiceId);invoice.paidCents+=payment.amountCents;invoice.status=paymentStatus(invoice.totalCents,invoice.paidCents);this.data.payments.unshift({id:crypto.randomUUID(),invoiceId,invoiceNumber:invoice.invoiceNumber,...payment,createdAt:new Date()});this.emit('invoices');this.emit('payments');}
  async cancelInvoice(id,reason){const invoice=this.data.invoices.find((item)=>item.id===id);invoice.status='cancelled';invoice.cancellationReason=reason;this.emit('invoices');}
  async openCashSession(input){const id=crypto.randomUUID();this.data.cashSessions.unshift({id,...input,status:'open',openedAt:new Date(),openedBy:this.actor.uid,openedByName:this.actor.displayName});this.emit('cashSessions');return id;}
  async closeCashSession(id,input){const session=this.data.cashSessions.find((item)=>item.id===id);Object.assign(session,input,{status:'closed',closedAt:new Date()});this.emit('cashSessions');}
  async seedFoundation(){}
}
