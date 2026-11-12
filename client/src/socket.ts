import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { BASE } from './base';

let socket: Socket | null = null;

function connection(): Socket {
  socket ??= io({ path: `${BASE}/socket.io`, transports: ['websocket'] });
  return socket;
}

/**
 * Subscribe to live events for a set of departments. Handlers are read from a
 * ref, so they can close over fresh state without resubscribing.
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
