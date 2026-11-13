import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { Icon, useApi } from '../components/ui';
import { OfflineBanner } from '../components/OfflineBanner';
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

/** The board is a fixed 2 × 2 grid of cards. */
const BOARD_SLOTS = 4;

/** Public wall monitor: who is being served where, with spoken announcements. */
export function Live() {
  // Saved on this device, so the department picker is there at once on reload.
  const { data: liveConfig } = useApi<{ departments?: { id: number; name: string }[]; admission_sections?: string[]; waiting_sections?: string[] }>('/live-config');
  const options = liveConfig?.departments ?? [];
  const [selected, setSelected] = useState<number[]>(() => load('live_selected_depts', []));
  const [announceOn, setAnnounceOn] = useState<boolean>(() => load('live_announce', true));
  // Settings float over the board; they open by themselves only when nothing is chosen yet.
  const [showSide, setShowSide] = useState(() => load<number[]>('live_selected_depts', []).length === 0);
  // Last board seen, so the wall still shows numbers after a reload while offline.
  const [data, setData] = useState<Dept[]>(() => load('live_last_data', []));
  const [failed, setFailed] = useState(false);
  const [flash, setFlash] = useState<Record<string, number>>({});
  const previous = useRef<Record<string, string>>({});
  const recent = useRef<Record<string, { n: string; t: number }>>({});
  const announceRef = useRef(announceOn);
  announceRef.current = announceOn;

  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio, { once: true });
  }, []);

  // One announcement per number change, whichever of the socket payload or
  // the follow-up refresh notices it first.
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
    save('live_last_data', result);
  }, [selected, announceOnce]);

  useEffect(() => {
    void fetchServing();
  }, [fetchServing]);

  useDepartmentEvents(selected, 'live', {
    // Catch up on anything missed while the socket was down.
    connect: () => void fetchServing(),
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

  /** Cards a department puts on the board: one per window for Admission and Waiting Area, else one. */
  const cardCount = (id: number): number => {
    const name = options.find((d) => d.id === id)?.name.toUpperCase() ?? '';
    if (name.includes('ADMISSION')) {
      return Math.max(1, liveConfig?.admission_sections?.length ?? 1);
    }
    if (name.includes('WAITING')) {
      return Math.max(1, liveConfig?.waiting_sections?.length ?? 1);
    }
    return 1;
  };
  const usedSlots = selected.reduce((sum, id) => sum + cardCount(id), 0);

  // A selection saved before the 4-card board existed is trimmed (in order) to what fits.
  useEffect(() => {
    if (!liveConfig?.departments || usedSlots <= BOARD_SLOTS) {
      return;
    }
    let room = BOARD_SLOTS;
    const fitted = selected.filter((id) => {
      const slots = cardCount(id);
      if (slots > room) {
        return false;
      }
      room -= slots;
      return true;
    });
    setSelected(fitted);
    save('live_selected_depts', fitted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveConfig, usedSlots]);

  const toggle = (id: number): void => {
    setSelected((list) => {
      const adding = !list.includes(id);
      if (adding && list.reduce((sum, v) => sum + cardCount(v), 0) + cardCount(id) > BOARD_SLOTS) {
        return list;
      }
      const next = adding ? [...list, id] : list.filter((v) => v !== id);
      save('live_selected_depts', next);
      return next;
    });
  };

  const cards = useMemo(() => {
    const now = Date.now();
    const out: { key: string; dept: string; label: string; number: string; staff: string; flashing: boolean }[] = [];
    // Only what is selected now, even while an older saved board is on screen.
    for (const dept of data.filter((d) => selected.includes(d.id))) {
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
  }, [data, flash, selected]);

  const waitingDepts = data.filter((d) => selected.includes(d.id) && d.waiting.length > 0);
  // Always four equal slots (2 × 2); unused ones stay as dim placeholders so the grid never reflows.
  const board = cards.slice(0, BOARD_SLOTS);
  const emptySlots = BOARD_SLOTS - board.length;

  return (
    <div className="wall">
      <OfflineBanner detail="Reconnecting… the numbers shown may be out of date." />
      {showSide && (
        <aside className="wall-side no-print">
          <div className="row">
            <strong className="grow">Live Queue Monitor</strong>
            <button className="icon-btn" onClick={() => setShowSide(false)} aria-label="Hide settings">
              <Icon name="close" />
            </button>
          </div>
          <h3>Cards shown ({usedSlots} of {BOARD_SLOTS})</h3>
          {options.map((d) => {
            const checked = selected.includes(d.id);
            const slots = cardCount(d.id);
            const full = !checked && usedSlots + slots > BOARD_SLOTS;
            return (
              <label key={d.id} className={full ? 'is-full' : undefined}>
                <input type="checkbox" checked={checked} disabled={full} onChange={() => toggle(d.id)} /> {d.name}
                {slots > 1 && <small className="wall-side-slots">{slots} cards</small>}
              </label>
            );
          })}
          <p className="wall-side-note">The board holds {BOARD_SLOTS} cards. Untick one to make room.</p>
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
          <p className="wall-side-note">Tap anywhere once after opening this page so the browser allows sound.</p>
        </aside>
      )}
      <main className="wall-board">
        {!showSide && (
          <button className="icon-btn wall-settings no-print" onClick={() => setShowSide(true)} aria-label="Show settings">
            <Icon name="menu" size={22} />
          </button>
        )}
        <div className="wall-grid">
          {board.map((card) => {
            const idle = !card.number || card.number === '-';
            return (
              <div key={card.key} className={`wall-card${idle ? '' : ' live'}${card.flashing && !idle ? ' flash' : ''}`}>
                <div className="dept">{card.label}</div>
                <div key={idle ? 'idle' : card.number} className={`num${idle ? ' idle' : ''}`}>{idle ? '-' : card.number}</div>
                <div className="staff">{card.staff}</div>
              </div>
            );
          })}
          {Array.from({ length: emptySlots }, (_, i) => (
            <div key={`empty-${i}`} className="wall-card wall-card-empty" aria-hidden="true">
              {i === 0 && board.length === 0 && <p>{failed ? 'Cannot load the queue right now. Retrying.' : 'Open the menu to choose what this screen shows.'}</p>}
            </div>
          ))}
        </div>
      </main>
      <aside className="wall-rail">
        <h3>Waiting</h3>
        {waitingDepts.length === 0 && <p className="wall-rail-empty">No one waiting</p>}
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
    </div>
  );
}
