import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connectSocket, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { users } from '../src/db';
import { attachRealtime, recheckSessions, stopRealtime } from '../src/realtime';
import { sessionMiddleware } from '../src/session';
import { app, loggedIn, makeUser, PASSWORD, useDatabase } from './helpers';

useDatabase();

let server: HttpServer;
let url = '';
const sockets: Socket[] = [];

beforeEach(async () => {
  server = createServer(app);
  attachRealtime(server, sessionMiddleware());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  sockets.splice(0).forEach((s) => s.close());
  stopRealtime();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Sign in like a browser and return the session cookie it would hold. */
async function signIn(username: string): Promise<string> {
  const first = await request(app).get('/api/session');
  let cookie = (first.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
  const res = await request(app).post('/api/login').set('Cookie', cookie).set('X-CSRF-Token', first.body.csrf).send({ username, password: PASSWORD });
  expect(res.body.success).toBe(true);
  const renewed = res.headers['set-cookie'] as unknown as string[] | undefined;
  if (renewed) {
    cookie = renewed.map((c) => c.split(';')[0]).join('; ');
  }
  return cookie;
}

/** Open a signed-in screen's socket and resolve once the server has it. */
async function screen(cookie: string): Promise<Socket> {
  const socket = connectSocket(url, { transports: ['websocket'], extraHeaders: { cookie } });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', reject);
  });
  return socket;
}

const nextEnd = (socket: Socket): Promise<{ reason: string }> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no session-ended event')), 3000);
    socket.once('session-ended', (payload: { reason: string }) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

describe('session changes pushed over the socket (no client polling)', () => {
  it('signs the first screen out when the account signs in on another device', async () => {
    await makeUser('doc1', 1);
    const first = await screen(await signIn('doc1'));
    const ended = nextEnd(first);
    await signIn('doc1');
    expect(await ended).toEqual({ reason: 'another_device' });
  });

  it('tells a screen at once when an administrator signs the account out', async () => {
    const id = await makeUser('nurse', 15);
    const nurse = await screen(await signIn('nurse'));
    const ended = nextEnd(nurse);
    await (await loggedIn('superadmin')).post(`/api/users/${id}/deactivate`);
    expect(await ended).toEqual({ reason: 'revoked' });
  });

  it('reports idle expiry from the server sweep, and leaves active screens alone', async () => {
    const idleId = await makeUser('doc1', 1);
    await makeUser('doc2', 2);
    const idle = await screen(await signIn('doc1'));
    const busy = await screen(await signIn('doc2'));
    let busyEnded = false;
    busy.on('session-ended', () => {
      busyEnded = true;
    });
    await users().updateOne({ _id: idleId }, { $set: { last_active: new Date(Date.now() - 45 * 60000) } });
    const ended = nextEnd(idle);
    await recheckSessions();
    expect(await ended).toEqual({ reason: 'inactive' });
    expect(busyEnded).toBe(false);
  });

  it('stamps activity sent over the socket', async () => {
    const id = await makeUser('doc1', 1);
    const socket = await screen(await signIn('doc1'));
    await users().updateOne({ _id: id }, { $set: { last_active: new Date(Date.now() - 10 * 60000) } });
    socket.emit('activity');
    await expect.poll(async () => (await users().findOne({ _id: id }))!.last_active!.getTime(), { timeout: 2000 }).toBeGreaterThan(Date.now() - 60000);
  });

  it('caps how many department rooms one socket can join', async () => {
    const socket = connectSocket(url, { transports: ['websocket'] });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const reply = new Promise<{ depts: number[] }>((resolve) => socket.once('subscribed', resolve));
    socket.emit('subscribe', { depts: [...Array.from({ length: 5000 }, (_, i) => i + 1), -1, 2.5, 'x'], page: 'live' });
    const { depts } = await reply;
    expect(depts.length).toBe(20);
    expect(depts.every((d) => Number.isInteger(d) && d > 0)).toBe(true);
  });
});
