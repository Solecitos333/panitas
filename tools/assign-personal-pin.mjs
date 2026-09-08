// Administrative assignment for ONE explicitly named user. PIN stays in process
// environment and private Firestore documents, never stdout, source or audit text.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const auth = require('firebase-tools/lib/auth');
const username = String(process.env.PANITAS_PIN_USERNAME || '').trim().toUpperCase();
const pin = String(process.env.PANITAS_USER_PIN || '');
if (!username || !/^[0-9]{6}$/.test(pin)) throw new Error('Supply username and a six-digit PIN in the environment.');
const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error('Firebase CLI authentication required.');
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
const prefix = 'projects/los-panitas-by-nechy/databases/(default)/documents';
const base = 'https://firestore.googleapis.com/v1/' + prefix;
async function api(suffix, body) {
  const r = await fetch(base + suffix, { method: 'POST', headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`Private operation failed (${r.status}); response withheld.`);
  return r.json();
}
const { transaction } = await api(':beginTransaction', {});
let applied = false;
try {
  const query = async (collectionId) => (await api(':runQuery', { transaction, structuredQuery: { from: [{ collectionId }] } })).flatMap(r => r.document ? [r.document] : []);
  const users = await query('users');
  const secrets = await query('userSecrets');
  const claims = await query('pinClaims');
  const str = (doc, key) => doc?.fields?.[key]?.stringValue;
  const candidates = users.filter(u => str(u, 'username')?.toUpperCase() === username && u.fields.active?.booleanValue === true);
  if (candidates.length !== 1) throw new Error('Expected one active target user.');
  const user = candidates[0];
  const uid = user.name.split('/').pop();
  const secret = secrets.find(s => s.name === `${prefix}/userSecrets/${uid}`);
  if (users.some(u => u.name !== user.name && str(u, 'drawerPin') === pin)
    || secrets.some(s => s.name !== secret?.name && str(s, 'drawerPin') === pin)
    || claims.some(c => c.name === `${prefix}/pinClaims/${pin}` && str(c, 'userId') !== uid)) throw new Error('PIN is already reserved; nothing changed.');
  const writes = [
    { update: { name: `${prefix}/userSecrets/${uid}`, fields: { drawerPin: { stringValue: pin }, pinUnique: { booleanValue: true }, updatedBy: { stringValue: 'administrative-provisioning' } } }, updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] },
    { update: { name: `${prefix}/pinClaims/${pin}`, fields: { userId: { stringValue: uid } } } }
  ];
  for (const c of claims) if (str(c, 'userId') === uid && c.name !== `${prefix}/pinClaims/${pin}`) writes.push({ delete: c.name });
  if (user.fields.drawerPin) {
    const fields = { ...user.fields }; delete fields.drawerPin;
    writes.push({ update: { name: user.name, fields } });
  }
  writes.push({ update: { name: `${prefix}/auditLogs/pin-assignment-${crypto.randomUUID()}`, fields: {
    action: { stringValue: 'user.drawer_pin.provisioned' }, subjectUserId: { stringValue: uid },
    actorId: { stringValue: 'administrative-provisioning' }, details: { stringValue: 'Asignación personal autorizada y reserva exclusiva. Sin PIN en auditoría.' }
  } }, updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }] });
  if (process.argv.includes('--apply')) { await api(':commit', { transaction, writes }); applied = true; }
  console.log(JSON.stringify({ username, applied, changesOtherUsers: false, existingMatches: str(secret, 'drawerPin') === pin }));
} finally { if (!applied) await api(':rollback', { transaction }).catch(() => {}); }
