import test from 'node:test';
import assert from 'node:assert/strict';
import { emailToUsername, isUsernameAccount, isValidUsername, normalizeUsername, usernameToEmail } from '../../src/lib/identity.js';

test('normaliza nombres de usuario sin exponer correos reales', () => {
  assert.equal(normalizeUsername('  jespinal '), 'JESPINAL');
  assert.equal(usernameToEmail('JESPINAL'), 'jespinal@users.lospanitas.app');
  assert.equal(emailToUsername('jespinal@users.lospanitas.app'), 'JESPINAL');
});

test('rechaza nombres de usuario ambiguos o inválidos', () => {
  assert.equal(isValidUsername('AB'), false);
  assert.equal(isValidUsername('USUARIO CORREO'), false);
  assert.equal(isValidUsername('CAJA-01'), true);
  assert.equal(isUsernameAccount('persona@gmail.com'), false);
});
