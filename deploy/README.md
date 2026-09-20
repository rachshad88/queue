# Deploy Notes

This repository is fully self-contained for the production stack behind nginx
(`rhu.queue` / `192.168.110.31` / `100.68.89.123`). The system is **fully
Laravel**: nginx no longer executes any native PHP. The old native tree is
archived at `/home/user/archive/queue-native-*` and every URL under `/queue/*`
bounces to the Laravel front controller.

## Layout

- `public/` — owns all static assets (`js/`, `css/`, `app/sound/`, the offline
  voice clips under `app/sound/voice/`). nginx aliases `/js/`, `/css/`,
  `/dist/` and `/queue/app/sound/` straight here; nothing is synced from a
  native tree anymore (`sync-static.sh` is a documented no-op).
- `app/Http/Controllers/SoundController.php` — Laravel replacements for the two
  former native helpers, registered at the same URLs:
  - `sound/serve.php` — streams `announcement.{wav,m4a}` from `public/`
    (404 for unknown `f`, 1-day cache) for the `_annSrcs` fallback.
  - `sound/voice/check.php` — Laravel session + `SingleLoginService` gate, then
    reports the 62 expected voice clips (401 JSON when logged out).
- `queue-ws/` — the WebSocket server (socket.io, websocket-only transport),
  owned by this repo. `npm install` it here; the systemd unit `queue-ws.service`
  runs it with `EnvironmentFile=/etc/queue-ws.env` (`EMIT_TOKEN`,
  `ALLOWED_ORIGINS`; chmod 600, root-owned) and
  `WorkingDirectory=/home/user/queue-laravel/deploy/queue-ws`.

## Scan expectations (not failures)

A full 443 sweep legitimately returns several non-200 codes:

- `401` — `sidebar.php` and `app/sound/voice/check.php` (session-gated, callers
  handle the JSON body).
- `404` — `app/sound/serve.php` without a valid `?f=`, plus the retired
  `take_queue.php` generic-flow endpoint (kept at `410`).
- `503` — waiting/abtc kiosk, `ticket_others.php`, and `login.php` POST when more
  requests arrive than the `tickets` zone allows (6 r/m, burst 3 on the kiosks,
  burst 5 on `login.php`, all nodelay). A scanner firing pages back-to-back will
  trip this; a normal browser session does not.
- `302` — any `single.login`-protected page without a session redirects to the
  login form; the bootstrap/root paths (`/`, `/login.php`, `/queue/`,
  `/queue/index.php`, anything legacy under `/queue/*`) redirect to
  `/queue/app/`.

`/css/autofill.css` may 404 in access logs; it is referenced only by a browser
extension/agent, never by this app.

## End-to-end checks (Playwright)

Two projects live in `tests/e2e/` (browser Chromium, run against the live
stack over HTTPS):

- `fullscan` (no guard) — GET-only sweep of every endpoint and redirect. Safe to
  run any time:
  `npm run test:e2e:fullscan`
- `regression` (needs `E2E_ALLOW_LIVE=1`) — real login/kiosk/approved-serve/
  finish/admin-account flows that WRITE to the live queue database. The global
  setup upserts fixed operator accounts (`e2e_superadmin`, `e2e_admin`,
  `e2e_clinic`, `e2e_admission`, `e2e_waiting`, `e2e_abtc`; default password in
  `E2E_PASSWORD`, refuses blank/`12345`). Run during quiet hours and expect one
  waiting row to be left per kiosk test:
  `E2E_ALLOW_LIVE=1 npm run test:e2e:regression`

Behavior notes needed to pass against nginx's `tickets` rate zone (6 r/m nodelay,
shared bucket across `login.php`, `waiting_queue.php`, `abtc_queue.php`): the
suite runs serial (`workers: 1`) and `lib/pacing.ts` spaces those endpoints
~17s apart. The ABTC serving test targets the exact `queue_id` it issued (via
`get_queue.php`), so it can never serve a patient's row even when a leftover
test ticket from an earlier Manila day shares the same number (the daily counter
resets at midnight). `served_queues.php` reports daily/weekly/monthly totals
only — it never lists ticket numbers.