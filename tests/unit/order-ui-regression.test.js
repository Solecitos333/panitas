import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderPos } from '../../src/modules/operations.js';

test('mesa cargada conserva el botón explícito para guardar modificaciones', async () => {
  const table = { id: 'mesa-1', name: 'Mesa 1', active: true, currentOrderId: 'o1' };
  const order = { id: 'o1', tableId: table.id, status: 'pending', items: [], totalCents: 0 };
  const html = renderPos({ products: [], cart: [], tables: [table], orders: [order],
    capabilities: { bill: true }, posDestination: 'table', loadedTableId: table.id, loadedOrderId: order.id });
  assert.match(html, /Guardar cambios de mesa/);
  const source = await readFile(new URL('../../src/ui/app.js', import.meta.url), 'utf8');
  const load = source.slice(source.indexOf('function loadTableOrderToCart'), source.indexOf('function releaseLoadedCart'));
  assert.match(load, /state\.posDestination = 'table'/);
  assert.match(load, /state\.loadedOrderRevision = order\.revision/);
  const send = source.slice(source.indexOf('async function sendComandaToTable'), source.indexOf('function updatePosSubmitLabel'));
  assert.match(send, /if \(state\.sendingOrder\) return/);
  assert.match(send, /expectedRevision: state\.loadedOrderRevision/);
  assert.match(send, /finally[\s\S]*state\.sendingOrder = false/);
  assert.match(source, /root\.addEventListener\(type, guardOrderSave, true\)/);
  assert.match(source, /root\.removeEventListener\(type, guardOrderSave, true\)/);
  assert.match(source, /calculateDocument\(order\.items, orderPricing\(order\)\)/);
  assert.match(source, /service\.chargeOrder\(payload\.orderId, \{\s*\.\.\.docPayload\.payment/);
});

test('venta siguiente y limpiar carrito eliminan la referencia de la mesa anterior', async () => {
  const source = await readFile(new URL('../../src/ui/app.js', import.meta.url), 'utf8');
  const reset = source.slice(source.indexOf('function resetPosDraft'), source.indexOf('function filterCards'));
  for (const key of ['loadedOrderId', 'loadedTableId', 'preselectedTableId']) {
    assert.match(reset, new RegExp(`state\\.${key} = ''`));
  }
  assert.match(reset, /state\.loadedOrderRevision = null/);
  const complete = source.slice(source.indexOf('async function completeDirectSale'), source.indexOf('function checkoutPinModal'));
  assert.match(complete, /state\.cart = \[\];\s*resetPosDraft\(\);/);
});
