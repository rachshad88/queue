import { describe, expect, it } from 'vitest';
import { departments, queue, queueLog, sectionLog, sections, users } from '../src/db';
import { emitted } from '../src/realtime';
import { client, loggedIn, makeUser, PASSWORD, row, seedRow, useDatabase } from './helpers';

useDatabase();

const DAY = 86400;

describe('serve next (clinic)', () => {
  it('serves urgency first, then first-in-first-out', async () => {
    await makeUser('doc1', 1);
    await seedRow(1, 'R-001', { secondsAgo: 300 });
    await seedRow(1, 'R-002', { secondsAgo: 200 });
    await seedRow(1, 'P-001', { category: 'priority', secondsAgo: 100 });
    await seedRow(1, 'E-001', { category: 'emergency', secondsAgo: 50 });
    const c = await loggedIn('doc1');
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      order.push((await c.post('/api/serve-next', { department_id: 1 })).body.queue_number);
      await c.post('/api/finish', { department_id: 1 });
    }
    expect(order).toEqual(['E-001', 'P-001', 'R-001', 'R-002']);
  });

  it('refuses a new patient until the current one is finished, then serves the next', async () => {
    const id = await makeUser('doc1', 1);
    const a = await seedRow(1, 'R-001', { secondsAgo: 300 });
    const b = await seedRow(1, 'R-002', { secondsAgo: 200 });
    await seedRow(2, 'R-003');
    const c = await loggedIn('doc1');
    await c.post('/api/serve-next', { department_id: 1 });
    expect((await c.post('/api/serve-next', { department_id: 1 })).body).toMatchObject({ success: false, message: 'Finish or transfer R-001 before serving another patient.' });
    expect((await c.post('/api/queue-action', { action: 'serve', queue_id: b, approver_password: PASSWORD })).body.message).toBe('Finish or transfer R-001 before serving another patient.');
    expect(await row(a)).toMatchObject({ status: 'serving', served_by: id });
    expect((await row(b))!.status).toBe('waiting');
    await c.post('/api/finish', { department_id: 1 });
    expect((await c.post('/api/serve-next', { department_id: 1 })).body.queue_number).toBe('R-002');
    expect((await queueLog().find({ queue_id: a }).toArray()).map((l) => l.action).sort()).toEqual(['finished', 'serving']);
  });

  it('leaves the current patient in service when nobody is waiting', async () => {
    await makeUser('doc1', 5);
    const a = await seedRow(5, 'R-001');
    const c = await loggedIn('doc1');
    await c.post('/api/serve-next', { department_id: 5 });
    const res = await c.post('/api/serve-next', { department_id: 5 });
    expect(res.body.success).toBe(false);
    expect((await row(a))!.status).toBe('serving');
  });

  it('never serves a ticket left over from an earlier day', async () => {
    await makeUser('doc1', 5);
    const old = await seedRow(5, 'R-009', { secondsAgo: 2 * DAY });
    const c = await loggedIn('doc1');
    expect((await c.post('/api/serve-next', { department_id: 5 })).body).toMatchObject({ success: false, message: 'No patients waiting today.' });
    expect((await c.post('/api/serve-next', { department_id: 5, scope: 'all' })).body.success).toBe(false);
    expect((await c.post('/api/queue-action', { action: 'serve', queue_id: old, approver_password: PASSWORD })).body.message).toContain('earlier day');
    expect((await row(old))!.status).toBe('waiting');
  });

  it('refuses another department', async () => {
    await makeUser('doc1', 1);
    await seedRow(2, 'R-001');
    const res = await (await loggedIn('doc1')).post('/api/serve-next', { department_id: 2 });
    expect(res.body).toMatchObject({ success: false, message: 'Access denied for this department.' });
  });

  it('never hands two operators the same patient', async () => {
    await makeUser('lab1', 5);
    await makeUser('lab2', 5);
    for (let i = 1; i <= 6; i++) {
      await seedRow(5, `R-00${i}`, { secondsAgo: 600 - i });
    }
    const [a, b] = [await loggedIn('lab1'), await loggedIn('lab2')];
    const served: string[] = [];
    for (let round = 0; round < 3; round++) {
      const [ra, rb] = await Promise.all([a.post('/api/serve-next', { department_id: 5 }), b.post('/api/serve-next', { department_id: 5 })]);
      served.push(ra.body.queue_number, rb.body.queue_number);
      await Promise.all([a.post('/api/finish', { department_id: 5 }), b.post('/api/finish', { department_id: 5 })]);
    }
    expect(new Set(served).size).toBe(6);
  });

  it('keeps one serving row per operator under a double submit', async () => {
    const id = await makeUser('doc1', 5);
    await seedRow(5, 'R-001', { secondsAgo: 300 });
    await seedRow(5, 'R-002', { secondsAgo: 200 });
    const c = await loggedIn('doc1');
    await Promise.all([c.post('/api/serve-next', { department_id: 5 }), c.post('/api/serve-next', { department_id: 5 })]);
    expect(await queue().countDocuments({ served_by: id, status: 'serving' })).toBe(1);
  });

  it('announces the serve to the department room', async () => {
    await makeUser('doc1', 1);
    await seedRow(1, 'R-001');
    await (await loggedIn('doc1')).post('/api/serve-next', { department_id: 1 });
    expect(emitted).toContainEqual({ event: 'queue-updated', payload: expect.objectContaining({ dept: 1, queue_number: 'R-001', section: 'CLINIC 1' }) });
  });
});

describe('queue polling', () => {
  it('lists the live queue with the day figures and the next-up preview', async () => {
    const id = await makeUser('doc1', 5);
    await seedRow(5, 'R-001', { secondsAgo: 300 });
    await seedRow(5, 'R-002', { secondsAgo: 200 });
    await seedRow(5, 'R-003', { status: 'done', servedBy: id });
    await seedRow(5, 'R-777', { secondsAgo: 3 * DAY });
    const c = await loggedIn('doc1');
    await c.post('/api/serve-next', { department_id: 5 });
    const res = (await c.get('/api/queue?department_id=5')).body;
    expect(res.queues.map((q: { queue_number: string }) => q.queue_number)).toEqual(['R-001', 'R-002']);
    expect(res).toMatchObject({ waiting_total: 1, patients_today: 3, finished_today: 1, serving_queue_number: 'R-001' });
    expect(res.next_up).toMatchObject({ queue_number: 'R-002', source: 'own' });
    expect(res).not.toHaveProperty('carried_total');
    const all = (await c.get('/api/queue?department_id=5&scope=all')).body;
    expect(all.queues).toHaveLength(2);
  });

  it('refuses another department or another user', async () => {
    await makeUser('doc1', 1);
    const c = await loggedIn('doc1');
    expect((await c.get('/api/queue?department_id=2')).body.success).toBe(false);
    expect((await c.get('/api/queue?department_id=1&user_id=1')).body.success).toBe(false);
  });
});

describe('windows (admission and waiting)', () => {
  it('requires a window, then serves through it and marks the wall', async () => {
    const id = await makeUser('adm1', 3);
    await seedRow(3, 'R-001');
    const c = await loggedIn('adm1');
    expect((await c.post('/api/serve-next', { department_id: 3 })).body.message).toBe('Not assigned to admission section.');
    expect((await c.post('/api/sections/admission/assign', { section_id: 1 })).body).toMatchObject({ success: true, section_name: 'Admission 1' });
    expect((await c.post('/api/serve-next', { department_id: 3 })).body.queue_number).toBe('R-001');
    expect(emitted).toContainEqual({ event: 'queue-updated', payload: expect.objectContaining({ dept: 3, section: 'Admission 1', queue_number: 'R-001' }) });
    const wall = (await (await client()).get('/api/live-serving?ids=3')).body[0];
    expect(wall.serving[0]).toMatchObject({ section: 'Admission 1', queue_number: 'R-001', staff: 'adm1 Tester' });
    expect(await sectionLog().countDocuments({ kind: 'admission', section_id: 1, action: 'claimed', user_id: id })).toBe(1);
  });

  it('refuses a taken window but allows an override by the same department', async () => {
    const first = await makeUser('adm1', 3);
    const second = await makeUser('adm2', 3);
    const a = await loggedIn('adm1');
    const b = await loggedIn('adm2');
    await a.post('/api/sections/admission/assign', { section_id: 1 });
    expect((await b.post('/api/sections/admission/assign', { section_id: 1 })).body.success).toBe(false);
    expect((await sections().findOne({ _id: 'admission:1' }))!.occupied_by).toBe(first);
    expect((await b.post('/api/sections/admission/assign', { section_id: 1, override: true })).body.success).toBe(true);
    expect((await sections().findOne({ _id: 'admission:1' }))!.occupied_by).toBe(second);
    expect(await sectionLog().countDocuments({ action: 'released', reason: 'overridden', user_id: first, operator_id: second })).toBe(1);
  });

  it('moves a staffer to a new window and frees the old one', async () => {
    await makeUser('adm1', 3);
    const c = await loggedIn('adm1');
    await c.post('/api/sections/admission/assign', { section_id: 1 });
    await c.post('/api/sections/admission/assign', { section_id: 3 });
    expect((await sections().findOne({ _id: 'admission:1' }))!.occupied_by).toBeNull();
    expect((await sections().findOne({ _id: 'admission:3' }))!.status).toBe(1);
  });

  it('keeps other departments off the windows', async () => {
    await makeUser('doc1', 1);
    const c = await loggedIn('doc1');
    expect((await c.post('/api/sections/admission/assign', { section_id: 2 })).status).toBe(403);
    expect((await c.post('/api/sections/waiting/assign', { section_id: 1, override: true })).status).toBe(403);
    expect((await sections().findOne({ _id: 'admission:2' }))!.occupied_by).toBeNull();
  });

  it('hides the roster from other departments', async () => {
    await makeUser('doc1', 1);
    expect((await (await loggedIn('doc1')).get('/api/sections/admission')).status).toBe(403);
  });

  it('calls a dental-issued patient from the waiting console and finishes them there', async () => {
    const id = await makeUser('wait1', 15);
    const dental = await seedRow(7, 'DR-001', { secondsAgo: 500 });
    const transferredIn = await seedRow(7, 'R-050', { secondsAgo: 900 });
    const c = await loggedIn('wait1');
    await c.post('/api/sections/waiting/assign', { section_id: 2 });
    const res = await c.post('/api/serve-next', { department_id: 15 });
    expect(res.body).toMatchObject({ success: true, queue_number: 'DR-001', department_id: 7 });
    expect(await row(dental)).toMatchObject({ department_id: 7, status: 'serving', served_by: id });
    expect((await row(transferredIn))!.status).toBe('waiting');
    const polled = (await c.get('/api/queue?department_id=15')).body;
    expect(polled).toMatchObject({ serving_queue_number: 'DR-001', serving_department_id: 7, serving_department_name: 'DENTAL' });
    expect((await c.post('/api/serve-next', { department_id: 15 })).body.message).toBe('Finish or transfer DR-001 before serving another patient.');
    expect((await c.post('/api/finish', { department_id: 15 })).body.success).toBe(true);
    expect((await row(dental))!.status).toBe('done');
  });

  it('lets a superadmin free a window and read its history', async () => {
    await makeUser('adm1', 3);
    await (await loggedIn('adm1')).post('/api/sections/admission/assign', { section_id: 4 });
    const admin = await loggedIn('superadmin');
    expect((await admin.post('/api/sections-release', { type: 'admission', section_id: 4 })).body).toMatchObject({ success: true, section: 'Admission 4' });
    expect((await admin.post('/api/sections-release', { type: 'admission', section_id: 4 })).body.message).toBe('Section is already free');
    const history = (await admin.get('/api/sections/admission/4/history')).body.history;
    expect(history.map((h: { action: string }) => h.action)).toEqual(['force_released', 'claimed']);
    expect(history[0].operator_name).toBe('System Administrator');
  });

  it('lets a superadmin take over a window without occupying it', async () => {
    await seedRow(3, 'R-001');
    const admin = await loggedIn('superadmin');
    expect((await admin.post('/api/serve-next', { department_id: 3 })).body.message).toBe('Select a admission section window first.');
    const switched = await admin.post('/api/switch-department', { department_id: 3, section_id: 2 });
    expect(switched.body).toMatchObject({ success: true, sectioned: true, active_window: 'Admission 2' });
    expect((await admin.post('/api/serve-next', { department_id: 3 })).body.queue_number).toBe('R-001');
  });
});

describe('row actions, finish and repeat', () => {
  it('holds, unholds and removes with a guarded status', async () => {
    await makeUser('doc1', 1);
    const id = await seedRow(1, 'R-001');
    const c = await loggedIn('doc1');
    expect((await c.post('/api/queue-action', { action: 'hold', queue_id: id })).body).toMatchObject({ success: true, message: 'R-001 is on hold.' });
    expect((await row(id))!.status).toBe('hold');
    expect((await c.post('/api/queue-action', { action: 'hold', queue_id: id })).body.success).toBe(false);
    await c.post('/api/queue-action', { action: 'unhold', queue_id: id });
    expect((await row(id))!.status).toBe('waiting');
    expect((await c.post('/api/queue-action', { action: 'remove', queue_id: id })).body.message).toBe('R-001 was removed from the queue.');
    expect((await row(id))!.status).toBe('removed');
  });

  it('only lets the serving operator hold a serving row', async () => {
    await makeUser('lab1', 5);
    await makeUser('lab2', 5);
    const id = await seedRow(5, 'R-001');
    await (await loggedIn('lab1')).post('/api/serve-next', { department_id: 5 });
    const res = await (await loggedIn('lab2')).post('/api/queue-action', { action: 'hold', queue_id: id });
    expect(res.body.message).toBe('Only the serving operator can hold this queue');
  });

  it('needs a physician or admin password to serve a chosen row', async () => {
    await makeUser('lab1', 5);
    await makeUser('doc1', 1);
    const id = await seedRow(5, 'R-002');
    const c = await loggedIn('lab1');
    expect((await c.post('/api/queue-action', { action: 'serve', queue_id: id })).body.message).toBe('Physician/Admin approval required');
    expect((await c.post('/api/queue-action', { action: 'serve', queue_id: id, approver_password: 'nope' })).body.message).toBe('Invalid credentials');
    expect((await c.post('/api/queue-action', { action: 'serve', queue_id: id, approver_password: PASSWORD })).body.success).toBe(true);
    expect((await row(id))!.status).toBe('serving');
  });

  it('cannot act on another department’s row', async () => {
    await makeUser('doc1', 1);
    const id = await seedRow(2, 'R-001');
    const res = await (await loggedIn('doc1')).post('/api/queue-action', { action: 'remove', queue_id: id });
    expect(res.body.message).toBe('Queue not found in this department');
  });

  it('finishes the current patient and reports when there is none', async () => {
    await makeUser('doc1', 1);
    const id = await seedRow(1, 'R-001');
    const c = await loggedIn('doc1');
    expect((await c.post('/api/finish', { department_id: 1 })).body.message).toBe('Nothing is currently being served.');
    await c.post('/api/serve-next', { department_id: 1 });
    expect((await c.post('/api/finish', { department_id: 1 })).body.success).toBe(true);
    expect((await row(id))!.status).toBe('done');
  });

  it('only lets the serving operator repeat a call', async () => {
    await makeUser('lab1', 5);
    await makeUser('lab2', 5);
    await seedRow(5, 'R-001');
    const a = await loggedIn('lab1');
    await a.post('/api/serve-next', { department_id: 5 });
    const spoof = await (await loggedIn('lab2')).post('/api/repeat-call', { department_id: 5, queue_number: 'R-001' });
    expect(spoof.body.success).toBe(false);
    expect((await a.post('/api/repeat-call', { department_id: 5, queue_number: 'R-001', department_name: 'LABORATORY' })).body.success).toBe(true);
    expect(emitted.filter((e) => e.event === 'repeat-call')).toHaveLength(1);
  });
});

describe('transfers and returning patients', () => {
  it('moves the current patient to the back of the target queue by arrival', async () => {
    await makeUser('adm1', 3);
    const moved = await seedRow(3, 'R-001', { secondsAgo: 3000 });
    const waitingThere = await seedRow(5, 'R-020', { secondsAgo: 60 });
    const c = await loggedIn('adm1');
    await c.post('/api/sections/admission/assign', { section_id: 1 });
    await c.post('/api/serve-next', { department_id: 3 });
    expect((await c.post('/api/transfer', { department_id: 5 })).body).toMatchObject({ success: true, queue_code: 'R-001' });
    const after = (await row(moved))!;
    expect(after).toMatchObject({ department_id: 5, status: 'waiting', served_by: null, category: 'regular' });
    expect(after.arrival_at.getTime()).toBeGreaterThan((await row(waitingThere))!.arrival_at.getTime());
    expect((await queueLog().find({ queue_id: moved, action: /transferred/ }).toArray()).map((l) => `${l.action}:${l.department_id}`).sort()).toEqual(['transferred_in:5', 'transferred_out:3']);

    await makeUser('lab1', 5);
    const lab = await loggedIn('lab1');
    expect((await lab.post('/api/serve-next', { department_id: 5 })).body.queue_number).toBe('R-020');
    const listed = (await lab.get('/api/queue?department_id=5')).body.queues.find((q: { id: number }) => q.id === moved);
    expect(listed.transferred_from_name).toBe('ADMISSION');
  });

  it('promotes a regular ticket to priority only from the laboratory to a clinic', async () => {
    await makeUser('lab1', 5);
    const toClinic = await seedRow(5, 'R-001', { secondsAgo: 300 });
    const toPharmacy = await seedRow(5, 'R-002', { secondsAgo: 200 });
    const c = await loggedIn('lab1');
    await c.post('/api/serve-next', { department_id: 5 });
    await c.post('/api/transfer', { department_id: 1 });
    await c.post('/api/serve-next', { department_id: 5 });
    await c.post('/api/transfer', { department_id: 6 });
    expect(await row(toClinic)).toMatchObject({ category: 'priority', category_rank: 1 });
    expect(await row(toPharmacy)).toMatchObject({ category: 'regular', category_rank: 2 });
  });

  it('refuses a transfer with no patient, to itself, or to an inactive department', async () => {
    await makeUser('doc1', 1);
    const c = await loggedIn('doc1');
    expect((await c.post('/api/transfer', { department_id: 5 })).body.message).toBe('No patient currently being served');
    expect((await c.post('/api/transfer', { department_id: 1 })).body.message).toBe('Cannot transfer to the same department');
    expect((await c.post('/api/transfer', { department_id: 999 })).body.message).toBe('That department does not exist.');
    await departments().updateOne({ _id: 9 }, { $set: { status: 'inactive' } });
    expect((await c.post('/api/transfer', { department_id: 9 })).body.message).toBe('Target department is inactive');
  });

  it('refuses to transfer a dental patient to dental from the waiting console', async () => {
    await makeUser('wait1', 15);
    await seedRow(7, 'DR-001');
    const c = await loggedIn('wait1');
    await c.post('/api/sections/waiting/assign', { section_id: 1 });
    await c.post('/api/serve-next', { department_id: 15 });
    expect((await c.post('/api/transfer', { department_id: 7 })).body.message).toBe('This patient is already in DENTAL. Pick another department.');
  });

  it('re-queues a returning patient in the laboratory by return code', async () => {
    await makeUser('lab1', 5);
    await makeUser('doc1', 1);
    const id = await seedRow(1, 'R-004', { status: 'done', returnCode: 'AB12' });
    expect((await (await loggedIn('doc1')).post('/api/prioritize', { code: 'AB12' })).body.message).toBe('Only the LABORATORY department can prioritize queues');
    const lab = await loggedIn('lab1');
    expect((await lab.post('/api/prioritize', { code: 'zzzz' })).body.success).toBe(false);
    expect((await lab.post('/api/prioritize', { code: 'ab12' })).body).toMatchObject({ success: true, queue_number: 'R-004' });
    expect(await row(id)).toMatchObject({ department_id: 5, status: 'waiting', category: 'priority' });
    const listed = (await lab.get('/api/queue?department_id=5')).body.queues[0];
    expect(listed.is_returning).toBe(true);
    expect((await lab.post('/api/prioritize', { code: 'AB12' })).body.message).toBe('That ticket is already waiting in this department');
  });
});

describe('mutual help pool', () => {
  it('serves a sibling clinic’s patient when our own queue is empty', async () => {
    const id = await makeUser('doc1', 1);
    const theirs = await seedRow(2, 'R-001');
    const c = await loggedIn('doc1');
    expect((await c.get('/api/queue?department_id=1')).body.next_up).toMatchObject({ source: 'pool', department_id: 2 });
    expect((await c.post('/api/serve-next', { department_id: 1 })).body).toMatchObject({ success: true, queue_number: 'R-001', pool: true });
    expect(await row(theirs)).toMatchObject({ department_id: 1, status: 'serving', served_by: id });
    expect(await queueLog().countDocuments({ queue_id: theirs, action: 'pool_taken' })).toBe(1);
  });

  it('pulls a chosen patient only with the password and an empty own queue', async () => {
    await makeUser('doc1', 1);
    const theirs = await seedRow(4, 'R-001');
    const mine = await seedRow(1, 'R-005');
    const c = await loggedIn('doc1');
    const panel = (await c.get('/api/pool-waiting')).body;
    expect(panel).toMatchObject({ success: true, mine_free: false, mine_waiting: 1 });
    expect(panel.pool[0]).toMatchObject({ id: 4, name: 'CLINIC 3' });
    expect((await c.post('/api/serve-pool', { department_id: 4, queue_id: theirs, password: 'wrong' })).body.message).toBe('Invalid password.');
    expect((await c.post('/api/serve-pool', { department_id: 4, queue_id: theirs, password: PASSWORD })).body.message).toContain('Serve them first');
    await queue().updateOne({ _id: mine }, { $set: { status: 'done' } });
    expect((await c.post('/api/serve-pool', { department_id: 4, queue_id: theirs, password: PASSWORD })).body.success).toBe(true);
    expect((await c.post('/api/serve-pool', { department_id: 4, queue_id: theirs, password: PASSWORD })).body.success).toBe(false);
  });

  it('refuses to pull from another clinic while serving, and hides earlier days and CLINIC 4', async () => {
    await makeUser('doc1', 1);
    await seedRow(1, 'R-001');
    const theirs = await seedRow(2, 'R-002');
    await seedRow(4, 'R-003', { secondsAgo: 2 * DAY });
    await seedRow(12, 'R-004');
    const c = await loggedIn('doc1');
    await c.post('/api/serve-next', { department_id: 1 });
    expect((await c.post('/api/serve-pool', { department_id: 2, queue_id: theirs, password: PASSWORD })).body.message).toBe('Finish or transfer R-001 before serving another patient.');
    const panel = (await c.get('/api/pool-waiting')).body;
    expect(panel.pool.map((d: { id: number; rows: { queue_number: string }[] }) => [d.id, d.rows.map((r) => r.queue_number)])).toEqual([[2, ['R-002']]]);
    expect((await c.post('/api/serve-pool', { department_id: 12, queue_id: theirs, password: PASSWORD })).body.success).toBe(false);
  });

  it('is closed to departments outside the pool', async () => {
    await makeUser('lab1', 5);
    expect((await (await loggedIn('lab1')).get('/api/pool-waiting')).body.success).toBe(false);
  });
});

describe('unattended patients (staffer signed out mid-serve)', () => {
  const unattendedRows = async (c: Awaited<ReturnType<typeof loggedIn>>, dept: number) =>
    (await c.get(`/api/queue?department_id=${dept}`)).body.queues.filter((q: { unattended: boolean }) => q.unattended);

  it('keeps the patient with their staffer through a sign-out and gives them back on sign-in', async () => {
    const id = await makeUser('doc1', 1);
    const patient = await seedRow(1, 'R-001');
    let c = await loggedIn('doc1');
    await c.post('/api/serve-next', { department_id: 1 });
    await c.post('/api/logout');
    expect(await row(patient)).toMatchObject({ status: 'serving', served_by: id });
    c = await loggedIn('doc1');
    const polled = (await c.get('/api/queue?department_id=1')).body;
    expect(polled.serving_queue_number).toBe('R-001');
    expect(await unattendedRows(c, 1)).toEqual([]);
    expect((await c.post('/api/finish', { department_id: 1 })).body.success).toBe(true);
  });

  it('never releases a patient on its own, however long the staffer is away', async () => {
    const id = await makeUser('doc1', 1);
    const patient = await seedRow(1, 'R-001', { status: 'serving', servedBy: id, servedAgo: 5 * 3600, secondsAgo: 6 * 3600 });
    await seedRow(1, 'R-002');
    await makeUser('doc2', 1);
    const other = await loggedIn('doc2');
    await other.post('/api/serve-next', { department_id: 1 });
    await (await client()).get('/api/live-serving?ids=1');
    expect(await row(patient)).toMatchObject({ status: 'serving', served_by: id });
    expect((await unattendedRows(other, 1)).map((q: { queue_number: string }) => q.queue_number)).toEqual(['R-001']);
  });

  it('shows a signed-out staffer’s patient to colleagues and on the wall, and lets one take them over at their window', async () => {
    await makeUser('wait1', 15);
    const colleague = await makeUser('wait2', 15);
    const patient = await seedRow(15, 'R-001');
    const first = await loggedIn('wait1');
    await first.post('/api/sections/waiting/assign', { section_id: 2 });
    await first.post('/api/serve-next', { department_id: 15 });
    await first.post('/api/logout');

    const wallBefore = (await (await client()).get('/api/live-serving?ids=15')).body[0].serving;
    expect(wallBefore.find((s: { section: string }) => s.section === 'Waiting Area 2')).toMatchObject({ queue_number: 'R-001', staff: null });

    const second = await loggedIn('wait2');
    await second.post('/api/sections/waiting/assign', { section_id: 1 });
    expect(await unattendedRows(second, 15)).toEqual([expect.objectContaining({ id: patient, queue_number: 'R-001', unattended_by_name: 'wait1 Tester' })]);
    expect((await second.post('/api/queue-action', { action: 'hold', queue_id: patient })).body.success).toBe(false);

    emitted.length = 0;
    expect((await second.post('/api/queue-action', { action: 'takeover', queue_id: patient })).body).toMatchObject({ success: true, message: 'You are now serving R-001.' });
    expect(await row(patient)).toMatchObject({ status: 'serving', served_by: colleague, section_id: 1 });
    expect(emitted).toContainEqual({ event: 'queue-updated', payload: expect.objectContaining({ dept: 15, section: 'Waiting Area 1', queue_number: 'R-001' }) });
    expect(await queueLog().countDocuments({ queue_id: patient, action: 'taken_over', user_id: colleague })).toBe(1);
    const wallAfter = (await (await client()).get('/api/live-serving?ids=15')).body[0].serving;
    expect(wallAfter.map((s: { section: string; queue_number: string }) => `${s.section}:${s.queue_number}`)).toEqual([
      'Waiting Area 1:R-001',
      'Waiting Area 2:-',
      'Waiting Area 3:-',
      'Waiting Area 4:-',
    ]);
    expect((await second.get('/api/queue?department_id=15')).body.serving_queue_number).toBe('R-001');
  });

  it('returns an unattended patient to the queue in their original place', async () => {
    await makeUser('doc1', 1);
    await makeUser('doc2', 1);
    const patient = await seedRow(1, 'R-001', { secondsAgo: 600 });
    await seedRow(1, 'R-002', { secondsAgo: 300 });
    const first = await loggedIn('doc1');
    await first.post('/api/serve-next', { department_id: 1 });
    await first.post('/api/logout');
    const second = await loggedIn('doc2');
    expect((await second.post('/api/queue-action', { action: 'return', queue_id: patient })).body).toMatchObject({ success: true, message: 'R-001 is back in the queue in their original place.' });
    expect(await row(patient)).toMatchObject({ status: 'waiting', served_by: null });
    expect((await second.get('/api/queue?department_id=1')).body.next_up.queue_number).toBe('R-001');
    expect(await queueLog().countDocuments({ queue_id: patient, action: 'returned_to_queue' })).toBe(1);
    expect((await second.post('/api/queue-action', { action: 'return', queue_id: patient })).body.success).toBe(false);
  });

  it('refuses to take over or return a patient whose staffer is still signed in', async () => {
    await makeUser('lab1', 5);
    await makeUser('lab2', 5);
    const patient = await seedRow(5, 'R-001');
    await (await loggedIn('lab1')).post('/api/serve-next', { department_id: 5 });
    const other = await loggedIn('lab2');
    expect(await unattendedRows(other, 5)).toEqual([]);
    for (const action of ['takeover', 'return']) {
      expect((await other.post('/api/queue-action', { action, queue_id: patient })).body.message).toContain('no longer unattended');
    }
    expect(await row(patient)).toMatchObject({ status: 'serving' });
  });

  it('makes a colleague finish their own patient before taking over another, and keeps other departments out', async () => {
    const gone = await makeUser('lab1', 5);
    await makeUser('lab2', 5);
    await makeUser('doc1', 1);
    const patient = await seedRow(5, 'R-001', { status: 'serving', servedBy: gone, servedAgo: 60 });
    await seedRow(5, 'R-002');
    const other = await loggedIn('lab2');
    await other.post('/api/serve-next', { department_id: 5 });
    expect((await other.post('/api/queue-action', { action: 'takeover', queue_id: patient })).body.message).toBe('Finish or transfer R-002 before serving another patient.');
    expect((await (await loggedIn('doc1')).post('/api/queue-action', { action: 'takeover', queue_id: patient })).body.message).toBe('Queue not found in this department');
  });

  it('treats the patient of a deactivated or moved staffer as unattended, and tells a moved staffer why they cannot serve', async () => {
    const lab1 = await makeUser('lab1', 5);
    const lab2 = await makeUser('lab2', 5);
    await seedRow(5, 'R-001');
    await seedRow(1, 'R-009');
    const admin = await loggedIn('superadmin');
    await (await loggedIn('lab1')).post('/api/serve-next', { department_id: 5 });
    await (await loggedIn('lab2')).post('/api/logout');

    await admin.put(`/api/users/${lab1}`, { username: 'lab1', firstname: 'F', lastname: 'L', usertype: 'staff', department: 1, status: 'active' });
    const moved = await loggedIn('lab1');
    expect((await moved.post('/api/serve-next', { department_id: 1 })).body.message).toBe(
      'You are still recorded as serving R-001 in LABORATORY. Ask someone there to take them over or return them to the queue.',
    );
    const colleague = await loggedIn('lab2');
    expect((await unattendedRows(colleague, 5)).map((q: { unattended_by_name: string }) => q.unattended_by_name)).toEqual(['F L']);

    expect((await admin.post(`/api/users/${lab1}/deactivate`)).body.success).toBe(true);
    expect(await unattendedRows(colleague, 5)).toHaveLength(1);
  });
});

describe('removed tickets, renumbering and the day figures', () => {
  it('does not count a removed ticket as finished', async () => {
    await makeUser('doc1', 1);
    const id = await seedRow(1, 'R-001');
    const c = await loggedIn('doc1');
    await c.post('/api/queue-action', { action: 'remove', queue_id: id });
    expect((await c.get('/api/queue?department_id=1')).body).toMatchObject({ finished_today: 0, patients_today: 1 });
  });

  it('renumbers a transferred patient whose number a carried-over ticket already holds there', async () => {
    await makeUser('lab1', 5);
    await seedRow(6, 'R-001', { secondsAgo: 2 * DAY });
    const moved = await seedRow(5, 'R-001');
    const c = await loggedIn('lab1');
    await c.post('/api/serve-next', { department_id: 5 });
    const res = (await c.post('/api/transfer', { department_id: 6 })).body;
    expect(res.success).toBe(true);
    expect(res.renumbered_to).toMatch(/^R-\d{3}$/);
    expect(res.renumbered_to).not.toBe('R-001');
    expect(res.message).toContain('Tell the patient their new number');
    expect((await row(moved))!.queue_number).toBe(res.renumbered_to);
    const logs = await queueLog().find({ queue_id: moved, action: /transferred/ }).toArray();
    expect(logs.map((l) => `${l.action}:${l.queue_number}`).sort()).toEqual([`transferred_in:${res.renumbered_to}`, 'transferred_out:R-001']);
    // Sent on, but still counted among the laboratory's patients today.
    expect((await c.get('/api/queue?department_id=5')).body.patients_today).toBe(1);
  });

  it('keeps the number when it is free at the destination', async () => {
    await makeUser('lab1', 5);
    await seedRow(6, 'R-001', { status: 'done' });
    const moved = await seedRow(5, 'R-001');
    const c = await loggedIn('lab1');
    await c.post('/api/serve-next', { department_id: 5 });
    expect((await c.post('/api/transfer', { department_id: 6 })).body).toMatchObject({ success: true, renumbered_to: null });
    expect((await row(moved))!.queue_number).toBe('R-001');
  });

  it('renumbers a patient pulled from another clinic when the number is taken here', async () => {
    await makeUser('doc1', 1);
    await seedRow(1, 'R-001', { secondsAgo: 2 * DAY });
    const theirs = await seedRow(2, 'R-001');
    const res = (await (await loggedIn('doc1')).post('/api/serve-next', { department_id: 1 })).body;
    expect(res).toMatchObject({ success: true, pool: true });
    expect(res.queue_number).not.toBe('R-001');
    expect(res.message).toContain('Tell the patient their new number');
    expect(await row(theirs)).toMatchObject({ department_id: 1, status: 'serving', queue_number: res.queue_number });
  });
});
