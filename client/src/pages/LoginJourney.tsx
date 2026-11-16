import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { api } from '../api';
import { BASE } from '../base';
import { useDepartmentEvents } from '../socket';
import { play, setSoundEnabled, useSoundEnabled, type SoundName } from '../sfx';

/*
 * The landing page below the hero: a playable-feeling scroll.
 *  1. World 1: the patient walks the visit as you scroll (sticky side-scroller).
 *  2. Player select: the three ticket types as fighters.
 *  3. Service board: every service, what it does, and its live queue.
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
const WALK_A = [...WALK_TOP, '...CCCCCCS..', '...SCCCCC...', '...CCCCCC...', '...PPPPPP...', '...PP..PP...', '...PP..PP...', '...PP..PP...', '...KKK.KKK..'];
const WALK_B = [...WALK_TOP, '...CCCCCC...', '..SCCCCCC...', '...CCCCCCS..', '...PPPPPP...', '..PPP..PPP..', '.PPP....PPP.', '.PP......PP.', '.KKK.....KKK'];

/** A white paper ticket (outline, bold number, text lines), drawn at rows 2–10, columns 11–16. */
const HELD_TICKET = ['KKKKKK', 'KWWWWK', 'KDDDDK', 'KWWWWK', 'KWDDWK', 'KWWWWK', 'KDDDWK', 'KWWWWK', 'KKKKKK'];

/**
 * The same frame with the near arm held out at chest height, gripping the ticket in front of him.
 * The grid widens from 12 to 17 columns so the ticket sits clear of the body.
 */
function holdingTicket(frame: string[]): string[] {
  const grid = frame.map((row) => (row + '.....').split(''));
  grid.forEach((row, y) => {
    if (y >= 6 && row[9] === 'S') {
      row[9] = '.'; // the swinging hand now holds the ticket instead
    }
  });
  grid[8].splice(3, 9, ...'CCCCCCCSS');
  HELD_TICKET.forEach((line, i) => [...line].forEach((c, x) => (grid[2 + i][11 + x] = c)));
  // Fingers over the ticket's edge, so it reads as gripped rather than stuck on.
  grid[7][11] = 'S';
  grid[8][11] = 'S';
  grid[8][12] = 'S';
  return grid.map((row) => row.join(''));
}

const HOLD_PALETTE = { ...WALKER_PALETTE, W: '#ffffff', D: '#8a90a0' };
const HOLD_A = holdingTicket(WALK_A);
const HOLD_B = holdingTicket(WALK_B);

/**
 * The patient, seen from the side. Steps whenever the page is scrolling, turns round when scrolling back up.
 * With `holding`, he carries his ticket out in front of him.
 */
export function Walker({ className = '', holding = false }: { className?: string; holding?: boolean }) {
  return (
    <span className={`walker ${className}${holding ? ' holding' : ''}`} aria-hidden="true">
      <PixelArt art={holding ? HOLD_A : WALK_A} palette={holding ? HOLD_PALETTE : WALKER_PALETTE} className="walker-a" />
      <PixelArt art={holding ? HOLD_B : WALK_B} palette={holding ? HOLD_PALETTE : WALKER_PALETTE} className="walker-b" />
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
const TOGGLE_PALETTE = { K: INK, G: '#ffffff' };

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
/** Kiosk prints, waiting-area level-up, the call chime, the clinic door. */
const LEVEL_SOUNDS: SoundName[] = ['print', 'level', 'call', 'door'];

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

  // Sounds only on the way forward; scrolling back up stays quiet.
  const heard = useRef({ level: -1, coins: 0, cleared: false });
  useEffect(() => {
    const last = heard.current;
    if (level > last.level && level >= 0) {
      play(LEVEL_SOUNDS[level], 200);
    } else if (coins > last.coins) {
      play('coin', 70);
    }
    if (cleared && !last.cleared) {
      play('clear');
    }
    heard.current = { level, coins, cleared };
  }, [level, coins, cleared]);

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

        <div className="run-hero">
          <Walker holding={level >= 0} />
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
    play(index === picked ? 'confirm' : 'select');
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

// ---- 3. Service board: every service with what it does and its live queue ----------

const ICONS: Record<string, { art: string[]; palette: Record<string, string> }> = {
  clinic: {
    art: ['...KKKK...', '...KRRK...', '...KRRK...', 'KKKKRRKKKK', 'KRRRRRRRRK', 'KRRRRRRRRK', 'KKKKRRKKKK', '...KRRK...', '...KRRK...', '...KKKK...'],
    palette: { K: INK, R: '#e63946' },
  },
  admission: {
    art: ['...KKKK...', '.KKKYYKKK.', '.KWKKKKWK.', '.KWWWWWWK.', '.KWKKKKWK.', '.KWWWWWWK.', '.KWKKKKWK.', '.KWWWWWWK.', '.KWKKKWWK.', '.KKKKKKKK.'],
    palette: { K: INK, Y: '#ffd84a', W: '#f4f1fb' },
  },
  lab: {
    art: ['..KKKKKK..', '...KGGK...', '...KGGK...', '...KGGK...', '..KGGGGK..', '.KGGGGGGK.', '.KCCCCCCK.', 'KCCWCCCCCK', 'KCCCCCCCCK', '.KKKKKKKK.'],
    palette: { K: INK, G: '#d9f3ff', C: '#3fd0c9', W: '#ffffff' },
  },
  pharmacy: {
    art: ['..........', '..........', '.KKKKKKKK.', 'KRRRRWWWWK', 'KRWRRWWWWK', 'KRRRRWWWWK', 'KRRRRWWWWK', '.KKKKKKKK.', '..........', '..........'],
    palette: { K: INK, R: '#e63946', W: '#f4f1fb' },
  },
  dental: {
    art: ['.KKK..KKK.', 'KWWWKKWWWK', 'KWWWWWWWWK', 'KWWWWWWWWK', 'KWWWWWWWWK', '.KWWWWWWK.', '.KWWKKWWK.', '.KWK..KWK.', '.KWK..KWK.', '..K....K..'],
    palette: { K: INK, W: '#f4f1fb' },
  },
  abtc: {
    art: ['..........', '..........', 'K..KKKKK..', 'KKKKCCWK..', 'K..KCCWKKK', 'KKKKCCWK..', 'K..KKKKK..', '..........', '..........', '..........'],
    palette: { K: INK, C: '#6cc0ff', W: '#f4f1fb' },
  },
  nutrition: {
    art: ['....B.L...', '....BLL...', '.KKKBKKK..', 'KRRRRRRRK.', 'KRWRRRRRK.', 'KRRRRRRRK.', 'KRRRRRRRK.', '.KRRRRRK..', '..KKRKK...', '..........'],
    palette: { K: INK, R: '#e63946', W: '#ffb3ba', B: '#7a4a1f', L: '#3fbf5f' },
  },
  tb: {
    art: ['....KK....', '....KK....', '.KKKKKKKK.', 'KPPKKKKPPK', 'KPPPKKPPPK', 'KPWPKKPPPK', 'KPPPKKPPPK', 'KPPPKKPPPK', '.KPK..KPK.', '..K....K..'],
    palette: { K: INK, P: '#ff8fa3', W: '#ffd6dd' },
  },
  vet: {
    art: ['...KK..KK...', '..KBBKKBBK..', '..KBBKKBBK..', 'KK.KKKKKK.KK', 'KBK......KBK', 'KBK.KKKK.KBK', '.K.KBBBBK.K.', '..KBBBBBBK..', '..KBBBBBBK..', '...KKKKKK...'],
    palette: { K: INK, B: '#c98a4b' },
  },
};

const SERVICE_INFO: { match: RegExp; icon: keyof typeof ICONS; text: string }[] = [
  { match: /clinic/i, icon: 'clinic', text: 'Check-up and consultation with a doctor.' },
  { match: /admission/i, icon: 'admission', text: 'Patient records and admission.' },
  { match: /lab/i, icon: 'lab', text: 'Blood, urine and other tests.' },
  { match: /pharm/i, icon: 'pharmacy', text: 'Pick up the medicines you were prescribed.' },
  { match: /dental/i, icon: 'dental', text: 'Tooth check-ups, cleaning and extraction.' },
  { match: /abtc|bite/i, icon: 'abtc', text: 'Animal bite treatment and anti-rabies shots.' },
  { match: /nutri/i, icon: 'nutrition', text: 'Nutrition advice and growth checks.' },
  { match: /tb/i, icon: 'tb', text: 'TB screening and daily treatment.' },
  { match: /vet/i, icon: 'vet', text: 'Care and vaccines for pets and animals.' },
];
const serviceInfo = (name: string): { icon: keyof typeof ICONS; text: string } =>
  SERVICE_INFO.find((s) => s.match.test(name)) ?? { icon: 'clinic', text: 'Staff call your number here.' };

type BoardDept = { id: number; serving?: { queue_number?: string }[]; waiting_total?: number };

/** Today's numbers per service, fetched once in view and again whenever a queue changes (socket push, no polling). */
function useServiceBoard(ids: number[], active: boolean): Record<number, { now: string | null; waiting: number }> | null {
  const [board, setBoard] = useState<Record<number, { now: string | null; waiting: number }> | null>(null);
  const key = ids.join(',');
  const refresh = useRef<() => void>(() => {});
  refresh.current = () => {
    if (!key) {
      return;
    }
    void api<BoardDept[]>(`/live-serving?ids=${key}`)
      .then((rows) => {
        if (!Array.isArray(rows)) {
          return;
        }
        const next: Record<number, { now: string | null; waiting: number }> = {};
        for (const row of rows) {
          const now = (row.serving ?? []).map((s) => s.queue_number).find((n) => n && n !== '-') ?? null;
          next[row.id] = { now, waiting: row.waiting_total ?? 0 };
        }
        setBoard(next);
      })
      .catch(() => undefined);
  };
  useEffect(() => {
    if (active) {
      refresh.current();
    }
  }, [active, key]);
  useDepartmentEvents(active ? ids : [], 'live', {
    connect: () => refresh.current(),
    'queue-updated': () => refresh.current(),
  });
  return board;
}

function ServiceBoard({ services }: { services: LiveConfig | null }) {
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, 0.05);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (inView) {
      setSeen(true);
    }
  }, [inView]);
  const list = useMemo(() => (services?.departments ?? []).filter((d) => d.name !== 'WAITING AREA'), [services]);
  const ids = useMemo(() => list.map((d) => d.id).slice(0, 12), [list]);
  const board = useServiceBoard(ids, seen);
  const totals = board ? Object.values(board).reduce((sum, d) => ({ waiting: sum.waiting + d.waiting, serving: sum.serving + (d.now ? 1 : 0) }), { waiting: 0, serving: 0 }) : null;

  return (
    <section className="svc" id="services" ref={sectionRef}>
      <div className="arcade-wrap">
        <p className="arcade-kicker" data-reveal>Service board</p>
        <h2 className="arcade-heading" data-reveal>Where your ticket can take you</h2>
        <p className="arcade-sub" data-reveal>Staff pass your ticket from one service to the next, so you never line up twice. The numbers below are live.</p>
        {list.length > 0 ? (
          <>
            <p className="svc-status" aria-live="polite">
              <span className="svc-dot" aria-hidden="true" /> Live today
              {totals && (
                <>
                  <span><b>{totals.serving}</b> serving</span>
                  <span><b>{totals.waiting}</b> waiting</span>
                </>
              )}
            </p>
            <ul className={`svc-grid${seen ? ' play' : ''}`}>
              {list.map((dept, index) => {
                const info = serviceInfo(dept.name);
                const icon = ICONS[info.icon];
                const live = board?.[dept.id];
                const busy = !!live && (!!live.now || live.waiting > 0);
                return (
                  <li key={dept.id} className={`svc-card${busy ? ' busy' : ''}`} style={{ '--i': index } as Vars}>
                    <span className="svc-icon">
                      <PixelArt art={icon.art} palette={icon.palette} />
                    </span>
                    <span className="svc-body">
                      <b className="svc-name">{dept.name}</b>
                      <span className="svc-text">{info.text}</span>
                    </span>
                    <span className="svc-live">
                      <span>
                        Now <b className={live?.now ? 'on' : undefined}>{live?.now ?? '---'}</b>
                      </span>
                      <span>
                        Wait <b className={live?.waiting ? 'on' : undefined}>{live ? pad(live.waiting) : '--'}</b>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="arcade-sub">The list of services could not be loaded right now.</p>
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
  useEffect(() => {
    if (inView && !reduced) {
      play(count < 0 ? 'over' : count === 9 ? 'coin' : 'tick', 300);
    }
  }, [count, inView, reduced]);

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

/** Sound on/off for the landing page. Turning it on is the click browsers need before any audio can play. */
export function SoundToggle() {
  const on = useSoundEnabled();
  return (
    <button
      type="button"
      className={`arcade-sound${on ? ' on' : ''}`}
      aria-pressed={on}
      aria-label={on ? 'Sound effects on' : 'Sound effects off'}
      title={on ? 'Sound on' : 'Sound off'}
      onClick={() => {
        setSoundEnabled(!on);
        if (!on) {
          play('confirm');
        }
      }}
    >
      <PixelArt art={SPEAKER} palette={TOGGLE_PALETTE} />
      <span aria-hidden="true">{on ? 'On' : 'Off'}</span>
    </button>
  );
}

/** Everything below the hero and ticker. */
export function LandingJourney({ services, onSignIn }: { services: LiveConfig | null; onSignIn: () => void }) {
  return (
    <>
      <VisitRun />
      <PlayerSelect />
      <ServiceBoard services={services} />
      <ContinueScreen onSignIn={onSignIn} />
    </>
  );
}
