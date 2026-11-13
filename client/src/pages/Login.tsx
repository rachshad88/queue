import { BASE } from '../base';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { beginSession, useSession, type SessionUser } from '../auth';
import { prefetchFor } from '../prefetch';
import { OfflineBanner } from '../components/OfflineBanner';
import { LandingJourney, SoundToggle, useScrollMotion, Walker } from './LoginJourney';
import { play } from '../sfx';

const REASONS: Record<string, string> = {
  another_device: 'You were signed out because this account signed in on another device.',
  inactive: 'You were signed out after 30 minutes without activity.',
  revoked: 'You were signed out because an administrator changed or deactivated your account.',
};

type LiveConfig = { departments?: { id: number; name: string }[]; admission_sections?: string[]; waiting_sections?: string[] };

const scrollToId = (id: string): void => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const manilaClock = (): { time: string; date: string } => {
  const now = new Date();
  return {
    time: now.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
    date: now.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(),
  };
};

function useManilaClock(): { time: string; date: string } {
  const [clock, setClock] = useState(manilaClock);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(manilaClock()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return clock;
}

/** Adds `.in` to each `[data-reveal]` element the first time it scrolls into view. */
function useReveal(): void {
  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('in'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.15 });
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  });
}

function AmbulanceSprite() {
  return (
    <svg viewBox="0 0 40 34" shapeRendering="crispEdges">
      <rect x="9" y="32" width="22" height="2" fill="#000" opacity="0.45" />
      <rect x="11" y="0" width="18" height="4" fill="#1b1030" />
      <rect x="12" y="1" width="7" height="2" className="siren-red" />
      <rect x="21" y="1" width="7" height="2" className="siren-blue" />
      <rect x="3" y="3" width="34" height="23" fill="#1b1030" />
      <rect x="4" y="4" width="32" height="21" fill="#f4f1fb" />
      <rect x="33" y="4" width="3" height="21" fill="#d6d0e6" />
      <rect x="4" y="4" width="32" height="1" fill="#ffffff" />
      <rect x="7" y="6" width="11" height="6" fill="#1b1030" />
      <rect x="22" y="6" width="11" height="6" fill="#1b1030" />
      <rect x="8" y="7" width="9" height="4" fill="#2a6f9a" />
      <rect x="23" y="7" width="9" height="4" fill="#2a6f9a" />
      <rect x="8" y="7" width="3" height="1" fill="#9ff6ff" />
      <rect x="23" y="7" width="3" height="1" fill="#9ff6ff" />
      <rect x="4" y="13" width="32" height="2" fill="#ff4757" />
      <rect x="19" y="5" width="2" height="20" fill="#cfc8e2" />
      <rect x="17" y="16" width="6" height="8" fill="#ff4757" />
      <rect x="14" y="18" width="12" height="4" fill="#ff4757" />
      <rect x="5" y="17" width="3" height="5" className="tail" />
      <rect x="32" y="17" width="3" height="5" className="tail" />
      <rect x="3" y="25" width="34" height="3" fill="#4b4566" />
      <rect x="16" y="25" width="8" height="2" fill="#ffe14d" />
      <rect x="5" y="28" width="8" height="4" fill="#0a0612" />
      <rect x="27" y="28" width="8" height="4" fill="#0a0612" />
      <rect x="6" y="28" width="6" height="1" className="tread" />
      <rect x="28" y="28" width="6" height="1" className="tread" />
    </svg>
  );
}

/** The pixel ambulance with its siren glow and exhaust. */
function Ambulance() {
  return (
    <div className="arcade-ambulance">
      <span className="arcade-siren-glow red" />
      <span className="arcade-siren-glow blue" />
      <span className="arcade-puff" />
      <span className="arcade-puff" />
      <span className="arcade-puff" />
      <AmbulanceSprite />
    </div>
  );
}

/** A slower car seen from behind, for the ambulance to overtake. */
function PixelCar({ className, color }: { className: string; color: string }) {
  return (
    <svg className={className} viewBox="0 0 32 20" shapeRendering="crispEdges">
      <rect x="7" y="0" width="18" height="6" fill="#1b1030" />
      <rect x="9" y="1" width="14" height="4" fill="#2a6f9a" />
      <rect x="9" y="1" width="4" height="1" fill="#9ff6ff" />
      <rect x="1" y="5" width="30" height="11" fill="#1b1030" />
      <rect x="2" y="6" width="28" height="9" fill={color} />
      <rect x="2" y="6" width="28" height="1" fill="#ffffff" opacity="0.5" />
      <rect x="3" y="8" width="5" height="2" fill="#ff2747" />
      <rect x="24" y="8" width="5" height="2" fill="#ff2747" />
      <rect x="13" y="10" width="6" height="2" fill="#f4f1fb" />
      <rect x="2" y="14" width="28" height="2" fill="#4b4566" />
      <rect x="3" y="16" width="6" height="3" fill="#0a0612" />
      <rect x="23" y="16" width="6" height="3" fill="#0a0612" />
    </svg>
  );
}

/** A slow box truck seen from behind. */
function PixelTruck({ className, color }: { className: string; color: string }) {
  return (
    <svg className={className} viewBox="0 0 32 30" shapeRendering="crispEdges">
      <rect x="1" y="0" width="30" height="22" fill="#1b1030" />
      <rect x="2" y="1" width="28" height="20" fill={color} />
      <rect x="2" y="1" width="28" height="1" fill="#ffffff" opacity="0.45" />
      <rect x="4" y="4" width="9" height="2" fill="#ffffff" opacity="0.75" />
      <rect x="4" y="7" width="6" height="1" fill="#ffffff" opacity="0.5" />
      <rect x="15" y="2" width="2" height="19" fill="#1b1030" opacity="0.55" />
      <rect x="12" y="10" width="2" height="4" fill="#1b1030" />
      <rect x="18" y="10" width="2" height="4" fill="#1b1030" />
      <rect x="1" y="22" width="30" height="3" fill="#4b4566" />
      <rect x="2" y="22" width="4" height="2" fill="#ff2747" />
      <rect x="26" y="22" width="4" height="2" fill="#ff2747" />
      <rect x="13" y="22" width="6" height="2" fill="#f4f1fb" />
      <rect x="2" y="25" width="9" height="4" fill="#0a0612" />
      <rect x="21" y="25" width="9" height="4" fill="#0a0612" />
    </svg>
  );
}

/** A motorcycle and rider seen from behind. */
function PixelMoto({ className, color }: { className: string; color: string }) {
  return (
    <svg className={className} viewBox="0 0 14 22" shapeRendering="crispEdges">
      <rect x="5" y="0" width="4" height="4" fill="#f4f1fb" />
      <rect x="5" y="3" width="4" height="1" fill="#b9b3cc" />
      <rect x="3" y="4" width="8" height="7" fill={color} />
      <rect x="3" y="4" width="8" height="1" fill="#ffffff" opacity="0.4" />
      <rect x="1" y="6" width="2" height="4" fill={color} />
      <rect x="11" y="6" width="2" height="4" fill={color} />
      <rect x="0" y="9" width="14" height="1" fill="#1b1030" />
      <rect x="4" y="11" width="6" height="4" fill="#1b1030" />
      <rect x="2" y="11" width="2" height="5" fill="#2a2a44" />
      <rect x="10" y="11" width="2" height="5" fill="#2a2a44" />
      <rect x="4" y="15" width="6" height="2" fill="#4b4566" />
      <rect x="5" y="15" width="4" height="1" fill="#ff2747" />
      <rect x="6" y="17" width="2" height="5" fill="#0a0612" />
    </svg>
  );
}

/** A small pixel town on the horizon, in front of the mountains. */
function PixelTown({ className }: { className: string }) {
  const blocks: [number, number, number][] = [
    [0, 14, 8], [8, 8, 7], [15, 18, 9], [24, 11, 6], [30, 5, 8], [38, 15, 7], [45, 10, 9], [54, 19, 6], [60, 12, 8],
  ];
  return (
    <svg className={className} viewBox="0 0 68 30" preserveAspectRatio="xMidYMax meet" shapeRendering="crispEdges">
      {blocks.map(([x, y, w]) => (
        <g key={x}>
          <rect x={x} y={y} width={w} height={30 - y} className="town-block" />
          {Array.from({ length: Math.floor((26 - y) / 4) }, (_, row) => (
            <rect key={row} x={x + 2} y={y + 3 + row * 4} width={Math.max(1, w - 4)} height="1" className="town-lights" />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** Shown for a moment after a successful sign-in: the ambulance has arrived at the hospital. */
function Arrival() {
  return (
    <div className="arcade-arrive" role="status">
      <p className="arcade-arrive-title">Stage clear!</p>
      <div className="arcade-hospital" aria-hidden="true">
        <svg viewBox="0 0 160 92" shapeRendering="crispEdges">
          <rect x="0" y="76" width="160" height="16" fill="#55a94e" />
          <rect x="0" y="76" width="160" height="2" fill="#62b85a" />
          <rect x="60" y="76" width="40" height="16" fill="#6b6b75" />
          <rect x="22" y="28" width="116" height="50" fill="#1b1030" />
          <rect x="24" y="30" width="112" height="47" fill="#e9e4f5" />
          <rect x="20" y="25" width="120" height="5" fill="#3a2766" />
          <rect x="62" y="10" width="36" height="17" fill="#1b1030" />
          <rect x="64" y="12" width="32" height="15" fill="#e9e4f5" />
          <rect x="74" y="13" width="12" height="12" fill="#fff" />
          <rect x="78" y="14" width="4" height="10" fill="#ff4757" />
          <rect x="75" y="17" width="10" height="4" fill="#ff4757" />
          <rect x="36" y="33" width="88" height="9" fill="#ff4757" />
          <text x="80" y="39.8" textAnchor="middle" className="arcade-hospital-sign">RURAL HEALTH UNIT</text>
          {[30, 42, 108, 120].map((x) => [47, 61].map((y) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="8" height="7" className="arcade-window" style={{ animationDelay: `${(x + y) % 7 * 0.3}s` }} />
          )))}
          <rect x="60" y="50" width="40" height="4" fill="#ff4757" />
          <rect x="66" y="54" width="28" height="23" fill="#1b1030" />
          <rect x="67" y="55" width="26" height="22" fill="#2a6f9a" />
          <rect x="79.5" y="55" width="1" height="22" fill="#1b1030" />
          <rect x="68" y="56" width="5" height="2" fill="#9ff6ff" />
        </svg>
        <div className="arcade-parked">
          <Ambulance />
        </div>
      </div>
      <p className="arcade-arrive-sub">Welcome! Opening your console…</p>
    </div>
  );
}

export function Login() {
  const clock = useManilaClock();
  const usernameRef = useRef<HTMLInputElement>(null);
  const [services, setServices] = useState<LiveConfig | null>(null);
  useEffect(() => {
    void api<LiveConfig>('/live-config').then((config) => setServices(config)).catch(() => setServices(null));
  }, []);
  useReveal();
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollMotion(rootRef);
  const { user, refresh } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [destination, setDestination] = useState<string | null>(null);
  const [arrived, setArrived] = useState(false);
  const [boosting, setBoosting] = useState(false);

  if (user && !busy) {
    return <Navigate to={destination ?? '/'} replace />;
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError('');
    play('start');
    const result = await api('/login', { body: { username, password }, quiet401: true });
    if (!result.success) {
      setError(result.message ?? 'Could not sign in.');
      play('error');
      setBusy(false);
      return;
    }
    setDestination(result.destination ?? '/');
    // Load the console and the other pages while the arrival animation plays.
    if (result.user) {
      beginSession(result.user as SessionUser, result.config);
      prefetchFor(result.user as SessionUser, { now: true });
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));
    if (!reducedMotion) {
      setBoosting(true);
      play('boost');
      await wait(1200);
    }
    setBoosting(false);
    setArrived(true);
    play('arrive');
    await wait(reducedMotion ? 700 : 1800);
    await refresh();
    setBusy(false);
    navigate(result.destination ?? '/', { replace: true });
  };

  const reason = REASONS[params.get('reason') ?? ''];
  const goToSignIn = (): void => {
    scrollToId('sign-in');
    usernameRef.current?.focus({ preventScroll: true });
  };
  const departmentNames = (services?.departments ?? []).map((d) => d.name).filter((name) => name !== 'WAITING AREA');
  const tickerItems = ['Take a number', 'Watch the wall', 'Hear your number', 'Proceed to your window', ...departmentNames];

  return (
    <div className={`arcade${boosting ? ' arcade-boost' : ''}`} ref={rootRef}>
      <OfflineBanner detail="Cannot reach the queue server. Sign-in will work again once it is back." />
      <div className="arcade-crt" aria-hidden="true" />
      {arrived && <Arrival />}

      <header className="arcade-nav">
        <div className="arcade-brand">
          <img src={`${BASE}/img/logo.jpg`} alt="" />
          <span>RHU<em>QUEUE</em></span>
        </div>
        <nav className="arcade-menu">
          <button type="button" onClick={() => scrollToId('how')}>How to play</button>
          <button type="button" onClick={() => scrollToId('tickets')}>Tickets</button>
          <button type="button" onClick={() => scrollToId('services')}>Stages</button>
        </nav>
        <div className="arcade-nav-actions">
          <SoundToggle />
          <a className="arcade-btn arcade-btn-ghost" href={`${BASE}/live`}>Live</a>
          <button type="button" className="arcade-btn" onClick={goToSignIn}>Sign in</button>
        </div>
        <span className="arcade-nav-runner" aria-hidden="true"><Walker /></span>
      </header>

      <section className="arcade-hero">
        <div className="arcade-sky" aria-hidden="true">
          <svg className="arcade-cloud" viewBox="0 0 24 10" shapeRendering="crispEdges" style={{ top: '8%', animationDelay: '-10s', animationDuration: '70s' }}><rect x="7" y="0" width="7" height="2" /><rect x="4" y="2" width="14" height="2" /><rect x="15" y="1" width="4" height="2" /><rect x="1" y="4" width="22" height="3" /><rect x="0" y="7" width="24" height="2" className="shade" /></svg>
          <svg className="arcade-cloud" viewBox="0 0 24 10" shapeRendering="crispEdges" style={{ top: '22%', animationDelay: '-38s', animationDuration: '95s' }}><rect x="7" y="0" width="7" height="2" /><rect x="4" y="2" width="14" height="2" /><rect x="15" y="1" width="4" height="2" /><rect x="1" y="4" width="22" height="3" /><rect x="0" y="7" width="24" height="2" className="shade" /></svg>
          <svg className="arcade-cloud" viewBox="0 0 24 10" shapeRendering="crispEdges" style={{ top: '14%', animationDelay: '-62s', animationDuration: '85s' }}><rect x="7" y="0" width="7" height="2" /><rect x="4" y="2" width="14" height="2" /><rect x="15" y="1" width="4" height="2" /><rect x="1" y="4" width="22" height="3" /><rect x="0" y="7" width="24" height="2" className="shade" /></svg>
          <div className="arcade-sun" />
          <div className="arcade-mountains">
            <svg viewBox="0 0 200 40" preserveAspectRatio="none" shapeRendering="crispEdges">
              <polygon className="far" points="0,40 0,28 2,28 2,26 4,26 4,24 6,24 6,23 8,23 8,21 10,21 10,19 12,19 12,17 14,17 14,15 16,15 16,14 18,14 18,12 20,12 20,10 22,10 22,12 24,12 24,14 26,14 26,15 28,15 28,17 30,17 30,19 32,19 32,21 34,21 34,23 36,23 36,24 38,24 38,23 40,23 40,22 42,22 42,20 44,20 44,18 46,18 46,17 48,17 48,15 50,15 50,14 52,14 52,12 54,12 54,10 56,10 56,9 58,9 58,7 60,7 60,6 62,6 62,4 64,4 64,6 66,6 66,7 68,7 68,9 70,9 70,10 72,10 72,12 74,12 74,14 76,14 76,15 78,15 78,17 80,17 80,18 82,18 82,20 84,20 84,22 86,22 86,23 88,23 88,25 90,25 90,26 92,26 92,26 94,26 94,24 96,24 96,22 98,22 98,20 100,20 100,18 102,18 102,17 104,17 104,15 106,15 106,15 108,15 108,17 110,17 110,18 112,18 112,20 114,20 114,22 116,22 116,24 118,24 118,26 120,26 120,28 122,28 122,26 124,26 124,24 126,24 126,22 128,22 128,21 130,21 130,19 132,19 132,17 134,17 134,16 136,16 136,14 138,14 138,12 140,12 140,10 142,10 142,9 144,9 144,7 146,7 146,5 148,5 148,4 150,4 150,2 152,2 152,4 154,4 154,5 156,5 156,7 158,7 158,9 160,9 160,10 162,10 162,12 164,12 164,14 166,14 166,16 168,16 168,17 170,17 170,19 172,19 172,21 174,21 174,22 176,22 176,24 178,24 178,23 180,23 180,21 182,21 182,19 184,19 184,17 186,17 186,16 188,16 188,14 190,14 190,12 192,12 192,14 194,14 194,16 196,16 196,17 198,17 198,19 200,19 200,21 202,21 200,40" />
              <polygon className="near" points="0,40 0,22 2,22 2,23 4,23 4,25 6,25 6,26 8,26 8,28 10,28 10,29 12,29 12,30 14,30 14,32 16,32 16,33 18,33 18,35 20,35 20,34 22,34 22,32 24,32 24,31 26,31 26,29 28,29 28,28 30,28 30,26 32,26 32,24 34,24 34,23 36,23 36,21 38,21 38,20 40,20 40,18 42,18 42,20 44,20 44,21 46,21 46,23 48,23 48,24 50,24 50,26 52,26 52,28 54,28 54,29 56,29 56,31 58,31 58,32 60,32 60,34 62,34 62,36 64,36 64,37 66,37 66,37 68,37 68,36 70,36 70,34 72,34 72,33 74,33 74,32 76,32 76,30 78,30 78,29 80,29 80,28 82,28 82,26 84,26 84,25 86,25 86,25 88,25 88,26 90,26 90,28 92,28 92,29 94,29 94,30 96,30 96,32 98,32 98,33 100,33 100,34 102,34 102,33 104,33 104,32 106,32 106,30 108,30 108,29 110,29 110,27 112,27 112,26 114,26 114,24 116,24 116,23 118,23 118,21 120,21 120,20 122,20 122,18 124,18 124,17 126,17 126,17 128,17 128,18 130,18 130,20 132,20 132,21 134,21 134,23 136,23 136,24 138,24 138,26 140,26 140,27 142,27 142,29 144,29 144,30 146,30 146,32 148,32 148,33 150,33 150,35 152,35 152,36 154,36 154,35 156,35 156,33 158,33 158,32 160,32 160,30 162,30 162,29 164,29 164,28 166,28 166,26 168,26 168,25 170,25 170,24 172,24 172,22 174,22 174,21 176,21 176,21 178,21 178,22 180,22 180,24 182,24 182,25 184,25 184,26 186,26 186,28 188,28 188,29 190,29 190,30 192,30 192,32 194,32 194,33 196,33 196,35 198,35 198,36 200,36 200,38 202,38 200,40" />
            </svg>
          </div>
          <PixelTown className="arcade-town left" />
          <PixelTown className="arcade-town right" />
          <div className="arcade-grid" />
          <div className="arcade-warp"><span /></div>
          <div className="arcade-highway">
            <svg className="arcade-highway-road" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon points="50,0 2.5,100 97.5,100" />
              <line x1="50" y1="0" x2="2.5" y2="100" />
              <line x1="50" y1="0" x2="97.5" y2="100" />
            </svg>
            {[0, 1, 2, 3, 4].map((dash) => (
              <span key={`l${dash}`} className="arcade-dash left" style={{ animationDelay: `${-dash * 0.24}s` }} />
            ))}
            {[0, 1, 2, 3, 4].map((dash) => (
              <span key={`r${dash}`} className="arcade-dash right" style={{ animationDelay: `${-dash * 0.24}s` }} />
            ))}
            <PixelCar className="arcade-car lane-left car-a" color="#29f0ff" />
            <PixelCar className="arcade-car lane-right car-b" color="#ffe14d" />
            <PixelCar className="arcade-car lane-left car-c" color="#3dff8f" />
            <PixelMoto className="arcade-car arcade-moto lane-left car-d" color="#ff7a1a" />
            <PixelTruck className="arcade-car arcade-truck lane-right car-e" color="#f4f1fb" />
          </div>
          <div className="arcade-road">
            <Ambulance />
          </div>
        </div>

        <div className="arcade-hero-inner" id="sign-in">
          <div className="arcade-hero-copy">
            <div className="arcade-hud" aria-hidden="true">
              <span>1UP <b>{clock.time}</b></span>
              <span>{clock.date}</span>
            </div>
            <p className="arcade-eyebrow">Rural Health Unit · Queue Management</p>
            <h1 className="arcade-title" data-text="EVERY PATIENT CALLED IN TURN">
              Every patient called in turn
            </h1>
            <p className="arcade-lede">
              Tickets from the kiosk, fair lanes at every window, and a live wall that tells patients exactly where to go.
            </p>
            <div className="arcade-actions">
              <button type="button" className="arcade-btn arcade-btn-big" onClick={() => scrollToId('how')}>▶ How to play</button>
              <a className="arcade-btn arcade-btn-ghost arcade-btn-big" href={`${BASE}/live`}>Live monitor</a>
            </div>
          </div>

          <form className="arcade-cabinet" onSubmit={submit}>
            <div className="arcade-cabinet-head">
              <img src={`${BASE}/img/logo.jpg`} alt="" />
              <div>
                <h2>Staff login</h2>
                <p>Player select</p>
              </div>
            </div>
            {reason && <p className="arcade-alert">{reason}</p>}
            {error && <p className="arcade-alert arcade-alert-error" role="alert">{error}</p>}
            <label className="arcade-field">
              <span>Username</span>
              <input ref={usernameRef} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
            </label>
            <label className="arcade-field">
              <span>Password</span>
              <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            <label className="arcade-check">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show password
            </label>
            <button className="arcade-btn arcade-btn-big arcade-start" disabled={busy}>
              {busy ? 'Loading…' : '▶ Press start'}
            </button>
            <p className="arcade-credit" aria-hidden="true">Credit 01</p>
          </form>
        </div>
      </section>

      <div className="arcade-ticker" aria-hidden="true">
        <div className="arcade-ticker-track">
          {[0, 1].map((copy) => (
            <span key={copy}>
              {tickerItems.map((item) => <span key={`${copy}-${item}`}>★ {item} </span>)}
            </span>
          ))}
        </div>
      </div>

      <LandingJourney departmentNames={departmentNames} services={services} onSignIn={goToSignIn} />

      <footer className="arcade-footer">
        <div className="arcade-wrap arcade-footer-inner">
          <div className="arcade-brand">
            <img src={`${BASE}/img/logo.jpg`} alt="" />
            <span>RHU<em>QUEUE</em></span>
          </div>
          <div className="arcade-footer-links">
            <a href={`${BASE}/live`}>Live monitor</a>
            <button type="button" onClick={goToSignIn}>Staff sign in</button>
          </div>
          <p>© {new Date().getFullYear()} Rural Health Unit</p>
        </div>
      </footer>
    </div>
  );
}
