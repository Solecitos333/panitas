import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, browserLocalPersistence, inMemoryPersistence, setPersistence, signOut, updateProfile } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { firebaseConfig, hasFirebaseConfig } from '../config/firebase.public.js';
import { usernameToEmail } from '../lib/identity.js';

let services = null;

export async function getFirebaseServices() {
  if (!hasFirebaseConfig) throw new Error('Firebase todavía no está configurado para este entorno.');
  if (services) return services;
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
  services = { app, auth, db };
  return services;
}

export async function createUsernameIdentity({ username, password, displayName }) {
  const app = initializeApp(firebaseConfig, `user-provisioning-${crypto.randomUUID()}`);
  const auth = getAuth(app);
  try {
    await setPersistence(auth, inMemoryPersistence);
    const credential = await createUserWithEmailAndPassword(auth, usernameToEmail(username), password);
    await updateProfile(credential.user, { displayName });
    return { uid: credential.user.uid, authEmail: credential.user.email };
  } finally {
    await signOut(auth).catch(() => {});
    await deleteApp(app);
  }
}
export { hasFirebaseConfig };
