import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../auth';
import { Layout } from '../components/Layout';
import { useLoader, useToast } from '../components/ui';
import { useDepartmentEvents } from '../socket';

interface Row {
  id: number;
  section_name: string;
  occupied_by: number | null;
  staff: string | null;
  /** Calls emergency and priority patients too; otherwise regular tickets only. */
  serves_priority: boolean;
}

/** Admission and Waiting staff pick the window they are sitting at before serving. */
export function ChooseSection() {
  const { kind = '' } = useParams();
  const { user, config, refresh } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const valid = kind === 'admission' || kind === 'waiting';
  const dept = kind === 'waiting' ? config.waiting_dept_id : config.admission_dept_id;
  const { data, reload } = useLoader(() => api(`/sections/${kind}`), [kind]);
  useDepartmentEvents([dept], 'controller', { 'queue-updated': reload });
  useEffect(() => {
    const timer = window.setInterval(reload, 15000);
    return () => window.clearInterval(timer);
  }, [reload]);

  if (!valid || (data && data.success === false)) {
    return <Navigate to="/" replace />;
  }
  const ownDept = user?.department_id === dept;

  const claim = async (row: Row, override: boolean): Promise<void> => {
    if (override && !window.confirm(`${row.section_name} is held by ${row.staff ?? 'another staff member'}. Take it over?`)) {
      return;
    }
    const result = await api(`/sections/${kind}/assign`, { body: { section_id: row.id, override } });
    if (!result.success) {
      toast(result.message ?? 'Could not take that window.', 'error');
      reload();
      return;
    }
    if (result.took_over) {
      toast(`You are now serving ${result.took_over.queue_number}${result.took_over.from ? `, left at this window by ${result.took_over.from}` : ''}. Finish or transfer them first.`, 'success');
    }
    navigate('/');
  };

  const kioskMode = async (): Promise<void> => {
    await api('/for-customer', { body: { section_id: 0 } });
    await refresh();
    navigate(kind === 'waiting' ? '/kiosk/waiting' : '/kiosk/waiting');
  };

  const rows: Row[] = data?.sections ?? [];
  return (
    <Layout title={kind === 'waiting' ? 'Choose your Waiting Area window' : 'Choose your Admission window'}>
      <div className="stack">
        <p className="muted">Pick the window you are working at. Patients you call are announced with this window.</p>
        <div className="window-grid">
          {rows.map((row) => {
            const mine = row.occupied_by === user?.user_id;
            const taken = row.occupied_by !== null && !mine;
            return (
              <div key={row.id} className={`window-card${mine ? ' mine' : taken ? ' taken' : ''}`}>
                <h2>{row.section_name}</h2>
                <span className={`badge ${row.serves_priority ? 'cat-priority' : 'cat-regular'}`}>{row.serves_priority ? 'Priority + regular' : 'Regular only'}</span>
                <p className="muted">{mine ? 'You are at this window' : taken ? `Held by ${row.staff ?? 'staff'}` : 'Free'}</p>
                {!taken && (
                  <button className="btn btn-primary" onClick={() => void claim(row, false)}>
                    {mine ? 'Continue here' : 'Use this window'}
                  </button>
                )}
                {taken && ownDept && (
                  <button className="btn" onClick={() => void claim(row, true)}>
                    Take over
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="card">
          <h3>Ticket desk only</h3>
          <p className="muted" style={{ margin: '0.3rem 0 0.7rem' }}>
            Use this login just to hand out queue tickets. To serve patients again, log out and sign back in.
          </p>
          <button className="btn" onClick={() => void kioskMode()}>
            Switch to ticket desk
          </button>
        </div>
      </div>
    </Layout>
  );
}
