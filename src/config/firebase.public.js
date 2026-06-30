/**
 * Configuración pública del SDK web. No contiene credenciales administrativas.
 * Este archivo se actualiza al registrar la aplicación con Firebase CLI.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyD3LJqjC8qmQuA71XakRKkfkXYpXqZGWDU',
  authDomain: 'los-panitas-by-nechy.firebaseapp.com',
  projectId: 'los-panitas-by-nechy',
  storageBucket: 'los-panitas-by-nechy.firebasestorage.app',
  messagingSenderId: '295625413372',
  appId: '1:295625413372:web:6d7e59c20d03e761d2fd79'
};

export const hasFirebaseConfig = Boolean(firebaseConfig.projectId && firebaseConfig.apiKey);
