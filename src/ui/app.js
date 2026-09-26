import {
  Activity, AlertTriangle, ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, BadgeCheck, BadgeDollarSign, Banknote, Barcode, Beef, Beer, Bell, Bike, BookOpen, Cake, Calculator, Calendar,
  CalendarX, ChartNoAxesCombined, Check, CheckCircle2, CheckSquare, ChefHat, ChevronDown, ChevronUp, CircleDollarSign, ClipboardCheck, ClipboardPen, Clock, Clock3, ClockAlert, Coffee, Coins, Cpu, CreditCard, CupSoda, Download, Eye, EyeOff,
  FileCheck2, FileSpreadsheet, FileText, FileX2, FilterX, Flame, Globe, History, KeyRound, Landmark, Layers, LayoutDashboard, Lock, LogOut, Menu,
  MessageSquare, MessageSquarePlus, MessageSquareWarning, Minus, Monitor, Moon, Package, PackageMinus, PackageOpen, PackagePlus, PanelLeftClose, PanelLeftOpen,
  Pencil, Percent, Phone, Plus, Printer, QrCode, Radio, Receipt, ReceiptText, RefreshCw, RotateCcw, Salad, Sandwich, Save, ScanBarcode,
  Search, Send, Settings, Sheet, ShieldAlert, ShieldCheck, ShoppingBasket, ShoppingCart, Sliders, SlidersHorizontal,
  Smartphone, Sparkles, Star, Timer, Trash2, TrendingDown, TrendingUp, Truck, Unlock, Usb, UserCheck, UserPlus, Users, UserX, Utensils, Volume2,
  Wallet, WalletCards, Wheat, Wifi, WifiOff, Wrench, X, Zap
} from 'lucide';
import { can, allowedNavigation, primaryRole } from '../domain/roles.js';
import { calculateDocument, toCents, getPendingDeliveryInvoices } from '../domain/billing.js';
import { orderPricing, editedOrderPricing } from '../domain/order-pricing.js';
import { createClientMemorySelector, searchClientMemory, isDeliveryInvoice, invoiceBelongsToClient } from '../domain/client-memory.js';
import { renderCartLines, renderCartTotals, renderDashboard, renderKds, renderOrderDrawer, renderPos, renderTables, renderTablePickerModal, renderProductOptionPickerModal } from '../modules/operations.js';
import { hasProductVariants, hasProductSides, calculateVariantLinePrice, formatLineName, VARIANT_TEMPLATES } from '../domain/catalog.js';
import { exportReport, renderInvoiceModal, renderInvoices, renderReports } from '../modules/billing.js';
import { renderReceivables, renderFiaoPayModal, renderClientBulkPayModal, renderClientStatementModal } from '../modules/receivables.js';
import { renderDeliveries, renderDriverFormModal, renderDeliverySettleModal, renderReassignDeliveryModal } from '../modules/deliveries.js';
import { renderWhatsApp, bindWhatsAppEvents } from '../modules/whatsapp.js';
import { renderClientForm, renderClients, renderProductForm, renderProducts, renderStockAdjustModal, renderEndDayWasteModal } from '../modules/directory.js';
import { getInventoryReason } from '../domain/inventory.js';
import { renderPayroll, renderPayrollLockScreen, renderEmployeeFormModal, renderPayrollPaymentModal } from '../modules/payroll.js';
import { calculatePayrollNetCents } from '../domain/payroll.js';
import { renderCash, renderSettings, renderUserForm, renderUsers, renderUsersLockScreen, renderTerminalDiag, renderAuditLogs, CASH_MOVEMENT_CATEGORIES, getCashMovementCategoryMeta, calculateCashSessionFinancials, enrichAuditLog, filterAuditByTime, buildAuditLogsCsv } from '../modules/administration.js';
import { downloadText, escapeHtml, formatMoney } from '../lib/format.js';
import { businessDateKey } from '../lib/business-time.js';
import { createOperationId } from '../lib/id.js';
import { affectsCurrentView } from '../lib/live-view.js';
import { createRenderQueue } from '../lib/render-queue.js';
import {
  openCashDrawerHardware, buildInvoiceEscPos, buildInvoicePlainText, buildKitchenEscPos, buildKitchenPlainText,
  buildCashReportEscPos, buildCashReportPlainText, buildPrebillEscPos, buildPrebillPlainText,
  buildDeliverySettlementEscPos, buildDeliverySettlementPlainText, buildPayrollReceiptEscPos, buildPayrollReceiptPlainText,
  buildReceivablesReportEscPos, buildReceivablesReportPlainText, buildClientStatementEscPos, buildClientStatementPlainText,
  buildClientSettlementEscPos, buildClientSettlementPlainText,
  buildCashMovementEscPos, buildCashMovementPlainText,
  sendEscPosToPrinter, EscPosBuilder, checkEloNativeServer,
  calculateClientTotalDebt,

  startEloScanner, stopEloScanner, setVFDMessage, clearVFD, vfdWelcome,
  beepHardware, getHardwareStatus, checkPaperStatus, sendEloCommand,
  getEloUpdateStatus, checkEloAppUpdate, installEloAppUpdate, openEloUpdatePermission
} from '../lib/hardware.js';
import { bindPinPad, renderPinPadHtml } from '../lib/pin-pad.js';
import { updateForms, updateSafety } from '../lib/update-safety.js';
import { setupTouchNumericInputs } from '../lib/touch-numpad.js';
import { createScopedIcons } from '../lib/scoped-icons.js';
import { preparePaymentAttempt, executePaymentAttempt } from '../lib/payment-attempt.js';
import { createSleepManager } from '../lib/sleep-manager.js';
import { startRemoteTerminals } from '../services/remote-terminals.js';
import { renderRemoteTerminals } from '../modules/remote-terminals.js';
import { matchesFuzzy, fuzzyScore } from '../lib/fuzzy-search.js';

const NAV = [
  ['dashboard','layout-dashboard','Resumen'], ['pos','shopping-cart','Punto de venta'],
  ['kds','chef-hat','Cocina KDS'],
  ['invoices','receipt-text','Facturación'], ['receivables','book-open','Fiao / Por Cobrar'],
  ['deliveries','bike','Deliveries'], ['clients','users','Clientes'],
  ['products','package','Productos'], ['whatsapp','smartphone','Bot WhatsApp'], ['cash','wallet-cards','Caja'],
  ['reports','chart-no-axes-combined','Reportes'],
  ['users','lock','Usuarios (PIN)'], ['audit','shield-check','Auditoría'], ['terminal','cpu','Terminal ELO'], ['settings','settings','Configuración'],
  ['payroll','lock','Nómina (PIN)'], ['remote','monitor','Mis terminales']
];

const icons = {
  Activity, AlertTriangle, ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, BadgeCheck, BadgeDollarSign, Banknote, Barcode, Beef, Beer, Bell, Bike, BookOpen, Cake, Calculator, Calendar, ChartNoAxesCombined, Check, CheckCircle2, CheckSquare, ChefHat,
  ChevronDown, ChevronUp, CircleDollarSign, ClipboardCheck, ClipboardPen, Clock, Clock3, ClockAlert, Coffee, Coins, Cpu, CreditCard, CupSoda, Download, Eye, EyeOff, FileCheck2, FileSpreadsheet, FileText, FileX2, FilterX, Flame, Globe, History, KeyRound, Landmark,
  Layers, LayoutDashboard, Lock, LogOut, Menu, MessageSquare, MessageSquarePlus, MessageSquareWarning, Minus, Monitor, Moon, Package, PackageMinus, PackageOpen, PackagePlus, PanelLeftClose, PanelLeftOpen,
  Pencil, Percent, Phone, Plus, Printer, QrCode, Radio, Receipt, ReceiptText, RefreshCw, RotateCcw, Salad, Sandwich, Save, ScanBarcode, Search, Send, Settings, Sheet,
  ShieldAlert, ShieldCheck, ShoppingBasket, ShoppingCart, Sliders, SlidersHorizontal, Smartphone, Sparkles, Star, Timer, Trash2, TrendingDown, TrendingUp, Truck, Unlock, Usb, UserCheck, UserPlus, Users, UserX,
  Utensils, Volume2, Wallet, WalletCards, Wheat, Wifi, WifiOff, Wrench, X, Zap
};
const refreshScopedIcons = createScopedIcons(icons);

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
  const readClientMemory = createClientMemorySelector();
  const state = {
    get clientMemory() { return readClientMemory(this); },
    user, settings: {}, route: initialRoute(user), cart: [], selectedOrderId: '', selectedInvoiceId: '', preselectedTableId: '', modal: '',
    loadedOrderId: '', loadedTableId: '', loadedOrderRevision: null, sendingOrder: false,
    hardwareStatus: null, updateStatus: getEloUpdateStatus(), scannerActive: false, checkoutOpening: false, saleInProgress: false, pendingLiveRender: false, pendingPinDestination: '', mobileReportPeriod: 'day', posDiscountState: { discount: 0, discountType: 'amount', includeLegalTip: false }, posDraft: {}, posSearch: '', posCategory: 'Todos', posPaymentMethod: 'cash',
    sidebarCollapsed: typeof localStorage !== 'undefined' && localStorage.getItem('panitas_sidebar_collapsed') === '1',
    products: [], clients: [], tables: [], orders: [], invoices: [], payments: [], cashSessions: [], cashMovements: [], users: [], auditLogs: [], deliveryDrivers: [], selectedDeliveryDriver: null, selectedDeliveryInvoices: [], editingDriver: null, reassigningInvoiceId: '', whatsappBot: null, development,
    auditCategoryFilter: 'all', auditTimeFilter: 'all', auditSearchTerm: '', auditDisplayLimit: 50,
    deliveriesTab: 'active', deliveriesViewMode: 'drivers', deliveriesDriverFilter: 'all', deliveriesSearch: '', deliveriesSort: 'time_asc', deliveriesExpandedDrivers: {}, deliveriesAllExpanded: null,
    cashTab: 'overview', cashMovementTypeFilter: 'all', cashMovementSearch: '', cashMovementModalType: 'out',
    inventoryMovements: [], productsTab: 'catalog', editingStockProduct: null,
    productsCategoryFilter: 'all', productsTypeFilter: 'all', productsSearch: '', productsSort: 'name_asc', productsViewMode: 'grid',
    clientsFilter: 'all', clientsSearch: '', clientsSort: 'debt_desc', clientsViewMode: 'table',
    employees: [], payrollPayments: [], payrollTab: 'payments', editingEmployee: null, payingEmployeeId: null,
    payrollUnlocked: false, payrollMasked: false, usersUnlocked: false, posDestination: 'takeout',
    receivablesTab: 'debts', receivablesChannelFilter: 'all', receivablesViewMode: 'clients', receivablesAgeFilter: 'all', receivablesAmountFilter: 'all',
    receivablesContactFilter: 'all', receivablesSort: 'debt_desc', receivablesSearch: '', selectedFiaoInvoice: null,
    selectedClientBulkPay: null, selectedClientStatement: null,
    capabilities: {
      bill: can(user, 'billing:create'), cancelInvoice: can(user, 'billing:cancel'), chargeOrder: can(user, 'orders:charge'),
      createOrder: can(user, 'orders:create'), updateOrder: can(user, 'orders:update'), serveOrder: can(user, 'orders:serve'),
      kitchenOrder: can(user, 'orders:kitchen'), viewKds: can(user, 'kds:view'), manageCatalog: can(user, 'catalog:*'), manageClients: can(user, 'clients:*'), manageUsers: can(user, 'users:manage'),
      cashDrawer: !managementMode && (can(user, 'billing:create') || can(user, 'orders:charge') || can(user, 'cash:*'))
    }
  };
  let destroyed = false;
  let remoteControl = null;
  let remoteRequestBusy = false;
  let disposePinPad = () => {};
  let disposePayrollPin = () => {};
  let disposeUsersPin = () => {};
  let drawerInProgress = false;
  let previousKdsOrders = new Set();
  let hardwarePollId = null;
  let hardwarePollInFlight = false;
  const busyButtons = new Map();
  let cashFormInProgress = false;
  let movementAttempt = null;
  updateSafety.setBlocker('application', true);

  const sleepManager = createSleepManager({
    getTimeoutSeconds: () => (state.settings?.screenSleepTimeout != null ? Number(state.settings.screenSleepTimeout) : 180),
    isBusy: () => updateSafety.isBusy() || state.saleInProgress || state.checkoutOpening || busyButtons.size > 0,
    onSleep: () => {
      setVFDMessage('MODO REPOSO', 'LOS PANITAS').catch(() => {});
    },
    onWake: () => {
      setVFDMessage('LOS PANITAS', 'BIENVENIDO').catch(() => {});
      flushPendingLiveRender();
    }
  });

  async function start() {
    state.settings = await service.loadSettings();
    remoteControl = startRemoteTerminals({ db: service.db, user,
      onChange: rows => { state.remoteTerminals = rows; state.remoteError = ''; if (state.route === 'remote') requestLiveRender(); },
      onError: message => { state.remoteError = message; if (state.route === 'remote') requestLiveRender(); }
    });
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
    sleepManager.start();
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
      if (destroyed || hardwarePollInFlight || state.saleInProgress || document.hidden || sleepManager.isSleeping()) return;
      hardwarePollInFlight = true;
      try {
        const st = await getHardwareStatus();
        if (st && st.ok) {
          const prevOut = state.hardwareStatus?.paperOut;
          state.hardwareStatus = st;
          if (st.paperOut && !prevOut) {
            toast('ALERTA: ¡La impresora se ha quedado sin papel térmico! Por favor coloca un rollo nuevo de 80mm.', 'danger', 10000);
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

  const liveRenderQueue = createRenderQueue({
    isPaused: () => destroyed || document.hidden || sleepManager.isSleeping(),
    canRender: () => {
      const active = document.activeElement;
      const editingField = active && root.contains(active) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
      const modalFormOpen = Boolean(root.querySelector('#modal-root form'));
      return !(state.saleInProgress || editingField || modalFormOpen || updateForms.isDirty(root));
    },
    render: () => renderContent(),
    onPendingChange: (pending) => { state.pendingLiveRender = pending; }
  });
  function requestLiveRender() { liveRenderQueue.request(); }

  function flushPendingLiveRender() {
    setTimeout(() => liveRenderQueue.flush(), 0);
  }
  document.addEventListener('visibilitychange', flushPendingLiveRender);

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
        <nav>${allowedNavigation(user).map((id) => { const entry=NAV.find((item)=>item[0]===id); if (!entry) return ''; return `<button data-route="${id}" class="${state.route===id?'active':''}" title="${entry[2]}"><i data-lucide="${entry[1]}"></i><span>${entry[2]}</span></button>`; }).join('')}</nav>
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
    bindShell(); renderContent(); updateConnection(); refreshUpdateBanner(); iconsRefresh(root);
  }

  function renderContent() {
    if (!root.querySelector('#main-content')) return;
    liveRenderQueue.clear();
    state.activeCash = activeCash();
    const renderers = {
      dashboard: renderDashboard, pos: renderPos, tables: renderTables, kds: renderKds,
      invoices: renderInvoices, receivables: renderReceivables, deliveries: renderDeliveries, clients: renderClients, products: renderProducts,
      whatsapp: renderWhatsApp, cash: renderCash,
      payroll: () => (!state.payrollUnlocked ? renderPayrollLockScreen(state, user) : renderPayroll(state)),
      reports: renderReports,
      users: () => (!state.usersUnlocked ? renderUsersLockScreen(state, user) : renderUsers(state)),
      audit: renderAuditLogs,
      terminal: () => renderTerminalDiag(), settings: renderSettings, remote: renderRemoteTerminals
    };
    const renderer = renderers[state.route] || renderDashboard;
    // The native cash register never displays the mobile-only inventory/dashboard.
    state.terminalMode = Boolean(window.EloPOS);
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
    else if (state.modal === 'invoice' || state.modal === 'invoiceDetail') modalRoot.innerHTML = renderInvoiceModal(state.invoices.find((item)=>item.id===(state.selectedInvoiceId || state.selectedInvoice?.id)), state.payments, state.capabilities);
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
    else if (state.modal === 'clientBulkPay') modalRoot.innerHTML = renderClientBulkPayModal(state.selectedClientBulkPay, state.activeCash);
    else if (state.modal === 'clientStatement') modalRoot.innerHTML = renderClientStatementModal(state.selectedClientStatement, state.settings);
    else if (state.modal === 'driverForm') modalRoot.innerHTML = renderDriverFormModal(state.editingDriver);
    else if (state.modal === 'deliverySettle') modalRoot.innerHTML = renderDeliverySettleModal(state.selectedDeliveryDriver, state.selectedDeliveryInvoices || [], state.activeCash);
    else if (state.modal === 'employeeForm') modalRoot.innerHTML = renderEmployeeFormModal(state.editingEmployee);
    else if (state.modal === 'payrollPayment') modalRoot.innerHTML = renderPayrollPaymentModal({ employees: state.employees, selectedEmployeeId: state.payingEmployeeId, activeCash: state.activeCash });
    else if (state.modal === 'itemNote') modalRoot.innerHTML = itemNoteModal();
    else if (state.modal === 'quantity') modalRoot.innerHTML = quantityModal();
    else if (state.modal === 'itemPrice') modalRoot.innerHTML = itemPriceModal();
    else if (state.modal === 'user') modalRoot.innerHTML = renderUserForm(state.editingUser);
    else if (state.modal === 'password') modalRoot.innerHTML = passwordModal();
    else if (state.modal === 'cancelOrder') modalRoot.innerHTML = cancellationModal('order');
    else if (state.modal === 'cancelInvoice') modalRoot.innerHTML = cancellationModal('invoice');
    else if (state.modal === 'stockAdjust') modalRoot.innerHTML = renderStockAdjustModal(state.editingStockProduct || {});
    else if (state.modal === 'endDayWaste') modalRoot.innerHTML = renderEndDayWasteModal(state.products || []);
    else if (state.modal === 'tablePicker') modalRoot.innerHTML = renderTablePickerModal(state.tables, state.loadedTableId || state.posDraft?.tableId, state.orders);
    else if (state.modal === 'reassignDelivery') {
      const inv = (state.invoices || []).find((i) => i.id === state.reassigningInvoiceId) || (state.lastSaleResult?.id === state.reassigningInvoiceId ? state.lastSaleResult : null);
      modalRoot.innerHTML = renderReassignDeliveryModal(inv, state.deliveryDrivers);
    }
    else if (state.modal === 'productOptions') {
      modalRoot.innerHTML = renderProductOptionPickerModal(state.optionPickerProduct, state.optionPickerItem, state.optionPickerCartIndex);
    }
    else modalRoot.innerHTML = '';
    iconsRefresh(modalRoot); bindModal(); syncNativeUpdateState(); setupTouchNumericInputs(modalRoot);
  }

  function bindShell() {
    root.querySelectorAll('[data-route]').forEach((button)=>button.addEventListener('click',()=>route(button.dataset.route)));
    root.querySelector('[data-logout]')?.addEventListener('click', onLogout);
    root.querySelector('[data-password]')?.addEventListener('click',()=>{state.modal='password';renderModal();});
    root.querySelector('[data-menu]')?.addEventListener('click',()=>root.querySelector('.sidebar').classList.toggle('open'));
    root.querySelectorAll('[data-drawer-kick]').forEach((btn)=>btn.addEventListener('click', () => promptDrawerPin(btn.dataset.drawerKick || 'open_only')));
    root.querySelectorAll('[data-quick-open-cash]').forEach((btn)=>btn.addEventListener('click', () => { state.modal = 'quickCash'; renderModal(); }));
    root.querySelectorAll('[data-cash-movement-open]').forEach((btn)=>btn.addEventListener('click', () => { state.cashMovementModalType = btn.dataset.cashMovementOpen === 'in' ? 'in' : 'out'; state.modal = 'cashMovement'; renderModal(); }));
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
    if (state.sendingOrder) return;
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
    if (state.sendingOrder) return toast('Espera a que termine de guardarse la comanda.', 'warning');
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
    root.querySelectorAll('[data-cart-edit-options]').forEach((button) =>
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        openCartItemOptions(Number(button.dataset.cartEditOptions));
      })
    );
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
            toast('El sensor aún detecta que la impresora no tiene papel.', 'danger');
            beepHardware('error');
          } else {
            toast('¡Papel térmico de 80mm detectado correctamente!', 'success');
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
    root.querySelectorAll('[data-pos-load-table]').forEach((btn)=>btn.addEventListener('click',()=>loadTableOrderToCart(btn.dataset.posLoadTable)));
    root.querySelectorAll('[data-pos-release-cart]').forEach((btn)=>btn.addEventListener('click',releaseLoadedCart));
    root.querySelectorAll('[data-pos-cancel-table]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleCancelAndLiberateTable(btn.dataset.posCancelTable, btn);
      });
    });
    root.querySelectorAll('[data-pos-pick-table]').forEach((btn)=>btn.addEventListener('click',()=>{
      state.tablePickerAction = 'select';
      state.modal='tablePicker';
      renderModal();
    }));
    root.querySelectorAll('[data-pos-set-dest="takeout"]').forEach((btn) => btn.addEventListener('click', () => {
      state.posDestination = 'takeout';
      if (state.posPaymentMethod === 'delivery_cod') state.posPaymentMethod = 'cash';
      state.loadedOrderId = '';
      state.loadedTableId = '';
      if (state.posDraft) state.posDraft.tableId = '';
      const sel = root.querySelector('#pos-table-select');
      if (sel) sel.value = '';
      renderContent();
    }));
    root.querySelectorAll('[data-pos-set-dest="table"]').forEach((btn) => btn.addEventListener('click', () => {
      state.posDestination = 'table';
      if (state.posPaymentMethod === 'delivery_cod') state.posPaymentMethod = 'cash';
      state.tablePickerAction = 'select';
      state.modal = 'tablePicker';
      renderModal();
    }));
    root.querySelectorAll('[data-pos-set-dest="delivery"]').forEach((btn) => btn.addEventListener('click', () => {
      state.posDestination = 'delivery';
      if (state.posPaymentMethod === 'cash') state.posPaymentMethod = 'delivery_cod';
      state.loadedOrderId = '';
      state.loadedTableId = '';
      if (state.posDraft) state.posDraft.tableId = '';
      const sel = root.querySelector('#pos-table-select');
      if (sel) sel.value = '';
      renderContent();
    }));
    root.querySelectorAll('[data-pos-settle-driver]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const driverId = btn.dataset.posSettleDriver;
        const driver = (state.deliveryDrivers || []).find((d) => d.id === driverId || d.name === driverId) || { id: driverId, name: driverId || 'Mensajero' };
        const pendingInvoices = (state.invoices || []).filter((inv) =>
          (inv.deliveryDriverId === driverId || inv.deliveryDriverName === driverId || (!inv.deliveryDriverId && inv.paymentMethod === 'delivery_cod')) &&
          inv.status !== 'paid' && inv.status !== 'cancelled'
        );
        state.selectedDeliveryDriver = driver;
        state.selectedDeliveryInvoices = pendingInvoices;
        state.modal = 'deliverySettle';
        renderModal();
      });
    });
    root.querySelectorAll('[data-pos-clear-client]').forEach((btn) => btn.addEventListener('click', () => {
      const input = root.querySelector('#pos-client-name');
      if (input) input.value = '';
      if (state.posDraft) state.posDraft.clientName = '';
      const debtWarning = root.querySelector('#pos-client-debt-warning');
      if (debtWarning) debtWarning.classList.add('hidden');
      renderContent();
    }));

    function bindClientAutocomplete(inputSelector, dropdownSelector) {
      const input = root.querySelector(inputSelector);
      const dropdown = root.querySelector(dropdownSelector);
      if (!input || !dropdown) return;

      const handleSearch = (term) => {
        const q = String(term || '').trim();
        if (!q) {
          dropdown.innerHTML = '';
          dropdown.classList.add('hidden');
          const debtWarning = root.querySelector('#pos-client-debt-warning');
          if (debtWarning && inputSelector === '#pos-client-name') debtWarning.classList.add('hidden');
          return;
        }

        const memory = state.clientMemory;
        const suggestions = searchClientMemory(memory, q, 6);

        if (!suggestions.length) {
          dropdown.innerHTML = '';
          dropdown.classList.add('hidden');
          return;
        }

        dropdown.innerHTML = suggestions.map(c => `
          <div
            class="client-autocomplete-item"
            data-ac-name="${escapeHtml(c.name)}"
            data-ac-id="${escapeHtml(c.id || '')}"
            data-ac-phone="${escapeHtml(c.phone || '')}"
            data-ac-address="${escapeHtml(c.address || '')}"
            data-ac-notes="${escapeHtml(c.notes || '')}"
            data-ac-debt="${c.totalDebtCents}"
            data-ac-fiao="${c.fiaoDebtCents}"
            data-ac-deliv="${c.deliveryDebtCents}"
          >
            <div class="client-ac-main">
              <strong class="client-ac-name">${escapeHtml(c.name)}</strong>
              ${c.fiaoDebtCents > 0 ? `<span class="client-ac-badge debt"><i data-lucide="alert-circle" style="width:11px;height:11px;display:inline-block;vertical-align:-1px;margin-right:3px;"></i>Debe ${formatMoney(c.fiaoDebtCents)}</span>` : ''}
              ${c.deliveryDebtCents > 0 ? `<span class="client-ac-badge info"><i data-lucide="bike" style="width:11px;height:11px;display:inline-block;vertical-align:-1px;margin-right:3px;"></i>${formatMoney(c.deliveryDebtCents)}</span>` : ''}
              ${c.totalDebtCents === 0 ? `<span class="client-ac-badge ok"><i data-lucide="check-circle" style="width:11px;height:11px;display:inline-block;vertical-align:-1px;margin-right:3px;"></i>Al día</span>` : ''}
            </div>
            ${(c.phone || c.address) ? `
              <div class="client-ac-details">
                ${c.phone ? `<span><i data-lucide="phone" style="width:11px;height:11px;display:inline-block;vertical-align:-1px;margin-right:3px;"></i>${escapeHtml(c.phone)}</span>` : ''}
                ${c.address ? `<span><i data-lucide="map-pin" style="width:11px;height:11px;display:inline-block;vertical-align:-1px;margin-right:3px;"></i>${escapeHtml(c.address)}</span>` : ''}
              </div>
            ` : ''}
          </div>
        `).join('');
        dropdown.classList.remove('hidden');
        iconsRefresh(dropdown);

        dropdown.querySelectorAll('.client-autocomplete-item').forEach(item => {
          item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const name = item.dataset.acName;
            const id = item.dataset.acId;
            const phone = item.dataset.acPhone;
            const address = item.dataset.acAddress;
            const notes = item.dataset.acNotes;
            const totalDebt = Number(item.dataset.acDebt || 0);
            const fiaoDebt = Number(item.dataset.acFiao || 0);
            const delivDebt = Number(item.dataset.acDeliv || 0);

            input.value = name;
            if (state.posDraft) {
              state.posDraft.clientName = name;
              state.posDraft.clientId = id;
              if (phone) state.posDraft.deliveryPhone = phone;
              if (address) state.posDraft.deliveryAddress = address;
              if (notes && !state.posDraft.deliveryNotes) state.posDraft.deliveryNotes = notes;
            }

            // Actualizar inputs en toda la vista de POS
            const mainClientInput = root.querySelector('#pos-client-name');
            if (mainClientInput && mainClientInput !== input) mainClientInput.value = name;

            const phoneInputs = root.querySelectorAll('#pos-delivery-phone, #pos-fiao-phone');
            phoneInputs.forEach(pIn => {
              if (phone) pIn.value = phone;
            });

            const addressInputs = root.querySelectorAll('#pos-delivery-address');
            addressInputs.forEach(aIn => {
              if (address) aIn.value = address;
            });

            const delivClientInput = root.querySelector('#pos-delivery-client-name');
            if (delivClientInput && delivClientInput !== input) delivClientInput.value = name;

            const fiaoNameInput = root.querySelector('#pos-fiao-name');
            if (fiaoNameInput && fiaoNameInput !== input) fiaoNameInput.value = name;

            const fiaoIdInput = root.querySelector('#pos-fiao-client-id');
            if (fiaoIdInput && id) fiaoIdInput.value = id;

            // Alerta visual de fiao pendiente en el panel de crédito
            const debtInfo = root.querySelector('#pos-fiao-debt-info');
            const debtText = root.querySelector('#pos-fiao-debt-text');
            if (debtInfo && debtText) {
              if (totalDebt > 0) {
                debtText.textContent = `Atención: ${name} tiene ${formatMoney(totalDebt)} pendientes (${formatMoney(fiaoDebt)} fiao, ${formatMoney(delivDebt)} delivery).`;
                debtInfo.style.display = 'block';
              } else {
                debtInfo.style.display = 'none';
              }
            }

            // Alerta de fiao pendiente en el carrito
            const debtWarning = root.querySelector('#pos-client-debt-warning');
            if (debtWarning) {
              if (totalDebt > 0) {
                debtWarning.innerHTML = `
                  <i data-lucide="alert-triangle" style="width:16px;height:16px;color:#f87171;flex-shrink:0;"></i>
                  <div>
                    <strong>Cliente con saldo pendiente:</strong> ${escapeHtml(name)} debe <strong>${formatMoney(totalDebt)}</strong> (${fiaoDebt > 0 ? `Fiao: ${formatMoney(fiaoDebt)}` : ''}${fiaoDebt > 0 && delivDebt > 0 ? ' · ' : ''}${delivDebt > 0 ? `Delivery: ${formatMoney(delivDebt)}` : ''}).
                  </div>
                `;
                if (window.lucide && typeof window.lucide.createIcons === 'function') {
                  try { window.lucide.createIcons(); } catch (_) {}
                }
                debtWarning.classList.remove('hidden');
              } else {
                debtWarning.classList.add('hidden');
              }
            }

            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
          });
        });
      };

      input.addEventListener('input', (e) => handleSearch(e.target.value));
      input.addEventListener('focus', (e) => {
        if (e.target.value.trim()) handleSearch(e.target.value);
      });
      input.addEventListener('blur', () => {
        setTimeout(() => {
          dropdown.classList.add('hidden');
        }, 220);
      });
    }

    bindClientAutocomplete('#pos-client-name', '#pos-client-autocomplete-list');
    bindClientAutocomplete('#pos-fiao-name', '#pos-fiao-autocomplete-list');
    bindClientAutocomplete('#pos-delivery-client-name', '#pos-delivery-autocomplete-list');
    root.querySelectorAll('[data-pos-send-table]').forEach((btn)=>btn.addEventListener('click',()=>{
      const tableId = root.querySelector('#pos-table-select')?.value || state.loadedTableId || state.posDraft?.tableId || '';
      if (tableId) {
        sendComandaToTable(tableId);
      } else {
        state.tablePickerAction = 'send';
        state.modal = 'tablePicker';
        renderModal();
      }
    }));
    root.querySelectorAll('[data-cart-set-qty]').forEach((btn)=>btn.addEventListener('click',()=>openQuantityModal(Number(btn.dataset.cartSetQty))));
    root.querySelectorAll('[data-cart-set-price]').forEach((btn)=>btn.addEventListener('click',()=>openItemPriceModal(Number(btn.dataset.cartSetPrice))));
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
          invoiceBelongsToClient(inv, selectedClient)
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
      const matches = (state.clients || []).filter(c => c.name && c.name.trim().toLowerCase() === typedName);
      const matchingClient = matches.length === 1 ? matches[0] : null;
      const clientIdInput = root.querySelector('#pos-fiao-client-id');
      if (clientIdInput) clientIdInput.value = matchingClient?.id || '';
      if (matchingClient) {
        const phoneInput = root.querySelector('#pos-fiao-phone');
        if (phoneInput && !phoneInput.value && matchingClient.phone) phoneInput.value = matchingClient.phone;
        const idInput = root.querySelector('#pos-fiao-client-id');
        if (idInput) idInput.value = matchingClient.id;
      }
      const pendingInvoices = (state.invoices || []).filter(inv =>
        inv.documentType === 'invoice' && inv.status !== 'paid' && inv.status !== 'cancelled' &&
        invoiceBelongsToClient(inv, matchingClient || { name: typedName })
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

    function syncDeliveryFee(feeVal) {
      const feeNum = Number(String(feeVal || 0).replace(/,/g, '').trim());
      const feeCents = Number.isFinite(feeNum) && feeNum > 0 ? Math.round(feeNum * 100) : 0;
      const existingIndex = state.cart.findIndex(i => i.isDeliveryFee || i.productId === 'prod-costo-de-envio-delivery' || (i.name && i.name.toLowerCase().includes('costo de envío')));
      if (feeCents > 0) {
        if (existingIndex >= 0) {
          state.cart[existingIndex].unitPriceCents = feeCents;
        } else {
          state.cart.push({
            productId: 'prod-costo-de-envio-delivery',
            name: 'Costo de Envío (Delivery)',
            quantity: 1,
            unitPriceCents: feeCents,
            taxRate: 0,
            notes: '',
            isDeliveryFee: true
          });
        }
      } else if (existingIndex >= 0) {
        state.cart.splice(existingIndex, 1);
      }
      renderPosCartOnly();
      capturePosDraft();
    }

    root.querySelector('#pos-delivery-fee')?.addEventListener('input', (e) => {
      syncDeliveryFee(e.target.value);
    });
    root.querySelectorAll('[data-quick-delivery-fee]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.quickDeliveryFee;
        const feeInput = root.querySelector('#pos-delivery-fee');
        if (feeInput) feeInput.value = Number(val) > 0 ? Number(val).toFixed(2) : '';
        syncDeliveryFee(val);
      });
    });

    // Fiao / Cuentas por Cobrar
    root.querySelectorAll('[data-receivables-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.receivablesTab = btn.dataset.receivablesTab || 'debts';
        renderContent();
      });
    });
    root.querySelectorAll('[data-receivables-channel]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.receivablesChannelFilter = btn.dataset.receivablesChannel || 'all';
        renderContent();
      });
    });
    root.querySelectorAll('[data-receivables-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.receivablesViewMode = btn.dataset.receivablesView || 'clients';
        renderContent();
      });
    });
    root.querySelectorAll('[data-receivables-age]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.receivablesAgeFilter = btn.dataset.receivablesAge || 'all';
        renderContent();
      });
    });
    root.querySelector('#fiao-amount-filter')?.addEventListener('change', (e) => {
      state.receivablesAmountFilter = e.target.value;
      renderContent();
    });
    root.querySelector('#fiao-contact-filter')?.addEventListener('change', (e) => {
      state.receivablesContactFilter = e.target.value;
      renderContent();
    });
    root.querySelector('#fiao-sort-select')?.addEventListener('change', (e) => {
      state.receivablesSort = e.target.value;
      renderContent();
    });
    root.querySelector('[data-receivables-clear-filters]')?.addEventListener('click', () => {
      state.receivablesChannelFilter = 'all';
      state.receivablesAgeFilter = 'all';
      state.receivablesAmountFilter = 'all';
      state.receivablesContactFilter = 'all';
      state.receivablesSearch = '';
      renderContent();
    });

    root.querySelector('#fiao-search')?.addEventListener('input', (e) => {
      state.receivablesSearch = e.target.value;
      const q = (e.target.value || '').trim();
      root.querySelectorAll('[data-fiao-card]').forEach((card) => {
        const search = card.dataset.search || '';
        card.hidden = q ? !matchesFuzzy(q, search) : false;
      });
      root.querySelectorAll('[data-fiao-row]').forEach((row) => {
        const search = row.dataset.search || '';
        row.hidden = q ? !matchesFuzzy(q, search) : false;
      });
    });

    // Imprimir Arqueo / Reporte General de Fiaos en Térmica
    root.querySelector('[data-receivables-print-report]')?.addEventListener('click', async () => {
      const channel = state.receivablesChannelFilter || 'all';
      let pendingInvoices = (state.invoices || []).filter(
        (inv) => inv.documentType === 'invoice' &&
          inv.status !== 'paid' &&
          inv.status !== 'cancelled' &&
          (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)) > 0
      );
      if (channel === 'fiao') {
        pendingInvoices = pendingInvoices.filter(i => !isDeliveryInvoice(i));
      } else if (channel === 'delivery') {
        pendingInvoices = pendingInvoices.filter(i => isDeliveryInvoice(i));
      }
      const clientMap = new Map();
      for (const inv of pendingInvoices) {
        const name = String(inv.clientName || 'Cliente').trim();
        if (!clientMap.has(name)) {
          clientMap.set(name, { name, phone: inv.clientPhone || '', totalDebtCents: 0, maxAgeDays: 0 });
        }
        const c = clientMap.get(name);
        if (!c.phone && inv.clientPhone) c.phone = inv.clientPhone;
        const bal = Number(inv.totalCents || 0) - Number(inv.paidCents || 0);
        c.totalDebtCents += bal;
        const invDate = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt || 0);
        const age = Math.max(0, Math.floor((Date.now() - invDate.getTime()) / (1000 * 60 * 60 * 24)));
        if (age > c.maxAgeDays) c.maxAgeDays = age;
      }
      const clients = Array.from(clientMap.values()).sort((a, b) => b.totalDebtCents - a.totalDebtCents);
      const totalDebtCents = clients.reduce((sum, c) => sum + c.totalDebtCents, 0);
      const overdueDebtCents = pendingInvoices.reduce((sum, inv) => {
        const invDate = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt || 0);
        const age = Math.max(0, Math.floor((Date.now() - invDate.getTime()) / (1000 * 60 * 60 * 24)));
        return age >= 15 ? sum + (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)) : sum;
      }, 0);

      const reportData = {
        date: new Date(),
        totalDebtCents,
        clientsCount: clients.length,
        invoicesCount: pendingInvoices.length,
        overdueDebtCents,
        clients
      };

      const b = buildReceivablesReportEscPos(reportData, state.settings);
      const plainText = buildReceivablesReportPlainText(reportData, state.settings);
      const res = await sendEscPosToPrinter(b, { plainText, openDrawer: false });
      if (res?.success) toast('Reporte de cuentas por cobrar impreso con éxito.', 'success');
      else toast('No se pudo enviar a la impresora.', 'warning');
    });

    // Abrir Modal de Cobro Masivo / Abonar a Deuda Global del Cliente
    root.querySelectorAll('[data-client-bulk-pay]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const clientName = btn.dataset.clientBulkPay;
        const clientIdentity = { id: btn.dataset.clientId || '', name: clientName };
        const pendingInvoices = (state.invoices || []).filter(
          (inv) => inv.documentType === 'invoice' &&
            inv.status !== 'paid' &&
            inv.status !== 'cancelled' &&
            invoiceBelongsToClient(inv, clientIdentity) &&
            (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)) > 0
        ).map(inv => ({
          ...inv,
          balanceCents: Number(inv.totalCents || 0) - Number(inv.paidCents || 0),
          ageDays: Math.max(0, Math.floor((Date.now() - (inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt || 0)).getTime()) / (1000 * 60 * 60 * 24)))
        })).sort((a, b) => {
          const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
          const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
          return da - db;
        });

        const totalDebtCents = pendingInvoices.reduce((sum, i) => sum + i.balanceCents, 0);
        const regClient = (state.clients || []).find(c => clientIdentity.id && c.id === clientIdentity.id);

        state.selectedClientBulkPay = {
          id: clientIdentity.id,
          name: clientName,
          phone: pendingInvoices[0]?.clientPhone || pendingInvoices[0]?.deliveryPhone || regClient?.phone || '',
          address: pendingInvoices[0]?.deliveryAddress || pendingInvoices[0]?.clientAddress || regClient?.address || '',
          invoices: pendingInvoices,
          totalDebtCents
        };
        state.modal = 'clientBulkPay';
        renderModal();
      });
    });

    // Abrir Estado de Cuenta del Cliente
    root.querySelectorAll('[data-client-statement]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const clientName = btn.dataset.clientStatement;
        const clientIdentity = { id: btn.dataset.clientId || '', name: clientName };
        const pendingInvoices = (state.invoices || []).filter(
          (inv) => inv.documentType === 'invoice' &&
            inv.status !== 'paid' &&
            inv.status !== 'cancelled' &&
            invoiceBelongsToClient(inv, clientIdentity) &&
            (Number(inv.totalCents || 0) - Number(inv.paidCents || 0)) > 0
        ).map(inv => ({
          ...inv,
          balanceCents: Number(inv.totalCents || 0) - Number(inv.paidCents || 0),
          ageDays: Math.max(0, Math.floor((Date.now() - (inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(inv.createdAt || 0)).getTime()) / (1000 * 60 * 60 * 24)))
        })).sort((a, b) => {
          const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
          const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
          return da - db;
        });

        const totalDebtCents = pendingInvoices.reduce((sum, i) => sum + i.balanceCents, 0);
        const regClient = (state.clients || []).find(c => clientIdentity.id && c.id === clientIdentity.id);

        state.selectedClientStatement = {
          id: clientIdentity.id,
          name: clientName,
          phone: pendingInvoices[0]?.clientPhone || pendingInvoices[0]?.deliveryPhone || regClient?.phone || '',
          address: pendingInvoices[0]?.deliveryAddress || pendingInvoices[0]?.clientAddress || regClient?.address || '',
          creditLimitCents: Math.max(0, Number(regClient?.creditLimitCents || 0)),
          invoices: pendingInvoices,
          totalDebtCents
        };
        state.modal = 'clientStatement';
        renderModal();
      });
    });

    // Ver Factura Completa desde el listado de fiao
    root.querySelectorAll('[data-fiao-invoice-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const invId = btn.dataset.fiaoInvoiceView;
        if (invId) openInvoice(invId);
      });
    });

    // Cobrar factura individual de fiao
    root.querySelectorAll('[data-fiao-pay]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const invId = btn.dataset.fiaoPay;
        state.selectedFiaoInvoice = state.invoices.find(i => i.id === invId);
        state.modal = 'fiaoPay';
        renderModal();
      });
    });

    // Reimprimir comprobante de cobro desde historial
    root.querySelectorAll('[data-print-fiao-invoice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const invId = btn.dataset.printFiaoInvoice;
        if (invId) void printInvoice(invId);
      });
    });

    // Deliveries y Mensajeros
    root.querySelectorAll('[data-deliveries-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.deliveriesTab = btn.dataset.deliveriesTab || 'active';
        renderContent();
      });
    });
    root.querySelectorAll('[data-deliveries-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.deliveriesViewMode = btn.dataset.deliveriesView || 'drivers';
        renderContent();
      });
    });
    root.querySelectorAll('[data-deliveries-driver-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.deliveriesDriverFilter = btn.dataset.deliveriesDriverFilter || 'all';
        renderContent();
      });
    });
    root.querySelector('#delivery-sort-select')?.addEventListener('change', (e) => {
      state.deliveriesSort = e.target.value;
      renderContent();
    });
    root.querySelector('[data-deliveries-clear-filters]')?.addEventListener('click', () => {
      state.deliveriesDriverFilter = 'all';
      state.deliveriesSearch = '';
      renderContent();
    });
    root.querySelector('#delivery-search')?.addEventListener('input', (e) => {
      state.deliveriesSearch = e.target.value;
      const q = (e.target.value || '').trim();
      root.querySelectorAll('[data-delivery-card]').forEach((card) => {
        const search = card.dataset.search || '';
        card.hidden = q ? !matchesFuzzy(q, search) : false;
      });
      root.querySelectorAll('[data-delivery-order-item]').forEach((item) => {
        const search = item.dataset.search || '';
        item.hidden = q ? !matchesFuzzy(q, search) : false;
      });
    });
    root.querySelectorAll('[data-delivery-invoice-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const invId = btn.dataset.deliveryInvoiceView;
        if (invId) openInvoice(invId);
      });
    });
    root.querySelectorAll('[data-toggle-driver-card]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const driverId = btn.dataset.toggleDriverCard;
        const count = btn.dataset.count || '0';
        const card = btn.closest('.driver-delivery-card');
        const container = card?.querySelector('.driver-invoices-container');
        if (container) {
          const isHidden = container.style.display === 'none';
          container.style.display = isHidden ? 'flex' : 'none';
          if (!state.deliveriesExpandedDrivers) state.deliveriesExpandedDrivers = {};
          state.deliveriesExpandedDrivers[driverId] = isHidden;
          btn.innerHTML = isHidden
            ? '<i data-lucide="chevron-up"></i> Ocultar pedidos'
            : `<i data-lucide="chevron-down"></i> Ver ${count} pedidos`;
          refreshScopedIcons(btn);
        }
      });
    });
    root.querySelector('[data-deliveries-toggle-all]')?.addEventListener('click', () => {
      state.deliveriesAllExpanded = state.deliveriesAllExpanded !== true;
      if (!state.deliveriesExpandedDrivers) state.deliveriesExpandedDrivers = {};
      state.deliveryDrivers?.forEach(d => {
        state.deliveriesExpandedDrivers[d.id] = state.deliveriesAllExpanded;
        state.deliveriesExpandedDrivers[d.name] = state.deliveriesAllExpanded;
      });
      state.deliveriesExpandedDrivers['__unassigned__'] = state.deliveriesAllExpanded;
      renderContent();
    });

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
    root.querySelectorAll('[data-delivery-reassign]').forEach((btn) => {
      btn.addEventListener('click', () => openReassignDeliveryModal(btn.dataset.deliveryReassign));
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
    root.querySelectorAll('[data-audit-category]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.auditCategoryFilter = btn.dataset.auditCategory;
        renderContent();
      });
    });
    root.querySelectorAll('[data-audit-time]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.auditTimeFilter = btn.dataset.auditTime;
        renderContent();
      });
    });
    root.querySelector('[data-audit-export]')?.addEventListener('click', () => {
      const rawLogs = state.auditLogs || [];
      const enriched = rawLogs.map((l) => enrichAuditLog(l, state));
      const timeFiltered = filterAuditByTime(enriched, state.auditTimeFilter || 'all');
      const categoryFiltered = (state.auditCategoryFilter && state.auditCategoryFilter !== 'all')
        ? timeFiltered.filter((l) => l.category === state.auditCategoryFilter)
        : timeFiltered;
      const term = (state.auditSearchTerm || '').trim().toLowerCase();
      const finalLogs = term
        ? categoryFiltered.filter((l) => matchesFuzzy(term, l.searchBlob))
        : categoryFiltered;

      const csvContent = buildAuditLogsCsv(finalLogs);
      const filename = `auditoria-panitas-${businessDateKey(new Date())}.csv`;
      downloadText(filename, csvContent);
      toast(`Bitácora exportada (${finalLogs.length} registros)`, 'success');
    });
    root.querySelectorAll('[data-product-new]').forEach((button)=>button.addEventListener('click',()=>openForm('product')));
    root.querySelectorAll('[data-product-edit]').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        openForm('product', button.dataset.productEdit);
      });
    });
    root.querySelectorAll('[data-products-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state.productsTab = button.dataset.productsTab;
        renderContent();
      });
    });
    root.querySelectorAll('[data-products-category-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.productsCategoryFilter = button.dataset.productsCategoryFilter;
        renderContent();
      });
    });
    root.querySelectorAll('[data-products-type-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.productsTypeFilter = button.dataset.productsTypeFilter;
        renderContent();
      });
    });
    root.querySelectorAll('[data-products-view]').forEach((button) => {
      button.addEventListener('click', () => {
        state.productsViewMode = button.dataset.productsView;
        renderContent();
      });
    });
    root.querySelector('[data-products-clear-filters]')?.addEventListener('click', () => {
      state.productsCategoryFilter = 'all';
      state.productsTypeFilter = 'all';
      state.productsSearch = '';
      renderContent();
    });
    root.querySelector('#products-sort-select')?.addEventListener('change', (e) => {
      state.productsSort = e.target.value;
      renderContent();
    });
    root.querySelector('#directory-search')?.addEventListener('input', (e) => {
      if (state.route === 'products') state.productsSearch = e.target.value;
      if (state.route === 'clients') state.clientsSearch = e.target.value;
      const q = (e.target.value || '').trim();
      root.querySelectorAll('[data-directory-row]').forEach((row) => {
        const search = row.dataset.search || '';
        row.hidden = q ? !matchesFuzzy(q, search) : false;
      });
    });
    root.querySelectorAll('[data-stock-adjust]').forEach((badge) => {
      const openStockAdjust = (e) => {
        e.stopPropagation();
        e.preventDefault();
        const pid = badge.dataset.stockAdjust;
        const p = (state.products || []).find((x) => x.id === pid);
        if (p) {
          state.editingStockProduct = p;
          state.modal = 'stockAdjust';
          renderModal();
        }
      };
      badge.addEventListener('click', openStockAdjust);
      badge.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') openStockAdjust(e);
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

    // Directorio de Clientes: Filtros rápidos, vistas, orden y acciones táctiles
    root.querySelectorAll('[data-clients-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.clientsFilter = btn.dataset.clientsFilter || 'all';
        renderContent();
      });
    });
    root.querySelectorAll('[data-clients-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.clientsViewMode = btn.dataset.clientsView || 'table';
        renderContent();
      });
    });
    root.querySelector('#clients-sort-select')?.addEventListener('change', (e) => {
      state.clientsSort = e.target.value;
      renderContent();
    });
    root.querySelectorAll('[data-client-to-pos]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const clientName = btn.dataset.clientToPos || '';
        if (clientName) {
          if (!state.posDraft) state.posDraft = {};
          state.posDraft.clientName = clientName;
          const posInput = root.querySelector('#pos-client-name');
          if (posInput) posInput.value = clientName;
        }
        state.route = 'pos';
        renderContent();
        toast(`Cliente "${clientName}" seleccionado en Terminal POS.`, 'info');
      });
    });
    root.querySelectorAll('[data-client-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.clientEdit || '';
        const name = button.dataset.clientName || '';
        const phone = button.dataset.clientPhone || '';
        const address = button.dataset.clientAddress || '';
        const rnc = button.dataset.clientRnc || '';
        const notes = button.dataset.clientNotes || '';
        const creditLimitCents = Number(button.dataset.clientCreditLimit || 0);

        const existing = id 
          ? (state.clients || []).find(c => c.id === id)
          : (state.clients || []).find(c => c.name && c.name.trim().toLowerCase() === name.trim().toLowerCase());

        if (existing) {
          state.editingId = existing.id;
          state.editingClientDraft = null;
        } else {
          state.editingId = '';
          state.editingClientDraft = {
            name,
            phone,
            address,
            rnc,
            notes,
            creditLimitCents
          };
        }
        state.modal = 'client';
        renderModal();
      });
    });
    // Nómina y Personal - Seguridad y Desbloqueo Confidencial
    disposePayrollPin();
    disposePayrollPin = () => {};

    const payrollUnlockForm = root.querySelector('#payroll-unlock-form');
    if (payrollUnlockForm) {
      const pinInput = payrollUnlockForm.querySelector('#payroll-unlock-input');
      const errBox = payrollUnlockForm.querySelector('#payroll-unlock-error');
      const submitBtn = payrollUnlockForm.querySelector('#payroll-unlock-submit');

      disposePayrollPin = bindPinPad({
        form: payrollUnlockForm,
        input: pinInput,
        slots: [...payrollUnlockForm.querySelectorAll('#payroll-unlock-slots .pin-slot')],
        digits: [...payrollUnlockForm.querySelectorAll('.pin-num-btn')],
        clear: payrollUnlockForm.querySelector('#payroll-unlock-clear'),
        backspace: payrollUnlockForm.querySelector('#payroll-unlock-del'),
        submit: submitBtn,
        error: errBox,
        isBusy: () => false
      });

      payrollUnlockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pin = String(pinInput?.value || '').trim();
        if (!/^\d{6}$/.test(pin)) {
          if (errBox) errBox.textContent = 'Ingresa tu PIN de 6 dígitos.';
          return;
        }
        setBusy(submitBtn, true);
        try {
          await service.verifyDrawerPin(pin, 'Acceso confidencial a nómina');
          state.payrollUnlocked = true;
          renderContent();
          toast('Acceso a nómina autorizado.', 'success');
        } catch (err) {
          beepHardware('error').catch(() => {});
          if (errBox) errBox.textContent = err?.message || 'PIN incorrecto.';
          if (pinInput) pinInput.value = '';
          payrollUnlockForm.querySelectorAll('.pin-slot').forEach((s) => s.classList.remove('filled'));
        } finally {
          setBusy(submitBtn, false);
        }
      });
    }

    root.querySelectorAll('[data-payroll-lock]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.payrollUnlocked = false;
        renderContent();
        toast('Sección de nómina protegida y bloqueada.', 'info');
      });
    });

    // Usuarios y Permisos - Seguridad y Desbloqueo Confidencial
    disposeUsersPin();
    disposeUsersPin = () => {};

    const usersUnlockForm = root.querySelector('#users-unlock-form');
    if (usersUnlockForm) {
      const pinInput = usersUnlockForm.querySelector('#users-unlock-input');
      const errBox = usersUnlockForm.querySelector('#users-unlock-error');
      const submitBtn = usersUnlockForm.querySelector('#users-unlock-submit');

      disposeUsersPin = bindPinPad({
        form: usersUnlockForm,
        input: pinInput,
        slots: [...usersUnlockForm.querySelectorAll('#users-unlock-slots .pin-slot')],
        digits: [...usersUnlockForm.querySelectorAll('.pin-num-btn')],
        clear: usersUnlockForm.querySelector('#users-unlock-clear'),
        backspace: usersUnlockForm.querySelector('#users-unlock-del'),
        submit: submitBtn,
        error: errBox,
        isBusy: () => false
      });

      usersUnlockForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pin = String(pinInput?.value || '').trim();
        if (!/^\d{6}$/.test(pin)) {
          if (errBox) errBox.textContent = 'Ingresa tu PIN de 6 dígitos.';
          return;
        }
        setBusy(submitBtn, true);
        try {
          await service.verifyDrawerPin(pin, 'Acceso confidencial a gestión de usuarios');
          state.usersUnlocked = true;
          renderContent();
          toast('Acceso a administración de usuarios autorizado.', 'success');
        } catch (err) {
          beepHardware('error').catch(() => {});
          if (errBox) errBox.textContent = err?.message || 'PIN incorrecto.';
          if (pinInput) pinInput.value = '';
          usersUnlockForm.querySelectorAll('.pin-slot').forEach((s) => s.classList.remove('filled'));
        } finally {
          setBusy(submitBtn, false);
        }
      });
    }

    root.querySelectorAll('[data-users-lock]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.usersUnlocked = false;
        renderContent();
        toast('Sección de usuarios protegida y bloqueada.', 'info');
      });
    });

    root.querySelectorAll('[data-payroll-mask-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.payrollMasked = !state.payrollMasked;
        renderContent();
      });
    });

    root.querySelectorAll('[data-payroll-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        state.payrollTab = button.dataset.payrollTab;
        renderContent();
      });
    });
    root.querySelector('#payroll-payments-search')?.addEventListener('input', (e) => {
      const q = (e.target.value || '').trim();
      root.querySelectorAll('#main-content [data-payroll-row]').forEach((row) => {
        const text = row.dataset.search || '';
        row.style.display = !q || matchesFuzzy(q, text) ? '' : 'none';
      });
    });
    root.querySelector('#payroll-employees-search')?.addEventListener('input', (e) => {
      const q = (e.target.value || '').trim();
      root.querySelectorAll('#main-content [data-employee-row]').forEach((row) => {
        const text = row.dataset.search || '';
        row.style.display = !q || matchesFuzzy(q, text) ? '' : 'none';
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
    root.querySelectorAll('[data-drawer-kick]').forEach((btn)=>btn.addEventListener('click', () => promptDrawerPin(btn.dataset.drawerKick || 'open_only')));
    root.querySelectorAll('[data-quick-open-cash]').forEach((btn)=>btn.addEventListener('click', () => { state.modal = 'quickCash'; renderModal(); }));
    root.querySelectorAll('[data-cash-movement-open]').forEach((btn)=>btn.addEventListener('click', () => {
      state.cashMovementModalType = btn.dataset.cashMovementOpen === 'in' ? 'in' : 'out';
      state.modal = 'cashMovement';
      renderModal();
    }));
    root.querySelectorAll('[data-cash-close-open]').forEach((btn)=>btn.addEventListener('click', () => { state.modal = 'cashClose'; renderModal(); }));
    root.querySelectorAll('[data-cash-tab]').forEach((btn) => btn.addEventListener('click', () => {
      state.cashTab = btn.dataset.cashTab;
      renderContent();
    }));
    root.querySelectorAll('[data-cash-movement-type-filter]').forEach((btn) => btn.addEventListener('click', () => {
      state.cashMovementTypeFilter = btn.dataset.cashMovementTypeFilter;
      renderContent();
    }));
    const cashSearchInput = root.querySelector('[data-cash-movement-search]');
    if (cashSearchInput) {
      cashSearchInput.addEventListener('input', (e) => {
        state.cashMovementSearch = e.target.value;
        const term = (e.target.value || '').toLowerCase().trim();
        root.querySelectorAll('#main-content tbody tr').forEach((row) => {
          const text = (row.textContent || '').toLowerCase();
          row.hidden = term ? !text.includes(term) : false;
        });
      });
    }
    root.querySelectorAll('[data-cash-movement-print]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const movId = btn.dataset.cashMovementPrint;
        const mov = (state.cashMovements || []).find((m) => m.id === movId);
        if (!mov) return toast('Movimiento no encontrado.', 'warning');
        const session = (state.cashSessions || []).find((s) => s.id === mov.cashSessionId) || state.activeCash || {};
        try {
          const escpos = buildCashMovementEscPos(mov, session, state.settings || {});
          const plain = buildCashMovementPlainText(mov, session, state.settings || {});
          await sendEscPosToPrinter(escpos, { plainText: plain, openDrawer: false });
          toast('Comprobante de movimiento enviado a la impresora.', 'success');
          beepHardware('ok').catch(() => {});
        } catch (err) {
          toast('Error al imprimir comprobante: ' + err.message, 'danger');
        }
      });
    });
    root.querySelectorAll('[data-test-drawer]').forEach((btn)=>btn.addEventListener('click', () => promptDrawerPin('open_only')));
    root.querySelectorAll('[data-test-print]').forEach((btn)=>btn.addEventListener('click', testPrint));
    root.querySelectorAll('[data-test-sleep]').forEach((btn)=>btn.addEventListener('click', () => sleepManager.sleep()));
    bindUpdateActions(root);
    root.querySelectorAll('[data-cash-corte-x]').forEach((btn)=>btn.addEventListener('click',()=>printCashSession(btn.dataset.cashCorteX, 'X')));
    root.querySelectorAll('[data-cash-report-print]').forEach((btn)=>btn.addEventListener('click',()=>printCashSession(btn.dataset.cashReportPrint, 'Z')));
    root.querySelectorAll('[data-export]').forEach((button)=>button.addEventListener('click',()=>exportReport(button.dataset.export,state)));
    updatePosFields();
    if (searchInput) filterCards({ target: searchInput });
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
    target.querySelectorAll('[data-remote-action]').forEach(btn => btn.addEventListener('click', async () => {
      if (remoteRequestBusy || !can(user, '*')) return;
      const action = btn.dataset.remoteAction;
      if (action === 'update' && !window.confirm('¿Solicitar la actualización? Si la terminal está desconectada, esperará hasta 24 horas. No se interrumpirán operaciones en curso.')) return;
      remoteRequestBusy = true; btn.disabled = true;
      try {
        await remoteControl.request(btn.dataset.remoteId, action);
        if (!destroyed) toast(action === 'report' ? 'Último estado consultado. Revisa la hora de la señal.' : 'Solicitud guardada. Esperando confirmación de la terminal.', 'success');
      } catch (error) { if (!destroyed) toast(error.message || 'No se pudo enviar la solicitud.', 'error'); }
      finally { remoteRequestBusy = false; btn.disabled = false; }
    }));
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
    // Formulario de Producto e Inventario
    const productForm = modalRoot?.querySelector('#product-form');
    if (productForm) {
      productForm.addEventListener('submit', saveProduct);

      // Selección táctil de Dinámica de Inventario (Cocina, Vitrina, Nevera)
      const typeCards = productForm.querySelectorAll('[data-inventory-type-card]');
      const stockRow = productForm.querySelector('#product-stock-fields-row');
      const preparedMsg = productForm.querySelector('#product-prepared-message-box');
      const isPreparedHidden = productForm.querySelector('#product-is-prepared-hidden');

      typeCards.forEach((card) => {
        card.addEventListener('click', () => {
          const type = card.dataset.inventoryTypeCard;
          typeCards.forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
          const radio = card.querySelector('input[type="radio"]');
          if (radio) radio.checked = true;

          const isPrep = type === 'prepared';
          if (isPreparedHidden) isPreparedHidden.value = isPrep ? 'on' : 'off';
          if (stockRow) stockRow.style.display = isPrep ? 'none' : 'grid';
          if (preparedMsg) preparedMsg.style.display = isPrep ? 'block' : 'none';
        });
      });

      // Sugerencias de categorías rápidas
      productForm.querySelectorAll('[data-category-suggestion]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const catInput = productForm.querySelector('#product-form-category');
          if (catInput) {
            catInput.value = btn.dataset.categorySuggestion;
          }
        });
      });

      // Cálculo de margen, ganancia y fijación de precios en tiempo real
      const calculatePricesFromCost = () => {
        const costStr = productForm.querySelector('#product-form-cost')?.value || '0';
        const cost = parseFloat(costStr) || 0;

        // Actualizar valores sugeridos en los botones de margen
        const presets = [
          { id: 'preset-price-30', margin: 0.30 },
          { id: 'preset-price-40', margin: 0.40 },
          { id: 'preset-price-50', margin: 0.50 },
          { id: 'preset-price-60', margin: 0.60 },
          { id: 'preset-price-markup100', markup: 1.00 }
        ];

        presets.forEach(p => {
          const el = productForm.querySelector(`#${p.id}`);
          if (!el) return;
          if (cost <= 0) {
            el.textContent = 'RD$ —';
            return;
          }
          let price = 0;
          if (p.margin) {
            price = Math.round(cost / (1 - p.margin));
          } else if (p.markup) {
            price = Math.round(cost * (1 + p.markup));
          }
          el.textContent = `RD$ ${price}`;
        });
      };

      const updateMarginPreview = () => {
        const priceStr = productForm.querySelector('#product-form-price')?.value || '0';
        const costStr = productForm.querySelector('#product-form-cost')?.value || '0';
        const price = parseFloat(priceStr) || 0;
        const cost = parseFloat(costStr) || 0;
        const pctEl = productForm.querySelector('#margin-percent-display');
        const profitEl = productForm.querySelector('#margin-profit-display');
        const badgeEl = productForm.querySelector('#margin-health-badge');
        const multiplierEl = productForm.querySelector('#margin-multiplier-display');
        const lossAlert = productForm.querySelector('#margin-loss-alert');
        const iconBox = productForm.querySelector('#margin-icon-box');

        calculatePricesFromCost();

        if (price > 0) {
          const profit = price - cost;
          const margin = Math.round(((price - cost) / price) * 100);
          const mult = cost > 0 ? (price / cost).toFixed(1) + 'x' : '—';

          if (pctEl) {
            pctEl.textContent = `${margin}%`;
            pctEl.style.color = margin < 0 ? '#f43f5e' : (margin < 30 ? '#f59e0b' : (margin < 50 ? '#38bdf8' : '#10b981'));
          }
          if (profitEl) {
            profitEl.textContent = formatMoney(Math.round(profit * 100));
            profitEl.style.color = profit < 0 ? '#f43f5e' : (profit === 0 ? '#f59e0b' : 'var(--brand-2)');
          }
          if (multiplierEl) {
            multiplierEl.textContent = cost > 0 ? `Multiplicador: ${mult} sobre el costo` : 'Costo no registrado';
          }

          if (badgeEl) {
            if (profit < 0) {
              badgeEl.textContent = 'Venta a Pérdida';
              badgeEl.style.background = 'rgba(244,63,94,.18)';
              badgeEl.style.color = '#f43f5e';
            } else if (profit === 0) {
              badgeEl.textContent = 'Sin Ganancia (Costo)';
              badgeEl.style.background = 'rgba(245,158,11,.18)';
              badgeEl.style.color = '#f59e0b';
            } else if (margin < 30) {
              badgeEl.textContent = 'Margen Ajustado';
              badgeEl.style.background = 'rgba(245,158,11,.15)';
              badgeEl.style.color = '#f59e0b';
            } else if (margin < 50) {
              badgeEl.textContent = 'Margen Aceptable';
              badgeEl.style.background = 'rgba(56,189,248,.15)';
              badgeEl.style.color = '#38bdf8';
            } else {
              badgeEl.textContent = 'Margen Excelente';
              badgeEl.style.background = 'rgba(16,185,129,.15)';
              badgeEl.style.color = '#10b981';
            }
          }

          if (lossAlert) {
            lossAlert.style.display = profit <= 0 && cost > 0 ? 'flex' : 'none';
          }
          if (iconBox) {
            iconBox.style.color = profit < 0 ? '#f43f5e' : (margin >= 50 ? '#10b981' : '#38bdf8');
            iconBox.style.background = profit < 0 ? 'rgba(244,63,94,.12)' : (margin >= 50 ? 'rgba(16,185,129,.12)' : 'rgba(56,189,248,.12)');
            iconBox.style.borderColor = profit < 0 ? 'rgba(244,63,94,.25)' : (margin >= 50 ? 'rgba(16,185,129,.25)' : 'rgba(56,189,248,.25)');
          }
        } else {
          if (pctEl) { pctEl.textContent = '—'; pctEl.style.color = '#38bdf8'; }
          if (profitEl) { profitEl.textContent = 'RD$ 0.00'; profitEl.style.color = 'var(--brand-2)'; }
          if (badgeEl) { badgeEl.textContent = 'Precio no asignado'; badgeEl.style.background = 'rgba(255,255,255,.06)'; badgeEl.style.color = 'var(--muted)'; }
          if (multiplierEl) multiplierEl.textContent = 'Multiplicador: —';
          if (lossAlert) lossAlert.style.display = 'none';
        }
      };

      // Click en los botones de Margen Sugerido (Fijar precio automático)
      productForm.querySelectorAll('[data-margin-target]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const costStr = productForm.querySelector('#product-form-cost')?.value || '0';
          const cost = parseFloat(costStr) || 0;
          if (cost <= 0) {
            toast('Ingresa primero el costo unitario del producto para calcular el precio sugerido.', 'warning');
            return;
          }
          const target = btn.dataset.marginTarget;
          let calculatedPrice = 0;
          if (target === 'markup_100') {
            calculatedPrice = Math.round(cost * 2);
          } else {
            const m = parseFloat(target) / 100;
            calculatedPrice = Math.round(cost / (1 - m));
          }
          const priceInput = productForm.querySelector('#product-form-price');
          if (priceInput) {
            priceInput.value = calculatedPrice.toFixed(2);
            updateMarginPreview();
            toast(`Precio fijado en RD$ ${calculatedPrice} (${btn.textContent.trim().split(' ')[0]} margen).`, 'success');
          }
        });
      });

      productForm.querySelector('#product-form-price')?.addEventListener('input', updateMarginPreview);
      productForm.querySelector('#product-form-cost')?.addEventListener('input', updateMarginPreview);

      // Variantes y Acompañamientos en el formulario de producto
      const hasVariantsCheckbox = productForm.querySelector('#product-has-variants-checkbox');
      const variantsContainer = productForm.querySelector('#product-variants-container');
      hasVariantsCheckbox?.addEventListener('change', () => {
        if (variantsContainer) {
          variantsContainer.style.display = hasVariantsCheckbox.checked ? 'block' : 'none';
        }
      });

      const bindRemoveVariantButtons = (container) => {
        container?.querySelectorAll('[data-remove-variant-row]').forEach((btn) => {
          btn.onclick = () => btn.closest('.product-variant-row')?.remove();
        });
      };
      const rowsContainer = productForm.querySelector('#product-variants-rows');
      bindRemoveVariantButtons(rowsContainer);

      productForm.querySelectorAll('[data-variant-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const templateKey = btn.dataset.variantPreset;
          const template = VARIANT_TEMPLATES[templateKey];
          if (!template || !rowsContainer) return;
          const baseCost = productForm.querySelector('#product-form-cost')?.value || '0.00';
          const basePrice = productForm.querySelector('#product-form-price')?.value || '0.00';

          rowsContainer.innerHTML = template.variants.map((v, i) => `
            <div class="product-variant-row" data-variant-row="${i}" style="display:grid;grid-template-columns:1fr 110px 110px 36px;gap:8px;align-items:center;background:rgba(255,255,255,.03);padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.06);">
              <label style="margin:0;">
                <span style="font-size:0.7rem;color:var(--muted);display:block;margin-bottom:2px;">Tamaño / Porción</span>
                <input type="text" name="variantName[]" value="${escapeHtml(v.name)}" placeholder="Ej. 12 oz..." required style="padding:6px 8px;font-size:0.85rem;">
                <input type="hidden" name="variantId[]" value="${escapeHtml(v.id)}">
              </label>
              <label style="margin:0;">
                <span style="font-size:0.7rem;color:var(--muted);display:block;margin-bottom:2px;">Precio (RD$)</span>
                <input type="text" name="variantPrice[]" data-touch-numpad="money" data-numpad-title="Precio Variante" value="${basePrice}" placeholder="0.00" required readonly inputmode="none" style="padding:6px 8px;font-size:0.85rem;cursor:pointer;font-weight:700;color:var(--brand-2);">
              </label>
              <label style="margin:0;">
                <span style="font-size:0.7rem;color:var(--muted);display:block;margin-bottom:2px;">Costo (RD$)</span>
                <input type="text" name="variantCost[]" data-touch-numpad="money" data-numpad-title="Costo Variante" value="${baseCost}" placeholder="0.00" readonly inputmode="none" style="padding:6px 8px;font-size:0.85rem;cursor:pointer;">
              </label>
              <button type="button" class="icon-button danger" data-remove-variant-row title="Eliminar tamaño" style="margin-top:14px;width:32px;height:32px;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
            </div>
          `).join('');

          iconsRefresh(rowsContainer);
          setupTouchNumericInputs(rowsContainer);
          bindRemoveVariantButtons(rowsContainer);
          toast(`Plantilla "${template.label}" cargada.`, 'info');
        });
      });

      productForm.querySelector('#btn-add-variant-row')?.addEventListener('click', () => {
        if (!rowsContainer) return;
        const count = rowsContainer.querySelectorAll('.product-variant-row').length;
        const baseCost = productForm.querySelector('#product-form-cost')?.value || '0.00';
        const basePrice = productForm.querySelector('#product-form-price')?.value || '0.00';
        const rowEl = document.createElement('div');
        rowEl.className = 'product-variant-row';
        rowEl.dataset.variantRow = String(count);
        rowEl.style.cssText = 'display:grid;grid-template-columns:1fr 110px 110px 36px;gap:8px;align-items:center;background:rgba(255,255,255,.03);padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.06);';
        rowEl.innerHTML = `
          <label style="margin:0;">
            <span style="font-size:0.7rem;color:var(--muted);display:block;margin-bottom:2px;">Tamaño / Porción</span>
            <input type="text" name="variantName[]" value="" placeholder="Ej. Mediano..." required style="padding:6px 8px;font-size:0.85rem;">
            <input type="hidden" name="variantId[]" value="var-${Date.now()}-${count + 1}">
          </label>
          <label style="margin:0;">
            <span style="font-size:0.7rem;color:var(--muted);display:block;margin-bottom:2px;">Precio (RD$)</span>
            <input type="text" name="variantPrice[]" data-touch-numpad="money" data-numpad-title="Precio Variante" value="${basePrice}" placeholder="0.00" required readonly inputmode="none" style="padding:6px 8px;font-size:0.85rem;cursor:pointer;font-weight:700;color:var(--brand-2);">
          </label>
          <label style="margin:0;">
            <span style="font-size:0.7rem;color:var(--muted);display:block;margin-bottom:2px;">Costo (RD$)</span>
            <input type="text" name="variantCost[]" data-touch-numpad="money" data-numpad-title="Costo Variante" value="${baseCost}" placeholder="0.00" readonly inputmode="none" style="padding:6px 8px;font-size:0.85rem;cursor:pointer;">
          </label>
          <button type="button" class="icon-button danger" data-remove-variant-row title="Eliminar tamaño" style="margin-top:14px;width:32px;height:32px;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
        `;
        rowsContainer.appendChild(rowEl);
        iconsRefresh(rowEl);
        setupTouchNumericInputs(rowEl);
        bindRemoveVariantButtons(rowsContainer);
        const nameInput = rowEl.querySelector('input[name="variantName[]"]');
        if (nameInput) nameInput.focus();
      });

      const hasSidesCheckbox = productForm.querySelector('#product-has-sides-checkbox');
      const sidesContainer = productForm.querySelector('#product-sides-container');
      hasSidesCheckbox?.addEventListener('change', () => {
        if (sidesContainer) {
          sidesContainer.style.display = hasSidesCheckbox.checked ? 'block' : 'none';
        }
      });

      // Calcular y poblar al renderizar el modal
      updateMarginPreview();
    }

    // Modal Táctil de Opciones de Producto (Variantes y Guarnición)
    const optionsForm = modalRoot?.querySelector('#product-options-form');
    if (optionsForm) {
      const basePriceInput = optionsForm.querySelector('#picker-base-price');
      const sidePriceInput = optionsForm.querySelector('#picker-side-price');
      const variantIdInput = optionsForm.querySelector('#picker-variant-id');
      const variantNameInput = optionsForm.querySelector('#picker-variant-name');
      const sideInput = optionsForm.querySelector('#picker-selected-side');
      const hasSideInput = optionsForm.querySelector('#picker-has-side');
      const totalDisplay = optionsForm.querySelector('#picker-total-display');
      const sidesContainer = optionsForm.querySelector('#picker-sides-container');

      const updatePickerTotal = () => {
        const base = Number(basePriceInput?.value || 0);
        const sideP = hasSideInput?.value === 'yes' ? Number(sidePriceInput?.value || 0) : 0;
        const total = base + sideP;
        if (totalDisplay) totalDisplay.textContent = formatMoney(total);
      };

      optionsForm.querySelectorAll('[data-picker-variant]').forEach((btn) => {
        btn.addEventListener('click', () => {
          optionsForm.querySelectorAll('[data-picker-variant]').forEach((b) => {
            b.classList.remove('active');
            b.style.borderColor = 'var(--line)';
            b.style.background = 'rgba(255,255,255,.04)';
            b.style.color = '#e6edf3';
          });
          btn.classList.add('active');
          btn.style.borderColor = 'var(--brand-2)';
          btn.style.background = 'rgba(215,154,60,.18)';
          btn.style.color = 'var(--brand-2)';

          if (variantIdInput) variantIdInput.value = btn.dataset.pickerVariant;
          if (variantNameInput) variantNameInput.value = btn.dataset.variantName;
          if (basePriceInput) basePriceInput.value = btn.dataset.variantPrice;
          updatePickerTotal();
        });
      });

      optionsForm.querySelectorAll('[data-picker-side-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.pickerSideMode;
          optionsForm.querySelectorAll('[data-picker-side-mode]').forEach((b) => {
            b.classList.remove('active');
            b.style.borderColor = 'var(--line)';
            b.style.background = 'rgba(255,255,255,.03)';
            b.style.color = '#94a3b8';
          });
          btn.classList.add('active');
          btn.style.borderColor = 'var(--brand-2)';
          btn.style.background = 'rgba(215,154,60,.18)';
          btn.style.color = 'var(--brand-2)';

          if (mode === 'side') {
            if (hasSideInput) hasSideInput.value = 'yes';
            if (sidesContainer) sidesContainer.style.display = 'grid';
            const activeSide = optionsForm.querySelector('.picker-side-chip.active');
            if (!activeSide) {
              const first = optionsForm.querySelector('.picker-side-chip');
              if (first) {
                first.classList.add('active');
                first.style.borderColor = 'var(--brand-2)';
                first.style.background = 'rgba(215,154,60,.28)';
                first.style.color = '#fff';
                if (sideInput) sideInput.value = first.dataset.pickerSide;
              }
            }
          } else {
            if (hasSideInput) hasSideInput.value = 'no';
            if (sidesContainer) sidesContainer.style.display = 'none';
          }
          updatePickerTotal();
        });
      });

      optionsForm.querySelectorAll('[data-picker-side]').forEach((btn) => {
        btn.addEventListener('click', () => {
          optionsForm.querySelectorAll('[data-picker-side]').forEach((b) => {
            b.classList.remove('active');
            b.style.borderColor = 'rgba(255,255,255,.1)';
            b.style.background = 'rgba(255,255,255,.03)';
            b.style.color = '#cbd5e1';
          });
          btn.classList.add('active');
          btn.style.borderColor = 'var(--brand-2)';
          btn.style.background = 'rgba(215,154,60,.28)';
          btn.style.color = '#fff';
          if (sideInput) sideInput.value = btn.dataset.pickerSide;
        });
      });

      optionsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        capturePosDraft();
        const f = new FormData(optionsForm);
        const productId = f.get('productId');
        const cartIndexRaw = f.get('cartIndex');
        const isEditing = cartIndexRaw !== '' && cartIndexRaw != null;
        const cartIndex = isEditing ? parseInt(cartIndexRaw, 10) : null;

        const product = state.products.find((p) => p.id === productId);
        if (!product) return closeModal();

        const vId = String(f.get('selectedVariantId') || '').trim();
        const vName = String(f.get('selectedVariantName') || '').trim();
        const hasSide = f.get('hasSide') === 'yes';
        const selectedSide = hasSide ? String(f.get('selectedSide') || '').trim() : '';
        const notes = String(f.get('notes') || '').trim();
        const basePriceCents = Number(f.get('basePriceCents') || product.priceCents || 0);
        const sidePriceCents = hasSide ? Number(f.get('sidePriceCents') || product.sidePriceCents || 0) : 0;
        const unitPriceCents = basePriceCents + sidePriceCents;

        const formattedName = formatLineName(product.name, vName);

        if (isEditing && state.cart[cartIndex]) {
          const existing = state.cart[cartIndex];
          state.cart[cartIndex] = {
            ...existing,
            name: formattedName,
            variantId: vId || undefined,
            variantName: vName || undefined,
            side: selectedSide || undefined,
            sidePriceCents: sidePriceCents || undefined,
            unitPriceCents,
            originalPriceCents: unitPriceCents,
            isCustomPrice: false,
            notes
          };
          toast(`Artículo actualizado en la orden.`, 'success');
        } else {
          const existingLine = state.cart.find((l) =>
            l.productId === product.id &&
            l.variantId === (vId || undefined) &&
            l.side === (selectedSide || undefined) &&
            (l.notes || '') === notes &&
            !l.isCustomPrice
          );
          if (existingLine) {
            existingLine.quantity += 1;
            toast(`Se sumó +1 a ${formattedName}.`, 'success');
          } else {
            state.cart.push({
              productId: product.id,
              name: formattedName,
              variantId: vId || undefined,
              variantName: vName || undefined,
              side: selectedSide || undefined,
              sidePriceCents: sidePriceCents || undefined,
              quantity: 1,
              unitPriceCents,
              originalPriceCents: unitPriceCents,
              taxRate: product.taxRate || 0,
              notes
            });
            toast(`Agregado a la orden.`, 'success');
          }
        }

        closeModal();
        renderPosCartOnly();
        const totals = calculateDocument(state.cart);
        setVFDMessage(formattedName.slice(0, 20), `TOT: ${formatMoney(totals.totalCents)}`);
      });
    }
    bindStockAdjustModal(modalRoot);
    bindEndDayWasteModal(modalRoot);
    modalRoot?.querySelector('#employee-form')?.addEventListener('submit', saveEmployee);
    bindPayrollPaymentModal(modalRoot);
    modalRoot?.querySelector('#client-form')?.addEventListener('submit',saveClient);
    modalRoot?.querySelector('#driver-form')?.addEventListener('submit',saveDeliveryDriver);
    modalRoot?.querySelectorAll('[data-delivery-reassign]').forEach((btn) => {
      btn.addEventListener('click', () => openReassignDeliveryModal(btn.dataset.deliveryReassign));
    });
    modalRoot?.querySelector('#reassign-delivery-form')?.addEventListener('submit', saveReassignDelivery);
    const reassignSelect = modalRoot?.querySelector('#reassign-new-driver-select');
    const reassignHiddenName = modalRoot?.querySelector('#reassign-new-driver-name');
    reassignSelect?.addEventListener('change', () => {
      const opt = reassignSelect.options[reassignSelect.selectedIndex];
      if (reassignHiddenName) {
        reassignHiddenName.value = opt ? (opt.dataset.name || opt.textContent.split(' · ')[0] || '').trim() : '';
      }
    });
    modalRoot?.querySelectorAll('[data-driver-new]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingDriver = null;
        state.modal = 'driverForm';
        renderModal();
      });
    });
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
    modalRoot?.querySelector('#setup-pin-cancel-btn')?.addEventListener('click', () => {
      if (state.pendingPinDestination === 'checkoutPin') {
        state.modal = 'checkoutPin';
        state.pendingPinDestination = '';
        renderModal();
      } else {
        closeModal();
      }
    });
    modalRoot?.querySelector('#item-note-form')?.addEventListener('submit',saveItemNote);
    modalRoot?.querySelector('#clear-item-note-btn')?.addEventListener('click', () => {
      const input = modalRoot.querySelector('#item-note-input');
      if (input) { input.value = ''; input.focus(); }
    });
    modalRoot?.querySelectorAll('[data-quick-note]').forEach((btn)=>{
      btn.addEventListener('click',()=>{
        const input=modalRoot.querySelector('#item-note-input');
        if(input){
          const val = input.value.trim();
          const chip = btn.dataset.quickNote;
          if (!val) {
            input.value = chip;
          } else if (!val.toLowerCase().includes(chip.toLowerCase())) {
            input.value = `${val}, ${chip}`;
          }
          input.focus();
        }
      });
    });
    modalRoot?.querySelectorAll('[data-pick-table-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tableId = btn.dataset.pickTableId;
        const hasOrder = btn.dataset.hasOrder === '1';
        const action = state.tablePickerAction || 'select';
        state.tablePickerAction = 'select';
        closeModal();
        if (!tableId) {
          state.loadedOrderId = '';
          state.loadedTableId = '';
          if (state.posDraft) state.posDraft.tableId = '';
          const sel = root.querySelector('#pos-table-select');
          if (sel) sel.value = '';
          renderContent();
          return;
        }
        if (hasOrder && (!state.cart.length || state.loadedTableId !== tableId)) {
          loadTableOrderToCart(tableId);
          return;
        }
        if (action === 'send' && state.cart.length) {
          sendComandaToTable(tableId);
        } else {
          state.loadedTableId = tableId;
          if (state.posDraft) state.posDraft.tableId = tableId;
          const sel = root.querySelector('#pos-table-select');
          if (sel) sel.value = tableId;
          renderContent();
          setTimeout(() => {
            const clientInput = root.querySelector('#pos-client-name');
            if (clientInput && !clientInput.value) clientInput.focus();
          }, 60);
        }
      });
    });
    modalRoot?.querySelectorAll('[data-pos-cancel-table]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleCancelAndLiberateTable(btn.dataset.posCancelTable, btn);
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

    modalRoot?.querySelector('[data-jump-to-price]')?.addEventListener('click', () => {
      openItemPriceModal(state.editingCartIndex);
    });

    const priceForm = modalRoot?.querySelector('#item-price-form');
    if (priceForm) {
      const priceInput = priceForm.querySelector('#item-price-input');
      priceForm.addEventListener('keydown', (e) => {
        if (['0','1','2','3','4','5','6','7','8','9'].includes(e.key)) {
          e.preventDefault();
          if (priceInput) {
            let val = priceInput.value.replace(/,/g, '').trim();
            if (val === '0' || val === '0.00' || val === '') priceInput.value = e.key;
            else if (val.length < 7) priceInput.value = val + e.key;
          }
        } else if (e.key === 'Backspace') {
          e.preventDefault();
          if (priceInput) {
            let val = priceInput.value.replace(/,/g, '').trim();
            priceInput.value = val.length > 1 ? val.slice(0, -1) : '0';
          }
        }
      });
    }
    modalRoot?.querySelector('#item-price-form')?.addEventListener('submit', saveItemPrice);
    modalRoot?.querySelectorAll('.price-preset-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = modalRoot.querySelector('#item-price-input');
        if (input) {
          input.value = Number(btn.dataset.setPrice).toFixed(2);
          const note = modalRoot.querySelector('#item-price-note');
          if (note && !note.value) {
            note.value = `Porción de RD$ ${btn.dataset.setPrice}`;
          }
        }
      });
    });
    modalRoot?.querySelectorAll('.price-delta-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = modalRoot.querySelector('#item-price-input');
        if (input) {
          const current = parseFloat(input.value.replace(/,/g, '')) || 0;
          const next = Math.max(0, current + Number(btn.dataset.deltaPrice));
          input.value = next.toFixed(2);
        }
      });
    });
    modalRoot?.querySelector('.price-restore-btn')?.addEventListener('click', (e) => {
      const input = modalRoot.querySelector('#item-price-input');
      if (input) {
        input.value = e.currentTarget.dataset.restorePrice || '0.00';
        const note = modalRoot.querySelector('#item-price-note');
        if (note && note.value.startsWith('Porción')) {
          note.value = '';
        }
      }
    });
    modalRoot?.querySelectorAll('.price-num-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = modalRoot.querySelector('#item-price-input');
        if (!input) return;
        const digit = btn.dataset.priceNum;
        let val = input.value.replace(/,/g, '').trim();
        if (val === '0' || val === '0.00' || val === '') {
          input.value = digit;
        } else {
          if (val.length < 7) input.value = val + digit;
        }
      });
    });
    modalRoot?.querySelector('.price-clear-btn')?.addEventListener('click', () => {
      const input = modalRoot.querySelector('#item-price-input');
      if (input) input.value = '0';
    });
    modalRoot?.querySelector('.price-del-btn')?.addEventListener('click', () => {
      const input = modalRoot.querySelector('#item-price-input');
      if (input) {
        let val = input.value.replace(/,/g, '').trim();
        input.value = val.length > 1 ? val.slice(0, -1) : '0';
      }
    });
    modalRoot?.querySelectorAll('.price-note-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const note = modalRoot.querySelector('#item-price-note');
        if (note) {
          note.value = btn.dataset.quickPortionNote;
          note.focus();
        }
      });
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
      const active = state.activeCash;
      const outCategories = CASH_MOVEMENT_CATEGORIES.out;
      const inCategories = CASH_MOVEMENT_CATEGORIES.in;
      const outPresets = [50, 100, 200, 500, 1000, 2000];
      const inPresets = [200, 500, 1000, 2000, 5000];

      const renderCategoriesForType = (type) => {
        const catGrid = modalRoot.querySelector('#cash-movement-cat-grid');
        if (!catGrid) return;
        const cats = type === 'in' ? inCategories : outCategories;
        const firstCat = cats[0].label;
        const catInput = modalRoot.querySelector('#cash-movement-category');
        if (catInput) catInput.value = firstCat;

        catGrid.innerHTML = cats.map((c, i) => `
          <button type="button" class="cash-modal-cat-chip ${i === 0 ? 'active' : ''}" data-select-cat="${escapeHtml(c.label)}" style="display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:8px;font-size:0.76rem;font-weight:700;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#cbd5e1;cursor:pointer;text-align:left;">
            <i data-lucide="${c.icon}" style="width:14px;height:14px;color:${c.color};flex-shrink:0;"></i>
            <span>${escapeHtml(c.label)}</span>
          </button>
        `).join('');
        iconsRefresh(catGrid);

        catGrid.querySelectorAll('[data-select-cat]').forEach((chip) => {
          chip.addEventListener('click', () => {
            const val = chip.dataset.selectCat;
            if (catInput) catInput.value = val;
            catGrid.querySelectorAll('[data-select-cat]').forEach(b => b.classList.toggle('active', b.dataset.selectCat === val));
          });
        });
      };

      const renderPresetsForType = (type) => {
        const presetsRow = modalRoot.querySelector('#cash-movement-presets');
        if (!presetsRow) return;
        const presets = type === 'in' ? inPresets : outPresets;
        presetsRow.innerHTML = presets.map(p => `
          <button type="button" class="drawer-outflow-chip" data-set-movement-amount="${p}">
            RD$ ${p.toLocaleString('es-DO')}
          </button>
        `).join('');

        presetsRow.querySelectorAll('[data-set-movement-amount]').forEach((chip) => {
          chip.addEventListener('click', () => {
            const amountInput = modalRoot.querySelector('#cash-movement-amount');
            if (amountInput) amountInput.value = Number(chip.dataset.setMovementAmount).toFixed(2);
          });
        });
      };

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
          if (submitBtn) {
            submitBtn.className = `button ${type === 'in' ? 'primary' : 'danger'}`;
            submitBtn.style = type === 'in' ? '' : 'background:#dc2626;border-color:#b91c1c;color:#fff;';
            submitBtn.innerHTML = `<i data-lucide="${type === 'in' ? 'trending-up' : 'trending-down'}"></i> ${submitText}`;
            iconsRefresh(submitBtn);
          }

          const availRow = modalRoot.querySelector('#cash-movement-available-row');
          if (availRow) availRow.style.display = type === 'out' ? 'flex' : 'none';

          const amountInput = modalRoot.querySelector('#cash-movement-amount');
          if (amountInput) amountInput.style.color = type === 'out' ? '#f87171' : '#10b981';

          renderCategoriesForType(type);
          renderPresetsForType(type);
        });
      });

      // Bind initial category chips
      modalRoot.querySelectorAll('[data-select-cat]').forEach((chip) => {
        chip.addEventListener('click', () => {
          const val = chip.dataset.selectCat;
          const catInput = modalRoot.querySelector('#cash-movement-category');
          if (catInput) catInput.value = val;
          modalRoot.querySelectorAll('[data-select-cat]').forEach(b => b.classList.toggle('active', b.dataset.selectCat === val));
        });
      });

      // Bind initial presets
      modalRoot.querySelectorAll('[data-set-movement-amount]').forEach((chip) => {
        chip.addEventListener('click', () => {
          const amountInput = modalRoot.querySelector('#cash-movement-amount');
          if (amountInput) amountInput.value = Number(chip.dataset.setMovementAmount).toFixed(2);
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

      modalRoot.querySelectorAll('[data-drawer-tab]').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
          const tabMode = tabBtn.dataset.drawerTab;
          state.drawerModalMode = tabMode;
          const modeInput = modalRoot.querySelector('#drawer-mode-input');
          if (modeInput) modeInput.value = tabMode;

          modalRoot.querySelectorAll('[data-drawer-tab]').forEach((b) => {
            const isMatch = b.dataset.drawerTab === tabMode;
            b.classList.toggle('active', isMatch);
            if (b.dataset.drawerTab === 'outflow') b.classList.toggle('outflow', isMatch);
          });

          const openSec = modalRoot.querySelector('#drawer-open-only-section');
          const outflowSec = modalRoot.querySelector('#drawer-outflow-section');
          if (openSec) openSec.style.display = tabMode === 'open_only' ? '' : 'none';
          if (outflowSec) outflowSec.style.display = tabMode === 'outflow' ? '' : 'none';

          const submitBtn = modalRoot.querySelector('#drawer-pin-submit');
          if (submitBtn) {
            if (tabMode === 'outflow') {
              submitBtn.className = 'button danger';
              submitBtn.style.background = '#dc2626';
              submitBtn.style.borderColor = '#b91c1c';
              submitBtn.style.color = '#fff';
              submitBtn.innerHTML = '<i data-lucide="trending-down"></i> Autorizar y Registrar Salida';
            } else {
              submitBtn.className = 'button primary';
              submitBtn.style.background = '';
              submitBtn.style.borderColor = '';
              submitBtn.style.color = '';
              submitBtn.innerHTML = '<i data-lucide="key-round"></i> Autorizar y Abrir';
            }
            iconsRefresh(submitBtn);
          }
        });
      });

      modalRoot.querySelectorAll('[data-set-outflow]').forEach((chip) => {
        chip.addEventListener('click', () => {
          const amountInput = modalRoot.querySelector('#drawer-outflow-amount');
          if (amountInput) amountInput.value = Number(chip.dataset.setOutflow).toFixed(2);
        });
      });

      modalRoot.querySelectorAll('.drawer-category-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const cat = chip.dataset.category;
          const catInput = modalRoot.querySelector('#drawer-outflow-category');
          if (catInput) catInput.value = cat;
          modalRoot.querySelectorAll('.drawer-category-chip').forEach((c) => {
            c.classList.toggle('active', c.dataset.category === cat);
          });
        });
      });

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
        const mode = modalRoot.querySelector('#drawer-mode-input')?.value || 'open_only';

        if (!/^\d{6}$/.test(pin)) {
          if (errBox) errBox.textContent = 'Ingresa tu PIN de 6 dígitos.';
          return;
        }

        if (mode === 'outflow') {
          if (!state.activeCash) {
            if (errBox) errBox.textContent = 'No hay una caja abierta para registrar salidas.';
            return;
          }
          const rawAmount = modalRoot.querySelector('#drawer-outflow-amount')?.value || '';
          const amountCents = toCents(rawAmount);
          if (!amountCents || amountCents <= 0) {
            if (errBox) errBox.textContent = 'Ingresa el monto a retirar en pesos (DOP).';
            return;
          }
          const category = modalRoot.querySelector('#drawer-outflow-category')?.value || 'Pago de Servicio';
          const justification = (modalRoot.querySelector('#drawer-outflow-justification')?.value || '').trim();
          if (justification.length < 3) {
            if (errBox) errBox.textContent = 'Escribe una justificación de al menos 3 caracteres.';
            return;
          }

          // Validar contra efectivo disponible en la caja
          const sessionPayments = (state.payments || []).filter((item) => item.cashSessionId === state.activeCash.id);
          const sessionMovements = (state.cashMovements || []).filter((item) => item.cashSessionId === state.activeCash.id);
          const cashCollected = sessionPayments.filter((item) => item.method === 'cash').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
          const cashIn = sessionMovements.filter((item) => item.type === 'in').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
          const cashOut = sessionMovements.filter((item) => item.type === 'out').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
          const expectedCashCents = Number(state.activeCash.openingCents || 0) + cashCollected + cashIn - cashOut;

          if (amountCents > expectedCashCents) {
            if (errBox) errBox.textContent = `La salida (${formatMoney(amountCents)}) supera el efectivo en caja (${formatMoney(expectedCashCents)}).`;
            return;
          }

          const fullReason = `[${category}] ${justification}`;
          try {
            drawerInProgress = true;
            setBusy(submitBtn, true);
            const result = await service.verifyDrawerPin(pin, `Salida de efectivo: ${fullReason}`);
            const hardwareResult = await auditedDrawerPulse(`Salida de caja: ${formatMoney(amountCents)} - ${fullReason}`);
            if (!hardwareResult?.success) throw new Error('PIN correcto, pero la gaveta no respondió. Revisa la conexión de la impresora Star.');

            const movementId = await service.createCashMovement({
              cashSessionId: state.activeCash.id,
              type: 'out',
              amountCents,
              reason: fullReason,
              createdByName: result.user.displayName || result.user.username
            });

            const printVoucher = modalRoot.querySelector('#drawer-outflow-print')?.checked;
            if (printVoucher) {
              try {
                const mov = {
                  id: movementId,
                  type: 'out',
                  amountCents,
                  category,
                  reason: justification,
                  createdAt: new Date(),
                  createdByName: result.user.displayName || result.user.username
                };
                const updatedSession = { ...state.activeCash, expectedCents: expectedCashCents - amountCents };
                const voucher = buildCashMovementEscPos(mov, updatedSession, state.settings);
                const plainText = buildCashMovementPlainText(mov, updatedSession, state.settings);
                await sendEscPosToPrinter(voucher, { plainText, openDrawer: false });
              } catch (printErr) {
                console.warn('Error imprimiendo comprobante de salida:', printErr);
              }
            }

            beepHardware('ok');
            toast(`Gaveta abierta. Salida de ${formatMoney(amountCents)} registrada por ${result.user.displayName}.`, 'success');
            closeModal();
          } catch (err) {
            beepHardware('error');
            if (errBox) errBox.textContent = err.message || 'Error autorizando salida.';
            if (pinInput) {
              pinInput.value = '';
              updateDrawerPinSlots();
            }
          } finally {
            drawerInProgress = false;
            setBusy(submitBtn, false);
          }
        } else {
          // Modo 1: Solo abrir gaveta
          const reason = modalRoot.querySelector('#drawer-pin-reason')?.value || 'Apertura manual';
          try {
            drawerInProgress = true;
            setBusy(submitBtn, true);
            const result = await service.verifyDrawerPin(pin, reason);
            const hardwareResult = await auditedDrawerPulse(reason);
            if (!hardwareResult?.success) throw new Error('PIN correcto, pero la gaveta no respondió. Revisa la conexión de la impresora Star.');
            beepHardware('ok');
            toast(`Pulso de apertura enviado por ${result.user.displayName}. Comprueba la gaveta.`, 'success');
            closeModal();
            showPostDrawerPrompt();
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
          togglePrintBtn.textContent = nowPrint ? 'Sí, imprimir' : 'No imprimir';
          togglePrintBtn.style.background = nowPrint ? 'rgba(63,185,80,.18)' : 'rgba(255,255,255,.08)';
          togglePrintBtn.style.color = nowPrint ? '#3fb950' : 'var(--muted)';
          togglePrintBtn.style.border = nowPrint ? '1px solid rgba(63,185,80,.4)' : '1px solid var(--line)';
          const posPrintCheck = root.querySelector('#pos-print-receipt');
          if (posPrintCheck) posPrintCheck.checked = nowPrint;
          updatePosSubmitLabel();
        });
      }

      const changePinBtn = modalRoot.querySelector('#chk-open-pin-change-btn');
      if (changePinBtn) {
        changePinBtn.addEventListener('click', () => {
          state.modal = 'setupCheckoutPin';
          state.pendingPinDestination = 'checkoutPin';
          renderModal();
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
        let completedSuccessfully = false;
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
            const msg = outcome.error?.message || 'No se pudo registrar la venta.';
            toast(msg, 'danger');
            if (chkErrBox) chkErrBox.textContent = msg;
            if (chkPinInput) chkPinInput.value = '';
            updatePinSlots();
          } else {
            completedSuccessfully = true;
          }
        } catch (err) {
          beepHardware('error');
          const msg = err.message || 'PIN incorrecto.';
          toast(msg, 'danger');
          if (chkErrBox) chkErrBox.textContent = msg;
          if (chkPinInput) {
            chkPinInput.value = '';
            updatePinSlots();
          }
        } finally {
          state.saleInProgress = false;
          setBusy(submitBtn, false);
          if (!destroyed && (completedSuccessfully || !state.modal)) renderContent();
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

      let fiaoAttempt = null;
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
          const inv = state.selectedFiaoInvoice;
          fiaoAttempt = preparePaymentAttempt(fiaoAttempt, {
            entries: [{ invoiceId, balanceCents: Number(inv.totalCents) - Number(inv.paidCents || 0) }],
            amountCents, tenderedCents, prefix: 'fiao-payment',
            payment: {
              method,
              reference,
              cashSessionId: state.activeCash.id,
              cashierId: verifyRes.user.id,
              cashierName: verifyRes.user.displayName
            }
          });
          await executePaymentAttempt(fiaoAttempt, (id, payment) => service.recordPayment(id, payment));
          toast('Cobro de fiao registrado con éxito.', 'success');
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
          if (!destroyed && !state.modal) renderContent();
        }
      });
    }

    // Imprimir Estado de Cuenta del Cliente desde el modal
    const statementPrintBtn = modalRoot?.querySelector('[data-print-client-statement-btn]');
    if (statementPrintBtn) {
      statementPrintBtn.addEventListener('click', async () => {
        if (!state.selectedClientStatement) return;
        const b = buildClientStatementEscPos(state.selectedClientStatement, state.settings);
        const plainText = buildClientStatementPlainText(state.selectedClientStatement, state.settings);
        const res = await sendEscPosToPrinter(b, { plainText, openDrawer: false });
        if (res?.success) toast('Estado de cuenta impreso con éxito.', 'success');
        else toast('No se pudo enviar a la impresora.', 'warning');
      });
    }

    // Formulario para Cobro Global / Abonar a Deuda del Cliente (Bulk Pay)
    const clientBulkPayForm = modalRoot?.querySelector('#client-bulk-pay-form');
    if (clientBulkPayForm) {
      const amountInput = modalRoot.querySelector('#bulk-pay-amount');
      const receivedInput = modalRoot.querySelector('#bulk-cash-received');
      const changeDisplay = modalRoot.querySelector('#bulk-change-amount');
      const methodSelect = modalRoot.querySelector('#bulk-pay-method');
      const cashCalc = modalRoot.querySelector('#bulk-cash-calculator');
      const totalDisplay = modalRoot.querySelector('#bulk-total-display');

      const updateBulkTotal = () => {
        let totalCents = 0;
        clientBulkPayForm.querySelectorAll('input[name="invoiceIds"]:checked').forEach(cb => {
          totalCents += Number(cb.dataset.balanceCents || 0);
        });
        if (totalDisplay) totalDisplay.textContent = formatMoney(totalCents);
        if (amountInput) {
          amountInput.max = (totalCents / 100).toFixed(2);
          amountInput.value = (totalCents / 100).toFixed(2);
        }
        updateBulkChange();
      };

      clientBulkPayForm.querySelectorAll('input[name="invoiceIds"]').forEach(cb => {
        cb.addEventListener('change', updateBulkTotal);
      });

      const updateBulkChange = () => {
        const amt = Math.round(Number(amountInput?.value || 0) * 100);
        const rec = Math.round(Number(receivedInput?.value || 0) * 100);
        const change = Math.max(0, rec - amt);
        if (changeDisplay) {
          changeDisplay.textContent = formatMoney(change);
          changeDisplay.style.color = rec >= amt ? '#3fb950' : 'var(--brand-2)';
        }
      };

      amountInput?.addEventListener('input', updateBulkChange);
      receivedInput?.addEventListener('input', updateBulkChange);
      methodSelect?.addEventListener('change', () => {
        if (cashCalc) cashCalc.style.display = methodSelect.value === 'cash' ? 'block' : 'none';
      });

      modalRoot.querySelectorAll('[data-bulk-cash-val]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.bulkCashVal;
          if (val === 'exact') {
            if (receivedInput && amountInput) receivedInput.value = amountInput.value;
          } else {
            if (receivedInput) receivedInput.value = val;
          }
          updateBulkChange();
        });
      });

      const pinInput = clientBulkPayForm.querySelector('#bulk-pay-pin');
      const errBox = clientBulkPayForm.querySelector('#bulk-pin-error');
      const submitBtn = clientBulkPayForm.querySelector('#bulk-pay-submit') || clientBulkPayForm.querySelector('button[type="submit"]');

      disposePinPad = bindPinPad({
        form: clientBulkPayForm,
        input: pinInput,
        slots: [...clientBulkPayForm.querySelectorAll('#bulk-pin-slots .pin-slot')],
        digits: [...clientBulkPayForm.querySelectorAll('.pin-num-btn')],
        clear: clientBulkPayForm.querySelector('#bulk-pin-clear'),
        backspace: clientBulkPayForm.querySelector('#bulk-pin-del'),
        submit: submitBtn,
        error: errBox,
        isBusy: () => state.saleInProgress
      });

      let bulkAttempt = null;
      clientBulkPayForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (state.saleInProgress) return toast('Ya se está procesando un cobro.', 'warning');
        const form = new FormData(clientBulkPayForm);
        const selectedCbs = [...clientBulkPayForm.querySelectorAll('input[name="invoiceIds"]:checked')];
        if (!selectedCbs.length) return toast('Selecciona al menos una factura a liquidar.', 'warning');

        const clientName = form.get('clientName');
        const clientPhone = form.get('clientPhone') || '';
        const amount = Number(form.get('amount') || 0);
        const method = form.get('method') || 'cash';
        const reference = form.get('reference') || '';
        const pin = String(form.get('pin') || '').trim();
        const shouldPrint = form.get('printSettlement') === 'on' || Boolean(clientBulkPayForm.querySelector('#bulk-print-receipt')?.checked);

        if (!amount || amount <= 0) return toast('Ingresa un monto válido a cobrar.', 'warning');
        if (!/^\d{6}$/.test(pin)) {
          if (errBox) errBox.textContent = 'Digita tu PIN personal de 6 dígitos.';
          return toast('Digita tu PIN personal de 6 dígitos.', 'warning');
        }

        const totalAmountCents = Math.round(amount * 100);
        const tenderedCents = method === 'cash' ? Math.round(Number(receivedInput?.value || amount) * 100) : totalAmountCents;
        if (method === 'cash' && tenderedCents < totalAmountCents) {
          return toast('El efectivo recibido es menor al monto a abonar.', 'warning');
        }

        const button = e.submitter || submitBtn;
        state.saleInProgress = true;
        setBusy(button, true);

        try {
          const verifyRes = await service.verifyDrawerPin(pin, `Cobro consolidado fiao - ${clientName}`);
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

          bulkAttempt = preparePaymentAttempt(bulkAttempt, {
            entries: selectedCbs.map(cb => ({ invoiceId: cb.value, invoiceNumber: cb.dataset.invoiceNumber, balanceCents: Number(cb.dataset.balanceCents || 0) })),
            amountCents: totalAmountCents, tenderedCents, prefix: 'fiao-payment',
            payment: {
              method,
              reference: reference || `Abono fiao ${clientName}`,
              cashSessionId: state.activeCash.id,
              cashierId: verifyRes.user.id,
              cashierName: verifyRes.user.displayName
            }
          });
          const confirmedLines = await executePaymentAttempt(bulkAttempt, (id, payment) => service.recordPayment(id, payment));
          const appliedInvoices = confirmedLines.map(line => ({
            invoiceId: line.invoiceId, invoiceNumber: line.invoiceNumber,
            appliedCents: line.appliedCents, newBalanceCents: line.balanceCents - line.appliedCents
          }));
          // The selected statement is a pre-collection snapshot, independent of listener timing.
          const clientTotalPending = Math.max(0, Number(state.selectedClientBulkPay.totalDebtCents) - totalAmountCents);

          beepHardware('ok');
          closeModal();
          toast(`Cobro de ${formatMoney(totalAmountCents)} registrado con éxito para ${clientName}.`, 'success');

          setTimeout(async () => {
            if (method === 'cash' && state.settings?.autoOpenDrawer !== false) {
              void kickDrawer({ silentFailure: true });
            }
            if (shouldPrint && state.settings?.autoPrintInvoice !== false) {
              const settlementData = {
                createdAt: new Date(),
                clientName,
                clientPhone,
                cashierName: verifyRes.user.displayName,
                method,
                reference,
                totalPaidCents: totalAmountCents,
                tenderedCents,
                changeCents: method === 'cash' ? tenderedCents - totalAmountCents : 0,
                remainingDebtCents: clientTotalPending,
                invoices: appliedInvoices
              };

              const b = buildClientSettlementEscPos(settlementData, state.settings);
              const plainText = buildClientSettlementPlainText(settlementData, state.settings);
              await sendEscPosToPrinter(b, { plainText, openDrawer: false });
            }
          }, 350);

        } catch (err) {
          beepHardware('error');
          toast(err.message, 'danger');
          if (errBox) errBox.textContent = err.message || 'PIN incorrecto.';
          if (pinInput) {
            pinInput.value = '';
            clientBulkPayForm.querySelectorAll('#bulk-pin-slots .pin-slot').forEach(s => s.classList.remove('filled'));
          }
        } finally {
          state.saleInProgress = false;
          setBusy(button, false);
          if (!destroyed && !state.modal) renderContent();
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

      let deliveryAttempt = null;
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

          const entries = selectedCbs.map(cb => {
            const inv = (state.invoices || []).find(i => i.id === cb.value);
            return { invoiceId: cb.value, balanceCents: Number(cb.dataset.balanceCents || 0), invoiceNumber: inv?.invoiceNumber || 'FACTURA', clientName: inv?.clientName || 'Cliente', totalCents: inv?.totalCents };
          });
          const grandTotalCents = entries.reduce((sum, entry) => sum + entry.balanceCents, 0);
          deliveryAttempt = preparePaymentAttempt(deliveryAttempt, {
            entries, amountCents: grandTotalCents, tenderedCents: grandTotalCents, prefix: 'delivery-settle',
            payment: {
              method,
              reference,
              cashSessionId: state.activeCash.id,
              cashierId: verifyRes.user.id,
              cashierName: verifyRes.user.displayName
            }
          });
          const confirmedLines = await executePaymentAttempt(deliveryAttempt, (id, payment) => service.recordPayment(id, payment));
          const settledInvoices = confirmedLines.map(line => ({
            invoiceNumber: line.invoiceNumber, clientName: line.clientName,
            paidAmountCents: line.appliedCents, totalCents: line.totalCents || line.balanceCents
          }));

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
          toast(`Liquidación completada: ${formatMoney(grandTotalCents)} por ${method === 'cash' ? 'efectivo' : method === 'card' ? 'tarjeta' : 'transferencia'}.`, 'success');

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
          if (!destroyed && !state.modal) renderContent();
        }
      });
    }
  }

  function route(id){
    if (state.saleInProgress || state.checkoutOpening || state.sendingOrder) return toast('Espera a que termine la operación actual.', 'warning');
    if (id === 'tables') id = 'pos';
    if(!allowedNavigation(user).includes(id))return;
    if(state.route === id && !state.modal) {
      root.querySelector('.sidebar')?.classList.remove('open');
      return;
    }
    if (id !== 'payroll') state.payrollUnlocked = false;
    if (id !== 'users') state.usersUnlocked = false;
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
      linesEl.querySelectorAll('[data-cart-set-price]').forEach((btn) =>
        btn.addEventListener('click', () => openItemPriceModal(Number(btn.dataset.cartSetPrice)))
      );
      linesEl.querySelectorAll('[data-cart-edit-options]').forEach((btn) =>
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openCartItemOptions(Number(btn.dataset.cartEditOptions));
        })
      );
    }

    const sendBtn = root.querySelector('[data-pos-send-table]');
    if (sendBtn) {
      sendBtn.disabled = !state.cart.length;
    }

    const submitBtn = root.querySelector('#pos-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = !state.cart.length;
    }

    const mobileBtn = root.querySelector('.mobile-pos-charge');
    if (mobileBtn) {
      mobileBtn.disabled = !state.cart.length;
    }

    const prebillBtn = root.querySelector('[data-print-cart-prebill]');
    if (prebillBtn) {
      prebillBtn.style.display = state.cart.length ? '' : 'none';
    }

    const totals = updatePosChange();

    if (linesEl) iconsRefresh(linesEl);
    updateSafety.setBlocker('application', !destroyed && updateIsBusy());
    return totals;
  }

  function openCartItemOptions(index) {
    const item = state.cart[index];
    if (!item) return;
    const product = state.products.find((p) => p.id === item.productId);
    if (!product) return;
    state.optionPickerProduct = product;
    state.optionPickerCartIndex = index;
    state.optionPickerItem = item;
    state.modal = 'productOptions';
    renderModal();
  }

  function addProduct(id){
    capturePosDraft();
    const product=state.products.find((item)=>item.id===id);
    if(!product)return;
    const isPrepared = Boolean(product.isPrepared);
    const stock = Number(product.stock || 0);
    if (!isPrepared && stock < 1) {
      toast(`${product.name} está agotado. Abriendo ajuste rápido para reabastecer...`, 'warning');
      state.editingStockProduct = product;
      state.modal = 'stockAdjust';
      renderModal();
      return;
    }

    // Si el producto tiene tamaños/porciones o guarnición, abrir modal táctil rápido de opciones
    if (hasProductVariants(product) || hasProductSides(product)) {
      state.optionPickerProduct = product;
      state.optionPickerCartIndex = null;
      state.optionPickerItem = null;
      state.modal = 'productOptions';
      renderModal();
      return;
    }

    // Producto simple sin variantes ni guarnición: agregar en 1 solo toque inmediato
    const line=state.cart.find((item)=>item.productId===id && !item.isCustomPrice && !item.variantId && !item.side);
    if(line) {
      if (!isPrepared && line.quantity >= Math.min(stock, 999)) return toast(`No hay más existencia disponible de ${product.name}.`, 'warning');
      line.quantity+=1;
    }
    else state.cart.push({
      productId:id,
      name:product.name,
      quantity:1,
      unitPriceCents:product.priceCents,
      originalPriceCents:product.priceCents,
      taxRate:product.taxRate||0,
      notes:''
    });
    const totals = renderPosCartOnly() || calculateDocument(state.cart, state.posDiscountState);
    setVFDMessage(product.name.slice(0, 20), `TOT: ${formatMoney(totals.totalCents)}`);
  }

  function changeQuantity(index,delta){
    capturePosDraft();
    if(!state.cart[index])return;
    const line = state.cart[index];
    const product = state.products.find((item) => item.id === line.productId);
    const isPrepared = Boolean(product?.isPrepared);
    const maximum = isPrepared ? 999 : Math.min(Number(product?.stock || 0), 999);
    if (delta > 0 && !line.isDeliveryFee && !isPrepared && line.quantity >= maximum) return toast(`No hay más existencia disponible de ${line.name}.`, 'warning');
    line.quantity+=delta;
    if(state.cart[index].quantity<=0) {
      if (line.isDeliveryFee || line.productId === 'prod-costo-de-envio-delivery') {
        const feeInput = root.querySelector('#pos-delivery-fee');
        if (feeInput) feeInput.value = '';
      }
      state.cart.splice(index,1);
    }
    const totals = renderPosCartOnly() || calculateDocument(state.cart, state.posDiscountState);
    if (state.cart.length) {
      setVFDMessage('TOTAL CUENTA:', formatMoney(totals.totalCents));
    } else {
      vfdWelcome(state.settings?.name || 'Los Panitas');
    }
  }

  function loadTableOrderToCart(tableId) {
    const table = (state.tables || []).find((t) => t.id === tableId);
    if (!table) return;
    if (!table.currentOrderId) {
      state.loadedOrderId = '';
      state.loadedTableId = table.id;
      if (state.posDraft) state.posDraft.tableId = table.id;
      toast(`Mesa ${table.name} seleccionada. Agrega productos y pulsa Mandar a mesa.`, 'info');
      renderContent();
      return;
    }
    const order = (state.orders || []).find((o) => o.id === table.currentOrderId);
    if (!order) return toast('No se encontró la comanda activa de la mesa.', 'warning');

    if (state.cart.length && state.loadedOrderId !== order.id) {
      const ok = confirm(`Hay productos en la cuenta actual. ¿Deseas descartarlos para cargar la comanda de ${table.name}?`);
      if (!ok) return;
    }

    state.loadedOrderId = order.id;
    state.loadedOrderRevision = order.revision;
    state.posDestination = 'table';
    state.loadedTableId = table.id;
    state.cart = (order.items || []).map((i) => ({ ...i }));
    state.posDraft = {
      ...(state.posDraft || {}),
      tableId: table.id,
      clientName: order.clientName && order.clientName !== 'Consumidor final' ? order.clientName : '',
      notes: order.notes || '',
      printReceipt: state.posDraft?.printReceipt !== false
    };
    state.posDiscountState = orderPricing(order);
    toast(`Comanda de ${table.name} cargada. Puedes cobrarla o agregar más productos.`, 'success');
    renderContent();
  }

  function releaseLoadedCart() {
    const tableName = (state.tables || []).find((t) => t.id === state.loadedTableId)?.name || 'Mesa';
    state.loadedOrderId = '';
    state.loadedTableId = '';
    state.cart = [];
    resetPosDraft();
    toast(`Comanda de ${tableName} liberada. La mesa continúa abierta en cola.`, 'info');
    renderContent();
  }

  async function handleCancelAndLiberateTable(tableId, triggerBtn) {
    const table = (state.tables || []).find((t) => t.id === tableId);
    const tableName = table?.name || 'la mesa';
    const order = (state.orders || []).find((o) => o.id === (table?.currentOrderId || (state.loadedTableId === tableId ? state.loadedOrderId : null)));
    const itemsCount = order?.items?.length || (state.loadedTableId === tableId ? state.cart?.length : 0);

    const ok = confirm(`¿Deseas cancelar la comanda y liberar ${tableName}?\n\n${itemsCount > 0 ? `Se anularán los ${itemsCount} productos asignados a la comanda y la mesa quedará disponible de inmediato.` : 'La mesa quedará disponible de inmediato.'}`);
    if (!ok) return;

    if (triggerBtn) setBusy(triggerBtn, true);
    try {
      if (typeof service.liberateTable === 'function') {
        await service.liberateTable(tableId, 'Liberada desde terminal POS');
      } else if (order?.id) {
        await service.transitionOrder(order.id, 'cancelled', 'cancelled', 'Liberada desde terminal POS');
      }
      if (state.loadedTableId === tableId) {
        state.loadedTableId = '';
        state.loadedOrderId = '';
        state.cart = [];
        resetPosDraft();
      }
      closeModal();
      toast(`${tableName} liberada correctamente.`, 'success');
      renderContent();
    } catch (err) {
      toast(`Error al liberar ${tableName}: ${err.message}`, 'danger');
    } finally {
      if (triggerBtn) setBusy(triggerBtn, false);
    }
  }

  async function sendComandaToTable(tableId) {
    if (state.sendingOrder) return;
    if (!state.cart.length) return toast('Agrega al menos un producto a la cuenta antes de mandar a la mesa.', 'warning');
    const table = (state.tables || []).find((t) => t.id === tableId);
    const tableName = table ? table.name : 'Mesa';
    const formElement = root.querySelector('#pos-checkout-form');
    const form = formElement ? new FormData(formElement) : new FormData();
    const pricing = readPosPricing();
    const totals = calculateDocument(state.cart, pricing);
    const clientName = String(form.get('clientName') || state.posDraft?.clientName || 'Consumidor final').trim() || 'Consumidor final';

    try {
      state.sendingOrder = true;
      root.setAttribute('aria-busy', 'true');
      updateSafety.setBlocker('sending-order', true);
      toast(`Enviando comanda a ${tableName}...`, 'info');
      const orderId = await service.createOrder({
        items: state.cart.map((i) => ({ ...i })),
        clientName,
        clientRnc: String(form.get('posClientRnc') || '').trim(),
        notes: String(form.get('notes') || state.posDraft?.notes || '').trim(),
        priority: 'normal',
        ...pricing,
        tableId,
        replaceItems: Boolean(state.loadedOrderId),
        expectedOrderId: state.loadedOrderId || '',
        expectedRevision: state.loadedOrderRevision
      });
      toast(`Comanda enviada a ${tableName}.`, 'success');
      beepHardware('ok').catch(() => {});
      if (state.settings?.autoPrintKitchen !== false) {
        void printOrder(orderId, {
          id: orderId,
          tableId,
          tableName,
          clientName,
          items: state.cart.map((item) => ({ ...item })),
          notes: String(form.get('notes') || state.posDraft?.notes || '').trim(),
          priority: 'normal',
          ...totals,
          createdAt: new Date()
        });
      }
      state.cart = [];
      state.loadedOrderId = '';
      state.loadedTableId = '';
      state.preselectedTableId = '';
      resetPosDraft();
      renderContent();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Error al enviar comanda a la mesa.', 'danger');
    } finally {
      state.sendingOrder = false;
      root.removeAttribute('aria-busy');
      updateSafety.setBlocker('sending-order', false);
    }
  }

  function updatePosSubmitLabel(totals = calculateDocument(state.cart, state.posDiscountState || {})) {
    const method = root.querySelector('#pos-payment-method')?.value || 'cash';
    const loadedTable = state.loadedTableId ? (state.tables || []).find((t) => t.id === state.loadedTableId) : null;
    const printReceipt = root.querySelector('#pos-print-receipt') ? root.querySelector('#pos-print-receipt').checked : (state.posDraft?.printReceipt !== false);
    const badge = root.querySelector('#pos-print-status-badge');
    if (badge) {
      badge.textContent = printReceipt ? 'Con ticket' : 'Sin ticket';
      badge.style.background = printReceipt ? 'rgba(63,185,80,.18)' : 'rgba(255,255,255,.08)';
      badge.style.color = printReceipt ? '#3fb950' : 'var(--muted)';
    }
    const labels = root.querySelectorAll('#pos-submit-label, .mobile-pos-charge span');
    labels.forEach((label) => {
      if (loadedTable) {
        label.textContent = `Cobrar ${loadedTable.name} ${formatMoney(totals.totalCents)}`;
      } else if (method === 'credit') {
        label.textContent = `Registrar Fiao ${formatMoney(totals.totalCents)}`;
      } else if (method === 'delivery_cod' || state.posDestination === 'delivery') {
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
    if (state.saleInProgress || state.checkoutOpening || state.sendingOrder) return toast('La operación anterior todavía se está procesando.', 'warning');
    if(!state.cart.length)return toast('Agrega al menos un producto a la cuenta.', 'warning');
    const formElement = root.querySelector('#pos-checkout-form');
    if (formElement && !formElement.reportValidity()) return;
    const form = formElement ? new FormData(formElement) : new FormData();
    const tableId = form.get('tableId') || root.querySelector('#pos-table-select')?.value || state.loadedTableId || '';
    const documentType = form.get('documentType') || 'invoice';
    if(!tableId&&!state.capabilities.bill)return toast('Selecciona una mesa para enviar la comanda.','danger');

    state.posDiscountState = readPosPricing();

    const totals = calculateDocument(state.cart, state.posDiscountState);
    const method = form.get('paymentMethod') || root.querySelector('#pos-payment-method')?.value || state.posPaymentMethod || 'cash';
    const isCredit = method === 'credit';
    const isDeliveryDest = state.posDestination === 'delivery';
    const isDelivery = method === 'delivery_cod' || isDeliveryDest;

    const deliveryDriverId = String(form.get('deliveryDriverId') || root.querySelector('#pos-delivery-driver-select')?.value || state.posDraft?.deliveryDriverId || '').trim();
    const deliveryDriver = (state.deliveryDrivers || []).find(d => d.id === deliveryDriverId);
    const deliveryDriverName = deliveryDriver ? deliveryDriver.name : String(form.get('deliveryDriverName') || state.posDraft?.deliveryDriverName || '').trim();
    const deliveryClientName = String(form.get('deliveryClientName') || root.querySelector('#pos-client-name')?.value || state.posDraft?.clientName || '').trim();
    const deliveryPhone = String(form.get('deliveryPhone') || root.querySelector('#pos-delivery-phone')?.value || state.posDraft?.deliveryPhone || '').trim();
    const deliveryAddress = String(form.get('deliveryAddress') || root.querySelector('#pos-delivery-address')?.value || state.posDraft?.deliveryAddress || '').trim();
    const rawDeliveryChange = String(root.querySelector('#pos-delivery-change-for')?.value || form.get('deliveryChangeFor') || state.posDraft?.deliveryChangeFor || '').trim();
    const deliveryChangeForCents = rawDeliveryChange && Number(rawDeliveryChange) > 0 ? Math.round(Number(rawDeliveryChange) * 100) : 0;
    const deliveryNotes = String(form.get('deliveryNotes') || root.querySelector('#pos-delivery-notes')?.value || state.posDraft?.deliveryNotes || '').trim();

    if (isDelivery || isDeliveryDest) {
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
      : String(form.get('clientName') || state.posDraft?.clientName || 'Consumidor final').trim() || 'Consumidor final';
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

    const cardReference = String(form.get('cardReference') || '').trim();
    const transferReference = String(form.get('transferReference') || '').trim();
    const reference = method === 'card' ? cardReference : (method === 'transfer' ? transferReference : '');

    const activeTable = tableId ? (state.tables || []).find((t) => t.id === tableId) : null;
    const targetOrderId = state.loadedOrderId || activeTable?.currentOrderId || '';

    // El PIN de seis dígitos es el único paso de autorización para una venta rápida o cobro de mesa.
    // Si no existe un turno, el mismo PIN abre la caja con fondo inicial de RD$0.00.
    state.pendingPosPayload = {
      orderId: targetOrderId,
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
      tableId: tableId || state.loadedTableId || '',
      ncfType,
      notes: form.get('notes') || '',
      ...state.posDiscountState,
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
      const hasDelivery = isDelivery || Boolean(payload.deliveryDriverId);
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
        tipCents: payload.tipCents,
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
        deliveryStatus: hasDelivery ? 'in_transit' : '',
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
      const created = payload.orderId
        ? await service.chargeOrder(payload.orderId, {
            ...docPayload.payment,
            requestId: payload.requestId,
            clientRnc: payload.clientRnc || '',
            ncfType: payload.ncfType || ''
          }, payload.items)
        : await service.createDirectDocument(docPayload);
      // Memoria Activa: Registro y actualización transparente de clientes en fiao, delivery o POS
      const targetClientName = String(payload.clientName || payload.deliveryClientName || '').trim();
      if (targetClientName && targetClientName.toLowerCase() !== 'consumidor final') {
        const existingClient = (state.clients || []).find(c =>
          (payload.clientId && c.id === payload.clientId) ||
          (c.name && c.name.trim().toLowerCase() === targetClientName.toLowerCase())
        );
        const updatedPhone = payload.clientPhone || payload.deliveryPhone || existingClient?.phone || '';
        const updatedAddress = payload.deliveryAddress || existingClient?.address || '';
        const updatedNotes = payload.fiaoNotes || payload.deliveryNotes || existingClient?.notes || '';

        if (!existingClient ||
            (updatedPhone && updatedPhone !== existingClient.phone) ||
            (updatedAddress && updatedAddress !== existingClient.address) ||
            (updatedNotes && updatedNotes !== existingClient.notes)) {
          service.saveClient({
            id: existingClient?.id || payload.clientId || undefined,
            name: targetClientName,
            phone: updatedPhone,
            address: updatedAddress,
            notes: updatedNotes,
            active: true
          }).catch((err) => console.warn('No se pudo registrar cliente en memoria activa:', err));
        }
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
        deliveryStatus: hasDelivery ? 'in_transit' : '',
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
      toast(isCredit ? `Fiao registrado a nombre de ${payload.clientName}.` : hasDelivery ? `Pedido delivery despachado con ${payload.deliveryDriverName || 'mensajero'}.` : 'Venta registrada correctamente.', 'success');
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
    const activeUserName = user.displayName || user.username || 'esta cuenta';
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
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:10px;margin-bottom:6px;">
              <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                <i data-lucide="user-check" style="width:18px;height:18px;color:var(--brand-2);flex-shrink:0;"></i>
                <div style="font-size:0.82rem;line-height:1.25;min-width:0;">
                  <span style="color:var(--muted);display:block;font-size:0.72rem;">Sesión activa:</span>
                  <strong style="color:#f8fafc;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(activeUserName)}</strong>
                </div>
              </div>
              <button type="button" class="button compact secondary" id="chk-open-pin-change-btn" style="font-size:0.75rem;padding:3px 8px;height:auto;flex-shrink:0;" title="Cambiar o configurar mi PIN">
                Cambiar PIN
              </button>
            </div>
            <div style="padding:10px 14px;background:rgba(239,189,105,.1);border:1px solid rgba(239,189,105,.25);border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
              <span>Total a cobrar:</span>
              <strong style="font-size:1.35rem;color:var(--brand-2);">${formatMoney(totals.totalCents)}</strong>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;margin:6px 0;">
              <span style="font-size:0.84rem;color:var(--muted);display:flex;align-items:center;gap:6px;">
                <i data-lucide="printer" style="width:15px;height:15px;"></i> Factura impresa:
              </span>
              <button type="button" class="button compact" id="chk-toggle-print" style="font-size:0.8rem;padding:4px 10px;font-weight:700;${payload.printReceipt !== false ? 'background:rgba(63,185,80,.18);color:#3fb950;border:1px solid rgba(63,185,80,.4);' : 'background:rgba(255,255,255,.08);color:var(--muted);border:1px solid var(--line);'}">
                ${payload.printReceipt !== false ? 'Sí, imprimir' : 'No imprimir'}
              </button>
            </div>
            <p style="margin:6px 0; font-size:.82rem; color:var(--muted);text-align:center;">
              Digita tu PIN de 6 dígitos para autorizar. El ticket se registrará a tu nombre.
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
    const isCheckoutReturn = state.pendingPinDestination === 'checkoutPin';
    return `
      <div class="modal-backdrop" data-modal-close>
        <article class="modal-card" style="max-width:420px;" data-modal-card>
          <header>
            <div>
              <span class="eyebrow">${forTable ? 'Primer cobro de mesa' : isCheckoutReturn ? 'Seguridad y PIN' : 'Primer cobro'}</span>
              <h2>${isCheckoutReturn ? 'Actualizar mi PIN de cobro' : 'Elige tu PIN de caja'}</h2>
            </div>
            <button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button>
          </header>
          <form id="setup-checkout-pin-form" class="stack-form" style="padding-top:8px;">
            <p style="margin:0 0 10px;color:var(--muted);font-size:.85rem;">${isCheckoutReturn ? `Configura tu nuevo PIN personal de 6 dígitos para ${escapeHtml(user.displayName || user.username)}.` : forTable ? 'Crea un PIN personal de 6 dígitos. Después volverás al cobro de la mesa para autorizarlo.' : 'Crea un PIN personal de 6 dígitos. Después, cada cobro será: elegir productos → Cobrar → PIN.'}</p>
            <label>PIN de 6 dígitos
              <input name="pin" type="password" data-touch-numpad="integer" data-numpad-title="Crear PIN (6 dígitos)" maxlength="6" placeholder="••••••" required autofocus readonly inputmode="none" style="letter-spacing:10px;font-size:1.55rem;text-align:center;font-weight:800;cursor:pointer;">
            </label>
            <label>Confirmar PIN
              <input name="confirmPin" type="password" data-touch-numpad="integer" data-numpad-title="Confirmar PIN (6 dígitos)" maxlength="6" placeholder="••••••" required readonly inputmode="none" style="letter-spacing:10px;font-size:1.55rem;text-align:center;font-weight:800;cursor:pointer;">
            </label>
            <footer class="modal-actions" style="margin-top:6px;">
              <button type="button" class="button secondary" id="setup-pin-cancel-btn">Cancelar</button>
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
                <div style="display:flex;justify-content:space-between;align-items:center;margin:3px 0 8px;flex-wrap:wrap;gap:6px;">
                  <strong style="display:flex;align-items:center;gap:6px;font-size:1.3rem;color:#f59e0b;"><i data-lucide="bike" style="width:20px;height:20px;"></i> ${escapeHtml(data.deliveryDriverName || 'Mensajero')}</strong>
                  <button type="button" class="button secondary compact" data-delivery-reassign="${escapeHtml(data.id)}" style="font-size:0.75rem;padding:3px 8px;gap:4px;">
                    <i data-lucide="arrow-left-right" style="width:12px;height:12px;"></i> Cambiar repartidor
                  </button>
                </div>
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

  function openReassignDeliveryModal(invoiceId) {
    if (!invoiceId) return;
    const inv = (state.invoices || []).find((i) => i.id === invoiceId) || (state.lastSaleResult?.id === invoiceId ? state.lastSaleResult : null);
    if (!inv) return toast('No se encontró la factura para reasignar.', 'warning');
    state.reassigningInvoiceId = inv.id;
    state.modal = 'reassignDelivery';
    renderModal();
  }

  async function saveReassignDelivery(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const invoiceId = String(data.get('invoiceId') || '').trim();
    const newDriverId = String(data.get('newDriverId') || '').trim();
    const select = form.querySelector('#reassign-new-driver-select');
    const selectedOpt = select ? select.options[select.selectedIndex] : null;
    const newDriverName = String(data.get('newDriverName') || selectedOpt?.dataset.name || selectedOpt?.textContent || '').trim().replace(/\s*\(Actual\)$/, '');
    const deliveryNotes = String(data.get('deliveryNotes') || '').trim();

    if (!newDriverName || !newDriverId) {
      return toast('Selecciona el nuevo repartidor responsable de la entrega.', 'warning');
    }

    const button = form.querySelector('button[type="submit"]');
    setBusy(button, true);

    try {
      const outcome = await perform(
        () => service.reassignDeliveryDriver(invoiceId, {
          driverId: newDriverId,
          driverName: newDriverName,
          notes: deliveryNotes
        }),
        `Entrega reasignada a ${newDriverName}.`,
        'No se pudo reasignar el repartidor.'
      );
      if (!outcome.ok) return;

      if (state.lastSaleResult && state.lastSaleResult.id === invoiceId) {
        state.lastSaleResult.deliveryDriverId = newDriverId;
        state.lastSaleResult.deliveryDriverName = newDriverName;
        if (deliveryNotes) state.lastSaleResult.deliveryNotes = deliveryNotes;
      }

      beepHardware('ok').catch(() => {});
      closeModal();
      renderContent();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Error al reasignar el repartidor.', 'danger');
    } finally {
      setBusy(button, false);
    }
  }

  async function saveProduct(event) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const name = String(f.get('name') || '').trim();
    if (!name) return toast('El nombre del producto es obligatorio.', 'warning');
    const priceVal = f.get('price');
    let priceCents = 0;
    try {
      priceCents = toCents(priceVal);
    } catch {
      return toast('Indica un precio de venta válido.', 'warning');
    }
    const costVal = f.get('cost') || '0';
    let costCents = 0;
    try {
      costCents = toCents(costVal);
    } catch {
      costCents = 0;
    }
    const productId = f.get('id') || undefined;
    const inventoryType = f.get('inventoryType') || (f.get('isPrepared') === 'on' ? 'prepared' : 'resale');
    const minStock = Number(f.get('minStock') || 5);
    const isPrepared = inventoryType === 'prepared' || f.get('isPrepared') === 'on';

    const hasVariants = f.get('hasVariants') === 'on';
    const variantNames = f.getAll('variantName[]');
    const variantPrices = f.getAll('variantPrice[]');
    const variantCosts = f.getAll('variantCost[]');
    const variantIds = f.getAll('variantId[]');

    const variants = [];
    if (hasVariants && variantNames.length > 0) {
      for (let i = 0; i < variantNames.length; i++) {
        const vName = String(variantNames[i] || '').trim();
        if (!vName) continue;
        let vPriceCents = priceCents;
        try {
          vPriceCents = toCents(variantPrices[i] || '0');
        } catch (_) {}
        let vCostCents = 0;
        try {
          vCostCents = toCents(variantCosts[i] || '0');
        } catch (_) {}
        variants.push({
          id: String(variantIds[i] || `var-${i + 1}`).trim(),
          name: vName,
          priceCents: vPriceCents,
          costCents: vCostCents
        });
      }
    }

    const hasSides = f.get('hasSides') === 'on';
    let sidePriceCents = 0;
    if (hasSides) {
      try {
        sidePriceCents = toCents(f.get('sidePrice') || '0');
      } catch (_) {}
    }

    await perform(() => service.saveProduct({
      id: productId,
      name,
      sku: String(f.get('sku') || '').trim(),
      category: String(f.get('category') || 'General').trim(),
      priceCents,
      costCents,
      taxRate: Number(f.get('taxRate') || 0),
      stock: isPrepared ? 0 : Number(f.get('stock') || 0),
      inventoryType,
      minStock,
      isPrepared,
      hasVariants: hasVariants && variants.length > 0,
      variants,
      hasSides,
      sidePriceCents,
      active: f.get('active') === 'on'
    }), productId ? 'Producto actualizado correctamente.' : 'Producto creado correctamente.', closeModal);
  }
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
      const op = opInput?.value || 'restock';
      const qty = Math.max(0, Number(qtyInput?.value || 0));

      if (op === 'restock') {
        const resulting = currentStock + qty;
        if (impactTitle) {
          impactTitle.textContent = 'Nuevo Stock en Inventario:';
          impactTitle.style.color = '#10b981';
        }
        if (impactVal) {
          impactVal.textContent = `${resulting} uds (+${qty})`;
          impactVal.style.color = '#10b981';
        }
      } else if (op === 'waste') {
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
          if (b.dataset.adjustOp === 'restock') {
            b.style.background = isAct ? 'rgba(16,185,129,.25)' : 'rgba(255,255,255,.04)';
            b.style.color = isAct ? '#10b981' : '#cbd5e1';
          } else if (b.dataset.adjustOp === 'waste') {
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

        if (op === 'restock') {
          if (qtyLabel) qtyLabel.textContent = 'Cantidad de Unidades que Entraron *';
          if (reasonInput) reasonInput.value = 'restock';
        } else if (op === 'waste') {
          if (qtyLabel) qtyLabel.textContent = 'Cantidad de Unidades a Descartar *';
          if (reasonInput) reasonInput.value = 'waste_damaged';
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
      const operation = String(data.get('operation') || 'restock');
      const reasonCategory = String(data.get('reasonCategory') || 'restock');
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

        const isPreparedChecked = form.querySelector('#adjust-is-prepared')?.checked;
        const originalProduct = (state.products || []).find((p) => p.id === productId);
        if (originalProduct && isPreparedChecked !== undefined && Boolean(originalProduct.isPrepared) !== isPreparedChecked) {
          await service.saveProduct({
            ...originalProduct,
            isPrepared: isPreparedChecked
          });
        }

        const res = await perform(() => service.adjustInventoryItem(adjustInput), null, closeModal);
        if (res.ok) {
          const pName = state.editingStockProduct?.name || 'Producto';
          if (operation === 'restock') {
            toast(`Entrada registrada: +${quantity} uds de ${pName}.`, 'success');
          } else if (operation === 'waste') {
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
    const type = String(f.get('type') || 'in');
    const rawCategory = String(f.get('category') || '').trim();
    const rawReason = String(f.get('reason') || '').trim();
    const reason = rawCategory && !rawReason.startsWith(`[${rawCategory}]`)
      ? `[${rawCategory}] ${rawReason}`
      : rawReason;
    const amountCents = toCents(f.get('amount'));
    const printVoucher = Boolean(form.querySelector('#cash-movement-print')?.checked);

    if (type === 'out') {
      const sessionPayments = (state.payments || []).filter((item) => item.cashSessionId === state.activeCash.id);
      const sessionMovements = (state.cashMovements || []).filter((item) => item.cashSessionId === state.activeCash.id);
      const cashCollected = sessionPayments.filter((item) => item.method === 'cash').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
      const cashIn = sessionMovements.filter((item) => item.type === 'in').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
      const cashOut = sessionMovements.filter((item) => item.type === 'out').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
      const expectedCashCents = Number(state.activeCash.openingCents || 0) + cashCollected + cashIn - cashOut;

      if (amountCents > expectedCashCents) {
        const errBox = form.querySelector('#cash-movement-pin-error') || form.querySelector('.pin-error-box');
        if (errBox) errBox.textContent = `La salida (${formatMoney(amountCents)}) supera el efectivo en caja (${formatMoney(expectedCashCents)}).`;
        return toast(`El monto supera el efectivo disponible en caja (${formatMoney(expectedCashCents)}).`, 'danger');
      }
    }

    const payload = { cashSessionId: state.activeCash.id, type, amountCents, reason };
    const fingerprint = JSON.stringify(payload);
    if (movementAttempt?.fingerprint !== fingerprint) movementAttempt = { fingerprint, requestId: createOperationId('cash-movement') };

    let createdId = null;
    let authorizedUser = null;
    const outcome = await authorizeCashForm(event, `Movimiento de caja (${type === 'in' ? 'Entrada' : 'Salida'})`, async (authorized) => {
      authorizedUser = authorized?.user || null;
      const createdByName = authorizedUser?.displayName || user.displayName || user.username || 'Cajero';
      const res = await service.createCashMovement({
        ...payload,
        requestId: movementAttempt.requestId,
        createdByName
      });
      createdId = res;
      return res;
    }, 'Movimiento de caja registrado.', () => {
      movementAttempt = null;
      closeModal();
    });

    if (outcome.ok) {
      if (state.settings?.autoOpenDrawer !== false) void kickDrawer();
      if (printVoucher) {
        try {
          const mov = {
            id: createdId || movementAttempt?.requestId,
            cashSessionId: state.activeCash.id,
            type,
            amountCents,
            category: rawCategory,
            reason: rawReason,
            createdAt: new Date(),
            createdByName: authorizedUser?.displayName || user.displayName || user.username || 'Cajero'
          };
          const voucher = buildCashMovementEscPos(mov, state.activeCash, state.settings || {});
          const plainText = buildCashMovementPlainText(mov, state.activeCash, state.settings || {});
          await sendEscPosToPrinter(voucher, { plainText, openDrawer: false });
        } catch (printErr) {
          console.warn('Error imprimiendo comprobante de movimiento:', printErr);
        }
      }
    }
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
        const authorized = await service.verifyDrawerPin(pin, reason);
        return task(authorized);
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
    f.screenSleepTimeout = Number(f.screenSleepTimeout ?? 180);
    f.autoOpenDrawer = event.currentTarget.elements.autoOpenDrawer?.checked ?? true;
    f.autoPrintInvoice = event.currentTarget.elements.autoPrintInvoice?.checked ?? false;
    f.autoPrintKitchen = event.currentTarget.elements.autoPrintKitchen?.checked ?? false;
    f.enableEloScanner = event.currentTarget.elements.enableEloScanner?.checked ?? false;
    const form = event.currentTarget;
    const outcome = await perform(()=>service.saveSettings(f),'Configuración guardada.');
    if (!outcome.ok) return;
    state.settings={...state.settings,...f};
    sleepManager.reset();
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
        setVal('#diag-printer-val', statusRes.printerConnected ? 'Conectada' : 'Sin detectar', statusRes.printerConnected);

        // Sensor de Papel
        if (statusRes.paperStatus === 'unsupported') {
          setVal('#diag-paper-val', 'Sensor no compatible · revisión manual', null);
        } else if (statusRes.paperOut) {
          setVal('#diag-paper-val', '¡SIN PAPEL! Reemplazar', false);
        } else if (statusRes.paperLow) {
          setVal('#diag-paper-val', 'Poco papel restante', null);
        } else if (statusRes.printerConnected) {
          setVal('#diag-paper-val', 'Rollo instalado', true);
        } else {
          setVal('#diag-paper-val', 'Sin detectar', null);
        }

        setVal('#diag-drawer-val', statusRes.drawerAvailable ? 'Lista por impresora' : 'No disponible', Boolean(statusRes.drawerAvailable));
        setVal('#diag-scanner-val', statusRes.scannerAvailable ? (statusRes.scannerActive ? 'Activa' : 'Disponible · apagada') : 'No detectada', Boolean(statusRes.scannerAvailable));
        setVal('#diag-vfd-val', statusRes.vfdConnected ? 'Conectado' : 'No reportado', Boolean(statusRes.vfdConnected));
        setVal('#diag-msr-val', statusRes.msrActive ? 'MagTek activo' : 'No disponible', Boolean(statusRes.msrActive));
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
                <span style="margin-left:8px; color:${d.hasPermission ? '#3fb950' : '#f85149'}">${d.hasPermission ? 'Con permiso' : 'Sin permiso'}</span>
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
              toast('La impresora no tiene papel térmico. Reemplaza el rollo de 80mm.', 'danger');
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

  async function printCashMovement(movement, sessionOverride = null) {
    const session = sessionOverride || state.activeCash;
    const b = buildCashMovementEscPos(movement, session || {}, state.settings);
    const plainText = buildCashMovementPlainText(movement, session || {}, state.settings);
    const res = await sendEscPosToPrinter(b, { plainText, openDrawer: false });
    if (res.success) toast('Comprobante de salida impreso.', 'success');
    else toast('No se pudo imprimir el comprobante térmico.', 'warning');
    return res;
  }

  async function printCartPrebill() {
    if (!state.cart.length) return toast('Agrega productos al pedido para imprimir pre-cuenta.', 'warning');
    state.posDiscountState = readPosPricing();

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

  function readPosPricing() {
    const discount = root.querySelector('#pos-discount-value');
    return editedOrderPricing(state.posDiscountState, {
      discount: discount ? Number(discount.value || 0) : undefined,
      discountType: root.querySelector('#pos-discount-type')?.value,
      includeLegalTip: root.querySelector('#pos-legal-tip')?.checked
    });
  }

  async function printOrderPrebill(orderId) {
    const order = state.orders.find((item)=>item.id===orderId);
    if (!order) return;
    const totals = calculateDocument(order.items, orderPricing(order));
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

    state.posDiscountState = readPosPricing();

    const totals = calculateDocument(state.cart, state.posDiscountState);
    const totalsBlock = root.querySelector('.cart-totals-block');
    if (totalsBlock) totalsBlock.innerHTML = renderCartTotals(state.cart, state.posDiscountState, totals);
    capturePosDraft();

    // Actualizar el botón cobrar
    updatePosSubmitLabel(totals);

    if (!receivedInput || !changeAmount) return totals;
    const received = Number(receivedInput.value || 0) * 100;
    if (received <= 0) {
      changeAmount.textContent = 'RD$ 0.00';
      changeDisplay?.classList.remove('insufficient');
      return totals;
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
    return totals;
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
      const isPrepared = Boolean(product?.isPrepared);
      const maximum = isPrepared ? 999 : Math.min(Number(product?.stock || 0), 999);
      if (!isPrepared && val > maximum) return toast(`Solo hay ${maximum} unidades disponibles de ${line.name}.`, 'warning');
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
    const term = (event.target.value || '').trim();
    state.auditSearchTerm = term;
    let visible = 0;
    root.querySelectorAll('[data-audit-row]').forEach((row) => {
      const match = term ? matchesFuzzy(term, row.dataset.search) : true;
      row.hidden = !match;
      if (match) visible++;
    });
    const summary = root.querySelector('.audit-result-summary');
    if (summary) {
      const total = root.querySelectorAll('[data-audit-row]').length;
      summary.textContent = term
        ? `Encontrados ${visible} de ${total} eventos`
        : `Mostrando ${visible} de ${total} eventos`;
    }
  }

  function itemNoteModal() {
    const item = state.cart[state.editingCartIndex];
    if (!item) return '';
    return `
      <div class="modal-backdrop" data-modal-close>
        <form id="item-note-form" class="modal-card form-modal" style="max-width:440px;" data-modal-card>
          <header>
            <div><span class="eyebrow">${escapeHtml(item.name)}</span><h2>Comentario del plato</h2></div>
            <button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button>
          </header>
          <div class="stack-form" style="padding-top:8px;">
            <label>Instrucciones o especificaciones para este artículo
              <input name="itemNote" id="item-note-input" maxlength="200" placeholder="Ej: Ricky sin cebolla, salsa aparte, bien cocido..." value="${escapeHtml(item.notes || '')}" autofocus>
            </label>
            <div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0 4px;">
              <span style="font-size:0.75rem;color:var(--muted);font-weight:600;">Opciones rápidas:</span>
              <button type="button" id="clear-item-note-btn" class="button secondary compact" style="font-size:0.72rem;padding:2px 8px;color:#f87171;">Borrar nota</button>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 8px;">
              ${['Sin cebolla', 'Sin mayonesa', 'Sin ketchup', 'Con picante', 'Sin picante', 'Bien cocido', 'Término medio', 'Salsa aparte', 'Extra queso', 'Para llevar'].map(q => `
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
            <div style="margin-top:6px;border-top:1px solid var(--line);padding-top:8px;">
              <button type="button" class="button secondary" data-jump-to-price style="width:100%;font-size:0.82rem;display:flex;align-items:center;justify-content:center;gap:6px;color:var(--brand-2);border-color:rgba(245,158,11,0.3);">
                <i data-lucide="badge-dollar-sign"></i> Cambiar precio / porción (${formatMoney(item.unitPriceCents)})
              </button>
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

  function openItemPriceModal(index) {
    if (index < 0 || !state.cart[index]) return;
    capturePosDraft();
    state.editingCartIndex = index;
    state.modal = 'itemPrice';
    renderModal();
  }

  function itemPriceModal() {
    const item = state.cart[state.editingCartIndex];
    if (!item) return '';
    const product = state.products.find((p) => p.id === item.productId);
    const originalPriceCents = item.originalPriceCents != null ? item.originalPriceCents : (product?.priceCents ?? item.unitPriceCents);
    const currentPricePesos = (item.unitPriceCents / 100).toFixed(2);
    const originalPricePesos = (originalPriceCents / 100).toFixed(2);
    const isCustom = Boolean(item.isCustomPrice || (item.unitPriceCents !== originalPriceCents));

    return `
      <div class="modal-backdrop" data-modal-close>
        <form id="item-price-form" class="modal-card form-modal" style="max-width:440px;" data-modal-card>
          <header>
            <div>
              <span class="eyebrow" style="color:var(--brand-2);"><i data-lucide="badge-dollar-sign" style="width:13px;height:13px;vertical-align:-2px;display:inline-block;"></i> Porción / Precio en POS</span>
              <h2 style="font-size:1.2rem;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px;">${escapeHtml(item.name)}</h2>
            </div>
            <button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button>
          </header>

          <div class="stack-form" style="padding-top:4px;gap:10px;">
            <div style="background:rgba(255,255,255,0.04);border:1px solid var(--line);border-radius:10px;padding:6px 12px;display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:0.8rem;color:var(--muted);">Precio base en menú:</span>
              <strong style="font-size:0.95rem;color:#f8fafc;">${formatMoney(originalPriceCents)}</strong>
            </div>

            <label style="gap:4px;">
              <span style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:0.8rem;">Precio de la porción / medida (RD$)</span>
                ${isCustom ? '<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.7rem;color:var(--brand-2);font-weight:700;"><i data-lucide="sparkles" style="width:11px;height:11px;"></i> Precio personalizado</span>' : ''}
              </span>
              <input name="itemPrice" id="item-price-input" type="text" data-touch-numpad="money" data-numpad-title="Precio de Porción" value="${currentPricePesos}" readonly inputmode="none" style="font-size:1.55rem;text-align:center;font-weight:800;color:var(--brand-2);background:rgba(255,255,255,0.05);border:2px solid rgba(245,158,11,0.5);border-radius:12px;padding:6px;cursor:pointer;" required>
            </label>

            <!-- Quick Preset Chips -->
            <div>
              <span style="font-size:0.72rem;color:var(--muted);font-weight:700;display:block;margin-bottom:4px;">Montos rápidos de porción común:</span>
              <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:5px;">
                ${[50, 75, 100, 150, 200, 250, 300, 400].map((amt) => `
                  <button type="button" class="button secondary compact price-preset-chip" data-set-price="${amt}" style="font-size:0.8rem;font-weight:700;padding:5px 2px;justify-content:center;">RD$ ${amt}</button>
                `).join('')}
              </div>
            </div>

            <!-- Increments & Restore -->
            <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
              <span style="font-size:0.72rem;color:var(--muted);font-weight:700;">Sumar:</span>
              ${['+10', '+25', '+50', '+100'].map((inc) => `
                <button type="button" class="button secondary compact price-delta-chip" data-delta-price="${inc.replace('+', '')}" style="font-size:0.75rem;padding:3px 7px;">${inc}</button>
              `).join('')}
              <button type="button" class="button secondary compact price-restore-btn" data-restore-price="${originalPricePesos}" style="margin-left:auto;font-size:0.72rem;padding:3px 7px;color:#cbd5e1;border-color:rgba(255,255,255,0.15);" title="Volver al precio original del menú">
                ↺ Menú (${formatMoney(originalPriceCents)})
              </button>
            </div>

            <!-- Tactile numeric keypad -->
            <div class="pin-pad" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:6px;margin:2px 0;">
              ${[1,2,3,4,5,6,7,8,9].map((n) => `<button type="button" class="button secondary price-num-btn" data-price-num="${n}" style="font-size:1.15rem;font-weight:700;padding:8px 0;">${n}</button>`).join('')}
              <button type="button" class="button secondary price-clear-btn" style="font-size:.82rem;font-weight:600;padding:8px 0;color:#f85149;">Borrar</button>
              <button type="button" class="button secondary price-num-btn" data-price-num="0" style="font-size:1.15rem;font-weight:700;padding:8px 0;">0</button>
              <button type="button" class="button secondary price-del-btn" style="font-size:1.05rem;font-weight:700;padding:8px 0;">⌫</button>
            </div>

            <!-- Optional portion note -->
            <label style="gap:3px;">
              <span style="font-size:0.72rem;color:var(--muted);">Nota para comanda de cocina (opcional):</span>
              <input name="portionNote" id="item-price-note" maxlength="100" placeholder="Ej: Porción pequeña, RD$100 de chicharrón..." value="${escapeHtml(item.notes || '')}" style="font-size:0.82rem;padding:5px 8px;">
            </label>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
              ${['Porción especial', 'Media orden', 'Ración grande', 'Poco frito', 'A petición cliente'].map((txt) => `
                <button type="button" class="button secondary compact price-note-chip" data-quick-portion-note="${txt}" style="font-size:0.68rem;padding:2px 6px;">${txt}</button>
              `).join('')}
            </div>
          </div>

          <footer class="modal-actions" style="margin-top:12px;">
            <button type="button" class="button secondary" data-modal-close>Cancelar</button>
            <button class="button primary" type="submit" style="font-weight:800;gap:6px;">
              <i data-lucide="check"></i> Aplicar Precio
            </button>
          </footer>
        </form>
      </div>
    `;
  }

  function saveItemPrice(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.querySelector('#item-price-input');
    const noteInput = form.querySelector('#item-price-note');
    const line = state.cart[state.editingCartIndex];
    if (!line) {
      closeModal();
      return;
    }

    const val = parseFloat(String(input?.value || '0').replace(/,/g, '').trim());
    if (isNaN(val) || val < 0) {
      toast('Ingresa un monto válido en pesos.', 'warning');
      return;
    }

    const newCents = Math.round(val * 100);
    if (line.originalPriceCents == null) {
      const product = state.products.find((p) => p.id === line.productId);
      line.originalPriceCents = product ? product.priceCents : line.unitPriceCents;
    }

    line.unitPriceCents = newCents;
    line.isCustomPrice = (line.unitPriceCents !== line.originalPriceCents);

    const portionNote = (noteInput?.value || '').trim();
    if (portionNote) {
      line.notes = portionNote;
    }

    closeModal();
    renderPosCartOnly();
    const totals = calculateDocument(state.cart);
    if (state.cart.length) {
      setVFDMessage('TOTAL CUENTA:', formatMoney(totals.totalCents));
    } else {
      vfdWelcome(state.settings?.name || 'Los Panitas');
    }
    toast(`Precio ajustado a ${formatMoney(newCents)} para ${line.name}.`, 'success');
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
    const initialType = state.cashMovementModalType === 'in' ? 'in' : 'out';
    const isOut = initialType === 'out';

    const sessionPayments = (state.payments || []).filter((item) => item.cashSessionId === active.id);
    const sessionMovements = (state.cashMovements || []).filter((item) => item.cashSessionId === active.id);
    const cashCollected = sessionPayments.filter((item) => item.method === 'cash').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
    const cashIn = sessionMovements.filter((item) => item.type === 'in').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
    const cashOut = sessionMovements.filter((item) => item.type === 'out').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
    const expectedCashCents = Number(active.openingCents || 0) + cashCollected + cashIn - cashOut;

    const cats = isOut ? CASH_MOVEMENT_CATEGORIES.out : CASH_MOVEMENT_CATEGORIES.in;
    const presets = isOut ? [50, 100, 200, 500, 1000, 2000] : [200, 500, 1000, 2000, 5000];
    const defaultCat = cats[0]?.label || 'General';

    return `
      <div class="modal-backdrop" data-modal-close>
        <article class="modal-card" style="max-width:480px;" data-modal-card>
          <header>
            <div>
              <span class="eyebrow">Control de Caja & Gastos</span>
              <h2 id="cash-movement-title">Registrar Movimiento</h2>
            </div>
            <button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button>
          </header>
          <form id="cash-movement-form" class="stack-form" style="padding-top:6px;">
            <div class="cash-type-toggle">
              <button type="button" class="cash-type-btn ${!isOut ? 'active type-in' : ''}" data-movement-type="in">
                <i data-lucide="plus-circle" style="width:18px;height:18px;"></i> Entrada de Dinero
              </button>
              <button type="button" class="cash-type-btn ${isOut ? 'active type-out' : ''}" data-movement-type="out">
                <i data-lucide="minus-circle" style="width:18px;height:18px;"></i> Salida / Gasto
              </button>
            </div>
            <input type="hidden" name="type" id="cash-movement-type" value="${initialType}">
            <input type="hidden" name="category" id="cash-movement-category" value="${escapeHtml(defaultCat)}">

            <!-- Efectivo disponible en gaveta (para salidas) -->
            <div id="cash-movement-available-row" style="display:${isOut ? 'flex' : 'none'};align-items:center;justify-content:space-between;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);padding:8px 12px;border-radius:10px;font-size:0.84rem;">
              <span style="color:#f87171;display:flex;align-items:center;gap:6px;">
                <i data-lucide="wallet" style="width:15px;height:15px;"></i> Efectivo disponible en gaveta:
              </span>
              <strong style="color:#fff;font-size:0.95rem;">${formatMoney(expectedCashCents)}</strong>
            </div>

            <label style="margin-top:2px;">Monto (DOP)
              <input name="amount" id="cash-movement-amount" type="text" placeholder="0.00" value="" data-touch-numpad="money" data-numpad-title="Monto del Movimiento" readonly inputmode="none" required style="font-size:1.45rem;font-weight:700;color:${isOut ? '#f87171' : '#10b981'};cursor:pointer;">
            </label>

            <!-- Montos Rápidos -->
            <div id="cash-movement-presets" class="drawer-outflow-presets">
              ${presets.map(p => `
                <button type="button" class="drawer-outflow-chip" data-set-movement-amount="${p}">
                  RD$ ${p.toLocaleString('es-DO')}
                </button>
              `).join('')}
            </div>

            <!-- Categoría -->
            <label style="margin-bottom:2px;font-size:0.84rem;color:#94a3b8;">Categoría del movimiento
              <div id="cash-movement-cat-grid" style="display:grid;grid-template-columns:repeat(2, 1fr);gap:6px;margin-top:4px;">
                ${cats.map((c, i) => `
                  <button type="button" class="cash-modal-cat-chip ${i === 0 ? 'active' : ''}" data-select-cat="${escapeHtml(c.label)}" style="display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:8px;font-size:0.78rem;font-weight:700;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);color:#cbd5e1;cursor:pointer;text-align:left;">
                    <i data-lucide="${c.icon}" style="width:15px;height:15px;color:${c.color};flex-shrink:0;"></i>
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(c.label)}</span>
                  </button>
                `).join('')}
              </div>
            </label>

            <!-- Justificación / Motivo -->
            <label style="margin-bottom:2px;font-size:0.84rem;color:#94a3b8;">Detalle / Justificación
              <input name="reason" id="cash-movement-reason" minlength="3" maxlength="300" placeholder="Ej: Compra de hielo, pago delivery, cambio…" required style="font-size:0.9rem;">
            </label>

            <!-- Opciones extra -->
            <div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
              <label style="display:flex;align-items:center;gap:8px;font-size:0.82rem;color:#94a3b8;cursor:pointer;">
                <input type="checkbox" name="printVoucher" id="cash-movement-print" checked style="width:16px;height:16px;cursor:pointer;">
                <span>Imprimir comprobante térmico (voucher)</span>
              </label>
            </div>

            ${renderPinPadHtml({ idPrefix: 'cash-movement-pin', label: 'Digita tu PIN para autorizar movimiento' })}

            <footer class="modal-actions" style="margin-top:8px;">
              <button type="button" class="button secondary" data-modal-close>Cancelar</button>
              <button class="button ${isOut ? 'danger' : 'primary'}" type="submit" id="cash-movement-submit" style="${isOut ? 'background:#dc2626;border-color:#b91c1c;color:#fff;' : ''}">
                <i data-lucide="${isOut ? 'trending-down' : 'trending-up'}"></i> ${isOut ? 'Registrar Salida' : 'Registrar Entrada'}
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

  let postDrawerTimeout = null;
  function showPostDrawerPrompt() {
    clearTimeout(postDrawerTimeout);
    document.querySelector('.post-drawer-prompt')?.remove();
    if (!state.activeCash) return;

    const promptEl = document.createElement('div');
    promptEl.className = 'post-drawer-prompt';
    promptEl.innerHTML = `
      <span><i data-lucide="wallet" style="width:18px;height:18px;vertical-align:-3px;color:var(--brand-2);display:inline-block;"></i> Gaveta abierta. ¿Se retiró dinero de la caja?</span>
      <button type="button" class="button danger compact" id="post-drawer-outflow-btn" style="background:#dc2626;border-color:#b91c1c;color:#fff;">
        <i data-lucide="trending-down"></i> Registrar Salida
      </button>
      <button type="button" class="icon-button" id="post-drawer-close-btn" style="color:var(--muted);"><i data-lucide="x"></i></button>
    `;
    document.body.appendChild(promptEl);
    iconsRefresh(promptEl);

    promptEl.querySelector('#post-drawer-outflow-btn')?.addEventListener('click', () => {
      promptEl.remove();
      promptDrawerPin('outflow');
    });
    promptEl.querySelector('#post-drawer-close-btn')?.addEventListener('click', () => {
      promptEl.remove();
    });

    postDrawerTimeout = setTimeout(() => {
      promptEl.remove();
    }, 15000);
  }

  function promptDrawerPin(mode = 'open_only') {
    state.drawerModalMode = (typeof mode === 'string' && ['open_only', 'outflow'].includes(mode)) ? mode : 'open_only';
    state.modal = 'drawerPin';
    renderModal();
  }

  function drawerPinModal() {
    const active = state.activeCash;
    let expectedCashCents = 0;
    if (active) {
      const sessionPayments = (state.payments || []).filter((item) => item.cashSessionId === active.id);
      const sessionMovements = (state.cashMovements || []).filter((item) => item.cashSessionId === active.id);
      const cashCollected = sessionPayments.filter((item) => item.method === 'cash').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
      const cashIn = sessionMovements.filter((item) => item.type === 'in').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
      const cashOut = sessionMovements.filter((item) => item.type === 'out').reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
      expectedCashCents = Number(active.openingCents || 0) + cashCollected + cashIn - cashOut;
    }
    const currentMode = state.drawerModalMode || 'open_only';

    return `
      <div class="modal-backdrop" data-modal-close>
        <article class="modal-card" style="max-width:480px;" data-modal-card>
          <header>
            <div>
              <span class="eyebrow">Seguridad y Control de Caja</span>
              <h2><i data-lucide="wallet" style="width:20px;height:20px;display:inline-block;vertical-align:-3px;color:var(--brand-2);"></i> Gaveta de Dinero</h2>
            </div>
            <button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button>
          </header>
          <form id="drawer-pin-form" class="stack-form" style="padding-top:8px;">
            <div class="drawer-mode-tabs" role="tablist">
              <button type="button" class="drawer-mode-btn ${currentMode === 'open_only' ? 'active' : ''}" data-drawer-tab="open_only">
                <i data-lucide="unlock"></i> Solo abrir gaveta
              </button>
              <button type="button" class="drawer-mode-btn ${currentMode === 'outflow' ? 'active outflow' : ''}" data-drawer-tab="outflow">
                <i data-lucide="trending-down"></i> Salida / Gasto
              </button>
            </div>
            <input type="hidden" name="drawerMode" id="drawer-mode-input" value="${currentMode}">

            <p style="margin:0 0 10px; font-size:.82rem; color:var(--muted);">
              Ingresa el PIN de <strong>${escapeHtml(user.displayName || user.username)}</strong> para autorizar. Toda apertura queda registrada con fecha y hora del servidor.
            </p>

            <!-- Modo 1: Solo abrir gaveta -->
            <div id="drawer-open-only-section" style="${currentMode === 'open_only' ? '' : 'display:none;'}">
              <label style="margin-bottom:6px;">Motivo de apertura
                <select name="reason" id="drawer-pin-reason" style="width:100%;">
                  <option value="Dar cambio / Sencillo">Dar cambio / Sencillo</option>
                  <option value="Auditoría / Arqueo de efectivo">Auditoría / Arqueo de efectivo</option>
                  <option value="Apertura manual por revisión">Apertura manual por revisión</option>
                  <option value="Ingreso de efectivo / Fondo">Ingreso de efectivo / Fondo</option>
                </select>
              </label>
            </div>

            <!-- Modo 2: Salida de Efectivo / Gasto -->
            <div id="drawer-outflow-section" style="${currentMode === 'outflow' ? '' : 'display:none;'}">
              <div class="drawer-outflow-panel">
                ${active ? `
                  <div class="drawer-available-box">
                    <span>Efectivo disponible en caja:</span>
                    <strong>${formatMoney(expectedCashCents)}</strong>
                  </div>
                ` : `
                  <div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:8px 12px;font-size:0.82rem;color:#f87171;">
                    <i data-lucide="alert-triangle" style="width:15px;height:15px;display:inline-block;vertical-align:-2px;"></i>
                    Atención: No hay una caja abierta. Abre turno de caja para registrar salidas.
                  </div>
                `}

                <label style="margin-bottom:2px;">Monto a retirar (RD$)
                  <input name="amount" id="drawer-outflow-amount" type="text" placeholder="0.00" value="" data-touch-numpad="money" data-numpad-title="Monto a Retirar" readonly inputmode="none" style="font-size:1.35rem;font-weight:700;color:#f87171;cursor:pointer;">
                </label>

                <div class="drawer-outflow-presets">
                  <button type="button" class="drawer-outflow-chip" data-set-outflow="50">RD$ 50</button>
                  <button type="button" class="drawer-outflow-chip" data-set-outflow="100">RD$ 100</button>
                  <button type="button" class="drawer-outflow-chip" data-set-outflow="200">RD$ 200</button>
                  <button type="button" class="drawer-outflow-chip" data-set-outflow="500">RD$ 500</button>
                  <button type="button" class="drawer-outflow-chip" data-set-outflow="1000">RD$ 1,000</button>
                  <button type="button" class="drawer-outflow-chip" data-set-outflow="2000">RD$ 2,000</button>
                </div>

                <label style="margin-top:6px;margin-bottom:2px;">Categoría del gasto
                  <input type="hidden" name="category" id="drawer-outflow-category" value="Pago de Servicio">
                  <div class="drawer-categories-grid">
                    <button type="button" class="drawer-category-chip active" data-category="Pago de Servicio"><i data-lucide="zap"></i> Servicio</button>
                    <button type="button" class="drawer-category-chip" data-category="Reparación"><i data-lucide="wrench"></i> Reparación</button>
                    <button type="button" class="drawer-category-chip" data-category="Compra / Insumo"><i data-lucide="shopping-cart"></i> Insumos</button>
                    <button type="button" class="drawer-category-chip" data-category="Pago Delivery"><i data-lucide="bike"></i> Delivery</button>
                    <button type="button" class="drawer-category-chip" data-category="Pago Suplidor"><i data-lucide="truck"></i> Suplidor</button>
                    <button type="button" class="drawer-category-chip" data-category="Otro gasto"><i data-lucide="file-text"></i> Otro</button>
                  </div>
                </label>

                <label style="margin-top:4px;margin-bottom:4px;">Justificación / Detalle de la salida
                  <input name="justification" id="drawer-outflow-justification" minlength="3" maxlength="300" placeholder="Ej: Botellón de agua, bombillo, hielo, taxi…" style="font-size:0.9rem;">
                </label>

                <label style="display:flex;align-items:center;gap:8px;font-size:0.83rem;color:#ccc;margin-top:2px;cursor:pointer;">
                  <input type="checkbox" name="printVoucher" id="drawer-outflow-print" checked style="width:16px;height:16px;cursor:pointer;">
                  <span>Imprimir comprobante térmico de salida (voucher)</span>
                </label>
              </div>
            </div>

            <!-- PIN Pad -->
            <input id="drawer-pin-input" name="pin" type="password" inputmode="none" pattern="[0-9]{6}" maxlength="6" placeholder="" required readonly tabindex="-1" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;">
            <div class="pin-slots-container" id="drawer-pin-slots" style="margin-top:6px;">
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
              <button class="button ${currentMode === 'outflow' ? 'danger' : 'primary'}" type="submit" id="drawer-pin-submit" style="${currentMode === 'outflow' ? 'background:#dc2626;border-color:#b91c1c;color:#fff;' : ''}">
                <i data-lucide="${currentMode === 'outflow' ? 'trending-down' : 'key-round'}"></i>
                ${currentMode === 'outflow' ? 'Autorizar y Registrar Salida' : 'Autorizar y Abrir'}
              </button>
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
      tableId:String(data.get('tableId')||''),clientName:String(data.get('clientName')||root.querySelector('#pos-client-name')?.value||''),ncfType:String(data.get('ncfType')||''),clientRnc:String(data.get('posClientRnc')||''),
      notes:String(data.get('notes')||''),cashReceived:String(root.querySelector('#pos-cash-received')?.value||''),
      cardReference:String(data.get('cardReference')||''),transferReference:String(data.get('transferReference')||''),
      fiaoClientId:String(data.get('fiaoClientId')||''),fiaoClientName:String(data.get('fiaoClientName')||''),
      fiaoClientPhone:String(data.get('fiaoClientPhone')||''),fiaoNotes:String(data.get('fiaoNotes')||''),
      fiaoSaveAsClient:data.get('fiaoSaveAsClient') === 'on',
      deliveryDriverId:String(data.get('deliveryDriverId')||''),deliveryDriverName:String(data.get('deliveryDriverName')||''),
      deliveryClientName:String(data.get('deliveryClientName')||''),deliveryPhone:String(data.get('deliveryPhone')||''),
      deliveryAddress:String(data.get('deliveryAddress')||''),
      deliveryChangeFor:String(root.querySelector('#pos-delivery-change-for')?.value||data.get('deliveryChangeFor')||''),
      deliveryFee:String(root.querySelector('#pos-delivery-fee')?.value||data.get('deliveryFee')||''),
      deliveryNotes:String(data.get('deliveryNotes')||''),
      printReceipt:root.querySelector('#pos-print-receipt') ? root.querySelector('#pos-print-receipt').checked : (state.posDraft?.printReceipt !== false),
      advancedOpen:Boolean(root.querySelector('#pos-advanced-details')?.open),
      cashOpen:Boolean(root.querySelector('#pos-cash-panel details')?.open)
    };
    state.posPaymentMethod=String(data.get('paymentMethod')||state.posPaymentMethod||'cash');
  }
  function resetPosDraft(){
    state.loadedOrderId = '';
    state.loadedTableId = '';
    state.loadedOrderRevision = null;
    state.preselectedTableId = '';
    state.posDraft={ printReceipt: true, clientName: '' };state.posSearch='';state.posCategory='Todos';state.posPaymentMethod='cash';state.posDestination='takeout';
    state.posDiscountState={discount:0,discountType:'amount',includeLegalTip:false};
  }
  function filterCards(event){
    const term = (event?.target?.value != null ? event.target.value : (state.posSearch || '')).trim();
    const activeCat = root.querySelector('[data-cat-filter].active')?.dataset.catFilter || 'Todos';
    let visibleCount = 0;
    root.querySelectorAll('#pos-products .product-card').forEach((item) => {
      const cardCat = item.dataset.category || 'General';
      const matchesCat = activeCat === 'Todos' || cardCat === activeCat;
      const score = term ? fuzzyScore(term, item.dataset.search) : 100;
      const matchesQuery = !term || score > 0;
      const isVisible = matchesCat && matchesQuery;
      item.hidden = !isVisible;
      item.style.order = term ? String(-score) : '';
      if (isVisible) visibleCount++;
    });
    const emptyState = root.querySelector('#pos-no-matches');
    if (emptyState) emptyState.hidden = visibleCount > 0;
  }
  function filterDirectory(event){
    const term = (event?.target?.value || '').trim();
    root.querySelectorAll('[data-directory-row]').forEach((item) => {
      item.hidden = term ? !matchesFuzzy(term, item.dataset.search) : false;
    });
  }
  function filterInvoiceRows(){
    const term = (root.querySelector('#invoice-search')?.value || '').trim();
    const status = root.querySelector('#invoice-status-filter')?.value || '';
    root.querySelectorAll('[data-invoice-row]').forEach((item) => {
      const matchesTerm = !term || matchesFuzzy(term, item.dataset.search);
      const matchesStatus = !status || item.dataset.status === status;
      item.hidden = !(matchesTerm && matchesStatus);
    });
  }
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
    refreshScopedIcons(container || root);
  }
  function destroy(){
    destroyed=true;
    for (const type of ['click', 'keydown', 'beforeinput', 'submit']) root.removeEventListener(type, guardOrderSave, true);
    root.removeAttribute('aria-busy');
    remoteControl?.destroy();
    sleepManager.destroy();
    disposePinPad();
    disposePayrollPin();
    disposeUsersPin();
    for (const finish of busyButtons.values()) finish();
    busyButtons.clear();
    updateSafety.setBlocker('application', false);
    updateSafety.setBlocker('sending-order', false);
    if (hardwarePollId) clearInterval(hardwarePollId);
    liveRenderQueue.destroy();
    document.removeEventListener('visibilitychange', flushPendingLiveRender);
    service.destroy();
    window.removeEventListener('online',updateConnection);
    window.removeEventListener('offline',updateConnection);
    window.removeEventListener('elo-scan',handleEloScanEvent);
    window.removeEventListener('elo-msr',handleEloMsrEvent);
    window.removeEventListener('elo-update-status',handleEloUpdateStatus);
    root.innerHTML='';
  }
  function guardOrderSave(event) {
    if (!state.sendingOrder) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'click') toast('Guardando la comanda; espera un momento.', 'info');
  }
  for (const type of ['click', 'keydown', 'beforeinput', 'submit']) root.addEventListener(type, guardOrderSave, true);
  start().catch((error)=>{
    updateSafety.setBlocker('application', false);
    root.innerHTML=`<div class="fatal-state"><h1>No pudimos iniciar el sistema</h1><p>${escapeHtml(error.message)}</p><button class="button primary" data-retry-start>Reintentar</button></div>`;
    root.querySelector('[data-retry-start]')?.addEventListener('click',()=>location.reload());
  });
  return { destroy, state, sleepManager };
}

function initialRoute(user) {
  const allowed = allowedNavigation(user).filter((id) => NAV.some((item) => item[0] === id));
  const hash = (typeof location !== 'undefined' && location.hash) ? location.hash.slice(1) : '';
  const target = hash === 'tables' ? 'pos' : hash;
  return allowed.includes(target) ? target : (allowed[0] || 'pos');
}
function roleLabel(role){return({owner:'Propietario',manager:'Gerencia',cashier:'Caja',waiter:'Camarero',kitchen:'Cocina'})[role]||'Usuario';}
