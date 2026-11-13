import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setCsrf, setUnauthorizedHandler } from './api';
import { queryClient } from './queryClient';
import { useServerOnline } from './socket';

const SNAPSHOT_KEY = 'rhuq-session';

/** Last signed-in user and settings, so a reload while offline keeps the screen instead of bouncing to login. */
function readSnapshot(): { user: SessionUser; config: QueueConfig } | null {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null');
  } catch {
    return null;
  }
}
function writeSnapshot(value: { user: SessionUser; config: QueueConfig } | null): void {
  try {
    if (value) {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(value));
    } else {
      localStorage.removeItem(SNAPSHOT_KEY);
    }
  } catch {
    // Storage unavailable: offline reloads just return to the login page.
  }
}

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

/**
 * Record a fresh sign-in before the app switches to it, so data can be
 * prefetched for this account. Another account's saved pages are dropped first.
 */
export function beginSession(user: SessionUser, config: QueueConfig = DEFAULT_CONFIG): void {
  if (readSnapshot()?.user.user_id !== user.user_id) {
    queryClient.clear();
  }
  writeSnapshot({ user, config });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  // Start from the last confirmed session so a reload paints at once; the
  // /session check below corrects it (and the server checks every call anyway).
  const [initial] = useState(readSnapshot);
  const [ready, setReady] = useState(initial !== null);
  const [user, setUser] = useState<SessionUser | null>(initial?.user ?? null);
  const [config, setConfig] = useState<QueueConfig>(initial?.config ?? DEFAULT_CONFIG);
  const navigate = useNavigate();
  const leaving = useRef(false);

  const refresh = useCallback(async () => {
    const data = await api('/session');
    if (data.offline) {
      // The server is unreachable, not a sign-out: keep (or restore) who was here.
      const snapshot = readSnapshot();
      let kept: SessionUser | null = null;
      setUser((current) => (kept = current ?? snapshot?.user ?? null));
      if (snapshot?.config) {
        setConfig(snapshot.config);
      }
      setReady(true);
      return kept ?? snapshot?.user ?? null;
    }
    if (data.csrf) {
      setCsrf(data.csrf);
    }
    const next = (data.user ?? null) as SessionUser | null;
    // Never show one account's saved pages to the next person at this desk.
    if ((readSnapshot()?.user.user_id ?? null) !== (next?.user_id ?? null)) {
      queryClient.clear();
    }
    setUser(next);
    if (data.config) {
      setConfig(data.config);
    }
    writeSnapshot(next ? { user: next, config: data.config ?? DEFAULT_CONFIG } : null);
    setReady(true);
    return next;
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

  // Back online: re-check the session, which also catches a sign-out that happened meanwhile.
  const online = useServerOnline();
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) {
      void refresh();
    }
    wasOnline.current = online;
  }, [online, refresh]);

  useEffect(() => {
    setUnauthorizedHandler((reason) => {
      if (reason === 'another_device' || reason === 'revoked') {
        void logout(reason);
      } else if (reason === 'login') {
        writeSnapshot(null);
        queryClient.clear();
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
