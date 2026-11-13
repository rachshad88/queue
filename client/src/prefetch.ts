import type { SessionUser } from './auth';
import { AUDIT_TRAIL_PATH } from './pages/AuditTrail';
import { DEPARTMENTS_PATH } from './pages/Departments';
import { QUEUE_LOGS_PATH } from './pages/QueueLogs';
import { SERVER_HISTORY_PATH } from './pages/ServerHistory';
import { USERS_PATH } from './pages/Users';
import { apiQuery, consoleQueueQuery, queryClient } from './queryClient';

/** Every API read the user's menu can lead to, as each page asks for it when first opened. */
export function pathsFor(user: SessionUser): string[] {
  if (user.view_mode === 'for_customer') {
    return [];
  }
  const dept = user.department.toUpperCase();
  const paths = ['/console', SERVER_HISTORY_PATH, AUDIT_TRAIL_PATH, USERS_PATH];
  if (dept === 'WAITING AREA') {
    paths.push('/sections/waiting');
  } else if (dept === 'ADMISSION') {
    paths.push('/sections/admission');
  }
  if (user.usertype === 'admin') {
    paths.push(DEPARTMENTS_PATH);
  }
  if (user.is_superadmin) {
    paths.push(QUEUE_LOGS_PATH, '/sections-control', '/backup');
  }
  return paths;
}

const whenIdle = (run: () => void): void => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 1500 });
  } else {
    setTimeout(run, 200);
  }
};

/** Fetch one page's data ahead of time (skipped when a fresh copy is already cached). */
export function prefetchPath(path: string): Promise<void> {
  return queryClient.prefetchQuery(apiQuery(path));
}

/** Warm the console first (it is the landing page), then everything else the menu offers. */
export async function prefetchConsole(): Promise<void> {
  await prefetchPath('/console');
  const info = queryClient.getQueryData<Record<string, any>>(['api', '/console']);
  if (info?.department_id) {
    await queryClient.prefetchQuery(consoleQueueQuery(info.department_id, !!info.in_pool_clinic));
  }
}

/** Prefetch every screen this user can open, so each one paints from cache on first visit. */
export function prefetchFor(user: SessionUser | null, { now = false }: { now?: boolean } = {}): void {
  if (!user) {
    return;
  }
  const run = (): void => {
    const paths = pathsFor(user);
    if (paths.includes('/console')) {
      void prefetchConsole();
    }
    for (const path of paths.filter((p) => p !== '/console')) {
      void prefetchPath(path);
    }
  };
  if (now) {
    run();
  } else {
    whenIdle(run);
  }
}

/** Menu link → the API read its page makes first. */
const ROUTE_PATHS: Record<string, () => string> = {
  '/server-history': () => SERVER_HISTORY_PATH,
  '/audit-trail': () => AUDIT_TRAIL_PATH,
  '/users': () => USERS_PATH,
  '/departments': () => DEPARTMENTS_PATH,
  '/queue-logs': () => QUEUE_LOGS_PATH,
  '/sections': () => '/sections-control',
  '/backup': () => '/backup',
};

/** Pointer or focus on a menu link: make sure its page is fresh before the click lands. */
export function prefetchRoute(to: string): void {
  if (to === '/') {
    void prefetchConsole();
    return;
  }
  const path = ROUTE_PATHS[to]?.();
  if (path) {
    void prefetchPath(path);
  }
}
