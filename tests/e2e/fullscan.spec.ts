import { expect, test } from '@playwright/test';
import { pace } from './lib/pacing';

type Row = { path: string; status: number; location?: string };

// GET-only sweep over the whole stack. Every code here is the app's *designed*
// behavior; non-200s are intentional (see deploy/README.md "Scan expectations").
const SWEEP: Row[] = [
  // --- public / health ---
  { path: '/up', status: 200 },
  { path: '/queue/app/login.php', status: 200 },
  { path: '/queue/app/live.php', status: 200 },
  { path: '/queue/app/get_live_serving.php', status: 200 },
  { path: '/queue/app/get_display_data.php', status: 200 },
  { path: '/queue/app/get_departments.php', status: 200 },
  { path: '/queue/app/session_check.php', status: 200 },

  // --- public kiosks ---
  { path: '/queue/app/waiting_queue.php', status: 200 },
  { path: '/queue/app/waiting_queue.php?from=admission', status: 200 },
  { path: '/queue/app/abtc_queue.php', status: 200 },
  { path: '/queue/app/ticket_others.php', status: 200 },

  // --- retired / dead endpoints (intentional) ---
  { path: '/queue/app/take_queue.php', status: 410 },
  { path: '/queue/app/sound/serve.php', status: 404 },
  { path: '/queue/app/sound/voice/check.php', status: 401 },
  { path: '/queue/app/sound/serve.php?f=announcement.wav', status: 200 },
  { path: '/queue/login.php', status: 302, location: '/queue/app/' },
  { path: '/css/autofill.css', status: 404 },

  // --- single.login-gated pages redirect to the login form while logged out ---
  { path: '/queue/app/index.php', status: 302, location: '/queue/app/login.php' },
  { path: '/queue/app/choose_section.php', status: 302, location: '/queue/app/login.php' },
  { path: '/queue/app/choose_waiting_section.php', status: 302, location: '/queue/app/login.php' },
  { path: '/queue/app/section_control.php', status: 302, location: '/queue/app/login.php' },
  { path: '/queue/app/user_management.php', status: 302, location: '/queue/app/login.php' },
  { path: '/queue/app/department_management.php', status: 302, location: '/queue/app/login.php' },
  { path: '/queue/app/queue_logs.php', status: 302, location: '/queue/app/login.php' },
  { path: '/queue/app/audit_trail.php', status: 302, location: '/queue/app/login.php' },
  { path: '/queue/app/served_queues.php', status: 302, location: '/queue/app/login.php' },
  { path: '/queue/app/server_history.php', status: 302, location: '/queue/app/login.php' },
  { path: '/queue/app/edit_account.php', status: 302, location: '/queue/app/login.php' },
  { path: '/queue/app/get_queue.php', status: 302, location: '/queue/app/login.php' },
  { path: '/queue/app/get_pool_waiting.php', status: 302, location: '/queue/app/login.php' },

  // --- fetch() targets answer JSON themselves while logged out ---
  { path: '/queue/app/sidebar.php', status: 401 },

  // --- POST-only endpoints reject GET ---
  { path: '/queue/app/assign_section.php', status: 405 },
  { path: '/queue/app/assign_waiting_section.php', status: 405 },
  { path: '/queue/app/release_section.php', status: 405 },
  { path: '/queue/app/serve_next.php', status: 405 },
  { path: '/queue/app/finish.php', status: 405 },
  { path: '/queue/app/queue_action.php', status: 405 },
  { path: '/queue/app/transfer_queue.php', status: 405 },
  { path: '/queue/app/prioritize_queue.php', status: 405 },
  { path: '/queue/app/switch_department.php', status: 405 },
  { path: '/queue/app/update_password.php', status: 405 },
  { path: '/queue/app/repeat_call.php', status: 405 },

  // --- logout accepts GET/POST and falls back to the login form ---
  { path: '/queue/app/logout.php', status: 302, location: '/queue/app/login.php' },

  // --- static assets served from the repo ---
  { path: '/js/index.js', status: 200 },
  { path: '/js/sidebar.js', status: 200 },
  { path: '/css/audit.css', status: 200 },
  { path: '/css/rhu-uniform.css', status: 200 },
  // kit: font-awesome is vendored locally and inlined; webfonts is the only
  // same-origin css subresource still fetched.
  { path: '/css/fontawesome/webfonts/fa-solid-900.woff2', status: 200 },
// The compiled base stylesheet (tailwind + login/live themes) is shipped
  // again, inlined into every page. The hashed JS bundles are not shipped, so
  // the /dist asset for JS still 404s by design.
  { path: '/dist/assets/module-CdqakSoB.css', status: 200 },
  { path: '/queue/app/sound/announcement.wav', status: 200 },

  // --- bootstrap/resolution redirects (native tree is gone; all /queue/* -> app) ---
  { path: '/', status: 302, location: '/queue/app/' },
  { path: '/login.php', status: 302, location: '/queue/app/' },
  { path: '/queue/', status: 302, location: '/queue/app/' },
  { path: '/queue/index.php', status: 302, location: '/queue/app/' },
];

test('full scan: every endpoint returns its designed code', async ({ request }) => {
  for (const row of SWEEP) {
    await pace(row.path);
    const res = await request.get(row.path, { maxRedirects: 0 });
    expect(res.status(), `${row.path} status`).toBe(row.status);
    if (row.location) {
      const loc = res.headers()['location'] || '';
      expect(loc, `${row.path} redirect target`).toContain(row.location);
    }
  }
});