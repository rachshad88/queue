import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { cache } from '../cache';
import { config } from '../config';
import type { Session, SessionData } from 'express-session';
import { assertSingleLogin, sessionStillAuthorized } from '../services/singleLogin';
import { clientIp } from '../util';

/**
 * Signed-in + single-device gate. Answers 401 JSON with a `reason`; the
 * client routes 'another_device' through logout so the window is freed first.
 */
/** Strip the signed-in identity from a session whose account was revoked, keeping its CSRF token. */
export function dropIdentity(session: Session & Partial<SessionData>): void {
  const csrf = session.csrf;
  for (const key of Object.keys(session) as (keyof SessionData)[]) {
    if (key !== 'cookie') {
      delete session[key];
    }
  }
  session.csrf = csrf;
}

/** True when the session belongs to an account that was revoked; the identity is dropped as a side effect. */
export async function isRevoked(req: Request): Promise<boolean> {
  if ((req.session.user_id ?? 0) < 1 || (await sessionStillAuthorized(req.session))) {
    return false;
  }
  dropIdentity(req.session);
  return true;
}

export const requireLogin: RequestHandler = async (req, res, next) => {
  const userId = req.session.user_id ?? 0;
  if (userId < 1) {
    res.status(401).json({ success: false, message: 'Not logged in', reason: 'login' });
    return;
  }
  if (await isRevoked(req)) {
    res.status(401).json({ success: false, message: 'Your account was signed out by an administrator.', reason: 'revoked' });
    return;
  }
  if (!(await assertSingleLogin(req.session, userId, req.session.usertype, clientIp(req), true))) {
    res.status(401).json({ success: false, message: 'Logged in on another device', reason: 'another_device' });
    return;
  }
  next();
};

/** Staff console endpoints a kiosk-mode login may not use. */
export const CONSOLE_PATHS = ['/console', '/queue', '/serve-next', '/finish', '/queue-action', '/repeat-call', '/transfer', '/prioritize', '/pool-waiting', '/serve-pool', '/sections/:kind/assign'];

/** A login switched to kiosk mode ("for customer") only hands out tickets until it signs out. */
export const refuseKioskMode: RequestHandler = (req, res, next) => {
  if (req.session.view_mode === 'for_customer') {
    res.status(403).json({ success: false, message: 'This login is in kiosk mode and can only issue tickets. Sign out and sign in again to use the queue console.' });
    return;
  }
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.session.usertype !== 'admin') {
    res.status(403).json({ success: false, message: 'Access denied.' });
    return;
  }
  next();
};

export const requireSuperadmin: RequestHandler = (req, res, next) => {
  if (!req.session.is_superadmin) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return;
  }
  next();
};

/** The session's CSRF token, minted on first use. */
export function csrfToken(req: Request): string {
  if (!req.session.csrf) {
    req.session.csrf = randomBytes(32).toString('hex');
  }
  return req.session.csrf;
}

/** State-changing requests must echo the session token in X-CSRF-Token. */
export const verifyCsrf: RequestHandler = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  const expected = Buffer.from(req.session.csrf ?? '');
  const given = Buffer.from(String(req.get('x-csrf-token') ?? ''));
  if (expected.length === 0 || expected.length !== given.length || !timingSafeEqual(expected, given)) {
    res.status(403).json({ success: false, message: 'Invalid or expired security token. Please refresh and try again.' });
    return;
  }
  next();
};

/** Fixed-window throttle keyed by caller. */
export function throttle(name: string, limit: { max: number; seconds: number }, keyFor: (req: Request) => string = clientIp): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.throttle.enabled) {
      next();
      return;
    }
    const key = `throttle:${name}:${keyFor(req)}`;
    if (cache.increment(key, limit.seconds) > limit.max) {
      res.set('Retry-After', String(Math.max(1, cache.ttl(key))));
      res.status(429).json({ success: false, message: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    next();
  };
}

export const userKey = (req: Request): string => {
  const user = req.session.user_id ?? 0;
  return `${user > 0 ? `user:${user}` : 'guest'}|${clientIp(req)}`;
};
