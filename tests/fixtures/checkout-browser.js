if (!import.meta.env.DEV) throw new Error('Solo pruebas locales; no usar en producción.');
await import('../../src/styles.css');
const { MemoryDataService } = await import('../../src/services/memory-service.js');
const { createApplication } = await import('../../src/ui/app.js');
const user = { uid: 'fixture-owner', username: 'PRUEBA_LOCAL', displayName: 'Prueba aislada', roles: ['owner'], active: true };
const service = new MemoryDataService(user);
await service.saveMyDrawerPin('4826'); // Exclusivamente memoria local, no credencial real.
await service.saveProduct({ name: 'Sandwich de prueba', priceCents: 15000, costCents: 5000, stock: 20, active: true, taxRate: 0 });
service.settings.autoOpenDrawer = false;
service.settings.autoPrintInvoice = false;
service.settings.autoPrintKitchen = false;
window.EloPOS = {
  openDrawer: () => true,
  commandAsync: (requestId) => window.dispatchEvent(new CustomEvent('elo-hardware-result', { detail: { requestId, success: true, ok: true } })),
  printText: () => true,
  printBase64: () => true
};
createApplication({ root: document.querySelector('#app'), user, service, development: true, onLogout: () => location.reload(), onChangePassword: async () => {} });
