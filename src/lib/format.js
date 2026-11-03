import { formatMoney } from '../domain/billing.js';
import { BUSINESS_TIME_ZONE } from './business-time.js';

export { formatMoney };
const dateOptions = { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: 'short', day: 'numeric' };
const dateFormatter = new Intl.DateTimeFormat('es-DO', dateOptions);
const dateTimeFormatter = new Intl.DateTimeFormat('es-DO', {
  ...dateOptions, hour: '2-digit', minute: '2-digit', second: '2-digit'
});
const timeFormatter = new Intl.DateTimeFormat('es-DO', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
});

export function formatDate(value, withTime = false) {
  if (!value) return 'Pendiente';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Pendiente';
  return (withTime ? dateTimeFormatter : dateFormatter).format(date);
}

export function formatTime(value) {
  if (!value) return '';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return timeFormatter.format(date);
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
