export function createOperationId(prefix = 'op') {
  const safePrefix = String(prefix || 'op').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20) || 'op';
  if (typeof globalThis.crypto?.randomUUID === 'function') return `${safePrefix}-${globalThis.crypto.randomUUID()}`;
  const time = Date.now().toString(36);
  const random = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 24);
  return `${safePrefix}-${time}-${random}`;
}
