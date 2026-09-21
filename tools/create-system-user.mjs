import { createRequire } from 'node:module';
import { createUsernameIdentity } from '../src/services/firebase.js';

const require = createRequire(import.meta.url);
const auth = require('firebase-tools/lib/auth');

const username = String(process.env.PANITAS_USERNAME || 'JUNIOR').trim().toUpperCase();
const displayName = String(process.env.PANITAS_DISPLAY_NAME || 'Junior').trim();
const password = String(process.env.PANITAS_PASSWORD || 'Junior202020').trim();
const pin = String(process.env.PANITAS_USER_PIN || '202020').trim();
const roles = (process.env.PANITAS_ROLES || 'cashier,manager').split(',').map(r => r.trim()).filter(Boolean);

if (!username || !displayName) throw new Error('Define username and displayName.');
if (password.length < 8) throw new Error('Password must be at least 8 characters.');
if (!/^[0-9]{6}$/.test(pin)) throw new Error('PIN must be exactly 6 digits.');

const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error('Firebase CLI authentication required.');
const token = await auth.getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);

const prefix = 'projects/los-panitas-by-nechy/databases/(default)/documents';
const base = 'https://firestore.googleapis.com/v1/' + prefix;

async function api(suffix, body, method = 'POST') {
  const r = await fetch(base + suffix, {
    method,
    headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Firestore operation failed (${r.status}): ${text}`);
  }
  return r.json();
}

console.log(`[1/4] Verificando PIN ${pin} y usuario ${username}...`);

// 1. Check if PIN is already claimed
try {
  const existingClaim = await api(`/pinClaims/${pin}`, null, 'GET');
  if (existingClaim?.fields?.userId?.stringValue) {
    throw new Error(`El PIN ${pin} ya está asignado al usuario ${existingClaim.fields.userId.stringValue}`);
  }
} catch (err) {
  if (!err.message.includes('404')) throw err;
  // 404 is expected - PIN is free!
}

// 2. Check if username is already in Firestore
const usersQuery = await api(':runQuery', {
  structuredQuery: {
    from: [{ collectionId: 'users' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'username' },
        op: 'EQUAL',
        value: { stringValue: username }
      }
    }
  }
});

const existingUserDoc = usersQuery.flatMap(r => r.document ? [r.document] : []);
let uid = null;
let authEmail = null;

if (existingUserDoc.length > 0) {
  const doc = existingUserDoc[0];
  uid = doc.name.split('/').pop();
  authEmail = doc.fields?.authEmail?.stringValue;
  console.log(`Usuario ${username} ya existe en Firestore con UID: ${uid}`);
} else {
  console.log(`[2/4] Creando identidad en Firebase Auth para ${username} (${displayName})...`);
  const identity = await createUsernameIdentity({ username, password, displayName });
  uid = identity.uid;
  authEmail = identity.authEmail;
  console.log(`Identidad creada exitosamente. UID: ${uid}, Email: ${authEmail}`);
}

console.log(`[3/4] Escribiendo perfil, secretos y claim de PIN en Firestore...`);

const writes = [
  // 1. User document
  {
    update: {
      name: `${prefix}/users/${uid}`,
      fields: {
        username: { stringValue: username },
        displayName: { stringValue: displayName },
        authEmail: { stringValue: authEmail },
        roles: {
          arrayValue: {
            values: roles.map(r => ({ stringValue: r }))
          }
        },
        active: { booleanValue: true },
        createdBy: { stringValue: 'administrative-provisioning' },
        updatedBy: { stringValue: 'administrative-provisioning' }
      }
    },
    updateTransforms: [
      { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
      { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }
    ]
  },
  // 2. UserSecrets document
  {
    update: {
      name: `${prefix}/userSecrets/${uid}`,
      fields: {
        drawerPin: { stringValue: pin },
        pinUnique: { booleanValue: true },
        updatedBy: { stringValue: 'administrative-provisioning' }
      }
    },
    updateTransforms: [
      { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }
    ]
  },
  // 3. PinClaims document
  {
    update: {
      name: `${prefix}/pinClaims/${pin}`,
      fields: {
        userId: { stringValue: uid }
      }
    }
  },
  // 4. Audit Log
  {
    update: {
      name: `${prefix}/auditLogs/user-created-${crypto.randomUUID()}`,
      fields: {
        action: { stringValue: 'user.created' },
        subjectUserId: { stringValue: uid },
        actorId: { stringValue: 'administrative-provisioning' },
        actorName: { stringValue: 'Administrador' },
        details: { stringValue: `Usuario ${username} (${displayName}) creado con roles [${roles.join(', ')}] y PIN de facturación asignado.` }
      }
    },
    updateTransforms: [
      { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }
    ]
  }
];

const commitRes = await api(':commit', { writes });
console.log(`[4/4] Commit completado exitosamente con ${commitRes.writeResults?.length} escrituras.`);
console.log(JSON.stringify({
  success: true,
  username,
  displayName,
  authEmail,
  uid,
  roles,
  pin,
  initialPassword: password
}, null, 2));
