import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setCsrf, setUnauthorizedHandler } from './api';
import { queryClient } from './queryClient';
import { reconnectSocket, sendActivity, useServerOnline, useSocketEvent } from './socket';

const SNAPSHOT_KEY = 'rhuq-session';

/**
 * How long a sign-in the server last confirmed may be trusted without asking it
 * again (instant start-up, reloads while offline). Matches the idle sign-out.
 */
const SNAPSHOT_TRUST_MS = 30 * 60 * 1000;

type Snapshot = { user: SessionUser; config: QueueConfig; confirmed_at?: number };

/** Last signed-in user and settings, with when the server last confirmed them. */
function readSnapshot(): Snapshot | null {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null');
  } catch {
    return null;
  }
}

/** The saved sign-in, only while recent enough to show the screen before the server answers. */
function trustedSnapshot(): Snapshot | null {
  const snapshot = readSnapshot();
  return snapshot && Date.now() - (snapshot.confirmed_at ?? 0) < SNAPSHOT_TRUST_MS ? snapshot : null;
}

/** The server (or a live, unchallenged socket) just vouched for this sign-in. */
function markConfirmed(): void {
  const snapshot = readSnapshot();
  if (snapshot) {
    writeSnapshot({ ...snapshot, confirmed_at: Date.now() });
  }
}

function writeSnapshot(value: Snapshot | null): void {
  try {
    if (value) {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ ...value, confirmed_at: value.confirmed_at ?? Date.now() }));
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
  /** Why the last sign-out happened (shown on the login page), until the next sign-in. */
  endReason: string;
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
  // A stale sign-in is never trusted: the screen waits for the server instead
  // of showing the last person's pages.
  const [initial] = useState(trustedSnapshot);
  const [ready, setReady] = useState(initial !== null);
  const [user, setUser] = useState<SessionUser | null>(initial?.user ?? null);
  const [config, setConfig] = useState<QueueConfig>(initial?.config ?? DEFAULT_CONFIG);
  const navigate = useNavigate();
  const leaving = useRef(false);
  const [endReason, setEndReason] = useState('');
  useEffect(() => {
    if (user) {
      setEndReason('');
    }
  }, [user]);

  const refresh = useCallback(async () => {
    const data = await api('/session');
    if (data.offline) {
      // The server is unreachable, not a sign-out: keep (or restore) who was here,
      // but only a recently confirmed sign-in; an old one goes to the login page.
      const snapshot = trustedSnapshot();
      if (!snapshot) {
        queryClient.clear();
      }
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
      // Set first, so whichever redirect to the login page happens first carries it.
      setEndReason(reason ?? '');
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

  // No polling: the server tells this screen over its socket when the session
  // ends (signed in elsewhere, revoked, idle), and input is reported the same way.
  //
  // The socket's sign-in is fixed at its handshake, so a push can describe an
  // older session than the browser now holds (for example after signing in
  // again in another tab). The cookie decides: ask the server once, and only
  // sign out if it agrees; otherwise just reopen the socket on the new sign-in.
  useSocketEvent('session-ended', async () => {
    const check = await api('/session-check?activity=0', { quiet401: true });
    if (check.offline) {
      return;
    }
    if (check.ok && check.logged_in) {
      reconnectSocket();
      return;
    }
    const reason = String(check.reason ?? '');
    if (reason === 'another_device' || reason === 'inactive' || reason === 'revoked') {
      void logout(reason);
    } else {
      writeSnapshot(null);
      queryClient.clear();
      setUser(null);
    }
  });

  // The socket's sign-in is read at its handshake, so reopen it whenever the account changes.
  const signedInAs = user?.user_id ?? 0;
  const previousSignIn = useRef(signedInAs);
  useEffect(() => {
    if (previousSignIn.current !== signedInAs) {
      previousSignIn.current = signedInAs;
      reconnectSocket();
    }
  }, [signedInAs]);

  useEffect(() => {
    if (!signedInAs) {
      return;
    }
    let last = 0;
    const mark = (): void => {
      const now = Date.now();
      if (now - last > 30000) {
        last = now;
        sendActivity();
        // A connected socket hears about any sign-out within a minute, so an
        // operator working online keeps their saved sign-in current.
        if (online) {
          markConfirmed();
        }
      }
    };
    window.addEventListener('pointerdown', mark);
    window.addEventListener('keydown', mark);
    return () => {
      window.removeEventListener('pointerdown', mark);
      window.removeEventListener('keydown', mark);
    };
  }, [signedInAs, online]);

  const value = useMemo(() => ({ ready, user, config, refresh, logout, endReason }), [ready, user, config, refresh, logout, endReason]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return value;
}
