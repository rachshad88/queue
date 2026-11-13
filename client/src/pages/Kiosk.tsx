import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, query } from '../api';
import { useSession } from '../auth';
import { OfflineBanner } from '../components/OfflineBanner';
import { formatDateTime } from '../format';
import { useServerOnline } from '../socket';

type Category = 'regular' | 'priority' | 'emergency';

function useIssue(endpoint: string, back: string) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** Ticket numbers come from the server, so the kiosk cannot issue any while offline. */
  const online = useServerOnline();
  const issue = async (body: Record<string, unknown>): Promise<void> => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError('');
    const result = await api(endpoint, { body });
    setBusy(false);
    if (!result.success) {
      setError(result.message ?? 'Failed to issue ticket. Please try again.');
      return;
    }
    navigate(`/ticket${query({ department_id: result.department_id, queue_number: result.queue_number, code: result.code, back })}`);
  };
  return { busy: busy || !online, error, issue };
}

function KioskFrame({ title, subtitle, error, children }: { title: string; subtitle: string; error: string; children: React.ReactNode }) {
  const { user, logout } = useSession();
  return (
    <div className="kiosk">
      <OfflineBanner detail="Tickets cannot be issued right now. Please ask the staff at the counter." />
      <div className="kiosk-card">
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {error && <p className="notice notice-error" style={{ marginTop: '1rem' }}>{error}</p>}
        {children}
        {user && (
          <p className="muted" style={{ marginTop: '1.5rem', fontSize: '0.85rem' }}>
            Signed in as {user.username}.{' '}
            {user.view_mode === 'for_customer' ? (
              <button className="btn btn-sm" onClick={() => void logout()}>Logout</button>
            ) : (
              <Link to="/">Back to the console</Link>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

const LABELS: Record<Category, [string, string]> = {
  regular: ['Regular', 'General patients'],
  priority: ['Priority', 'Senior, PWD, pregnant'],
  emergency: ['Emergency', 'Needs urgent care'],
};

function Buttons({ categories, busy, onPick }: { categories: Category[]; busy: boolean; onPick: (category: Category) => void }) {
  return (
    <div className="kiosk-buttons">
      {categories.map((category) => (
        <button key={category} className={`kiosk-btn ${category}`} disabled={busy} onClick={() => onPick(category)}>
          {LABELS[category][0]}
          <small>{LABELS[category][1]}</small>
        </button>
      ))}
    </div>
  );
}

/** Public Waiting Area ticket machine. Dental tickets queue here too, with their own numbers. */
export function KioskWaiting() {
  const { user } = useSession();
  const { busy, error, issue } = useIssue('/kiosk/waiting', '/kiosk/waiting');
  const all: Category[] = ['regular', 'priority', 'emergency'];
  return (
    <KioskFrame title="Take a queue number" subtitle="Tap the button that matches your visit. Your ticket will print next." error={error}>
      <div className="kiosk-group">
        <h2>Consultation (Waiting Area)</h2>
        <Buttons categories={all} busy={busy} onPick={(category) => void issue({ ticket_group: 'waiting', category })} />
      </div>
      <div className="kiosk-group">
        <h2>Dental</h2>
        <Buttons categories={all} busy={busy} onPick={(category) => void issue({ ticket_group: 'dental', category })} />
      </div>
      {user?.is_superadmin && (
        <div className="kiosk-group no-print">
          <button className="btn" disabled={busy} onClick={() => void issue({ ticket_group: 'waiting', category: 'regular', generate_test_number: true })}>
            Generate a test number (superadmin)
          </button>
          <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>A test number is a real ticket in the waiting queue.</p>
        </div>
      )}
    </KioskFrame>
  );
}

export function KioskAbtc() {
  const { busy, error, issue } = useIssue('/kiosk/abtc', '/kiosk/abtc');
  return (
    <KioskFrame title="ABTC queue number" subtitle="Animal Bite Treatment Center. Tap to take your number." error={error}>
      <div className="kiosk-group">
        <Buttons categories={['regular', 'priority']} busy={busy} onPick={(category) => void issue({ category })} />
      </div>
    </KioskFrame>
  );
}

/** Printable ticket. Prints once on load, then offers the way back to the kiosk. */
export function Ticket() {
  const [params] = useSearchParams();
  const [ticket, setTicket] = useState<Record<string, any> | null>(null);
  const back = params.get('back')?.startsWith('/kiosk/') ? params.get('back')! : '/kiosk/waiting';

  useEffect(() => {
    void api(`/ticket${query({ department_id: params.get('department_id'), queue_number: params.get('queue_number'), code: params.get('code') })}`).then(setTicket);
  }, [params]);
  useEffect(() => {
    if (ticket?.success) {
      const timer = window.setTimeout(() => window.print(), 400);
      return () => window.clearTimeout(timer);
    }
  }, [ticket]);

  if (!ticket) {
    return <div className="center-screen muted">Preparing your ticket</div>;
  }
  return (
    <div className="kiosk">
      <div>
        {ticket.success ? (
          <div className="ticket">
            <strong>RHU Queue Ticket</strong>
            <p className="muted">{ticket.department_name}</p>
            <div className="ticket-number">{ticket.queue_number}</div>
            {ticket.return_code && (
              <>
                <p className="muted">Return code</p>
                <div className="ticket-code">{ticket.return_code}</div>
              </>
            )}
            <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
              {formatDateTime(ticket.printed_at)}
              <br />
              Keep this ticket. Show the return code if you are asked to come back.
            </p>
          </div>
        ) : (
          <p className="notice notice-error">{ticket.message ?? 'Ticket not found.'}</p>
        )}
        <div className="row no-print" style={{ justifyContent: 'center', marginTop: '1rem' }}>
          {ticket.success && <button className="btn" onClick={() => window.print()}>Print again</button>}
          <Link className="btn btn-primary" to={back} style={{ textDecoration: 'none' }}>Done</Link>
        </div>
      </div>
    </div>
  );
}
