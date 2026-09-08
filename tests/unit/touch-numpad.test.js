import test from 'node:test';
import assert from 'node:assert/strict';
import { setupTouchNumericInputs, openTouchNumPad, closeTouchNumPad } from '../../src/lib/touch-numpad.js';

test('setupTouchNumericInputs protege campos numéricos contra el teclado virtual de Android', () => {
  // Mock simple de elemento DOM
  const listeners = [];
  const fakeInput = {
    id: 'cash-closing-amount',
    name: 'closing',
    value: '100.00',
    attributes: {},
    style: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    dispatchEvent(ev) { return true; },
    blur() {}
  };

  const fakeContainer = {
    querySelectorAll(selector) {
      return [fakeInput];
    }
  };

  setupTouchNumericInputs(fakeContainer);

  assert.equal(fakeInput.attributes['readonly'], 'true', 'Debe marcar readonly');
  assert.equal(fakeInput.attributes['inputmode'], 'none', 'Debe marcar inputmode none');
  assert.equal(fakeInput.style.cursor, 'pointer', 'Debe tener cursor pointer');
});
