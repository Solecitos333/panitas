export const USERNAME_EMAIL_SUFFIX = '@users.lospanitas.app';

export function normalizeUsername(value) {
  return String(value || '').trim().toUpperCase();
}

export function isValidUsername(value) {
  const username = normalizeUsername(value);
  return /^[A-Z0-9][A-Z0-9._-]{2,31}$/.test(username);
}

export function usernameToEmail(value) {
  const username = normalizeUsername(value);
  if (!isValidUsername(username)) throw new Error('El usuario debe tener entre 3 y 32 caracteres: letras, números, punto, guion o guion bajo.');
  return `${username.toLowerCase()}${USERNAME_EMAIL_SUFFIX}`;
}

export function emailToUsername(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.endsWith(USERNAME_EMAIL_SUFFIX) ? normalizeUsername(email.slice(0, -USERNAME_EMAIL_SUFFIX.length)) : '';
}

export function isUsernameAccount(email) {
  return Boolean(emailToUsername(email));
}
