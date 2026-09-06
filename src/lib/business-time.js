export const BUSINESS_TIME_ZONE = 'America/Santo_Domingo';
const calendar = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export function businessDateKey(value = new Date()) {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = calendar.formatToParts(date);
  return ['year', 'month', 'day'].map((type) => parts.find((p) => p.type === type)?.value).join('-');
}
export function inBusinessPeriod(value, period = 'day', now = new Date()) {
  const key = businessDateKey(value), today = businessDateKey(now);
  if (!key || !today) return false;
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (date > now) return false;
  let start = today;
  if (period === 'month') start = today.slice(0, 7) + '-01';
  if (period === 'year') start = today.slice(0, 4) + '-01-01';
  if (period === 'week') {
    const monday = new Date(today + 'T12:00:00Z');
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    start = monday.toISOString().slice(0, 10);
  }
  return key >= start && key <= today;
}
