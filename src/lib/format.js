import { formatMoney } from '../domain/billing.js';

export { formatMoney };

export function formatDate(value, withTime = false) {
  if (!value) return 'Pendiente';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pendiente';
  return new Intl.DateTimeFormat('es-DO', withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(date);
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

export function downloadText(filename, contents, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['\ufeff', contents], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
