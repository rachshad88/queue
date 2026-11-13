import session, { Store, type SessionData } from 'express-session';
import { config } from './config';
import { sessions, type SectionKind } from './db';

declare module 'express-session' {
  interface SessionData {
    csrf?: string;
    user_id?: number;
    usertype?: string;
    is_superadmin?: boolean;
    department_id?: number;
    department?: string;
    username?: string;
    client_ip?: string;
    default_pw?: boolean;
    default_pw_shown?: boolean;
    login_token?: string;
    /** Epoch ms of sign-in, compared against the account's sessions_revoked_at. */
    logged_in_at?: number;
    view_mode?: string;
    for_customer_section?: number;
    served_by?: string;
    takeover_section_id?: number;
    takeover_section_name?: string;
    takeover_section_kind?: SectionKind;
  }
}

/** Sessions live in MongoDB, expired by a TTL index on `expires`. */
class MongoSessionStore extends Store {
  private expiry(sess: SessionData): Date {
    const cookieExpiry = sess.cookie?.expires ? new Date(sess.cookie.expires) : null;
    return cookieExpiry ?? new Date(Date.now() + config.sessionLifetimeMin * 60000);
  }

  get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    sessions()
      .findOne({ _id: sid })
      .then((doc) => {
        if (!doc || doc.expires.getTime() <= Date.now()) {
          return callback(null, null);
        }
        callback(null, JSON.parse(doc.data) as SessionData);
      })
      .catch((err) => callback(err));
  }

  set(sid: string, sess: SessionData, callback?: (err?: unknown) => void): void {
    sessions()
      .updateOne({ _id: sid }, { $set: { data: JSON.stringify(sess), expires: this.expiry(sess) } }, { upsert: true })
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }

  touch(sid: string, sess: SessionData, callback?: () => void): void {
    sessions()
      .updateOne({ _id: sid }, { $set: { expires: this.expiry(sess) } })
      .then(() => callback?.())
      .catch(() => callback?.());
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    sessions()
      .deleteOne({ _id: sid })
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }
}

/** One store and one middleware, shared by HTTP and the realtime socket handshake. */
export const sessionStore = new MongoSessionStore();
let shared: ReturnType<typeof session> | null = null;

/** Read a session straight from the store (null when missing or expired). */
export function loadSession(sid: string): Promise<SessionData | null> {
  return new Promise((resolve) => {
    sessionStore.get(sid, (err, sess) => resolve(err ? null : (sess ?? null)));
  });
}

/** Push a session's expiry forward, as any HTTP request would. */
export function touchSession(sid: string, sess: SessionData): Promise<void> {
  return new Promise((resolve) => {
    sessionStore.touch(sid, sess, () => resolve());
  });
}

export function sessionMiddleware() {
  return (shared ??= session({
    name: 'rhu_queue_session',
    secret: config.sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureCookies,
      maxAge: config.sessionLifetimeMin * 60000,
    },
  }));
}
