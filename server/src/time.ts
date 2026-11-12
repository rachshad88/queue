/**
 * Timestamps are stored as real instants (UTC Dates). "Today" is the Manila
 * calendar day, so every day boundary is computed here rather than per query.
 */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export const now = (): Date => new Date();

/** The instant the current Manila calendar day began. */
export function manilaDayStart(at: Date = new Date()): Date {
  const shifted = new Date(at.getTime() + MANILA_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - MANILA_OFFSET_MS);
}

/** Manila calendar date as YYYY-MM-DD. */
export function manilaDayString(at: Date = new Date()): string {
  return new Date(at.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Start of a YYYY-MM-DD Manila date, or null when the string is not a date. */
export function manilaDateStart(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return null;
  }
  const t = Date.parse(`${day}T00:00:00.000Z`);
  return Number.isNaN(t) ? null : new Date(t - MANILA_OFFSET_MS);
}

export function addDays(day: string, days: number): string {
  const t = Date.parse(`${day}T00:00:00.000Z`) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export const minutesAgo = (minutes: number, at: Date = new Date()): Date => new Date(at.getTime() - minutes * 60000);

/** Whether a ticket's issue timestamp falls on today's Manila date. */
export function isIssuedToday(issuedAt: Date | null | undefined): boolean {
  return !!issuedAt && issuedAt.getTime() >= manilaDayStart().getTime();
}
