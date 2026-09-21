import test from 'node:test';
import assert from 'node:assert/strict';
import { renderClients, clientRow, clientMobileCard } from '../../src/modules/directory.js';
import { buildClientWhatsAppUrl, formatRelativeDate } from '../../src/domain/client-memory.js';
import { formatMoney } from '../../src/lib/format.js';

test('renderClients integra memoria activa mostrando clientes registrados y de facturas', () => {
  const now = new Date();
  const state = {
    clients: [
      {
        id: 'c_juan',
        name: 'Juan Amigo',
        phone: '809-555-0001',
        address: 'Calle Real #1',
        creditLimitCents: 10000,
        active: true
      }
    ],
    invoices: [
      // Fiao para Juan Amigo (RD$ 50.00)
      {
        id: 'inv_1',
        documentType: 'invoice',
        clientName: 'Juan Amigo',
        clientId: 'c_juan',
        paymentMethod: 'credit',
        totalCents: 5000,
        paidCents: 0,
        createdAt: now
      },
      // Fiao en local para Pedro Mecanico (RD$ 3,500.00) - No estaba en state.clients
      {
        id: 'inv_2',
        documentType: 'invoice',
        clientName: 'Pedro Mecanico',
        clientPhone: '829-555-0002',
        clientAddress: 'Taller Los Muchachos, Sector Sur',
        paymentMethod: 'credit',
        totalCents: 350000,
        paidCents: 0,
        createdAt: now
      },
      // Delivery pendiente para Doña Carmen (RD$ 1,200.00) - No estaba en state.clients
      {
        id: 'inv_3',
        documentType: 'invoice',
        clientName: 'Doña Carmen',
        clientPhone: '849-555-0003',
        deliveryAddress: 'Av. Circunvalación #45, Apto 2B',
        paymentMethod: 'delivery_cod',
        posDestination: 'delivery',
        totalCents: 120000,
        paidCents: 0,
        createdAt: now
      },
      // Factura pagada de Consumidor Final (no debe crear cliente en memoria)
      {
        id: 'inv_cf',
        documentType: 'invoice',
        clientName: 'Consumidor final',
        totalCents: 25000,
        paidCents: 25000,
        createdAt: now
      }
    ],
    settings: {
      businessName: 'Los Panitas by Nechy'
    }
  };

  const html = renderClients(state);

  // 1. Métricas de Cartera Total
  assert.ok(html.includes('Cartera Total de Clientes'), 'Debe mostrar el título del KPI de Cartera Total');
  assert.ok(html.includes('<strong>3</strong>'), 'Debe contabilizar 3 clientes únicos en la cartera');
  assert.ok(html.includes('1 en base · 2 en memoria activa'), 'Debe desglosar cuántos registrados y cuántos en memoria');

  // 2. Métricas de Deuda
  assert.ok(html.includes('Con Balance Pendiente'), 'Debe incluir métrica de clientes con balance');
  assert.ok(html.includes('Total en la Calle por Cobrar'), 'Debe incluir métrica de total por cobrar');
  assert.ok(html.includes(`Fiao: ${formatMoney(355000)}`), 'Debe reflejar la deuda de fiao en local acumulada');
  assert.ok(html.includes(`Deliv: ${formatMoney(120000)}`), 'Debe reflejar la deuda de delivery acumulada');

  // 3. Verificación de presencia de cada cliente
  assert.ok(html.includes('Juan Amigo'), 'Juan Amigo debe aparecer en la lista');
  assert.ok(html.includes('Pedro Mecanico'), 'Pedro Mecanico debe aparecer en la lista');
  assert.ok(html.includes('Doña Carmen'), 'Doña Carmen debe aparecer en la lista');
  assert.ok(!html.includes('Consumidor final'), 'Consumidor final no debe figurar en el directorio');

  // 4. Badges de Origen
  assert.ok(html.includes('client-origin-badge registered'), 'Juan debe tener badge de Registrado');
  assert.ok(html.includes('client-origin-badge memory'), 'Pedro y Doña Carmen deben tener badge de Memoria Activa');

  // 5. Botones de Acción Inmediata
  assert.ok(html.includes('data-client-statement="Juan Amigo"'), 'Debe tener botón para estado de cuenta');
  assert.ok(html.includes('data-client-bulk-pay="Pedro Mecanico"'), 'Debe tener botón de cobro/abono masivo');
  assert.ok(html.includes('data-client-to-pos="Doña Carmen"'), 'Debe tener botón para facturar en POS');
  assert.ok(html.includes('data-client-edit="c_juan"'), 'Debe tener botón para editar cliente');
});

test('renderClients respeta filtros táctiles de canal y estado', () => {
  const now = new Date();
  const state = {
    clients: [
      { id: 'c_registrado', name: 'Cliente Registrado Al Día', phone: '809-111-2222', active: true }
    ],
    invoices: [
      {
        id: 'inv_fiao',
        documentType: 'invoice',
        clientName: 'Deudor Fiao',
        paymentMethod: 'credit',
        totalCents: 50000,
        paidCents: 0,
        createdAt: now
      },
      {
        id: 'inv_deliv_1',
        documentType: 'invoice',
        clientName: 'Cliente Delivery',
        posDestination: 'delivery',
        deliveryAddress: 'Calle 5 #10',
        paymentMethod: 'delivery_cod',
        totalCents: 80000,
        paidCents: 0,
        createdAt: now
      },
      {
        id: 'inv_deliv_2',
        documentType: 'invoice',
        clientName: 'Cliente Delivery',
        posDestination: 'delivery',
        deliveryAddress: 'Calle 5 #10',
        paymentMethod: 'delivery_cod',
        totalCents: 60000,
        paidCents: 60000,
        createdAt: now
      }
    ]
  };

  // Filtro Solo Deudores
  const htmlDebt = renderClients({ ...state, clientsFilter: 'debt' });
  assert.ok(htmlDebt.includes('Deudor Fiao'), 'Debe incluir al deudor fiao');
  assert.ok(htmlDebt.includes('Cliente Delivery'), 'Debe incluir al cliente delivery con saldo');
  assert.ok(!htmlDebt.includes('Cliente Registrado Al Día'), 'No debe incluir clientes sin saldo en filtro debt');

  // Filtro Solo Fiao Local
  const htmlFiao = renderClients({ ...state, clientsFilter: 'fiao' });
  assert.ok(htmlFiao.includes('Deudor Fiao'), 'Debe incluir fiao local');
  assert.ok(!htmlFiao.includes('Cliente Delivery'), 'No debe incluir deudor de delivery en filtro fiao');

  // Filtro Solo Delivery
  const htmlDelivery = renderClients({ ...state, clientsFilter: 'delivery' });
  assert.ok(htmlDelivery.includes('Cliente Delivery'), 'Debe incluir al cliente delivery');
  assert.ok(!htmlDelivery.includes('Deudor Fiao'), 'No debe incluir al cliente fiao en filtro delivery');

  // Filtro Frecuentes (Cliente Delivery tiene 2 pedidos)
  const htmlFrequent = renderClients({ ...state, clientsFilter: 'frequent' });
  assert.ok(htmlFrequent.includes('Cliente Delivery'), 'Cliente Delivery tiene 2 compras');
  assert.ok(!htmlFrequent.includes('Deudor Fiao'), 'Deudor Fiao solo tiene 1 compra');

  // Filtro Registrados
  const htmlRegistered = renderClients({ ...state, clientsFilter: 'registered' });
  assert.ok(htmlRegistered.includes('Cliente Registrado Al Día'));
  assert.ok(!htmlRegistered.includes('Deudor Fiao'));
});

test('clientRow y clientMobileCard generan enlaces de WhatsApp contextuales y datos completos', () => {
  const settings = { businessName: 'Los Panitas by Nechy' };
  const clientWithDebt = {
    id: 'c_1',
    name: 'Rubio Ap',
    phone: '809-555-1234',
    address: 'Calle Segunda #14',
    notes: 'Paga quincenas',
    totalDebtCents: 450000, // RD$ 4,500.00
    fiaoDebtCents: 350000,  // RD$ 3,500.00
    deliveryDebtCents: 100000, // RD$ 1,000.00
    creditLimitCents: 300000, // RD$ 3,000.00 (excedido)
    totalOrdersCount: 5,
    lastSeenDate: new Date(),
    isRegisteredClient: true,
    active: true
  };

  const rowHtml = clientRow(clientWithDebt, settings);
  assert.ok(rowHtml.includes('Rubio Ap'));
  assert.ok(rowHtml.includes('tel:18095551234'), 'Enlace de llamada debe estar formateado');
  assert.ok(rowHtml.includes('https://wa.me/18095551234'), 'Enlace de WhatsApp debe estar presente');
  assert.ok(rowHtml.includes('Límite Excedido'), 'Debe alertar cuando la deuda supera el límite de crédito');
  assert.ok(rowHtml.includes(`Fiao: ${formatMoney(350000)}`), 'Debe desglosar deuda fiao');
  assert.ok(rowHtml.includes(`Deliv: ${formatMoney(100000)}`), 'Debe desglosar deuda delivery');
  assert.ok(rowHtml.includes('data-client-to-pos="Rubio Ap"'), 'Debe permitir iniciar pedido en POS');

  const cardHtml = clientMobileCard(clientWithDebt, settings);
  assert.ok(cardHtml.includes('Rubio Ap'));
  assert.ok(cardHtml.includes('Balance Pendiente Total'));
  assert.ok(cardHtml.includes('Supera el límite de crédito fijado'));
  assert.ok(cardHtml.includes('data-client-bulk-pay="Rubio Ap"'));
});

test('buildClientWhatsAppUrl personaliza mensaje con balance y desglose', () => {
  const clientDeudor = {
    name: 'Carlos Jimenez',
    phone: '809-555-7788',
    totalDebtCents: 250000,
    fiaoDebtCents: 150000,
    deliveryDebtCents: 100000
  };

  const url = buildClientWhatsAppUrl(clientDeudor, { businessName: 'Los Panitas' });
  assert.ok(url.startsWith('https://wa.me/18095557788?text='));
  const decodedMsg = decodeURIComponent(url.split('text=')[1]);
  assert.ok(decodedMsg.includes('Carlos Jimenez'));
  assert.ok(decodedMsg.includes('Los Panitas'));
  assert.ok(decodedMsg.includes(formatMoney(250000)));
  assert.ok(decodedMsg.includes(`Fiao: ${formatMoney(150000)}`));
  assert.ok(decodedMsg.includes(`Delivery: ${formatMoney(100000)}`));

  const clientAlDia = {
    name: 'Maria Perez',
    phone: '829-555-9900',
    totalDebtCents: 0
  };
  const urlAlDia = buildClientWhatsAppUrl(clientAlDia, { businessName: 'Los Panitas' });
  const decodedMsgAlDia = decodeURIComponent(urlAlDia.split('text=')[1]);
  assert.ok(decodedMsgAlDia.includes('Maria Perez'));
  assert.ok(decodedMsgAlDia.includes('¿En qué podemos servirle hoy?'));
});

test('formatRelativeDate devuelve expresiones temporales amigables', () => {
  const now = new Date();
  assert.equal(formatRelativeDate(now), 'Hoy');

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  assert.equal(formatRelativeDate(yesterday), 'Ayer');

  const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
  assert.equal(formatRelativeDate(fourDaysAgo), 'Hace 4 días');

  assert.equal(formatRelativeDate(null), 'Sin pedidos');
});

test('renderClients no contiene emojis ni símbolos no profesionales', () => {
  const emojiRegex = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/u;
  const state = {
    clients: [
      {
        id: 'c_1',
        name: 'Cliente Prueba',
        phone: '809-555-1234',
        address: 'Calle Falsa 123',
        creditLimitCents: 10000,
        active: true
      }
    ],
    invoices: [
      {
        id: 'inv_1',
        clientName: 'Cliente Prueba',
        totalCents: 15000,
        paidCents: 0,
        paymentMethod: 'credit',
        createdAt: new Date()
      }
    ]
  };

  const html = renderClients(state);
  assert.equal(emojiRegex.test(html), false, 'renderClients no debe contener emojis');
  assert.ok(!html.includes('📖'), 'No debe contener emoji de libro');
  assert.ok(!html.includes('🛵'), 'No debe contener emoji de moto');
  assert.ok(!html.includes('⚠️'), 'No debe contener emoji de advertencia');
  assert.ok(!html.includes('🛡️'), 'No debe contener emoji de escudo');
});

