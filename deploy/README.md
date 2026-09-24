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

## Reverb migration (parallel phase — current state)

Browser → HTTPS → nginx → **WSS** → `php artisan reverb:start` (Reverb) →
Laravel → MSSQL. The legacy Node `queue-ws` server is still primary; Reverb
runs **alongside** it and every PHP emit goes to both paths
(`App\Services\EmitService`: legacy `:3000/emit` POST + `broadcast()` of
`App\Events\QueueUpdated` / `App\Events\RepeatCall`, both fail-open).
`public/js/reverb.js` (Echo + vendored `pusher.min.js`, stats beacon disabled)
only *adds* listeners today — Socket.IO still drives announcements.

- Channels: public `queue-display` (anonymous walls) + private `dept.{id}`
  (session-authed: own department, superadmins any). Auth endpoint
  `/broadcasting/auth` carries Laravel's `throttle:60,1` per IP plus the nginx
  `reverb_auth` zone in `reverb-nginx.conf`.
- Server-side guards (`config/reverb.php` via `.env`): `REVERB_APP_MAX_CONNECTIONS=500`
  (connection limits), `REVERB_APP_RATE_LIMITING_ENABLED=true` + 60 r/m
  (message rate limiting), `max_message_size` 10KB. Nginx adds
  `limit_conn reverb_conn 5` per IP. Client-originated events are never
  trusted: all payloads are built server-side and validated in the event
  constructors; `allowed_origins` stays `*` because nginx is the TLS/front
  barrier (tighten if the WS port is ever exposed directly).
- Run: `sudo cp deploy/reverb.service /etc/systemd/system/ && enable --now`;
  merge `deploy/reverb-nginx.conf` into the 443 server; production `.env`:
  `REVERB_HOST=rhu.queue`, `REVERB_PORT=443`, `REVERB_SCHEME=https`.

## Cutover checklist (Node → Reverb, when stable)

1. Confirm Reverb listeners fire in production (`reverb-queue-updated` events
   alongside socket refreshes; `storage/logs/laravel.log` has no
   `reverb emit failed` warnings).
2. Remove the legacy path: `EmitService::emitLegacy` + `:3000` code, the
   `socket.io.min.js` script tags and `window.io` branches, `deploy/queue-ws/`
   and its systemd unit.
3. Keep this README section updated (delete the parallel-phase notes).

## Scan expectations (not failures)

A full 443 sweep legitimately returns several non-200 codes:

- `401` — `sidebar.php` and `app/sound/voice/check.php` (session-gated, callers
  handle the JSON body).
- `404` — `app/sound/serve.php` without a valid `?f=`, plus the retired
  `take_queue.php` generic-flow endpoint (kept at `410`).
- `429` — the `tickets` and `generic` rate zones reject with 429 (not the nginx
  default 503). `tickets` (30 r/m, burst 12, per-IP) covers `login.php`,
  `waiting_queue.php`, `abtc_queue.php`, `update_password.php` as a shared
  flood barrier — loose enough that operators who reload a form are unaffected
  (verified: 13 rapid page loads before limiting) while sustained floods still
  trip it. Precision brute-force blocking is Laravel's: a 10 r/m per-ip|username
  work, `password-update` 3 r/m, kiosk issuance 6 r/m, plus a 15-minute lockout
  after 5 failed logins. `generic` (600 r/m, burst 40) covers the public `get_*`
  data endpoints. Sustained overflows are consumed by the `nginx-queue-limit`
  Fail2Ban jail (nginx `limiting requests` lines + Laravel `auth.failed` in
  `storage/logs/laravel.log`; 12 hits/10m → escalating 1h→7d ban on 80/443,
  Tailscale/local + building proxy IPs clear of the historical backfill).
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