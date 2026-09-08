import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopedIcons } from '../../src/lib/scoped-icons.js';
import { formatMoney, formatDate } from '../../src/lib/format.js';
import { renderDashboard } from '../../src/modules/operations.js';
import { setupTouchNumericInputs } from '../../src/lib/touch-numpad.js';

test('icons hydrate only new placeholders in the supplied region and reuse templates', () => {
  let builds = 0;
  function svg() {
    return { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, cloneNode() { return svg(); } };
  }
  const refresh = createScopedIcons({ ShoppingCart: ['svg'], Plus: ['svg'] }, () => { builds++; return svg(); });
  const replacements = [];
  const region = (names) => {
    const pending = names.map(name => ({
      attributes: [{ name: 'data-lucide', value: name }, { name: 'style', value: 'width:16px' }],
      getAttribute: key => key === 'data-lucide' ? name : key === 'class' ? 'custom' : null,
      parentNode: { replaceChild(replacement, original) {
        replacements.push(replacement);
        pending.splice(pending.indexOf(original), 1);
      } }
    }));
    return { querySelectorAll(selector) { assert.equal(selector, 'i[data-lucide]'); return [...pending]; } };
  };
  const cart = region(['shopping-cart', 'plus', 'plus']);
  const sidebar = region(['plus']);
  refresh(cart);
  assert.equal(builds, 2);
  assert.equal(replacements.length, 3);
  refresh(cart);
  assert.equal(replacements.length, 3, 'Already-rendered SVGs must not be replaced');
  refresh(sidebar);
  assert.equal(builds, 2);
  assert.equal(replacements.length, 4);
  assert.equal(replacements[0].attrs.class, 'lucide lucide-shopping-cart custom');
  assert.equal(replacements[0].attrs.style, 'width:16px');
  assert.equal(replacements[0].attrs['aria-hidden'], 'true');
  assert.notEqual(replacements[1], replacements[2], 'Each placeholder gets its own SVG');
  refresh(region(['unknown-icon']));
  assert.equal(builds, 2);
});

test('repeated numeric input setup does not duplicate event handlers; new nodes still work', () => {
  const listeners = [];
  const input = () => ({ style: {}, setAttribute() {}, addEventListener(type) { listeners.push(type); } });
  const first = input();
  const container = { querySelectorAll: () => [first] };
  for (let i = 0; i < 10; i++) setupTouchNumericInputs(container);
  assert.deepEqual(listeners, ['click', 'pointerup', 'touchend']);
  setupTouchNumericInputs({ querySelectorAll: () => [input()] });
  assert.equal(listeners.length, 6);
});

test('native dashboard skips hidden mobile calculations and inventory, web retains them', () => {
  const state = { invoices: [], orders: [], cashSessions: [], payments: [], products: [], user: { uid: 'test' }, capabilities: { manageCatalog: true } };
  const web = renderDashboard(state);
  assert.match(web, /Panel móvil de gestión/);
  assert.match(web, /mobile-inventory-list/);
  const native = renderDashboard({ ...state, terminalMode: true, get payments() { throw new Error('Must not compute hidden mobile payments'); } });
  assert.doesNotMatch(native, /Panel móvil de gestión|mobile-inventory-list/);
  assert.match(native, /Ventas de hoy/);
  assert.match(native, /Comandas que requieren atención/);
});

test('cached money/date formatters preserve currencies, rounding and Dominican timezone', () => {
  for (const currency of ['DOP', 'USD', 'EUR', 'DOP']) {
    for (const cents of [0, 1, 100, -100, 12345678]) {
      assert.equal(formatMoney(cents, currency), new Intl.NumberFormat('es-DO', { style: 'currency', currency }).format(cents / 100));
    }
  }
  const date = new Date('2026-09-08T02:30:00Z');
  for (const withTime of [false, true]) {
    const options = { timeZone: 'America/Santo_Domingo', year: 'numeric', month: 'short', day: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : {}) };
    assert.equal(formatDate(date, withTime), new Intl.DateTimeFormat('es-DO', options).format(date));
    assert.equal(formatDate({ toDate: () => date }, withTime), formatDate(date, withTime));
  }
  assert.equal(formatDate(null), 'Pendiente');
  assert.equal(formatDate('invalid'), 'Pendiente');
});
