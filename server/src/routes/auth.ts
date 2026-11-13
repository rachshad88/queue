import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router, type Request } from 'express';
import { cache } from '../cache';
import { config } from '../config';
import { departments, users } from '../db';
import { csrfToken, isRevoked, throttle } from '../middleware/auth';
import { queueUpdated, recheckSessions } from '../realtime';
import { assertSingleLogin, clearLoginToken, idleMinutesFor, isExempt, registerLoginToken, updateUserActivity } from '../services/singleLogin';
import { releaseSectionsForUser, releaseStaleSections } from '../services/stations';
import { clientIp, isInactive, str, trimmed } from '../util';
import { LIMITS } from '../validation';

export const authRouter = Router();

const regenerate = (req: Request): Promise<void> =>
  new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
const destroy = (req: Request): Promise<void> => new Promise((resolve) => req.session.destroy(() => resolve()));

function sessionPayload(req: Request) {
  const s = req.session;
  const loggedIn = (s.user_id ?? 0) > 0;
  return {
    csrf: csrfToken(req),
    logged_in: loggedIn,
    user: loggedIn
      ? {
          user_id: s.user_id,
          username: s.username ?? '',
          usertype: s.usertype ?? '',
          is_superadmin: !!s.is_superadmin,
          department_id: s.department_id ?? 0,
          department: s.department ?? '',
          view_mode: s.view_mode ?? null,
        }
      : null,
    config: {
      admission_dept_id: config.admissionDeptId,
      waiting_dept_id: config.waitingDeptId,
      pool_clinic_ids: config.poolClinicIds,
    },
  };
}

/** Bootstrap for the client: CSRF token, who is signed in, and the queue's fixed ids. */
authRouter.get('/session', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  await isRevoked(req);
  res.json(sessionPayload(req));
});

authRouter.post('/login', throttle('login', config.throttle.login, (req) => `${clientIp(req)}|${trimmed(req.body?.username).toLowerCase()}`), async (req, res) => {
  const username = trimmed(req.body?.username);
  const password = str(req.body?.password);
  const attemptKey = `${clientIp(req)}|${username.toLowerCase()}`;
  const lockKey = `login:lock:${attemptKey}`;
  const attemptsKey = `login:attempts:${attemptKey}`;

  if (cache.has(lockKey)) {
    res.status(429).json({ success: false, message: `Too many login attempts. Please try again in ${config.login.lockMinutes} minutes.` });
    return;
  }

  // Deliberately generic: a distinct "deactivated" message would let an
  // attacker enumerate valid usernames and department states.
  const fail = (userExists: boolean) => {
    const attempts = cache.increment(attemptsKey, config.login.lockMinutes * 60);
    if (attempts >= config.login.maxAttempts) {
      cache.put(lockKey, Date.now(), config.login.lockMinutes * 60);
    }
    console.warn('auth.failed', JSON.stringify({ ip: clientIp(req), username, user_exists: userExists }));
    res.status(401).json({ success: false, message: 'Invalid username or password.' });
  };

  const user = username === '' ? null : await users().findOne({ username_lower: username.toLowerCase() });
  if (!user) {
    return fail(false);
  }
  const dept = user.department_id != null ? await departments().findOne({ _id: user.department_id }) : null;
  // Over-long passwords are refused before bcrypt, which would compare only their first 72 bytes.
  const tooLong = Buffer.byteLength(password, 'utf8') > LIMITS.passwordMaxBytes;
  if (isInactive(user.status) || isInactive(dept?.status) || tooLong || !(await bcrypt.compare(password, user.password))) {
    return fail(true);
  }

  cache.forget(attemptsKey);
  cache.forget(lockKey);

  const isSuperadmin = user.usertype.trim().toLowerCase() === 'superadmin';
  // Fresh session id on every login so a pre-login id can never be fixated
  // into a privileged session.
  await regenerate(req);
  Object.assign(req.session, {
    user_id: user._id,
    usertype: isSuperadmin ? 'admin' : user.usertype,
    is_superadmin: isSuperadmin,
    department_id: user.department_id ?? 0,
    department: dept?.name ?? '',
    username: user.username,
    client_ip: clientIp(req),
    default_pw: password === config.defaultPassword,
    logged_in_at: Date.now(),
  });

  if (!isExempt(user.usertype)) {
    const token = randomBytes(32).toString('hex');
    req.session.login_token = token;
    await registerLoginToken(user._id, token);
    // Any other screen on this account is signed out right away, over its socket.
    void recheckSessions(user._id);
  }
  await updateUserActivity(user._id, true);

  // Any login sweeps windows left held by staff who walked away. Tagged
  // login_sweep so the trail tells it apart from other releases.
  await releaseStaleSections(config.staleSectionMin, 'login_sweep', null, clientIp(req));

  const deptName = (dept?.name ?? '').toLowerCase();
  let destination = '/';
  if (!isSuperadmin && deptName.includes('admission')) {
    destination = '/choose-section/admission';
  } else if (!isSuperadmin && deptName.includes('waiting')) {
    destination = '/choose-section/waiting';
  }

  res.json({ success: true, destination, ...sessionPayload(req) });
});

authRouter.post('/logout', async (req, res) => {
  const userId = req.session.user_id ?? 0;
  if (userId > 0) {
    await releaseSectionsForUser(userId, clientIp(req));
    const exempt = !!req.session.is_superadmin || isExempt(req.session.usertype);
    if (!exempt && req.session.login_token) {
      await clearLoginToken(userId, req.session.login_token);
    }
    // Live refresh so walls free the windows immediately.
    queueUpdated(config.admissionDeptId);
    queueUpdated(config.waitingDeptId);
  }
  await destroy(req);
  res.clearCookie('rhu_queue_session');
  res.json({ success: true });
});

/**
 * Background poll. Performs its own token check and answers with JSON; with
 * activity=0 it never stamps the heartbeat, so a poll cannot revive an idle
 * account, and reports idle expiry for non-exempt accounts.
 */
authRouter.get('/session-check', async (req, res) => {
  const userId = req.session.user_id ?? 0;
  if (userId < 1) {
    res.json({ ok: true, logged_in: false, reason: '' });
    return;
  }
  if (await isRevoked(req)) {
    res.json({ ok: false, logged_in: false, reason: 'revoked' });
    return;
  }
  const usertype = req.session.usertype ?? '';
  const activityValue = str(req.query.activity ?? '1');
  const activity = activityValue !== '0' && activityValue !== 'false';

  if (!(await assertSingleLogin(req.session, userId, usertype, clientIp(req), activity))) {
    res.json({ ok: false, logged_in: false, reason: 'another_device' });
    return;
  }
  if (!activity && !isExempt(usertype)) {
    const idle = await idleMinutesFor(userId);
    if (idle !== null && idle > config.idleExpiryMin) {
      res.json({ ok: false, logged_in: false, reason: 'inactive' });
      return;
    }
  }
  res.json({ ok: true, logged_in: true, reason: '' });
});
