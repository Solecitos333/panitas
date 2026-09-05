import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSettings } from '../../src/modules/administration.js';

const baseState = {
  settings: {
    name: 'Los Panitas by Nechy',
    invoicePrefix: 'PAN-', quotePrefix: 'COT-', proformaPrefix: 'PROF-'
  }
};

test('configuración distingue navegador de la app nativa ELO', () => {
  const html = renderSettings({
    ...baseState,
    updateStatus: { supported: false, state: 'unsupported', message: 'Solo navegador.' }
  });
  assert.match(html, /App nativa no detectada/);
  assert.doesNotMatch(html, /data-update-check/);
  assert.match(html, /Recuperación e instalación manual/);
});

test('una actualización verificada muestra versión y acción de instalación', () => {
  const html = renderSettings({
    ...baseState,
    updateStatus: {
      supported: true,
      state: 'ready',
      installedVersionName: '1.4.0-rc.4',
      installedVersionCode: 11,
      availableVersionName: '1.4.0-rc.5',
      availableVersionCode: 12,
      progressPercent: 100,
      releaseNotes: ['Mejora segura.']
    }
  });
  assert.match(html, /v1\.4\.0-rc\.4 · código 11/);
  assert.match(html, /v1\.4\.0-rc\.5 · código 12/);
  assert.match(html, /data-update-install/);
  assert.match(html, /Mejora segura\./);
});

test('un permiso pendiente presenta una sola acción inequívoca', () => {
  const html = renderSettings({
    ...baseState,
    updateStatus: {
      supported: true,
      state: 'permission_required',
      installedVersionName: '1.4.0-rc.4',
      installedVersionCode: 11,
      message: 'Permiso requerido.'
    }
  });
  assert.match(html, /data-update-permission/);
  assert.doesNotMatch(html, /data-update-install/);
});

test('un error ofrece un solo botón de reintento', () => {
  const html = renderSettings({
    ...baseState,
    updateStatus: {
      supported: true,
      state: 'error',
      installedVersionName: '1.4.0-rc.4',
      installedVersionCode: 11,
      message: 'No se pudo comprobar.'
    }
  });
  assert.equal((html.match(/data-update-check/g) || []).length, 1);
});
