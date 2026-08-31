import {
  createIcons, BadgeCheck, BadgeDollarSign, Banknote, Barcode, BookOpen, Calculator, Calendar, ChartNoAxesCombined, CreditCard,
  ChefHat, ChevronDown, CircleDollarSign, Clock3, Cpu, Download, Eye, FileCheck2, FileSpreadsheet, Globe, Landmark,
  KeyRound, LayoutDashboard, LogOut, Menu, MessageSquarePlus, MessageSquareWarning, Minus, Monitor, Package, PackageOpen, Pencil,
  Plus, Printer, QrCode, Radio, Receipt, ReceiptText, RefreshCw, Save, ScanBarcode, Search, Send, Settings,
  Sheet, ShieldAlert, ShieldCheck, ShoppingBasket, ShoppingCart, SlidersHorizontal, Smartphone, Sparkles, Trash2, TrendingDown, TrendingUp, Usb, UserPlus,
  Users, Utensils, Volume2, Wallet, WalletCards, Wifi, WifiOff, X
} from 'lucide';
import { can, allowedNavigation, primaryRole } from '../domain/roles.js';
import { calculateDocument, toCents } from '../domain/billing.js';
import { renderCartTotals, renderDashboard, renderKds, renderOrderDrawer, renderPos, renderTables } from '../modules/operations.js';
import { exportReport, renderInvoiceModal, renderInvoices, renderReports } from '../modules/billing.js';
import { renderReceivables, renderFiaoPayModal } from '../modules/receivables.js';
import { renderClientForm, renderClients, renderProductForm, renderProducts } from '../modules/directory.js';
import { renderCash, renderSettings, renderUserForm, renderUsers, renderTerminalDiag, renderAuditLogs } from '../modules/administration.js';
import { escapeHtml, formatMoney } from '../lib/format.js';
import { createOperationId } from '../lib/id.js';
import {
  openCashDrawerHardware, buildInvoiceEscPos, buildInvoicePlainText, buildKitchenEscPos, buildKitchenPlainText,
  buildCashReportEscPos, buildCashReportPlainText, buildPrebillEscPos, buildPrebillPlainText, sendEscPosToPrinter, EscPosBuilder, checkEloNativeServer,
  startEloScanner, stopEloScanner, setVFDMessage, clearVFD, vfdWelcome,
  beepHardware, getHardwareStatus, checkPaperStatus, sendEloCommand
} from '../lib/hardware.js';

const NAV = [
  ['dashboard','layout-dashboard','Resumen'], ['pos','shopping-cart','Punto de venta'], ['tables','utensils','Mesas'],
  ['kds','chef-hat','Cocina KDS'], ['invoices','receipt-text','Facturación'], ['receivables','book-open','Fiao / Por Cobrar'], ['clients','users','Clientes'],
  ['products','package','Productos'], ['cash','wallet-cards','Caja'], ['reports','chart-no-axes-combined','Reportes'],
  ['users','user-plus','Usuarios'], ['audit','shield-check','Auditoría'], ['terminal','cpu','Terminal ELO'], ['settings','settings','Configuración']
];

const icons = {
  BadgeCheck, BadgeDollarSign, Banknote, Barcode, BookOpen, Calculator, Calendar, ChartNoAxesCombined, ChefHat,
  ChevronDown, CircleDollarSign, Clock3, Cpu, CreditCard, Download, Eye, FileCheck2, FileSpreadsheet, Globe, KeyRound, Landmark, LayoutDashboard,
  LogOut, Menu, MessageSquarePlus, MessageSquareWarning, Minus, Monitor, Package, PackageOpen, Pencil, Plus, Printer,
  QrCode, Radio, Receipt, ReceiptText, RefreshCw, Save, ScanBarcode, Search, Send, Settings, Sheet,
  ShieldAlert, ShieldCheck, ShoppingBasket, ShoppingCart, SlidersHorizontal, Smartphone, Sparkles, Trash2, TrendingDown, TrendingUp, Usb, UserPlus, Users,
  Utensils, Volume2, Wallet, WalletCards, Wifi, WifiOff, X
};

export function createApplication({ root, user, service, onLogout, onChangePassword, development = false }) {
  const state = {
    user, settings: {}, route: initialRoute(user), cart: [], selectedOrderId: '', selectedInvoiceId: '', preselectedTableId: '', modal: '',
    hardwareStatus: null, scannerActive: false, checkoutOpening: false, saleInProgress: false, pendingLiveRender: false, pendingPinDestination: '', mobileReportPeriod: 'day', posDiscountState: { discount: 0, discountType: 'amount', includeLegalTip: false }, posDraft: {}, posSearch: '', posCategory: 'Todos',
    products: [], clients: [], tables: [], orders: [], invoices: [], payments: [], cashSessions: [], cashMovements: [], users: [], auditLogs: [], development,
    capabilities: {
      bill: can(user, 'billing:create'), cancelInvoice: can(user, 'billing:cancel'), chargeOrder: can(user, 'orders:charge'),
      createOrder: can(user, 'orders:create'), updateOrder: can(user, 'orders:update'), serveOrder: can(user, 'orders:serve'),
      kitchenOrder: can(user, 'orders:kitchen'), viewKds: can(user, 'kds:view'), manageCatalog: can(user, 'catalog:*'), manageClients: can(user, 'clients:*'), manageUsers: can(user, 'users:manage'),
      cashDrawer: can(user, 'billing:create') || can(user, 'orders:charge') || can(user, 'cash:*')
    }
  };
  let destroyed = false;
  let previousKdsOrders = new Set();
  let hardwarePollId = null;
  let hardwarePollInFlight = false;

  async function start() {
    state.settings = await service.loadSettings();
    // Una sesión de caja representa dinero físico. Nunca se crea por iniciar sesión o
    // reiniciar la terminal: el cajero debe abrirla explícitamente con su fondo inicial.
    service.watchAll({
      products: update('products'), clients: update('clients'), tables: update('tables'), orders: updateOrders,
      invoices: update('invoices'), payments: update('payments'), cashSessions: update('cashSessions'),
      cashMovements: update('cashMovements'), users: update('users'), auditLogs: update('auditLogs')
    });
    render();
    getHardwareStatus().then((status) => {
      if (!destroyed && status?.ok) {
        state.hardwareStatus = status;
        state.scannerActive = Boolean(status.scannerActive);
        renderContent();
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
            renderContent();
          }
        }
      } catch {} finally {
        hardwarePollInFlight = false;
      }
    }, 8000);
  }

  function update(key) { return (items, error) => { if (error) toast(`No se pudo sincronizar ${key}.`, 'danger'); state[key] = items; requestLiveRender(); }; }

  function requestLiveRender() {
    if (destroyed) return;
    const active = document.activeElement;
    const editingField = active && root.contains(active) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
    const modalFormOpen = Boolean(root.querySelector('#modal-root form'));
    if (state.saleInProgress || editingField || modalFormOpen) {
      state.pendingLiveRender = true;
      return;
    }
    state.pendingLiveRender = false;
    renderContent();
  }

  function flushPendingLiveRender() {
    setTimeout(() => {
      if (!state.pendingLiveRender || destroyed) return;
      const active = document.activeElement;
      const stillEditing = active && root.contains(active) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
      if (!stillEditing && !root.querySelector('#modal-root form')) requestLiveRender();
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
    requestLiveRender();
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
    root.innerHTML = `<div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#dashboard" data-route="dashboard">
          <img src="/logo.png" alt="Logo de Los Panitas by Nechy">
          <div><strong>Los Panitas</strong><span>by Nechy · POS</span></div>
        </a>
        <nav>${allowedNavigation(user).map((id) => { const entry=NAV.find((item)=>item[0]===id); return `<button data-route="${id}" class="${state.route===id?'active':''}"><i data-lucide="${entry[1]}"></i><span>${entry[2]}</span></button>`; }).join('')}</nav>
        <div class="sidebar-footer">
          <div class="user-card"><span>${escapeHtml((user.displayName||user.username||'?').charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(user.displayName||user.username)}</strong><small>${roleLabel(primaryRole(user))}</small></div></div>
          ${state.capabilities.cashDrawer ? `<button class="drawer-kick-btn" style="width:100%;justify-content:center;" data-drawer-kick><i data-lucide="wallet"></i> Abrir gaveta</button>` : ''}
          <button class="logout-button" data-password><i data-lucide="key-round"></i> Cambiar contraseña</button>
          <button class="logout-button" data-logout><i data-lucide="log-out"></i> Cerrar sesión</button>
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
        <div id="main-content" class="main-content"></div>
      </main>
      <div id="modal-root"></div>
      <div id="toast-root" class="toast-root" aria-live="assertive"></div>
    </div>`;
    bindShell(); renderContent(); updateConnection();
  }

  function renderContent() {
    if (!root.querySelector('#main-content')) return;
    state.activeCash = activeCash();
    const renderers = {
      dashboard: renderDashboard, pos: renderPos, tables: renderTables, kds: renderKds,
      invoices: renderInvoices, receivables: renderReceivables, clients: renderClients, products: renderProducts,
      cash: renderCash, reports: renderReports, users: renderUsers, audit: renderAuditLogs,
      terminal: () => renderTerminalDiag(), settings: renderSettings
    };
    const renderer = renderers[state.route] || renderDashboard;
    root.querySelector('#main-content').innerHTML = renderer(state);
    renderModal(); bindContent(); iconsRefresh();
    if (state.route === 'terminal') initTerminalDiag();
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
    else if (state.modal === 'quickCash') modalRoot.innerHTML = quickCashModal();
    else if (state.modal === 'drawerPin') modalRoot.innerHTML = drawerPinModal();
    else if (state.modal === 'checkoutPin') modalRoot.innerHTML = checkoutPinModal();
    else if (state.modal === 'setupCheckoutPin') modalRoot.innerHTML = setupCheckoutPinModal();
    else if (state.modal === 'saleSuccess') modalRoot.innerHTML = saleSuccessModal();
    else if (state.modal === 'fiaoPay') modalRoot.innerHTML = renderFiaoPayModal(state.selectedFiaoInvoice, state.activeCash);
    else if (state.modal === 'itemNote') modalRoot.innerHTML = itemNoteModal();
    else if (state.modal === 'quantity') modalRoot.innerHTML = quantityModal();
    else if (state.modal === 'user') modalRoot.innerHTML = renderUserForm(state.editingUser);
    else if (state.modal === 'password') modalRoot.innerHTML = passwordModal();
    else if (state.modal === 'cancelOrder') modalRoot.innerHTML = cancellationModal('order');
    else if (state.modal === 'cancelInvoice') modalRoot.innerHTML = cancellationModal('invoice');
    else modalRoot.innerHTML = '';
    iconsRefresh(); bindModal();
  }

  function bindShell() {
    root.querySelectorAll('[data-route]').forEach((button)=>button.addEventListener('click',()=>route(button.dataset.route)));
    root.querySelector('[data-logout]')?.addEventListener('click', onLogout);
    root.querySelector('[data-password]')?.addEventListener('click',()=>{state.modal='password';renderModal();});
    root.querySelector('[data-menu]')?.addEventListener('click',()=>root.querySelector('.sidebar').classList.toggle('open'));
    root.querySelectorAll('[data-drawer-kick]').forEach((btn)=>btn.addEventListener('click', promptDrawerPin));
    root.querySelectorAll('[data-quick-open-cash]').forEach((btn)=>btn.addEventListener('click', () => { state.modal = 'quickCash'; renderModal(); }));
    window.addEventListener('online', updateConnection); window.addEventListener('offline', updateConnection);
    root.removeEventListener('focusout', flushPendingLiveRender);
    root.addEventListener('focusout', flushPendingLiveRender);

    // Los listeners son estables y se reemplazan al reconstruir la interfaz. Esto evita que
    // cada navegación duplique un escaneo o una lectura de tarjeta.
    window.removeEventListener('elo-scan', handleEloScanEvent);
    window.removeEventListener('elo-msr', handleEloMsrEvent);
    window.addEventListener('elo-scan', handleEloScanEvent);
    window.addEventListener('elo-msr', handleEloMsrEvent);
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
        root.querySelectorAll('#pos-products .product-card').forEach((card) => {
          const cardSearch = (card.dataset.search || '').toLowerCase();
          const cardCat = card.dataset.category || 'General';
          const matchesCat = cat === 'Todos' || cardCat === cat;
          const matchesQuery = !query || cardSearch.includes(query);
          card.hidden = !(matchesCat && matchesQuery);
        });
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
          if (res.paperOut) {
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
    root.querySelector('#pos-checkout-form')?.addEventListener('input', capturePosDraft);
    root.querySelector('#pos-checkout-form')?.addEventListener('change', capturePosDraft);
    root.querySelectorAll('#pos-checkout-form details').forEach((details) => details.addEventListener('toggle', capturePosDraft));
    root.querySelector('#pos-checkout-form [name=tableId], #pos-table-select')?.addEventListener('change', updatePosFields);
    root.querySelector('#pos-cash-received')?.addEventListener('input', updatePosChange);
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
        const panelMap = { cash: '#pos-cash-panel', card: '#pos-card-panel', transfer: '#pos-transfer-panel', credit: '#pos-fiao-panel' };
        const targetPanel = root.querySelector(panelMap[method]);
        if (targetPanel) targetPanel.classList.add('visible');

        // Auto-focus en el campo de efectivo
        if (method === 'cash') {
          setTimeout(() => root.querySelector('#pos-cash-received')?.focus(), 80);
        }

        updatePosSubmitLabel();
        capturePosDraft();
      });
    });

    root.querySelector('#pos-fiao-client-select')?.addEventListener('change', (e) => {
      const nameInput = root.querySelector('#pos-fiao-name');
      if (nameInput && e.target.value) {
        nameInput.value = e.target.value;
        capturePosDraft();
      }
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
    root.querySelector('#cash-movement-form')?.addEventListener('submit',createCashMovement);
    root.querySelector('#settings-form')?.addEventListener('submit',saveSettings);
    root.querySelectorAll('[data-drawer-kick]').forEach((btn)=>btn.addEventListener('click', promptDrawerPin));
    root.querySelectorAll('[data-quick-open-cash]').forEach((btn)=>btn.addEventListener('click', () => { state.modal = 'quickCash'; renderModal(); }));
    root.querySelectorAll('[data-test-drawer]').forEach((btn)=>btn.addEventListener('click', promptDrawerPin));
    root.querySelectorAll('[data-test-print]').forEach((btn)=>btn.addEventListener('click', testPrint));
    root.querySelectorAll('[data-cash-corte-x]').forEach((btn)=>btn.addEventListener('click',()=>printCashSession(btn.dataset.cashCorteX, 'X')));
    root.querySelectorAll('[data-cash-report-print]').forEach((btn)=>btn.addEventListener('click',()=>printCashSession(btn.dataset.cashReportPrint, 'Z')));
    root.querySelectorAll('[data-export]').forEach((button)=>button.addEventListener('click',()=>exportReport(button.dataset.export,state)));
    updatePosFields();
    if (searchInput) filterCards({ target: searchInput });
  }

  function bindModal() {
    const modalRoot = root.querySelector('#modal-root');
    if (!modalRoot) return;

    modalRoot.querySelectorAll('button[data-modal-close], [data-modal-close]:not(.modal-backdrop)').forEach((item) => {
      item.addEventListener('click', (event) => {
        event.stopPropagation();
        closeModal();
      });
    });

    const backdrop = modalRoot.querySelector('.modal-backdrop');
    if (backdrop) {
      const openedAt = Date.now();
      backdrop.addEventListener('click', (event) => {
        if (Date.now() - openedAt < 250) return;
        if (event.target === backdrop) {
          closeModal();
        }
      });
    }
    modalRoot?.querySelector('#product-form')?.addEventListener('submit',saveProduct);
    modalRoot?.querySelector('#client-form')?.addEventListener('submit',saveClient);
    modalRoot?.querySelector('#user-access-form')?.addEventListener('submit',saveUserAccess);
    modalRoot?.querySelector('#password-change-form')?.addEventListener('submit',submitPasswordChange);
    modalRoot?.querySelector('#drawer-pin-update-form')?.addEventListener('submit',submitDrawerPinChange);
    modalRoot?.querySelector('#cancellation-form')?.addEventListener('submit', submitCancellation);
    modalRoot?.querySelector('#setup-checkout-pin-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const pin = String(data.get('pin') || '');
      const confirm = String(data.get('confirmPin') || '');
      if (!/^\d{4}$/.test(pin)) return toast('Elige un PIN de exactamente 4 dígitos.', 'warning');
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
    modalRoot?.querySelector('#quick-cash-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const f = new FormData(event.currentTarget);
      const openingAmount = toCents(f.get('opening') || 0);
      const outcome = await perform(
        () => service.openCashSession({ openingCents: openingAmount, notes: f.get('notes') }),
        'Caja abierta con éxito.',
        closeModal
      );
      if (!outcome.ok) return;
      // La sincronización de Firestore es asíncrona. Mantener la sesión local evita que el
      // siguiente cobro sea rechazado mientras llega el listener en tiempo real.
      state.activeCash = {
        id: outcome.result,
        status: 'open',
        openingCents: openingAmount,
        openedBy: user.uid,
        openedByName: user.displayName || user.username || 'Cajero',
        optimistic: true
      };
      if (state.settings?.autoOpenDrawer !== false) void kickDrawer();
      resumePendingPosSubmit();
    });
    modalRoot?.querySelectorAll('[data-set-opening]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = modalRoot.querySelector('#quick-cash-form [name=opening]');
        if (input) input.value = Number(btn.dataset.setOpening).toFixed(2);
      });
    });
    modalRoot?.querySelector('[data-order-transition]')?.addEventListener('click',(event)=>perform(()=>service.transitionOrder(state.selectedOrderId,event.currentTarget.dataset.orderTransition),'Comanda actualizada.',closeModal));
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

    // Formulario y teclado táctil de PIN para abrir gaveta manual
    const drawerPinForm = modalRoot?.querySelector('#drawer-pin-form');
    if (drawerPinForm) {
      const pinInput = modalRoot.querySelector('#drawer-pin-input');
      const errBox = modalRoot.querySelector('#drawer-pin-error');

      modalRoot.querySelectorAll('.pin-num-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (pinInput && pinInput.value.length < 4) {
            pinInput.value += btn.dataset.pinNum;
            if (errBox) errBox.textContent = '';
          }
        });
      });

      modalRoot.querySelector('.pin-clear-btn')?.addEventListener('click', () => {
        if (pinInput) pinInput.value = '';
        if (errBox) errBox.textContent = '';
      });

      modalRoot.querySelector('.pin-del-btn')?.addEventListener('click', () => {
        if (pinInput) pinInput.value = pinInput.value.slice(0, -1);
        if (errBox) errBox.textContent = '';
      });

      drawerPinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pin = (pinInput?.value || '').trim();
        const reason = modalRoot.querySelector('#drawer-pin-reason')?.value || 'Apertura manual';
        const submitBtn = modalRoot.querySelector('#drawer-pin-submit');
        if (!/^\d{4}$/.test(pin)) {
          if (errBox) errBox.textContent = 'Ingresa tu PIN de 4 dígitos.';
          return;
        }
        try {
          setBusy(submitBtn, true);
          const result = await service.verifyDrawerPin(pin, reason);
          const hardwareResult = await openCashDrawerHardware();
          if (!hardwareResult?.success) throw new Error('PIN correcto, pero la gaveta no respondió. Revisa la conexión de la impresora Star.');
          beepHardware('ok');
          toast(`Gaveta abierta por ${result.user.displayName}.`, 'success');
          closeModal();
        } catch (err) {
          beepHardware('error');
          if (errBox) errBox.textContent = err.message || 'PIN incorrecto.';
          if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
          }
        } finally {
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

      modalRoot.querySelectorAll('[data-chk-pin]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (chkPinInput && chkPinInput.value.length < 4) {
            chkPinInput.value += btn.dataset.chkPin;
            if (chkErrBox) chkErrBox.textContent = '';
          }
        });
      });

      modalRoot.querySelector('#chk-pin-clear')?.addEventListener('click', () => {
        if (chkPinInput) chkPinInput.value = '';
        if (chkErrBox) chkErrBox.textContent = '';
      });

      modalRoot.querySelector('#chk-pin-del')?.addEventListener('click', () => {
        if (chkPinInput) chkPinInput.value = chkPinInput.value.slice(0, -1);
        if (chkErrBox) chkErrBox.textContent = '';
      });

      checkoutPinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (state.saleInProgress) return;
        const pin = (chkPinInput?.value || '').trim();
        if (!/^\d{4}$/.test(pin)) {
          if (chkErrBox) chkErrBox.textContent = 'Digita tu PIN de 4 dígitos.';
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
          }
        } catch (err) {
          beepHardware('error');
          if (chkErrBox) chkErrBox.textContent = err.message || 'PIN incorrecto.';
          if (chkPinInput) {
            chkPinInput.value = '';
            chkPinInput.focus();
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
        if (!amount || amount <= 0) return toast('Ingresa un monto válido.', 'warning');
        if (!/^\d{4}$/.test(pin)) return toast('Digita tu PIN personal de 4 dígitos.', 'warning');
        const amountCents = Math.round(amount * 100);
        const tenderedCents = method === 'cash' ? Math.round(received * 100) : amountCents;

        if (method === 'cash' && tenderedCents < amountCents) {
          return toast('El efectivo recibido es menor al monto a abonar.', 'warning');
        }

        const button = e.submitter || fiaoPayForm.querySelector('button[type="submit"]');
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
            if (state.settings?.autoPrintInvoice) void printInvoice(invoiceId);
          }, 350);
        } catch (err) {
          beepHardware('error');
          toast(err.message, 'danger');
          const pinInput = fiaoPayForm.querySelector('#fiao-pay-pin');
          if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
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
    render();
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

  function addProduct(id){
    capturePosDraft();
    const product=state.products.find((item)=>item.id===id);
    if(!product)return;
    const stock = Number(product.stock || 0);
    if (stock < 1) return toast(`${product.name} está agotado. Actualiza el inventario antes de venderlo.`, 'warning');
    const line=state.cart.find((item)=>item.productId===id);
    if(line) {
      if (line.quantity >= Math.min(stock, 999)) return toast(`No hay más existencia disponible de ${product.name}.`, 'warning');
      line.quantity+=1;
    }
    else state.cart.push({productId:id,name:product.name,quantity:1,unitPriceCents:product.priceCents,taxRate:product.taxRate||0,notes:''});
    renderContent();
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
    renderContent();
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
    const labels = root.querySelectorAll('#pos-submit-label, .mobile-pos-charge span');
    labels.forEach((label) => {
      if (tableId) {
        label.textContent = 'Enviar comanda a cocina';
      } else if (method === 'credit') {
        label.textContent = `Registrar Fiao ${formatMoney(totals.totalCents)}`;
      } else {
        label.textContent = `Cobrar ${formatMoney(totals.totalCents)}`;
      }
    });
  }

  async function submitPos(event){
    if (event && event.preventDefault) event.preventDefault();
    if (state.saleInProgress || state.checkoutOpening) return toast('El cobro anterior todavía se está procesando.', 'warning');
    if(!state.cart.length)return toast('Agrega al menos un producto a la cuenta.', 'warning');
    const formElement = root.querySelector('#pos-checkout-form');
    const form = formElement ? new FormData(formElement) : new FormData();
    const tableId = form.get('tableId') || root.querySelector('#pos-table-select')?.value || '';
    const documentType = form.get('documentType') || 'invoice';
    if(!tableId&&!state.capabilities.bill)return toast('Selecciona una mesa para enviar la comanda.','danger');

    const discountVal = Number(form.get('posDiscountValue') || state.posDiscountState?.discount || 0);
    const discountType = form.get('posDiscountType') || state.posDiscountState?.discountType || 'amount';
    const includeLegalTip = form.get('posIncludeLegalTip') === 'on' || Boolean(state.posDiscountState?.includeLegalTip);
    state.posDiscountState = { discount: discountVal, discountType, includeLegalTip };

    const totals = calculateDocument(state.cart, state.posDiscountState);
    const method=form.get('paymentMethod')||'cash';
    const isCredit=method==='credit';

    const clientName = isCredit
      ? String(form.get('fiaoClientName') || '').trim()
      : String(form.get('clientName') || 'Consumidor final').trim();

    if (isCredit && (!clientName || clientName === 'Consumidor final')) {
      return toast('Escribe el nombre de la persona que se lleva el fiao.', 'warning');
    }

    const rawCashReceived = root.querySelector('#pos-cash-received')?.value;
    let cashReceivedCents = rawCashReceived ? Math.round(Number(rawCashReceived) * 100) : totals.totalCents;

    if (!tableId && method === 'cash' && cashReceivedCents < totals.totalCents) {
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

    // El PIN de cuatro dígitos es el único paso de autorización para una venta rápida.
    // Si no existe un turno, el mismo PIN abre la caja con fondo inicial de RD$0.00.
    state.pendingPosPayload = {
      items: state.cart.map(i => ({ ...i })),
      method,
      reference,
      totals,
      tenderedCents: method === 'cash' ? cashReceivedCents : 0,
      clientName: clientName || 'Consumidor final',
      clientRnc,
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
      const docPayload = {
        requestId: payload.requestId,
        documentType: 'invoice',
        clientName: payload.clientName,
        clientRnc: payload.clientRnc,
        notes: payload.notes,
        items: payload.items,
        discount: payload.discount,
        discountType: payload.discountType,
        includeLegalTip: payload.includeLegalTip,
        ncfType: payload.ncfType,
        tableId: payload.tableId,
        cashierId: employee.id,
        cashierName: employee.displayName,
        payment: {
          method: payload.method,
          reference: payload.reference || '',
          amountCents: isCredit ? 0 : payload.totals.totalCents,
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
        clientName: payload.clientName,
        clientRnc: payload.clientRnc,
        subtotalCents: payload.totals.subtotalCents,
        taxCents: payload.totals.taxCents,
        discountCents: payload.totals.discountCents || 0,
        tipCents: payload.totals.tipCents || 0,
        totalCents: payload.totals.totalCents,
        paidCents: isCredit ? 0 : payload.totals.totalCents,
        tenderedCents: payload.tenderedCents,
        changeCents,
        method: payload.method,
        reference: payload.reference || '',
        cashierName: employee.displayName,
        items: payload.items,
        createdAt: new Date()
      };
      state.pendingPosPayload = null;
      state.pendingPosSubmit = null;
      state.cart = [];
      resetPosDraft();
      state.modal = 'saleSuccess';
      beepHardware('ok').catch(() => {});
      setVFDMessage('GRACIAS POR SU VISITA', 'VUELVA PRONTO!').catch(() => {});

      // Periféricos no bloquean la interfaz ni alteran un cobro ya registrado. Los avisos
      // son claros para que el cajero pueda reimprimir desde la pantalla de confirmación.
      const shouldOpenDrawer = payload.method === 'cash' && state.settings?.autoOpenDrawer !== false;
      const shouldPrint = state.settings?.autoPrintInvoice !== false;
      // Dejar que el navegador pinte primero la confirmación. En la APK antigua el puente
      // nativo es síncrono y un trabajo USB no debe congelar el botón de cobro.
      setTimeout(() => {
        if (shouldOpenDrawer) void kickDrawer({ silentFailure: true });
        if (shouldPrint) void printSaleReceipt(state.lastSaleResult, { openDrawer: false });
      }, 0);
      toast(isCredit ? `Fiao registrado a nombre de ${payload.clientName}.` : 'Venta registrada correctamente.', 'success');
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
    const opensDrawer = payload.method === 'cash' && state.settings?.autoOpenDrawer !== false;
    const actionLabel = isCredit ? 'Registrar Fiao' : 'Cobrar Venta';
    const submitLabel = isCredit ? 'Registrar fiao' : opensDrawer ? 'Cobrar y abrir gaveta' : 'Confirmar cobro';
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
            <div style="padding:10px 14px;background:rgba(239,189,105,.1);border:1px solid rgba(239,189,105,.25);border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
              <span>Total a cobrar:</span>
              <strong style="font-size:1.35rem;color:var(--brand-2);">${formatMoney(totals.totalCents)}</strong>
            </div>
            <p style="margin:8px 0 6px; font-size:.82rem; color:var(--muted);text-align:center;">
              ${isCredit ? 'Digita tu PIN de 4 dígitos para registrar la cuenta por cobrar.' : 'Digita tu PIN de 4 dígitos. Si no hay una sesión de caja, este mismo paso la inicia y registra el cobro.'}
            </p>
            <label style="margin-bottom:6px;">
              <input id="checkout-pin-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="••••" required autofocus style="letter-spacing:10px;font-size:1.7rem;text-align:center;font-weight:800;">
            </label>
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
            <p style="margin:0 0 10px;color:var(--muted);font-size:.85rem;">Crea un PIN personal de 4 dígitos. ${forTable ? 'Después volverás al cobro de la mesa para autorizarlo.' : 'Después, cada cobro será: elegir productos → Cobrar → PIN.'}</p>
            <label>PIN de 4 dígitos
              <input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="••••" required autofocus style="letter-spacing:10px;font-size:1.55rem;text-align:center;font-weight:800;">
            </label>
            <label>Confirmar PIN
              <input name="confirmPin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="••••" required style="letter-spacing:10px;font-size:1.55rem;text-align:center;font-weight:800;">
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
    return `
      <div class="modal-backdrop" data-modal-close>
        <article class="modal-card" style="max-width:460px;text-align:center;" data-modal-card>
          <header style="justify-content:center;border-bottom:none;padding-bottom:0;">
            <div style="text-align:center;">
              <div style="width:52px;height:52px;border-radius:50%;background:rgba(63,185,80,.15);color:#3fb950;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;">
                <i data-lucide="badge-check" style="width:32px;height:32px;"></i>
              </div>
              <span class="eyebrow">${isCredit ? 'Fiao Registrado' : 'Venta Completada'}</span>
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
                <span style="font-size:1.15rem;color:#f85149;font-weight:700;">Deuda: ${formatMoney(data.totalCents)}</span>
              </div>
            ` : `
              <div style="background:rgba(255,255,255,.04);border-radius:12px;padding:14px;margin:6px 0 12px;">
                <span style="font-size:0.8rem;color:var(--muted);">Total Cobrado (${data.method === 'card' ? 'Tarjeta / Terminal Azul' : data.method === 'transfer' ? 'Transferencia' : 'Efectivo'})</span>
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
  async function saveClient(event){event.preventDefault();const f=new FormData(event.currentTarget);await perform(()=>service.saveClient({id:f.get('id'),name:f.get('name'),rnc:f.get('rnc'),phone:f.get('phone'),email:f.get('email'),address:f.get('address'),active:f.get('active')==='on'}),'Cliente guardado.',closeModal);}
  async function saveUserAccess(event){event.preventDefault();const f=new FormData(event.currentTarget);if(!f.get('uid')&&f.get('password')!==f.get('passwordConfirm'))return toast('Las contraseñas no coinciden.','danger');await perform(()=>service.saveUserAccess({uid:f.get('uid'),displayName:f.get('displayName'),username:f.get('username'),password:f.get('password'),role:f.get('role'),active:f.get('active')==='on'}),f.get('uid')?'Acceso actualizado.':'Usuario creado correctamente.',closeModal);}
  async function submitPasswordChange(event){event.preventDefault();const f=new FormData(event.currentTarget);if(f.get('newPassword')!==f.get('newPasswordConfirm'))return toast('Las contraseñas nuevas no coinciden.','danger');await perform(()=>onChangePassword(f.get('currentPassword'),f.get('newPassword')),'Contraseña actualizada.',closeModal);}
  async function submitDrawerPinChange(event){event.preventDefault();const f=new FormData(event.currentTarget);if(f.get('drawerPin')!==f.get('drawerPinConfirm'))return toast('Los PINes no coinciden.','danger');await perform(()=>service.saveMyDrawerPin(f.get('drawerPin')),'PIN de gaveta actualizado.',closeModal);}

  async function openCash(event){
    event.preventDefault();
    const f=new FormData(event.currentTarget);
    const outcome = await perform(()=>service.openCashSession({openingCents:toCents(f.get('opening')),notes:f.get('notes')}),'Caja abierta.', closeModal);
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
    const outcome = await perform(()=>service.closeCashSession(sessionId,{closingCents:toCents(f.get('closing')),expectedCents:Number(f.get('expected')),notes:f.get('notes')}),'Caja cerrada.', closeModal);
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
    await perform(()=>service.createCashMovement({
      cashSessionId:state.activeCash.id,
      type:f.get('type'),
      amountCents:toCents(f.get('amount')),
      reason:f.get('reason')
    }),'Movimiento de caja registrado.',()=>form.reset());
  }

  async function saveSettings(event){
    event.preventDefault();
    const f=Object.fromEntries(new FormData(event.currentTarget));
    f.defaultTaxRate=Number(f.defaultTaxRate||0);
    f.autoOpenDrawer = event.currentTarget.elements.autoOpenDrawer?.checked ?? true;
    f.autoPrintInvoice = event.currentTarget.elements.autoPrintInvoice?.checked ?? false;
    f.autoPrintKitchen = event.currentTarget.elements.autoPrintKitchen?.checked ?? false;
    f.enableEloScanner = event.currentTarget.elements.enableEloScanner?.checked ?? false;
    await perform(()=>service.saveSettings(f),'Configuración guardada.');
    state.settings={...state.settings,...f};
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
    const balance=invoice.totalCents-invoice.paidCents;
    if(!/^\d{4}$/.test(pin))return toast('Digita tu PIN personal de 4 dígitos.','warning');
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
      const outcome = await perform(()=>service.recordPayment(invoice.id,{requestId:createOperationId('payment'),amountCents:amount,method,reference:f.get('reference'),tenderedCents:method==='cash'?amount:0,cashSessionId:state.activeCash.id}),'Cobro registrado.');
      if (!outcome.ok) return;
      closeModal();
      setTimeout(() => {
        if(method==='cash' && state.settings?.autoOpenDrawer !== false) void kickDrawer({ silentFailure:true });
        // El listener ya habrá incorporado el pago; si tarda, la factura sigue disponible para reimpresión.
        if(state.settings?.autoPrintInvoice) void printInvoice(invoice.id);
      }, 350);
    } catch(error) {
      beepHardware('error').catch(()=>{});
      toast(error.message || 'No se pudo autorizar el cobro.', 'danger');
      const pinInput=event.currentTarget.querySelector('[name=pin]');
      if(pinInput){pinInput.value='';pinInput.focus();}
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
    if (!/^\d{4}$/.test(pin)) return toast('Digita tu PIN personal de 4 dígitos.', 'warning');
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
        ncf:created.ncf || '', clientName:order.clientName || 'Consumidor final', clientRnc:f.get('clientRnc') || order.clientRnc || '',
        subtotalCents:order.subtotalCents, taxCents:order.taxCents, discountCents:order.discountCents || 0,
        tipCents:order.tipCents || 0, totalCents:order.totalCents, paidCents:method==='credit'?0:order.totalCents,
        tenderedCents:method==='cash'?order.totalCents:0, changeCents:0, method, reference:f.get('reference') || '',
        cashierName:authorized.user.displayName || user.displayName || user.username || 'Cajero', items:order.items, createdAt:new Date()
      };
      state.modal='saleSuccess';
      const openDrawer = method==='cash' && state.settings?.autoOpenDrawer !== false;
      setTimeout(() => {
        if (openDrawer) void kickDrawer({silentFailure:true});
        if (state.settings?.autoPrintInvoice !== false) void printSaleReceipt(state.lastSaleResult,{openDrawer:false});
      },0);
    } catch (error) {
      beepHardware('error');
      toast(error.message || 'No se pudo autorizar el cobro de la mesa.', 'danger');
    } finally {
      state.saleInProgress = false;
      setBusy(button, false);
      renderContent();
    }
  }

  async function kickDrawer({ silentFailure = false } = {}) {
    try {
      const result = await openCashDrawerHardware();
      if (result.success) {
        toast(`Gaveta activada (${result.method}).`, 'success');
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
      invoiceNumber: 'TEST-0001',
      documentType: 'invoice',
      ncf: 'B0200000001',
      clientName: 'Cliente de Prueba ELO',
      subtotalCents: 10000,
      taxCents: 1800,
      totalCents: 11800,
      paidCents: 11800,
      createdAt: new Date(),
      items: [{ name: 'Ticket Térmico 80mm - Los Panitas', quantity: 1, unitPriceCents: 10000 }]
    };
    const b = buildInvoiceEscPos(fake, state.settings, [{ method: 'cash', amountCents: 11800 }], { receivedCents: 20000, changeCents: 8200 });
    const plainText = buildInvoicePlainText(fake, state.settings, [{ method: 'cash', amountCents: 11800 }], { receivedCents: 20000, changeCents: 8200 });
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
    const b = buildInvoiceEscPos(invoice, state.settings, related);
    const plainText = buildInvoicePlainText(invoice, state.settings, related);
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
    const builder = buildInvoiceEscPos(invoice, state.settings, payments, changeInfo);
    const plainText = buildInvoicePlainText(invoice, state.settings, payments, changeInfo);
    const result = await sendEscPosToPrinter(builder, { plainText, openDrawer });
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
        if (statusRes.paperOut) {
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

        // Listar dispositivos USB
        const usbWs = new WebSocket(`ws://127.0.0.1:${eloPort}`);
        const usbRes = await new Promise((resolve) => {
          const t = setTimeout(() => resolve(null), 700);
          usbWs.onopen = () => usbWs.send(JSON.stringify({ cmd: 'listUsb' }));
          usbWs.onmessage = (e) => { clearTimeout(t); try { resolve(JSON.parse(e.data)); } catch { resolve(null); } usbWs.close(); };
          usbWs.onerror = () => { clearTimeout(t); resolve(null); };
        });
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
            if (paperRes.paperOut) {
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
    const b = buildCashReportEscPos(session, state.payments, state.settings, state.cashMovements, mode);
    const plainText = buildCashReportPlainText(session, state.payments, state.settings, state.cashMovements, mode);
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

  function handleQuickCash(val) {
    const input = root.querySelector('#pos-cash-received');
    if (!input) return;
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
              <input name="itemQty" id="item-qty-input" type="number" step="1" min="1" max="999" value="${item.quantity}" style="font-size:1.6rem;text-align:center;font-weight:700;" required autofocus>
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
  function paymentModal(){const invoice=state.invoices.find((item)=>item.id===state.selectedInvoiceId);if(!invoice)return '';const balance=invoice.totalCents-invoice.paidCents;return formModal('payment-form','Registrar cobro',`<div class="payment-amount"><span>Balance pendiente</span><strong>${formatMoney(balance)}</strong></div><label>Monto<input name="amount" type="number" min="0.01" max="${balance/100}" step="0.01" value="${balance/100}" required></label>${paymentFields(false)}<label>PIN personal de 4 dígitos<input name="pin" type="password" inputmode="numeric" autocomplete="off" pattern="[0-9]{4}" minlength="4" maxlength="4" placeholder="• • • •" required><small>Autoriza el cobro y abre una sesión de caja con RD$0.00 si todavía no existe una.</small></label>`,'Autorizar y guardar cobro');}
  function chargeModal(){
    const order=state.orders.find((item)=>item.id===state.selectedOrderId);
    if (!order) return '';
    return formModal('charge-form','Cobrar mesa',`
      <div class="payment-amount"><span>Total de ${escapeHtml(order.tableName)}</span><strong>${formatMoney(order.totalCents)}</strong></div>
      ${paymentFields(true)}
      ${ncfField()}
      <label>RNC / Cédula para B01<input name="clientRnc" maxlength="14" inputmode="numeric" value="${escapeHtml(order.clientRnc || '')}" placeholder="Solo obligatorio para crédito fiscal"></label>
      <label>PIN personal de 4 dígitos
        <input name="pin" type="password" inputmode="numeric" autocomplete="off" pattern="[0-9]{4}" minlength="4" maxlength="4" placeholder="• • • •" required>
        <small>Autoriza el cobro y abre la caja automáticamente si todavía no hay un turno.</small>
      </label>
    `,'Autorizar, cobrar y cerrar');
  }
  function passwordModal(){
    return `<div class="modal-backdrop" data-modal-close><article class="modal-card form-modal" data-modal-card><header><div><span class="eyebrow">Seguridad personal</span><h2>Contraseña y PIN</h2></div><button type="button" class="icon-button" data-modal-close><i data-lucide="x"></i></button></header><div class="stack-form"><form id="password-change-form" class="stack-form"><h3>Contraseña de acceso</h3><label>Contraseña actual<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>Nueva contraseña<input name="newPassword" type="password" minlength="8" autocomplete="new-password" required></label><label>Confirmar nueva contraseña<input name="newPasswordConfirm" type="password" minlength="8" autocomplete="new-password" required></label><button class="button primary" type="submit">Actualizar contraseña</button></form><form id="drawer-pin-update-form" class="stack-form pin-setup-form"><h3>PIN de cobro y gaveta</h3><p class="muted">Este PIN personal de cuatro dígitos autoriza cobros y aperturas manuales de la gaveta desde la terminal.</p><div class="form-grid two"><label>Nuevo PIN<input name="drawerPin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required></label><label>Confirmar PIN<input name="drawerPinConfirm" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required></label></div><button class="button secondary" type="submit"><i data-lucide="key-round"></i> Guardar PIN</button></form></div><footer class="modal-actions"><button type="button" class="button secondary" data-modal-close>Cerrar</button></footer></article></div>`;
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
              <input name="opening" type="number" step="0.01" min="0" value="0.00" required autofocus>
            </label>
            <div class="quick-cash-grid" style="margin:4px 0 12px;">
              <button type="button" class="quick-cash-btn" data-set-opening="0">RD$ 0</button>
              <button type="button" class="quick-cash-btn" data-set-opening="500">RD$ 500</button>
              <button type="button" class="quick-cash-btn" data-set-opening="1000">RD$ 1,000</button>
              <button type="button" class="quick-cash-btn" data-set-opening="2000">RD$ 2,000</button>
            </div>
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
              Ingresa tu PIN numérico personal para autorizar la apertura manual. La acción quedará auditada con tu nombre y hora exacta.
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
            <label style="margin-bottom:8px;">PIN numérico (4 dígitos)
              <input id="drawer-pin-input" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="••••" required autofocus style="letter-spacing:8px;font-size:1.5rem;text-align:center;font-weight:700;">
            </label>
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
  async function perform(task,success,after){try{const result=await task();toast(success,'success');after?.(result);return {ok:true,result};}catch(error){console.error(error);toast(error.message||'No se pudo completar la operación.','danger');return {ok:false,error};}}
  function toast(message,tone='info'){const target=root.querySelector('#toast-root');if(!target)return;const item=document.createElement('div');item.className=`toast ${tone}`;item.textContent=message;target.appendChild(item);setTimeout(()=>item.remove(),4000);}
  function setBusy(button,busy){if(!button)return;button.disabled=busy;button.classList.toggle('loading',busy);button.setAttribute('aria-busy',String(busy));}
  function capturePosDraft(){
    const form=root.querySelector('#pos-checkout-form');
    if(!form)return;
    const data=new FormData(form);
    state.posDraft={
      tableId:String(data.get('tableId')||''),ncfType:String(data.get('ncfType')||''),clientRnc:String(data.get('posClientRnc')||''),
      notes:String(data.get('notes')||''),cashReceived:String(root.querySelector('#pos-cash-received')?.value||''),
      cardReference:String(data.get('cardReference')||''),transferReference:String(data.get('transferReference')||''),
      fiaoClientName:String(data.get('fiaoClientName')||''),advancedOpen:Boolean(root.querySelector('#pos-advanced-details')?.open),
      cashOpen:Boolean(root.querySelector('#pos-cash-panel details')?.open)
    };
    state.posPaymentMethod=String(data.get('paymentMethod')||state.posPaymentMethod||'cash');
  }
  function resetPosDraft(){
    state.posDraft={};state.posSearch='';state.posCategory='Todos';state.posPaymentMethod='cash';
    state.posDiscountState={discount:0,discountType:'amount',includeLegalTip:false};
  }
  function filterCards(event){
    const term=event.target.value.trim().toLowerCase();
    const activeCat = root.querySelector('[data-cat-filter].active')?.dataset.catFilter || 'Todos';
    root.querySelectorAll('#pos-products .product-card').forEach((item) => {
      const cardCat = item.dataset.category || 'General';
      const matchesCat = activeCat === 'Todos' || cardCat === activeCat;
      const matchesQuery = !term || item.dataset.search.includes(term);
      item.hidden = !(matchesCat && matchesQuery);
    });
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
      const panelMap = { cash: '#pos-cash-panel', card: '#pos-card-panel', transfer: '#pos-transfer-panel', credit: '#pos-fiao-panel' };
      root.querySelector(panelMap[method])?.classList.add('visible');
    }
    updatePosSubmitLabel();
  }
  function updateConnection(){const online=navigator.onLine;const banner=root.querySelector('#offline-banner');if(banner)banner.hidden=online;root.querySelector('#connection-indicator')?.classList.toggle('offline',!online);}
  function iconsRefresh(){createIcons({icons,attrs:{'aria-hidden':'true'}});}
  function destroy(){
    destroyed=true;
    if (hardwarePollId) clearInterval(hardwarePollId);
    service.destroy();
    window.removeEventListener('online',updateConnection);
    window.removeEventListener('offline',updateConnection);
    window.removeEventListener('elo-scan',handleEloScanEvent);
    window.removeEventListener('elo-msr',handleEloMsrEvent);
    root.innerHTML='';
  }
  start().catch((error)=>{
    root.innerHTML=`<div class="fatal-state"><h1>No pudimos iniciar el sistema</h1><p>${escapeHtml(error.message)}</p><button class="button primary" data-retry-start>Reintentar</button></div>`;
    root.querySelector('[data-retry-start]')?.addEventListener('click',()=>location.reload());
  });
  return { destroy, state };
}

function initialRoute(user){const allowed=allowedNavigation(user);return allowed.includes(location.hash.slice(1))?location.hash.slice(1):allowed[0]||'dashboard';}
function roleLabel(role){return({owner:'Propietario',manager:'Gerencia',cashier:'Caja',waiter:'Camarero',kitchen:'Cocina'})[role]||'Usuario';}
