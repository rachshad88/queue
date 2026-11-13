import bcrypt from 'bcryptjs';
import { Router } from 'express';
import type { Filter } from 'mongodb';
import { config } from '../config';
import { departments, isDuplicateKey, nextId, queue, queueLog, sections, users, type DepartmentDoc, type UserDoc } from '../db';
import { requireAdmin, throttle, userKey } from '../middleware/auth';
import { queueUpdated, recheckSessions } from '../realtime';
import { bumpQueueGeneration, invalidate, LIVE_CONFIG_KEY } from '../sharedCache';
import { revokeOtherSessions, revokeSessions } from '../services/singleLogin';
import { releaseSectionsForUser } from '../services/stations';
import { minutesAgo } from '../time';
import { clientIp, contains, escapeRegex, num, paginate, sortDepartments, str, trimmed } from '../util';
import { departmentField, LIMITS, passwordProblem, profileInput, textField } from '../validation';

export const adminRouter = Router();

const PAGE_SIZE = 20;
const ASSIGNABLE_ROLES = ['regular', 'staff', 'admin', 'superadmin'];
const SUPERADMIN_ROLE = /^\s*superadmin\s*$/i;

/** Superadmin accounts are hidden from user management; only a superadmin may touch or create one. */
const isSuperadminAccount = (u: Pick<UserDoc, 'usertype'>): boolean => SUPERADMIN_ROLE.test(u.usertype);
const rolesFor = (isSuperadmin: boolean): string[] => (isSuperadmin ? ASSIGNABLE_ROLES : ASSIGNABLE_ROLES.filter((r) => r !== 'superadmin'));

/** True when the acting session may not see or change the target account. */
async function isHiddenFrom(id: number, actorIsSuperadmin: boolean): Promise<boolean> {
  if (actorIsSuperadmin) {
    return false;
  }
  return (await users().countDocuments({ _id: id, usertype: SUPERADMIN_ROLE }, { limit: 1 })) > 0;
}
const hash = (password: string): Promise<string> => bcrypt.hash(password, 12);

const publicUser = (u: UserDoc, deptNames: Map<number, string>, onlineSince: Date) => ({
  user_id: u._id,
  username: u.username,
  usertype: u.usertype,
  firstname: u.firstname,
  middlename: u.middlename ?? '',
  lastname: u.lastname,
  position: u.position ?? '',
  department_id: u.department_id,
  department_name: u.department_id != null ? (deptNames.get(u.department_id) ?? '') : '',
  status: u.status,
  last_active: u.last_active,
  last_login_at: u.last_login_at,
  last_ip: u.last_ip,
  online: !!u.login_token && !!u.last_active && u.last_active >= onlineSince,
});

async function usernameTaken(username: string, exceptId?: number): Promise<boolean> {
  const filter: Filter<UserDoc> = { username_lower: username.toLowerCase() };
  if (exceptId) {
    filter._id = { $ne: exceptId };
  }
  return (await users().countDocuments(filter, { limit: 1 })) > 0;
}

/** The last active admin cannot be deleted or deactivated. */
async function isProtectedAdmin(target: UserDoc): Promise<boolean> {
  if (target.usertype !== 'admin' || target.status !== 'active') {
    return false;
  }
  return (await users().countDocuments({ usertype: 'admin', status: 'active', _id: { $ne: target._id } }, { limit: 1 })) === 0;
}

/** A user with history (served rows, audit entries, a held window) is never hard-deleted. */
async function userReferenceCount(id: number): Promise<number> {
  const [served, logs, stations] = await Promise.all([
    queue().countDocuments({ served_by: id }, { limit: 1 }),
    queueLog().countDocuments({ user_id: id }, { limit: 1 }),
    sections().countDocuments({ occupied_by: id }, { limit: 1 }),
  ]);
  return served + logs + stations;
}

/** Sign a user out everywhere and free any window they held, so walls and choosers update at once. */
async function signOutEverywhere(userId: number, ip: string): Promise<void> {
  await revokeSessions(userId);
  void recheckSessions(userId);
  await releaseSectionsForUser(userId, ip);
  queueUpdated(config.admissionDeptId);
  queueUpdated(config.waitingDeptId);
}

// ---- Users ------------------------------------------------------------------

adminRouter.get('/users', async (req, res) => {
  const isAdmin = req.session.usertype === 'admin';
  const userId = req.session.user_id ?? 0;
  const search = trimmed(req.query.q);
  const selectedDept = trimmed(req.query.department);
  const selectedOnline = trimmed(req.query.online);
  const onlineSince = minutesAgo(config.onlineWindowMin);

  const and: Filter<UserDoc>[] = [{ usertype: { $not: SUPERADMIN_ROLE } }];
  if (!isAdmin) {
    and.push({ _id: userId });
  }
  if (search !== '') {
    const rx = contains(search);
    and.push({ $or: [{ username: rx }, { firstname: rx }, { lastname: rx }] });
  }
  if (selectedDept !== '' && selectedDept !== 'all') {
    and.push({ department_id: num(selectedDept) });
  }
  if (selectedOnline === 'online') {
    and.push({ login_token: { $nin: [null, ''] }, last_active: { $gte: onlineSince } });
  } else if (selectedOnline === 'offline') {
    and.push({ $or: [{ login_token: { $in: [null, ''] } }, { last_active: null }, { last_active: { $lt: onlineSince } }] });
  }
  const filter: Filter<UserDoc> = and.length ? { $and: and } : {};

  const paging = paginate(await users().countDocuments(filter), num(req.query.page) || 1, PAGE_SIZE);
  const rows = await users().find(filter).sort({ username_lower: 1 }).skip(paging.offset).limit(PAGE_SIZE).toArray();
  const allDepartments = await departments().find().sort({ name: 1 }).toArray();
  const deptNames = new Map(allDepartments.map((d) => [d._id, d.name]));

  // The five most recent audit entries per listed user.
  const activity: Record<number, { q: string; a: string; dt: Date }[]> = {};
  for (const u of rows) {
    const logs = await queueLog().find({ user_id: u._id }).sort({ created_at: -1 }).limit(5).toArray();
    if (logs.length) {
      activity[u._id] = logs.map((l) => ({ q: l.queue_number, a: l.action, dt: l.created_at }));
    }
  }

  res.json({
    success: true,
    is_admin: isAdmin,
    user_id: userId,
    roles: rolesFor(!!req.session.is_superadmin),
    online_window_minutes: config.onlineWindowMin,
    departments: allDepartments.map((d) => ({ id: d._id, name: d.name })),
    users: rows.map((u) => publicUser(u, deptNames, onlineSince)),
    activity_by_user: activity,
    paging,
  });
});

adminRouter.post('/users', requireAdmin, async (req, res) => {
  const profile = profileInput(req.body);
  if (!profile.ok) {
    res.json({ success: false, error: 'invalid', message: profile.message });
    return;
  }
  const { username } = profile.value;
  if (await usernameTaken(username)) {
    res.json({ success: false, error: 'duplicate', message: 'That username is already taken.' });
    return;
  }
  const role = str(req.body?.usertype);
  if (!rolesFor(!!req.session.is_superadmin).includes(role)) {
    res.json({ success: false, error: 'role', message: 'Pick a valid role.' });
    return;
  }
  const department = await departmentField(req.body?.department);
  if (!department.ok) {
    res.json({ success: false, error: 'invalid', message: department.message });
    return;
  }
  try {
    await users().insertOne({
      _id: await nextId('users'),
      username_lower: username.toLowerCase(),
      // New accounts start on the default password and are prompted to change it.
      password: await hash(config.defaultPassword),
      usertype: role,
      ...profile.value,
      department_id: department.value,
      status: 'active',
      login_token: null,
      last_active: null,
      last_login_at: null,
      last_ip: null,
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      res.json({ success: false, error: 'duplicate', message: 'That username is already taken.' });
      return;
    }
    console.error('user add failed', error);
    res.json({ success: false, error: 'db', message: 'Could not save the user. Please try again.' });
    return;
  }
  res.json({ success: true, message: 'User added. Their starting password is the default one.' });
});

/** Admins edit anyone; everyone else may edit only their own name, username, position and password. */
adminRouter.put('/users/:id', async (req, res) => {
  const isAdmin = req.session.usertype === 'admin';
  const id = num(req.params.id);
  if (!isAdmin && id !== (req.session.user_id ?? 0)) {
    res.status(403).json({ success: false, message: 'Access denied.' });
    return;
  }
  if (await isHiddenFrom(id, !!req.session.is_superadmin)) {
    res.json({ success: false, error: 'db', message: 'User not found.' });
    return;
  }
  const profile = profileInput(req.body);
  if (!profile.ok) {
    res.json({ success: false, error: 'invalid', message: profile.message });
    return;
  }
  const { username } = profile.value;
  if (await usernameTaken(username, id)) {
    res.json({ success: false, error: 'duplicate', message: 'That username is already taken.' });
    return;
  }
  const role = str(req.body?.usertype) || 'regular';
  if (isAdmin && !rolesFor(!!req.session.is_superadmin).includes(role)) {
    res.json({ success: false, error: 'role', message: 'Pick a valid role.' });
    return;
  }

  const set: Partial<UserDoc> = { ...profile.value, username_lower: username.toLowerCase() };
  if (isAdmin) {
    const department = await departmentField(req.body?.department);
    if (!department.ok) {
      res.json({ success: false, error: 'invalid', message: department.message });
      return;
    }
    set.usertype = role;
    set.department_id = department.value;
    set.status = str(req.body?.status) === 'inactive' ? 'inactive' : 'active';
  }
  // Passwords are never trimmed: leading and trailing spaces are significant.
  if (req.body?.password !== undefined && req.body?.password !== null && typeof req.body.password !== 'string') {
    res.json({ success: false, error: 'invalid', message: 'Password must be text.' });
    return;
  }
  const newPassword = str(req.body?.password);
  if (newPassword !== '') {
    const problem = passwordProblem(newPassword);
    if (problem) {
      res.json({ success: false, error: 'invalid', message: problem });
      return;
    }
    set.password = await hash(newPassword);
  }
  const before = await users().findOne({ _id: id }, { projection: { usertype: 1, department_id: 1, status: 1 } });
  try {
    const result = await users().updateOne({ _id: id }, { $set: set });
    if (result.matchedCount !== 1) {
      res.json({ success: false, error: 'db', message: 'User not found.' });
      return;
    }
  } catch (error) {
    console.error('user update failed', error);
    res.json({ success: false, error: isDuplicateKey(error) ? 'duplicate' : 'db', message: 'Could not save the user. Please try again.' });
    return;
  }
  // A changed role, department or status takes effect now, not at the next sign-in.
  const accessChanged =
    !!before &&
    ((set.usertype !== undefined && set.usertype !== before.usertype) ||
      (set.department_id !== undefined && set.department_id !== before.department_id) ||
      (set.status !== undefined && set.status !== before.status));
  const isSelf = id === req.session.user_id;
  const passwordChanged = set.password !== undefined;
  // A new password must lock out every session opened with the old one.
  const signedOut = accessChanged || (passwordChanged && !isSelf);
  if (signedOut) {
    await signOutEverywhere(id, clientIp(req));
  } else if (passwordChanged && isSelf) {
    await revokeOtherSessions(req.session, id);
    void recheckSessions(id);
  }
  if (isSelf) {
    req.session.username = username;
  }
  res.json({ success: true, message: signedOut ? 'User updated and signed out so the change applies now.' : 'User updated.' });
});

type UserOp = 'delete' | 'activate' | 'deactivate';

/** Apply one status/delete operation; returns an error code or null when applied. */
async function applyUserOp(op: UserOp, id: number, actorId: number, actorIsSuperadmin: boolean, ip: string): Promise<string | null> {
  if (id < 1) {
    return 'db';
  }
  if (id === actorId) {
    return 'self';
  }
  const target = await users().findOne({ _id: id });
  if (!target || (!actorIsSuperadmin && isSuperadminAccount(target))) {
    return 'db';
  }
  if (op !== 'activate' && (await isProtectedAdmin(target))) {
    return 'lastadmin';
  }
  if (op === 'delete') {
    if ((await userReferenceCount(id)) > 0) {
      return 'inuse';
    }
    await signOutEverywhere(id, ip);
    await users().deleteOne({ _id: id });
    return null;
  }
  await users().updateOne({ _id: id }, { $set: { status: op === 'activate' ? 'active' : 'inactive' } });
  if (op === 'deactivate') {
    await signOutEverywhere(id, ip);
  }
  return null;
}

const USER_OP_ERRORS: Record<string, string> = {
  db: 'That user could not be found.',
  self: 'You cannot do that to your own account.',
  lastadmin: 'The last active admin cannot be removed or deactivated.',
  inuse: 'That user has queue history and cannot be deleted. Deactivate them instead.',
};

adminRouter.post('/users/bulk', requireAdmin, async (req, res) => {
  const op = str(req.body?.op) as UserOp;
  if (!['activate', 'deactivate', 'delete'].includes(op)) {
    res.json({ success: false, error: 'db', message: 'Unknown bulk action.' });
    return;
  }
  const raw: unknown[] = Array.isArray(req.body?.ids) ? req.body.ids : [req.body?.ids];
  const ids = [...new Set(raw.map(num).filter((v) => v > 0))].slice(0, 200);
  let applied = 0;
  let skipped = 0;
  for (const id of ids) {
    if ((await applyUserOp(op, id, req.session.user_id ?? 0, !!req.session.is_superadmin, clientIp(req))) === null) {
      applied++;
    } else {
      skipped++;
    }
  }
  res.json({ success: true, applied, skipped, message: `${applied} updated, ${skipped} skipped.` });
});

adminRouter.post('/users/:id/:op', requireAdmin, async (req, res) => {
  const id = num(req.params.id);
  const op = str(req.params.op);
  const actorId = req.session.user_id ?? 0;

  if (op === 'force-logout') {
    if (id < 1 || (await users().countDocuments({ _id: id }, { limit: 1 })) === 0 || (await isHiddenFrom(id, !!req.session.is_superadmin))) {
      res.json({ success: false, error: 'db', message: USER_OP_ERRORS.db });
      return;
    }
    if (id === actorId) {
      res.json({ success: false, error: 'self', message: USER_OP_ERRORS.self });
      return;
    }
    await signOutEverywhere(id, clientIp(req));
    res.json({ success: true, message: 'User signed out.' });
    return;
  }
  if (!['delete', 'activate', 'deactivate'].includes(op)) {
    res.status(404).json({ success: false, message: 'Unknown action.' });
    return;
  }
  const error = await applyUserOp(op as UserOp, id, actorId, !!req.session.is_superadmin, clientIp(req));
  res.json(error ? { success: false, error, message: USER_OP_ERRORS[error] } : { success: true, message: op === 'delete' ? 'User deleted.' : 'User updated.' });
});

// ---- Own account --------------------------------------------------------------

adminRouter.get('/account', async (req, res) => {
  const user = await users().findOne({ _id: req.session.user_id ?? 0 });
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found.' });
    return;
  }
  res.json({
    success: true,
    user: { username: user.username, firstname: user.firstname, middlename: user.middlename ?? '', lastname: user.lastname, position: user.position ?? '', department: req.session.department ?? '', department_id: user.department_id },
  });
});

adminRouter.put('/account', async (req, res) => {
  const userId = req.session.user_id ?? 0;
  const profile = profileInput(req.body);
  if (!profile.ok) {
    res.json({ success: false, message: profile.message });
    return;
  }
  const { username } = profile.value;
  if (await usernameTaken(username, userId)) {
    res.json({ success: false, message: 'That username is already taken. Please choose another.' });
    return;
  }
  try {
    const result = await users().updateOne(
      { _id: userId },
      { $set: { ...profile.value, username_lower: username.toLowerCase() } },
    );
    if (result.matchedCount !== 1) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }
  } catch (error) {
    console.error('account update failed', error);
    res.json({ success: false, message: 'Database error. Please try again later.' });
    return;
  }
  req.session.username = username;
  res.json({ success: true, message: 'Profile saved.' });
});

/** Change own password. The default-password flow may omit the old password. */
adminRouter.post('/update-password', throttle('password-update', config.throttle.passwordUpdate, userKey), async (req, res) => {
  const userId = req.session.user_id ?? 0;
  const newPassword = str(req.body?.new_password);
  const oldPassword = str(req.body?.old_password);
  const defaultPw = req.session.default_pw === true;

  if (newPassword === '') {
    res.json({ success: false, message: 'Missing new password' });
    return;
  }
  const problem = passwordProblem(newPassword);
  if (problem) {
    res.json({ success: false, message: problem });
    return;
  }
  const user = await users().findOne({ _id: userId }, { projection: { password: 1 } });
  if (!user?.password) {
    res.json({ success: false, message: 'User not found' });
    return;
  }
  if (oldPassword === '') {
    if (!defaultPw) {
      res.json({ success: false, message: 'Missing parameters' });
      return;
    }
  } else if (!(await bcrypt.compare(oldPassword, user.password))) {
    res.json({ success: false, message: 'Old password is incorrect' });
    return;
  }
  if (await bcrypt.compare(newPassword, user.password)) {
    res.json({ success: false, message: 'New password must be different from your current password' });
    return;
  }
  await users().updateOne({ _id: userId }, { $set: { password: await hash(newPassword) } });
  await revokeOtherSessions(req.session, userId);
  void recheckSessions(userId);
  req.session.default_pw = false;
  res.json({ success: true });
});

// ---- Departments ----------------------------------------------------------------

adminRouter.get('/department-management', requireAdmin, async (req, res) => {
  const search = trimmed(req.query.q);
  const filter: Filter<DepartmentDoc> = search === '' ? {} : { $or: [{ name: contains(search) }, { prefix: contains(search) }] };
  const all = sortDepartments(await departments().find(filter).toArray());
  const paging = paginate(all.length, num(req.query.page) || 1, PAGE_SIZE);
  res.json({
    success: true,
    departments: all.slice(paging.offset, paging.offset + PAGE_SIZE).map((d) => ({ id: d._id, name: d.name, prefix: d.prefix, server: d.server ?? '', status: d.status ?? 'active' })),
    paging,
  });
});

type DepartmentInput = Pick<DepartmentDoc, 'name' | 'prefix' | 'server' | 'status'>;

/** Validated department fields, or the reason they were rejected. The name must be unique, ignoring case. */
async function departmentInput(body: Record<string, unknown> | undefined, exceptId?: number): Promise<{ ok: true; value: DepartmentInput } | { ok: false; error: string; message: string }> {
  const name = textField(body?.name, 'Name', LIMITS.departmentName, true);
  const prefix = textField(body?.prefix, 'Prefix', LIMITS.departmentPrefix, true);
  const server = textField(body?.server, 'Server / physician name', LIMITS.serverName);
  if (!name.ok || !prefix.ok || !server.ok) {
    const firstProblem = [name, prefix, server].find((r) => !r.ok) as { message: string };
    return { ok: false, error: 'invalid', message: firstProblem.message };
  }
  const clash: Filter<DepartmentDoc> = { name: new RegExp(`^\\s*${escapeRegex(name.value)}\\s*$`, 'i') };
  if (exceptId) {
    clash._id = { $ne: exceptId };
  }
  if ((await departments().countDocuments(clash, { limit: 1 })) > 0) {
    return { ok: false, error: 'duplicate', message: 'A department with that name already exists.' };
  }
  return {
    ok: true,
    value: {
      name: name.value,
      prefix: prefix.value.toUpperCase(),
      server: body?.server === undefined ? null : server.value,
      status: str(body?.status).toLowerCase() === 'inactive' ? 'inactive' : 'active',
    },
  };
}

adminRouter.post('/department-management', requireAdmin, async (req, res) => {
  const input = await departmentInput(req.body);
  if (!input.ok) {
    res.json({ success: false, error: input.error, message: input.message });
    return;
  }
  await departments().insertOne({ _id: await nextId('departments'), ...input.value });
  invalidate(LIVE_CONFIG_KEY);
  res.json({ success: true, message: 'Department added.' });
});

adminRouter.put('/department-management/:id', requireAdmin, async (req, res) => {
  const id = num(req.params.id);
  if (id <= 0) {
    res.json({ success: false, error: 'db', message: 'Department not found.' });
    return;
  }
  const input = await departmentInput(req.body, id);
  if (!input.ok) {
    res.json({ success: false, error: input.error, message: input.message });
    return;
  }
  const result = await departments().updateOne({ _id: id }, { $set: input.value });
  invalidate(LIVE_CONFIG_KEY);
  bumpQueueGeneration();
  res.json(result.matchedCount === 1 ? { success: true, message: 'Department updated.' } : { success: false, error: 'db', message: 'Department not found.' });
});
