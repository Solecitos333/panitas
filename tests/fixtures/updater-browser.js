// Fixture servida únicamente por Vite en desarrollo; no forma parte del build.
if (!import.meta.env.DEV) throw new Error('El simulador solo está disponible durante desarrollo.');

let update = {
  supported: true, state: 'up_to_date', installedVersionName: '1.4.0-rc.4',
  installedVersionCode: 11, availableVersionCode: 12, availableVersionName: '1.4.0-rc.5',
  progressPercent: 0, fullyManaged: false, message: 'Actualizador simulado.'
};
window._ELO_NATIVE = true;
window._ELO_APP_VERSION = update.installedVersionName;
window._ELO_APP_VERSION_CODE = update.installedVersionCode;
window.EloPOS = {
  getUpdateStatus: () => JSON.stringify(update),
  setUpdateBusy: (busy) => { document.querySelector('#native-busy').textContent = busy ? 'Ocupado: actualización aplazada' : 'Libre para actualizar'; },
  checkForUpdates: () => { document.querySelector('#native-action').textContent = 'Se solicitó búsqueda'; },
  installUpdate: () => { document.querySelector('#native-action').textContent = 'Se solicitó instalación'; },
  openUpdatePermission: () => { document.querySelector('#native-action').textContent = 'Se solicitó permiso'; }
};
function publish(state, message, errorCode = '') {
  update = { ...update, state, message, errorCode, progressPercent: 50 };
  window.dispatchEvent(new CustomEvent('elo-update-status', { detail: update }));
}
document.querySelector('#simulate-progress').addEventListener('click', () => publish('downloading', 'Descargando actualización de prueba… 50%'));
document.querySelector('#simulate-install').addEventListener('click', () => publish('installing', 'Instalando actualización de prueba…'));
document.querySelector('#simulate-cancel').addEventListener('click', () => publish('error', 'Instalación cancelada. Puedes seguir trabajando.', 'INSTALL_ABORTED'));

await import('../../src/main.js');
