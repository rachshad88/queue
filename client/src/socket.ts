import { useEffect, useRef, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import { BASE } from './base';

let socket: Socket | null = null;

function connection(): Socket {
  socket ??= io({ path: `${BASE}/socket.io`, transports: ['websocket'] });
  return socket;
}

/** Offline only after the first connection attempt fails, so pages do not flash a banner on load. */
let online = true;
const watchers = new Set<() => void>();
function setOnline(next: boolean): void {
  if (online !== next) {
    online = next;
    watchers.forEach((notify) => notify());
  }
}
function watchConnection(notify: () => void): () => void {
  const s = connection();
  if (watchers.size === 0) {
    s.on('connect', () => setOnline(true));
    s.on('disconnect', () => setOnline(false));
    s.on('connect_error', () => setOnline(false));
    window.addEventListener('offline', () => setOnline(false));
  }
  watchers.add(notify);
  return () => watchers.delete(notify);
}

/** Whether this screen can reach the queue server right now (live socket state). */
export function useServerOnline(): boolean {
  return useSyncExternalStore(watchConnection, () => online);
}

/** Listen for one server event on this screen's socket (for example, its own account's events). */
export function useSocketEvent(event: string, handler: (payload: any) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const s = connection();
    const listener = (payload: unknown): void => latest.current(payload);
    s.on(event, listener);
    return () => {
      s.off(event, listener);
    };
  }, [event]);
}

/** Reopen the socket so its handshake carries the current sign-in (after login or logout). */
export function reconnectSocket(): void {
  if (socket) {
    socket.disconnect().connect();
  }
}

/** Real input happened on this screen: the server stamps the account as active (it throttles). */
export function sendActivity(): void {
  connection().emit('activity');
}

/**
 * Subscribe to live events for a set of departments. Handlers are read from a
 * ref, so they can close over fresh state without resubscribing. A `connect`
 * handler runs on every (re)connect, so pages can catch up on missed events.
 */
export function useDepartmentEvents(depts: number[], page: 'live' | 'controller', handlers: Record<string, (payload: any) => void>): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  const key = [...depts].sort((a, b) => a - b).join(',');

  useEffect(() => {
    const s = connection();
    const ids = key === '' ? [] : key.split(',').map(Number);
    const subscribe = (): void => {
      s.emit('subscribe', { depts: ids, page });
    };
    subscribe();
    s.on('connect', subscribe);
    const listeners = Object.keys(latest.current).map((event) => {
      const listener = (payload: unknown): void => latest.current[event]?.(payload);
      s.on(event, listener);
      return [event, listener] as const;
    });
    return () => {
      s.off('connect', subscribe);
      for (const [event, listener] of listeners) {
        s.off(event, listener);
      }
    };
  }, [key, page]);
}
