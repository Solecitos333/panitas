export const ROLES = Object.freeze(['owner', 'manager', 'cashier', 'waiter', 'kitchen']);

export const PERMISSIONS = Object.freeze({
  owner: ['*'],
  manager: ['dashboard:view', 'tables:view', 'orders:*', 'kds:view', 'billing:*', 'payments:*', 'cash:*', 'catalog:*', 'clients:*', 'reports:view', 'audit:view'],
  cashier: ['dashboard:view', 'tables:view', 'orders:view', 'orders:create', 'orders:charge', 'billing:view', 'billing:create', 'payments:create', 'cash:*', 'catalog:view', 'clients:*'],
  waiter: ['tables:view', 'orders:view', 'orders:create', 'orders:update', 'orders:serve', 'catalog:view'],
  kitchen: ['kds:view', 'orders:view', 'orders:kitchen']
});

export function normalizeRoles(user = {}) {
  const values = Array.isArray(user.roles) ? user.roles : user.role ? [user.role] : [];
  return [...new Set(values.map(String).filter((role) => ROLES.includes(role)))];
}

export function primaryRole(user = {}) {
  const roles = normalizeRoles(user);
  return ROLES.find((role) => roles.includes(role)) || '';
}

function permissionMatches(granted, requested) {
  if (granted === '*' || granted === requested) return true;
  if (granted.endsWith(':*')) return requested.startsWith(granted.slice(0, -1));
  return false;
}

export function can(user, permission) {
  if (!user?.active || !permission) return false;
  return normalizeRoles(user).some((role) => PERMISSIONS[role].some((granted) => permissionMatches(granted, permission)));
}

export function allowedNavigation(user) {
  const entries = [
    ['dashboard', 'dashboard:view'], ['pos', 'orders:create'], ['tables', 'tables:view'],
    ['kds', 'kds:view'], ['invoices', 'billing:view'], ['clients', 'clients:*'],
    ['products', 'catalog:view'], ['cash', 'cash:*'], ['reports', 'reports:view'],
    ['settings', '*']
  ];
  return entries.filter(([, permission]) => can(user, permission)).map(([id]) => id);
}
