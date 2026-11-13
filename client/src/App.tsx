import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './auth';
import { prefetchFor } from './prefetch';
import { Account } from './pages/Account';
import { AuditTrail } from './pages/AuditTrail';
import { Backup } from './pages/Backup';
import { ChooseSection } from './pages/ChooseSection';
import { Console } from './pages/Console';
import { Departments } from './pages/Departments';
import { KioskAbtc, KioskWaiting, Ticket } from './pages/Kiosk';
import { Live } from './pages/Live';
import { Login } from './pages/Login';
import { QueueLogs } from './pages/QueueLogs';
import { SectionControl } from './pages/SectionControl';
import { ServerHistory } from './pages/ServerHistory';
import { Users } from './pages/Users';

type Gate = 'any' | 'admin' | 'superadmin';

function Protected({ gate = 'any', children }: { gate?: Gate; children: ReactNode }) {
  const { user, endReason } = useSession();
  const location = useLocation();
  if (!user) {
    return <Navigate to={endReason ? `/login?reason=${endReason}` : '/login'} replace state={{ from: location.pathname }} />;
  }
  // A kiosk-mode login only hands out tickets.
  if (user.view_mode === 'for_customer') {
    return <Navigate to={user.department.toUpperCase() === 'ABTC' ? '/kiosk/abtc' : '/kiosk/waiting'} replace />;
  }
  if ((gate === 'admin' && user.usertype !== 'admin') || (gate === 'superadmin' && !user.is_superadmin)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export function App() {
  const { ready, user } = useSession();
  // Warm every screen this account can open, so each one paints from cache.
  useEffect(() => {
    prefetchFor(user);
  }, [user?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready) {
    return <div className="center-screen muted">Loading</div>;
  }
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/kiosk/waiting" element={<KioskWaiting />} />
      <Route path="/kiosk/abtc" element={<KioskAbtc />} />
      <Route path="/ticket" element={<Ticket />} />
      <Route path="/live" element={<Live />} />
      <Route path="/" element={<Protected><Console /></Protected>} />
      <Route path="/choose-section/:kind" element={<Protected><ChooseSection /></Protected>} />
      <Route path="/server-history" element={<Protected><ServerHistory /></Protected>} />
      <Route path="/audit-trail" element={<Protected><AuditTrail /></Protected>} />
      <Route path="/queue-logs" element={<Protected gate="superadmin"><QueueLogs /></Protected>} />
      <Route path="/users" element={<Protected><Users /></Protected>} />
      <Route path="/departments" element={<Protected gate="admin"><Departments /></Protected>} />
      <Route path="/sections" element={<Protected gate="superadmin"><SectionControl /></Protected>} />
      <Route path="/backup" element={<Protected gate="superadmin"><Backup /></Protected>} />
      <Route path="/account" element={<Protected><Account /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
