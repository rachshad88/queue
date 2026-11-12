import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { Icon } from '../components/ui';
import { useDepartmentEvents } from '../socket';
import { announceRepeat, announceServe, soundTest, unlockAudio } from '../voice';

interface Serving {
  section?: string;
  queue_number: string;
  category: string;
  staff?: string | null;
  is_returning?: boolean;
}
interface Dept {
  id: number;
  name: string;
  server: string | null;
  is_sectioned: boolean;
  serving: Serving[];
  waiting: { id: number; queue_number: string; category: string }[];
  waiting_total: number;
}

const load = <T,>(key: string, fallback: T): T => {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the choice just will not persist.
  }
};

/** Public wall monitor: who is being served where, with spoken announcements. */
export function Live() {
  const [options, setOptions] = useState<{ id: number; name: string }[]>([]);
  const [selected, setSelected] = useState<number[]>(() => load('live_selected_depts', []));
  const [announceOn, setAnnounceOn] = useState<boolean>(() => load('live_announce', true));
  const [showSide, setShowSide] = useState(true);
  const [data, setData] = useState<Dept[]>([]);
  const [failed, setFailed] = useState(false);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const previous = useRef<Record<string, string>>({});
  const recent = useRef<Record<string, { n: string; t: number }>>({});
  const announceRef = useRef(announceOn);
  announceRef.current = announceOn;

  useEffect(() => {
    void api<any>('/live-config').then((cfg) => setOptions(cfg.departments ?? []));
    window.addEventListener('pointerdown', unlockAudio, { once: true });
  }, []);

  // One announcement per number change, whichever of the socket payload or
  // the poll notices it first.
  const announceOnce = useCallback((keys: string[], number: string, flashKey: string) => {
    const now = Date.now();
    const seen = keys.some((k) => recent.current[k]?.n === number && now - recent.current[k].t < 4500);
    for (const k of keys) {
      recent.current[k] = { n: number, t: now };
      previous.current[k] = number;
    }
    if (seen) {
      return;
    }
    setFlash((f) => ({ ...f, [flashKey]: now + 5000 }));
    if (announceRef.current) {
      announceServe(number);
    }
  }, []);

  const fetchServing = useCallback(async () => {
    if (selected.length === 0) {
      setData([]);
      return;
    }
    const result = await api<any>(`/live-serving?ids=${selected.join(',')}`);
    if (!Array.isArray(result)) {
      setFailed(true);
      return;
    }
    setFailed(false);
    const next: Record<string, string> = {};
    for (const dept of result as Dept[]) {
      const entries = dept.is_sectioned ? dept.serving.map((s) => [`${dept.id}:${s.section}`, s] as const) : dept.serving.slice(0, 1).map((s) => [`d${dept.id}`, s] as const);
      for (const [key, s] of entries) {
        if (!s.queue_number || s.queue_number === '-') {
          continue;
        }
        next[key] = s.queue_number;
        if (previous.current[key] !== undefined && previous.current[key] !== s.queue_number) {
          announceOnce([key], s.queue_number, key);
        }
      }
    }
    previous.current = next;
    setData(result as Dept[]);
  }, [selected, announceOnce]);

  useEffect(() => {
    void fetchServing();
    const timer = window.setInterval(() => void fetchServing(), 5000);
    return () => window.clearInterval(timer);
  }, [fetchServing]);

  useDepartmentEvents(selected, 'live', {
    'queue-updated': (payload) => {
      const number = String(payload?.queue_number ?? '').trim();
      const dept = Number(payload?.dept);
      if (number && selected.includes(dept)) {
        const label = String(payload?.section ?? '').trim();
        const keys = [`d${dept}`, ...(label ? [`${dept}:${label}`] : [])];
        announceOnce(keys, number, label ? `${dept}:${label}` : `d${dept}`);
      }
      void fetchServing();
    },
    'repeat-call': (payload) => {
      const number = String(payload?.queue_number ?? '').trim();
      if (number && selected.includes(Number(payload?.department_id)) && announceRef.current) {
        announceRepeat(number, String(payload?.department_name ?? '').trim());
      }
    },
  });

  const toggle = (id: number): void => {
    setSelected((list) => {
      const next = list.includes(id) ? list.filter((v) => v !== id) : [...list, id];
      save('live_selected_depts', next);
      return next;
    });
  };

  const cards = useMemo(() => {
    const now = Date.now();
    const out: { key: string; dept: string; label: string; number: string; staff: string; flashing: boolean }[] = [];
    for (const dept of data) {
      if (dept.is_sectioned) {
        for (const s of dept.serving) {
          const key = `${dept.id}:${s.section}`;
          out.push({ key, dept: dept.name, label: s.section ?? dept.name, number: s.queue_number, staff: s.staff ?? '', flashing: (flash[key] ?? 0) > now });
        }
      } else {
        const s = dept.serving[0];
        const key = `d${dept.id}`;
        out.push({ key, dept: dept.name, label: dept.name, number: s?.queue_number ?? '-', staff: dept.server ?? '', flashing: (flash[key] ?? 0) > now });
      }
    }
    return out;
  }, [data, flash]);

  const waitingDepts = data.filter((d) => d.waiting.length > 0);

  return (
    <div className="wall">
      {showSide && (
        <aside className="wall-side no-print">
          <div className="row">
            <strong className="grow">Live Queue Monitor</strong>
            <button className="icon-btn" onClick={() => setShowSide(false)} aria-label="Hide settings">
              <Icon name="close" />
            </button>
          </div>
          <h3>Departments shown</h3>
          {options.map((d) => (
            <label key={d.id}>
              <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} /> {d.name}
            </label>
          ))}
          <h3>Sound</h3>
          <label>
            <input
              type="checkbox"
              checked={announceOn}
              onChange={(e) => {
                setAnnounceOn(e.target.checked);
                save('live_announce', e.target.checked);
              }}
            />{' '}
            Announce numbers
          </label>
          <button className="btn btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => soundTest()}>
            Test sound
          </button>
          <p style={{ fontSize: '0.8rem', color: '#f3d6d6', marginTop: '1rem' }}>Tap anywhere once after opening this page so the browser allows sound.</p>
        </aside>
      )}
      <div className="wall-main">
        {!showSide && (
          <button className="icon-btn no-print" onClick={() => setShowSide(true)} aria-label="Show settings">
            <Icon name="menu" size={22} />
          </button>
        )}
        <div className="wall-grid">
          {cards.length === 0 && <p style={{ color: '#f3d6d6' }}>{failed ? 'Cannot load the queue right now. Retrying.' : 'Select departments in the side panel to show their serving numbers.'}</p>}
          {cards.map((card) => {
            const idle = !card.number || card.number === '-';
            return (
              <div key={card.key} className={`wall-card${idle ? '' : ' live'}${card.flashing && !idle ? ' flash' : ''}`}>
                <div className="dept">{card.label}</div>
                <div key={idle ? 'idle' : card.number} className={`num${idle ? ' idle' : ''}`}>{idle ? '-' : card.number}</div>
                <div className="staff">{card.staff}</div>
              </div>
            );
          })}
        </div>
        {waitingDepts.length > 0 && (
          <aside className="wall-rail">
            <h3>Waiting</h3>
            {waitingDepts.map((dept) => (
              <div key={dept.id} className="rail-dept">
                <div className="rail-dept-head">
                  <span>{dept.name}</span>
                  <span>{dept.waiting_total}</span>
                </div>
                <div className="rail-nums">
                  {dept.waiting.map((w) => (
                    <span key={w.id} className={`rail-num ${w.category}`}>{w.queue_number}</span>
                  ))}
                </div>
              </div>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}
