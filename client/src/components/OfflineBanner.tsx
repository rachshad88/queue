import { useServerOnline } from '../socket';

/** Shown on every screen while the queue server cannot be reached. */
export function OfflineBanner({ detail = 'Showing the last saved information. Actions are paused until the connection is back.' }: { detail?: string }) {
  const online = useServerOnline();
  if (online) {
    return null;
  }
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <strong>Offline</strong>
      <span>{detail}</span>
    </div>
  );
}
