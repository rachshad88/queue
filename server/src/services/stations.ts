import type { SessionData } from 'express-session';
import { config } from '../config';
import { sections, users, type SectionDoc, type SectionKind } from '../db';
import { minutesAgo } from '../time';
import { fullName } from '../util';
import { recordSectionEvent } from './sectionLog';

export const SECTION_KINDS: SectionKind[] = ['admission', 'waiting'];
export const sectionKey = (kind: SectionKind, sectionId: number): string => `${kind}:${sectionId}`;
export const deptForKind = (kind: SectionKind): number => (kind === 'waiting' ? config.waitingDeptId : config.admissionDeptId);
export const isSectionKind = (value: unknown): value is SectionKind => value === 'admission' || value === 'waiting';

/** Which set of windows a department works through, if any. */
export function sectionKindForDept(deptId: number, deptName: string | null = ''): SectionKind | null {
  const name = (deptName ?? '').trim().toUpperCase();
  if (deptId === config.admissionDeptId || name.includes('ADMISSION')) {
    return 'admission';
  }
  if (deptId === config.waitingDeptId || name.includes('WAITING')) {
    return 'waiting';
  }
  return null;
}

/**
 * Window lanes. These windows call emergency, then priority, then regular
 * patients; every other window calls regular tickets only, so a long line of
 * priority patients never stalls the regular line.
 */
const PRIORITY_WINDOWS: Record<SectionKind, readonly number[]> = { waiting: [1, 2], admission: [3, 4] };
export const windowServesPriority = (kind: SectionKind, sectionId: number): boolean => PRIORITY_WINDOWS[kind].includes(sectionId);
export const priorityWindowNames = (kind: SectionKind): string =>
  PRIORITY_WINDOWS[kind].map((n) => `${kind === 'waiting' ? 'Waiting Area' : 'Admission'} ${n}`).join(' or ');
/** Queue filter for what a window may call: everything at a priority window, regular tickets elsewhere. */
export const windowCategoryFilter = (kind: SectionKind, sectionId: number): { category?: 'regular' } =>
  windowServesPriority(kind, sectionId) ? {} : { category: 'regular' };

export const isSectionedDept = (deptId: number): boolean => deptId === config.admissionDeptId || deptId === config.waitingDeptId;

/** Heartbeat: refresh updated_at on every window this staffer occupies. */
export async function markSectionActivity(userId: number): Promise<void> {
  if (userId < 1) {
    return;
  }
  await sections().updateMany({ occupied_by: userId, status: 1 }, { $set: { updated_at: new Date() } });
}

/**
 * The operator's effective window on a sectioned department, or null.
 * Superadmins never occupy a window (session-scoped takeover), so their
 * chosen window wins over any occupancy lookup.
 */
export async function operatorSection(session: Partial<SessionData>, userId: number, deptId: number): Promise<SectionDoc | null> {
  if (userId < 1) {
    return null;
  }
  if (session.is_superadmin && session.takeover_section_id && session.department_id === deptId && isSectionKind(session.takeover_section_kind)) {
    return sections().findOne({ _id: sectionKey(session.takeover_section_kind, session.takeover_section_id) });
  }
  const kind = sectionKindForDept(deptId, session.department ?? '');
  if (kind === null) {
    return null;
  }
  return sections().findOne({ kind, occupied_by: userId, status: 1 });
}

/**
 * Record the window an operator is serving through. Walls attribute a number
 * to a window only through occupied_by, so a serve must stamp it. Only claims
 * a free window or refreshes the operator's own; another staffer's window is
 * never taken. Only the free -> held transition is logged.
 */
export async function markSectionOccupied(sectionId: number, userId: number, kind: SectionKind, ip: string): Promise<void> {
  if (sectionId < 1 || userId < 1) {
    return;
  }
  const before = await sections().findOneAndUpdate(
    { _id: sectionKey(kind, sectionId), $or: [{ occupied_by: null }, { occupied_by: userId }] },
    { $set: { occupied_by: userId, status: 1, updated_at: new Date() } },
    { returnDocument: 'before' },
  );
  if (before && !before.occupied_by) {
    await recordSectionEvent({ kind, sectionId, sectionName: before.section_name, action: 'claimed', userId, operatorId: userId, oldStatus: 0, newStatus: 1, reason: 'serve', ip });
  }
  if (before) {
    await releaseOtherSections(userId, sectionKey(kind, sectionId), ip);
  }
}

/**
 * One operator, one window. A superadmin serving through a takeover window
 * would otherwise keep the window they held before, and walls would show
 * their patient at both.
 */
async function releaseOtherSections(userId: number, keepId: string, ip: string): Promise<void> {
  const others = await sections().find({ occupied_by: userId, _id: { $ne: keepId } }).toArray();
  for (const row of others) {
    const result = await sections().updateOne({ _id: row._id, occupied_by: userId }, { $set: { occupied_by: null, status: 0, updated_at: new Date() } });
    if (result.modifiedCount === 1) {
      await recordSectionEvent({ kind: row.kind, sectionId: row.section_id, sectionName: row.section_name, action: 'released', userId, operatorId: userId, oldStatus: row.status, newStatus: 0, reason: 'moved_window', ip });
    }
  }
}

/** Release windows abandoned more than `minutes` ago. */
export async function releaseStaleSections(minutes: number, action: string, operatorId: number | null, ip: string): Promise<number> {
  const cutoff = minutesAgo(Math.abs(minutes));
  const stale = await sections().find({ status: 1, occupied_by: { $ne: null }, updated_at: { $lt: cutoff } }).toArray();
  let released = 0;
  for (const row of stale) {
    // Guarded on the holder and the stale stamp so a window that was just
    // re-claimed or refreshed is left alone.
    const result = await sections().updateOne(
      { _id: row._id, occupied_by: row.occupied_by, status: 1, updated_at: { $lt: cutoff } },
      { $set: { occupied_by: null, status: 0, updated_at: new Date() } },
    );
    if (result.modifiedCount !== 1) {
      continue;
    }
    released++;
    await recordSectionEvent({ kind: row.kind, sectionId: row.section_id, sectionName: row.section_name, action, userId: row.occupied_by, operatorId, oldStatus: 1, newStatus: 0, reason: `stale_idle_${minutes}m`, ip });
  }
  return released;
}

/** Release every window this operator occupies (logout). */
export async function releaseSectionsForUser(userId: number, ip: string): Promise<void> {
  const held = await sections().find({ occupied_by: userId }).toArray();
  for (const row of held) {
    const result = await sections().updateOne({ _id: row._id, occupied_by: userId }, { $set: { occupied_by: null, status: 0, updated_at: new Date() } });
    if (result.modifiedCount === 1) {
      await recordSectionEvent({ kind: row.kind, sectionId: row.section_id, sectionName: row.section_name, action: 'user_logout', userId, operatorId: userId, oldStatus: row.status, newStatus: 0, reason: 'logout', ip });
    }
  }
}

export interface SectionRosterRow {
  id: number;
  section_name: string;
  occupied_by: number | null;
  status: number;
  updated_at: Date | null;
  staff: string | null;
  username: string | null;
  /** Calls emergency and priority patients too; otherwise regular tickets only. */
  serves_priority: boolean;
}

/** Windows of one kind with the occupant's display name. */
export async function sectionRoster(kind: SectionKind): Promise<SectionRosterRow[]> {
  const rows = await sections().find({ kind }).sort({ section_id: 1 }).toArray();
  const ids = rows.map((r) => r.occupied_by).filter((id): id is number => typeof id === 'number');
  const staff = ids.length ? await users().find({ _id: { $in: ids } }, { projection: { firstname: 1, lastname: 1, username: 1 } }).toArray() : [];
  const byId = new Map(staff.map((u) => [u._id, u]));
  return rows.map((r) => {
    const occupant = r.occupied_by ? byId.get(r.occupied_by) : undefined;
    return {
      id: r.section_id,
      section_name: r.section_name,
      occupied_by: r.occupied_by,
      status: r.status,
      updated_at: r.updated_at,
      staff: occupant ? fullName(occupant) || occupant.username : null,
      username: occupant?.username ?? null,
      serves_priority: windowServesPriority(kind, r.section_id),
    };
  });
}
