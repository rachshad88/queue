import type { Request } from 'express';
import { config } from './config';

export const num = (value: unknown): number => {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
};
export const str = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));
export const trimmed = (value: unknown): string => str(value).trim();
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Case-insensitive "contains" filter for user-typed search text. */
export const contains = (value: string): RegExp => new RegExp(escapeRegex(value), 'i');

/** Client IP. X-Forwarded-For is only honored when TRUST_PROXY_HEADER is on. */
export function clientIp(req: Request): string {
  const ip = (req.ip ?? req.socket?.remoteAddress ?? '').trim();
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export const fullName = (user: { firstname?: string | null; lastname?: string | null } | null | undefined): string =>
  `${(user?.firstname ?? '').trim()} ${(user?.lastname ?? '').trim()}`.trim();

export const isInactive = (status: string | null | undefined): boolean => (status ?? '').trim().toLowerCase() === 'inactive';

/** Department display order: the configured sequence first, then by name. */
export function sortDepartments<T extends { _id: number; name: string }>(list: T[]): T[] {
  const rank = (id: number): number => {
    const i = config.departmentOrder.indexOf(id);
    return i === -1 ? 100 : i + 1;
  };
  return [...list].sort((a, b) => rank(a._id) - rank(b._id) || a.name.localeCompare(b.name));
}

export interface Paging {
  page: number;
  total_pages: number;
  total_records: number;
  shown_from: number;
  shown_to: number;
  offset: number;
}

export function paginate(total: number, requestedPage: number, pageSize: number): Paging {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const offset = (page - 1) * pageSize;
  return {
    page,
    total_pages: totalPages,
    total_records: total,
    shown_from: total === 0 ? 0 : offset + 1,
    shown_to: Math.min(offset + pageSize, total),
    offset,
  };
}
