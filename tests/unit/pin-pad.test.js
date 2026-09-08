import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPinPad, renderPinPadHtml } from '../../src/lib/pin-pad.js';
const wait = () => new Promise((resolve) => setTimeout(resolve, 160));
test('el formulario muestra seis posiciones y exige seis cifras', () => {
  const html = renderPinPadHtml();
  assert.equal((html.match(/data-slot=/g) || []).length, 6);
  assert.match(html, /maxlength="6"/);
});
test('cuatro cifras no autorizan y se conservan ceros iniciales', async () => {
  const pad = fixture();
  '0012'.split('').forEach(pad.key);
  pad.click(pad.submit);
  await wait();
  assert.equal(pad.submissions, 0);
  '34'.split('').forEach(pad.key);
  await wait();
  assert.equal(pad.input.value, '001234');
  assert.equal(pad.submissions, 1);
  pad.dispose();
});
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
test('el sexto dígito y el botón inmediato envían una sola autorización', async () => {
  const pad = fixture();
  '482601'.split('').forEach(pad.key);
  pad.click(pad.submit);
  await wait();
  assert.equal(pad.submissions, 1);
  pad.dispose();
});
test('cerrar y reabrir el PIN elimina el teclado anterior y su envío pendiente', async () => {
  const keyboard = new EventTarget();
  const old = fixture(keyboard);
  '482601'.split('').forEach(old.key);
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
  '482601'.split('').forEach(pad.key);
  pad.click(pad.clear);
  await wait();
  assert.equal(pad.submissions, 0);
  '482601'.split('').forEach(pad.key);
  pad.form.isConnected = false;
  await wait();
  assert.equal(pad.submissions, 0);
  pad.dispose();
});
