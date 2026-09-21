import test from 'node:test';
import assert from 'node:assert/strict';
import { createSleepManager } from '../../src/lib/sleep-manager.js';
import { setTerminalSleepMode } from '../../src/lib/hardware.js';

test('createSleepManager en entorno Node (sin window) devuelve un stub seguro que no falla', () => {
  const sm = createSleepManager({
    getTimeoutSeconds: () => 180,
    isBusy: () => false
  });

  assert.equal(typeof sm.start, 'function');
  assert.equal(typeof sm.destroy, 'function');
  assert.equal(typeof sm.sleep, 'function');
  assert.equal(typeof sm.wake, 'function');
  assert.equal(typeof sm.isSleeping, 'function');
  assert.equal(sm.isSleeping(), false);
  assert.doesNotThrow(() => sm.sleep());
  assert.doesNotThrow(() => sm.wake());
  assert.doesNotThrow(() => sm.destroy());
});

test('setTerminalSleepMode interactúa correctamente con window.EloPOS si existe', () => {
  let sleepModeArg = null;
  globalThis.window = {
    EloPOS: {
      setSleepMode: (val) => {
        sleepModeArg = val;
      }
    }
  };

  setTerminalSleepMode(true);
  assert.equal(sleepModeArg, true);

  setTerminalSleepMode(false);
  assert.equal(sleepModeArg, false);

  delete globalThis.window;
});

test('createSleepManager maneja el ciclo de vida y DOM simulado correctamente', () => {
  const elements = new Map();
  const listeners = [];

  const mockOverlay = {
    id: 'pos-sleep-screen',
    className: '',
    style: {},
    classList: {
      classes: new Set(),
      add(cls) { this.classes.add(cls); },
      remove(cls) { this.classes.delete(cls); },
      contains(cls) { return this.classes.has(cls); }
    },
    setAttribute(k, v) { this[k] = v; },
    addEventListener(evt, handler, capture) {
      listeners.push({ target: 'overlay', evt, handler, capture });
    },
    removeEventListener(evt, handler, capture) {
      const idx = listeners.findIndex(l => l.target === 'overlay' && l.evt === evt && l.handler === handler);
      if (idx >= 0) listeners.splice(idx, 1);
    },
    remove() {
      elements.delete('pos-sleep-screen');
    }
  };

  globalThis.document = {
    body: {
      contains: (el) => elements.has(el.id),
      appendChild: (el) => elements.set(el.id, el)
    },
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => {
      if (tag === 'div') return mockOverlay;
      return {};
    }
  };

  const windowListeners = [];
  globalThis.window = {
    addEventListener: (evt, handler, opts) => windowListeners.push({ evt, handler, opts }),
    removeEventListener: (evt, handler, opts) => {
      const idx = windowListeners.findIndex(l => l.evt === evt && l.handler === handler);
      if (idx >= 0) windowListeners.splice(idx, 1);
    }
  };

  let slept = false;
  let woke = false;

  const sm = createSleepManager({
    getTimeoutSeconds: () => 60,
    isBusy: () => false,
    onSleep: () => { slept = true; },
    onWake: () => { woke = true; }
  });

  sm.start();
  assert.ok(elements.has('pos-sleep-screen'), 'El overlay debe ser creado');
  assert.equal(sm.isSleeping(), false);

  // Activación de reposo manual
  sm.sleep();
  assert.equal(sm.isSleeping(), true);
  assert.equal(slept, true);
  assert.ok(mockOverlay.classList.contains('active'), 'Debe tener la clase active');

  // Despertar
  sm.wake();
  assert.equal(sm.isSleeping(), false);
  assert.equal(woke, true);
  assert.ok(!mockOverlay.classList.contains('active'), 'No debe tener la clase active');

  // Destruir
  sm.destroy();
  assert.equal(elements.has('pos-sleep-screen'), false, 'El overlay debe ser removido');

  delete globalThis.document;
  delete globalThis.window;
});

test('createSleepManager previene clics no deseados consumiendo el evento de despertar', () => {
  let eventStopped = false;
  let defaultPrevented = false;
  let immediateStopped = false;

  const mockEvent = {
    preventDefault: () => { defaultPrevented = true; },
    stopPropagation: () => { eventStopped = true; },
    stopImmediatePropagation: () => { immediateStopped = true; }
  };

  const overlayListeners = [];
  const mockOverlay = {
    id: 'pos-sleep-screen',
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {},
    addEventListener: (evt, handler, capture) => {
      overlayListeners.push({ evt, handler, capture });
    },
    removeEventListener: () => {},
    remove: () => {}
  };

  globalThis.document = {
    body: { contains: () => true, appendChild: () => {} },
    getElementById: () => mockOverlay,
    createElement: () => mockOverlay
  };
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  let wakeTriggered = false;
  const sm = createSleepManager({
    getTimeoutSeconds: () => 180,
    onWake: () => { wakeTriggered = true; }
  });

  sm.start();
  sm.sleep();

  const pointerDownListener = overlayListeners.find(l => l.evt === 'pointerdown' && l.capture === true);
  assert.ok(pointerDownListener, 'Debe registrar listener pointerdown en fase capture');

  pointerDownListener.handler(mockEvent);

  assert.equal(eventStopped, true, 'Debe detener la propagación');
  assert.equal(defaultPrevented, true, 'Debe prevenir la acción por defecto');
  assert.equal(immediateStopped, true, 'Debe detener propagación inmediata');
  assert.equal(wakeTriggered, true, 'Debe haber despertado la pantalla');

  sm.destroy();
  delete globalThis.document;
  delete globalThis.window;
});
