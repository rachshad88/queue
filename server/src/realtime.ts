import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from './config';
import { bumpQueueGeneration } from './sharedCache';

let io: Server | null = null;

/** Every emit, kept in memory under test so assertions can read the stream. */
export const emitted: { event: string; payload: Record<string, unknown> }[] = [];

/**
 * Socket.IO lives in the API process. Clients subscribe to the department ids
 * they display; every emit is routed only to those rooms.
 */
export function attachRealtime(server: HttpServer): Server {
  io = new Server(server, {
    transports: ['websocket'],
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000, skipMiddlewares: true },
    // Open by default: LAN kiosk and display browsers connect from various hostnames.
    cors: { origin: config.allowedOrigins.length ? config.allowedOrigins : '*' },
  });

  io.on('connection', (socket) => {
    socket.data.depts = [] as number[];
    socket.on('subscribe', (message: { depts?: unknown[]; page?: string } = {}) => {
      const next = new Set<number>();
      for (const d of Array.isArray(message.depts) ? message.depts : []) {
        const n = Number(d);
        if (Number.isFinite(n)) {
          next.add(n);
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

  return io;
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
