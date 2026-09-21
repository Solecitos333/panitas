import { setTerminalSleepMode } from './hardware.js';

/**
 * Gestor de Modo Reposo / Ahorro de Energía para la terminal táctil ELO y navegadores.
 * Detecta inactividad continua y apaga la pantalla (blackout total y brillo al mínimo),
 * simulando un estado apagado. Cualquier toque despierta la pantalla al instante sin
 * alterar el estado de la venta ni perder productos del carrito.
 */
export function createSleepManager({
  getTimeoutSeconds = () => 180,
  isBusy = () => false,
  onSleep = () => {},
  onWake = () => {}
} = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      start: () => {},
      destroy: () => {},
      sleep: () => {},
      wake: () => {},
      touchActivity: () => {},
      reset: () => {},
      isSleeping: () => false,
      getRemainingSeconds: () => 0
    };
  }

  let lastActivity = Date.now();
  let isSleeping = false;
  let overlayEl = null;
  let checkTimer = null;
  let wakeTimer = null;
  let listening = false;

  function consumeWakeEvent(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    wake();
  }

  function captureSleepingKey(e) {
    // El foco puede seguir en un formulario detrás del blackout. Capturar antes
    // de que Enter envíe una venta o el escáner escriba sobre un campo invisible.
    if (isSleeping) consumeWakeEvent(e);
  }

  function ensureOverlay() {
    if (overlayEl && document.body.contains(overlayEl)) return overlayEl;
    overlayEl = document.getElementById('pos-sleep-screen');
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.id = 'pos-sleep-screen';
      overlayEl.className = 'pos-sleep-screen';
      overlayEl.setAttribute('aria-hidden', 'true');
      overlayEl.style.display = 'none';
      overlayEl.innerHTML = `
        <div class="pos-sleep-indicator">
          <span class="pos-sleep-hint">Toca la pantalla para activar</span>
        </div>
      `;
      document.body.appendChild(overlayEl);
    }

    // Registrar en fase de captura para atrapar el toque antes de que baje al DOM
    for (const evt of ['pointerdown', 'touchstart', 'mousedown', 'keydown']) {
      overlayEl.addEventListener(evt, consumeWakeEvent, true);
    }

    return overlayEl;
  }

  function touchActivity() {
    if (isSleeping) return;
    lastActivity = Date.now();
  }

  function sleep() {
    if (isSleeping) return;
    clearTimeout(wakeTimer);
    wakeTimer = null;
    const overlay = ensureOverlay();
    isSleeping = true;
    overlay.style.display = 'flex';
    // Forzar reflow para que la transición CSS de opacidad funcione suavemente
    void overlay.offsetWidth;
    overlay.classList.add('active');
    setTerminalSleepMode(true);
    try {
      onSleep();
    } catch (err) {
      console.warn('Error en onSleep:', err);
    }
  }

  function wake() {
    if (!isSleeping) return;
    isSleeping = false;
    lastActivity = Date.now();
    setTerminalSleepMode(false);
    if (overlayEl) {
      overlayEl.classList.remove('active');
      clearTimeout(wakeTimer);
      wakeTimer = setTimeout(() => {
        wakeTimer = null;
        if (!isSleeping && overlayEl) {
          overlayEl.style.display = 'none';
        }
      }, 350);
    }
    try {
      onWake();
    } catch (err) {
      console.warn('Error en onWake:', err);
    }
  }

  function check() {
    if (isSleeping) return;
    const timeoutSec = Number(getTimeoutSeconds());
    if (timeoutSec <= 0) return; // Modo reposo desactivado
    const idleSeconds = (Date.now() - lastActivity) / 1000;
    if (idleSeconds >= timeoutSec) {
      if (typeof isBusy === 'function' && isBusy()) {
        // Pospone unos segundos si se está imprimiendo o cobrando
        lastActivity = Date.now() - Math.max(0, timeoutSec - 15) * 1000;
        return;
      }
      sleep();
    }
  }

  function start() {
    if (listening) return;
    listening = true;
    ensureOverlay();
    const activityEvents = ['pointerdown', 'touchstart', 'mousemove', 'keydown', 'click', 'scroll'];
    for (const evt of activityEvents) {
      window.addEventListener(evt, touchActivity, { capture: true, passive: true });
    }
    window.addEventListener('keydown', captureSleepingKey, true);
    if (!checkTimer) {
      checkTimer = setInterval(check, 2000);
    }
  }

  function destroy() {
    listening = false;
    clearTimeout(wakeTimer);
    wakeTimer = null;
    if (checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }
    const activityEvents = ['pointerdown', 'touchstart', 'mousemove', 'keydown', 'click', 'scroll'];
    for (const evt of activityEvents) {
      window.removeEventListener(evt, touchActivity, { capture: true, passive: true });
    }
    window.removeEventListener('keydown', captureSleepingKey, true);
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
    setTerminalSleepMode(false);
    isSleeping = false;
  }

  return {
    start,
    destroy,
    sleep,
    wake,
    touchActivity,
    isSleeping: () => isSleeping,
    reset: () => {
      lastActivity = Date.now();
    },
    getRemainingSeconds: () => {
      const timeoutSec = Number(getTimeoutSeconds());
      if (timeoutSec <= 0) return Infinity;
      return Math.max(0, timeoutSec - (Date.now() - lastActivity) / 1000);
    }
  };
}
