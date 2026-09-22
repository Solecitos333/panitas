// Keep subscriptions current without rebuilding the cashier's screen for unrelated data.
const dependencies = {
  dashboard: ['orders', 'invoices', 'payments', 'cashSessions', 'cashMovements', 'tables', 'products'],
  pos: ['products', 'clients', 'tables', 'cashSessions'],
  kds: ['orders'], tables: ['tables', 'orders'],
  products: ['products', 'inventoryMovements'], clients: ['clients', 'invoices'], users: ['users'], audit: ['auditLogs', 'cashSessions', 'cashMovements', 'payrollPayments', 'invoices'],
  invoices: ['invoices', 'payments'], receivables: ['invoices', 'payments', 'clients', 'cashSessions'],
  deliveries: ['invoices', 'payments', 'deliveryDrivers', 'cashSessions'],
  cash: ['cashSessions', 'cashMovements', 'payments', 'users', 'invoices', 'products', 'inventoryMovements'],
  payroll: ['employees', 'payrollPayments', 'cashSessions', 'cashMovements'],
  reports: ['invoices', 'payments', 'cashMovements', 'inventoryMovements'],
  terminal: [], whatsapp: ['whatsappBot'], settings: [], remote: []
};
export function affectsCurrentView(route, collection, modal = '') {
  // A modal can show a document unrelated to the underlying route.
  if (modal || !Object.prototype.hasOwnProperty.call(dependencies, route)) return true;
  return dependencies[route].includes(collection);
}
