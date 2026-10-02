const AUTH_KEY = 'mes.configStudioPharma.v1.auth';
const SESSION_KEY = 'mes.configStudioPharma.session';
const DEFAULT_PASSWORD = 'dec25';
const SECURITY_CODE = '1208';
export const INSTRUCTOR_PASSWORD = '1208';

export function getPassword() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY))?.password ?? DEFAULT_PASSWORD;
  } catch {
    return DEFAULT_PASSWORD;
  }
}

export function setPassword(newPassword, securityCode) {
  if (securityCode !== SECURITY_CODE) return { ok: false, error: 'Invalid security code' };
  if (!newPassword || newPassword.length < 4) return { ok: false, error: 'Password must be at least 4 characters' };
  localStorage.setItem(AUTH_KEY, JSON.stringify({ password: newPassword }));
  return { ok: true };
}

export function login(username, password) {
  if (username.trim().toLowerCase() === 'mes' && password.trim() === getPassword()) {
    sessionStorage.setItem(SESSION_KEY, '1');
    return true;
  }
  return false;
}

export function isLoggedIn() {
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}
