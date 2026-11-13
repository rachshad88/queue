import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { RequestHandler } from 'express';
import type { SessionData } from 'express-session';
import { Server, type Socket } from 'socket.io';
import { config } from './config';
import { loadSession, touchSession } from './session';
import { assertSingleLogin, sessionEndReason } from './services/singleLogin';
import { bumpQueueGeneration } from './sharedCache';

let io: Server | null = null;
let sweep: NodeJS.Timeout | null = null;

/** How often the server re-checks signed-in screens (idle expiry) and keeps their sessions alive. */
const SESSION_SWEEP_MS = 60 * 1000;
/** A screen shows a handful of departments; anything beyond this is ignored (there are 13). */
const MAX_SUBSCRIBED_DEPTS = 20;
/** At most one activity stamp per screen in this window, however much the operator types. */
const ACTIVITY_STAMP_MS = 20 * 1000;

type SessionRequest = IncomingMessage & { session?: Partial<SessionData>; sessionID?: string };

/** Every emit, kept in memory under test so assertions can read the stream. */
export const emitted: { event: string; payload: Record<string, unknown> }[] = [];

/**
 * Socket.IO lives in the API process. Clients subscribe to the department ids
 * they display; every emit is routed only to those rooms. The handshake runs
 * the HTTP session middleware, so a signed-in screen also joins its own
 * `user:<id>` room and is told over the socket when its session ends: no
 * client polling.
 */
export function attachRealtime(server: HttpServer, sessionMiddleware?: RequestHandler): Server {
  io = new Server(server, {
    transports: ['websocket'],
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000, skipMiddlewares: true },
    // Open by default: LAN kiosk and display browsers connect from various hostnames.
    cors: { origin: config.allowedOrigins.length ? config.allowedOrigins : '*' },
  });

  if (sessionMiddleware) {
    io.engine.use(sessionMiddleware);
  }

  io.on('connection', (socket) => {
    const req = socket.request as SessionRequest;
    const userId = req.session?.user_id ?? 0;
    if (userId > 0 && req.sessionID) {
      socket.data.userId = userId;
      socket.data.sid = req.sessionID;
      socket.data.lastStamp = 0;
      void socket.join([`user:${userId}`, 'signed-in']);
    }
    socket.on('activity', () => void stampActivity(socket));
    socket.data.depts = [] as number[];
    socket.on('subscribe', (message: { depts?: unknown[]; page?: string } = {}) => {
      const next = new Set<number>();
      // Untrusted input: only small positive whole numbers, and only a few of them,
      // so one message cannot make the server join thousands of rooms.
      for (const d of Array.isArray(message.depts) ? message.depts.slice(0, MAX_SUBSCRIBED_DEPTS * 4) : []) {
        const n = Number(d);
        if (Number.isInteger(n) && n > 0 && n < 100000) {
          next.add(n);
        }
        if (next.size >= MAX_SUBSCRIBED_DEPTS) {
          break;
        }
      }
      for (const old of socket.data.depts as number[]) {
        if (!next.has(old)) {
          socket.leave(`dept:${old}`);
        }
      }
      for (const n of next) {
        socket.join(`dept:${n}`);
      }
      socket.data.depts = [...next];
      socket.data.page = message.page === 'live' || message.page === 'controller' ? message.page : 'unknown';
      socket.emit('subscribed', { depts: socket.data.depts });
    });
  });

  sweep = setInterval(() => void recheckSessions(), SESSION_SWEEP_MS);
  sweep.unref();
  return io;
}

/** Shut the socket layer down (tests). */
export function stopRealtime(): void {
  if (sweep) {
    clearInterval(sweep);
    sweep = null;
  }
  io?.close();
  io = null;
}

/** Real input on a signed-in screen: refresh its heartbeat and session expiry. */
async function stampActivity(socket: Socket): Promise<void> {
  const sid = socket.data.sid as string | undefined;
  const userId = (socket.data.userId as number | undefined) ?? 0;
  if (!sid || userId < 1 || Date.now() - (socket.data.lastStamp as number) < ACTIVITY_STAMP_MS) {
    return;
  }
  socket.data.lastStamp = Date.now();
  const sess = await loadSession(sid);
  if (!sess || (await sessionEndReason(sess)) !== null) {
    return;
  }
  const raw = socket.handshake.address ?? '';
  await assertSingleLogin(sess, userId, sess.usertype, raw.startsWith('::ffff:') ? raw.slice(7) : raw, true);
  await touchSession(sid, sess);
}

/**
 * Re-check signed-in screens (one account's, or all of them) and tell any
 * whose session has ended why, so they sign out at once. Screens still valid
 * get their session expiry pushed forward, as the old background poll did.
 */
export async function recheckSessions(userId?: number): Promise<void> {
  if (!io) {
    return;
  }
  try {
    const sockets = await io.in(userId ? `user:${userId}` : 'signed-in').fetchSockets();
    for (const socket of sockets) {
      const sid = socket.data.sid as string | undefined;
      if (!sid) {
        continue;
      }
      const sess = await loadSession(sid);
      const reason = sess ? await sessionEndReason(sess) : 'login';
      if (reason) {
        socket.emit('session-ended', { reason });
        socket.leave(`user:${socket.data.userId}`);
        socket.leave('signed-in');
        socket.data.sid = undefined;
      } else if (sess) {
        await touchSession(sid, sess);
      }
    }
  } catch (error) {
    console.error('realtime session check failed', error);
  }
}

/** Send an event to every screen signed in as this user. */
export function emitToUser(userId: number, event: string, payload: Record<string, unknown>): void {
  try {
    io?.to(`user:${userId}`).emit(event, payload);
  } catch (error) {
    console.error('realtime emit failed', error);
  }
}

/** Fail-open: the socket layer being down must never block a queue action. */
export function emit(event: string, payload: Record<string, unknown>): void {
  bumpQueueGeneration();
  if (config.isTest) {
    emitted.push({ event, payload });
  }
  try {
    if (!io) {
      return;
    }
    const dept = payload.dept ?? payload.department_id;
    const n = Number(dept);
    if (dept === undefined || dept === null || dept === '' || !Number.isFinite(n)) {
      io.emit(event, payload);
    } else {
      io.to(`dept:${n}`).emit(event, payload);
    }
  } catch (error) {
    console.error('realtime emit failed', error);
  }
}

export const queueUpdated = (dept: number): void => emit('queue-updated', { dept });

/** Serve emit carrying the number + window label so walls announce immediately. */
export function serveUpdate(dept: number, userId: number, sectionId?: number | null, queueNumber?: string | null, label?: string | null): void {
  const payload: Record<string, unknown> = { dept, user_id: userId };
  if (sectionId != null) {
    payload.section_id = sectionId;
  }
  if (queueNumber) {
    payload.queue_number = queueNumber;
  }
  if (label) {
    payload.section = label;
  }
  emit('queue-updated', payload);
}

export async function connectedClients(): Promise<number> {
  return io ? (await io.fetchSockets()).length : 0;
}
