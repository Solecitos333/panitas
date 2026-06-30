import './styles.css';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
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
    try {
      await provisionInvitedProfile(db, firebaseUser);
    } catch (error) {
      return renderAccessDenied(root, `No pudimos activar tu invitación: ${error.message}`, () => signOut(auth));
    }
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

async function provisionInvitedProfile(db, firebaseUser) {
  const profileRef = doc(db, 'users', firebaseUser.uid);
  if ((await getDoc(profileRef)).exists()) return;
  const email = String(firebaseUser.email || '').trim().toLowerCase();
  if (!email) return;
  const invitation = await getDoc(doc(db, 'userInvites', email));
  if (!invitation.exists() || invitation.data().active !== true) return;
  const invite = invitation.data();
  const roles = Array.isArray(invite.roles) ? invite.roles.filter((role) => ROLES.includes(role)) : [];
  if (String(invite.email || '').toLowerCase() !== email || !roles.length) throw new Error('La invitación no es válida.');
  await setDoc(profileRef, {
    email,
    displayName: String(invite.displayName || firebaseUser.displayName || email).trim().slice(0, 160),
    roles,
    active: true,
    createdAt: serverTimestamp(),
    createdBy: String(invite.createdBy || 'invitation'),
    updatedAt: serverTimestamp(),
    updatedBy: firebaseUser.uid
  });
}

function showLogin(auth, message = '') {
  renderLogin(root, {
    async signIn(email, password, button) {
      try { button.disabled = true; await signInWithEmailAndPassword(auth, String(email).trim(), password); }
      catch (error) { showLogin(auth, loginError(error)); }
      finally { button.disabled = false; }
    },
    async signInGoogle(button) {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        button.disabled = true;
        await signInWithPopup(auth, provider);
      } catch (error) {
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(error.code)) {
          await signInWithRedirect(auth, provider);
          return;
        }
        if (error.code !== 'auth/popup-closed-by-user') showLogin(auth, loginError(error));
      } finally {
        button.disabled = false;
      }
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
  if (error.code === 'auth/account-exists-with-different-credential') return 'Ese correo ya usa otro método de acceso. Entra con tu contraseña y solicita vincular Google.';
  if (error.code === 'auth/unauthorized-domain') return 'Este dominio todavía no está autorizado para iniciar sesión con Google.';
  if (error.code === 'auth/too-many-requests') return 'Demasiados intentos. Espera unos minutos.';
  if (error.code === 'auth/network-request-failed') return 'No hay conexión con el servicio de acceso.';
  return 'No pudimos iniciar la sesión.';
}
