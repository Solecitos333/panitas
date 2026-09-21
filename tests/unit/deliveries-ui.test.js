import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDeliveries, cleanPhoneForWa } from '../../src/modules/deliveries.js';

test('cleanPhoneForWa normaliza números móviles dominicanos para enlace de WhatsApp', () => {
  assert.equal(cleanPhoneForWa('809-555-1234'), '18095551234');
  assert.equal(cleanPhoneForWa('(829) 555-9876'), '18295559876');
  assert.equal(cleanPhoneForWa('18495550000'), '18495550000');
  assert.equal(cleanPhoneForWa(''), '');
});

test('renderDeliveries calcula métricas de dinero en la calle, repartidores y pedidos correctamente', () => {
  const now = new Date();
  const state = {
    deliveriesTab: 'active',
    deliveriesViewMode: 'drivers',
    deliveryDrivers: [
      { id: 'd_pedro', name: 'Pedro Motor', phone: '809-555-1111', vehicle: 'Honda C90', active: true },
      { id: 'd_carlos', name: 'Carlos Pasola', phone: '809-555-2222', vehicle: 'Yamaha Jog', active: true }
    ],
    invoices: [
      {
        id: 'inv_del_1',
        documentType: 'invoice',
        invoiceNumber: 'FAC-D01',
        clientName: 'Mario Lopez',
        deliveryPhone: '809-555-3333',
        deliveryAddress: 'Calle Duarte #15',
        totalCents: 65000,
        paidCents: 0,
        deliveryDriverId: 'd_pedro',
        deliveryDriverName: 'Pedro Motor',
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'in_transit',
        createdAt: now,
        items: [{ name: 'Yaroa de Pollo', quantity: 1, unitPriceCents: 35000 }, { name: 'Chimi Mixto', quantity: 1, unitPriceCents: 30000 }]
      },
      {
        id: 'inv_del_2',
        documentType: 'invoice',
        invoiceNumber: 'FAC-D02',
        clientName: 'Laura Perez',
        deliveryPhone: '809-555-4444',
        deliveryAddress: 'Av. Libertad #80',
        totalCents: 40000,
        paidCents: 0,
        deliveryDriverId: 'd_pedro',
        deliveryDriverName: 'Pedro Motor',
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'in_transit',
        createdAt: now,
        items: [{ name: 'Pechurina Completa', quantity: 1, unitPriceCents: 40000 }]
      },
      {
        id: 'inv_del_3',
        documentType: 'invoice',
        invoiceNumber: 'FAC-D03',
        clientName: 'Kelvin Santos',
        deliveryAddress: 'Residencial Real Apt 2B',
        totalCents: 30000,
        paidCents: 0,
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'in_transit',
        createdAt: now,
        items: [{ name: 'Hamburguesa Doble', quantity: 1, unitPriceCents: 30000 }]
      }
    ]
  };

  const html = renderDeliveries(state);

  // Total en la calle: 650 + 400 + 300 = RD$ 1,350.00
  assert.ok(html.includes('1,350.00'), 'Debe mostrar el dinero en la calle de RD$ 1,350.00');
  // Entregas en camino: 3
  assert.ok(html.includes('3 entrega(s) en camino'), 'Debe mostrar 3 entregas en camino');
  // Repartidores en ruta: 1 (Pedro tiene entregas; Kelvin no tiene chofer)
  assert.ok(html.includes('Repartidores en Ruta'), 'Debe mostrar la métrica de repartidores en ruta');
  // Alerta de Sin Asignar: 1 entrega
  assert.ok(html.includes('Sin Repartidor Asignado'), 'Debe destacar la entrega sin repartidor');
});

test('renderDeliveries muestra los platos/productos en cada tarjeta para saber de qué es cada cuenta', () => {
  const now = new Date();
  const state = {
    deliveriesTab: 'active',
    deliveriesViewMode: 'drivers',
    deliveryDrivers: [
      { id: 'd1', name: 'Pedro Motor', phone: '809-555-1111', active: true }
    ],
    invoices: [
      {
        id: 'inv_food',
        documentType: 'invoice',
        invoiceNumber: 'FAC-FOOD-1',
        clientName: 'Cliente Comida',
        totalCents: 52000,
        paidCents: 0,
        deliveryDriverId: 'd1',
        deliveryDriverName: 'Pedro Motor',
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'in_transit',
        createdAt: now,
        items: [
          { name: 'Yaroa de Res', quantity: 2, notes: 'Sin mayonesa' },
          { name: 'Refresco Coca-Cola', quantity: 1 }
        ]
      }
    ]
  };

  const html = renderDeliveries(state);

  assert.ok(html.includes('Contenido del Pedido:'), 'Debe tener la sección de contenido del pedido');
  assert.ok(html.includes('2x'), 'Debe mostrar la cantidad del plato');
  assert.ok(html.includes('Yaroa de Res'), 'Debe mostrar el nombre del plato');
  assert.ok(html.includes('Sin mayonesa'), 'Debe mostrar la nota de cocina');
  assert.ok(html.includes('Refresco Coca-Cola'), 'Debe mostrar los refrescos o bebidas');
  assert.ok(html.includes('520.00'), 'Debe mostrar el monto a cobrar');
  assert.ok(html.includes('data-delivery-invoice-view="inv_food"'), 'Debe incluir botón con icono de ojo para ver la factura');
});

test('renderDeliveries permite filtrar por repartidor específico o sin asignar', () => {
  const now = new Date();
  const state = {
    deliveriesTab: 'active',
    deliveriesViewMode: 'drivers',
    deliveriesDriverFilter: 'd_carlos',
    deliveryDrivers: [
      { id: 'd_pedro', name: 'Pedro Motor', active: true },
      { id: 'd_carlos', name: 'Carlos Pasola', active: true }
    ],
    invoices: [
      {
        id: 'inv_p',
        documentType: 'invoice',
        invoiceNumber: 'FAC-P01',
        clientName: 'Cliente de Pedro',
        totalCents: 30000,
        paidCents: 0,
        deliveryDriverId: 'd_pedro',
        deliveryDriverName: 'Pedro Motor',
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'in_transit',
        createdAt: now,
        items: [{ name: 'Chimi', quantity: 1 }]
      },
      {
        id: 'inv_c',
        documentType: 'invoice',
        invoiceNumber: 'FAC-C01',
        clientName: 'Cliente de Carlos',
        totalCents: 45000,
        paidCents: 0,
        deliveryDriverId: 'd_carlos',
        deliveryDriverName: 'Carlos Pasola',
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'in_transit',
        createdAt: now,
        items: [{ name: 'Yaroa', quantity: 1 }]
      }
    ]
  };

  // Filtrado por Carlos
  const htmlCarlos = renderDeliveries(state);
  assert.ok(htmlCarlos.includes('Cliente de Carlos'), 'Debe mostrar las entregas de Carlos');
  assert.equal(htmlCarlos.includes('Cliente de Pedro'), false, 'No debe mostrar las entregas de Pedro al filtrar por Carlos');

  // Filtrado por pedidos sin asignar
  state.deliveriesDriverFilter = 'unassigned';
  state.invoices.push({
    id: 'inv_unassigned',
    documentType: 'invoice',
    invoiceNumber: 'FAC-U01',
    clientName: 'Cliente Sin Asignar',
    totalCents: 20000,
    paidCents: 0,
    paymentMethod: 'delivery_cod',
    deliveryStatus: 'in_transit',
    createdAt: now,
    items: [{ name: 'Empanada', quantity: 2 }]
  });

  const htmlUnassigned = renderDeliveries(state);
  assert.ok(htmlUnassigned.includes('Cliente Sin Asignar'), 'Debe mostrar la entrega sin asignar');
  assert.equal(htmlUnassigned.includes('Cliente de Carlos'), false, 'No debe mostrar las entregas de Carlos');
});

test('renderDeliveries filtra inteligentemente por productos consumidos (buscador difuso)', () => {
  const now = new Date();
  const state = {
    deliveriesTab: 'active',
    deliveriesViewMode: 'orders',
    deliveriesSearch: 'pechurinaa', // Con error ortográfico
    invoices: [
      {
        id: 'inv_1',
        documentType: 'invoice',
        invoiceNumber: 'FAC-100',
        clientName: 'Esteban M.',
        totalCents: 40000,
        paidCents: 0,
        deliveryDriverName: 'Pedro Motor',
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'in_transit',
        createdAt: now,
        items: [{ name: 'Pechurina con Papas', quantity: 1 }]
      },
      {
        id: 'inv_2',
        documentType: 'invoice',
        invoiceNumber: 'FAC-200',
        clientName: 'Dario B.',
        totalCents: 30000,
        paidCents: 0,
        deliveryDriverName: 'Carlos Pasola',
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'in_transit',
        createdAt: now,
        items: [{ name: 'Hamburguesa Sencilla', quantity: 1 }]
      }
    ]
  };

  const html = renderDeliveries(state);
  assert.ok(html.includes('Esteban M.'), 'Debe encontrar a Esteban M. porque pidió Pechurina');
  assert.equal(html.includes('Dario B.'), false, 'No debe encontrar a Dario B.');
});

test('renderDeliveries muestra la pestaña de entregas liquidadas hoy', () => {
  const now = new Date();
  const state = {
    deliveriesTab: 'settled',
    invoices: [
      {
        id: 'inv_settled_1',
        documentType: 'invoice',
        invoiceNumber: 'FAC-SETTLED-8',
        clientName: 'Manuel Entregado',
        deliveryAddress: 'Calle San Juan #10',
        totalCents: 80000,
        paidCents: 80000, // Ya pagado / liquidado
        deliveryDriverName: 'Pedro Motor',
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'settled',
        createdAt: now,
        items: [{ name: 'Super Yaroa', quantity: 2 }]
      }
    ]
  };

  const html = renderDeliveries(state);
  assert.ok(html.includes('Entregas Liquidadas e Ingresadas a Caja'), 'Debe mostrar el título de la pestaña de liquidadas');
  assert.ok(html.includes('FAC-SETTLED-8'), 'Debe incluir la factura liquidada');
  assert.ok(html.includes('Manuel Entregado'), 'Debe incluir el cliente');
  assert.ok(html.includes('Pedro Motor'), 'Debe incluir el repartidor que entregó');
  assert.ok(html.includes('800.00'), 'Debe mostrar el total cobrado');
});

test('renderDeliveries renderiza el Quick Driver Deck y tarjetas colapsables cuando hay múltiples repartidores (ej. Erick e Ismael)', () => {
  const now = new Date();
  const state = {
    deliveriesTab: 'active',
    deliveriesViewMode: 'drivers',
    deliveriesDriverFilter: 'all',
    deliveryDrivers: [
      { id: 'd_erick', name: 'Erick', phone: '809-555-1111', vehicle: 'Super Gato 150', active: true },
      { id: 'd_ismael', name: 'Ismael', phone: '809-555-2222', vehicle: 'Honda C50', active: true }
    ],
    invoices: [
      // 2 pedidos para Erick
      {
        id: 'inv_e1',
        documentType: 'invoice',
        invoiceNumber: 'FAC-E01',
        clientName: 'Cliente Erick 1',
        totalCents: 150000,
        paidCents: 0,
        deliveryDriverId: 'd_erick',
        deliveryDriverName: 'Erick',
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'in_transit',
        createdAt: now,
        items: [{ name: 'Yaroa Mixta', quantity: 2 }]
      },
      {
        id: 'inv_e2',
        documentType: 'invoice',
        invoiceNumber: 'FAC-E02',
        clientName: 'Cliente Erick 2',
        totalCents: 50000,
        paidCents: 0,
        deliveryDriverId: 'd_erick',
        deliveryDriverName: 'Erick',
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'in_transit',
        createdAt: now,
        items: [{ name: 'Chimi Pollo', quantity: 1 }]
      },
      // 1 pedido para Ismael
      {
        id: 'inv_i1',
        documentType: 'invoice',
        invoiceNumber: 'FAC-I01',
        clientName: 'Cliente Ismael 1',
        totalCents: 85000,
        paidCents: 0,
        deliveryDriverId: 'd_ismael',
        deliveryDriverName: 'Ismael',
        paymentMethod: 'delivery_cod',
        deliveryStatus: 'in_transit',
        createdAt: now,
        items: [{ name: 'Pechurina', quantity: 1 }]
      }
    ]
  };

  const html = renderDeliveries(state);

  // 1. Quick Driver Deck presente con resumen horizontal arriba
  assert.ok(html.includes('driver-summary-deck'), 'Debe incluir el Quick Driver Deck arriba');
  assert.ok(html.includes('data-deliveries-driver-filter="d_erick"'), 'Debe tener acceso rápido a Erick');
  assert.ok(html.includes('data-deliveries-driver-filter="d_ismael"'), 'Debe tener acceso rápido a Ismael');
  assert.ok(html.includes('2,000.00'), 'Debe mostrar RD$ 2,000.00 para Erick en el deck');
  assert.ok(html.includes('850.00'), 'Debe mostrar RD$ 850.00 para Ismael en el deck');

  // 2. Botón de toggle global en la barra de filtros
  assert.ok(html.includes('data-deliveries-toggle-all'), 'Debe incluir botón para expandir/colapsar todos');

  // 3. Botones de toggle individuales en las tarjetas de chofer
  assert.ok(html.includes('data-toggle-driver-card="d_erick"'), 'Debe tener botón para togglear tarjeta de Erick');
  assert.ok(html.includes('data-toggle-driver-card="d_ismael"'), 'Debe tener botón para togglear tarjeta de Ismael');
  assert.ok(html.includes('Ver 2 pedidos'), 'Debe indicar que Erick tiene 2 pedidos colapsados');
  assert.ok(html.includes('Ver 1 pedidos'), 'Debe indicar que Ismael tiene 1 pedido colapsado');

  // 4. Por defecto con múltiples choferes, las listas están colapsadas (display:none) para que Ismael sea visible inmediatamente sin scroll
  assert.ok(html.includes('driver-invoices-container'), 'Debe incluir el contenedor de pedidos');
  assert.ok(html.includes('style="display:none;'), 'Los pedidos deben iniciar colapsados');
});

test('renderDeliveries expande tarjetas según state.deliveriesAllExpanded o al filtrar por chofer', () => {
  const now = new Date();
  const state = {
    deliveriesTab: 'active',
    deliveriesViewMode: 'drivers',
    deliveriesDriverFilter: 'all',
    deliveriesAllExpanded: true,
    deliveryDrivers: [
      { id: 'd_erick', name: 'Erick', active: true },
      { id: 'd_ismael', name: 'Ismael', active: true }
    ],
    invoices: [
      {
        id: 'inv_e1',
        invoiceNumber: 'FAC-E1',
        totalCents: 50000,
        paidCents: 0,
        deliveryDriverId: 'd_erick',
        deliveryDriverName: 'Erick',
        paymentMethod: 'delivery_cod',
        createdAt: now,
        items: [{ name: 'Yaroa', quantity: 1 }]
      },
      {
        id: 'inv_i1',
        invoiceNumber: 'FAC-I1',
        totalCents: 40000,
        paidCents: 0,
        deliveryDriverId: 'd_ismael',
        deliveryDriverName: 'Ismael',
        paymentMethod: 'delivery_cod',
        createdAt: now,
        items: [{ name: 'Chimi', quantity: 1 }]
      }
    ]
  };

  // 1. Con deliveriesAllExpanded: true -> Todas abiertas
  const htmlAllExpanded = renderDeliveries(state);
  assert.ok(htmlAllExpanded.includes('Colapsar todos'), 'El botón global debe decir Colapsar todos');
  assert.ok(htmlAllExpanded.includes('Ocultar pedidos'), 'Las tarjetas deben decir Ocultar pedidos');
  assert.ok(htmlAllExpanded.includes('style="display:flex;'), 'Los contenedores deben tener display:flex');

  // 2. Filtrado específico por Ismael -> Ismael abierto
  state.deliveriesAllExpanded = false;
  state.deliveriesDriverFilter = 'd_ismael';
  const htmlFilteredIsmael = renderDeliveries(state);
  assert.ok(htmlFilteredIsmael.includes('data-driver-id="d_ismael"'), 'Debe mostrar la tarjeta de Ismael');
  assert.equal(htmlFilteredIsmael.includes('data-driver-id="d_erick"'), false, 'No debe mostrar la tarjeta de Erick al filtrar por Ismael');
  assert.equal(htmlFilteredIsmael.includes('FAC-E1'), false, 'No debe mostrar las facturas de Erick al filtrar por Ismael');
  assert.ok(htmlFilteredIsmael.includes('FAC-I1'), 'Debe mostrar las facturas de Ismael');
  assert.ok(htmlFilteredIsmael.includes('style="display:flex;'), 'Al aislar a Ismael debe estar desplegado');
});
