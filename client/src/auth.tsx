import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchAuthStatus, fetchMe, setToken, getToken, devLogin } from './api';
import { disconnectSocket } from './socket';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  googleEnabled: boolean;
  allowDevLogin: boolean;
  loginDev: (name: string) => Promise<void>;
  completeTokenLogin: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function userFromJwt(token: string): User | null {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const json = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as {
      sub?: string;
      email?: string;
      name?: string;
      provider?: 'google' | 'dev';
    };
    if (!payload.sub || !payload.email) return null;
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      provider: payload.provider || 'google',
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [allowDevLogin, setAllowDevLogin] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await fetchAuthStatus();
        if (!cancelled) {
          setGoogleEnabled(status.enabled);
          setAllowDevLogin(status.allowDevLogin);
        }
        const token = getToken();
        if (token) {
          const me = (await fetchMe()) || userFromJwt(token);
          if (!cancelled) setUser(me);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loginDev = useCallback(async (name: string) => {
    const result = await devLogin(name);
    setToken(result.accessToken);
    setUser(result.user);
  }, []);

  const completeTokenLogin = useCallback(async (token: string) => {
    setToken(token);
    const me = (await fetchMe()) || userFromJwt(token);
    if (!me) {
      setToken(null);
      throw new Error('Could not load your account after Google sign-in');
    }
    setUser(me);
  }, []);

  const logout = useCallback(() => {
    disconnectSocket();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      googleEnabled,
      allowDevLogin,
      loginDev,
      completeTokenLogin,
      logout,
    }),
    [
      user,
      loading,
      googleEnabled,
      allowDevLogin,
      loginDev,
      completeTokenLogin,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
