// nginx rate limiting: the `tickets` zone backs login.php + both ticket
// kiosks at 6 req/min per client IP, and the zone is SHARED across those
// locations. This suite runs from the same host as the site, so every rate-
// limited request app-wide draws from one bucket. We space them ~11s apart
// (≈5.4/min, comfortably under the 6/min rate) regardless of which project or
// spec is running. `workers: 1` keeps this module state in a single process.
const ZONE_TICKETS_PATHS = new Set([
  '/queue/app/login.php',
  '/queue/app/waiting_queue.php',
  '/queue/app/abtc_queue.php',
]);

const MIN_GAP_MS = 17_000;

let lastLimitedAt = 0;

export function isRateLimited(path: string): boolean {
  const pathname = path.split('?')[0];
  return ZONE_TICKETS_PATHS.has(pathname);
}

export async function pace(path: string): Promise<void> {
  if (!isRateLimited(path)) {
    return;
  }
  const wait = MIN_GAP_MS - (Date.now() - lastLimitedAt);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastLimitedAt = Date.now();
}