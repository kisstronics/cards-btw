import type { User } from './types';

/** Empty = same-origin (Vite proxies /auth → Nest). */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

function api(path: string) {
  return `${API_URL}${path}`;
}

export function getToken(): string | null {
  return localStorage.getItem('between_token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('between_token', token);
  else localStorage.removeItem('between_token');
}

export async function fetchAuthStatus() {
  const res = await fetch(api('/auth/google/status'));
  if (!res.ok) throw new Error('Auth status unavailable');
  return res.json() as Promise<{ enabled: boolean; allowDevLogin: boolean }>;
}

export async function devLogin(name: string) {
  const res = await fetch(api('/auth/dev-login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    let detail = 'Dev login failed';
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) detail = body.message;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return res.json() as Promise<{ user: User; accessToken: string }>;
}

export async function fetchMe() {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(api('/auth/me'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    setToken(null);
    return null;
  }
  const data = (await res.json()) as { user: User };
  return data.user;
}

export function googleLoginUrl() {
  return api('/auth/google');
}
