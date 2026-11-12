import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { cache } from '../src/cache';
import { config } from '../src/config';
import { connect, db, disconnect, nextId, queue, users, type Category, type QueueDoc, type QueueStatus } from '../src/db';
import { emitted } from '../src/realtime';
import { seedBaseline } from '../src/seedData';
import { categoryRank } from '../src/services/numbers';

export const PASSWORD = 'testpass!123';
export const app = createApp();
let passwordHash = '';

/** Fresh baseline (departments, windows, superadmin) before every test. */
const TEST_DATABASE = 'rhu_queue_test';

/**
 * The suite wipes every collection before each test, so it must never run
 * against anything but the throwaway test database. Running vitest without
 * server/vitest.config.ts would otherwise pick up MONGO_URL from .env.
 */
function assertTestDatabase(connected = true): void {
  const name = connected ? db().databaseName : new URL(config.mongoUrl).pathname.replace(/^\//, '');
  if (process.env.NODE_ENV !== 'test' || name !== TEST_DATABASE) {
    throw new Error(`Refusing to run tests against database "${name}". Use "npm test" (server/vitest.config.ts).`);
  }
}

export function useDatabase(): void {
  beforeAll(async () => {
    assertTestDatabase(false);
    await connect();
    assertTestDatabase();
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });
  beforeEach(async () => {
    assertTestDatabase();
    for (const { name } of await db().listCollections().toArray()) {
      await db().collection(name).deleteMany({});
    }
    cache.clear();
    emitted.length = 0;
    await seedBaseline();
    await users().updateOne({ _id: 1 }, { $set: { password: passwordHash } });
  });
  afterAll(async () => {
    await disconnect();
  });
}

export async function makeUser(username: string, departmentId: number, usertype = 'staff', extra: Record<string, unknown> = {}): Promise<number> {
  const id = await nextId('users');
  await users().insertOne({
    _id: id,
    username,
    username_lower: username.toLowerCase(),
    password: passwordHash,
    usertype,
    firstname: username,
    lastname: 'Tester',
    middlename: '',
    position: '',
    department_id: departmentId,
    status: 'active',
    login_token: null,
    last_active: null,
    last_login_at: null,
    last_ip: null,
    ...extra,
  });
  return id;
}

/** Insert a queue row directly; created_at is anchored in the past so serve order is deterministic. */
export async function seedRow(departmentId: number, queueNumber: string, options: { status?: QueueStatus; category?: Category; secondsAgo?: number; servedBy?: number | null; servedAgo?: number; returnCode?: string } = {}): Promise<number> {
  const createdAt = new Date(Date.now() - (options.secondsAgo ?? 60) * 1000);
  const category = options.category ?? 'regular';
  const doc: QueueDoc = {
    _id: await nextId('queue'),
    department_id: departmentId,
    queue_number: queueNumber,
    status: options.status ?? 'waiting',
    category,
    category_rank: categoryRank(category),
    created_at: createdAt,
    arrival_at: createdAt,
    transferred_at: null,
    created_by: null,
    served_by: options.servedBy ?? null,
    served_at: options.servedAgo !== undefined ? new Date(Date.now() - options.servedAgo * 1000) : null,
    return_code: options.returnCode ?? null,
  };
  await queue().insertOne(doc);
  return doc._id;
}

export interface Client {
  get: (url: string) => request.Test;
  post: (url: string, body?: object) => request.Test;
  put: (url: string, body?: object) => request.Test;
  login: (username: string, password?: string) => Promise<request.Response>;
}

/** A browser-like client: keeps the session cookie and echoes the CSRF token. */
export async function client(): Promise<Client> {
  const agent = request.agent(app);
  let csrf = (await agent.get('/api/session')).body.csrf as string;
  const self: Client = {
    get: (url) => agent.get(url).set('Accept', 'application/json'),
    post: (url, body = {}) => agent.post(url).set('X-CSRF-Token', csrf).send(body),
    put: (url, body = {}) => agent.put(url).set('X-CSRF-Token', csrf).send(body),
    login: async (username, password = PASSWORD) => {
      const response = await self.post('/api/login', { username, password });
      if (response.body.csrf) {
        csrf = response.body.csrf;
      }
      return response;
    },
  };
  return self;
}

export async function loggedIn(username: string): Promise<Client> {
  const c = await client();
  const response = await c.login(username);
  if (!response.body.success) {
    throw new Error(`login failed for ${username}: ${JSON.stringify(response.body)}`);
  }
  return c;
}

export const row = (id: number) => queue().findOne({ _id: id });
