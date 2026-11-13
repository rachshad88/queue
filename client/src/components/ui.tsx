import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

const paths: Record<string, string> = {
  queue: 'M4 6h16M4 12h16M4 18h10',
  ticket: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7zM14 5v14',
  history: 'M12 8v4l3 2M3.05 11a9 9 0 1 1 .5 4M3 5v6h6',
  logs: 'M9 5h10M9 12h10M9 19h10M5 5h.01M5 12h.01M5 19h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  building: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2',
  window: 'M3 5h18v14H3zM3 9h18M9 9v10',
  database: 'M4 6c0-1.66 3.58-3 8-3s8 1.34 8 3-3.58 3-8 3-8-1.34-8-3zM4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6',
  account: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  search: 'M21 21l-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z',
  close: 'M18 6L6 18M6 6l12 12',
  speaker: 'M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  menu: 'M3 6h18M3 12h18M3 18h18',
  chevron: 'M6 9l6 6 6-6',
};

export function Icon({ name, size = 18 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? ''} />
    </svg>
  );
}

// ---- Toasts -----------------------------------------------------------------

type ToastKind = 'success' | 'error' | 'info';
const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: ToastKind; leaving?: boolean }[]>([]);
  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-3), { id, message, kind }]);
    // Leave along the path it arrived on, then unmount once the exit has played.
    window.setTimeout(() => setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t))), 4300);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 4550);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}${t.leaving ? ' leaving' : ''}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---- Modal ------------------------------------------------------------------

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const [closing, setClosing] = useState(false);
  /** Play the exit (the reverse of the entrance) before the parent unmounts the dialog. */
  const requestClose = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, 190);
  }, [onClose]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);
  return (
    <div className={`modal-backdrop${closing ? ' closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={requestClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/** Ask for a password before a guarded action. */
export function PasswordPrompt({ title, hint, confirmLabel, onSubmit, onClose }: { title: string; hint: string; confirmLabel: string; onSubmit: (password: string) => Promise<void> | void; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSubmit(password);
          setBusy(false);
        }}
      >
        <p className="muted">{hint}</p>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="off" />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || password === ''}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---- Small pieces ---------------------------------------------------------------

export interface Paging {
  page: number;
  total_pages: number;
  total_records: number;
  shown_from: number;
  shown_to: number;
}

export function Pagination({ paging, onPage }: { paging: Paging; onPage: (page: number) => void }) {
  const start = Math.max(1, Math.min(paging.page - 2, paging.total_pages - 4));
  const end = Math.min(paging.total_pages, start + 4);
  const pages = [];
  for (let p = start; p <= end; p++) {
    pages.push(p);
  }
  return (
    <div className="pagination">
      <span className="muted">
        Showing {paging.shown_from} to {paging.shown_to} of {paging.total_records}
      </span>
      <div className="pages">
        <button className="btn btn-sm" disabled={paging.page <= 1} onClick={() => onPage(paging.page - 1)}>
          Previous
        </button>
        {pages.map((p) => (
          <button key={p} className={`btn btn-sm${p === paging.page ? ' btn-primary' : ''}`} onClick={() => onPage(p)}>
            {p}
          </button>
        ))}
        <button className="btn btn-sm" disabled={paging.page >= paging.total_pages} onClick={() => onPage(paging.page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const c = category === 'emergency' || category === 'priority' ? category : 'regular';
  return <span className={`badge cat-${c}`}>{c}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge status-${status}`}>{status}</span>;
}

/** Load data with an async function; `reload` re-runs it. */
export function useLoader<T>(load: () => Promise<T>, deps: unknown[]): { data: T | null; reload: () => void; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void load().then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, reload, loading };
}
