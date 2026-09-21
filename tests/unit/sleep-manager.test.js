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
  assert.equal(typeof sm.reset, 'function');
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

function sleepingTerminal(t, options = {}) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  let now = 0;
  let nextId = 0;
  let attached = false;
  const intervals = new Map();
  const timers = new Map();
  const brightness = [];
  const overlay = Object.assign(new EventTarget(), {
    id: 'pos-sleep-screen', style: {},
    classList: { add() {}, remove() {} },
    setAttribute() {},
    remove() { attached = false; }
  });
  const win = Object.assign(new EventTarget(), { EloPOS: { setSleepMode: (value) => brightness.push(value) } });
  globalThis.window = win;
  globalThis.document = {
    body: { contains: () => attached, appendChild: () => { attached = true; } },
    getElementById: () => attached ? overlay : null,
    createElement: () => overlay
  };
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    timers.set(++nextId, { callback, at: now + delay });
    return nextId;
  });
  t.mock.method(globalThis, 'clearTimeout', (id) => timers.delete(id));
  t.mock.method(globalThis, 'setInterval', (callback) => {
    intervals.set(++nextId, callback);
    return nextId;
  });
  t.mock.method(globalThis, 'clearInterval', (id) => intervals.delete(id));
  const manager = createSleepManager({ getTimeoutSeconds: () => 60, ...options });
  manager.start();
  t.after(() => {
    manager.destroy();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  });
  return {
    manager, win, overlay, brightness, timers, intervals,
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    },
    check() { for (const callback of intervals.values()) callback(); }
  };
}

test('Enter despierta desde un campo enfocado sin enviar el formulario oculto', (t) => {
  const { manager, win, brightness } = sleepingTerminal(t);
  let reachedForm = 0;
  win.addEventListener('keydown', () => { reachedForm++; });
  manager.sleep();
  const sleepingKey = new Event('keydown', { cancelable: true });
  win.dispatchEvent(sleepingKey);
  assert.equal(manager.isSleeping(), false);
  assert.equal(sleepingKey.defaultPrevented, true);
  assert.equal(reachedForm, 0);
  assert.deepEqual(brightness, [true, false]);

  const awakeKey = new Event('keydown', { cancelable: true });
  win.dispatchEvent(awakeKey);
  assert.equal(awakeKey.defaultPrevented, false, 'El teclado normal vuelve a estar disponible');
  assert.equal(reachedForm, 1);
});

test('la suspensión automática espera a que termine una operación de caja', (t) => {
  let busy = true;
  const terminal = sleepingTerminal(t, { isBusy: () => busy });
  terminal.advance(60000);
  terminal.check();
  assert.equal(terminal.manager.isSleeping(), false);
  busy = false;
  terminal.advance(14000);
  terminal.check();
  assert.equal(terminal.manager.isSleeping(), false);
  terminal.advance(1000);
  terminal.check();
  assert.equal(terminal.manager.isSleeping(), true);
});

test('despertares sucesivos cancelan el temporizador anterior y destroy elimina los listeners', (t) => {
  const terminal = sleepingTerminal(t);
  terminal.manager.sleep();
  terminal.manager.wake();
  terminal.advance(100);
  terminal.manager.sleep();
  terminal.manager.wake();
  terminal.advance(250);
  assert.equal(terminal.overlay.style.display, 'flex', 'El temporizador de un despertar anterior no puede ocultar el overlay actual');
  terminal.advance(100);
  assert.equal(terminal.overlay.style.display, 'none');
  terminal.manager.sleep();
  terminal.manager.wake();
  terminal.manager.destroy();
  assert.equal(terminal.timers.size, 0);
  assert.equal(terminal.intervals.size, 0);
  const key = new Event('keydown', { cancelable: true });
  terminal.win.dispatchEvent(key);
  assert.equal(key.defaultPrevented, false);
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
