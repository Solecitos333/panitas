// Universal Touch Numeric Keypad for Touchscreen Terminals (Elo PayPoint Plus 15")
// Replaces Android OS virtual keyboard with dedicated tactile popups.
import { formatMoney } from './format.js';

let activePopup = null;

export function openTouchNumPad({
  targetInput,
  title = 'Ingresar Monto',
  mode = 'money', // 'money' | 'decimal' | 'integer'
  quickChips = [],
  max = null,
  min = 0,
  onConfirm = null
}) {
  closeTouchNumPad();

  if (!targetInput) return;

  // Extraer valor inicial numérico
  let rawVal = String(targetInput.value || '').trim();
  let initialNum = parseFloat(rawVal);
  if (isNaN(initialNum)) initialNum = 0;

  // Buffer de edición
  let currentVal = rawVal && rawVal !== '0' && rawVal !== '0.00' ? rawVal : '';
  let decimalEntered = currentVal.includes('.');

  const backdrop = document.createElement('div');
  backdrop.className = 'touch-numpad-backdrop';
  backdrop.id = 'touch-numpad-modal';
  backdrop.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    z-index: 99999;
    background: rgba(5, 8, 14, 0.82);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    animation: fadeIn 0.15s ease-out;
  `;

  // Pre-generar chips si no se especificaron y es dinero
  let chips = quickChips;
  if (!chips || !chips.length) {
    if (mode === 'money') {
      chips = ['+50', '+100', '+200', '+500', '+1,000', '+2,000'];
    }
  }

  backdrop.innerHTML = `
    <div class="touch-numpad-card" style="
      background: #131822;
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
      border-radius: 20px;
      width: 100%;
      max-width: 420px;
      padding: 20px;
      user-select: none;
      -webkit-user-select: none;
    ">
      <header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div>
          <span style="font-size:0.75rem;font-weight:700;color:var(--brand-2);text-transform:uppercase;letter-spacing:1px;display:block;">Teclado Táctil</span>
          <h3 style="margin:0;font-size:1.15rem;color:#f8fafc;font-weight:800;">${escapeHtml(title)}</h3>
        </div>
        <button type="button" id="numpad-close-btn" class="icon-button" style="width:34px;height:34px;border-radius:8px;border:1px solid var(--line);background:rgba(255,255,255,.05);color:#aaa;cursor:pointer;">✕</button>
      </header>

      <!-- Pantalla de valor en vivo -->
      <div id="numpad-screen" style="
        background: #090d14;
        border: 2px solid var(--brand-2);
        border-radius: 14px;
        padding: 12px 16px;
        text-align: right;
        margin-bottom: 12px;
        box-shadow: inset 0 2px 8px rgba(0,0,0,0.5);
      ">
        <div id="numpad-formatted-display" style="font-size:1.85rem;font-weight:800;color:var(--brand-2);font-family:monospace;letter-spacing:0.5px;min-height:38px;display:flex;align-items:center;justify-content:flex-end;">
          ${formatDisplay(currentVal, mode)}
        </div>
      </div>

      <!-- Fila de fichas rápidas (chips) -->
      ${chips && chips.length ? `
        <div class="numpad-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;justify-content:center;">
          ${chips.map(chip => `
            <button type="button" class="numpad-chip-btn" data-numpad-chip="${escapeHtml(chip)}" style="
              padding: 7px 12px;
              background: rgba(255,255,255,0.06);
              border: 1px solid rgba(255,255,255,0.12);
              border-radius: 8px;
              color: #f1f5f9;
              font-size: 0.85rem;
              font-weight: 700;
              cursor: pointer;
              transition: background 0.1s ease;
            ">${escapeHtml(chip)}</button>
          `).join('')}
        </div>
      ` : ''}

      <!-- Teclado Numérico 12 botones -->
      <div class="numpad-grid" style="
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-bottom: 14px;
      ">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `
          <button type="button" class="numpad-key-btn" data-numpad-key="${n}" style="
            background: #1c2433;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            color: #fff;
            font-size: 1.6rem;
            font-weight: 700;
            padding: 14px 0;
            cursor: pointer;
          ">${n}</button>
        `).join('')}
        
        <button type="button" class="numpad-key-btn" data-numpad-key="." style="
          background: #1c2433;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: #fff;
          font-size: 1.8rem;
          font-weight: 700;
          padding: 14px 0;
          cursor: pointer;
        ">${mode === 'integer' ? '' : '.'}</button>

        <button type="button" class="numpad-key-btn" data-numpad-key="0" style="
          background: #1c2433;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: #fff;
          font-size: 1.6rem;
          font-weight: 700;
          padding: 14px 0;
          cursor: pointer;
        ">0</button>

        <button type="button" class="numpad-key-btn" data-numpad-key="backspace" style="
          background: #1c2433;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: #f85149;
          font-size: 1.4rem;
          font-weight: 700;
          padding: 14px 0;
          cursor: pointer;
        ">⌫</button>
      </div>

      <!-- Acciones de pie: Limpiar y Confirmar -->
      <footer style="display:grid;grid-template-columns:1fr 2fr;gap:10px;">
        <button type="button" id="numpad-clear-btn" class="button secondary" style="
          padding: 12px 0;
          font-weight: 700;
          font-size: 0.95rem;
          color: #f85149;
          border-radius: 12px;
        ">Borrar</button>
        <button type="button" id="numpad-confirm-btn" class="button primary" style="
          padding: 12px 0;
          font-weight: 800;
          font-size: 1.05rem;
          border-radius: 12px;
        ">Listo / Confirmar</button>
      </footer>
    </div>
  `;

  const displayEl = backdrop.querySelector('#numpad-formatted-display');

  function updateValue(newStr) {
    currentVal = newStr;
    decimalEntered = currentVal.includes('.');
    if (displayEl) {
      displayEl.textContent = formatDisplay(currentVal, mode);
    }
    // Sincronizar con el input objetivo en tiempo real
    targetInput.value = currentVal;
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function handleKey(key) {
    if (key === 'backspace') {
      if (currentVal.length > 0) {
        updateValue(currentVal.slice(0, -1));
      }
    } else if (key === '.') {
      if (mode !== 'integer' && !currentVal.includes('.')) {
        updateValue((currentVal || '0') + '.');
      }
    } else if (/^[0-9]$/.test(key)) {
      // Si ya tiene decimal, restringir a 2 lugares para dinero
      if (currentVal.includes('.')) {
        const parts = currentVal.split('.');
        if (mode === 'money' && parts[1] && parts[1].length >= 2) {
          return; // No más de 2 decimales
        }
      }
      if (currentVal === '0') {
        updateValue(key);
      } else {
        const potential = currentVal + key;
        if (max != null && parseFloat(potential) > max) {
          return; // No sobrepasar máximo
        }
        updateValue(potential);
      }
    }
  }

  function handleChip(chipStr) {
    if (chipStr.toLowerCase().includes('exacto') || chipStr.toLowerCase().includes('total') || chipStr.toLowerCase().includes('saldar')) {
      const targetVal = max != null ? max : initialNum;
      updateValue(targetVal > 0 ? (targetVal).toFixed(2) : '0.00');
      return;
    }
    // Extraer valor numérico del chip (+100, +500, etc.)
    const cleanNum = parseFloat(chipStr.replace(/[^0-9.]/g, ''));
    if (!isNaN(cleanNum)) {
      const cur = parseFloat(currentVal) || 0;
      let next = cur + cleanNum;
      if (max != null && next > max) next = max;
      updateValue(mode === 'integer' ? String(Math.round(next)) : next.toFixed(2));
    }
  }

  // Escuchadores del teclado numérico
  backdrop.querySelectorAll('.numpad-key-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleKey(btn.dataset.numpadKey);
    });
  });

  backdrop.querySelectorAll('.numpad-chip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleChip(btn.dataset.numpadChip);
    });
  });

  backdrop.querySelector('#numpad-clear-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateValue('');
  });

  const confirmAction = (e) => {
    if (e) e.stopPropagation();
    if (!currentVal) {
      targetInput.value = mode === 'money' ? '0.00' : '0';
    } else if (mode === 'money' && !currentVal.includes('.')) {
      targetInput.value = parseFloat(currentVal).toFixed(2);
    }
    targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof onConfirm === 'function') onConfirm(targetInput.value);
    closeTouchNumPad();
  };

  backdrop.querySelector('#numpad-confirm-btn')?.addEventListener('click', confirmAction);
  backdrop.querySelector('#numpad-close-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    confirmAction();
  });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) confirmAction();
  });

  document.body.appendChild(backdrop);
  activePopup = backdrop;
}

export function closeTouchNumPad() {
  if (activePopup) {
    try { activePopup.remove(); } catch (_) {}
    activePopup = null;
  }
}

function formatDisplay(val, mode) {
  if (!val) return mode === 'money' ? 'RD$ 0.00' : '0';
  if (mode === 'money') {
    const num = parseFloat(val);
    if (isNaN(num)) return 'RD$ 0.00';
    if (val.endsWith('.')) {
      return formatMoney(Math.round(num * 100)).replace(/00$/, '') + '.';
    }
    const parts = val.split('.');
    if (parts.length === 2 && parts[1].length === 1) {
      return formatMoney(Math.round(num * 100)).slice(0, -1);
    }
    return formatMoney(Math.round(num * 100));
  }
  return val;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Vincula automáticamente todos los campos numéricos marcados o sensibles
 * para abrir el Touch NumPad en pantallas táctiles y deshabilitar el teclado Android.
 */
export function setupTouchNumericInputs(container = document) {
  if (!container) return;

  const inputs = container.querySelectorAll(
    'input[data-touch-numpad], #cash-movement-amount, #cash-closing-amount, #fiao-pay-amount, #fiao-cash-received, #pos-cash-received, #pos-discount-value, input[name="opening"]'
  );

  inputs.forEach((input) => {
    // 1. Blindar contra el teclado virtual de Android
    input.setAttribute('readonly', 'true');
    input.setAttribute('inputmode', 'none');
    input.style.cursor = 'pointer';

    // 2. Abrir NumPad al tocar/hacer clic con debounce para respuesta inmediata
    let lastTriggered = 0;
    const triggerNumPad = (e) => {
      const now = Date.now();
      if (now - lastTriggered < 350) return;
      lastTriggered = now;

      if (e) {
        try { e.preventDefault(); } catch (_) {}
        try { e.stopPropagation(); } catch (_) {}
      }

      const id = input.id || input.name;
      let title = input.getAttribute('data-numpad-title') || 'Ingresar Monto';
      let mode = input.getAttribute('data-touch-numpad') || 'money';
      let chips = [];
      let max = input.max ? parseFloat(input.max) : null;
      let min = input.min ? parseFloat(input.min) : 0;

      if (id === 'cash-movement-amount') {
        title = 'Monto del Movimiento';
        chips = ['+50', '+100', '+200', '+500', '+1,000', '+2,000'];
      } else if (id === 'cash-closing-amount') {
        title = 'Efectivo Contado en Gaveta';
        const expectedVal = parseFloat(input.getAttribute('data-expected-cash') || '0');
        chips = expectedVal > 0 ? [`Exacto: RD$ ${expectedVal.toFixed(2)}`, '+100', '+500', '+1,000', '+2,000'] : ['+100', '+500', '+1,000', '+2,000'];
      } else if (id === 'fiao-pay-amount') {
        title = 'Monto a Abonar (Fiao)';
        chips = max != null && max > 0 ? [`Saldar Total (RD$ ${max.toFixed(2)})`, '+100', '+200', '+500', '+1,000'] : ['+100', '+200', '+500', '+1,000'];
      } else if (id === 'fiao-cash-received' || id === 'pos-cash-received') {
        title = 'Efectivo Entregado';
        chips = ['Exacto', '100', '200', '500', '1,000', '2,000'];
      } else if (id === 'pos-discount-value') {
        title = 'Descuento';
        mode = 'decimal';
        chips = ['5', '10', '15', '20', '50', '100'];
      } else if (input.name === 'opening') {
        title = 'Fondo Inicial de Caja';
        chips = ['RD$ 500', 'RD$ 1,000', 'RD$ 2,000', 'RD$ 3,000', 'RD$ 5,000'];
      }

      openTouchNumPad({
        targetInput: input,
        title,
        mode,
        quickChips: chips,
        max,
        min
      });
    };

    input.addEventListener('click', triggerNumPad);
    input.addEventListener('pointerup', triggerNumPad);
    input.addEventListener('touchend', triggerNumPad);
  });
}
