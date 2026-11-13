import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { hydrate, QueryClient, queryOptions } from '@tanstack/react-query';
import { persistQueryClientSubscribe, type PersistedClient } from '@tanstack/react-query-persist-client';
import { api, type ApiResult } from './api';

/**
 * Client-side cache for API reads. Pages show the last copy at once when
 * revisited and refresh it in the background; socket events and actions
 * invalidate it. `api()` never throws, so retries would only repeat errors.
 */
export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      // Kept a day so a page can still show its last copy after a reload while offline.
      gcTime: CACHE_MAX_AGE,
      // `api()` reports a lost connection itself, so queries always run.
      networkMode: 'always',
      retry: false,
      refetchOnWindowFocus: true,
    },
  },
});

/** Saves the query cache in this browser so screens open with their last data while offline. */
const STORAGE_KEY = 'rhuq-query-cache';
const BUSTER = 'v1';

export const persister = createSyncStoragePersister({
  storage: typeof window === 'undefined' ? undefined : window.localStorage,
  key: STORAGE_KEY,
  throttleTime: 250,
});

/**
 * Load the saved cache before the first render (the stock provider restores
 * asynchronously, which costs a "Loading" frame), then keep saving changes.
 */
export function restoreSavedCache(): void {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as PersistedClient | null;
    if (saved && saved.buster === BUSTER && Date.now() - saved.timestamp < CACHE_MAX_AGE) {
      hydrate(queryClient, saved.clientState);
    }
  } catch {
    // Unreadable or blocked storage: start with an empty cache.
  }
  persistQueryClientSubscribe({ queryClient, persister, buster: BUSTER });
}

/**
 * A failed read while offline must not replace the last good copy, so
 * offline answers are thrown away and the cached data stays on screen.
 */
export function keepOnOffline<T>(result: T, key: unknown[]): T {
  if (result && typeof result === 'object' && (result as { offline?: boolean }).offline) {
    const previous = queryClient.getQueryData<T>(key);
    if (previous !== undefined) {
      return previous;
    }
  }
  return result;
}

/**
 * The one definition of "GET this API path" for the cache. Pages (`useApi`)
 * and prefetching both use it, so a prefetched copy is exactly what the page reads.
 */
export function apiQuery<T = ApiResult>(path: string) {
  const queryKey = ['api', path] as const;
  return queryOptions({
    queryKey,
    queryFn: async (): Promise<T> => keepOnOffline(await api<T>(path), [...queryKey]),
  });
}

type ConsoleQueue = { q: ApiResult | null; pool: ApiResult | null };

/** A console's department queue (plus the shared clinic pool), shared by the Console page and prefetching. */
export function consoleQueueQuery(deptId: number, inPool: boolean) {
  const queryKey = ['console-queue', deptId, inPool] as const;
  return queryOptions({
    queryKey,
    staleTime: 0,
    queryFn: async (): Promise<ConsoleQueue> => {
      const [data, p] = await Promise.all([api(`/queue?department_id=${deptId}`), inPool ? api('/pool-waiting') : Promise.resolve(null)]);
      // A failed refresh (or no connection) keeps the last good list on screen rather than blanking it.
      const previous = queryClient.getQueryData<ConsoleQueue>([...queryKey]);
      return { q: data.success ? data : (previous?.q ?? null), pool: p?.success ? p : p?.offline ? (previous?.pool ?? null) : null };
    },
  });
}
