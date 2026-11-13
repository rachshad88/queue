import { existsSync } from 'node:fs';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { cached, type CacheStore, useCacheStore } from '../src/sharedCache';
import { app, client, loggedIn, makeUser, seedRow, useDatabase } from './helpers';

useDatabase();

/** In-memory stand-in for Redis that records every key it is asked for. */
function memoryStore(): CacheStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => data.set(key, value),
    del: async (keys) => keys.forEach((k) => data.delete(k)),
  };
}

afterEach(() => useCacheStore(null));

describe('shared response cache', () => {
  it('runs the loader once and serves the stored copy after that', async () => {
    useCacheStore(memoryStore());
    let calls = 0;
    const load = async (): Promise<{ n: number }> => ({ n: ++calls });
    expect(await cached('k', 10, load)).toEqual({ n: 1 });
    expect(await cached('k', 10, load)).toEqual({ n: 1 });
    expect(calls).toBe(1);
  });

  it('falls back to the loader when Redis is missing or failing', async () => {
    expect(await cached('k', 10, async () => 'direct')).toBe('direct');
    useCacheStore({ get: async () => Promise.reject(new Error('down')), set: async () => undefined, del: async () => undefined });
    expect(await cached('k', 10, async () => 'still works')).toBe('still works');
  });

  it('shows a new patient on the wall right after a serve, despite the cache', async () => {
    useCacheStore(memoryStore());
    await makeUser('doc1', 1);
    await seedRow(1, 'R-001', { secondsAgo: 300 });
    const wall = await client();
    expect((await wall.get('/api/live-serving?ids=1')).body[0].serving).toEqual([]);
    const c = await loggedIn('doc1');
    await c.post('/api/serve-next', { department_id: 1 });
    expect((await wall.get('/api/live-serving?ids=1')).body[0].serving[0].queue_number).toBe('R-001');
  });

  it('refreshes the wall department list after an admin edit', async () => {
    useCacheStore(memoryStore());
    await makeUser('boss', 1, 'admin');
    const wall = await client();
    const before = (await wall.get('/api/live-config')).body.departments.find((d: { id: number }) => d.id === 6);
    expect(before.name).toBe('PHARMACY');
    const admin = await loggedIn('boss');
    expect((await admin.put('/api/department-management/6', { name: 'PHARMACY 2', prefix: 'PH', status: 'active' })).body.success).toBe(true);
    const after = (await wall.get('/api/live-config')).body.departments.find((d: { id: number }) => d.id === 6);
    expect(after.name).toBe('PHARMACY 2');
  });
});

describe.skipIf(!existsSync('client/dist/img/logo.jpg'))('browser disk cache headers', () => {
  it('keeps images on disk, hashed builds for good, and always rechecks the service worker', async () => {
    expect((await request(app).get('/img/logo.jpg')).headers['cache-control']).toBe('public, max-age=86400, stale-while-revalidate=2592000');
    expect((await request(app).get('/sw.js')).headers['cache-control']).toBe('no-cache');
    expect((await request(app).get('/login')).headers['cache-control']).toBe('no-cache');
  });
});
