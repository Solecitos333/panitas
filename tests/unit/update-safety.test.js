import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeferredRefresh, createFormChangeTracker, createUpdateSafety } from '../../src/lib/update-safety.js';

function clock() {
  let time = 0;
  let callback;
  return {
    options: { now: () => time, schedule: (fn) => { callback = fn; return 1; }, cancel: () => { callback = null; }, idleMs: 30 },
    advance(ms) { time += ms; const task = callback; callback = null; task?.(); }
  };
}

test('una venta, impresión y pulso de gaveta mantienen bloqueada la actualización hasta terminar todos', () => {
  const timer = clock();
  const safety = createUpdateSafety(timer.options);
  const states = [];
  safety.subscribe((busy) => states.push(busy));
  safety.setBlocker('cart', true);
  const finishPrint = safety.beginOperation();
  const finishDrawer = safety.beginOperation();
  safety.setBlocker('cart', false);
  timer.advance(100);
  finishPrint();
  timer.advance(100);
  assert.equal(safety.isBusy(), true);
  finishDrawer();
  timer.advance(29);
  assert.equal(safety.isBusy(), true);
  timer.advance(1);
  assert.equal(safety.isBusy(), false);
  assert.deepEqual(states.filter((value, index) => index === 0 || value !== states[index - 1]), [true, false]);
});

test('la actividad nueva reinicia la espera y un error no deja operaciones bloqueadas', async () => {
  const timer = clock();
  const safety = createUpdateSafety(timer.options);
  safety.subscribe(() => {});
  await assert.rejects(safety.run(async () => { throw new Error('Impresora desconectada'); }));
  timer.advance(20);
  safety.touch();
  timer.advance(20);
  assert.equal(safety.isBusy(), true);
  timer.advance(10);
  assert.equal(safety.isBusy(), false);
});

test('una actualización web se recarga una sola vez y espera cambios pendientes y operaciones nativas', () => {
  const timer = clock();
  const safety = createUpdateSafety(timer.options);
  let reloads = 0;
  let nativeInstalling = true;
  const refresh = createDeferredRefresh({ safety, refresh: () => reloads++, canRefresh: () => !nativeInstalling });
  safety.setBlocker('dirty-form', true);
  refresh.request();
  refresh.request();
  timer.advance(100);
  assert.equal(reloads, 0);
  safety.setBlocker('dirty-form', false);
  timer.advance(30);
  assert.equal(reloads, 0);
  nativeInstalling = false;
  refresh.attempt();
  refresh.request();
  assert.equal(reloads, 1);
  refresh.destroy();
});

test('cambios sin guardar en texto y casillas permanecen pendientes aunque el campo pierda foco', () => {
  const forms = createFormChangeTracker();
  const name = { tagName: 'INPUT', type: 'text', name: 'name', value: 'Los Panitas' };
  const printing = { tagName: 'INPUT', type: 'checkbox', name: 'autoPrintInvoice', checked: true };
  const form = { elements: [name, printing] };
  const root = { querySelectorAll: () => [form] };
  forms.remember(root);
  name.value = 'Nombre editado';
  forms.remember(root); // Status updates must not replace the original baseline.
  assert.equal(forms.isDirty(root), true);
  forms.markSaved(form);
  assert.equal(forms.isDirty(root), false);
  printing.checked = false;
  assert.equal(forms.isDirty(root), true);
  printing.checked = true;
  assert.equal(forms.isDirty(root), false);
});
