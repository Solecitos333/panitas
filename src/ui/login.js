import { createIcons, Eye, Radio, ReceiptText, ShieldCheck } from 'lucide';
import { escapeHtml } from '../lib/format.js';

const icons = { Eye, Radio, ReceiptText, ShieldCheck };

export function renderLogin(root, handlers, message = '') {
  root.innerHTML = `
    <main class="login-page">
      <section class="login-story">
        <a class="brand"><img src="/logo.svg" alt=""><div><strong>Los Panitas</strong><span>by Nechy</span></div></a>
        <div>
          <span class="eyebrow">Operación conectada</span>
          <h1>Del salón a la cocina, sin perder el ritmo.</h1>
          <p>Punto de venta, comandas, caja y facturación en una plataforma diseñada únicamente para el restaurante.</p>
          <div class="login-features">
            <span><i data-lucide="shield-check"></i>Acceso por roles</span>
            <span><i data-lucide="radio"></i>Comandas en vivo</span>
            <span><i data-lucide="receipt-text"></i>Facturación integrada</span>
          </div>
        </div>
        <small>Uso privado · Los Panitas by Nechy</small>
      </section>
      <section class="login-panel">
        <div class="login-card">
          <span class="eyebrow">Bienvenido</span>
          <h2>Inicia tu turno</h2>
          <p>Usa la cuenta asignada a tu función.</p>
          ${message ? `<div class="login-message">${escapeHtml(message)}</div>` : ''}
          <button class="google-button" type="button" data-google>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.32 2.98-7.39Z"/>
              <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.38l-3.24-2.53c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z"/>
              <path fill="#FBBC05" d="M6.39 13.92A6.02 6.02 0 0 1 6.07 12c0-.67.11-1.32.32-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.53l3.35-2.61Z"/>
              <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z"/>
            </svg>
            <span>Continuar con Google</span>
          </button>
          <div class="login-divider"><span>o usa tu correo</span></div>
          <form id="login-form" class="stack-form">
            <label>Correo<input name="email" type="email" autocomplete="username" required></label>
            <label>Contraseña
              <div class="password-field">
                <input name="password" type="password" autocomplete="current-password" minlength="6" required>
                <button type="button" data-toggle-password aria-label="Mostrar contraseña"><i data-lucide="eye"></i></button>
              </div>
            </label>
            <button class="button primary full" type="submit">Entrar al sistema</button>
          </form>
          <button class="text-button reset-button" data-reset>Olvidé mi contraseña</button>
          <p class="login-security-note"><i data-lucide="shield-check"></i>Google confirma tu identidad; tus permisos siguen protegidos por el rol asignado.</p>
        </div>
      </section>
    </main>
  `;
  createIcons({ icons, attrs: { 'aria-hidden': 'true' } });
  root.querySelector('[data-toggle-password]').addEventListener('click', () => {
    const input = root.querySelector('[name=password]');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  root.querySelector('[data-google]').addEventListener('click', (event) => handlers.signInGoogle(event.currentTarget));
  root.querySelector('#login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    handlers.signIn(data.get('email'), data.get('password'), event.submitter);
  });
  root.querySelector('[data-reset]').addEventListener('click', () => {
    const email = root.querySelector('[name=email]').value.trim();
    handlers.resetPassword(email);
  });
}

export function renderPending(root, text = 'Preparando tu espacio…') {
  root.innerHTML = `<div class="boot-screen"><img src="/logo.svg" alt=""><span class="loader"></span><p>${escapeHtml(text)}</p></div>`;
}

export function renderAccessDenied(root, message, onLogout) {
  root.innerHTML = `<div class="fatal-state"><img src="/logo.svg" alt=""><span class="eyebrow">Acceso restringido</span><h1>No puedes entrar todavía</h1><p>${escapeHtml(message)}</p><button class="button primary" id="denied-logout">Usar otra cuenta</button></div>`;
  root.querySelector('#denied-logout').addEventListener('click', onLogout);
}
