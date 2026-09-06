// One keypad owns its listeners and delayed submission for its entire modal lifetime.
export function bindPinPad({ form, input, slots, digits, clear, backspace, submit, error, isBusy = () => false, keyboard = window }) {
  let disposed = false;
  let timer = null;
  const listeners = [];
  const listen = (target, type, handler) => {
    if (!target) return;
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener(type, handler));
  };
  const cancel = () => { clearTimeout(timer); timer = null; };
  if (input && typeof input.setAttribute === 'function') {
    input.setAttribute('readonly', 'true');
    input.setAttribute('inputmode', 'none');
    input.setAttribute('tabindex', '-1');
  }
  if (input && typeof input.addEventListener === 'function') {
    listen(input, 'focus', () => {
      try { input.blur(); } catch (_) {}
    });
  }
  const refresh = () => slots.forEach((slot, index) => slot.classList.toggle('filled', index < input.value.length));
  const authorize = () => {
    cancel();
    if (disposed || !form.isConnected || isBusy() || input.value.length !== 4) return;
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  };
  const edit = (key) => {
    if (disposed || isBusy()) return;
    cancel();
    if (key === 'clear') input.value = '';
    else if (key === 'Backspace') input.value = input.value.slice(0, -1);
    else if (/^[0-9]$/.test(key) && input.value.length < 4) input.value += key;
    if (error) error.textContent = '';
    refresh();
    if (input.value.length === 4) timer = setTimeout(authorize, 120);
  };
  digits.forEach((button) => listen(button, 'click', () => edit(button.dataset.chkPin ?? button.dataset.pinNum)));
  listen(clear, 'click', () => edit('clear'));
  listen(backspace, 'click', () => edit('Backspace'));
  listen(submit, 'click', (event) => { event.preventDefault(); authorize(); });
  listen(keyboard, 'keydown', (event) => {
    if (disposed || !form.isConnected || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    if (event.target !== input && event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (!/^[0-9]$/.test(event.key) && !['Backspace', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Enter') authorize();
    else edit(event.key);
  });
  refresh();
  return () => { disposed = true; cancel(); listeners.forEach((remove) => remove()); };
}
