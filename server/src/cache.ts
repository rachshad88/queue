/** Small in-process TTL store for throttles, login lockouts and IP blocks. */
const store = new Map<string, { value: unknown; expires: number }>();

export const cache = {
  get<T>(key: string, fallback: T): T {
    const entry = store.get(key);
    if (!entry) {
      return fallback;
    }
    if (entry.expires <= Date.now()) {
      store.delete(key);
      return fallback;
    }
    return entry.value as T;
  },
  has(key: string): boolean {
    return this.get<unknown>(key, undefined) !== undefined;
  },
  put(key: string, value: unknown, seconds: number): void {
    store.set(key, { value, expires: Date.now() + seconds * 1000 });
  },
  /** Add one to a counter, starting its window on the first hit. */
  increment(key: string, seconds: number): number {
    const entry = store.get(key);
    if (!entry || entry.expires <= Date.now()) {
      store.set(key, { value: 1, expires: Date.now() + seconds * 1000 });
      return 1;
    }
    entry.value = (entry.value as number) + 1;
    return entry.value as number;
  },
  ttl(key: string): number {
    const entry = store.get(key);
    return entry ? Math.max(0, Math.ceil((entry.expires - Date.now()) / 1000)) : 0;
  },
  forget(key: string): void {
    store.delete(key);
  },
  clear(): void {
    store.clear();
  },
};

const sweep = setInterval(() => {
  const at = Date.now();
  for (const [key, entry] of store) {
    if (entry.expires <= at) {
      store.delete(key);
    }
  }
}, 60000);
sweep.unref();
