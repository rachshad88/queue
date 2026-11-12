import { sectionLog, type SectionKind } from '../db';

export interface SectionEvent {
  kind: SectionKind;
  sectionId: number;
  sectionName: string;
  /** claimed, override, released, force_released, auto_released_stale, user_logout, login_sweep */
  action: string;
  /** The window holder the event affects. */
  userId?: number | null;
  /** The actor; null renders as "System". */
  operatorId?: number | null;
  oldStatus?: number | null;
  newStatus?: number | null;
  reason?: string | null;
  ip?: string;
}

/**
 * Append one window event. Call only after the guarded update it describes
 * has succeeded. Fail-open, like the queue audit trail.
 */
export async function recordSectionEvent(event: SectionEvent): Promise<boolean> {
  try {
    await sectionLog().insertOne({
      kind: event.kind,
      section_id: event.sectionId,
      section_name: event.sectionName,
      action: event.action,
      user_id: event.userId ?? null,
      operator_id: event.operatorId ?? null,
      old_status: event.oldStatus ?? null,
      new_status: event.newStatus ?? null,
      reason: event.reason ?? null,
      client_ip: event.ip || null,
      created_at: new Date(),
    });
    return true;
  } catch (error) {
    console.error('section_log insert failed', error);
    return false;
  }
}
