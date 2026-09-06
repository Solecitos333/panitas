// Administrative one-time assignment/backfill. Never pass the PIN on the command
// line or print it. Uses the existing Firebase CLI account, not a service key.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const auth = require('firebase-tools/lib/auth');
const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error('Inicia sesión con Firebase CLI.');
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
const base = 'https://firestore.googleapis.com/v1/projects/los-panitas-by-nechy/databases/(default)';
const prefix = 'projects/los-panitas-by-nechy/databases/(default)/documents';
const username = String(process.env.PANITAS_PIN_USERNAME || '').trim().toUpperCase();
const pin = String(process.env.PANITAS_USER_PIN || '');
if (!username || !/^[0-9]{4}$/.test(pin)) throw new Error('Define PANITAS_PIN_USERNAME y PANITAS_USER_PIN para esta ejecución.');
async function api(path, body) {
  const res = await fetch(base + path, { method: 'POST', headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Operación administrativa rechazada (${res.status}); no se imprimen datos privados.`);
  return res.json();
}
const { transaction } = await api('/documents:beginTransaction', {});
let committed = false;
try {
  async function records(collectionId) {
    return (await api('/documents:runQuery', { transaction, structuredQuery: { from: [{ collectionId }] } }))
      .filter((r) => r.document).map((r) => r.document);
  }
  const users = await records('users');
  const secrets = await records('userSecrets');
  const claims = await records('pinClaims');
  const value = (d, key) => d?.fields?.[key]?.stringValue;
  const targets = users.filter((u) => value(u, 'username')?.toUpperCase() === username);
  if (targets.length !== 1 || targets[0].fields.active?.booleanValue !== true) throw new Error('No hay un único usuario activo con ese nombre.');
  const target = targets[0];
  const uid = target.name.split('/').pop();
  const targetSecret = secrets.find((s) => s.name.endsWith('/' + uid));
  const verified = value(targetSecret, 'drawerPin') === pin && targetSecret?.fields?.pinUnique?.booleanValue === true
    && value(claims.find((c) => c.name.endsWith('/' + pin)), 'userId') === uid;
  if (process.argv.includes('--verify') && !verified) throw new Error('La asignación almacenada no coincide con la solicitada.');
  const owners = new Map();
  const writes = [];
  for (const u of users) {
    const id = u.name.split('/').pop();
    const existing = secrets.find((s) => s.name.endsWith('/' + id));
    const current = id === uid ? pin : value(existing, 'drawerPin') || value(u, 'drawerPin');
    if (!current) continue;
    if (!/^[0-9]{4}$/.test(current)) throw new Error('Hay un PIN antiguo inválido; revisar antes de migrar.');
    if (owners.has(current)) throw new Error('Hay un PIN repetido. No se cambió ningún dato; resolver la duplicidad con los usuarios.');
    owners.set(current, id);
    writes.push({ update: { name: `${prefix}/userSecrets/${id}`, fields: {
      drawerPin: { stringValue: current }, pinUnique: { booleanValue: true },
      updatedBy: { stringValue: `firebase-admin:${account.user.email}` }
    } }, updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] });
    if (u.fields.drawerPin) {
      const fields = { ...u.fields };
      delete fields.drawerPin;
      writes.push({ update: { name: u.name, fields } });
    }
  }
  for (const [key, id] of owners) writes.push({ update: { name: `${prefix}/pinClaims/${key}`, fields: { userId: { stringValue: id } } } });
  for (const claim of claims) if (!owners.has(claim.name.split('/').pop())) writes.push({ delete: claim.name });
  writes.push({ update: { name: `${prefix}/auditLogs/pin-admin-${crypto.randomUUID()}`, fields: {
    action: { stringValue: 'user.drawer_pin.provisioned' }, actorId: { stringValue: `firebase-admin:${account.user.email}` },
    actorName: { stringValue: account.user.email }, subjectUserId: { stringValue: uid },
    details: { stringValue: `Asignación autorizada de PIN para ${username} y verificación de reservas exclusivas. No se guardan PIN en auditoría.` }
  } }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] });
  if (writes.length > 450) throw new Error('Volumen superior al límite de esta herramienta; requiere migración por lotes.');
  if (process.argv.includes('--apply')) {
    await api('/documents:commit', { transaction, writes });
    committed = true;
  }
  console.log(JSON.stringify({ applied: committed, verified, username, users: users.length, uniquePins: owners.size, duplicatePins: 0 }));
} finally {
  if (!committed) await api('/documents:rollback', { transaction }).catch(() => {});
}
