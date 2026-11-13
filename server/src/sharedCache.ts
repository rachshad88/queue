import { createClient } from 'redis';
import { config } from './config';

/** The few Redis calls the response cache needs; tests pass an in-memory stand-in. */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
  del(keys: string[]): Promise<unknown>;
}

const PREFIX = 'rhuq:';

/** Wall monitor setup (departments and window names); changes only on admin edits. */
export const LIVE_CONFIG_KEY = 'live-config';
let store: CacheStore | null = null;
let connecting: Promise<void> | null = null;

/**
 * Bumped on every queue change. Live-serving entries are keyed by it, so a
 * change makes the old entries unreachable at once without a Redis round trip.
 */
let generation = Date.now();

/** Connect when REDIS_URL is set. Without it, or when Redis is down, every read goes to MongoDB. */
export function connectCache(url: string = config.redisUrl): Promise<void> {
  if (!url || connecting) {
    return connecting ?? Promise.resolve();
  }
  const client = createClient({ url, socket: { connectTimeout: 2000, reconnectStrategy: (retries: number) => Math.min(retries * 500, 10000) } });
  client.on('error', (error: Error) => {
    if (store) {
      console.error('redis cache unavailable, reading from MongoDB', error.message);
    }
    store = null;
  });
  client.on('ready', () => {
    store = client as unknown as CacheStore;
  });
  connecting = client.connect().then(
    () => undefined,
    (error: Error) => console.error('redis cache disabled', error.message),
  );
  return connecting;
}

/** Swap the backing store (tests). */
export function useCacheStore(next: CacheStore | null): void {
  store = next;
}

/** Return the cached JSON for `key`, or run `loader` and keep its result for `ttlSeconds`. */
export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const current = store;
  if (!current) {
    return loader();
  }
  const fullKey = PREFIX + key;
  try {
    const hit = await current.get(fullKey);
    if (hit !== null) {
      return JSON.parse(hit) as T;
    }
  } catch {
    return loader();
  }
  const value = await loader();
  current.set(fullKey, JSON.stringify(value), { EX: ttlSeconds }).catch(() => undefined);
  return value;
}

/** Drop cached entries by key (fire-and-forget; a miss only costs one MongoDB read). */
export function invalidate(...keys: string[]): void {
  store?.del(keys.map((k) => PREFIX + k)).catch(() => undefined);
}

/** Mark every live-serving entry stale. Called from each realtime emit. */
export function bumpQueueGeneration(): void {
  generation++;
}

export function queueGeneration(): number {
  return generation;
}
