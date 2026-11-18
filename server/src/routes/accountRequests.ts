import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { config } from '../config';
import { accountRequests, departments, isDuplicateKey } from '../db';
import { requireAdmin, throttle } from '../middleware/auth';
import { clientIp, isInactive, sortDepartments, str, trimmed } from '../util';
import { departmentField, profileInput, textField } from '../validation';
import { insertUser, rolesFor, usernameTaken } from './admin';

/** Before sign-in: staff ask for an account and check how it went. */
export const accountRequestPublicRouter = Router();
/** Signed-in admins: review, approve and reject requests. */
export const accountRequestAdminRouter = Router();

/** More waiting requests than this means something is wrong (or someone is flooding the form). */
const MAX_PENDING = 100;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = (): string => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

const activeDepartments = async () =>
  sortDepartments((await departments().find().toArray()).filter((d) => !isInactive(d.status))).map((d) => ({ id: d._id, name: d.name }));

const usernameRequested = async (usernameLower: string): Promise<boolean> =>
  (await accountRequests().countDocuments({ username_lower: usernameLower, status: 'pending' }, { limit: 1 })) > 0;

accountRequestPublicRouter.get('/account-requests/departments', async (_req, res) => {
  res.json({ success: true, departments: await activeDepartments(), default_password: config.defaultPassword });
});

accountRequestPublicRouter.post('/account-requests', throttle('account-request', config.throttle.accountRequest), async (req, res) => {
  const profile = profileInput(req.body);
  if (!profile.ok) {
    res.json({ success: false, message: profile.message });
    return;
  }
  const department = await departmentField(req.body?.department);
  if (!department.ok || department.value === null) {
    res.json({ success: false, message: 'Pick the department you work in.' });
    return;
  }
  const usernameLower = profile.value.username.toLowerCase();
  if ((await usernameTaken(profile.value.username)) || (await usernameRequested(usernameLower))) {
    res.json({ success: false, message: 'That username is already taken. Try another one.' });
    return;
  }
  if ((await accountRequests().countDocuments({ status: 'pending' })) >= MAX_PENDING) {
    res.json({ success: false, message: 'Too many requests are waiting right now. Please ask an admin to add you.' });
    return;
  }
  const code = newCode();
  try {
    // A new request replaces any earlier decided one for the same username.
    await accountRequests().deleteMany({ username_lower: usernameLower, status: { $ne: 'pending' } });
    await accountRequests().insertOne({
      ...profile.value,
      username_lower: usernameLower,
      department_id: department.value,
      status: 'pending',
      code,
      reason: null,
      created_at: new Date(),
      decided_at: null,
      decided_by: null,
      client_ip: clientIp(req) || null,
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      res.json({ success: false, message: 'That username is already taken. Try another one.' });
      return;
    }
    throw error;
  }
  res.json({ success: true, code, username: profile.value.username, message: 'Request sent. An admin will review it.' });
});

/** Status needs the username and the code shown at submit time, so nobody else can read a rejection reason. */
accountRequestPublicRouter.get('/account-requests/status', throttle('account-request-status', config.throttle.accountRequestStatus), async (req, res) => {
  const usernameLower = trimmed(req.query.username).toLowerCase();
  const code = trimmed(req.query.code).toUpperCase();
  const found = usernameLower && code ? await accountRequests().findOne({ username_lower: usernameLower, code }, { sort: { created_at: -1 } }) : null;
  if (!found) {
    res.json({ success: false, message: 'No request matches that username and code.' });
    return;
  }
  res.json({ success: true, status: found.status, reason: found.status === 'rejected' ? found.reason : null, username: found.username, requested_at: found.created_at, decided_at: found.decided_at });
});

accountRequestAdminRouter.get('/account-requests', requireAdmin, async (_req, res) => {
  const pending = await accountRequests().find({ status: 'pending' }).sort({ created_at: 1 }).toArray();
  res.json({
    success: true,
    requests: pending.map((r) => ({
      id: String(r._id),
      username: r.username,
      firstname: r.firstname,
      middlename: r.middlename,
      lastname: r.lastname,
      position: r.position,
      department_id: r.department_id,
      requested_at: r.created_at,
    })),
  });
});

const requestId = (value: unknown): ObjectId | null => (typeof value === 'string' && ObjectId.isValid(value) ? new ObjectId(value) : null);

accountRequestAdminRouter.post('/account-requests/:id/approve', requireAdmin, async (req, res) => {
  const id = requestId(req.params.id);
  const request = id ? await accountRequests().findOne({ _id: id, status: 'pending' }) : null;
  if (!request) {
    res.json({ success: false, message: 'That request was already handled or no longer exists.' });
    return;
  }
  const role = str(req.body?.usertype) || 'staff';
  if (!rolesFor(!!req.session.is_superadmin).includes(role)) {
    res.json({ success: false, message: 'Pick a valid role.' });
    return;
  }
  const department = await departmentField(req.body?.department ?? request.department_id);
  if (!department.ok) {
    res.json({ success: false, message: department.message });
    return;
  }
  // Claim the request first so two admins cannot both create the account.
  const claimed = await accountRequests().findOneAndUpdate(
    { _id: request._id, status: 'pending' },
    { $set: { status: 'approved', decided_at: new Date(), decided_by: req.session.user_id ?? null } },
  );
  if (!claimed) {
    res.json({ success: false, message: 'That request was already handled or no longer exists.' });
    return;
  }
  const { username, firstname, middlename, lastname, position } = request;
  const added = await insertUser({ username, firstname, middlename, lastname, position }, role, department.value);
  if (!added.success) {
    await accountRequests().updateOne({ _id: request._id }, { $set: { status: 'pending', decided_at: null, decided_by: null } });
    res.json({ success: false, message: added.message });
    return;
  }
  res.json({ success: true, message: `${username} can now sign in with the password ${config.defaultPassword}.` });
});

accountRequestAdminRouter.post('/account-requests/:id/reject', requireAdmin, async (req, res) => {
  const id = requestId(req.params.id);
  const reason = textField(req.body?.reason, 'Reason', 200);
  if (!reason.ok) {
    res.json({ success: false, message: reason.message });
    return;
  }
  const updated = id
    ? await accountRequests().updateOne(
      { _id: id, status: 'pending' },
      { $set: { status: 'rejected', reason: reason.value || null, decided_at: new Date(), decided_by: req.session.user_id ?? null } },
    )
    : null;
  if (!updated?.modifiedCount) {
    res.json({ success: false, message: 'That request was already handled or no longer exists.' });
    return;
  }
  res.json({ success: true, message: 'Request rejected. The username is free again.' });
});
