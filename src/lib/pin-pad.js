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
    if (disposed || !form.isConnected || isBusy() || input.value.length !== 6) return;
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  };
  const edit = (key) => {
    if (disposed || isBusy()) return;
    cancel();
    if (key === 'clear') input.value = '';
    else if (key === 'Backspace') input.value = input.value.slice(0, -1);
    else if (/^[0-9]$/.test(key) && input.value.length < 6) input.value += key;
    if (error) error.textContent = '';
    refresh();
    if (input.value.length === 6) timer = setTimeout(authorize, 120);
  };
  digits.forEach((button) => listen(button, 'click', () => {
    const val = button.dataset.chkPin ?? button.dataset.pinNum ?? button.dataset.fiaoPin ?? button.dataset.pin ?? button.textContent?.trim();
    edit(val);
  }));
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

export function renderPinPadHtml({
  idPrefix = 'pin',
  name = 'pin',
  label = 'Digita tu PIN de 6 dígitos',
  sublabel = '',
  required = true
} = {}) {
  return `
    <div class="pin-pad-wrapper" id="${idPrefix}-pad-wrapper" style="margin-top:6px;">
      ${label ? `<label style="display:block;margin-bottom:4px;font-size:0.85rem;font-weight:600;color:var(--muted);text-align:center;">${label}</label>` : ''}
      <input id="${idPrefix}-input" name="${name}" type="password" inputmode="none" pattern="[0-9]{6}" maxlength="6" placeholder="" ${required ? 'required' : ''} readonly tabindex="-1" style="position:absolute;opacity:0;pointer-events:none;width:1px;height:1px;">
      <div class="pin-slots-container" id="${idPrefix}-slots">
        <span class="pin-slot" data-slot="0"></span>
        <span class="pin-slot" data-slot="1"></span>
        <span class="pin-slot" data-slot="2"></span>
        <span class="pin-slot" data-slot="3"></span>
        <span class="pin-slot" data-slot="4"></span>
        <span class="pin-slot" data-slot="5"></span>
      </div>
      <div class="pin-pad" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;margin:6px 0 10px;">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" class="button secondary pin-num-btn" data-pin-num="${n}" style="font-size:1.35rem;font-weight:700;padding:11px 0;">${n}</button>`).join('')}
        <button type="button" class="button secondary pin-clear-btn" id="${idPrefix}-clear" style="font-size:.85rem;font-weight:600;padding:11px 0;color:#f85149;">Borrar</button>
        <button type="button" class="button secondary pin-num-btn" data-pin-num="0" style="font-size:1.35rem;font-weight:700;padding:11px 0;">0</button>
        <button type="button" class="button secondary pin-del-btn" id="${idPrefix}-del" style="font-size:1.2rem;font-weight:700;padding:11px 0;">⌫</button>
      </div>
      <div class="pin-error-box" id="${idPrefix}-error" style="color:#f85149;font-size:0.84rem;min-height:18px;margin-bottom:4px;text-align:center;font-weight:600;"></div>
      ${sublabel ? `<small style="display:block;text-align:center;color:var(--muted);font-size:0.78rem;">${sublabel}</small>` : ''}
    </div>
  `;
}
