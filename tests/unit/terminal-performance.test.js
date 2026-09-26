import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotReader } from '../../src/lib/snapshot-reader.js';
import { createRenderQueue } from '../../src/lib/render-queue.js';
import { createClientMemorySelector, getClientMemory } from '../../src/domain/client-memory.js';
import { calculateDocument } from '../../src/domain/billing.js';
import { renderCartTotals } from '../../src/modules/operations.js';
import { MemoryDataService } from '../../src/services/memory-service.js';
import { readFileSync } from 'node:fs';

test('replaceable customer display messages cannot occupy the printer/drawer queue', () => {
  const bridge = readFileSync(new URL('../../android-elo-kiosk/app/src/main/java/com/panitas/pos/EloHardwareBridge.java', import.meta.url), 'utf8');
  for (const method of ['setCustomerDisplayAsync', 'showCustomerWelcome']) {
    assert.match(bridge, new RegExp(`public void ${method}\\([^]*?\\n\\s*displayQueue\\.submit\\(`));
  }
  for (const method of ['openDrawerAsync', 'printTextAsync', 'printBase64Async']) {
    assert.match(bridge, new RegExp(`public void ${method}\\([^]*?\\n\\s*hardwareQueue\\.execute\\(`));
  }
  assert.match(bridge, /displayQueue\.close\(\);\s*displayExecutor\.shutdownNow\(\)/);
});

test('Firestore notifications decode only changes without losing rows, order or old snapshots', () => {
  let decodes = 0;
  const doc = (id, values) => ({ id, data() { decodes++; return { ...values }; } });
  const docs = Array.from({ length: 10000 }, (_, i) => doc(String(i), { totalCents: i }));
  const read = createSnapshotReader();
  const first = read({ docs });
  assert.equal(decodes, 10000);
  const changed = doc('9999', { totalCents: 7500 });
  const secondDocs = [changed, ...docs.slice(0, -1)];
  const second = read({ docs: secondDocs, docChanges: () => [{ type: 'modified', doc: changed }] });
  assert.equal(decodes, 10001, 'One change must not decode 10,000 documents again');
  assert.equal(second.length, 10000);
  assert.equal(second[0].totalCents, 7500);
  assert.equal(first[9999].totalCents, 9999, 'Old snapshots remain intact');
  assert.equal(second[1], first[0], 'Unchanged rows are reused');
  const inserted = doc('new', { totalCents: 200 });
  const third = read({ docs: [inserted, ...docs.slice(1, -1)], docChanges: () => [
    { type: 'removed', doc: changed }, { type: 'removed', doc: docs[0] }, { type: 'added', doc: inserted }
  ] });
  assert.equal(decodes, 10002);
  assert.equal(third.length, 9999);
  assert.deepEqual(third.slice(0, 2).map(d => d.id), ['new', '1']);
  assert.notEqual(read({ docs: [inserted], docChanges: () => [] }), third);
});

test('empty initial snapshots and separate subscriptions never share records', () => {
  const first = createSnapshotReader(), second = createSnapshotReader();
  assert.deepEqual(first({ docs: [] }), []);
  const item = { id: 'one', data: () => ({ name: 'One' }) };
  assert.deepEqual(first({ docs: [item], docChanges: () => [{ type: 'added', doc: item }] }), [{ id: 'one', name: 'One' }]);
  assert.deepEqual(second({ docs: [] }), []);
  assert.deepEqual(first({ docs: [], docChanges: () => [{ type: 'removed', doc: item }] }), []);
});

function renderHarness() {
  const callbacks = new Map();
  let id = 0, blocked = false, count = 0, pending = false, value = 0, renderedValue;
  const queue = createRenderQueue({
    isPaused: () => blocked,
    canRender: () => !blocked,
    render: () => { count++; renderedValue = value; },
    onPendingChange: (next) => { pending = next; },
    schedule: (fn) => { callbacks.set(++id, fn); return id; },
    cancel: (key) => callbacks.delete(key)
  });
  return { queue, callbacks, block: (v) => { blocked = v; }, set: (v) => { value = v; },
    read: () => ({ count, pending, renderedValue }),
    frame: () => { const current = [...callbacks.values()]; callbacks.clear(); current.forEach(fn => fn()); }
  };
}

test('sleep/hidden/editing defers 100 notifications and resumes once with latest data', () => {
  const h = renderHarness();
  h.block(true);
  for (let i = 1; i <= 100; i++) { h.set(i); h.queue.request(); }
  assert.equal(h.callbacks.size, 0);
  assert.equal(h.read().pending, true);
  h.block(false); h.queue.flush(); h.queue.flush();
  assert.equal(h.callbacks.size, 1);
  h.frame();
  assert.deepEqual(h.read(), { count: 1, pending: false, renderedValue: 100 });
});

test('render queue rechecks blockers, cancels redundant frames and never renders after logout', () => {
  const h = renderHarness();
  h.queue.request(); h.block(true); h.frame();
  assert.equal(h.read().count, 0);
  h.block(false); h.queue.flush(); h.queue.clear(); h.frame();
  assert.equal(h.read().count, 0);
  h.queue.request(); h.queue.destroy(); h.queue.flush(); h.queue.request(); h.frame();
  assert.deepEqual(h.read(), { count: 0, pending: false, renderedValue: undefined });
});

test('expensive dirty-form checks run once per frame, never once per notification', () => {
  let frame, checks = 0, editing = true, renders = 0;
  const queue = createRenderQueue({
    canRender: () => { checks++; return !editing; },
    render: () => { renders++; }, schedule: fn => { frame = fn; return 1; }, cancel: () => {}
  });
  for (let i = 0; i < 100; i++) queue.request();
  assert.equal(checks, 0);
  frame(); assert.equal(checks, 1); assert.equal(renders, 0);
  editing = false; queue.flush(); frame();
  assert.equal(checks, 2); assert.equal(renders, 1);
});

test('client cache reuses history but invalidates for payments, cancellations and profile edits', () => {
  const select = createClientMemorySelector();
  const state = { clients: [{ id: 'a', name: 'Ana', phone: '123' }], invoices: [
    { id: 'sale', clientId: 'a', clientName: 'Ana', documentType: 'invoice', status: 'pending', totalCents: 10000, paidCents: 0, createdAt: '2026-09-01' }
  ] };
  const first = select(state);
  for (let i = 0; i < 100; i++) assert.equal(select(state), first);
  state.products = [];
  assert.equal(select(state), first);
  state.invoices = [{ ...state.invoices[0], paidCents: 4000, status: 'partial' }];
  assert.equal(select(state)[0].totalDebtCents, 6000);
  assert.equal(first[0].totalDebtCents, 10000);
  state.invoices = [{ ...state.invoices[0], status: 'cancelled' }];
  assert.equal(select(state)[0].totalDebtCents, 0);
  state.clients = [{ ...state.clients[0], phone: '456' }];
  assert.equal(select(state)[0].phone, '456');
  assert.deepEqual(select(state), getClientMemory(state));
  assert.notEqual(createClientMemorySelector()(state), select(state), 'Never share caches between sessions');
});

test('client history converts each invoice date once and preserves latest contact/debt ordering', () => {
  let dates = 0;
  const invoices = [3, 1, 2].map(day => ({ id: String(day), clientName: 'Ana', clientPhone: String(day),
    createdAt: { toDate: () => { dates++; return new Date(`2026-09-0${day}`); } },
    documentType: 'invoice', status: 'pending', totalCents: 100, paidCents: 0
  }));
  const [client] = getClientMemory({ invoices });
  assert.equal(dates, 3);
  assert.equal(client.phone, '3');
  assert.equal(client.totalDebtCents, 300);
  assert.deepEqual(client.pendingInvoices.map(i => i.id), ['1', '2', '3']);
  assert.deepEqual(invoices.map(i => i.id), ['3', '1', '2']);
});

test('demo publishes fresh collection arrays just like Firestore', async () => {
  const service = new MemoryDataService();
  let state = { clients: [], invoices: [] };
  service.watchAll({ clients: rows => { state.clients = rows; }, invoices: rows => { state.invoices = rows; } });
  const select = createClientMemorySelector();
  assert.equal(select(state).length, 0);
  const before = state.clients;
  await service.saveClient({ name: 'Nueva', phone: '123', active: true });
  assert.notEqual(before, state.clients);
  assert.equal(select(state)[0].name, 'Nueva');
});

test('cart totals reuse the same computed taxes/discount/tip without another calculation', () => {
  const items = [{ productId: 'coffee', name: 'Café', quantity: 2, unitPriceCents: 5000, taxRate: 18 }];
  for (const pricing of [{}, { discount: 10, discountType: 'percent', includeLegalTip: true }, { discount: 100, tipCents: 300 }]) {
    const totals = calculateDocument(items, pricing);
    const expected = renderCartTotals(items, pricing);
    const guardedItems = new Proxy(items, { get(target, key) {
      if (key === 'map') throw new Error('UI must reuse computed totals');
      return Reflect.get(target, key);
    } });
    assert.equal(renderCartTotals(guardedItems, pricing, totals), expected);
  }
});
