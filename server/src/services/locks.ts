const chains = new Map<string, Promise<void>>();

/**
 * Serialize async work per key inside this process. Used to keep one
 * operator's serve transitions in order; the database's unique serving index
 * remains the guarantee if the app is ever run as several processes.
 */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const tail = previous.then(() => gate);
  chains.set(key, tail);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (chains.get(key) === tail) {
      chains.delete(key);
    }
  }
}

export const operatorServeLock = <T>(userId: number, fn: () => Promise<T>): Promise<T> => withLock(`serve_op_${userId}`, fn);
