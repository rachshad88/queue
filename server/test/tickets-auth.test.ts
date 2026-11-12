import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { dailyCounters, queue, users } from '../src/db';
import { heldByActiveRow, nextDailySequence, tierForNumber } from '../src/services/numbers';
import { manilaDayStart, manilaDayString } from '../src/time';
import { app, client, loggedIn, makeUser, seedRow, useDatabase } from './helpers';

useDatabase();

describe('ticket kiosks', () => {
  it('issues sequential waiting tickets with a return code, anonymously', async () => {
    const kiosk = await client();
    const first = await kiosk.post('/api/kiosk/waiting', { category: 'regular' });
    const second = await kiosk.post('/api/kiosk/waiting', { category: 'regular' });
    expect(first.body).toMatchObject({ success: true, department_id: 15, queue_number: 'R-001' });
    expect(second.body.queue_number).toBe('R-002');
    expect(first.body.code).toMatch(/^[A-Z0-9]{4}$/);
    const stored = await queue().findOne({ queue_number: 'R-001' });
    expect(stored).toMatchObject({ status: 'waiting', created_by: null, category: 'regular' });
  });

  it('numbers each category on its own counter', async () => {
    const kiosk = await client();
    await kiosk.post('/api/kiosk/waiting', { category: 'regular' });
    expect((await kiosk.post('/api/kiosk/waiting', { category: 'priority' })).body.queue_number).toBe('P-001');
    expect((await kiosk.post('/api/kiosk/waiting', { category: 'emergency' })).body.queue_number).toBe('E-001');
  });

  it('files dental tickets in the Waiting Area with DR/DP/DE numbers', async () => {
    const kiosk = await client();
    const res = await kiosk.post('/api/kiosk/waiting', { ticket_group: 'dental', category: 'priority' });
    expect(res.body).toMatchObject({ department_id: 15, queue_number: 'DP-001' });
  });

  it('issues AR/AP tickets at the ABTC kiosk and refuses emergency ones', async () => {
    const kiosk = await client();
    expect((await kiosk.post('/api/kiosk/abtc', { category: 'regular' })).body).toMatchObject({ department_id: 8, queue_number: 'AR-001' });
    expect((await kiosk.post('/api/kiosk/abtc', { category: 'emergency' })).status).toBe(400);
    expect((await kiosk.post('/api/kiosk/abtc', { category: 'priority' })).body.queue_number).toBe('AP-001');
  });

  it('answers an oversized body with 413 and a malformed one with 400', async () => {
    const c = await client();
    const big = await c.post('/api/login', { username: 'a'.repeat(200_000), password: 'b' });
    expect(big.status).toBe(413);
    const bad = await request(app).post('/api/login').set('Content-Type', 'application/json').send('{"username":');
    expect(bad.status).toBe(400);
  });

  it('rejects unknown kiosk categories and ticket groups instead of downgrading them', async () => {
    const kiosk = await client();
    for (const body of [{ category: 'vip' }, { category: ['regular'] }, { category: { $ne: 'x' } }, { ticket_group: 'pharmacy' }]) {
      expect((await kiosk.post('/api/kiosk/waiting', body)).status).toBe(400);
    }
    expect((await kiosk.post('/api/kiosk/waiting', {})).body.queue_number).toBe('R-001');
    expect((await kiosk.post('/api/kiosk/waiting', { ticket_group: 'dental', category: 'emergency' })).body.queue_number).toBe('DE-001');
  });

  it('rejects a kiosk POST without the CSRF token', async () => {
    const kiosk = await client();
    const res = await kiosk.post('/api/kiosk/waiting', {}).set('X-CSRF-Token', 'wrong');
    expect(res.status).toBe(403);
    expect(await queue().countDocuments()).toBe(0);
  });

  it('refuses test numbers unless the session is a superadmin', async () => {
    const anon = await client();
    expect((await anon.post('/api/kiosk/waiting', { generate_test_number: true })).status).toBe(403);
    const admin = await loggedIn('superadmin');
    const res = await admin.post('/api/kiosk/waiting', { generate_test_number: true });
    expect(res.body.success).toBe(true);
    expect((await queue().findOne({ queue_number: res.body.queue_number }))?.created_by).toBe(1);
  });

  it('never issues two tickets the same number under concurrency', async () => {
    const kiosk = await client();
    const results = await Promise.all(Array.from({ length: 12 }, () => kiosk.post('/api/kiosk/waiting', { category: 'regular' })));
    const numbers = results.map((r) => r.body.queue_number);
    expect(new Set(numbers).size).toBe(12);
  });

  it('steps over a number a patient is still holding today', async () => {
    await seedRow(15, 'R-001', { status: 'hold' });
    expect(await heldByActiveRow(15, 'R-001')).toBe(true);
    expect(await nextDailySequence(15, 'R')).toBe(2);
  });

  it('lets a carried-over ticket keep its number without blocking today', async () => {
    await seedRow(15, 'R-001', { secondsAgo: 2 * 86400 });
    expect(await nextDailySequence(15, 'R')).toBe(1);
    expect((await dailyCounters().findOne({ _id: `15:${manilaDayString()}:R` }))?.last_number).toBe(1);
  });

  it('serves the printable ticket by return code', async () => {
    const kiosk = await client();
    const issued = (await kiosk.post('/api/kiosk/waiting', {})).body;
    const ticket = await kiosk.get(`/api/ticket?department_id=15&queue_number=${issued.queue_number}&code=${issued.code}`);
    expect(ticket.body).toMatchObject({ success: true, queue_number: 'R-001', department_name: 'WAITING AREA', return_code: issued.code });
  });

  it('never reveals the return code to a lookup by number alone, or for a code from another ticket', async () => {
    const kiosk = await client();
    const first = (await kiosk.post('/api/kiosk/waiting', {})).body;
    const second = (await kiosk.post('/api/kiosk/waiting', {})).body;
    const anon = await client();
    const byNumber = await anon.get(`/api/ticket?department_id=15&queue_number=${first.queue_number}`);
    expect(byNumber.body).toMatchObject({ success: true, queue_number: first.queue_number, return_code: '' });
    const operatorStyle = await anon.get(`/api/ticket?department_id=15&queue_number=${first.queue_number}&code[$ne]=x`);
    expect(operatorStyle.body.return_code).toBe('');
    const mismatched = await anon.get(`/api/ticket?department_id=15&queue_number=${first.queue_number}&code=${second.code}`);
    expect(mismatched.status).toBe(404);
    const lowercase = await anon.get(`/api/ticket?department_id=15&queue_number=${first.queue_number}&code=${first.code.toLowerCase()}`);
    expect(lowercase.body.return_code).toBe(first.code);
  });

  it('reads the tier from the prefix', () => {
    expect([tierForNumber('AE-004'), tierForNumber('DP-010'), tierForNumber('R-001'), tierForNumber('junk')]).toEqual(['e', 'p', 'r', 'r']);
  });

  it('computes the Manila day start as 16:00 UTC of the previous day', () => {
    expect(manilaDayStart(new Date('2026-11-11T03:00:00Z')).toISOString()).toBe('2026-11-10T16:00:00.000Z');
    expect(manilaDayStart(new Date('2026-11-11T17:00:00Z')).toISOString()).toBe('2026-11-11T16:00:00.000Z');
  });
});

describe('login and single-device sessions', () => {
  it('signs in and reports the destination by department', async () => {
    await makeUser('adm1', 3);
    await makeUser('wait1', 15);
    await makeUser('doc1', 1);
    expect((await (await client()).login('adm1')).body.destination).toBe('/choose-section/admission');
    expect((await (await client()).login('wait1')).body.destination).toBe('/choose-section/waiting');
    expect((await (await client()).login('doc1')).body.destination).toBe('/');
  });

  it('answers the same generic error for a bad password, an unknown user and an inactive user', async () => {
    await makeUser('doc1', 1);
    await makeUser('gone', 1, 'staff', { status: 'inactive' });
    const c = await client();
    for (const [u, p] of [['doc1', 'nope'], ['nobody', 'x'], ['gone', undefined]] as const) {
      const res = await c.login(u, p);
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid username or password.');
    }
  });

  it('locks the account for the caller after five failures', async () => {
    await makeUser('doc1', 1);
    const c = await client();
    for (let i = 0; i < 5; i++) {
      await c.login('doc1', 'wrong');
    }
    const res = await c.login('doc1');
    expect(res.status).toBe(429);
    expect(res.body.message).toContain('Too many login attempts');
  });

  it('requires a session for protected endpoints', async () => {
    const res = await (await client()).get('/api/console');
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('login');
  });

  it('signs the first device out when a staff account logs in elsewhere', async () => {
    await makeUser('doc1', 1);
    const first = await loggedIn('doc1');
    const second = await loggedIn('doc1');
    const kicked = await first.get('/api/console');
    expect(kicked.status).toBe(401);
    expect(kicked.body.reason).toBe('another_device');
    expect((await second.get('/api/console')).status).toBe(200);
    expect((await first.get('/api/session-check?activity=0')).body).toMatchObject({ ok: false, reason: 'another_device' });
  });

  it('lets admins stay signed in on several devices', async () => {
    const a = await loggedIn('superadmin');
    const b = await loggedIn('superadmin');
    expect((await a.get('/api/console')).status).toBe(200);
    expect((await b.get('/api/console')).status).toBe(200);
  });

  it('reports idle expiry on an unstamped poll without reviving the account', async () => {
    const id = await makeUser('doc1', 1);
    const c = await loggedIn('doc1');
    await users().updateOne({ _id: id }, { $set: { last_active: new Date(Date.now() - 45 * 60000) } });
    expect((await c.get('/api/session-check?activity=0')).body).toMatchObject({ ok: false, reason: 'inactive' });
    expect((await users().findOne({ _id: id }))!.last_active!.getTime()).toBeLessThan(Date.now() - 40 * 60000);
  });

  it('logout frees the window and the device lock', async () => {
    const id = await makeUser('adm1', 3);
    const c = await loggedIn('adm1');
    await c.post('/api/sections/admission/assign', { section_id: 2 });
    await c.post('/api/logout');
    expect((await users().findOne({ _id: id }))?.login_token).toBeNull();
    const again = await loggedIn('adm1');
    const roster = (await again.get('/api/sections/admission')).body.sections;
    expect(roster.find((s: { id: number }) => s.id === 2).occupied_by).toBeNull();
  });
});
