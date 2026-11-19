import { BASE } from '../base';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink, useLocation } from 'react-router-dom';
import { useSession } from '../auth';
import { prefetchRoute } from '../prefetch';
import { apiQuery } from '../queryClient';
import { OfflineBanner } from './OfflineBanner';
import { Icon } from './ui';

/** A small red count beside a menu entry; nothing when the count is zero. */
function Badge({ count, label }: { count: number; label: string }) {
  return count > 0 ? <b className="nav-badge" title={label} aria-label={label}>{count > 99 ? '99+' : count}</b> : null;
}

function Item({ to, icon, badge, children }: { to: string; icon: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <NavLink to={to} end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} onPointerEnter={() => prefetchRoute(to)} onFocus={() => prefetchRoute(to)} onTouchStart={() => prefetchRoute(to)}>
      <Icon name={icon} />
      <span>{children}</span>
      {badge}
    </NavLink>
  );
}

/** A top-bar menu that opens on click and closes on outside click, Escape or navigation. */
function Dropdown({ label, icon, active, align = 'left', badge, children }: { label: ReactNode; icon: string; active: boolean; align?: 'left' | 'right'; badge?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className={`nav-drop${open ? ' open' : ''}`} ref={ref}>
      <button type="button" className={`nav-item${active ? ' active' : ''}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>
        <Icon name={icon} />
        <span>{label}</span>
        {badge}
        <span className="nav-chevron"><Icon name="chevron" size={14} /></span>
      </button>
      <div className={`nav-drop-menu ${align}`} role="menu">{children}</div>
    </div>
  );
}

/** Signed-in shell: a top navigation bar gated by role, plus the page. */
export function Layout({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { user, logout } = useSession();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  // Admins see how many staff are waiting for an account; shares the cache with the Users page.
  const canApprove = user?.usertype === 'admin' && user.view_mode !== 'for_customer';
  const { data: requestData } = useQuery({ ...apiQuery<{ success: boolean; requests?: unknown[] }>('/account-requests'), enabled: canApprove, refetchInterval: 60_000 });
  const pendingRequests = canApprove && requestData?.success ? (requestData.requests?.length ?? 0) : 0;
  const requestsLabel = `${pendingRequests} account request${pendingRequests === 1 ? '' : 's'} waiting`;
  if (!user) {
    return null;
  }
  const dept = user.department.toUpperCase();
  const isAdmin = user.usertype === 'admin';
  const kioskOnly = user.view_mode === 'for_customer';
  const systemPaths = ['/users', '/departments', '/sections', '/backup'];
  const systemActive = systemPaths.includes(location.pathname);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src={`${BASE}/img/logo.jpg`} alt="" />
            <div>
              <strong>RHU Queue</strong>
              <small>Management System</small>
            </div>
          </div>
          <button className="icon-btn menu-btn" onClick={() => setOpen((v) => !v)} aria-label="Menu" aria-expanded={open}>
            <Icon name={open ? 'close' : 'menu'} />
          </button>
          <nav className={`topnav${open ? ' open' : ''}`}>
            {kioskOnly ? (
              dept === 'ABTC' ? <Item to="/kiosk/abtc" icon="ticket">ABTC tickets</Item> : <Item to="/kiosk/waiting" icon="ticket">Waiting tickets</Item>
            ) : (
              <>
                <Item to="/" icon="queue">Console</Item>
                {dept === 'WAITING AREA' && <Item to="/kiosk/waiting" icon="ticket">Waiting tickets</Item>}
                {(dept === 'ABTC' || user.is_superadmin) && <Item to="/kiosk/abtc" icon="ticket">ABTC tickets</Item>}
                <Item to="/server-history" icon="history">Queue list</Item>
                <Item to="/queue-trail" icon="transfer">Queue trail</Item>
                <Item to="/audit-trail" icon="search">Audit trail</Item>
                {user.is_superadmin && <Item to="/queue-logs" icon="logs">Queue logs</Item>}
                {isAdmin ? (
                  <Dropdown label="System" badge={<Badge count={pendingRequests} label={requestsLabel} />} icon="building" active={systemActive}>
                    <Item to="/users" icon="users" badge={<Badge count={pendingRequests} label={requestsLabel} />}>Users</Item>
                    <Item to="/departments" icon="building">Departments</Item>
                    {user.is_superadmin && <Item to="/sections" icon="window">Windows</Item>}
                    {user.is_superadmin && <Item to="/backup" icon="database">Database backup</Item>}
                  </Dropdown>
                ) : (
                  <Item to="/users" icon="users">My user record</Item>
                )}
              </>
            )}
            <Dropdown
              align="right"
              icon="account"
              active={location.pathname === '/account'}
              label={
                <span className="who">
                  <strong>{user.username}</strong>
                  <small>{user.department || 'No department'}{user.is_superadmin ? ' (takeover)' : ''}</small>
                </span>
              }
            >
              {!kioskOnly && <Item to="/account" icon="account">My account</Item>}
              <Item to="/manual" icon="page">User manual</Item>
              <button className="nav-item logout" onClick={() => void logout()}>
                <Icon name="logout" />
                <span>Logout</span>
              </button>
            </Dropdown>
          </nav>
        </div>
      </header>
      <OfflineBanner />
      <main className="main">
        <header className="page-head">
          <h1>{title}</h1>
          <div className="page-actions">{actions}</div>
        </header>
        {children}
      </main>
    </div>
  );
}
