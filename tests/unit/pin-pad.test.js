import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPinPad } from '../../src/lib/pin-pad.js';
const wait = () => new Promise((resolve) => setTimeout(resolve, 160));
function fixture(keyboard = new EventTarget()) {
  let submissions = 0, busy = false;
  const button = (digit) => Object.assign(new EventTarget(), { dataset: { chkPin: digit } });
  const form = Object.assign(new EventTarget(), { isConnected: true, requestSubmit: () => { submissions++; busy = true; } });
  const input = { value: '' }, submit = button(), clear = button(), backspace = button();
  const digits = Array.from({ length: 10 }, (_, n) => button(String(n)));
  const dispose = bindPinPad({ form, input, slots: [], digits, clear, backspace, submit, keyboard, isBusy: () => busy });
  const key = (key) => keyboard.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key }));
  const click = (target) => target.dispatchEvent(new Event('click', { cancelable: true }));
  return { input, dispose, key, click, clear, submit, digits, form, get submissions() { return submissions; } };
}
test('el cuarto dígito y el botón inmediato envían una sola autorización', async () => {
  const pad = fixture();
  '4826'.split('').forEach(pad.key);
  pad.click(pad.submit);
  await wait();
  assert.equal(pad.submissions, 1);
  pad.dispose();
});
test('cerrar y reabrir el PIN elimina el teclado anterior y su envío pendiente', async () => {
  const keyboard = new EventTarget();
  const old = fixture(keyboard);
  '4826'.split('').forEach(old.key);
  old.dispose();
  const next = fixture(keyboard);
  next.key('5');
  await wait();
  assert.equal(old.submissions, 0);
  assert.equal(next.input.value, '5');
  next.dispose();
});
test('borrar cancela el envío automático y un modal desconectado no autoriza', async () => {
  const pad = fixture();
  '4826'.split('').forEach(pad.key);
  pad.click(pad.clear);
  await wait();
  assert.equal(pad.submissions, 0);
  '4826'.split('').forEach(pad.key);
  pad.form.isConnected = false;
  await wait();
  assert.equal(pad.submissions, 0);
  pad.dispose();
});
