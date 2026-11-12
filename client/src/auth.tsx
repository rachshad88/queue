import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setCsrf, setUnauthorizedHandler } from './api';

export interface SessionUser {
  user_id: number;
  username: string;
  usertype: string;
  is_superadmin: boolean;
  department_id: number;
  department: string;
  view_mode: string | null;
}

export interface QueueConfig {
  admission_dept_id: number;
  waiting_dept_id: number;
  pool_clinic_ids: number[];
}

interface SessionState {
  ready: boolean;
  user: SessionUser | null;
  config: QueueConfig;
  refresh: () => Promise<SessionUser | null>;
  logout: (reason?: string) => Promise<void>;
}

const DEFAULT_CONFIG: QueueConfig = { admission_dept_id: 3, waiting_dept_id: 15, pool_clinic_ids: [1, 2, 4] };
const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [config, setConfig] = useState<QueueConfig>(DEFAULT_CONFIG);
  const navigate = useNavigate();
  const leaving = useRef(false);

  const refresh = useCallback(async () => {
    const data = await api('/session');
    if (data.csrf) {
      setCsrf(data.csrf);
    }
    setUser(data.user ?? null);
    if (data.config) {
      setConfig(data.config);
    }
    setReady(true);
    return (data.user ?? null) as SessionUser | null;
  }, []);

  // Logout always goes through the server first so the operator's window is freed.
  const logout = useCallback(
    async (reason?: string) => {
      if (leaving.current) {
        return;
      }
      leaving.current = true;
      await api('/logout', { method: 'POST', quiet401: true });
      await refresh();
      leaving.current = false;
      navigate(reason ? `/login?reason=${reason}` : '/login', { replace: true });
    },
    [navigate, refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setUnauthorizedHandler((reason) => {
      if (reason === 'another_device' || reason === 'revoked') {
        void logout(reason);
      } else if (reason === 'login') {
        setUser(null);
      }
    });
  }, [logout]);

  // Background session check. It only stamps the heartbeat when there was real
  // input since the last tick, so an unattended screen still idles out.
  useEffect(() => {
    if (!user) {
      return;
    }
    let active = true;
    const mark = (): void => {
      active = true;
    };
    window.addEventListener('pointerdown', mark);
    window.addEventListener('keydown', mark);
    const timer = window.setInterval(async () => {
      const result = await api(`/session-check?activity=${active ? 1 : 0}`, { quiet401: true });
      active = false;
      if (result.ok === false && (result.reason === 'another_device' || result.reason === 'inactive' || result.reason === 'revoked')) {
        void logout(result.reason);
      }
    }, 30000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', mark);
      window.removeEventListener('keydown', mark);
    };
  }, [user, logout]);

  const value = useMemo(() => ({ ready, user, config, refresh, logout }), [ready, user, config, refresh, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return value;
}
