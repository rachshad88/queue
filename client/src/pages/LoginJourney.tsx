import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { BASE } from '../base';

/*
 * The landing page below the hero: a playable-feeling scroll.
 *  1. World 1: the patient walks the visit as you scroll (sticky side-scroller).
 *  2. Player select: the three ticket types as fighters.
 *  3. Stage select: every service on a world map; the patient hops stage to stage as you scroll.
 *  4. Continue? countdown into the live monitor.
 */

export const STEPS = [
  { title: 'Take a number', text: 'Tap Regular, Priority or Emergency at the kiosk. Your ticket prints right away.' },
  { title: 'Wait and watch', text: 'Sit in the waiting area. The wall monitor shows every window and who it is serving.' },
  { title: 'Hear your number', text: 'Your number is shown and called aloud with the window you should go to.' },
  { title: 'Next service', text: 'Staff pass you to the clinic, laboratory or pharmacy with the same ticket until you are done.' },
];

const PRIORITY_WINDOWS = ['Waiting Area 1', 'Waiting Area 2', 'Admission 3', 'Admission 4'];

type LiveConfig = { departments?: { id: number; name: string }[]; admission_sections?: string[]; waiting_sections?: string[] };

const pad = (value: number): string => String(value).padStart(2, '0');
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
type Vars = CSSProperties & Record<`--${string}`, string | number>;

// ---- Pixel art -----------------------------------------------------------------

/** Draws character-grid art as crisp SVG rects; '.' is transparent. Runs of one colour merge into one rect. */
function PixelArt({ art, palette, className }: { art: string[]; palette: Record<string, string>; className?: string }) {
  const rects = useMemo(() => {
    const out: ReactNode[] = [];
    art.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const fill = palette[row[x]];
        if (!fill) {
          x++;
          continue;
        }
        let width = 1;
        while (row[x + width] === row[x]) {
          width++;
        }
        out.push(<rect key={`${x}-${y}`} x={x} y={y} width={width} height={1} fill={fill} />);
        x += width;
      }
    });
    return out;
  }, [art, palette]);
  return (
    <svg className={className} viewBox={`0 0 ${art[0].length} ${art.length}`} shapeRendering="crispEdges" aria-hidden="true">
      {rects}
    </svg>
  );
}

const INK = '#12051e';
const WALKER_PALETTE = { H: '#3b2314', S: '#f1c27d', K: INK, C: '#3f97e8', P: '#2e2e36' };
const WALK_TOP = ['....HHHHH...', '...HHHHHHH..', '...HHSSSSS..', '...HSSSSKS..', '...HSSSSSSS.', '....SSSSS...', '....CCCC....', '...CCCCCC...'];
const WALK_A = [...WALK_TOP, '...CCCCCCS..', '...SCCCCC...', '...CCCCCC...', '...PPPPPP...', '...PP..PP...', '...PP..PP...', '...PP..PP...', '..KKK.KKK...'];
const WALK_B = [...WALK_TOP, '...CCCCCC...', '..SCCCCCC...', '...CCCCCCS..', '...PPPPPP...', '..PPP..PPP..', '.PPP....PPP.', '.PP......PP.', 'KKK......KKK'];

/** The patient, seen from the side. Steps whenever the page is scrolling, turns round when scrolling back up. */
export function Walker({ className = '', children }: { className?: string; children?: ReactNode }) {
  return (
    <span className={`walker ${className}`} aria-hidden="true">
      <PixelArt art={WALK_A} palette={WALKER_PALETTE} className="walker-a" />
      <PixelArt art={WALK_B} palette={WALKER_PALETTE} className="walker-b" />
      {children}
    </span>
  );
}

const FRONT_BODY = [
  '...SSKSSKSS...', '...SSSSSSSS...', '...SSSMMSSS...', '....SSSSSS....', '...CCCCCCCC...', '..CCCCCCCCCC..',
  '.SCCCCCCCCCCS.', '.SCCCCCCCCCCS.', '.SCCCCCCCCCCS.', '..CCCCCCCCCC..', '...PPPPPPPP...', '...PPPPPPPP...',
  '...PPP..PPP...', '...PPP..PPP...', '...PPP..PPP...', '..KKKK..KKKK..',
];
const withCane = (rows: string[]): string[] => rows.map((row, y) => (y === 8 ? row.slice(0, 12) + 'ww' : y > 8 ? row.slice(0, 13) + 'w' : row));
const withCross = (rows: string[]): string[] =>
  rows.map((row, y) => (y === 9 || y === 11 ? '.SCCCCWWCCCCS.' : y === 10 ? '.SCCCWWWWCCCS.' : row));

const FIGHTERS = {
  regular: {
    art: ['...BBBBBBBB...', '..BBBBBBBBBB..', '...HSSSSSSH...', ...FRONT_BODY],
    palette: { B: '#1d5fa8', H: '#3b2314', S: '#f1c27d', K: INK, M: '#b5523b', C: '#3f97e8', P: '#2e2e36' },
  },
  priority: {
    art: withCane(['....GGGGGG....', '...GGGGGGGG...', '...GSSSSSSG...', '...SKKSKKSS...', ...FRONT_BODY.slice(1)]),
    palette: { G: '#d9dee8', S: '#e8b98a', K: INK, M: '#b5523b', C: '#f2b705', P: '#5b4b3a', w: '#7a4a1f' },
  },
  emergency: {
    art: withCross(['....HHHHHH....', '...WWWWWWWW...', '...WWWRRWWW...', ...FRONT_BODY]),
    palette: { H: '#1b1030', W: '#ffffff', R: '#e63946', S: '#f1c27d', K: INK, M: '#b5523b', C: '#e63946', P: '#2e2e36' },
  },
};

const KIOSK = [
  'KKKKKKKKKKKKKKKK', 'KRRRRRRRRRRRRRRK', 'KRRRRRRRRRRRRRRK', 'KKKKKKKKKKKKKKKK', 'KGGGGGGGGGGGGGGK', 'KGKKKKKKKKKKKKGK',
  'KGKBBBBBBBBBBKGK', 'KGKBWWWWWWWWBKGK', 'KGKBBBBBBBBBBKGK', 'KGKBYYYBBRRRBKGK', 'KGKBYYYBBRRRBKGK', 'KGKBBBBBBBBBBKGK',
  'KGKKKKKKKKKKKKGK', 'KGGGGGGGGGGGGGGK', 'KGGGKKKKKKKKGGGK', 'KGGGGGGGGGGGGGGK', 'KGGGGGGGGGGGGGGK', 'KDDDDDDDDDDDDDDK',
  'KDDDDDDDDDDDDDDK', 'KKKKKKKKKKKKKKKK',
];
const KIOSK_PALETTE = { K: INK, R: '#e63946', G: '#d9dee8', B: '#2a6f9a', W: '#9ff6ff', Y: '#ffd84a', D: '#8d94a3' };
const BENCH = ['KKKKKKKKKKKKKKKKKK', 'KwwwwwwwwwwwwwwwwK', 'KKKKKKKKKKKKKKKKKK', 'KwwwwwwwwwwwwwwwwK', 'KKKKKKKKKKKKKKKKKK', '.KK............KK.', '.KK............KK.'];
const BENCH_PALETTE = { K: INK, w: '#c98a4b' };
const SPEAKER = [
  '..........KK..', '........KKGK..', '......KKGGGK..', 'KKKK.KGGGGGK..', 'KGGKKGGGGGGK..', 'KGGGGGGGGGGK..',
  'KGGGGGGGGGGK..', 'KGGKKGGGGGGK..', 'KKKK.KGGGGGK..', '......KKGGGK..', '........KKGK..', '..........KK..',
];
const SPEAKER_PALETTE = { K: INK, G: '#ffd84a' };
const HOUSE = [
  '.......KK.......', '.....KKRRKK.....', '...KKRRRRRRKK...', '.KKRRRRRRRRRRKK.', 'KRRRRRRRRRRRRRRK', 'KKKKKKKKKKKKKKKK',
  '.KWWWWWWWWWWWWK.', '.KWYYWWWWWWYYWK.', '.KWYYWWDDWWYYWK.', '.KWWWWWDDWWWWWK.', '.KWWWWWDDWWWWWK.', '.KWWWWWDDWWWWWK.',
  '.KKKKKKKKKKKKKK.',
];
const ROOFS = ['#e63946', '#3f97e8', '#f2b705', '#1f7a3d', '#9b5de5'];

// ---- Shared hooks ---------------------------------------------------------------

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = (): void => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return reduced;
}

function useInView(ref: RefObject<HTMLElement | null>, threshold = 0.25): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || !('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return inView;
}

/** Runs `measure` on every scroll/resize frame (at most once per frame). */
function useScrollFrame(measure: () => void, enabled = true): void {
  const latest = useRef(measure);
  latest.current = measure;
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let frame = 0;
    const run = (): void => {
      frame = 0;
      latest.current();
    };
    const schedule = (): void => {
      if (!frame) {
        frame = requestAnimationFrame(run);
      }
    };
    run();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [enabled]);
}

/**
 * Page-wide scroll state on the landing root: `--page-p` (0–1), `--nav-h`, and
 * `data-walking` / `data-dir` so every walker steps while the page moves.
 */
export function useScrollMotion(rootRef: RefObject<HTMLElement | null>): void {
  const last = useRef({ y: window.scrollY, timer: 0 });
  useScrollFrame(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const nav = root.querySelector<HTMLElement>('.arcade-nav');
    root.style.setProperty('--nav-h', `${nav?.offsetHeight ?? 64}px`);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    root.style.setProperty('--page-p', max > 0 ? clamp01(window.scrollY / max).toFixed(4) : '0');
    const y = window.scrollY;
    if (y !== last.current.y) {
      root.dataset.walking = '';
      root.dataset.dir = y < last.current.y ? 'up' : 'down';
      window.clearTimeout(last.current.timer);
      last.current.timer = window.setTimeout(() => delete root.dataset.walking, 180);
    }
    last.current.y = y;
  });
}

/** Reveals `text` a couple of characters at a time, like an RPG text box. */
function useTyped(text: string, enabled: boolean): string {
  const [count, setCount] = useState(enabled ? 0 : text.length);
  useEffect(() => {
    if (!enabled) {
      setCount(text.length);
      return;
    }
    setCount(0);
    const timer = window.setInterval(() => {
      setCount((n) => {
        if (n >= text.length) {
          window.clearInterval(timer);
          return n;
        }
        return n + 2;
      });
    }, 22);
    return () => window.clearInterval(timer);
  }, [text, enabled]);
  return text.slice(0, count);
}

// ---- 1. World 1: the visit as a side-scroller -------------------------------------

/** Where each level's landmark sits along the run (0–1 of the scroll). */
const CHECKPOINTS = [0.1, 0.37, 0.64, 0.9];
const COINS = Array.from({ length: 18 }, (_, k) => (k + 0.5) / 18).filter((q) => CHECKPOINTS.every((c) => Math.abs(c - q) > 0.035));
/** The walker stands at 34% of the screen; the track scrolls 3 screens past it. */
const trackLeft = (q: number): string => `${34 + 300 * q}cqw`;

const LANDMARKS = [
  <div key="kiosk" className="prop prop-kiosk">
    <PixelArt art={KIOSK} palette={KIOSK_PALETTE} />
    <span className="prop-slip">R-012</span>
  </div>,
  <div key="wait" className="prop prop-wait">
    <div className="prop-tv">
      <small>Now serving</small>
      <b>R-011</b>
      <small>Window 2</small>
    </div>
    <PixelArt art={BENCH} palette={BENCH_PALETTE} className="prop-bench" />
  </div>,
  <div key="call" className="prop prop-call">
    <PixelArt art={SPEAKER} palette={SPEAKER_PALETTE} className="prop-horn" />
    <span className="prop-wave" />
    <span className="prop-wave" />
    <span className="prop-wave" />
    <p className="prop-bubble">R-012, please go to Window 2!</p>
  </div>,
  <div key="clinic" className="prop prop-clinic">
    <span className="clinic-roof" />
    <span className="clinic-sign">Clinic</span>
    <span className="clinic-cross" />
    <span className="clinic-door"><i /></span>
  </div>,
];

function VisitRun() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState(-1);
  const [coins, setCoins] = useState(0);
  const [cleared, setCleared] = useState(false);

  useScrollFrame(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) {
      return;
    }
    const stickyTop = parseFloat(getComputedStyle(stage).top) || 0;
    const travel = section.offsetHeight - stage.offsetHeight;
    const progress = travel > 0 ? clamp01((stickyTop - section.getBoundingClientRect().top) / travel) : 0;
    stage.style.setProperty('--p', progress.toFixed(4));
    setLevel(CHECKPOINTS.filter((c) => progress >= c - 0.03).length - 1);
    setCoins(COINS.filter((q) => progress >= q).length);
    setCleared(progress >= 0.97);
  }, !reduced);

  const intro = 'Scroll down to walk a patient from the gate to the doctor.';
  const message = level < 0 ? intro : cleared ? 'Stage clear! The same ticket now takes you to the laboratory, pharmacy or any other service.' : STEPS[level].text;
  const typed = useTyped(message, !reduced);
  const score = coins * 10 + (level + 1) * 100 + (cleared ? 500 : 0);

  if (reduced) {
    return (
      <section className="run-static" id="how">
        <div className="arcade-wrap">
          <p className="arcade-kicker">How to play</p>
          <h2 className="arcade-heading">Four levels from the door to the doctor</h2>
          <ol>
            {STEPS.map((step, index) => (
              <li key={step.title} className="run-stop on">
                <div className="run-static-scene">{LANDMARKS[index]}</div>
                <span className="run-post">Level {pad(index + 1)}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    );
  }

  return (
    <section className="run" id="how" ref={sectionRef}>
      <h2 className="sr-only">How to play: four levels from the door to the doctor</h2>
      <ol className="sr-only">
        {STEPS.map((step, index) => <li key={step.title}>Level {index + 1}, {step.title}: {step.text}</li>)}
      </ol>
      <div className={`run-stage${cleared ? ' is-clear' : ''}`} ref={stageRef} aria-hidden="true">
        <div className="run-sky" />
        <div className="run-sky run-sky-morning" />
        <div className="run-sky run-sky-dusk" />
        <div className="run-sun" />
        <div className="run-layer run-clouds" />
        <div className="run-layer run-mountains" />
        <div className="run-layer run-hills" />
        <div className="run-layer run-trees" />
        <div className="run-ground" />

        <div className="run-track">
          <span className="run-gate" style={{ left: trackLeft(-0.06) }}>RHU</span>
          {CHECKPOINTS.map((q, index) => (
            <div key={q} className={`run-stop${level >= index ? ' on' : ''}${level === index ? ' here' : ''}`} style={{ left: trackLeft(q) }}>
              <span className="run-post">Level {pad(index + 1)}</span>
              {LANDMARKS[index]}
            </div>
          ))}
          {COINS.map((q, index) => (
            <span key={q} className={`run-coin${index < coins ? ' got' : ''}`} style={{ left: trackLeft(q) }}>
              <b>+10</b>
            </span>
          ))}
          <span className="run-finish" style={{ left: trackLeft(0.985) }} />
        </div>

        <div className={`run-hero${level >= 0 ? ' has-ticket' : ''}`}>
          <Walker>
            <span className="run-ticket" />
          </Walker>
        </div>

        <div className="run-hud">
          <span>World 1-{Math.max(1, level + 1)}</span>
          <span className="run-bar"><i /></span>
          <span>Score <b>{String(score).padStart(6, '0')}</b></span>
        </div>

        <div className={`run-intro${level >= 0 ? ' gone' : ''}`}>
          <p className="arcade-kicker">How to play</p>
          <p className="run-intro-title">Four levels from the door to the doctor</p>
          <p className="run-scroll">Scroll ▼</p>
        </div>
        <p className="run-clear">Stage clear!</p>

        <div className="run-dialog">
          <span className="run-dialog-name">{level < 0 ? 'Start' : `Level ${pad(level + 1)} · ${STEPS[level].title}`}</span>
          <p>
            {typed}
            {typed.length === message.length && <span className="run-caret">▼</span>}
          </p>
        </div>
      </div>
    </section>
  );
}

// ---- 2. Player select: the ticket types ----------------------------------------

const TICKETS = [
  { kind: 'regular', name: 'Regular', code: 'R', who: 'Everyone else', called: 'In order of arrival', rank: 1, windows: 'Every window', reach: 3, text: 'Served in order of arrival at every window.' },
  { kind: 'priority', name: 'Priority', code: 'P', who: 'Senior citizens, PWD, pregnant women', called: 'Ahead of regular', rank: 2, windows: `${PRIORITY_WINDOWS.length} priority windows`, reach: 1, text: 'Called ahead of regular patients at the priority windows.' },
  { kind: 'emergency', name: 'Emergency', code: 'E', who: 'Patients needing urgent care', called: 'First of all', rank: 3, windows: `${PRIORITY_WINDOWS.length} priority windows`, reach: 1, text: 'Called first at the priority windows.' },
] as const;

function Meter({ label, value, filled }: { label: string; value: string; filled: number }) {
  return (
    <div className="pick-stat">
      <span>{label}</span>
      <span className="pick-meter" aria-hidden="true">
        {[0, 1, 2].map((i) => <i key={i} className={i < filled ? 'on' : ''} style={{ animationDelay: `${i * 90 + 150}ms` }} />)}
      </span>
      <b>{value}</b>
    </div>
  );
}

function PlayerSelect() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const rosterRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef);
  const [picked, setPicked] = useState(0);
  const [demo, setDemo] = useState(true);

  // Attract mode: cycle the fighters while nobody has touched the roster.
  useEffect(() => {
    if (!demo || !inView || reduced) {
      return;
    }
    const timer = window.setInterval(() => setPicked((i) => (i + 1) % TICKETS.length), 3200);
    return () => window.clearInterval(timer);
  }, [demo, inView, reduced]);

  const choose = (index: number): void => {
    setDemo(false);
    setPicked(index);
  };
  const onKey = (event: KeyboardEvent): void => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step) {
      event.preventDefault();
      const next = (picked + step + TICKETS.length) % TICKETS.length;
      choose(next);
      rosterRef.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
    }
  };
  const ticket = TICKETS[picked];
  const fighter = FIGHTERS[ticket.kind];

  return (
    <section className="pick" id="tickets" ref={sectionRef}>
      <div className="arcade-wrap">
        <p className="arcade-kicker" data-reveal>Player select</p>
        <h2 className="arcade-heading" data-reveal>Choose your ticket</h2>
        <div className="pick-screen" data-kind={ticket.kind} data-reveal>
          <div className="pick-arena" key={`arena-${picked}`}>
            <span className="pick-spot" aria-hidden="true" />
            <PixelArt art={fighter.art} palette={fighter.palette} className="pick-fighter" />
            <span className="pick-floor" aria-hidden="true" />
            <span className="pick-code" aria-hidden="true">{ticket.code}-001</span>
          </div>
          <div className="pick-info" key={`info-${picked}`} aria-live="polite">
            <span className="pick-player" aria-hidden="true">1P</span>
            <h3 className="pick-name">{ticket.name}</h3>
            <p className="pick-who">{ticket.who}</p>
            <Meter label="Called" value={ticket.called} filled={ticket.rank} />
            <Meter label="Windows" value={ticket.windows} filled={ticket.reach} />
            <p className="pick-text">{ticket.text}</p>
          </div>
          <div className="pick-roster" ref={rosterRef} role="group" aria-label="Ticket types" onKeyDown={onKey}>
            {TICKETS.map((t, index) => (
              <button key={t.kind} type="button" className={`pick-slot ${t.kind}${index === picked ? ' on' : ''}`} aria-pressed={index === picked} onClick={() => choose(index)}>
                <PixelArt art={FIGHTERS[t.kind].art} palette={FIGHTERS[t.kind].palette} />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="pick-lanes" data-reveal>
          <p><b>Lane rule</b> These windows call every ticket type:</p>
          <ul>
            {PRIORITY_WINDOWS.map((name) => <li key={name}>{name}</li>)}
          </ul>
          <p>The other windows call regular tickets only, so regular patients keep moving even on busy days.</p>
        </div>
      </div>
    </section>
  );
}

// ---- 3. Stage select: the services as a world map --------------------------------

/** Map columns for the grid's width; `ready` re-measures once the grid is on the page. */
function useColumns(ref: RefObject<HTMLElement | null>, ready: boolean): number {
  const [columns, setColumns] = useState(4);
  useEffect(() => {
    const element = ref.current;
    if (!element || !('ResizeObserver' in window)) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setColumns(width >= 860 ? 4 : width >= 520 ? 3 : 2);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, ready]);
  return columns;
}

/** Counts up to `target` in a few arcade-style steps once `start` is true. */
function useCountUp(target: number, start: boolean): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) {
      return;
    }
    let shown = 0;
    const timer = window.setInterval(() => {
      shown = Math.min(target, shown + Math.max(1, Math.ceil(target / 8)));
      setValue(shown);
      if (shown >= target) {
        window.clearInterval(timer);
      }
    }, 70);
    return () => window.clearInterval(timer);
  }, [target, start]);
  return start ? value : 0;
}

function ScoreRow({ rank, label, value, start }: { rank: string; label: string; value: number; start: boolean }) {
  return (
    <li>
      <span>{rank}</span>
      <span>{label}</span>
      <b>{pad(useCountUp(value, start))}</b>
    </li>
  );
}

function WorldMap({ names, services }: { names: string[]; services: LiveConfig | null }) {
  const gridRef = useRef<HTMLOListElement>(null);
  const scoresRef = useRef<HTMLDivElement>(null);
  const columns = useColumns(gridRef, names.length > 0);
  const scoresInView = useInView(scoresRef, 0.4);
  const [here, setHere] = useState(0);

  // The patient hops one stage further for each slice of the map that scrolls past.
  useScrollFrame(() => {
    const grid = gridRef.current;
    if (!grid || names.length === 0) {
      return;
    }
    const rect = grid.getBoundingClientRect();
    const progress = clamp01((window.innerHeight * 0.62 - rect.top) / rect.height);
    setHere(Math.min(names.length - 1, Math.floor(progress * names.length)));
  });

  return (
    <section className="map" id="services">
      <div className="arcade-wrap">
        <p className="arcade-kicker" data-reveal>Stage select</p>
        <h2 className="arcade-heading" data-reveal>One ticket, every stage</h2>
        <p className="arcade-sub" data-reveal>Staff transfer your ticket between these services, so you never need to line up again.</p>
        {names.length > 0 ? (
          <div className="map-board" data-reveal>
            <p className="map-banner" aria-live="polite">
              Stage {pad(here + 1)}/{pad(names.length)} <b>{names[here]}</b>
            </p>
            <ol className="map-grid" ref={gridRef} style={{ '--cols': columns } as Vars}>
              {names.map((name, index) => {
                const row = Math.floor(index / columns);
                const inRow = index % columns;
                const reversed = row % 2 === 1;
                const isLast = index === names.length - 1;
                const link = isLast ? '' : inRow === columns - 1 ? 'down' : reversed ? 'left' : 'right';
                const state = index < here ? ' cleared' : index === here ? ' here' : '';
                return (
                  <li
                    key={name}
                    className={`map-node${link ? ` link-${link}` : ''}${state}`}
                    style={{ gridRow: row + 1, gridColumn: (reversed ? columns - inRow : inRow + 1) }}
                  >
                    <span className="map-house">
                      <PixelArt art={HOUSE} palette={{ K: INK, R: ROOFS[index % ROOFS.length], W: '#f4f1fb', Y: '#ffd84a', D: '#7a4a1f' }} />
                      {index === here && <Walker className="map-walker" />}
                      {index < here && <span className="map-flag" aria-hidden="true" />}
                    </span>
                    <span className="map-name">{name}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <p className="arcade-sub">The list of services could not be loaded right now.</p>
        )}
        {services && (
          <div className="map-scores" ref={scoresRef} data-reveal>
            <p className="map-scores-title">High scores</p>
            <ol>
              <ScoreRow rank="1st" label="Services" value={names.length} start={scoresInView} />
              <ScoreRow rank="2nd" label="Waiting windows" value={services.waiting_sections?.length ?? 0} start={scoresInView} />
              <ScoreRow rank="3rd" label="Admission windows" value={services.admission_sections?.length ?? 0} start={scoresInView} />
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}

// ---- 4. Continue? ------------------------------------------------------------------

function ContinueScreen({ onSignIn }: { onSignIn: () => void }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, 0.5);
  const [count, setCount] = useState(9);

  useEffect(() => {
    if (!inView || reduced) {
      return;
    }
    const timer = window.setTimeout(() => setCount((n) => (n <= -1 ? 9 : n - 1)), count < 0 ? 2600 : 900);
    return () => window.clearTimeout(timer);
  }, [inView, count, reduced]);

  return (
    <section className="cont" ref={ref}>
      <div className="arcade-wrap cont-inner">
        <div className="cont-copy" data-reveal>
          <h2>Continue?</h2>
          <p>Open the live monitor on any screen in the waiting area. It shows every window and announces each number aloud.</p>
          <div className="cont-actions">
            <a className="arcade-btn arcade-btn-big" href={`${BASE}/live`}>▶ Live monitor</a>
            <button type="button" className="arcade-btn arcade-btn-ghost arcade-btn-big" onClick={onSignIn}>Staff sign in</button>
          </div>
        </div>
        <div className="cont-count" aria-hidden="true">
          {count >= 0 ? <b key={count}>{reduced ? 9 : count}</b> : <span>Insert coin</span>}
        </div>
      </div>
    </section>
  );
}

/** Everything below the hero and ticker. */
export function LandingJourney({ departmentNames, services, onSignIn }: { departmentNames: string[]; services: LiveConfig | null; onSignIn: () => void }) {
  return (
    <>
      <VisitRun />
      <PlayerSelect />
      <WorldMap names={departmentNames} services={services} />
      <ContinueScreen onSignIn={onSignIn} />
    </>
  );
}
