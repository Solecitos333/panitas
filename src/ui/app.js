import {
  createIcons, BadgeCheck, BadgeDollarSign, Banknote, Calculator, ChartNoAxesCombined,
  ChefHat, CircleDollarSign, Clock3, Eye, FileCheck2, FileSpreadsheet, Landmark,
  KeyRound, LayoutDashboard, LogOut, Menu, MessageSquareWarning, Package, PackageOpen, Pencil,
  Plus, Printer, Radio, Receipt, ReceiptText, RefreshCw, Save, Search, Send, Settings,
  Sheet, ShieldCheck, ShoppingBasket, ShoppingCart, Trash2, TrendingUp, UserPlus,
  Users, Utensils, Wallet, WalletCards, Wifi, WifiOff, X
} from 'lucide';
import { can, allowedNavigation, primaryRole } from '../domain/roles.js';
import { calculateDocument, toCents } from '../domain/billing.js';
import { renderDashboard, renderKds, renderOrderDrawer, renderPos, renderTables } from '../modules/operations.js';
import { exportReport, renderInvoiceModal, renderInvoices, renderReports } from '../modules/billing.js';
import { renderClientForm, renderClients, renderProductForm, renderProducts } from '../modules/directory.js';
import { renderCash, renderSettings, renderUserForm, renderUsers } from '../modules/administration.js';
import { escapeHtml, formatMoney } from '../lib/format.js';

const NAV = [
  ['dashboard','layout-dashboard','Resumen'], ['pos','shopping-cart','Punto de venta'], ['tables','utensils','Mesas'],
  ['kds','chef-hat','Cocina KDS'], ['invoices','receipt-text','Facturación'], ['clients','users','Clientes'],
  ['products','package','Productos'], ['cash','wallet-cards','Caja'], ['reports','chart-no-axes-combined','Reportes'], ['users','user-plus','Usuarios'], ['settings','settings','Configuración']
];

const icons = {
  BadgeCheck, BadgeDollarSign, Banknote, Calculator, ChartNoAxesCombined, ChefHat,
  CircleDollarSign, Clock3, Eye, FileCheck2, FileSpreadsheet, KeyRound, Landmark, LayoutDashboard,
  LogOut, Menu, MessageSquareWarning, Package, PackageOpen, Pencil, Plus, Printer,
  Radio, Receipt, ReceiptText, RefreshCw, Save, Search, Send, Settings, Sheet,
  ShieldCheck, ShoppingBasket, ShoppingCart, Trash2, TrendingUp, UserPlus, Users,
  Utensils, Wallet, WalletCards, Wifi, WifiOff, X
};

export function createApplication({ root, user, service, onLogout, onChangePassword, development = false }) {
  const state = {
    user, settings: {}, route: initialRoute(user), cart: [], selectedOrderId: '', selectedInvoiceId: '', modal: '',
    products: [], clients: [], tables: [], orders: [], invoices: [], payments: [], cashSessions: [], users: [], development,
    capabilities: {
      bill: can(user, 'billing:create'), cancelInvoice: can(user, 'billing:cancel'), chargeOrder: can(user, 'orders:charge'),
      createOrder: can(user, 'orders:create'), updateOrder: can(user, 'orders:update'), serveOrder: can(user, 'orders:serve'),
      kitchenOrder: can(user, 'orders:kitchen'), viewKds: can(user, 'kds:view'), manageCatalog: can(user, 'catalog:*'), manageClients: can(user, 'clients:*'), manageUsers: can(user, 'users:manage')
    }
  };
  let destroyed = false;

  async function start() {
    state.settings = await service.loadSettings();
    service.watchAll({
      products: update('products'), clients: update('clients'), tables: update('tables'), orders: update('orders'),
      invoices: update('invoices'), payments: update('payments'), cashSessions: update('cashSessions'), users: update('users')
    });
    render();
  }

  function update(key) { return (items, error) => { if (error) toast(`No se pudo sincronizar ${key}.`, 'danger'); state[key] = items; if (!destroyed) renderContent(); }; }
  function activeCash() { return state.cashSessions.find((item) => item.status === 'open' && item.openedBy === user.uid) || null; }

  function render() {
    root.innerHTML = `<div class="app-shell"><aside class="sidebar"><a class="brand" href="#dashboard" data-route="dashboard"><img src="/logo.png" alt="Logo de Los Panitas by Nechy"><div><strong>Los Panitas</strong><span>by Nechy · POS</span></div></a><nav>${allowedNavigation(user).map((id) => { const entry=NAV.find((item)=>item[0]===id); return `<button data-route="${id}" class="${state.route===id?'active':''}"><i data-lucide="${entry[1]}"></i><span>${entry[2]}</span></button>`; }).join('')}</nav><div class="sidebar-footer"><div class="user-card"><span>${escapeHtml((user.displayName||user.username||'?').charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(user.displayName||user.username)}</strong><small>${roleLabel(primaryRole(user))}</small></div></div><button class="logout-button" data-password><i data-lucide="key-round"></i> Cambiar contraseña</button><button class="logout-button" data-logout><i data-lucide="log-out"></i> Cerrar sesión</button></div></aside><header class="mobile-header"><button class="icon-button" data-menu aria-label="Menú"><i data-lucide="menu"></i></button><a class="brand" data-route="dashboard"><img src="/logo.png" alt="Logo de Los Panitas by Nechy"><strong>Los Panitas</strong></a><span class="connection-status" id="connection-indicator"><i data-lucide="wifi"></i></span></header><main><div id="offline-banner" class="offline-banner" hidden><i data-lucide="wifi-off"></i> Sin conexión. Puedes consultar datos guardados, pero las operaciones están pausadas.</div><div id="main-content" class="main-content"></div></main><div id="modal-root"></div><div id="toast-root" class="toast-root" aria-live="assertive"></div></div>`;
    bindShell(); renderContent(); updateConnection();
  }

  function renderContent() {
    if (!root.querySelector('#main-content')) return;
    state.activeCash = activeCash();
    const renderers = { dashboard: renderDashboard, pos: renderPos, tables: renderTables, kds: renderKds, invoices: renderInvoices, clients: renderClients, products: renderProducts, cash: renderCash, reports: renderReports, users: renderUsers, settings: renderSettings };
    const renderer = renderers[state.route] || renderDashboard;
    root.querySelector('#main-content').innerHTML = renderer(state);
    renderModal(); bindContent(); iconsRefresh();
  }

  function renderModal() {
    const modalRoot = root.querySelector('#modal-root');
    if (!modalRoot) return;
    if (state.modal === 'product') modalRoot.innerHTML = renderProductForm(state.products.find((item)=>item.id===state.editingId));
    else if (state.modal === 'client') modalRoot.innerHTML = renderClientForm(state.clients.find((item)=>item.id===state.editingId));
    else if (state.modal === 'order') modalRoot.innerHTML = renderOrderDrawer(state.orders.find((item)=>item.id===state.selectedOrderId), state.capabilities);
    else if (state.modal === 'invoice') modalRoot.innerHTML = renderInvoiceModal(state.invoices.find((item)=>item.id===state.selectedInvoiceId), state.payments, state.capabilities);
    else if (state.modal === 'payment') modalRoot.innerHTML = paymentModal();
    else if (state.modal === 'charge') modalRoot.innerHTML = chargeModal();
    else if (state.modal === 'user') modalRoot.innerHTML = renderUserForm(state.editingUser);
    else if (state.modal === 'password') modalRoot.innerHTML = passwordModal();
    else modalRoot.innerHTML = '';
    iconsRefresh(); bindModal();
  }

  function bindShell() {
    root.querySelectorAll('[data-route]').forEach((button)=>button.addEventListener('click',()=>route(button.dataset.route)));
    root.querySelector('[data-logout]')?.addEventListener('click', onLogout);
    root.querySelector('[data-password]')?.addEventListener('click',()=>{state.modal='password';renderModal();});
    root.querySelector('[data-menu]')?.addEventListener('click',()=>root.querySelector('.sidebar').classList.toggle('open'));
    window.addEventListener('online', updateConnection); window.addEventListener('offline', updateConnection);
  }

  function bindContent() {
    root.querySelectorAll('#main-content [data-route]').forEach((button)=>button.addEventListener('click',()=>route(button.dataset.route)));
    root.querySelector('[data-refresh]')?.addEventListener('click',()=>renderContent());
    root.querySelectorAll('[data-product-add]').forEach((button)=>button.addEventListener('click',()=>addProduct(button.dataset.productAdd)));
    root.querySelectorAll('[data-cart-qty]').forEach((button)=>button.addEventListener('click',()=>changeQuantity(Number(button.dataset.cartQty),Number(button.dataset.delta))));
    root.querySelector('[data-cart-clear]')?.addEventListener('click',()=>{state.cart=[];renderContent();});
    root.querySelector('#product-search')?.addEventListener('input',filterCards);
    root.querySelector('#pos-checkout-form')?.addEventListener('submit',submitPos);
    root.querySelector('#pos-checkout-form [name=tableId]')?.addEventListener('change',updatePosFields);
    root.querySelector('#pos-checkout-form [name=documentType]')?.addEventListener('change',updatePosFields);
    root.querySelectorAll('[data-order-open]').forEach((button)=>button.addEventListener('click',()=>openOrder(button.dataset.orderOpen)));
    root.querySelectorAll('[data-kds-order]').forEach((button)=>button.addEventListener('click',()=>perform(()=>service.transitionOrder(button.dataset.kdsOrder,button.dataset.nextStatus),'Comanda actualizada.')));
    root.querySelectorAll('[data-invoice-view]').forEach((button)=>button.addEventListener('click',()=>openInvoice(button.dataset.invoiceView)));
    root.querySelector('#invoice-search')?.addEventListener('input',filterInvoiceRows);
    root.querySelector('#invoice-status-filter')?.addEventListener('change',filterInvoiceRows);
    root.querySelector('[data-product-new]')?.addEventListener('click',()=>openForm('product'));
    root.querySelector('[data-client-new]')?.addEventListener('click',()=>openForm('client'));
    root.querySelector('[data-user-new]')?.addEventListener('click',()=>openUserForm());
    root.querySelectorAll('[data-user-edit]').forEach((button)=>button.addEventListener('click',()=>openUserForm(button.dataset.userEdit)));
    root.querySelectorAll('[data-product-edit]').forEach((button)=>button.addEventListener('click',()=>openForm('product',button.dataset.productEdit)));
    root.querySelectorAll('[data-client-edit]').forEach((button)=>button.addEventListener('click',()=>openForm('client',button.dataset.clientEdit)));
    root.querySelector('#directory-search')?.addEventListener('input',filterDirectory);
    root.querySelector('#cash-open-form')?.addEventListener('submit',openCash);
    root.querySelector('#cash-close-form')?.addEventListener('submit',closeCash);
    root.querySelector('#settings-form')?.addEventListener('submit',saveSettings);
    root.querySelectorAll('[data-export]').forEach((button)=>button.addEventListener('click',()=>exportReport(button.dataset.export,state)));
    updatePosFields();
  }

  function bindModal() {
    const modalRoot=root.querySelector('#modal-root');
    modalRoot?.querySelectorAll('[data-modal-close]').forEach((item)=>item.addEventListener('click',(event)=>{if(event.target.closest('[data-modal-card]')&&!event.target.closest('button[data-modal-close]'))return;closeModal();}));
    modalRoot?.querySelector('#product-form')?.addEventListener('submit',saveProduct);
    modalRoot?.querySelector('#client-form')?.addEventListener('submit',saveClient);
    modalRoot?.querySelector('#user-access-form')?.addEventListener('submit',saveUserAccess);
    modalRoot?.querySelector('#password-change-form')?.addEventListener('submit',submitPasswordChange);
    modalRoot?.querySelector('[data-order-transition]')?.addEventListener('click',(event)=>perform(()=>service.transitionOrder(state.selectedOrderId,event.currentTarget.dataset.orderTransition),'Comanda actualizada.',closeModal));
    modalRoot?.querySelector('[data-order-charge]')?.addEventListener('click',()=>{state.modal='charge';renderModal();});
    modalRoot?.querySelector('[data-order-cancel]')?.addEventListener('click',cancelOrder);
    modalRoot?.querySelector('[data-payment-open]')?.addEventListener('click',()=>{state.modal='payment';renderModal();});
    modalRoot?.querySelector('[data-invoice-cancel]')?.addEventListener('click',cancelInvoice);
    modalRoot?.querySelector('[data-invoice-print]')?.addEventListener('click',()=>window.print());
    modalRoot?.querySelector('#payment-form')?.addEventListener('submit',submitPayment);
    modalRoot?.querySelector('#charge-form')?.addEventListener('submit',submitCharge);
  }

  function route(id){if(!allowedNavigation(user).includes(id))return;state.route=id;state.modal='';root.querySelector('.sidebar')?.classList.remove('open');render();history.replaceState(null,'',`#${id}`);}
  function addProduct(id){const product=state.products.find((item)=>item.id===id);if(!product)return;const line=state.cart.find((item)=>item.productId===id);if(line)line.quantity+=1;else state.cart.push({productId:id,name:product.name,quantity:1,unitPriceCents:product.priceCents,taxRate:product.taxRate||0,notes:''});renderContent();}
  function changeQuantity(index,delta){if(!state.cart[index])return;state.cart[index].quantity+=delta;if(state.cart[index].quantity<=0)state.cart.splice(index,1);renderContent();}

  async function submitPos(event){event.preventDefault();if(!navigator.onLine&&!state.development)return toast('Conéctate para procesar la operación.','warning');if(!state.cart.length)return;const form=new FormData(event.currentTarget);const tableId=form.get('tableId');const documentType=form.get('documentType')||'invoice';if(!tableId&&!state.capabilities.bill)return toast('Selecciona una mesa para enviar la comanda.','danger');const client=state.clients.find((item)=>item.id===form.get('clientId'));const input={items:state.cart.map((item)=>({...item})),clientId:client?.id||'',clientName:form.get('clientName')||client?.name||'Consumidor final',notes:form.get('notes'),priority:form.get('priority')};try{setBusy(event.submitter,true);if(tableId){await service.createOrder({...input,tableId});toast('Comanda enviada a cocina.','success');}else{const totals=calculateDocument(input.items);const method=form.get('paymentMethod');const isCredit=method==='credit';if(documentType==='invoice'&&!isCredit&&!state.activeCash)throw new Error('Abre una caja antes de registrar el cobro.');await service.createDirectDocument({...input,documentType,ncfType:form.get('ncfType'),payment:{amountCents:isCredit?0:totals.totalCents,method,cashSessionId:state.activeCash?.id||''}});toast('Documento creado correctamente.','success');}state.cart=[];renderContent();}catch(error){toast(error.message,'danger');}finally{setBusy(event.submitter,false);}}
  async function saveProduct(event){event.preventDefault();const f=new FormData(event.currentTarget);await perform(()=>service.saveProduct({id:f.get('id'),name:f.get('name'),sku:f.get('sku'),category:f.get('category'),priceCents:toCents(f.get('price')),costCents:toCents(f.get('cost')||0),taxRate:Number(f.get('taxRate')||0),stock:Number(f.get('stock')||0),active:f.get('active')==='on'}),'Producto guardado.',closeModal);}
  async function saveClient(event){event.preventDefault();const f=new FormData(event.currentTarget);await perform(()=>service.saveClient({id:f.get('id'),name:f.get('name'),rnc:f.get('rnc'),phone:f.get('phone'),email:f.get('email'),address:f.get('address'),active:f.get('active')==='on'}),'Cliente guardado.',closeModal);}
  async function saveUserAccess(event){event.preventDefault();const f=new FormData(event.currentTarget);if(!f.get('uid')&&f.get('password')!==f.get('passwordConfirm'))return toast('Las contraseñas no coinciden.','danger');await perform(()=>service.saveUserAccess({uid:f.get('uid'),displayName:f.get('displayName'),username:f.get('username'),password:f.get('password'),role:f.get('role'),active:f.get('active')==='on'}),f.get('uid')?'Acceso actualizado.':'Usuario creado correctamente.',closeModal);}
  async function submitPasswordChange(event){event.preventDefault();const f=new FormData(event.currentTarget);if(f.get('newPassword')!==f.get('newPasswordConfirm'))return toast('Las contraseñas nuevas no coinciden.','danger');await perform(()=>onChangePassword(f.get('currentPassword'),f.get('newPassword')),'Contraseña actualizada.',closeModal);}
  async function openCash(event){event.preventDefault();const f=new FormData(event.currentTarget);await perform(()=>service.openCashSession({openingCents:toCents(f.get('opening')),notes:f.get('notes')}),'Caja abierta.');}
  async function closeCash(event){event.preventDefault();const f=new FormData(event.currentTarget);await perform(()=>service.closeCashSession(state.activeCash.id,{closingCents:toCents(f.get('closing')),expectedCents:Number(f.get('expected')),notes:f.get('notes')}),'Caja cerrada.');}
  async function saveSettings(event){event.preventDefault();const f=Object.fromEntries(new FormData(event.currentTarget));f.defaultTaxRate=Number(f.defaultTaxRate||0);await perform(()=>service.saveSettings(f),'Configuración guardada.');state.settings={...state.settings,...f};}
  async function cancelOrder(){const reason=prompt('Motivo de cancelación de la comanda:');if(!reason||reason.trim().length<3)return;await perform(()=>service.transitionOrder(state.selectedOrderId,'cancelled','cancelled'),'Comanda cancelada.',closeModal);}
  async function cancelInvoice(){const reason=prompt('Motivo de anulación de la factura:');if(!reason||reason.trim().length<3)return;await perform(()=>service.cancelInvoice(state.selectedInvoiceId,reason),'Factura anulada.',closeModal);}
  async function submitPayment(event){event.preventDefault();if(!state.activeCash)return toast('Abre una caja antes de registrar el cobro.','danger');const invoice=state.invoices.find((item)=>item.id===state.selectedInvoiceId);const f=new FormData(event.currentTarget);const amount=toCents(f.get('amount'));const balance=invoice.totalCents-invoice.paidCents;if(amount>balance)return toast('El pago supera el balance.','danger');await perform(()=>service.recordPayment(invoice.id,{amountCents:amount,method:f.get('method'),reference:f.get('reference'),cashSessionId:state.activeCash.id}),'Cobro registrado.',closeModal);}
  async function submitCharge(event){event.preventDefault();const order=state.orders.find((item)=>item.id===state.selectedOrderId);const f=new FormData(event.currentTarget);const method=f.get('method');if(method!=='credit'&&!state.activeCash)return toast('Abre una caja antes de registrar el cobro.','danger');await perform(()=>service.chargeOrder(order.id,{amountCents:method==='credit'?0:order.totalCents,method,ncfType:f.get('ncfType'),reference:f.get('reference'),cashSessionId:state.activeCash?.id||''}),'Mesa cobrada y cerrada.',closeModal);}

  function openOrder(id){if(!id)return;state.selectedOrderId=id;state.modal='order';renderModal();}
  function openInvoice(id){state.selectedInvoiceId=id;state.modal='invoice';renderModal();}
  function openForm(type,id=''){state.editingId=id;state.modal=type;renderModal();}
  function openUserForm(id=''){state.editingUser=id?state.users.find((item)=>item.id===id):{};state.modal='user';renderModal();}
  function closeModal(){state.modal='';state.editingId='';renderModal();}
  function paymentModal(){const invoice=state.invoices.find((item)=>item.id===state.selectedInvoiceId);const balance=invoice.totalCents-invoice.paidCents;return formModal('payment-form','Registrar cobro',`<div class="payment-amount"><span>Balance pendiente</span><strong>${formatMoney(balance)}</strong></div><label>Monto<input name="amount" type="number" min="0.01" max="${balance/100}" step="0.01" value="${balance/100}" required></label>${paymentFields()}`,'Guardar cobro');}
  function chargeModal(){const order=state.orders.find((item)=>item.id===state.selectedOrderId);return formModal('charge-form','Cobrar mesa',`<div class="payment-amount"><span>Total de ${escapeHtml(order.tableName)}</span><strong>${formatMoney(order.totalCents)}</strong></div>${paymentFields()}${ncfField()}`,'Cobrar y cerrar');}
  function passwordModal(){return formModal('password-change-form','Cambiar mi contraseña','<label>Contraseña actual<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>Nueva contraseña<input name="newPassword" type="password" minlength="8" autocomplete="new-password" required></label><label>Confirmar nueva contraseña<input name="newPasswordConfirm" type="password" minlength="8" autocomplete="new-password" required></label>','Actualizar contraseña');}
  function paymentFields(){return `<div class="form-grid two"><label>Forma de pago<select name="method"><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="check">Cheque</option><option value="credit">Crédito</option></select></label><label>Referencia<input name="reference" maxlength="120"></label></div>`;}
  function ncfField(){return `<label>Comprobante fiscal<select name="ncfType"><option value="">Sin NCF</option><option value="B02">Consumidor B02</option><option value="B01">Crédito fiscal B01</option><option value="B14">Régimen especial B14</option><option value="B15">Gubernamental B15</option></select></label>`;}
  function formModal(id,title,body,submit){return `<div class="modal-backdrop" data-modal-close><form id="${id}" class="modal-card form-modal" data-modal-card><header><div><span class="eyebrow">Operación segura</span><h2>${title}</h2></div><button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button></header><div class="stack-form">${body}</div><footer class="modal-actions"><button type="button" class="button secondary" data-modal-close>Cancelar</button><button class="button primary" type="submit">${submit}</button></footer></form></div>`;}
  async function perform(task,success,after){try{await task();toast(success,'success');after?.();}catch(error){console.error(error);toast(error.message||'No se pudo completar la operación.','danger');}}
  function toast(message,tone='info'){const target=root.querySelector('#toast-root');if(!target)return;const item=document.createElement('div');item.className=`toast ${tone}`;item.textContent=message;target.appendChild(item);setTimeout(()=>item.remove(),4000);}
  function setBusy(button,busy){if(!button)return;button.disabled=busy;button.classList.toggle('loading',busy);}
  function filterCards(event){const term=event.target.value.trim().toLowerCase();root.querySelectorAll('[data-product-add]').forEach((item)=>item.hidden=!item.dataset.search.includes(term));}
  function filterDirectory(event){const term=event.target.value.trim().toLowerCase();root.querySelectorAll('[data-directory-row]').forEach((item)=>item.hidden=!item.dataset.search.includes(term));}
  function filterInvoiceRows(){const term=root.querySelector('#invoice-search')?.value.trim().toLowerCase()||'';const status=root.querySelector('#invoice-status-filter')?.value||'';root.querySelectorAll('[data-invoice-row]').forEach((item)=>item.hidden=!item.dataset.search.includes(term)||(status&&item.dataset.status!==status));}
  function updatePosFields(){const form=root.querySelector('#pos-checkout-form');if(!form)return;const table=Boolean(form.elements.tableId?.value);const type=form.elements.documentType?.value||'invoice';form.querySelector('.restaurant-fields')?.toggleAttribute('hidden',!table);form.querySelector('.document-type-field')?.toggleAttribute('hidden',table);form.querySelector('.direct-payment-fields')?.toggleAttribute('hidden',table||type!=='invoice');const button=form.querySelector('[type=submit]');if(button)button.lastChild.textContent=table?' Enviar a cocina':type==='quote'?' Crear cotización':type==='proforma'?' Crear proforma':' Procesar venta';}
  function updateConnection(){const online=navigator.onLine;const banner=root.querySelector('#offline-banner');if(banner)banner.hidden=online;root.querySelector('#connection-indicator')?.classList.toggle('offline',!online);}
  function iconsRefresh(){createIcons({icons,attrs:{'aria-hidden':'true'}});}
  function destroy(){destroyed=true;service.destroy();window.removeEventListener('online',updateConnection);window.removeEventListener('offline',updateConnection);root.innerHTML='';}
  start().catch((error)=>{root.innerHTML=`<div class="fatal-state"><h1>No pudimos iniciar el sistema</h1><p>${escapeHtml(error.message)}</p><button class="button primary" onclick="location.reload()">Reintentar</button></div>`;});
  return { destroy, state };
}

function initialRoute(user){const allowed=allowedNavigation(user);return allowed.includes(location.hash.slice(1))?location.hash.slice(1):allowed[0]||'dashboard';}
function roleLabel(role){return({owner:'Propietario',manager:'Gerencia',cashier:'Caja',waiter:'Camarero',kitchen:'Cocina'})[role]||'Usuario';}
