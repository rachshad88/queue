import { queueLog } from '../db';

/** Append one row to the queue audit trail. Fail-open: audit must never block patient flow. */
export async function logQueueAction(
  ip: string,
  queueId: number,
  queueNumber: string,
  departmentId: number,
  userId: number,
  action: string,
  oldDepartmentId: number | null,
  oldStatus: string | null,
  newStatus: string | null,
  approvedBy: number | null = null,
): Promise<boolean> {
  try {
    await queueLog().insertOne({
      queue_id: queueId,
      queue_number: queueNumber,
      department_id: departmentId,
      user_id: userId || null,
      action,
      old_department_id: oldDepartmentId,
      old_status: oldStatus,
      new_status: newStatus,
      client_ip: ip || null,
      created_at: new Date(),
      ...(approvedBy ? { approved_by: approvedBy } : {}),
    });
    return true;
  } catch (error) {
    console.error('queue_log insert failed', error);
    return false;
  }
}

/** Queue ids re-queued through the LABORATORY Returning Patient button. */
export async function returningIds(queueIds: number[]): Promise<Set<number>> {
  if (queueIds.length === 0) {
    return new Set();
  }
  const ids = await queueLog().distinct('queue_id', { action: 'prioritized_in', queue_id: { $in: queueIds } });
  return new Set(ids);
}

/** Rows that record a ticket leaving its department; their old_department_id is where it went. */
const OUTBOUND_ACTIONS = new Set(['transferred_out', 'prioritized_out', 'pool_taken']);
/** Rows that record a ticket arriving; their old_department_id is where it came from. */
const INBOUND_ACTIONS = new Set(['transferred_in', 'prioritized_in']);

/** Which department a move went from and to, or null for a row that is not a move. */
export function routeOf(log: { action: string; department_id: number; old_department_id: number | null }): { from: number; to: number } | null {
  if (log.old_department_id == null) {
    return null;
  }
  if (OUTBOUND_ACTIONS.has(log.action)) {
    return { from: log.department_id, to: log.old_department_id };
  }
  if (INBOUND_ACTIONS.has(log.action)) {
    return { from: log.old_department_id, to: log.department_id };
  }
  return null;
}

/** The arrival half of a move pair; its matching *_out row is left out of a journey. */
export const isDepartureHalf = (action: string): boolean => action === 'transferred_out' || action === 'prioritized_out';

/** Arrival rows: one per move into a department. */
export const MOVE_ARRIVAL_ACTIONS = ['transferred_in', 'prioritized_in', 'pool_taken'];

/**
 * Every department a ticket has been in, in order (ids), from its log rows
 * sorted oldest first. It starts where the first move left from, or where the
 * ticket is now if it never moved.
 */
export function ticketRoute(currentDept: number, logs: { action: string; department_id: number; old_department_id: number | null }[]): number[] {
  const moves = logs.map(routeOf).filter((r): r is { from: number; to: number } => r !== null);
  const route = [moves[0]?.from ?? currentDept];
  for (const move of moves) {
    if (route[route.length - 1] !== move.to) {
      route.push(move.to);
    }
  }
  return route;
}
