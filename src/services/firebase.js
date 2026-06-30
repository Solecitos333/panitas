import { initializeApp } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { firebaseConfig, hasFirebaseConfig } from '../config/firebase.public.js';

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
export { hasFirebaseConfig };
