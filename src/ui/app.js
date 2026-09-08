import {
  createIcons, AlertTriangle, BadgeCheck, BadgeDollarSign, Banknote, Barcode, Beer, Bell, Bike, BookOpen, Cake, Calculator, Calendar,
  CalendarX, ChartNoAxesCombined, Check, CheckCircle2, CheckSquare, ChefHat, ChevronDown, CircleDollarSign, ClipboardCheck, ClipboardPen, Clock3, Coffee, Cpu, CreditCard, Download, Eye,
  FileCheck2, FileSpreadsheet, Flame, Globe, History, KeyRound, Landmark, Layers, LayoutDashboard, Lock, LogOut, Menu,
  MessageSquare, MessageSquarePlus, MessageSquareWarning, Minus, Monitor, Moon, Package, PackageOpen, PanelLeftClose, PanelLeftOpen,
  Pencil, Phone, Plus, Printer, QrCode, Radio, Receipt, ReceiptText, RefreshCw, Salad, Sandwich, Save, ScanBarcode,
  Search, Send, Settings, Sheet, ShieldAlert, ShieldCheck, ShoppingBasket, ShoppingCart, SlidersHorizontal,
  Smartphone, Sparkles, Star, Timer, Trash2, TrendingDown, TrendingUp, Truck, Usb, UserPlus, Users, Utensils, Volume2,
  Wallet, WalletCards, Wheat, Wifi, WifiOff, X
} from 'lucide';
import { can, allowedNavigation, primaryRole } from '../domain/roles.js';
import { calculateDocument, toCents } from '../domain/billing.js';
import { renderCartLines, renderCartTotals, renderDashboard, renderKds, renderOrderDrawer, renderPos, renderTables } from '../modules/operations.js';
import { exportReport, renderInvoiceModal, renderInvoices, renderReports } from '../modules/billing.js';
import { renderReceivables, renderFiaoPayModal } from '../modules/receivables.js';
import { renderDeliveries, renderDriverFormModal, renderDeliverySettleModal } from '../modules/deliveries.js';
import { renderWhatsApp, bindWhatsAppEvents } from '../modules/whatsapp.js';
import { renderClientForm, renderClients, renderProductForm, renderProducts, renderStockAdjustModal, renderEndDayWasteModal } from '../modules/directory.js';
import { getInventoryReason } from '../domain/inventory.js';
import { renderPayroll, renderEmployeeFormModal, renderPayrollPaymentModal } from '../modules/payroll.js';
import { calculatePayrollNetCents } from '../domain/payroll.js';
import { renderCash, renderSettings, renderUserForm, renderUsers, renderTerminalDiag, renderAuditLogs } from '../modules/administration.js';
import { escapeHtml, formatMoney } from '../lib/format.js';
import { createOperationId } from '../lib/id.js';
import { affectsCurrentView } from '../lib/live-view.js';
import {
  openCashDrawerHardware, buildInvoiceEscPos, buildInvoicePlainText, buildKitchenEscPos, buildKitchenPlainText,
  buildCashReportEscPos, buildCashReportPlainText, buildPrebillEscPos, buildPrebillPlainText,
  buildDeliverySettlementEscPos, buildDeliverySettlementPlainText, buildPayrollReceiptEscPos, buildPayrollReceiptPlainText,
  sendEscPosToPrinter, EscPosBuilder, checkEloNativeServer,
  calculateClientTotalDebt,

  startEloScanner, stopEloScanner, setVFDMessage, clearVFD, vfdWelcome,
  beepHardware, getHardwareStatus, checkPaperStatus, sendEloCommand,
  getEloUpdateStatus, checkEloAppUpdate, installEloAppUpdate, openEloUpdatePermission
} from '../lib/hardware.js';
import { bindPinPad, renderPinPadHtml } from '../lib/pin-pad.js';
import { updateForms, updateSafety } from '../lib/update-safety.js';
import { setupTouchNumericInputs } from '../lib/touch-numpad.js';

const NAV = [
  ['dashboard','layout-dashboard','Resumen'], ['pos','shopping-cart','Punto de venta'], ['tables','utensils','Mesas'],
  ['kds','chef-hat','Cocina KDS'], ['invoices','receipt-text','Facturación'], ['receivables','book-open','Fiao / Por Cobrar'],
  ['deliveries','bike','Deliveries'], ['clients','users','Clientes'],
  ['products','package','Productos'], ['whatsapp','smartphone','Bot WhatsApp'], ['cash','wallet-cards','Caja'],
  ['payroll','badge-dollar-sign','Nómina y Personal'],
  ['reports','chart-no-axes-combined','Reportes'],
  ['users','user-plus','Usuarios'], ['audit','shield-check','Auditoría'], ['terminal','cpu','Terminal ELO'], ['settings','settings','Configuración']
];

const icons = {
  AlertTriangle, BadgeCheck, BadgeDollarSign, Banknote, Barcode, Beer, Bell, Bike, BookOpen, Cake, Calculator, Calendar, ChartNoAxesCombined, Check, ChefHat,
  ChevronDown, CircleDollarSign, Clock3, Coffee, Cpu, CreditCard, Download, Eye, FileCheck2, FileSpreadsheet, Flame, Globe, KeyRound, Landmark,
  Layers, LayoutDashboard, Lock, LogOut, Menu, MessageSquare, MessageSquarePlus, MessageSquareWarning, Minus, Monitor, Package, PackageOpen, PanelLeftClose, PanelLeftOpen,
  Pencil, Phone, Plus, Printer, QrCode, Radio, Receipt, ReceiptText, RefreshCw, Salad, Sandwich, Save, ScanBarcode, Search, Send, Settings, Sheet,
  ShieldAlert, ShieldCheck, ShoppingBasket, ShoppingCart, SlidersHorizontal, Smartphone, Sparkles, Star, Timer, Trash2, TrendingDown, TrendingUp, Usb, UserPlus, Users,
  Utensils, Volume2, Wallet, WalletCards, Wheat, Wifi, WifiOff, X
};

// Desenfocar controles interactivos tras el clic para que no retengan foco en pantalla táctil
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const interactive = e.target?.closest?.('button, [role="button"], a, .category-pill, .pos-category-pill, .product-card, .restaurant-table, .pin-num-btn, .pin-clear-btn, .pin-del-btn, .kds-action-btn, .quick-cash-btn, .pos-bill-btn');
    if (interactive && typeof interactive.blur === 'function') {
      setTimeout(() => interactive.blur(), 0);
    }
  }, { passive: true });

  // Desplazamiento inteligente cuando se despliega el teclado del sistema para campos de texto
  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (!target || !['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
    if (target.readOnly || target.getAttribute('inputmode') === 'none' || target.type === 'hidden') return;

    const modalBackdrop = target.closest('.modal-backdrop');
    const modalCard = target.closest('.modal-card');
    if (modalBackdrop) modalBackdrop.classList.add('keyboard-active');
    if (modalCard) modalCard.classList.add('keyboard-active');

    // Desplazar el elemento al centro visible tras la animación del teclado de Android (220ms)
    setTimeout(() => {
      try {
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      } catch (_) {
        target.scrollIntoView(true);
      }
    }, 220);
  }, { passive: true });

  document.addEventListener('focusout', () => {
    setTimeout(() => {
      const active = document.activeElement;
      const stillInText = active && ['INPUT', 'TEXTAREA'].includes(active.tagName) && !active.readOnly && active.getAttribute('inputmode') !== 'none';
      if (!stillInText) {
        document.querySelectorAll('.keyboard-active').forEach(el => el.classList.remove('keyboard-active'));
      }
    }, 150);
  }, { passive: true });
}

export function createApplication({ root, user, service, onLogout, onChangePassword, development = false }) {
  const managementMode = !window.EloPOS && new URLSearchParams(location.search).get('mode') === 'management';
  const state = {
    user, settings: {}, route: initialRoute(user), cart: [], selectedOrderId: '', selectedInvoiceId: '', preselectedTableId: '', modal: '',
    hardwareStatus: null, updateStatus: getEloUpdateStatus(), scannerActive: false, checkoutOpening: false, saleInProgress: false, pendingLiveRender: false, pendingPinDestination: '', mobileReportPeriod: 'day', posDiscountState: { discount: 0, discountType: 'amount', includeLegalTip: false }, posDraft: {}, posSearch: '', posCategory: 'Todos', posPaymentMethod: 'cash',
    sidebarCollapsed: typeof localStorage !== 'undefined' && localStorage.getItem('panitas_sidebar_collapsed') === '1',
    products: [], clients: [], tables: [], orders: [], invoices: [], payments: [], cashSessions: [], cashMovements: [], users: [], auditLogs: [], deliveryDrivers: [], selectedDeliveryDriver: null, selectedDeliveryInvoices: [], editingDriver: null, whatsappBot: null, development,
    inventoryMovements: [], productsTab: 'catalog', editingStockProduct: null,
    employees: [], payrollPayments: [], payrollTab: 'payments', editingEmployee: null, payingEmployeeId: null,
    capabilities: {
      bill: can(user, 'billing:create'), cancelInvoice: can(user, 'billing:cancel'), chargeOrder: can(user, 'orders:charge'),
      createOrder: can(user, 'orders:create'), updateOrder: can(user, 'orders:update'), serveOrder: can(user, 'orders:serve'),
      kitchenOrder: can(user, 'orders:kitchen'), viewKds: can(user, 'kds:view'), manageCatalog: can(user, 'catalog:*'), manageClients: can(user, 'clients:*'), manageUsers: can(user, 'users:manage'),
      cashDrawer: !managementMode && (can(user, 'billing:create') || can(user, 'orders:charge') || can(user, 'cash:*'))
    }
  };
  let destroyed = false;
  let disposePinPad = () => {};
  let drawerInProgress = false;
  let previousKdsOrders = new Set();
  let hardwarePollId = null;
  let hardwarePollInFlight = false;
  const busyButtons = new Map();
  let cashFormInProgress = false;
  let movementAttempt = null;
  updateSafety.setBlocker('application', true);

  async function start() {
    state.settings = await service.loadSettings();
    // Una sesión de caja representa dinero físico. Nunca se crea por iniciar sesión o
    // reiniciar la terminal: el cajero debe abrirla explícitamente con su fondo inicial.
    service.watchAll({
      products: update('products'), clients: update('clients'), tables: update('tables'), orders: updateOrders,
      invoices: update('invoices'), payments: update('payments'), cashSessions: update('cashSessions'),
      cashMovements: update('cashMovements'), users: update('users'), auditLogs: update('auditLogs'),
      deliveryDrivers: update('deliveryDrivers'),
      inventoryMovements: update('inventoryMovements'),
      employees: update('employees'),
      payrollPayments: update('payrollPayments')
    });
    service.watchWhatsAppBot?.((botData) => {
      state.whatsappBot = botData;
      if (state.route === 'whatsapp') {
        requestLiveRender();
      }
    });
    render();
    syncNativeUpdateState();
    // The management app has no printer/drawer bridge to poll every eight seconds.
    if (!window.EloPOS && new URLSearchParams(location.search).get('mode') === 'management') return;
    getHardwareStatus().then((status) => {
      if (!destroyed && status?.ok) {
        state.hardwareStatus = status;
        state.scannerActive = Boolean(status.scannerActive);
        requestLiveRender();
      }
    }).catch(() => {});

    hardwarePollId = setInterval(async () => {
      if (destroyed || hardwarePollInFlight || state.saleInProgress) return;
      hardwarePollInFlight = true;
      try {
        const st = await getHardwareStatus();
        if (st && st.ok) {
          const prevOut = state.hardwareStatus?.paperOut;
          state.hardwareStatus = st;
          if (st.paperOut && !prevOut) {
            toast('⚠️ ¡ALERTA: La impresora se ha quedado sin papel térmico! Por favor coloca un rollo nuevo de 80mm.', 'danger', 10000);
            beepHardware('error').catch(() => {});
          }
          if (state.route === 'pos' && (st.paperOut !== prevOut)) {
            requestLiveRender();
          }
        }
      } catch {} finally {
        hardwarePollInFlight = false;
      }
    }, 8000);
  }

  function update(key) { return (items, error) => {
    if (error) toast(`No se pudo sincronizar ${key}.`, 'danger');
    state[key] = items;
    if (affectsCurrentView(state.route, key, state.modal)) requestLiveRender();
  }; }

  let liveRenderRaf = null;
  function requestLiveRender() {
    if (destroyed) return;
    if (liveRenderRaf !== null) return;
    const scheduleFn = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
    liveRenderRaf = scheduleFn(() => {
      liveRenderRaf = null;
      if (destroyed) return;
      const active = document.activeElement;
      const editingField = active && root.contains(active) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
      const modalFormOpen = Boolean(root.querySelector('#modal-root form'));
      if (state.saleInProgress || editingField || modalFormOpen || updateForms.isDirty(root)) {
        state.pendingLiveRender = true;
        return;
      }
      state.pendingLiveRender = false;
      renderContent();
    });
  }

  function flushPendingLiveRender() {
    setTimeout(() => {
      if (!state.pendingLiveRender || destroyed) return;
      const active = document.activeElement;
      const stillEditing = active && root.contains(active) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
      if (!stillEditing && !root.querySelector('#modal-root form') && !updateForms.isDirty(root)) requestLiveRender();
    }, 0);
  }

  function updateOrders(items, error) {
    if (error) toast('No se pudo sincronizar comandas.', 'danger');
    const newItems = Array.isArray(items) ? items : [];
    const pendingOrders = newItems.filter(o => o.status === 'pending');
    if (pendingOrders.some(o => !previousKdsOrders.has(o.id))) {
      if (state.route === 'kds' || state.route === 'pos') {
        beepHardware('warning').catch(() => {});
      }
    }
    previousKdsOrders = new Set(newItems.map(o => o.id));
    state.orders = newItems;
    if (affectsCurrentView(state.route, 'orders', state.modal)) requestLiveRender();
  }

  function activeCash() {
    // Una caja pertenece al usuario que la abrió. Usar el turno de otra cuenta provoca que
    // Firestore rechace el pago y hace que el botón Cobrar parezca no responder.
    const watched = state.cashSessions.find((item) => item.status === 'open' && item.openedBy === user.uid);
    if (watched) return watched;
    if (state.activeCash?.optimistic && state.activeCash.status === 'open' && state.activeCash.openedBy === user.uid) return state.activeCash;
    return null;
  }

  function render() {
    root.innerHTML = `<div class="app-shell ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''}">
      <aside class="sidebar ${state.sidebarCollapsed ? 'collapsed' : ''}">
        <div class="sidebar-top-bar">
          <a class="brand" href="#dashboard" data-route="dashboard">
            <img src="/logo.png" alt="Logo de Los Panitas by Nechy">
            <div class="brand-text"><strong>Los Panitas</strong><span>by Nechy · POS</span></div>
          </a>
          <button type="button" class="sidebar-collapse-btn" data-sidebar-toggle title="Contraer o expandir barra lateral" aria-label="Contraer o expandir menú">
            <i data-lucide="${state.sidebarCollapsed ? 'panel-left-open' : 'panel-left-close'}"></i>
          </button>
        </div>
        <nav>${allowedNavigation(user).map((id) => { const entry=NAV.find((item)=>item[0]===id); return `<button data-route="${id}" class="${state.route===id?'active':''}" title="${entry[2]}"><i data-lucide="${entry[1]}"></i><span>${entry[2]}</span></button>`; }).join('')}</nav>
        <div class="sidebar-footer">
          <div class="user-card"><span>${escapeHtml((user.displayName||user.username||'?').charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(user.displayName||user.username)}</strong><small>${roleLabel(primaryRole(user))}</small></div></div>
          ${state.capabilities.cashDrawer ? `<button class="drawer-kick-btn" style="width:100%;justify-content:center;" data-drawer-kick><i data-lucide="wallet"></i> <span>Abrir gaveta</span></button>` : ''}
          <button class="logout-button" data-password><i data-lucide="key-round"></i> <span>Contraseña y PIN</span></button>
          <button class="logout-button" data-logout><i data-lucide="log-out"></i> <span>Cerrar sesión</span></button>
        </div>
      </aside>
      <header class="mobile-header">
        <button class="icon-button" data-menu aria-label="Menú"><i data-lucide="menu"></i></button>
        <a class="brand" data-route="dashboard"><img src="/logo.png" alt="Logo de Los Panitas by Nechy"><strong>Los Panitas</strong></a>
        <div class="header-actions">
          ${state.capabilities.cashDrawer ? `<button class="drawer-kick-btn" data-drawer-kick><i data-lucide="wallet"></i> Gaveta</button>` : ''}
          <span class="connection-status" id="connection-indicator"><i data-lucide="wifi"></i></span>
        </div>
      </header>
      <main>
        <div id="offline-banner" class="offline-banner" hidden><i data-lucide="wifi-off"></i> Sin conexión. Puedes consultar datos guardados, pero las operaciones están pausadas.</div>
        <div id="app-update-banner" class="app-update-banner" hidden>
          <i data-lucide="refresh-cw"></i><span data-update-banner-message></span>
          <button type="button" class="button compact" data-update-banner-action></button>
        </div>
        <div id="main-content" class="main-content"></div>
      </main>
      <div id="modal-root"></div>
      <div id="toast-root" class="toast-root" aria-live="assertive"></div>
    </div>`;
    bindShell(); renderContent(); updateConnection(); refreshUpdateBanner();
  }

  function renderContent() {
    if (!root.querySelector('#main-content')) return;
    state.activeCash = activeCash();
    const renderers = {
      dashboard: renderDashboard, pos: renderPos, tables: renderTables, kds: renderKds,
      invoices: renderInvoices, receivables: renderReceivables, deliveries: renderDeliveries, clients: renderClients, products: renderProducts,
      whatsapp: renderWhatsApp, cash: renderCash, payroll: renderPayroll, reports: renderReports, users: renderUsers, audit: renderAuditLogs,
      terminal: () => renderTerminalDiag(), settings: renderSettings
    };
    const renderer = renderers[state.route] || renderDashboard;
    const mainEl = root.querySelector('#main-content');
    mainEl.innerHTML = renderer(state);
    if (state.modal) {
      renderModal();
    } else {
      const modalRoot = root.querySelector('#modal-root');
      if (modalRoot && modalRoot.innerHTML) {
        modalRoot.innerHTML = '';
        disposePinPad();
        disposePinPad = () => {};
      }
    }
    bindContent(); iconsRefresh(mainEl); syncNativeUpdateState(); setupTouchNumericInputs(mainEl);
    if (state.route === 'terminal') initTerminalDiag();
    if (state.route === 'whatsapp') bindWhatsAppEvents(state, root, service, toast);
  }

  function renderModal() {
    disposePinPad();
    disposePinPad = () => {};
    const modalRoot = root.querySelector('#modal-root');
    if (!modalRoot) return;
    if (state.modal === 'product') modalRoot.innerHTML = renderProductForm(state.products.find((item)=>item.id===state.editingId));
    else if (state.modal === 'client') modalRoot.innerHTML = renderClientForm(state.clients.find((item)=>item.id===state.editingId) || state.editingClientDraft || {});
    else if (state.modal === 'order') modalRoot.innerHTML = renderOrderDrawer(state.orders.find((item)=>item.id===state.selectedOrderId), state.capabilities);
    else if (state.modal === 'invoice') modalRoot.innerHTML = renderInvoiceModal(state.invoices.find((item)=>item.id===state.selectedInvoiceId), state.payments, state.capabilities);
    else if (state.modal === 'payment') modalRoot.innerHTML = paymentModal();
    else if (state.modal === 'charge') modalRoot.innerHTML = chargeModal();
    else if (state.modal === 'quickCash') modalRoot.innerHTML = quickCashModal();
    else if (state.modal === 'cashMovement') modalRoot.innerHTML = cashMovementModal();
    else if (state.modal === 'cashClose') modalRoot.innerHTML = cashCloseModal();
    else if (state.modal === 'drawerPin') modalRoot.innerHTML = drawerPinModal();
    else if (state.modal === 'checkoutPin') modalRoot.innerHTML = checkoutPinModal();
    else if (state.modal === 'setupCheckoutPin') modalRoot.innerHTML = setupCheckoutPinModal();
    else if (state.modal === 'saleSuccess') modalRoot.innerHTML = saleSuccessModal();
    else if (state.modal === 'fiaoPay') modalRoot.innerHTML = renderFiaoPayModal(state.selectedFiaoInvoice, state.activeCash);
    else if (state.modal === 'driverForm') modalRoot.innerHTML = renderDriverFormModal(state.editingDriver);
    else if (state.modal === 'deliverySettle') modalRoot.innerHTML = renderDeliverySettleModal(state.selectedDeliveryDriver, state.selectedDeliveryInvoices || [], state.activeCash);
    else if (state.modal === 'employeeForm') modalRoot.innerHTML = renderEmployeeFormModal(state.editingEmployee);
    else if (state.modal === 'payrollPayment') modalRoot.innerHTML = renderPayrollPaymentModal({ employees: state.employees, selectedEmployeeId: state.payingEmployeeId, activeCash: state.activeCash });
    else if (state.modal === 'itemNote') modalRoot.innerHTML = itemNoteModal();
    else if (state.modal === 'quantity') modalRoot.innerHTML = quantityModal();
    else if (state.modal === 'user') modalRoot.innerHTML = renderUserForm(state.editingUser);
    else if (state.modal === 'password') modalRoot.innerHTML = passwordModal();
    else if (state.modal === 'cancelOrder') modalRoot.innerHTML = cancellationModal('order');
    else if (state.modal === 'cancelInvoice') modalRoot.innerHTML = cancellationModal('invoice');
    else if (state.modal === 'stockAdjust') modalRoot.innerHTML = renderStockAdjustModal(state.editingStockProduct || {});
    else if (state.modal === 'endDayWaste') modalRoot.innerHTML = renderEndDayWasteModal(state.products || []);
    else modalRoot.innerHTML = '';
    iconsRefresh(modalRoot); bindModal(); syncNativeUpdateState(); setupTouchNumericInputs(modalRoot);
  }

  function bindShell() {
    root.querySelectorAll('[data-route]').forEach((button)=>button.addEventListener('click',()=>route(button.dataset.route)));
    root.querySelector('[data-logout]')?.addEventListener('click', onLogout);
    root.querySelector('[data-password]')?.addEventListener('click',()=>{state.modal='password';renderModal();});
    root.querySelector('[data-menu]')?.addEventListener('click',()=>root.querySelector('.sidebar').classList.toggle('open'));
    root.querySelectorAll('[data-drawer-kick]').forEach((btn)=>btn.addEventListener('click', promptDrawerPin));
    root.querySelectorAll('[data-quick-open-cash]').forEach((btn)=>btn.addEventListener('click', () => { state.modal = 'quickCash'; renderModal(); }));
    root.querySelectorAll('[data-cash-movement-open]').forEach((btn)=>btn.addEventListener('click', () => { state.modal = 'cashMovement'; renderModal(); }));
    root.querySelectorAll('[data-cash-close-open]').forEach((btn)=>btn.addEventListener('click', () => { state.modal = 'cashClose'; renderModal(); }));
    root.querySelectorAll('[data-sidebar-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        try { localStorage.setItem('panitas_sidebar_collapsed', state.sidebarCollapsed ? '1' : '0'); } catch {}
        const sb = root.querySelector('.sidebar');
        const sh = root.querySelector('.app-shell');
        if (sb) sb.classList.toggle('collapsed', state.sidebarCollapsed);
        if (sh) sh.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
        btn.innerHTML = `<i data-lucide="${state.sidebarCollapsed ? 'panel-left-open' : 'panel-left-close'}"></i>`;
        iconsRefresh(btn);
      });
    });
    root.querySelector('[data-update-banner-action]')?.addEventListener('click', handleUpdateBannerAction);
    window.addEventListener('online', updateConnection); window.addEventListener('offline', updateConnection);
    root.removeEventListener('focusout', flushPendingLiveRender);
    root.addEventListener('focusout', flushPendingLiveRender);

    // Los listeners son estables y se reemplazan al reconstruir la interfaz. Esto evita que
    // cada navegación duplique un escaneo o una lectura de tarjeta.
    window.removeEventListener('elo-scan', handleEloScanEvent);
    window.removeEventListener('elo-msr', handleEloMsrEvent);
    window.removeEventListener('elo-update-status', handleEloUpdateStatus);
    window.addEventListener('elo-scan', handleEloScanEvent);
    window.addEventListener('elo-msr', handleEloMsrEvent);
    window.addEventListener('elo-update-status', handleEloUpdateStatus);
  }

  function handleEloScanEvent(event) {
    const code = event.detail?.code;
    if (code) handleBarcodeScan(code);
  }

  function handleEloMsrEvent(event) {
    const { name, pan } = event.detail || {};
    if (!name) return;
    toast(`Tarjeta deslizada: ${name} (${pan || 'MSR'})`, 'info');
    beepHardware('ok').catch(() => {});
    state.posPaymentMethod = 'card';
    const paymentMethod = root.querySelector('#pos-payment-method');
    if (paymentMethod) paymentMethod.value = 'card';
    const referenceInput = root.querySelector('#pos-card-reference');
    if (referenceInput && pan) referenceInput.value = pan;
    root.querySelectorAll('[data-pos-method]').forEach((button) => button.classList.toggle('active', button.dataset.posMethod === 'card'));
    updatePosFields();
    capturePosDraft();
  }

  function handleBarcodeScan(rawCode) {
    const code = String(rawCode || '').trim();
    if (!code) return;
    const lowerCode = code.toLowerCase();
    const product = state.products.find(p =>
      p.active !== false && (
        (p.sku && p.sku.toLowerCase() === lowerCode) ||
        (p.id && p.id.toLowerCase() === lowerCode) ||
        (p.name && p.name.toLowerCase() === lowerCode)
      )
    );

    if (product) {
      addProduct(product.id);
      beepHardware('ok');
      toast(`+1 ${product.name}`, 'success');
      const totals = calculateDocument(state.cart);
      setVFDMessage(product.name.slice(0, 20), `TOT: ${formatMoney(totals.totalCents)}`);
    } else {
      beepHardware('error');
      toast(`Código "${code}" no encontrado en catálogo.`, 'warning');
    }
  }

  function bindContent() {
    root.querySelector('[data-personal-settings]')?.addEventListener('click', () => { state.modal = 'password'; renderModal(); });
    root.querySelectorAll('#main-content [data-route]').forEach((button)=>button.addEventListener('click',()=>route(button.dataset.route)));
    root.querySelector('[data-refresh]')?.addEventListener('click',()=>renderContent());
    root.querySelectorAll('[data-product-add]').forEach((button)=>button.addEventListener('click',()=>addProduct(button.dataset.productAdd)));
    root.querySelectorAll('[data-mobile-period]').forEach((button) => button.addEventListener('click', () => {
      state.mobileReportPeriod = button.dataset.mobilePeriod;
      renderContent();
    }));
    root.querySelectorAll('[data-mobile-inventory-step]').forEach((button) => button.addEventListener('click', () => {
      const form = button.closest('[data-mobile-inventory-form]');
      const input = form?.querySelector('[data-mobile-stock-input]');
      if (!input) return;
      const next = Math.max(0, Math.round((Number(input.value || 0) + Number(button.dataset.mobileInventoryStep || 0)) * 1000) / 1000);
      input.value = String(next);
    }));
    root.querySelectorAll('[data-mobile-inventory-form]').forEach((form) => form.addEventListener('submit', saveMobileInventory));
    root.querySelectorAll('[data-cart-qty]').forEach((button)=>button.addEventListener('click',()=>changeQuantity(Number(button.dataset.cartQty),Number(button.dataset.delta))));
    root.querySelector('[data-cart-clear]')?.addEventListener('click',()=>{
      state.cart=[];
      resetPosDraft();
      renderContent();
      vfdWelcome(state.settings?.name || 'Los Panitas');
    });

    // Filtro rápido por categorías en el POS
    root.querySelectorAll('[data-cat-filter]').forEach((pill) => {
      pill.addEventListener('click', () => {
        const cat = pill.dataset.catFilter;
        state.posCategory = cat;
        root.querySelectorAll('[data-cat-filter]').forEach((p) => {
          const isMatch = p.dataset.catFilter === cat;
          p.classList.toggle('active', isMatch);
          p.style.borderColor = isMatch ? 'var(--brand-2)' : 'var(--line)';
          p.style.background = isMatch ? 'rgba(215,154,60,.15)' : 'rgba(255,255,255,.04)';
          p.style.color = isMatch ? 'var(--brand-2)' : '#ccc';
        });
        const query = (root.querySelector('#product-search')?.value || '').toLowerCase().trim();
        let visibleCount = 0;
        root.querySelectorAll('#pos-products .product-card').forEach((card) => {
          const cardSearch = (card.dataset.search || '').toLowerCase();
          const cardCat = card.dataset.category || 'General';
          const matchesCat = cat === 'Todos' || cardCat === cat;
          const matchesQuery = !query || cardSearch.includes(query);
          const isVisible = matchesCat && matchesQuery;
          card.hidden = !isVisible;
          if (isVisible) visibleCount++;
        });
        const emptyState = root.querySelector('#pos-no-matches');
        if (emptyState) emptyState.hidden = visibleCount > 0;
      });
    });

    // Soporte para búsqueda y lector de códigos en el campo de texto
    const searchInput = root.querySelector('#product-search');
    if (searchInput) {
      searchInput.addEventListener('input', (event) => {
        state.posSearch = event.target.value;
        filterCards(event);
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = searchInput.value.trim();
          if (val) {
            state.posSearch = '';
            handleBarcodeScan(val);
            searchInput.value = '';
            filterCards({ target: searchInput });
          }
        }
      });
    }

    // Botón de activación/apagado de escáner en el toolbar
    root.querySelector('#pos-scan-toggle')?.addEventListener('click', async () => {
      state.scannerActive = !state.scannerActive;
      if (state.scannerActive) {
        await startEloScanner();
        toast('Láser de escáner encendido.', 'info');
      } else {
        await stopEloScanner();
        toast('Láser de escáner apagado.', 'info');
      }
      renderContent();
    });

    root.querySelectorAll('[data-print-cart-prebill]').forEach((btn)=>btn.addEventListener('click',printCartPrebill));
    root.querySelectorAll('[data-check-paper]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const res = await checkPaperStatus();
        btn.disabled = false;
        if (res && res.ok) {
          state.hardwareStatus = { ...(state.hardwareStatus || {}), ...res };
          if (res.paperStatus === 'unsupported') {
            toast('La impresora está conectada, pero este modelo no permite confirmar el papel por sensor. Revisa el rollo visualmente.', 'warning');
          } else if (res.paperOut) {
            toast('⚠️ El sensor aún detecta que la impresora no tiene papel.', 'danger');
            beepHardware('error');
          } else {
            toast('✓ ¡Papel térmico de 80mm detectado correctamente!', 'success');
            beepHardware('ok');
          }
          renderContent();
        } else {
          toast('Verificando sensor de papel...', 'info');
          const st = await getHardwareStatus();
          if (st) state.hardwareStatus = st;
          renderContent();
        }
      });
    });
    root.querySelectorAll('[data-cart-item-note]').forEach((btn)=>btn.addEventListener('click',()=>openItemNoteModal(Number(btn.dataset.cartItemNote))));
    root.querySelectorAll('[data-cart-set-qty]').forEach((btn)=>btn.addEventListener('click',()=>openQuantityModal(Number(btn.dataset.cartSetQty))));
    root.querySelector('#pos-discount-value')?.addEventListener('input',updatePosChange);
    root.querySelector('#pos-discount-type')?.addEventListener('change',updatePosChange);
    root.querySelector('#pos-legal-tip')?.addEventListener('change',updatePosChange);
    root.querySelector('#pos-ncf-type')?.addEventListener('change',updatePosNcf);
    root.querySelector('#audit-search')?.addEventListener('input',filterAuditRows);
    root.querySelector('#pos-checkout-form')?.addEventListener('submit', submitPos);
    root.querySelectorAll('#pos-submit-btn, .mobile-pos-charge').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const form = root.querySelector('#pos-checkout-form');
        if (form) submitPos({ preventDefault: () => {}, currentTarget: form, submitter: e.currentTarget });
      });
    });
    root.querySelector('#pos-checkout-form')?.addEventListener('input', capturePosDraft);
    root.querySelector('#pos-checkout-form')?.addEventListener('change', capturePosDraft);
    root.querySelector('#pos-print-receipt')?.addEventListener('change', () => {
      updatePosSubmitLabel();
      capturePosDraft();
    });
    root.querySelectorAll('#pos-checkout-form details').forEach((details) => details.addEventListener('toggle', capturePosDraft));
    root.querySelector('#pos-checkout-form [name=tableId], #pos-table-select')?.addEventListener('change', updatePosFields);
    root.querySelector('#pos-cash-received')?.addEventListener('input', updatePosChange);
    root.querySelector('#pos-cash-received')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const submitBtn = root.querySelector('#pos-submit-btn');
        if (submitBtn && !submitBtn.disabled) submitBtn.click();
      }
    });
    root.querySelectorAll('.pos-bill-btn, .quick-cash-btn').forEach((btn) => btn.addEventListener('click', () => handleQuickCash(btn.dataset.cashVal)));

    // Selector de método de pago — nuevos paneles rediseñados
    root.querySelectorAll('[data-pos-method]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const method = btn.dataset.posMethod;
        state.posPaymentMethod = method;

        // Activar el botón seleccionado
        root.querySelectorAll('[data-pos-method]').forEach((b) => {
          b.classList.toggle('active', b.dataset.posMethod === method);
        });

        // Actualizar el input hidden del formulario
        const methodInput = root.querySelector('#pos-payment-method');
        if (methodInput) methodInput.value = method;

        // Mostrar el panel correspondiente
        root.querySelectorAll('.pos-method-panel').forEach((p) => p.classList.remove('visible'));
        const panelMap = { cash: '#pos-cash-panel', card: '#pos-card-panel', transfer: '#pos-transfer-panel', credit: '#pos-fiao-panel', delivery_cod: '#pos-delivery-panel' };
        const targetPanel = root.querySelector(panelMap[method]);
        if (targetPanel) targetPanel.classList.add('visible');

        updatePosSubmitLabel();
        capturePosDraft();
      });
    });

    root.querySelector('#pos-fiao-client-select')?.addEventListener('change', (e) => {
      const clientId = e.target.value;
      const selectedClient = (state.clients || []).find(c => c.id === clientId);
      const nameInput = root.querySelector('#pos-fiao-name');
      const phoneInput = root.querySelector('#pos-fiao-phone');
      const notesInput = root.querySelector('#pos-fiao-notes');
      const idInput = root.querySelector('#pos-fiao-client-id');
      const debtInfo = root.querySelector('#pos-fiao-debt-info');
      const debtText = root.querySelector('#pos-fiao-debt-text');

      if (selectedClient) {
        if (idInput) idInput.value = selectedClient.id;
        if (nameInput) nameInput.value = selectedClient.name;
        if (phoneInput) phoneInput.value = selectedClient.phone || '';
        if (notesInput && !notesInput.value) notesInput.value = selectedClient.notes || '';

        const pendingInvoices = (state.invoices || []).filter(inv =>
          inv.documentType === 'invoice' && inv.status !== 'paid' && inv.status !== 'cancelled' &&
          ((inv.clientId && inv.clientId === selectedClient.id) ||
           (inv.clientName && inv.clientName.trim().toLowerCase() === selectedClient.name.trim().toLowerCase()))
        );
        const debtCents = pendingInvoices.reduce((sum, inv) => sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)), 0);

        if (debtInfo && debtText) {
          if (debtCents > 0) {
            debtInfo.style.display = 'block';
            debtText.textContent = `Atención: Este cliente tiene una deuda pendiente de ${formatMoney(debtCents)} (${pendingInvoices.length} consumo(s)).`;
          } else {
            debtInfo.style.display = 'none';
          }
        }
      } else {
        if (idInput) idInput.value = '';
        if (debtInfo) debtInfo.style.display = 'none';
      }
      capturePosDraft();
    });

    root.querySelector('#pos-fiao-name')?.addEventListener('input', (e) => {
      const typedName = e.target.value.trim().toLowerCase();
      const debtInfo = root.querySelector('#pos-fiao-debt-info');
      const debtText = root.querySelector('#pos-fiao-debt-text');
      if (!typedName) {
        if (debtInfo) debtInfo.style.display = 'none';
        return;
      }
      const matchingClient = (state.clients || []).find(c => c.name && c.name.trim().toLowerCase() === typedName);
      if (matchingClient) {
        const phoneInput = root.querySelector('#pos-fiao-phone');
        if (phoneInput && !phoneInput.value && matchingClient.phone) phoneInput.value = matchingClient.phone;
        const idInput = root.querySelector('#pos-fiao-client-id');
        if (idInput) idInput.value = matchingClient.id;
      }
      const pendingInvoices = (state.invoices || []).filter(inv =>
        inv.documentType === 'invoice' && inv.status !== 'paid' && inv.status !== 'cancelled' &&
        (inv.clientName && inv.clientName.trim().toLowerCase() === typedName)
      );
      const debtCents = pendingInvoices.reduce((sum, inv) => sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)), 0);
      if (debtInfo && debtText) {
        if (debtCents > 0) {
          debtInfo.style.display = 'block';
          debtText.textContent = `Atención: Este cliente tiene una deuda pendiente de ${formatMoney(debtCents)} (${pendingInvoices.length} consumo(s)).`;
        } else {
          debtInfo.style.display = 'none';
        }
      }
    });

    // Selector de repartidor en POS
    root.querySelector('#pos-delivery-driver-select')?.addEventListener('change', (e) => {
      const select = e.target;
      const opt = select.selectedOptions?.[0];
      const nameInput = root.querySelector('#pos-delivery-driver-name');
      if (nameInput) {
        nameInput.value = opt ? (opt.dataset.name || '') : '';
      }
      capturePosDraft();
    });
    root.querySelector('[data-driver-quick-new]')?.addEventListener('click', () => {
      capturePosDraft();
      state.editingDriver = null;
      state.modal = 'driverForm';
      renderModal();
    });

    // Fiao / Cuentas por Cobrar
    root.querySelector('#fiao-search')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      root.querySelectorAll('[data-fiao-card]').forEach((card) => {
        const search = (card.dataset.search || '').toLowerCase();
        card.hidden = q ? !search.includes(q) : false;
      });
    });
    root.querySelectorAll('[data-fiao-pay]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const invId = btn.dataset.fiaoPay;
        state.selectedFiaoInvoice = state.invoices.find(i => i.id === invId);
        state.modal = 'fiaoPay';
        renderModal();
      });
    });

    // Deliveries y Mensajeros
    root.querySelectorAll('[data-driver-new]').forEach((btn) => {
      btn.addEventListener('click', () => {
        capturePosDraft();
        state.editingDriver = null;
        state.modal = 'driverForm';
        renderModal();
      });
    });
    root.querySelectorAll('[data-driver-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const driverId = btn.dataset.driverEdit;
        state.editingDriver = (state.deliveryDrivers || []).find(d => d.id === driverId) || null;
        state.modal = 'driverForm';
        renderModal();
      });
    });
    root.querySelectorAll('[data-delivery-settle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const driverId = btn.dataset.deliverySettle;
        const driver = (state.deliveryDrivers || []).find(d => d.id === driverId || d.name === driverId) || { id: driverId, name: driverId || 'Mensajero' };
        const pendingInvoices = (state.invoices || []).filter(inv =>
          (inv.deliveryDriverId === driverId || inv.deliveryDriverName === driverId || (!inv.deliveryDriverId && inv.paymentMethod === 'delivery_cod')) &&
          inv.status !== 'paid' && inv.status !== 'cancelled'
        );
        state.selectedDeliveryDriver = driver;
        state.selectedDeliveryInvoices = pendingInvoices;
        state.modal = 'deliverySettle';
        renderModal();
      });
    });
    root.querySelectorAll('[data-delivery-settle-single]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const invId = btn.dataset.deliverySettleSingle;
        const inv = (state.invoices || []).find(i => i.id === invId);
        if (!inv) return;
        const driver = (state.deliveryDrivers || []).find(d => d.id === inv.deliveryDriverId) || { id: inv.deliveryDriverId, name: inv.deliveryDriverName || 'Mensajero', phone: inv.deliveryPhone || '' };
        state.selectedDeliveryDriver = driver;
        state.selectedDeliveryInvoices = [inv];
        state.modal = 'deliverySettle';
        renderModal();
      });
    });

    // Selector de fecha en Reportes
    root.querySelector('#report-date-selector')?.addEventListener('change', (e) => {
      state.selectedReportDate = e.target.value;
      renderContent();
    });

    root.querySelectorAll('[data-order-open]').forEach((button)=>button.addEventListener('click',()=>openOrder(button.dataset.orderOpen)));
    root.querySelectorAll('[data-table-start]').forEach((button)=>button.addEventListener('click',()=>{
      state.preselectedTableId=button.dataset.tableStart;
      route('pos');
    }));
    root.querySelectorAll('[data-kds-order]').forEach((button) => button.addEventListener('click', async () => {
      const orderId = button.dataset.kdsOrder;
      const nextStatus = button.dataset.nextStatus;
      setBusy(button, true);
      const order = state.orders.find((o) => o.id === orderId);
      const prevStatus = order ? order.status : null;
      if (order) {
        order.status = nextStatus;
        renderContent();
      }
      const outcome = await perform(() => service.transitionOrder(orderId, nextStatus), 'Comanda actualizada.');
      if (!outcome.ok && order && prevStatus) {
        order.status = prevStatus;
        renderContent();
      }
    }));
    root.querySelectorAll('[data-invoice-view]').forEach((button)=>button.addEventListener('click',()=>openInvoice(button.dataset.invoiceView)));
    root.querySelector('#invoice-search')?.addEventListener('input',filterInvoiceRows);
    root.querySelector('#invoice-status-filter')?.addEventListener('change',filterInvoiceRows);
    root.querySelector('[data-load-more-invoices]')?.addEventListener('click', () => {
      state.invoiceDisplayLimit = (state.invoiceDisplayLimit || 60) + 60;
      renderContent();
    });
    root.querySelector('[data-load-more-audit]')?.addEventListener('click', () => {
      state.auditDisplayLimit = (state.auditDisplayLimit || 50) + 50;
      renderContent();
    });
    root.querySelectorAll('[data-product-new]').forEach((button)=>button.addEventListener('click',()=>openForm('product')));
    root.querySelectorAll('[data-products-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state.productsTab = button.dataset.productsTab;
        renderContent();
      });
    });
    root.querySelectorAll('[data-stock-adjust]').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = button.dataset.stockAdjust;
        const p = (state.products || []).find((x) => x.id === pid);
        if (p) {
          state.editingStockProduct = p;
          state.modal = 'stockAdjust';
          renderModal();
        }
      });
    });
    root.querySelectorAll('[data-end-day-waste]').forEach((button) => {
      button.addEventListener('click', () => {
        state.modal = 'endDayWaste';
        renderModal();
      });
    });
    root.querySelectorAll('[data-client-new]').forEach((button)=>button.addEventListener('click',()=>openForm('client')));
    root.querySelector('[data-user-new]')?.addEventListener('click',()=>openUserForm());
    root.querySelectorAll('[data-user-edit]').forEach((button)=>button.addEventListener('click',()=>openUserForm(button.dataset.userEdit)));
    root.querySelectorAll('[data-client-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.clientEdit || '';
        const name = button.dataset.clientName || '';
        state.editingId = id;
        state.editingClientDraft = id ? null : { name };
        state.modal = 'client';
        renderModal();
      });
    });
    // Nómina y Personal
    root.querySelectorAll('[data-payroll-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state.payrollTab = button.dataset.payrollTab;
        renderContent();
      });
    });
    root.querySelector('#payroll-payments-search')?.addEventListener('input', (e) => {
      const q = (e.target.value || '').toLowerCase().trim();
      root.querySelectorAll('#main-content [data-payroll-row]').forEach((row) => {
        const text = row.dataset.search || '';
        row.style.display = !q || text.includes(q) ? '' : 'none';
      });
    });
    root.querySelector('#payroll-employees-search')?.addEventListener('input', (e) => {
      const q = (e.target.value || '').toLowerCase().trim();
      root.querySelectorAll('#main-content [data-employee-row]').forEach((row) => {
        const text = row.dataset.search || '';
        row.style.display = !q || text.includes(q) ? '' : 'none';
      });
    });
    root.querySelectorAll('[data-employee-new]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingEmployee = {};
        state.modal = 'employeeForm';
        renderModal();
      });
    });
    root.querySelectorAll('[data-employee-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const empId = btn.dataset.employeeEdit;
        state.editingEmployee = (state.employees || []).find((e) => e.id === empId) || {};
        state.modal = 'employeeForm';
        renderModal();
      });
    });
    root.querySelectorAll('[data-employee-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const empId = btn.dataset.employeeDelete;
        const emp = (state.employees || []).find((e) => e.id === empId);
        if (!emp) return;
        if (!confirm(`¿Estás seguro de desactivar al colaborador ${emp.name}?`)) return;
        await perform(() => service.deleteEmployee(empId), 'Colaborador desactivado.');
      });
    });
    root.querySelectorAll('[data-payroll-pay-new]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.payingEmployeeId = null;
        state.modal = 'payrollPayment';
        renderModal();
      });
    });
    root.querySelectorAll('[data-payroll-pay-emp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.payingEmployeeId = btn.dataset.payrollPayEmp;
        state.modal = 'payrollPayment';
        renderModal();
      });
    });
    root.querySelectorAll('[data-payroll-print]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const paymentId = btn.dataset.payrollPrint;
        const payment = (state.payrollPayments || []).find((p) => p.id === paymentId);
        if (payment) printPayrollPayment(payment);
      });
    });
    root.querySelector('#directory-search')?.addEventListener('input',filterDirectory);
    root.querySelector('#cash-open-form')?.addEventListener('submit',openCash);
    root.querySelector('#cash-close-form')?.addEventListener('submit',closeCash);
    root.querySelector('#cash-movement-form')?.addEventListener('submit',createCashMovement);
    root.querySelector('#settings-form')?.addEventListener('submit',saveSettings);
    root.querySelectorAll('[data-drawer-kick]').forEach((btn)=>btn.addEventListener('click', promptDrawerPin));
    root.querySelectorAll('[data-quick-open-cash]').forEach((btn)=>btn.addEventListener('click', () => { state.modal = 'quickCash'; renderModal(); }));
    root.querySelectorAll('[data-cash-movement-open]').forEach((btn)=>btn.addEventListener('click', () => { state.modal = 'cashMovement'; renderModal(); }));
    root.querySelectorAll('[data-cash-close-open]').forEach((btn)=>btn.addEventListener('click', () => { state.modal = 'cashClose'; renderModal(); }));
    root.querySelectorAll('[data-test-drawer]').forEach((btn)=>btn.addEventListener('click', promptDrawerPin));
    root.querySelectorAll('[data-test-print]').forEach((btn)=>btn.addEventListener('click', testPrint));
    bindUpdateActions(root);
    root.querySelectorAll('[data-cash-corte-x]').forEach((btn)=>btn.addEventListener('click',()=>printCashSession(btn.dataset.cashCorteX, 'X')));
    root.querySelectorAll('[data-cash-report-print]').forEach((btn)=>btn.addEventListener('click',()=>printCashSession(btn.dataset.cashReportPrint, 'Z')));
    root.querySelectorAll('[data-export]').forEach((button)=>button.addEventListener('click',()=>exportReport(button.dataset.export,state)));
    updatePosFields();
    if (searchInput) filterCards({ target: searchInput });
    setupTouchNumericInputs(root);
  }

  function updateIsBusy() {
    return Boolean(state.saleInProgress || state.checkoutOpening || state.cart.length
      || state.modal || state.pendingPosSubmit || state.pendingPinDestination
      || busyButtons.size);
  }

  function syncNativeUpdateState() {
    if (root.querySelector('form')) {
      updateForms.remember(root);
    }
    updateSafety.setBlocker('application', !destroyed && updateIsBusy());
  }

  function bindUpdateActions(target) {
    target.querySelectorAll('[data-update-check]').forEach((btn)=>btn.addEventListener('click', checkNativeUpdate));
    target.querySelectorAll('[data-update-install]').forEach((btn)=>btn.addEventListener('click', installNativeUpdate));
    target.querySelectorAll('[data-update-permission]').forEach((btn)=>btn.addEventListener('click', requestUpdatePermission));
  }

  function refreshUpdateCard() {
    const current = root.querySelector('.elo-update-card');
    if (!current) return;
    const template = document.createElement('template');
    template.innerHTML = renderSettings(state);
    const replacement = template.content.querySelector('.elo-update-card');
    if (!replacement) return;
    current.replaceWith(replacement);
    bindUpdateActions(replacement);
    iconsRefresh(replacement);
  }

  function handleEloUpdateStatus(event) {
    const detail = event.detail;
    if (!detail || detail.supported === false) return;
    const previousState = state.updateStatus?.state;
    const previousError = state.updateStatus?.errorCode;
    state.updateStatus = detail;
    refreshUpdateBanner();
    if (state.route === 'settings') refreshUpdateCard();
    syncNativeUpdateState();

    if (detail.state === 'error' && (previousState !== 'error' || previousError !== detail.errorCode)) {
      toast(detail.message || 'No se pudo completar la actualización.', 'warning', 8000);
    } else if (detail.state === 'awaiting_confirmation' && previousState !== detail.state) {
      toast('Confirma la actualización en la ventana segura de Android.', 'info', 8000);
    }
  }

  function refreshUpdateBanner() {
    const banner = root.querySelector('#app-update-banner');
    if (!banner) return;
    const update = state.updateStatus || {};
    const visible = ['waiting_for_idle', 'permission_required', 'error'].includes(update.state);
    banner.hidden = !visible;
    banner.dataset.state = update.state || '';
    const message = banner.querySelector('[data-update-banner-message]');
    if (message) message.textContent = update.message || '';
    const action = banner.querySelector('[data-update-banner-action]');
    if (!action) return;
    action.hidden = !visible;
    action.textContent = update.state === 'permission_required'
      ? 'Permitir instalación'
      : update.state === 'error' ? 'Reintentar' : 'Instalar al terminar';
    action.disabled = update.state === 'waiting_for_idle';
  }

  function handleUpdateBannerAction() {
    if (state.updateStatus?.state === 'permission_required') requestUpdatePermission();
    else if (state.updateStatus?.state === 'error') checkNativeUpdate();
  }

  async function checkNativeUpdate(event) {
    if (state.updateStatus?.state === 'error'
        && String(state.updateStatus.errorCode || '').startsWith('INSTALL_')
        && Number(state.updateStatus.availableVersionCode || 0) > 0) return installNativeUpdate();
    const button = event?.currentTarget;
    if (button) button.disabled = true;
    if (!checkEloAppUpdate()) {
      if (button) button.disabled = false;
      return toast('La actualización APK solo está disponible dentro de la app nativa ELO.', 'warning');
    }
    toast('Buscando una versión nueva en el servidor oficial…', 'info');
  }

  function installNativeUpdate() {
    if (updateIsBusy() || updateSafety.hasBlockers()) {
      return toast('Guarda los cambios y termina las operaciones pendientes antes de instalar.', 'warning');
    }
    if (!installEloAppUpdate()) toast('Abre esta opción desde la app nativa ELO.', 'warning');
  }

  function requestUpdatePermission() {
    if (updateIsBusy() || updateSafety.hasBlockers()) {
      return toast('Guarda los cambios y termina las operaciones pendientes antes de abrir los permisos.', 'warning');
    }
    openEloUpdatePermission();
  }

  function bindModal() {
    const modalRoot = root.querySelector('#modal-root');
    if (!modalRoot) return;

    modalRoot.querySelectorAll('button[data-modal-close], [data-modal-close]:not(.modal-backdrop)').forEach((item) => {
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        if (drawerInProgress || state.saleInProgress || cashFormInProgress) return toast('Espera a que termine la operación.', 'warning');
        closeModal();
      });
    });

    const backdrop = modalRoot.querySelector('.modal-backdrop');
    if (backdrop) {
      const openedAt = Date.now();
      backdrop.addEventListener('click', (event) => {
        if (Date.now() - openedAt < 250) return;
        if (event.target === backdrop) {
          if (drawerInProgress || state.saleInProgress || cashFormInProgress) return;
          closeModal();
        }
      });
    }
    modalRoot?.querySelector('#product-form')?.addEventListener('submit',saveProduct);
    bindStockAdjustModal(modalRoot);
    bindEndDayWasteModal(modalRoot);
    modalRoot?.querySelector('#employee-form')?.addEventListener('submit', saveEmployee);
    bindPayrollPaymentModal(modalRoot);
    modalRoot?.querySelector('#client-form')?.addEventListener('submit',saveClient);
    modalRoot?.querySelector('#driver-form')?.addEventListener('submit',saveDeliveryDriver);
    modalRoot?.querySelector('#user-access-form')?.addEventListener('submit',saveUserAccess);
    modalRoot?.querySelector('#password-change-form')?.addEventListener('submit',submitPasswordChange);
    modalRoot?.querySelector('#drawer-pin-update-form')?.addEventListener('submit',submitDrawerPinChange);
    modalRoot?.querySelector('#cancellation-form')?.addEventListener('submit', submitCancellation);
    modalRoot?.querySelector('#setup-checkout-pin-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const pin = String(data.get('pin') || '');
      const confirm = String(data.get('confirmPin') || '');
      if (!/^\d{6}$/.test(pin)) return toast('Elige un PIN de exactamente 6 dígitos.', 'warning');
      if (pin !== confirm) return toast('Los PINes no coinciden.', 'warning');
      const outcome = await perform(() => service.saveMyDrawerPin(pin), 'PIN configurado.', null);
      if (!outcome.ok) return;
      state.modal = state.pendingPinDestination === 'charge' ? 'charge' : 'checkoutPin';
      state.pendingPinDestination = '';
      renderModal();
    });
    modalRoot?.querySelector('#item-note-form')?.addEventListener('submit',saveItemNote);
    modalRoot?.querySelectorAll('[data-quick-note]').forEach((btn)=>{
      btn.addEventListener('click',()=>{
        const input=modalRoot.querySelector('#item-note-input');
        if(input){input.value=btn.dataset.quickNote;input.focus();}
      });
    });
    const qtyForm = modalRoot?.querySelector('#quantity-form');
    if (qtyForm) {
      const qtyInput = qtyForm.querySelector('#item-qty-input');
      if (qtyInput) {
        qtyInput.setAttribute('readonly', 'true');
        qtyInput.setAttribute('inputmode', 'none');
        qtyInput.setAttribute('tabindex', '-1');
        qtyInput.addEventListener('focus', () => {
          try { qtyInput.blur(); } catch (_) {}
        });
      }
      qtyForm.addEventListener('keydown', (e) => {
        if (['0','1','2','3','4','5','6','7','8','9'].includes(e.key)) {
          e.preventDefault();
          if (qtyInput && qtyInput.value.length < 4) {
            qtyInput.value = (qtyInput.value === '0' ? '' : qtyInput.value) + e.key;
          }
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          if (qtyInput) qtyInput.value = qtyInput.value.slice(0, -1);
        }
      });
    }
    modalRoot?.querySelector('#quantity-form')?.addEventListener('submit',saveQuantity);
    modalRoot?.querySelectorAll('.qty-num-btn').forEach((btn)=>{
      btn.addEventListener('click',()=>{
        const qtyInput=modalRoot.querySelector('#item-qty-input');
        if(qtyInput&&qtyInput.value.length<4){
          qtyInput.value=(qtyInput.value==='0'?'':qtyInput.value)+btn.dataset.qtyNum;
        }
      });
    });
    modalRoot?.querySelector('.qty-clear-btn')?.addEventListener('click',()=>{
      const qtyInput=modalRoot.querySelector('#item-qty-input');
      if(qtyInput)qtyInput.value='';
    });
    modalRoot?.querySelector('.qty-del-btn')?.addEventListener('click',()=>{
      const qtyInput=modalRoot.querySelector('#item-qty-input');
      if(qtyInput)qtyInput.value=qtyInput.value.slice(0,-1);
    });
    modalRoot?.querySelector('[data-order-prebill]')?.addEventListener('click',()=>printOrderPrebill(state.selectedOrderId));
    modalRoot?.querySelector('#quick-cash-form')?.addEventListener('submit', openCash);
    modalRoot?.querySelectorAll('[data-set-opening]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = modalRoot.querySelector('#quick-cash-form [name=opening]');
        if (input) input.value = Number(btn.dataset.setOpening).toFixed(2);
      });
    });
    modalRoot?.querySelector('[data-order-transition]')?.addEventListener('click', async (event) => {
      const nextStatus = event.currentTarget.dataset.orderTransition;
      const order = state.orders.find((o) => o.id === state.selectedOrderId);
      const prevStatus = order ? order.status : null;
      if (order) {
        order.status = nextStatus;
        closeModal();
        renderContent();
      }
      const outcome = await perform(() => service.transitionOrder(state.selectedOrderId, nextStatus), 'Comanda actualizada.');
      if (!outcome.ok && order && prevStatus) {
        order.status = prevStatus;
        renderContent();
      }
    });
    modalRoot?.querySelector('[data-order-charge]')?.addEventListener('click',async()=>{
      try {
        const hasPin = await service.hasMyDrawerPin();
        state.pendingPinDestination = hasPin ? '' : 'charge';
        state.modal = hasPin ? 'charge' : 'setupCheckoutPin';
        renderModal();
      } catch (error) {
        toast(error.message || 'No se pudo verificar el PIN de esta cuenta.', 'danger');
      }
    });
    modalRoot?.querySelector('[data-order-cancel]')?.addEventListener('click',cancelOrder);
    modalRoot?.querySelector('[data-payment-open]')?.addEventListener('click',()=>{state.modal='payment';renderModal();});
    modalRoot?.querySelector('[data-invoice-cancel]')?.addEventListener('click',cancelInvoice);
    modalRoot?.querySelector('[data-invoice-print]')?.addEventListener('click',()=>printInvoice(state.selectedInvoiceId));
    modalRoot?.querySelector('[data-order-print]')?.addEventListener('click',()=>printOrder(state.selectedOrderId));
    modalRoot?.querySelector('#payment-form')?.addEventListener('submit',submitPayment);
    modalRoot?.querySelector('#charge-form')?.addEventListener('submit',submitCharge);

    // Formulario de cobro de factura individual con teclado táctil
    const paymentForm = modalRoot?.querySelector('#payment-form');
    if (paymentForm && paymentForm.querySelector('.pin-slots-container')) {
      const pinInput = paymentForm.querySelector('#payment-pin-input') || paymentForm.querySelector('input[name="pin"]');
      const errBox = paymentForm.querySelector('#payment-pin-error') || paymentForm.querySelector('.pin-error-box');
      const submitBtn = paymentForm.querySelector('button[type="submit"]');
      disposePinPad = bindPinPad({
        form: paymentForm,
        input: pinInput,
        slots: [...paymentForm.querySelectorAll('.pin-slot')],
        digits: [...paymentForm.querySelectorAll('.pin-num-btn')],
        clear: paymentForm.querySelector('.pin-clear-btn'),
        backspace: paymentForm.querySelector('.pin-del-btn'),
        submit: submitBtn,
        error: errBox,
        isBusy: () => state.saleInProgress
      });
    }

    // Formulario de cobro de mesa con teclado táctil
    const chargeForm = modalRoot?.querySelector('#charge-form');
    if (chargeForm && chargeForm.querySelector('.pin-slots-container')) {
      const pinInput = chargeForm.querySelector('#charge-pin-input') || chargeForm.querySelector('input[name="pin"]');
      const errBox = chargeForm.querySelector('#charge-pin-error') || chargeForm.querySelector('.pin-error-box');
      const submitBtn = chargeForm.querySelector('button[type="submit"]');
      disposePinPad = bindPinPad({
        form: chargeForm,
        input: pinInput,
        slots: [...chargeForm.querySelectorAll('.pin-slot')],
        digits: [...chargeForm.querySelectorAll('.pin-num-btn')],
        clear: chargeForm.querySelector('.pin-clear-btn'),
        backspace: chargeForm.querySelector('.pin-del-btn'),
        submit: submitBtn,
        error: errBox,
        isBusy: () => state.saleInProgress
      });
    }

    // Formulario de apertura de caja rápida con teclado táctil
    const quickCashForm = modalRoot?.querySelector('#quick-cash-form');
    if (quickCashForm && quickCashForm.querySelector('.pin-slots-container')) {
      const pinInput = quickCashForm.querySelector('#quick-cash-pin-input') || quickCashForm.querySelector('input[name="pin"]');
      const errBox = quickCashForm.querySelector('#quick-cash-pin-error') || quickCashForm.querySelector('.pin-error-box');
      const submitBtn = quickCashForm.querySelector('button[type="submit"]');
      disposePinPad = bindPinPad({
        form: quickCashForm,
        input: pinInput,
        slots: [...quickCashForm.querySelectorAll('.pin-slot')],
        digits: [...quickCashForm.querySelectorAll('.pin-num-btn')],
        clear: quickCashForm.querySelector('.pin-clear-btn'),
        backspace: quickCashForm.querySelector('.pin-del-btn'),
        submit: submitBtn,
        error: errBox,
        isBusy: () => cashFormInProgress
      });
    }

    // Formulario de movimiento de caja (Entrada / Salida) con teclado táctil
    const cashMovementForm = modalRoot?.querySelector('#cash-movement-form');
    if (cashMovementForm) {
      modalRoot.querySelectorAll('[data-movement-type]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.movementType;
          modalRoot.querySelector('#cash-movement-type').value = type;
          modalRoot.querySelectorAll('[data-movement-type]').forEach((b) => {
            const isMatch = b.dataset.movementType === type;
            b.classList.toggle('active', isMatch);
          });
          const submitText = type === 'in' ? 'Registrar Entrada' : 'Registrar Salida';
          const submitBtn = modalRoot.querySelector('#cash-movement-submit');
          if (submitBtn) submitBtn.innerHTML = `<i data-lucide="${type === 'in' ? 'plus-circle' : 'minus-circle'}"></i> ${submitText}`;
          iconsRefresh(submitBtn);
        });
      });

      modalRoot.querySelectorAll('[data-set-reason]').forEach((chip) => {
        chip.addEventListener('click', () => {
          const reasonInput = modalRoot.querySelector('#cash-movement-reason');
          if (reasonInput) reasonInput.value = chip.dataset.setReason;
        });
      });

      const pinInput = cashMovementForm.querySelector('#cash-movement-pin-input') || cashMovementForm.querySelector('input[name="pin"]');
      const errBox = cashMovementForm.querySelector('#cash-movement-pin-error') || cashMovementForm.querySelector('.pin-error-box');
      const submitBtn = cashMovementForm.querySelector('#cash-movement-submit');
      disposePinPad = bindPinPad({
        form: cashMovementForm,
        input: pinInput,
        slots: [...cashMovementForm.querySelectorAll('.pin-slot')],
        digits: [...cashMovementForm.querySelectorAll('.pin-num-btn')],
        clear: cashMovementForm.querySelector('.pin-clear-btn'),
        backspace: cashMovementForm.querySelector('.pin-del-btn'),
        submit: submitBtn,
        error: errBox,
        isBusy: () => cashFormInProgress
      });

      cashMovementForm.addEventListener('submit', createCashMovement);
    }

    // Formulario de cierre de caja (Corte Z) con cálculo de diferencia y teclado táctil
    const cashCloseForm = modalRoot?.querySelector('#cash-close-form');
    if (cashCloseForm) {
      const closingInput = modalRoot.querySelector('#cash-closing-amount');
      const expectedCents = Number(cashCloseForm.querySelector('input[name="expected"]')?.value || 0);
      const varianceBox = modalRoot.querySelector('#cash-variance-box');
      const varianceVal = modalRoot.querySelector('#cash-variance-val');
      const varianceLabel = modalRoot.querySelector('#cash-variance-label');
      const varianceHint = modalRoot.querySelector('#cash-variance-hint');

      const updateVariance = () => {
        if (!closingInput || !varianceBox) return;
        const val = closingInput.value.trim();
        if (val === '') {
          varianceBox.style.display = 'none';
          return;
        }
        varianceBox.style.display = 'block';
        const countedCents = toCents(val);
        const diffCents = countedCents - expectedCents;
        if (diffCents === 0) {
          varianceBox.className = 'cash-variance-box exact';
          if (varianceLabel) { varianceLabel.textContent = 'Cuadre Perfecto'; varianceLabel.style.color = '#3fb950'; }
          if (varianceVal) { varianceVal.textContent = 'RD$ 0.00'; varianceVal.style.color = '#3fb950'; }
          if (varianceHint) varianceHint.textContent = 'El efectivo contado coincide exactamente con el sistema.';
        } else if (diffCents > 0) {
          varianceBox.className = 'cash-variance-box difference';
          if (varianceLabel) { varianceLabel.textContent = 'Sobrante en Caja'; varianceLabel.style.color = 'var(--brand-2)'; }
          if (varianceVal) { varianceVal.textContent = `+${formatMoney(diffCents)}`; varianceVal.style.color = 'var(--brand-2)'; }
          if (varianceHint) varianceHint.textContent = 'Hay más efectivo contado del registrado en el sistema. Explica la nota.';
        } else {
          varianceBox.className = 'cash-variance-box difference';
          if (varianceLabel) { varianceLabel.textContent = 'Faltante en Caja'; varianceLabel.style.color = '#f85149'; }
          if (varianceVal) { varianceVal.textContent = formatMoney(diffCents); varianceVal.style.color = '#f85149'; }
          if (varianceHint) varianceHint.textContent = 'Falta dinero respecto al cálculo del sistema. Justifica el motivo en la nota.';
        }
      };

      closingInput?.addEventListener('input', updateVariance);

      const pinInput = cashCloseForm.querySelector('#cash-close-pin-input') || cashCloseForm.querySelector('input[name="pin"]');
      const errBox = cashCloseForm.querySelector('#cash-close-pin-error') || cashCloseForm.querySelector('.pin-error-box');
      const submitBtn = cashCloseForm.querySelector('#cash-close-submit');
      disposePinPad = bindPinPad({
        form: cashCloseForm,
        input: pinInput,
        slots: [...cashCloseForm.querySelectorAll('.pin-slot')],
        digits: [...cashCloseForm.querySelectorAll('.pin-num-btn')],
        clear: cashCloseForm.querySelector('.pin-clear-btn'),
        backspace: cashCloseForm.querySelector('.pin-del-btn'),
        submit: submitBtn,
        error: errBox,
        isBusy: () => cashFormInProgress
      });

      cashCloseForm.addEventListener('submit', closeCash);
    }

    // Formulario y teclado táctil de PIN para abrir gaveta manual
    const drawerPinForm = modalRoot?.querySelector('#drawer-pin-form');
    if (drawerPinForm) {
      const pinInput = modalRoot.querySelector('#drawer-pin-input');
      const errBox = modalRoot.querySelector('#drawer-pin-error');
      const submitBtn = modalRoot.querySelector('#drawer-pin-submit');

      const updateDrawerPinSlots = () => {
        const len = (pinInput?.value || '').length;
        modalRoot.querySelectorAll('#drawer-pin-slots .pin-slot').forEach((slot, idx) => {
          slot.classList.toggle('filled', idx < len);
        });
      };

      disposePinPad = bindPinPad({
        form: drawerPinForm, input: pinInput,
        slots: [...modalRoot.querySelectorAll('#drawer-pin-slots .pin-slot')],
        digits: [...modalRoot.querySelectorAll('.pin-num-btn')],
        clear: modalRoot.querySelector('.pin-clear-btn'), backspace: modalRoot.querySelector('.pin-del-btn'),
        submit: submitBtn, error: errBox, isBusy: () => drawerInProgress
      });

      drawerPinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (drawerInProgress) return;
        const pin = (pinInput?.value || '').trim();
        const reason = modalRoot.querySelector('#drawer-pin-reason')?.value || 'Apertura manual';
        if (!/^\d{6}$/.test(pin)) {
          if (errBox) errBox.textContent = 'Ingresa tu PIN de 6 dígitos.';
          return;
        }
        try {
          drawerInProgress = true;
          setBusy(submitBtn, true);
          const result = await service.verifyDrawerPin(pin, reason);
          const hardwareResult = await auditedDrawerPulse(reason);
          if (!hardwareResult?.success) throw new Error('PIN correcto, pero la gaveta no respondió. Revisa la conexión de la impresora Star.');
          beepHardware('ok');
          toast(`Pulso de apertura enviado por ${result.user.displayName}. Comprueba la gaveta.`, 'success');
          closeModal();
        } catch (err) {
          beepHardware('error');
          if (errBox) errBox.textContent = err.message || 'PIN incorrecto.';
          if (pinInput) {
            pinInput.value = '';
            updateDrawerPinSlots();
          }
        } finally {
          drawerInProgress = false;
          setBusy(submitBtn, false);
        }
      });
    }

    // Teclado y procesamiento de PIN para Cobro Rápido en POS
    const checkoutPinForm = modalRoot?.querySelector('#checkout-pin-form');
    if (checkoutPinForm) {
      const chkPinInput = modalRoot.querySelector('#checkout-pin-input');
      const chkErrBox = modalRoot.querySelector('#checkout-pin-error');
      const submitBtn = modalRoot.querySelector('#checkout-pin-submit');

      const updatePinSlots = () => {
        const len = (chkPinInput?.value || '').length;
        modalRoot.querySelectorAll('#chk-pin-slots .pin-slot').forEach((slot, idx) => {
          slot.classList.toggle('filled', idx < len);
        });
      };

      disposePinPad = bindPinPad({
        form: checkoutPinForm, input: chkPinInput,
        slots: [...modalRoot.querySelectorAll('#chk-pin-slots .pin-slot')],
        digits: [...modalRoot.querySelectorAll('[data-chk-pin]')],
        clear: modalRoot.querySelector('#chk-pin-clear'), backspace: modalRoot.querySelector('#chk-pin-del'),
        submit: submitBtn, error: chkErrBox, isBusy: () => state.saleInProgress
      });

      const togglePrintBtn = modalRoot.querySelector('#chk-toggle-print');
      if (togglePrintBtn) {
        togglePrintBtn.addEventListener('click', () => {
          if (!state.pendingPosPayload) return;
          const current = state.pendingPosPayload.printReceipt !== false;
          state.pendingPosPayload.printReceipt = !current;
          const nowPrint = state.pendingPosPayload.printReceipt;
          togglePrintBtn.textContent = nowPrint ? '✓ Sí, imprimir' : '✕ No imprimir';
          togglePrintBtn.style.background = nowPrint ? 'rgba(63,185,80,.18)' : 'rgba(255,255,255,.08)';
          togglePrintBtn.style.color = nowPrint ? '#3fb950' : 'var(--muted)';
          togglePrintBtn.style.border = nowPrint ? '1px solid rgba(63,185,80,.4)' : '1px solid var(--line)';
          const posPrintCheck = root.querySelector('#pos-print-receipt');
          if (posPrintCheck) posPrintCheck.checked = nowPrint;
          updatePosSubmitLabel();
        });
      }

      checkoutPinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (state.saleInProgress) return;
        const pin = (chkPinInput?.value || '').trim();
        if (!/^\d{6}$/.test(pin)) {
          if (chkErrBox) chkErrBox.textContent = 'Digita tu PIN de 6 dígitos.';
          updatePinSlots();
          return;
        }
        try {
          state.saleInProgress = true;
          setBusy(submitBtn, true);
          const payload = state.pendingPosPayload;
          if (!payload) throw new Error('No hay venta pendiente.');
          const verifyRes = await service.verifyDrawerPin(pin, 'Cobro rápido en Punto de Venta');

          if (payload.method !== 'credit' && !state.activeCash?.id) {
            const sessionId = await service.openCashSession({
              openingCents: 0,
              notes: `Apertura rápida autorizada por PIN: ${verifyRes.user.displayName}`
            });
            state.activeCash = {
              id: typeof sessionId === 'string' ? sessionId : sessionId.id,
              status: 'open',
              openingCents: 0,
              openedBy: user.uid,
              openedByName: verifyRes.user.displayName,
              optimistic: true
            };
          }
          const outcome = await completeDirectSale(payload, verifyRes.user, submitBtn);
          if (!outcome.ok) {
            if (chkErrBox) chkErrBox.textContent = outcome.error?.message || 'No se pudo registrar la venta.';
            if (chkPinInput) chkPinInput.value = '';
            updatePinSlots();
          }
        } catch (err) {
          beepHardware('error');
          if (chkErrBox) chkErrBox.textContent = err.message || 'PIN incorrecto.';
          if (chkPinInput) {
            chkPinInput.value = '';
            updatePinSlots();
          }
        } finally {
          state.saleInProgress = false;
          setBusy(submitBtn, false);
          if (!destroyed) renderContent();
        }
      });
    }

    // Botón de imprimir en pantalla de éxito
    modalRoot?.querySelector('[data-print-last-sale]')?.addEventListener('click', async (event) => {
      if (!state.lastSaleResult) return;
      const button = event.currentTarget;
      setBusy(button, true);
      await printSaleReceipt(state.lastSaleResult);
      setBusy(button, false);
    });

    // Formulario para saldar / abonar Fiao
    const fiaoPayForm = modalRoot?.querySelector('#fiao-pay-form');
    if (fiaoPayForm) {
      const amountInput = modalRoot.querySelector('#fiao-pay-amount');
      const receivedInput = modalRoot.querySelector('#fiao-cash-received');
      const changeDisplay = modalRoot.querySelector('#fiao-change-amount');
      const methodSelect = modalRoot.querySelector('#fiao-pay-method');
      const cashCalc = modalRoot.querySelector('#fiao-cash-calculator');

      const updateFiaoChange = () => {
        const amt = Math.round(Number(amountInput?.value || 0) * 100);
        const rec = Math.round(Number(receivedInput?.value || 0) * 100);
        const change = Math.max(0, rec - amt);
        if (changeDisplay) {
          changeDisplay.textContent = formatMoney(change);
          changeDisplay.style.color = rec >= amt ? '#3fb950' : 'var(--brand-2)';
        }
      };

      amountInput?.addEventListener('input', updateFiaoChange);
      receivedInput?.addEventListener('input', updateFiaoChange);
      methodSelect?.addEventListener('change', () => {
        if (cashCalc) cashCalc.style.display = methodSelect.value === 'cash' ? 'block' : 'none';
      });

      modalRoot.querySelectorAll('[data-fiao-cash-val]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.fiaoCashVal;
          if (val === 'exact') {
            if (receivedInput && amountInput) receivedInput.value = amountInput.value;
          } else {
            if (receivedInput) receivedInput.value = val;
          }
          updateFiaoChange();
        });
      });

      const pinInput = fiaoPayForm.querySelector('#fiao-pay-pin');
      const errBox = fiaoPayForm.querySelector('#fiao-pin-error');
      const submitBtn = fiaoPayForm.querySelector('#fiao-pay-submit') || fiaoPayForm.querySelector('button[type="submit"]');

      disposePinPad = bindPinPad({
        form: fiaoPayForm,
        input: pinInput,
        slots: [...fiaoPayForm.querySelectorAll('#fiao-pin-slots .pin-slot')],
        digits: [...fiaoPayForm.querySelectorAll('.pin-num-btn')],
        clear: fiaoPayForm.querySelector('#fiao-pin-clear'),
        backspace: fiaoPayForm.querySelector('#fiao-pin-del'),
        submit: submitBtn,
        error: errBox,
        isBusy: () => state.saleInProgress
      });

      fiaoPayForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (state.saleInProgress) return toast('Ya se está registrando este cobro.', 'warning');
        const form = new FormData(fiaoPayForm);
        const invoiceId = form.get('invoiceId');
        const amount = Number(form.get('amount') || 0);
        const method = form.get('method') || 'cash';
        const reference = form.get('reference') || '';
        const pin = String(form.get('pin') || '').trim();
        const received = Number(receivedInput?.value || amount);
        const shouldPrint = form.get('printInvoice') === 'on' || form.get('printInvoice') === 'true' || Boolean(fiaoPayForm.querySelector('#fiao-print-receipt')?.checked);
        if (!amount || amount <= 0) return toast('Ingresa un monto válido.', 'warning');
        if (!/^\d{6}$/.test(pin)) {
          if (errBox) errBox.textContent = 'Digita tu PIN personal de 6 dígitos.';
          return toast('Digita tu PIN personal de 6 dígitos.', 'warning');
        }
        const amountCents = Math.round(amount * 100);
        const tenderedCents = method === 'cash' ? Math.round(received * 100) : amountCents;

        if (method === 'cash' && tenderedCents < amountCents) {
          return toast('El efectivo recibido es menor al monto a abonar.', 'warning');
        }

        const button = e.submitter || submitBtn;
        state.saleInProgress = true;
        setBusy(button, true);
        try {
          const verifyRes = await service.verifyDrawerPin(pin, `Cobro de fiao - ${invoiceId}`);
          if (!state.activeCash?.id) {
            const sessionId = await service.openCashSession({
              openingCents: 0,
              notes: `Apertura rápida autorizada por PIN: ${verifyRes.user.displayName}`
            });
            state.activeCash = {
              id: typeof sessionId === 'string' ? sessionId : sessionId.id,
              status: 'open',
              openingCents: 0,
              openedBy: user.uid,
              openedByName: verifyRes.user.displayName,
              optimistic: true
            };
          }
          const outcome = await perform(() => service.recordPayment(invoiceId, {
            requestId: createOperationId('fiao-payment'),
            amountCents,
            method,
            reference,
            tenderedCents,
            cashSessionId: state.activeCash.id,
            cashierId: verifyRes.user.id,
            cashierName: verifyRes.user.displayName
          }), 'Cobro de fiao registrado con éxito.');
          if (!outcome.ok) return;
          beepHardware('ok');
          closeModal();
          setTimeout(() => {
            if (method === 'cash' && state.settings?.autoOpenDrawer !== false) void kickDrawer({ silentFailure: true });
            if (shouldPrint && state.settings?.autoPrintInvoice !== false) void printInvoice(invoiceId);
          }, 350);
        } catch (err) {
          beepHardware('error');
          toast(err.message, 'danger');
          if (errBox) errBox.textContent = err.message || 'PIN incorrecto.';
          if (pinInput) {
            pinInput.value = '';
            fiaoPayForm.querySelectorAll('#fiao-pin-slots .pin-slot').forEach(s => s.classList.remove('filled'));
          }
        } finally {
          state.saleInProgress = false;
          setBusy(button, false);
          if (!destroyed) renderContent();
        }
      });
    }

    // Formulario de Liquidación de Deliveries
    const deliverySettleForm = modalRoot?.querySelector('#delivery-settle-form');
    if (deliverySettleForm) {
      const updateSettleTotal = () => {
        let total = 0;
        deliverySettleForm.querySelectorAll('input[name="invoiceIds"]:checked').forEach(cb => {
          total += Number(cb.dataset.balanceCents || 0);
        });
        const totalDisplay = modalRoot.querySelector('#settle-total-display');
        if (totalDisplay) totalDisplay.textContent = formatMoney(total);
      };
      deliverySettleForm.querySelectorAll('input[name="invoiceIds"]').forEach(cb => {
        cb.addEventListener('change', updateSettleTotal);
      });

      const pinInput = deliverySettleForm.querySelector('#settle-pay-pin');
      const errBox = deliverySettleForm.querySelector('#settle-pin-error');
      const submitBtn = deliverySettleForm.querySelector('#settle-submit-btn') || deliverySettleForm.querySelector('button[type="submit"]');

      disposePinPad = bindPinPad({
        form: deliverySettleForm,
        input: pinInput,
        slots: [...deliverySettleForm.querySelectorAll('#settle-pin-slots .pin-slot')],
        digits: [...deliverySettleForm.querySelectorAll('.pin-num-btn')],
        clear: deliverySettleForm.querySelector('#settle-pin-clear'),
        backspace: deliverySettleForm.querySelector('#settle-pin-del'),
        submit: submitBtn,
        error: errBox,
        isBusy: () => state.saleInProgress
      });

      deliverySettleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (state.saleInProgress) return toast('Ya se está procesando una liquidación.', 'warning');
        const form = new FormData(deliverySettleForm);
        const selectedCbs = [...deliverySettleForm.querySelectorAll('input[name="invoiceIds"]:checked')];
        if (!selectedCbs.length) return toast('Selecciona al menos una entrega a liquidar.', 'warning');

        const driverId = form.get('driverId');
        const driverName = form.get('driverName') || 'Repartidor';
        const driverPhone = form.get('driverPhone') || '';
        const method = form.get('method') || 'cash';
        const reference = form.get('reference') || '';
        const pin = String(form.get('pin') || '').trim();
        const shouldPrint = form.get('printSettlement') === 'on' || Boolean(deliverySettleForm.querySelector('#settle-print-receipt')?.checked);

        if (!/^\d{6}$/.test(pin)) {
          if (errBox) errBox.textContent = 'Digita tu PIN personal de 6 dígitos.';
          return toast('Digita tu PIN personal de 6 dígitos.', 'warning');
        }

        const button = e.submitter || submitBtn;
        state.saleInProgress = true;
        setBusy(button, true);

        try {
          const verifyRes = await service.verifyDrawerPin(pin, `Liquidación de entregas - ${driverName}`);
          if (!state.activeCash?.id) {
            const sessionId = await service.openCashSession({
              openingCents: 0,
              notes: `Apertura rápida autorizada por PIN: ${verifyRes.user.displayName}`
            });
            state.activeCash = {
              id: typeof sessionId === 'string' ? sessionId : sessionId.id,
              status: 'open',
              openingCents: 0,
              openedBy: user.uid,
              openedByName: verifyRes.user.displayName,
              optimistic: true
            };
          }

          const settledInvoices = [];
          let grandTotalCents = 0;

          for (const cb of selectedCbs) {
            const invoiceId = cb.value;
            const balanceCents = Number(cb.dataset.balanceCents || 0);
            if (balanceCents <= 0) continue;

            grandTotalCents += balanceCents;
            const inv = (state.invoices || []).find(i => i.id === invoiceId);

            await service.recordPayment(invoiceId, {
              requestId: createOperationId('delivery-settle'),
              amountCents: balanceCents,
              method,
              reference,
              tenderedCents: balanceCents,
              cashSessionId: state.activeCash.id,
              cashierId: verifyRes.user.id,
              cashierName: verifyRes.user.displayName
            });

            settledInvoices.push({
              invoiceNumber: inv?.invoiceNumber || 'FACTURA',
              clientName: inv?.clientName || 'Cliente',
              paidAmountCents: balanceCents,
              totalCents: inv?.totalCents || balanceCents
            });
          }

          const settlementData = {
            driverName,
            driverPhone,
            cashierName: verifyRes.user.displayName,
            createdAt: new Date(),
            invoices: settledInvoices,
            totalCents: grandTotalCents,
            method,
            reference
          };

          beepHardware('ok');
          closeModal();
          toast(`Liquidación completada. Se ingresaron ${formatMoney(grandTotalCents)} a caja.`, 'success');

          setTimeout(() => {
            if (method === 'cash' && state.settings?.autoOpenDrawer !== false) void kickDrawer({ silentFailure: true });
            if (shouldPrint) void printDeliverySettlement(settlementData);
          }, 350);
        } catch (err) {
          beepHardware('error');
          toast(err.message, 'danger');
          if (errBox) errBox.textContent = err.message || 'PIN incorrecto.';
          if (pinInput) {
            pinInput.value = '';
            deliverySettleForm.querySelectorAll('#settle-pin-slots .pin-slot').forEach(s => s.classList.remove('filled'));
          }
        } finally {
          state.saleInProgress = false;
          setBusy(button, false);
          if (!destroyed) renderContent();
        }
      });
    }
  }

  function route(id){
    if(!allowedNavigation(user).includes(id))return;
    state.route=id;
    state.modal='';
    root.querySelector('.sidebar')?.classList.remove('open');
    root.querySelectorAll('.sidebar nav [data-route]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.route === id);
    });
    renderContent();
    history.replaceState(null,'',`#${id}`);
    if (id === 'pos') {
      vfdWelcome(state.settings?.name || 'Los Panitas');
      if (state.settings?.enableEloScanner) {
        state.scannerActive = true;
        startEloScanner();
      } else {
        state.scannerActive = false;
        stopEloScanner();
      }
    } else {
      if (state.scannerActive) {
        state.scannerActive = false;
        stopEloScanner();
      }
    }
  }

  function renderPosCartOnly() {
    if (state.route !== 'pos' || !root.querySelector('#main-content .pos-fast-cart')) {
      renderContent();
      return;
    }
    const cartPanel = root.querySelector('#main-content .pos-fast-cart');
    const heading = cartPanel.querySelector('#pos-cart-heading');
    if (heading) {
      heading.textContent = state.cart.length ? `${state.cart.length} producto${state.cart.length === 1 ? '' : 's'}` : 'Vacía';
    }

    const linesEl = cartPanel.querySelector('.cart-lines');
    if (linesEl) {
      linesEl.innerHTML = renderCartLines(state.cart);
      linesEl.querySelectorAll('[data-cart-qty]').forEach((button) =>
        button.addEventListener('click', () => changeQuantity(Number(button.dataset.cartQty), Number(button.dataset.delta)))
      );
      linesEl.querySelectorAll('[data-cart-item-note]').forEach((btn) =>
        btn.addEventListener('click', () => openItemNoteModal(Number(btn.dataset.cartItemNote)))
      );
      linesEl.querySelectorAll('[data-cart-set-qty]').forEach((btn) =>
        btn.addEventListener('click', () => openQuantityModal(Number(btn.dataset.cartSetQty)))
      );
    }

    const totalsEl = cartPanel.querySelector('.cart-totals-block');
    if (totalsEl) {
      totalsEl.innerHTML = renderCartTotals(state.cart, state.posDiscountState);
    }

    const totals = calculateDocument(state.cart, state.posDiscountState || {});
    const selectedTableId = state.posDraft?.tableId ?? state.preselectedTableId ?? '';
    const actionText = selectedTableId
      ? 'Enviar comanda a cocina'
      : (state.posPaymentMethod === 'credit'
        ? `Registrar fiao ${formatMoney(totals.totalCents)}`
        : (state.posPaymentMethod === 'delivery_cod'
          ? `Despachar delivery ${formatMoney(totals.totalCents)}`
          : `Cobrar ${formatMoney(totals.totalCents)}`));

    const submitBtn = root.querySelector('#pos-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = !state.cart.length;
      const span = submitBtn.querySelector('span');
      if (span) span.textContent = actionText;
    }

    const mobileBtn = root.querySelector('.mobile-pos-charge');
    if (mobileBtn) {
      mobileBtn.disabled = !state.cart.length;
      const mobileSpan = mobileBtn.querySelector('span');
      if (mobileSpan) mobileSpan.textContent = selectedTableId ? 'Enviar comanda' : actionText;
    }

    const prebillBtn = root.querySelector('[data-print-cart-prebill]');
    if (prebillBtn) {
      prebillBtn.style.display = state.cart.length ? '' : 'none';
    }

    updatePosChange();

    if (linesEl) iconsRefresh(linesEl);
    updateSafety.setBlocker('application', !destroyed && updateIsBusy());
  }

  function addProduct(id){
    capturePosDraft();
    const product=state.products.find((item)=>item.id===id);
    if(!product)return;
    const stock = Number(product.stock || 0);
    if (stock < 1) {
      toast(`${product.name} está agotado. Abriendo ajuste rápido para reabastecer...`, 'warning');
      state.editingStockProduct = product;
      state.modal = 'stockAdjust';
      renderModal();
      return;
    }
    const line=state.cart.find((item)=>item.productId===id);
    if(line) {
      if (line.quantity >= Math.min(stock, 999)) return toast(`No hay más existencia disponible de ${product.name}.`, 'warning');
      line.quantity+=1;
    }
    else state.cart.push({productId:id,name:product.name,quantity:1,unitPriceCents:product.priceCents,taxRate:product.taxRate||0,notes:''});
    renderPosCartOnly();
    const totals = calculateDocument(state.cart);
    setVFDMessage(product.name.slice(0, 20), `TOT: ${formatMoney(totals.totalCents)}`);
  }

  function changeQuantity(index,delta){
    capturePosDraft();
    if(!state.cart[index])return;
    const line = state.cart[index];
    const product = state.products.find((item) => item.id === line.productId);
    const maximum = Math.min(Number(product?.stock || 0), 999);
    if (delta > 0 && line.quantity >= maximum) return toast(`No hay más existencia disponible de ${line.name}.`, 'warning');
    line.quantity+=delta;
    if(state.cart[index].quantity<=0)state.cart.splice(index,1);
    renderPosCartOnly();
    const totals = calculateDocument(state.cart);
    if (state.cart.length) {
      setVFDMessage('TOTAL CUENTA:', formatMoney(totals.totalCents));
    } else {
      vfdWelcome(state.settings?.name || 'Los Panitas');
    }
  }

  function updatePosSubmitLabel() {
    const totals = calculateDocument(state.cart, state.posDiscountState || {});
    const method = root.querySelector('#pos-payment-method')?.value || 'cash';
    const tableId = root.querySelector('#pos-table-select')?.value || '';
    const printReceipt = root.querySelector('#pos-print-receipt') ? root.querySelector('#pos-print-receipt').checked : (state.posDraft?.printReceipt !== false);
    const badge = root.querySelector('#pos-print-status-badge');
    if (badge) {
      badge.textContent = printReceipt ? 'Con ticket' : 'Sin ticket';
      badge.style.background = printReceipt ? 'rgba(63,185,80,.18)' : 'rgba(255,255,255,.08)';
      badge.style.color = printReceipt ? '#3fb950' : 'var(--muted)';
    }
    const labels = root.querySelectorAll('#pos-submit-label, .mobile-pos-charge span');
    labels.forEach((label) => {
      if (tableId) {
        label.textContent = 'Enviar comanda a cocina';
      } else if (method === 'credit') {
        label.textContent = `Registrar Fiao ${formatMoney(totals.totalCents)}`;
      } else if (method === 'delivery_cod') {
        label.textContent = `Despachar Delivery ${formatMoney(totals.totalCents)}`;
      } else if (!printReceipt) {
        label.textContent = `Cobrar sin ticket ${formatMoney(totals.totalCents)}`;
      } else {
        label.textContent = `Cobrar e Imprimir ${formatMoney(totals.totalCents)}`;
      }
    });
  }

  async function submitPos(event){
    if (event && event.preventDefault) event.preventDefault();
    if (state.saleInProgress || state.checkoutOpening) return toast('El cobro anterior todavía se está procesando.', 'warning');
    if(!state.cart.length)return toast('Agrega al menos un producto a la cuenta.', 'warning');
    const formElement = root.querySelector('#pos-checkout-form');
    if (formElement && !formElement.reportValidity()) return;
    const form = formElement ? new FormData(formElement) : new FormData();
    const tableId = form.get('tableId') || root.querySelector('#pos-table-select')?.value || '';
    const documentType = form.get('documentType') || 'invoice';
    if(!tableId&&!state.capabilities.bill)return toast('Selecciona una mesa para enviar la comanda.','danger');

    const discountVal = Number(form.get('posDiscountValue') || state.posDiscountState?.discount || 0);
    const discountType = form.get('posDiscountType') || state.posDiscountState?.discountType || 'amount';
    const includeLegalTip = form.get('posIncludeLegalTip') === 'on' || Boolean(state.posDiscountState?.includeLegalTip);
    state.posDiscountState = { discount: discountVal, discountType, includeLegalTip };

    const totals = calculateDocument(state.cart, state.posDiscountState);
    const method = form.get('paymentMethod') || root.querySelector('#pos-payment-method')?.value || state.posPaymentMethod || 'cash';
    const isCredit = method === 'credit';
    const isDelivery = method === 'delivery_cod';

    const deliveryDriverId = String(form.get('deliveryDriverId') || '').trim();
    const deliveryDriver = (state.deliveryDrivers || []).find(d => d.id === deliveryDriverId);
    const deliveryDriverName = deliveryDriver ? deliveryDriver.name : String(form.get('deliveryDriverName') || '').trim();
    const deliveryClientName = String(form.get('deliveryClientName') || '').trim();
    const deliveryPhone = String(form.get('deliveryPhone') || '').trim();
    const deliveryAddress = String(form.get('deliveryAddress') || '').trim();
    const rawDeliveryChange = String(root.querySelector('#pos-delivery-change-for')?.value || form.get('deliveryChangeFor') || '').trim();
    const deliveryChangeForCents = rawDeliveryChange && Number(rawDeliveryChange) > 0 ? Math.round(Number(rawDeliveryChange) * 100) : 0;
    const deliveryNotes = String(form.get('deliveryNotes') || '').trim();

    if (isDelivery) {
      if (!deliveryDriverId && !deliveryDriverName) {
        return toast('Selecciona o indica el mensajero/repartidor responsable.', 'warning');
      }
      if (!deliveryAddress) {
        return toast('Indica la dirección de entrega del pedido.', 'warning');
      }
    }

    const clientName = isCredit
      ? String(form.get('fiaoClientName') || '').trim()
      : isDelivery
      ? (deliveryClientName || 'Cliente Delivery')
      : String(form.get('clientName') || 'Consumidor final').trim();
    const clientPhone = isCredit
      ? String(form.get('fiaoClientPhone') || '').trim()
      : isDelivery
      ? deliveryPhone
      : '';
    const clientId = isCredit
      ? String(form.get('fiaoClientId') || '').trim()
      : '';
    const fiaoNotes = isCredit
      ? String(form.get('fiaoNotes') || '').trim()
      : '';
    const fiaoSaveAsClient = isCredit && form.get('fiaoSaveAsClient') === 'on';

    if (isCredit && (!clientName || clientName === 'Consumidor final')) {
      return toast('Escribe el nombre de la persona que se lleva el fiao.', 'warning');
    }

    const isDevueltaOpen = Boolean(root.querySelector('#pos-cash-panel details')?.open);
    const rawCashReceived = root.querySelector('#pos-cash-received')?.value?.trim();
    let cashReceivedCents = (isDevueltaOpen && rawCashReceived && Number(rawCashReceived) > 0)
      ? Math.round(Number(rawCashReceived) * 100)
      : totals.totalCents;

    if (!tableId && method === 'cash' && isDevueltaOpen && rawCashReceived && cashReceivedCents < totals.totalCents) {
      return toast('El efectivo recibido es menor que el total de la cuenta.', 'danger');
    }

    const clientRnc = String(form.get('posClientRnc') || '').trim();
    const ncfType = String(form.get('ncfType') || '');

    if (tableId) {
      try {
        setBusy(event.submitter, true);
        const orderId = await service.createOrder({
          items: state.cart.map(i => ({ ...i })),
          clientName: clientName || 'Consumidor final',
          clientRnc,
          notes: form.get('notes') || '',
          priority: form.get('priority') || 'normal',
          discount: discountVal,
          discountType,
          includeLegalTip,
          tableId
        });
        toast('Comanda enviada a cocina.', 'success');
        beepHardware('ok');
        if (state.settings?.autoPrintKitchen !== false) {
          const table = state.tables.find((item) => item.id === tableId);
          void printOrder(orderId, {
            id:orderId, tableId, tableName:table?.name || 'Mesa', clientName:clientName || 'Consumidor final',
            clientRnc, items:state.cart.map((item) => ({...item})), notes:form.get('notes') || '',
            priority:form.get('priority') || 'normal', ...totals, createdAt:new Date()
          });
        }
        state.cart = [];
        state.preselectedTableId = '';
        resetPosDraft();
        renderContent();
      } catch (err) {
        toast(err.message, 'danger');
      } finally {
        setBusy(event.submitter, false);
      }
      return;
    }

    const cardReference = String(form.get('cardReference') || '').trim();
    const transferReference = String(form.get('transferReference') || '').trim();
    const reference = method === 'card' ? cardReference : (method === 'transfer' ? transferReference : '');

    // El PIN de seis dígitos es el único paso de autorización para una venta rápida.
    // Si no existe un turno, el mismo PIN abre la caja con fondo inicial de RD$0.00.
    state.pendingPosPayload = {
      items: state.cart.map(i => ({ ...i })),
      method,
      reference,
      totals,
      tenderedCents: method === 'cash' ? cashReceivedCents : 0,
      clientId,
      clientName: clientName || 'Consumidor final',
      clientPhone,
      clientRnc,
      fiaoNotes,
      fiaoSaveAsClient,
      deliveryDriverId,
      deliveryDriverName,
      deliveryClientName,
      deliveryPhone,
      deliveryAddress,
      deliveryChangeForCents,
      deliveryNotes,
      printReceipt: form.get('printReceipt') !== null ? form.get('printReceipt') === 'on' : (state.posDraft.printReceipt !== false),
      tableId: '',
      ncfType,
      notes: form.get('notes') || '',
      discount: discountVal,
      discountType,
      includeLegalTip,
      requestId: createOperationId('sale')
    };

    try {
      state.checkoutOpening = true;
      const hasPin = await service.hasMyDrawerPin();
      state.modal = hasPin ? 'checkoutPin' : 'setupCheckoutPin';
      renderModal();
    } catch (error) {
      console.error(error);
      toast('No se pudo verificar el PIN de esta cuenta. Intenta de nuevo.', 'danger');
    } finally {
      state.checkoutOpening = false;
    }
  }

  async function completeDirectSale(payload, employee, submitButton) {
    try {
      setBusy(submitButton, true);
      const isCredit = payload.method === 'credit';
      const isDelivery = payload.method === 'delivery_cod';
      const fiaoNoteCombined = [payload.notes, payload.fiaoNotes].filter(Boolean).join(' | ');
      const docPayload = {
        requestId: payload.requestId,
        documentType: 'invoice',
        clientId: payload.clientId || '',
        clientName: payload.clientName,
        clientPhone: payload.clientPhone || '',
        clientRnc: payload.clientRnc,
        notes: fiaoNoteCombined,
        items: payload.items,
        discount: payload.discount,
        discountType: payload.discountType,
        includeLegalTip: payload.includeLegalTip,
        ncfType: payload.ncfType,
        tableId: payload.tableId,
        cashierId: employee.id,
        cashierName: employee.displayName,
        paymentMethod: payload.method,
        deliveryDriverId: payload.deliveryDriverId || '',
        deliveryDriverName: payload.deliveryDriverName || '',
        deliveryAddress: payload.deliveryAddress || '',
        deliveryPhone: payload.deliveryPhone || '',
        deliveryNotes: payload.deliveryNotes || '',
        deliveryChangeForCents: payload.deliveryChangeForCents || 0,
        deliveryStatus: isDelivery ? 'in_transit' : '',
        payment: {
          method: payload.method,
          reference: payload.reference || '',
          amountCents: (isCredit || isDelivery) ? 0 : payload.totals.totalCents,
          tenderedCents: payload.tenderedCents,
          changeCents: payload.method === 'cash' ? Math.max(0, payload.tenderedCents - payload.totals.totalCents) : 0,
          cashSessionId: state.activeCash?.id || '',
          cashierId: employee.id,
          cashierName: employee.displayName
        }
      };

      // Esta transacción es el punto de verdad: inventario, factura, pago y auditoría se
      // confirman antes de tocar periféricos, para que una impresora fallida nunca borre una venta.
      const created = await service.createDirectDocument(docPayload);
      if (isCredit && payload.fiaoSaveAsClient && payload.clientName && payload.clientName !== 'Consumidor final') {
        const existingClient = (state.clients || []).find(c =>
          (payload.clientId && c.id === payload.clientId) ||
          (c.name && c.name.trim().toLowerCase() === payload.clientName.trim().toLowerCase())
        );
        service.saveClient({
          id: existingClient?.id || payload.clientId || undefined,
          name: payload.clientName,
          phone: payload.clientPhone || existingClient?.phone || '',
          notes: payload.fiaoNotes || existingClient?.notes || '',
          active: true
        }).catch((err) => console.warn('No se pudo guardar automáticamente el cliente fiado:', err));
      }
      const invoiceId = typeof created === 'string' ? created : created.id;
      const changeCents = payload.method === 'cash'
        ? Math.max(0, payload.tenderedCents - payload.totals.totalCents)
        : 0;
      state.lastSaleResult = {
        id: invoiceId,
        invoiceId,
        invoiceNumber: created?.invoiceNumber || 'FACTURA',
        documentType: 'invoice',
        ncf: created?.ncf || '',
        clientId: payload.clientId || '',
        clientName: payload.clientName,
        clientPhone: payload.clientPhone || '',
        clientRnc: payload.clientRnc,
        subtotalCents: payload.totals.subtotalCents,
        taxCents: payload.totals.taxCents,
        discountCents: payload.totals.discountCents || 0,
        tipCents: payload.totals.tipCents || 0,
        totalCents: payload.totals.totalCents,
        paidCents: (isCredit || isDelivery) ? 0 : payload.totals.totalCents,
        tenderedCents: payload.tenderedCents,
        changeCents,
        method: payload.method,
        reference: payload.reference || '',
        cashierName: employee.displayName,
        items: payload.items,
        deliveryDriverId: payload.deliveryDriverId || '',
        deliveryDriverName: payload.deliveryDriverName || '',
        deliveryAddress: payload.deliveryAddress || '',
        deliveryPhone: payload.deliveryPhone || '',
        deliveryNotes: payload.deliveryNotes || '',
        deliveryChangeForCents: payload.deliveryChangeForCents || 0,
        deliveryStatus: isDelivery ? 'in_transit' : '',
        createdAt: new Date()
      };
      if (isCredit) {
        state.lastSaleResult.clientTotalDebtCents = calculateClientTotalDebt(state.lastSaleResult, state.invoices, state.clients);
      }

      state.pendingPosPayload = null;
      state.pendingPosSubmit = null;
      state.cart = [];
      resetPosDraft();
      state.modal = 'saleSuccess';
      beepHardware('ok').catch(() => {});
      setVFDMessage('GRACIAS POR SU VISITA', 'VUELVA PRONTO!').catch(() => {});

      // Periféricos no bloquean la interfaz ni alteran un cobro ya registrado. Los avisos
      // son claros para que el cajero pueda reimprimir desde la pantalla de confirmación.
      const shouldOpenDrawer = !isDelivery && payload.method === 'cash' && state.settings?.autoOpenDrawer !== false;
      const shouldPrint = payload.printReceipt !== false && state.settings?.autoPrintInvoice !== false;
      const receiptToPrint = state.lastSaleResult;
      // Dejar que el navegador pinte primero la confirmación. En la APK antigua el puente
      // nativo es síncrono y un trabajo USB no debe congelar el botón de cobro.
      setTimeout(() => {
        if (shouldOpenDrawer) void kickDrawer({ silentFailure: true });
        if (shouldPrint) void printSaleReceipt(receiptToPrint, { openDrawer: false });
        // "Cambio para" is the customer's tender, not a cash withdrawal.
        // Courier advances are explicit, audited Caja movements, never an
        // unconfirmed write after a completed dispatch or a silent drawer pulse.
      }, 0);
      toast(isCredit ? `Fiao registrado a nombre de ${payload.clientName}.` : isDelivery ? `Pedido delivery despachado con ${payload.deliveryDriverName || 'mensajero'}.` : 'Venta registrada correctamente.', 'success');
      return { ok: true, result: created };
    } catch (err) {
      console.error(err);
      beepHardware('error').catch(() => {});
      toast(err.message || 'No se pudo registrar la venta.', 'danger');
      return { ok: false, error: err };
    } finally {
      setBusy(submitButton, false);
    }
  }

  function checkoutPinModal() {
    const payload = state.pendingPosPayload;
    if (!payload) return '';
    const totals = payload.totals;
    const isCredit = payload.method === 'credit';
    const isDelivery = payload.method === 'delivery_cod';
    const opensDrawer = !isDelivery && payload.method === 'cash' && state.settings?.autoOpenDrawer !== false;
    const actionLabel = isCredit ? 'Registrar Fiao' : isDelivery ? 'Despachar Delivery' : 'Cobrar Venta';
    const submitLabel = isCredit ? 'Registrar fiao' : isDelivery ? 'Despachar y generar ticket' : opensDrawer ? 'Cobrar y abrir gaveta' : 'Confirmar cobro';
    return `
      <div class="modal-backdrop" data-modal-close>
        <article class="modal-card" style="max-width:420px;" data-modal-card>
          <header>
            <div>
              <span class="eyebrow">Confirmación de cobro</span>
              <h2><i data-lucide="key-round" style="width:20px;height:20px;display:inline-block;vertical-align:-3px;color:var(--brand-2);"></i> ${actionLabel}</h2>
            </div>
            <button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button>
          </header>
          <form id="checkout-pin-form" class="stack-form" style="padding-top:8px;">
            <p class="muted">Cuenta responsable: <strong>${escapeHtml(user.displayName || user.username)}</strong>. Usa el PIN de esta cuenta.</p>
            <div style="padding:10px 14px;background:rgba(239,189,105,.1);border:1px solid rgba(239,189,105,.25);border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
              <span>Total a cobrar:</span>
              <strong style="font-size:1.35rem;color:var(--brand-2);">${formatMoney(totals.totalCents)}</strong>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;margin:6px 0;">
              <span style="font-size:0.84rem;color:var(--muted);display:flex;align-items:center;gap:6px;">
                <i data-lucide="printer" style="width:15px;height:15px;"></i> Factura impresa:
              </span>
              <button type="button" class="button compact" id="chk-toggle-print" style="font-size:0.8rem;padding:4px 10px;font-weight:700;${payload.printReceipt !== false ? 'background:rgba(63,185,80,.18);color:#3fb950;border:1px solid rgba(63,185,80,.4);' : 'background:rgba(255,255,255,.08);color:var(--muted);border:1px solid var(--line);'}">
                ${payload.printReceipt !== false ? '✓ Sí, imprimir' : '✕ No imprimir'}
              </button>
            </div>
            <p style="margin:6px 0; font-size:.82rem; color:var(--muted);text-align:center;">
              ${isCredit ? 'Digita tu PIN de 6 dígitos para registrar la cuenta por cobrar.' : isDelivery ? 'Digita tu PIN de 6 dígitos para autorizar el despacho. El dinero no entra a la caja hasta que el repartidor entregue lo cobrado.' : 'Digita tu PIN de 6 dígitos. Si no hay una sesión de caja, este mismo paso la inicia y registra el cobro.'}
            </p>
            <input id="checkout-pin-input" name="pin" type="password" inputmode="none" pattern="[0-9]{6}" maxlength="6" placeholder="" required readonly tabindex="-1" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;">
            <div class="pin-slots-container" id="chk-pin-slots">
              <span class="pin-slot" data-slot="0"></span>
              <span class="pin-slot" data-slot="1"></span>
              <span class="pin-slot" data-slot="2"></span>
              <span class="pin-slot" data-slot="3"></span>
              <span class="pin-slot" data-slot="4"></span>
              <span class="pin-slot" data-slot="5"></span>
            </div>
            <div class="pin-pad" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin:6px 0 10px;">
              ${[1,2,3,4,5,6,7,8,9].map((n) => `<button type="button" class="button secondary pin-num-btn" data-chk-pin="${n}" style="font-size:1.35rem;font-weight:700;padding:12px 0;">${n}</button>`).join('')}
              <button type="button" class="button secondary pin-clear-btn" id="chk-pin-clear" style="font-size:.85rem;font-weight:600;padding:12px 0;color:#f85149;">Borrar</button>
              <button type="button" class="button secondary pin-num-btn" data-chk-pin="0" style="font-size:1.35rem;font-weight:700;padding:12px 0;">0</button>
              <button type="button" class="button secondary pin-del-btn" id="chk-pin-del" style="font-size:1.2rem;font-weight:700;padding:12px 0;">⌫</button>
            </div>
            <div id="checkout-pin-error" style="color:#f85149;font-size:0.84rem;min-height:20px;text-align:center;font-weight:600;"></div>
            <footer class="modal-actions" style="margin-top:0;">
              <button type="button" class="button secondary" data-modal-close>Cancelar</button>
            <button class="button primary" type="submit" id="checkout-pin-submit"><i data-lucide="badge-check"></i> ${submitLabel}</button>
            </footer>
          </form>
        </article>
      </div>
    `;
  }

  function setupCheckoutPinModal() {
    const forTable = state.pendingPinDestination === 'charge';
    return `
      <div class="modal-backdrop" data-modal-close>
        <article class="modal-card" style="max-width:420px;" data-modal-card>
          <header>
            <div>
              <span class="eyebrow">${forTable ? 'Primer cobro de mesa' : 'Primer cobro'}</span>
              <h2>Elige tu PIN de caja</h2>
            </div>
            <button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button>
          </header>
          <form id="setup-checkout-pin-form" class="stack-form" style="padding-top:8px;">
            <p style="margin:0 0 10px;color:var(--muted);font-size:.85rem;">Crea un PIN personal de 6 dígitos. ${forTable ? 'Después volverás al cobro de la mesa para autorizarlo.' : 'Después, cada cobro será: elegir productos → Cobrar → PIN.'}</p>
            <label>PIN de 6 dígitos
              <input name="pin" type="password" data-touch-numpad="integer" data-numpad-title="Crear PIN (6 dígitos)" maxlength="6" placeholder="••••••" required autofocus readonly inputmode="none" style="letter-spacing:10px;font-size:1.55rem;text-align:center;font-weight:800;cursor:pointer;">
            </label>
            <label>Confirmar PIN
              <input name="confirmPin" type="password" data-touch-numpad="integer" data-numpad-title="Confirmar PIN (6 dígitos)" maxlength="6" placeholder="••••••" required readonly inputmode="none" style="letter-spacing:10px;font-size:1.55rem;text-align:center;font-weight:800;cursor:pointer;">
            </label>
            <footer class="modal-actions" style="margin-top:6px;">
              <button type="button" class="button secondary" data-modal-close>Cancelar</button>
              <button class="button primary" type="submit"><i data-lucide="key-round"></i> Guardar y continuar</button>
            </footer>
          </form>
        </article>
      </div>
    `;
  }

  function saleSuccessModal() {
    const data = state.lastSaleResult;
    if (!data) return '';
    const isCash = data.method === 'cash';
    const isCredit = data.method === 'credit';
    const isDelivery = data.method === 'delivery_cod';
    return `
      <div class="modal-backdrop" data-modal-close>
        <article class="modal-card" style="max-width:460px;text-align:center;" data-modal-card>
          <header style="justify-content:center;border-bottom:none;padding-bottom:0;">
            <div style="text-align:center;">
              <div style="width:52px;height:52px;border-radius:50%;background:rgba(63,185,80,.15);color:#3fb950;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;">
                <i data-lucide="badge-check" style="width:32px;height:32px;"></i>
              </div>
              <span class="eyebrow">${isCredit ? 'Fiao Registrado' : isDelivery ? 'Delivery Despachado' : 'Venta Completada'}</span>
              <h2 style="font-size:1.35rem;">${escapeHtml(data.invoiceNumber)}</h2>
            </div>
          </header>
          <div style="padding:10px 0;">
            ${isCash && data.changeCents > 0 ? `
              <div style="background:rgba(63,185,80,.12);border:2px solid rgba(63,185,80,.4);border-radius:14px;padding:16px;margin:6px 0 14px;">
                <span style="font-size:0.82rem;text-transform:uppercase;letter-spacing:1px;color:#3fb950;font-weight:700;display:block;">Cambio / Devuelta</span>
                <strong style="font-size:2.8rem;color:#3fb950;font-weight:900;line-height:1.1;display:block;">${formatMoney(data.changeCents)}</strong>
                <div style="display:flex;justify-content:space-around;margin-top:10px;font-size:0.85rem;color:#ccc;border-top:1px solid rgba(255,255,255,.08);padding-top:8px;">
                  <span>Total: <b>${formatMoney(data.totalCents)}</b></span>
                  <span>Recibido: <b>${formatMoney(data.tenderedCents)}</b></span>
                </div>
              </div>
            ` : isCredit ? `
              <div style="background:rgba(239,189,105,.12);border:1px solid rgba(239,189,105,.3);border-radius:12px;padding:14px;margin:6px 0 12px;">
                <span style="font-size:0.8rem;color:var(--muted);text-transform:uppercase;">Cliente Fiado</span>
                <strong style="font-size:1.35rem;color:#fff;display:block;margin:4px 0;">${escapeHtml(data.clientName)}</strong>
                ${data.clientPhone ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:0.9rem;color:var(--brand-2);margin-bottom:6px;"><i data-lucide="phone" style="width:14px;height:14px;"></i> ${escapeHtml(data.clientPhone)}</span><br>` : ''}
                ${(data.clientTotalDebtCents && Number(data.clientTotalDebtCents) > Number(data.totalCents)) ? `
                  <span style="font-size:1.25rem;color:#f85149;font-weight:800;display:block;">Deuda Total: ${formatMoney(data.clientTotalDebtCents)}</span>
                  <small style="color:var(--muted);display:block;margin-top:2px;">(Esta compra: ${formatMoney(data.totalCents)} · Anterior: ${formatMoney(data.clientTotalDebtCents - data.totalCents)})</small>
                ` : `
                  <span style="font-size:1.15rem;color:#f85149;font-weight:700;">Deuda: ${formatMoney(data.totalCents)}</span>
                `}
              </div>
            ` : isDelivery ? `
              <div style="background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35);border-radius:12px;padding:14px;margin:6px 0 12px;text-align:left;">
                <span style="font-size:0.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;font-weight:700;">Repartidor Asignado</span>
                <strong style="font-size:1.3rem;color:#f59e0b;display:block;margin:3px 0 8px;">🛵 ${escapeHtml(data.deliveryDriverName || 'Mensajero')}</strong>
                <div style="font-size:0.88rem;color:#ddd;display:flex;flex-direction:column;gap:3px;">
                  <div><span style="color:var(--muted);">Cliente:</span> <b>${escapeHtml(data.clientName || 'Cliente')}</b></div>
                  ${data.deliveryPhone ? `<div><span style="color:var(--muted);">Teléfono:</span> <b>${escapeHtml(data.deliveryPhone)}</b></div>` : ''}
                  ${data.deliveryAddress ? `<div><span style="color:var(--muted);">Dirección:</span> <b>${escapeHtml(data.deliveryAddress)}</b></div>` : ''}
                  ${data.deliveryChangeForCents > data.totalCents ? `
                    </div>
                    <div style="margin-top:10px;background:rgba(239,68,68,.15);border:2px solid rgba(239,68,68,.5);border-radius:10px;padding:12px 14px;">
                      <span style="font-size:0.75rem;text-transform:uppercase;letter-spacing:.5px;color:#f87171;font-weight:700;display:block;">Devuelta al cliente (informativo)</span>
                      <strong style="font-size:2rem;color:#f87171;font-weight:900;display:block;line-height:1.15;">${formatMoney(data.deliveryChangeForCents - data.totalCents)}</strong>
                      <small style="color:#fca5a5;font-size:0.8rem;">Pagará con ${formatMoney(data.deliveryChangeForCents)}. No se ha retirado efectivo de caja. Si adelantas cambio al repartidor, registra la salida y su devolución en Caja.</small>
                    </div>
                    <div style="display:none;">` : ''}
                </div>
                <div style="margin-top:10px;padding:8px 10px;background:rgba(0,0,0,.3);border-radius:8px;font-size:0.8rem;color:var(--muted);border:1px solid rgba(255,255,255,.05);">
                  ⏳ El cobro de <b>${formatMoney(data.totalCents)}</b> quedará pendiente de liquidar en la sección de Deliveries.
                </div>
              </div>
            ` : `
              <div style="background:rgba(255,255,255,.04);border-radius:12px;padding:14px;margin:6px 0 12px;">
                <span style="font-size:0.8rem;color:var(--muted);">Total Cobrado (${data.method === 'card' ? 'Tarjeta' : data.method === 'transfer' ? 'Transferencia' : 'Efectivo'})</span>
                <strong style="font-size:2rem;color:#fff;display:block;margin-top:2px;">${formatMoney(data.totalCents)}</strong>
                ${data.reference ? `<small style="color:var(--brand-2);display:block;margin-top:6px;font-size:0.84rem;font-weight:700;">Ref / Aprobación: ${escapeHtml(data.reference)}</small>` : ''}
              </div>
            `}
            <p style="font-size:0.82rem;color:var(--muted);margin:0;">Atendido por: <strong>${escapeHtml(data.cashierName || 'Cajero')}</strong></p>
          </div>
          <footer class="modal-actions" style="justify-content:center;gap:10px;margin-top:8px;">
            <button type="button" class="button secondary" data-print-last-sale style="font-size:0.95rem;padding:10px 16px;">
              <i data-lucide="printer"></i> Imprimir Factura
            </button>
            <button type="button" class="button primary" data-modal-close style="font-size:0.95rem;padding:10px 20px;font-weight:700;">
              <i data-lucide="plus"></i> Siguiente Venta
            </button>
          </footer>
        </article>
      </div>
    `;
  }

  async function saveDeliveryDriver(event) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const name = String(f.get('name') || '').trim();
    if (!name) return toast('El nombre del repartidor es obligatorio.', 'warning');
    await perform(() => service.saveDeliveryDriver({
      id: f.get('id') || undefined,
      name,
      phone: String(f.get('phone') || '').trim(),
      vehicle: String(f.get('vehicle') || '').trim(),
      notes: String(f.get('notes') || '').trim(),
      active: f.get('active') === 'on'
    }), f.get('id') ? 'Repartidor actualizado.' : 'Repartidor registrado.', closeModal);
  }

  async function saveProduct(event){event.preventDefault();const f=new FormData(event.currentTarget);await perform(()=>service.saveProduct({id:f.get('id'),name:f.get('name'),sku:f.get('sku'),category:f.get('category'),priceCents:toCents(f.get('price')),costCents:toCents(f.get('cost')||0),taxRate:Number(f.get('taxRate')||0),stock:Number(f.get('stock')||0),active:f.get('active')==='on'}),'Producto guardado.',closeModal);}
  async function saveMobileInventory(event){
    event.preventDefault();
    const form = event.currentTarget;
    const targetStock = Number(new FormData(form).get('targetStock'));
    if (!Number.isFinite(targetStock) || targetStock < 0) return toast('Indica una existencia válida, igual o mayor que cero.', 'warning');
    const submit = form.querySelector('button[type="submit"]');
    setBusy(submit, true);
    const result = await perform(() => service.registerInventoryCount({
      productId: form.dataset.productId,
      targetStock,
      reason: new FormData(form).get('reason')
    }), 'Inventario actualizado y registrado.');
    setBusy(submit, false);
    if (result.ok) renderContent();
  }

  function bindStockAdjustModal(modalRoot) {
    const form = modalRoot.querySelector('#stock-adjust-form');
    if (!form) return;

    const opInput = form.querySelector('#adjust-operation');
    const reasonInput = form.querySelector('#adjust-reason-category');
    const qtyInput = form.querySelector('#stock-adjust-qty');
    const cost = Number(form.querySelector('#adjust-unit-cost')?.value || 0);
    const price = Number(form.querySelector('#adjust-unit-price')?.value || 0);
    const currentStock = Number(form.querySelector('#adjust-current-stock')?.value || 0);
    const impactTitle = form.querySelector('#adjust-impact-title');
    const impactVal = form.querySelector('#adjust-impact-value');
    const qtyLabel = form.querySelector('#adjust-qty-label');
    const opBtns = form.querySelectorAll('.adjust-op-btn');
    const reasonChips = form.querySelectorAll('.reason-chip');

    function updateCalculations() {
      const op = opInput?.value || 'count';
      const qty = Math.max(0, Number(qtyInput?.value || 0));

      if (op === 'waste') {
        const unitVal = cost > 0 ? cost : price;
        const lossCents = Math.round(unitVal * qty);
        if (impactTitle) {
          impactTitle.textContent = 'Pérdida Financiera Estimada:';
          impactTitle.style.color = '#f85149';
        }
        if (impactVal) {
          impactVal.textContent = formatMoney(lossCents);
          impactVal.style.color = '#f85149';
        }
      } else if (op === 'prep') {
        const resulting = currentStock + qty;
        if (impactTitle) {
          impactTitle.textContent = 'Nuevo Stock en Vitrina:';
          impactTitle.style.color = '#3fb950';
        }
        if (impactVal) {
          impactVal.textContent = `${resulting} uds (+${qty})`;
          impactVal.style.color = '#3fb950';
        }
      } else {
        const delta = qty - currentStock;
        const sign = delta >= 0 ? `+${delta}` : `${delta}`;
        if (impactTitle) {
          impactTitle.textContent = 'Ajuste de Conteo Físico:';
          impactTitle.style.color = '#38bdf8';
        }
        if (impactVal) {
          impactVal.textContent = `${sign} uds (Final: ${qty})`;
          impactVal.style.color = '#38bdf8';
        }
      }
    }

    opBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const op = btn.dataset.adjustOp;
        if (opInput) opInput.value = op;

        opBtns.forEach((b) => {
          const isAct = b === btn;
          b.classList.toggle('active', isAct);
          if (b.dataset.adjustOp === 'waste') {
            b.style.background = isAct ? 'rgba(248,81,73,.25)' : 'rgba(255,255,255,.04)';
            b.style.color = isAct ? '#f85149' : '#cbd5e1';
          } else if (b.dataset.adjustOp === 'prep') {
            b.style.background = isAct ? 'rgba(63,185,80,.25)' : 'rgba(255,255,255,.04)';
            b.style.color = isAct ? '#3fb950' : '#cbd5e1';
          } else {
            b.style.background = isAct ? 'rgba(56,189,248,.25)' : 'rgba(255,255,255,.04)';
            b.style.color = isAct ? '#38bdf8' : '#cbd5e1';
          }
        });

        if (op === 'waste') {
          if (qtyLabel) qtyLabel.textContent = 'Cantidad de Unidades a Descartar *';
          if (reasonInput) reasonInput.value = 'waste_unsold';
        } else if (op === 'prep') {
          if (qtyLabel) qtyLabel.textContent = 'Cantidad de Unidades Preparadas / Entrantes *';
          if (reasonInput) reasonInput.value = 'production_demand';
        } else {
          if (qtyLabel) qtyLabel.textContent = 'Existencia Real Contada en Vitrina *';
          if (reasonInput) reasonInput.value = 'audit_count';
        }

        reasonChips.forEach((chip) => {
          const isMatch = chip.dataset.reasonCategory === reasonInput?.value;
          chip.classList.toggle('active', isMatch);
          chip.style.background = isMatch ? 'var(--brand-2)' : 'rgba(255,255,255,.05)';
          chip.style.color = isMatch ? '#000' : '#cbd5e1';
          chip.style.borderColor = isMatch ? 'var(--brand-2)' : 'rgba(255,255,255,.2)';
        });

        updateCalculations();
      });
    });

    reasonChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const cat = chip.dataset.reasonCategory;
        const op = chip.dataset.reasonOp;
        if (reasonInput) reasonInput.value = cat;

        if (op && op !== opInput?.value) {
          const correspondingOpBtn = form.querySelector(`.adjust-op-btn[data-adjust-op="${op}"]`);
          if (correspondingOpBtn) correspondingOpBtn.click();
        }

        reasonChips.forEach((c) => {
          const isAct = c === chip;
          c.classList.toggle('active', isAct);
          c.style.background = isAct ? 'var(--brand-2)' : 'rgba(255,255,255,.05)';
          c.style.color = isAct ? '#000' : '#cbd5e1';
          c.style.borderColor = isAct ? 'var(--brand-2)' : 'rgba(255,255,255,.2)';
        });
      });
    });

    form.querySelectorAll('[data-quick-adjust-qty]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.quickAdjustQty;
        if (val === 'all') {
          if (qtyInput) qtyInput.value = String(currentStock);
        } else {
          const step = Number(val);
          const cur = Number(qtyInput?.value || 0);
          if (qtyInput) qtyInput.value = String(cur + step);
        }
        updateCalculations();
      });
    });

    qtyInput?.addEventListener('input', updateCalculations);
    qtyInput?.addEventListener('change', updateCalculations);
    updateCalculations();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('#stock-adjust-submit-btn');
      const data = new FormData(form);
      const productId = String(data.get('productId') || '').trim();
      const operation = String(data.get('operation') || 'count');
      const reasonCategory = String(data.get('reasonCategory') || 'audit_count');
      const quantity = Number(data.get('quantity') || 0);
      const notes = String(data.get('notes') || '').trim();
      const pin = String(data.get('pin') || '').trim();

      if (!/^\d{6}$/.test(pin)) {
        return toast('Ingresa el PIN de seguridad de 6 dígitos.', 'warning');
      }

      setBusy(submitBtn, true);
      try {
        await service.verifyDrawerPin(pin, 'Ajuste de inventario');
        const reasonMeta = getInventoryReason(reasonCategory);

        const adjustInput = {
          productId,
          operation,
          reasonCategory,
          reason: reasonMeta.label,
          notes
        };

        if (operation === 'count') {
          adjustInput.targetStock = quantity;
        } else {
          adjustInput.quantity = quantity;
        }

        const res = await perform(() => service.adjustInventoryItem(adjustInput), null, closeModal);
        if (res.ok) {
          const pName = state.editingStockProduct?.name || 'Producto';
          if (operation === 'waste') {
            toast(`Merma registrada: ${quantity} uds de ${pName}.`, 'success');
          } else if (operation === 'prep') {
            toast(`Cocinado registrado: +${quantity} uds de ${pName}.`, 'success');
          } else {
            toast(`Conteo físico registrado: ${quantity} uds de ${pName}.`, 'success');
          }
          state.editingStockProduct = null;
        }
      } catch (err) {
        toast(err?.message || 'Error al autorizar ajuste.', 'danger');
      } finally {
        setBusy(submitBtn, false);
      }
    });
  }

  function bindEndDayWasteModal(modalRoot) {
    const form = modalRoot.querySelector('#end-day-waste-form');
    if (!form) return;

    const totalCentsEl = form.querySelector('#batch-waste-total-cents');
    const totalUnitsEl = form.querySelector('#batch-waste-units-count');
    const headerCb = form.querySelector('#batch-check-header');
    const rowCbs = form.querySelectorAll('.batch-waste-checkbox');
    const selectAllBtn = form.querySelector('#batch-select-all');
    const deselectAllBtn = form.querySelector('#batch-deselect-all');
    const targetInputs = form.querySelectorAll('.batch-target-stock');

    function recalculate() {
      let totalLoss = 0;
      let totalUnits = 0;

      form.querySelectorAll('tr[data-batch-row]').forEach((row) => {
        const cb = row.querySelector('.batch-waste-checkbox');
        const targetInput = row.querySelector('.batch-target-stock');
        const lossEl = row.querySelector('.batch-item-loss');
        const cost = Number(row.dataset.cost || 0);
        const currentStock = Number(row.dataset.stock || 0);

        if (cb && cb.checked) {
          const target = Math.max(0, Number(targetInput?.value || 0));
          const discarded = Math.max(0, currentStock - target);
          const itemLoss = Math.round(cost * discarded);
          totalLoss += itemLoss;
          totalUnits += discarded;
          if (lossEl) lossEl.textContent = formatMoney(itemLoss);
          row.style.opacity = '1';
        } else {
          if (lossEl) lossEl.textContent = 'RD$ 0.00';
          row.style.opacity = '0.4';
        }
      });

      if (totalCentsEl) totalCentsEl.textContent = formatMoney(totalLoss);
      if (totalUnitsEl) totalUnitsEl.textContent = `(${totalUnits} unidades)`;
    }

    headerCb?.addEventListener('change', () => {
      rowCbs.forEach((cb) => { cb.checked = headerCb.checked; });
      recalculate();
    });

    rowCbs.forEach((cb) => {
      cb.addEventListener('change', () => {
        recalculate();
      });
    });

    selectAllBtn?.addEventListener('click', () => {
      if (headerCb) headerCb.checked = true;
      rowCbs.forEach((cb) => { cb.checked = true; });
      targetInputs.forEach((inp) => { inp.value = '0'; });
      recalculate();
    });

    deselectAllBtn?.addEventListener('click', () => {
      if (headerCb) headerCb.checked = false;
      rowCbs.forEach((cb) => { cb.checked = false; });
      recalculate();
    });

    targetInputs.forEach((inp) => {
      inp.addEventListener('input', recalculate);
      inp.addEventListener('change', recalculate);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('#batch-waste-submit-btn');
      const data = new FormData(form);
      const reasonCategory = String(data.get('reasonCategory') || 'waste_unsold');
      const notes = String(data.get('notes') || '').trim();
      const pin = String(data.get('pin') || '').trim();

      if (!/^\d{6}$/.test(pin)) {
        return toast('Ingresa el PIN de seguridad de 6 dígitos.', 'warning');
      }

      const items = [];
      form.querySelectorAll('tr[data-batch-row]').forEach((row) => {
        const cb = row.querySelector('.batch-waste-checkbox');
        if (!cb || !cb.checked) return;
        const productId = row.dataset.productId;
        const product = (state.products || []).find((p) => p.id === productId);
        const prev = Number(row.dataset.stock || 0);
        const targetInput = row.querySelector('.batch-target-stock');
        const target = Math.max(0, Number(targetInput?.value || 0));
        if (target < prev) {
          items.push({
            productId,
            productName: product?.name || 'Producto',
            previousStock: prev,
            targetStock: target,
            costCents: product?.costCents || product?.priceCents || 0,
            priceCents: product?.priceCents || 0
          });
        }
      });

      if (!items.length) {
        return toast('No hay productos seleccionados con reducción de stock.', 'warning');
      }

      setBusy(submitBtn, true);
      try {
        await service.verifyDrawerPin(pin, 'Cierre de vitrina - Descarte de mermas');
        const reasonMeta = getInventoryReason(reasonCategory);
        const res = await perform(() => service.batchWasteAdjustment({
          items,
          reasonCategory,
          reason: reasonMeta.label,
          notes
        }), null, closeModal);

        if (res.ok) {
          toast(`Cierre de vitrina registrado: ${items.length} productos ajustados como merma.`, 'success');
        }
      } catch (err) {
        toast(err?.message || 'Error al autorizar el cierre de vitrina.', 'danger');
      } finally {
        setBusy(submitBtn, false);
      }
    });
  }

  function bindPayrollPaymentModal(modalRoot) {
    const form = modalRoot.querySelector('#payroll-payment-form');
    if (!form) return;
    // Keep the same ID across failed submits: an uncertain network response
    // must never turn a retry into a second cash withdrawal.
    const payrollRequestId = createOperationId('payroll');
    let payrollSubmitting = false;

    const empSelect = form.querySelector('#payroll-emp-select');
    const baseInput = form.querySelector('#payroll-base-amount');
    const bonusInput = form.querySelector('#payroll-bonus-amount');
    const dedInput = form.querySelector('#payroll-deductions-amount');
    const netDisplay = form.querySelector('#payroll-net-display');
    const methodRadios = form.querySelectorAll('input[name="paymentMethod"]');
    const cashWarning = form.querySelector('#payroll-cash-warning');
    const submitBtn = form.querySelector('#payroll-submit-btn');

    function recalculate() {
      const baseCents = toCents(baseInput?.value || 0);
      const bonusCents = toCents(bonusInput?.value || 0);
      const dedCents = toCents(dedInput?.value || 0);
      const netCents = calculatePayrollNetCents(baseCents, bonusCents, dedCents).netAmountCents;
      if (netDisplay) netDisplay.textContent = formatMoney(netCents);
    }

    empSelect?.addEventListener('change', () => {
      const selectedOption = empSelect.options[empSelect.selectedIndex];
      if (!selectedOption) return;
      const baseCents = Number(selectedOption.dataset.baseCents || 0);
      const preferredMethod = selectedOption.dataset.method || 'cash';
      if (baseInput) baseInput.value = (baseCents / 100).toFixed(2);
      methodRadios.forEach((r) => {
        r.checked = r.value === preferredMethod;
      });
      if (cashWarning) {
        cashWarning.style.display = preferredMethod === 'cash' ? 'block' : 'none';
      }
      recalculate();
    });

    baseInput?.addEventListener('input', recalculate);
    baseInput?.addEventListener('change', recalculate);
    bonusInput?.addEventListener('input', recalculate);
    bonusInput?.addEventListener('change', recalculate);
    dedInput?.addEventListener('input', recalculate);
    dedInput?.addEventListener('change', recalculate);

    methodRadios.forEach((r) => {
      r.addEventListener('change', () => {
        if (cashWarning) {
          cashWarning.style.display = r.value === 'cash' ? 'block' : 'none';
        }
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (payrollSubmitting) return;
      const f = new FormData(form);
      const employeeId = f.get('employeeId');
      if (!employeeId) return toast('Selecciona un empleado.', 'warning');
      const employee = (state.employees || []).find((x) => x.id === employeeId);
      if (!employee) return toast('Empleado no encontrado.', 'danger');

      const concept = f.get('concept') || 'salary_regular';
      const period = String(f.get('period') || '').trim();
      const baseSalaryCents = toCents(f.get('baseSalary') || 0);
      const bonusCents = toCents(f.get('bonus') || 0);
      const deductionsCents = toCents(f.get('deductions') || 0);
      const paymentMethod = f.get('paymentMethod') || 'cash';
      const notes = String(f.get('notes') || '').trim();
      const shouldPrint = form.querySelector('[name="printReceipt"]')?.checked ?? true;
      const pin = String(f.get('pin') || '').trim();

      if (!/^\d{6}$/.test(pin)) {
        return toast('Ingresa el PIN de seguridad de 6 dígitos.', 'warning');
      }

      if (paymentMethod === 'cash' && !state.activeCash?.id) {
        return toast('Para dispensar en efectivo debe haber una caja abierta.', 'warning');
      }

      payrollSubmitting = true;
      setBusy(submitBtn, true);
      try {
        const verifyRes = await service.verifyDrawerPin(pin, `Desembolso de nómina - ${employee.name}`);
        const outcome = await perform(() => service.createPayrollPayment({
          requestId: payrollRequestId,
          employeeId,
          concept,
          period,
          baseSalaryCents,
          bonusCents,
          deductionsCents,
          paymentMethod,
          notes,
          cashSessionId: paymentMethod === 'cash' ? state.activeCash.id : null,
          authorizedBy: verifyRes.user.id || user.uid,
          authorizedByName: verifyRes.user.displayName || user.displayName || 'Administrador'
        }), 'Pago de nómina registrado con éxito.', closeModal);

        if (outcome.ok) {
          const paymentResult = outcome.result;
          if (paymentMethod === 'cash' && state.settings?.autoOpenDrawer !== false) {
            void kickDrawer({ silentFailure: true });
          }
          if (shouldPrint) {
            void printPayrollPayment(paymentResult);
          }
        }
      } catch (err) {
        beepHardware('error');
        toast(err?.message || 'Error al autorizar el pago de nómina.', 'danger');
      } finally {
        payrollSubmitting = false;
        setBusy(submitBtn, false);
      }
    });
  }

  async function saveEmployee(event) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const name = String(f.get('name') || '').trim();
    if (!name) return toast('El nombre del empleado es obligatorio.', 'warning');
    const roleTitle = String(f.get('roleTitle') || '').trim();
    if (!roleTitle) return toast('El cargo o función es obligatorio.', 'warning');
    const baseSalary = f.get('baseSalary');
    const baseSalaryCents = toCents(baseSalary || 0);
    if (baseSalaryCents <= 0) return toast('Ingresa un salario base válido mayor que cero.', 'warning');

    await perform(() => service.saveEmployee({
      id: f.get('id') || undefined,
      name,
      cedula: String(f.get('cedula') || '').trim(),
      phone: String(f.get('phone') || '').trim(),
      roleTitle,
      baseSalaryCents,
      frequency: f.get('frequency') || 'biweekly',
      preferredMethod: f.get('preferredMethod') || 'cash',
      bankAccount: String(f.get('bankAccount') || '').trim(),
      notes: String(f.get('notes') || '').trim(),
      active: f.get('active') === 'on'
    }), f.get('id') ? 'Empleado actualizado.' : 'Empleado registrado.', closeModal);
  }
  async function saveClient(event){event.preventDefault();const f=new FormData(event.currentTarget);await perform(()=>service.saveClient({id:f.get('id'),name:f.get('name'),rnc:f.get('rnc'),phone:f.get('phone'),email:f.get('email'),address:f.get('address'),notes:f.get('notes')||'',creditLimitCents:toCents(f.get('creditLimit')||0),active:f.get('active')==='on'}),'Cliente guardado.',closeModal);}
  async function saveUserAccess(event){event.preventDefault();const f=new FormData(event.currentTarget);if(!f.get('uid')&&f.get('password')!==f.get('passwordConfirm'))return toast('Las contraseñas no coinciden.','danger');await perform(()=>service.saveUserAccess({uid:f.get('uid'),displayName:f.get('displayName'),username:f.get('username'),password:f.get('password'),role:f.get('role'),active:f.get('active')==='on'}),f.get('uid')?'Acceso actualizado.':'Usuario creado correctamente.',closeModal);}
  async function submitDrawerPinChange(event){
    event.preventDefault();
    const f=new FormData(event.currentTarget);
    const pin = String(f.get('drawerPin') || '').trim();
    const confirm = String(f.get('drawerPinConfirm') || '').trim();
    if (!/^\d{6}$/.test(pin)) return toast('El PIN debe tener exactamente 6 dígitos.', 'warning');
    if (pin !== confirm) return toast('Los PINes no coinciden.', 'danger');
    await perform(()=>service.saveMyDrawerPin(pin),'PIN de gaveta actualizado.',closeModal);
  }

  async function openCash(event){
    event.preventDefault();
    const f=new FormData(event.currentTarget);
    const outcome = await authorizeCashForm(event, 'Apertura de turno', () => service.openCashSession({openingCents:toCents(f.get('opening')),notes:f.get('notes')}), 'Caja abierta.', closeModal);
    if (!outcome.ok) return;
    state.activeCash = { id: typeof outcome.result === 'string' ? outcome.result : outcome.result.id, status:'open', openingCents:toCents(f.get('opening')), openedBy:user.uid, openedByName:user.displayName || user.username || 'Cajero', optimistic:true };
    if (state.settings?.autoOpenDrawer !== false) kickDrawer();
    resumePendingPosSubmit();
  }

  async function closeCash(event){
    event.preventDefault();
    const f=new FormData(event.currentTarget);
    const sessionId = state.activeCash?.id;
    if (!sessionId) return toast('No hay caja activa para cerrar.', 'warning');
    const outcome = await authorizeCashForm(event, 'Cierre de turno', () => service.closeCashSession(sessionId,{closingCents:toCents(f.get('closing')),expectedCents:Number(f.get('expected')),notes:f.get('notes')}), 'Caja cerrada.', closeModal);
    if (!outcome.ok) return;
    state.activeCash = null;
    if (state.settings?.autoOpenDrawer !== false) kickDrawer();
    await printCashSession(sessionId, 'Z', outcome.result);
  }

  async function createCashMovement(event){
    event.preventDefault();
    if(!state.activeCash)return toast('Abre una caja antes de registrar movimientos.','danger');
    const form=event.currentTarget;
    const f=new FormData(form);
    const payload = { cashSessionId: state.activeCash.id, type: f.get('type'), amountCents: toCents(f.get('amount')), reason: String(f.get('reason') || '').trim() };
    const fingerprint = JSON.stringify(payload);
    if (movementAttempt?.fingerprint !== fingerprint) movementAttempt = { fingerprint, requestId: createOperationId('cash-movement') };
    const outcome = await authorizeCashForm(event, 'Registro de entrada/salida', () => service.createCashMovement({
      ...payload, requestId: movementAttempt.requestId
    }), 'Movimiento de caja registrado.', () => { movementAttempt = null; form.reset(); });
    if (outcome.ok && state.settings?.autoOpenDrawer !== false) void kickDrawer();
  }

  async function authorizeCashForm(event, reason, task, success, after) {
    const form = event.currentTarget;
    if (cashFormInProgress || !form.reportValidity()) return { ok: false };
    cashFormInProgress = true;
    const button = form.querySelector('button[type="submit"]');
    const pinInput = form.querySelector('[name=pin]');
    const pin = pinInput?.value || '';
    setBusy(button, true);
    try {
      return await perform(async () => {
        await service.verifyDrawerPin(pin, reason);
        return task();
      }, success, after);
    } finally {
      if (pinInput) pinInput.value = '';
      cashFormInProgress = false;
      setBusy(button, false);
    }
  }

  async function saveSettings(event){
    event.preventDefault();
    const f=Object.fromEntries(new FormData(event.currentTarget));
    f.defaultTaxRate=Number(f.defaultTaxRate||0);
    f.autoOpenDrawer = event.currentTarget.elements.autoOpenDrawer?.checked ?? true;
    f.autoPrintInvoice = event.currentTarget.elements.autoPrintInvoice?.checked ?? false;
    f.autoPrintKitchen = event.currentTarget.elements.autoPrintKitchen?.checked ?? false;
    f.enableEloScanner = event.currentTarget.elements.enableEloScanner?.checked ?? false;
    const form = event.currentTarget;
    const outcome = await perform(()=>service.saveSettings(f),'Configuración guardada.');
    if (!outcome.ok) return;
    state.settings={...state.settings,...f};
    updateForms.markSaved(form);
    syncNativeUpdateState();
    if (!f.enableEloScanner && state.scannerActive) {
      state.scannerActive = false;
      await stopEloScanner();
    }
  }

  function cancelOrder(){state.modal='cancelOrder';renderModal();}
  function cancelInvoice(){state.modal='cancelInvoice';renderModal();}
  async function submitCancellation(event){
    event.preventDefault();
    const form = event.currentTarget;
    const kind = form.dataset.kind;
    const reason = String(new FormData(form).get('reason') || '').trim();
    if (reason.length < 3) return toast('Explica el motivo con al menos 3 caracteres.', 'warning');
    const button = event.submitter || form.querySelector('button[type="submit"]');
    setBusy(button, true);
    const outcome = kind === 'order'
      ? await perform(() => service.transitionOrder(state.selectedOrderId, 'cancelled', 'cancelled', reason), 'Comanda cancelada.')
      : await perform(() => service.cancelInvoice(state.selectedInvoiceId, reason), 'Factura anulada.');
    setBusy(button, false);
    if (outcome.ok) closeModal();
  }

  async function submitPayment(event){
    event.preventDefault();
    if (state.saleInProgress) return toast('Ya se está registrando un pago.', 'warning');
    const invoice=state.invoices.find((item)=>item.id===state.selectedInvoiceId);
    if(!invoice)return toast('La factura ya no está disponible.','danger');
    const f=new FormData(event.currentTarget);
    const amount=toCents(f.get('amount'));
    const method=f.get('method');
    const pin=String(f.get('pin')||'').trim();
    const shouldPrint = f.get('printInvoice') === 'on' || f.get('printInvoice') === 'true' || Boolean(event.currentTarget.querySelector('#payment-print-receipt')?.checked);
    const balance=invoice.totalCents-invoice.paidCents;
    if(!/^\d{6}$/.test(pin))return toast('Digita tu PIN personal de 6 dígitos.','warning');
    if(amount>balance)return toast('El pago supera el balance.','danger');
    const button = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
    state.saleInProgress = true;
    setBusy(button, true);
    try {
      const authorized = await service.verifyDrawerPin(pin, `Cobro de ${invoice.invoiceNumber || invoice.id}`);
      if(!state.activeCash?.id){
        const sessionId=await service.openCashSession({openingCents:0,notes:`Apertura rápida autorizada por PIN: ${authorized.user.displayName}`});
        state.activeCash={id:typeof sessionId==='string'?sessionId:sessionId.id,status:'open',openingCents:0,openedBy:user.uid,openedByName:authorized.user.displayName,optimistic:true};
      }
      const outcome = await perform(()=>service.recordPayment(invoice.id,{
        requestId:createOperationId('payment'),
        amountCents:amount,
        method,
        reference:f.get('reference'),
        tenderedCents:method==='cash'?amount:0,
        cashSessionId:state.activeCash.id,
        cashierId:authorized.user.id,
        cashierName:authorized.user.displayName
      }),'Cobro registrado.');
      if (!outcome.ok) return;
      closeModal();
      setTimeout(() => {
        if(method==='cash' && state.settings?.autoOpenDrawer !== false) void kickDrawer({ silentFailure:true });
        if(shouldPrint && state.settings?.autoPrintInvoice !== false) void printInvoice(invoice.id);
      }, 350);
    } catch(error) {
      beepHardware('error').catch(()=>{});
      toast(error.message || 'No se pudo autorizar el cobro.', 'danger');
      const errBox = event.currentTarget.querySelector('.pin-error-box') || event.currentTarget.querySelector('#payment-pin-error');
      if (errBox) errBox.textContent = error.message || 'PIN incorrecto.';
      const pinInput=event.currentTarget.querySelector('[name=pin]');
      if(pinInput){
        pinInput.value='';
        event.currentTarget.querySelectorAll('.pin-slot').forEach(s => s.classList.remove('filled'));
      }
    } finally {
      state.saleInProgress = false;
      setBusy(button, false);
      renderContent();
    }
  }

  async function submitCharge(event){
    event.preventDefault();
    if (state.saleInProgress) return toast('Ya se está procesando el cobro de la mesa.', 'warning');
    const order=state.orders.find((item)=>item.id===state.selectedOrderId);
    if (!order) return toast('La comanda ya no está disponible.', 'danger');
    const f=new FormData(event.currentTarget);
    const method=f.get('method');
    const pin=String(f.get('pin')||'').trim();
    const shouldPrint = f.get('printInvoice') === 'on' || f.get('printInvoice') === 'true' || Boolean(event.currentTarget.querySelector('#charge-print-receipt')?.checked);
    if (!/^\d{6}$/.test(pin)) return toast('Digita tu PIN personal de 6 dígitos.', 'warning');
    const button = event.submitter || event.currentTarget.querySelector('button[type="submit"]');
    state.saleInProgress = true;
    setBusy(button, true);
    try {
      const authorized = await service.verifyDrawerPin(pin, `Cobro de ${order.tableName || 'mesa'}`);
      if (method !== 'credit' && !state.activeCash?.id) {
        const sessionId = await service.openCashSession({
          openingCents: 0,
          notes: `Apertura rápida autorizada por PIN: ${authorized.user.displayName}`
        });
        state.activeCash = {
          id: typeof sessionId === 'string' ? sessionId : sessionId.id,
          status: 'open', openingCents: 0, openedBy: user.uid,
          openedByName: authorized.user.displayName, optimistic: true
        };
      }
      const outcome = await perform(()=>service.chargeOrder(order.id,{
        requestId:createOperationId('table-sale'), amountCents:method==='credit'?0:order.totalCents,
        method, ncfType:f.get('ncfType'), clientRnc:f.get('clientRnc'), reference:f.get('reference'),
        tenderedCents:method==='cash'?order.totalCents:0, cashSessionId:state.activeCash?.id||'',
        cashierId:authorized.user.id, cashierName:authorized.user.displayName
      }),'Mesa cobrada y cerrada.');
      if (!outcome.ok) return;
      const created = outcome.result;
      state.lastSaleResult = {
        id:created.id, invoiceId:created.id, invoiceNumber:created.invoiceNumber, documentType:'invoice',
        ncf:created.ncf || '', clientId: order.clientId || '', clientName:order.clientName || 'Consumidor final', clientRnc:f.get('clientRnc') || order.clientRnc || '',
        subtotalCents:order.subtotalCents, taxCents:order.taxCents, discountCents:order.discountCents || 0,
        tipCents:order.tipCents || 0, totalCents:order.totalCents, paidCents:method==='credit'?0:order.totalCents,
        tenderedCents:method==='cash'?order.totalCents:0, changeCents:0, method, reference:f.get('reference') || '',
        cashierName:authorized.user.displayName || user.displayName || user.username || 'Cajero', items:order.items, createdAt:new Date()
      };
      if (method === 'credit') {
        state.lastSaleResult.clientTotalDebtCents = calculateClientTotalDebt(state.lastSaleResult, state.invoices, state.clients);
      }

      state.modal='saleSuccess';
      const openDrawer = method==='cash' && state.settings?.autoOpenDrawer !== false;
      setTimeout(() => {
        if (openDrawer) void kickDrawer({silentFailure:true});
        if (shouldPrint && state.settings?.autoPrintInvoice !== false) void printSaleReceipt(state.lastSaleResult,{openDrawer:false});
      },0);
    } catch (error) {
      beepHardware('error');
      toast(error.message || 'No se pudo autorizar el cobro de la mesa.', 'danger');
      const errBox = event.currentTarget.querySelector('.pin-error-box') || event.currentTarget.querySelector('#charge-pin-error');
      if (errBox) errBox.textContent = error.message || 'PIN incorrecto.';
      const pinInput = event.currentTarget.querySelector('[name=pin]');
      if (pinInput) {
        pinInput.value = '';
        event.currentTarget.querySelectorAll('.pin-slot').forEach(s => s.classList.remove('filled'));
      }
    } finally {
      state.saleInProgress = false;
      setBusy(button, false);
      renderContent();
    }
  }

  async function auditedDrawerPulse(reason) {
    const operationId = createOperationId('drawer');
    const context = `${operationId} · sesión ${state.activeCash?.id || 'sin sesión'} · ${reason}`;
    // If the request cannot be recorded, do not send an untraceable pulse.
    await service.audit('cash.drawer_requested', context);
    let result;
    try { result = await openCashDrawerHardware(); }
    catch (error) { result = { success: false, message: error.message }; }
    try {
      await service.audit(result?.success ? 'cash.drawer_pulse_sent' : 'cash.drawer_hardware_failed', context);
    } catch {
      toast('La solicitud quedó registrada, pero falta confirmar su resultado en auditoría. No repitas la apertura sin revisar la gaveta.', 'warning');
    }
    return result;
  }

  async function kickDrawer({ silentFailure = false } = {}) {
    try {
      const result = await auditedDrawerPulse('Apertura posterior a operación de caja');
      if (result.success) {
        toast('Pulso enviado. Comprueba que la gaveta abrió.', 'success');
      } else {
        if (silentFailure) {
          toast('Venta guardada, pero la gaveta no respondió. Revisa la terminal y reintenta desde “Abrir gaveta”.', 'warning');
        } else {
          showHardwareHelpModal();
        }
      }
    } catch(e) {
      if (silentFailure) {
        toast('Venta guardada, pero no se pudo abrir la gaveta.', 'warning');
      } else {
        showHardwareHelpModal();
      }
    }
  }

  async function testPrint() {
    const fake = {
      id: 'test',
      invoiceNumber: 'PRUEBA NO FISCAL',
      documentType: 'invoice',
      ncf: '',
      clientName: '',
      subtotalCents: 10000,
      taxCents: 0,
      totalCents: 10000,
      paidCents: 10000,
      createdAt: new Date(),
      items: [{ name: 'Ticket Térmico 80mm - Los Panitas', quantity: 1, unitPriceCents: 10000 }]
    };
    const printSettings = { ...state.settings, receiptFooter: 'PRUEBA DE IMPRESIÓN · HARDWARE OK' };
    const b = buildInvoiceEscPos(fake, printSettings, [{ method: 'cash', amountCents: 10000 }]);
    const plainText = buildInvoicePlainText(fake, printSettings, [{ method: 'cash', amountCents: 10000 }]);
    // La prueba de impresión no debe abrir la gaveta: ambas comprobaciones tienen
    // botones separados y un pulso inesperado es un riesgo operativo.
    const res = await sendEscPosToPrinter(b, { plainText, openDrawer: false });
    if (res.success) toast(`Prueba de impresión enviada (${res.method}).`, 'success');
    else showHardwareHelpModal();
  }

  function showHardwareHelpModal() {
    const isAndroid = /android/i.test(navigator.userAgent || '');
    const eloNative = typeof window !== 'undefined' && window._ELO_NATIVE === true;
    const modalEl = document.createElement('div');
    modalEl.className = 'modal-backdrop';
    modalEl.innerHTML = `
      <article class="modal-card" role="dialog" aria-modal="true" style="max-width:480px;" data-modal-card>
        <header>
          <div><span class="eyebrow">Hardware POS</span><h2>Impresora o gaveta no detectada</h2></div>
          <button class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button>
        </header>
        <div style="padding:16px 0; display:flex; flex-direction:column; gap:14px;">
          ${eloNative ? `
            <div class="form-note" style="border-color:rgba(255,180,0,.4);background:rgba(255,180,0,.06);">
              <i data-lucide="usb"></i>
              <span><strong>App Nativa ELO detectada.</strong> La impresora USB no responde aún. Asegúrate de que la terminal haya iniciado correctamente y concede el permiso USB si aparece el diálogo.</span>
            </div>
          ` : isAndroid ? `
            <div class="form-note">
              <i data-lucide="smartphone"></i>
              <span>Estás en Android pero sin la app nativa. Para funcionamiento completo, instala la <strong>App Nativa ELO</strong> disponible en <strong>Configuración → Descargar App Nativa</strong>.</span>
            </div>
          ` : `
            <div class="form-note">
              <i data-lucide="monitor"></i>
              <span>Parece que estás en una computadora de escritorio. La gaveta e impresora se activan automáticamente al abrir la app en la <strong>terminal ELO</strong>.</span>
            </div>
          `}
          <div style="display:flex; flex-direction:column; gap:8px;">
            <p style="margin:0; font-size:.8rem; color:var(--muted);">Opciones de solución:</p>
            <ol style="margin:0; padding-left:20px; font-size:.82rem; color:#ccc; line-height:1.7;">
              <li>Instala la <strong>App Nativa ELO</strong> desde Configuración → Paquete de Recursos.</li>
              <li>O instala <strong>RawBT Print Service</strong> desde Play Store y activa el servidor WebSocket local en la configuración de la app.</li>
              <li>Al abrir cualquiera de las dos apps, vuelve al sistema y presiona el botón nuevamente.</li>
            </ol>
          </div>
        </div>
        <footer class="modal-actions">
          <button type="button" class="button secondary" data-hardware-settings>Ir a Configuración</button>
          <button class="button primary" data-modal-close>Entendido</button>
        </footer>
      </article>`;
    document.body.appendChild(modalEl);
    modalEl.querySelectorAll('[data-modal-close]').forEach((button) => button.addEventListener('click', () => modalEl.remove()));
    modalEl.querySelector('[data-hardware-settings]')?.addEventListener('click', () => { modalEl.remove(); route('settings'); });
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) modalEl.remove(); });
    createIcons({ icons, nameAttr: 'data-lucide', rootNode: modalEl });
  }

  async function printInvoice(id) {
    const invoice = state.invoices.find((item)=>item.id===id);
    if (!invoice) return;
    const related = state.payments.filter((item)=>item.invoiceId===invoice.id);
    const clientTotalDebtCents = calculateClientTotalDebt(invoice, state.invoices, state.clients);
    const invoiceToPrint = { ...invoice, clientTotalDebtCents };
    const b = buildInvoiceEscPos(invoiceToPrint, state.settings, related);
    const plainText = buildInvoicePlainText(invoiceToPrint, state.settings, related);
    const res = await sendEscPosToPrinter(b, { plainText, openDrawer: false });
    if (res.success) {
      toast('Imprimiendo factura…','success');
    } else {
      toast('Error al enviar ticket a la impresora. Verifica si tiene papel.', 'danger');
      checkPaperStatus().then(st => {
        if (st) {
          state.hardwareStatus = { ...(state.hardwareStatus || {}), ...st };
          renderContent();
        }
      }).catch(() => {});
    }
  }

  async function printSaleReceipt(invoice, { openDrawer = false } = {}) {
    const payment = {
      method: invoice.method,
      amountCents: invoice.paidCents || 0,
      tenderedCents: invoice.tenderedCents,
      changeCents: invoice.changeCents,
      reference: invoice.reference || ''
    };
    const changeInfo = invoice.method === 'cash' && invoice.tenderedCents > invoice.totalCents
      ? { receivedCents: invoice.tenderedCents, changeCents: invoice.changeCents }
      : null;
    const payments = Number(invoice.paidCents || 0) > 0 ? [payment] : [];
    const clientTotalDebtCents = invoice.clientTotalDebtCents != null
      ? Number(invoice.clientTotalDebtCents)
      : calculateClientTotalDebt(invoice, state.invoices, state.clients);
    const invoiceToPrint = { ...invoice, clientTotalDebtCents };
    const builder = buildInvoiceEscPos(invoiceToPrint, state.settings, payments, changeInfo);
    const plainText = buildInvoicePlainText(invoiceToPrint, state.settings, payments, changeInfo);
    const result = await sendEscPosToPrinter(builder, { plainText, openDrawer, fallbackToBrowser: false });

    if (result.success) {
      toast('Factura enviada a impresión.', 'success');
    } else {
      toast('Venta guardada. La factura quedó pendiente de impresión; puedes reintentarla aquí.', 'warning');
    }
  }

  async function initTerminalDiag() {
    const eloPort = (typeof window !== 'undefined' && window._ELO_PORT) ? window._ELO_PORT : 8765;
    const setVal = (id, text, ok) => {
      const el = root.querySelector(id);
      if (el) { el.textContent = text; el.style.color = ok === true ? '#3fb950' : ok === false ? '#f85149' : '#ccc'; }
    };
    const setAdbHint = (status) => {
      const adbEl = root.querySelector('#diag-adb-command');
      if (!adbEl) return;
      const wifiIp = String(status?.wifiIp || '').trim();
      adbEl.textContent = wifiIp
        ? `adb connect ${wifiIp}:5555`
        : 'ADB no está reportando una IP. Esto no afecta ventas, impresión ni caja.';
    };

    // Consultar estado de hardware general
    try {
      const statusRes = await getHardwareStatus();
      if (statusRes && statusRes.ok) {
        state.hardwareStatus = statusRes;
        setVal('#diag-server-val', `Activo (127.0.0.1:${eloPort})`, true);
        setVal('#diag-printer-val', statusRes.printerConnected ? 'Conectada ✓' : 'Sin detectar', statusRes.printerConnected);

        // Sensor de Papel
        if (statusRes.paperStatus === 'unsupported') {
          setVal('#diag-paper-val', 'Sensor no compatible · revisión manual', null);
        } else if (statusRes.paperOut) {
          setVal('#diag-paper-val', '¡SIN PAPEL! Reemplazar', false);
        } else if (statusRes.paperLow) {
          setVal('#diag-paper-val', 'Poco papel restante', null);
        } else if (statusRes.printerConnected) {
          setVal('#diag-paper-val', 'Rollo instalado ✓', true);
        } else {
          setVal('#diag-paper-val', 'Sin detectar', null);
        }

        setVal('#diag-drawer-val', statusRes.drawerAvailable ? 'Lista por impresora ✓' : 'No disponible', Boolean(statusRes.drawerAvailable));
        setVal('#diag-scanner-val', statusRes.scannerAvailable ? (statusRes.scannerActive ? 'Activa ✓' : 'Disponible · apagada') : 'No detectada', Boolean(statusRes.scannerAvailable));
        setVal('#diag-vfd-val', statusRes.vfdConnected ? 'Conectado ✓' : 'No reportado', Boolean(statusRes.vfdConnected));
        setVal('#diag-msr-val', statusRes.msrActive ? 'MagTek activo ✓' : 'No disponible', Boolean(statusRes.msrActive));
        setVal('#diag-model-val', `${statusRes.model || 'Terminal Android'} · Android ${statusRes.androidVersion || 'N/D'}`, null);
        setVal('#diag-ip-val', statusRes.wifiIp || 'No reportada', Boolean(statusRes.wifiIp));
        setAdbHint(statusRes);

        // Listar dispositivos USB mediante el mismo canal autenticado que usa
        // el resto de los comandos nativos.
        const usbRes = await sendEloCommand({ cmd: 'listUsb' }, 1200);
        const usbList = root.querySelector('#diag-usb-list');
        if (usbList && usbRes && usbRes.devices) {
          if (usbRes.devices.length === 0) {
            usbList.innerHTML = '<span style="color:#f85149">No hay dispositivos USB conectados.</span>';
          } else {
            usbList.innerHTML = usbRes.devices.map(d =>
              `<div style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,.06);">
                <strong>${d.name}</strong>
                <span style="margin-left:8px; color:var(--muted);">VID=${d.vendorId} PID=${d.productId} · Clase ${d.class} · ${d.interfaces} interfaz(es)</span>
                <span style="margin-left:8px; color:${d.hasPermission ? '#3fb950' : '#f85149'}">${d.hasPermission ? '✓ Con permiso' : '✗ Sin permiso'}</span>
              </div>`
            ).join('');
          }
        }
      } else {
        setVal('#diag-server-val', 'No disponible en este navegador', false);
        setVal('#diag-printer-val', 'Modo Diálogo 80mm', null);
        setVal('#diag-paper-val', 'Depende de impresora', null);
        setVal('#diag-drawer-val', 'Depende de impresora', null);
        setVal('#diag-scanner-val', 'Lector USB/Teclado', null);
        setVal('#diag-vfd-val', 'No disponible', null);
        setVal('#diag-msr-val', 'No disponible', null);
        setAdbHint(null);
      }
    } catch {
      setVal('#diag-server-val', 'Sin respuesta', false);
      setAdbHint(null);
    }

    // Conectar botones de acción de diagnóstico
    root.querySelectorAll('[data-diag-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.diagAction;
        if (action === 'openDrawer') {
          promptDrawerPin();
        } else if (action === 'checkPaper') {
          const paperRes = await checkPaperStatus();
          if (paperRes && paperRes.ok) {
            state.hardwareStatus = { ...(state.hardwareStatus || {}), ...paperRes };
            if (paperRes.paperStatus === 'unsupported') {
              toast('Impresora conectada; el sensor de papel no es compatible con este modelo. Comprueba el rollo manualmente.', 'warning');
            } else if (paperRes.paperOut) {
              toast('⚠️ La impresora no tiene papel térmico. Reemplaza el rollo de 80mm.', 'danger');
              beepHardware('error');
            } else if (paperRes.paperLow) {
              toast('Aviso: Poco papel en la impresora.', 'warning');
            } else {
              toast('Sensor de papel: Rollo de 80mm detectado correctamente.', 'success');
              beepHardware('ok');
            }
            initTerminalDiag();
          } else {
            toast('No se pudo leer el sensor de papel.', 'warning');
          }
        } else if (action === 'testVfd') {
          await setVFDMessage('TEST POS ELO 15"', 'RD$ 1,250.00');
          toast('Mensaje enviado al visor de cliente.', 'success');
        } else if (action === 'vfdWelcome') {
          await vfdWelcome(state.settings?.name || 'Los Panitas');
          toast('Bienvenida enviada al visor.', 'success');
        } else if (action === 'vfdThanks') {
          await setVFDMessage('GRACIAS POR SU VISITA', 'VUELVA PRONTO!');
          toast('Agradecimiento enviado al visor.', 'success');
        } else if (action === 'clearVfd') {
          await clearVFD();
          toast('Visor de cliente apagado.', 'info');
        } else if (action === 'scannerOn') {
          await startEloScanner();
          state.scannerActive = true;
          toast('Escáner activado.', 'success');
          setTimeout(() => initTerminalDiag(), 400);
        } else if (action === 'scannerOff') {
          await stopEloScanner();
          state.scannerActive = false;
          toast('Escáner apagado.', 'info');
          setTimeout(() => initTerminalDiag(), 400);
        } else if (action === 'beepOk') {
          await beepHardware('ok');
          toast('Tono de éxito emitido.', 'success');
        } else if (action === 'beepError') {
          await beepHardware('error');
          toast('Tono de error emitido.', 'warning');
        } else if (action === 'reconnectPrinter') {
          await sendEloCommand({ cmd: 'reconnectPrinter' }, 1000);
          toast('Comando de reconexión enviado.', 'info');
          setTimeout(() => initTerminalDiag(), 1500);
        }
      });
    });
  }

  async function printOrder(id, fallbackOrder = null) {
    const order = state.orders.find((item)=>item.id===id) || fallbackOrder;
    if (!order) return;
    const b = buildKitchenEscPos(order, state.settings);
    const plainText = buildKitchenPlainText(order, state.settings);
    const res = await sendEscPosToPrinter(b, { plainText, openDrawer: false });
    if (res.success) {
      toast('Comanda enviada a impresora térmica.','success');
    } else {
      toast('Error al imprimir comanda. Verifica si la impresora tiene papel.','danger');
      checkPaperStatus().then(st => {
        if (st) {
          state.hardwareStatus = { ...(state.hardwareStatus || {}), ...st };
          renderContent();
        }
      }).catch(() => {});
    }
  }

  async function printCashSession(id, mode = 'Z', sessionOverride = null) {
    const session = sessionOverride || state.cashSessions.find((item)=>item.id===id);
    if (!session) return;
    const b = buildCashReportEscPos(session, state.payments, state.settings, state.cashMovements, mode, state.inventoryMovements);
    const plainText = buildCashReportPlainText(session, state.payments, state.settings, state.cashMovements, mode, state.inventoryMovements);
    const res = await sendEscPosToPrinter(b, { plainText, openDrawer: false });
    if (res.success) toast(`Corte ${mode} de caja enviado a la impresora térmica.`, 'success');
    else toast('Error al imprimir arqueo.', 'danger');
  }

  async function printCartPrebill() {
    if (!state.cart.length) return toast('Agrega productos al pedido para imprimir pre-cuenta.', 'warning');
    const discountVal = Number(root.querySelector('#pos-discount-value')?.value || 0);
    const discountType = root.querySelector('#pos-discount-type')?.value || 'amount';
    const includeLegalTip = root.querySelector('#pos-legal-tip')?.checked === true;
    state.posDiscountState = { discount: discountVal, discountType, includeLegalTip };

    const totals = calculateDocument(state.cart, state.posDiscountState);
    const tableName = root.querySelector('#pos-checkout-form [name=tableId] option:checked')?.text || 'Consumo directo';
    const clientName = root.querySelector('#pos-checkout-form [name=clientName]')?.value || 'Consumidor';
    const prebillData = {
      tableName,
      clientName,
      items: state.cart,
      ...totals,
      createdAt: new Date()
    };
    const b = buildPrebillEscPos(prebillData, state.settings);
    toast('Imprimiendo pre-cuenta en impresora 80mm...', 'info');
    const plainText = buildPrebillPlainText(prebillData, state.settings);
    const res = await sendEscPosToPrinter(b, { plainText, openDrawer: false });
    if (res.success) toast('Pre-cuenta impresa.', 'success');
    else toast('Error al imprimir pre-cuenta.', 'danger');
  }

  async function printOrderPrebill(orderId) {
    const order = state.orders.find((item)=>item.id===orderId);
    if (!order) return;
    const totals = calculateDocument(order.items, { discount: order.discountCents ? order.discountCents / 100 : 0, discountType: 'amount', includeLegalTip: Boolean(order.tipCents) });
    const prebillData = {
      tableName: order.tableName || 'Mesa',
      clientName: order.clientName || 'Consumidor',
      items: order.items,
      ...totals,
      createdAt: new Date()
    };
    const b = buildPrebillEscPos(prebillData, state.settings);
    toast('Imprimiendo estado de cuenta de la mesa...', 'info');
    const plainText = buildPrebillPlainText(prebillData, state.settings);
    const res = await sendEscPosToPrinter(b, { plainText, openDrawer: false });
    if (res.success) toast('Pre-cuenta de la mesa impresa.', 'success');
    else toast('Error al imprimir pre-cuenta.', 'danger');
  }

  async function printDeliverySettlement(settlement) {
    if (!settlement) return;
    const b = buildDeliverySettlementEscPos(settlement, state.settings);
    const plainText = buildDeliverySettlementPlainText(settlement, state.settings);
    const res = await sendEscPosToPrinter(b, { plainText, openDrawer: false });
    if (res.success) toast('Comprobante de liquidación de delivery impreso.', 'success');
    else toast('Error al imprimir comprobante de liquidación.', 'danger');
  }

  async function printPayrollPayment(payment) {
    if (!payment) return;
    const b = buildPayrollReceiptEscPos(payment, state.settings);
    const plainText = buildPayrollReceiptPlainText(payment, state.settings);
    const res = await sendEscPosToPrinter(b, { plainText, openDrawer: false });
    if (res.success) toast('Comprobante de nómina impreso.', 'success');
    else toast('Error al imprimir comprobante de nómina.', 'danger');
  }

  function handleQuickCash(val) {
    const input = root.querySelector('#pos-cash-received');
    if (!input) return;
    if (val === 'clear') {
      input.value = '';
      updatePosChange();
      return;
    }
    const totals = calculateDocument(state.cart, state.posDiscountState || {});
    const total = totals.totalCents / 100;
    if (val === 'exact') {
      input.value = total.toFixed(2);
    } else {
      const current = Number(input.value || 0);
      const add = Number(val);
      input.value = current === 0 ? add : current + add;
    }
    updatePosChange();
  }

  function updatePosChange() {
    const receivedInput = root.querySelector('#pos-cash-received');
    const changeDisplay = root.querySelector('#pos-change-display');
    const changeAmount = root.querySelector('#pos-change-amount');

    const discountVal = Number(root.querySelector('#pos-discount-value')?.value || 0);
    const discountType = root.querySelector('#pos-discount-type')?.value || 'amount';
    const includeLegalTip = root.querySelector('#pos-legal-tip')?.checked === true;
    state.posDiscountState = { discount: discountVal, discountType, includeLegalTip };

    const totals = calculateDocument(state.cart, state.posDiscountState);
    const totalsBlock = root.querySelector('.cart-totals-block');
    if (totalsBlock) totalsBlock.innerHTML = renderCartTotals(state.cart, state.posDiscountState);
    capturePosDraft();

    // Actualizar el botón cobrar
    updatePosSubmitLabel();

    if (!receivedInput || !changeAmount) return;
    const received = Number(receivedInput.value || 0) * 100;
    if (received <= 0) {
      changeAmount.textContent = 'RD$ 0.00';
      changeDisplay?.classList.remove('insufficient');
      return;
    }

    const change = received - totals.totalCents;
    if (change < 0) {
      changeAmount.textContent = `Faltan ${formatMoney(Math.abs(change))}`;
      changeDisplay?.classList.add('insufficient');
    } else {
      changeAmount.textContent = formatMoney(change);
      changeDisplay?.classList.remove('insufficient');
      // Actualizar el visor del cliente
      if (received > 0) {
        setVFDMessage(`RECIB: ${formatMoney(received)}`, `CAMB: ${formatMoney(change)}`).catch(() => {});
      }
    }
  }

  function openItemNoteModal(index) {
    if (index < 0 || !state.cart[index]) return;
    capturePosDraft();
    state.editingCartIndex = index;
    state.modal = 'itemNote';
    renderModal();
  }

  function saveItemNote(event) {
    event.preventDefault();
    const input = event.currentTarget.querySelector('#item-note-input');
    if (state.cart[state.editingCartIndex]) {
      state.cart[state.editingCartIndex].notes = (input?.value || '').trim();
    }
    closeModal();
    renderContent();
  }

  function openQuantityModal(index) {
    if (index < 0 || !state.cart[index]) return;
    capturePosDraft();
    state.editingCartIndex = index;
    state.modal = 'quantity';
    renderModal();
  }

  function saveQuantity(event) {
    event.preventDefault();
    const input = event.currentTarget.querySelector('#item-qty-input');
    const val = parseInt(input?.value || '1', 10);
    if (state.cart[state.editingCartIndex]) {
      const line = state.cart[state.editingCartIndex];
      const product = state.products.find((item) => item.id === line.productId);
      const maximum = Math.min(Number(product?.stock || 0), 999);
      if (val > maximum) return toast(`Solo hay ${maximum} unidades disponibles de ${line.name}.`, 'warning');
      if (val > 0) {
        state.cart[state.editingCartIndex].quantity = val;
      } else {
        state.cart.splice(state.editingCartIndex, 1);
      }
    }
    closeModal();
    renderContent();
    const totals = calculateDocument(state.cart);
    if (state.cart.length) {
      setVFDMessage('TOTAL CUENTA:', formatMoney(totals.totalCents));
    } else {
      vfdWelcome(state.settings?.name || 'Los Panitas');
    }
  }

  function updatePosNcf() {
    const ncfSelect = root.querySelector('#pos-ncf-type');
    const rncContainer = root.querySelector('#pos-rnc-container');
    if (ncfSelect && rncContainer) {
      const isB01 = ncfSelect.value === 'B01';
      rncContainer.hidden = !isB01;
      const rncInput = root.querySelector('#pos-client-rnc');
      if (rncInput) rncInput.required = isB01;
    }
    capturePosDraft();
  }

  function filterAuditRows(event) {
    const term = (event.target.value || '').toLowerCase().trim();
    root.querySelectorAll('[data-audit-row]').forEach((row) => {
      row.hidden = !row.dataset.search.includes(term);
    });
  }

  function itemNoteModal() {
    const item = state.cart[state.editingCartIndex];
    if (!item) return '';
    return `
      <div class="modal-backdrop" data-modal-close>
        <form id="item-note-form" class="modal-card form-modal" style="max-width:420px;" data-modal-card>
          <header>
            <div><span class="eyebrow">${escapeHtml(item.name)}</span><h2>Nota de preparación</h2></div>
            <button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button>
          </header>
          <div class="stack-form" style="padding-top:8px;">
            <label>Instrucciones especiales para cocina
              <input name="itemNote" id="item-note-input" maxlength="200" placeholder="Ej: Sin cebolla, término medio, salsa aparte..." value="${escapeHtml(item.notes || '')}" autofocus>
            </label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0;">
              ${['Sin cebolla', 'Término medio', 'Bien cocido', 'Salsa aparte', 'Sin sal', 'Poco picante', 'Para llevar'].map(q => `
                <button type="button" class="button secondary compact" data-quick-note="${q}" style="font-size:0.75rem;padding:4px 8px;">${q}</button>
              `).join('')}
            </div>
          </div>
          <footer class="modal-actions">
            <button type="button" class="button secondary" data-modal-close>Cancelar</button>
            <button class="button primary" type="submit">Guardar nota</button>
          </footer>
        </form>
      </div>
    `;
  }

  function quantityModal() {
    const item = state.cart[state.editingCartIndex];
    if (!item) return '';
    return `
      <div class="modal-backdrop" data-modal-close>
        <form id="quantity-form" class="modal-card form-modal" style="max-width:380px;" data-modal-card>
          <header>
            <div><span class="eyebrow">${escapeHtml(item.name)}</span><h2>Cantidad</h2></div>
            <button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button>
          </header>
          <div class="stack-form" style="padding-top:8px;">
            <label>Cantidad de unidades
              <input name="itemQty" id="item-qty-input" type="text" inputmode="none" readonly tabindex="-1" value="${item.quantity}" style="font-size:1.6rem;text-align:center;font-weight:700;background:rgba(255,255,255,0.05);border:1px solid var(--line);border-radius:10px;padding:8px;" required>
            </label>
            <div class="pin-pad" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin:8px 0;">
              ${[1,2,3,4,5,6,7,8,9].map(n => `<button type="button" class="button secondary qty-num-btn" data-qty-num="${n}" style="font-size:1.2rem;font-weight:700;padding:10px 0;">${n}</button>`).join('')}
              <button type="button" class="button secondary qty-clear-btn" style="font-size:.85rem;font-weight:600;padding:10px 0;color:#f85149;">Borrar</button>
              <button type="button" class="button secondary qty-num-btn" data-qty-num="0" style="font-size:1.2rem;font-weight:700;padding:10px 0;">0</button>
              <button type="button" class="button secondary qty-del-btn" style="font-size:1.1rem;font-weight:700;padding:10px 0;">⌫</button>
            </div>
          </div>
          <footer class="modal-actions">
            <button type="button" class="button secondary" data-modal-close>Cancelar</button>
            <button class="button primary" type="submit">Actualizar cantidad</button>
          </footer>
        </form>
      </div>
    `;
  }

  function resumePendingPosSubmit(delay = 400) {
    const pending = state.pendingPosSubmit;
    state.pendingPosSubmit = null;
    if (typeof pending === 'function') setTimeout(pending, delay);
  }

  function openOrder(id){if(!id)return;state.selectedOrderId=id;state.modal='order';renderModal();}
  function openInvoice(id){state.selectedInvoiceId=id;state.modal='invoice';renderModal();}
  function openForm(type,id=''){state.editingId=id;state.modal=type;renderModal();}
  function openUserForm(id=''){state.editingUser=id?state.users.find((item)=>item.id===id):{};state.modal='user';renderModal();}
  function closeModal(){
    state.modal='';
    state.editingId='';
    if (state.pendingLiveRender) {
      state.pendingLiveRender=false;
      renderContent();
    } else {
      renderModal();
    }
  }
  function paymentModal(){
    const invoice = state.invoices.find((item) => item.id === state.selectedInvoiceId);
    if (!invoice) return '';
    const balance = invoice.totalCents - invoice.paidCents;
    return formModal('payment-form', 'Registrar cobro', `
      <div class="payment-amount"><span>Balance pendiente</span><strong>${formatMoney(balance)}</strong></div>
      <label>Monto<input name="amount" type="number" min="0.01" max="${balance/100}" step="0.01" value="${balance/100}" required></label>
      ${paymentFields(false)}
      <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:#ddd;cursor:pointer;user-select:none;margin:4px 0 6px;">
        <input type="checkbox" name="printInvoice" id="payment-print-receipt" checked style="width:18px;height:18px;accent-color:var(--brand-2);cursor:pointer;">
        <i data-lucide="printer" style="width:16px;height:16px;color:var(--brand-2);"></i>
        <span>Imprimir comprobante de cobro</span>
      </label>
      ${renderPinPadHtml({ idPrefix: 'payment-pin', label: 'Digita tu PIN de 6 dígitos para autorizar', sublabel: 'Autoriza el cobro y abre una sesión de caja con RD$0.00 si no existe una.' })}
    `, 'Autorizar y guardar cobro');
  }
  function chargeModal(){
    const order = state.orders.find((item) => item.id === state.selectedOrderId);
    if (!order) return '';
    return formModal('charge-form', 'Cobrar mesa', `
      <div class="payment-amount"><span>Total de ${escapeHtml(order.tableName)}</span><strong>${formatMoney(order.totalCents)}</strong></div>
      ${paymentFields(true)}
      ${ncfField()}
      <label>RNC / Cédula para B01<input name="clientRnc" maxlength="14" inputmode="numeric" value="${escapeHtml(order.clientRnc || '')}" placeholder="Solo obligatorio para crédito fiscal"></label>
      <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;color:#ddd;cursor:pointer;user-select:none;margin:4px 0 6px;">
        <input type="checkbox" name="printInvoice" id="charge-print-receipt" checked style="width:18px;height:18px;accent-color:var(--brand-2);cursor:pointer;">
        <i data-lucide="printer" style="width:16px;height:16px;color:var(--brand-2);"></i>
        <span>Imprimir factura al cobrar</span>
      </label>
      ${renderPinPadHtml({ idPrefix: 'charge-pin', label: 'Digita tu PIN de 6 dígitos para autorizar', sublabel: 'Autoriza el cobro y abre la caja automáticamente si todavía no hay un turno.' })}
    `, 'Autorizar, cobrar y cerrar');
  }
  function passwordModal(){
    return `<div class="modal-backdrop" data-modal-close><article class="modal-card form-modal" data-modal-card><header><div><span class="eyebrow">Seguridad personal</span><h2>Contraseña y PIN</h2></div><button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button></header><div class="stack-form"><form id="password-change-form" class="stack-form"><h3>Contraseña de acceso</h3><label>Contraseña actual<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>Nueva contraseña<input name="newPassword" type="password" minlength="8" autocomplete="new-password" required></label><label>Confirmar nueva contraseña<input name="newPasswordConfirm" type="password" minlength="8" autocomplete="new-password" required></label><button class="button primary" type="submit">Actualizar contraseña</button></form><form id="drawer-pin-update-form" class="stack-form pin-setup-form"><h3>PIN de cobro y gaveta</h3><p class="muted">Este PIN personal de seis dígitos autoriza cobros y aperturas manuales de la gaveta desde la terminal.</p><div class="form-grid two"><label>Nuevo PIN<input name="drawerPin" type="password" data-touch-numpad="integer" data-numpad-title="Nuevo PIN (6 dígitos)" maxlength="6" autocomplete="off" required readonly inputmode="none" style="cursor:pointer;"></label><label>Confirmar PIN<input name="drawerPinConfirm" type="password" data-touch-numpad="integer" data-numpad-title="Confirmar PIN (6 dígitos)" maxlength="6" autocomplete="off" required readonly inputmode="none" style="cursor:pointer;"></label></div><button class="button secondary" type="submit"><i data-lucide="key-round"></i> Guardar PIN</button></form></div><footer class="modal-actions"><button type="button" class="button secondary" data-modal-close>Cerrar</button></footer></article></div>`;
  }
  function cancellationModal(kind){
    const isOrder = kind === 'order';
    const title = isOrder ? 'Cancelar comanda' : 'Anular factura';
    const warning = isOrder
      ? 'La mesa quedará disponible y la comanda no podrá reactivarse.'
      : 'La factura quedará anulada y, si no tiene cobros, el inventario será restaurado.';
    return `<div class="modal-backdrop" data-modal-close><form id="cancellation-form" data-kind="${kind}" class="modal-card form-modal" data-modal-card><header><div><span class="eyebrow">Acción irreversible</span><h2>${title}</h2></div><button type="button" class="icon-button" data-modal-close aria-label="Cerrar"><i data-lucide="x"></i></button></header><div class="stack-form"><p class="notice warning"><i data-lucide="shield-alert"></i>${warning}</p><label>Motivo obligatorio<textarea name="reason" minlength="3" maxlength="500" rows="4" placeholder="Explica brevemente qué ocurrió…" required autofocus></textarea></label><small class="muted">El motivo, el usuario y la hora quedarán registrados en auditoría.</small></div><footer class="modal-actions"><button type="button" class="button secondary" data-modal-close>Volver</button><button type="submit" class="button danger">${title}</button></footer></form></div>`;
  }
  function quickCashModal(){
    return `
      <div class="modal-backdrop" data-modal-close>
        <article class="modal-card" style="max-width:440px;" data-modal-card>
          <header>
            <div><span class="eyebrow">Apertura de Turno</span><h2>Abrir caja</h2></div>
            <button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button>
          </header>
          <form id="quick-cash-form" class="stack-form" style="padding-top:8px;">
            <p style="margin:0 0 12px; font-size:.82rem; color:var(--muted);">Indica el fondo inicial en efectivo con el que comienzas el turno para poder cobrar facturas.</p>
            <label>Fondo inicial en caja (DOP)
              <input name="opening" id="cash-open-float" type="text" data-touch-numpad="money" data-numpad-title="Fondo Inicial de Caja" value="0.00" readonly inputmode="none" required style="font-size:1.3rem;font-weight:700;cursor:pointer;">
            </label>
            <div class="quick-cash-grid" style="margin:4px 0 12px;">
              <button type="button" class="quick-cash-btn" data-set-opening="0">RD$ 0</button>
              <button type="button" class="quick-cash-btn" data-set-opening="500">RD$ 500</button>
              <button type="button" class="quick-cash-btn" data-set-opening="1000">RD$ 1,000</button>
              <button type="button" class="quick-cash-btn" data-set-opening="2000">RD$ 2,000</button>
            </div>
            ${renderPinPadHtml({ idPrefix: 'quick-cash-pin', label: 'Digita tu PIN personal de 6 dígitos' })}
            <label>Notas de apertura (opcional)
              <input name="notes" placeholder="Turno de la tarde, cambio inicial…">
            </label>
            <footer class="modal-actions" style="margin-top:16px;">
              <button type="button" class="button secondary" data-modal-close>Cancelar</button>
              <button class="button primary" type="submit"><i data-lucide="wallet"></i> Abrir caja y continuar</button>
            </footer>
          </form>
        </article>
      </div>
    `;
  }

  function cashMovementModal() {
    const active = state.activeCash;
    if (!active) return '';
    return `
      <div class="modal-backdrop" data-modal-close>
        <article class="modal-card" style="max-width:460px;" data-modal-card>
          <header>
            <div><span class="eyebrow">Libro de Efectivo</span><h2>Registrar Movimiento</h2></div>
            <button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button>
          </header>
          <form id="cash-movement-form" class="stack-form" style="padding-top:10px;">
            <div class="cash-type-toggle">
              <button type="button" class="cash-type-btn active type-in" data-movement-type="in">
                <i data-lucide="plus-circle" style="width:18px;height:18px;"></i> Entrada
              </button>
              <button type="button" class="cash-type-btn type-out" data-movement-type="out">
                <i data-lucide="minus-circle" style="width:18px;height:18px;"></i> Salida / Gasto
              </button>
            </div>
            <input type="hidden" name="type" id="cash-movement-type" value="in">

            <label>Monto (DOP)
              <input name="amount" id="cash-movement-amount" type="text" placeholder="0.00" value="" data-touch-numpad="money" data-numpad-title="Monto del Movimiento" readonly inputmode="none" required style="font-size:1.4rem;font-weight:700;color:var(--brand-2);cursor:pointer;">
            </label>

            <label style="margin-bottom:4px;">Motivo del movimiento
              <input name="reason" id="cash-movement-reason" minlength="3" maxlength="300" placeholder="Ej: Compra menor, cambio, pago…" required>
            </label>

            <div class="quick-reason-grid">
              <button type="button" class="quick-reason-chip" data-set-reason="Cambio / Sencillo para caja">Cambio / Sencillo</button>
              <button type="button" class="quick-reason-chip" data-set-reason="Compra menor de insumo">Compra de insumo</button>
              <button type="button" class="quick-reason-chip" data-set-reason="Pago a repartidor / delivery">Pago delivery</button>
              <button type="button" class="quick-reason-chip" data-set-reason="Retiro parcial de efectivo">Retiro parcial</button>
            </div>

            ${renderPinPadHtml({ idPrefix: 'cash-movement-pin', label: 'Digita tu PIN para autorizar movimiento' })}

            <footer class="modal-actions" style="margin-top:14px;">
              <button type="button" class="button secondary" data-modal-close>Cancelar</button>
              <button class="button primary" type="submit" id="cash-movement-submit">
                <i data-lucide="check"></i> Registrar movimiento
              </button>
            </footer>
          </form>
        </article>
      </div>
    `;
  }

  function cashCloseModal() {
    const active = state.activeCash;
    if (!active) return '';
    const sessionPayments = state.payments.filter((item) => item.cashSessionId === active.id);
    const sessionMovements = state.cashMovements.filter((item) => item.cashSessionId === active.id);
    const cashCollected = sessionPayments.filter((item) => item.method === 'cash').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
    const cashIn = sessionMovements.filter((item) => item.type === 'in').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
    const cashOut = sessionMovements.filter((item) => item.type === 'out').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
    const expectedCashCents = Number(active.openingCents) + cashCollected + cashIn - cashOut;

    return `
      <div class="modal-backdrop" data-modal-close>
        <article class="modal-card" style="max-width:520px;" data-modal-card>
          <header>
            <div><span class="eyebrow">Arqueo Final</span><h2>Cierre de Caja (Corte Z)</h2></div>
            <button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button>
          </header>
          <form id="cash-close-form" class="stack-form" style="padding-top:10px;">
            <input type="hidden" name="expected" value="${expectedCashCents}">

            <div style="background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:14px;padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.84rem;">
              <div><span style="color:var(--muted);">Fondo Inicial:</span> <b>${formatMoney(active.openingCents)}</b></div>
              <div><span style="color:var(--muted);">Ventas Efectivo:</span> <b>${formatMoney(cashCollected)}</b></div>
              <div><span style="color:var(--muted);">Entradas:</span> <b style="color:#3fb950;">+${formatMoney(cashIn)}</b></div>
              <div><span style="color:var(--muted);">Salidas:</span> <b style="color:#f85149;">-${formatMoney(cashOut)}</b></div>
              <div style="grid-column:1 / -1;border-top:1px solid rgba(255,255,255,.08);padding-top:8px;display:flex;justify-content:space-between;align-items:center;">
                <strong style="color:#eee;">Efectivo Esperado:</strong>
                <strong style="font-size:1.15rem;color:var(--brand-2);">${formatMoney(expectedCashCents)}</strong>
              </div>
            </div>

            <label style="margin-top:6px;">Efectivo contado en gaveta (DOP)
              <input name="closing" id="cash-closing-amount" type="text" placeholder="0.00" value="" data-touch-numpad="money" data-numpad-title="Efectivo Contado en Gaveta" data-expected-cash="${(expectedCashCents / 100).toFixed(2)}" readonly inputmode="none" required style="font-size:1.4rem;font-weight:700;cursor:pointer;">
            </label>

            <div id="cash-variance-box" class="cash-variance-box exact" style="display:none;">
              <span id="cash-variance-label" style="font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;font-weight:700;display:block;">Diferencia</span>
              <strong id="cash-variance-val" style="font-size:1.5rem;display:block;margin:2px 0;">RD$ 0.00</strong>
              <small id="cash-variance-hint" style="color:var(--muted);font-size:0.8rem;">El conteo coincide exactamente con el sistema.</small>
            </div>

            <label>Nota de cierre <small style="color:var(--muted);font-weight:normal;">(obligatoria si hay diferencia)</small>
              <input name="notes" id="cash-close-notes" maxlength="500" placeholder="Observaciones del turno, justificación de diferencia…">
            </label>

            ${renderPinPadHtml({ idPrefix: 'cash-close-pin', label: 'Digita tu PIN de 6 dígitos para confirmar el cierre' })}

            <footer class="modal-actions" style="margin-top:14px;">
              <button type="button" class="button secondary" data-modal-close>Volver</button>
              <button class="button danger" type="submit" id="cash-close-submit" style="font-weight:700;">
                <i data-lucide="lock"></i> Autorizar y Cerrar Turno (Corte Z)
              </button>
            </footer>
          </form>
        </article>
      </div>
    `;
  }

  function promptDrawerPin() {
    state.modal = 'drawerPin';
    renderModal();
  }

  function drawerPinModal() {
    return `
      <div class="modal-backdrop" data-modal-close>
        <article class="modal-card" style="max-width:440px;" data-modal-card>
          <header>
            <div>
              <span class="eyebrow">Seguridad de Caja</span>
              <h2><i data-lucide="shield-check" style="width:20px;height:20px;display:inline-block;vertical-align:-3px;color:var(--brand-2);"></i> Abrir gaveta</h2>
            </div>
            <button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button>
          </header>
          <form id="drawer-pin-form" class="stack-form" style="padding-top:8px;">
            <p style="margin:0 0 10px; font-size:.82rem; color:var(--muted);">
              Ingresa el PIN personal de <strong>${escapeHtml(user.displayName || user.username)}</strong>. La acción quedará registrada con esta cuenta y la hora del servidor.
            </p>
            <label style="margin-bottom:6px;">Motivo de apertura
              <select name="reason" id="drawer-pin-reason" style="width:100%;">
                <option value="Dar cambio / Sencillo">Dar cambio / Sencillo</option>
                <option value="Auditoría / Arqueo de efectivo">Auditoría / Arqueo de efectivo</option>
                <option value="Retiro de efectivo / Caja">Retiro de efectivo / Caja</option>
                <option value="Ingreso de efectivo / Fondo">Ingreso de efectivo / Fondo</option>
                <option value="Apertura manual por revisión">Apertura manual por revisión</option>
              </select>
            </label>
            <input id="drawer-pin-input" name="pin" type="password" inputmode="none" pattern="[0-9]{6}" maxlength="6" placeholder="" required readonly tabindex="-1" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;">
            <div class="pin-slots-container" id="drawer-pin-slots">
              <span class="pin-slot" data-slot="0"></span>
              <span class="pin-slot" data-slot="1"></span>
              <span class="pin-slot" data-slot="2"></span>
              <span class="pin-slot" data-slot="3"></span>
              <span class="pin-slot" data-slot="4"></span>
              <span class="pin-slot" data-slot="5"></span>
            </div>
            <div class="pin-pad" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin:8px 0 12px;">
              ${[1,2,3,4,5,6,7,8,9].map((n) => `<button type="button" class="button secondary pin-num-btn" data-pin-num="${n}" style="font-size:1.3rem;font-weight:700;padding:12px 0;">${n}</button>`).join('')}
              <button type="button" class="button secondary pin-clear-btn" style="font-size:.85rem;font-weight:600;padding:12px 0;color:#f85149;">Borrar</button>
              <button type="button" class="button secondary pin-num-btn" data-pin-num="0" style="font-size:1.3rem;font-weight:700;padding:12px 0;">0</button>
              <button type="button" class="button secondary pin-del-btn" style="font-size:1.2rem;font-weight:700;padding:12px 0;">⌫</button>
            </div>
            <div id="drawer-pin-error" style="color:#f85149;font-size:0.82rem;min-height:18px;margin-bottom:6px;text-align:center;font-weight:600;"></div>
            <footer class="modal-actions" style="margin-top:0;">
              <button type="button" class="button secondary" data-modal-close>Cancelar</button>
              <button class="button primary" type="submit" id="drawer-pin-submit"><i data-lucide="key-round"></i> Autorizar y Abrir</button>
            </footer>
          </form>
        </article>
      </div>
    `;
  }
  function paymentFields(allowCredit=false){return `<div class="form-grid two"><label>Forma de pago<select name="method"><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="check">Cheque</option>${allowCredit?'<option value="credit">Fiao / pendiente de pago</option>':''}</select></label><label>Referencia<input name="reference" maxlength="120"></label></div>`;}
  function ncfField(){return `<label>Comprobante fiscal<select name="ncfType"><option value="">Sin NCF</option><option value="B02">Consumidor B02</option><option value="B01">Crédito fiscal B01</option><option value="B14">Régimen especial B14</option><option value="B15">Gubernamental B15</option></select></label>`;}
  function formModal(id,title,body,submit){return `<div class="modal-backdrop" data-modal-close><form id="${id}" class="modal-card form-modal" data-modal-card><header><div><span class="eyebrow">Operación segura</span><h2>${title}</h2></div><button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button></header><div class="stack-form">${body}</div><footer class="modal-actions"><button type="button" class="button secondary" data-modal-close>Cancelar</button><button class="button primary" type="submit">${submit}</button></footer></form></div>`;}
  async function perform(task,success,after){
    return updateSafety.run(async () => {
      try { const result=await task(); toast(success,'success'); after?.(result); return {ok:true,result}; }
      catch(error){ console.error(error); toast(error.message||'No se pudo completar la operación.','danger'); return {ok:false,error}; }
    });
  }
  function toast(message,tone='info'){const target=root.querySelector('#toast-root');if(!target)return;const item=document.createElement('div');item.className=`toast ${tone}`;item.textContent=message;target.appendChild(item);setTimeout(()=>item.remove(),4000);}
  function setBusy(button,busy){
    if(!button)return;
    if (busy && !busyButtons.has(button)) busyButtons.set(button, updateSafety.beginOperation());
    if (!busy) { busyButtons.get(button)?.(); busyButtons.delete(button); }
    button.disabled=busy;button.classList.toggle('loading',busy);button.setAttribute('aria-busy',String(busy));
    syncNativeUpdateState();
  }
  function capturePosDraft(){
    const form=root.querySelector('#pos-checkout-form');
    if(!form)return;
    const data=new FormData(form);
    state.posDraft={
      tableId:String(data.get('tableId')||''),ncfType:String(data.get('ncfType')||''),clientRnc:String(data.get('posClientRnc')||''),
      notes:String(data.get('notes')||''),cashReceived:String(root.querySelector('#pos-cash-received')?.value||''),
      cardReference:String(data.get('cardReference')||''),transferReference:String(data.get('transferReference')||''),
      fiaoClientId:String(data.get('fiaoClientId')||''),fiaoClientName:String(data.get('fiaoClientName')||''),
      fiaoClientPhone:String(data.get('fiaoClientPhone')||''),fiaoNotes:String(data.get('fiaoNotes')||''),
      fiaoSaveAsClient:data.get('fiaoSaveAsClient') === 'on',
      deliveryDriverId:String(data.get('deliveryDriverId')||''),deliveryDriverName:String(data.get('deliveryDriverName')||''),
      deliveryClientName:String(data.get('deliveryClientName')||''),deliveryPhone:String(data.get('deliveryPhone')||''),
      deliveryAddress:String(data.get('deliveryAddress')||''),
      deliveryChangeFor:String(root.querySelector('#pos-delivery-change-for')?.value||data.get('deliveryChangeFor')||''),
      deliveryNotes:String(data.get('deliveryNotes')||''),
      printReceipt:root.querySelector('#pos-print-receipt') ? root.querySelector('#pos-print-receipt').checked : (state.posDraft?.printReceipt !== false),
      advancedOpen:Boolean(root.querySelector('#pos-advanced-details')?.open),
      cashOpen:Boolean(root.querySelector('#pos-cash-panel details')?.open)
    };
    state.posPaymentMethod=String(data.get('paymentMethod')||state.posPaymentMethod||'cash');
  }
  function resetPosDraft(){
    state.posDraft={ printReceipt: true };state.posSearch='';state.posCategory='Todos';state.posPaymentMethod='cash';
    state.posDiscountState={discount:0,discountType:'amount',includeLegalTip:false};
  }
  function filterCards(event){
    const term=event.target.value.trim().toLowerCase();
    const activeCat = root.querySelector('[data-cat-filter].active')?.dataset.catFilter || 'Todos';
    let visibleCount = 0;
    root.querySelectorAll('#pos-products .product-card').forEach((item) => {
      const cardCat = item.dataset.category || 'General';
      const matchesCat = activeCat === 'Todos' || cardCat === activeCat;
      const matchesQuery = !term || item.dataset.search.includes(term);
      const isVisible = matchesCat && matchesQuery;
      item.hidden = !isVisible;
      if (isVisible) visibleCount++;
    });
    const emptyState = root.querySelector('#pos-no-matches');
    if (emptyState) emptyState.hidden = visibleCount > 0;
  }
  function filterDirectory(event){const term=event.target.value.trim().toLowerCase();root.querySelectorAll('[data-directory-row]').forEach((item)=>item.hidden=!item.dataset.search.includes(term));}
  function filterInvoiceRows(){const term=root.querySelector('#invoice-search')?.value.trim().toLowerCase()||'';const status=root.querySelector('#invoice-status-filter')?.value||'';root.querySelectorAll('[data-invoice-row]').forEach((item)=>item.hidden=!item.dataset.search.includes(term)||(status&&item.dataset.status!==status));}
  function updatePosFields(){
    const form=root.querySelector('#pos-checkout-form');
    if(!form)return;
    const table=Boolean(form.elements.tableId?.value);
    const method=form.elements.paymentMethod?.value||'cash';
    const paymentOptions = root.querySelector('#pos-payment-options');
    if (paymentOptions) paymentOptions.hidden = table;
    root.querySelectorAll('.pos-method-panel').forEach((panel) => panel.classList.remove('visible'));
    if (!table) {
      const panelMap = { cash: '#pos-cash-panel', card: '#pos-card-panel', transfer: '#pos-transfer-panel', credit: '#pos-fiao-panel', delivery_cod: '#pos-delivery-panel' };
      root.querySelector(panelMap[method])?.classList.add('visible');
    }
    updatePosSubmitLabel();
  }
  function updateConnection(){const online=navigator.onLine;const banner=root.querySelector('#offline-banner');if(banner)banner.hidden=online;root.querySelector('#connection-indicator')?.classList.toggle('offline',!online);}
  function iconsRefresh(container = root) {
    const target = container || root;
    if (!target || !target.querySelector('i[data-lucide]')) return;
    createIcons({ icons, nameAttr: 'data-lucide', rootNode: target, attrs: { 'aria-hidden': 'true' } });
  }
  function destroy(){
    destroyed=true;
    disposePinPad();
    for (const finish of busyButtons.values()) finish();
    busyButtons.clear();
    updateSafety.setBlocker('application', false);
    if (hardwarePollId) clearInterval(hardwarePollId);
    service.destroy();
    window.removeEventListener('online',updateConnection);
    window.removeEventListener('offline',updateConnection);
    window.removeEventListener('elo-scan',handleEloScanEvent);
    window.removeEventListener('elo-msr',handleEloMsrEvent);
    window.removeEventListener('elo-update-status',handleEloUpdateStatus);
    root.innerHTML='';
  }
  start().catch((error)=>{
    updateSafety.setBlocker('application', false);
    root.innerHTML=`<div class="fatal-state"><h1>No pudimos iniciar el sistema</h1><p>${escapeHtml(error.message)}</p><button class="button primary" data-retry-start>Reintentar</button></div>`;
    root.querySelector('[data-retry-start]')?.addEventListener('click',()=>location.reload());
  });
  return { destroy, state };
}

function initialRoute(user){const allowed=allowedNavigation(user);return allowed.includes(location.hash.slice(1))?location.hash.slice(1):allowed[0]||'dashboard';}
function roleLabel(role){return({owner:'Propietario',manager:'Gerencia',cashier:'Caja',waiter:'Camarero',kitchen:'Cocina'})[role]||'Usuario';}
