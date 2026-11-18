import { CategoryBadge, Modal, StatusBadge, useApi } from './ui';
import { formatDateTime } from '../format';

type JourneyStep = {
  id: string;
  at: string;
  action: string;
  queue_number: string;
  department: string;
  from_department: string | null;
  to_department: string | null;
  operator: string | null;
  approved_by: string | null;
};

type Journey = {
  success: boolean;
  message?: string;
  queue_number: string;
  category: string;
  status: string;
  department: string;
  issued_in: string;
  issued_at: string;
  issued_by: string | null;
  path: string[];
  steps: JourneyStep[];
};

const STEP_LABELS: Record<string, string> = {
  serving: 'Called to the window',
  serve: 'Served from the list',
  finished: 'Finished',
  returned_to_queue: 'Put back in the queue',
  taken_over: 'Taken over by another staffer',
  transferred_in: 'Transferred',
  prioritized_in: 'Re-queued as a returning patient',
  pool_taken: 'Taken by mutual help',
  hold: 'Put on hold',
  unhold: 'Taken off hold',
  remove: 'Removed from the queue',
};

const stepLabel = (action: string): string => STEP_LABELS[action] ?? action.replace(/_/g, ' ');

/** Where one ticket has been today: the departments in order, then every step with its time and staff. */
export function JourneyModal({ queueId, onClose }: { queueId: number; onClose: () => void }) {
  const { data, loading } = useApi<Journey>(`/queue-journey?id=${queueId}`);
  const ready = data?.success ? data : null;

  return (
    <Modal title={ready ? `Journey of ${ready.queue_number}` : 'Ticket journey'} onClose={onClose} wide>
      {loading && !data && <p className="muted">Loading…</p>}
      {data && !data.success && <p className="notice notice-error">{data.message ?? 'Could not load this ticket.'}</p>}
      {ready && (
        <div className="journey">
          <div className="journey-summary">
            <CategoryBadge category={ready.category} /> <StatusBadge status={ready.status} />
            <span className="muted">Now in <strong>{ready.department}</strong></span>
          </div>

          <ol className="journey-path" aria-label="Departments visited, in order">
            {ready.path.map((name, index) => (
              <li key={`${name}-${index}`} className={index === ready.path.length - 1 ? 'is-current' : ''}>{name}</li>
            ))}
          </ol>

          <ol className="journey-steps">
            <li>
              <time>{formatDateTime(ready.issued_at)}</time>
              <div>
                <strong>Ticket issued</strong> in {ready.issued_in}
                <div className="muted">{ready.issued_by ? `By ${ready.issued_by}` : 'From the kiosk'}</div>
              </div>
            </li>
            {ready.steps.map((step) => (
              <li key={step.id} className={step.from_department ? 'is-move' : ''}>
                <time>{formatDateTime(step.at)}</time>
                <div>
                  <strong>{stepLabel(step.action)}</strong>
                  {step.from_department ? <> from <strong>{step.from_department}</strong> to <strong>{step.to_department}</strong></> : <> in {step.department}</>}
                  <div className="muted">
                    {step.queue_number}
                    {step.operator ? ` · ${step.operator}` : ' · System'}
                    {step.approved_by ? ` · approved by ${step.approved_by}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Modal>
  );
}
