import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../auth';
import { BASE } from '../base';
import { Icon } from '../components/ui';
import { Walker } from './LoginJourney';

/*
 * Staff user manual. Each section is a small animated scene (a mock screen with a
 * pointer that clicks, a ticket that prints, a TV that calls) with short captions.
 * Scenes only play while on screen, and stand still on their final frame for
 * visitors who prefer reduced motion.
 */

type Section = { id: string; title: string; who?: string; lede: string; body: ReactNode };

/** The animated mouse pointer: glides from (x0,y0) to (x1,y1), clicks, and returns. */
function Cursor({ from, to }: { from: [string, string]; to: [string, string] }) {
  const style = { '--x0': from[0], '--y0': from[1], '--x1': to[0], '--y1': to[1] } as CSSProperties;
  return (
    <span className="mk-cursor" style={style} aria-hidden="true">
      <svg viewBox="0 0 12 18" shapeRendering="crispEdges">
        <path d="M0 0h2v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v2h-4v1h1v2h1v2h-2v1h-2v-2h-1v-2h-1v1h-1v1h-1v1h-2z" fill="#12051e" />
        <path d="M1 2h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h-4v2h1v2h1v2h-1v-2h-1v-2h-1v-1h-1v1h-1v1h-1z" fill="#fff" />
      </svg>
    </span>
  );
}

/** A captioned picture frame for one scene. */
function Scene({ caption, children, className = '' }: { caption?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <figure className={`mk-scene ${className}`}>
      <div className="mk-stage" aria-hidden="true">{children}</div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

/** An icon card: picture, a few words, and an optional one-liner. */
function Card({ icon, title, children, tone = '' }: { icon: ReactNode; title: string; children?: ReactNode; tone?: string }) {
  return (
    <div className={`man-card ${tone}`}>
      <span className="man-card-icon">{icon}</span>
      <strong>{title}</strong>
      {children && <span>{children}</span>}
    </div>
  );
}

/** One troubleshooting question. The answer slides open slowly instead of appearing at once. */
function FaqItem({ icon, question, answer }: { icon: string; question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`man-faq-item${open ? ' open' : ''}`}>
      <button type="button" className="man-faq-q" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="man-faq-icon">{icon}</span>
        {question}
        <span className="man-faq-sign" aria-hidden="true" />
      </button>
      <div className="man-faq-a" id={id} role="region" aria-hidden={!open}>
        <div><p>{answer}</p></div>
      </div>
    </div>
  );
}

/** A paper queue ticket. */
const Ticket = ({ n, kind, className = '' }: { n: string; kind: 'regular' | 'priority' | 'emergency'; className?: string }) => (
  <span className={`mk-ticket ${kind} ${className}`}><small>RHU</small>{n}</span>
);

/** An on-screen button name, shown the way it looks in the app. */
const B = ({ children }: { children: ReactNode }) => <span className="man-btn">{children}</span>;

const SECTIONS: Section[] = [
  {
    id: 'start',
    title: 'Signing in',
    lede: 'Type your username and password, then press start.',
    body: (
      <>
        <Scene caption={<>First password is <code>12345</code>. Change it when asked, or press <B>Later</B>.</>}>
          <div className="mk-window mk-login">
            <p className="mk-title">Staff login</p>
            <span className="mk-label">Username</span>
            <span className="mk-input"><span className="mk-type">nurse1</span><i className="mk-caret" /></span>
            <span className="mk-label">Password</span>
            <span className="mk-input"><span className="mk-type mk-type-2">•••••</span></span>
            <span className="mk-btn mk-primary mk-press">▶ Press start</span>
            <span className="mk-pop mk-swap-in">✓ Welcome!</span>
          </div>
          <Cursor from={['88%', '96%']} to={['52%', '78%']} />
        </Scene>
        <div className="man-cards">
          <Card icon={<Icon name="monitor" size={26} />} title="1 device">Signing in elsewhere signs this one out.</Card>
          <Card icon={<Icon name="history" size={26} />} title="30 min idle">You are signed out. Just sign in again.</Card>
          <Card icon={<Icon name="account" size={26} />} title="5 wrong tries" tone="warn">This computer is locked for 15 minutes.</Card>
        </div>
      </>
    ),
  },
  {
    id: 'tickets',
    title: 'Ticket numbers',
    lede: 'The letter tells you who the patient is. Serve next calls them in this order.',
    body: (
      <>
        <Scene className="mk-order-scene">
          <div className="mk-order">
            {([['E-001', 'emergency', '1st', 'Urgent care'], ['P-001', 'priority', '2nd', 'Senior · PWD · pregnant'], ['R-001', 'regular', '3rd', 'Everyone else']] as const).map(([n, kind, place, who], i) => (
              <div key={n} className="mk-order-item" style={{ '--i': i } as CSSProperties}>
                <span className="mk-medal">{place}</span>
                <Ticket n={n} kind={kind} className="mk-called" />
                <span className="mk-who">{who}</span>
              </div>
            ))}
          </div>
        </Scene>
        <div className="man-prefixes">
          <div><strong>General</strong><span className="man-chip emergency">E</span><span className="man-chip priority">P</span><span className="man-chip regular">R</span></div>
          <div><strong>Dental</strong><span className="man-chip emergency">DE</span><span className="man-chip priority">DP</span><span className="man-chip regular">DR</span></div>
          <div><strong>ABTC</strong><span className="man-chip emergency">AE</span><span className="man-chip priority">AP</span><span className="man-chip regular">AR</span></div>
          <div><strong>Resets</strong><span className="man-chip plain">001 every morning</span></div>
        </div>
      </>
    ),
  },
  {
    id: 'window',
    title: 'Choosing your window',
    who: 'Waiting Area · Admission',
    lede: 'Pick the window you are sitting at. Patients hear that window when you call them.',
    body: (
      <>
        <Scene className="mk-window-scene">
          <div className="mk-windows">
            <div className="mk-win"><b>Window 1</b><span className="man-chip priority">Priority + regular</span><em>Held by Ana</em></div>
            <div className="mk-win mk-win-target">
              <b>Window 2</b><span className="man-chip priority">Priority + regular</span>
              <span className="mk-btn mk-primary mk-press">Use this window</span>
              <span className="mk-win-mine mk-swap-in">✓ Your window</span>
            </div>
            <div className="mk-win"><b>Window 3</b><span className="man-chip regular">Regular only</span><em>Free</em></div>
            <div className="mk-win"><b>Window 4</b><span className="man-chip regular">Regular only</span><em>Free</em></div>
          </div>
          <Cursor from={['90%', '95%']} to={['37%', '60%']} />
        </Scene>
        <div className="man-cards man-cards-4">
          <Card icon={<span className="man-chip priority">P+R</span>} title="Waiting 1–2 · Admission 3–4">Call every type of ticket.</Card>
          <Card icon={<span className="man-chip regular">R</span>} title="All other windows">Regular only, so no one is stuck behind priority.</Card>
          <Card icon={<Icon name="takeover" size={26} />} title="Take over">A colleague's window. Their patient becomes yours.</Card>
          <Card icon={<Icon name="ticket" size={26} />} title="Ticket desk only">Just hand out tickets with this login.</Card>
        </div>
      </>
    ),
  },
  {
    id: 'console',
    title: 'Serving patients',
    who: 'Everyone who serves',
    lede: 'Press Serve next. The number is called out on the wall TV.',
    body: (
      <>
        <Scene className="mk-console-scene">
          <div className="mk-window mk-console">
            <div className="mk-tiles">
              <div className="mk-tile mk-tile-hot">
                <span>Now serving</span>
                <b className="mk-swap-out">-</b><b className="mk-swap-in">R-004</b>
              </div>
              <div className="mk-tile">
                <span>Next up</span>
                <b className="mk-swap-out">R-004</b><b className="mk-swap-in">R-005</b>
              </div>
              <div className="mk-tile">
                <span>Waiting</span>
                <b className="mk-swap-out">5</b><b className="mk-swap-in">4</b>
              </div>
            </div>
            <div className="mk-actions">
              <span className="mk-btn mk-primary mk-press">▶ Serve next</span>
              <span className="mk-btn">Repeat</span>
              <span className="mk-btn">Hold</span>
              <span className="mk-btn">Transfer</span>
              <span className="mk-btn">Finished</span>
            </div>
          </div>
          <div className="mk-tv mk-tv-small">
            <span className="mk-tv-num mk-swap-in">R-004</span>
            <span className="mk-tv-where mk-swap-in">Clinic 1</span>
            <span className="mk-waves mk-swap-in"><i /><i /><i /></span>
          </div>
          <Cursor from={['70%', '96%']} to={['13%', '67%']} />
        </Scene>
        <p className="man-then">Then pick one:</p>
        <div className="man-cards man-cards-4">
          <Card icon={<span className="mk-anim-pop"><Icon name="check" size={28} /></span>} title="Finished" tone="good">Visit done here.</Card>
          <Card icon={<span className="mk-anim-slide"><Icon name="transfer" size={28} /></span>} title="Transfer">Send to Lab, Pharmacy… The shortest queue is marked.</Card>
          <Card icon={<span className="mk-anim-blink"><Icon name="pause" size={28} /></span>} title="Hold">Stepped away. Serve them later.</Card>
          <Card icon={<span className="mk-anim-wave"><Icon name="speaker" size={28} /></span>} title="Repeat call">Didn't come? Call again.</Card>
        </div>
        <div className="man-rule">
          <span className="mk-btn mk-primary mk-disabled">▶ Serve next</span>
          <p><b>One patient at a time.</b> Serve next stays locked until your patient is finished, transferred or on hold.</p>
        </div>
      </>
    ),
  },
  {
    id: 'queue',
    title: 'The queue list',
    who: 'Everyone who serves',
    lede: "Today's tickets for your department. Filter by status, act on any row.",
    body: (
      <>
        <Scene className="mk-queue-scene">
          <div className="mk-window mk-queue">
            <div className="mk-seg"><span>All</span><span>Waiting</span><span>Hold</span><i className="mk-seg-pill" /></div>
            {([['P-003', 'waiting'], ['R-005', 'waiting'], ['R-002', 'hold'], ['R-006', 'waiting']] as const).map(([n, status]) => (
              <div key={n} className={`mk-row mk-row-${status}`}>
                <b>{n}</b>
                <span className={`mk-status ${status}`}>{status === 'hold' ? 'On hold' : 'Waiting'}</span>
                <span className="mk-row-btns">
                  {status === 'hold' ? <span className="mk-btn mk-sm"><Icon name="play" size={12} />Unhold</span> : <><span className="mk-btn mk-sm"><Icon name="play" size={12} />Serve</span><span className="mk-btn mk-sm"><Icon name="pause" size={12} />Hold</span></>}
                  <span className="mk-btn mk-sm mk-red"><Icon name="trash" size={12} />Remove</span>
                </span>
              </div>
            ))}
          </div>
        </Scene>
        <div className="man-cards">
          <Card icon={<Icon name="play" size={26} />} title="Serve (out of turn)">A physician or admin enters their password to approve.</Card>
          <Card icon={<Icon name="pause" size={26} />} title="Hold · Unhold">Park a patient, bring them back.</Card>
          <Card icon={<Icon name="trash" size={26} />} title="Remove" tone="warn">Left or duplicate ticket. Asks to confirm.</Card>
        </div>
        <div className="man-unattended">
          <div className="mk-row mk-row-unattended">
            <b>R-008</b>
            <span className="mk-status unattended">Unattended</span>
            <span className="mk-row-btns"><span className="mk-btn mk-sm"><Icon name="takeover" size={12} />Take over</span><span className="mk-btn mk-sm"><Icon name="undo" size={12} />Return to queue</span></span>
          </div>
          <p>A colleague signed out mid-visit. <b>Take over</b> if the patient is with you, or <b>Return to queue</b> to put them back in their place.</p>
        </div>
      </>
    ),
  },
  {
    id: 'clinics',
    title: 'Helping other clinics',
    who: 'Clinic 1 · 2 · 3',
    lede: 'Your queue is empty? Take a waiting patient from another clinic.',
    body: (
      <>
        <Scene className="mk-help-scene">
          <div className="mk-clinics">
            <div className="mk-clinic"><b>Clinic 1</b><span>0 waiting</span><div className="mk-slot" /></div>
            <div className="mk-clinic mk-clinic-busy"><b>Clinic 2</b><span>3 waiting</span><div className="mk-slot"><Ticket n="R-011" kind="regular" /><Ticket n="R-010" kind="regular" /></div></div>
          </div>
          <span className="mk-hop"><Ticket n="P-007" kind="priority" /></span>
          <span className="mk-help-walker"><Walker holding /></span>
        </Scene>
        <div className="man-cards">
          <Card icon={<Icon name="account" size={26} />} title="Confirm with your password" />
          <Card icon={<span className="man-chip plain">C4</span>} title="Clinic 4 is not included" tone="warn" />
        </div>
      </>
    ),
  },
  {
    id: 'lab',
    title: 'Returning lab patients',
    who: 'Laboratory',
    lede: 'Back with results? Type the return code from their ticket.',
    body: (
      <Scene className="mk-lab-scene">
        <div className="mk-flow">
          <div className="mk-flow-step" style={{ '--i': 0 } as CSSProperties}>
            <span className="mk-ticket regular mk-ticket-code"><small>Return code</small>X7K2</span>
          </div>
          <span className="mk-arrow">➜</span>
          <div className="mk-flow-step" style={{ '--i': 1 } as CSSProperties}>
            <span className="mk-input mk-input-wide"><span className="mk-type mk-type-code">X7K2</span></span>
            <span className="mk-btn mk-primary">Re-queue as priority</span>
          </div>
          <span className="mk-arrow">➜</span>
          <div className="mk-flow-step" style={{ '--i': 2 } as CSSProperties}>
            <Ticket n="P-009" kind="priority" />
            <span className="mk-who">Back in line, as priority</span>
          </div>
        </div>
      </Scene>
    ),
  },
  {
    id: 'kiosk',
    title: 'Ticket kiosk',
    who: 'Waiting Area · ABTC',
    lede: 'Tap the visit type. The ticket prints by itself.',
    body: (
      <>
        <Scene className="mk-kiosk-scene">
          <div className="mk-kiosk-col">
            <div className="mk-kiosk">
              <p className="mk-title">Take a queue number</p>
              <div className="mk-kiosk-btns">
                <span className="mk-kbtn regular">Regular</span>
                <span className="mk-kbtn priority mk-press">Priority</span>
                <span className="mk-kbtn emergency">Emergency</span>
              </div>
              <div className="mk-printer" />
            </div>
            <div className="mk-tray"><span className="mk-print-out"><Ticket n="P-012" kind="priority" /></span></div>
          </div>
          <Cursor from={['85%', '20%']} to={['50%', '38%']} />
        </Scene>
        <div className="man-cards man-cards-4">
          <Card icon={<span className="man-num-dot">1</span>} title="Consultation or Dental">Then Regular, Priority or Emergency. ABTC has its own kiosk.</Card>
          <Card icon={<span className="man-num-dot">2</span>} title="Ticket prints">Jammed? Press <B>Print again</B>.</Card>
          <Card icon={<span className="man-num-dot">3</span>} title="Press Done">Ready for the next patient.</Card>
          <Card icon={<Icon name="users" size={26} />} title="Priority = check ID" tone="warn">Senior, PWD or pregnant.</Card>
        </div>
      </>
    ),
  },
  {
    id: 'wall',
    title: 'Live wall monitor',
    who: 'TV in the waiting area',
    lede: 'Open Live on the TV. It calls every number out loud and updates by itself.',
    body: (
      <>
        <Scene className="mk-wall-scene">
          <div className="mk-tv">
            <span className="mk-tv-label">Now serving</span>
            <span className="mk-tv-num mk-flash">P-012</span>
            <span className="mk-tv-where">Window 2</span>
            <span className="mk-waves"><i /><i /><i /></span>
            <div className="mk-tv-list"><span>R-004 · Clinic 1</span><span>R-002 · Lab</span><span>P-005 · Pharmacy</span></div>
          </div>
          <span className="mk-tap"><i /></span>
        </Scene>
        <div className="man-cards">
          <Card icon={<span className="mk-anim-pop">👆</span>} title="Tap once after opening" tone="warn">Browsers keep it silent until you do.</Card>
          <Card icon={<span className="man-key">F11</span>} title="Full screen" />
          <Card icon={<Icon name="speaker" size={26} />} title="Check the TV volume" />
        </div>
      </>
    ),
  },
  {
    id: 'records',
    title: 'Records and your account',
    lede: 'Find past tickets, see who did what, and manage your own login.',
    body: (
      <div className="man-cards man-cards-4">
        <Card icon={<Icon name="history" size={28} />} title="Queue list">Past tickets. Dates, search, sort, export.</Card>
        <Card icon={<Icon name="search" size={28} />} title="Audit trail">Who did what, when. 20 per page.</Card>
        <Card icon={<Icon name="account" size={28} />} title="My account">Your name and password. Click your name, top right.</Card>
        <Card icon={<Icon name="logout" size={28} />} title="Logout" tone="warn">Every end of shift. Your patient stays with the window.</Card>
      </div>
    ),
  },
  {
    id: 'admin',
    title: 'For administrators',
    who: 'Admin accounts',
    lede: 'Everything is under System in the top menu.',
    body: (
      <div className="man-cards man-cards-4">
        <Card icon={<Icon name="users" size={28} />} title="Add user">Starts with the default password.</Card>
        <Card icon={<Icon name="account" size={28} />} title="Forgot password?">Edit the user, type a new password.</Card>
        <Card icon={<Icon name="logout" size={28} />} title="Sign out · Deactivate">End a session or block an account.</Card>
        <Card icon={<Icon name="logs" size={28} />} title="Activity">A user's recent actions.</Card>
        <Card icon={<Icon name="building" size={28} />} title="Departments">Add, rename, set active.</Card>
        <Card icon={<Icon name="window" size={28} />} title="Windows" tone="super">Superadmin only.</Card>
        <Card icon={<Icon name="database" size={28} />} title="Backups" tone="super">Run every night by themselves.</Card>
        <Card icon={<Icon name="takeover" size={28} />} title="Work as department" tone="super">Serve in any department or window.</Card>
      </div>
    ),
  },
  {
    id: 'help',
    title: 'Troubleshooting',
    lede: 'Tap a question to see the answer.',
    body: (
      <div className="man-faq">
        {[
          ['🔒', '"Serve next" is greyed out', 'You are still serving someone: finish, transfer or hold them. Waiting Area and Admission staff also need a window first.'],
          ['🚪', 'I was signed out by myself', '30 minutes idle, a sign-in on another device, or an admin changed your account. The sign-in page says which.'],
          ['⏳', '"Too many failed sign-in attempts"', 'Wait 15 minutes. Forgot the password? Ask an admin to reset it.'],
          ['🔇', 'The wall TV is silent', 'Tap once anywhere on the Live page and check the TV volume.'],
          ['🔍', 'A number is missing from my list', 'Check the Hold filter, or search it in Queue list to see where it was transferred.'],
          ['📡', 'A banner says the server cannot be reached', 'Wait a moment. Buttons pause until it is back; nothing is lost.'],
        ].map(([emoji, q, a]) => (
          <FaqItem key={q} icon={emoji} question={q} answer={a} />
        ))}
      </div>
    ),
  },
];

/** Staff user manual: public, so it can be read before signing in. */
export function Manual() {
  const { user } = useSession();
  const [active, setActive] = useState(SECTIONS[0].id);

  useEffect(() => {
    document.title = 'User manual · RHU Queue';
    // Highlight the section being read in the contents list.
    const spy = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: '-90px 0px -60% 0px' },
    );
    // Play each scene only while it is on screen.
    const play = new IntersectionObserver((entries) => entries.forEach((e) => e.target.classList.toggle('in', e.isIntersecting)), { threshold: 0.15 });
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) {
        spy.observe(el);
        play.observe(el);
      }
    });
    return () => {
      spy.disconnect();
      play.disconnect();
    };
  }, []);

  return (
    <div className="arcade manual">
      <header className="arcade-nav">
        <Link to="/login" className="arcade-brand" style={{ textDecoration: 'none' }}>
          <img src={`${BASE}/img/logo.jpg`} alt="" />
          <span>RHU<em>QUEUE</em></span>
        </Link>
        <div className="arcade-nav-actions">
          <button type="button" className="arcade-btn arcade-btn-ghost man-print" onClick={() => window.print()}>Print</button>
          <Link className="arcade-btn" to={user ? '/' : '/login'}>{user ? 'Back to console' : 'Sign in'}</Link>
        </div>
      </header>

      <section className="man-hero">
        <div className="arcade-wrap">
          <p className="arcade-eyebrow">Player's guide</p>
          <h1>Staff user manual</h1>
          <div className="man-quick" aria-label="Quick start">
            <div className="man-quick-step"><span className="man-num-dot">1</span><Icon name="account" size={30} /><b>Sign in</b></div>
            <span className="man-quick-arrow">▶</span>
            <div className="man-quick-step"><span className="man-num-dot">2</span><Icon name="play" size={30} /><b>Serve next</b></div>
            <span className="man-quick-arrow">▶</span>
            <div className="man-quick-step"><span className="man-num-dot">3</span><Icon name="check" size={30} /><b>Finish or transfer</b></div>
          </div>
        </div>
        <div className="man-hero-road" aria-hidden="true">
          <span className="man-hero-walker"><Walker holding /></span>
        </div>
      </section>

      <div className="arcade-wrap man-layout">
        <nav className="man-toc" aria-label="Manual sections">
          <p>Contents</p>
          <ol>
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={active === s.id ? 'on' : ''} aria-current={active === s.id ? 'location' : undefined}>
                  <span>{String(i + 1).padStart(2, '0')}</span>{s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <main className="man-body">
          {SECTIONS.map((s, i) => (
            <section key={s.id} id={s.id} className="man-section">
              <div className="man-head">
                <span className="man-num">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h2>{s.title}</h2>
                  {s.who && <p className="man-who">{s.who}</p>}
                </div>
              </div>
              <p className="man-lede-line">{s.lede}</p>
              <div className="man-split">{s.body}</div>
            </section>
          ))}
        </main>
      </div>

      <footer className="arcade-footer">
        <div className="arcade-wrap arcade-footer-inner">
          <div className="arcade-footer-links">
            <Link to="/login">Home</Link>
            <a href={`${BASE}/live`}>Live monitor</a>
          </div>
          <p>© {new Date().getFullYear()} Rural Health Unit</p>
        </div>
      </footer>
    </div>
  );
}
