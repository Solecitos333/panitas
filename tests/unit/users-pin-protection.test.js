import test from 'node:test';
import assert from 'node:assert/strict';
import { renderUsers, renderUsersLockScreen } from '../../src/modules/administration.js';

test('Users PIN Protection: renderUsersLockScreen renderiza pantalla de bloqueo con PIN pad completo', () => {
  const user = {
    uid: 'user_nechy',
    username: 'NECHY',
    displayName: 'Nechy Peña',
    roles: ['owner']
  };

  const html = renderUsersLockScreen({}, user);

  assert.ok(html.includes('users-lock-screen'), 'Contiene la clase users-lock-screen');
  assert.ok(html.includes('id="users-unlock-form"'), 'Contiene el formulario users-unlock-form');
  assert.ok(html.includes('Nechy Peña'), 'Muestra el nombre del usuario autorizado');
  assert.ok(html.includes('Control de Acceso y Usuarios'), 'Muestra el título de la sección protegida');
  assert.ok(html.includes('id="users-unlock-slots"'), 'Contiene los slots para el PIN de 6 dígitos');
  assert.ok(html.includes('id="users-unlock-submit"'), 'Contiene el botón de desbloqueo');
  assert.ok(html.includes('data-route="dashboard"'), 'Permite volver al resumen');
});

test('Users PIN Protection: renderUsers incluye botón para bloquear acceso de inmediato', () => {
  const state = {
    user: { uid: 'user_nechy', username: 'NECHY', displayName: 'Nechy Peña' },
    users: [
      { id: 'user_nechy', username: 'NECHY', displayName: 'Nechy Peña', roles: ['owner'], active: true },
      { id: 'user_cajero', username: 'JUNIOR', displayName: 'Junior Cajero', roles: ['cashier'], active: true }
    ]
  };

  const html = renderUsers(state);

  assert.ok(html.includes('data-users-lock'), 'Contiene el botón de bloqueo manual data-users-lock');
  assert.ok(html.includes('Bloquear acceso'), 'Contiene el texto de Bloquear acceso');
  assert.ok(html.includes('data-user-new'), 'Contiene el botón para crear un nuevo usuario');
  assert.ok(html.includes('Junior Cajero'), 'Muestra los usuarios existentes');
});
