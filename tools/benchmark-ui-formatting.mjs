// Local CPU microbenchmark, not a measurement of the ELO or end-to-end navigation.
import { performance } from 'node:perf_hooks';
import { formatMoney, formatDate } from '../src/lib/format.js';

const count = 5000;
const date = new Date('2026-09-08T12:00:00Z');
const options = { timeZone: 'America/Santo_Domingo', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
function measure(format) {
  const start = performance.now();
  for (let i = 0; i < count; i++) format(i * 101);
  return Math.round(performance.now() - start);
}
console.log(JSON.stringify({
  environment: 'local CPU only; not terminal latency', count,
  previousMs: measure(value => {
    new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(value / 100);
    new Intl.DateTimeFormat('es-DO', options).format(date);
  }),
  optimizedMs: measure(value => { formatMoney(value); formatDate(date, true); })
}, null, 2));
