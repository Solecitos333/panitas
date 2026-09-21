import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDeliveryInvoice,
  getClientMemory,
  searchClientMemory,
  getReceivablesMetrics
} from '../../src/domain/client-memory.js';
import { renderReceivables } from '../../src/modules/receivables.js';

test('isDeliveryInvoice identifica correctamente facturas de delivery vs fiao en local', () => {
  // Factura fiao tradicional (en salón o para llevar)
  const fiaoInvoice = {
    id: 'inv_1',
    documentType: 'invoice',
    clientName: 'Pedro Mecanico',
    paymentMethod: 'credit',
    totalCents: 50000,
    paidCents: 0
  };
  assert.equal(isDeliveryInvoice(fiaoInvoice), false, 'Fiao en local no debe ser clasificado como delivery');

  // Factura con chofer asignado
  const deliveryWithDriver = {
    id: 'inv_2',
    clientName: 'Doña Carmen',
    deliveryDriverId: 'driver_pedro',
    deliveryDriverName: 'Pedro Chofer',
    totalCents: 85000,
    paidCents: 0
  };
  assert.equal(isDeliveryInvoice(deliveryWithDriver), true, 'Factura con chofer debe ser delivery');

  // Factura con método de pago contra entrega
  const deliveryCod = {
    id: 'inv_3',
    clientName: 'Carlos Ramirez',
    paymentMethod: 'delivery_cod',
    deliveryAddress: 'Calle 4 #15, Los Alcarrizos',
    totalCents: 65000,
    paidCents: 0
  };
  assert.equal(isDeliveryInvoice(deliveryCod), true, 'Factura delivery_cod debe ser delivery');

  // Factura con destino posDestination delivery
  const deliveryDest = {
    id: 'inv_4',
    clientName: 'Steven Valdez',
    posDestination: 'delivery',
    deliveryAddress: 'Av. Duarte #45',
    totalCents: 120000,
    paidCents: 0
  };
  assert.equal(isDeliveryInvoice(deliveryDest), true, 'Factura posDestination delivery debe ser delivery');
});

test('getClientMemory unifica directorio registrado y facturas históricas con deudas desglosadas', () => {
  const now = new Date();
  const state = {
    clients: [
      {
        id: 'c_rubio',
        name: 'Rubio Ap',
        phone: '809-555-0101',
        address: 'Calle Primera #10',
        creditLimitCents: 50000
      }
    ],
    invoices: [
      // Fiao pendiente para Rubio Ap
      {
        id: 'inv_fiao_1',
        documentType: 'invoice',
        clientName: 'Rubio Ap',
        clientId: 'c_rubio',
        paymentMethod: 'credit',
        totalCents: 35000, // RD$ 350
        paidCents: 0,
        createdAt: now
      },
      // Delivery pendiente para Steven Valdez (no estaba en directorio previo)
      {
        id: 'inv_deliv_1',
        documentType: 'invoice',
        clientName: 'Steven Valdez',
        clientPhone: '829-555-0202',
        deliveryAddress: 'Callejon Los Guandules #8',
        deliveryDriverName: 'Pedro',
        deliveryDriverId: 'drv_1',
        paymentMethod: 'delivery_cod',
        totalCents: 75000, // RD$ 750
        paidCents: 0,
        createdAt: now
      },
      // Consumidor final no debe registrarse en memoria
      {
        id: 'inv_cf',
        documentType: 'invoice',
        clientName: 'Consumidor final',
        totalCents: 20000,
        paidCents: 20000,
        createdAt: now
      }
    ]
  };

  const memory = getClientMemory(state);

  assert.equal(memory.length, 2, 'Debe registrar a Rubio Ap y Steven Valdez, ignorando Consumidor final');

  const rubio = memory.find(c => c.name === 'Rubio Ap');
  assert.ok(rubio, 'Rubio Ap debe estar en memoria activa');
  assert.equal(rubio.totalDebtCents, 35000, 'Rubio debe tener RD$ 350 de deuda total');
  assert.equal(rubio.fiaoDebtCents, 35000, 'Toda la deuda de Rubio es de Fiao en local');
  assert.equal(rubio.deliveryDebtCents, 0, 'Rubio no tiene deuda de delivery');
  assert.equal(rubio.pendingFiaoCount, 1);
  assert.equal(rubio.pendingDeliveryCount, 0);

  const steven = memory.find(c => c.name === 'Steven Valdez');
  assert.ok(steven, 'Steven Valdez debe existir en memoria aunque no estuviera en state.clients');
  assert.equal(steven.phone, '829-555-0202', 'Debe recordar el teléfono de Steven del pedido');
  assert.equal(steven.address, 'Callejon Los Guandules #8', 'Debe recordar la dirección de entrega de Steven');
  assert.equal(steven.totalDebtCents, 75000);
  assert.equal(steven.deliveryDebtCents, 75000, 'La deuda de Steven debe estar clasificada como Delivery');
  assert.equal(steven.fiaoDebtCents, 0);
  assert.equal(steven.pendingDeliveryCount, 1);
});

test('searchClientMemory sugiere clientes por prefijo de nombre, teléfono y dirección', () => {
  const memoryList = [
    {
      name: 'Rubio Ap',
      phone: '809-555-0101',
      address: 'Calle Primera #10, Los Alcarrizos',
      totalDebtCents: 35000,
      fiaoDebtCents: 35000,
      deliveryDebtCents: 0
    },
    {
      name: 'Steven Valdez',
      phone: '829-555-0202',
      address: 'Av. Las Palmas #50',
      totalDebtCents: 75000,
      fiaoDebtCents: 0,
      deliveryDebtCents: 75000
    },
    {
      name: 'Carmen Sanchez',
      phone: '809-555-9999',
      address: 'Residencial Don Juan',
      totalDebtCents: 0,
      fiaoDebtCents: 0,
      deliveryDebtCents: 0
    }
  ];

  // Búsqueda por prefijo de nombre
  const res1 = searchClientMemory(memoryList, 'Rub');
  assert.equal(res1.length, 1);
  assert.equal(res1[0].name, 'Rubio Ap');

  // Búsqueda insensible a mayúsculas
  const res2 = searchClientMemory(memoryList, 'steven');
  assert.equal(res2.length, 1);
  assert.equal(res2[0].name, 'Steven Valdez');

  // Búsqueda por teléfono
  const res3 = searchClientMemory(memoryList, '0202');
  assert.equal(res3.length, 1);
  assert.equal(res3[0].name, 'Steven Valdez');

  // Búsqueda por dirección
  const res4 = searchClientMemory(memoryList, 'Alcarrizos');
  assert.equal(res4.length, 1);
  assert.equal(res4[0].name, 'Rubio Ap');

  // Búsqueda vacía devuelve array vacío
  assert.equal(searchClientMemory(memoryList, '').length, 0);
});

test('getReceivablesMetrics desglosa montos y clientes entre Fiao y Delivery', () => {
  const invoices = [
    {
      documentType: 'invoice',
      clientName: 'Rubio Ap',
      totalCents: 50000,
      paidCents: 10000, // Saldo 400.00 fiao
      createdAt: new Date()
    },
    {
      documentType: 'invoice',
      clientName: 'Steven Valdez',
      paymentMethod: 'delivery_cod',
      deliveryAddress: 'Sector X',
      totalCents: 80000,
      paidCents: 0, // Saldo 800.00 delivery
      createdAt: new Date()
    }
  ];

  const metrics = getReceivablesMetrics(invoices, [], []);
  assert.equal(metrics.totalPendingCents, 120000);
  assert.equal(metrics.totalFiaoPendingCents, 40000);
  assert.equal(metrics.totalDeliveryPendingCents, 80000);
  assert.equal(metrics.fiaoClientsCount, 1);
  assert.equal(metrics.deliveryClientsCount, 1);
  assert.equal(metrics.allClientsCount, 2);
});

test('renderReceivables muestra la barra de canales y filtra según state.receivablesChannelFilter', () => {
  const now = new Date();
  const state = {
    receivablesTab: 'debts',
    receivablesChannelFilter: 'all',
    invoices: [
      {
        id: 'inv_fiao_1',
        documentType: 'invoice',
        invoiceNumber: 'FAC-001',
        clientName: 'Rubio Ap',
        totalCents: 50000, // RD$ 500
        paidCents: 0,
        createdAt: now,
        items: [{ name: 'Yaroa de Cerdo', quantity: 1, unitPriceCents: 50000 }]
      },
      {
        id: 'inv_deliv_1',
        documentType: 'invoice',
        invoiceNumber: 'FAC-002',
        clientName: 'Steven Valdez',
        deliveryDriverName: 'Pedro Chofer',
        deliveryAddress: 'Calle 5 #12, Centro',
        paymentMethod: 'delivery_cod',
        totalCents: 90000, // RD$ 900
        paidCents: 0,
        createdAt: now,
        items: [{ name: 'Chimi Doble Carne', quantity: 2, unitPriceCents: 45000 }]
      }
    ],
    payments: [],
    clients: []
  };

  // 1. Vista "all" (Todos los Pendientes)
  const htmlAll = renderReceivables(state);
  assert.ok(htmlAll.includes('Todos los Pendientes'), 'Debe renderizar la pestaña de Todos los Pendientes');
  assert.ok(htmlAll.includes('Fiaos en Local'), 'Debe renderizar la pestaña de Fiaos en Local');
  assert.ok(htmlAll.includes('Pedidos por Delivery'), 'Debe renderizar la pestaña de Pedidos por Delivery');
  assert.ok(htmlAll.includes('Rubio Ap'), 'Rubio Ap debe aparecer en todos');
  assert.ok(htmlAll.includes('Steven Valdez'), 'Steven Valdez debe aparecer en todos');
  assert.ok(htmlAll.includes('badge-channel-fiao'), 'Debe contener badge de fiao');
  assert.ok(htmlAll.includes('badge-channel-delivery'), 'Debe contener badge de delivery');

  // 2. Vista filtrada "fiao" (Solo Fiaos en Local)
  const stateFiao = { ...state, receivablesChannelFilter: 'fiao' };
  const htmlFiao = renderReceivables(stateFiao);
  assert.ok(htmlFiao.includes('Rubio Ap'), 'Rubio Ap debe aparecer en canal fiao');
  assert.ok(!htmlFiao.includes('Steven Valdez'), 'Steven Valdez NO debe aparecer en canal fiao');
  assert.ok(htmlFiao.includes('Total Fiaos en Local'), 'El KPI debe reflejar Total Fiaos en Local');

  // 3. Vista filtrada "delivery" (Solo Pedidos por Delivery)
  const stateDelivery = { ...state, receivablesChannelFilter: 'delivery' };
  const htmlDelivery = renderReceivables(stateDelivery);
  assert.ok(!htmlDelivery.includes('Rubio Ap'), 'Rubio Ap NO debe aparecer en canal delivery');
  assert.ok(htmlDelivery.includes('Steven Valdez'), 'Steven Valdez debe aparecer en canal delivery');
  assert.ok(htmlDelivery.includes('Pedro Chofer'), 'Debe mostrar el chofer asignado');
  assert.ok(htmlDelivery.includes('Calle 5 #12, Centro'), 'Debe mostrar la dirección de entrega');
  assert.ok(htmlDelivery.includes('Total Deliveries Pendientes'), 'El KPI debe reflejar Total Deliveries Pendientes');
});

test('renderReceivables no contiene emojis ni caracteres de fuentes no profesionales', () => {
  const emojiRegex = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/u;
  const state = {
    receivablesTab: 'debts',
    receivablesChannelFilter: 'all',
    invoices: [
      {
        id: 'inv_1',
        invoiceNumber: 'FAC-001',
        clientName: 'Juan Perez',
        deliveryAddress: 'Av. Principal #1',
        deliveryDriverName: 'Carlos',
        paymentMethod: 'delivery_cod',
        totalCents: 10000,
        paidCents: 0,
        createdAt: new Date()
      }
    ],
    payments: [],
    clients: []
  };

  const html = renderReceivables(state);
  assert.equal(emojiRegex.test(html), false, 'renderReceivables no debe contener emojis');
  assert.ok(!html.includes('📖'), 'No debe contener emoji de libro');
  assert.ok(!html.includes('🛵'), 'No debe contener emoji de motoneta');
  assert.ok(!html.includes('📍'), 'No debe contener emoji de pin');
  assert.ok(!html.includes('⚠️'), 'No debe contener emoji de advertencia');
});

