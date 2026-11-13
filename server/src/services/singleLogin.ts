import { randomBytes } from 'node:crypto';
import type { SessionData } from 'express-session';
import { config } from '../config';
import { users } from '../db';

/** Admins and superadmins keep multi-device access. */
export const isExempt = (usertype: string | null | undefined): boolean => {
  const normalized = (usertype ?? '').trim().toLowerCase();
  return normalized === 'admin' || normalized === 'superadmin';
};

export async function registerLoginToken(userId: number, token: string): Promise<void> {
  const at = new Date();
  await users().updateOne({ _id: userId }, { $set: { login_token: token, last_active: at, last_login_at: at } });
}

/**
 * True when this session is the account's active device. With `stamp` the
 * last_active/last_ip heartbeat is refreshed; without it the token is only
 * validated, so a background poll never revives an idle account.
 */
export async function assertSingleLogin(session: Partial<SessionData>, userId: number, usertype: string | null | undefined, ip: string, stamp = true): Promise<boolean> {
  if (isExempt(usertype)) {
    return true;
  }
  const token = session.login_token;
  if (!token) {
    return false;
  }
  if (stamp) {
    const result = await users().updateOne({ _id: userId, login_token: token }, { $set: { last_active: new Date(), last_ip: ip || null } });
    return result.matchedCount === 1;
  }
  return (await users().countDocuments({ _id: userId, login_token: token }, { limit: 1 })) === 1;
}

export async function updateUserActivity(userId: number, atLogin = false): Promise<void> {
  const at = new Date();
  await users().updateOne({ _id: userId }, { $set: atLogin ? { last_active: at, last_login_at: at } : { last_active: at } });
}

/** Stamp the serving device. */
export async function stampActivity(userId: number, ip: string): Promise<void> {
  await users().updateOne({ _id: userId }, { $set: ip ? { last_active: new Date(), last_ip: ip } : { last_active: new Date() } });
}

export async function clearLoginToken(userId: number, token: string): Promise<void> {
  await users().updateOne({ _id: userId, login_token: token }, { $set: { login_token: null, last_active: null } });
}

/**
 * The session's role is captured at sign-in, so every privileged request
 * re-reads the account: it must still exist, be active, hold the same role,
 * and not have had its sessions revoked since this session signed in.
 * This applies to admins too, who are otherwise exempt from the device lock.
 */
export async function sessionStillAuthorized(session: Partial<SessionData>): Promise<boolean> {
  const userId = session.user_id ?? 0;
  if (userId < 1) {
    return false;
  }
  const user = await users().findOne({ _id: userId }, { projection: { usertype: 1, status: 1, sessions_revoked_at: 1 } });
  if (!user || user.status !== 'active') {
    return false;
  }
  const isSuperadmin = user.usertype.trim().toLowerCase() === 'superadmin';
  if (isSuperadmin !== !!session.is_superadmin || (isSuperadmin ? 'admin' : user.usertype) !== session.usertype) {
    return false;
  }
  const revokedAt = user.sessions_revoked_at?.getTime() ?? 0;
  return revokedAt <= (session.logged_in_at ?? 0);
}

/** Sign the account out everywhere: every existing session is refused from now on and the device lock is dropped. */
export async function revokeSessions(userId: number): Promise<void> {
  await users().updateOne({ _id: userId }, { $set: { login_token: null, last_active: null, sessions_revoked_at: new Date() } });
}

/**
 * After a password change: sign the account out on every other device while
 * this session stays signed in (fresh sign-in time, and a new device token
 * for accounts under the single-device lock).
 */
export async function revokeOtherSessions(session: Partial<SessionData>, userId: number): Promise<void> {
  await revokeSessions(userId);
  session.logged_in_at = Date.now();
  if (session.login_token) {
    const token = randomBytes(32).toString('hex');
    session.login_token = token;
    await registerLoginToken(userId, token);
  }
}

/** Admin force-logout. */
export const forceLogout = revokeSessions;

/** Minutes since the operator's last real input, or null when none is recorded. */
export async function idleMinutesFor(userId: number): Promise<number | null> {
  const user = await users().findOne({ _id: userId }, { projection: { last_active: 1 } });
  if (!user?.last_active) {
    return null;
  }
  return Math.floor((Date.now() - user.last_active.getTime()) / 60000);
}

export type SessionEndReason = 'login' | 'revoked' | 'another_device' | 'inactive';

/**
 * Why a session can no longer be used, or null while it is fine. Checked
 * without stamping activity, so the check itself never revives an idle account.
 */
export async function sessionEndReason(session: Partial<SessionData>): Promise<SessionEndReason | null> {
  const userId = session.user_id ?? 0;
  if (userId < 1) {
    return 'login';
  }
  if (!(await sessionStillAuthorized(session))) {
    return 'revoked';
  }
  if (!(await assertSingleLogin(session, userId, session.usertype, '', false))) {
    return 'another_device';
  }
  if (!isExempt(session.usertype)) {
    const idle = await idleMinutesFor(userId);
    if (idle !== null && idle > config.idleExpiryMin) {
      return 'inactive';
    }
  }
  return null;
}
