import { BASE } from '../base';
import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useSession } from '../auth';
import { Icon } from './ui';

function Item({ to, icon, children }: { to: string; icon: string; children: ReactNode }) {
  return (
    <NavLink to={to} end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
      <Icon name={icon} />
      <span>{children}</span>
    </NavLink>
  );
}

/** Signed-in shell: sidebar navigation gated by role, plus the page. */
export function Layout({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { user, logout } = useSession();
  const [open, setOpen] = useState(false);
  if (!user) {
    return null;
  }
  const dept = user.department.toUpperCase();
  const isAdmin = user.usertype === 'admin';
  const kioskOnly = user.view_mode === 'for_customer';

  return (
    <div className="shell">
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="brand">
          <img src={`${BASE}/img/logo.jpg`} alt="" />
          <div>
            <strong>RHU Queue</strong>
            <small>Management System</small>
          </div>
        </div>
        <div className="who">
          <strong>{user.username}</strong>
          <small>
            {user.department || 'No department'}
            {user.is_superadmin ? ' (takeover)' : ''}
          </small>
        </div>
        <nav onClick={() => setOpen(false)}>
          {kioskOnly ? (
            <>
              <p className="nav-label">Queue</p>
              {dept === 'ABTC' ? <Item to="/kiosk/abtc" icon="ticket">ABTC tickets</Item> : <Item to="/kiosk/waiting" icon="ticket">Waiting tickets</Item>}
            </>
          ) : (
            <>
              <p className="nav-label">Main</p>
              <Item to="/" icon="queue">Queue console</Item>
              {dept === 'WAITING AREA' && <Item to="/kiosk/waiting" icon="ticket">Waiting tickets</Item>}
              {(dept === 'ABTC' || user.is_superadmin) && <Item to="/kiosk/abtc" icon="ticket">ABTC tickets</Item>}
              <Item to="/server-history" icon="history">Queue list</Item>
              <Item to="/audit-trail" icon="search">Audit trail</Item>
              {user.is_superadmin && <Item to="/queue-logs" icon="logs">Queue logs</Item>}
              <p className="nav-label">System</p>
              <Item to="/users" icon="users">{isAdmin ? 'Users' : 'My user record'}</Item>
              {isAdmin && <Item to="/departments" icon="building">Departments</Item>}
              {user.is_superadmin && <Item to="/sections" icon="window">Windows</Item>}
              {user.is_superadmin && <Item to="/backup" icon="database">Database backup</Item>}
              <Item to="/account" icon="account">My account</Item>
            </>
          )}
        </nav>
        <button className="nav-item logout" onClick={() => void logout()}>
          <Icon name="logout" />
          <span>Logout</span>
        </button>
      </aside>
      <main className="main">
        <header className="page-head">
          <button className="icon-btn menu-btn" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            <Icon name="menu" />
          </button>
          <h1>{title}</h1>
          <div className="page-actions">{actions}</div>
        </header>
        {children}
      </main>
    </div>
  );
}
