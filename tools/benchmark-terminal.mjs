// Synthetic data only. CPU timings are for this computer, not the physical ELO.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createClientMemorySelector, getClientMemory } from '../src/domain/client-memory.js';
import { createSnapshotReader } from '../src/lib/snapshot-reader.js';

const state = {
  clients: Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, name: `Cliente ${i}` })),
  invoices: Array.from({ length: 10000 }, (_, i) => ({ id: `i${i}`, clientId: `c${i % 200}`,
    clientName: `Cliente ${i % 200}`, documentType: 'invoice', status: 'pending',
    createdAt: new Date(1767225600000 + ((i * 7919) % 10000) * 60000),
    paidCents: 1000, totalCents: 3000, items: [{ name: 'Prueba', quantity: 1, unitPriceCents: 3000 }]
  }))
};
function measure(work) {
  const start = performance.now();
  work();
  return Number((performance.now() - start).toFixed(2));
}
const select = createClientMemorySelector();
const expected = getClientMemory(state);
assert.deepEqual(select(state), expected);
const uncachedMs = measure(() => { for (let i = 0; i < 30; i++) getClientMemory(state); });
const cachedMs = measure(() => { for (let i = 0; i < 30; i++) select(state); });
let decoded = 0;
const docs = state.invoices.map(item => {
  const json = JSON.stringify(item);
  return { id: item.id, data: () => { decoded++; return JSON.parse(json); } };
});
const read = createSnapshotReader();
read({ docs });
decoded = 0;
const fullSnapshotMs = measure(() => { for (let i = 0; i < 30; i++) docs.map(item => ({ id: item.id, ...item.data() })); });
const fullDecodes = decoded;
decoded = 0;
const incrementalMs = measure(() => { for (let i = 0; i < 30; i++) read({ docs, docChanges: () => [{ type: 'modified', doc: docs[i] }] }); });
console.log(JSON.stringify({ scope: 'Node/local; 10,000 synthetic invoices; 30 repetitions',
  clientHistory: { uncachedMs, cachedMs, includesInitialIndex: false },
  snapshots: { fullSnapshotMs, incrementalMs, fullDecodes, incrementalDecodes: decoded }
}, null, 2));
