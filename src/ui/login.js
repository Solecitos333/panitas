import { createIcons, Eye, Radio, ReceiptText, ShieldCheck } from 'lucide';
import { escapeHtml } from '../lib/format.js';

const icons = { Eye, Radio, ReceiptText, ShieldCheck };

export function renderLogin(root, handlers, message = '') {
  root.innerHTML = `<main class="login-page"><section class="login-story"><a class="brand"><img src="/logo.svg" alt=""><div><strong>Los Panitas</strong><span>by Nechy</span></div></a><div><span class="eyebrow">Operación conectada</span><h1>Del salón a la cocina, sin perder el ritmo.</h1><p>Punto de venta, comandas, caja y facturación en una plataforma diseñada únicamente para el restaurante.</p><div class="login-features"><span><i data-lucide="shield-check"></i>Acceso por roles</span><span><i data-lucide="radio"></i>Comandas en vivo</span><span><i data-lucide="receipt-text"></i>Facturación integrada</span></div></div><small>Uso privado · Los Panitas by Nechy</small></section><section class="login-panel"><div class="login-card"><span class="eyebrow">Bienvenido</span><h2>Inicia tu turno</h2><p>Usa la cuenta asignada a tu función.</p>${message?`<div class="login-message">${escapeHtml(message)}</div>`:''}<form id="login-form" class="stack-form"><label>Correo<input name="email" type="email" autocomplete="username" required></label><label>Contraseña<div class="password-field"><input name="password" type="password" autocomplete="current-password" minlength="6" required><button type="button" data-toggle-password aria-label="Mostrar contraseña"><i data-lucide="eye"></i></button></div></label><button class="button primary full" type="submit">Entrar al sistema</button></form><button class="text-button reset-button" data-reset>Olvidé mi contraseña</button></div></section></main>`;
  createIcons({icons,attrs:{'aria-hidden':'true'}});
  root.querySelector('[data-toggle-password]').addEventListener('click',()=>{const input=root.querySelector('[name=password]');input.type=input.type==='password'?'text':'password';});
  root.querySelector('#login-form').addEventListener('submit',(event)=>{event.preventDefault();const data=new FormData(event.currentTarget);handlers.signIn(data.get('email'),data.get('password'),event.submitter);});
  root.querySelector('[data-reset]').addEventListener('click',()=>{const email=root.querySelector('[name=email]').value.trim();handlers.resetPassword(email);});
}

export function renderPending(root, text = 'Preparando tu espacio…') {
  root.innerHTML = `<div class="boot-screen"><img src="/logo.svg" alt=""><span class="loader"></span><p>${escapeHtml(text)}</p></div>`;
}

export function renderAccessDenied(root, message, onLogout) {
  root.innerHTML = `<div class="fatal-state"><img src="/logo.svg" alt=""><span class="eyebrow">Acceso restringido</span><h1>No puedes entrar todavía</h1><p>${escapeHtml(message)}</p><button class="button primary" id="denied-logout">Usar otra cuenta</button></div>`;
  root.querySelector('#denied-logout').addEventListener('click',onLogout);
}
