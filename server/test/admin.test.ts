import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { backupJobs, departments, sections, securityEvents, users } from '../src/db';
import { assessRequest, ipBlocks, ipMatches, riskLevel } from '../src/middleware/security';
import { inventory, pruneBackups, takeBackup, verifyBackup } from '../src/services/backup';
import { app, client, loggedIn, makeUser, PASSWORD, seedRow, useDatabase } from './helpers';

useDatabase();

describe('user management', () => {
  it('lets an admin add a user on the default password and rejects duplicates and bad roles', async () => {
    const admin = await loggedIn('superadmin');
    const body = { username: 'Nurse1', usertype: 'staff', firstname: 'Ana', lastname: 'Cruz', department: 5 };
    expect((await admin.post('/api/users', body)).body.success).toBe(true);
    expect((await admin.post('/api/users', { ...body, username: 'nurse1' })).body.error).toBe('duplicate');
    expect((await admin.post('/api/users', { ...body, username: 'other', usertype: 'root' })).body.error).toBe('role');
    const fresh = await client();
    expect((await fresh.login('nurse1', config.defaultPassword)).body.success).toBe(true);
    expect((await fresh.get('/api/console')).body.show_change_pw).toBe(true);
    expect((await fresh.get('/api/console')).body.show_change_pw).toBe(false);
  });

  it('never exposes password hashes or login tokens', async () => {
    await makeUser('doc1', 1);
    await loggedIn('doc1');
    const res = await (await loggedIn('superadmin')).get('/api/users');
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$|login_token|"password"/);
    expect(res.body.users.find((u: { username: string }) => u.username === 'doc1').online).toBe(true);
  });

  it('shows staff only their own row and blocks admin actions', async () => {
    const id = await makeUser('doc1', 1);
    const c = await loggedIn('doc1');
    const list = (await c.get('/api/users')).body;
    expect(list.users.map((u: { user_id: number }) => u.user_id)).toEqual([id]);
    expect((await c.post('/api/users', { username: 'x', usertype: 'admin' })).status).toBe(403);
    expect((await c.post('/api/users/1/deactivate')).status).toBe(403);
    expect((await c.put('/api/users/1', { username: 'hacked' })).status).toBe(403);
    const self = await c.put(`/api/users/${id}`, { username: 'doc1', firstname: 'New', lastname: 'Name', usertype: 'superadmin', status: 'inactive' });
    expect(self.body.success).toBe(true);
    expect(await users().findOne({ _id: id })).toMatchObject({ firstname: 'New', usertype: 'staff', status: 'active' });
  });

  it('protects the acting admin, the last admin and users with history', async () => {
    const onlyAdmin = await makeUser('boss', 3, 'admin');
    const staff = await makeUser('doc1', 1);
    await seedRow(1, 'R-001', { status: 'done', servedBy: staff });
    const admin = await loggedIn('superadmin');
    expect((await admin.post('/api/users/1/delete')).body.error).toBe('self');
    expect((await admin.post(`/api/users/${onlyAdmin}/deactivate`)).body.error).toBe('lastadmin');
    expect((await admin.post(`/api/users/${staff}/delete`)).body.error).toBe('inuse');
    expect((await admin.post(`/api/users/${staff}/deactivate`)).body.success).toBe(true);
    expect((await (await client()).login('doc1')).status).toBe(401);
    const bulk = await admin.post('/api/users/bulk', { op: 'activate', ids: [staff, 1, 9999] });
    expect(bulk.body).toMatchObject({ applied: 1, skipped: 2 });
  });

  it('hides superadmin accounts from user management and keeps admins from touching them', async () => {
    await makeUser('boss', 3, 'admin');
    await makeUser('doc1', 1);
    const admin = await loggedIn('boss');
    const list = (await admin.get('/api/users')).body;
    expect(list.users.map((u: { username: string }) => u.username).sort()).toEqual(['boss', 'doc1']);
    expect(list.roles).not.toContain('superadmin');
    expect((await admin.get('/api/users?q=super')).body.users).toEqual([]);

    expect((await admin.put('/api/users/1', { username: 'superadmin', password: 'taken-over' })).body.error).toBe('db');
    for (const op of ['deactivate', 'delete', 'force-logout']) {
      expect((await admin.post(`/api/users/1/${op}`)).body.error).toBe('db');
    }
    expect((await admin.post('/api/users/bulk', { op: 'deactivate', ids: [1] })).body).toMatchObject({ applied: 0, skipped: 1 });
    expect((await admin.post('/api/users', { username: 'shadow', firstname: 'F', lastname: 'L', usertype: 'superadmin' })).body.error).toBe('role');
    expect((await admin.put('/api/users/3', { username: 'doc1', firstname: 'F', lastname: 'L', usertype: 'superadmin' })).body.error).toBe('role');
    expect(await users().findOne({ _id: 1 })).toMatchObject({ username: 'superadmin', status: 'active' });
    expect((await (await client()).login('superadmin')).body.success).toBe(true);

    const root = await loggedIn('superadmin');
    const rootList = (await root.get('/api/users')).body;
    expect(rootList.users.map((u: { username: string }) => u.username)).not.toContain('superadmin');
    expect(rootList.roles).toContain('superadmin');
  });

  it('validates user fields: types, lengths, username characters, names and department', async () => {
    const admin = await loggedIn('superadmin');
    const ok = { username: 'nurse.ana-1', firstname: 'Ana', lastname: 'Cruz', usertype: 'staff', department: 5 };
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ username: { $gt: '' } }, /Username must be text/],
      [{ username: ['a'] }, /Username must be text/],
      [{ username: 'u'.repeat(51) }, /50 characters/],
      [{ username: 'José Dela Cruz' }, /no spaces/],
      [{ username: '<b>x</b>' }, /no spaces/],
      [{ firstname: '' }, /First name is required/],
      [{ lastname: '   ' }, /Last name is required/],
      [{ firstname: 'x'.repeat(61) }, /60 characters/],
      [{ position: 42 }, /Position must be text/],
      [{ department: 99999 }, /department from the list/],
      [{ department: -1 }, /department from the list/],
      [{ department: 'abc' }, /department from the list/],
    ];
    for (const [patch, message] of cases) {
      const res = await admin.post('/api/users', { ...ok, ...patch });
      expect(res.body.success, JSON.stringify(patch)).toBe(false);
      expect(res.body.message).toMatch(message);
    }
    expect(await users().countDocuments({ username: { $ne: 'superadmin' } })).toBe(0);
    expect((await admin.post('/api/users', ok)).body.success).toBe(true);
    expect((await admin.post('/api/users', { ...ok, username: 'José', department: '' })).body.success).toBe(true);
    expect(await users().findOne({ username: 'José' })).toMatchObject({ department_id: null });
  });

  it('caps passwords at 72 bytes so bcrypt never compares a truncated prefix', async () => {
    const id = await makeUser('doc1', 1);
    const c = await loggedIn('doc1');
    const long = 'A'.repeat(72);
    expect((await c.post('/api/update-password', { old_password: PASSWORD, new_password: long + 'x' })).body.message).toMatch(/at most 72 bytes/);
    expect((await c.post('/api/update-password', { old_password: PASSWORD, new_password: 'ñ'.repeat(37) })).body.message).toMatch(/at most 72 bytes/);
    expect((await c.post('/api/update-password', { old_password: PASSWORD, new_password: long })).body.success).toBe(true);
    expect((await (await client()).login('doc1', long + 'EXTRA')).status).toBe(401);
    expect((await (await client()).login('doc1', long)).body.success).toBe(true);
    const admin = await loggedIn('superadmin');
    expect((await admin.put(`/api/users/${id}`, { username: 'doc1', firstname: 'D', lastname: 'T', usertype: 'staff', department: 1, password: long + 'x' })).body.message).toMatch(/72 bytes/);
    expect((await admin.put(`/api/users/${id}`, { username: 'doc1', firstname: 'D', lastname: 'T', usertype: 'staff', department: 1, password: 'abc' })).body.message).toMatch(/at least 5/);
  });

  it('validates the Account page the same way', async () => {
    await makeUser('doc1', 1);
    const c = await loggedIn('doc1');
    expect((await c.put('/api/account', { username: 'doc 1', firstname: 'A', lastname: 'B' })).body.message).toMatch(/no spaces/);
    expect((await c.put('/api/account', { username: 'doc1', firstname: { a: 1 }, lastname: 'B' })).body.message).toMatch(/must be text/);
    expect((await c.put('/api/account', { username: 'doc1', firstname: 'A', lastname: 'B'.repeat(61) })).body.message).toMatch(/60 characters/);
    expect((await c.put('/api/account', { username: 'doc1', firstname: 'A', lastname: 'B' })).body.success).toBe(true);
  });

  it('force-logout signs the device out on its next request', async () => {
    const id = await makeUser('doc1', 1);
    const c = await loggedIn('doc1');
    await (await loggedIn('superadmin')).post(`/api/users/${id}/force-logout`);
    expect((await c.get('/api/console')).body.reason).toBe('revoked');
    expect((await c.get('/api/session')).body.logged_in).toBe(false);
    expect((await (await client()).login('doc1')).body.success).toBe(true);
  });

  it('revokes an admin session on force-logout, deactivate, delete and demotion', async () => {
    const root = await loggedIn('superadmin');
    const ids = { forced: await makeUser('adm1', 3, 'admin'), deactivated: await makeUser('adm2', 3, 'admin'), deleted: await makeUser('adm3', 3, 'admin'), demoted: await makeUser('adm4', 3, 'admin') };
    const sessions = { forced: await loggedIn('adm1'), deactivated: await loggedIn('adm2'), deleted: await loggedIn('adm3'), demoted: await loggedIn('adm4') };
    for (const s of Object.values(sessions)) {
      expect((await s.get('/api/users')).status).toBe(200);
    }
    await root.post(`/api/users/${ids.forced}/force-logout`);
    await root.post(`/api/users/${ids.deactivated}/deactivate`);
    await root.post(`/api/users/${ids.deleted}/delete`);
    await root.put(`/api/users/${ids.demoted}`, { username: 'adm4', firstname: 'F', lastname: 'L', usertype: 'staff', department: 3, status: 'active' });
    for (const s of Object.values(sessions)) {
      const res = await s.post('/api/users', { username: 'backdoor', usertype: 'admin' });
      expect(res.status).toBe(401);
      expect(res.body.reason).toBe('revoked');
    }
    expect(await users().countDocuments({ username: 'backdoor' })).toBe(0);
    // A fresh sign-in after force-logout works; the demoted account now signs in as staff.
    expect((await (await client()).login('adm1')).body.success).toBe(true);
    expect((await (await loggedIn('adm4')).post('/api/users', { username: 'x', usertype: 'staff' })).status).toBe(403);
  });

  it('signs deactivated staff out at once and frees their window', async () => {
    const id = await makeUser('nurse', 15);
    const c = await loggedIn('nurse');
    await sections().updateOne({ _id: 'waiting:2' }, { $set: { occupied_by: id, status: 1 } });
    await (await loggedIn('superadmin')).post(`/api/users/${id}/deactivate`);
    expect((await c.get('/api/session-check?activity=0')).body).toMatchObject({ ok: false, reason: 'revoked' });
    expect((await c.get('/api/console')).status).toBe(401);
    expect(await sections().findOne({ _id: 'waiting:2' })).toMatchObject({ occupied_by: null, status: 0 });
  });

  it('signs a user out when an admin moves them to another department', async () => {
    const id = await makeUser('doc1', 1);
    const c = await loggedIn('doc1');
    const res = await (await loggedIn('superadmin')).put(`/api/users/${id}`, { username: 'doc1', firstname: 'F', lastname: 'L', usertype: 'staff', department: 2, status: 'active' });
    expect(res.body.success).toBe(true);
    expect((await c.get('/api/console')).body.reason).toBe('revoked');
    const unchanged = await makeUser('doc2', 1);
    const c2 = await loggedIn('doc2');
    await (await loggedIn('superadmin')).put(`/api/users/${unchanged}`, { username: 'doc2', firstname: 'Renamed', lastname: 'Only', usertype: 'staff', department: 1, status: 'active' });
    expect((await c2.get('/api/console')).status).toBe(200);
  });

  it('changes a password with the old one, untrimmed, and rejects reuse', async () => {
    await makeUser('doc1', 1);
    const c = await loggedIn('doc1');
    expect((await c.post('/api/update-password', { new_password: 'abcde' })).body.message).toBe('Missing parameters');
    expect((await c.post('/api/update-password', { old_password: 'wrong', new_password: 'abcde' })).body.message).toBe('Old password is incorrect');
    expect((await c.post('/api/update-password', { old_password: PASSWORD, new_password: PASSWORD })).body.success).toBe(false);
    expect((await c.post('/api/update-password', { old_password: PASSWORD, new_password: ' spaced pw ' })).body.success).toBe(true);
    expect((await (await client()).login('doc1', 'spaced pw')).status).toBe(401);
    expect((await (await client()).login('doc1', ' spaced pw ')).body.success).toBe(true);
  });

  it('signs out every other session when a password changes, and keeps the one that changed it', async () => {
    await makeUser('adm', 1, 'admin');
    const elsewhere = await loggedIn('adm');
    const here = await loggedIn('adm');
    expect((await here.post('/api/update-password', { old_password: PASSWORD, new_password: 'N3w-pass!9' })).body.success).toBe(true);
    expect((await elsewhere.get('/api/users')).status).toBe(401);
    expect((await here.get('/api/users')).status).toBe(200);

    await makeUser('doc1', 1);
    const staff = await loggedIn('doc1');
    expect((await staff.post('/api/update-password', { old_password: PASSWORD, new_password: 'N3w-pass!9' })).body.success).toBe(true);
    expect((await staff.get('/api/console')).status).toBe(200);
  });

  it('signs a user out when an admin resets their password', async () => {
    await makeUser('adm', 1, 'admin');
    const id = await makeUser('lab1', 5);
    const staff = await loggedIn('lab1');
    const admin = await loggedIn('adm');
    const reset = await admin.put(`/api/users/${id}`, { username: 'lab1', firstname: 'lab1', lastname: 'Tester', usertype: 'staff', department: 5, password: 'Other-pass!77' });
    expect(reset.body).toMatchObject({ success: true, message: 'User updated and signed out so the change applies now.' });
    expect((await staff.get('/api/console')).status).toBe(401);
    expect((await admin.get('/api/users')).status).toBe(200);
  });

  it('edits the signed-in account and refuses a taken username', async () => {
    await makeUser('doc1', 1);
    await makeUser('doc2', 1);
    const c = await loggedIn('doc1');
    expect((await c.put('/api/account', { firstname: 'A', lastname: 'B', username: 'DOC2' })).body.success).toBe(false);
    expect((await c.put('/api/account', { firstname: 'A', lastname: 'B', username: 'doctor1' })).body.success).toBe(true);
    expect((await c.get('/api/session')).body.user.username).toBe('doctor1');
  });
});

describe('departments and reports', () => {
  it('lets admins add and edit departments, and nobody else', async () => {
    await makeUser('doc1', 1);
    expect((await (await loggedIn('doc1')).get('/api/department-management')).status).toBe(403);
    const admin = await loggedIn('superadmin');
    expect((await admin.post('/api/department-management', { name: '', prefix: 'X' })).body.error).toBe('invalid');
    expect((await admin.post('/api/department-management', { name: 'X-RAY', prefix: 'XR' })).body.success).toBe(true);
    const created = await departments().findOne({ name: 'X-RAY' });
    expect(created!._id).toBe(16);
    await admin.put('/api/department-management/16', { name: 'X-RAY', prefix: 'XR', status: 'inactive' });
    const roster = (await admin.get('/api/departments')).body;
    expect(roster.map((d: { name: string }) => d.name)).not.toContain('X-RAY');
    expect(roster[0].name).toBe('WAITING AREA');
  });

  it('keeps department names unique (ignoring case and spaces) and within length limits', async () => {
    const admin = await loggedIn('superadmin');
    expect((await admin.post('/api/department-management', { name: 'laboratory', prefix: 'L2' })).body.error).toBe('duplicate');
    expect((await admin.post('/api/department-management', { name: ' LABORATORY ', prefix: 'L2' })).body.error).toBe('duplicate');
    expect((await admin.post('/api/department-management', { name: 'D'.repeat(61), prefix: 'D' })).body.message).toMatch(/60 characters/);
    expect((await admin.post('/api/department-management', { name: 'RADIOLOGY', prefix: 'P'.repeat(7) })).body.message).toMatch(/6 characters/);
    expect((await admin.post('/api/department-management', { name: { $ne: 1 }, prefix: 'Q' })).body.message).toMatch(/must be text/);
    expect((await admin.post('/api/department-management', { name: 'RADIOLOGY', prefix: 'rad' })).body.success).toBe(true);
    expect(await departments().findOne({ name: 'RADIOLOGY' })).toMatchObject({ prefix: 'RAD' });
    // Renaming onto another department's name is refused; saving a department under its own name is not.
    expect((await admin.put('/api/department-management/5', { name: 'Radiology', prefix: 'LAB' })).body.error).toBe('duplicate');
    expect((await admin.put('/api/department-management/5', { name: 'LABORATORY', prefix: 'LAB' })).body.success).toBe(true);
  });

  it('keeps the queue log for superadmins and filters it', async () => {
    await makeUser('lab1', 5);
    await seedRow(5, 'R-001');
    const lab = await loggedIn('lab1');
    await lab.post('/api/serve-next', { department_id: 5 });
    await lab.post('/api/finish', { department_id: 5 });
    expect((await lab.get('/api/queue-logs')).status).toBe(403);
    const admin = await loggedIn('superadmin');
    const logs = (await admin.get('/api/queue-logs?action=finished')).body;
    expect(logs.records).toHaveLength(1);
    expect(logs.records[0]).toMatchObject({ queue_number: 'R-001', department: 'LABORATORY', operator_name: 'lab1 Tester', old_status: 'serving', new_status: 'done' });
    expect(logs.actions).toEqual(['finished', 'serving']);
    expect((await admin.get('/api/queue-logs?from=2020-01-01&to=2020-01-02')).body.records).toHaveLength(0);
    const trail = (await lab.get('/api/audit-trail')).body;
    expect(trail).toMatchObject({ has_filter: false, rows: [] });
    expect((await lab.get('/api/audit-trail?search=R-0')).body.rows).toHaveLength(2);
  });

  it('lists and exports the server history', async () => {
    const lab = await makeUser('lab1', 5);
    await seedRow(5, 'R-002', { status: 'done', servedBy: lab, secondsAgo: 50 });
    await seedRow(5, '=1+1', { status: 'done', servedBy: lab, secondsAgo: 100 });
    await seedRow(5, 'R-003');
    const c = await loggedIn('lab1');
    const page = (await c.get('/api/server-history?sort=num&dir=desc')).body;
    expect(page.records.map((r: { queue_number: string }) => r.queue_number)).toEqual(['R-002', '=1+1']);
    expect(page.records[0]).toMatchObject({ server_name: 'lab1 Tester', department: 'LABORATORY' });
    expect(page.servers).toEqual([{ id: lab, name: 'lab1 Tester' }]);
    const csv = await c.get('/api/server-history?export=csv');
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain("'=1+1");
    expect(csv.text.trim().split('\r\n')).toHaveLength(3);
  });
});

describe('public displays', () => {
  it('shows today’s tickets on the wall without a login and hides carried-over ones', async () => {
    const doc = await makeUser('doc1', 1);
    await seedRow(1, 'R-001', { status: 'serving', servedBy: doc, servedAgo: 60 });
    await seedRow(1, 'P-002', { category: 'priority' });
    await seedRow(1, 'R-003');
    await seedRow(1, 'R-900', { secondsAgo: 3 * 86400 });
    const wall = (await request(app).get('/api/live-serving?ids=1,abc,1e9')).body;
    expect(wall).toHaveLength(1);
    expect(wall[0]).toMatchObject({ id: 1, name: 'CLINIC 1', is_sectioned: false, waiting_total: 2 });
    expect(wall[0].serving[0].queue_number).toBe('R-001');
    expect(wall[0].waiting.map((w: { queue_number: string }) => w.queue_number)).toEqual(['P-002', 'R-003']);
    const board = (await request(app).get('/api/display?department_id=1')).body;
    expect(board.serving[0]).toMatchObject({ queue_number: 'R-001', department_name: 'CLINIC 1' });
    expect(JSON.stringify(wall)).not.toContain('Tester');
  });

  it('lists the wall configuration and answers the health probe', async () => {
    const cfg = (await request(app).get('/api/live-config')).body;
    expect(cfg.departments[0]).toEqual({ id: 15, name: 'WAITING AREA' });
    expect(cfg.admission_sections).toEqual(['Admission 1', 'Admission 2', 'Admission 3', 'Admission 4']);
    expect((await request(app).get('/api/up')).body).toEqual({ status: 'ok' });
    // Unknown API paths look the same as protected ones to an anonymous caller.
    expect((await request(app).get('/api/nope')).status).toBe(401);
  });
});

describe('security layer', () => {
  const fakeRequest = (overrides: Record<string, unknown> = {}) =>
    ({
      method: 'GET',
      path: '/',
      originalUrl: '/',
      ip: '203.0.113.9',
      socket: {},
      session: {},
      query: {},
      get: (name: string) => ({ 'user-agent': 'Mozilla/5.0', accept: 'text/html' })[name.toLowerCase()],
      ...overrides,
    }) as never;

  it('matches single addresses and CIDR ranges', () => {
    expect(ipMatches('127.0.0.1', ['127.0.0.1/8'])).toBe(true);
    expect(ipMatches('192.168.110.31', ['192.168.110.0/24'])).toBe(true);
    expect(ipMatches('192.168.111.31', ['192.168.110.0/24'])).toBe(false);
    expect(ipMatches('::1', ['::1'])).toBe(true);
    expect(ipMatches('', ['0.0.0.0/0'])).toBe(false);
  });

  it('scores scanners, probes and injection attempts, and leaves browsers alone', () => {
    expect(assessRequest(fakeRequest()).score).toBe(0);
    const scanner = assessRequest(fakeRequest({ path: '/.env', get: () => undefined }));
    expect(scanner.reasons).toEqual(expect.arrayContaining(['empty_user_agent', 'missing_accept_header', 'suspicious_url']));
    expect(riskLevel(scanner.score)).toBe('block');
    const sqlmap = assessRequest(fakeRequest({ originalUrl: '/api/x?q=1%20UNION%20SELECT%201', get: (n: string) => (n === 'user-agent' ? 'sqlmap/1.7' : '*/*') }));
    expect(sqlmap.reasons).toEqual(['known_scraper:sqlmap', 'suspicious_query']);
    expect(assessRequest(fakeRequest({ get: (n: string) => (n === 'user-agent' ? 'Googlebot/2.1' : '*/*') })).score).toBe(0);
    expect([riskLevel(0), riskLevel(30), riskLevel(60)]).toEqual(['allow', 'limit', 'challenge']);
  });

  it('escalates temporary blocks per repeat offense', () => {
    expect(ipBlocks.blockForOffense('203.0.113.9')).toBe(300);
    expect(ipBlocks.blockForOffense('203.0.113.9')).toBe(900);
    expect(ipBlocks.isBlocked('203.0.113.9')).toBe(true);
    ipBlocks.unblock('203.0.113.9');
    expect(ipBlocks.isBlocked('203.0.113.9')).toBe(false);
  });

  it('stores security events without raw addresses', async () => {
    const { recordSecurityEvent } = await import('../src/middleware/security');
    recordSecurityEvent(fakeRequest({ path: '/.git/config' }), 'risk_block', 130, ['suspicious_url'], 403);
    await new Promise((r) => setTimeout(r, 100));
    const event = await securityEvents().findOne({});
    expect(event).toMatchObject({ event_type: 'risk_block', path: '/.git/config', status_code: 403 });
    expect(event!.ip_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(event)).not.toContain('203.0.113.9');
  });
});

describe('database backups', () => {
  it('is closed to everyone but superadmins', async () => {
    await makeUser('boss', 3, 'admin');
    expect((await (await loggedIn('boss')).get('/api/backup')).status).toBe(403);
    expect((await (await loggedIn('superadmin')).get('/api/backup')).body.health.database).toBe('rhu_queue_test');
  });

  it('dumps, restore-tests and prunes real archives', async () => {
    await seedRow(1, 'R-001');
    const first = await takeBackup();
    expect(first.file).toMatch(/^rhu_queue_\d{8}_\d{6}\.archive\.gz$/);
    expect(await verifyBackup(first.file)).toContain('Restore test passed');
    await new Promise((r) => setTimeout(r, 1100));
    await takeBackup();
    expect(await inventory()).toHaveLength(2);
    expect(await pruneBackups(1)).toContain('removed 1');
    expect((await inventory()).map((f) => f.file)).not.toContain(first.file);
    await expect(verifyBackup('../../etc/passwd')).rejects.toThrow('Invalid backup file name.');
  }, 60000);

  it('requires the password to delete and never deletes the last backup', async () => {
    const admin = await loggedIn('superadmin');
    const [only] = await inventory();
    expect((await admin.post('/api/backup', { action: 'delete', file: only.file })).body.message).toBe('Password confirmation required.');
    expect((await admin.post('/api/backup', { action: 'delete', file: only.file, password: PASSWORD })).body.message).toBe('The last remaining backup cannot be deleted.');
    expect((await admin.get('/api/backup/download?file=../secret')).status).toBe(404);
    const started = await admin.post('/api/backup', { action: 'backup' });
    expect(started.body.success).toBe(true);
    for (let i = 0; i < 40 && (await backupJobs().findOne({ _id: started.body.job }))!.state === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    expect((await admin.get(`/api/backup/status?job=${started.body.job}`)).body.state).toBe('done');
    const download = await admin.get(`/api/backup/download?file=${only.file}`);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain(only.file);
  }, 60000);
});
