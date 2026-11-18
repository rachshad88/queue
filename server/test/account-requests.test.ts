import { describe, expect, it } from 'vitest';
import { accountRequests, users } from '../src/db';
import { client, loggedIn, makeUser, useDatabase } from './helpers';

useDatabase();

const form = { username: 'new.nurse', firstname: 'Ana', middlename: '', lastname: 'Cruz', position: 'Nurse I', department: 5 };

describe('account requests', () => {
  it('lets staff ask for an account, and an admin approve it with the default password', async () => {
    const guest = await client();
    const sent = (await guest.post('/api/account-requests', form)).body;
    expect(sent).toMatchObject({ success: true, username: 'new.nurse', code: expect.stringMatching(/^[A-Z2-9]{6}$/) });
    expect((await guest.post('/api/account-requests', form)).body.message).toMatch(/already taken/);
    expect((await guest.get(`/api/account-requests/status?username=new.nurse&code=${sent.code}`)).body).toMatchObject({ success: true, status: 'pending' });
    expect((await guest.get('/api/account-requests/status?username=new.nurse&code=WRONG1')).body.success).toBe(false);

    // A staffer is not an admin; an admin sees the request and approves it into another department.
    await makeUser('lab1', 5);
    expect((await (await loggedIn('lab1')).get('/api/account-requests')).status).toBe(403);
    await makeUser('boss', 3, 'admin');
    const admin = await loggedIn('boss');
    const [request] = (await admin.get('/api/account-requests')).body.requests;
    expect(request).toMatchObject({ username: 'new.nurse', department_id: 5 });
    expect((await admin.post(`/api/account-requests/${request.id}/approve`, { department: 6, usertype: 'staff' })).body.success).toBe(true);
    expect((await admin.post(`/api/account-requests/${request.id}/approve`, { usertype: 'staff' })).body.message).toMatch(/already handled/);

    expect(await users().findOne({ username_lower: 'new.nurse' })).toMatchObject({ department_id: 6, usertype: 'staff', status: 'active' });
    expect((await (await client()).login('new.nurse', '12345')).body.success).toBe(true);
    expect((await guest.get(`/api/account-requests/status?username=new.nurse&code=${sent.code}`)).body.status).toBe('approved');
  });

  it('shows the rejection reason to the requester and frees the username', async () => {
    const guest = await client();
    const sent = (await guest.post('/api/account-requests', form)).body;
    await makeUser('boss', 3, 'admin');
    const admin = await loggedIn('boss');
    const [request] = (await admin.get('/api/account-requests')).body.requests;
    expect((await admin.post(`/api/account-requests/${request.id}/reject`, { reason: 'Not on the staff list' })).body.success).toBe(true);

    expect((await guest.get(`/api/account-requests/status?username=NEW.NURSE&code=${sent.code.toLowerCase()}`)).body).toMatchObject({ status: 'rejected', reason: 'Not on the staff list' });
    expect(await users().countDocuments({ username_lower: 'new.nurse' })).toBe(0);
    const again = (await guest.post('/api/account-requests', form)).body;
    expect(again.success).toBe(true);
    expect(await accountRequests().countDocuments({ username_lower: 'new.nurse' })).toBe(1);
  });

  it('refuses incomplete requests and usernames that already exist', async () => {
    await makeUser('lab1', 5);
    const guest = await client();
    expect((await guest.post('/api/account-requests', { ...form, department: '' })).body.message).toBe('Pick the department you work in.');
    expect((await guest.post('/api/account-requests', { ...form, firstname: '' })).body.success).toBe(false);
    expect((await guest.post('/api/account-requests', { ...form, username: 'LAB1' })).body.message).toMatch(/already taken/);
    expect((await guest.get('/api/account-requests/departments')).body.departments.length).toBeGreaterThan(0);
  });
});
