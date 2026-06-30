import './styles.css';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseServices, hasFirebaseConfig } from './services/firebase.js';
import { DataService } from './services/data-service.js';
import { MemoryDataService } from './services/memory-service.js';
import { ROLES } from './domain/roles.js';
import { createApplication } from './ui/app.js';
import { renderAccessDenied, renderLogin, renderPending } from './ui/login.js';

const root = document.getElementById('app');
let application = null;
let unsubscribeProfile = null;

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(console.warn);

bootstrap().catch((error) => renderAccessDenied(root, error.message, () => location.reload()));

async function bootstrap() {
  const requestedRole = new URLSearchParams(location.search).get('role');
  if (import.meta.env.DEV && ROLES.includes(requestedRole)) {
    const user = { uid: `local-${requestedRole}`, email: `${requestedRole}@local.test`, displayName: `Prueba ${requestedRole}`, roles: [requestedRole], active: true, emailVerified: true };
    application = createApplication({ root, user, service: new MemoryDataService(user), onLogout: () => location.assign('/'), development: true });
    return;
  }
  if (!hasFirebaseConfig) {
    renderAccessDenied(root, 'La infraestructura Firebase aún no ha sido vinculada. Usa ?role=owner durante el desarrollo local.', () => location.reload());
    return;
  }
  renderPending(root);
  const { auth, db } = await getFirebaseServices();
  onAuthStateChanged(auth, async (firebaseUser) => {
    application?.destroy(); application = null; unsubscribeProfile?.(); unsubscribeProfile = null;
    if (!firebaseUser) return showLogin(auth);
    if (!firebaseUser.emailVerified) return renderAccessDenied(root, 'Confirma tu correo antes de entrar. Puedes solicitar un nuevo acceso al propietario.', () => signOut(auth));
    renderPending(root, 'Validando permisos…');
    unsubscribeProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (snapshot) => {
      if (!snapshot.exists()) return renderAccessDenied(root, 'Tu cuenta existe, pero todavía no tiene un perfil operativo asignado.', () => signOut(auth));
      const profile = { uid: firebaseUser.uid, email: firebaseUser.email, emailVerified: firebaseUser.emailVerified, ...snapshot.data() };
      if (!profile.active) return renderAccessDenied(root, 'Esta cuenta está desactivada. Contacta al propietario.', () => signOut(auth));
      application?.destroy();
      application = createApplication({ root, user: profile, service: new DataService(db, profile), onLogout: () => signOut(auth) });
    }, (error) => renderAccessDenied(root, `No pudimos validar tus permisos: ${error.message}`, () => signOut(auth)));
  });
}
function showLogin(auth, message = '') {
  renderLogin(root, {
    async signIn(email, password, button) {
      try { button.disabled = true; await signInWithEmailAndPassword(auth, String(email).trim(), password); }
      catch (error) { showLogin(auth, loginError(error)); }
      finally { button.disabled = false; }
    },
    async resetPassword(email) {
      if (!email) return showLogin(auth, 'Escribe primero tu correo.');
      try { await sendPasswordResetEmail(auth, email); showLogin(auth, 'Te enviamos un enlace para crear una nueva contraseña.'); }
      catch { showLogin(auth, 'No pudimos enviar el enlace. Verifica el correo o consulta al propietario.'); }
    }
  }, message);
}

function loginError(error) {
  if (['auth/invalid-credential','auth/user-not-found','auth/wrong-password'].includes(error.code)) return 'Correo o contraseña incorrectos.';
  if (error.code === 'auth/too-many-requests') return 'Demasiados intentos. Espera unos minutos.';
  if (error.code === 'auth/network-request-failed') return 'No hay conexión con el servicio de acceso.';
  return 'No pudimos iniciar la sesión.';
}
